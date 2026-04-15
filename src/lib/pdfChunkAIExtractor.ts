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
} from './pdfFieldExtractors'

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
] as const

export type AIExtractableField = (typeof AI_EXTRACTABLE_FIELDS)[number]

/** AI response value — string, number, or array of strings (for SWOT fields). */
export type AIFieldValue = string | number | string[]

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

  const bouwjaar = extractBouwjaar(content)
  if (bouwjaar?.value) found['bouwjaar'] = bouwjaar.value

  const marktwaarde = extractMarktwaarde(content)
  if (marktwaarde?.value) found['marktwaarde'] = marktwaarde.value

  const bvo = extractBvo(content)
  if (bvo?.value) found['vloeroppervlak_bvo'] = bvo.value

  const vvo = extractVvo(content)
  if (vvo?.value) found['vloeroppervlak_vvo'] = vvo.value

  const energielabel = extractEnergielabel(content)
  if (energielabel?.value) found['energielabel'] = energielabel.value

  const markthuur = extractMarkthuur(content)
  if (markthuur?.value) found['markthuur'] = markthuur.value

  const typeObject = extractTypeObject(content)
  if (typeObject?.value) found['object_type'] = typeObject.value

  const perceeloppervlak = extractPerceeloppervlak(content)
  if (perceeloppervlak?.value) found['bebouwd_oppervlak'] = perceeloppervlak.value

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
  const SKIP_VALUES = new Set(['onbekend', '-', 'n.v.t.', 'nvt', 'niet beschikbaar', 'geen'])

  for (const [key, rawValue] of Object.entries(parsed as Record<string, unknown>)) {
    if (!allowedSet.has(key)) continue

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
