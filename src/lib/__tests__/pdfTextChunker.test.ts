import { describe, it, expect } from 'vitest'
import { splitTextIntoChunks, chunkSections } from '../pdfTextChunker'

describe('splitTextIntoChunks', () => {
  it('returns a single chunk for short text', () => {
    const text = 'Dit is een korte tekst.'
    const chunks = splitTextIntoChunks(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toBe(text)
  })

  it('returns a single chunk when text is exactly at the limit', () => {
    const text = 'a'.repeat(12000)
    const chunks = splitTextIntoChunks(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toBe(text)
  })

  it('splits long text at paragraph boundaries (double newlines)', () => {
    const para1 = 'a'.repeat(7000)
    const para2 = 'b'.repeat(7000)
    const text = `${para1}\n\n${para2}`
    const chunks = splitTextIntoChunks(text)
    expect(chunks.length).toBeGreaterThan(1)
    // Each chunk must be within the default limit
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(12000)
    }
    // Combined content should still contain both paragraphs
    const combined = chunks.join(' ')
    expect(combined).toContain(para1)
    expect(combined).toContain(para2)
  })

  it('splits oversized paragraphs at single newlines when double-newline split is insufficient', () => {
    // Single paragraph with internal newlines that is larger than maxChars
    const line1 = 'c'.repeat(5000)
    const line2 = 'd'.repeat(5000)
    const line3 = 'e'.repeat(5000)
    const text = `${line1}\n${line2}\n${line3}`
    const chunks = splitTextIntoChunks(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(12000)
    }
  })

  it('splits oversized lines at sentence boundaries', () => {
    // One very long line with sentence boundaries
    const sentence = 'Dit is een lange zin. '
    const text = sentence.repeat(700) // ~15 400 chars, no newlines
    const chunks = splitTextIntoChunks(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(12000)
    }
  })

  it('never returns empty chunks', () => {
    const text = '\n\n\n\n' + 'f'.repeat(100) + '\n\n\n\n'
    const chunks = splitTextIntoChunks(text)
    for (const chunk of chunks) {
      expect(chunk.trim().length).toBeGreaterThan(0)
    }
  })

  it('trims all chunks', () => {
    const text = '  Alinea 1 met wat tekst.  \n\n  Alinea 2 met meer tekst.  '
    const chunks = splitTextIntoChunks(text)
    for (const chunk of chunks) {
      expect(chunk).toBe(chunk.trim())
    }
  })

  it('returns an empty array for empty input', () => {
    expect(splitTextIntoChunks('')).toEqual([])
    expect(splitTextIntoChunks('   ')).toEqual([])
  })

  it('respects a custom maxChars value', () => {
    const text = 'a'.repeat(50) + '\n\n' + 'b'.repeat(50)
    const chunks = splitTextIntoChunks(text, 40)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(40)
    }
  })
})

describe('chunkSections', () => {
  it('creates chunks per named section', () => {
    const sections: Record<string, string> = {
      volledig: 'vol tekst',
      samenvatting: 'Samenvatting inhoud.',
      waardering: 'Waardering inhoud.',
    }
    const chunks = chunkSections(sections)
    const titles = chunks.map((c) => c.sectionTitle)
    expect(titles).toContain('samenvatting')
    expect(titles).toContain('waardering')
    expect(titles).not.toContain('volledig')
    expect(titles).not.toContain('FULL_DOCUMENT')
  })

  it('uses FULL_DOCUMENT fallback when only volledig exists', () => {
    const sections: Record<string, string> = {
      volledig: 'Dit is de volledige tekst van het document.',
    }
    const chunks = chunkSections(sections)
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks[0].sectionTitle).toBe('FULL_DOCUMENT')
  })

  it('sets correct chunkIndex and totalChunks for a single-chunk section', () => {
    const sections: Record<string, string> = {
      volledig: 'full',
      samenvatting: 'Korte samenvatting.',
    }
    const chunks = chunkSections(sections)
    const samenvattingChunks = chunks.filter((c) => c.sectionTitle === 'samenvatting')
    expect(samenvattingChunks).toHaveLength(1)
    expect(samenvattingChunks[0].chunkIndex).toBe(0)
    expect(samenvattingChunks[0].totalChunks).toBe(1)
  })

  it('sets correct chunkIndex and totalChunks for multi-chunk sections', () => {
    const longContent = 'a'.repeat(7000) + '\n\n' + 'b'.repeat(7000)
    const sections: Record<string, string> = {
      volledig: longContent,
      waardering: longContent,
    }
    const chunks = chunkSections(sections)
    const waarderingChunks = chunks.filter((c) => c.sectionTitle === 'waardering')
    expect(waarderingChunks.length).toBeGreaterThan(1)
    waarderingChunks.forEach((chunk, idx) => {
      expect(chunk.chunkIndex).toBe(idx)
      expect(chunk.totalChunks).toBe(waarderingChunks.length)
    })
  })

  it('short reports produce exactly 1 chunk per section (no breaking change)', () => {
    const sections: Record<string, string> = {
      volledig: 'short full',
      samenvatting: 'Korte samenvatting.',
      locatie: 'Locatie in Amsterdam.',
    }
    const chunks = chunkSections(sections)
    const samChunks = chunks.filter((c) => c.sectionTitle === 'samenvatting')
    const locChunks = chunks.filter((c) => c.sectionTitle === 'locatie')
    expect(samChunks).toHaveLength(1)
    expect(locChunks).toHaveLength(1)
  })

  it('FULL_DOCUMENT fallback chunks long volledig content', () => {
    const longText = 'x'.repeat(7000) + '\n\n' + 'y'.repeat(7000)
    const sections: Record<string, string> = { volledig: longText }
    const chunks = chunkSections(sections)
    expect(chunks.every((c) => c.sectionTitle === 'FULL_DOCUMENT')).toBe(true)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('chunk content is never empty', () => {
    const sections: Record<string, string> = {
      volledig: 'vol',
      samenvatting: 'Inhoud samenvatting.',
      locatie: '',
    }
    const chunks = chunkSections(sections)
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeGreaterThan(0)
    }
  })
})
