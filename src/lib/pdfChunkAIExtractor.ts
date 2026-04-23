/**
 * Chunk-based AI extraction helpers for PDF taxatierapport fields.
 *
 * This module provides:
 * - A whitelist of fields AI is allowed to return (AI_EXTRACTABLE_FIELDS)
 * - Per-chunk rule-based extraction using existing extractors
 * - Logic to determine which fields are still missing after rule-based extraction
 * - Safe JSON parsing / validation of AI output
 *
 * The module is intentionally free of Supabase calls — the orchestration
 * (including actual AI invocation) lives in pdfAIExtractor.ts.
 */

import type { TextChunk } from './pdfTextChunker'
import { FULL_DOCUMENT_SECTION_TITLE } from './pdfTextChunker'
import type { HistorischRapport } from '../types'
import {
  extractBouwjaar,
  extractMarktwaarde,
  extractBvo,
  extractVvo,
  extractEnergielabel,
  extractMarkthuur,
  extractTypeObject,
  extractAdres,
  extractPerceeloppervlak,
  extractConstructie,
} from './pdfFieldExtractors'

// ---------------------------------------------------------------------------
// Source metadata and chunk result types
// ---------------------------------------------------------------------------

/** Provenance metadata for a single extracted field value. */
export interface FieldSourceMeta {
  sectionTitle: string
  chunkIndex: number
  extractionType: 'rule_based' | 'ai' | 'combined'
}

/**
 * Structured extraction result for a single chunk.
 * Contains all fields found (rule-based or AI) together with chunk provenance.
 */
export interface ChunkExtractionResult {
  sectionTitle: string
  chunkIndex: number
  totalChunks: number
  extractionType: 'rule_based' | 'ai' | 'combined'
  extractedFields: Record<string, AIFieldValue>
}

/**
 * Conflict log entry emitted when two meaningful values compete for the same
 * field and one must be dropped.
 */
export interface ConflictLog {
  fieldName: string
  existingValue: AIFieldValue
  incomingValue: AIFieldValue
  chosenValue: AIFieldValue
  reason: string
  sourceMeta: FieldSourceMeta
}

// ---------------------------------------------------------------------------
// Allowed field list
// ---------------------------------------------------------------------------

/**
 * Fixed whitelist of field names that AI is allowed to return.
 * AI must not return any other keys; the parser will ignore unlisted keys.
 */
export const AI_EXTRACTABLE_FIELDS = [
  'adres',
  'object_type',
  'bouwjaar',
  'marktwaarde',
  'marktwaarde_kk_afgerond',
  'markthuur',
  'netto_huurwaarde',
  'marktwaarde_per_m2',
  'vloeroppervlak_bvo',
  'vloeroppervlak_vvo',
  'bebouwd_oppervlak',
  'dakoppervlak',
  'glasoppervlak',
  'locatie_score',
  'object_score',
  'courantheid_verhuur',
  'courantheid_verkoop',
  'verhuurtijd_maanden',
  'verkooptijd_maanden',
  'energielabel',
  'swot_sterktes',
  'swot_zwaktes',
  'swot_kansen',
  'swot_bedreigingen',
  'constructie',
  'terrein',
  'gevels',
  'afwerking',
  'omgeving_en_belendingen',
  'voorzieningen',
] as const

export type AIExtractableField = (typeof AI_EXTRACTABLE_FIELDS)[number]

/** AI response value — string, number, or array of strings (for SWOT fields). */
export type AIFieldValue = string | number | string[]

// ---------------------------------------------------------------------------
// Reference / appendix chunk detection
// ---------------------------------------------------------------------------

/**
 * Fields that must not be extracted from reference or appendix sections,
 * to prevent comparable-object data from polluting main-object fields.
 */
export const REFERENCE_SENSITIVE_FIELDS: AIExtractableField[] = [
  'object_type',
  'bouwjaar',
  'marktwaarde',
  'constructie',
  'terrein',
  'gevels',
  'afwerking',
  'omgeving_en_belendingen',
  'voorzieningen',
]

/** Signals in chunk sectionTitle or content that indicate a reference/appendix section. */
const REFERENCE_CHUNK_SIGNALS = [
  'referentie type',
  'huurreferenties',
  'koopreferenties',
  'bijlagen',
  'individuele referenties',
  'toelichting op deze referentie',
]

/**
 * Returns true when the chunk belongs to a reference or appendix section.
 * Checks both the sectionTitle and the content for reference signals.
 */
export function isReferenceOrAppendixChunk(chunk: TextChunk): boolean {
  const lower = (chunk.sectionTitle + ' ' + chunk.content).toLowerCase()
  return REFERENCE_CHUNK_SIGNALS.some((s) => lower.includes(s))
}

// ---------------------------------------------------------------------------
// Mapping: AI field → already-filled check
// ---------------------------------------------------------------------------

/**
 * Returns true when the given AI_EXTRACTABLE_FIELDS field is already
 * present in the current (rule-based) extraction result so that it does
 * not need to be sent to AI.
 */
export function isFieldFilledInResult(
  field: AIExtractableField,
  result: Partial<HistorischRapport>,
): boolean {
  switch (field) {
    case 'adres':
      return !!(result.adres?.straat && result.adres?.plaats)
    case 'object_type':
      return !!result.typeObject
    case 'bouwjaar':
      return !!result.wizardData?.stap3?.bouwjaar
    case 'marktwaarde':
    case 'marktwaarde_kk_afgerond':
      return !!result.marktwaarde
    case 'markthuur':
      return !!result.wizardData?.stap4?.markthuurPerJaar
    case 'netto_huurwaarde':
      return !!result.wizardData?.stap4?.huurprijsPerJaar
    case 'vloeroppervlak_bvo':
      return !!result.bvo
    case 'vloeroppervlak_vvo':
      return !!result.wizardData?.stap3?.vvo
    case 'bebouwd_oppervlak':
      return !!result.wizardData?.stap3?.perceeloppervlak
    case 'energielabel':
      return !!result.wizardData?.stap7?.energielabel
    case 'swot_sterktes':
      return !!result.wizardData?.stap9?.swotSterktes
    case 'swot_zwaktes':
      return !!result.wizardData?.stap9?.swotZwaktes
    case 'swot_kansen':
      return !!result.wizardData?.stap9?.swotKansen
    case 'swot_bedreigingen':
      return !!result.wizardData?.stap9?.swotBedreigingen
    case 'constructie':
      return !!result.wizardData?.stap6?.constructie
    case 'terrein':
      return !!result.wizardData?.stap6?.terrein
    case 'gevels':
      return !!result.wizardData?.stap6?.gevels
    case 'afwerking':
      return !!result.wizardData?.stap6?.afwerking
    case 'omgeving_en_belendingen':
      return !!result.wizardData?.stap2?.omgevingEnBelendingen
    case 'voorzieningen':
      return !!result.wizardData?.stap2?.voorzieningen
    // Fields that have no direct HistorischRapport equivalent — always "missing"
    // from the result perspective; the AI accumulator tracks them separately.
    case 'marktwaarde_per_m2':
    case 'dakoppervlak':
    case 'glasoppervlak':
    case 'locatie_score':
    case 'object_score':
    case 'courantheid_verhuur':
    case 'courantheid_verkoop':
    case 'verhuurtijd_maanden':
    case 'verkooptijd_maanden':
      return false
    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Per-chunk rule-based extraction
// ---------------------------------------------------------------------------

/**
 * Searches for a labeled field in text using label-with-colon matching,
 * capturing up to `maxChars` of multi-line content after the label.
 * Labels must include the colon suffix (e.g. `'terrein:'`).
 * Stops at the next "Label: " pattern on a new line to avoid capturing unrelated content.
 */
function extractSimpleLabel(text: string, labels: string[], maxChars = 300): string | undefined {
  const lower = text.toLowerCase()
  for (const label of labels) {
    const needle = label.toLowerCase()
    const idx = lower.indexOf(needle)
    if (idx === -1) continue
    const after = text.slice(idx + needle.length).replace(/^[\s]+/, '')
    if (!after) continue
    let raw = after.slice(0, maxChars)
    // Stop at the next "Word(s): " pattern on a new line (next field label)
    const nextLabel = raw.search(/\n[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{0,40}:\s/)
    if (nextLabel > 0) raw = raw.slice(0, nextLabel)
    const value = raw.trim().replace(/\s+/g, ' ').slice(0, maxChars)
    if (value && value.length > 2) return value
  }
  return undefined
}

/**
 * Applies the existing rule-based extractors to the content of a single
 * TextChunk and returns a flat record of field-name → value pairs.
 *
 * Field names match the AI_EXTRACTABLE_FIELDS whitelist so that results can
 * be compared directly.
 */
export function extractRuleBasedFieldsFromChunk(
  chunk: TextChunk,
): Record<string, string | number> {
  const content = chunk.content
  const found: Record<string, string | number> = {}
  const isRefChunk = isReferenceOrAppendixChunk(chunk)

  // bouwjaar — skip in reference/appendix chunks
  if (!isRefChunk) {
    const bouwjaar = extractBouwjaar(content)
    if (bouwjaar?.value) found['bouwjaar'] = bouwjaar.value
  }

  // marktwaarde — skip in reference/appendix chunks
  if (!isRefChunk) {
    const marktwaarde = extractMarktwaarde(content)
    if (marktwaarde?.value) found['marktwaarde'] = marktwaarde.value
  }

  const bvo = extractBvo(content)
  if (bvo?.value) found['vloeroppervlak_bvo'] = bvo.value

  const vvo = extractVvo(content)
  if (vvo?.value) found['vloeroppervlak_vvo'] = vvo.value

  const energielabel = extractEnergielabel(content)
  if (energielabel?.value) found['energielabel'] = energielabel.value

  const markthuur = extractMarkthuur(content)
  if (markthuur?.value) found['markthuur'] = markthuur.value

  // object_type — skip in reference/appendix chunks
  if (!isRefChunk) {
    const typeObject = extractTypeObject(content)
    if (typeObject?.value) found['object_type'] = typeObject.value
  }

  const perceeloppervlak = extractPerceeloppervlak(content)
  if (perceeloppervlak?.value) found['bebouwd_oppervlak'] = perceeloppervlak.value

  // constructie — skip in reference/appendix chunks
  if (!isRefChunk) {
    const constructie = extractConstructie(content)
    if (constructie?.value) found['constructie'] = constructie.value
  }

  // Address — flatten to a combined string for easy comparison
  const adresResult = extractAdres(content)
  if (adresResult?.value?.straat) {
    const parts = [
      adresResult.value.straat,
      adresResult.value.huisnummer,
      adresResult.value.postcode,
      adresResult.value.plaats,
    ].filter(Boolean)
    found['adres'] = parts.join(', ')
  }

  // terrein, gevels, afwerking, omgeving_en_belendingen, voorzieningen — skip in reference/appendix chunks
  if (!isRefChunk) {
    const terrein = extractSimpleLabel(content, ['terrein:', 'terreinbeschrijving:', 'buitenterrein:'])
    if (terrein) found['terrein'] = terrein

    const gevels = extractSimpleLabel(content, ['gevels:', 'gevel:', 'gevelbekleding:'])
    if (gevels) found['gevels'] = gevels

    const afwerking = extractSimpleLabel(content, ['afwerking:', 'binnenafwerking:', 'afwerkingsniveau:'])
    if (afwerking) found['afwerking'] = afwerking

    const omgevingEnBelendingen = extractSimpleLabel(content, ['omgeving en belendingen:', 'belendingen:', 'belendende percelen:'])
    if (omgevingEnBelendingen) found['omgeving_en_belendingen'] = omgevingEnBelendingen

    const voorzieningen = extractSimpleLabel(content, ['voorzieningen:', 'voorzieningen in de omgeving:'])
    if (voorzieningen) found['voorzieningen'] = voorzieningen
  }

  return found
}

// ---------------------------------------------------------------------------
// Missing-field determination
// ---------------------------------------------------------------------------

/**
 * Returns the list of AI_EXTRACTABLE_FIELDS that are still absent — i.e.
 * not present in `currentResult` (rule-based) and not yet found by AI in
 * an earlier chunk (`alreadyFoundByAI`).
 */
export function getMissingFieldsForChunk(
  currentResult: Partial<HistorischRapport>,
  alreadyFoundByAI: Record<string, unknown>,
): AIExtractableField[] {
  return AI_EXTRACTABLE_FIELDS.filter((field) => {
    if (isFieldFilledInResult(field, currentResult)) return false
    if (field in alreadyFoundByAI) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// AI output validation
// ---------------------------------------------------------------------------

/**
 * Safely parses and validates the raw JSON string returned by the AI.
 *
 * Rules:
 * - Only keys from `allowedFields` are accepted; others are silently dropped.
 * - When `requestedFields` is provided, only keys present in that list are
 *   accepted (prevents AI from returning fields that were not requested).
 * - Empty strings, null, "onbekend", "-", "n.v.t." are skipped.
 * - Arrays are supported for SWOT fields (each item is trimmed and empty
 *   items are discarded).
 * - Nested `{ value, confidence }` objects (legacy edge function format) are
 *   unwrapped automatically.
 * - Invalid JSON is logged and an empty record is returned — never throws.
 */
export function parseAndValidateAIOutput(
  raw: string,
  allowedFields: readonly AIExtractableField[],
  requestedFields?: string[],
): Record<string, AIFieldValue> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.warn('[pdfChunkAIExtractor] AI response is not valid JSON:', String(err).slice(0, 100))
    return {}
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    console.warn('[pdfChunkAIExtractor] AI response is not a JSON object')
    return {}
  }

  const result: Record<string, AIFieldValue> = {}
  const allowedSet = new Set<string>(allowedFields)
  const requestedSet = requestedFields ? new Set<string>(requestedFields) : null
  const SKIP_VALUES = new Set(['onbekend', '-', 'n.v.t.', 'nvt', 'niet beschikbaar', 'geen'])

  for (const [key, rawValue] of Object.entries(parsed as Record<string, unknown>)) {
    if (!allowedSet.has(key)) continue
    if (requestedSet && !requestedSet.has(key)) continue

    const value = unwrapLegacyValue(rawValue)

    if (value === null || value === undefined) continue

    if (Array.isArray(value)) {
      const items = value
        .filter((v) => typeof v === 'string' && v.trim().length > 0)
        .map((v) => String(v).trim())
      if (items.length > 0) result[key] = items
      continue
    }

    if (typeof value === 'number') {
      if (isFinite(value)) result[key] = value
      continue
    }

    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed || SKIP_VALUES.has(trimmed.toLowerCase())) continue
      result[key] = trimmed
    }
  }

  return result
}

/**
 * Unwraps a legacy `{ value, confidence }` object returned by older edge
 * function variants. Returns the raw value unchanged for all other types.
 */
function unwrapLegacyValue(raw: unknown): unknown {
  if (
    typeof raw === 'object' &&
    raw !== null &&
    !Array.isArray(raw) &&
    'value' in (raw as object)
  ) {
    return (raw as Record<string, unknown>)['value']
  }
  return raw
}

// ---------------------------------------------------------------------------
// Merge helpers
// ---------------------------------------------------------------------------

/** SWOT fields that are combined as unique arrays instead of replaced. */
const SWOT_FIELDS = new Set(['swot_sterktes', 'swot_zwaktes', 'swot_kansen', 'swot_bedreigingen'])

/**
 * High-priority fields: rule_based values for these fields receive an extra
 * priority bonus and will never be overwritten by AI once found.
 */
const PRIORITY_FIELDS = new Set([
  'marktwaarde_kk_afgerond',
  'netto_huurwaarde',
  'markthuur',
  'bouwjaar',
  'energielabel',
  'marktwaarde',
])

/** Placeholder values that are treated as meaningless. */
const MEANINGLESS_VALUES = new Set(['onbekend', '-', 'n.v.t.', 'nvt', 'niet beschikbaar', 'geen'])

/**
 * Returns `true` when `value` is a meaningful, non-empty, non-placeholder value.
 *
 * Handles strings, numbers, and arrays of strings (SWOT fields).
 */
export function isMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return isFinite(value)
  if (Array.isArray(value)) {
    return value.some((item) => typeof item === 'string' && item.trim().length > 0)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 && !MEANINGLESS_VALUES.has(trimmed.toLowerCase())
  }
  return false
}

/**
 * Returns a numeric priority for a field value.
 * Higher value = wins in a conflict.
 *
 * Priority tiers:
 * - `rule_based` / `combined` from any section: 100 (+ 20 bonus for PRIORITY_FIELDS)
 * - `ai` from a specific named section (not FULL_DOCUMENT): 50
 * - `ai` from FULL_DOCUMENT or generic section title: 10
 */
export function getFieldPriority(
  fieldName: string,
  extractionType: 'rule_based' | 'ai' | 'combined',
  sectionTitle: string,
): number {
  if (extractionType === 'rule_based' || extractionType === 'combined') {
    return PRIORITY_FIELDS.has(fieldName) ? 120 : 100
  }
  // AI
  const isFullDoc = !sectionTitle || sectionTitle.toUpperCase() === FULL_DOCUMENT_SECTION_TITLE
  return isFullDoc ? 10 : 50
}

/**
 * Office-type values that should beat "woning" in conflict resolution for object_type.
 *
 * These correspond to the 'value' field in PHYSICAL_OBJECT_TYPES (pdfParser.ts /
 * pdfFieldExtractors.ts). Keep in sync when adding new commercial property types.
 */
const OFFICE_TYPE_VALUES = new Set(['kantoor', 'bedrijfscomplex', 'bedrijfshal', 'winkel'])

/**
 * Merges `incoming` into `existing` for a single field.
 *
 * Rules applied in order:
 * 1. Non-meaningful `incoming` is always ignored.
 * 2. Non-meaningful (or absent) `existing` → incoming wins unconditionally.
 * 3. SWOT arrays: both arrays are combined without duplicates (regardless of priority).
 * 4. object_type special rule: office/commercial types beat "woning" regardless of priority
 *    (prevents false positives from residential market-analysis text in commercial reports).
 * 5. Both meaningful scalars: higher priority wins; equal priority → existing wins.
 *
 * Returns the winning value, its source metadata, and an optional ConflictLog
 * entry (only emitted when both values are meaningful and differ).
 */
export function mergeFieldValue(
  existing: AIFieldValue | undefined,
  existingMeta: FieldSourceMeta | undefined,
  incoming: AIFieldValue,
  incomingMeta: FieldSourceMeta,
  fieldName: string,
): { value: AIFieldValue; meta: FieldSourceMeta; conflict?: ConflictLog } {
  // SWOT: always combine as unique arrays regardless of priority
  if (SWOT_FIELDS.has(fieldName)) {
    const toItems = (v: AIFieldValue | undefined): string[] => {
      if (!v) return []
      if (Array.isArray(v)) return v.filter((s) => typeof s === 'string' && s.trim()).map((s) => String(s).trim())
      if (typeof v === 'string' && v.trim()) return v.split('\n').map((s) => s.trim()).filter(Boolean)
      return []
    }
    const combined = [...toItems(existing)]
    for (const item of toItems(incoming)) {
      if (!combined.includes(item)) combined.push(item)
    }
    return { value: combined, meta: incomingMeta }
  }

  // Non-meaningful incoming → keep existing (or return incoming as placeholder)
  if (!isMeaningfulValue(incoming)) {
    return { value: existing ?? incoming, meta: existingMeta ?? incomingMeta }
  }

  // No existing meaningful value → incoming wins
  if (!isMeaningfulValue(existing)) {
    return { value: incoming, meta: incomingMeta }
  }

  // Both meaningful scalars → compare priorities
  // `existing` is confirmed meaningful by isMeaningfulValue above.
  const existingValue = existing as AIFieldValue

  // Special rule for object_type: office/commercial types beat "woning" regardless of
  // extraction priority. This prevents residential market-analysis text (which can contain
  // standalone "woning" mentions) from polluting the type of a commercial property.
  if (fieldName === 'object_type') {
    const existingStr = String(existingValue).toLowerCase()
    const incomingStr = String(incoming).toLowerCase()
    if (existingStr === 'woning' && OFFICE_TYPE_VALUES.has(incomingStr)) {
      const conflict: ConflictLog = {
        fieldName,
        existingValue,
        incomingValue: incoming,
        chosenValue: incoming,
        reason: `Office type "${incomingStr}" overrides weak "woning" detection`,
        sourceMeta: incomingMeta,
      }
      return { value: incoming, meta: incomingMeta, conflict }
    }
    if (incomingStr === 'woning' && OFFICE_TYPE_VALUES.has(existingStr)) {
      const conflict: ConflictLog = {
        fieldName,
        existingValue,
        incomingValue: incoming,
        chosenValue: existingValue,
        reason: `Existing office type "${existingStr}" is stronger than incoming "woning"`,
        sourceMeta: existingMeta ?? incomingMeta,
      }
      return { value: existingValue, meta: existingMeta ?? incomingMeta, conflict }
    }
  }

  const existingPriority = existingMeta
    ? getFieldPriority(fieldName, existingMeta.extractionType, existingMeta.sectionTitle)
    : 0
  const incomingPriority = getFieldPriority(fieldName, incomingMeta.extractionType, incomingMeta.sectionTitle)

  if (incomingPriority > existingPriority) {
    const conflict: ConflictLog = {
      fieldName,
      existingValue,
      incomingValue: incoming,
      chosenValue: incoming,
      reason: `Incoming priority ${incomingPriority} > existing priority ${existingPriority}`,
      sourceMeta: incomingMeta,
    }
    return { value: incoming, meta: incomingMeta, conflict }
  }

  // Existing wins (equal or higher priority — stability preference)
  const conflict: ConflictLog | undefined =
    String(existingValue) !== String(incoming)
      ? {
          fieldName,
          existingValue,
          incomingValue: incoming,
          chosenValue: existingValue,
          reason: `Existing priority ${existingPriority} >= incoming priority ${incomingPriority}; existing preserved`,
          sourceMeta: existingMeta ?? incomingMeta,
        }
      : undefined
  return { value: existingValue, meta: existingMeta ?? incomingMeta, conflict }
}

/**
 * Merges all chunk extraction results into a single flat field map.
 *
 * Processing order:
 * 1. Results are sorted by `chunkIndex` ascending.
 * 2. Within the same chunk, `rule_based` results are processed before `ai`.
 * 3. Conflicts are resolved via `mergeFieldValue` and collected in `conflicts`.
 *
 * Returns:
 * - `fields`: merged flat field map (ready to pass to `applyAIFields`)
 * - `sourceMeta`: provenance metadata per field (for debugging/logging)
 * - `conflicts`: all conflict log entries
 */
export function mergeExtractionResults(results: ChunkExtractionResult[]): {
  fields: Record<string, AIFieldValue>
  sourceMeta: Record<string, FieldSourceMeta>
  conflicts: ConflictLog[]
} {
  const fields: Record<string, AIFieldValue> = {}
  const sourceMeta: Record<string, FieldSourceMeta> = {}
  const conflicts: ConflictLog[] = []

  // Sort: ascending chunkIndex, rule_based/combined before ai
  const typeOrder: Record<ChunkExtractionResult['extractionType'], number> = {
    rule_based: 0,
    combined: 1,
    ai: 2,
  }
  const sorted = [...results].sort((a, b) => {
    if (a.chunkIndex !== b.chunkIndex) return a.chunkIndex - b.chunkIndex
    return typeOrder[a.extractionType] - typeOrder[b.extractionType]
  })

  for (const result of sorted) {
    const meta: FieldSourceMeta = {
      sectionTitle: result.sectionTitle,
      chunkIndex: result.chunkIndex,
      extractionType: result.extractionType,
    }

    for (const [fieldName, value] of Object.entries(result.extractedFields)) {
      const merged = mergeFieldValue(fields[fieldName], sourceMeta[fieldName], value, meta, fieldName)
      fields[fieldName] = merged.value
      sourceMeta[fieldName] = merged.meta
      if (merged.conflict) {
        conflicts.push(merged.conflict)
      }
    }
  }

  return { fields, sourceMeta, conflicts }
}
