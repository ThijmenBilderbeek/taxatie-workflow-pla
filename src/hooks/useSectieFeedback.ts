import { supabase } from '@/lib/supabaseClient'

export interface SectieFeedbackRecord {
  feedbackType: 'positief' | 'negatief' | 'bewerkt'
  origineleTekst: string
  bewerkteTekst?: string
  reden?: string
  toelichting?: string
  sectieKey: string
  createdAt: string
}

/**
 * Saves section-level feedback to the sectie_feedback table.
 * Errors are handled gracefully and never block the main flow.
 */
export async function saveSectieFeedback(
  dossierId: string,
  sectieKey: string,
  feedbackType: 'positief' | 'negatief' | 'bewerkt',
  origineleTekst: string,
  bewerkteTekst?: string,
  reden?: string,
  toelichting?: string
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('sectie_feedback').insert({
      user_id: user.id,
      dossier_id: dossierId,
      sectie_key: sectieKey,
      feedback_type: feedbackType,
      originele_tekst: origineleTekst,
      bewerkte_tekst: bewerkteTekst ?? null,
      reden: reden ?? null,
      toelichting: toelichting ?? null,
    })

    if (error) {
      console.warn('[useSectieFeedback] Could not save sectie feedback:', error.message)
    }
  } catch (err) {
    console.warn('[useSectieFeedback] saveSectieFeedback failed silently:', err)
  }
}

/**
 * Fetches the most recent negative/edited feedback for a given sectieKey.
 * Used to enrich AI generation prompts with earlier feedback.
 */
export async function getSectieFeedback(
  sectieKey: string,
  limit = 5
): Promise<SectieFeedbackRecord[]> {
  try {
    const { data, error } = await supabase
      .from('sectie_feedback')
      .select('feedback_type, originele_tekst, bewerkte_tekst, reden, toelichting, sectie_key, created_at')
      .eq('sectie_key', sectieKey)
      .in('feedback_type', ['negatief', 'bewerkt'])
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.warn('[useSectieFeedback] Could not fetch sectie feedback:', error.message)
      return []
    }

    return (data ?? []).map((row) => ({
      feedbackType: row.feedback_type as 'positief' | 'negatief' | 'bewerkt',
      origineleTekst: row.originele_tekst ?? '',
      bewerkteTekst: row.bewerkte_tekst ?? undefined,
      reden: row.reden ?? undefined,
      toelichting: row.toelichting ?? undefined,
      sectieKey: row.sectie_key ?? sectieKey,
      createdAt: row.created_at ?? '',
    }))
  } catch {
    return []
  }
}

export function useSectieFeedback() {
  return { saveSectieFeedback, getSectieFeedback }
}
