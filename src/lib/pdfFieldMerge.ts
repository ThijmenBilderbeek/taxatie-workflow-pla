/**
 * pdfFieldMerge.ts
 *
 * Shared merge utility for the PDF extraction pipeline.
 *
 * Provides:
 * - FieldCandidate type with source, confidence, priority
 * - SOURCE_PRIORITY constants (exact_label=300, heading_block=250,
 *   chunk_rule=200, ai=100, appendix_ai=25)
 * - mergeFieldCandidates: deterministic winner selection per field
 * - normalizeCanonicalAddress: strips leading context from address strings
 * - deriveConfidence: maps source + context to confidence tier
 */

// ---------------------------------------------------------------------------
// Types and constants
// ---------------------------------------------------------------------------

export type FieldCandidateSource =
  | 'exact_label'
  | 'heading_block'
  | 'chunk_rule'
  | 'ai'
  | 'appendix_ai'

/** Numeric priority per source type.  Higher wins in a conflict. */
export const SOURCE_PRIORITY: Record<FieldCandidateSource, number> = {
  exact_label:   300,
  heading_block: 250,
  chunk_rule:    200,
  ai:            100,
  appendix_ai:    25,
}

/** Numeric weight for confidence tiers.  Used to break priority ties. */
const CONFIDENCE_SCORE: Record<string, number> = { high: 3, medium: 2, low: 1 }

export interface FieldCandidate {
  field: string
  value: unknown
  source: FieldCandidateSource
  confidence: 'high' | 'medium' | 'low'
  /** Precomputed priority (from SOURCE_PRIORITY).  Must equal SOURCE_PRIORITY[source]. */
  priority: number
  section?: string
  snippet?: string
}

// ---------------------------------------------------------------------------
// SWOT fields — always merged as unique arrays
// ---------------------------------------------------------------------------

const SWOT_FIELDS = new Set([
  'swot_sterktes',
  'swot_zwaktes',
  'swot_kansen',
  'swot_bedreigingen',
])

/** Placeholder strings that represent absence of a value and are treated as meaningless. */
const PLACEHOLDER_VALUES = new Set(['onbekend', '-', 'n.v.t.', 'nvt', 'niet beschikbaar', 'geen'])

/** Returns true when value is meaningful (non-null, non-empty, non-placeholder). */
function isMeaningful(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return isFinite(value)
  if (Array.isArray(value)) {
    return value.some((v) => typeof v === 'string' && v.trim().length > 0)
  }
  if (typeof value === 'string') {
    const t = value.trim().toLowerCase()
    return t.length > 0 && !PLACEHOLDER_VALUES.has(t)
  }
  return false
}

function valueString(v: unknown): string {
  if (Array.isArray(v)) return `[${(v as unknown[]).join(', ')}]`
  return String(v)
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return (value as unknown[])
      .filter((v) => typeof v === 'string' && (v as string).trim())
      .map((v) => String(v).trim())
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

// ---------------------------------------------------------------------------
// mergeFieldCandidates
// ---------------------------------------------------------------------------

/**
 * Merges all candidates into a single winner per field using:
 *
 * 1. Higher priority wins  (exact_label > heading_block > chunk_rule > ai > appendix_ai)
 * 2. Tie → higher confidence wins  (high > medium > low)
 * 3. Tie → non-appendix beats appendix source
 * 4. Tie → existing (first seen) preserved  (stability preference)
 *
 * SWOT fields are always combined as unique arrays regardless of priority.
 *
 * In non-production, logs:
 * - All candidates per field (source, priority, confidence, snippet)
 * - Winner per field with reason
 * - Why each dropped candidate lost
 * - Source distribution summary at end
 */
export function mergeFieldCandidates(
  candidates: FieldCandidate[],
): Record<string, FieldCandidate> {
  const winners: Record<string, FieldCandidate> = {}
  const isNonProd = process.env.NODE_ENV !== 'production'

  // Group by field for ordered processing and logging
  const byField: Record<string, FieldCandidate[]> = {}
  for (const c of candidates) {
    if (!byField[c.field]) byField[c.field] = []
    byField[c.field].push(c)
  }

  for (const [field, fieldCandidates] of Object.entries(byField)) {
    // --- SWOT: combine all arrays regardless of priority ---
    if (SWOT_FIELDS.has(field)) {
      const combined: string[] = []
      for (const c of fieldCandidates) {
        for (const item of toStringArray(c.value)) {
          if (!combined.includes(item)) combined.push(item)
        }
      }
      if (combined.length > 0) {
        const best = fieldCandidates.reduce((a, b) =>
          a.priority >= b.priority ? a : b,
        )
        winners[field] = { ...best, value: combined }
        if (isNonProd) {
          console.log(
            `[mergeFieldCandidates] "${field}" → SWOT combined (${combined.length} items) from ${fieldCandidates.length} candidate(s)`,
          )
        }
      }
      continue
    }

    let winner: FieldCandidate | null = null

    if (isNonProd) {
      console.log(
        `[mergeFieldCandidates] "${field}" — evaluating ${fieldCandidates.length} candidate(s):`,
        fieldCandidates.map((c) => `${c.source}/${c.confidence}(${c.priority})="${valueString(c.value).slice(0, 40)}"`).join(' | '),
      )
    }

    for (const candidate of fieldCandidates) {
      if (!isMeaningful(candidate.value)) {
        if (isNonProd) {
          console.log(
            `[mergeFieldCandidates] "${field}" candidate ${candidate.source}/${candidate.confidence} dropped: non-meaningful value`,
          )
        }
        continue
      }

      if (!winner) {
        winner = candidate
        continue
      }

      // 1. Higher priority wins
      if (candidate.priority > winner.priority) {
        if (isNonProd) {
          console.log(
            `[mergeFieldCandidates] "${field}" → switch: ${candidate.source}(${candidate.priority}) > ${winner.source}(${winner.priority})`,
          )
        }
        winner = candidate
        continue
      }
      if (candidate.priority < winner.priority) {
        if (isNonProd) {
          console.log(
            `[mergeFieldCandidates] "${field}" candidate ${candidate.source}(${candidate.priority}) dropped: lower priority than ${winner.source}(${winner.priority})`,
          )
        }
        continue
      }

      // 2. Same priority → higher confidence wins
      const inC = CONFIDENCE_SCORE[candidate.confidence] ?? 0
      const exC = CONFIDENCE_SCORE[winner.confidence] ?? 0
      if (inC > exC) {
        if (isNonProd) {
          console.log(
            `[mergeFieldCandidates] "${field}" → switch: ${candidate.source}/${candidate.confidence} beats ${winner.source}/${winner.confidence} (confidence)`,
          )
        }
        winner = candidate
        continue
      }
      if (inC < exC) {
        if (isNonProd) {
          console.log(
            `[mergeFieldCandidates] "${field}" candidate ${candidate.source}/${candidate.confidence} dropped: lower confidence`,
          )
        }
        continue
      }

      // 3. Same priority + confidence → non-appendix beats appendix
      if (candidate.source !== 'appendix_ai' && winner.source === 'appendix_ai') {
        if (isNonProd) {
          console.log(
            `[mergeFieldCandidates] "${field}" → switch: non-appendix ${candidate.source} beats appendix winner`,
          )
        }
        winner = candidate
        continue
      }

      // 4. Stability preference: existing wins
      if (isNonProd) {
        console.log(
          `[mergeFieldCandidates] "${field}" candidate ${candidate.source} dropped: equal priority/confidence — existing preserved`,
        )
      }
    }

    if (winner) {
      winners[field] = winner
      if (isNonProd) {
        console.log(
          `[mergeFieldCandidates] "${field}" WINNER: ${winner.source}/${winner.confidence}(${winner.priority}) → "${valueString(winner.value).slice(0, 60)}"`,
        )
      }
    }
  }

  // Source distribution summary
  if (isNonProd) {
    const dist: Record<string, number> = {}
    for (const w of Object.values(winners)) {
      dist[w.source] = (dist[w.source] ?? 0) + 1
    }
    console.log('[mergeFieldCandidates] Source distribution:', dist)
  }

  return winners
}

// ---------------------------------------------------------------------------
// Address normalization
// ---------------------------------------------------------------------------

/**
 * Pattern matching a Dutch street name candidate at the end of a string.
 *
 * Groups explained:
 * - `[A-ZÁÉÍ...]` : first letter is uppercase (street names start with capital)
 * - `[a-záéí\-]+` : rest of first word (lowercase, hyphens allowed)
 * - `(?:\s+[a-záéí\-]+)*` : optional additional lowercase words (e.g. "Collse Hoefdijk")
 * - `(?:\s+\d+[a-z]?)?` : optional house number with letter suffix (e.g. "16" or "16a")
 * - `[,\s]*$` : trailing comma/whitespace separators at end of string
 */
const STREET_CANDIDATE_RE = /([A-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÇ][a-záéíóúàèìòùäëïöüç\-]+(?:\s+[a-záéíóúàèìòùäëïöüç\-]+)*(?:\s+\d+[a-z]?)?)[,\s]*$/

/**
 * Dutch evaluation / quality words that appear as single-word prefixes
 * in extracted address strings and should be stripped.
 */
const EVALUATION_WORD_RE = /^(?:Goed|Redelijk|Matig|Slecht|Voldoende|Onvoldoende|Uitstekend)\s+(?=[A-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÇ])/i

/**
 * Normalizes a raw address string to canonical form:
 *   "Street, Number, PostcodeLetters, Place"
 *
 * Strips leading context fragments that commonly appear before the street name
 * in Dutch taxatie PDF extracts, such as:
 * - "Goed Collse Hoefdijk..."              → evaluation word prefix
 * - "| Eindhoven Collse Hoefdijk..."       → pipe-prefixed city fragment
 * - "Verhuurbare eenheid Collse Hoefdijk..." → noun-phrase prefix
 * - "bij EP-online. Collse Hoefdijk..."    → sentence fragment + period
 *
 * Strategy:
 * 1. Find the Dutch postcode pattern (4 digits + optional space + 2 uppercase).
 * 2. Find the start of the address by locating the capitalized street name
 *    just before the postcode, using a backward search.
 * 3. Strip anything before that street-name start.
 * 4. Strip trailing separators / stray punctuation.
 * 5. If multiple address candidates exist, prefer the shortest clean one
 *    that still contains the postcode pattern.
 *
 * Returns the normalized address, or the original trimmed string if no
 * improvement can be made.
 */
export function normalizeCanonicalAddress(raw: string): string {
  if (!raw) return raw
  const trimmed = raw.trim()

  // 1. Find postcode
  const postcodeRe = /\b(\d{4})\s*([A-Z]{2})\b/
  const postcodeMatch = trimmed.match(postcodeRe)
  if (!postcodeMatch || postcodeMatch.index === undefined) {
    return stripLeadingNoise(trimmed)
  }

  const postcodeIdx = postcodeMatch.index

  // 2. Work backwards from postcode to find street start
  const beforePostcode = trimmed.slice(0, postcodeIdx)

  // The street name starts at the last uppercase-initial word that could be
  // a Dutch street name.  We look for a pattern like "Straatnaam[ HouseNumber],"
  // by scanning backwards from the postcode.
  const streetMatch = beforePostcode.match(STREET_CANDIDATE_RE)
  if (streetMatch && streetMatch.index !== undefined) {
    const streetStart = streetMatch.index
    if (streetStart > 0) {
      // There's a prefix before the street — strip it
      const normalized = trimmed.slice(streetStart).replace(/[,\s|]+$/, '').trim()
      // Sanity check: result must still contain the postcode
      if (postcodeRe.test(normalized)) {
        return normalized
      }
    }
  }

  // 3. Fallback: apply noise-stripping rules
  return stripLeadingNoise(trimmed)
}

/**
 * Strips known leading noise patterns from an address-like string.
 *
 * Handles:
 * - Pipe-prefixed fragments:  "| Eindhoven Collse Hoefdijk..."
 * - Sentence fragments ending in punctuation: "bij EP-online. Collse Hoefdijk..."
 * - Standalone evaluation words: "Goed Collse Hoefdijk..."
 * - Short noun phrases: "Verhuurbare eenheid Collse Hoefdijk..."
 */
function stripLeadingNoise(address: string): string {
  let result = address

  // Strip pipe/bar-prefixed fragment: "| SomeWord " or "│ SomeWord "
  result = result.replace(/^[|│]\s*\S+\s+/, '')

  // Strip sentence fragment ending with period/exclamation before an uppercase word
  result = result.replace(/^[^.!?]+[.!?]\s+(?=[A-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÇ])/, '')

  // Strip standalone evaluation words that are NOT street names
  result = result.replace(EVALUATION_WORD_RE, '')

  // Strip known Dutch real-estate noun phrases before the address
  result = result.replace(
    /^(?:Verhuurbare\s+eenheid|Gebruik\s+mogelijk|Schriftelijke\s+toestemming|bij\s+EP-online)[.,\s]+/i,
    '',
  )

  // Strip trailing separators / stray punctuation
  result = result.replace(/[,\s|]+$/, '').trim()

  return result
}

// ---------------------------------------------------------------------------
// Confidence helper
// ---------------------------------------------------------------------------

/**
 * Returns the appropriate confidence tier for a candidate based on its source
 * and optional match context.
 *
 * - exact_label match in the correct section → 'high'
 * - heading_block text extraction              → 'high'
 * - chunk_rule inference                       → 'medium'
 * - AI inference without exact label           → 'medium'
 * - appendix / reference source               → 'low'
 */
export function deriveConfidence(
  source: FieldCandidateSource,
): 'high' | 'medium' | 'low' {
  switch (source) {
    case 'exact_label':   return 'high'
    case 'heading_block': return 'high'
    case 'chunk_rule':    return 'medium'
    case 'ai':            return 'medium'
    case 'appendix_ai':   return 'low'
  }
}
