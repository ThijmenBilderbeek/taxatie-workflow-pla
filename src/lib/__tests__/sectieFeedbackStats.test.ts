import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabaseClient'
import { calculateSectieAcceptanceRate, updateKennisbankReuseScores } from '../sectieFeedbackStats'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type QueryBuilder = {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

function mockFromSequence(calls: Array<{ data: unknown; error: unknown }>) {
  let callIndex = 0
  vi.mocked(supabase.from).mockImplementation(() => {
    const current = calls[callIndex++] ?? { data: [], error: null }
    const builder: QueryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue(current),
      update: vi.fn().mockReturnThis(),
    }
    return builder as never
  })
}

// ---------------------------------------------------------------------------
// calculateSectieAcceptanceRate
// ---------------------------------------------------------------------------

describe('calculateSectieAcceptanceRate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns zero stats when no feedback records exist', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    const result = await calculateSectieAcceptanceRate('b1-algemeen')

    expect(result.totaal).toBe(0)
    expect(result.geaccepteerd).toBe(0)
    expect(result.bewerkt).toBe(0)
    expect(result.afgewezen).toBe(0)
    expect(result.acceptatieRatio).toBe(0)
  })

  it('calculates correct stats for all-positive feedback', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [
          { feedback_type: 'positief' },
          { feedback_type: 'positief' },
          { feedback_type: 'positief' },
        ],
        error: null,
      }),
    }
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    const result = await calculateSectieAcceptanceRate('b1-algemeen')

    expect(result.totaal).toBe(3)
    expect(result.geaccepteerd).toBe(3)
    expect(result.bewerkt).toBe(0)
    expect(result.afgewezen).toBe(0)
    expect(result.acceptatieRatio).toBe(1)
  })

  it('calculates correct stats for all-rejected feedback', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [
          { feedback_type: 'negatief' },
          { feedback_type: 'negatief' },
        ],
        error: null,
      }),
    }
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    const result = await calculateSectieAcceptanceRate('b1-algemeen')

    expect(result.totaal).toBe(2)
    expect(result.geaccepteerd).toBe(0)
    expect(result.afgewezen).toBe(2)
    expect(result.acceptatieRatio).toBe(0)
  })

  it('calculates correct stats for mixed feedback', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [
          { feedback_type: 'positief' },
          { feedback_type: 'positief' },
          { feedback_type: 'bewerkt' },
          { feedback_type: 'negatief' },
        ],
        error: null,
      }),
    }
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    const result = await calculateSectieAcceptanceRate('b1-algemeen')

    expect(result.totaal).toBe(4)
    expect(result.geaccepteerd).toBe(2)
    expect(result.bewerkt).toBe(1)
    expect(result.afgewezen).toBe(1)
    expect(result.acceptatieRatio).toBe(0.5)
  })

  it('returns zero stats on database error', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    }
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    const result = await calculateSectieAcceptanceRate('b1-algemeen')

    expect(result.totaal).toBe(0)
    expect(result.acceptatieRatio).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// updateKennisbankReuseScores
// ---------------------------------------------------------------------------

describe('updateKennisbankReuseScores', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when there are no sectie_feedback records', async () => {
    const builder = {
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    await expect(updateKennisbankReuseScores()).resolves.toBeUndefined()
  })

  it('does not throw on database errors', async () => {
    const builder = {
      select: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    }
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    await expect(updateKennisbankReuseScores()).resolves.toBeUndefined()
  })

  it('queries document_chunks for chapters of sections that have feedback', async () => {
    const fromCalls: string[] = []
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      fromCalls.push(table)
      if (table === 'sectie_feedback') {
        return {
          select: vi.fn().mockResolvedValue({ data: [{ sectie_key: 'b1-algemeen' }], error: null }),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        } as never
      }
      // document_chunks: return empty array (no chunks to update)
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as never
    })

    // First sectie_feedback call (get unique keys), second call (get feedback_type for b1-algemeen)
    let sectieCallCount = 0
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      fromCalls.push(table)
      if (table === 'sectie_feedback') {
        sectieCallCount++
        if (sectieCallCount === 1) {
          return { select: vi.fn().mockResolvedValue({ data: [{ sectie_key: 'b1-algemeen' }], error: null }) } as never
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [{ feedback_type: 'positief' }], error: null }),
        } as never
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as never
    })

    await updateKennisbankReuseScores()

    expect(fromCalls).toContain('sectie_feedback')
    expect(fromCalls).toContain('document_chunks')
  })
})
