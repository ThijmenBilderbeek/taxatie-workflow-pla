import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api'
import type { HistorischRapport } from '../types'

function dbRowToRapport(row: Record<string, unknown>): HistorischRapport {
  const adresParts = ((row.adres as string) || '').split(' ')
  const huisnummer = adresParts.length > 1 ? adresParts[adresParts.length - 1] : ''
  const straat = adresParts.length > 1 ? adresParts.slice(0, -1).join(' ') : (row.adres as string) || ''

  return {
    id: row.id as string,
    adres: {
      straat,
      huisnummer,
      postcode: (row.postcode as string) || '',
      plaats: (row.stad as string) || '',
    },
    coordinaten: {
      lat: (row.lat as number) || 0,
      lng: (row.lng as number) || 0,
    },
    typeObject: (row.object_type as HistorischRapport['typeObject']) || 'overig',
    gebruiksdoel: 'eigenaar_gebruiker',
    bvo: (row.oppervlakte as number) || 0,
    marktwaarde: Number(row.marktwaarde) || 0,
    waardepeildatum: (row.taxatiedatum as string) || new Date().toISOString().split('T')[0],
    rapportTeksten: row.rapport_tekst ? { algemeen: row.rapport_tekst as string } : {},
    wizardData: {},
  }
}

function rapportToDbRow(rapport: HistorischRapport) {
  const adres = `${rapport.adres.straat} ${rapport.adres.huisnummer}`.trim()
  return {
    id: rapport.id,
    adres,
    postcode: rapport.adres.postcode,
    stad: rapport.adres.plaats,
    lat: rapport.coordinaten.lat,
    lng: rapport.coordinaten.lng,
    object_type: rapport.typeObject,
    oppervlakte: rapport.bvo,
    marktwaarde: rapport.marktwaarde,
    taxatiedatum: rapport.waardepeildatum,
    rapport_tekst: Object.values(rapport.rapportTeksten).join('\n\n') || null,
  }
}

export function useHistorischeRapporten() {
  const [historischeRapporten, setHistorischeRapporten] = useState<HistorischRapport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRapporten = async () => {
      try {
        const data = await apiGet<Record<string, unknown>[]>('/api/rapporten')
        setHistorischeRapporten(data.map(dbRowToRapport))
      } catch (error) {
        console.error('Fout bij ophalen rapporten:', error)
      }
      setLoading(false)
    }

    fetchRapporten()

    const channel = supabase
      .channel('rapporten-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'historische_rapporten' }, () => {
        fetchRapporten()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const addRapport = async (rapport: HistorischRapport) => {
    try {
      await apiPost('/api/rapporten', rapportToDbRow(rapport))
    } catch (error) {
      console.error('Fout bij aanmaken rapport:', error)
    }
  }

  const updateRapport = async (rapport: HistorischRapport) => {
    try {
      await apiPut(`/api/rapporten/${rapport.id}`, rapportToDbRow(rapport))
    } catch (error) {
      console.error('Fout bij bijwerken rapport:', error)
    }
  }

  const deleteRapport = async (id: string) => {
    try {
      await apiDelete(`/api/rapporten/${id}`)
    } catch (error) {
      console.error('Fout bij verwijderen rapport:', error)
    }
  }

  const addRapporten = async (rapporten: HistorischRapport[]) => {
    try {
      await apiPost('/api/rapporten/bulk', rapporten.map(rapportToDbRow))
    } catch (error) {
      console.error('Fout bij aanmaken rapporten:', error)
    }
  }

  return { historischeRapporten, loading, addRapport, updateRapport, deleteRapport, addRapporten }
}
