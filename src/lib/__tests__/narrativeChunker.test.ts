import { describe, it, expect } from 'vitest'
import { chunkSections } from '../narrativeChunker'
import type { DetectedSection } from '../../types/kennisbank'

function makeSection(chapter: string, subchapter: string, text: string): DetectedSection {
  return { chapter, subchapter, startIndex: 0, endIndex: text.length, text }
}

describe('chunkSections', () => {
  it('returns empty array for empty sections', () => {
    expect(chunkSections([])).toHaveLength(0)
  })

  it('returns empty array for sections with only whitespace', () => {
    const sections = [makeSection('A', '', '   \n\n   ')]
    expect(chunkSections(sections)).toHaveLength(0)
  })

  it('splits text at paragraph breaks (double newlines)', () => {
    const text = `Dit is de eerste paragraaf met wat tekst om een chunk te vormen die lang genoeg is.

Dit is de tweede paragraaf met voldoende tekst om als apart chunk opgeslagen te worden.`
    const sections = [makeSection('A', '', text)]
    const chunks = chunkSections(sections)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
  })

  it('preserves chapter and subchapter on each chunk', () => {
    const text = `Dit is de tekst van subhoofdstuk B.1 met voldoende inhoud om als chunk te worden opgeslagen in het systeem.`
    const sections = [makeSection('B', 'B.1', text)]
    const chunks = chunkSections(sections)
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    chunks.forEach((c) => {
      expect(c.chapter).toBe('B')
      expect(c.subchapter).toBe('B.1')
    })
  })

  it('filters out chunks shorter than 50 characters', () => {
    const text = `Kort.\n\nDit is een veel langere paragraaf die zeker boven de minimumdrempel van vijftig tekens uitkomt.`
    const sections = [makeSection('A', '', text)]
    const chunks = chunkSections(sections)
    chunks.forEach((c) => {
      expect(c.cleanText.length).toBeGreaterThanOrEqual(50)
    })
  })

  it('splits very long paragraphs (> 2000 chars)', () => {
    // Create a paragraph > 2000 chars
    const longSentence = 'Dit is een zin die meerdere woorden bevat en bijdraagt aan de totale lengte. '
    const longText = longSentence.repeat(30) // ~2250 chars
    const sections = [makeSection('C', 'C.1', longText)]
    const chunks = chunkSections(sections)
    // Chunks should be split — allow a small tolerance for sentence boundary alignment
    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach((c) => {
      expect(c.cleanText.length).toBeLessThanOrEqual(2200)
    })
  })

  it('produces cleanText with normalized whitespace', () => {
    const text = `Dit  heeft   extra    spaties   en tabs.\n\nDeze zin is ook onderdeel van het stuk tekst dat schoongemaakt moet worden.`
    const sections = [makeSection('D', '', text)]
    const chunks = chunkSections(sections)
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    chunks.forEach((c) => {
      expect(c.cleanText).not.toMatch(/  /)  // no double spaces
    })
  })

  it('handles list blocks as a single chunk', () => {
    const text = `De volgende punten zijn van belang voor de beoordeling van het object:

- Punt één met voldoende tekst
- Punt twee met voldoende tekst
- Punt drie met voldoende tekst`
    const sections = [makeSection('E', '', text)]
    const chunks = chunkSections(sections)
    // The list items should be grouped together
    const listChunk = chunks.find((c) => c.cleanText.includes('Punt één'))
    expect(listChunk).toBeDefined()
  })

  it('merges tiny consecutive chunks from the same section', () => {
    const text = `Kort fragment.\n\nNog een kort.\n\nDit is een grotere tekst die meerdere zinnen bevat en zeker boven de minimumdrempel uitkomt.`
    const sections = [makeSection('F', '', text)]
    const chunks = chunkSections(sections)
    // After merging, all chunks should be >= MIN_CHUNK_SIZE (50 chars)
    chunks.forEach((c) => {
      expect(c.cleanText.length).toBeGreaterThanOrEqual(50)
    })
  })

  it('processes multiple sections independently', () => {
    const sectionA = makeSection('A', '', 'Inhoud van sectie A met genoeg tekst om een valide chunk te vormen voor de test.')
    const sectionB = makeSection('B', '', 'Inhoud van sectie B met genoeg tekst om een valide chunk te vormen voor de test.')
    const chunks = chunkSections([sectionA, sectionB])
    const chaptersFound = new Set(chunks.map((c) => c.chapter))
    expect(chaptersFound.has('A')).toBe(true)
    expect(chaptersFound.has('B')).toBe(true)
  })
})
