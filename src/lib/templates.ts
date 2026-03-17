import type { Dossier, HistorischRapport } from '@/types'
import { formatDatum, formatBedrag, formatOppervlakte } from './fluxFormatter'

function replacePlaceholders(template: string, dossier: Dossier): string {
  let result = template

  if (dossier.stap1) {
    result = result.replace(/{{dossiernummer}}/g, dossier.stap1.dossiernummer || '')
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
  }

  if (dossier.stap3) {
    result = result.replace(/{{gbo}}/g, dossier.stap3.gbo ? formatOppervlakte(dossier.stap3.gbo) : '')
    result = result.replace(/{{bvo}}/g, dossier.stap3.bvo ? formatOppervlakte(dossier.stap3.bvo) : '')
    result = result.replace(/{{vvo}}/g, dossier.stap3.vvo ? formatOppervlakte(dossier.stap3.vvo) : '')
    result = result.replace(/{{perceeloppervlak}}/g, dossier.stap3.perceeloppervlak ? formatOppervlakte(dossier.stap3.perceeloppervlak) : '')
    result = result.replace(/{{aantal_bouwlagen}}/g, dossier.stap3.aantalBouwlagen?.toString() || '')
    result = result.replace(/{{bouwjaar}}/g, dossier.stap3.bouwjaar?.toString() || '')
  }

  if (dossier.stap6) {
    result = result.replace(/{{exterieur_staat}}/g, dossier.stap6.exterieurStaat || '')
    result = result.replace(/{{interieur_staat}}/g, dossier.stap6.interieurStaat || '')
    result = result.replace(/{{fundering}}/g, dossier.stap6.fundering || '')
    result = result.replace(/{{dakbedekking}}/g, dossier.stap6.dakbedekking || '')
    result = result.replace(/{{installaties}}/g, dossier.stap6.installaties || '')
  }

  if (dossier.stap7) {
    result = result.replace(/{{energielabel}}/g, dossier.stap7.energielabel || '')
  }

  if (dossier.stap8) {
    result = result.replace(/{{marktwaarde}}/g, dossier.stap8.marktwaarde ? formatBedrag(dossier.stap8.marktwaarde) : '')
    result = result.replace(/{{onderhandse_verkoopwaarde}}/g, dossier.stap8.onderhandseVerkoopwaarde ? formatBedrag(dossier.stap8.onderhandseVerkoopwaarde) : '')
    result = result.replace(/{{methode}}/g, dossier.stap8.methode?.replace(/_/g, '/') || '')
    if (dossier.stap8.bar) {
      result = result.replace(/{{bar}}/g, `${dossier.stap8.bar.toFixed(2)} %`)
    }
    if (dossier.stap8.nar) {
      result = result.replace(/{{nar}}/g, `${dossier.stap8.nar.toFixed(2)} %`)
    }
  }

  return result
}

export function generateRapportSamenvatting(dossier: Dossier): string {
  const template = `RAPPORT SAMENVATTING

Dossiernummer: {{dossiernummer}}
Complexnaam: {{complexnaam}}
Adres: {{adres}}
Postcode en plaats: {{postcode}} {{plaats}}

Type object: {{type_object}}
Bouwjaar: {{bouwjaar}}
Energielabel: {{energielabel}}

OPPERVLAKTEN

Bruto vloeroppervlak (BVO): {{bvo}}
Verhuurbaar vloeroppervlak (VVO): {{vvo}}
Gebruiksoppervlak (GBO): {{gbo}}
Perceeloppervlak: {{perceeloppervlak}}

WAARDERING

Marktwaarde kosten koper: {{marktwaarde}}
Waardepeildatum: {{waardepeildatum}}

Opdrachtgever: {{opdrachtgever_bedrijf}}
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
Gecertificeerd Taxateur

VERKLARINGEN TAXATEUR INZAKE OPDRACHTVERSTREKKING

De taxateur verklaart dat hij voor deze opdracht onafhankelijk en objectief is en dat er geen sprake is van belangenverstrengeling met opdrachtgever of eigenaar van het getaxeerde object.

De taxateur verklaart dat deze waardering is uitgevoerd conform de Richtlijnen Vastgoedtaxaties (RVT), de International Valuation Standards (IVS) en de European Valuation Standards (EVS) van de Royal Institution of Chartered Surveyors (RICS).

De taxateur gaat ervan uit dat de door opdrachtgever aangeleverde informatie correct en volledig is.`

  return replacePlaceholders(template, dossier)
}

export function generateB1_Algemeen(dossier: Dossier): string {
  const template = `B.1 ALGEMEEN

Het object betreft een {{type_object}} gelegen aan {{adres}} te {{plaats}}.

De waardering is opgemaakt in het Vastgoed Management Systeem van fluX.`

  return replacePlaceholders(template, dossier)
}

export function generateB2_DoelTaxatie(dossier: Dossier): string {
  const template = `B.2 DOEL VAN DE TAXATIE

Het doel van deze taxatie is het vaststellen van de marktwaarde van het object per waardepeildatum {{waardepeildatum}}.

Het rapport is uitsluitend bestemd voor het hiervoor aangegeven doel.`

  return replacePlaceholders(template, dossier)
}

export function generateB3_WaarderingBasis(dossier: Dossier): string {
  const template = `B.3 WAARDERING & BASIS VAN DE WAARDE

De marktwaarde wordt gedefinieerd als:

"Het geschatte bedrag waartegen een eigendom op de waardepeildatum tussen een bereidwillige koper en een bereidwillige verkoper in een zakelijke transactie zou worden overgedragen, na behoorlijke marketing waarbij de partijen zouden hebben gehandeld met kennis van zaken, prudent en niet onder dwang."

De waardepeildatum is {{waardepeildatum}}.

Marktwaarde kosten koper: {{marktwaarde}}`

  return replacePlaceholders(template, dossier)
}

export function generateB4_Inspectie(dossier: Dossier): string {
  const template = `B.4 INSPECTIE

De inspectie van het object heeft plaatsgevonden op {{inspectiedatum}}.

De taxateur verklaart dat de bezichtiging geen bouwtechnische keuring is. Voor zover tijdens de inspectie is waargenomen, zijn gebreken en bijzonderheden vermeld in dit rapport. Verborgen gebreken kunnen echter niet worden uitgesloten.`

  return replacePlaceholders(template, dossier)
}

export function generateB5_Uitgangspunten(dossier: Dossier): string {
  return `B.5 UITGANGSPUNTEN EN AFWIJKINGEN

Tenzij hieronder uitdrukkelijk anders vermeld, gaat de taxateur uit van de volgende aannames:

- Het eigendom is vrij van hypotheken en andere zakelijke rechten
- Er zijn geen verborgen gebreken of milieuverontreiniging aanwezig
- Alle benodigde vergunningen zijn verleend en rechtsgeldig
- Het gebruik is in overeenstemming met het omgevingsplan
- Er zijn geen juridische geschillen of andere bezwaren van toepassing`
}

export function generateB6_ToelichtingWaardering(dossier: Dossier): string {
  const template = `B.6 NADERE TOELICHTING OP DE WAARDERING

De waardering is gebaseerd op de ten tijde van de inspectie aangetroffen situatie en de door opdrachtgever verstrekte informatie.

Voor zover bekend bij taxateur zijn geen noemenswaardige omstandigheden die de waardering significant kunnen beïnvloeden.`

  return replacePlaceholders(template, dossier)
}

export function generateB7_EerdereTaxaties(dossier: Dossier): string {
  return `B.7 EERDERE TAXATIES

Voor zover bij taxateur bekend is dit object niet eerder door ons kantoor getaxeerd.`
}

export function generateB8_InzageDocumenten(dossier: Dossier): string {
  return `B.8 OVERZICHT INZAGE DOCUMENTEN

Voor deze taxatie zijn de volgende documenten geraadpleegd:

- Kadastrale gegevens (www.kadaster.nl)
- Omgevingsplan (www.ruimtelijkeplannen.nl)
- Energielabel (www.ep-online.nl)
- Door opdrachtgever verstrekte informatie en documenten`
}

export function generateB9_Taxatiemethodiek(dossier: Dossier): string {
  const template = `B.9 GEHANTEERDE TAXATIEMETHODIEK

Voor de waardering van dit object is gebruik gemaakt van de volgende methodieken:

- Comparatieve methode (vergelijking met gerealiseerde transacties)
- BAR/NAR-methode (kapitalisatie van (markt)huurwaarde)
- DCF-methode (discounted cash flow)

De ingeschatte markthuurwaarde is derhalve altijd een combinatie van het marktgevoel van de taxateur en (gepubliceerde) gerealiseerde transacties.

Desondanks kan er op basis van de genoemde referenties een (globale) vergelijking gemaakt worden.`

  return replacePlaceholders(template, dossier)
}

export function generateB10_Plausibiliteit(dossier: Dossier): string {
  const template = `B.10 PLAUSIBILITEIT TAXATIE

De taxateur acht de uitgevoerde waardering en de gehanteerde methodiek plausibel en passend bij het type object en de marktomstandigheden.

De marktwaarde van {{marktwaarde}} per waardepeildatum {{waardepeildatum}} wordt als realistisch beschouwd.`

  return replacePlaceholders(template, dossier)
}

export function generateC1_SWOT(dossier: Dossier): string {
  return `C.1 SWOT-ANALYSE

STERKTES

- Locatie in actieve markt
- Goede bereikbaarheid en infrastructuur
- Solide bouwkundige staat

ZWAKTES

- Specifieke invulling beperkt alternatieve aanwendbaarheid
- Afhankelijkheid van lokale marktomstandigheden

KANSEN

- Verduurzaming kan waarde verhogen
- Marktverbetering kan waardegroei opleveren

BEDREIGINGEN

- Economische neergang kan vraag verminderen
- Toekomstige wet- en regelgeving (energielabels, duurzaamheid)`
}

export function generateC2_Beoordeling(dossier: Dossier): string {
  return `C.2 BEOORDELING

COURANTHEID VERHUUR

De verhuurba arheid van het object wordt als redelijk tot goed beoordeeld. Bij leegstand wordt een verhuurperiode van 6 tot 12 maanden realistisch geacht.

COURANTHEID VERKOOP

De verkoopbaarheid van het object wordt als redelijk tot goed beoordeeld. Bij een verkoopprocedure wordt een verkoopperiode van 9 tot 15 maanden realistisch geacht.`
}

export function generateD1_Privaatrechtelijk(dossier: Dossier): string {
  if (!dossier.stap5) return ''

  const template = `D.1 PRIVAATRECHTELIJKE ASPECTEN

Eigendomssituatie: ${dossier.stap5.eigendomssituatie || 'Volledig eigendom'}

Kadastrale gegevens: {{kadastrale_aanduiding}}

Erfpacht: ${dossier.stap5.erfpacht || 'Niet van toepassing'}

Zakelijke rechten: ${dossier.stap5.zakelijkeRechten || 'Voor zover bekend geen'}

Kwalitatieve verplichtingen: ${dossier.stap5.kwalitatieveVerplichtingen || 'Voor zover bekend geen'}

Voor zover bekend zijn er geen belemmeringen die de vrije overdracht of exploitatie van het object belemmeren.`

  return replacePlaceholders(template, dossier)
}

export function generateD2_Publiekrechtelijk(dossier: Dossier): string {
  if (!dossier.stap5) return ''

  const template = `D.2 PUBLIEKRECHTELIJKE ASPECTEN

Gemeente: {{gemeente}}

Bestemmingsplan: ${dossier.stap5.bestemmingsplan || 'Conform bestemming'}

Het huidige gebruik is in overeenstemming met het omgevingsplan.

Monument: Nee

Voorkeursrecht: Niet van toepassing

FISCALE ASPECTEN

Tenzij uitdrukkelijk anders vermeld, is in de taxatie geen rekening gehouden met fiscale aspecten zoals overdrachtsbelasting, BTW of inkomstenbelasting.`

  return replacePlaceholders(template, dossier)
}

export function generateE1_LocatieOverzicht(dossier: Dossier): string {
  const template = `E.1 LOCATIEOVERZICHT

Het object is gelegen in {{plaats}}, gemeente {{gemeente}}, provincie {{provincie}}.

Ligging: {{ligging}}`

  return replacePlaceholders(template, dossier)
}

export function generateE2_LocatieInformatie(dossier: Dossier): string {
  const template = `E.2 LOCATIE INFORMATIE

BEREIKBAARHEID

{{bereikbaarheid}}

VOORZIENINGEN

In de directe omgeving zijn diverse voorzieningen aanwezig zoals winkels, horeca, openbaar vervoer en parkeervoorzieningen.

OMGEVING

Het object is gelegen in een {{ligging}}.

Alles overwegende is de locatie als goed aan te duiden.`

  return replacePlaceholders(template, dossier)
}

export function generateF1_ObjectInformatie(dossier: Dossier): string {
  const template = `F.1 OBJECTINFORMATIE

Het object betreft een {{type_object}} gelegen aan {{adres}} te {{plaats}}.

Bouwjaar: {{bouwjaar}}

Het gebouw heeft {{aantal_bouwlagen}} bouwlagen.

BOUWKUNDIGE STAAT

Fundering: {{fundering}}
Dakbedekking: {{dakbedekking}}
Installaties: {{installaties}}

De staat van onderhoud van het exterieur wordt gekwalificeerd als {{exterieur_staat}}.
Het interieur verkeert in een {{interieur_staat}} staat van onderhoud.

Alles overwegende is de bouwkundige staat als {{exterieur_staat}} aan te duiden.`

  return replacePlaceholders(template, dossier)
}

export function generateF2_Oppervlakte(dossier: Dossier): string {
  const template = `F.2 OPPERVLAKTE

Het object heeft de volgende oppervlakten:

Bruto vloeroppervlak (BVO): {{bvo}}
Verhuurbaar vloeroppervlak (VVO): {{vvo}}
Gebruiksoppervlak (GBO): {{gbo}}
Perceeloppervlak: {{perceeloppervlak}}`

  return replacePlaceholders(template, dossier)
}

export function generateF4_Milieuaspecten(dossier: Dossier): string {
  if (!dossier.stap7) return ''

  return `F.4 MILIEUASPECTEN EN BEOORDELING

Asbest: ${dossier.stap7.asbest === 'ja' ? 'Aanwezig' : dossier.stap7.asbest === 'nee' ? 'Niet aanwezig' : 'Onbekend'}

Bodemverontreiniging: ${dossier.stap7.bodemverontreiniging === 'ja' ? 'Aanwezig' : dossier.stap7.bodemverontreiniging === 'nee' ? 'Niet aanwezig' : 'Onbekend'}

De taxateur gaat ervan uit dat er geen milieuverontreiniging aanwezig is die de waarde of het gebruik van het object negatief beïnvloedt.`
}

export function generateG1_GebruikObject(dossier: Dossier): string {
  const template = `G.1 GEBRUIK VAN HET OBJECT

Het object is in gebruik als {{type_object}} voor {{gebruiksdoel}}.`

  return replacePlaceholders(template, dossier)
}

export function generateG2_AlternatieveAanwendbaarheid(dossier: Dossier): string {
  return `G.2 ALTERNATIEVE AANWENDBAARHEID

Het object is geschikt voor de huidige bestemming.

De hoogste en beste use (HABU) wordt bereikt met het huidige gebruik conform de bestemming.

Het taxatieoordeel is gebaseerd op de huidige feitelijke situatie en de daarbij behorende bestemming.`
}

export function generateG2_Huursituatie(dossier: Dossier): string {
  if (!dossier.stap4 || !dossier.stap4.verhuurd) {
    return 'Het object is niet verhuurd.'
  }

  let text = `G.2 HUURSITUATIE

Het object is verhuurd aan ${dossier.stap4.huurder}.`

  if (dossier.stap4.huurprijsPerJaar) {
    text += `\n\nContracthuur per jaar: ${formatBedrag(dossier.stap4.huurprijsPerJaar)}`
  }

  if (dossier.stap4.markthuurPerJaar) {
    text += `\nMarkthuur per jaar: ${formatBedrag(dossier.stap4.markthuurPerJaar)}`
  }

  if (dossier.stap4.contracttype) {
    text += `\n\nContracttype: ${dossier.stap4.contracttype}`
  }

  if (dossier.stap4.ingangsdatum && dossier.stap4.einddatum) {
    text += `\nLooptijd: ${formatDatum(dossier.stap4.ingangsdatum)} tot ${formatDatum(dossier.stap4.einddatum)}`
  }

  if (dossier.stap4.indexering) {
    text += `\nIndexering: ${dossier.stap4.indexering}`
  }

  return text
}

export function generateH1_Marktvisie(dossier: Dossier): string {
  const template = `H.1 MARKTVISIE

LANDELIJK MARKTBEELD

De Nederlandse vastgoedmarkt voor {{type_object}} kent een evenwichtige tot krappe markt, met regionale verschillen.

REGIONAAL MARKTBEELD

De markt in {{plaats}} en omgeving wordt gekenmerkt door een stabiele vraag naar kwalitatief goed vastgoed.

INDEXVERWACHTINGEN

Voor de komende jaren wordt een indexering conform de CPI-index verwacht.`

  return replacePlaceholders(template, dossier)
}

export function generateH2_Huurreferenties(dossier: Dossier, historischeRapporten: HistorischRapport[]): string {
  const selectedReferenties = historischeRapporten.filter(r => 
    dossier.geselecteerdeReferenties.includes(r.id)
  )

  let text = `H.2 HUURREFERENTIES EN OVERZICHT RUIMTES EN MARKTHUUR

Voor het bepalen van de markthuur zijn de volgende referenties geraadpleegd:`

  if (selectedReferenties.length > 0) {
    text += '\n\n'
    selectedReferenties.forEach((rapport, index) => {
      text += `\nReferentie ${index + 1}:\n`
      text += `- Adres: ${rapport.adres.straat} ${rapport.adres.huisnummer}, ${rapport.adres.plaats}\n`
      text += `- Type: ${rapport.typeObject}\n`
      text += `- GBO: ${formatOppervlakte(rapport.gbo)}\n`
      text += `- Datum: ${formatDatum(rapport.waardepeildatum)}\n`
    })
  }

  text += '\n\nDe ingeschatte markthuurwaarde is derhalve altijd een combinatie van het marktgevoel van de taxateur en (gepubliceerde) gerealiseerde transacties.'

  return text
}

export function generateH3_Koopreferenties(dossier: Dossier, historischeRapporten: HistorischRapport[]): string {
  const selectedReferenties = historischeRapporten.filter(r => 
    dossier.geselecteerdeReferenties.includes(r.id)
  )

  let text = `H.3 KOOPREFERENTIES EN ONDERBOUWING YIELDS

Voor het bepalen van de marktwaarde en de gehanteerde rendementen zijn de volgende referenties geraadpleegd:`

  if (selectedReferenties.length > 0) {
    text += '\n\n'
    selectedReferenties.forEach((rapport, index) => {
      text += `\nReferentie ${index + 1}:\n`
      text += `- Adres: ${rapport.adres.straat} ${rapport.adres.huisnummer}, ${rapport.adres.plaats}\n`
      text += `- Type: ${rapport.typeObject}\n`
      text += `- GBO: ${formatOppervlakte(rapport.gbo)}\n`
      text += `- Marktwaarde: ${formatBedrag(rapport.marktwaarde)}\n`
      if (rapport.bar) {
        text += `- BAR: ${rapport.bar.toFixed(2)} %\n`
      }
      if (rapport.nar) {
        text += `- NAR: ${rapport.nar.toFixed(2)} %\n`
      }
      text += `- Datum: ${formatDatum(rapport.waardepeildatum)}\n`
    })
  }

  text += '\n\nDesondanks kan er op basis van de genoemde referenties een (globale) vergelijking gemaakt worden.'

  return text
}

export function generateH4_Correcties(dossier: Dossier): string {
  return `H.4 ONDERBOUWING CORRECTIES

Voor deze waardering zijn geen significante correcties toegepast buiten de standaard marktconforme aannames.`
}

export function generateI_Duurzaamheid(dossier: Dossier): string {
  if (!dossier.stap7) return ''

  const template = `I. DUURZAAMHEID

ENERGIELABEL

Het object heeft energielabel {{energielabel}}.

INSTALLATIES

{{installaties}}

ISOLATIE

De isolatie van het object voldoet aan de eisen die gelden voor het bouwjaar.

TOEKOMSTBESTENDIGHEID

Het object voldoet aan de huidige wet- en regelgeving op het gebied van duurzaamheid.

VERDUURZAMINGSMAATREGELEN

Voor zover bekend zijn geen directe verduurzamingsmaatregelen gepland.

DUURZAAMHEIDSDISCLAIMER

De taxateur gaat ervan uit dat de verstrekte informatie over duurzaamheid en energielabel correct is. De taxateur heeft geen specifiek onderzoek gedaan naar de energetische kwaliteit van het object.`

  return replacePlaceholders(template, dossier)
}

export function generateJ_AlgemeneUitgangspunten(dossier: Dossier): string {
  return `J. ALGEMENE UITGANGSPUNTEN

Bij het opstellen van deze taxatie zijn de volgende algemene uitgangspunten gehanteerd:

- De taxatie is uitgevoerd conform de Richtlijnen Vastgoedtaxaties (RVT)
- Er is uitgegaan van vrij van huur en gebruik, tenzij anders vermeld
- Er zijn geen verborgen gebreken verondersteld
- Alle benodigde vergunningen zijn aanwezig en rechtsgeldig
- Het gebruik is conform de bestemming
- De verstrekte informatie is correct en volledig

Deze taxatie is gebaseerd op de ten tijde van de inspectie aangetroffen situatie en de op dat moment bekende feiten en omstandigheden.`
}

export function generateK_Waardebegrippen(dossier: Dossier): string {
  return `K. WAARDEBEGRIPPEN EN DEFINITIES

MARKTWAARDE

"Het geschatte bedrag waartegen een eigendom op de waardepeildatum tussen een bereidwillige koper en een bereidwillige verkoper in een zakelijke transactie zou worden overgedragen, na behoorlijke marketing waarbij de partijen zouden hebben gehandeld met kennis van zaken, prudent en niet onder dwang."

BAR (BRUTO AANVANGSRENDEMENT)

De bruto aanvangshuur gedeeld door de koopprijs kosten koper, uitgedrukt in een percentage.

NAR (NETTO AANVANGSRENDEMENT)

De netto aanvangshuur (na aftrek van exploitatiekosten) gedeeld door de koopprijs kosten koper, uitgedrukt in een percentage.

KOSTEN KOPER

De marktwaarde is uitgedrukt in kosten koper, dit betekent inclusief overdrachtsbelasting en notariskosten.`
}

export function generateL_Bijlagen(dossier: Dossier): string {
  return `L. BIJLAGEN

Bij dit rapport behoren de volgende bijlagen:

- Kadastrale gegevens
- Locatiekaart
- Foto's object
- Oppervlakteberekening
- Energielabel`
}

export function generateOndertekening(dossier: Dossier): string {
  const template = `ONDERTEKENING

Dit rapport is opgesteld conform de Richtlijnen Vastgoedtaxaties (RVT) en de toepasselijke wet- en regelgeving.

De taxatie is uitgevoerd door een gecertificeerd taxateur en gebaseerd op de ten tijde van de inspectie aangetroffen situatie en de verstrekte informatie.


{{plaats}}, {{inspectiedatum}}


{{taxateur}}
Gecertificeerd Taxateur`

  return replacePlaceholders(template, dossier)
}

export function generateAlleSecties(dossier: Dossier, historischeRapporten: HistorischRapport[]): Record<string, string> {
  const isVerhuurd = dossier.stap4?.verhuurd || false

  return {
    'rapport-samenvatting': generateRapportSamenvatting(dossier),
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
    'k-waardebegrippen': generateK_Waardebegrippen(dossier),
    'l-bijlagen': generateL_Bijlagen(dossier),
    'ondertekening': generateOndertekening(dossier),
  }
}
  }
}
