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
