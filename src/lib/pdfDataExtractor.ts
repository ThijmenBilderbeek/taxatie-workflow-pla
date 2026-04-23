/**
 * pdfDataExtractor.ts
 *
 * Extracts structured data from raw Dutch real-estate appraisal PDF text.
 * Handles section detection, field mapping, SWOT parsing, and value
 * normalisation for the common taxatie-rapport format.
 */

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ExtractedData {
  marktwaarde_kk_afgerond: number | null
  markthuur: number | null
  netto_huurwaarde: number | null
  marktwaarde_per_m2: number | null
  vloeroppervlak_bvo: number | null
  vloeroppervlak_vvo: number | null
  locatie_score: string | null
  object_score: string | null
  courantheid_verhuur: string | null
  courantheid_verkoop: string | null
  verhuurtijd_maanden: number | null
  verkooptijd_maanden: number | null
  energielabel: string | null
  constructie: string | null
  terrein: string | null
  voorzieningen: string | null
  omgeving_en_belendingen: string | null
  swot_sterktes: string[]
  swot_zwaktes: string[]
  swot_kansen: string[]
  swot_bedreigingen: string[]
}

// ---------------------------------------------------------------------------
// Helper: logExtractionResult
// ---------------------------------------------------------------------------

/**
 * Logs the input text length and the extracted JSON for debugging purposes.
 * Intended for use in test/debug environments.
 */
export function logExtractionResult(text: string, result: ExtractedData): void {
  console.log('[logExtractionResult] Input text length:', text.length)
  console.log('[logExtractionResult] Extracted JSON:', JSON.stringify(result, null, 2))
}

// ---------------------------------------------------------------------------
// Helper: parseCurrency
// ---------------------------------------------------------------------------

/**
 * Parses a Dutch-formatted currency string (e.g. "€ 1.325.000 k.k.") to a
 * plain integer.  Dutch notation uses dots as thousand-separators and an
 * optional comma as decimal separator.
 *
 * Examples:
 *   "€ 1.325.000" → 1325000
 *   "€ 98.885"    → 98885
 *   "€ 1.522"     → 1522
 *   "1325000"     → 1325000
 */
export function parseCurrency(value: string | null | undefined): number | null {
  if (!value) return null
  // Remove currency symbol, "k.k.", "v.o.n.", trailing/leading whitespace
  let clean = value.replace(/€/g, '').replace(/k\.k\./gi, '').replace(/v\.o\.n\./gi, '').trim()
  return parseDutchNumber(clean)
}

// ---------------------------------------------------------------------------
// Helper: parseNumber
// ---------------------------------------------------------------------------

/**
 * Parses a Dutch-formatted number string to a number.
 * Handles "6 maand(en)", "957 m²", "1.325.000", "98,5" etc.
 */
export function parseNumber(value: string | null | undefined): number | null {
  if (!value) return null
  // Strip trailing units (m², maand(en), etc.)
  const clean = value.replace(/\s*(m[²2]|maand(?:en)?|\(maanden?\))/gi, '').trim()
  return parseDutchNumber(clean)
}

// ---------------------------------------------------------------------------
// Internal: parseDutchNumber
// ---------------------------------------------------------------------------

/**
 * Core Dutch number parser.  Distinguishes thousand-separators (dots) from
 * decimal separators (commas or a single dot when it is the only separator).
 */
function parseDutchNumber(raw: string): number | null {
  if (!raw) return null
  // Remove any remaining non-numeric characters except . , - +
  let s = raw.replace(/[^\d.,\-+]/g, '').trim()
  if (!s) return null

  const dotCount = (s.match(/\./g) ?? []).length
  const commaCount = (s.match(/,/g) ?? []).length

  if (dotCount > 1) {
    // Multiple dots → all are thousand-separators (Dutch: 1.325.000)
    s = s.replace(/\./g, '')
    // A trailing comma would be a decimal separator
    s = s.replace(',', '.')
  } else if (dotCount === 1 && commaCount === 1) {
    // Both present: comma is decimal (e.g. "1.234,56")
    s = s.replace('.', '').replace(',', '.')
  } else if (dotCount === 0 && commaCount === 1) {
    // Only comma → decimal separator (e.g. "8,15")
    s = s.replace(',', '.')
  } else if (dotCount === 1 && commaCount === 0) {
    // Single dot – could be thousand-sep (1.000) or decimal (1.5)
    const parts = s.split('.')
    if (parts[1]?.length === 3) {
      // Likely thousand-separator (e.g. "1.522" or "1.000")
      s = s.replace('.', '')
    }
    // else treat as decimal (already fine)
  }

  const n = Number(s)
  return isNaN(n) ? null : n
}

// ---------------------------------------------------------------------------
// Helper: extractSections
// ---------------------------------------------------------------------------

/**
 * Splits the raw text into named sections based on top-level and sub-section
 * headings used in Dutch taxatie-rapporten.
 *
 * Recognised patterns:
 *   • "C SWOT-ANALYSE EN BEOORDELING"  (single uppercase letter + words)
 *   • "C.1 SWOT ANALYSE"               (letter + digit sub-section)
 *   • "E.2 LOCATIE INFORMATIE"
 *
 * Normalisation applied before matching:
 *   • Non-breaking spaces (U+00A0) and other Unicode spaces are converted to
 *     regular ASCII spaces so the regex reliably detects headings from PDFs
 *     that use non-standard whitespace.
 */
export function extractSections(text: string): Record<string, string> {
  // Normalise Unicode whitespace (NBSP U+00A0, narrow NBSP U+202F, thin-space U+2009,
  // em-space U+2003, soft-hyphen U+00AD) to regular ASCII space.
  // This ensures the heading regex fires reliably on production PDFs.
  const normalised = text.replace(/[\u00A0\u202F\u2003\u2009\u00AD]+/g, ' ')

  // Match headings of the form:
  //   [A-Z](\.\d+)? <space(s)> UPPERCASE-WORDS-OR-DIGITS
  // The heading name character class deliberately excludes \n/\r so the regex
  // does not accidentally span multiple lines on documents where lines may run
  // together (e.g. after y-position-based reconstruction).
  // Digits (0-9) are included to handle headings like "SWOT-ANALYSE C.2 BEOORDELING".
  // Allow optional surrounding whitespace / line-ends.
  const sectionRegex =
    /(?:^|\n)[ \t]*([A-Z]\d*(?:\.\d+)?[ \t]+[A-Z][A-Z0-9 \t\-–/()]+?)[ \t]*(?:\r?\n|$)/g

  const sections: Record<string, string> = {}
  const matches: Array<{ name: string; startContent: number }> = []

  let m: RegExpExecArray | null
  while ((m = sectionRegex.exec(normalised)) !== null) {
    const name = m[1].trim().replace(/[ \t]+/g, ' ')
    // startContent: right after the heading line
    const startContent = m.index + m[0].length
    matches.push({ name, startContent })
  }

  console.log(`[extractSections] Detected ${matches.length} heading(s): ${matches.map((x) => `"${x.name}"`).join(', ')}`)

  for (let i = 0; i < matches.length; i++) {
    const { name, startContent } = matches[i]
    // The end of this section's content is just before the next heading.
    // We subtract `name.length + 2` to account for the heading text itself
    // and the surrounding newline characters captured by the regex group.
    const endContent = i + 1 < matches.length
      ? matches[i + 1].startContent - matches[i + 1].name.length - 2
      : normalised.length
    const content = normalised.slice(startContent, Math.max(startContent, endContent)).trim()
    // Keep only the first occurrence of a section name (in case of duplicates)
    if (!(name in sections)) {
      sections[name] = content
    }
  }

  return sections
}

// ---------------------------------------------------------------------------
// Helper: extractField
// ---------------------------------------------------------------------------

/**
 * Extracts the value for a given label from a section string.
 *
 * Handles:
 *   - Value on the same line:  "Locatiescore: Goed"
 *   - Value on the next line:  "Locatiescore:\n  Goed"
 *   - Extra whitespace / PDF line-wrapping artefacts
 */
export function extractField(section: string, label: string): string | null {
  // Escape special regex chars in label
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Match label (case-insensitive), optional colon/space, then value either
  // on the same line or on the very next non-empty line.
  const regex = new RegExp(
    `${escaped}[:\\s]*([^\\n]+)(?:\\n[ \\t]*([^\\n]+))?`,
    'i',
  )
  const match = section.match(regex)
  if (!match) return null

  const sameLine = match[1]?.trim()
  const nextLine = match[2]?.trim()

  // If the same-line value is empty (only colon/whitespace), use next line
  if (!sameLine || sameLine === ':') {
    return nextLine ?? null
  }

  // Remove trailing label-like patterns (e.g. "Goed\nVolgende Label:")
  return sameLine.replace(/\s*:.*$/, '').trim() || nextLine || null
}

// ---------------------------------------------------------------------------
// Helper: extractFreeText
// ---------------------------------------------------------------------------

/**
 * Extracts a free-text block under a sub-heading (e.g. "Constructie:").
 * Continues until the next known heading/label or a blank double-newline.
 */
export function extractFreeText(section: string, subHeading: string): string | null {
  const escaped = subHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Match the sub-heading then capture everything up to:
  //   • next heading-like line (Word followed by colon, or uppercase-only line)
  //   • two consecutive newlines (paragraph break)
  //   • end of string
  const regex = new RegExp(
    `${escaped}[:\\s]*([\\s\\S]+?)(?=\\n[ \\t]*[A-Z][^\\n]*:|\\n{2,}|$)`,
    'i',
  )
  const match = section.match(regex)
  if (!match) return null
  return match[1].trim() || null
}

// ---------------------------------------------------------------------------
// Helper: extractBullets
// ---------------------------------------------------------------------------

/** All SWOT heading names, lower-cased, used to build stop-regex patterns. */
const SWOT_HEADING_NAMES = ['sterktes', 'zwaktes', 'kansen', 'bedreigingen']

/**
 * Collects bullet-point lines under a SWOT heading.
 * Bullets use "-" (or "*") in Dutch taxatie-rapporten.
 * Stops at the next SWOT heading (Sterktes/Zwaktes/Kansen/Bedreigingen) or
 * end of section.
 */
function extractBullets(section: string, heading: string): string[] {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const otherHeadings = SWOT_HEADING_NAMES.filter((h) => h !== heading.toLowerCase())

  // Find where the heading starts
  const headingRegex = new RegExp(`${escaped}[:\\s]*`, 'i')
  const headingMatch = section.match(headingRegex)
  if (!headingMatch || headingMatch.index === undefined) return []

  const afterHeading = section.slice(headingMatch.index + headingMatch[0].length)

  // Find where the next SWOT heading starts (stop there)
  const nextHeadingRegex = new RegExp(
    `(?:^|\\n)[ \\t]*(?:${otherHeadings.join('|')})[:\\s]`,
    'i',
  )
  const nextMatch = afterHeading.match(nextHeadingRegex)
  const block = nextMatch?.index !== undefined ? afterHeading.slice(0, nextMatch.index) : afterHeading

  const bullets: string[] = []
  for (const line of block.split('\n')) {
    const stripped = line.trim()
    // Accept lines starting with "-", "*", "•", or "–"
    const bulletMatch = stripped.match(/^[-*•–]\s+(.+)/)
    if (bulletMatch) {
      bullets.push(bulletMatch[1].trim())
    }
  }
  return bullets
}

// ---------------------------------------------------------------------------
// Helper: extractSWOT
// ---------------------------------------------------------------------------

/**
 * Parses the SWOT section into four arrays of bullet-point strings.
 */
export function extractSWOT(section: string): {
  sterktes: string[]
  zwaktes: string[]
  kansen: string[]
  bedreigingen: string[]
} {
  return {
    sterktes: extractBullets(section, 'Sterktes'),
    zwaktes: extractBullets(section, 'Zwaktes'),
    kansen: extractBullets(section, 'Kansen'),
    bedreigingen: extractBullets(section, 'Bedreigingen'),
  }
}

// ---------------------------------------------------------------------------
// Helper: fallback scalar extraction
// ---------------------------------------------------------------------------

/**
 * Attempts to extract a scalar field directly from the full document text
 * when section-based extraction yielded null.
 */
function fallbackExtractField(fullText: string, label: string): string | null {
  return extractField(fullText, label)
}

// ---------------------------------------------------------------------------
// Main: extractPdfData
// ---------------------------------------------------------------------------

/**
 * Extracts structured data from raw Dutch taxatie-rapport PDF text.
 *
 * The function is intentionally lenient: if a value is clearly present it
 * will be filled, and only truly missing values result in null / [].
 */
export function extractPdfData(text: string): ExtractedData {
  const result: ExtractedData = {
    marktwaarde_kk_afgerond: null,
    markthuur: null,
    netto_huurwaarde: null,
    marktwaarde_per_m2: null,
    vloeroppervlak_bvo: null,
    vloeroppervlak_vvo: null,
    locatie_score: null,
    object_score: null,
    courantheid_verhuur: null,
    courantheid_verkoop: null,
    verhuurtijd_maanden: null,
    verkooptijd_maanden: null,
    energielabel: null,
    constructie: null,
    terrein: null,
    voorzieningen: null,
    omgeving_en_belendingen: null,
    swot_sterktes: [],
    swot_zwaktes: [],
    swot_kansen: [],
    swot_bedreigingen: [],
  }

  const sections = extractSections(text)

  if (process.env.NODE_ENV !== 'production') {
    console.log('[extractPdfData] Detected sections:', Object.keys(sections))
  }

  // -------------------------------------------------------------------------
  // Process each detected section
  // -------------------------------------------------------------------------
  for (const [sectionName, sectionContent] of Object.entries(sections)) {
    const nameLower = sectionName.toLowerCase()

    if (process.env.NODE_ENV !== 'production') {
      const fieldNames = sectionContent
        .split('\n')
        .filter((l) => /^[A-Z]/.test(l.trim()) && l.includes(':'))
        .map((l) => l.trim().split(':')[0])
      console.log(`[extractPdfData] Section "${sectionName}" — fields found:`, fieldNames)
    }

    // -----------------------------------------------------------------------
    // C / C.x — SWOT-ANALYSE EN BEOORDELING
    // -----------------------------------------------------------------------
    if (/^C\b/.test(sectionName) || nameLower.includes('swot') || nameLower.includes('beoordeling')) {
      // SWOT bullets
      const swot = extractSWOT(sectionContent)
      if (swot.sterktes.length) result.swot_sterktes = swot.sterktes
      if (swot.zwaktes.length) result.swot_zwaktes = swot.zwaktes
      if (swot.kansen.length) result.swot_kansen = swot.kansen
      if (swot.bedreigingen.length) result.swot_bedreigingen = swot.bedreigingen

      // Courantheid / verhuurtijd fields are often in the same section
      result.courantheid_verhuur ??= extractField(sectionContent, 'Courantheid verhuur')
      result.courantheid_verkoop ??= extractField(sectionContent, 'Courantheid verkoop')
      result.verhuurtijd_maanden ??= parseNumber(extractField(sectionContent, 'Verhuurtijd (maanden)'))
      result.verkooptijd_maanden ??= parseNumber(extractField(sectionContent, 'Verkooptijd (maanden)'))
    }

    // -----------------------------------------------------------------------
    // E / E.x — LOCATIE
    // -----------------------------------------------------------------------
    if (/^E\b/.test(sectionName) || nameLower.includes('locatie')) {
      result.locatie_score ??= extractField(sectionContent, 'Locatiescore')
        ?? extractField(sectionContent, 'Locatie score')
      result.omgeving_en_belendingen ??= extractFreeText(sectionContent, 'Omgeving en belendingen')
      result.voorzieningen ??= extractFreeText(sectionContent, 'Voorzieningen')
    }

    // -----------------------------------------------------------------------
    // F / F.x — OBJECT
    // -----------------------------------------------------------------------
    if (/^F\b/.test(sectionName) || nameLower.includes('object')) {
      result.object_score ??= extractField(sectionContent, 'Object score')
        ?? extractField(sectionContent, 'Objectscore')
      result.constructie ??= extractFreeText(sectionContent, 'Constructie')
      result.terrein ??= extractFreeText(sectionContent, 'Terrein')
    }

    // -----------------------------------------------------------------------
    // H / H.x — ONDERBOUWING
    // -----------------------------------------------------------------------
    if (/^H\b/.test(sectionName) || nameLower.includes('onderbouwing')) {
      result.marktwaarde_kk_afgerond ??= parseCurrency(extractField(sectionContent, 'Marktwaarde'))
      result.markthuur ??= parseCurrency(extractField(sectionContent, 'Markthuur'))
      result.netto_huurwaarde ??= parseCurrency(extractField(sectionContent, 'Netto huurwaarde'))
      result.marktwaarde_per_m2 ??= parseCurrency(extractField(sectionContent, 'Marktwaarde per m²'))
        ?? parseCurrency(extractField(sectionContent, 'Marktwaarde per m2'))
      result.vloeroppervlak_bvo ??= parseNumber(extractField(sectionContent, 'BVO'))
      result.vloeroppervlak_vvo ??= parseNumber(extractField(sectionContent, 'VVO'))
    }

    // -----------------------------------------------------------------------
    // I / I.x — DUURZAAMHEID
    // -----------------------------------------------------------------------
    if (/^I\b/.test(sectionName) || nameLower.includes('duurzaamheid')) {
      result.energielabel ??= extractField(sectionContent, 'Energielabel')
    }
  }

  // -------------------------------------------------------------------------
  // Fallback: extract important scalar fields directly from the full text
  // when section-based extraction failed.
  // -------------------------------------------------------------------------

  // Numeric fields with optional currency/number parsing
  const numericFallbacks: Array<{
    key: keyof Pick<ExtractedData, 'marktwaarde_kk_afgerond' | 'markthuur' | 'netto_huurwaarde' | 'marktwaarde_per_m2' | 'vloeroppervlak_bvo' | 'vloeroppervlak_vvo' | 'verhuurtijd_maanden' | 'verkooptijd_maanden'>
    labels: string[]
    parse: (v: string | null) => number | null
  }> = [
    { key: 'marktwaarde_kk_afgerond', labels: ['Marktwaarde'], parse: parseCurrency },
    { key: 'markthuur', labels: ['Markthuur'], parse: parseCurrency },
    { key: 'netto_huurwaarde', labels: ['Netto huurwaarde'], parse: parseCurrency },
    { key: 'marktwaarde_per_m2', labels: ['Marktwaarde per m²', 'Marktwaarde per m2'], parse: parseCurrency },
    { key: 'vloeroppervlak_bvo', labels: ['BVO'], parse: parseNumber },
    { key: 'vloeroppervlak_vvo', labels: ['VVO'], parse: parseNumber },
    { key: 'verhuurtijd_maanden', labels: ['Verhuurtijd (maanden)', 'Verhuurtijd'], parse: parseNumber },
    { key: 'verkooptijd_maanden', labels: ['Verkooptijd (maanden)', 'Verkooptijd'], parse: parseNumber },
  ]

  // String fields (kept as-is)
  const stringFallbacks: Array<{
    key: keyof Pick<ExtractedData, 'energielabel' | 'locatie_score' | 'object_score' | 'courantheid_verhuur' | 'courantheid_verkoop'>
    labels: string[]
  }> = [
    { key: 'energielabel', labels: ['Energielabel'] },
    { key: 'locatie_score', labels: ['Locatiescore', 'Locatie score'] },
    { key: 'object_score', labels: ['Object score', 'Objectscore'] },
    { key: 'courantheid_verhuur', labels: ['Courantheid verhuur'] },
    { key: 'courantheid_verkoop', labels: ['Courantheid verkoop'] },
  ]

  const fallbackApplied: string[] = []

  for (const { key, labels, parse } of numericFallbacks) {
    if (result[key] !== null) continue
    for (const label of labels) {
      const raw = fallbackExtractField(text, label)
      if (!raw) continue
      const value = parse(raw)
      if (value !== null) {
        result[key] = value
        fallbackApplied.push(`${key} ← "${label}"`)
        break
      }
    }
  }

  for (const { key, labels } of stringFallbacks) {
    if (result[key] !== null) continue
    for (const label of labels) {
      const raw = fallbackExtractField(text, label)
      if (raw) {
        result[key] = raw
        fallbackApplied.push(`${key} ← "${label}"`)
        break
      }
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    if (fallbackApplied.length) {
      console.log('[extractPdfData] Fallback fields applied:', fallbackApplied)
    }
    console.log('[extractPdfData] Final output JSON:', JSON.stringify(result, null, 2))
  }

  return result
}
