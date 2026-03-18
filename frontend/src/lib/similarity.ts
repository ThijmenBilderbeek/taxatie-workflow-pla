import type {
  Dossier,
  HistorischRapport,
  SimilarityResult,
  SimilarityClassificatie,
  SimilarityInstellingen,
  ObjectType,
} from '@/types'

const DEFAULT_GEWICHTEN: SimilarityInstellingen['gewichten'] = {
  afstand: 30,
  typeObject: 25,
  oppervlakte: 20,
  ouderheidRapport: 15,
  gebruiksdoel: 10,
}

function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function scoreAfstand(afstandKm: number): number {
  if (afstandKm < 0.5) return 100
  if (afstandKm < 1) return 80
  if (afstandKm < 2) return 60
  if (afstandKm < 5) return 30
  return 10
}

function scoreTypeObject(type1: ObjectType, type2: ObjectType): number {
  if (type1 === type2) return 100

  const verwanteTypes: Record<ObjectType, ObjectType[]> = {
    kantoor: ['bedrijfscomplex', 'bedrijfshal'],
    bedrijfscomplex: ['kantoor', 'bedrijfshal'],
    bedrijfshal: ['kantoor', 'bedrijfscomplex'],
    woning: ['appartement'],
    appartement: ['woning'],
    winkel: [],
    overig: [],
  }

  if (verwanteTypes[type1]?.includes(type2)) return 50
  return 0
}

function scoreOppervlakte(opp1: number, opp2: number): number {
  if (opp1 === 0 || opp2 === 0) return 0

  const verschilPercentage = Math.abs(opp1 - opp2) / opp1

  if (verschilPercentage === 0) return 100
  if (verschilPercentage <= 0.1) return 80
  if (verschilPercentage <= 0.25) return 50
  if (verschilPercentage <= 0.5) return 20
  return 0
}

function scoreOuderdomRapport(rapportDatum: string): number {
  const now = new Date()
  const datum = new Date(rapportDatum)
  const maandenOud = (now.getTime() - datum.getTime()) / (1000 * 60 * 60 * 24 * 30)

  if (maandenOud < 6) return 100
  if (maandenOud < 12) return 80
  if (maandenOud < 24) return 60
  if (maandenOud < 36) return 30
  return 10
}

function scoreGebruiksdoel(doel1: string, doel2: string): number {
  return doel1 === doel2 ? 100 : 0
}

function getClassificatie(score: number): SimilarityClassificatie {
  if (score >= 80) return 'uitstekend'
  if (score >= 60) return 'goed'
  if (score >= 40) return 'matig'
  return 'beperkt'
}

export function calculateSimilarity(
  huidigDossier: Dossier,
  historischRapport: HistorischRapport,
  gewichten: SimilarityInstellingen['gewichten'] = DEFAULT_GEWICHTEN
): SimilarityResult | null {
  if (!huidigDossier.stap2 || !huidigDossier.stap3 || !huidigDossier.stap1) {
    return null
  }

  if (!huidigDossier.stap2.coordinaten || !historischRapport.coordinaten) {
    return null
  }

  const afstandKm = calculateDistance(
    huidigDossier.stap2.coordinaten.lat,
    huidigDossier.stap2.coordinaten.lng,
    historischRapport.coordinaten.lat,
    historischRapport.coordinaten.lng
  )

  const scoreBreakdown = {
    afstand: scoreAfstand(afstandKm),
    typeObject: scoreTypeObject(
      huidigDossier.stap1.typeObject,
      historischRapport.typeObject
    ),
    oppervlakte: scoreOppervlakte(
      huidigDossier.stap3.bvo,
      historischRapport.bvo
    ),
    ouderheidRapport: scoreOuderdomRapport(historischRapport.waardepeildatum),
    gebruiksdoel: scoreGebruiksdoel(
      huidigDossier.stap1.gebruiksdoel,
      historischRapport.gebruiksdoel
    ),
  }

  const totaalScore =
    (scoreBreakdown.afstand * gewichten.afstand +
      scoreBreakdown.typeObject * gewichten.typeObject +
      scoreBreakdown.oppervlakte * gewichten.oppervlakte +
      scoreBreakdown.ouderheidRapport * gewichten.ouderheidRapport +
      scoreBreakdown.gebruiksdoel * gewichten.gebruiksdoel) /
    100

  return {
    rapportId: historischRapport.id,
    totaalScore: Math.round(totaalScore),
    scoreBreakdown,
    afstandKm: Math.round(afstandKm * 10) / 10,
    classificatie: getClassificatie(Math.round(totaalScore)),
  }
}

export function calculateAllSimilarities(
  huidigDossier: Dossier,
  historischeRapporten: HistorischRapport[],
  gewichten?: SimilarityInstellingen['gewichten']
): SimilarityResult[] {
  const results: SimilarityResult[] = []

  for (const rapport of historischeRapporten) {
    const result = calculateSimilarity(huidigDossier, rapport, gewichten)
    if (result) {
      results.push(result)
    }
  }

  return results.sort((a, b) => b.totaalScore - a.totaalScore)
}

export function checkAdresBestaatAl(
  nieuwAdres: { straatnaam: string; huisnummer: string; postcode: string },
  bestaandeDossiers: Dossier[]
): Dossier | null {
  for (const dossier of bestaandeDossiers) {
    if (!dossier.stap2) continue

    const matchStraat =
      dossier.stap2.straatnaam.toLowerCase() === nieuwAdres.straatnaam.toLowerCase()
    const matchHuisnummer =
      dossier.stap2.huisnummer.toLowerCase() === nieuwAdres.huisnummer.toLowerCase()
    const matchPostcode =
      dossier.stap2.postcode.replace(/\s/g, '').toLowerCase() ===
      nieuwAdres.postcode.replace(/\s/g, '').toLowerCase()

    if (matchStraat && matchHuisnummer && matchPostcode) {
      return dossier
    }
  }

  return null
}

export function normalizeerGewichten(
  gewichten: SimilarityInstellingen['gewichten']
): SimilarityInstellingen['gewichten'] {
  const totaal =
    gewichten.afstand +
    gewichten.typeObject +
    gewichten.oppervlakte +
    gewichten.ouderheidRapport +
    gewichten.gebruiksdoel

  if (totaal === 100) return gewichten

  return {
    afstand: Math.round((gewichten.afstand / totaal) * 100),
    typeObject: Math.round((gewichten.typeObject / totaal) * 100),
    oppervlakte: Math.round((gewichten.oppervlakte / totaal) * 100),
    ouderheidRapport: Math.round((gewichten.ouderheidRapport / totaal) * 100),
    gebruiksdoel: Math.round((gewichten.gebruiksdoel / totaal) * 100),
  }
}

export { DEFAULT_GEWICHTEN }
