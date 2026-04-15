export interface TextChunk {
  sectionTitle: string
  chunkIndex: number
  totalChunks: number
  content: string
}

/** Section title used when no named sections are detected and the full document is chunked. */
export const FULL_DOCUMENT_SECTION_TITLE = 'FULL_DOCUMENT'

/**
 * Splits a text string into chunks that do not exceed `maxChars`.
 *
 * Split order of preference:
 *  1. Double newlines (paragraph boundaries)
 *  2. Single newlines (line boundaries) when a paragraph exceeds `maxChars`
 *  3. Sentence boundaries (`. ` followed by an uppercase letter) when a line
 *     still exceeds `maxChars`
 *
 * Empty chunks are never returned; all chunks are trimmed.
 */
export function splitTextIntoChunks(text: string, maxChars = 12000): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  // Fast path: text fits in one chunk
  if (trimmed.length <= maxChars) return [trimmed]

  const chunks: string[] = []

  function pushChunks(pieces: string[]): void {
    let current = ''
    for (const piece of pieces) {
      const candidate = current ? current + '\n\n' + piece : piece
      if (candidate.length <= maxChars) {
        current = candidate
      } else {
        if (current) {
          chunks.push(current.trim())
        }
        // The piece itself may still exceed maxChars — split it further
        if (piece.length > maxChars) {
          splitOversizedParagraph(piece)
        } else {
          current = piece
        }
      }
    }
    if (current.trim()) chunks.push(current.trim())
  }

  function splitOversizedParagraph(para: string): void {
    const lines = para.split('\n')
    if (lines.length > 1) {
      // Try to re-assemble using single newlines
      let current = ''
      for (const line of lines) {
        const candidate = current ? current + '\n' + line : line
        if (candidate.length <= maxChars) {
          current = candidate
        } else {
          if (current) chunks.push(current.trim())
          if (line.length > maxChars) {
            splitOversizedLine(line)
          } else {
            current = line
          }
        }
      }
      if (current.trim()) chunks.push(current.trim())
    } else {
      splitOversizedLine(para)
    }
  }

  function splitOversizedLine(line: string): void {
    // Split at sentence boundaries: `. ` followed by an uppercase letter
    const parts = line.split(/(?<=\. )(?=[A-Z])/)
    let current = ''
    for (const part of parts) {
      const candidate = current ? current + ' ' + part : part
      if (candidate.length <= maxChars) {
        current = candidate
      } else {
        if (current) chunks.push(current.trim())
        if (part.length > maxChars) {
          // Last resort: hard split at maxChars on a word boundary
          let remaining = part
          while (remaining.length > maxChars) {
            let splitAt = maxChars
            // Walk back to avoid splitting mid-word
            while (splitAt > 0 && remaining[splitAt] !== ' ') splitAt--
            if (splitAt === 0) splitAt = maxChars // no space found, hard split
            chunks.push(remaining.slice(0, splitAt).trim())
            remaining = remaining.slice(splitAt).trim()
          }
          current = remaining
        } else {
          current = part
        }
      }
    }
    if (current.trim()) chunks.push(current.trim())
  }

  const paragraphs = trimmed.split('\n\n')
  pushChunks(paragraphs)

  return chunks.filter((c) => c.length > 0)
}

/**
 * Chunks the sections produced by `splitReportIntoSections()`.
 *
 * - Named sections (all keys except `volledig`) are each chunked individually.
 * - When only the `volledig` key is present (no named sections), the full text
 *   is chunked with `sectionTitle: 'FULL_DOCUMENT'`.
 */
export function chunkSections(sections: Record<string, string>): TextChunk[] {
  const namedKeys = Object.keys(sections).filter((k) => k !== 'volledig')

  console.log(`[pdfTextChunker] Input sections: ${Object.keys(sections).length} (named: ${namedKeys.length})`)

  const result: TextChunk[] = []

  if (namedKeys.length === 0) {
    // Fallback: chunk the full document text
    console.log('[pdfTextChunker] No named sections — using FULL_DOCUMENT fallback')
    const fullText = sections['volledig'] ?? ''
    console.log(`[pdfTextChunker] FULL_DOCUMENT content length: ${fullText.length}`)
    const rawChunks = splitTextIntoChunks(fullText)
    const totalChunks = rawChunks.length
    for (let i = 0; i < rawChunks.length; i++) {
      console.log(`[pdfTextChunker] FULL_DOCUMENT chunk ${i + 1}/${totalChunks}: ${rawChunks[i].length} chars`)
      result.push({
        sectionTitle: FULL_DOCUMENT_SECTION_TITLE,
        chunkIndex: i,
        totalChunks,
        content: rawChunks[i],
      })
    }
  } else {
    for (const key of namedKeys) {
      const rawChunks = splitTextIntoChunks(sections[key] ?? '')
      const totalChunks = rawChunks.length
      for (let i = 0; i < rawChunks.length; i++) {
        console.log(`[pdfTextChunker] Section "${key}" chunk ${i + 1}/${totalChunks}: ${rawChunks[i].length} chars`)
        result.push({
          sectionTitle: key,
          chunkIndex: i,
          totalChunks,
          content: rawChunks[i],
        })
      }
    }
  }

  console.log(`[pdfTextChunker] Total output chunks: ${result.length}`)

  return result
}
