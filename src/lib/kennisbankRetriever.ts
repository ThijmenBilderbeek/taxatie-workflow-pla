import { supabase } from './supabaseClient'
import type { DocumentChunk, DocumentWritingProfile } from '@/types/kennisbank'
import type { ObjectType } from '@/types'
import type { MarketSegment } from '@/types/kennisbank'

// ---------------------------------------------------------------------------
// Cache invalidation
// ---------------------------------------------------------------------------

let _lastInvalidation = Date.now()

export function invalidateKennisbankCache(): void {
  _lastInvalidation = Date.now()
}

export function getLastCacheInvalidation(): number {
  return _lastInvalidation
}

// ---------------------------------------------------------------------------
// Constanten
// ---------------------------------------------------------------------------

/** Maximum tekens per chunk — voorkomt token-budget overschrijding. */
const MAX_CHUNK_CHARS = 500

/** Maximum aantal template-chunks meegestuurd naar de AI. */
const MAX_TEMPLATE_CHUNKS = 3

/** Maximum aantal stijlvoorbeelden meegestuurd naar de AI. */
const MAX_STYLE_EXAMPLES = 2

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface KennisbankContext {
  templateChunks: DocumentChunk[]
  styleExamples: DocumentChunk[]
  writingProfile: DocumentWritingProfile | null
  toneGuidance: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Leidt het hoofdstuk-label af uit een sectieKey.
 * Bijv. "b4-inspectie" → "B", "i-duurzaamheid" → "I", "samenvatting" → null.
 */
export function sectieKeyNaarChapter(sectieKey: string): string | null {
  const match = sectieKey.match(/^([a-zA-Z]+)\d*-/)
  if (match) return match[1].toUpperCase()
  // Speciale gevallen zonder cijfer: "i-duurzaamheid", "j-algemene-uitgangspunten" etc.
  const letterOnly = sectieKey.match(/^([a-zA-Z])-/)
  if (letterOnly) return letterOnly[1].toUpperCase()
  return null
}

/**
 * Trunkeer tekst tot maximaal maxChars tekens.
 */
function trunceer(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '…'
}

/**
 * Bouwt een leesbare toon-instructie op basis van een schrijfstijlprofiel.
 */
function buildToneGuidance(profile: DocumentWritingProfile | null): string {
  if (!profile) return ''
  const delen: string[] = []
  if (profile.toneOfVoice) delen.push(`toon: ${profile.toneOfVoice}`)
  if (profile.detailLevel) delen.push(`detailniveau: ${profile.detailLevel}`)
  if (profile.standardizationLevel) delen.push(`standaardisatieniveau: ${profile.standardizationLevel}`)
  return delen.join(', ')
}

// ---------------------------------------------------------------------------
// Hoofd-export
// ---------------------------------------------------------------------------

/**
 * Haalt relevante Kennisbank-data op voor een specifieke rapport-sectie.
 *
 * - Query `document_chunks` voor chunks met matching chapter waar
 *   `template_candidate = true` of `reuse_as_style_example = true`.
 * - Optioneel filter op `object_type` en `market_segment` voor relevantere matches.
 * - Query `document_writing_profiles` voor het meest recente matching profiel.
 * - Limiteert tot max 3 template chunks en 2 style examples (token budget).
 * - Trunceert chunk tekst tot max 500 chars per chunk.
 * - Bij lege kennisbank of query-fouten: geeft een leeg resultaat terug (geen breaking changes).
 */
export async function getKennisbankContextForSectie(
  sectieKey: string,
  objectType?: ObjectType,
  marketSegment?: MarketSegment
): Promise<KennisbankContext> {
  const leegResultaat: KennisbankContext = {
    templateChunks: [],
    styleExamples: [],
    writingProfile: null,
    toneGuidance: '',
  }

  try {
    const chapter = sectieKeyNaarChapter(sectieKey)

    // -----------------------------------------------------------------------
    // 1. Haal template chunks op (template_candidate = true)
    // -----------------------------------------------------------------------
    let templateQuery = supabase
      .from('document_chunks')
      .select('*')
      .eq('template_candidate', true)

    if (chapter) {
      templateQuery = templateQuery.ilike('chapter', `${chapter}%`)
    }
    if (objectType) {
      templateQuery = templateQuery.eq('object_type', objectType)
    }
    if (marketSegment) {
      templateQuery = templateQuery.eq('market_segment', marketSegment)
    }

    const { data: templateData } = await templateQuery.limit(MAX_TEMPLATE_CHUNKS)

    // -----------------------------------------------------------------------
    // 2. Haal stijlvoorbeelden op (reuse_as_style_example = true)
    // -----------------------------------------------------------------------
    let styleQuery = supabase
      .from('document_chunks')
      .select('*')
      .eq('reuse_as_style_example', true)

    if (objectType) {
      styleQuery = styleQuery.eq('object_type', objectType)
    }
    if (marketSegment) {
      styleQuery = styleQuery.eq('market_segment', marketSegment)
    }

    const { data: styleData } = await styleQuery.limit(MAX_STYLE_EXAMPLES)

    // -----------------------------------------------------------------------
    // 3. Haal het meest recente schrijfstijlprofiel op
    // -----------------------------------------------------------------------
    let profileQuery = supabase
      .from('document_writing_profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (objectType) {
      profileQuery = profileQuery.eq('object_type', objectType)
    }

    const { data: profileData } = await profileQuery.limit(1)

    // -----------------------------------------------------------------------
    // 4. Bouw resultaat op — trunceer chunks, graceful fallback bij lege data
    // -----------------------------------------------------------------------
    const templateChunks = (templateData ?? []).map((row) =>
      rowNaarChunk(row, MAX_CHUNK_CHARS)
    )

    const styleExamples = (styleData ?? []).map((row) =>
      rowNaarChunk(row, MAX_CHUNK_CHARS)
    )

    const writingProfile = profileData?.[0] ? rowNaarProfile(profileData[0]) : null
    const toneGuidance = buildToneGuidance(writingProfile)

    return { templateChunks, styleExamples, writingProfile, toneGuidance }
  } catch (err) {
    console.warn('[kennisbankRetriever] Fout bij ophalen context, val terug op lege kennisbank:', err)
    return leegResultaat
  }
}

// ---------------------------------------------------------------------------
// Row-mappers
// ---------------------------------------------------------------------------

function rowNaarChunk(row: Record<string, unknown>, maxChars: number): DocumentChunk {
  const rawText = String(row['raw_text'] ?? row['rawText'] ?? '')
  const cleanText = String(row['clean_text'] ?? row['cleanText'] ?? '')

  return {
    id: String(row['id'] ?? ''),
    documentId: String(row['document_id'] ?? row['documentId'] ?? ''),
    chapter: String(row['chapter'] ?? ''),
    subchapter: String(row['subchapter'] ?? ''),
    chunkType: (row['chunk_type'] ?? row['chunkType'] ?? 'narratief') as DocumentChunk['chunkType'],
    rawText: trunceer(rawText, maxChars),
    cleanText: trunceer(cleanText, maxChars),
    writingFunction: (row['writing_function'] ?? row['writingFunction'] ?? 'beschrijvend') as DocumentChunk['writingFunction'],
    tones: (row['tones'] as DocumentChunk['tones']) ?? [],
    specificity: (row['specificity'] ?? 'standaard') as DocumentChunk['specificity'],
    reuseScore: Number(row['reuse_score'] ?? row['reuseScore'] ?? 0),
    reuseAsStyleExample: Boolean(row['reuse_as_style_example'] ?? row['reuseAsStyleExample'] ?? false),
    templateCandidate: Boolean(row['template_candidate'] ?? row['templateCandidate'] ?? false),
    templateText: row['template_text'] != null ? trunceer(String(row['template_text']), maxChars) : undefined,
    variablesDetected: (row['variables_detected'] as string[]) ?? [],
    objectAddress: row['object_address'] != null ? String(row['object_address']) : undefined,
    objectType: row['object_type'] != null ? (row['object_type'] as DocumentChunk['objectType']) : undefined,
    marketSegment: row['market_segment'] != null ? (row['market_segment'] as DocumentChunk['marketSegment']) : undefined,
    city: row['city'] != null ? String(row['city']) : undefined,
    region: row['region'] != null ? String(row['region']) : undefined,
    metadata: (row['metadata'] as Record<string, unknown>) ?? {},
    createdAt: String(row['created_at'] ?? row['createdAt'] ?? ''),
    updatedAt: String(row['updated_at'] ?? row['updatedAt'] ?? ''),
  }
}

function rowNaarProfile(row: Record<string, unknown>): DocumentWritingProfile {
  return {
    documentId: String(row['document_id'] ?? row['documentId'] ?? ''),
    documentType: String(row['document_type'] ?? row['documentType'] ?? 'taxatierapport'),
    objectType: row['object_type'] != null ? (row['object_type'] as DocumentWritingProfile['objectType']) : undefined,
    marketSegment: row['market_segment'] != null ? (row['market_segment'] as DocumentWritingProfile['marketSegment']) : undefined,
    toneOfVoice: (row['tone_of_voice'] ?? row['toneOfVoice'] ?? 'formeel') as DocumentWritingProfile['toneOfVoice'],
    detailLevel: (row['detail_level'] ?? row['detailLevel'] ?? 'standaard') as DocumentWritingProfile['detailLevel'],
    standardizationLevel: (row['standardization_level'] ?? row['standardizationLevel'] ?? 'gemiddeld') as DocumentWritingProfile['standardizationLevel'],
    dominantChapterStructure: (row['dominant_chapter_structure'] as string[]) ?? [],
    reuseQuality: Number(row['reuse_quality'] ?? row['reuseQuality'] ?? 0),
  }
}
