import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Dossier } from '@/types'

function dossierToRow(dossier: Dossier, userId: string) {
  return {
    id: dossier.id,
    user_id: userId,
    dossiernummer: dossier.dossiernummer,
    huidige_stap: dossier.huidigeStap,
    status: dossier.status,
    versie_nummer: dossier.versieNummer,
    is_actualisatie: dossier.isActualisatie,
    vorige_versie_id: dossier.vorigeVersieId ?? null,
    stap1: dossier.stap1 ?? null,
    stap2: dossier.stap2 ?? null,
    stap3: dossier.stap3 ?? null,
    stap4: dossier.stap4 ?? null,
    stap5: dossier.stap5 ?? null,
    stap6: dossier.stap6 ?? null,
    stap7: dossier.stap7 ?? null,
    stap8: dossier.stap8 ?? null,
    stap9: dossier.stap9 ?? null,
    similarity_results: dossier.similarityResults ?? [],
    geselecteerde_referenties: dossier.geselecteerdeReferenties ?? [],
    rapport_secties: dossier.rapportSecties ?? {},
    updated_at: new Date().toISOString(),
  }
}

function rowToDossier(row: Record<string, unknown>): Dossier {
  return {
    id: row.id as string,
    dossiernummer: row.dossiernummer as string,
    versieNummer: (row.versie_nummer as number) ?? 1,
    isActualisatie: (row.is_actualisatie as boolean) ?? false,
    vorigeVersieId: row.vorige_versie_id as string | undefined,
    status: row.status as Dossier['status'],
    stap1: row.stap1 as Dossier['stap1'],
    stap2: row.stap2 as Dossier['stap2'],
    stap3: row.stap3 as Dossier['stap3'],
    stap4: row.stap4 as Dossier['stap4'],
    stap5: row.stap5 as Dossier['stap5'],
    stap6: row.stap6 as Dossier['stap6'],
    stap7: row.stap7 as Dossier['stap7'],
    stap8: row.stap8 as Dossier['stap8'],
    stap9: row.stap9 as Dossier['stap9'],
    similarityResults: (row.similarity_results as Dossier['similarityResults']) ?? [],
    geselecteerdeReferenties: (row.geselecteerde_referenties as string[]) ?? [],
    rapportSecties: (row.rapport_secties as Dossier['rapportSecties']) ?? {},
    huidigeStap: (row.huidige_stap as number) ?? 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useDossiers() {
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDossiers = useCallback(async () => {
    const { data, error } = await supabase
      .from('dossiers')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) {
      setDossiers(data.map(rowToDossier))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchDossiers()

    const channel = supabase
      .channel('dossiers_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dossiers' }, () => {
        fetchDossiers()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchDossiers])

  const createDossier = useCallback(async (dossier: Dossier) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const row = dossierToRow(dossier, user.id)
    const { error } = await supabase.from('dossiers').insert(row)
    if (!error) {
      setDossiers((current) => [dossier, ...current])
    }
  }, [])

  const updateDossier = useCallback(async (dossier: Dossier) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const row = dossierToRow(dossier, user.id)
    const { error } = await supabase
      .from('dossiers')
      .update(row)
      .eq('id', dossier.id)
    if (!error) {
      setDossiers((current) =>
        current.map((d) => (d.id === dossier.id ? dossier : d))
      )
    }
  }, [])

  const deleteDossier = useCallback(async (dossierId: string) => {
    const { error } = await supabase.from('dossiers').delete().eq('id', dossierId)
    if (!error) {
      setDossiers((current) => current.filter((d) => d.id !== dossierId))
    }
  }, [])

  return { dossiers, loading, createDossier, updateDossier, deleteDossier }
}
