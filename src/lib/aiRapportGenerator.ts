import { supabase } from './supabaseClient'
import { generateAlleSecties } from './templates'
import type { Dossier, HistorischRapport, CoherentieResultaat } from '@/types'
import type { ObjectType } from '@/types'
import type { MarketSegment } from '@/types/kennisbank'
import { calculateSimilarity } from './similarity'
import { getKennisbankContextForSectie } from './kennisbankRetriever'
import { getSectieFeedback } from '@/hooks/useSectieFeedback'
import { getFeedbackSamenvatting, getSchrijfProfiel } from './feedbackEnrichment'

// ---------------------------------------------------------------------------
// Section configuration: maps sectieKey → relevant dossier stappen + titel
// ---------------------------------------------------------------------------

interface SectieConfig {
  titel: string
  stappen: Array<keyof Pick<Dossier, 'stap1' | 'stap2' | 'stap3' | 'stap4' | 'stap5' | 'stap6' | 'stap7' | 'stap8' | 'stap9' | 'stap10'>>
}

const SECTIE_CONFIG: Record<string, SectieConfig> = {
  'samenvatting':                    { titel: 'Samenvatting',                         stappen: ['stap1', 'stap2', 'stap3', 'stap8'] },
  'a1-opdrachtgever':                { titel: 'A.1 Opdrachtgever',                    stappen: ['stap1'] },
  'a2-taxateur':                     { titel: 'A.2 Taxateur',                         stappen: ['stap1'] },
  'b1-algemeen':                     { titel: 'B.1 Algemeen',                         stappen: ['stap1', 'stap2'] },
  'b2-doel-taxatie':                 { titel: 'B.2 Doel Taxatie',                     stappen: ['stap1', 'stap8'] },
  'b3-waardering-basis':             { titel: 'B.3 Grondslag Waardering',             stappen: ['stap1', 'stap8'] },
  'b4-inspectie':                    { titel: 'B.4 Inspectie',                        stappen: ['stap1', 'stap6'] },
  'b5-uitgangspunten':               { titel: 'B.5 Uitgangspunten',                   stappen: ['stap1', 'stap9'] },
  'b6-toelichting-waardering':       { titel: 'B.6 Toelichting Waardering',           stappen: ['stap8', 'stap9'] },
  'b7-eerdere-taxaties':             { titel: 'B.7 Eerdere Taxaties',                 stappen: ['stap1'] },
  'b8-inzage-documenten':            { titel: 'B.8 Inzage Documenten',                stappen: ['stap1'] },
  'b9-taxatiemethodiek':             { titel: 'B.9 Taxatiemethodiek',                 stappen: ['stap1', 'stap8'] },
  'b10-plausibiliteit':              { titel: 'B.10 Plausibiliteit',                  stappen: ['stap8'] },
  'c1-swot':                         { titel: 'C.1 SWOT-analyse',                     stappen: ['stap2', 'stap3', 'stap6', 'stap7'] },
  'c2-beoordeling':                  { titel: 'C.2 Beoordeling',                      stappen: ['stap2', 'stap3', 'stap6', 'stap8'] },
  'd1-privaatrechtelijk':            { titel: 'D.1 Privaatrechtelijke Aspecten',      stappen: ['stap5'] },
  'd2-publiekrechtelijk':            { titel: 'D.2 Publiekrechtelijke Aspecten',      stappen: ['stap5'] },
  'e1-locatie-overzicht':            { titel: 'E.1 Locatie Overzicht',               stappen: ['stap2'] },
  'e2-locatie-informatie':           { titel: 'E.2 Locatie Informatie',              stappen: ['stap2'] },
  'f1-object-informatie':            { titel: 'F.1 Objectinformatie',                stappen: ['stap1', 'stap2', 'stap3', 'stap6'] },
  'f2-oppervlakte':                  { titel: 'F.2 Oppervlakten',                    stappen: ['stap3'] },
  'f3-renovatie':                    { titel: 'F.3 Renovatie',                       stappen: ['stap3', 'stap6'] },
  'f4-milieuaspecten':               { titel: 'F.4 Milieuaspecten',                  stappen: ['stap6', 'stap7'] },
  'g1-gebruik-object':               { titel: 'G.1 Gebruik Object',                  stappen: ['stap1', 'stap4'] },
  'g2-alternatieve-aanwendbaarheid': { titel: 'G.2 Alternatieve Aanwendbaarheid',    stappen: ['stap1', 'stap4'] },
  'h1-marktvisie':                   { titel: 'H.1 Marktvisie',                      stappen: ['stap2', 'stap8'] },
  'h2-huurreferenties':              { titel: 'H.2 Huurreferenties',                 stappen: ['stap4', 'stap8'] },
  'h3-koopreferenties':              { titel: 'H.3 Koopreferenties',                 stappen: ['stap8'] },
  'h4-correcties':                   { titel: 'H.4 Correcties',                      stappen: ['stap8'] },
  'i-duurzaamheid':                  { titel: 'I. Duurzaamheid',                     stappen: ['stap7', 'stap10'] },
  'j-algemene-uitgangspunten':       { titel: 'J. Algemene Uitgangspunten',          stappen: ['stap9'] },
  'k-waardebegrippen':               { titel: 'K. Waardebegrippen en Definities',    stappen: ['stap8'] },
  'l-bijlagen':                      { titel: 'L. Bijlagen',                         stappen: ['stap1'] },
  'ondertekening':                   { titel: 'Ondertekening',                       stappen: ['stap1'] },
}

// ---------------------------------------------------------------------------
// Model selection & batching constants
// ---------------------------------------------------------------------------

/** Sections that require the more capable gpt-4o model due to their complexity. */
export const COMPLEX_SECTIES = ['b6-toelichting-waardering', 'b9-taxatiemethodiek', 'b10-plausibiliteit']

/** Template text shorter than this threshold qualifies a section for batch processing. */
const SHORT_TEMPLATE_THRESHOLD = 200

/** Maximum number of sections to group in a single batch API call. */
const MAX_BATCH_SIZE = 5

/** Maximum number of entries in the in-memory section cache. */
const MAX_CACHE_SIZE = 500

// ---------------------------------------------------------------------------
// In-memory response cache
// ---------------------------------------------------------------------------

const sectieCache = new Map<string, GenerateSectieResult>()

/** Simple djb2-based string hash — synchronous and dependency-free. */
function hashString(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33 + str.charCodeAt(i)) | 0 // Keep within 32-bit signed integer range
  }
  return Math.abs(hash).toString(36)
}

function getCacheKey(sectieKey: string, dossierData: Record<string, unknown>): string {
  return `${sectieKey}:${hashString(JSON.stringify(dossierData))}`
}

function getSectieFromCache(sectieKey: string, dossierData: Record<string, unknown>): GenerateSectieResult | undefined {
  return sectieCache.get(getCacheKey(sectieKey, dossierData))
}

function setSectieInCache(sectieKey: string, dossierData: Record<string, unknown>, result: GenerateSectieResult): void {
  if (sectieCache.size >= MAX_CACHE_SIZE) {
    const firstKey = sectieCache.keys().next().value
    if (firstKey !== undefined) sectieCache.delete(firstKey)
  }
  // Store without isCached flag — the flag is added when the value is returned from cache
  const { isCached: _isCached, ...toStore } = result
  sectieCache.set(getCacheKey(sectieKey, dossierData), toStore)
}

/** Clears the entire in-memory section cache. Useful for testing or forced refresh. */
export function clearSectieCache(): void {
  sectieCache.clear()
}

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface EerdereSectieGeneratieFeedback {
  feedbackType: string
  reden?: string
  toelichting?: string
  origineleTekst?: string
  bewerkteTekst?: string
}

export interface GenerateSectieOptions {
  sectieKey: string
  sectieTitel: string
  dossier: Partial<Dossier>
  referenties?: HistorischRapport[]
  templateTekst?: string
  objectType?: ObjectType
  marketSegment?: MarketSegment
  eerdereFeedback?: EerdereSectieGeneratieFeedback[]
  previousSectionsSummary?: string
  dossierId?: string
}

export interface GenerateSectieResult {
  tekst: string
  isAIGenerated: boolean
  hasKennisbankContext?: boolean
  isCached?: boolean
  error?: string
}

interface BatchSectieInput {
  sectieKey: string
  sectieTitel: string
  dossierData: Record<string, unknown>
  templateTekst: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Picks only the dossier stappen that are relevant for the given section,
 * reducing the payload size sent to the Edge Function.
 */
function buildDossierData(
  dossier: Partial<Dossier>,
  stappen: SectieConfig['stappen']
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const stap of stappen) {
    if (dossier[stap]) {
      result[stap] = dossier[stap]
    }
  }
  return result
}

/**
 * Returns the top-3 most similar historical reports based on the dossier's
 * existing similarity results, or by falling back to a simple type match.
 */
function getTop3Referenties(
  dossier: Partial<Dossier>,
  historischeRapporten: HistorischRapport[]
): Array<{ rapport: HistorischRapport; score: number }> {
  if (historischeRapporten.length === 0) return []

  // Prefer explicitly selected references
  const geselecteerdeIds = dossier.geselecteerdeReferenties ?? []

  if (geselecteerdeIds.length > 0) {
    const geselecteerd = geselecteerdeIds
      .map((id) => historischeRapporten.find((r) => r.id === id))
      .filter((r): r is HistorischRapport => r !== undefined)
      .slice(0, 3)

    if (geselecteerd.length > 0) {
      return geselecteerd.map((rapport) => {
        const simResult = (dossier.similarityResults ?? []).find(
          (s) => s.rapportId === rapport.id
        )
        return { rapport, score: simResult?.totaalScore ?? 0 }
      })
    }
  }

  // Fallback: use pre-calculated similarity results
  if ((dossier.similarityResults ?? []).length > 0) {
    return (dossier.similarityResults ?? [])
      .slice()
      .sort((a, b) => b.totaalScore - a.totaalScore)
      .slice(0, 3)
      .map((sim) => {
        const rapport = historischeRapporten.find((r) => r.id === sim.rapportId)
        return rapport ? { rapport, score: sim.totaalScore } : null
      })
      .filter((r): r is { rapport: HistorischRapport; score: number } => r !== null)
  }

  // Last resort: calculate similarity on-the-fly if we have enough data
  const kanBerekenen = dossier.stap2?.coordinaten && dossier.stap3?.bvo && dossier.stap1
  if (kanBerekenen) {
    return historischeRapporten
      .map((rapport) => {
        const result = calculateSimilarity(dossier as Dossier, rapport)
        return result ? { rapport, score: result.totaalScore } : null
      })
      .filter((r): r is { rapport: HistorischRapport; score: number } => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
  }

  // Type/gebruiksdoel match as final fallback
  const typeObject = dossier.stap1?.typeObject
  return historischeRapporten
    .map((rapport) => {
      let score = 0
      if (typeObject && rapport.typeObject === typeObject) score += 50
      return { rapport, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

/**
 * Gets the section text for a given sectieKey from a historical rapport.
 * Checks both `rapportTeksten` and `wizardData.rapportSecties`.
 */
function getSectieTekstUitRapport(rapport: HistorischRapport, sectieKey: string): string {
  // Check rapportTeksten map
  if (rapport.rapportTeksten?.[sectieKey]) {
    return rapport.rapportTeksten[sectieKey]
  }
  // Check wizardData.rapportSecties
  const secties = rapport.wizardData?.rapportSecties
  if (secties?.[sectieKey]) {
    return secties[sectieKey].inhoud || secties[sectieKey].fluxKlaarTekst || ''
  }
  return ''
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Queries the sectie_feedback table for the 3 most recent negative/edited
 * entries for the given sectieKey, and also fetches the feedback summary and
 * user writing profile. All three layers are included in the AI generation prompt.
 */
export async function getSectieFeedbackVoorGeneratie(
  sectieKey: string
): Promise<{ eerdereFeedback: EerdereSectieGeneratieFeedback[]; feedbackSamenvatting: string | null; schrijfprofiel: string | null }> {
  const [records, feedbackSamenvatting, schrijfprofiel] = await Promise.all([
    getSectieFeedback(sectieKey, 3),
    getFeedbackSamenvatting(sectieKey, 'sectie'),
    getSchrijfProfiel(),
  ])
  const eerdereFeedback = records.map((r) => ({
    feedbackType: r.feedbackType,
    reden: r.reden,
    toelichting: r.toelichting,
    origineleTekst: r.origineleTekst ? r.origineleTekst.slice(0, 300) : undefined,
    bewerkteTekst: r.bewerkteTekst ? r.bewerkteTekst.slice(0, 300) : undefined,
  }))
  return { eerdereFeedback, feedbackSamenvatting, schrijfprofiel }
}

/**
 * Generates a single rapport section using AI.
 * Checks the in-memory cache first; falls back to the template text if AI fails.
 */
export async function generateSectieMetAI(
  options: GenerateSectieOptions
): Promise<GenerateSectieResult> {
  const { sectieKey, sectieTitel, dossier, referenties = [], templateTekst, objectType, marketSegment } = options

  const config = SECTIE_CONFIG[sectieKey]
  const stappen = config?.stappen ?? []

  const dossierData = buildDossierData(dossier, stappen)

  // Check in-memory cache before any expensive operations
  const cached = getSectieFromCache(sectieKey, dossierData)
  if (cached) {
    return { ...cached, isCached: true }
  }

  const referentiesPayload = referenties
    .map((rapport) => {
      const adres = `${rapport.adres.straat} ${rapport.adres.huisnummer}, ${rapport.adres.plaats}`
      const sectieTekst = getSectieTekstUitRapport(rapport, sectieKey)
      const simResult = (dossier.similarityResults ?? []).find((s) => s.rapportId === rapport.id)
      const similarityScore = simResult?.totaalScore ?? 0
      return sectieTekst ? { adres, similarityScore, sectieTekst } : null
    })
    .filter((r): r is { adres: string; similarityScore: number; sectieTekst: string } => r !== null)

  // Build schrijfstijl from writing profiles of reference reports
  const schrijfstijl = referenties.length > 0
    ? {
        toneOfVoice: referenties[0].writingProfile?.toneOfVoice,
        detailLevel: referenties[0].writingProfile?.detailLevel,
      }
    : undefined

  // Haal Kennisbank-context op voor deze sectie
  const kennisbankCtx = await getKennisbankContextForSectie(sectieKey, objectType, marketSegment)

  const heeftKennisbankContext =
    kennisbankCtx.templateChunks.length > 0 ||
    kennisbankCtx.styleExamples.length > 0 ||
    kennisbankCtx.writingProfile !== null

  // Bouw de kennisbankContext payload voor de Edge Function
  const kennisbankContext = heeftKennisbankContext
    ? {
        templateChunks: kennisbankCtx.templateChunks.map((c) => ({
          text: c.cleanText || c.rawText,
          chapter: c.chapter,
          chunkType: c.chunkType,
        })),
        styleExamples: kennisbankCtx.styleExamples.map((c) => ({
          text: c.cleanText || c.rawText,
          tones: c.tones,
        })),
        writingGuidance: kennisbankCtx.writingProfile
          ? {
              toneOfVoice: kennisbankCtx.writingProfile.toneOfVoice,
              detailLevel: kennisbankCtx.writingProfile.detailLevel,
              standardizationLevel: kennisbankCtx.writingProfile.standardizationLevel,
            }
          : null,
      }
    : undefined

  // Haal eerdere feedback op voor deze sectie (alle 3 lagen worden meegestuurd naar Edge Function)
  const feedbackContext = options.eerdereFeedback
    ? { eerdereFeedback: options.eerdereFeedback, feedbackSamenvatting: null, schrijfprofiel: null }
    : await getSectieFeedbackVoorGeneratie(sectieKey)
  const { eerdereFeedback, feedbackSamenvatting, schrijfprofiel } = feedbackContext

  // Select model based on section complexity
  const model = COMPLEX_SECTIES.includes(sectieKey) ? 'gpt-4o' : 'gpt-4o-mini'

  try {
    const { data, error } = await supabase.functions.invoke('openai-generate-section', {
      body: {
        sectieKey,
        sectieTitel,
        dossierData,
        referenties: referentiesPayload,
        templateTekst,
        schrijfstijl,
        kennisbankContext,
        eerdereFeedback: eerdereFeedback.length > 0 ? eerdereFeedback : undefined,
        feedbackSamenvatting: feedbackSamenvatting ?? undefined,
        schrijfprofiel: schrijfprofiel ?? undefined,
        previousSectionsSummary: options.previousSectionsSummary || undefined,
        model,
        dossierId: options.dossierId,
      },
    })

    if (error || !data?.tekst) {
      throw new Error(error?.message ?? 'No text returned from edge function')
    }

    const successResult: GenerateSectieResult = { tekst: data.tekst, isAIGenerated: true, hasKennisbankContext: heeftKennisbankContext }
    setSectieInCache(sectieKey, dossierData, successResult)
    return successResult
  } catch (err) {
    console.warn(`[aiRapportGenerator] AI generation failed for "${sectieKey}", using template fallback:`, err)
    return {
      tekst: templateTekst ?? '',
      isAIGenerated: false,
      hasKennisbankContext: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Generates multiple short sections in a single API call to reduce overhead.
 * Falls back to template text per section if the batch call fails or returns no result.
 */
async function generateBatchMetAI(
  inputs: BatchSectieInput[],
  referenties: HistorischRapport[],
  dossier: Partial<Dossier>,
  objectType?: ObjectType,
  marketSegment?: MarketSegment
): Promise<Record<string, GenerateSectieResult>> {
  if (inputs.length === 0) return {}

  // Single-item batches are handled more efficiently as regular calls
  if (inputs.length === 1) {
    const input = inputs[0]
    const result = await generateSectieMetAI({
      sectieKey: input.sectieKey,
      sectieTitel: input.sectieTitel,
      dossier,
      referenties,
      templateTekst: input.templateTekst,
      objectType,
      marketSegment,
      dossierId: dossier.id,
    })
    return { [input.sectieKey]: result }
  }

  try {
    const { data, error } = await supabase.functions.invoke('openai-generate-section', {
      body: {
        batchSecties: inputs.map(({ sectieKey, sectieTitel, dossierData, templateTekst }) => ({
          sectieKey,
          sectieTitel,
          dossierData,
          templateTekst,
        })),
        model: 'gpt-4o-mini', // Batched sections are always non-complex
        dossierId: dossier.id,
      },
    })

    if (error || !data?.results || typeof data.results !== 'object') {
      throw new Error(error?.message ?? 'No results returned from batch edge function')
    }

    const results: Record<string, GenerateSectieResult> = {}
    for (const input of inputs) {
      const tekst = (data.results as Record<string, unknown>)[input.sectieKey]
      if (typeof tekst === 'string' && tekst.trim()) {
        results[input.sectieKey] = { tekst, isAIGenerated: true, hasKennisbankContext: false }
      } else {
        results[input.sectieKey] = { tekst: input.templateTekst, isAIGenerated: false, hasKennisbankContext: false }
      }
    }
    return results
  } catch (err) {
    console.warn('[aiRapportGenerator] Batch generation failed, falling back to template for batch sections:', err)
    return Object.fromEntries(
      inputs.map((input) => [input.sectieKey, { tekst: input.templateTekst, isAIGenerated: false, hasKennisbankContext: false }])
    )
  }
}

/** Builds the result entry for a section, optionally marking it as served from cache. */
function buildResultEntry(
  sectieResult: Pick<GenerateSectieResult, 'tekst' | 'isAIGenerated' | 'hasKennisbankContext'>,
  isCached = false
): { tekst: string; isAIGenerated: boolean; hasKennisbankContext?: boolean; isCached?: boolean } {
  return {
    tekst: sectieResult.tekst,
    isAIGenerated: sectieResult.isAIGenerated,
    hasKennisbankContext: sectieResult.hasKennisbankContext,
    ...(isCached ? { isCached: true } : {}),
  }
}

/**
 * Generates all rapport sections using AI, with fallback to templates.
 * Short non-complex sections are batched in Phase 1 to reduce API overhead.
 * Complex/long sections are processed sequentially in Phase 2 to maintain
 * coherence via previousSectionsSummary context passing.
 * Calls the provided onProgress callback after each section completes.
 */
export async function generateAlleSectiesMetAI(
  dossier: Dossier,
  historischeRapporten: HistorischRapport[],
  onProgress?: (sectieKey: string, progress: number, total: number) => void,
  objectType?: ObjectType,
  marketSegment?: MarketSegment
): Promise<Record<string, { tekst: string; isAIGenerated: boolean; hasKennisbankContext?: boolean; isCached?: boolean }>> {
  // Get template fallbacks for all sections at once
  const templateSecties = generateAlleSecties(dossier, historischeRapporten)

  const sectieKeys = Object.keys(templateSecties)
  const total = sectieKeys.length
  const result: Record<string, { tekst: string; isAIGenerated: boolean; hasKennisbankContext?: boolean; isCached?: boolean }> = {}

  // Find top-3 reference reports once for all sections
  const top3 = getTop3Referenties(dossier, historischeRapporten)
  const referentieRapporten = top3.map((r) => r.rapport)

  let progressIndex = 0
  let previousSectionsSummary = ''
  const MAX_SUMMARY_CHARS = 3000

  // -------------------------------------------------------------------------
  // Phase 1: Batch short, non-complex uncached sections
  // -------------------------------------------------------------------------
  const batchCandidates: BatchSectieInput[] = []
  const processedInPhase1 = new Set<string>()

  for (const sectieKey of sectieKeys) {
    const templateTekst = templateSecties[sectieKey] ?? ''
    const isComplex = COMPLEX_SECTIES.includes(sectieKey)
    if (isComplex || templateTekst.length >= SHORT_TEMPLATE_THRESHOLD) continue

    const config = SECTIE_CONFIG[sectieKey]
    const stappen = config?.stappen ?? []
    const dossierData = buildDossierData(dossier, stappen)

    const cached = getSectieFromCache(sectieKey, dossierData)
    if (cached) {
      result[sectieKey] = buildResultEntry(cached, true)
      processedInPhase1.add(sectieKey)
      progressIndex++
      onProgress?.(sectieKey, progressIndex, total)
    } else {
      batchCandidates.push({ sectieKey, sectieTitel: config?.titel ?? sectieKey, dossierData, templateTekst })
    }
  }

  for (let i = 0; i < batchCandidates.length; i += MAX_BATCH_SIZE) {
    const batch = batchCandidates.slice(i, i + MAX_BATCH_SIZE)
    const batchResults = await generateBatchMetAI(batch, referentieRapporten, dossier, objectType, marketSegment)

    for (const input of batch) {
      const sectieKey = input.sectieKey
      const batchResult = batchResults[sectieKey]
      result[sectieKey] = buildResultEntry(batchResult)
      if (batchResult.isAIGenerated) {
        setSectieInCache(sectieKey, input.dossierData, batchResult)
      }
      processedInPhase1.add(sectieKey)
      progressIndex++
      onProgress?.(sectieKey, progressIndex, total)
    }
  }

  // -------------------------------------------------------------------------
  // Phase 2: Process remaining (complex/long) sections sequentially
  // -------------------------------------------------------------------------
  for (const sectieKey of sectieKeys) {
    if (processedInPhase1.has(sectieKey)) continue

    const config = SECTIE_CONFIG[sectieKey]
    const sectieTitel = config?.titel ?? sectieKey
    const templateTekst = templateSecties[sectieKey] ?? ''
    const stappen = config?.stappen ?? []
    const dossierData = buildDossierData(dossier, stappen)

    const cached = getSectieFromCache(sectieKey, dossierData)
    if (cached) {
      result[sectieKey] = buildResultEntry(cached, true)
      progressIndex++
      onProgress?.(sectieKey, progressIndex, total)
      continue
    }

    const sectieResult = await generateSectieMetAI({
      sectieKey,
      sectieTitel,
      dossier,
      referenties: referentieRapporten,
      templateTekst,
      objectType,
      marketSegment,
      previousSectionsSummary: previousSectionsSummary || undefined,
      dossierId: dossier.id,
    })

    result[sectieKey] = buildResultEntry(sectieResult)

    if (sectieResult.isAIGenerated) {
      setSectieInCache(sectieKey, dossierData, sectieResult)
    }

    // Accumulate summary for subsequent sections
    if (sectieResult.isAIGenerated && sectieResult.tekst) {
      const excerpt = sectieResult.tekst.slice(0, 200)
      const entry = `\n[${sectieKey}] ${sectieTitel}: ${excerpt}${sectieResult.tekst.length > 200 ? '...' : ''}`
      previousSectionsSummary += entry
      // Keep within token budget by removing complete oldest entries
      if (previousSectionsSummary.length > MAX_SUMMARY_CHARS) {
        const overflow = previousSectionsSummary.length - MAX_SUMMARY_CHARS
        // Find the next section boundary after the overflow point to avoid cutting mid-entry
        const nextBoundary = previousSectionsSummary.indexOf('\n[', overflow)
        previousSectionsSummary = nextBoundary !== -1
          ? previousSectionsSummary.slice(nextBoundary)
          : previousSectionsSummary.slice(overflow)
      }
    }

    progressIndex++
    onProgress?.(sectieKey, progressIndex, total)
  }

  return result
}

/**
 * Performs an AI coherence check across all rapport sections.
 * Returns a CoherentieResultaat with any detected inconsistencies.
 * Falls back to a "coherent" result on error to avoid blocking the user.
 */
export async function checkRapportCoherentie(
  rapportSecties: Record<string, { titel: string; inhoud: string }>
): Promise<CoherentieResultaat> {
  try {
    // Build a summary of all sections (key + title + first 300 chars of content)
    const allSectionsSummary = Object.entries(rapportSecties)
      .filter(([, v]) => v.inhoud && v.inhoud.trim())
      .map(([key, v]) => {
        const excerpt = v.inhoud.slice(0, 300)
        return `[${key}] ${v.titel}: ${excerpt}${v.inhoud.length > 300 ? '...' : ''}`
      })
      .join('\n\n')

    if (!allSectionsSummary.trim()) {
      return { isCoherent: true, inconsistenties: [], checkedAt: new Date().toISOString() }
    }

    const { data, error } = await supabase.functions.invoke('openai-generate-section', {
      body: {
        sectieKey: '__coherence_check',
        sectieTitel: 'Coherentie check',
        dossierData: { allSectionsSummary },
      },
    })

    if (error) {
      console.warn('[checkRapportCoherentie] Edge function error:', error)
      return { isCoherent: true, inconsistenties: [], checkedAt: new Date().toISOString() }
    }

    const result = data as { isCoherent?: boolean; inconsistenties?: Array<{ sectieKeys: string[]; beschrijving: string; ernst: 'hoog' | 'gemiddeld' | 'laag' }> }

    return {
      isCoherent: result.isCoherent ?? true,
      inconsistenties: result.inconsistenties ?? [],
      checkedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.warn('[checkRapportCoherentie] failed silently:', err)
    return { isCoherent: true, inconsistenties: [], checkedAt: new Date().toISOString() }
  }
}
