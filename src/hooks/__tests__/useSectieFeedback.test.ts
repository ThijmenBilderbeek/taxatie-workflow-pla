import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabaseClient'
import { saveSectieFeedback, getSectieFeedback } from '../useSectieFeedback'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockInsertChain(error: unknown = null) {
  const chain = { error }
  const from = vi.mocked(supabase.from)
  from.mockReturnValue({
    insert: vi.fn().mockResolvedValue(chain),
  } as never)
  return chain
}

function mockSelectChain(data: unknown[], error: unknown = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error }),
  }
  vi.mocked(supabase.from).mockReturnValue(builder as never)
  return builder
}

// ---------------------------------------------------------------------------
// saveSectieFeedback
// ---------------------------------------------------------------------------

describe('saveSectieFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    } as never)
  })

  it('inserts a record when user is authenticated', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as never)

    await saveSectieFeedback('dossier-1', 'b1-algemeen', 'bewerkt', 'Originele tekst', 'Bewerkte tekst')

    expect(supabase.from).toHaveBeenCalledWith('sectie_feedback')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        dossier_id: 'dossier-1',
        sectie_key: 'b1-algemeen',
        feedback_type: 'bewerkt',
        originele_tekst: 'Originele tekst',
        bewerkte_tekst: 'Bewerkte tekst',
      })
    )
  })

  it('inserts a positief record correctly', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as never)

    await saveSectieFeedback('dossier-2', 'c1-swot', 'positief', 'AI tekst')

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        feedback_type: 'positief',
        bewerkte_tekst: null,
      })
    )
  })

  it('does not throw when user is not authenticated', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: null,
    } as never)

    await expect(
      saveSectieFeedback('dossier-1', 'b1-algemeen', 'negatief', 'Tekst')
    ).resolves.toBeUndefined()
  })

  it('handles insert errors gracefully', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: { message: 'DB error' } })
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as never)

    // Should not throw
    await expect(
      saveSectieFeedback('dossier-1', 'b1-algemeen', 'negatief', 'Tekst')
    ).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// getSectieFeedback
// ---------------------------------------------------------------------------

describe('getSectieFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns mapped feedback records', async () => {
    mockSelectChain([
      {
        feedback_type: 'bewerkt',
        originele_tekst: 'Origineel',
        bewerkte_tekst: 'Bewerkt',
        reden: null,
        toelichting: null,
        sectie_key: 'b1-algemeen',
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        feedback_type: 'negatief',
        originele_tekst: 'Te generiek',
        bewerkte_tekst: null,
        reden: 'te_generiek',
        toelichting: 'Meer specifiek',
        sectie_key: 'b1-algemeen',
        created_at: '2024-01-02T00:00:00Z',
      },
    ])

    const result = await getSectieFeedback('b1-algemeen')

    expect(result).toHaveLength(2)
    expect(result[0].feedbackType).toBe('bewerkt')
    expect(result[0].origineleTekst).toBe('Origineel')
    expect(result[0].bewerkteTekst).toBe('Bewerkt')
    expect(result[1].feedbackType).toBe('negatief')
    expect(result[1].reden).toBe('te_generiek')
    expect(result[1].toelichting).toBe('Meer specifiek')
  })

  it('returns empty array when no feedback found', async () => {
    mockSelectChain([])

    const result = await getSectieFeedback('b1-algemeen')
    expect(result).toHaveLength(0)
  })

  it('returns empty array on database error', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'Connection error' } }),
    }
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    const result = await getSectieFeedback('b1-algemeen')
    expect(result).toHaveLength(0)
  })

  it('respects the limit parameter', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    await getSectieFeedback('b1-algemeen', 3)
    expect(builder.limit).toHaveBeenCalledWith(3)
  })
})
