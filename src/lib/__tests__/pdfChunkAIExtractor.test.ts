import { describe, it, expect, vi } from 'vitest'
import {
  isBijlagenChunk,
  isReferenceOrAppendixChunk,
  classifyChunkAsAppendix,
  APPENDIX_SECTION_KEYS,
  NON_APPENDIX_SECTION_KEYS,
} from '../pdfChunkAIExtractor'
import type { TextChunk } from '../pdfTextChunker'

function makeChunk(sectionTitle: string, content = 'some content'): TextChunk {
  return {
    sectionTitle,
    content,
    chunkIndex: 0,
    totalChunks: 1,
  }
}

// ---------------------------------------------------------------------------
// isBijlagenChunk
// ---------------------------------------------------------------------------
describe('isBijlagenChunk', () => {
  it('returns true for "bijlagen" section', () => {
    expect(isBijlagenChunk(makeChunk('bijlagen'))).toBe(true)
  })

  it('returns true for "appendix" section', () => {
    expect(isBijlagenChunk(makeChunk('appendix'))).toBe(true)
  })

  it('returns false for "waardering" section', () => {
    expect(isBijlagenChunk(makeChunk('waardering'))).toBe(false)
  })

  it('returns false for "onderbouwing" section', () => {
    expect(isBijlagenChunk(makeChunk('onderbouwing'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isReferenceOrAppendixChunk — allow-list only, no content matching
// ---------------------------------------------------------------------------
describe('isReferenceOrAppendixChunk', () => {
  it('returns true for "bijlagen" sectionTitle', () => {
    expect(isReferenceOrAppendixChunk(makeChunk('bijlagen'))).toBe(true)
  })

  it('returns true for "appendix" sectionTitle', () => {
    expect(isReferenceOrAppendixChunk(makeChunk('appendix'))).toBe(true)
  })

  it('returns true for "referenties" sectionTitle', () => {
    expect(isReferenceOrAppendixChunk(makeChunk('referenties'))).toBe(true)
  })

  it('returns false for "waardering" — even when content mentions bijlagen', () => {
    const chunk = makeChunk('waardering', 'Zie ook de bijlagen en referenties voor details.')
    expect(isReferenceOrAppendixChunk(chunk)).toBe(false)
  })

  it('returns false for "onderbouwing"', () => {
    expect(isReferenceOrAppendixChunk(makeChunk('onderbouwing'))).toBe(false)
  })

  it('returns false for "object"', () => {
    expect(isReferenceOrAppendixChunk(makeChunk('object'))).toBe(false)
  })

  it('returns false for "locatie"', () => {
    expect(isReferenceOrAppendixChunk(makeChunk('locatie'))).toBe(false)
  })

  it('returns false for "beoordeling"', () => {
    expect(isReferenceOrAppendixChunk(makeChunk('beoordeling'))).toBe(false)
  })

  it('returns false for "duurzaamheid"', () => {
    expect(isReferenceOrAppendixChunk(makeChunk('duurzaamheid'))).toBe(false)
  })

  it('returns false for "aannames"', () => {
    expect(isReferenceOrAppendixChunk(makeChunk('aannames'))).toBe(false)
  })

  it('returns false for "overig" — even when content mentions huurreferenties', () => {
    const chunk = makeChunk('overig', 'huurreferenties worden hieronder vermeld.')
    expect(isReferenceOrAppendixChunk(chunk)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// classifyChunkAsAppendix — reason logging
// ---------------------------------------------------------------------------
describe('classifyChunkAsAppendix', () => {
  it('classifies "bijlagen" with correct reason', () => {
    const { classifiedAsAppendix, reason } = classifyChunkAsAppendix(makeChunk('bijlagen'))
    expect(classifiedAsAppendix).toBe(true)
    expect(reason).toContain('APPENDIX_SECTION_KEYS')
  })

  it('classifies "waardering" with NON_APPENDIX reason', () => {
    const { classifiedAsAppendix, reason } = classifyChunkAsAppendix(makeChunk('waardering'))
    expect(classifiedAsAppendix).toBe(false)
    expect(reason).toContain('NON_APPENDIX_SECTION_KEYS')
  })

  it('classifies unknown section with "not in APPENDIX" reason', () => {
    const { classifiedAsAppendix, reason } = classifyChunkAsAppendix(makeChunk('technisch'))
    expect(classifiedAsAppendix).toBe(false)
    expect(reason).toContain('not in APPENDIX_SECTION_KEYS')
  })
})

// ---------------------------------------------------------------------------
// APPENDIX_SECTION_KEYS / NON_APPENDIX_SECTION_KEYS constants
// ---------------------------------------------------------------------------
describe('APPENDIX_SECTION_KEYS', () => {
  it('contains bijlagen and appendix', () => {
    expect(APPENDIX_SECTION_KEYS.has('bijlagen')).toBe(true)
    expect(APPENDIX_SECTION_KEYS.has('appendix')).toBe(true)
  })

  it('does not contain waardering or onderbouwing', () => {
    expect(APPENDIX_SECTION_KEYS.has('waardering')).toBe(false)
    expect(APPENDIX_SECTION_KEYS.has('onderbouwing')).toBe(false)
  })
})

describe('NON_APPENDIX_SECTION_KEYS', () => {
  const expectedKeys = ['waardering', 'onderbouwing', 'object', 'locatie', 'beoordeling', 'duurzaamheid', 'aannames', 'overig']

  for (const key of expectedKeys) {
    it(`contains "${key}"`, () => {
      expect(NON_APPENDIX_SECTION_KEYS.has(key)).toBe(true)
    })
  }
})
