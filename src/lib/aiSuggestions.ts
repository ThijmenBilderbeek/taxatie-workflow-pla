import type { Dossier, HistorischRapport, SimilarityInstellingen } from '@/types'
import { calculateSimilarity } from './similarity'
import { getSuggestiesVoorStap, type VeldSuggestie } from './suggestions'
import { supabase } from './supabaseClient'
import { getFeedbackSamenvatting, getSchrijfProfiel } from './feedbackEnrichment'

interface EerdereFeedback {
  reden: string
  toelichting?: string
}

interface VeldFeedbackContext {
  eerdereFeedback: EerdereFeedback[]
  feedbackSamenvatting: string | null
  schrijfprofiel: string | null
}

interface ReferentieContext {
  adres: string
  similarityScore: number
  afstandKm: number
  type?: string
  bvo?: number
  tekst: string
}

type VeldGetter<T> = (data: T) => string | undefined

const VELD_GETTERS_HISTORISCH: Record<string, VeldGetter<HistorischRapport>> = {
  bereikbaarheid: (r) => r.wizardData?.stap2?.bereikbaarheid,
  eigendomssituatie: (r) => r.wizardData?.stap5?.eigendomssituatie,
  erfpacht: (r) => r.wizardData?.stap5?.erfpacht,
  zakelijkeRechten: (r) => r.wizardData?.stap5?.zakelijkeRechten,
  kwalitatieveVerplichtingen: (r) => r.wizardData?.stap5?.kwalitatieveVerplichtingen,
  bestemmingsplan: (r) => r.wizardData?.stap5?.bestemmingsplan,
  fundering: (r) => r.wizardData?.stap6?.fundering,
  dakbedekking: (r) => r.wizardData?.stap6?.dakbedekking,
  installaties: (r) => r.wizardData?.stap6?.installaties,
  achterstalligOnderhoudBeschrijving: (r) => r.wizardData?.stap6?.achterstalligOnderhoudBeschrijving,
  toelichting: (r) => r.wizardData?.stap7?.toelichting,
  aannames: (r) => r.wizardData?.stap9?.aannames,
  voorbehouden: (r) => r.wizardData?.stap9?.voorbehouden,
  bijzondereOmstandigheden: (r) => r.wizardData?.stap9?.bijzondereOmstandigheden,
}

const VELD_GETTERS_HUIDIG: Record<string, VeldGetter<Partial<Dossier>>> = {
  bereikbaarheid: (d) => d.stap2?.bereikbaarheid,
  eigendomssituatie: (d) => d.stap5?.eigendomssituatie,
  erfpacht: (d) => d.stap5?.erfpacht,
  zakelijkeRechten: (d) => d.stap5?.zakelijkeRechten,
  kwalitatieveVerplichtingen: (d) => d.stap5?.kwalitatieveVerplichtingen,
  bestemmingsplan: (d) => d.stap5?.bestemmingsplan,
  fundering: (d) => d.stap6?.fundering,
  dakbedekking: (d) => d.stap6?.dakbedekking,
  installaties: (d) => d.stap6?.installaties,
  achterstalligOnderhoudBeschrijving: (d) => d.stap6?.achterstalligOnderhoudBeschrijving,
  toelichting: (d) => d.stap7?.toelichting,
  aannames: (d) => d.stap9?.aannames,
  voorbehouden: (d) => d.stap9?.voorbehouden,
  bijzondereOmstandigheden: (d) => d.stap9?.bijzondereOmstandigheden,
}

async function getEerdereFeedback(veldNaam: string): Promise<VeldFeedbackContext> {
  try {
    const [feedbackResult, feedbackSamenvatting, schrijfprofiel] = await Promise.all([
      supabase
        .from('suggestie_feedback')
        .select('reden, toelichting')
        .eq('veld_naam', veldNaam)
        .eq('feedback_type', 'negatief')
        .order('created_at', { ascending: false })
        .limit(3),
      getFeedbackSamenvatting(veldNaam, 'veld'),
      getSchrijfProfiel(),
    ])

    const eerdereFeedback = (feedbackResult.data ?? []).map((row) => ({
      reden: row.reden ?? '',
      toelichting: row.toelichting ?? undefined,
    }))

    if (feedbackResult.error) {
      console.warn('[aiSuggestions] Could not fetch feedback:', feedbackResult.error.message)
    }

    return { eerdereFeedback, feedbackSamenvatting, schrijfprofiel }
  } catch {
    return { eerdereFeedback: [], feedbackSamenvatting: null, schrijfprofiel: null }
  }
}

function getVeldTekstUitRapport(rapport: HistorischRapport, veldNaam: string): string {
  return VELD_GETTERS_HISTORISCH[veldNaam]?.(rapport) ?? ''
}

export async function getAISuggestiesVoorStap(
  stap: number,
  huidigeDossier: Partial<Dossier>,
  historischeRapporten: HistorischRapport[],
  similarityInstellingen?: SimilarityInstellingen
): Promise<VeldSuggestie[]> {
  if (historischeRapporten.length === 0) {
    return []
  }

  // Determine which fields to suggest for this step
  const veldNamenPerStap: Record<number, string[]> = {
    2: ['bereikbaarheid'],
    5: ['eigendomssituatie', 'erfpacht', 'zakelijkeRechten', 'kwalitatieveVerplichtingen', 'bestemmingsplan'],
    6: ['fundering', 'dakbedekking', 'installaties', 'achterstalligOnderhoudBeschrijving'],
    7: ['toelichting'],
    9: ['aannames', 'voorbehouden', 'bijzondereOmstandigheden'],
  }

  const veldNamen = veldNamenPerStap[stap]
  if (!veldNamen) return []

  // Check if we have enough data for similarity calculation
  const kanSimilarityBerekenen =
    huidigeDossier.stap2?.coordinaten &&
    huidigeDossier.stap3?.bvo &&
    huidigeDossier.stap1

  // Get top 3 most similar reports
  let top3: Array<{ rapport: HistorischRapport; score: number; afstandKm: number }> = []

  if (kanSimilarityBerekenen) {
    const tempDossier = huidigeDossier as Dossier
    const withScores = historischeRapporten
      .map((rapport) => {
        const result = calculateSimilarity(
          tempDossier,
          rapport,
          similarityInstellingen?.gewichten
        )
        if (!result) return null
        return { rapport, score: result.totaalScore, afstandKm: result.afstandKm }
      })
      .filter((r): r is { rapport: HistorischRapport; score: number; afstandKm: number } => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)

    top3 = withScores
  } else {
    // Fallback: sort by type/gebruiksdoel match
    const typeObject = huidigeDossier.stap1?.typeObject
    const gebruiksdoel = huidigeDossier.stap1?.gebruiksdoel
    top3 = historischeRapporten
      .map((rapport) => {
        let score = 0
        if (typeObject && rapport.typeObject === typeObject) score += 50
        if (gebruiksdoel && rapport.gebruiksdoel === gebruiksdoel) score += 50
        return { rapport, score, afstandKm: 0 }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
  }

  if (top3.length === 0) return []

  // Build the current object context
  const stap1 = huidigeDossier.stap1
  const stap2 = huidigeDossier.stap2
  const stap3 = huidigeDossier.stap3
  const stap7 = huidigeDossier.stap7

  const adres = stap2
    ? `${stap2.straatnaam ?? ''} ${stap2.huisnummer ?? ''}, ${stap2.plaats ?? ''}`.trim()
    : undefined

  const huidigObject = {
    type: stap1?.typeObject,
    adres,
    bvo: stap3?.bvo,
    bouwjaar: stap3?.bouwjaar,
    coordinaten: stap2?.coordinaten,
    energielabel: stap7?.energielabel,
    gebruiksdoel: stap1?.gebruiksdoel,
  }

  // Process each field
  const suggesties: VeldSuggestie[] = []

  for (const veldNaam of veldNamen) {
    // Skip fields that already have a value
    const huidigeWaarde = getHuidigeWaardeVoorVeld(huidigeDossier, veldNaam)
    if (huidigeWaarde && huidigeWaarde.trim() !== '') continue

    try {
      // Build referenties context with texts for this specific field
      const referenties: ReferentieContext[] = top3
        .map(({ rapport, score, afstandKm }) => {
          const tekst = getVeldTekstUitRapport(rapport, veldNaam)
          const rapportAdres = `${rapport.adres.straat} ${rapport.adres.huisnummer}, ${rapport.adres.plaats}`
          return {
            adres: rapportAdres,
            similarityScore: score,
            afstandKm,
            type: rapport.typeObject,
            bvo: rapport.bvo,
            tekst,
          }
        })
        .filter((r) => r.tekst.trim() !== '')

      // Get earlier feedback for this field (all 3 layers)
      const { eerdereFeedback, feedbackSamenvatting, schrijfprofiel } = await getEerdereFeedback(veldNaam)

      // Call the Edge Function
      const { data, error } = await supabase.functions.invoke('openai-suggest-field', {
        body: {
          veldNaam,
          stap,
          huidigObject,
          referenties,
          eerdereFeedback,
          feedbackSamenvatting,
          schrijfprofiel,
        },
      })

      if (error || !data?.suggestie) {
        throw new Error(error?.message ?? 'No suggestion returned')
      }

      const bronRapporten = top3.map(({ rapport, score, afstandKm }) => ({
        adres: `${rapport.adres.straat} ${rapport.adres.huisnummer}, ${rapport.adres.plaats}`,
        score,
        afstandKm,
      }))

      suggesties.push({
        veldNaam,
        suggestie: data.suggestie,
        bronAdres: bronRapporten[0]?.adres ?? '',
        bronScore: bronRapporten[0]?.score ?? null,
        isAIGenerated: true,
        bronRapporten,
      })
    } catch (err) {
      console.warn(`[aiSuggestions] AI call failed for "${veldNaam}", falling back to copy-paste:`, err)
      // Fallback to copy-paste from getSuggestiesVoorStap
    }
  }

  // For any fields where AI failed, fall back to the synchronous getSuggestiesVoorStap
  const veldNamenMetAI = new Set(suggesties.map((s) => s.veldNaam))
  const missendeVelden = veldNamen.filter((v) => !veldNamenMetAI.has(v))

  if (missendeVelden.length > 0) {
    const fallbackSuggesties = getSuggestiesVoorStap(
      stap,
      huidigeDossier,
      historischeRapporten,
      similarityInstellingen
    ).filter((s) => missendeVelden.includes(s.veldNaam))

    suggesties.push(...fallbackSuggesties)
  }

  return suggesties
}

function getHuidigeWaardeVoorVeld(dossier: Partial<Dossier>, veldNaam: string): string | undefined {
  return VELD_GETTERS_HUIDIG[veldNaam]?.(dossier)
}
