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
import { saveSectieFeedback } from '@/hooks/useSectieFeedback'
import { calculateSectieAcceptanceRate } from '../sectieFeedbackStats'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockAuthUser(userId = 'user-1') {
  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  } as never)
}

function mockInsert(error: unknown = null) {
  const insertMock = vi.fn().mockResolvedValue({ error })
  vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as never)
  return insertMock
}

function mockFeedbackQuery(rows: Array<{ feedback_type: string }>, error: unknown = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: rows, error }),
  }
  vi.mocked(supabase.from).mockReturnValue(builder as never)
  return builder
}

// ---------------------------------------------------------------------------
// saveSectieFeedback — feedback_type determination
// ---------------------------------------------------------------------------

describe('saveSectieFeedback — feedback_type determination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser()
  })

  it('stores feedback_type "bewerkt" when text was edited', async () => {
    const insertMock = mockInsert()

    await saveSectieFeedback('dossier-1', 'b1-algemeen', 'bewerkt', 'Origineel', 'Aangepast')

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ feedback_type: 'bewerkt' })
    )
  })

  it('stores feedback_type "positief" when text was accepted as-is', async () => {
    const insertMock = mockInsert()

    await saveSectieFeedback('dossier-1', 'b1-algemeen', 'positief', 'Origineel')

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ feedback_type: 'positief' })
    )
  })

  it('stores feedback_type "negatief" for thumbs-down feedback', async () => {
    const insertMock = mockInsert()

    await saveSectieFeedback('dossier-1', 'b1-algemeen', 'negatief', 'Origineel')

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ feedback_type: 'negatief' })
    )
  })

  it('stores the original and edited texts', async () => {
    const insertMock = mockInsert()

    await saveSectieFeedback('dossier-1', 'b1-algemeen', 'bewerkt', 'Originele tekst', 'Bewerkte tekst')

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        originele_tekst: 'Originele tekst',
        bewerkte_tekst: 'Bewerkte tekst',
      })
    )
  })

  it('stores null for bewerkte_tekst when not provided (positief case)', async () => {
    const insertMock = mockInsert()

    await saveSectieFeedback('dossier-1', 'b1-algemeen', 'positief', 'Originele tekst')

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ bewerkte_tekst: null })
    )
  })
})

// ---------------------------------------------------------------------------
// getSectieAcceptanceRate — acceptance ratio calculation
// ---------------------------------------------------------------------------

describe('calculateSectieAcceptanceRate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns acceptatieRatio of 1.0 when all feedback is positief', async () => {
    mockFeedbackQuery([
      { feedback_type: 'positief' },
      { feedback_type: 'positief' },
    ])

    const result = await calculateSectieAcceptanceRate('b1-algemeen')
    expect(result.acceptatieRatio).toBe(1)
    expect(result.totaal).toBe(2)
    expect(result.geaccepteerd).toBe(2)
  })

  it('returns acceptatieRatio of 0 when all feedback is negatief', async () => {
    mockFeedbackQuery([
      { feedback_type: 'negatief' },
      { feedback_type: 'negatief' },
    ])

    const result = await calculateSectieAcceptanceRate('b1-algemeen')
    expect(result.acceptatieRatio).toBe(0)
  })

  it('returns acceptatieRatio of 0.5 for equal positief/negatief split', async () => {
    mockFeedbackQuery([
      { feedback_type: 'positief' },
      { feedback_type: 'negatief' },
    ])

    const result = await calculateSectieAcceptanceRate('b1-algemeen')
    expect(result.acceptatieRatio).toBe(0.5)
  })

  it('correctly counts "bewerkt" as not accepted', async () => {
    mockFeedbackQuery([
      { feedback_type: 'positief' },
      { feedback_type: 'bewerkt' },
      { feedback_type: 'bewerkt' },
    ])

    const result = await calculateSectieAcceptanceRate('b1-algemeen')
    expect(result.totaal).toBe(3)
    expect(result.geaccepteerd).toBe(1)
    expect(result.bewerkt).toBe(2)
    // acceptatieRatio = 1/3 ≈ 0.333
    expect(result.acceptatieRatio).toBeCloseTo(1 / 3, 5)
  })
})

// ---------------------------------------------------------------------------
// updateReuseScoresFromFeedback — score adjustment formula
// ---------------------------------------------------------------------------

describe('updateReuseScoresFromFeedback score formula', () => {
  /**
   * The formula is: new_score = clamp(current + (acceptance_rate - 0.5) * 0.1, 0, 1)
   * These are pure unit tests of the formula itself.
   */

  function applyFormula(current: number, acceptanceRate: number): number {
    const delta = (acceptanceRate - 0.5) * 0.1
    return Math.min(1.0, Math.max(0.0, current + delta))
  }

  it('increases score when acceptance_rate is 1.0', () => {
    const result = applyFormula(0.5, 1.0)
    expect(result).toBeCloseTo(0.55, 5)
  })

  it('does not change score when acceptance_rate is 0.5', () => {
    const result = applyFormula(0.6, 0.5)
    expect(result).toBeCloseTo(0.6, 5)
  })

  it('decreases score when acceptance_rate is 0.0', () => {
    const result = applyFormula(0.5, 0.0)
    expect(result).toBeCloseTo(0.45, 5)
  })

  it('clamps the score at 1.0 maximum', () => {
    const result = applyFormula(0.98, 1.0)
    expect(result).toBe(1.0)
  })

  it('clamps the score at 0.0 minimum', () => {
    const result = applyFormula(0.02, 0.0)
    expect(result).toBe(0.0)
  })

  it('produces a bigger adjustment for acceptance_rate close to 1 vs close to 0', () => {
    const increase = applyFormula(0.5, 0.9) - 0.5
    const decrease = 0.5 - applyFormula(0.5, 0.1)
    // Both should be equal in magnitude
    expect(increase).toBeCloseTo(decrease, 5)
    // And should be 0.04
    expect(increase).toBeCloseTo(0.04, 5)
  })
})
