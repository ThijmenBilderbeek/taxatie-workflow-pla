import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
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
      const { data, error } = await supabase
        .from('similarity_feedback')
        .select('*')
        .order('created_at', { ascending: false })

      if (!error && data) {
        setSimilarityFeedback(data.map(dbRowToFeedback))
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
    const { error } = await supabase
      .from('similarity_feedback')
      .insert(feedbackToDbRow(feedback))

    if (error) console.error('Fout bij aanmaken feedback:', error)
  }

  const deleteFeedback = async (id: string) => {
    const { error } = await supabase
      .from('similarity_feedback')
      .delete()
      .eq('id', id)

    if (error) console.error('Fout bij verwijderen feedback:', error)
  }

  return { similarityFeedback, loading, addFeedback, deleteFeedback }
}
