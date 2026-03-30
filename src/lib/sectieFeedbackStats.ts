import { supabase } from '@/lib/supabaseClient'

export interface SectieAcceptanceStats {
  totaal: number
  geaccepteerd: number
  bewerkt: number
  afgewezen: number
  acceptatieRatio: number
}

/**
 * Calculates the acceptance rate for a given sectie_key based on all
 * stored feedback records in the sectie_feedback table.
 */
export async function calculateSectieAcceptanceRate(
  sectieKey: string
): Promise<SectieAcceptanceStats> {
  try {
    const { data, error } = await supabase
      .from('sectie_feedback')
      .select('feedback_type')
      .eq('sectie_key', sectieKey)

    if (error) {
      console.warn('[sectieFeedbackStats] Could not fetch feedback:', error.message)
      return { totaal: 0, geaccepteerd: 0, bewerkt: 0, afgewezen: 0, acceptatieRatio: 0 }
    }

    const rows = data ?? []
    const totaal = rows.length
    const geaccepteerd = rows.filter((r) => r.feedback_type === 'positief').length
    const bewerkt = rows.filter((r) => r.feedback_type === 'bewerkt').length
    const afgewezen = rows.filter((r) => r.feedback_type === 'negatief').length
    const acceptatieRatio = totaal > 0 ? geaccepteerd / totaal : 0

    return { totaal, geaccepteerd, bewerkt, afgewezen, acceptatieRatio }
  } catch {
    return { totaal: 0, geaccepteerd: 0, bewerkt: 0, afgewezen: 0, acceptatieRatio: 0 }
  }
}

/**
 * Updates the reuse_score of document_chunks in the Kennisbank based on
 * the acceptance rates of sections with feedback data.
 *
 * - acceptatieRatio > 0.8 → increase reuse_score by 0.1 (max 1.0)
 * - acceptatieRatio < 0.3 → decrease reuse_score by 0.1 (min 0.0)
 */
export async function updateKennisbankReuseScores(): Promise<void> {
  try {
    // Get all unique sectie_keys that have feedback
    const { data: sectieData, error: sectieError } = await supabase
      .from('sectie_feedback')
      .select('sectie_key')

    if (sectieError) {
      console.warn('[sectieFeedbackStats] Could not fetch sectie keys:', sectieError.message)
      return
    }

    const uniqueSectieKeys = [...new Set((sectieData ?? []).map((r) => r.sectie_key as string))]

    for (const sectieKey of uniqueSectieKeys) {
      const stats = await calculateSectieAcceptanceRate(sectieKey)
      if (stats.totaal === 0) continue

      // Derive chapter pattern from sectie key (e.g. 'b1-algemeen' → 'B')
      const chapterMatch = sectieKey.match(/^([a-zA-Z]+)/i)
      if (!chapterMatch) continue
      const chapter = chapterMatch[1].toUpperCase()

      // Fetch matching chunks
      const { data: chunks, error: chunksError } = await supabase
        .from('document_chunks')
        .select('id, reuse_score')
        .eq('chapter', chapter)

      if (chunksError) {
        console.warn('[sectieFeedbackStats] Could not fetch chunks for chapter:', chapter, chunksError.message)
        continue
      }

      for (const chunk of chunks ?? []) {
        let newScore: number = chunk.reuse_score ?? 0.5

        if (stats.acceptatieRatio > 0.8) {
          newScore = Math.min(1.0, newScore + 0.1)
        } else if (stats.acceptatieRatio < 0.3) {
          newScore = Math.max(0.0, newScore - 0.1)
        } else {
          continue // No update needed for mid-range
        }

        await supabase
          .from('document_chunks')
          .update({ reuse_score: newScore })
          .eq('id', chunk.id)
      }
    }
  } catch (err) {
    console.warn('[sectieFeedbackStats] updateKennisbankReuseScores failed silently:', err)
  }
}
