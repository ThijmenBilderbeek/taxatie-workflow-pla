import type { Dossier, HistorischRapport, SimilarityInstellingen } from '@/types'
import { calculateSimilarity } from './similarity'

export interface VeldSuggestie {
  veldNaam: string
  suggestie: string
  bronAdres: string
  bronScore: number | null
}

type VeldConfig = {
  veldNaam: string
  getUitHistorisch: (rapport: HistorischRapport) => string | undefined
  getHuidigeWaarde: (dossier: Partial<Dossier>) => string | undefined
}

const VELD_CONFIGS: Record<number, VeldConfig[]> = {
  2: [
    {
      veldNaam: 'bereikbaarheid',
      getUitHistorisch: (r) => r.wizardData?.stap2?.bereikbaarheid,
      getHuidigeWaarde: (d) => d.stap2?.bereikbaarheid,
    },
  ],
  5: [
    {
      veldNaam: 'eigendomssituatie',
      getUitHistorisch: (r) => r.wizardData?.stap5?.eigendomssituatie,
      getHuidigeWaarde: (d) => d.stap5?.eigendomssituatie,
    },
    {
      veldNaam: 'erfpacht',
      getUitHistorisch: (r) => r.wizardData?.stap5?.erfpacht,
      getHuidigeWaarde: (d) => d.stap5?.erfpacht,
    },
    {
      veldNaam: 'zakelijkeRechten',
      getUitHistorisch: (r) => r.wizardData?.stap5?.zakelijkeRechten,
      getHuidigeWaarde: (d) => d.stap5?.zakelijkeRechten,
    },
    {
      veldNaam: 'kwalitatieveVerplichtingen',
      getUitHistorisch: (r) => r.wizardData?.stap5?.kwalitatieveVerplichtingen,
      getHuidigeWaarde: (d) => d.stap5?.kwalitatieveVerplichtingen,
    },
    {
      veldNaam: 'bestemmingsplan',
      getUitHistorisch: (r) => r.wizardData?.stap5?.bestemmingsplan,
      getHuidigeWaarde: (d) => d.stap5?.bestemmingsplan,
    },
  ],
  6: [
    {
      veldNaam: 'fundering',
      getUitHistorisch: (r) => r.wizardData?.stap6?.fundering,
      getHuidigeWaarde: (d) => d.stap6?.fundering,
    },
    {
      veldNaam: 'dakbedekking',
      getUitHistorisch: (r) => r.wizardData?.stap6?.dakbedekking,
      getHuidigeWaarde: (d) => d.stap6?.dakbedekking,
    },
    {
      veldNaam: 'installaties',
      getUitHistorisch: (r) => r.wizardData?.stap6?.installaties,
      getHuidigeWaarde: (d) => d.stap6?.installaties,
    },
    {
      veldNaam: 'achterstalligOnderhoudBeschrijving',
      getUitHistorisch: (r) => r.wizardData?.stap6?.achterstalligOnderhoudBeschrijving,
      getHuidigeWaarde: (d) => d.stap6?.achterstalligOnderhoudBeschrijving,
    },
  ],
  7: [
    {
      veldNaam: 'toelichting',
      getUitHistorisch: (r) => r.wizardData?.stap7?.toelichting,
      getHuidigeWaarde: (d) => d.stap7?.toelichting,
    },
  ],
  9: [
    {
      veldNaam: 'aannames',
      getUitHistorisch: (r) => r.wizardData?.stap9?.aannames,
      getHuidigeWaarde: (d) => d.stap9?.aannames,
    },
    {
      veldNaam: 'voorbehouden',
      getUitHistorisch: (r) => r.wizardData?.stap9?.voorbehouden,
      getHuidigeWaarde: (d) => d.stap9?.voorbehouden,
    },
    {
      veldNaam: 'bijzondereOmstandigheden',
      getUitHistorisch: (r) => r.wizardData?.stap9?.bijzondereOmstandigheden,
      getHuidigeWaarde: (d) => d.stap9?.bijzondereOmstandigheden,
    },
  ],
}

export function getSuggestiesVoorStap(
  stap: number,
  huidigeDossier: Partial<Dossier>,
  historischeRapporten: HistorischRapport[],
  similarityInstellingen?: SimilarityInstellingen
): VeldSuggestie[] {
  if (historischeRapporten.length === 0) return []

  const veldConfigs = VELD_CONFIGS[stap]
  if (!veldConfigs) return []

  const typeObject = huidigeDossier.stap1?.typeObject
  const gebruiksdoel = huidigeDossier.stap1?.gebruiksdoel

  // Filter by typeObject if available; keep all if no match
  let kandidaten = historischeRapporten
  if (typeObject) {
    const gefilterd = historischeRapporten.filter((r) => r.typeObject === typeObject)
    if (gefilterd.length > 0) kandidaten = gefilterd
  }

  // Sort candidates by similarity score when coordinates + GBO are available
  const kanSimilarityBerekenen =
    huidigeDossier.stap2?.coordinaten &&
    huidigeDossier.stap3?.gbo &&
    huidigeDossier.stap1

  type Kandidaat = { rapport: HistorischRapport; score: number | null }
  let gesorteerd: Kandidaat[]

  if (kanSimilarityBerekenen) {
    const tempDossier = huidigeDossier as Dossier
    gesorteerd = kandidaten
      .map((rapport) => {
        const result = calculateSimilarity(
          tempDossier,
          rapport,
          similarityInstellingen?.gewichten
        )
        return { rapport, score: result?.totaalScore ?? null }
      })
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  } else {
    gesorteerd = kandidaten
      .map((rapport) => {
        let score = 0
        if (typeObject && rapport.typeObject === typeObject) score += 50
        if (gebruiksdoel && rapport.gebruiksdoel === gebruiksdoel) score += 50
        return { rapport, score }
      })
      .sort((a, b) => b.score - a.score)
  }

  if (gesorteerd.length === 0) return []

  const suggesties: VeldSuggestie[] = []

  for (const config of veldConfigs) {
    // Only suggest when the current field is empty
    const huidigeWaarde = config.getHuidigeWaarde(huidigeDossier)
    if (huidigeWaarde && huidigeWaarde.trim() !== '') continue

    // Find the best-ranked rapport that has this field filled
    for (const { rapport, score } of gesorteerd) {
      const suggestieTekst = config.getUitHistorisch(rapport)
      if (suggestieTekst && suggestieTekst.trim() !== '') {
        const bronAdres = `${rapport.adres.straat} ${rapport.adres.huisnummer}, ${rapport.adres.plaats}`
        suggesties.push({
          veldNaam: config.veldNaam,
          suggestie: suggestieTekst,
          bronAdres,
          bronScore: score,
        })
        break
      }
    }
  }

  return suggesties
}
