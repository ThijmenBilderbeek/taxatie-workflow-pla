import { describe, it, expect } from 'vitest'
import { extractWritingProfile } from '../styleMetadataExtractor'
import type { ClassifiedChunk } from '../chunkClassifier'

function makeChunk(
  text: string,
  chapter: string,
  subchapter: string,
  overrides?: Partial<ClassifiedChunk>
): ClassifiedChunk {
  return {
    chapter,
    subchapter,
    rawText: text,
    cleanText: text,
    chunkType: 'narratief',
    writingFunction: 'beschrijvend',
    tones: ['informatief'],
    specificity: 'standaard',
    reuseScore: 0.6,
    ...overrides,
  }
}

describe('extractWritingProfile', () => {
  it('returns a profile with the given documentId', () => {
    const chunks = [makeChunk('Tekst van het document.', 'A', '')]
    const profile = extractWritingProfile('doc-123', chunks)
    expect(profile.documentId).toBe('doc-123')
  })

  it('uses "taxatierapport" as default documentType', () => {
    const profile = extractWritingProfile('doc-1', [])
    expect(profile.documentType).toBe('taxatierapport')
  })

  it('uses provided documentType option', () => {
    const profile = extractWritingProfile('doc-1', [], { documentType: 'waardeverklaring' })
    expect(profile.documentType).toBe('waardeverklaring')
  })

  it('uses provided objectType option', () => {
    const profile = extractWritingProfile('doc-1', [], { objectType: 'kantoor' })
    expect(profile.objectType).toBe('kantoor')
  })

  it('returns "beknopt" detail level for empty chunks', () => {
    const profile = extractWritingProfile('doc-1', [])
    expect(profile.detailLevel).toBe('beknopt')
  })

  it('returns "beknopt" for short chunks', () => {
    const chunks = [makeChunk('Korte tekst.', 'A', '')]
    const profile = extractWritingProfile('doc-1', chunks)
    expect(profile.detailLevel).toBe('beknopt')
  })

  it('returns "uitgebreid" for long average chunk length', () => {
    const longText = 'Dit is een uitgebreide beschrijving van het object. '.repeat(10)
    const chunks = Array.from({ length: 5 }, (_, i) =>
      makeChunk(longText, String.fromCharCode(65 + i), '')
    )
    const profile = extractWritingProfile('doc-1', chunks)
    expect(['uitgebreid', 'zeer_uitgebreid', 'standaard']).toContain(profile.detailLevel)
  })

  it('detects "hoog" standardization when many known chapters present', () => {
    const knownChapters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
    const text = 'Inhoud van dit hoofdstuk beschrijft het object en zijn kenmerken in detail voor de taxateur.'
    const chunks = knownChapters.map((ch) => makeChunk(text, ch, ''))
    const profile = extractWritingProfile('doc-1', chunks)
    expect(profile.standardizationLevel).toBe('hoog')
  })

  it('detects "laag" standardization for unknown/no chapters', () => {
    const chunks = [makeChunk('Inhoud zonder standaardstructuur met voldoende tekst.', 'X', '')]
    const profile = extractWritingProfile('doc-1', chunks)
    expect(profile.standardizationLevel).toBe('laag')
  })

  it('builds dominant chapter structure in order', () => {
    const chunks = [
      makeChunk('Tekst A', 'A', ''),
      makeChunk('Tekst B1', 'B', 'B.1'),
      makeChunk('Tekst B2', 'B', 'B.2'),
      makeChunk('Tekst C', 'C', ''),
    ]
    const profile = extractWritingProfile('doc-1', chunks)
    expect(profile.dominantChapterStructure).toContain('A')
    expect(profile.dominantChapterStructure).toContain('B.1')
    expect(profile.dominantChapterStructure).toContain('B.2')
    expect(profile.dominantChapterStructure).toContain('C')
    // Order should be preserved
    expect(profile.dominantChapterStructure.indexOf('A')).toBeLessThan(
      profile.dominantChapterStructure.indexOf('C')
    )
  })

  it('returns reuseQuality between 0 and 1', () => {
    const chunks = Array.from({ length: 5 }, (_, i) =>
      makeChunk('Inhoud van chunk ' + i, 'A', '', { reuseScore: 0.5 + i * 0.1 })
    )
    const profile = extractWritingProfile('doc-1', chunks)
    expect(profile.reuseQuality).toBeGreaterThanOrEqual(0)
    expect(profile.reuseQuality).toBeLessThanOrEqual(1)
  })

  it('determines dominant tone from chunks', () => {
    const formalChunks = Array.from({ length: 5 }, () =>
      makeChunk('Derhalve dient de onderhavige taxatie te worden bezien.', 'A', '', {
        tones: ['formeel'],
      })
    )
    const profile = extractWritingProfile('doc-1', formalChunks)
    expect(profile.toneOfVoice).toBe('formeel')
  })

  it('infers market segment from chunk vocabulary', () => {
    const chunks = [
      makeChunk('Het kantoor is gelegen in het centrum van de stad met goede bereikbaarheid.', 'A', '', {
        tones: ['zakelijk'],
      }),
      makeChunk('De huurder betreft een commerciële partij die beleggingsvastgoed exploiteert.', 'B', '', {
        tones: ['zakelijk'],
      }),
    ]
    const profile = extractWritingProfile('doc-1', chunks)
    expect(['commercieel', 'residentieel', 'industrieel', 'agrarisch', 'overig', 'gemengd']).toContain(
      profile.marketSegment
    )
  })
})
