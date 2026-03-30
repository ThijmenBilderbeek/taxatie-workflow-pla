import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from '../supabaseClient'
import { getKennisbankContextForSectie, sectieKeyNaarChapter } from '../kennisbankRetriever'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChunkRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'chunk-1',
    document_id: 'doc-1',
    chapter: 'B',
    subchapter: 'B.4',
    chunk_type: 'narratief',
    raw_text: 'Dit is een ruwe tekst over het object.',
    clean_text: 'Dit is een schone tekst over het object.',
    writing_function: 'beschrijvend',
    tones: ['formeel', 'zakelijk'],
    specificity: 'standaard',
    reuse_score: 0.8,
    reuse_as_style_example: false,
    template_candidate: true,
    variables_detected: [],
    metadata: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeProfileRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    document_id: 'doc-1',
    document_type: 'taxatierapport',
    object_type: 'kantoor',
    market_segment: 'commercieel',
    tone_of_voice: 'formeel',
    detail_level: 'standaard',
    standardization_level: 'gemiddeld',
    dominant_chapter_structure: ['A', 'B', 'C'],
    reuse_quality: 0.75,
    ...overrides,
  }
}

/** Bouwt een mock Supabase query-builder die de opgegeven data retourneert. */
function mockQuery(data: unknown[] | null, error: unknown = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then(
      resolve: (value: { data: unknown; error: unknown }) => void,
      reject?: (reason: unknown) => void
    ) {
      return Promise.resolve({ data, error }).then(resolve, reject)
    },
  }
  return builder
}

// ---------------------------------------------------------------------------
// sectieKeyNaarChapter
// ---------------------------------------------------------------------------

describe('sectieKeyNaarChapter', () => {
  it('leidt "B" af van "b4-inspectie"', () => {
    expect(sectieKeyNaarChapter('b4-inspectie')).toBe('B')
  })

  it('leidt "A" af van "a1-opdrachtgever"', () => {
    expect(sectieKeyNaarChapter('a1-opdrachtgever')).toBe('A')
  })

  it('leidt "I" af van "i-duurzaamheid"', () => {
    expect(sectieKeyNaarChapter('i-duurzaamheid')).toBe('I')
  })

  it('leidt "C" af van "c1-swot"', () => {
    expect(sectieKeyNaarChapter('c1-swot')).toBe('C')
  })

  it('retourneert null voor "samenvatting" (geen hoofdstuk-prefix)', () => {
    expect(sectieKeyNaarChapter('samenvatting')).toBeNull()
  })

  it('retourneert null voor "ondertekening"', () => {
    expect(sectieKeyNaarChapter('ondertekening')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getKennisbankContextForSectie
// ---------------------------------------------------------------------------

describe('getKennisbankContextForSectie', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retourneert template chunks en schrijfstijlprofiel bij succesvolle query', async () => {
    const templateChunkRow = makeChunkRow({ template_candidate: true })
    const profileRow = makeProfileRow()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'document_chunks') return mockQuery([templateChunkRow]) as never
      if (table === 'document_writing_profiles') return mockQuery([profileRow]) as never
      return mockQuery([]) as never
    })

    const ctx = await getKennisbankContextForSectie('b4-inspectie', 'kantoor')

    expect(ctx.templateChunks).toHaveLength(1)
    expect(ctx.templateChunks[0].templateCandidate).toBe(true)
    expect(ctx.writingProfile).not.toBeNull()
    expect(ctx.writingProfile?.toneOfVoice).toBe('formeel')
    expect(ctx.toneGuidance).toContain('formeel')
  })

  it('retourneert stijlvoorbeelden bij reuse_as_style_example=true chunks', async () => {
    const styleChunkRow = makeChunkRow({ reuse_as_style_example: true, template_candidate: false })
    const profileRow = makeProfileRow()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'document_chunks') return mockQuery([styleChunkRow]) as never
      if (table === 'document_writing_profiles') return mockQuery([profileRow]) as never
      return mockQuery([]) as never
    })

    const ctx = await getKennisbankContextForSectie('b1-algemeen')

    expect(ctx.styleExamples).toHaveLength(1)
    expect(ctx.styleExamples[0].reuseAsStyleExample).toBe(true)
  })

  it('geeft leeg resultaat terug bij lege kennisbank', async () => {
    vi.mocked(supabase.from).mockImplementation(() => mockQuery([]) as never)

    const ctx = await getKennisbankContextForSectie('b4-inspectie', 'kantoor')

    expect(ctx.templateChunks).toHaveLength(0)
    expect(ctx.styleExamples).toHaveLength(0)
    expect(ctx.writingProfile).toBeNull()
    expect(ctx.toneGuidance).toBe('')
  })

  it('geeft leeg resultaat terug bij query-fout (geen breaking changes)', async () => {
    vi.mocked(supabase.from).mockImplementation(() => {
      throw new Error('Database onbereikbaar')
    })

    const ctx = await getKennisbankContextForSectie('b4-inspectie')

    expect(ctx.templateChunks).toHaveLength(0)
    expect(ctx.styleExamples).toHaveLength(0)
    expect(ctx.writingProfile).toBeNull()
    expect(ctx.toneGuidance).toBe('')
  })

  it('trunceert lange chunk tekst tot 500 tekens', async () => {
    const langeTekst = 'A'.repeat(800)
    const chunkRow = makeChunkRow({ clean_text: langeTekst, template_candidate: true })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'document_chunks') return mockQuery([chunkRow]) as never
      if (table === 'document_writing_profiles') return mockQuery([]) as never
      return mockQuery([]) as never
    })

    const ctx = await getKennisbankContextForSectie('b4-inspectie')

    expect(ctx.templateChunks[0].cleanText.length).toBeLessThanOrEqual(501) // 500 + '…'
    expect(ctx.templateChunks[0].cleanText).toContain('…')
  })

  it('retourneert leeg resultaat als profiel-query null data geeft', async () => {
    const templateChunkRow = makeChunkRow()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'document_chunks') return mockQuery([templateChunkRow]) as never
      if (table === 'document_writing_profiles') return mockQuery(null) as never
      return mockQuery([]) as never
    })

    const ctx = await getKennisbankContextForSectie('b4-inspectie')

    expect(ctx.writingProfile).toBeNull()
    expect(ctx.toneGuidance).toBe('')
  })

  it('bevat toneGuidance met alle profiel-velden', async () => {
    const profileRow = makeProfileRow({
      tone_of_voice: 'technisch',
      detail_level: 'uitgebreid',
      standardization_level: 'hoog',
    })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'document_chunks') return mockQuery([]) as never
      if (table === 'document_writing_profiles') return mockQuery([profileRow]) as never
      return mockQuery([]) as never
    })

    const ctx = await getKennisbankContextForSectie('c1-swot')

    expect(ctx.toneGuidance).toContain('technisch')
    expect(ctx.toneGuidance).toContain('uitgebreid')
    expect(ctx.toneGuidance).toContain('hoog')
  })
})
