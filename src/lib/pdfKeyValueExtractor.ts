import type { TextChunk } from './pdfTextChunker'

export interface ChunkExtractionResult {
  sectionTitle: string
  chunkIndex: number
  totalChunks: number
  extractedFields: Record<string, string>
}

/**
 * Maps raw label text (lowercased, trimmed) to a normalized key.
 * Returns null when the label is not recognized.
 */
export function normalizeLabel(label: string): string | null {
  const normalized = label.toLowerCase().trim().replace(/\s+/g, ' ')

  const LABEL_MAP: Array<[RegExp, string]> = [
    [/^marktwaarde\s+kk\s+afgerond$/, 'marktwaarde_kk_afgerond'],
    [/^netto\s+huurwaarde$/, 'netto_huurwaarde'],
    [/^markthuur$/, 'markthuur'],
    [/^walk\s+score\s+0[-–]\s*100$/, 'walk_score'],
    [/^bebouwd\s+oppervlak$/, 'bebouwd_oppervlak'],
    [/^dakoppervlak\s+van\s+daken$/, 'dakoppervlak'],
    [/^glasoppervlak$/, 'glasoppervlak'],
    [/^bouwjaar$/, 'bouwjaar'],
    [/^type\s+object$/, 'type_object'],
    [/^object\s*score$/, 'object_score'],
    [/^locatiescore$/, 'locatie_score'],
    [/^courantheid\s+verhuur$/, 'courantheid_verhuur'],
    [/^courantheid\s+verkoop$/, 'courantheid_verkoop'],
    [/^verhuurtijd\s*\(\s*maanden\s*\)$/, 'verhuurtijd_maanden'],
    [/^verkooptijd\s*\(\s*maanden\s*\)$/, 'verkooptijd_maanden'],
    [/^marktwaarde\s+per\s+m[²2]$/, 'marktwaarde_per_m2'],
  ]

  for (const [pattern, key] of LABEL_MAP) {
    if (pattern.test(normalized)) return key
  }
  return null
}

/**
 * Cleans a raw extracted value string:
 * - Collapses multiple spaces
 * - Trims leading/trailing whitespace
 * - Removes stray punctuation at start/end (commas, semicolons, pipes)
 */
export function cleanExtractedValue(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,;|]+/, '')
    .replace(/[,;|]+$/, '')
    .trim()
}

/**
 * Extracts key-value pairs from a text block using rule-based regex patterns.
 *
 * Handles formats like:
 *   "Bouwjaar: 2025"
 *   "Type object: Eigen gebruik"
 *   "Bebouwd oppervlak 36"
 *   "Marktwaarde kk afgerond € 220.000"
 *   "Walk Score 0-100 24"
 *   "Verhuurtijd (maanden): 4 maand(en)"
 *   "Marktwaarde per m² € 2.215"
 */
export function extractKeyValuePairs(text: string): Record<string, string> {
  const result: Record<string, string> = {}

  // Patterns ordered from most specific to most general
  // Each pattern must capture: (1) label group, (2) value group
  const patterns: RegExp[] = [
    // "Label: value" — colon separator, label may include parens/special chars
    /^((?:Marktwaarde\s+kk\s+afgerond|Netto\s+huurwaarde|Markthuur|Walk\s+Score\s+0[-–]\s*100|Bebouwd\s+oppervlak|Dakoppervlak\s+van\s+daken|Glasoppervlak|Bouwjaar|Type\s+object|Object\s*score|Locatiescore|Courantheid\s+verhuur|Courantheid\s+verkoop|Verhuurtijd\s*\(\s*maanden\s*\)|Verkooptijd\s*\(\s*maanden\s*\)|Marktwaarde\s+per\s+m[²2]))\s*:\s*(.+)$/im,
    // "Label € value" or "Label value" — space separator for known labels with numeric/euro values
    /^(Marktwaarde\s+kk\s+afgerond|Netto\s+huurwaarde|Markthuur|Walk\s+Score\s+0[-–]\s*100|Bebouwd\s+oppervlak|Dakoppervlak\s+van\s+daken|Glasoppervlak|Marktwaarde\s+per\s+m[²2])\s+(€\s*[\d.,]+(?:\s*[\w²]+)?|[\d.,]+(?:\s*[\w²%]+)?)\s*$/im,
  ]

  const lines = text.split('\n')

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    for (const pattern of patterns) {
      const match = line.match(pattern)
      if (match) {
        const rawLabel = match[1].trim()
        const rawValue = match[2].trim()
        const key = normalizeLabel(rawLabel)
        if (key && rawValue) {
          const value = cleanExtractedValue(rawValue)
          if (value && !(key in result)) {
            result[key] = value
          }
        }
        break
      }
    }
  }

  return result
}

/**
 * Runs `extractKeyValuePairs` over each chunk and returns a structured result
 * per chunk with logging.
 */
export function extractFieldsFromChunks(chunks: TextChunk[]): ChunkExtractionResult[] {
  const results: ChunkExtractionResult[] = []

  for (const chunk of chunks) {
    const extractedFields = extractKeyValuePairs(chunk.content)
    const fieldCount = Object.keys(extractedFields).length

    if (fieldCount === 0) {
      console.log(
        `[pdfKeyValueExtractor] Chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks} (${chunk.sectionTitle}): no matches`,
      )
    } else {
      console.log(
        `[pdfKeyValueExtractor] Chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks} (${chunk.sectionTitle}): ${fieldCount} field(s) found — ${Object.keys(extractedFields).join(', ')}`,
      )
    }

    results.push({
      sectionTitle: chunk.sectionTitle,
      chunkIndex: chunk.chunkIndex,
      totalChunks: chunk.totalChunks,
      extractedFields,
    })
  }

  const totalFields = results.reduce((sum, r) => sum + Object.keys(r.extractedFields).length, 0)
  const emptyChunks = results.filter((r) => Object.keys(r.extractedFields).length === 0).length
  console.log(
    `[pdfKeyValueExtractor] Done: ${totalFields} total field(s) across ${chunks.length} chunk(s); ${emptyChunks} chunk(s) had no matches`,
  )

  return results
}
