import type { Dossier, HistorischRapport } from '@/types'
import { formatDatum, formatBedrag, formatOppervlakte } from './fluxFormatter'

function replacePlaceholders(template: string, dossier: Dossier): string {
  let result = template

  if (dossier.stap1) {
    result = result.replace(/{{dossiernummer}}/g, dossier.stap1.dossiernummer)
    result = result.replace(/{{objectnaam}}/g, dossier.stap1.objectnaam)
    result = result.replace(/{{type_object}}/g, dossier.stap1.typeObject)
    result = result.replace(/{{gebruiksdoel}}/g, dossier.stap1.gebruiksdoel.replace(/_/g, ' '))
    result = result.replace(/{{opdrachtgever_naam}}/g, dossier.stap1.opdrachtgever.naam)
    result = result.replace(/{{opdrachtgever_bedrijf}}/g, dossier.stap1.opdrachtgever.bedrijf)
    result = result.replace(/{{taxateur}}/g, dossier.stap1.naamTaxateur)
    result = result.replace(/{{waardepeildatum}}/g, formatDatum(dossier.stap1.waardepeildatum))
    result = result.replace(/{{inspectiedatum}}/g, formatDatum(dossier.stap1.inspectiedatum))
  }

  if (dossier.stap2) {
    result = result.replace(/{{adres}}/g, `${dossier.stap2.straatnaam} ${dossier.stap2.huisnummer}`)
    result = result.replace(/{{postcode}}/g, dossier.stap2.postcode)
    result = result.replace(/{{plaats}}/g, dossier.stap2.plaats)
    result = result.replace(/{{gemeente}}/g, dossier.stap2.gemeente)
    result = result.replace(/{{provincie}}/g, dossier.stap2.provincie)
    result = result.replace(/{{kadastrale_aanduiding}}/g, 
      `${dossier.stap2.kadasterAanduiding.gemeente}, sectie ${dossier.stap2.kadasterAanduiding.sectie}, perceelnummer ${dossier.stap2.kadasterAanduiding.perceelnummer}`)
    result = result.replace(/{{kadastraal_oppervlak}}/g, formatOppervlakte(dossier.stap2.kadastraalOppervlak))
    result = result.replace(/{{ligging}}/g, dossier.stap2.ligging.replace(/_/g, ' '))
  }

  if (dossier.stap3) {
    result = result.replace(/{{gbo}}/g, formatOppervlakte(dossier.stap3.gbo))
    result = result.replace(/{{bvo}}/g, formatOppervlakte(dossier.stap3.bvo))
    result = result.replace(/{{vvo}}/g, formatOppervlakte(dossier.stap3.vvo))
    result = result.replace(/{{perceeloppervlak}}/g, formatOppervlakte(dossier.stap3.perceeloppervlak))
    result = result.replace(/{{aantal_bouwlagen}}/g, String(dossier.stap3.aantalBouwlagen))
    result = result.replace(/{{bouwjaar}}/g, String(dossier.stap3.bouwjaar))
  }

  if (dossier.stap6) {
    result = result.replace(/{{exterieur_staat}}/g, dossier.stap6.exterieurStaat)
    result = result.replace(/{{interieur_staat}}/g, dossier.stap6.interieurStaat)
  }

  if (dossier.stap7) {
    result = result.replace(/{{energielabel}}/g, dossier.stap7.energielabel)
  }

  if (dossier.stap8) {
    result = result.replace(/{{marktwaarde}}/g, formatBedrag(dossier.stap8.marktwaarde))
    result = result.replace(/{{onderhandse_verkoopwaarde}}/g, formatBedrag(dossier.stap8.onderhandseVerkoopwaarde))
    result = result.replace(/{{methode}}/g, dossier.stap8.methode.replace(/_/g, '/'))
    if (dossier.stap8.bar) {
      result = result.replace(/{{bar}}/g, `${dossier.stap8.bar}%`)
    }
    if (dossier.stap8.nar) {
      result = result.replace(/{{nar}}/g, `${dossier.stap8.nar}%`)
    }
  }

  return result
}

export function generateOpdracht(dossier: Dossier): string {
  const template = `In opdracht van {{opdrachtgever_naam}}, handelend namens {{opdrachtgever_bedrijf}}, is een taxatie uitgevoerd van het object gelegen aan {{adres}} te {{plaats}}.

Het doel van deze taxatie is het vaststellen van de marktwaarde van het object per waardepeildatum {{waardepeildatum}}.

De taxatie is uitgevoerd door {{taxateur}} op {{inspectiedatum}}, conform de Richtlijnen Vastgoedtaxaties (RVT).`

  return replacePlaceholders(template, dossier)
}

export function generateObjectomschrijving(dossier: Dossier): string {
  const template = `Het object betreft een {{type_object}} gelegen aan {{adres}} te {{plaats}}, kadastraal bekend als {{kadastrale_aanduiding}}.

Het object heeft een gebruiksoppervlak (GBO) van {{gbo}} en een bruto vloeroppervlak (BVO) van {{bvo}}. Het verhuurbaar vloeroppervlak (VVO) bedraagt {{vvo}}.

Het gebouw telt {{aantal_bouwlagen}} bouwlagen en is gebouwd in het jaar {{bouwjaar}}.`

  return replacePlaceholders(template, dossier)
}

export function generateLiggingEnBereikbaarheid(dossier: Dossier): string {
  if (!dossier.stap2) return ''

  const template = `Het object is gelegen in een {{ligging}} in {{plaats}}, gemeente {{gemeente}}, provincie {{provincie}}.

${dossier.stap2.bereikbaarheid}`

  return replacePlaceholders(template, dossier)
}

export function generateKadasterEnEigendom(dossier: Dossier): string {
  if (!dossier.stap5) return ''

  const template = `Het object is kadastraal bekend als {{kadastrale_aanduiding}}, met een kadastraal oppervlak van {{kadastraal_oppervlak}}.

Eigendomssituatie: ${dossier.stap5.eigendomssituatie}

Erfpacht: ${dossier.stap5.erfpacht}

Zakelijke rechten: ${dossier.stap5.zakelijkeRechten}

Kwalitatieve verplichtingen: ${dossier.stap5.kwalitatieveVerplichtingen}

Bestemmingsplan: ${dossier.stap5.bestemmingsplan}`

  return replacePlaceholders(template, dossier)
}

export function generateOppervlakten(dossier: Dossier): string {
  const template = `Het object heeft de volgende oppervlakten:

- Gebruiksoppervlak (GBO): {{gbo}}
- Bruto vloeroppervlak (BVO): {{bvo}}
- Verhuurbaar vloeroppervlak (VVO): {{vvo}}
- Perceeloppervlak: {{perceeloppervlak}}

Het gebouw bestaat uit {{aantal_bouwlagen}} bouwlagen en dateert uit {{bouwjaar}}.`

  let result = replacePlaceholders(template, dossier)

  if (dossier.stap3?.aanbouwen) {
    result += `\n\nAanbouwen en bijgebouwen: ${dossier.stap3.aanbouwen}`
  }

  return result
}

export function generateTechnischeStaat(dossier: Dossier): string {
  if (!dossier.stap6) return ''

  let text = `De staat van onderhoud van het exterieur wordt gekwalificeerd als {{exterieur_staat}}. Het interieur verkeert in een {{interieur_staat}} staat van onderhoud.

Fundering: ${dossier.stap6.fundering}

Dakbedekking: ${dossier.stap6.dakbedekking}

Installaties: ${dossier.stap6.installaties}`

  if (dossier.stap6.achterstalligOnderhoud && dossier.stap6.achterstalligOnderhoudBeschrijving) {
    text += `\n\nAchterstallig onderhoud: ${dossier.stap6.achterstalligOnderhoudBeschrijving}`
  }

  text += `\n\nDe geschatte jaarlijkse onderhoudskosten bedragen ${formatBedrag(dossier.stap6.onderhoudskosten)}.`

  return replacePlaceholders(text, dossier)
}

export function generateHuurgegevens(dossier: Dossier): string {
  if (!dossier.stap4) return ''

  if (!dossier.stap4.verhuurd) {
    return 'Het object is momenteel niet verhuurd.'
  }

  let text = `Het object is verhuurd aan ${dossier.stap4.huurder}.`

  if (dossier.stap4.huurprijsPerJaar) {
    text += `\n\nDe huidige huurprijs bedraagt ${formatBedrag(dossier.stap4.huurprijsPerJaar)} per jaar.`
  }

  if (dossier.stap4.markthuurPerJaar) {
    text += ` De markthuur wordt geschat op ${formatBedrag(dossier.stap4.markthuurPerJaar)} per jaar.`
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

  if (dossier.stap4.leegstandsrisico) {
    text += `\n\nLeegstandsrisico: ${dossier.stap4.leegstandsrisico}`
  }

  return text
}

export function generateVergunningenEnMilieu(dossier: Dossier): string {
  if (!dossier.stap7) return ''

  let text = ''

  if (dossier.stap7.omgevingsvergunning) {
    text += `Omgevingsvergunning: Ja`
    if (dossier.stap7.omgevingsvergunningNummer) {
      text += ` (nummer: ${dossier.stap7.omgevingsvergunningNummer})`
    }
  } else {
    text += `Omgevingsvergunning: Nee`
  }

  text += `\n\nEnergielabel: {{energielabel}}`

  if (dossier.stap7.epcBengWaarde) {
    text += `\nEPC/BENG waarde: ${dossier.stap7.epcBengWaarde}`
  }

  text += `\n\nAsbest: ${dossier.stap7.asbest.charAt(0).toUpperCase() + dossier.stap7.asbest.slice(1)}`
  text += `\nBodemverontreiniging: ${dossier.stap7.bodemverontreiniging.charAt(0).toUpperCase() + dossier.stap7.bodemverontreiniging.slice(1)}`

  if (dossier.stap7.toelichting) {
    text += `\n\nToelichting: ${dossier.stap7.toelichting}`
  }

  return replacePlaceholders(text, dossier)
}

export function generateWaardering(dossier: Dossier, historischeRapporten?: HistorischRapport[]): string {
  if (!dossier.stap8) return ''

  let text = `Voor de waardering van dit object is de {{methode}} toegepast.

Op basis van de uitgevoerde analyse en de vergelijkingsobjecten, wordt de marktwaarde van het object bepaald op {{marktwaarde}} per waardepeildatum {{waardepeildatum}}.

De onderhandse verkoopwaarde bedraagt {{onderhandse_verkoopwaarde}}.`

  if (dossier.stap8.bar) {
    text += `\n\nHet bruto aanvangsrendement (BAR) bedraagt {{bar}}.`
  }

  if (dossier.stap8.nar) {
    text += `\nHet netto aanvangsrendement (NAR) bedraagt {{nar}}.`
  }

  if (dossier.stap8.kapitalisatiefactor) {
    text += `\nDe kapitalisatiefactor is ${dossier.stap8.kapitalisatiefactor}.`
  }

  return replacePlaceholders(text, dossier)
}

export function generateVergelijkingsobjecten(dossier: Dossier, historischeRapporten: HistorischRapport[]): string {
  if (!dossier.stap8 || dossier.stap8.vergelijkingsobjecten.length === 0) {
    return 'Voor deze taxatie zijn de volgende vergelijkingsobjecten geraadpleegd uit onze database.'
  }

  let text = 'Voor deze taxatie zijn de volgende vergelijkingsobjecten gebruikt:\n\n'

  dossier.stap8.vergelijkingsobjecten.forEach((obj, index) => {
    text += `Vergelijkingsobject ${index + 1}:\n`
    text += `- Adres: ${obj.adres}\n`
    text += `- Transactieprijs: ${formatBedrag(obj.prijs)}\n`
    text += `- Datum: ${formatDatum(obj.datum)}\n\n`
  })

  const selectedReferenties = historischeRapporten.filter(r => 
    dossier.geselecteerdeReferenties.includes(r.id)
  )

  if (selectedReferenties.length > 0) {
    text += '\nDaarnaast zijn de volgende historische taxaties uit onze kennisbank geraadpleegd:\n\n'
    
    selectedReferenties.forEach((rapport, index) => {
      text += `Referentie ${index + 1}:\n`
      text += `- Adres: ${rapport.adres.straat} ${rapport.adres.huisnummer}, ${rapport.adres.plaats}\n`
      text += `- Type: ${rapport.typeObject}\n`
      text += `- GBO: ${formatOppervlakte(rapport.gbo)}\n`
      text += `- Marktwaarde: ${formatBedrag(rapport.marktwaarde)}\n`
      text += `- Datum: ${formatDatum(rapport.waardepeildatum)}\n\n`
    })
  }

  return text
}

export function generateAannames(dossier: Dossier): string {
  if (!dossier.stap9) return ''

  let text = ''

  if (dossier.stap9.aannames) {
    text += `AANNAMES\n\n${dossier.stap9.aannames}`
  }

  if (dossier.stap9.voorbehouden) {
    text += `\n\nVOORBEHOUDEN\n\n${dossier.stap9.voorbehouden}`
  }

  if (dossier.stap9.bijzondereOmstandigheden) {
    text += `\n\nBIJZONDERE OMSTANDIGHEDEN\n\n${dossier.stap9.bijzondereOmstandigheden}`
  }

  return text
}

export function generateConclusie(dossier: Dossier): string {
  const template = `Op basis van de uitgevoerde inspectie, de geraadpleegde vergelijkingsobjecten en de toegepaste waarderingsmethode, concluderen wij dat de marktwaarde van het object gelegen aan {{adres}} te {{plaats}} per waardepeildatum {{waardepeildatum}} wordt vastgesteld op:

{{marktwaarde}}

Deze waardering is tot stand gekomen conform de Richtlijnen Vastgoedtaxaties (RVT) en is gebaseerd op de ten tijde van de inspectie aangetroffen situatie en de verstrekte informatie.`

  return replacePlaceholders(template, dossier)
}

export function generateVoorblad(dossier: Dossier): string {
  const template = `TAXATIERAPPORT

Dossiernummer: {{dossiernummer}}

{{objectnaam}}
{{adres}}
{{postcode}} {{plaats}}

Opdrachtgever: {{opdrachtgever_naam}}
{{opdrachtgever_bedrijf}}

Taxateur: {{taxateur}}

Waardepeildatum: {{waardepeildatum}}
Inspectiedatum: {{inspectiedatum}}`

  return replacePlaceholders(template, dossier)
}

export function generateMarktanalyse(dossier: Dossier): string {
  if (!dossier.stap2) return ''

  const template = `De vastgoedmarkt in {{plaats}} kenmerkt zich door een gevarieerd aanbod van {{type_object}}en. De ligging van het object in een {{ligging}} draagt bij aan de waardevorming.

Op basis van de beschikbare markten transactiegegevens en de huidige marktsituatie, is een analyse uitgevoerd van vergelijkbare objecten in de omgeving.`

  return replacePlaceholders(template, dossier)
}

export function generateGebruikteReferenties(dossier: Dossier, historischeRapporten: HistorischRapport[]): string {
  if (dossier.geselecteerdeReferenties.length === 0) {
    return 'Voor deze taxatie zijn geen referentierapporten uit de kennisbank gebruikt.'
  }

  let text = 'Voor deze taxatie zijn de volgende referentierapporten uit onze kennisbank geraadpleegd:\n\n'

  dossier.geselecteerdeReferenties.forEach((refId, index) => {
    const rapport = historischeRapporten.find(r => r.id === refId)
    if (!rapport) return

    const similarityResult = dossier.similarityResults.find(r => r.rapportId === refId)

    text += `Referentie ${index + 1}:\n`
    text += `- Adres: ${rapport.adres.straat} ${rapport.adres.huisnummer}, ${rapport.adres.plaats}\n`
    text += `- Type object: ${rapport.typeObject}\n`
    text += `- GBO: ${formatOppervlakte(rapport.gbo)}\n`
    text += `- Marktwaarde: ${formatBedrag(rapport.marktwaarde)}\n`
    text += `- Waardepeildatum: ${formatDatum(rapport.waardepeildatum)}\n`
    
    if (similarityResult) {
      text += `- Vergelijkbaarheidsscore: ${similarityResult.totaalScore}/100 (${similarityResult.classificatie})\n`
      text += `- Afstand tot object: ${similarityResult.afstandKm} km\n`
    }
    
    text += '\n'
  })

  return text
}

export function generateOndertekening(dossier: Dossier): string {
  const template = `Dit rapport is opgesteld conform de Richtlijnen Vastgoedtaxaties (RVT) en de toepasselijke wet- en regelgeving.

De taxatie is uitgevoerd door een gecertificeerd taxateur en gebaseerd op de ten tijde van de inspectie aangetroffen situatie en de verstrekte informatie.


{{plaats}}, {{inspectiedatum}}


{{taxateur}}
Gecertificeerd Taxateur`

  return replacePlaceholders(template, dossier)
}

export function generateAlleSecties(dossier: Dossier, historischeRapporten: HistorischRapport[]): Record<string, string> {
  return {
    '01-voorblad': generateVoorblad(dossier),
    '02-opdracht': generateOpdracht(dossier),
    '03-objectomschrijving': generateObjectomschrijving(dossier),
    '04-ligging': generateLiggingEnBereikbaarheid(dossier),
    '05-kadaster': generateKadasterEnEigendom(dossier),
    '06-oppervlakten': generateOppervlakten(dossier),
    '07-technisch': generateTechnischeStaat(dossier),
    '08-huur': generateHuurgegevens(dossier),
    '09-vergunningen': generateVergunningenEnMilieu(dossier),
    '10-marktanalyse': generateMarktanalyse(dossier),
    '11-vergelijkingen': generateVergelijkingsobjecten(dossier, historischeRapporten),
    '12-waardering': generateWaardering(dossier, historischeRapporten),
    '13-aannames': generateAannames(dossier),
    '14-conclusie': generateConclusie(dossier),
    '15-referenties': generateGebruikteReferenties(dossier, historischeRapporten),
    '16-ondertekening': generateOndertekening(dossier),
  }
}
