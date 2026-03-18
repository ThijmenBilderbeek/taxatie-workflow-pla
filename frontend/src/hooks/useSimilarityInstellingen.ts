import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { SimilarityInstellingen } from '../types'

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
  const [similarityInstellingen, setSimilarityInstellingen] = useState<SimilarityInstellingen>(DEFAULT_INSTELLINGEN)
  const [instellingenId, setInstellingenId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchInstellingen = async () => {
      const { data, error } = await supabase
        .from('similarity_instellingen')
        .select('*')
        .limit(1)
        .single()

      if (!error && data) {
        setInstellingenId(data.id as string)
        setSimilarityInstellingen({
          gewichten: {
            afstand: (data.gewicht_afstand as number) ?? 30,
            typeObject: (data.gewicht_type_object as number) ?? 25,
            oppervlakte: (data.gewicht_oppervlakte as number) ?? 20,
            ouderheidRapport: (data.gewicht_ouderheid as number) ?? 15,
            gebruiksdoel: (data.gewicht_gebruiksdoel as number) ?? 10,
          },
        })
      }
      setLoading(false)
    }

    fetchInstellingen()

    const channel = supabase
      .channel('instellingen-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'similarity_instellingen' }, () => {
        fetchInstellingen()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const updateInstellingen = async (instellingen: SimilarityInstellingen) => {
    const row = {
      gewicht_afstand: instellingen.gewichten.afstand,
      gewicht_type_object: instellingen.gewichten.typeObject,
      gewicht_oppervlakte: instellingen.gewichten.oppervlakte,
      gewicht_ouderheid: instellingen.gewichten.ouderheidRapport,
      gewicht_gebruiksdoel: instellingen.gewichten.gebruiksdoel,
    }

    if (instellingenId) {
      const { error } = await supabase
        .from('similarity_instellingen')
        .update(row)
        .eq('id', instellingenId)

      if (error) console.error('Fout bij bijwerken instellingen:', error)
    } else {
      const { data, error } = await supabase
        .from('similarity_instellingen')
        .insert(row)
        .select()
        .single()

      if (!error && data) {
        setInstellingenId(data.id as string)
      } else if (error) {
        console.error('Fout bij aanmaken instellingen:', error)
      }
    }

    setSimilarityInstellingen(instellingen)
  }

  return { similarityInstellingen, loading, updateInstellingen }
}
