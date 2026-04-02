import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useKantoor } from '@/hooks/useKantoor'
import type { SimilarityInstellingen } from '@/types'

const DEFAULT_INSTELLINGEN: SimilarityInstellingen = {
  gewichten: {
    afstand: 30,
    typeObject: 25,
    oppervlakte: 20,
    ouderheidRapport: 15,
    gebruiksdoel: 10,
  },
}

export function useSimilarityInstellingen() {
  const [instellingen, setInstellingen] = useState<SimilarityInstellingen>(DEFAULT_INSTELLINGEN)
  const [loading, setLoading] = useState(true)
  const { kantoorId } = useKantoor()

  useEffect(() => {
    async function fetchInstellingen() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setLoading(false)
        return
      }
      const { data, error } = await supabase
        .from('similarity_instellingen')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (!error && data) {
        setInstellingen({ gewichten: data.gewichten })
      }
      setLoading(false)
    }

    fetchInstellingen()

    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        fetchInstellingen()
      }
    })

    return () => {
      authSubscription.unsubscribe()
    }
  }, [])

  const updateInstellingen = useCallback(async (nieuw: SimilarityInstellingen) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase
      .from('similarity_instellingen')
      .upsert(
        {
          user_id: user.id,
          kantoor_id: kantoorId ?? null,
          gewichten: nieuw.gewichten,
          updated_at: new Date().toISOString(),
        },
        { onConflict: kantoorId ? 'kantoor_id' : 'user_id' }
      )
    if (!error) {
      setInstellingen(nieuw)
    }
  }, [kantoorId])

  return { instellingen, loading, updateInstellingen }
}
