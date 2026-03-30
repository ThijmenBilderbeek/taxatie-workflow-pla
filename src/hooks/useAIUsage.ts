import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface AIUsageRow {
  id: string
  user_id: string | null
  dossier_id: string | null
  sectie_key: string
  model: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  estimated_cost_usd: number
  is_cached: boolean
  is_batch: boolean
  created_at: string
}

export interface AIUsageOptions {
  dossierId?: string
  days?: number
}

export interface DossierCostEntry {
  dossierId: string
  cost: number
  calls: number
}

export interface DailyUsageEntry {
  date: string
  cost: number
  calls: number
}

export interface AIUsageData {
  totalCost: number
  totalCalls: number
  totalTokens: number
  cacheHitRate: number
  costByModel: Record<string, number>
  costByDossier: DossierCostEntry[]
  dailyUsage: DailyUsageEntry[]
  recentCalls: AIUsageRow[]
  isLoading: boolean
  error: string | null
}

export function useAIUsage(options: AIUsageOptions = {}): AIUsageData {
  const { dossierId, days = 30 } = options

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<AIUsageRow[]>([])

  useEffect(() => {
    let cancelled = false

    async function fetchUsage() {
      setIsLoading(true)
      setError(null)

      try {
        const since = new Date()
        since.setDate(since.getDate() - days)

        let query = supabase
          .from('ai_usage_log')
          .select('*')
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: false })

        if (dossierId) {
          query = query.eq('dossier_id', dossierId)
        }

        const { data, error: supabaseError } = await query

        if (cancelled) return

        if (supabaseError) {
          setError(supabaseError.message)
          setRows([])
        } else {
          setRows((data ?? []) as AIUsageRow[])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error')
          setRows([])
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void fetchUsage()
    return () => { cancelled = true }
  }, [dossierId, days])

  // Derived aggregates
  const totalCost = rows.reduce((sum, r) => sum + Number(r.estimated_cost_usd), 0)
  const totalCalls = rows.length
  const totalTokens = rows.reduce((sum, r) => sum + r.total_tokens, 0)
  const cachedCalls = rows.filter((r) => r.is_cached).length
  const cacheHitRate = totalCalls > 0 ? (cachedCalls / totalCalls) * 100 : 0

  // Cost by model
  const costByModel: Record<string, number> = {}
  for (const row of rows) {
    costByModel[row.model] = (costByModel[row.model] ?? 0) + Number(row.estimated_cost_usd)
  }

  // Cost by dossier
  const dossierMap = new Map<string, { cost: number; calls: number }>()
  for (const row of rows) {
    if (!row.dossier_id) continue
    const entry = dossierMap.get(row.dossier_id) ?? { cost: 0, calls: 0 }
    entry.cost += Number(row.estimated_cost_usd)
    entry.calls += 1
    dossierMap.set(row.dossier_id, entry)
  }
  const costByDossier: DossierCostEntry[] = Array.from(dossierMap.entries())
    .map(([id, entry]) => ({ dossierId: id, cost: entry.cost, calls: entry.calls }))
    .sort((a, b) => b.cost - a.cost)

  // Daily usage
  const dailyMap = new Map<string, { cost: number; calls: number }>()
  for (const row of rows) {
    const date = row.created_at.slice(0, 10) // YYYY-MM-DD
    const entry = dailyMap.get(date) ?? { cost: 0, calls: 0 }
    entry.cost += Number(row.estimated_cost_usd)
    entry.calls += 1
    dailyMap.set(date, entry)
  }
  const dailyUsage: DailyUsageEntry[] = Array.from(dailyMap.entries())
    .map(([date, entry]) => ({ date, cost: entry.cost, calls: entry.calls }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Recent calls (last 20)
  const recentCalls = rows.slice(0, 20)

  return {
    totalCost,
    totalCalls,
    totalTokens,
    cacheHitRate,
    costByModel,
    costByDossier,
    dailyUsage,
    recentCalls,
    isLoading,
    error,
  }
}
