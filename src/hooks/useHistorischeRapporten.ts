import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { HistorischRapport } from '@/types'

function rapportToRow(rapport: HistorischRapport, userId: string) {
  return {
    user_id: userId,
    rapport_id: rapport.id,
    adres: rapport.adres,
    type_object: rapport.typeObject,
    gebruiksdoel: rapport.gebruiksdoel,
    bvo: rapport.bvo ?? null,
    marktwaarde: rapport.marktwaarde ?? null,
    bar: rapport.bar ?? null,
    nar: rapport.nar ?? null,
    waardepeildatum: rapport.waardepeildatum || null,
    coordinaten: rapport.coordinaten ?? null,
    rapport_teksten: rapport.rapportTeksten ?? {},
    wizard_data: rapport.wizardData ?? {},
    updated_at: new Date().toISOString(),
  }
}

function rowToRapport(row: Record<string, unknown>): HistorischRapport {
  return {
    id: row.rapport_id as string,
    adres: row.adres as HistorischRapport['adres'],
    coordinaten: (row.coordinaten as HistorischRapport['coordinaten']) ?? { lat: 0, lng: 0 },
    typeObject: row.type_object as HistorischRapport['typeObject'],
    gebruiksdoel: row.gebruiksdoel as HistorischRapport['gebruiksdoel'],
    bvo: row.bvo as number,
    marktwaarde: row.marktwaarde as number,
    bar: row.bar as number | undefined,
    nar: row.nar as number | undefined,
    waardepeildatum: row.waardepeildatum as string,
    rapportTeksten: (row.rapport_teksten as Record<string, string>) ?? {},
    wizardData: (row.wizard_data as HistorischRapport['wizardData']) ?? {},
  }
}

export function useHistorischeRapporten() {
  const [rapporten, setRapporten] = useState<HistorischRapport[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRapporten = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setRapporten([])
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('historische_rapporten')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
    if (!error && data) {
      setRapporten(data.map(rowToRapport))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRapporten()

    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        fetchRapporten()
      }
    })

    const channel = supabase
      .channel('historische_rapporten_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'historische_rapporten' }, () => {
        fetchRapporten()
      })
      .subscribe()

    return () => {
      authSubscription.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [fetchRapporten])

  const addRapport = useCallback(async (rapport: HistorischRapport) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const row = rapportToRow(rapport, user.id)
    const { error } = await supabase.from('historische_rapporten').insert(row)
    if (!error) {
      setRapporten((current) => [rapport, ...current])
    }
  }, [])

  const updateRapport = useCallback(async (rapport: HistorischRapport) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const row = rapportToRow(rapport, user.id)
    const { error } = await supabase
      .from('historische_rapporten')
      .update(row)
      .eq('rapport_id', rapport.id)
    if (!error) {
      setRapporten((current) =>
        current.map((r) => (r.id === rapport.id ? rapport : r))
      )
    }
  }, [])

  const deleteRapport = useCallback(async (id: string) => {
    const { error } = await supabase.from('historische_rapporten').delete().eq('rapport_id', id)
    if (!error) {
      setRapporten((current) => current.filter((r) => r.id !== id))
    }
  }, [])

  return { rapporten, loading, addRapport, updateRapport, deleteRapport }
}
