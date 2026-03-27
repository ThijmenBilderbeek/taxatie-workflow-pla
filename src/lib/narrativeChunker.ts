import type { DetectedSection } from '../types/kennisbank'

export interface RawChunk {
  chapter: string
  subchapter: string
  rawText: string
  cleanText: string
}

const MIN_CHUNK_SIZE = 50
const MAX_CHUNK_SIZE = 2000

/**
 * Normalises whitespace and removes heading-like lines from chunk text.
 */
function cleanChunkText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Detects if a paragraph looks like a list block (lines starting with -, •, *, numbered items).
 */
function isListBlock(paragraph: string): boolean {
  const lines = paragraph.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return false
  const listLineCount = lines.filter((l) =>
    /^[\s]*[-•*]\s/.test(l) || /^[\s]*\d+[.)]\s/.test(l)
  ).length
  return listLineCount / lines.length >= 0.5
}

/**
 * Detects if a paragraph looks like a table (lines with multiple columns separated by spaces/tabs).
 */
function isTableBlock(paragraph: string): boolean {
  const lines = paragraph.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return false
  const tableLineCount = lines.filter((l) => /\t|  {3,}/.test(l)).length
  return tableLineCount / lines.length >= 0.5
}

/**
 * Splits a section's text into paragraph-based chunks.
 * Paragraph boundaries are double newlines or distinct block transitions.
 */
function splitIntoParagraphs(text: string): string[] {
  // Split on double newlines (paragraph boundaries)
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/**
 * Merges consecutive very small chunks of the same apparent type.
 */
function mergeTinyChunks(chunks: RawChunk[]): RawChunk[] {
  if (chunks.length === 0) return chunks
  const merged: RawChunk[] = []
  let current = { ...chunks[0] }

  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i]
    const isSameSection = next.chapter === current.chapter && next.subchapter === current.subchapter
    const isCurrentSmall = current.cleanText.length < MIN_CHUNK_SIZE
    const isNextSmall = next.cleanText.length < MIN_CHUNK_SIZE

    if (isSameSection && (isCurrentSmall || isNextSmall)) {
      // Merge into current
      current = {
        ...current,
        rawText: current.rawText + '\n\n' + next.rawText,
        cleanText: current.cleanText + '\n\n' + next.cleanText,
      }
    } else {
      merged.push(current)
      current = { ...next }
    }
  }
  merged.push(current)
  return merged
}

/**
 * Splits a paragraph that exceeds MAX_CHUNK_SIZE into smaller chunks at sentence boundaries.
 * Uses a heuristic that avoids splitting at common Dutch abbreviations.
 */
function splitLargeChunk(paragraph: string, chapter: string, subchapter: string): RawChunk[] {
  if (paragraph.length <= MAX_CHUNK_SIZE) {
    const clean = cleanChunkText(paragraph)
    return [{ chapter, subchapter, rawText: paragraph, cleanText: clean }]
  }

  // Split at sentence boundaries, but not at common Dutch abbreviations.
  // Strategy: split on ". " or "! " or "? " followed by an uppercase letter,
  // but only when the word before the punctuation is not a known abbreviation.
  const ABBREVIATIONS = new Set([
    'dhr', 'mw', 'mr', 'dr', 'ir', 'ing', 'prof', 'ca', 'bijv', 'o.a', 'i.v.m',
    'm.b.t', 'resp', 'enz', 'etc', 'vs', 'nr', 'art', 'par', 'vol', 'st',
  ])

  // Tokenise into candidate sentence breaks
  const sentenceBoundary = /(?<=[.!?])\s+(?=[A-ZÀ-Ö])/g
  const parts: string[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = sentenceBoundary.exec(paragraph)) !== null) {
    const precedingWord = paragraph.slice(0, match.index).split(/\s+/).pop()?.replace(/[.!?]+$/, '').toLowerCase() ?? ''
    if (ABBREVIATIONS.has(precedingWord)) continue
    parts.push(paragraph.slice(lastIndex, match.index))
    lastIndex = match.index + match[0].length
  }
  parts.push(paragraph.slice(lastIndex))

  const result: RawChunk[] = []
  let buffer = ''

  for (const part of parts) {
    if ((buffer + part).length > MAX_CHUNK_SIZE && buffer.length >= MIN_CHUNK_SIZE) {
      const clean = cleanChunkText(buffer)
      result.push({ chapter, subchapter, rawText: buffer.trim(), cleanText: clean })
      buffer = part
    } else {
      buffer += (buffer ? ' ' : '') + part
    }
  }

  if (buffer.trim()) {
    const clean = cleanChunkText(buffer)
    result.push({ chapter, subchapter, rawText: buffer.trim(), cleanText: clean })
  }

  return result
}

/**
 * Splits detected sections into meaningful narrative chunks.
 *
 * Chunk boundaries:
 * - Paragraph breaks (double newlines)
 * - Section transitions (list → narrative, table → narrative)
 * - Enforced maximum chunk size (~2000 chars)
 * - Minimum chunk size: ~50 chars (tiny chunks are merged)
 */
export function chunkSections(sections: DetectedSection[]): RawChunk[] {
  const allChunks: RawChunk[] = []

  for (const section of sections) {
    if (!section.text.trim()) continue

    const { chapter, subchapter, text } = section
    const paragraphs = splitIntoParagraphs(text)

    let prevWasList = false
    let prevWasTable = false
    let listBuffer = ''
    let tableBuffer = ''

    const flushListBuffer = () => {
      if (listBuffer.trim()) {
        const chunks = splitLargeChunk(listBuffer.trim(), chapter, subchapter)
        allChunks.push(...chunks)
        listBuffer = ''
      }
    }

    const flushTableBuffer = () => {
      if (tableBuffer.trim()) {
        const chunks = splitLargeChunk(tableBuffer.trim(), chapter, subchapter)
        allChunks.push(...chunks)
        tableBuffer = ''
      }
    }

    for (const paragraph of paragraphs) {
      const isList = isListBlock(paragraph)
      const isTable = isTableBlock(paragraph)

      if (isList) {
        if (prevWasTable) flushTableBuffer()
        if (!prevWasList) flushListBuffer()
        listBuffer += (listBuffer ? '\n\n' : '') + paragraph
        prevWasList = true
        prevWasTable = false
      } else if (isTable) {
        if (prevWasList) flushListBuffer()
        if (!prevWasTable) flushTableBuffer()
        tableBuffer += (tableBuffer ? '\n\n' : '') + paragraph
        prevWasList = false
        prevWasTable = true
      } else {
        // Regular narrative paragraph
        if (prevWasList) flushListBuffer()
        if (prevWasTable) flushTableBuffer()
        const chunks = splitLargeChunk(paragraph, chapter, subchapter)
        allChunks.push(...chunks)
        prevWasList = false
        prevWasTable = false
      }
    }

    // Flush any remaining list/table buffers
    flushListBuffer()
    flushTableBuffer()
  }

  // Filter out chunks that are too small
  const filtered = allChunks.filter((c) => c.cleanText.length >= MIN_CHUNK_SIZE)

  return mergeTinyChunks(filtered)
}
