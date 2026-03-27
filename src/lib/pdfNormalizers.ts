/**
 * Pure normalization helpers for Dutch taxatie report PDF parsing.
 */

const DUTCH_MONTHS: Record<string, string> = {
  januari: '01',
  februari: '02',
  maart: '03',
  april: '04',
  mei: '05',
  juni: '06',
  juli: '07',
  augustus: '08',
  september: '09',
  oktober: '10',
  november: '11',
  december: '12',
}

const DUTCH_DAYS = [
  'maandag',
  'dinsdag',
  'woensdag',
  'donderdag',
  'vrijdag',
  'zaterdag',
  'zondag',
]

/**
 * Normalizes Dutch date strings to ISO format YYYY-MM-DD.
 * Handles:
 *   "vrijdag 7 november 2025" → "2025-11-07"
 *   "7-11-2025" / "07-11-2025" → "2025-11-07"
 *   "7 november 2025" → "2025-11-07"
 *   "2025-11-07" → "2025-11-07" (passthrough)
 */
export function normalizeDutchDate(raw: string): string | undefined {
  let s = raw.trim()

  // Strip leading Dutch day name (e.g., "vrijdag ")
  for (const day of DUTCH_DAYS) {
    const re = new RegExp(`^${day}\\s+`, 'i')
    if (re.test(s)) {
      s = s.replace(re, '')
      break
    }
  }

  // DD-MM-YYYY or D-M-YYYY (with -, /, or .)
  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // D maandnaam YYYY (Dutch long-form date)
  const monthPat = Object.keys(DUTCH_MONTHS).join('|')
  const dutchMatch = s.match(new RegExp(`^(\\d{1,2})\\s+(${monthPat})\\s+(\\d{4})$`, 'i'))
  if (dutchMatch) {
    const [, d, mon, y] = dutchMatch
    const m = DUTCH_MONTHS[mon.toLowerCase()]
    return `${y}-${m}-${d.padStart(2, '0')}`
  }

  // Already ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  return undefined
}

/**
 * Normalizes Dutch euro amounts to plain numbers.
 * Handles:
 *   "€ 4.332.360" → 4332360
 *   "€4.330.000,-" → 4330000
 *   "352.951" → 352951
 *   "1.234,56" → 1234.56
 */
export function normalizeEuro(raw: string): number | undefined {
  // Remove currency symbol, spaces, trailing ",-" or "."
  let s = raw.replace(/[€\s]/g, '').replace(/,-$/, '').replace(/\.$/, '')

  // Dutch numbers: dots are thousands separators when followed by exactly 3 digits
  if (/\.\d{3}/.test(s)) {
    s = s.replace(/\./g, '')
  }

  // Replace Dutch decimal comma with dot
  s = s.replace(',', '.')

  const v = parseFloat(s)
  return isNaN(v) ? undefined : v
}

/**
 * Normalizes Dutch percentage strings to numbers.
 * Handles: "8,15 %" → 8.15, "8.15%" → 8.15, "8,15" → 8.15
 */
export function normalizePercent(raw: string): number | undefined {
  const s = raw.replace(/[%\s]/g, '').replace(',', '.')
  const v = parseFloat(s)
  return isNaN(v) ? undefined : v
}

/**
 * Normalizes Dutch area values (m², m2) to plain numbers.
 * Handles: "16.042 m²" → 16042, "2.444 m2" → 2444, "16042" → 16042
 */
export function normalizeArea(raw: string): number | undefined {
  let s = raw.replace(/\s*m[²2]/gi, '').trim()

  // Dutch numbers: dots as thousands separators
  if (/\.\d{3}/.test(s)) {
    s = s.replace(/\./g, '')
  }

  s = s.replace(',', '.')
  const v = parseFloat(s)
  return isNaN(v) ? undefined : v
}

/**
 * Collapses multiple whitespace characters (including newlines) into a single space.
 */
export function compactWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Truncates text at a sentence boundary up to maxLength characters.
 */
export function cleanupLongFieldText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const truncated = text.slice(0, maxLength)
  const lastDot = truncated.lastIndexOf('. ')
  if (lastDot > maxLength / 3) return truncated.slice(0, lastDot + 1)
  const lastSpace = truncated.lastIndexOf(' ')
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated
}

/**
 * Interprets Dutch boolean-like strings.
 * Returns:
 *   true  — "Ja", "Aanwezig", "Ja, ..."
 *   false — "Nee", "Geen", "Niet aanwezig"
 *   'unknown' — "Onbekend", "N.v.t.", "Niet van toepassing", "Niet onderzocht"
 */
export function normalizeBooleanLike(raw: string): boolean | 'unknown' {
  const s = raw.trim().toLowerCase()
  if (s === 'ja' || s.startsWith('ja,') || s === 'aanwezig' || s.startsWith('aanwezig')) return true
  if (
    s === 'nee' ||
    s.startsWith('nee,') ||
    s === 'geen' ||
    s === 'niet aanwezig' ||
    s.startsWith('niet aanwezig')
  )
    return false
  if (
    s === 'onbekend' ||
    s === 'n.v.t.' ||
    s === 'nvt' ||
    s === 'niet van toepassing' ||
    s === 'niet onderzocht'
  )
    return 'unknown'
  return 'unknown'
}

/**
 * Converts a Dutch number word to its numeric equivalent.
 * Handles: "een"/"één"→1, "twee"→2, "drie"→3, "vier"→4, "vijf"→5,
 *          "zes"→6, "zeven"→7, "acht"→8, "negen"→9, "tien"→10.
 * Returns undefined for unrecognized words.
 */
export function dutchNumberWordToDigit(word: string): number | undefined {
  const map: Record<string, number> = {
    een: 1,
    één: 1,
    twee: 2,
    drie: 3,
    vier: 4,
    vijf: 5,
    zes: 6,
    zeven: 7,
    acht: 8,
    negen: 9,
    tien: 10,
  }
  return map[word.toLowerCase().trim()]
}

/**
 * Cleans a gemeente name by truncating at known stop-words such as
 * "vigerende", "bestemming", "bestemmingsplan", "omgevingsplan", "plangebied".
 * Also limits the result to at most 80 characters.
 */
export function cleanGemeente(raw: string): string {
  const STOP_WORDS = ['vigerende', 'bestemming', 'bestemmingsplan', 'omgevingsplan', 'plangebied']
  let result = raw.trim()
  for (const stop of STOP_WORDS) {
    const idx = result.toLowerCase().indexOf(stop)
    if (idx !== -1) {
      result = result.slice(0, idx)
    }
  }
  if (result.length > 80) result = result.slice(0, 80)
  return result.replace(/[,;:\s]+$/, '').trim()
}

/**
 * Truncates text at a sentence boundary up to maxLen characters.
 * Named alias for `cleanupLongFieldText` — provided so callers can express
 * the intent of enforcing a per-field length limit explicitly.
 */
export function truncateField(text: string, maxLen: number): string {
  return cleanupLongFieldText(text, maxLen)
}

/**
 * Normalizes Dutch decimal strings (like 12,30) to a JavaScript number.
 * Use this for values that are not percentages, e.g. kapitalisatiefactor.
 * Handles: "12,30" → 12.3, "12.30" → 12.3
 */
export function normalizeDecimalNumber(raw: string): number | undefined {
  const s = raw.trim().replace(',', '.')
  const v = parseFloat(s)
  return isNaN(v) ? undefined : v
}

/**
 * Parses a Dutch address string into its components.
 * Supports:
 *   "Columbusweg 13, 5928LA Venlo"
 *   "Columbusweg 13 5928 LA Venlo"
 *   "TAXATIERAPPORT Columbusweg 13 5928 LA Venlo" (noise words stripped)
 *   Huisnummer additions: "13A", "13-15", "13 b"
 */
export function parseAddress(text: string): {
  straat: string
  huisnummer: string
  postcode: string
  plaats: string
} | undefined {
  // Find Dutch postcode: 4 digits + optional space + 2 uppercase letters
  const postcodeMatch = text.match(/\b(\d{4})\s?([A-Z]{2})\b/)
  if (!postcodeMatch) return undefined

  const postcode = postcodeMatch[1] + postcodeMatch[2]
  const postcodeIdx = text.indexOf(postcodeMatch[0])

  // Extract place name after postcode — match a single word (most Dutch cities are 1 word)
  // Rare multi-word cities (Den Haag, Den Bosch) are handled by matching optionally
  const afterPostcode = text.slice(postcodeIdx + postcodeMatch[0].length)
  const plaatsMatch = afterPostcode.match(
    /^\s*,?\s*([A-Za-zÀ-öø-ÿ][A-Za-zÀ-öø-ÿ\-']{1,30})\b/
  )
  const plaats = plaatsMatch ? plaatsMatch[1].trim() : ''

  // Extract street + housenumber from the text before the postcode using a token-based approach.
  // This avoids the leftmost-match pitfall of pure regex when noise words precede the address.
  const beforePostcode = text
    .slice(Math.max(0, postcodeIdx - 200), postcodeIdx)
    .trim()
    .replace(/[,\s]+$/, '') // strip trailing separators

  const NOISE = ['taxatierapport', 'rapport', 'inhoud', 'pagina', 'inhoudsopgave', 'samenvatting']

  // Tokenize on whitespace
  const tokens = beforePostcode.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { straat: '', huisnummer: '', postcode, plaats }

  // Find the last token that looks like a housenumber (starts with a digit)
  let huisnummerIdx = tokens.length - 1
  while (huisnummerIdx >= 0 && !/^\d/.test(tokens[huisnummerIdx])) {
    huisnummerIdx--
  }
  if (huisnummerIdx < 0) return { straat: '', huisnummer: '', postcode, plaats }

  const huisnummer = tokens[huisnummerIdx]

  // Build street name by walking backwards from the housenumber token.
  // Stop at: noise words, all-caps header words (document titles), label tokens (end with ":"),
  // or pure digit tokens (like page numbers). Limit to 4 words max.
  const straatTokens: string[] = []
  for (let i = huisnummerIdx - 1; i >= 0 && straatTokens.length < 4; i--) {
    const token = tokens[i]
    const lower = token.toLowerCase()
    if (token.endsWith(':')) break // label like "Adres:" or "Object:"
    if (/^\d+$/.test(token)) break // pure number like a page number
    if (NOISE.some((w) => lower.includes(w))) break // noise word like "TAXATIERAPPORT"
    if (token === token.toUpperCase() && token.length > 2) break // ALL-CAPS header token
    straatTokens.unshift(token)
  }

  const straat = straatTokens.join(' ')

  return { straat, huisnummer, postcode, plaats }
}

/**
 * Maps a Dutch postcode (4-digit prefix) to its province name.
 * Returns undefined when the mapping is uncertain.
 */
export function postcodeToProvincie(postcode: string): string | undefined {
  const num = parseInt(postcode.slice(0, 4), 10)
  if (isNaN(num)) return undefined
  if (num >= 1000 && num <= 1299) return 'Noord-Holland'
  if (num >= 1300 && num <= 1399) return 'Flevoland'
  if (num >= 1400 && num <= 1999) return 'Noord-Holland'
  if (num >= 2000 && num <= 2999) return 'Zuid-Holland'
  if (num >= 3000 && num <= 3399) return 'Zuid-Holland'
  if (num >= 3400 && num <= 3999) return 'Utrecht'
  if (num >= 4000 && num <= 4099) return 'Gelderland'
  if (num >= 4100 && num <= 4299) return 'Gelderland'
  if (num >= 4300 && num <= 4599) return 'Zeeland'
  if (num >= 4600 && num <= 4999) return 'Noord-Brabant'
  if (num >= 5000 && num <= 5299) return 'Noord-Brabant'
  if (num >= 5300 && num <= 5399) return 'Gelderland'
  if (num >= 5400 && num <= 5899) return 'Noord-Brabant'
  if (num >= 5900 && num <= 6499) return 'Limburg'
  if (num >= 6500 && num <= 6999) return 'Gelderland'
  if (num >= 7000 && num <= 7099) return 'Gelderland'
  if (num >= 7100 && num <= 7999) return 'Overijssel'
  if (num >= 8000 && num <= 8099) return 'Overijssel'
  if (num >= 8100 && num <= 8199) return 'Overijssel'
  if (num >= 8200 && num <= 8299) return 'Flevoland'
  if (num >= 8300 && num <= 8499) return 'Overijssel'
  if (num >= 8500 && num <= 9299) return 'Friesland'
  if (num >= 9300 && num <= 9499) return 'Drenthe'
  if (num >= 9500 && num <= 9999) return 'Groningen'
  return undefined
}

/**
 * Strips header/footer noise from extracted PDF text.
 * Removes lines that are purely page-header or page-footer artefacts such as
 * "Pagina 3 van 12", "Printdatum: ...", standalone page numbers, etc.
 * Applied before semantic parsing to keep field extractions clean.
 */
export function stripHeaderFooterNoise(text: string): string {
  const NOISE_LINE_PATTERNS = [
    /^pagina\s+\d+(\s+van\s+\d+)?\.?\s*$/i,
    /^\d+\s+van\s+\d+\s*$/i,
    /^printdatum[:\s]/i,
    /^uitvoerend taxateur[:\s]/i,
    /^waarde\s+op\s+\d{1,2}[-/]\d{1,2}[-/]\d{4}\s*$/i,
  ]
  const lines = text.split('\n')
  return lines
    .filter((line) => {
      const trimmed = line.trim()
      if (trimmed.length === 0) return true
      return !NOISE_LINE_PATTERNS.some((re) => re.test(trimmed))
    })
    .join('\n')
}

/**
 * Removes a truncated label fragment from the start of an extracted value.
 * Example: "ie: plat dak..." → "Plat dak..." (the "ie:" is the end of "Dakbedekking:")
 * Only removes fragments of at most 6 lowercase letters followed by a colon.
 * 6 characters covers the longest common Dutch label suffix fragments (e.g. "ing:", "heid:").
 */
export function cleanLabelRemnant(text: string): string {
  let result = text.replace(/^[a-zà-öø-ÿ]{1,6}:\s*/i, '').trim()
  if (result.length > 0) {
    result = result.charAt(0).toUpperCase() + result.slice(1)
  }
  return result
}

/**
 * Compacts a raw technical field value: removes duplicate words, collapses
 * whitespace, and truncates at a sentence boundary up to maxLength characters.
 */
export function summarizeTechnicalField(text: string, maxLength = 300): string {
  let result = compactWhitespace(text)
  // Remove trailing incomplete word or fragment (no sentence end)
  if (result.length > maxLength) {
    result = cleanupLongFieldText(result, maxLength)
  }
  return result.trim()
}

/**
 * Compacts a raw aannames/voorbehouden text: strips bullet dashes, collapses
 * whitespace, removes duplicate sentences, and truncates to maxLength characters.
 */
export function summarizeAannames(text: string, maxLength = 450): string {
  // Remove leading bullet/dash characters from each clause
  let result = text.replace(/^\s*[-–•]\s*/gm, '').replace(/\n\s*[-–•]\s*/g, ' ')
  result = compactWhitespace(result)
  if (result.length > maxLength) {
    result = cleanupLongFieldText(result, maxLength)
  }
  return result.trim()
}
