import { supabase } from './supabaseClient'

/**
 * Fetches the AI-generated feedback summary for the current user and a given
 * context (field or section key).
 *
 * Layer 1 of the 3-layer feedback system.
 */
export async function getFeedbackSamenvatting(
  contextKey: string,
  contextType: 'veld' | 'sectie',
  kantoorId?: string | null
): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    let query = supabase
      .from('feedback_samenvattingen')
      .select('samenvatting')
      .eq('context_key', contextKey)
      .eq('context_type', contextType)

    if (kantoorId) {
      query = query.eq('kantoor_id', kantoorId)
    } else {
      query = query.eq('user_id', user.id)
    }

    const { data, error } = await query.maybeSingle()

    if (error || !data) return null
    return (data.samenvatting as string) ?? null
  } catch {
    return null
  }
}

/**
 * Fetches the AI-generated writing profile for the current user.
 *
 * Layer 3 of the 3-layer feedback system.
 */
export async function getSchrijfProfiel(kantoorId?: string | null): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    let query = supabase
      .from('gebruiker_schrijfprofiel')
      .select('profiel')

    if (kantoorId) {
      query = query.eq('kantoor_id', kantoorId)
    } else {
      query = query.eq('user_id', user.id)
    }

    const { data, error } = await query.maybeSingle()

    if (error || !data) return null
    return (data.profiel as string) ?? null
  } catch {
    return null
  }
}

/**
 * Non-blocking trigger that fetches ALL feedback for the given context,
 * calls the `openai-summarize-feedback` Edge Function, and upserts the
 * resulting summary into `feedback_samenvattingen`.
 *
 * Should be called after new feedback is saved (both veld and sectie).
 * Uses `void` so callers are never blocked.
 */
export function triggerFeedbackSamenvattingUpdate(
  contextKey: string,
  contextType: 'veld' | 'sectie',
  kantoorId?: string | null
): void {
  void (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch ALL feedback records for this context
      let feedbackRecords: Array<Record<string, unknown>> = []

      if (contextType === 'veld') {
        const { data } = await supabase
          .from('suggestie_feedback')
          .select('feedback_type, reden, toelichting, gesuggereerde_tekst')
          .eq('veld_naam', contextKey)
          .eq('feedback_type', 'negatief')
          .order('created_at', { ascending: false })
        feedbackRecords = data ?? []
      } else {
        const { data } = await supabase
          .from('sectie_feedback')
          .select('feedback_type, reden, toelichting, originele_tekst, bewerkte_tekst')
          .eq('sectie_key', contextKey)
          .eq('user_id', user.id)
          .in('feedback_type', ['negatief', 'bewerkt'])
          .order('created_at', { ascending: false })
        feedbackRecords = data ?? []
      }

      if (feedbackRecords.length === 0) return

      // Call the summarize Edge Function
      const { data: result, error } = await supabase.functions.invoke('openai-summarize-feedback', {
        body: { contextKey, contextType, feedbackRecords },
      })

      if (error || !result?.samenvatting) return

      // Upsert the summary for this user + context
      await supabase
        .from('feedback_samenvattingen')
        .upsert(
          {
            user_id: user.id,
            kantoor_id: kantoorId ?? null,
            context_key: contextKey,
            context_type: contextType,
            samenvatting: result.samenvatting as string,
            feedback_count: feedbackRecords.length,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,context_key,context_type' }
        )
    } catch (err) {
      console.warn('[feedbackEnrichment] triggerFeedbackSamenvattingUpdate failed silently:', err)
    }
  })()
}

/**
 * Non-blocking trigger that fetches the last 20 'bewerkt' feedback records
 * for the current user, calls the `openai-update-schrijfprofiel` Edge Function,
 * and upserts the resulting profile into `gebruiker_schrijfprofiel`.
 *
 * Should be called after a user saves an edited AI-generated section.
 * Uses `void` so callers are never blocked.
 */
export function triggerSchrijfProfielUpdate(kantoorId?: string | null): void {
  void (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch last 20 'bewerkt' records for this user
      const { data: bewerkingen } = await supabase
        .from('sectie_feedback')
        .select('originele_tekst, bewerkte_tekst, sectie_key')
        .eq('user_id', user.id)
        .eq('feedback_type', 'bewerkt')
        .not('originele_tekst', 'is', null)
        .not('bewerkte_tekst', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20)

      if (!bewerkingen || bewerkingen.length === 0) return

      // Call the profile update Edge Function
      const { data: result, error } = await supabase.functions.invoke('openai-update-schrijfprofiel', {
        body: { bewerkingen },
      })

      if (error || !result?.profiel) return

      // Upsert the writing profile for this user
      await supabase
        .from('gebruiker_schrijfprofiel')
        .upsert(
          {
            user_id: user.id,
            kantoor_id: kantoorId ?? null,
            profiel: result.profiel as string,
            bewerkingen_verwerkt: bewerkingen.length,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
    } catch (err) {
      console.warn('[feedbackEnrichment] triggerSchrijfProfielUpdate failed silently:', err)
    }
  })()
}
