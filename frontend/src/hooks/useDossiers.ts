import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api'
import type { Dossier } from '../types'

function dbRowToDossier(row: Record<string, unknown>): Dossier {
  const wizardData = (row.wizard_data as Record<string, unknown>) || {}
  return {
    id: row.id as string,
    dossiernummer: row.dossiernummer as string,
    versieNummer: (row.versie_nummer as number) ?? 1,
    isActualisatie: (row.is_actualisatie as boolean) ?? false,
    status: (row.status as Dossier['status']) ?? 'concept',
    similarityResults: (row.similarity_results as Dossier['similarityResults']) ?? [],
    geselecteerdeReferenties: (row.geselecteerde_referenties as string[]) ?? [],
    rapportSecties: (row.rapport_secties as Dossier['rapportSecties']) ?? {},
    huidigeStap: (row.huidige_stap as number) ?? 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    stap1: wizardData.stap1 as Dossier['stap1'],
    stap2: wizardData.stap2 as Dossier['stap2'],
    stap3: wizardData.stap3 as Dossier['stap3'],
    stap4: wizardData.stap4 as Dossier['stap4'],
    stap5: wizardData.stap5 as Dossier['stap5'],
    stap6: wizardData.stap6 as Dossier['stap6'],
    stap7: wizardData.stap7 as Dossier['stap7'],
    stap8: wizardData.stap8 as Dossier['stap8'],
    stap9: wizardData.stap9 as Dossier['stap9'],
  }
}

function dossierToDbRow(dossier: Dossier) {
  return {
    id: dossier.id,
    dossiernummer: dossier.dossiernummer,
    versie_nummer: dossier.versieNummer,
    is_actualisatie: dossier.isActualisatie,
    status: dossier.status,
    similarity_results: dossier.similarityResults,
    geselecteerde_referenties: dossier.geselecteerdeReferenties,
    rapport_secties: dossier.rapportSecties,
    huidige_stap: dossier.huidigeStap,
    wizard_data: {
      stap1: dossier.stap1,
      stap2: dossier.stap2,
      stap3: dossier.stap3,
      stap4: dossier.stap4,
      stap5: dossier.stap5,
      stap6: dossier.stap6,
      stap7: dossier.stap7,
      stap8: dossier.stap8,
      stap9: dossier.stap9,
    },
  }
}

export function useDossiers() {
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDossiers = async () => {
      try {
        const data = await apiGet<Record<string, unknown>[]>('/api/dossiers')
        setDossiers(data.map(dbRowToDossier))
      } catch (error) {
        console.error('Fout bij ophalen dossiers:', error)
      }
      setLoading(false)
    }

    fetchDossiers()

    const channel = supabase
      .channel('dossiers-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dossiers' }, () => {
        fetchDossiers()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const addDossier = async (dossier: Dossier) => {
    try {
      await apiPost('/api/dossiers', dossierToDbRow(dossier))
    } catch (error) {
      console.error('Fout bij aanmaken dossier:', error)
    }
  }

  const updateDossier = async (dossier: Dossier) => {
    try {
      await apiPut(`/api/dossiers/${dossier.id}`, dossierToDbRow(dossier))
    } catch (error) {
      console.error('Fout bij bijwerken dossier:', error)
    }
  }

  const deleteDossier = async (id: string) => {
    try {
      await apiDelete(`/api/dossiers/${id}`)
    } catch (error) {
      console.error('Fout bij verwijderen dossier:', error)
    }
  }

  return { dossiers, loading, addDossier, updateDossier, deleteDossier }
}
