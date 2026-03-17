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
  
  let template = `I N H O U D S O P G A V E   T A X A T I E R A P P O R T

RAPPORT SAMENVATTING

===== DOSSIER- EN OBJECTMETADATA =====

Dossiernummer: {{dossiernummer}}
Complexnaam: {{complexnaam}}
Adres: {{adres}}
Postcode en plaats: {{postcode}} {{plaats}}
Type eigendom: Volledig eigendom
Te taxeren belang: 100%

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
  const template = `B.4 INSPECTIE

De inspectie van het object heeft plaatsgevonden op {{inspectiedatum}}.

Mate van inspectie: Volledige externe en interne inspectie

De taxateur verklaart dat de bezichtiging geen bouwtechnische keuring is. Voor zover tijdens de inspectie is waargenomen, zijn gebreken en bijzonderheden vermeld in dit rapport. Verborgen gebreken kunnen echter niet worden uitgesloten.`

}
}

  return `B.5 UITGANGSPUNTEN EN AFWIJKINGEN
Tenzij hieronder uitdrukkelijk anders vermeld, gaat de taxateur uit van de volgende aannames:

Tenzij hieronder uitdrukkelijk anders vermeld, gaat de taxateur uit van de volgende aannames:
lieuverontreiniging aanwezig
- Het eigendom is vrij van hypotheken en andere zakelijke rechten
- Het gebruik is in overeenstemming met het omgevingsplan
- Er is geen sprake van asbest of andere gevaarlijke stoffen

- Er is geen sprake van asbest of andere gevaarlijke stoffen


}sier): string {
  const template = `B.6 NADERE TOELICHTING OP DE WAARDERING

De waardering is gebaseerd op de ten tijde van de inspectie aangetroffen situatie en de door opdrachtgever verstrekte informatie.

Voor zover bekend bij taxateur zijn geen noemenswaardige omstandigheden die de waardering significant kunnen beïnvloeden.

Het object wordt geacht conform de huidige bestemming en met de huidige economische functie gebruikt blijft worden.`

export function generateB7_EerdereTaxaties(dossier: Dossier): string {
  return `B.7 EERDERE TAXATIES

}is dit object niet eerder door ons kantoor getaxeerd.

export function generateB7_EerdereTaxaties(dossier: Dossier): string {
  return `B.7 EERDERE TAXATIES

export function generateB8_InzageDocumenten(dossier: Dossier): string {
  return `B.8 OVERZICHT INZAGE DOCUMENTEN
Voor deze taxatie zijn de volgende documenten geraadpleegd:
}

export function generateB8_InzageDocumenten(dossier: Dossier): string {
- Energielabel (www.ep-online.nl)
- Door opdrachtgever verstrekte informatie en documenten`
}

export function generateB9_Taxatiemethodiek(dossier: Dossier): string {
  const template = `B.9 GEHANTEERDE TAXATIEMETHODIEK
- Energielabel (www.ep-online.nl)

Bij deze methode wordt de marktwaarde bepaald door vergelijking met gerealiseerde transacties van vergelijkbare objecten.

BAR/NAR-METHODE
  const template = `B.9 GEHANTEERDE TAXATIEMETHODIEK
Bij de BAR/NAR-methode wordt de (markt)huurwaarde gekapitaliseerd tegen een marktconform rendement.

DCF-METHODE
COMPARATIEVE METHODE
Bij de DCF-methode (Discounted Cash Flow) worden toekomstige kasstromen contant gemaakt tegen een disconteringsvoet.

TOELICHTING
BAR/NAR-METHODE
De ingeschatte markthuurwaarde is derhalve altijd een combinatie van het marktgevoel van de taxateur en (gepubliceerde) gerealiseerde transacties.
Bij de BAR/NAR-methode wordt de (markt)huurwaarde gekapitaliseerd tegen een marktconform rendement.
Desondanks kan er op basis van de genoemde referenties een (globale) vergelijking gemaakt worden.`
DCF-METHODE
  return replacePlaceholders(template, dossier)
Bij de DCF-methode (Discounted Cash Flow) worden toekomstige kasstromen contant gemaakt tegen een disconteringsvoet.

TOELICHTINGr): string {
 const template = `B.10 PLAUSIBILITEIT TAXATIE

gevoerde waardering en de gehanteerde methodiek plausibel en passend bij het type object en de marktomstandigheden.

De marktwaarde van {{marktwaarde}} per waardepeildatum {{waardepeildatum}} wordt als realistisch beschouwd en ligt in lijn met vergelijkbare transacties in de markt.`
  return replacePlaceholders(template, dossier)
  return replacePlaceholders(template, dossier)

export function generateB10_Plausibiliteit(dossier: Dossier): string {
  const template = `B.10 PLAUSIBILITEIT TAXATIE

De taxateur acht de uitgevoerde waardering en de gehanteerde methodiek plausibel en passend bij het type object en de marktomstandigheden.

- Goede locatie met voldoende bereikbaarheid
- Solide bouwkundige staat
  return replacePlaceholders(template, dossier)
}

export function generateC1_SWOT(dossier: Dossier): string {
- Afhankelijkheid van lokale marktomstandigheden
- Energielabel kan verbetering gebruiken
STERKTES
- Goede locatie met voldoende bereikbaarheid
- Verduurzaming kan waarde verhogen
- Representatieve uitstralingren
rzaamheid)
ZWAKTES
- Specifieke invulling beperkt alternatieve aanwendbaarheid
- Afhankelijkheid van lokale marktomstandigheden
- Wijzigingen in wet- en regelgeving`


export function generateC2_Beoordeling(dossier: Dossier): string {
- Marktverbetering kan waardegroei opleveren

COURANTHEID VERHUUR
BEDREIGINGEN
- Economische neergang kan vraag verminderen

}erhuurbaarheid: De verhuurbaarheid van het object wordt als redelijk tot goed beoordeeld.

Verhuurtijd: Bij een verhuurprocedure wordt een verhuurperiode van 6 tot 12 maanden realistisch geacht.

COURANTHEID VERKOOP
COURANTHEID VERHUUR
Score: [score]
Score: [score]
Verkoopbaarheid: De verkoopbaarheid van het object wordt als redelijk tot goed beoordeeld.

Verkooptijd: Bij een verkoopprocedure wordt een verkoopperiode van 9 tot 15 maanden realistisch geacht.

lles overwegende is de courantheid als redelijk tot goed aan te duiden.`
COURANTHEID VERKOOP

export function generateD1_Privaatrechtelijk(dossier: Dossier): string {
  if (!dossier.stap5) return ''

  const template = `D.1 PRIVAATRECHTELIJKE ASPECTEN

KADASTRALE GEGEVENS

}
Kadastrale aanduiding: {{kadastrale_aanduiding}}
export function generateD1_Privaatrechtelijk(dossier: Dossier): string {
Aantekeningen: Voor zover bekend geen bijzondere aantekeningen

  const template = `D.1 PRIVAATRECHTELIJKE ASPECTEN

Eigendomssituatie: ${dossier.stap5.eigendomssituatie || 'Volledig eigendom'}

ERFPACHT

Perceeloppervlak: {{kadastraal_oppervlak}}t van toepassing'}
Aantekeningen: Voor zover bekend geen bijzondere aantekeningen
ZAKELIJKE RECHTEN

Zakelijke rechten: ${dossier.stap5.zakelijkeRechten || 'Voor zover bekend geen'}

KWALITATIEVE VERPLICHTINGEN
ERFPACHT
Kwalitatieve verplichtingen: ${dossier.stap5.kwalitatieveVerplichtingen || 'Voor zover bekend geen'}
Erfpacht: ${dossier.stap5.erfpacht || 'Niet van toepassing'}
VE
ZAKELIJKE RECHTEN

Zakelijke rechten: ${dossier.stap5.zakelijkeRechten || 'Voor zover bekend geen'}
Voor zover bekend zijn er geen belemmeringen die de vrije overdracht of exploitatie van het object belemmeren.`

 return replacePlaceholders(template, dossier)
Kwalitatieve verplichtingen: ${dossier.stap5.kwalitatieveVerplichtingen || 'Voor zover bekend geen'}

export function generateD2_Publiekrechtelijk(dossier: Dossier): string {
  if (!dossier.stap5) return ''
VVE: Niet van toepassing
  const template = `D.2 PUBLIEKRECHTELIJKE ASPECTEN
Voor zover bekend zijn er geen belemmeringen die de vrije overdracht of exploitatie van het object belemmeren.`

  return replacePlaceholders(template, dossier)
}nte}}
ngsplan: ${dossier.stap5.bestemmingsplan || 'Conform bestemming'}
export function generateD2_Publiekrechtelijk(dossier: Dossier): string {
  if (!dossier.stap5) return ''
g met het omgevingsplan.
  const template = `D.2 PUBLIEKRECHTELIJKE ASPECTEN




Bestemmingsplan: ${dossier.stap5.bestemmingsplan || 'Conform bestemming'}
Bestemming: [bestemming]
 fiscale aspecten zoals overdrachtsbelasting, BTW of inkomstenbelasting.
Het huidige gebruik is in overeenstemming met het omgevingsplan.
Voor zover bekend zijn geen bijzondere publiekrechtelijke bepalingen van toepassing.`
MONUMENT
  return replacePlaceholders(template, dossier)
Voorkeursrecht: Niet van toepassing

export function generateE1_LocatieOverzicht(dossier: Dossier): string {
  const template = `E.1 LOCATIEOVERZICHT

{{plaats}}, gemeente {{gemeente}}, provincie {{provincie}}.

LIGGING

}

export function generateE1_LocatieOverzicht(dossier: Dossier): string {
  const template = `E.1 LOCATIEOVERZICHT

Het object is gelegen in {{plaats}}, gemeente {{gemeente}}, provincie {{provincie}}.
te = `E.2 LOCATIE INFORMATIE
LIGGING


Het object is gelegen in {{plaats}}. De omgeving kenmerkt zich door [omschrijving].
  return replacePlaceholders(template, dossier)
}

export function generateE2_LocatieInformatie(dossier: Dossier): string {
  const template = `E.2 LOCATIE INFORMATIEnbaar vervoer

VOORZIENINGEN

In de directe omgeving zijn diverse voorzieningen aanwezig zoals winkels, horeca, openbaar vervoer en parkeervoorzieningen.

BEREIKBAARHEID

Bereikbaarheid auto: {{bereikbaarheid}}

LOCATIESCORE
VOORZIENINGEN

In de directe omgeving zijn diverse voorzieningen aanwezig zoals winkels, horeca, openbaar vervoer en parkeervoorzieningen.

PARKEREN OPENBARE WEGe locatie als goed aan te duiden.`

  return replacePlaceholders(template, dossier)
}
LOCATIESCORE
eF1_ObjectInformatie(dossier: Dossier): string {
Locatiescore: [score].1 OBJECTINFORMATIE
WalkScore: [score]
ALGEMEEN
Alles overwegende is de locatie als goed aan te duiden.`
Het object betreft een {{type_object}} gelegen aan {{adres}} te {{plaats}}.
  return replacePlaceholders(template, dossier)
}Omschrijving indeling]

export function generateF1_ObjectInformatie(dossier: Dossier): string {
Perceeloppervlak: {{perceeloppervlak}}
Aantal bouwlagen: {{aantal_bouwlagen}}



Fundering: {{fundering}}
[Omschrijving indeling]

Bouwjaar: {{bouwjaar}}
Perceeloppervlak: {{perceeloppervlak}}
Aantal bouwlagen: {{aantal_bouwlagen}}

BOUWKUNDIGE STAAT

Bouwkundige staat: {{exterieur_staat}}
Onderhoud buiten: {{exterieur_staat}}
Gevels: [gevels]
Dakbedekking: {{dakbedekking}}
Vloeren: [vloeren]houd van het exterieur wordt gekwalificeerd als {{exterieur_staat}}.
Installaties: {{installaties}}

ONDERHOUD

Bouwkundige staat: {{exterieur_staat}}
Onderhoud buiten: {{exterieur_staat}}
Onderhoud binnen: {{interieur_staat}}

PARKEREN EIGEN TERREIN

Parkeren eigen terrein: [aantal parkeerplaatsen]

FUNCTIONALITEIT


Normonderhoudstype: [type]

PARKEREN EIGEN TERREIN


Alles overwegende is de bouwkundige staat als {{exterieur_staat}} aan te duiden.`

  return replacePlaceholders(template, dossier)
Functionaliteit: [beoordeling]

export function generateF2_Oppervlakte(dossier: Dossier): string {
  const template = `F.2 OPPERVLAKTE

Het object heeft de volgende oppervlakten:

Bruto vloeroppervlak (BVO): {{bvo}}
Verhouding VVO/BVO: [percentage]%`

  return replacePlaceholders(template, dossier)
}

export function generateF3_Renovatie(dossier: Dossier): string {
  return `F.3 RENOVATIE

Voor zover bekend zijn er geen recente renovaties uitgevoerd.

Gebruiksoppervlak (GBO): {{gbo}}
}
Meetinstructie: [meettype]
Verhouding VVO/BVO: [percentage]%`

  return replacePlaceholders(template, dossier)
  return `F.4 MILIEUASPECTEN EN BEOORDELING

ASBEST


Voor zover bekend zijn er geen recente renovaties uitgevoerd.

[Indien wel: omschrijving renovatie en jaar]`
}

ENERGIELABEL

Energielabel: ${dossier.stap7.energielabel || 'Onbekend'}

De taxateur gaat ervan uit dat er geen milieuverontreiniging aanwezig is die de waarde of het gebruik van het object negatief beïnvloedt. Er heeft geen milieukundig onderzoek plaatsgevonden.`
}

Asbest: ${dossier.stap7.asbest === 'ja' ? 'Aanwezig' : dossier.stap7.asbest === 'nee' ? 'Niet aanwezig' : 'Onbekend'}
rtVariant(dossier)
BODEMVERONTREINIGING

Bodemverontreiniging: ${dossier.stap7.bodemverontreiniging === 'ja' ? 'Aanwezig' : dossier.stap7.bodemverontreiniging === 'nee' ? 'Niet aanwezig' : 'Onbekend'}

ENERGIELABELr eigen bedrijfsvoering.'}`

Energielabel: ${dossier.stap7.energielabel || 'Onbekend'}
}
De taxateur gaat ervan uit dat er geen milieuverontreiniging aanwezig is die de waarde of het gebruik van het object negatief beïnvloedt. Er heeft geen milieukundig onderzoek plaatsgevonden.`
}xport function generateG2_AlternatieveAanwendbaarheid(dossier: Dossier): string {


HIGHEST AND BEST USE (HABU)

Het object is geschikt voor de huidige bestemming.
HUIDIG GEBRUIK
Het taxatieoordeel is gebaseerd op de huidige feitelijke situatie en de daarbij behorende bestemming.
export function generateG2_Huursituatie(dossier: Dossier): string {
 || !dossier.stap4.verhuurd) {
    return 'Het object is niet verhuurd.'
  }

export function generateG2_AlternatieveAanwendbaarheid(dossier: Dossier): string {


HIGHEST AND BEST USE (HABU)

Het object is geschikt voor de huidige bestemming.

Het taxatieoordeel is gebaseerd op de huidige feitelijke situatie en de daarbij behorende bestemming.
Huurder: ${dossier.stap4.huurder}
De hoogste en beste use (HABU) wordt bereikt met het huidige gebruik conform de bestemming.`
}

export function generateG2_Huursituatie(dossier: Dossier): string {um)}`
    text += `\nEinddatum: ${formatDatum(dossier.stap4.einddatum)}`
    text += `\nOpzegtermijn: [opzegtermijn]`
  }

  let text = `G.2 HUURSITUATIE

Aanvangsleegstand: [percentage]%

  }

  if (dossier.stap4.markthuurPerJaar) {
    text += `\nMarkthuur per jaar: ${formatBedrag(dossier.stap4.markthuurPerJaar)}`
Huurder: ${dossier.stap4.huurder}
Contracttype: ${dossier.stap4.contracttype || 'ROZ-huurovereenkomst'}`
  if (dossier.stap4.indexering) {
  if (dossier.stap4.ingangsdatum && dossier.stap4.einddatum) {
    text += `\nIngangsdatum: ${formatDatum(dossier.stap4.ingangsdatum)}`
    text += `\nEinddatum: ${formatDatum(dossier.stap4.einddatum)}`
    text += `\nOpzegtermijn: [opzegtermijn]`



ALTERNATIEVE AANWENDBAARHEID

Het object is geschikt voor de huidige bestemming. De hoogste en beste use (HABU) wordt bereikt met het huidige gebruik conform de bestemming.`

  return text
}

export function generateH1_Marktvisie(dossier: Dossier): string {
  const template = `H.1 MARKTVISIE

LANDELIJK MARKTBEELD

De Nederlandse vastgoedmarkt voor {{type_object}} kent een evenwichtige tot krappe markt, met regionale verschillen. De markt wordt gekenmerkt door een stabiele vraag naar kwalitatief goed vastgoed.

REGIONAAL MARKTBEELD

De markt in {{plaats}} en omgeving wordt gekenmerkt door een stabiele vraag naar {{type_object}}. De locatie is goed bereikbaar en biedt voldoende voorzieningen.
[Beschrijving huurbijzonderheden]


Voor de komende jaren wordt een indexering conform de CPI-index verwacht, met een verwachte jaarlijkse stijging van circa 2-3%.`
Het object is geschikt voor de huidige bestemming. De hoogste en beste use (HABU) wordt bereikt met het huidige gebruik conform de bestemming.`
  return replacePlaceholders(template, dossier)
}

export function generateH2_Huurreferenties(dossier: Dossier, historischeRapporten: HistorischRapport[]): string {
  const selectedReferenties = historischeRapporten.filter(r => 
    dossier.geselecteerdeReferenties.includes(r.id)
  )

TOELICHTING HUURREFERENTIES

Voor het bepalen van de markthuur zijn de volgende referenties geraadpleegd:`
REGIONAAL MARKTBEELD
  if (selectedReferenties.length > 0) {
    text += '\n\nHUURREFERENTIELIJST\n'
    selectedReferenties.forEach((rapport, index) => {
      text += `\nReferentie ${index + 1}:\n`
      text += `- Adres: ${rapport.adres.straat} ${rapport.adres.huisnummer}, ${rapport.adres.plaats}\n`
      text += `- Type: ${rapport.typeObject}\n`
      text += `- GBO: ${formatOppervlakte(rapport.gbo)}\n`
      text += `- Bouwjaar: [bouwjaar]\n`
      text += `- Datum: ${formatDatum(rapport.waardepeildatum)}\n`
    })
  }
  const selectedReferenties = historischeRapporten.filter(r => 
    dossier.geselecteerdeReferenties.includes(r.id)
  )

  let text = `H.2 HUURREFERENTIES EN OVERZICHT RUIMTES EN MARKTHUUR

TOELICHTING HUURREFERENTIES

    dossier.geselecteerdeReferenties.includes(r.id)
  )

  let text = `H.3 KOOPREFERENTIES EN ONDERBOUWING YIELDS

TOELICHTING KOOPREFERENTIES

Voor het bepalen van de marktwaarde en de gehanteerde rendementen zijn de volgende referenties geraadpleegd:`

  if (selectedReferenties.length > 0) {
      text += `- Adres: ${rapport.adres.straat} ${rapport.adres.huisnummer}, ${rapport.adres.plaats}\n`
      text += `- Bouwjaar: [bouwjaar]\n`
      text += `- Totaal m²: ${formatOppervlakte(rapport.gbo)}\n`
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
  if (selectedReferenties.length > 0) {
    text += '\n\nKOOPREFERENTIELIJST\n'
    selectedReferenties.forEach((rapport, index) => {

      text += `- Adres: ${rapport.adres.straat} ${rapport.adres.huisnummer}, ${rapport.adres.plaats}\n`

BIJZONDERE WAARDECOMPONENTEN

[Omschrijving bijzondere waardecomponenten indien van toepassing, zoals PV-installatie]`
}

export function generateI_Duurzaamheid(dossier: Dossier): string {
  if (!dossier.stap7) return ''

  const template = `I. DUURZAAMHEID

Energielabel: {{energielabel}}
Flexibiliteit: [beoordeling]
Demontabel/herbruikbaar: [beoordeling]

ECOLOGISCHE VOORZIENINGEN

Ecologische voorzieningen: [omschrijving]
Licht/ventilatie: [omschrijving]

WARMTEOPWEKKING

Warmteopwekking: {{installaties}}
Verwarmingsafgifte: [omschrijving]
[Omschrijving toegepaste correcties]

LUCHTBEHANDELING

Luchtbehandeling: [omschrijving]

ISOLATIE


[Omschrijving zonnepanelen indien aanwezig]

TOEKOMSTBESTENDIGHEID

Het object voldoet aan de huidige wet- en regelgeving op het gebied van duurzaamheid.

Energielabel: {{energielabel}}

Voor zover bekend zijn geen directe verduurzamingsmaatregelen gepland.

DUURZAAMHEIDSDISCLAIMER

Ecologische voorzieningen: [omschrijving]kte informatie over duurzaamheid en energielabel correct is. De taxateur heeft geen specifiek onderzoek gedaan naar de energetische kwaliteit van het object. De informatie is gebaseerd op het energielabel en visuele waarneming tijdens de inspectie.`
  return replacePlaceholders(template, dossier)
}

export function generateJ_AlgemeneUitgangspunten(dossier: Dossier): string {
  return `J. ALGEMENE UITGANGSPUNTEN

Bij het opstellen van deze taxatie zijn de volgende algemene uitgangspunten gehanteerd:

LUCHTBEHANDELINGorm de Richtlijnen Vastgoedtaxaties (RVT), International Valuation Standards (IVS) en European Valuation Standards (EVS/RICS)
- Er is uitgegaan van vrij van huur en gebruik, tenzij anders vermeld
Luchtbehandeling: [omschrijving]n verondersteld
- Alle benodigde vergunningen zijn aanwezig en rechtsgeldig
ISOLATIE
- De verstrekte informatie is correct en volledig
- Er is geen sprake van bodemverontreiniging of asbest
- Het object is vrij van hypotheken en andere zakelijke rechten`
}

[Omschrijving zonnepanelen indien aanwezig]ossier: Dossier): string {
  return `K. WAARDEBEGRIPPEN EN DEFINITIES

KOSTEN KOPER

De marktwaarde is uitgedrukt in kosten koper, dit betekent inclusief overdrachtsbelasting, notariskosten en eventuele makelaarscourtage.

BAR (BRUTO AANVANGSRENDEMENT)

De bruto aanvangshuur gedeeld door de koopprijs kosten koper, uitgedrukt in een percentage.
DUURZAAMHEIDSDISCLAIMER


De netto aanvangshuur (na aftrek van exploitatiekosten) gedeeld door de koopprijs kosten koper, uitgedrukt in een percentage.

BVO (BRUTO VLOEROPPERVLAK)

export function generateJ_AlgemeneUitgangspunten(dossier: Dossier): string {
VVO (VERHUURBAAR VLOEROPPERVLAK)

Het vloeroppervlak dat direct of indirect voor verhuur beschikbaar is.

GBO (GEBRUIKSOPPERVLAK)

- Er zijn geen verborgen gebreken verondersteldructie.`
- Alle benodigde vergunningen zijn aanwezig en rechtsgeldig
- Het gebruik is conform de bestemming
- De verstrekte informatie is correct en volledig
- Er is geen sprake van bodemverontreiniging of asbest
- Het object is vrij van hypotheken en andere zakelijke rechten`
}

- Kadastrale gegevens
- Locatiekaart
- Foto's object (exterieur en interieur)
- Oppervlakteberekening
- Energielabel
- Huurcontracten (indien van toepassing)

KOSTEN KOPERlijnen Vastgoedtaxaties (RVT), de International Valuation Standards (IVS) en de European Valuation Standards (EVS/RICS), en de toepasselijke wet- en regelgeving.`
}
De marktwaarde is uitgedrukt in kosten koper, dit betekent inclusief overdrachtsbelasting, notariskosten en eventuele makelaarscourtage.

  const template = `ONDERTEKENING

Dit rapport is opgesteld conform de Richtlijnen Vastgoedtaxaties (RVT), de International Valuation Standards (IVS) en de European Valuation Standards (EVS/RICS), en de toepasselijke wet- en regelgeving.

De taxatie is uitgevoerd door een gecertificeerd taxateur en gebaseerd op de ten tijde van de inspectie aangetroffen situatie en de verstrekte informatie.


{{plaats}}, {{inspectiedatum}}
BVO (BRUTO VLOEROPPERVLAK)

Het totale vloeroppervlak van alle bouwlagen.
{{taxateur}}
VVO (VERHUURBAAR VLOEROPPERVLAK)

  return replacePlaceholders(template, dossier)
}

export function generateAlleSecties(dossier: Dossier, historischeRapporten: HistorischRapport[]): Record<string, string> {
  const variant = getRapportVariant(dossier)
  const isVerhuurd = variant === 'verhuurd_belegging'

  return {
    'b4-inspectie': generateB4_Inspectie(dossier),
    'b5-uitgangspunten': generateB5_Uitgangspunten(dossier),
    'b6-toelichting-waardering': generateB6_ToelichtingWaardering(dossier),
    'b7-eerdere-taxaties': generateB7_EerdereTaxaties(dossier),
    'b8-inzage-documenten': generateB8_InzageDocumenten(dossier),
    'b9-taxatiemethodiek': generateB9_Taxatiemethodiek(dossier),
- Foto's object (exterieur en interieur)
- Oppervlakteberekening
    'c2-beoordeling': generateC2_Beoordeling(dossier),
    'd1-privaatrechtelijk': generateD1_Privaatrechtelijk(dossier),
krechtelijk(dossier),
Dit rapport is opgesteld conform de Richtlijnen Vastgoedtaxaties (RVT), de International Valuation Standards (IVS) en de European Valuation Standards (EVS/RICS), en de toepasselijke wet- en regelgeving.`
    'e2-locatie-informatie': generateE2_LocatieInformatie(dossier),
generateF1_ObjectInformatie(dossier),
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
____________________________
{{taxateur}}
Gecertificeerd Taxateur NRVT`

  return replacePlaceholders(template, dossier)
}

    'a2-taxateur': generateA2_Taxateur(dossier),    'b2-doel-taxatie': generateB2_DoelTaxatie(dossier),    'f3-renovatie': generateF3_Renovatie(dossier),