import type { Dossier, HistorischRapport, RapportVariant } from '@/types'
import { formatDatum, formatBedrag, formatOppervlakte, formatPercentage } from './fluxFormatter'

function getRapportVariant(dossier: Dossier): RapportVariant {
  const isVerhuurd = dossier.stap4?.verhuurd || false
  const typeObject = dossier.stap1?.typeObject || 'kantoor'
  
  if (isVerhuurd) {
    return 'verhuurd_belegging'
  }
  
  if (typeObject === 'bedrijfscomplex' || typeObject === 'bedrijfshal') {
    return 'eigenaar_gebruiker_bedrijfscomplex'
  }
  
  return 'eigenaar_gebruiker_kantoor'
}

function replacePlaceholders(template: string, dossier: Dossier): string {
  let result = template

  if (dossier.stap1) {
    result = result.replace(/{{dossiernummer}}/g, dossier.dossiernummer || '')
    result = result.replace(/{{objectnaam}}/g, dossier.stap1.objectnaam || '')
    result = result.replace(/{{complexnaam}}/g, dossier.stap1.objectnaam || '')
    result = result.replace(/{{type_object}}/g, dossier.stap1.typeObject || '')
    result = result.replace(/{{gebruiksdoel}}/g, dossier.stap1.gebruiksdoel?.replace(/_/g, ' ') || '')
    result = result.replace(/{{opdrachtgever_naam}}/g, dossier.stap1.opdrachtgever?.naam || '')
    result = result.replace(/{{opdrachtgever_bedrijf}}/g, dossier.stap1.opdrachtgever?.bedrijf || '')
    result = result.replace(/{{opdrachtgever_email}}/g, dossier.stap1.opdrachtgever?.email || '')
    result = result.replace(/{{opdrachtgever_telefoon}}/g, dossier.stap1.opdrachtgever?.telefoon || '')
    result = result.replace(/{{taxateur}}/g, dossier.stap1.naamTaxateur || '')
    result = result.replace(/{{waardepeildatum}}/g, dossier.stap1.waardepeildatum ? formatDatum(dossier.stap1.waardepeildatum) : '')
    result = result.replace(/{{inspectiedatum}}/g, dossier.stap1.inspectiedatum ? formatDatum(dossier.stap1.inspectiedatum) : '')
    result = result.replace(/{{mate_van_inspectie}}/g, dossier.stap1.mateVanInspectie || '')
    result = result.replace(/{{inspectie_uitgevoerd_door}}/g, dossier.stap1.inspectieUitgevoerdDoor || '')
    result = result.replace(/{{toelichting_inspectie}}/g, dossier.stap1.toelichtingInspectie || '')
    result = result.replace(/{{huidig_gebruik}}/g, dossier.stap1.huidigGebruik || '')
    result = result.replace(/{{voorgenomen_gebruik}}/g, dossier.stap1.voorgenomenGebruik || '')
  }

  if (dossier.stap2) {
    result = result.replace(/{{adres}}/g, `${dossier.stap2.straatnaam || ''} ${dossier.stap2.huisnummer || ''}`)
    result = result.replace(/{{straatnaam}}/g, dossier.stap2.straatnaam || '')
    result = result.replace(/{{huisnummer}}/g, dossier.stap2.huisnummer || '')
    result = result.replace(/{{postcode}}/g, dossier.stap2.postcode || '')
    result = result.replace(/{{plaats}}/g, dossier.stap2.plaats || '')
    result = result.replace(/{{gemeente}}/g, dossier.stap2.gemeente || '')
    result = result.replace(/{{provincie}}/g, dossier.stap2.provincie || '')
    result = result.replace(/{{kadastrale_aanduiding}}/g, 
      dossier.stap2.kadasterAanduiding 
        ? `${dossier.stap2.kadasterAanduiding.gemeente}, sectie ${dossier.stap2.kadasterAanduiding.sectie}, perceelnummer ${dossier.stap2.kadasterAanduiding.perceelnummer}`
        : '')
    result = result.replace(/{{kadastraal_oppervlak}}/g, dossier.stap2.kadastraalOppervlak ? formatOppervlakte(dossier.stap2.kadastraalOppervlak) : '')
    result = result.replace(/{{ligging}}/g, dossier.stap2.ligging?.replace(/_/g, ' ') || '')
    result = result.replace(/{{bereikbaarheid}}/g, dossier.stap2.bereikbaarheid || '')
    result = result.replace(/{{omgeving_en_belendingen}}/g, dossier.stap2.omgevingEnBelendingen || '')
    result = result.replace(/{{voorzieningen}}/g, dossier.stap2.voorzieningen || '')
    result = result.replace(/{{verwachte_ontwikkelingen}}/g, dossier.stap2.verwachteOntwikkelingen || '')
    result = result.replace(/{{locatiescore}}/g, dossier.stap2.locatiescore || '')
  }

  if (dossier.stap3) {
    result = result.replace(/{{bvo}}/g, dossier.stap3.bvo ? formatOppervlakte(dossier.stap3.bvo) : '')
    result = result.replace(/{{vvo}}/g, dossier.stap3.vvo ? formatOppervlakte(dossier.stap3.vvo) : '')
    result = result.replace(/{{perceeloppervlak}}/g, dossier.stap3.perceeloppervlak ? formatOppervlakte(dossier.stap3.perceeloppervlak) : '')
    result = result.replace(/{{aantal_bouwlagen}}/g, dossier.stap3.aantalBouwlagen?.toString() || '')
    result = result.replace(/{{bouwjaar}}/g, dossier.stap3.bouwjaar?.toString() || '')
    result = result.replace(/{{renovatiejaar}}/g, dossier.stap3.renovatiejaar?.toString() || '')
  }

  if (dossier.stap5) {
    result = result.replace(/{{te_taxeren_belang}}/g, dossier.stap5.teTaxerenBelang || '')
    result = result.replace(/{{aantekeningen_kadastraal_object}}/g, dossier.stap5.aantekeningenKadastraalObject || '')
    result = result.replace(/{{toelichting_eigendom_perceel}}/g, dossier.stap5.toelichtingEigendomPerceel || '')
    result = result.replace(/{{gebruik_conform_omgevingsplan}}/g, dossier.stap5.gebruikConformOmgevingsplan || '')
    result = result.replace(/{{bijzondere_publiekrechtelijke_bepalingen}}/g, dossier.stap5.bijzonderePubliekrechtelijkeBepalingen || '')
  }

  if (dossier.stap6) {
    result = result.replace(/{{exterieur_staat}}/g, dossier.stap6.exterieurStaat || '')
    result = result.replace(/{{interieur_staat}}/g, dossier.stap6.interieurStaat || '')
    result = result.replace(/{{fundering}}/g, dossier.stap6.fundering || '')
    result = result.replace(/{{dakbedekking}}/g, dossier.stap6.dakbedekking || '')
    result = result.replace(/{{installaties}}/g, dossier.stap6.installaties || '')
    result = result.replace(/{{constructie}}/g, dossier.stap6.constructie || '')
    result = result.replace(/{{terrein}}/g, dossier.stap6.terrein || '')
    result = result.replace(/{{gevels}}/g, dossier.stap6.gevels || '')
    result = result.replace(/{{afwerking}}/g, dossier.stap6.afwerking || '')
    result = result.replace(/{{beveiliging}}/g, dossier.stap6.beveiliging || '')
    result = result.replace(/{{toelichting_onderhoud}}/g, dossier.stap6.toelichtingOnderhoud || '')
    result = result.replace(/{{toelichting_parkeren}}/g, dossier.stap6.toelichtingParkeren || '')
    result = result.replace(/{{toelichting_functionaliteit}}/g, dossier.stap6.toelichtingFunctionaliteit || '')
    result = result.replace(/{{omschrijving_milieuaspecten}}/g, dossier.stap6.omschrijvingMilieuaspecten || '')
  }

  if (dossier.stap7) {
    result = result.replace(/{{energielabel}}/g, dossier.stap7.energielabel || '')
  }

  if (dossier.stap8) {
    result = result.replace(/{{marktwaarde}}/g, dossier.stap8.marktwaarde ? formatBedrag(dossier.stap8.marktwaarde) : '')
    result = result.replace(/{{onderhandse_verkoopwaarde}}/g, dossier.stap8.onderhandseVerkoopwaarde ? formatBedrag(dossier.stap8.onderhandseVerkoopwaarde) : '')
    result = result.replace(/{{methode}}/g, dossier.stap8.methode?.replace(/_/g, '/') || '')
    if (dossier.stap8.bar) {
      result = result.replace(/{{bar}}/g, formatPercentage(dossier.stap8.bar))
    }
    if (dossier.stap8.nar) {
      result = result.replace(/{{nar}}/g, formatPercentage(dossier.stap8.nar))
    }
  }

  return result
}

export function generateRapportSamenvatting(dossier: Dossier): string {
  const variant = getRapportVariant(dossier)
  const isVerhuurd = variant === 'verhuurd_belegging'
  const teTaxerenBelang = dossier.stap5?.teTaxerenBelang || '100%'
  
  let template = `I N H O U D S O P G A V E   T A X A T I E R A P P O R T

RAPPORT SAMENVATTING

===== DOSSIER- EN OBJECTMETADATA =====

Dossiernummer: {{dossiernummer}}
Complexnaam: {{complexnaam}}
Adres: {{adres}}
Postcode en plaats: {{postcode}} {{plaats}}
Type eigendom: Volledig eigendom
Te taxeren belang: ${teTaxerenBelang}

===== OBJECT =====

Type object: {{type_object}}
Monument: Nee
Energielabel: {{energielabel}}

===== OPPERVLAKTEN =====

Bruto vloeroppervlak (BVO): {{bvo}}
Verhuurbaar vloeroppervlak (VVO): {{vvo}}
Perceeloppervlak: {{perceeloppervlak}}

===== WAARDERING =====

Marktwaarde kosten koper: {{marktwaarde}}
Waardepeildatum: {{waardepeildatum}}
NAR: {{nar}}`

  if (isVerhuurd) {
    template += `

===== HUURSITUATIE =====

Contracthuur per jaar: [contracthuur]
Markthuur per jaar: [markthuur]
Netto markthuur: [netto markthuur]`
  }

  template += `

===== OPDRACHT =====

Opdrachtgever: {{opdrachtgever_bedrijf}}
Doel taxatie: [doel]
Uitvoerend taxateur: {{taxateur}}
Inspectiedatum: {{inspectiedatum}}`

  return replacePlaceholders(template, dossier)
}

export function generateA1_Opdrachtgever(dossier: Dossier): string {
  const template = `A.1 OPDRACHTGEVER

De opdracht tot het uitvoeren van deze taxatie is verstrekt door:

{{opdrachtgever_bedrijf}}
Contactpersoon: {{opdrachtgever_naam}}
E-mail: {{opdrachtgever_email}}
Telefoon: {{opdrachtgever_telefoon}}`

  return replacePlaceholders(template, dossier)
}

export function generateA2_Taxateur(dossier: Dossier): string {
  const template = `A.2 OPDRACHTNEMER EN UITVOEREND TAXATEUR

De taxatie is uitgevoerd door:

{{taxateur}}
[Naam controlerend taxateur indien van toepassing]
Register NRVT: [registernummer]

VERKLARINGEN TAXATEURS INZAKE OPDRACHTVERSTREKKING

CONTROLEREND TAXATEUR

De taxateur verklaart dat hij voor deze opdracht onafhankelijk en objectief is en dat er geen sprake is van belangenverstrengeling met opdrachtgever of eigenaar van het getaxeerde object.

De taxateur verklaart dat deze waardering is uitgevoerd conform de Richtlijnen Vastgoedtaxaties (RVT), de International Valuation Standards (IVS) en de European Valuation Standards (EVS) van de Royal Institution of Chartered Surveyors (RICS).

De taxateur gaat ervan uit dat de door opdrachtgever aangeleverde informatie correct en volledig is.

Het rapport is uitsluitend bestemd voor het hiervoor aangegeven doel en mag niet worden gebruikt voor andere doeleinden zonder voorafgaande schriftelijke toestemming van de taxateur.`

  return replacePlaceholders(template, dossier)
}

export function generateB1_Algemeen(dossier: Dossier): string {
  const template = `B.1 ALGEMEEN

Het object betreft een {{type_object}} gelegen aan {{adres}} te {{plaats}}.

De waardering is opgemaakt in het Vastgoed Management Systeem van fluX.`

  return replacePlaceholders(template, dossier)
}

export function generateB2_DoelTaxatie(dossier: Dossier): string {
  const gebruiksdoel = dossier.stap1?.gebruiksdoel || 'eigenaar_gebruiker'
  
  let doelToelichting = 'De taxatie wordt uitgevoerd ten behoeve van interne verslaggeving.'
  
  if (gebruiksdoel === 'verhuurd_belegging') {
    doelToelichting = 'De taxatie wordt uitgevoerd ten behoeve van beleggingswaardering.'
  }
  
  const template = `B.2 DOEL VAN DE TAXATIE

${doelToelichting}

Type taxatie: Desktoptaxatie

Het rapport is uitsluitend bestemd voor het hiervoor aangegeven doel.`

  return replacePlaceholders(template, dossier)
}

export function generateB3_WaarderingBasis(dossier: Dossier): string {
  const template = `B.3 WAARDERING & BASIS VAN DE WAARDE

De marktwaarde wordt gedefinieerd als:

"Het geschatte bedrag waartegen een eigendom op de waardepeildatum tussen een bereidwillige koper en een bereidwillige verkoper in een zakelijke transactie zou worden overgedragen, na behoorlijke marketing waarbij de partijen zouden hebben gehandeld met kennis van zaken, prudent en niet onder dwang."

De waardepeildatum is {{waardepeildatum}}.

Marktwaarde kosten koper: {{marktwaarde}}

Valuta: EUR (€)

Datum en plaats ondertekening: {{plaats}}, {{inspectiedatum}}`

  return replacePlaceholders(template, dossier)
}

export function generateB4_Inspectie(dossier: Dossier): string {
  const mateVanInspectie = dossier.stap1?.mateVanInspectie || 'Volledige externe en interne inspectie'
  const inspectieUitgevoerdDoor = dossier.stap1?.inspectieUitgevoerdDoor || dossier.stap1?.naamTaxateur || ''
  const toelichtingInspectie = dossier.stap1?.toelichtingInspectie || ''

  let template = `B.4 INSPECTIE

De inspectie van het object heeft plaatsgevonden op {{inspectiedatum}}.

Mate van inspectie: ${mateVanInspectie}`

  if (inspectieUitgevoerdDoor) {
    template += `\nInspectie uitgevoerd door: ${inspectieUitgevoerdDoor}`
  }

  template += `

De taxateur verklaart dat de bezichtiging geen bouwtechnische keuring is. Voor zover tijdens de inspectie is waargenomen, zijn gebreken en bijzonderheden vermeld in dit rapport. Verborgen gebreken kunnen echter niet worden uitgesloten.`

  if (toelichtingInspectie) {
    template += `\n\nTOELICHTING INSPECTIE\n\n${toelichtingInspectie}`
  }

  return replacePlaceholders(template, dossier)
}

export function generateB5_Uitgangspunten(dossier: Dossier): string {
  const template = `B.5 UITGANGSPUNTEN EN AFWIJKINGEN

Tenzij hieronder uitdrukkelijk anders vermeld, gaat de taxateur uit van de volgende aannames:

- Er is geen sprake van bodemverontreiniging
- Het eigendom is vrij van hypotheken en andere zakelijke rechten
- Het gebruik is in overeenstemming met het omgevingsplan
- Er is geen sprake van asbest of andere gevaarlijke stoffen`

  return replacePlaceholders(template, dossier)
}

export function generateB6_ToelichtingWaardering(dossier: Dossier): string {
  const template = `B.6 NADERE TOELICHTING OP DE WAARDERING

De waardering is gebaseerd op de ten tijde van de inspectie aangetroffen situatie en de door opdrachtgever verstrekte informatie.

Voor zover bekend bij taxateur zijn geen noemenswaardige omstandigheden die de waardering significant kunnen beïnvloeden.

Het object wordt geacht conform de huidige bestemming en met de huidige economische functie gebruikt blijft worden.`

  return replacePlaceholders(template, dossier)
}

export function generateB7_EerdereTaxaties(dossier: Dossier): string {
  return `B.7 EERDERE TAXATIES

Voor dit object zijn geen eerdere taxaties bekend.`
}

export function generateB8_InzageDocumenten(dossier: Dossier): string {
  return `B.8 OVERZICHT INZAGE DOCUMENTEN

- Kadastrale informatie
- Energielabel (www.ep-online.nl)
- Door opdrachtgever verstrekte informatie en documenten`
}

export function generateB9_Taxatiemethodiek(dossier: Dossier): string {
  const template = `B.9 GEHANTEERDE TAXATIEMETHODIEK

COMPARATIEVE METHODE

Bij deze methode wordt de marktwaarde bepaald door vergelijking met gerealiseerde transacties van vergelijkbare objecten.

BAR/NAR-METHODE

Bij de BAR/NAR-methode wordt de (markt)huurwaarde gekapitaliseerd tegen een marktconform rendement.

TOELICHTING

De ingeschatte markthuurwaarde is derhalve altijd een combinatie van het marktgevoel van de taxateur en (gepubliceerde) gerealiseerde transacties. Desondanks kan er op basis van de genoemde referenties een (globale) vergelijking gemaakt worden.`

  return replacePlaceholders(template, dossier)
}

export function generateB10_Plausibiliteit(dossier: Dossier): string {
  const template = `B.10 PLAUSIBILITEIT TAXATIE

De taxateur acht de uitgevoerde waardering en de gehanteerde methodiek plausibel en passend bij het type object en de marktomstandigheden.

De marktwaarde van {{marktwaarde}} per waardepeildatum {{waardepeildatum}} wordt als realistisch beschouwd en ligt in lijn met vergelijkbare transacties in de markt.`

  return replacePlaceholders(template, dossier)
}

export function generateC1_SWOT(dossier: Dossier): string {
  return `C.1 SWOT-ANALYSE

STERKTES
- Goede locatie met voldoende bereikbaarheid
- Solide bouwkundige staat
- Representatieve uitstraling

ZWAKTES
- Specifieke invulling beperkt alternatieve aanwendbaarheid
- Afhankelijkheid van lokale marktomstandigheden
- Energielabel kan verbetering gebruiken

KANSEN
- Verduurzaming kan waarde verhogen
- Marktverbetering kan waardegroei opleveren

BEDREIGINGEN
- Economische neergang kan vraag verminderen
- Wijzigingen in wet- en regelgeving`
}

export function generateC2_Beoordeling(dossier: Dossier): string {
  return `C.2 BEOORDELING COURANTHEID

COURANTHEID VERHUUR

Score: [score]
Verhuurbaarheid: De verhuurbaarheid van het object wordt als redelijk tot goed beoordeeld.

Verhuurtijd: Bij een verhuurprocedure wordt een verhuurperiode van 6 tot 12 maanden realistisch geacht.

COURANTHEID VERKOOP

Score: [score]
Verkoopbaarheid: De verkoopbaarheid van het object wordt als redelijk tot goed beoordeeld.

Verkooptijd: Bij een verkoopprocedure wordt een verkoopperiode van 9 tot 15 maanden realistisch geacht.

Alles overwegende is de courantheid als redelijk tot goed aan te duiden.`
}

export function generateD1_Privaatrechtelijk(dossier: Dossier): string {
  if (!dossier.stap5) return ''

  const teTaxerenBelang = dossier.stap5.teTaxerenBelang || '100% eigendom'
  const aantekeningenKadastraal = dossier.stap5.aantekeningenKadastraalObject || 'Voor zover bekend geen bijzondere aantekeningen'
  const toelichtingEigendom = dossier.stap5.toelichtingEigendomPerceel || ''

  let template = `D.1 PRIVAATRECHTELIJKE ASPECTEN

KADASTRALE GEGEVENS

Kadastrale aanduiding: {{kadastrale_aanduiding}}
Perceeloppervlak: {{kadastraal_oppervlak}}
Aantekeningen: ${aantekeningenKadastraal}

TE TAXEREN BELANG

Te taxeren belang: ${teTaxerenBelang}

EIGENDOMSSITUATIE

Eigendomssituatie: ${dossier.stap5.eigendomssituatie || 'Volledig eigendom'}`

  if (toelichtingEigendom) {
    template += `\n\nToelichting eigendom: ${toelichtingEigendom}`
  }

  template += `

ERFPACHT

Erfpacht: ${dossier.stap5.erfpacht || 'Niet van toepassing'}

ZAKELIJKE RECHTEN

Zakelijke rechten: ${dossier.stap5.zakelijkeRechten || 'Voor zover bekend geen'}

KWALITATIEVE VERPLICHTINGEN

Kwalitatieve verplichtingen: ${dossier.stap5.kwalitatieveVerplichtingen || 'Voor zover bekend geen'}

VVE

VVE: Niet van toepassing

Voor zover bekend zijn er geen belemmeringen die de vrije overdracht of exploitatie van het object belemmeren.`

  return replacePlaceholders(template, dossier)
}

export function generateD2_Publiekrechtelijk(dossier: Dossier): string {
  if (!dossier.stap5) return ''

  const gebruikConform = dossier.stap5.gebruikConformOmgevingsplan || 'Het huidige gebruik is in overeenstemming met het omgevingsplan.'
  const bijzondereBep = dossier.stap5.bijzonderePubliekrechtelijkeBepalingen || 'Voor zover bekend zijn geen bijzondere publiekrechtelijke bepalingen van toepassing.'

  const template = `D.2 PUBLIEKRECHTELIJKE ASPECTEN

OMGEVINGSPLAN

Gemeente: {{gemeente}}
Bestemmingsplan: ${dossier.stap5.bestemmingsplan || 'Conform bestemming'}
Bestemming: [bestemming]

${gebruikConform}

MONUMENT

Monument: Niet van toepassing

VOORKEURSRECHT

Voorkeursrecht: Niet van toepassing

BIJZONDERE PUBLIEKRECHTELIJKE BEPALINGEN

${bijzondereBep}`

  return replacePlaceholders(template, dossier)
}

export function generateE1_LocatieOverzicht(dossier: Dossier): string {
  const omgeving = dossier.stap2?.omgevingEnBelendingen || ''
  const ligging = dossier.stap2?.ligging?.replace(/_/g, ' ') || ''

  let template = `E.1 LOCATIEOVERZICHT

Het object is gelegen in {{plaats}}, gemeente {{gemeente}}, provincie {{provincie}}.

LIGGING

Het object is gelegen in {{plaats}}.`

  if (ligging) {
    template += ` De omgeving kan worden getypeerd als ${ligging}.`
  }

  if (omgeving) {
    template += `\n\nOMGEVING EN BELENDINGEN\n\n${omgeving}`
  }

  return replacePlaceholders(template, dossier)
}

export function generateE2_LocatieInformatie(dossier: Dossier): string {
  const voorzieningenTekst = dossier.stap2?.voorzieningen
    || 'In de directe omgeving zijn diverse voorzieningen aanwezig zoals winkels, horeca, openbaar vervoer en parkeervoorzieningen.'
  const verwachteOntwikkelingen = dossier.stap2?.verwachteOntwikkelingen || ''
  const locatiescore = dossier.stap2?.locatiescore || ''

  let template = `E.2 LOCATIE INFORMATIE

VOORZIENINGEN

${voorzieningenTekst}

BEREIKBAARHEID

Bereikbaarheid auto: {{bereikbaarheid}}
Bereikbaarheid openbaar vervoer: [omschrijving]

PARKEREN OPENBARE WEG

Parkeren openbare weg: [omschrijving]

LOCATIESCORE

Locatiescore: ${locatiescore || '[score]'}
WalkScore: [score]`

  if (verwachteOntwikkelingen) {
    template += `\n\nVERWACHTE ONTWIKKELINGEN\n\n${verwachteOntwikkelingen}`
  }

  template += `\n\nAlles overwegende is de locatie als goed aan te duiden.`

  return replacePlaceholders(template, dossier)
}

export function generateF1_ObjectInformatie(dossier: Dossier): string {
  const constructie = dossier.stap6?.constructie || ''
  const terrein = dossier.stap6?.terrein || ''
  const gevels = dossier.stap6?.gevels || ''
  const afwerking = dossier.stap6?.afwerking || ''
  const beveiliging = dossier.stap6?.beveiliging || ''
  const toelichtingOnderhoud = dossier.stap6?.toelichtingOnderhoud || ''
  const toelichtingParkeren = dossier.stap6?.toelichtingParkeren || ''
  const toelichtingFunctionaliteit = dossier.stap6?.toelichtingFunctionaliteit || ''

  let template = `F.1 OBJECTINFORMATIE

ALGEMEEN

Het object betreft een {{type_object}} gelegen aan {{adres}} te {{plaats}}.

[Omschrijving indeling]

BOUWKUNDIGE KENMERKEN

Bouwjaar: {{bouwjaar}}
Perceeloppervlak: {{perceeloppervlak}}
Aantal bouwlagen: {{aantal_bouwlagen}}`

  if (constructie) {
    template += `\nConstructie: ${constructie}`
  }

  if (terrein) {
    template += `\nTerrein: ${terrein}`
  }

  template += `

BOUWKUNDIGE STAAT

Bouwkundige staat: {{exterieur_staat}}
Onderhoud buiten: {{exterieur_staat}}
Onderhoud binnen: {{interieur_staat}}

Gevels: ${gevels || '[gevels]'}
Dakbedekking: {{dakbedekking}}
Fundering: {{fundering}}
Vloeren: [vloeren]
Installaties: {{installaties}}`

  if (afwerking) {
    template += `\nAfwerking: ${afwerking}`
  }

  if (beveiliging) {
    template += `\nBeveiliging: ${beveiliging}`
  }

  template += `

ONDERHOUD

Het onderhoud van het exterieur wordt gekwalificeerd als {{exterieur_staat}}.
Het onderhoud van het interieur wordt gekwalificeerd als {{interieur_staat}}.`

  if (toelichtingOnderhoud) {
    template += `\n\n${toelichtingOnderhoud}`
  } else {
    template += `\n\nNormonderhoudstype: [type]`
  }

  template += `

PARKEREN EIGEN TERREIN

Parkeren eigen terrein: [aantal parkeerplaatsen]`

  if (toelichtingParkeren) {
    template += `\n${toelichtingParkeren}`
  }

  template += `

FUNCTIONALITEIT

Functionaliteit: [beoordeling]`

  if (toelichtingFunctionaliteit) {
    template += `\n${toelichtingFunctionaliteit}`
  }

  template += `

Alles overwegende is de bouwkundige staat als {{exterieur_staat}} aan te duiden.`

  return replacePlaceholders(template, dossier)
}

export function generateF2_Oppervlakte(dossier: Dossier): string {
  const template = `F.2 OPPERVLAKTE

Het object heeft de volgende oppervlakten:

Bruto vloeroppervlak (BVO): {{bvo}}
Verhuurbaar vloeroppervlak (VVO): {{vvo}}

Meetinstructie: [meettype]
Verhouding VVO/BVO: [percentage]%`

  return replacePlaceholders(template, dossier)
}

export function generateF3_Renovatie(dossier: Dossier): string {
  const renovatiejaar = dossier.stap3?.renovatiejaar
  const bouwjaar = dossier.stap3?.bouwjaar

  if (!renovatiejaar) {
    return `F.3 RENOVATIE

Voor zover bekend zijn er geen recente renovaties uitgevoerd aan het object.`
  }

  let tekst = `F.3 RENOVATIE

Het object is in ${renovatiejaar} gerenoveerd.`

  if (bouwjaar) {
    const ouderdom = renovatiejaar - bouwjaar
    if (ouderdom > 0) {
      tekst += ` Ten tijde van de renovatie was het object circa ${ouderdom} jaar oud.`
    }
  }

  tekst += `

De renovatie heeft bijgedragen aan de bouwkundige kwaliteit en functionele bruikbaarheid van het object.`

  return tekst
}

export function generateF4_Milieuaspecten(dossier: Dossier): string {
  if (!dossier.stap7) return ''

  const omschrijvingMilieuaspecten = dossier.stap6?.omschrijvingMilieuaspecten || ''

  let tekst = `F.4 MILIEUASPECTEN EN BEOORDELING

ASBEST

Asbest: ${dossier.stap7.asbest === 'ja' ? 'Aanwezig' : dossier.stap7.asbest === 'nee' ? 'Niet aanwezig' : 'Onbekend'}

BODEMVERONTREINIGING

Bodemverontreiniging: ${dossier.stap7.bodemverontreiniging === 'ja' ? 'Aanwezig' : dossier.stap7.bodemverontreiniging === 'nee' ? 'Niet aanwezig' : 'Onbekend'}

ENERGIELABEL

Energielabel: ${dossier.stap7.energielabel || 'Onbekend'}`

  if (omschrijvingMilieuaspecten) {
    tekst += `\n\nOVERIGE MILIEUASPECTEN\n\n${omschrijvingMilieuaspecten}`
  }

  tekst += `\n\nDe taxateur gaat ervan uit dat er geen milieuverontreiniging aanwezig is die de waarde of het gebruik van het object negatief beïnvloedt. Er heeft geen milieukundig onderzoek plaatsgevonden.`

  return tekst
}

export function generateG1_GebruikObject(dossier: Dossier): string {
  const variant = getRapportVariant(dossier)
  const huidigGebruik = dossier.stap1?.huidigGebruik || ''
  const voorgenomenGebruik = dossier.stap1?.voorgenomenGebruik || ''

  let tekst: string

  if (variant === 'verhuurd_belegging') {
    tekst = `G.1 GEBRUIK OBJECT

Het object wordt verhuurd en is in gebruik voor de bestemming waarvoor het is ontworpen.`

    if (huidigGebruik) {
      tekst += `\n\nHuidig gebruik: ${huidigGebruik}`
    }

    tekst += `\n\nHet object is geschikt voor verhuur aan diverse typen huurders binnen de huidige bestemming.`
  } else {
    tekst = `G.1 GEBRUIK OBJECT

Het object wordt gebruikt conform de bestemming door de eigenaar voor eigen bedrijfsvoering.`

    if (huidigGebruik) {
      tekst += `\n\nHuidig gebruik: ${huidigGebruik}`
    }
  }

  if (voorgenomenGebruik) {
    tekst += `\n\nVoorgenomen gebruik: ${voorgenomenGebruik}`
  }

  return tekst
}

export function generateG2_AlternatieveAanwendbaarheid(dossier: Dossier): string {
  const huidigGebruik = dossier.stap1?.huidigGebruik || 'het huidige gebruik conform de bestemming'
  const voorgenomenGebruik = dossier.stap1?.voorgenomenGebruik || ''

  let tekst = `G.2 ALTERNATIEVE AANWENDBAARHEID

HUIDIG GEBRUIK

Het object is geschikt voor de huidige bestemming.

Huidig gebruik: ${huidigGebruik}

Het taxatieoordeel is gebaseerd op de huidige feitelijke situatie en de daarbij behorende bestemming.

HIGHEST AND BEST USE (HABU)

De hoogste en beste use (HABU) wordt bereikt met het huidige gebruik conform de bestemming.

ALTERNATIEVE AANWENDBAARHEID

Het object is geschikt voor de huidige bestemming. De hoogste en beste use (HABU) wordt bereikt met het huidige gebruik conform de bestemming.`

  if (voorgenomenGebruik) {
    tekst += `\n\nVOORGENOMEN GEBRUIK\n\n${voorgenomenGebruik}`
  }

  return tekst
}

export function generateG2_Huursituatie(dossier: Dossier): string {
  if (!dossier.stap4 || !dossier.stap4.verhuurd) {
    return 'Het object is niet verhuurd.'
  }

  let text = `G.2 HUURSITUATIE

HUURCONTRACT

Huurder: ${dossier.stap4.huurder}
Contracttype: ${dossier.stap4.contracttype || 'ROZ-huurovereenkomst'}`

  if (dossier.stap4.ingangsdatum && dossier.stap4.einddatum) {
    text += `\nIngangsdatum: ${formatDatum(dossier.stap4.ingangsdatum)}`
    text += `\nEinddatum: ${formatDatum(dossier.stap4.einddatum)}`
    text += `\nOpzegtermijn: [opzegtermijn]`
  }

  if (dossier.stap4.huurprijsPerJaar) {
    text += `\n\nHUUR\n\nContracthuur per jaar: ${formatBedrag(dossier.stap4.huurprijsPerJaar)}`
  }

  if (dossier.stap4.markthuurPerJaar) {
    text += `\nMarkthuur per jaar: ${formatBedrag(dossier.stap4.markthuurPerJaar)}`
  }

  if (dossier.stap4.indexering) {
    text += `\n\nINDEXERING\n\nIndexering: ${dossier.stap4.indexering}`
  }

  text += `\n\nHUURBIJZONDERHEDEN\n\n[Beschrijving huurbijzonderheden]\n\nLEEGSTAND\n\nAanvangsleegstand: [percentage]%`

  return text
}

export function generateH1_Marktvisie(dossier: Dossier): string {
  const template = `H.1 MARKTVISIE

LANDELIJK MARKTBEELD

De Nederlandse vastgoedmarkt voor {{type_object}} kent een evenwichtige tot krappe markt, met regionale verschillen. De markt wordt gekenmerkt door een stabiele vraag naar kwalitatief goed vastgoed.

REGIONAAL MARKTBEELD

De markt in {{plaats}} en omgeving wordt gekenmerkt door een stabiele vraag naar {{type_object}}. De locatie is goed bereikbaar en biedt voldoende voorzieningen.

TOEKOMSTVERWACHTING

Voor de komende jaren wordt een indexering conform de CPI-index verwacht, met een verwachte jaarlijkse stijging van circa 2-3%.`

  return replacePlaceholders(template, dossier)
}

export function generateH2_Huurreferenties(dossier: Dossier, historischeRapporten: HistorischRapport[]): string {
  const selectedReferenties = historischeRapporten.filter(r => 
    dossier.geselecteerdeReferenties.includes(r.id)
  )

  let text = `H.2 HUURREFERENTIES EN OVERZICHT RUIMTES EN MARKTHUUR

TOELICHTING HUURREFERENTIES

Voor het bepalen van de markthuur zijn de volgende referenties geraadpleegd:`

  if (selectedReferenties.length > 0) {
    text += '\n\nHUURREFERENTIELIJST\n'
    selectedReferenties.forEach((rapport, index) => {
      text += `\nReferentie ${index + 1}:\n`
      text += `- Adres: ${rapport.adres.straat} ${rapport.adres.huisnummer}, ${rapport.adres.plaats}\n`
      text += `- Type: ${rapport.typeObject}\n`
      text += `- BVO: ${formatOppervlakte(rapport.bvo)}\n`
      text += `- Bouwjaar: [bouwjaar]\n`
      text += `- Datum: ${formatDatum(rapport.waardepeildatum)}\n`
    })
  }

  text += '\n\nOVERZICHT MARKTHUUR PER RUIMTE\n\n[Tabel met ruimtes en markthuur per m²]'

  return text
}

export function generateH3_Koopreferenties(dossier: Dossier, historischeRapporten: HistorischRapport[]): string {
  const selectedReferenties = historischeRapporten.filter(r => 
    dossier.geselecteerdeReferenties.includes(r.id)
  )

  let text = `H.3 KOOPREFERENTIES EN ONDERBOUWING YIELDS

TOELICHTING KOOPREFERENTIES

Voor het bepalen van de marktwaarde en de gehanteerde rendementen zijn de volgende referenties geraadpleegd:`

  if (selectedReferenties.length > 0) {
    text += '\n\nKOOPREFERENTIELIJST\n'
    selectedReferenties.forEach((rapport, index) => {
      text += `\nReferentie ${index + 1}:\n`
      text += `- Adres: ${rapport.adres.straat} ${rapport.adres.huisnummer}, ${rapport.adres.plaats}\n`
      text += `- Type: ${rapport.typeObject}\n`
      text += `- Bouwjaar: [bouwjaar]\n`
      text += `- BVO: ${formatOppervlakte(rapport.bvo)}\n`
      text += `- Parkeerplaatsen: [aantal]\n`
      text += `- Bron: [bron]\n`
      text += `- Koopsom k.k.: ${formatBedrag(rapport.marktwaarde)}\n`
      text += `- Koopsom per m²: [bedrag per m²]\n`
      if (rapport.bar) {
        text += `- BAR: ${formatPercentage(rapport.bar)}\n`
      }
      text += `- Datum: ${formatDatum(rapport.waardepeildatum)}\n`
    })
  }

  text += '\n\nINPUT YIELDS\n\n[Tabel met NAR, exit yield, disconteringsvoet]\n\nOUTPUT YIELDS\n\n[Tabel met BAR theoretische huur, BAR markthuur, BAR contracthuur]\n\nVERKLARING RENDEMENTEN\n\nDesondanks kan er op basis van de genoemde referenties een (globale) vergelijking gemaakt worden.'

  return text
}

export function generateH4_Correcties(dossier: Dossier): string {
  return `H.4 CORRECTIES EN BIJZONDERE WAARDECOMPONENTEN

CORRECTIES

[Omschrijving toegepaste correcties]

BIJZONDERE WAARDECOMPONENTEN

[Omschrijving bijzondere waardecomponenten indien van toepassing, zoals PV-installatie]`
}

export function generateI_Duurzaamheid(dossier: Dossier): string {
  if (!dossier.stap7) return ''

  const s10 = dossier.stap10
  const energielabel = dossier.stap7.energielabel || 'Onbekend'
  const epcBeng = dossier.stap7.epcBengWaarde || ''
  const installaties = dossier.stap6?.installaties || ''

  let tekst = `I. DUURZAAMHEID

ENERGIELABEL

Energielabel: ${energielabel}`

  if (epcBeng) {
    tekst += `\nEPC/BENG-waarde: ${epcBeng}`
  }

  tekst += `

DUURZAAMHEIDSASPECTEN`

  if (s10?.flexibiliteit) {
    tekst += `\n\nFlexibiliteit: ${s10.flexibiliteit}`
  } else {
    tekst += `\n\nFlexibiliteit: [beoordeling]`
  }

  if (s10?.gebruikDuurzameMaterialen) {
    tekst += `\nGebruik duurzame materialen: ${s10.gebruikDuurzameMaterialen}`
  }

  tekst += `
Demontabel/herbruikbaar: [beoordeling]

ECOLOGISCHE VOORZIENINGEN

Ecologische voorzieningen: [omschrijving]
Licht/ventilatie: [omschrijving]`

  if (s10?.overwegendLedVerlichting !== undefined) {
    tekst += `\nOverwegend LED-verlichting: ${s10.overwegendLedVerlichting ? 'Ja' : 'Nee'}`
  }

  tekst += `

WARMTEOPWEKKING

Warmteopwekking: ${installaties || '[omschrijving]'}
Verwarmingsafgifte: [omschrijving]

LUCHTBEHANDELING

Luchtbehandeling: [omschrijving]

ISOLATIE`

  if (s10?.isolatieDak || s10?.isolatieGevel || s10?.isolatieVloer || s10?.isolatieGlas) {
    if (s10?.isolatieDak) tekst += `\nDak: ${s10.isolatieDak}`
    if (s10?.isolatieGevel) tekst += `\nGevel: ${s10.isolatieGevel}`
    if (s10?.isolatieVloer) tekst += `\nVloer: ${s10.isolatieVloer}`
    if (s10?.isolatieGlas) tekst += `\nGlas: ${s10.isolatieGlas}`
  } else {
    tekst += `\nIsolatie: [omschrijving]`
  }

  tekst += `

ZONNEPANELEN`

  if (s10?.dakoppervlakGeschiktVoorZonnepanelen) {
    tekst += `\nDakoppervlak geschikt voor zonnepanelen: ${s10.dakoppervlakGeschiktVoorZonnepanelen}`
  } else {
    tekst += `\n[Omschrijving zonnepanelen indien aanwezig]`
  }

  if (s10?.aantalOplaadpunten !== undefined && s10.aantalOplaadpunten !== null) {
    tekst += `\n\nOPLAADPUNTEN\n\nAantal oplaadpunten (EV): ${s10.aantalOplaadpunten}`
  }

  if (s10?.duurzaamheidscertificaten) {
    tekst += `\n\nDUURZAAMHEIDSCERTIFICATEN\n\n${s10.duurzaamheidscertificaten}`
  }

  if (s10?.klimaatrisicos) {
    tekst += `\n\nKLIMAATRISICO'S\n\n${s10.klimaatrisicos}`
  }

  if (s10?.greenLease !== undefined) {
    tekst += `\n\nGREEN LEASE\n\nGreen lease: ${s10.greenLease ? 'Van toepassing' : 'Niet van toepassing'}`
  }

  if (s10?.maatregelenVerduurzaming) {
    tekst += `\n\nMAAT­REGELEN VERDUURZAMING\n\n${s10.maatregelenVerduurzaming}`
  }

  if (s10?.marktwaardeNaVerduurzaming) {
    tekst += `\n\nMARKTWAARDE NA VERDUURZAMING\n\nIndicatieve marktwaarde na verduurzaming: ${formatBedrag(s10.marktwaardeNaVerduurzaming)}`
  }

  tekst += `

TOEKOMSTBESTENDIGHEID

Het object voldoet aan de huidige wet- en regelgeving op het gebied van duurzaamheid.

Voor zover bekend zijn geen directe verduurzamingsmaatregelen gepland.

DUURZAAMHEIDSDISCLAIMER

De taxateur gaat ervan uit dat de verstrekte informatie over duurzaamheid en energielabel correct is. De taxateur heeft geen specifiek onderzoek gedaan naar de energetische kwaliteit van het object. De informatie is gebaseerd op het energielabel en visuele waarneming tijdens de inspectie.`

  return tekst
}

export function generateJ_AlgemeneUitgangspunten(dossier: Dossier): string {
  return `J. ALGEMENE UITGANGSPUNTEN

Bij het opstellen van deze taxatie zijn de volgende algemene uitgangspunten gehanteerd:

- De taxatie is opgesteld conform de Richtlijnen Vastgoedtaxaties (RVT), International Valuation Standards (IVS) en European Valuation Standards (EVS/RICS)
- Er is uitgegaan van vrij van huur en gebruik, tenzij anders vermeld
- Het gebruik is conform de bestemming
- Er zijn geen verborgen gebreken verondersteld
- Alle benodigde vergunningen zijn aanwezig en rechtsgeldig
- De verstrekte informatie is correct en volledig
- Er is geen sprake van bodemverontreiniging of asbest
- Het object is vrij van hypotheken en andere zakelijke rechten`
}

export function generateK_WaardebegrippenDefinities(dossier: Dossier): string {
  return `K. WAARDEBEGRIPPEN EN DEFINITIES

KOSTEN KOPER

De marktwaarde is uitgedrukt in kosten koper, dit betekent inclusief overdrachtsbelasting, notariskosten en eventuele makelaarscourtage.

BAR (BRUTO AANVANGSRENDEMENT)

De bruto aanvangshuur gedeeld door de koopprijs kosten koper, uitgedrukt in een percentage.

NAR (NETTO AANVANGSRENDEMENT)

De netto aanvangshuur (na aftrek van exploitatiekosten) gedeeld door de koopprijs kosten koper, uitgedrukt in een percentage.

BVO (BRUTO VLOEROPPERVLAK)

Het totale vloeroppervlak van alle bouwlagen.

VVO (VERHUURBAAR VLOEROPPERVLAK)

Het vloeroppervlak dat direct of indirect voor verhuur beschikbaar is.`
}

export function generateL_Bijlagen(dossier: Dossier): string {
  return `L. BIJLAGEN

De volgende bijlagen maken deel uit van dit rapport:

- Kadastrale gegevens
- Locatiekaart
- Foto's object (exterieur en interieur)
- Oppervlakteberekening
- Energielabel
- Huurcontracten (indien van toepassing)`
}

export function generateOndertekening(dossier: Dossier): string {
  const template = `ONDERTEKENING

Dit rapport is opgesteld conform de Richtlijnen Vastgoedtaxaties (RVT), de International Valuation Standards (IVS) en de European Valuation Standards (EVS/RICS), en de toepasselijke wet- en regelgeving.

De taxatie is uitgevoerd door een gecertificeerd taxateur en gebaseerd op de ten tijde van de inspectie aangetroffen situatie en de verstrekte informatie.


{{plaats}}, {{inspectiedatum}}


____________________________
{{taxateur}}
Gecertificeerd Taxateur NRVT`

  return replacePlaceholders(template, dossier)
}

export function generateAlleSecties(dossier: Dossier, historischeRapporten: HistorischRapport[]): Record<string, string> {
  const variant = getRapportVariant(dossier)
  const isVerhuurd = variant === 'verhuurd_belegging'

  return {
    'samenvatting': generateRapportSamenvatting(dossier),
    'a1-opdrachtgever': generateA1_Opdrachtgever(dossier),
    'a2-taxateur': generateA2_Taxateur(dossier),
    'b1-algemeen': generateB1_Algemeen(dossier),
    'b2-doel-taxatie': generateB2_DoelTaxatie(dossier),
    'b3-waardering-basis': generateB3_WaarderingBasis(dossier),
    'b4-inspectie': generateB4_Inspectie(dossier),
    'b5-uitgangspunten': generateB5_Uitgangspunten(dossier),
    'b6-toelichting-waardering': generateB6_ToelichtingWaardering(dossier),
    'b7-eerdere-taxaties': generateB7_EerdereTaxaties(dossier),
    'b8-inzage-documenten': generateB8_InzageDocumenten(dossier),
    'b9-taxatiemethodiek': generateB9_Taxatiemethodiek(dossier),
    'b10-plausibiliteit': generateB10_Plausibiliteit(dossier),
    'c1-swot': generateC1_SWOT(dossier),
    'c2-beoordeling': generateC2_Beoordeling(dossier),
    'd1-privaatrechtelijk': generateD1_Privaatrechtelijk(dossier),
    'd2-publiekrechtelijk': generateD2_Publiekrechtelijk(dossier),
    'e1-locatie-overzicht': generateE1_LocatieOverzicht(dossier),
    'e2-locatie-informatie': generateE2_LocatieInformatie(dossier),
    'f1-object-informatie': generateF1_ObjectInformatie(dossier),
    'f2-oppervlakte': generateF2_Oppervlakte(dossier),
    'f3-renovatie': generateF3_Renovatie(dossier),
    'f4-milieuaspecten': generateF4_Milieuaspecten(dossier),
    'g1-gebruik-object': generateG1_GebruikObject(dossier),
    'g2-alternatieve-aanwendbaarheid': isVerhuurd 
      ? generateG2_Huursituatie(dossier)
      : generateG2_AlternatieveAanwendbaarheid(dossier),
    'h1-marktvisie': generateH1_Marktvisie(dossier),
    'h2-huurreferenties': generateH2_Huurreferenties(dossier, historischeRapporten),
    'h3-koopreferenties': generateH3_Koopreferenties(dossier, historischeRapporten),
    'h4-correcties': generateH4_Correcties(dossier),
    'i-duurzaamheid': generateI_Duurzaamheid(dossier),
    'j-algemene-uitgangspunten': generateJ_AlgemeneUitgangspunten(dossier),
    'k-waardebegrippen': generateK_WaardebegrippenDefinities(dossier),
    'l-bijlagen': generateL_Bijlagen(dossier),
    'ondertekening': generateOndertekening(dossier),
  }
}
