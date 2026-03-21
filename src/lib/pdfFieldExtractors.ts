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
  const re = /(?:Totaal\s+BVO(?:\s+m[²2]\s+of\s+stuks)?|BVO|bruto\s+vloeroppervlak|gebruiksoppervlak(?:te)?)[:\s]+([0-9]{1,3}(?:[.,][0-9]{3})*[.,]?[0-9]*)\s*m[²2]?/i
  const match = text.match(re)
  if (match) {
    const val = normalizeArea(match[1])
    if (val !== undefined) {
      const idx = text.indexOf(match[0])
      const snippet = text.slice(Math.max(0, idx), idx + match[0].length + 10).replace(/\s+/g, ' ')
      const label = match[0].split(/[\s:]/)[0].toLowerCase()
      const confidence = match[0].toLowerCase().startsWith('bvo') ? 'high' : 'medium'
      return { value: val, confidence, sourceLabel: label + ':', sourceSnippet: snippet, sourceSection: 'Stap 3' }
    }
  }
  return undefined
}

export function extractVvo(text: string): ExtractionResult<number> | undefined {
  // Accept "VVO 870", "VVO: 870", "totaal VVO 870", "Totaal VVO m² of stuks: 870"
  const re = /(?:Totaal\s+VVO(?:\s+m[²2]\s+of\s+stuks)?|totaal\s+VVO|VVO|verhuurbaar\s+vloeroppervlak)[\s:]+([0-9]{1,6}[.,]?[0-9]*)\s*(?:m[²2])?/i
  const match = text.match(re)
  if (match) {
    const val = normalizeArea(match[1])
    if (val !== undefined) {
      const idx = text.indexOf(match[0])
      const snippet = text.slice(Math.max(0, idx), idx + match[0].length + 10).replace(/\s+/g, ' ')
      return { value: val, confidence: 'high', sourceLabel: 'vvo:', sourceSnippet: snippet, sourceSection: 'Stap 3', parserRule: 'vvo-regex' }
    }
  }
  return undefined
}

export function extractPerceeloppervlak(text: string): ExtractionResult<number> | undefined {
  const re = /(?:Perceeloppervlak(?:te)?|Kaveloppervlak|Kadastrale\s+grootte|Kadastrale\s+oppervlak(?:te)?)[:\s]+([0-9]{1,3}(?:[.,][0-9]{3})*[.,]?[0-9]*)\s*m[²2]?/i
  const match = text.match(re)
  if (match) {
    const val = normalizeArea(match[1])
    if (val !== undefined) {
      const idx = text.indexOf(match[0])
      const snippet = text.slice(Math.max(0, idx), idx + match[0].length + 10).replace(/\s+/g, ' ')
      const label = match[0].split(/[\s:]/)[0].toLowerCase()
      return { value: val, confidence: 'high', sourceLabel: label + ':', sourceSnippet: snippet, sourceSection: 'Stap 3' }
    }
  }
  return undefined
}

export function extractBouwjaar(text: string): ExtractionResult<number> | undefined {
  const re = /(?:bouwjaar|gebouwd\s+in|jaar\s+van\s+oplevering)[:\s]+([0-9]{4})/i
  const match = text.match(re)
  if (match) {
    const val = parseInt(match[1], 10)
    const idx = text.indexOf(match[0])
    const snippet = text.slice(Math.max(0, idx), idx + match[0].length + 10).replace(/\s+/g, ' ')
    const confidence = match[0].toLowerCase().startsWith('bouwjaar') ? 'high' : 'medium'
    return { value: val, confidence, sourceLabel: match[0].split(/[\s:]/)[0].toLowerCase() + ':', sourceSnippet: snippet, sourceSection: 'Stap 3' }
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
    const value = exact.raw.slice(0, 80).split('\n')[0].trim()
    if (value) return { value, confidence: 'high', sourceLabel: exact.label, sourceSnippet: exact.snippet, sourceSection: 'Stap 5' }
  }
  return undefined
}

export function extractMarktwaarde(text: string): ExtractionResult<number> | undefined {
  // Prefer extended label synonyms
  const re = /(?:marktwaarde\s+kosten\s+koper|marktwaarde\s+k[.\s]?k[.]?|marktwaarde)[:\s]+(?:€\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/i
  const match = text.match(re)
  if (match) {
    const val = normalizeEuro(match[1])
    if (val !== undefined) {
      const idx = text.indexOf(match[0])
      const snippet = text.slice(Math.max(0, idx), idx + match[0].length + 10).replace(/\s+/g, ' ')
      const label = match[0].split(/[\s:]/)[0].toLowerCase()
      return { value: val, confidence: 'high', sourceLabel: label + ':', sourceSnippet: snippet, sourceSection: 'Stap 8' }
    }
  }
  // Medium: bare euro amount fallback
  const euroMatch = text.match(/€\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{1,2})?)\b/)
  if (euroMatch) {
    const val = normalizeEuro(euroMatch[1])
    if (val !== undefined) {
      const idx = text.indexOf(euroMatch[0])
      const snippet = text.slice(Math.max(0, idx - 20), idx + euroMatch[0].length + 10).replace(/\s+/g, ' ')
      return { value: val, confidence: 'low', sourceLabel: '(euro)', sourceSnippet: snippet, sourceSection: 'Stap 8' }
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
  const ipdExact = tryExactLabel(text, ['ipd-type', 'ipd type', 'type vastgoed', 'type object', 'soort object', 'object type'])
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
  const betrefMatch = text.match(/\bbetreft\s+een\s+(kantoorgebouw|kantoor|bedrijfshal|bedrijfscomplex|winkel|woning|appartement)\b/i)
  if (betrefMatch) {
    const lower = betrefMatch[1].toLowerCase()
    for (const { keyword, value } of PHYSICAL_TYPES) {
      if (lower.includes(keyword)) {
        const idx = text.toLowerCase().indexOf(betrefMatch[0].toLowerCase())
        const snippet = text.slice(Math.max(0, idx - 10), idx + betrefMatch[0].length + 20).replace(/\s+/g, ' ')
        return { value, confidence: 'high', sourceLabel: 'betreft een', sourceSnippet: snippet, sourceSection: 'Stap 1', parserRule: 'betreft-een' }
      }
    }
  }

  // Priority 3: keyword in full text (medium confidence)
  const lower = text.toLowerCase()
  for (const { keyword, value } of PHYSICAL_TYPES) {
    const idx = lower.indexOf(keyword)
    if (idx === -1) continue
    const snippet = text.slice(Math.max(0, idx - 10), idx + keyword.length + 20).replace(/\s+/g, ' ')
    return { value, confidence: 'medium', sourceLabel: keyword, sourceSnippet: snippet, sourceSection: 'Stap 1', parserRule: 'fulltext-keyword' }
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
  add('bvo', extractBvo(text))
  add('vvo', extractVvo(text))
  add('perceeloppervlak', extractPerceeloppervlak(text))
  add('bouwjaar', extractBouwjaar(text))
  add('renovatiejaar', extractRenovatiejaar(text))
  add('markthuurPerJaar', extractMarkthuur(text))
  add('eigendomssituatie', extractEigendomssituatie(text))
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
