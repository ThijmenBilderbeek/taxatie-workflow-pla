import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
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

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('similarity_instellingen')
        .select('*')
        .maybeSingle()
      if (!error && data) {
        setInstellingen({ gewichten: data.gewichten })
      }
      setLoading(false)
    }
    fetch()
  }, [])

  const updateInstellingen = useCallback(async (nieuw: SimilarityInstellingen) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase
      .from('similarity_instellingen')
      .upsert(
        { user_id: user.id, gewichten: nieuw.gewichten, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    if (!error) {
      setInstellingen(nieuw)
    }
  }, [])

  return { instellingen, loading, updateInstellingen }
}
