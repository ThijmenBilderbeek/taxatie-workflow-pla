/**
 * Pre-cleaning step for raw PDF-extracted text.
 *
 * Removes recurring headers, footers, and page noise before any further
 * parsing (chapter detection / section splitting / field extraction).
 */

/** Patterns that match recurring noise lines in Dutch taxatie PDF reports. */
const NOISE_LINE_PATTERNS: RegExp[] = [
  // "Waarde op: 01-01-2024" or just "Waarde op:" with optional date
  /^waarde\s+op[:\s]/i,
  // "Uitvoerend taxateur: ..."
  /^uitvoerend\s+taxateur[:\s]/i,
  // "Printdatum: ..."
  /^printdatum[:\s]/i,
  // "Pagina 3", "Pagina 3 van 12", "Pagina 3."
  /^pagina\s+\d+(\s+van\s+\d+)?\.?\s*$/i,
  // "3 van 12" (standalone page counter without the word "Pagina")
  /^\d+\s+van\s+\d+\s*$/i,
  // Standalone page numbers: "3", "12", up to 3 digits (common PDF footer artefact)
  /^\d{1,3}\s*$/,
  // Lines that contain ONLY "Taxatierapport" (standalone title repeated per page)
  /^taxatierapport\s*$/i,
  // "Jan Janssen R.T." style taxateur name lines (two capitalised words + R.T.)
  /^[A-Z][a-z]+\s+[A-Z][a-z]+\s+R\.?T\.?\s*$/,
]

/**
 * Detects whether a trimmed line is a duplicate concatenation of itself.
 * PDF extraction sometimes pastes a footer twice on one line, e.g.
 * "Pagina 1 van 5Pagina 1 van 5".
 * Returns true when the line consists of exactly the same string twice in a row.
 */
function isDoubleConcatenatedLine(trimmed: string): boolean {
  if (trimmed.length < 4 || trimmed.length % 2 !== 0) return false
  const half = trimmed.length / 2
  return trimmed.slice(0, half) === trimmed.slice(half)
}

interface CleaningStats {
  pattern: string
  count: number
}

/**
 * Cleans raw PDF-extracted text by removing recurring header/footer noise
 * and normalising whitespace.
 *
 * Steps performed:
 *  1. Remove lines matching known noise patterns (page numbers, taxateur lines, …)
 *  2. Remove lines that are the same text duplicated (PDF concatenation artefact)
 *  3. Reduce more-than-2 consecutive blank lines to at most 2
 *  4. Normalise multiple spaces to a single space within each line
 *
 * @param rawText  The raw text as returned by extractTextFromPdf()
 * @returns        The cleaned text, ready for splitReportIntoSections()
 */
export function cleanExtractedPdfText(rawText: string): string {
  const lines = rawText.split('\n')
  const beforeCount = lines.length

  // Track which patterns fired for logging
  const stats: CleaningStats[] = NOISE_LINE_PATTERNS.map((re) => ({
    pattern: re.source,
    count: 0,
  }))
  let doubleConcatCount = 0

  // --- Step 1 & 2: filter noise lines ---
  const filtered = lines.filter((line) => {
    const trimmed = line.trim()

    // Always keep blank lines at this stage (handled separately below)
    if (trimmed.length === 0) return true

    // Check each noise pattern
    for (let i = 0; i < NOISE_LINE_PATTERNS.length; i++) {
      if (NOISE_LINE_PATTERNS[i].test(trimmed)) {
        stats[i].count++
        return false
      }
    }

    // Check double-concatenation artefact
    if (isDoubleConcatenatedLine(trimmed)) {
      doubleConcatCount++
      return false
    }

    return true
  })

  // --- Step 3: collapse excessive blank lines (max 2 in a row) ---
  const collapsed: string[] = []
  let consecutiveBlanks = 0
  for (const line of filtered) {
    if (line.trim() === '') {
      consecutiveBlanks++
      if (consecutiveBlanks <= 2) collapsed.push(line)
    } else {
      consecutiveBlanks = 0
      // Step 4: normalise multiple spaces to single space
      collapsed.push(line.replace(/  +/g, ' '))
    }
  }

  const afterCount = collapsed.length

  // --- Logging ---
  console.log(
    `[cleanExtractedPdfText] Lines before: ${beforeCount}, after: ${afterCount} (removed ${beforeCount - afterCount})`,
  )

  const removedPatterns: string[] = []
  for (const s of stats) {
    if (s.count > 0) {
      removedPatterns.push(`${s.count}× /${s.pattern}/`)
    }
  }
  if (doubleConcatCount > 0) {
    removedPatterns.push(`${doubleConcatCount}× double-concatenated lines`)
  }
  if (removedPatterns.length > 0) {
    console.log(`[cleanExtractedPdfText] Removed: ${removedPatterns.join(', ')}`)
  } else {
    console.log('[cleanExtractedPdfText] No noise patterns matched.')
  }

  return collapsed.join('\n')
}
