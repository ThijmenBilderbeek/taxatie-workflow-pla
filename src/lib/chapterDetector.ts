import type { DetectedSection } from '../types/kennisbank'

/**
 * Known chapter patterns from the standard taxatierapport template.
 * Chapters A through L with optional subsections.
 */
const KNOWN_CHAPTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

/** Minimum characters a heading title must have to be considered valid. */
const MIN_HEADING_TITLE_LENGTH = 2

/** Dutch uppercase letters including common accented characters. */
const DUTCH_UPPERCASE_CHARS = 'A-ZÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ'

/** Regex matching a single known chapter letter followed by optional dot and space. */
const CHAPTER_LETTER_RE = /^([A-L])\.?\s+(.*)/i

/** Regex matching a letter chapter with subsection: "A.1", "B.2.1", "B 1". */
const SUBCHAPTER_LETTER_RE = /^([A-L])[\s.](\d+(?:\.\d+)*)[\s\t]*(.*)/i

/** Regex matching a numeric subchapter: "1.1", "2.3.1". */
const SUBCHAPTER_NUMERIC_RE = /^(\d{1,2})\.(\d+(?:\.\d+)*)[\s\t]*(.*)/

/** Regex matching a top-level numeric chapter: "1. Heading". */
const CHAPTER_NUMERIC_RE = /^(\d{1,2})\.\s+(.*)/

/**
 * Determines whether a line is an ALL-CAPS heading (3+ uppercase words or ≥6 uppercase chars).
 */
function isAllCapsHeading(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length < 4) return false
  // Must be mostly uppercase letters (allow spaces and punctuation)
  const lettersOnly = trimmed.replace(/[^A-Za-zÀ-öø-ÿ]/g, '')
  if (lettersOnly.length < 3) return false
  const upperRegex = new RegExp(`[${DUTCH_UPPERCASE_CHARS}]`, 'g')
  const upperCount = (lettersOnly.match(upperRegex) ?? []).length
  return upperCount / lettersOnly.length >= 0.85
}

/**
 * Tries to match a line against chapter/subchapter heading patterns.
 * Returns { chapter, subchapter } if matched, or null.
 */
function matchHeading(line: string): { chapter: string; subchapter: string } | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  // Pattern: "A.1 Heading" or "A 1 Heading"
  const subchapterMatch = trimmed.match(SUBCHAPTER_LETTER_RE)
  if (subchapterMatch) {
    const letter = subchapterMatch[1].toUpperCase()
    if (KNOWN_CHAPTERS.includes(letter)) {
      const chapter = letter
      const subNum = subchapterMatch[2]
      const title = subchapterMatch[3]?.trim()
      if (title && title.length >= MIN_HEADING_TITLE_LENGTH) {
        return { chapter, subchapter: `${chapter}.${subNum}` }
      }
      return { chapter, subchapter: `${chapter}.${subNum}` }
    }
  }

  // Pattern: "1.1 Heading" — numeric subchapter
  const numericSubMatch = trimmed.match(SUBCHAPTER_NUMERIC_RE)
  if (numericSubMatch) {
    const parent = numericSubMatch[1]
    const subNum = numericSubMatch[2]
    return { chapter: parent, subchapter: `${parent}.${subNum}` }
  }

  // Pattern: "A. Heading" or "A Heading" (letter only)
  const chapterMatch = trimmed.match(CHAPTER_LETTER_RE)
  if (chapterMatch) {
    const letter = chapterMatch[1].toUpperCase()
    if (KNOWN_CHAPTERS.includes(letter)) {
      return { chapter: letter, subchapter: '' }
    }
  }

  // Pattern: "1. Heading" — numeric chapter
  const numericChapterMatch = trimmed.match(CHAPTER_NUMERIC_RE)
  if (numericChapterMatch) {
    const title = numericChapterMatch[2]?.trim()
    if (title && title.length >= MIN_HEADING_TITLE_LENGTH) {
      return { chapter: numericChapterMatch[1], subchapter: '' }
    }
  }

  // ALL-CAPS heading fallback
  if (isAllCapsHeading(trimmed)) {
    return { chapter: trimmed, subchapter: '' }
  }

  return null
}

/**
 * Detects chapter and subchapter sections in raw PDF text.
 *
 * Returns an array of sections, each with:
 * - chapter: top-level chapter identifier (e.g. "A", "B", "1")
 * - subchapter: sub-section identifier (e.g. "B.1", "B.2") or empty string
 * - startIndex: character offset of the heading in the original text
 * - endIndex: character offset of the next heading (exclusive), or text.length
 * - text: the text content belonging to this section (heading stripped)
 */
export function detectChapters(text: string): DetectedSection[] {
  const sections: DetectedSection[] = []
  const lines = text.split('\n')
  let charOffset = 0

  interface PendingSection {
    chapter: string
    subchapter: string
    startIndex: number
    headingEnd: number
  }

  let pending: PendingSection | null = null

  for (const line of lines) {
    const lineStart = charOffset
    charOffset += line.length + 1 // +1 for the \n

    const heading = matchHeading(line)
    if (heading) {
      // Close the previous section
      if (pending) {
        const sectionText = text.slice(pending.headingEnd, lineStart).trim()
        sections.push({
          chapter: pending.chapter,
          subchapter: pending.subchapter,
          startIndex: pending.startIndex,
          endIndex: lineStart,
          text: sectionText,
        })
      }
      pending = {
        chapter: heading.chapter,
        subchapter: heading.subchapter,
        startIndex: lineStart,
        headingEnd: charOffset, // content starts after this line
      }
    }
  }

  // Flush the last pending section
  if (pending) {
    const sectionText = text.slice(pending.headingEnd).trim()
    sections.push({
      chapter: pending.chapter,
      subchapter: pending.subchapter,
      startIndex: pending.startIndex,
      endIndex: text.length,
      text: sectionText,
    })
  }

  // If no headings found, treat the whole text as one section
  if (sections.length === 0 && text.trim()) {
    sections.push({
      chapter: '',
      subchapter: '',
      startIndex: 0,
      endIndex: text.length,
      text: text.trim(),
    })
  }

  return sections
}
