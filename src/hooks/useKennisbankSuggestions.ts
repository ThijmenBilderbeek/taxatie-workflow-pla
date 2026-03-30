import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { SEMANTIC_MATCH_THRESHOLD } from '@/lib/kennisbankRetriever'
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
  /** Optional vector embedding for future semantic use. */
  embedding?: number[]
}

export interface UseKennisbankSuggestiesOptions {
  objectType?: ObjectType
  marketSegment?: MarketSegment
  chapter?: string
  city?: string
  limit?: number
  /** When provided, uses semantic search instead of exact column matching. */
  queryText?: string
}

export function useKennisbankSuggestions() {
  const [suggesties, setSuggesties] = useState<KennisbankSuggestie[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSuggesties = useCallback(async (options: UseKennisbankSuggestiesOptions) => {
    const { objectType, marketSegment, chapter, city, limit = 10, queryText } = options

    if (!objectType && !marketSegment && !queryText) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // -------------------------------------------------------------------
      // Semantic search path — when queryText is provided
      // -------------------------------------------------------------------
      if (queryText) {
        const embeddingResponse = await supabase.functions.invoke<{ embedding?: number[] }>(
          'openai-classify',
          { body: { text: queryText, generateEmbedding: true } }
        )

        const embedding = embeddingResponse.data?.embedding
        if (!embedding || !Array.isArray(embedding)) {
          // Fallback to exact-match when embedding generation fails
          console.warn('[useKennisbankSuggestions] geen embedding ontvangen, val terug op exacte zoekactie')
        } else {
          const { data: rpcData, error: rpcError } = await supabase.rpc('match_document_chunks', {
            query_embedding: embedding,
            match_threshold: SEMANTIC_MATCH_THRESHOLD,
            match_count: limit,
            filter_object_type: objectType ?? null,
            filter_market_segment: marketSegment ?? null,
          })

          if (rpcError) {
            setError(rpcError.message)
            return
          }

          const mapped: KennisbankSuggestie[] = (rpcData || []).map((row: Record<string, unknown>) => ({
            id: row.id as string,
            documentId: row.document_id as string,
            cleanText: (row.clean_text as string) || '',
            templateText: row.template_text as string | undefined,
            chapter: (row.chapter as string) || '',
            chunkType: row.chunk_type as ChunkType,
            reuseScore: (row.reuse_score as number) || 0,
            variablesDetected: (row.variables_detected as string[]) || [],
            templateCandidate: (row.template_candidate as boolean) || false,
            embedding: (row.embedding as number[]) ?? undefined,
          }))

          setSuggesties(mapped)
          return
        }
      }

      // -------------------------------------------------------------------
      // Exact match path — existing behaviour
      // -------------------------------------------------------------------
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
