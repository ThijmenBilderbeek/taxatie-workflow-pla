/**
 * Confidence-based per-field extractors for Dutch taxatie report PDFs.
 *
 * Confidence levels:
 *   high   – exact label + colon match (e.g. "energielabel: A+")
 *   medium – keyword found near value within ~50 chars
 *   low    – fuzzy / contextual match without clear label
 */

import {
  normalizeDutchDate,
  normalizeEuro,
  normalizePercent,
  normalizeDecimalNumber,
  normalizeArea,
  parseAddress,
  cleanGemeente,
  cleanupLongFieldText,
  compactWhitespace,
  truncateField,
} from './pdfNormalizers'

export interface ExtractionResult<T> {
  value: T
  confidence: 'high' | 'medium' | 'low'
  /** The keyword / label that triggered the match */
  sourceLabel: string
  /** Raw text snippet (up to 80 chars) around the match */
  sourceSnippet: string
  /** Logical section of the PDF where the match was found */
  sourceSection?: string
  /** The parser rule / pattern that produced the match */
  parserRule?: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Tries each label (with implicit colon) and returns the first match together
 * with the raw matched text.  Returns undefined if nothing matches.
 */
function tryExactLabel(
  text: string,
  labels: string[]
): { raw: string; label: string; snippet: string } | undefined {
  const lower = text.toLowerCase()
  for (const label of labels) {
    const needle = label.toLowerCase().endsWith(':') ? label.toLowerCase() : label.toLowerCase() + ':'
    const idx = lower.indexOf(needle)
    if (idx === -1) continue
    const after = text.slice(idx + needle.length).replace(/^[\s]+/, '')
    const line = after.split('\n')[0].trim()
    if (line.length === 0) continue
    const snippet = text.slice(Math.max(0, idx - 10), idx + needle.length + 40).replace(/\s+/g, ' ')
    return { raw: line, label: needle, snippet }
  }
  return undefined
}

/**
 * Tries each keyword (without enforcing colon) and returns the text following
 * the first match.  Used for medium-confidence fallback.
 */
function tryKeyword(
  text: string,
  keywords: string[],
  maxChars = 60
): { raw: string; label: string; snippet: string } | undefined {
  const lower = text.toLowerCase()
  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLowerCase())
    if (idx === -1) continue
    const after = text.slice(idx + kw.length).replace(/^[\s:\-–]+/, '')
    const line = after.slice(0, maxChars).split('\n')[0].trim()
    if (line.length === 0) continue
    const snippet = text.slice(Math.max(0, idx - 10), idx + kw.length + 40).replace(/\s+/g, ' ')
    return { raw: line, label: kw, snippet }
  }
  return undefined
}

/** Section markers that indicate reference / comparable objects in a report. */
const REFERENCE_SECTION_MARKERS = [
  'H.2',
  'H.3',
  'huurreferentie',
  'koopreferentie',
  'referentieobject',
  'vergelijkingsobject',
  'huurref',
  'koopref',
]

/**
 * Maximum character distance (backwards from a match) within which a reference-
 * section marker is still considered to have "opened" a reference section.
 * Typical sections are 1–3 pages = ~2000–4000 chars; 4000 is a safe upper bound.
 */
const MAX_REFERENCE_SECTION_DISTANCE = 4000

/**
 * Returns true when the given character index in `text` falls inside a
 * reference-objects section (e.g. H.2, H.3, koopreferentie, etc.).
 * Used to prevent leakage of values from comparable-object sections into the
 * main-object fields.
 */
function isInReferenceSection(text: string, idx: number): boolean {
  const lower = text.toLowerCase()
  for (const marker of REFERENCE_SECTION_MARKERS) {
    const markerIdx = lower.lastIndexOf(marker.toLowerCase(), idx)
    if (markerIdx === -1) continue
    if (idx - markerIdx < MAX_REFERENCE_SECTION_DISTANCE) return true
  }
  return false
}

/**
 * Like tryExactLabel but skips matches that fall inside a reference section.
 */
function tryExactLabelOutsideRef(
  text: string,
  labels: string[]
): { raw: string; label: string; snippet: string } | undefined {
  const lower = text.toLowerCase()
  for (const label of labels) {
    const needle = label.toLowerCase().endsWith(':') ? label.toLowerCase() : label.toLowerCase() + ':'
    let searchFrom = 0
    while (true) {
      const idx = lower.indexOf(needle, searchFrom)
      if (idx === -1) break
      if (!isInReferenceSection(text, idx)) {
        const after = text.slice(idx + needle.length).replace(/^[\s]+/, '')
        const line = after.split('\n')[0].trim()
        if (line.length > 0) {
          const snippet = text.slice(Math.max(0, idx - 10), idx + needle.length + 40).replace(/\s+/g, ' ')
          return { raw: line, label: needle, snippet }
        }
      }
      searchFrom = idx + 1
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Per-field extractors
// ---------------------------------------------------------------------------

export function extractNaamTaxateur(text: string): ExtractionResult<string> | undefined {
  const exact = tryExactLabel(text, ['uitvoerend taxateur', 'naam taxateur', 'taxateur', 'beëdigd taxateur', 'getaxeerd door'])
  if (exact) {
    const value = exact.raw.slice(0, 80).split('\n')[0].trim()
    return { value, confidence: 'high', sourceLabel: exact.label, sourceSnippet: exact.snippet, sourceSection: 'Stap 1' }
  }
  return undefined
}

export function extractObjectnaam(text: string): ExtractionResult<string> | undefined {
  const exact = tryExactLabel(text, ['objectnaam', 'naam object', 'pand'])
  if (exact) {
    const value = exact.raw.slice(0, 100).split('\n')[0].trim()
    return { value, confidence: 'high', sourceLabel: exact.label, sourceSnippet: exact.snippet, sourceSection: 'Stap 1' }
  }
  return undefined
}

export function extractWaardepeildatum(text: string): ExtractionResult<string> | undefined {
  const DUTCH_MONTH_PAT = 'januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december'
  const dateRe = new RegExp(
    `(?:waardepeildatum|waarde\\s+op|peildatum|getaxeerd\\s+per|getaxeerd\\s+op)[:\\s]+(\\d{1,2}[\\s\\-](?:${DUTCH_MONTH_PAT})[\\s\\-]\\d{4}|\\d{1,2}-\\d{1,2}-\\d{4})`,
    'i'
  )
  const match = text.match(dateRe)
  if (match) {
    const normalized = normalizeDutchDate(match[1])
    if (normalized) {
      const idx = text.toLowerCase().indexOf(match[0].toLowerCase())
      const snippet = text.slice(Math.max(0, idx), idx + match[0].length + 10).replace(/\s+/g, ' ')
      const label = match[0].split(/[\s:]/)[0].toLowerCase()
      return { value: normalized, confidence: 'high', sourceLabel: label + ':', sourceSnippet: snippet, sourceSection: 'Stap 1' }
    }
  }
  return undefined
}

export function extractInspectiedatum(text: string): ExtractionResult<string> | undefined {
  const exact = tryExactLabel(text, ['inspectiedatum', 'datum opname en inspectie', 'datum opname', 'datum inspectie', 'opnamedatum'])
  if (exact) {
    const normalized = normalizeDutchDate(exact.raw.slice(0, 50).split('\n')[0].trim())
    if (normalized) return { value: normalized, confidence: 'high', sourceLabel: exact.label, sourceSnippet: exact.snippet, sourceSection: 'Stap 1' }
  }
  return undefined
}

export function extractGemeente(text: string): ExtractionResult<string> | undefined {
  const exact = tryExactLabel(text, ['gemeente'])
  if (exact) {
    const raw = exact.raw.split('\n')[0].trim()
    const value = cleanGemeente(raw)
    if (value && value.length > 0) {
      return { value, confidence: 'high', sourceLabel: exact.label, sourceSnippet: exact.snippet, sourceSection: 'Stap 2', parserRule: 'cleanGemeente' }
    }
  }
  return undefined
}

export function extractProvincie(text: string): ExtractionResult<string> | undefined {
  const exact = tryExactLabel(text, ['provincie'])
  if (exact) {
    const value = exact.raw.slice(0, 30).split('\n')[0].trim()
    if (value) return { value, confidence: 'high', sourceLabel: exact.label, sourceSnippet: exact.snippet, sourceSection: 'Stap 2' }
  }
  return undefined
}

const LIGGING_ENUM_VALUES = ['bedrijventerrein', 'binnenstad', 'woonwijk', 'buitengebied', 'gemengd'] as const
const LIGGING_QUALITY_VALUES = ['uitstekend', 'goed', 'redelijk', 'matig', 'slecht'] as const
type LiggingEnumValue = typeof LIGGING_ENUM_VALUES[number]

export function extractLigging(text: string): ExtractionResult<string> | undefined {
  const lower = text.toLowerCase()

  // High: explicit ligging label — check quality scores first (only in first line), then enum
  for (const keyword of ['ligging:', 'omschrijving locatie, stand en ligging:', 'ligging object:', 'type ligging:']) {
    const idx = lower.indexOf(keyword)
    if (idx === -1) continue
    // Only search the first line after the label for quality/enum values (avoids false positives from body text)
    const afterLabel = lower.slice(idx + keyword.length).trimStart()
    const firstLine = afterLabel.split('\n')[0].trim()

    // Quality score has higher priority than enum value when found on the label's line
    for (const val of LIGGING_QUALITY_VALUES) {
      if (firstLine.includes(val)) {
        const snippet = text.slice(idx, idx + keyword.length + firstLine.length + 5).replace(/\s+/g, ' ')
        return { value: val, confidence: 'high', sourceLabel: keyword, sourceSnippet: snippet, sourceSection: 'Stap 2', parserRule: 'quality-score' }
      }
    }
    for (const val of LIGGING_ENUM_VALUES) {
      if (firstLine.includes(val)) {
        const snippet = text.slice(idx, idx + keyword.length + firstLine.length + 5).replace(/\s+/g, ' ')
        return { value: val, confidence: 'high', sourceLabel: keyword, sourceSnippet: snippet, sourceSection: 'Stap 2', parserRule: 'enum' }
      }
    }
    // Fallback: also check up to 200 chars after label for quality/enum in multi-line context
    const context = lower.slice(idx, idx + 200)
    for (const val of LIGGING_QUALITY_VALUES) {
      if (context.includes(val)) {
        const snippet = text.slice(idx, idx + 80).replace(/\s+/g, ' ')
        return { value: val, confidence: 'high', sourceLabel: keyword, sourceSnippet: snippet, sourceSection: 'Stap 2', parserRule: 'quality-score-multiline' }
      }
    }
    for (const val of LIGGING_ENUM_VALUES) {
      if (context.includes(val)) {
        const snippet = text.slice(idx, idx + 80).replace(/\s+/g, ' ')
        return { value: val, confidence: 'high', sourceLabel: keyword, sourceSnippet: snippet, sourceSection: 'Stap 2', parserRule: 'enum-multiline' }
      }
    }
  }

  // Medium: contextual – search within 200 chars of "ligging", "locatie", or "omgeving"
  for (const keyword of ['ligging', 'locatie', 'omgeving']) {
    const idx = lower.indexOf(keyword)
    if (idx === -1) continue
    const context = lower.slice(Math.max(0, idx - 20), idx + 200)

    // Quality score preferred over enum even in contextual search
    for (const val of LIGGING_QUALITY_VALUES) {
      if (context.includes(val)) {
        const snippet = text.slice(Math.max(0, idx - 20), idx + 80).replace(/\s+/g, ' ')
        return { value: val, confidence: 'medium', sourceLabel: keyword, sourceSnippet: snippet, sourceSection: 'Stap 2', parserRule: 'quality-score-contextual' }
      }
    }
    for (const val of LIGGING_ENUM_VALUES) {
      if (context.includes(val)) {
        const snippet = text.slice(Math.max(0, idx - 20), idx + 80).replace(/\s+/g, ' ')
        return { value: val, confidence: 'medium', sourceLabel: keyword, sourceSnippet: snippet, sourceSection: 'Stap 2', parserRule: 'enum-contextual' }
      }
    }
  }

  // Low: full-text scan, enum values only (quality scores would be noise here)
  for (const val of LIGGING_ENUM_VALUES) {
    if (lower.includes(val)) {
      return { value: val, confidence: 'low', sourceLabel: '(full-text)', sourceSnippet: val, sourceSection: 'Stap 2', parserRule: 'enum-fulltext' }
    }
  }

  return undefined
}

export function extractBvo(text: string): ExtractionResult<number> | undefined {
  const re = /(?:Totaal\s+BVO(?:\s+m[²2]\s+of\s+stuks)?|BVO|bruto\s+vloeroppervlak|gebruiksoppervlak(?:te)?)[:\s]+([0-9]{1,3}(?:[.,][0-9]{3})*[.,]?[0-9]*)\s*m[²2]?/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (isInReferenceSection(text, match.index)) continue
    const val = normalizeArea(match[1])
    if (val !== undefined) {
      const snippet = text.slice(Math.max(0, match.index), match.index + match[0].length + 10).replace(/\s+/g, ' ')
      const label = match[0].split(/[\s:]/)[0].toLowerCase()
      const confidence = match[0].toLowerCase().startsWith('bvo') ? 'high' : 'medium'
      return { value: val, confidence, sourceLabel: label + ':', sourceSnippet: snippet, sourceSection: 'Stap 3', parserRule: 'bvo-scoped' }
    }
  }
  return undefined
}

export function extractVvo(text: string): ExtractionResult<number> | undefined {
  // Accept "VVO 870", "VVO: 870", "totaal VVO 870", "Totaal VVO m² of stuks: 870"
  const re = /(?:Totaal\s+VVO(?:\s+m[²2]\s+of\s+stuks)?|totaal\s+VVO|VVO|verhuurbaar\s+vloeroppervlak)[\s:]+([0-9]{1,6}[.,]?[0-9]*)\s*(?:m[²2])?/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (isInReferenceSection(text, match.index)) continue
    const val = normalizeArea(match[1])
    if (val !== undefined) {
      const snippet = text.slice(Math.max(0, match.index), match.index + match[0].length + 10).replace(/\s+/g, ' ')
      return { value: val, confidence: 'high', sourceLabel: 'vvo:', sourceSnippet: snippet, sourceSection: 'Stap 3', parserRule: 'vvo-scoped' }
    }
  }
  return undefined
}

export function extractPerceeloppervlak(text: string): ExtractionResult<number> | undefined {
  const re = /(?:Perceeloppervlak(?:te)?|Kaveloppervlak|Kadastrale\s+grootte|Kadastrale\s+oppervlak(?:te)?)[:\s]+([0-9]{1,3}(?:[.,][0-9]{3})*[.,]?[0-9]*)\s*m[²2]?/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (isInReferenceSection(text, match.index)) continue
    const val = normalizeArea(match[1])
    if (val !== undefined) {
      const snippet = text.slice(Math.max(0, match.index), match.index + match[0].length + 10).replace(/\s+/g, ' ')
      const label = match[0].split(/[\s:]/)[0].toLowerCase()
      return { value: val, confidence: 'high', sourceLabel: label + ':', sourceSnippet: snippet, sourceSection: 'Stap 3', parserRule: 'perceel-scoped' }
    }
  }
  return undefined
}

export function extractBouwjaar(text: string): ExtractionResult<number> | undefined {
  const re = /(?:bouwjaar|gebouwd\s+in|jaar\s+van\s+oplevering)[:\s]+([0-9]{4})/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (isInReferenceSection(text, match.index)) continue
    const val = parseInt(match[1], 10)
    const snippet = text.slice(Math.max(0, match.index), match.index + match[0].length + 10).replace(/\s+/g, ' ')
    const confidence = match[0].toLowerCase().startsWith('bouwjaar') ? 'high' : 'medium'
    return { value: val, confidence, sourceLabel: match[0].split(/[\s:]/)[0].toLowerCase() + ':', sourceSnippet: snippet, sourceSection: 'Stap 3', parserRule: 'bouwjaar-scoped' }
  }
  return undefined
}

export function extractRenovatiejaar(text: string): ExtractionResult<number> | undefined {
  // Skip if context says no renovation happened
  const lower = text.toLowerCase()
  const noRenovation = /geen\s+aanzienlijke\s+wijzigingen|geen\s+renovatie|niet\s+gerenoveerd/.test(lower)

  const re = /(?:renovatiejaar|gerenoveerd\s+in|meest\s+recente\s+renovatie|jaar\s+renovatie|laatst\s+gerenoveerd)[:\s]+([0-9]{4})/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const idx = match.index
    // Skip matches in reference / comparables sections
    if (isInReferenceSection(text, idx)) continue
    // Skip if context (100 chars before match) contains reference-section words
    const contextBefore = lower.slice(Math.max(0, idx - 150), idx)
    if (/referentie|vergelijkingsobject|koopreferentie|huurreferentie/.test(contextBefore)) continue
    // Skip if earlier in the document we found explicit "no renovation" language
    if (noRenovation) continue
    const val = parseInt(match[1], 10)
    const snippet = text.slice(Math.max(0, idx), idx + match[0].length + 10).replace(/\s+/g, ' ')
    const label = match[0].split(/[\s:]/)[0].toLowerCase()
    return { value: val, confidence: 'high', sourceLabel: label + ':', sourceSnippet: snippet, sourceSection: 'Stap 3', parserRule: 'renovatiejaar-scoped' }
  }
  return undefined
}

export function extractMarkthuur(text: string): ExtractionResult<number> | undefined {
  const re = /(?:Markt\/herz\.\s*huur|markthuur(?:waarde|prijs)?|marktconforme\s+huur)[:\s|]+(?:€\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/i
  const match = text.match(re)
  if (match) {
    const val = normalizeEuro(match[1])
    if (val !== undefined) {
      const idx = text.indexOf(match[0])
      const snippet = text.slice(Math.max(0, idx), idx + match[0].length + 10).replace(/\s+/g, ' ')
      const label = match[0].split(/[\s:]/)[0].toLowerCase()
      return { value: val, confidence: 'high', sourceLabel: label + ':', sourceSnippet: snippet, sourceSection: 'Stap 4' }
    }
  }
  return undefined
}

export function extractEigendomssituatie(text: string): ExtractionResult<string> | undefined {
  const exact = tryExactLabel(text, ['eigendomssituatie', 'eigendomsvorm', 'eigendom', 'type eigendom', 'te taxeren belang'])
  if (exact) {
    let value = exact.raw.split('\n')[0].trim()
    // Truncate at known unrelated-field stop-words (Bug 9)
    const stopIdx = value.search(/perceeloppervlak|energielabel|bvo|vvo|kadastrale|oppervlak/i)
    if (stopIdx !== -1) value = value.slice(0, stopIdx).replace(/[,;:\s]+$/, '').trim()
    // Enforce max length of 80 chars
    if (value.length > 80) value = truncateField(value, 80)
    if (value) return { value, confidence: 'high', sourceLabel: exact.label, sourceSnippet: exact.snippet, sourceSection: 'Stap 5', parserRule: 'eigendomssituatie-stop-words' }
  }
  return undefined
}

export function extractMarktwaarde(text: string): ExtractionResult<number> | undefined {
  // Prefer non-rounded value over rounded one, and skip reference sections
  const re = /(?:marktwaarde\s+kosten\s+koper|marktwaarde\s+k[.\s]?k[.]?|marktwaarde)[:\s]+(?:€\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/gi
  let exactVal: number | undefined
  let roundedVal: number | undefined
  let exactSnippet = ''
  let roundedSnippet = ''
  let exactLabel = ''
  let roundedLabel = ''
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (isInReferenceSection(text, match.index)) continue
    const val = normalizeEuro(match[1])
    if (val === undefined) continue
    const snippet = text.slice(Math.max(0, match.index), match.index + match[0].length + 10).replace(/\s+/g, ' ')
    const label = match[0].split(/[\s:]/)[0].toLowerCase()
    if (val % 1000 !== 0) {
      if (exactVal === undefined) { exactVal = val; exactSnippet = snippet; exactLabel = label }
    } else {
      if (roundedVal === undefined) { roundedVal = val; roundedSnippet = snippet; roundedLabel = label }
    }
  }
  const finalVal = exactVal ?? roundedVal
  if (finalVal !== undefined) {
    const snippet = exactVal !== undefined ? exactSnippet : roundedSnippet
    const label = exactVal !== undefined ? exactLabel : roundedLabel
    return { value: finalVal, confidence: 'high', sourceLabel: label + ':', sourceSnippet: snippet, sourceSection: 'Stap 8', parserRule: exactVal !== undefined ? 'marktwaarde-exact' : 'marktwaarde-rounded' }
  }
  // Low: bare euro amount fallback (outside reference section)
  const euroRe = /€\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{1,2})?)\b/g
  let euroMatch: RegExpExecArray | null
  while ((euroMatch = euroRe.exec(text)) !== null) {
    if (isInReferenceSection(text, euroMatch.index)) continue
    const val = normalizeEuro(euroMatch[1])
    if (val !== undefined) {
      const snippet = text.slice(Math.max(0, euroMatch.index - 20), euroMatch.index + euroMatch[0].length + 10).replace(/\s+/g, ' ')
      return { value: val, confidence: 'low', sourceLabel: '(euro)', sourceSnippet: snippet, sourceSection: 'Stap 8', parserRule: 'marktwaarde-fallback' }
    }
  }
  return undefined
}

export function extractBar(text: string): ExtractionResult<number> | undefined {
  const re = /\bBAR\b[^:\n]{0,40}?:\s*([0-9]{1,2}[.,][0-9]{1,2})\s*%?/i
  const match = text.match(re)
  if (match) {
    const val = normalizePercent(match[1])
    if (val !== undefined) {
      const idx = text.indexOf(match[0])
      const snippet = text.slice(Math.max(0, idx), idx + match[0].length + 10).replace(/\s+/g, ' ')
      return { value: val, confidence: 'high', sourceLabel: 'bar:', sourceSnippet: snippet, sourceSection: 'Stap 8' }
    }
  }
  return undefined
}

export function extractNar(text: string): ExtractionResult<number> | undefined {
  // Pattern 1: "NAR ..." with colon and value (handles "NAR % von: 6,75 %")
  const re1 = /\bNAR\b[^:\n]{0,40}?:\s*([0-9]{1,2}[.,][0-9]{1,2})\s*%?/i
  const m1 = text.match(re1)
  if (m1) {
    const val = normalizePercent(m1[1])
    if (val !== undefined) {
      const idx = text.indexOf(m1[0])
      const snippet = text.slice(Math.max(0, idx), idx + m1[0].length + 10).replace(/\s+/g, ' ')
      return { value: val, confidence: 'high', sourceLabel: 'nar:', sourceSnippet: snippet, sourceSection: 'Stap 8', parserRule: 'nar-label' }
    }
  }
  // Pattern 2: "netto aanvangsrendement: 6,75%"
  const re2 = /netto\s+aanvangsrendement[:\s]+([0-9]{1,2}[.,][0-9]{1,2})\s*%?/i
  const m2 = text.match(re2)
  if (m2) {
    const val = normalizePercent(m2[1])
    if (val !== undefined) {
      const idx = text.indexOf(m2[0])
      const snippet = text.slice(Math.max(0, idx), idx + m2[0].length + 10).replace(/\s+/g, ' ')
      return { value: val, confidence: 'high', sourceLabel: 'netto aanvangsrendement:', sourceSnippet: snippet, sourceSection: 'Stap 8', parserRule: 'nar-long-label' }
    }
  }
  return undefined
}

export function extractKapitalisatiefactor(text: string): ExtractionResult<number> | undefined {
  // Matches: "kapitalisatiefactor: 12,30", "kap. factor: 12,30", "kap.factor: 12,30",
  //          "Kap. factor von 13,4" (German-style "von" in Dutch IPD reports)
  const re = /(?:kapitalisatiefactor|kap\.?\s*factor)[:\s|]+(?:von\s+)?([0-9]{1,2}[.,][0-9]{1,2})/i
  const match = text.match(re)
  if (match) {
    const val = normalizeDecimalNumber(match[1])
    if (val !== undefined) {
      const idx = text.indexOf(match[0])
      const snippet = text.slice(Math.max(0, idx), idx + match[0].length + 10).replace(/\s+/g, ' ')
      const label = match[0].split(/[\s:|]/)[0].toLowerCase()
      return { value: val, confidence: 'high', sourceLabel: label + ':', sourceSnippet: snippet, sourceSection: 'Stap 8', parserRule: 'kap-factor-label' }
    }
  }
  return undefined
}

export function extractEnergielabel(text: string): ExtractionResult<string> | undefined {
  const lower = text.toLowerCase()
  const labels = ['energielabel', 'energieklasse']
  for (const label of labels) {
    const needle = label + ':'
    let searchFrom = 0
    while (true) {
      const idx = lower.indexOf(needle, searchFrom)
      if (idx === -1) break
      // Skip matches in reference sections
      if (isInReferenceSection(text, idx)) {
        searchFrom = idx + 1
        continue
      }
      const after = text.slice(idx + needle.length).replace(/^[\s]+/, '')
      const raw = after.trim().slice(0, 20).split('\n')[0].trim()
      const rawLower = raw.toLowerCase()
      const snippet = text.slice(Math.max(0, idx - 10), idx + needle.length + 40).replace(/\s+/g, ' ')
      const INVALID = ['geen', '-', 'n.v.t.', 'nvt', 'niet beschikbaar', 'onbekend', 'niet']
      if (INVALID.some((v) => rawLower === v || rawLower.startsWith(v))) {
        return { value: 'geen', confidence: 'medium', sourceLabel: needle, sourceSnippet: snippet, sourceSection: 'Stap 7', parserRule: 'energielabel-geen' }
      }
      const labelMatch = raw.match(/^([A-G][+]{0,4})/i)
      if (labelMatch) {
        return { value: labelMatch[1].toUpperCase(), confidence: 'high', sourceLabel: needle, sourceSnippet: snippet, sourceSection: 'Stap 7', parserRule: 'energielabel-exact' }
      }
      break
    }
  }
  return undefined
}

export function extractTypeObject(text: string): ExtractionResult<string> | undefined {
  const PHYSICAL_TYPES: { keyword: string; value: string }[] = [
    { keyword: 'bedrijfscomplex', value: 'bedrijfscomplex' },
    { keyword: 'bedrijfshal', value: 'bedrijfshal' },
    { keyword: 'kantoorgebouw', value: 'kantoor' },
    { keyword: 'kantoor', value: 'kantoor' },
    { keyword: 'winkel', value: 'winkel' },
    { keyword: 'appartement', value: 'appartement' },
    { keyword: 'woning', value: 'woning' },
  ]

  // Priority 1: IPD-type labels (highest confidence, used in IPD/RICS-formatted reports)
  // Skip reference sections (Bug 22-23)
  const ipdExact = tryExactLabelOutsideRef(text, ['ipd-type', 'ipd type', 'type vastgoed', 'type object', 'soort object', 'object type'])
  if (ipdExact) {
    const lower = ipdExact.raw.toLowerCase()
    // "eigen gebruik" is a gebruiksdoel, never a physical type — skip it
    if (/eigen\s+gebruik/.test(lower)) return undefined
    for (const { keyword, value } of PHYSICAL_TYPES) {
      if (lower.includes(keyword)) {
        return { value, confidence: 'high', sourceLabel: ipdExact.label, sourceSnippet: ipdExact.snippet, sourceSection: 'Stap 1', parserRule: 'ipd-label' }
      }
    }
  }

  // Priority 2: "het object betreft een ..." / "betreft een kantoor(gebouw)"
  // Scan all matches and skip reference sections
  const betrefRe = /\bbetreft\s+een\s+(kantoorgebouw|kantoor|bedrijfshal|bedrijfscomplex|winkel|woning|appartement)\b/gi
  let betrefMatch: RegExpExecArray | null
  while ((betrefMatch = betrefRe.exec(text)) !== null) {
    if (isInReferenceSection(text, betrefMatch.index)) continue
    const lower = betrefMatch[1].toLowerCase()
    for (const { keyword, value } of PHYSICAL_TYPES) {
      if (lower.includes(keyword)) {
        const snippet = text.slice(Math.max(0, betrefMatch.index - 10), betrefMatch.index + betrefMatch[0].length + 20).replace(/\s+/g, ' ')
        return { value, confidence: 'high', sourceLabel: 'betreft een', sourceSnippet: snippet, sourceSection: 'Stap 1', parserRule: 'betreft-een' }
      }
    }
  }

  // Priority 3: keyword in full text (medium confidence), skip reference sections
  const lower = text.toLowerCase()
  for (const { keyword, value } of PHYSICAL_TYPES) {
    let kwIdx = 0
    while (true) {
      const idx = lower.indexOf(keyword, kwIdx)
      if (idx === -1) break
      if (!isInReferenceSection(text, idx)) {
        const snippet = text.slice(Math.max(0, idx - 10), idx + keyword.length + 20).replace(/\s+/g, ' ')
        return { value, confidence: 'medium', sourceLabel: keyword, sourceSnippet: snippet, sourceSection: 'Stap 1', parserRule: 'fulltext-keyword' }
      }
      kwIdx = idx + 1
    }
  }
  return undefined
}

export function extractGebruiksdoel(text: string): ExtractionResult<string> | undefined {
  const DOELEN: { keyword: string; value: string }[] = [
    { keyword: 'eigenaar-gebruiker', value: 'eigenaar_gebruiker' },
    { keyword: 'eigenaar gebruiker', value: 'eigenaar_gebruiker' },
    { keyword: 'eigen gebruik', value: 'eigenaar_gebruiker' },
    { keyword: 'belegging', value: 'verhuurd_belegging' },
    { keyword: 'verhuurd', value: 'verhuurd_belegging' },
    { keyword: 'leegstand', value: 'leegstand' },
  ]

  const exact = tryExactLabel(text, ['gebruiksdoel', 'type eigendom', 'gebruik', 'type gebruik'])
  if (exact) {
    const lower = exact.raw.toLowerCase()
    for (const { keyword, value } of DOELEN) {
      if (lower.includes(keyword)) {
        return { value, confidence: 'high', sourceLabel: exact.label, sourceSnippet: exact.snippet, sourceSection: 'Stap 1' }
      }
    }
  }

  const lower = text.toLowerCase()
  for (const { keyword, value } of DOELEN) {
    if (lower.includes(keyword)) {
      const idx = lower.indexOf(keyword)
      const snippet = text.slice(Math.max(0, idx - 10), idx + keyword.length + 20).replace(/\s+/g, ' ')
      return { value, confidence: 'medium', sourceLabel: keyword, sourceSnippet: snippet, sourceSection: 'Stap 1' }
    }
  }
  return undefined
}

export function extractAdres(text: string): ExtractionResult<ReturnType<typeof parseAddress>> | undefined {
  const result = parseAddress(text)
  if (!result) return undefined
  const hasPostcode = !!result.postcode
  const hasStraat = !!result.straat && !!result.huisnummer
  const confidence = hasPostcode && hasStraat ? 'high' : hasPostcode ? 'medium' : 'low'
  const snippet = `${result.straat} ${result.huisnummer}, ${result.postcode} ${result.plaats}`.trim()
  return { value: result, confidence, sourceLabel: '(address-parse)', sourceSnippet: snippet, sourceSection: 'Stap 2' }
}

// ---------------------------------------------------------------------------
// Bug 4 — Bereikbaarheid extractor
// ---------------------------------------------------------------------------

export function extractBereikbaarheid(text: string): ExtractionResult<string> | undefined {
  const exact = tryExactLabel(text, [
    'toelichting bereikbaarheid',
    'bereikbaarheid',
    'ontsluiting',
    'infrastructuur',
    'ov-verbinding',
  ])
  if (exact) {
    const value = cleanupLongFieldText(compactWhitespace(exact.raw.slice(0, 300)), 250)
    if (value && value.length > 2) {
      return { value, confidence: 'high', sourceLabel: exact.label, sourceSnippet: exact.snippet, sourceSection: 'Stap 2', parserRule: 'bereikbaarheid-label' }
    }
  }
  // Keyword fallback for contextual mentions
  const kw = tryKeyword(text, ['openbaar vervoer', 'snelweg'], 150)
  if (kw) {
    const value = cleanupLongFieldText(compactWhitespace(kw.raw.slice(0, 300)), 250)
    if (value && value.length > 2) {
      return { value, confidence: 'medium', sourceLabel: kw.label, sourceSnippet: kw.snippet, sourceSection: 'Stap 2', parserRule: 'bereikbaarheid-keyword' }
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Bug 11 — Zakelijke rechten extractor
// ---------------------------------------------------------------------------

export function extractZakelijkeRechten(text: string): ExtractionResult<string> | undefined {
  const exact = tryExactLabel(text, [
    'zakelijke rechten',
    'zakelijkerechten',
    'zakelijk recht',
    'opstalrecht',
    'recht van opstal',
    'recht van overpad',
    'erfdienstbaarheid',
    'belemmeringenwet',
  ])
  if (exact) {
    const value = cleanupLongFieldText(compactWhitespace(exact.raw.slice(0, 300)), 300)
    if (value && value.length > 2) {
      return { value, confidence: 'high', sourceLabel: exact.label, sourceSnippet: exact.snippet, sourceSection: 'Stap 5', parserRule: 'zakelijkerechten-label' }
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Bug 14 — Asbest extractor
// ---------------------------------------------------------------------------

export function extractAsbest(text: string): ExtractionResult<'ja' | 'nee' | 'onbekend'> | undefined {
  const lower = text.toLowerCase()
  const asbestIdx = lower.indexOf('asbest')
  if (asbestIdx === -1) return undefined

  const contextBefore = lower.slice(Math.max(0, asbestIdx - 60), asbestIdx)
  const context = contextBefore + lower.slice(asbestIdx, asbestIdx + 200)
  const snippet = text.slice(Math.max(0, asbestIdx - 10), asbestIdx + 80).replace(/\s+/g, ' ')

  // Skip if this occurrence is purely in a soil/environmental context
  const isSoilContext = /bodem|grond|verontreiniging|milieu|omgeving/.test(contextBefore)
  if (isSoilContext) return undefined

  // "geen asbest aangetroffen" / "asbestinventarisatie uitgevoerd, geen asbest" → nee
  if (/geen\s+asbest\s+aangetroffen|geen\s+asbest|asbestvrij|niet\s+aanwezig|niet\s+vastgesteld|vrij\s+van\s+asbest|niet\s+bekend\s+met\s+asbesthoudende/.test(context)) {
    return { value: 'nee', confidence: 'high', sourceLabel: 'asbest', sourceSnippet: snippet, sourceSection: 'Stap 7', parserRule: 'asbest-nee' }
  }
  // "asbest aanwezig" / "asbest aangetroffen" → ja
  if (/asbest\s+aanwezig|asbest\s+aangetroffen|asbesthoudend\s+materiaal\s+aanwezig/.test(context)) {
    return { value: 'ja', confidence: 'high', sourceLabel: 'asbest', sourceSnippet: snippet, sourceSection: 'Stap 7', parserRule: 'asbest-ja' }
  }
  // "asbest niet onderzocht" / "asbestonderzoek: nee" → onbekend
  if (/niet\s+onderzocht|asbestonderzoek[:\s]+nee|nader\s+onderzoek/.test(context)) {
    return { value: 'onbekend', confidence: 'medium', sourceLabel: 'asbest', sourceSnippet: snippet, sourceSection: 'Stap 7', parserRule: 'asbest-onbekend' }
  }

  return { value: 'onbekend', confidence: 'low', sourceLabel: 'asbest', sourceSnippet: snippet, sourceSection: 'Stap 7', parserRule: 'asbest-fallback' }
}

// ---------------------------------------------------------------------------
// Bug 15 — Bodemverontreiniging extractor
// ---------------------------------------------------------------------------

export function extractBodemverontreiniging(text: string): ExtractionResult<'ja' | 'nee' | 'onbekend'> | undefined {
  const lower = text.toLowerCase()

  let bodemIdx = lower.indexOf('bodemverontreiniging')
  if (bodemIdx === -1) {
    const infoIdx = lower.indexOf('bodeminformatie')
    if (infoIdx !== -1) bodemIdx = infoIdx
  }
  if (bodemIdx === -1) bodemIdx = lower.indexOf('bodemkwaliteit')
  if (bodemIdx === -1) return undefined

  const bodemContext = lower.slice(bodemIdx, bodemIdx + 400)
  const snippet = text.slice(bodemIdx, bodemIdx + 80).replace(/\s+/g, ' ')

  // Check NEGATIVE patterns FIRST — these override positive matches
  if (
    /niet\s+geregistreerd\s+als\s+mogelijk\s+verontreinigd|geen\s+informatie\s+bekend\s+die\s+duidt\s+op\s+bodemverontreiniging|geen\s+visuele\s+waarnemingen|geen\s+aanwijzingen\s+voor\s+bodemverontreiniging|geen\s+verontreiniging/.test(bodemContext) ||
    bodemContext.includes('niet aanwezig') ||
    bodemContext.includes('schoon') ||
    /\bnee\b/.test(bodemContext)
  ) {
    return { value: 'nee', confidence: 'high', sourceLabel: 'bodem', sourceSnippet: snippet, sourceSection: 'Stap 7', parserRule: 'bodem-nee' }
  }
  if (bodemContext.includes('verontreinigd') || bodemContext.includes('sanering nodig') || bodemContext.includes('vervuild')) {
    return { value: 'ja', confidence: 'high', sourceLabel: 'bodem', sourceSnippet: snippet, sourceSection: 'Stap 7', parserRule: 'bodem-ja' }
  }
  if (bodemContext.includes('aanwezig') && !bodemContext.includes('niet aanwezig')) {
    return { value: 'ja', confidence: 'medium', sourceLabel: 'bodem', sourceSnippet: snippet, sourceSection: 'Stap 7', parserRule: 'bodem-aanwezig' }
  }
  if (bodemContext.includes('onbekend') || bodemContext.includes('niet onderzocht')) {
    return { value: 'onbekend', confidence: 'medium', sourceLabel: 'bodem', sourceSnippet: snippet, sourceSection: 'Stap 7', parserRule: 'bodem-onbekend' }
  }
  // Only section header found with no verdict → leave undefined (not auto-set to 'ja')
  return undefined
}

// ---------------------------------------------------------------------------
// Master function
// ---------------------------------------------------------------------------

export type ExtractionDebugRecord = Record<
  string,
  {
    value: unknown
    confidence: 'high' | 'medium' | 'low'
    sourceLabel: string
    sourceSnippet: string
    sourceSection?: string
  }
>

/**
 * Extracts all known fields from raw PDF text and returns them with
 * confidence scores for use in the preview dialog.
 */
export function extractAllFieldsWithConfidence(text: string): ExtractionDebugRecord {
  const debug: ExtractionDebugRecord = {}

  const add = <T>(key: string, result: ExtractionResult<T> | undefined) => {
    if (result !== undefined) {
      debug[key] = result
    }
  }

  add('objectnaam', extractObjectnaam(text))
  add('naamTaxateur', extractNaamTaxateur(text))
  add('typeObject', extractTypeObject(text))
  add('gebruiksdoel', extractGebruiksdoel(text))
  add('waardepeildatum', extractWaardepeildatum(text))
  add('inspectiedatum', extractInspectiedatum(text))
  add('adres', extractAdres(text))
  add('gemeente', extractGemeente(text))
  add('provincie', extractProvincie(text))
  add('ligging', extractLigging(text))
  add('bereikbaarheid', extractBereikbaarheid(text))
  add('bvo', extractBvo(text))
  add('vvo', extractVvo(text))
  add('perceeloppervlak', extractPerceeloppervlak(text))
  add('bouwjaar', extractBouwjaar(text))
  add('renovatiejaar', extractRenovatiejaar(text))
  add('markthuurPerJaar', extractMarkthuur(text))
  add('eigendomssituatie', extractEigendomssituatie(text))
  add('zakelijkeRechten', extractZakelijkeRechten(text))
  add('asbest', extractAsbest(text))
  add('bodemverontreiniging', extractBodemverontreiniging(text))
  add('energielabel', extractEnergielabel(text))
  add('marktwaarde', extractMarktwaarde(text))
  add('bar', extractBar(text))
  add('nar', extractNar(text))
  add('kapitalisatiefactor', extractKapitalisatiefactor(text))

  if (import.meta.env.DEV) {
    console.debug('[pdfFieldExtractors] extractAllFieldsWithConfidence', debug)
  }

  return debug
}
