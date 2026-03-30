import { useState, useEffect, useCallback } from 'react'
import { calculateSectieAcceptanceRate, type SectieAcceptanceStats } from '@/lib/sectieFeedbackStats'
import { supabase } from '@/lib/supabaseClient'

/**
 * Returns acceptance stats for a single section.
 */
export function useSectieStats(sectieKey: string): {
  stats: SectieAcceptanceStats | null
  isLoading: boolean
} {
  const [stats, setStats] = useState<SectieAcceptanceStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!sectieKey) return
    setIsLoading(true)
    calculateSectieAcceptanceRate(sectieKey)
      .then(setStats)
      .finally(() => setIsLoading(false))
  }, [sectieKey])

  return { stats, isLoading }
}

/**
 * Returns acceptance stats for all sections that have feedback data.
 */
export function useAlleSectieStats(): {
  allStats: Record<string, SectieAcceptanceStats>
  isLoading: boolean
  refresh: () => void
} {
  const [allStats, setAllStats] = useState<Record<string, SectieAcceptanceStats>>({})
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('sectie_feedback')
        .select('sectie_key')

      if (error) {
        console.warn('[useSectieKwaliteit] Could not fetch sectie keys:', error.message)
        return
      }

      const uniqueKeys = [...new Set((data ?? []).map((r) => r.sectie_key as string))]
      const result: Record<string, SectieAcceptanceStats> = {}

      await Promise.all(
        uniqueKeys.map(async (key) => {
          result[key] = await calculateSectieAcceptanceRate(key)
        })
      )

      setAllStats(result)
    } catch (err) {
      console.warn('[useSectieKwaliteit] useAlleSectieStats failed silently:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { allStats, isLoading, refresh: load }
}

export function useSectieKwaliteit() {
  return { useSectieStats, useAlleSectieStats }
}
