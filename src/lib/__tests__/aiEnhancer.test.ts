import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DocumentChunk } from '../../types/kennisbank'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the Supabase client so no real HTTP calls are made
vi.mock('../supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}))

import { supabase } from '../supabaseClient'
import { enhanceChunkClassification, enhanceChunksBatch, enhanceDocumentProfile } from '../aiEnhancer'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChunk(overrides: Partial<DocumentChunk> = {}): DocumentChunk {
  return {
    id: 'test-chunk-1',
    documentId: 'doc-1',
    chapter: 'A',
    subchapter: '',
    chunkType: 'narratief',
    rawText: 'Het pand is gelegen aan de Herengracht 123 te Amsterdam.',
    cleanText: 'Het pand is gelegen aan de Herengracht 123 te Amsterdam.',
    writingFunction: 'beschrijvend',
    tones: ['zakelijk'],
    specificity: 'standaard',
    reuseScore: 0.5,
    reuseAsStyleExample: false,
    templateCandidate: false,
    variablesDetected: [],
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// enhanceChunkClassification
// ---------------------------------------------------------------------------

describe('enhanceChunkClassification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns AI classification when edge function succeeds', async () => {
    const mockAI = {
      chunkType: 'technisch',
      writingFunction: 'beschrijvend',
      tones: ['technisch', 'zakelijk'],
      specificity: 'object_specifiek',
      templateCandidate: false,
      variablesDetected: ['Herengracht 123', 'Amsterdam'],
    }

    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: mockAI,
      error: null,
    } as never)

    const result = await enhanceChunkClassification(makeChunk())
    expect(result).toEqual(mockAI)
  })

  it('returns null when the edge function returns an error', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: null,
      error: { message: 'Function error' },
    } as never)

    const result = await enhanceChunkClassification(makeChunk())
    expect(result).toBeNull()
  })

  it('returns null when the response has unexpected shape', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { unexpected: true },
      error: null,
    } as never)

    const result = await enhanceChunkClassification(makeChunk())
    expect(result).toBeNull()
  })

  it('returns null when the edge function throws', async () => {
    vi.mocked(supabase.functions.invoke).mockRejectedValueOnce(new Error('network error'))

    const result = await enhanceChunkClassification(makeChunk())
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// enhanceChunksBatch
// ---------------------------------------------------------------------------

describe('enhanceChunksBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('applies AI classification to each chunk in the batch', async () => {
    const aiResponse = {
      chunkType: 'conclusie',
      writingFunction: 'concluderend',
      tones: ['formeel'],
      specificity: 'gemengd',
      templateCandidate: true,
      variablesDetected: ['€ 3.500.000'],
    }

    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: aiResponse,
      error: null,
    } as never)

    const chunks = [makeChunk({ id: '1' }), makeChunk({ id: '2' })]
    const result = await enhanceChunksBatch(chunks, 5)

    expect(result).toHaveLength(2)
    expect(result[0].chunkType).toBe('conclusie')
    expect(result[1].writingFunction).toBe('concluderend')
  })

  it('falls back to original chunk when AI call fails for that chunk', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: { message: 'timeout' },
    } as never)

    const chunk = makeChunk({ chunkType: 'narratief' })
    const result = await enhanceChunksBatch([chunk], 5)

    expect(result[0].chunkType).toBe('narratief') // unchanged
  })

  it('respects the batchSize parameter', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { chunkType: 'narratief', writingFunction: 'beschrijvend', tones: ['zakelijk'], specificity: 'standaard', templateCandidate: false, variablesDetected: [] },
      error: null,
    } as never)

    const chunks = Array.from({ length: 6 }, (_, i) => makeChunk({ id: String(i) }))
    await enhanceChunksBatch(chunks, 3)

    // 6 chunks in batches of 3 → 6 total invoke calls
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(6)
  })
})

// ---------------------------------------------------------------------------
// enhanceDocumentProfile
// ---------------------------------------------------------------------------

describe('enhanceDocumentProfile', () => {
  const baseProfile = {
    documentId: 'doc-1',
    documentType: 'taxatierapport',
    toneOfVoice: 'neutraal' as const,
    detailLevel: 'standaard' as const,
    standardizationLevel: 'laag' as const,
    dominantChapterStructure: ['A', 'B'],
    reuseQuality: 0.4,
  }

  it('returns profile unchanged when chunks array is empty', () => {
    const result = enhanceDocumentProfile([], baseProfile)
    expect(result).toEqual(baseProfile)
  })

  it('re-derives toneOfVoice from dominant chunk tones', () => {
    const chunks = [
      makeChunk({ tones: ['formeel', 'zakelijk'], reuseScore: 0.3 }),
      makeChunk({ tones: ['formeel'], reuseScore: 0.3 }),
      makeChunk({ tones: ['informatief'], reuseScore: 0.3 }),
    ]

    const result = enhanceDocumentProfile(chunks, baseProfile)
    expect(result.toneOfVoice).toBe('formeel')
  })

  it('re-derives reuseQuality from high-score chunks', () => {
    const chunks = [
      makeChunk({ reuseScore: 0.8, tones: ['zakelijk'] }),
      makeChunk({ reuseScore: 0.7, tones: ['zakelijk'] }),
      makeChunk({ reuseScore: 0.2, tones: ['zakelijk'] }), // below threshold
    ]

    const result = enhanceDocumentProfile(chunks, baseProfile)
    expect(result.reuseQuality).toBeCloseTo(0.75, 2)
  })
})
