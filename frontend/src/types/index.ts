export type DossierStatus = 'concept' | 'in_behandeling' | 'afgerond'

export type ObjectType = 'kantoor' | 'bedrijfscomplex' | 'bedrijfshal' | 'winkel' | 'woning' | 'appartement' | 'overig'

export type Gebruiksdoel = 'eigenaar_gebruiker' | 'verhuurd_belegging' | 'leegstand' | 'overig'

export type RapportVariant = 'eigenaar_gebruiker_kantoor' | 'eigenaar_gebruiker_bedrijfscomplex' | 'verhuurd_belegging'

export type Ligging = 'binnenstad' | 'woonwijk' | 'bedrijventerrein' | 'buitengebied' | 'gemengd'

export type Onderhoudsstaat = 'uitstekend' | 'goed' | 'redelijk' | 'matig' | 'slecht'

export type Energielabel = 'A++++' | 'A+++' | 'A++' | 'A+' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

export type WaarderingsMethode = 'vergelijkingsmethode' | 'BAR_NAR' | 'DCF' | 'kostenmethode' | 'combinatie'

export type SimilarityClassificatie = 'uitstekend' | 'goed' | 'matig' | 'beperkt'

export type FeedbackScore = 'positief' | 'negatief'

export interface AlgemeneGegevens {
  dossiernummer: string
  objectnaam: string
  typeObject: ObjectType
  gebruiksdoel: Gebruiksdoel
  opdrachtgever: {
    naam: string
    bedrijf: string
    email: string
    telefoon: string
  }
  naamTaxateur: string
  waardepeildatum: string
  inspectiedatum: string
}

export interface AdresLocatie {
  straatnaam: string
  huisnummer: string
  postcode: string
  plaats: string
  gemeente: string
  provincie: string
  kadasterAanduiding: {
    gemeente: string
    sectie: string
    perceelnummer: string
  }
  kadastraalOppervlak: number
  ligging: Ligging
  bereikbaarheid: string
  coordinaten: {
    lat: number
    lng: number
  }
}

export interface Oppervlaktes {
  bvo: number
  vvo: number
  perceeloppervlak: number
  aantalBouwlagen: number
  bouwjaar: number
  aanbouwen: string
}

export interface Huurgegevens {
  verhuurd: boolean
  huurder?: string
  huurprijsPerJaar?: number
  ingangsdatum?: string
  einddatum?: string
  contracttype?: string
  indexering?: string
  markthuurPerJaar?: number
  leegstandsrisico?: string
}

export interface JuridischeInfo {
  eigendomssituatie: string
  erfpacht: string
  zakelijkeRechten: string
  kwalitatieveVerplichtingen: string
  bestemmingsplan: string
}

export interface TechnischeStaat {
  exterieurStaat: Onderhoudsstaat
  interieurStaat: Onderhoudsstaat
  fundering: string
  dakbedekking: string
  installaties: string
  achterstalligOnderhoud: boolean
  achterstalligOnderhoudBeschrijving?: string
  onderhoudskosten: number
}

export interface Vergunningen {
  omgevingsvergunning: boolean
  omgevingsvergunningNummer?: string
  energielabel: Energielabel
  epcBengWaarde?: string
  asbest: 'ja' | 'nee' | 'onbekend'
  bodemverontreiniging: 'ja' | 'nee' | 'onbekend'
  toelichting: string
}

export interface Waardering {
  methode: WaarderingsMethode
  marktwaarde: number
  onderhandseVerkoopwaarde: number
  bar?: number
  nar?: number
  kapitalisatiefactor?: number
  vergelijkingsobjecten: VergelijkingsObject[]
}

export interface VergelijkingsObject {
  adres: string
  prijs: number
  datum: string
}

export interface Aannames {
  aannames: string
  voorbehouden: string
  bijzondereOmstandigheden: string
  interneNotities: string
}

export interface SimilarityScoreBreakdown {
  afstand: number
  typeObject: number
  oppervlakte: number
  ouderheidRapport: number
  gebruiksdoel: number
}

export interface SimilarityResult {
  rapportId: string
  totaalScore: number
  scoreBreakdown: SimilarityScoreBreakdown
  afstandKm: number
  classificatie: SimilarityClassificatie
}

export interface RapportSectie {
  titel: string
  inhoud: string
  gegenereerdeInhoud: string
  gebaseerdOpReferentie?: string
  feedbackScore?: FeedbackScore
  feedbackReden?: string
  fluxKlaarTekst: string
}

export interface Dossier {
  id: string
  dossiernummer: string
  versieNummer: number
  isActualisatie: boolean
  vorigeVersieId?: string
  status: DossierStatus
  
  stap1?: AlgemeneGegevens
  stap2?: AdresLocatie
  stap3?: Oppervlaktes
  stap4?: Huurgegevens
  stap5?: JuridischeInfo
  stap6?: TechnischeStaat
  stap7?: Vergunningen
  stap8?: Waardering
  stap9?: Aannames
  
  similarityResults: SimilarityResult[]
  geselecteerdeReferenties: string[]
  
  rapportSecties: Record<string, RapportSectie>
  
  huidigeStap: number
  
  createdAt: string
  updatedAt: string
}

export interface HistorischRapport {
  id: string
  adres: {
    straat: string
    huisnummer: string
    postcode: string
    plaats: string
  }
  coordinaten: {
    lat: number
    lng: number
  }
  typeObject: ObjectType
  gebruiksdoel: Gebruiksdoel
  bvo: number
  marktwaarde: number
  bar?: number
  nar?: number
  waardepeildatum: string
  rapportTeksten: Record<string, string>
  wizardData: Partial<Dossier>
}

export interface SimilarityInstellingen {
  gewichten: {
    afstand: number
    typeObject: number
    oppervlakte: number
    ouderheidRapport: number
    gebruiksdoel: number
  }
}

export interface SimilarityFeedback {
  id: string
  dossierId: string
  referentieRapportId: string
  sectie: string
  score: FeedbackScore
  reden: string
  categorie: 'objecttype' | 'afstand' | 'ouderdom' | 'oppervlakte' | 'anders'
  createdAt: string
}

export interface KennisbankStats {
  totaalRapporten: number
  rapportenPerType: Record<ObjectType, number>
  gemiddeldeSimilarityScore: number
  meestGebruikteReferenties: Array<{
    rapportId: string
    adres: string
    aantalKeerGebruikt: number
  }>
  rapportenPerRegio: Record<string, number>
}
