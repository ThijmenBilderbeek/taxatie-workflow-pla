import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { apiGet, apiPost, apiPut } from '../lib/api'
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
      try {
        const data = await apiGet<Record<string, unknown>>('/api/instellingen')
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
      } catch {
        // Geen instellingen gevonden, gebruik defaults
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

    try {
      if (instellingenId) {
        await apiPut(`/api/instellingen/${instellingenId}`, row)
      } else {
        const data = await apiPost<Record<string, unknown>>('/api/instellingen', row)
        setInstellingenId(data.id as string)
      }
    } catch (error) {
      console.error('Fout bij opslaan instellingen:', error)
    }

    setSimilarityInstellingen(instellingen)
  }

  return { similarityInstellingen, loading, updateInstellingen }
}
