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
    const value = exact.raw.slice(0, 50).split('\n')[0].trim()
    if (value && !/omgevingsplan|bestemmingsplan|raadsbesluit/i.test(value)) {
      return { value, confidence: 'high', sourceLabel: exact.label, sourceSnippet: exact.snippet, sourceSection: 'Stap 2' }
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

const LIGGING_VALUES = ['bedrijventerrein', 'binnenstad', 'woonwijk', 'buitengebied', 'gemengd'] as const
type LiggingValue = typeof LIGGING_VALUES[number]

export function extractLigging(text: string): ExtractionResult<LiggingValue> | undefined {
  const lower = text.toLowerCase()

  // High: explicit ligging label within 200 chars
  for (const keyword of ['ligging:', 'ligging object:', 'type ligging:']) {
    const idx = lower.indexOf(keyword)
    if (idx === -1) continue
    const context = lower.slice(idx, idx + 200)
    for (const val of LIGGING_VALUES) {
      if (context.includes(val)) {
        const snippet = text.slice(idx, idx + 80).replace(/\s+/g, ' ')
        return { value: val, confidence: 'high', sourceLabel: keyword, sourceSnippet: snippet, sourceSection: 'Stap 2' }
      }
    }
  }

  // Medium: contextual – search within 200 chars of "ligging", "locatie", or "omgeving"
  for (const keyword of ['ligging', 'locatie', 'omgeving']) {
    const idx = lower.indexOf(keyword)
    if (idx === -1) continue
    const context = lower.slice(Math.max(0, idx - 20), idx + 200)
    for (const val of LIGGING_VALUES) {
      if (context.includes(val)) {
        const snippet = text.slice(Math.max(0, idx - 20), idx + 80).replace(/\s+/g, ' ')
        return { value: val, confidence: 'medium', sourceLabel: keyword, sourceSnippet: snippet, sourceSection: 'Stap 2' }
      }
    }
  }

  // Low: full-text scan, prioritize specific over generic
  for (const val of LIGGING_VALUES) {
    if (lower.includes(val)) {
      return { value: val, confidence: 'low', sourceLabel: '(full-text)', sourceSnippet: val, sourceSection: 'Stap 2' }
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
  const re = /(?:Totaal\s+VVO(?:\s+m[²2]\s+of\s+stuks)?|VVO|verhuurbaar\s+vloeroppervlak)[:\s]+([0-9]{1,3}(?:[.,][0-9]{3})*[.,]?[0-9]*)\s*m[²2]?/i
  const match = text.match(re)
  if (match) {
    const val = normalizeArea(match[1])
    if (val !== undefined) {
      const idx = text.indexOf(match[0])
      const snippet = text.slice(Math.max(0, idx), idx + match[0].length + 10).replace(/\s+/g, ' ')
      return { value: val, confidence: 'high', sourceLabel: 'vvo:', sourceSnippet: snippet, sourceSection: 'Stap 3' }
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
  const re = /(?:renovatiejaar|gerenoveerd\s+in|meest\s+recente\s+renovatie|jaar\s+renovatie|laatst\s+gerenoveerd)[:\s]+([0-9]{4})/i
  const match = text.match(re)
  if (match) {
    const val = parseInt(match[1], 10)
    const idx = text.indexOf(match[0])
    const snippet = text.slice(Math.max(0, idx), idx + match[0].length + 10).replace(/\s+/g, ' ')
    const label = match[0].split(/[\s:]/)[0].toLowerCase()
    return { value: val, confidence: 'high', sourceLabel: label + ':', sourceSnippet: snippet, sourceSection: 'Stap 3' }
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
  const re = /\bNAR\b[^:\n]{0,40}?:\s*([0-9]{1,2}[.,][0-9]{1,2})\s*%?/i
  const match = text.match(re)
  if (match) {
    const val = normalizePercent(match[1])
    if (val !== undefined) {
      const idx = text.indexOf(match[0])
      const snippet = text.slice(Math.max(0, idx), idx + match[0].length + 10).replace(/\s+/g, ' ')
      return { value: val, confidence: 'high', sourceLabel: 'nar:', sourceSnippet: snippet, sourceSection: 'Stap 8' }
    }
  }
  return undefined
}

export function extractKapitalisatiefactor(text: string): ExtractionResult<number> | undefined {
  const re = /(?:kapitalisatiefactor|kap\.?\s*factor)[:\s|]+([0-9]{1,2}[.,][0-9]{1,2})/i
  const match = text.match(re)
  if (match) {
    const val = normalizeDecimalNumber(match[1])
    if (val !== undefined) {
      const idx = text.indexOf(match[0])
      const snippet = text.slice(Math.max(0, idx), idx + match[0].length + 10).replace(/\s+/g, ' ')
      const label = match[0].split(/[\s:|]/)[0].toLowerCase()
      return { value: val, confidence: 'high', sourceLabel: label + ':', sourceSnippet: snippet, sourceSection: 'Stap 8' }
    }
  }
  return undefined
}

export function extractEnergielabel(text: string): ExtractionResult<string> | undefined {
  const exact = tryExactLabel(text, ['energielabel', 'energieklasse'])
  if (exact) {
    const raw = exact.raw.trim().slice(0, 20).split('\n')[0].trim()
    const lower = raw.toLowerCase()
    const INVALID = ['geen', '-', 'n.v.t.', 'nvt', 'niet beschikbaar', 'onbekend', 'niet']
    if (INVALID.some((v) => lower === v || lower.startsWith(v))) {
      // Known "geen" value – medium confidence so the UI can show it
      return { value: 'geen', confidence: 'medium', sourceLabel: exact.label, sourceSnippet: exact.snippet, sourceSection: 'Stap 7' }
    }
    const labelMatch = raw.match(/^([A-G][+]{0,4})/i)
    if (labelMatch) {
      return { value: labelMatch[1].toUpperCase(), confidence: 'high', sourceLabel: exact.label, sourceSnippet: exact.snippet, sourceSection: 'Stap 7' }
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

  // Try explicit label first → high
  const exact = tryExactLabel(text, ['type vastgoed', 'type object', 'soort object', 'object type'])
  if (exact) {
    const lower = exact.raw.toLowerCase()
    for (const { keyword, value } of PHYSICAL_TYPES) {
      if (lower.includes(keyword) && keyword !== 'eigen gebruik') {
        return { value, confidence: 'high', sourceLabel: exact.label, sourceSnippet: exact.snippet, sourceSection: 'Stap 1' }
      }
    }
  }

  // Keyword in full text → medium
  const lower = text.toLowerCase()
  for (const { keyword, value } of PHYSICAL_TYPES) {
    if (lower.includes(keyword)) {
      const idx = lower.indexOf(keyword)
      const snippet = text.slice(Math.max(0, idx - 10), idx + keyword.length + 20).replace(/\s+/g, ' ')
      return { value, confidence: 'medium', sourceLabel: keyword, sourceSnippet: snippet, sourceSection: 'Stap 1' }
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
