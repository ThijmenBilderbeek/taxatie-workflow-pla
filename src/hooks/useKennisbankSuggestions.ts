import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { ChunkType, MarketSegment } from '@/types/kennisbank'
import type { ObjectType } from '@/types'

export interface KennisbankSuggestie {
  id: string
  documentId: string
  cleanText: string
  templateText?: string
  chapter: string
  chunkType: ChunkType
  reuseScore: number
  variablesDetected: string[]
  templateCandidate: boolean
}

export interface UseKennisbankSuggestiesOptions {
  objectType?: ObjectType
  marketSegment?: MarketSegment
  chapter?: string
  city?: string
  limit?: number
}

export function useKennisbankSuggestions() {
  const [suggesties, setSuggesties] = useState<KennisbankSuggestie[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSuggesties = useCallback(async (options: UseKennisbankSuggestiesOptions) => {
    const { objectType, marketSegment, chapter, city, limit = 10 } = options

    if (!objectType && !marketSegment) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('document_chunks')
        .select('id, document_id, clean_text, template_text, chapter, chunk_type, reuse_score, variables_detected, template_candidate')
        .order('template_candidate', { ascending: false })
        .order('reuse_score', { ascending: false })
        .limit(limit)

      if (objectType) {
        query = query.eq('object_type', objectType)
      }

      if (marketSegment) {
        query = query.eq('market_segment', marketSegment)
      }

      if (chapter) {
        query = query.eq('chapter', chapter)
      }

      if (city) {
        query = query.ilike('city', `%${city}%`)
      }

      const { data, error: queryError } = await query

      if (queryError) {
        setError(queryError.message)
        return
      }

      const mapped: KennisbankSuggestie[] = (data || []).map((row) => ({
        id: row.id as string,
        documentId: row.document_id as string,
        cleanText: (row.clean_text as string) || '',
        templateText: row.template_text as string | undefined,
        chapter: (row.chapter as string) || '',
        chunkType: row.chunk_type as ChunkType,
        reuseScore: (row.reuse_score as number) || 0,
        variablesDetected: (row.variables_detected as string[]) || [],
        templateCandidate: (row.template_candidate as boolean) || false,
      }))

      setSuggesties(mapped)
    } catch (err) {
      setError('Fout bij het ophalen van suggesties')
      console.error('[useKennisbankSuggestions] fetchSuggesties error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clearSuggesties = useCallback(() => {
    setSuggesties([])
    setError(null)
  }, [])

  return {
    suggesties,
    isLoading,
    error,
    fetchSuggesties,
    clearSuggesties,
  }
}
