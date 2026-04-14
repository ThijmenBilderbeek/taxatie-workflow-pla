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
    result = result.replace(/{{eigendomssituatie}}/g, dossier.stap5.eigendomssituatie || '')
    result = result.replace(/{{erfpacht}}/g, dossier.stap5.erfpacht || '')
    result = result.replace(/{{zakelijke_rechten}}/g, dossier.stap5.zakelijkeRechten || '')
    result = result.replace(/{{kwalitatieve_verplichtingen}}/g, dossier.stap5.kwalitatieveVerplichtingen || '')
    result = result.replace(/{{bestemmingsplan}}/g, dossier.stap5.bestemmingsplan || '')
    result = result.replace(/{{te_taxeren_belang}}/g, dossier.stap5.teTaxerenBelang || '')
    result = result.replace(/{{aantekeningen_kadastraal_object}}/g, dossier.stap5.aantekeningenKadastraalObject || '')
    result = result.replace(/{{toelichting_eigendom_perceel}}/g, dossier.stap5.toelichtingEigendomPerceel || '')
    result = result.replace(/{{gebruik_conform_omgevingsplan}}/g, dossier.stap5.gebruikConformOmgevingsplan || '')
    result = result.replace(/{{bijzondere_publiekrechtelijke_bepalingen}}/g, dossier.stap5.bijzonderePubliekrechtelijkeBepalingen || '')
    result = result.replace(/{{monument}}/g, dossier.stap5.monument || '')
    result = result.replace(/{{voorkeursrecht}}/g, dossier.stap5.voorkeursrecht || '')
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
    result = result.replace(/{{epc_beng_waarde}}/g, dossier.stap7.epcBengWaarde || '')
    result = result.replace(/{{asbest}}/g, dossier.stap7.asbest || '')
    result = result.replace(/{{bodemverontreiniging}}/g, dossier.stap7.bodemverontreiniging || '')
    result = result.replace(/{{toelichting_vergunningen}}/g, dossier.stap7.toelichting || '')
  }

  if (dossier.stap10) {
    result = result.replace(/{{duurzaamheid_isolatie_dak}}/g, dossier.stap10.isolatieDak || '')
    result = result.replace(/{{duurzaamheid_isolatie_gevel}}/g, dossier.stap10.isolatieGevel || '')
    result = result.replace(/{{duurzaamheid_isolatie_vloer}}/g, dossier.stap10.isolatieVloer || '')
    result = result.replace(/{{duurzaamheid_isolatie_glas}}/g, dossier.stap10.isolatieGlas || '')
    result = result.replace(/{{duurzaamheid_flexibiliteit}}/g, dossier.stap10.flexibiliteit || '')
    result = result.replace(/{{duurzaamheid_certificaten}}/g, dossier.stap10.duurzaamheidscertificaten || '')
    result = result.replace(/{{duurzaamheid_klimaatrisicos}}/g, dossier.stap10.klimaatrisicos || '')
    result = result.replace(/{{duurzaamheid_maatregelen}}/g, dossier.stap10.maatregelenVerduurzaming || '')
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
  const aannames = dossier.stap9?.aannames || ''
  const voorbehouden = dossier.stap9?.voorbehouden || ''
  const bijzondereOmstandigheden = dossier.stap9?.bijzondereOmstandigheden || ''
  const algemeneUitgangspunten = dossier.stap9?.algemeneUitgangspunten || ''
  const bijzondereUitgangspunten = dossier.stap9?.bijzondereUitgangspunten || ''

  let template = `B.5 UITGANGSPUNTEN EN AFWIJKINGEN\n\nTenzij hieronder uitdrukkelijk anders vermeld, gaat de taxateur uit van de volgende aannames:\n\n`

  if (algemeneUitgangspunten) {
    template += `ALGEMENE UITGANGSPUNTEN\n\n${algemeneUitgangspunten}\n\n`
  } else {
    template += `- Er is geen sprake van bodemverontreiniging\n- Het eigendom is vrij van hypotheken en andere zakelijke rechten\n- Het gebruik is in overeenstemming met het omgevingsplan\n- Er is geen sprake van asbest of andere gevaarlijke stoffen\n\n`
  }

  if (aannames) {
    template += `AANNAMES\n\n${aannames}\n\n`
  }

  if (voorbehouden) {
    template += `VOORBEHOUDEN\n\n${voorbehouden}\n\n`
  }

  if (bijzondereOmstandigheden) {
    template += `BIJZONDERE OMSTANDIGHEDEN\n\n${bijzondereOmstandigheden}\n\n`
  }

  if (bijzondereUitgangspunten) {
    template += `BIJZONDERE UITGANGSPUNTEN\n\n${bijzondereUitgangspunten}\n\n`
  }

  return replacePlaceholders(template.trimEnd(), dossier)
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
  const inzageItems = dossier.stap9?.inzageItems ?? []
  const ingezienItems = inzageItems.filter((item) => item.status === 'Ja')

  if (ingezienItems.length === 0) {
    return `B.8 OVERZICHT INZAGE DOCUMENTEN

In het kader van de taxatie zijn de volgende documenten geraadpleegd:

- Kadastrale informatie
- Energielabel (www.ep-online.nl)
- Door opdrachtgever verstrekte informatie en documenten`
  }

  let lines = ingezienItems.map((item) => {
    let regel = `- ${item.label}`
    if (item.datum) regel += ` (${item.datum})`
    if (item.bron) regel += ` — bron: ${item.bron}`
    return regel
  })

  return `B.8 OVERZICHT INZAGE DOCUMENTEN

In het kader van de taxatie zijn de volgende documenten ingezien:

${lines.join('\n')}`
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

/**
 * Converteert een multiline string naar bulletpunten voor Flux plain text output.
 * @param text - Vrije tekst met één punt per regel (optioneel voorafgegaan door '-')
 * @returns Array van strings, elk geformatteerd als "- <punt>"; lege regels worden gefilterd
 */
function toBulletList(text: string | undefined): string[] {
  if (!text || text.trim() === '') return []
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => (line.startsWith('-') ? line : `- ${line}`))
}

/** Verlaagt een courantheidscore bij negatieve factoren */
function verlaagScore(score: string): string {
  if (score === 'goed') return 'redelijk tot goed'
  return 'matig'
}

export function generateC1_SWOT(dossier: Dossier): string {
  const sterktes = toBulletList(dossier.stap9?.swotSterktes)
  const zwaktes = toBulletList(dossier.stap9?.swotZwaktes)
  const kansen = toBulletList(dossier.stap9?.swotKansen)
  const bedreigingen = toBulletList(dossier.stap9?.swotBedreigingen)

  const heeftSWOTData =
    sterktes.length > 0 || zwaktes.length > 0 || kansen.length > 0 || bedreigingen.length > 0

  if (!heeftSWOTData) {
    return `C.1 SWOT-ANALYSE\n\n[SWOT-analyse wordt gegenereerd op basis van dossiergegevens]`
  }

  let output = `C.1 SWOT-ANALYSE\n\n`

  output += `STERKTES\n`
  output += sterktes.length > 0 ? sterktes.join('\n') : '- Niet ingevuld'

  output += `\n\nZWAKTES\n`
  output += zwaktes.length > 0 ? zwaktes.join('\n') : '- Niet ingevuld'

  output += `\n\nKANSEN\n`
  output += kansen.length > 0 ? kansen.join('\n') : '- Niet ingevuld'

  output += `\n\nBEDREIGINGEN\n`
  output += bedreigingen.length > 0 ? bedreigingen.join('\n') : '- Niet ingevuld'

  return output
}

export function generateC2_Beoordeling(dossier: Dossier): string {
  const stap1 = dossier.stap1
  const stap2 = dossier.stap2
  const stap3 = dossier.stap3
  const stap4 = dossier.stap4
  const stap6 = dossier.stap6
  const stap7 = dossier.stap7
  const swot = dossier.stap9

  const typeObject = stap1?.typeObject || 'kantoor'
  const objectLabel = typeObject === 'woning' || typeObject === 'appartement' ? 'de woning' : 'het object'
  const ligging = stap2?.ligging || ''
  const locatiescore = stap2?.locatiescore || ''
  const bereikbaarheid = stap2?.bereikbaarheid || ''
  const bvo = stap3?.bvo
  const bouwjaar = stap3?.bouwjaar
  const exterieurStaat = stap6?.exterieurStaat || ''
  const interieurStaat = stap6?.interieurStaat || ''
  const achterstalligOnderhoud = stap6?.achterstalligOnderhoud ?? false
  const energielabel = stap7?.energielabel || ''
  const verhuurd = stap4?.verhuurd ?? false
  const huurprijsPerJaar = stap4?.huurprijsPerJaar
  const leegstandsrisico = stap4?.leegstandsrisico || ''

  // Derive courantheid qualification based on available data
  let verhuurScore = 'redelijk tot goed'
  let verhuurPeriode = '6 tot 12 maanden'
  let verkoopScore = 'redelijk tot goed'
  let verkoopPeriode = '9 tot 15 maanden'

  if (['binnenstad', 'woonwijk'].includes(ligging)) {
    verhuurScore = 'goed'
    verhuurPeriode = '3 tot 9 maanden'
    verkoopScore = 'goed'
    verkoopPeriode = '6 tot 12 maanden'
  } else if (ligging === 'buitengebied') {
    verhuurScore = 'matig'
    verhuurPeriode = '9 tot 18 maanden'
    verkoopScore = 'matig'
    verkoopPeriode = '12 tot 24 maanden'
  }

  if (
    achterstalligOnderhoud ||
    ['matig', 'slecht'].includes(exterieurStaat) ||
    ['matig', 'slecht'].includes(interieurStaat)
  ) {
    verhuurScore = verlaagScore(verhuurScore)
    verkoopScore = verlaagScore(verkoopScore)
  }

  if (energielabel && ['E', 'F', 'G'].includes(energielabel)) {
    verhuurScore = verlaagScore(verhuurScore)
    verkoopScore = verlaagScore(verkoopScore)
  }

  if (bvo && bvo > 5000) {
    verhuurPeriode = '9 tot 15 maanden'
    verkoopPeriode = '12 tot 18 maanden'
  }

  let output = `C.2 BEOORDELING COURANTHEID\n\n`

  // Beoordelingscontext
  const contextRegels: string[] = []
  if (ligging) contextRegels.push(`Ligging: ${ligging.replace(/_/g, ' ')}`)
  if (bereikbaarheid) contextRegels.push(`Bereikbaarheid: ${bereikbaarheid}`)
  if (locatiescore) contextRegels.push(`Locatiescore: ${locatiescore}`)
  if (bvo) contextRegels.push(`BVO: ${formatOppervlakte(bvo)}`)
  if (bouwjaar) contextRegels.push(`Bouwjaar: ${bouwjaar}`)
  if (energielabel && energielabel !== 'geen') contextRegels.push(`Energielabel: ${energielabel}`)
  if (dossier.stap2?.omgevingEnBelendingen) contextRegels.push(`Omgeving: ${dossier.stap2.omgevingEnBelendingen}`)
  if (dossier.stap2?.voorzieningen) contextRegels.push(`Voorzieningen: ${dossier.stap2.voorzieningen}`)
  if (dossier.stap8?.marktwaarde) contextRegels.push(`Marktwaarde: ${formatBedrag(dossier.stap8.marktwaarde)}`)
  if (dossier.stap8?.methode) contextRegels.push(`Waarderingsmethode: ${dossier.stap8.methode.replace(/_/g, '/')}`)

  if (contextRegels.length > 0) {
    output += `BEOORDELINGSCONTEXT\n\n${contextRegels.join('\n')}\n\n`
  }

  // Verhuur
  output += `COURANTHEID VERHUUR\n\nScore: ${verhuurScore}\n`
  output += `Verhuurbaarheid: De verhuurbaarheid van ${objectLabel} wordt als ${verhuurScore} beoordeeld.`
  if (verhuurd && huurprijsPerJaar) {
    output += ` Het object is thans verhuurd voor ${formatBedrag(huurprijsPerJaar)} per jaar.`
  } else if (!verhuurd) {
    output += ` Het object is thans leegstaand.`
  }
  if (leegstandsrisico) {
    output += ` ${leegstandsrisico}`
  }
  output += `\n\nVerhuurtijd: Bij een verhuurprocedure wordt een verhuurperiode van ${verhuurPeriode} realistisch geacht.\n\n`

  // Verkoop
  output += `COURANTHEID VERKOOP\n\nScore: ${verkoopScore}\n`
  output += `Verkoopbaarheid: De verkoopbaarheid van ${objectLabel} wordt als ${verkoopScore} beoordeeld.`
  output += `\n\nVerkooptijd: Bij een verkoopprocedure wordt een verkoopperiode van ${verkoopPeriode} realistisch geacht.\n\n`

  // Bouwkundige staat
  if (exterieurStaat || interieurStaat) {
    output += `BOUWKUNDIGE BEOORDELING\n\n`
    if (exterieurStaat) {
      output += `De bouwtechnische staat van het exterieur wordt beoordeeld als ${exterieurStaat}.`
    }
    if (interieurStaat) {
      output += ` De bouwtechnische staat van het interieur wordt beoordeeld als ${interieurStaat}.`
    }
    if (achterstalligOnderhoud) {
      output += ` Er is sprake van achterstallig onderhoud.`
    }
    output += `\n\n`
  }

  // Eindconclusie
  output += `Alles overwegende is de courantheid als ${verkoopScore} aan te duiden.`

  // SWOT-context voor aandachtspunten
  if (swot?.swotZwaktes || swot?.swotBedreigingen) {
    output += `\n\nBIJZONDERE AANDACHTSPUNTEN`
    if (swot.swotZwaktes) {
      output += `\n\nZwaktes:\n${toBulletList(swot.swotZwaktes).join('\n')}`
    }
    if (swot.swotBedreigingen) {
      output += `\n\nBedreigingen:\n${toBulletList(swot.swotBedreigingen).join('\n')}`
    }
  }

  return output
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

  const erfpacht = dossier.stap5.erfpacht || ''
  template += `

ERFPACHT

${erfpacht || 'Van erfpacht is geen sprake. Het object is in eigendom.'}`

  const zakelijkeRechten = dossier.stap5.zakelijkeRechten || ''
  template += `

ZAKELIJKE RECHTEN

${zakelijkeRechten || 'Voor zover bekend zijn er geen zakelijke rechten gevestigd op het object die de vrije overdracht of exploitatie belemmeren.'}`

  const kwalitatieveVerplichtingen = dossier.stap5.kwalitatieveVerplichtingen || ''
  template += `

KWALITATIEVE VERPLICHTINGEN

${kwalitatieveVerplichtingen || 'Voor zover bekend zijn er geen kwalitatieve verplichtingen van toepassing.'}`

  template += `

OVERIGE PRIVAATRECHTELIJKE ASPECTEN

Voor zover bekend zijn er geen belemmeringen die de vrije overdracht of exploitatie van het object belemmeren.`

  return replacePlaceholders(template, dossier)
}

export function generateD2_Publiekrechtelijk(dossier: Dossier): string {
  if (!dossier.stap5) return ''

  const gebruikConform = dossier.stap5.gebruikConformOmgevingsplan || 'Het huidige gebruik is in overeenstemming met het omgevingsplan.'
  const bijzondereBep = dossier.stap5.bijzonderePubliekrechtelijkeBepalingen || 'Voor zover bekend zijn geen bijzondere publiekrechtelijke bepalingen van toepassing.'
  const monument = dossier.stap5.monument || 'Niet van toepassing'
  const voorkeursrecht = dossier.stap5.voorkeursrecht || 'Niet van toepassing'

  const template = `D.2 PUBLIEKRECHTELIJKE ASPECTEN

OMGEVINGSPLAN

Gemeente: {{gemeente}}
Omgevingsplan: ${dossier.stap5.bestemmingsplan || 'Conform geldende bestemming'}

${gebruikConform}

MONUMENT

Monument: ${monument}

VOORKEURSRECHT

Voorkeursrecht: ${voorkeursrecht}

BIJZONDERE PUBLIEKRECHTELIJKE BEPALINGEN

${bijzondereBep}`

  return replacePlaceholders(template, dossier)
}

/** Objecttypen die als woning/residentieel worden aangemerkt. */
const RESIDENTIEEL_TYPES = ['woning', 'appartement'] as const

/** Professionele beschrijving per liggingstype voor gebruik in locatieteksten. */
const LIGGING_BESCHRIJVING: Record<string, string> = {
  binnenstad: 'een centrale, goed ontsloten locatie in het stadscentrum',
  woonwijk: 'een woonlocatie in een stedelijke omgeving met nabijgelegen voorzieningen',
  bedrijventerrein: 'een functionele werklocatie op een bedrijventerrein',
  buitengebied: 'een locatie in het buitengebied, buiten de bebouwde kom',
  gemengd: 'een gemengd gebied met zowel woon- als bedrijfsfuncties',
}

/** Basis locatiekwalificatie per liggingstype. */
const LIGGING_KWALIFICATIE: Record<string, string> = {
  binnenstad: 'goed',
  woonwijk: 'goed',
  bedrijventerrein: 'redelijk tot goed',
  buitengebied: 'matig',
  gemengd: 'redelijk',
}

/** Verwijdert een eventueel voorloopstreepje (bullet) uit een tekstregel. */
function removeBullet(text: string): string {
  return text.replace(/^-\s*/, '')
}

/**
 * Genereert een syntheserende locatiebeoordeling op basis van stap2-data,
 * objectschaal (stap3) en SWOT-context (stap9).
 * Wordt gebruikt als afsluiting van E.2.
 */
function generateLocatieBeoordeling(dossier: Dossier): string {
  const ligging = dossier.stap2?.ligging || ''
  const bereikbaarheid = dossier.stap2?.bereikbaarheid || ''
  const voorzieningen = dossier.stap2?.voorzieningen || ''
  const verwachteOntwikkelingen = dossier.stap2?.verwachteOntwikkelingen || ''
  const locatiescore = dossier.stap2?.locatiescore || ''
  const bvo = dossier.stap3?.bvo
  const typeObject = dossier.stap1?.typeObject || ''

  const swotSterktes = toBulletList(dossier.stap9?.swotSterktes)
  const swotZwaktes = toBulletList(dossier.stap9?.swotZwaktes)
  const swotKansen = toBulletList(dossier.stap9?.swotKansen)
  const swotBedreigingen = toBulletList(dossier.stap9?.swotBedreigingen)

  const objectLabel = (RESIDENTIEEL_TYPES as readonly string[]).includes(typeObject) ? 'de woning' : 'het object'

  // Determine base qualification from ligging, then refine
  let kwalificatie = LIGGING_KWALIFICATIE[ligging] || 'redelijk'

  // Explicit locatiescore overrides the derived qualification
  if (locatiescore) {
    kwalificatie = locatiescore
  } else {
    // Adjust downward when SWOT signals weaknesses or threats
    const heeftNegatieveSWOT = swotZwaktes.length > 0 || swotBedreigingen.length > 0
    if (heeftNegatieveSWOT && kwalificatie === 'goed') {
      kwalificatie = 'redelijk tot goed'
    }
  }

  let output = `LOCATIEBEOORDELING\n\n`

  // Opening sentence: ligging + objecttype context
  if (ligging) {
    const liggingBeschrijving = LIGGING_BESCHRIJVING[ligging] || ligging.replace(/_/g, ' ')
    output += `De locatie van ${objectLabel} betreft ${liggingBeschrijving}.`
  } else {
    output += `De locatie van ${objectLabel} is beoordeeld op basis van beschikbare locatiegegevens.`
  }

  // Bereikbaarheid
  if (bereikbaarheid) {
    output += ` De bereikbaarheid per auto is ${bereikbaarheid}.`
  }

  // Voorzieningen (condensed)
  if (voorzieningen) {
    output += ` Voorzieningen in de directe omgeving zijn aanwezig.`
  }

  // Scale context
  if (bvo) {
    if (bvo > 5000) {
      output += ` Met een bruto vloeroppervlak van ${formatOppervlakte(bvo)} betreft het een grootschalig object, waarvoor een diepere markt bestaat in stedelijke locaties.`
    } else if (bvo < 300) {
      output += ` Het betreft een kleinschalig object met een bruto vloeroppervlak van ${formatOppervlakte(bvo)}.`
    }
  }

  // SWOT strengths as supporting argument (if available)
  if (swotSterktes.length > 0) {
    const sterktePunt = removeBullet(swotSterktes[0])
    output += ` Een positief kenmerk van de locatie is: ${sterktePunt}.`
  }

  // Future developments
  if (verwachteOntwikkelingen) {
    output += `\n\nDe verwachte ontwikkelingen in de omgeving zijn van invloed op de toekomstige locatiekwaliteit en verdienen opvolging.`
  }

  // SWOT kansen as opportunities
  if (swotKansen.length > 0) {
    const kansPunt = removeBullet(swotKansen[0])
    output += ` Een relevant kansen-aspect is: ${kansPunt}.`
  }

  // SWOT weaknesses/threats as attention points
  const aandachtspunten: string[] = []
  if (swotZwaktes.length > 0) aandachtspunten.push(removeBullet(swotZwaktes[0]))
  if (swotBedreigingen.length > 0) aandachtspunten.push(removeBullet(swotBedreigingen[0]))

  if (aandachtspunten.length > 0) {
    output += `\n\nAandachtspunten voor de locatiekwaliteit betreffen: ${aandachtspunten.join('; ')}.`
  }

  // Final conclusion
  output += `\n\nAlles overwegende wordt de locatiekwaliteit gekwalificeerd als ${kwalificatie}.`

  return output
}

export function generateE1_LocatieOverzicht(dossier: Dossier): string {
  const omgeving = dossier.stap2?.omgevingEnBelendingen || ''
  const ligging = dossier.stap2?.ligging || ''
  const liggingBeschrijving = LIGGING_BESCHRIJVING[ligging] || ligging.replace(/_/g, ' ')
  const typeObject = dossier.stap1?.typeObject || ''
  const gebruiksdoel = dossier.stap1?.gebruiksdoel?.replace(/_/g, ' ') || ''
  const bvo = dossier.stap3?.bvo

  let template = `E.1 LOCATIEOVERZICHT\n\n`
  template += `Het object is gelegen aan {{adres}}, {{postcode}} {{plaats}}, gemeente {{gemeente}}, provincie {{provincie}}.\n\n`

  // Object type context
  if (typeObject) {
    const isWoning = (RESIDENTIEEL_TYPES as readonly string[]).includes(typeObject)
    const objectLabel = isWoning ? 'De woning betreft' : `Het object betreft`
    const gebruikLabel = gebruiksdoel || typeObject
    if (bvo) {
      template += `${objectLabel} een ${gebruikLabel} met een bruto vloeroppervlak van {{bvo}}.\n\n`
    } else {
      template += `${objectLabel} een ${gebruikLabel}.\n\n`
    }
  }

  // Ligging section
  template += `LIGGING\n\n`
  if (liggingBeschrijving) {
    template += `Het object is gelegen in {{gemeente}} op ${liggingBeschrijving}.`
  } else {
    template += `Het object is gelegen in {{gemeente}}.`
  }

  // Omgeving en belendingen
  if (omgeving) {
    template += `\n\nOMGEVING EN BELENDINGEN\n\n${omgeving}`
  }

  return replacePlaceholders(template, dossier)
}

export function generateE2_LocatieInformatie(dossier: Dossier): string {
  const voorzieningen = dossier.stap2?.voorzieningen || ''
  const verwachteOntwikkelingen = dossier.stap2?.verwachteOntwikkelingen || ''
  const locatiescore = dossier.stap2?.locatiescore || ''
  const bereikbaarheid = dossier.stap2?.bereikbaarheid || ''
  const ligging = dossier.stap2?.ligging || ''
  const toelichtingParkeren = dossier.stap6?.toelichtingParkeren || ''

  // Smart OV bereikbaarheid fallback based on ligging type
  const ovFallback: Record<string, string> = {
    binnenstad: 'goed — meerdere bus- en tramlijnen op loopafstand',
    woonwijk: 'redelijk tot goed — diverse bushaltes in de nabijheid',
    bedrijventerrein: 'matig — beperkt openbaar vervoer in de directe omgeving',
    buitengebied: 'matig tot slecht — weinig tot geen openbaar vervoer aanwezig',
    gemengd: 'redelijk — enige busverbindingen beschikbaar',
  }
  const ovBereikbaarheid = ligging && ovFallback[ligging] ? ovFallback[ligging] : 'conform ligging in de omgeving'

  // Parking description: use stap6 toelichting if available, otherwise ligging-based fallback
  const parkerenFallback: Record<string, string> = {
    binnenstad: 'parkeren op de openbare weg is beperkt beschikbaar; betaald parkeren van toepassing in de directe omgeving',
    woonwijk: 'parkeren op de openbare weg is doorgaans mogelijk in de directe omgeving',
    bedrijventerrein: 'voldoende parkeermogelijkheden aanwezig op het terrein en in de directe omgeving',
    buitengebied: 'ruime parkeermogelijkheden beschikbaar op eigen terrein en langs de rijweg',
    gemengd: 'parkeermogelijkheden aanwezig, beschikbaarheid kan variëren per dagdeel',
  }
  let parkerenOmschrijving: string
  if (toelichtingParkeren) {
    parkerenOmschrijving = toelichtingParkeren
  } else if (ligging && parkerenFallback[ligging]) {
    parkerenOmschrijving = parkerenFallback[ligging]
  } else {
    parkerenOmschrijving = 'parkeermogelijkheden in de directe omgeving aanwezig'
  }

  let template = `E.2 LOCATIE INFORMATIE\n\n`

  // Voorzieningen
  template += `VOORZIENINGEN\n\n`
  template += voorzieningen
    || 'In de directe omgeving zijn diverse voorzieningen aanwezig, waaronder winkels, horeca en openbaar vervoer.'

  // Bereikbaarheid
  template += `\n\nBEREIKBAARHEID\n\n`
  if (bereikbaarheid) {
    template += `Bereikbaarheid per auto: ${bereikbaarheid}`
  } else {
    template += `Bereikbaarheid per auto: bereikbaarheid conform ligging`
  }
  template += `\nBereikbaarheid openbaar vervoer: ${ovBereikbaarheid}`

  // Parkeren
  template += `\n\nPARKEREN\n\n${parkerenOmschrijving}`

  // Locatiescore (only if filled in)
  if (locatiescore) {
    template += `\n\nLOCATIESCORE\n\nLocatiescore: ${locatiescore}`
  }

  // Verwachte ontwikkelingen
  if (verwachteOntwikkelingen) {
    template += `\n\nVERWACHTE ONTWIKKELINGEN\n\n${verwachteOntwikkelingen}`
  }

  // Synthesized locatiebeoordeling
  template += `\n\n${generateLocatieBeoordeling(dossier)}`

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

  if (bouwjaar && renovatiejaar > bouwjaar) {
    const ouderdom = renovatiejaar - bouwjaar
    tekst += ` Ten tijde van de renovatie was het object circa ${ouderdom} jaar oud.`
  }

  tekst += `

De renovatie heeft bijgedragen aan de bouwkundige kwaliteit en functionele bruikbaarheid van het object.`

  if (dossier.stap6?.exterieurStaat) {
    tekst += `\n\nDe huidige bouwkundige staat van het exterieur wordt beoordeeld als ${dossier.stap6.exterieurStaat}.`
  }
  if (dossier.stap6?.interieurStaat) {
    tekst += ` De bouwkundige staat van het interieur wordt beoordeeld als ${dossier.stap6.interieurStaat}.`
  }

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

  const s7 = dossier.stap7
  const s10 = dossier.stap10
  const s6 = dossier.stap6
  const s9 = dossier.stap9

  const energielabel = s7.energielabel || 'Onbekend'
  const epcBeng = s7.epcBengWaarde || ''
  const asbest = s7.asbest || 'onbekend'
  const bodem = s7.bodemverontreiniging || 'onbekend'
  const toelichtingVergunningen = s7.toelichting || ''
  const installaties = s6?.installaties || ''
  const milieuaspecten = s6?.omschrijvingMilieuaspecten || ''

  // Build isolatie summary
  const isolatieRegels: string[] = []
  if (s10?.isolatieDak) isolatieRegels.push(`Dak: ${s10.isolatieDak}`)
  if (s10?.isolatieGevel) isolatieRegels.push(`Gevel: ${s10.isolatieGevel}`)
  if (s10?.isolatieVloer) isolatieRegels.push(`Vloer: ${s10.isolatieVloer}`)
  if (s10?.isolatieGlas) isolatieRegels.push(`Glas: ${s10.isolatieGlas}`)

  let tekst = `I. DUURZAAMHEID

ENERGETISCHE KWALITEIT

Energielabel: ${energielabel}`

  if (epcBeng) {
    tekst += `\nEPC/BENG-waarde: ${epcBeng}`
  }

  // Duurzaamheidscertificaten indien aanwezig
  if (s10?.duurzaamheidscertificaten) {
    tekst += `\nDuurzaamheidscertificering: ${s10.duurzaamheidscertificaten}`
  }

  tekst += `

ISOLATIE EN INSTALLATIES`

  if (isolatieRegels.length > 0) {
    tekst += `\n\n${isolatieRegels.join('\n')}`
  } else {
    tekst += `\n\nIsolatie: Niet nader onderzocht; geen specifieke informatie beschikbaar.`
  }

  if (installaties) {
    tekst += `\n\nInstallaties: ${installaties}`
  }

  if (s10?.overwegendLedVerlichting !== undefined) {
    tekst += `\nOverwegend LED-verlichting: ${s10.overwegendLedVerlichting ? 'Ja' : 'Nee'}`
  }

  if (s10?.flexibiliteit) {
    tekst += `\nFlexibiliteit / toekomstbestendigheid: ${s10.flexibiliteit}`
  }

  if (s10?.gebruikDuurzameMaterialen) {
    tekst += `\nGebruik duurzame materialen: ${s10.gebruikDuurzameMaterialen}`
  }

  // Zonnepanelen / oplaadpunten
  if (s10?.dakoppervlakGeschiktVoorZonnepanelen || s10?.aantalOplaadpunten != null) {
    tekst += `\n\nDUURZAAMHEIDSVOORZIENINGEN`
    if (s10?.dakoppervlakGeschiktVoorZonnepanelen) {
      tekst += `\n\nDakoppervlak geschikt voor zonnepanelen: ${s10.dakoppervlakGeschiktVoorZonnepanelen}`
    }
    if (s10?.aantalOplaadpunten != null) {
      tekst += `\nAantal oplaadpunten (EV): ${s10.aantalOplaadpunten}`
    }
  }

  if (s10?.greenLease !== undefined) {
    tekst += `\n\nGREEN LEASE\n\nGreen lease: ${s10.greenLease ? 'Van toepassing' : 'Niet van toepassing'}`
  }

  tekst += `

MILIEU EN RISICO`

  const asbestTekst = asbest === 'ja' ? 'Ja – aanwezig' : asbest === 'nee' ? 'Nee – niet aangetroffen' : 'Onbekend'
  const bodemTekst = bodem === 'ja' ? 'Ja – aanwezig' : bodem === 'nee' ? 'Nee – niet aangetroffen' : 'Onbekend'
  tekst += `\n\nAsbest: ${asbestTekst}`
  tekst += `\nBodemverontreiniging: ${bodemTekst}`

  if (milieuaspecten) {
    tekst += `\nOverige milieuaspecten: ${milieuaspecten}`
  }

  if (s10?.klimaatrisicos) {
    tekst += `\nKlimaatrisico's: ${s10.klimaatrisicos}`
  }

  if (toelichtingVergunningen) {
    tekst += `\n\nToelichting: ${toelichtingVergunningen}`
  }

  tekst += `

VERDUURZAMINGSPOTENTIE`

  if (s10?.maatregelenVerduurzaming) {
    tekst += `\n\n${s10.maatregelenVerduurzaming}`
  } else {
    // Derive potential from label and isolation scores
    const labelGoed = ['A', 'A+', 'A++', 'A+++', 'A++++'].includes(energielabel)
    if (labelGoed) {
      tekst += `\n\nHet object heeft een gunstig energielabel. Directe verduurzamingsmaatregelen zijn op basis van beschikbare informatie niet noodzakelijk.`
    } else {
      tekst += `\n\nOp basis van het energielabel en de bouwkundige staat bestaan mogelijkheden voor verdere verduurzaming. Concrete maatregelen zijn niet nader onderzocht.`
    }
  }

  if (s10?.marktwaardeNaVerduurzaming) {
    tekst += `\n\nIndicatieve marktwaarde na verduurzaming: ${formatBedrag(s10.marktwaardeNaVerduurzaming)}`
  }

  // SWOT as supporting context – only summarise if sustainability-relevant entries are present
  if (s9?.swotKansen || s9?.swotBedreigingen) {
    const kansen = s9.swotKansen?.trim()
    const bedreigingen = s9.swotBedreigingen?.trim()
    if (kansen || bedreigingen) {
      tekst += `\n\nCONTEXT DUURZAAMHEID`
      if (kansen) tekst += `\n\nKansen (SWOT): ${kansen}`
      if (bedreigingen) tekst += `\nBedreigingen (SWOT): ${bedreigingen}`
    }
  }

  tekst += `

DUURZAAMHEIDSDISCLAIMER

De taxateur gaat ervan uit dat de verstrekte informatie over duurzaamheid en energielabel correct is. De taxateur heeft geen specifiek onderzoek gedaan naar de energetische kwaliteit van het object. De informatie is gebaseerd op het energielabel en visuele waarneming tijdens de inspectie.`

  return tekst
}

export function generateJ_AlgemeneUitgangspunten(dossier: Dossier): string {
  const aannames = dossier.stap9?.aannames || ''
  const voorbehouden = dossier.stap9?.voorbehouden || ''
  const algemeneUitgangspunten = dossier.stap9?.algemeneUitgangspunten || ''

  let tekst = `J. ALGEMENE UITGANGSPUNTEN\n\nBij het opstellen van deze taxatie zijn de volgende algemene uitgangspunten gehanteerd:\n\n`

  if (algemeneUitgangspunten) {
    tekst += `${algemeneUitgangspunten}\n\n`
  } else {
    tekst += `- De taxatie is opgesteld conform de Richtlijnen Vastgoedtaxaties (RVT), International Valuation Standards (IVS) en European Valuation Standards (EVS/RICS)\n`
    tekst += `- Er is uitgegaan van vrij van huur en gebruik, tenzij anders vermeld\n`
    tekst += `- Het gebruik is conform de bestemming\n`
    tekst += `- Er zijn geen verborgen gebreken verondersteld\n`
    tekst += `- Alle benodigde vergunningen zijn aanwezig en rechtsgeldig\n`
    tekst += `- De verstrekte informatie is correct en volledig\n`
    tekst += `- Er is geen sprake van bodemverontreiniging of asbest\n`
    tekst += `- Het object is vrij van hypotheken en andere zakelijke rechten\n`
  }

  if (aannames) {
    tekst += `\nAANNAMES\n\n${aannames}\n`
  }

  if (voorbehouden) {
    tekst += `\nVOORBEHOUDEN\n\n${voorbehouden}\n`
  }

  return tekst.trimEnd()
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
