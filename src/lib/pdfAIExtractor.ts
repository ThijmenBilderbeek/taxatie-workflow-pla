/**
 * AI-based fallback extractor for PDF taxatierapport fields.
 *
 * This module calls the `openai-pdf-extract` Supabase Edge Function when the
 * regex-based parser leaves fields empty.  The AI call is optional — if it
 * fails for any reason the calling code falls back gracefully to the regex-only
 * result.
 *
 * The preferred entry point is `aiExtractMissingFieldsWithChunks()`, which
 * processes the document chunk by chunk and only asks AI for the fields that
 * are still empty after rule-based extraction.  The legacy `aiExtractMissingFields()`
 * function is kept for backward compatibility.
 */

import { supabase } from './supabaseClient'
import type { HistorischRapport, ObjectType, Gebruiksdoel, Ligging, Energielabel, Dossier, AlgemeneGegevens, AdresLocatie, Oppervlaktes, Huurgegevens, JuridischeInfo, Vergunningen, Waardering, Aannames } from '../types'
import type { ExtractionDebugRecord } from './pdfFieldExtractors'
import type { TextChunk } from './pdfTextChunker'
import {
  extractRuleBasedFieldsFromChunk,
  getMissingFieldsForChunk,
  parseAndValidateAIOutput,
  AI_EXTRACTABLE_FIELDS,
  type AIFieldValue,
} from './pdfChunkAIExtractor'

/** Maximum PDF text length to send to the AI (cost-conscious). */
const MAX_TEXT_CHARS = 30000

/**
 * Maps missing field names to the most relevant `rapportTeksten` section keys.
 * Fields not listed will fall back to `samenvatting` and then `volledig`.
 */
const FIELD_TO_SECTIONS: Record<string, string[]> = {
  energielabel:               ['duurzaamheid', 'technisch'],
  marktwaarde:                ['waardering', 'samenvatting'],
  bar:                        ['waardering'],
  nar:                        ['waardering'],
  kapitalisatiefactor:        ['waardering'],
  waardepeildatum:            ['waardering', 'samenvatting'],
  eigendomssituatie:          ['juridisch'],
  bestemmingsplan:            ['juridisch'],
  erfpacht:                   ['juridisch'],
  bereikbaarheid:             ['locatie'],
  ligging:                    ['locatie'],
  gemeente:                   ['locatie', 'samenvatting'],
  provincie:                  ['locatie', 'samenvatting'],
  bvo:                        ['samenvatting', 'object'],
  vvo:                        ['samenvatting', 'object'],
  perceeloppervlak:           ['object', 'samenvatting'],
  bouwjaar:                   ['technisch', 'object'],
  typeObject:                 ['object', 'samenvatting'],
  gebruiksdoel:               ['object', 'samenvatting'],
  straat:                     ['samenvatting'],
  huisnummer:                 ['samenvatting'],
  postcode:                   ['samenvatting'],
  plaats:                     ['samenvatting'],
  naamTaxateur:               ['samenvatting'],
  inspectiedatum:             ['samenvatting'],
  objectnaam:                 ['samenvatting', 'object'],
  markthuurPerJaar:           ['waardering', 'samenvatting'],
  huurprijsPerJaar:           ['waardering', 'samenvatting'],
  // Stap 9 fields
  aannames:                   ['aannames', 'samenvatting'],
  voorbehouden:               ['aannames'],
  bijzondereOmstandigheden:   ['aannames'],
  algemeneUitgangspunten:     ['aannames', 'samenvatting'],
  bijzondereUitgangspunten:   ['aannames'],
  ontvangenInformatie:        ['aannames', 'samenvatting'],
  wezenlijkeVeranderingen:    ['aannames'],
  taxatieOnnauwkeurigheid:    ['aannames', 'waardering'],
  // SWOT fields
  swotSterktes:               ['swot'],
  swotZwaktes:                ['swot'],
  swotKansen:                 ['swot'],
  swotBedreigingen:           ['swot'],
}

/** Minimum combined section length before falling back to the full text. */
const MIN_SECTION_LENGTH_THRESHOLD = 500

/**
 * Returns the most relevant sections from `rapportTeksten` for the given missing fields,
 * concatenated up to `MAX_TEXT_CHARS`. Falls back to the full text when no sections match.
 *
 * The `truncated` flag is `true` when any section or fallback text was cut short.
 */
export function getRelevantTextForFields(
  rapportTeksten: Record<string, string>,
  missingFields: string[]
): { text: string; truncated: boolean } {
  const relevantSectionKeys = new Set<string>()

  for (const field of missingFields) {
    const keys = FIELD_TO_SECTIONS[field] ?? ['samenvatting']
    for (const key of keys) {
      relevantSectionKeys.add(key)
    }
  }

  // Always include samenvatting as it contains the most concise overview
  relevantSectionKeys.add('samenvatting')

  const parts: string[] = []
  let totalLength = 0
  let truncated = false

  for (const key of relevantSectionKeys) {
    const section = rapportTeksten[key]
    if (!section) continue
    const remaining = MAX_TEXT_CHARS - totalLength
    if (remaining <= 0) { truncated = true; break }
    if (section.length > remaining) {
      parts.push(section.slice(0, remaining) + '…')
      truncated = true
    } else {
      parts.push(section)
    }
    totalLength += section.length
  }

  // If we have no sections or very little content, fall back to the full text (truncated)
  if (totalLength < MIN_SECTION_LENGTH_THRESHOLD && rapportTeksten['volledig']) {
    const full = rapportTeksten['volledig']
    if (full.length > MAX_TEXT_CHARS) {
      return { text: full.slice(0, MAX_TEXT_CHARS) + '…', truncated: true }
    }
    return { text: full, truncated: false }
  }

  return { text: parts.join('\n\n---\n\n'), truncated }
}

/** Per-field AI result returned by the edge function. */
interface AIFieldResult {
  value: unknown
  confidence: 'high' | 'medium' | 'low'
}

/** Shape of the edge function response. */
type EdgeFunctionResponse = Record<string, AIFieldResult>

/**
 * Determines which fields are missing / empty in the current regex result.
 * Returns an array of field names to request from the AI.
 */
function getMissingFields(result: Partial<HistorischRapport>): string[] {
  const missing: string[] = []

  if (!result.adres?.straat) missing.push('straat')
  if (!result.adres?.huisnummer) missing.push('huisnummer')
  if (!result.adres?.postcode) missing.push('postcode')
  if (!result.adres?.plaats) missing.push('plaats')
  if (!result.typeObject) missing.push('typeObject')
  if (!result.gebruiksdoel) missing.push('gebruiksdoel')
  if (!result.bvo) missing.push('bvo')
  if (!result.wizardData?.stap3?.vvo) missing.push('vvo')
  if (!result.wizardData?.stap3?.perceeloppervlak) missing.push('perceeloppervlak')
  if (!result.marktwaarde) missing.push('marktwaarde')
  if (!result.bar) missing.push('bar')
  if (!result.nar) missing.push('nar')
  if (!result.waardepeildatum) missing.push('waardepeildatum')
  if (!result.wizardData?.stap1?.inspectiedatum) missing.push('inspectiedatum')
  if (!result.wizardData?.stap3?.bouwjaar) missing.push('bouwjaar')
  if (!result.wizardData?.stap1?.naamTaxateur) missing.push('naamTaxateur')
  if (!result.wizardData?.stap1?.objectnaam) missing.push('objectnaam')
  if (!result.wizardData?.stap2?.gemeente) missing.push('gemeente')
  if (!result.wizardData?.stap2?.provincie) missing.push('provincie')
  if (!result.wizardData?.stap7?.energielabel) missing.push('energielabel')
  if (!result.wizardData?.stap8?.kapitalisatiefactor) missing.push('kapitalisatiefactor')
  if (!result.wizardData?.stap4?.markthuurPerJaar) missing.push('markthuurPerJaar')
  if (!result.wizardData?.stap4?.huurprijsPerJaar) missing.push('huurprijsPerJaar')
  if (!result.wizardData?.stap5?.eigendomssituatie) missing.push('eigendomssituatie')
  if (!result.wizardData?.stap2?.ligging) missing.push('ligging')
  if (!result.wizardData?.stap9?.aannames) missing.push('aannames')
  if (!result.wizardData?.stap9?.voorbehouden) missing.push('voorbehouden')
  if (!result.wizardData?.stap9?.bijzondereOmstandigheden) missing.push('bijzondereOmstandigheden')
  if (!result.wizardData?.stap9?.algemeneUitgangspunten) missing.push('algemeneUitgangspunten')
  if (!result.wizardData?.stap9?.bijzondereUitgangspunten) missing.push('bijzondereUitgangspunten')
  if (!result.wizardData?.stap9?.ontvangenInformatie) missing.push('ontvangenInformatie')
  if (!result.wizardData?.stap9?.wezenlijkeVeranderingen) missing.push('wezenlijkeVeranderingen')
  if (!result.wizardData?.stap9?.taxatieOnnauwkeurigheid) missing.push('taxatieOnnauwkeurigheid')
  if (!result.wizardData?.stap9?.swotSterktes) missing.push('swotSterktes')
  if (!result.wizardData?.stap9?.swotZwaktes) missing.push('swotZwaktes')
  if (!result.wizardData?.stap9?.swotKansen) missing.push('swotKansen')
  if (!result.wizardData?.stap9?.swotBedreigingen) missing.push('swotBedreigingen')

  return missing
}

/** Valid ObjectType values. */
const VALID_OBJECT_TYPES = new Set<string>(['kantoor', 'bedrijfscomplex', 'bedrijfshal', 'winkel', 'woning', 'appartement', 'overig'])
/** Valid Gebruiksdoel values. */
const VALID_GEBRUIKSDOELEN = new Set<string>(['eigenaar_gebruiker', 'verhuurd_belegging', 'leegstand', 'overig'])
/** Valid Ligging values. */
const VALID_LIGGING = new Set<string>(['binnenstad', 'woonwijk', 'bedrijventerrein', 'buitengebied', 'gemengd'])
/** Valid Energielabel values. */
const VALID_ENERGIELABELS = new Set<string>(['A++++', 'A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'geen'])

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string') {
    // Handle Dutch decimal notation (comma as separator)
    const normalized = v.replace(/\./g, '').replace(',', '.')
    const n = parseFloat(normalized)
    if (isFinite(n)) return n
  }
  return undefined
}

function toString(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  return undefined
}

/**
 * Merges AI-extracted fields into the current (regex-only) result.
 *
 * - Regex results always take precedence over AI results.
 * - AI-filled fields get `confidence: 'medium'` and `sourceType: 'ai'` in the debug record.
 * - Returns the merged result and the AI debug entries.
 */
export async function aiExtractMissingFields(
  text: string,
  currentResult: Partial<HistorischRapport>
): Promise<{ result: Partial<HistorischRapport>; aiDebug: ExtractionDebugRecord; warnings: string[] }> {
  const missingFields = getMissingFields(currentResult)

  if (missingFields.length === 0) {
    return { result: currentResult, aiDebug: {}, warnings: [] }
  }

  // Use sectioned text when available for smarter, more targeted AI extraction
  const rapportTeksten = currentResult.rapportTeksten
  let relevantText: string
  let textTruncated = false
  if (rapportTeksten && Object.keys(rapportTeksten).length > 1) {
    const { text: sectionText, truncated } = getRelevantTextForFields(rapportTeksten, missingFields)
    relevantText = sectionText
    textTruncated = truncated
  } else if (text.length > MAX_TEXT_CHARS) {
    relevantText = text.slice(0, MAX_TEXT_CHARS) + '…'
    textTruncated = true
  } else {
    relevantText = text
  }

  const warnings: string[] = []
  if (textTruncated) {
    warnings.push('Het rapport is te groot om volledig door AI te verwerken. Sommige gegevens zijn mogelijk niet automatisch ingevuld.')
  }

  const { data, error } = await supabase.functions.invoke('openai-pdf-extract', {
    body: { text: relevantText, missingFields },
  })

  if (error || !data) {
    // Return gracefully so the calling code can continue with the regex-only result.
    // A 400/5xx from the edge function should never block the parse flow.
    console.warn('[aiExtractMissingFields] Edge function error:', error?.message ?? 'No data returned')
    return { result: currentResult, aiDebug: {}, warnings }
  }

  const fields = data as EdgeFunctionResponse
  const merged: Partial<HistorischRapport> = { ...currentResult }
  const aiDebug: ExtractionDebugRecord = {}

  // Helper to record an AI-filled debug entry
  const recordAI = (key: string, value: unknown, confidence: 'high' | 'medium' | 'low' = 'medium') => {
    aiDebug[key] = {
      value,
      confidence,
      sourceLabel: '(ai)',
      sourceSnippet: String(value).slice(0, 80),
      sourceSection: undefined,
      parserRule: 'openai-pdf-extract',
      sourceType: 'ai',
    }
  }

  // Ensure nested objects exist
  if (!merged.adres) {
    merged.adres = { straat: '', huisnummer: '', postcode: '', plaats: '' }
  }
  if (!merged.wizardData) merged.wizardData = {}

  // Adres fields
  if (fields.straat?.value && !currentResult.adres?.straat) {
    const v = toString(fields.straat.value)
    if (v) { merged.adres!.straat = v; recordAI('straat', v, fields.straat.confidence) }
  }
  if (fields.huisnummer?.value && !currentResult.adres?.huisnummer) {
    const v = toString(fields.huisnummer.value)
    if (v) { merged.adres!.huisnummer = v; recordAI('huisnummer', v, fields.huisnummer.confidence) }
  }
  if (fields.postcode?.value && !currentResult.adres?.postcode) {
    const v = toString(fields.postcode.value)
    if (v) { merged.adres!.postcode = v; recordAI('postcode', v, fields.postcode.confidence) }
  }
  if (fields.plaats?.value && !currentResult.adres?.plaats) {
    const v = toString(fields.plaats.value)
    if (v) { merged.adres!.plaats = v; recordAI('plaats', v, fields.plaats.confidence) }
  }

  // TypeObject
  if (fields.typeObject?.value && !currentResult.typeObject) {
    const v = toString(fields.typeObject.value)
    if (v && VALID_OBJECT_TYPES.has(v)) {
      merged.typeObject = v as ObjectType
      recordAI('typeObject', v, fields.typeObject.confidence)
    }
  }

  // Gebruiksdoel
  if (fields.gebruiksdoel?.value && !currentResult.gebruiksdoel) {
    const v = toString(fields.gebruiksdoel.value)
    if (v && VALID_GEBRUIKSDOELEN.has(v)) {
      merged.gebruiksdoel = v as Gebruiksdoel
      recordAI('gebruiksdoel', v, fields.gebruiksdoel.confidence)
    }
  }

  // BVO
  if (fields.bvo?.value && !currentResult.bvo) {
    const v = toNumber(fields.bvo.value)
    if (v !== undefined && v > 0) { merged.bvo = v; recordAI('bvo', v, fields.bvo.confidence) }
  }

  // Marktwaarde
  if (fields.marktwaarde?.value && !currentResult.marktwaarde) {
    const v = toNumber(fields.marktwaarde.value)
    if (v !== undefined && v > 0) { merged.marktwaarde = v; recordAI('marktwaarde', v, fields.marktwaarde.confidence) }
  }

  // BAR
  if (fields.bar?.value && !currentResult.bar) {
    const v = toNumber(fields.bar.value)
    if (v !== undefined && v > 0) { merged.bar = v; recordAI('bar', v, fields.bar.confidence) }
  }

  // NAR
  if (fields.nar?.value && !currentResult.nar) {
    const v = toNumber(fields.nar.value)
    if (v !== undefined && v > 0) { merged.nar = v; recordAI('nar', v, fields.nar.confidence) }
  }

  // Waardepeildatum
  if (fields.waardepeildatum?.value && !currentResult.waardepeildatum) {
    const v = toString(fields.waardepeildatum.value)
    if (v) { merged.waardepeildatum = v; recordAI('waardepeildatum', v, fields.waardepeildatum.confidence) }
  }

  // WizardData stap1
  if (!merged.wizardData!.stap1) merged.wizardData!.stap1 = {} as AlgemeneGegevens
  const stap1 = merged.wizardData!.stap1!

  if (fields.inspectiedatum?.value && !currentResult.wizardData?.stap1?.inspectiedatum) {
    const v = toString(fields.inspectiedatum.value)
    if (v) { stap1.inspectiedatum = v; recordAI('inspectiedatum', v, fields.inspectiedatum.confidence) }
  }
  if (fields.naamTaxateur?.value && !currentResult.wizardData?.stap1?.naamTaxateur) {
    const v = toString(fields.naamTaxateur.value)
    if (v) { stap1.naamTaxateur = v; recordAI('naamTaxateur', v, fields.naamTaxateur.confidence) }
  }
  if (fields.objectnaam?.value && !currentResult.wizardData?.stap1?.objectnaam) {
    const v = toString(fields.objectnaam.value)
    if (v) { stap1.objectnaam = v; recordAI('objectnaam', v, fields.objectnaam.confidence) }
  }

  // WizardData stap2
  if (!merged.wizardData!.stap2) merged.wizardData!.stap2 = {} as AdresLocatie
  const stap2 = merged.wizardData!.stap2!

  if (fields.gemeente?.value && !currentResult.wizardData?.stap2?.gemeente) {
    const v = toString(fields.gemeente.value)
    if (v) { stap2.gemeente = v; recordAI('gemeente', v, fields.gemeente.confidence) }
  }
  if (fields.provincie?.value && !currentResult.wizardData?.stap2?.provincie) {
    const v = toString(fields.provincie.value)
    if (v) { stap2.provincie = v; recordAI('provincie', v, fields.provincie.confidence) }
  }
  if (fields.ligging?.value && !currentResult.wizardData?.stap2?.ligging) {
    const v = toString(fields.ligging.value)
    if (v && VALID_LIGGING.has(v)) {
      stap2.ligging = v as Ligging
      recordAI('ligging', v, fields.ligging.confidence)
    }
  }

  // WizardData stap3
  if (!merged.wizardData!.stap3) merged.wizardData!.stap3 = {} as Oppervlaktes
  const stap3 = merged.wizardData!.stap3!

  if (fields.vvo?.value && !currentResult.wizardData?.stap3?.vvo) {
    const v = toNumber(fields.vvo.value)
    if (v !== undefined && v > 0) { stap3.vvo = v; recordAI('vvo', v, fields.vvo.confidence) }
  }
  if (fields.perceeloppervlak?.value && !currentResult.wizardData?.stap3?.perceeloppervlak) {
    const v = toNumber(fields.perceeloppervlak.value)
    if (v !== undefined && v > 0) { stap3.perceeloppervlak = v; recordAI('perceeloppervlak', v, fields.perceeloppervlak.confidence) }
  }
  if (fields.bouwjaar?.value && !currentResult.wizardData?.stap3?.bouwjaar) {
    const v = toNumber(fields.bouwjaar.value)
    if (v !== undefined && v > 1800 && v <= new Date().getFullYear()) {
      stap3.bouwjaar = v
      recordAI('bouwjaar', v, fields.bouwjaar.confidence)
    }
  }

  // WizardData stap4
  if (!merged.wizardData!.stap4) merged.wizardData!.stap4 = {} as Huurgegevens
  const stap4 = merged.wizardData!.stap4!

  if (fields.markthuurPerJaar?.value && !currentResult.wizardData?.stap4?.markthuurPerJaar) {
    const v = toNumber(fields.markthuurPerJaar.value)
    if (v !== undefined && v > 0) { stap4.markthuurPerJaar = v; recordAI('markthuurPerJaar', v, fields.markthuurPerJaar.confidence) }
  }
  if (fields.huurprijsPerJaar?.value && !currentResult.wizardData?.stap4?.huurprijsPerJaar) {
    const v = toNumber(fields.huurprijsPerJaar.value)
    if (v !== undefined && v > 0) { stap4.huurprijsPerJaar = v; recordAI('huurprijsPerJaar', v, fields.huurprijsPerJaar.confidence) }
  }

  // WizardData stap5
  if (fields.eigendomssituatie?.value && !currentResult.wizardData?.stap5?.eigendomssituatie) {
    if (!merged.wizardData!.stap5) merged.wizardData!.stap5 = {} as JuridischeInfo
    const v = toString(fields.eigendomssituatie.value)
    if (v) {
      merged.wizardData!.stap5!.eigendomssituatie = v
      recordAI('eigendomssituatie', v, fields.eigendomssituatie.confidence)
    }
  }

  // WizardData stap7
  if (fields.energielabel?.value && !currentResult.wizardData?.stap7?.energielabel) {
    if (!merged.wizardData!.stap7) merged.wizardData!.stap7 = {} as Vergunningen
    const v = toString(fields.energielabel.value)
    if (v && VALID_ENERGIELABELS.has(v)) {
      merged.wizardData!.stap7!.energielabel = v as Energielabel
      recordAI('energielabel', v, fields.energielabel.confidence)
    }
  }

  // WizardData stap8
  if (!merged.wizardData!.stap8) merged.wizardData!.stap8 = {} as Waardering
  const stap8 = merged.wizardData!.stap8!

  if (fields.kapitalisatiefactor?.value && !currentResult.wizardData?.stap8?.kapitalisatiefactor) {
    const v = toNumber(fields.kapitalisatiefactor.value)
    if (v !== undefined && v > 0) { stap8.kapitalisatiefactor = v; recordAI('kapitalisatiefactor', v, fields.kapitalisatiefactor.confidence) }
  }

  // WizardData stap9
  const stap9TextFields = [
    'aannames', 'voorbehouden', 'bijzondereOmstandigheden',
    'algemeneUitgangspunten', 'bijzondereUitgangspunten',
    'ontvangenInformatie', 'wezenlijkeVeranderingen', 'taxatieOnnauwkeurigheid',
    'swotSterktes', 'swotZwaktes', 'swotKansen', 'swotBedreigingen',
  ] as const

  for (const fieldName of stap9TextFields) {
    if (fields[fieldName]?.value && !currentResult.wizardData?.stap9?.[fieldName]) {
      const v = toString(fields[fieldName].value)
      if (v) {
        if (!merged.wizardData!.stap9) merged.wizardData!.stap9 = {} as Aannames
        ;(merged.wizardData!.stap9 as Partial<Aannames>)[fieldName] = v
        recordAI(fieldName, v, fields[fieldName].confidence)
      }
    }
  }

  // Sync BVO between top-level and stap3 if AI filled either
  if (merged.wizardData!.stap3?.bvo && !currentResult.bvo) {
    merged.bvo = merged.wizardData!.stap3.bvo
  }
  if (merged.bvo && !merged.wizardData!.stap3?.bvo) {
    if (!merged.wizardData!.stap3) merged.wizardData!.stap3 = {} as Oppervlaktes
    merged.wizardData!.stap3.bvo = merged.bvo
  }

  return { result: merged, aiDebug, warnings }
}

/**
 * Checks whether the given extraction debug record has any AI-filled entries.
 */
export function hasAIFilledFields(debug: ExtractionDebugRecord): boolean {
  return Object.values(debug).some((entry) => entry.sourceType === 'ai')
}

// ---------------------------------------------------------------------------
// Chunk-based AI extraction (preferred path)
// ---------------------------------------------------------------------------

/** Maximum chunk content length to send to AI (cost-conscious). */
const MAX_CHUNK_CHARS = 12000

/**
 * Applies rule-based + AI extraction per chunk, only requesting AI for
 * fields that are still missing after rule-based extraction.
 *
 * Behaviour:
 * - Rule-based results from `currentResult` always take precedence.
 * - AI is called per chunk only when there are still missing fields.
 * - Once a field is found (by rule-based or AI), it is not requested again
 *   in subsequent chunks.
 * - AI output is validated and only accepted for keys in AI_EXTRACTABLE_FIELDS.
 * - Invalid AI output is logged and skipped, never crashes the flow.
 *
 * Returns the merged HistorischRapport result together with AI debug entries
 * and any warnings.
 */
export async function aiExtractMissingFieldsWithChunks(
  textChunks: TextChunk[],
  currentResult: Partial<HistorischRapport>,
): Promise<{ result: Partial<HistorischRapport>; aiDebug: ExtractionDebugRecord; warnings: string[] }> {
  const warnings: string[] = []
  const merged: Partial<HistorischRapport> = { ...currentResult }
  const aiDebug: ExtractionDebugRecord = {}

  // Accumulates AI-found values across chunks so we don't ask twice.
  const aiAccumulator: Record<string, AIFieldValue> = {}

  // Ensure nested objects exist so merging below is safe.
  if (!merged.adres) merged.adres = { straat: '', huisnummer: '', postcode: '', plaats: '' }
  if (!merged.wizardData) merged.wizardData = {}

  // Helper to record an AI-filled debug entry.
  const recordAI = (key: string, value: unknown, confidence: 'high' | 'medium' | 'low' = 'medium') => {
    aiDebug[key] = {
      value,
      confidence,
      sourceLabel: '(ai-chunk)',
      sourceSnippet: String(value).slice(0, 80),
      sourceSection: undefined,
      parserRule: 'openai-pdf-extract-chunk',
      sourceType: 'ai',
    }
  }

  for (const chunk of textChunks) {
    const chunkLabel = `[chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks} "${chunk.sectionTitle}"]`

    // Step 1: rule-based extraction on this chunk.
    const ruleBasedFound = extractRuleBasedFieldsFromChunk(chunk)
    const ruleBasedKeys = Object.keys(ruleBasedFound)
    if (ruleBasedKeys.length > 0) {
      console.log(`[pdfAIExtractor] ${chunkLabel} Rule-based found: ${ruleBasedKeys.join(', ')}`)
    }

    // Step 2: determine which fields are still missing.
    const missingFields = getMissingFieldsForChunk(merged, aiAccumulator)
    if (missingFields.length === 0) {
      console.log(`[pdfAIExtractor] ${chunkLabel} No missing fields — skipping AI call`)
      continue
    }

    console.log(`[pdfAIExtractor] ${chunkLabel} Sending ${missingFields.length} missing field(s) to AI: ${missingFields.join(', ')}`)

    // Step 3: call AI for missing fields only.
    const chunkContent = chunk.content.length > MAX_CHUNK_CHARS
      ? chunk.content.slice(0, MAX_CHUNK_CHARS) + '…'
      : chunk.content

    const { data, error } = await supabase.functions.invoke('openai-pdf-extract', {
      body: {
        text: chunkContent,
        missingFields,
        chunkContext: {
          sectionTitle: chunk.sectionTitle,
          chunkIndex: chunk.chunkIndex,
          totalChunks: chunk.totalChunks,
        },
      },
    })

    if (error || !data) {
      console.warn(`[pdfAIExtractor] ${chunkLabel} Edge function error:`, error?.message ?? 'No data returned')
      continue
    }

    // Step 4: validate AI response.
    const rawJson = typeof data === 'string' ? data : JSON.stringify(data)
    const aiFields = parseAndValidateAIOutput(rawJson, AI_EXTRACTABLE_FIELDS)
    const aiKeys = Object.keys(aiFields)
    console.log(
      `[pdfAIExtractor] ${chunkLabel} AI returned ${aiKeys.length} valid field(s)${aiKeys.length > 0 ? ': ' + aiKeys.join(', ') : ''}`,
    )

    // Step 5: merge into accumulator (don't overwrite already-found fields).
    for (const [key, value] of Object.entries(aiFields)) {
      if (key in aiAccumulator) continue
      aiAccumulator[key] = value
    }
  }

  // ---------------------------------------------------------------------------
  // Apply accumulated AI fields to the merged result
  // (only fill slots that are still empty from rule-based extraction)
  // ---------------------------------------------------------------------------

  const applyAIFields = (fields: Record<string, AIFieldValue>) => {
    // Adres
    if (fields['adres'] && !currentResult.adres?.straat) {
      const v = typeof fields['adres'] === 'string' ? fields['adres'] : undefined
      if (v) {
        // AI returns the full address as a string — store it as objectnaam-style;
        // proper address parsing stays with the regex path.
        recordAI('adres', v)
      }
    }

    // object_type
    if (fields['object_type'] && !currentResult.typeObject) {
      const v = typeof fields['object_type'] === 'string' ? fields['object_type'].trim() : undefined
      if (v && VALID_OBJECT_TYPES.has(v)) {
        merged.typeObject = v as ObjectType
        recordAI('typeObject', v)
      }
    }

    // bouwjaar
    if (fields['bouwjaar'] && !currentResult.wizardData?.stap3?.bouwjaar) {
      const v = toNumber(fields['bouwjaar'])
      if (v !== undefined && v > 1800 && v <= new Date().getFullYear()) {
        if (!merged.wizardData!.stap3) merged.wizardData!.stap3 = {} as Oppervlaktes
        merged.wizardData!.stap3!.bouwjaar = v
        recordAI('bouwjaar', v)
      }
    }

    // marktwaarde / marktwaarde_kk_afgerond
    const marktwaardeRaw = fields['marktwaarde'] ?? fields['marktwaarde_kk_afgerond']
    if (marktwaardeRaw && !currentResult.marktwaarde) {
      const v = toNumber(marktwaardeRaw)
      if (v !== undefined && v > 0) {
        merged.marktwaarde = v
        recordAI('marktwaarde', v)
      }
    }

    // markthuur
    if (fields['markthuur'] && !currentResult.wizardData?.stap4?.markthuurPerJaar) {
      const v = toNumber(fields['markthuur'])
      if (v !== undefined && v > 0) {
        if (!merged.wizardData!.stap4) merged.wizardData!.stap4 = {} as Huurgegevens
        merged.wizardData!.stap4!.markthuurPerJaar = v
        recordAI('markthuurPerJaar', v)
      }
    }

    // netto_huurwaarde
    if (fields['netto_huurwaarde'] && !currentResult.wizardData?.stap4?.huurprijsPerJaar) {
      const v = toNumber(fields['netto_huurwaarde'])
      if (v !== undefined && v > 0) {
        if (!merged.wizardData!.stap4) merged.wizardData!.stap4 = {} as Huurgegevens
        merged.wizardData!.stap4!.huurprijsPerJaar = v
        recordAI('huurprijsPerJaar', v)
      }
    }

    // vloeroppervlak_bvo
    if (fields['vloeroppervlak_bvo'] && !currentResult.bvo) {
      const v = toNumber(fields['vloeroppervlak_bvo'])
      if (v !== undefined && v > 0) {
        merged.bvo = v
        if (!merged.wizardData!.stap3) merged.wizardData!.stap3 = {} as Oppervlaktes
        merged.wizardData!.stap3!.bvo = v
        recordAI('bvo', v)
      }
    }

    // vloeroppervlak_vvo
    if (fields['vloeroppervlak_vvo'] && !currentResult.wizardData?.stap3?.vvo) {
      const v = toNumber(fields['vloeroppervlak_vvo'])
      if (v !== undefined && v > 0) {
        if (!merged.wizardData!.stap3) merged.wizardData!.stap3 = {} as Oppervlaktes
        merged.wizardData!.stap3!.vvo = v
        recordAI('vvo', v)
      }
    }

    // bebouwd_oppervlak → perceeloppervlak
    if (fields['bebouwd_oppervlak'] && !currentResult.wizardData?.stap3?.perceeloppervlak) {
      const v = toNumber(fields['bebouwd_oppervlak'])
      if (v !== undefined && v > 0) {
        if (!merged.wizardData!.stap3) merged.wizardData!.stap3 = {} as Oppervlaktes
        merged.wizardData!.stap3!.perceeloppervlak = v
        recordAI('perceeloppervlak', v)
      }
    }

    // energielabel
    if (fields['energielabel'] && !currentResult.wizardData?.stap7?.energielabel) {
      const v = typeof fields['energielabel'] === 'string' ? fields['energielabel'].trim() : undefined
      if (v && VALID_ENERGIELABELS.has(v)) {
        if (!merged.wizardData!.stap7) merged.wizardData!.stap7 = {} as Vergunningen
        merged.wizardData!.stap7!.energielabel = v as Energielabel
        recordAI('energielabel', v)
      }
    }

    // SWOT fields
    const swotMapping = [
      ['swot_sterktes', 'swotSterktes'],
      ['swot_zwaktes', 'swotZwaktes'],
      ['swot_kansen', 'swotKansen'],
      ['swot_bedreigingen', 'swotBedreigingen'],
    ] as const

    for (const [aiKey, resultKey] of swotMapping) {
      if (fields[aiKey] && !currentResult.wizardData?.stap9?.[resultKey]) {
        const raw = fields[aiKey]
        const v = Array.isArray(raw)
          ? raw.join('\n')
          : typeof raw === 'string'
            ? raw
            : undefined
        if (v) {
          if (!merged.wizardData!.stap9) merged.wizardData!.stap9 = {} as Aannames
          ;(merged.wizardData!.stap9 as Partial<Aannames>)[resultKey] = v
          recordAI(resultKey, v)
        }
      }
    }
  }

  applyAIFields(aiAccumulator)

  const aiFilledCount = Object.keys(aiDebug).length
  console.log(`[pdfAIExtractor] Chunk-based AI extraction complete — ${aiFilledCount} field(s) filled by AI`)

  return { result: merged, aiDebug, warnings }
}
