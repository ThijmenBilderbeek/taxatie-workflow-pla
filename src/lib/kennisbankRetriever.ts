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

/** Minimale cosine similarity drempel voor semantisch zoeken (0-1). */
export const SEMANTIC_MATCH_THRESHOLD = 0.7

/** Kolommen die worden geselecteerd uit de document_chunks tabel. */
const DOCUMENT_CHUNK_COLUMNS =
  'id, document_id, chapter, subchapter, chunk_type, raw_text, clean_text, writing_function, tones, specificity, reuse_score, reuse_as_style_example, template_candidate, template_text, variables_detected, object_address, object_type, market_segment, city, region, metadata, created_at, updated_at'

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
 * Leidt het semantische type af uit een sectieKey.
 * Retourneert null als geen specifieke mapping bestaat.
 */
export function sectieKeyNaarSemanticType(sectieKey: string): string | null {
  const lower = sectieKey.toLowerCase()
  if (lower.startsWith('c')) return 'swot'
  if (lower.startsWith('d')) return 'juridisch'
  if (lower.startsWith('e')) return 'locatie'
  if (lower.startsWith('f')) return 'technisch'
  if (lower.startsWith('h') || lower.startsWith('b')) return 'waardering'
  if (lower.startsWith('j')) return 'aannames'
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
    const semanticType = sectieKeyNaarSemanticType(sectieKey)

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
    if (semanticType) {
      templateQuery = templateQuery.filter('metadata->>semantic_type', 'eq', semanticType)
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
    embedding: (row['embedding'] as number[]) ?? undefined,
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

// ---------------------------------------------------------------------------
// Semantic search helpers
// ---------------------------------------------------------------------------

/**
 * Generates a query embedding for semantic search by calling the
 * `openai-classify` Edge Function with `generateEmbedding: true`.
 * Returns `null` on any failure so callers can fall back gracefully.
 */
export async function generateQueryEmbedding(text: string): Promise<number[] | null> {
  try {
    const { data, error } = await supabase.functions.invoke<{ embedding?: number[] }>(
      'openai-classify',
      { body: { text, generateEmbedding: true } }
    )
    if (error) {
      console.warn('[kennisbankRetriever] generateQueryEmbedding: edge function error:', error)
      return null
    }
    if (!data?.embedding || !Array.isArray(data.embedding)) {
      console.warn('[kennisbankRetriever] generateQueryEmbedding: geen embedding in response')
      return null
    }
    return data.embedding
  } catch (err) {
    console.warn('[kennisbankRetriever] generateQueryEmbedding mislukt:', err)
    return null
  }
}

/**
 * Haalt relevante Kennisbank-data op via vector similarity search (cosine similarity).
 *
 * - Als `queryEmbedding` is opgegeven, roept de Supabase RPC `match_document_chunks` aan
 *   voor semantisch zoeken op basis van pgvector.
 * - Als `queryEmbedding` ontbreekt, valt de functie terug op de exacte-match aanpak van
 *   `getKennisbankContextForSectie`.
 * - Splitst resultaten in templateChunks en styleExamples op basis van flags.
 * - Respecteert MAX_TEMPLATE_CHUNKS (3) en MAX_STYLE_EXAMPLES (2) limieten.
 * - Heeft dezelfde parameters als `getKennisbankContextForSectie` plus `queryEmbedding`.
 */
export async function getKennisbankContextForSectieSemantic(
  sectieKey: string,
  objectType?: ObjectType,
  marketSegment?: MarketSegment,
  queryEmbedding?: number[],
  kantoorId?: string | null
): Promise<KennisbankContext> {
  if (!queryEmbedding) {
    return getKennisbankContextForSectie(sectieKey, objectType, marketSegment)
  }

  const leegResultaat: KennisbankContext = {
    templateChunks: [],
    styleExamples: [],
    writingProfile: null,
    toneGuidance: '',
  }

  try {
    // -----------------------------------------------------------------------
    // 1. Semantic search via match_document_chunks RPC
    // -----------------------------------------------------------------------
    const { data: rpcData, error: rpcError } = await supabase.rpc('match_document_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: SEMANTIC_MATCH_THRESHOLD,
      // Request 2x the needed count to handle overlap between template and style chunks
      match_count: (MAX_TEMPLATE_CHUNKS + MAX_STYLE_EXAMPLES) * 2,
      filter_object_type: objectType ?? null,
      filter_market_segment: marketSegment ?? null,
      filter_kantoor_id: kantoorId ?? null,
    })

    if (rpcError) {
      console.warn('[kennisbankRetriever] match_document_chunks RPC fout:', rpcError)
      return getKennisbankContextForSectie(sectieKey, objectType, marketSegment)
    }

    const allChunks: DocumentChunk[] = (rpcData ?? []).map((row: Record<string, unknown>) =>
      rowNaarChunk(row, MAX_CHUNK_CHARS)
    )

    // Post-filter on semantic_type if a mapping exists for this sectieKey
    const semanticType = sectieKeyNaarSemanticType(sectieKey)
    const filteredChunks = semanticType
      ? allChunks.filter(
          (c) =>
            (c.metadata as Record<string, unknown>)?.semantic_type === semanticType ||
            !(c.metadata as Record<string, unknown>)?.semantic_type
        )
      : allChunks

    const templateChunks = filteredChunks
      .filter((c) => c.templateCandidate)
      .slice(0, MAX_TEMPLATE_CHUNKS)

    const styleExamples = filteredChunks
      .filter((c) => c.reuseAsStyleExample)
      .slice(0, MAX_STYLE_EXAMPLES)

    // -----------------------------------------------------------------------
    // 2. Haal het meest recente schrijfstijlprofiel op
    // -----------------------------------------------------------------------
    let profileQuery = supabase
      .from('document_writing_profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (objectType) {
      profileQuery = profileQuery.eq('object_type', objectType)
    }

    const { data: profileData } = await profileQuery.limit(1)

    const writingProfile = profileData?.[0] ? rowNaarProfile(profileData[0]) : null
    const toneGuidance = buildToneGuidance(writingProfile)

    return { templateChunks, styleExamples, writingProfile, toneGuidance }
  } catch (err) {
    console.warn('[kennisbankRetriever] Fout bij semantisch ophalen context, val terug op exacte match:', err)
    return getKennisbankContextForSectie(sectieKey, objectType, marketSegment)
  }
}

/**
 * Haalt document_chunks op die zijn gekoppeld aan een specifiek dossier via metadata.dossier_id.
 * Bedoeld voor gebruik bij Inzage-documenten waarbij chunks worden getagd met het dossier-ID
 * en het document-type (inzage label).
 *
 * @param dossierId - Het ID van het dossier
 * @param documentType - Optioneel filter op het inzage label (bijv. 'Huurovereenkomsten')
 * @returns Array van DocumentChunk objecten gekoppeld aan het dossier
 */
export async function getInzageChunksForDossier(
  dossierId: string,
  documentType?: string
): Promise<DocumentChunk[]> {
  try {
    let query = supabase
      .from('document_chunks')
      .select(DOCUMENT_CHUNK_COLUMNS)
      .filter('metadata->>dossier_id', 'eq', dossierId)
      .order('created_at', { ascending: true })

    if (documentType) {
      query = query.filter('metadata->>document_type', 'eq', documentType)
    }

    const { data, error } = await query
    if (error) {
      console.warn('[kennisbankRetriever] getInzageChunksForDossier fout:', error)
      return []
    }

    return (data ?? []).map((row: Record<string, unknown>) => rowNaarChunk(row, MAX_CHUNK_CHARS))
  } catch (err) {
    console.warn('[kennisbankRetriever] getInzageChunksForDossier onverwachte fout:', err)
    return []
  }
}
