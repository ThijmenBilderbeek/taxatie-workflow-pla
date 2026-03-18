import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { apiGet, apiPost, apiDelete } from '../lib/api'
import type { SimilarityFeedback } from '../types'

function dbRowToFeedback(row: Record<string, unknown>): SimilarityFeedback {
  return {
    id: row.id as string,
    dossierId: row.dossier_id as string,
    referentieRapportId: row.historisch_rapport_id as string,
    sectie: (row.sectie as string) || '',
    score: (row.score as number) > 0 ? 'positief' : 'negatief',
    reden: (row.reden as string) || '',
    categorie: 'anders',
    createdAt: row.created_at as string,
  }
}

function feedbackToDbRow(feedback: SimilarityFeedback) {
  return {
    id: feedback.id,
    dossier_id: feedback.dossierId,
    historisch_rapport_id: feedback.referentieRapportId,
    sectie: feedback.sectie,
    score: feedback.score === 'positief' ? 1 : -1,
    reden: feedback.reden,
  }
}

export function useSimilarityFeedback() {
  const [similarityFeedback, setSimilarityFeedback] = useState<SimilarityFeedback[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchFeedback = async () => {
      try {
        const data = await apiGet<Record<string, unknown>[]>('/api/feedback')
        setSimilarityFeedback(data.map(dbRowToFeedback))
      } catch (error) {
        console.error('Fout bij ophalen feedback:', error)
      }
      setLoading(false)
    }

    fetchFeedback()

    const channel = supabase
      .channel('feedback-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'similarity_feedback' }, () => {
        fetchFeedback()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const addFeedback = async (feedback: SimilarityFeedback) => {
    try {
      await apiPost('/api/feedback', feedbackToDbRow(feedback))
    } catch (error) {
      console.error('Fout bij aanmaken feedback:', error)
    }
  }

  const deleteFeedback = async (id: string) => {
    try {
      await apiDelete(`/api/feedback/${id}`)
    } catch (error) {
      console.error('Fout bij verwijderen feedback:', error)
    }
  }

  return { similarityFeedback, loading, addFeedback, deleteFeedback }
}
