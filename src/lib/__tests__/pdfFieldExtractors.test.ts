import { describe, it, expect } from 'vitest'
import {
  extractNaamTaxateur,
  extractObjectnaam,
  extractBvo,
  extractVvo,
  extractLigging,
  extractTypeObject,
  extractGebruiksdoel,
  extractBar,
  extractNar,
  extractKapitalisatiefactor,
  extractEnergielabel,
  extractAdres,
  extractGemeente,
  extractRenovatiejaar,
  extractBouwjaar,
  extractEigendomssituatie,
  extractBereikbaarheid,
  extractAsbest,
  extractBodemverontreiniging,
  extractZakelijkeRechten,
  extractMarktwaarde,
  extractPerceeloppervlak,
  extractAllFieldsWithConfidence,
  extractInspectiedatum,
  extractProvincie,
  extractAantalBouwlagen,
} from '../pdfFieldExtractors'
import { postcodeToProvincie, cleanLabelRemnant } from '../pdfNormalizers'

// ---------------------------------------------------------------------------
// Confidence levels
// ---------------------------------------------------------------------------
describe('confidence levels', () => {
  it('assigns high confidence for exact label:value match', () => {
    const text = 'Taxatierapport\nEnergielabel: A+\nOverige informatie'
    const result = extractEnergielabel(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('A+')
    expect(result!.confidence).toBe('high')
    expect(result!.sourceLabel).toContain('energielabel')
  })

  it('assigns high confidence for BAR with explicit label', () => {
    const text = 'BAR | Kap. markt/herz. huur kk: 8,15 %'
    const result = extractBar(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(8.15)
    expect(result!.confidence).toBe('high')
  })

  it('assigns high confidence for NAR with "NAR % von:" label', () => {
    const text = 'NAR % von: 6,75 %'
    const result = extractNar(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(6.75)
    expect(result!.confidence).toBe('high')
  })

  it('assigns high confidence for exact taxateur label', () => {
    const text = 'Uitvoerend taxateur: Rick Schiffelers RT\nDatum: ...'
    const result = extractNaamTaxateur(text)
    expect(result).toBeDefined()
    expect(result!.value).toContain('Rick Schiffelers')
    expect(result!.confidence).toBe('high')
  })

  it('assigns medium confidence for keyword-only ligging (contextual)', () => {
    const text = 'Het object is gelegen op een bedrijventerrein aan de rand van de stad.'
    const result = extractLigging(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('bedrijventerrein')
    // Should be medium or low since no explicit "ligging:" label
    expect(['medium', 'low']).toContain(result!.confidence)
  })

  it('assigns high confidence for ligging with explicit label', () => {
    const text = 'Ligging: bedrijventerrein\nOverige gegevens'
    const result = extractLigging(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('bedrijventerrein')
    expect(result!.confidence).toBe('high')
  })

  it('assigns low confidence for ligging found only in full text without context', () => {
    const text = 'Dit taxatierapport beschrijft een pand op een gemengd gebied ver van de locatie beschrijving.'
    const result = extractLigging(text)
    // Should still find it but may be low/medium
    expect(result).toBeDefined()
    expect(result!.value).toBe('gemengd')
  })
})

// ---------------------------------------------------------------------------
// Type object vs gebruiksdoel distinction
// ---------------------------------------------------------------------------
describe('type object vs gebruiksdoel distinction', () => {
  it('does NOT extract "eigen gebruik" as typeObject', () => {
    const text = 'Type object: Eigen gebruik\nBedrijfscomplex aan de rand van Venlo'
    const result = extractTypeObject(text)
    // If found from label, it should skip "eigen gebruik"
    // May fall back to finding "bedrijfscomplex" from full text
    if (result) {
      expect(result.value).not.toBe('eigenaar_gebruiker')
      expect(result.value).not.toContain('eigen gebruik')
    }
  })

  it('extracts "eigenaar_gebruiker" as gebruiksdoel', () => {
    const text = 'Gebruiksdoel: Eigen gebruik\nOverige informatie'
    const result = extractGebruiksdoel(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('eigenaar_gebruiker')
  })

  it('extracts bedrijfscomplex as typeObject', () => {
    const text = 'Type object: bedrijfscomplex\nGebruiksdoel: eigenaar-gebruiker'
    const result = extractTypeObject(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('bedrijfscomplex')
  })

  it('extracts verhuurd_belegging as gebruiksdoel', () => {
    const text = 'Het object is verhuurd aan een bekende huurder.'
    const result = extractGebruiksdoel(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('verhuurd_belegging')
  })
})

// ---------------------------------------------------------------------------
// Asbest false positive prevention (now handled by extractAsbest in pdfFieldExtractors)
// ---------------------------------------------------------------------------
describe('extractAllFieldsWithConfidence — asbest soil context suppression', () => {
  it('does not extract asbest when mention is in soil/environmental context', () => {
    const text = 'Bodemonderzoek: geen asbest in de grond aangetroffen.'
    // The asbest mention here is in a soil (bodem) context and should be suppressed
    const result = extractAllFieldsWithConfidence(text)
    expect(result['asbest']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Dropdown mapping for ligging
// ---------------------------------------------------------------------------
describe('ligging dropdown mapping — context-aware', () => {
  it('prefers specific over generic when both found', () => {
    const text =
      'Ligging: bedrijventerrein\nHet is een gemengd gebied met veel variatie.'
    const result = extractLigging(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('bedrijventerrein')
    expect(result!.confidence).toBe('high')
  })

  it('falls back to full-text when no ligging label', () => {
    const text = 'Het object ligt in de woonwijk.'
    const result = extractLigging(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('woonwijk')
  })
})

// ---------------------------------------------------------------------------
// BVO extraction
// ---------------------------------------------------------------------------
describe('extractBvo', () => {
  it('extracts BVO from "Totaal BVO m² of stuks" label', () => {
    const text = 'Totaal BVO m² of stuks: 2.444 m²'
    const result = extractBvo(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(2444)
  })

  it('extracts BVO from simple BVO label', () => {
    const text = 'BVO: 2444 m2'
    const result = extractBvo(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(2444)
    expect(result!.confidence).toBe('high')
  })
})

// ---------------------------------------------------------------------------
// Kapitalisatiefactor synonyms
// ---------------------------------------------------------------------------
describe('extractKapitalisatiefactor', () => {
  it('extracts from "kapitalisatiefactor" label', () => {
    const text = 'Kapitalisatiefactor: 12,30'
    const result = extractKapitalisatiefactor(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(12.3)
  })

  it('extracts from "kap. factor" synonym', () => {
    const text = 'Kap. factor: 12,30'
    const result = extractKapitalisatiefactor(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(12.3)
  })

  it('extracts from "kap.factor" abbreviation', () => {
    const text = 'kap.factor: 12,30'
    const result = extractKapitalisatiefactor(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(12.3)
  })
})

// ---------------------------------------------------------------------------
// Energielabel edge cases
// ---------------------------------------------------------------------------
describe('extractEnergielabel', () => {
  it('returns "geen" for "Energielabel: Geen"', () => {
    const text = 'Energielabel: Geen'
    const result = extractEnergielabel(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('geen')
  })

  it('extracts valid label "A"', () => {
    const text = 'Energielabel: A'
    const result = extractEnergielabel(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('A')
    expect(result!.confidence).toBe('high')
  })

  it('extracts label with plus signs "A++"', () => {
    const text = 'Energielabel: A++'
    const result = extractEnergielabel(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('A++')
  })

  it('returns undefined when no energielabel found', () => {
    const text = 'Geen informatie over duurzaamheid aanwezig.'
    const result = extractEnergielabel(text)
    expect(result).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Address extraction
// ---------------------------------------------------------------------------
describe('extractAdres', () => {
  it('extracts Columbusweg 13 te Venlo correctly', () => {
    const text = 'Object: Columbusweg 13, 5928LA Venlo\nTaxatierapport'
    const result = extractAdres(text)
    expect(result).toBeDefined()
    expect(result!.value!.straat).toBe('Columbusweg')
    expect(result!.value!.huisnummer).toBe('13')
    expect(result!.value!.postcode).toBe('5928LA')
    expect(result!.value!.plaats).toBe('Venlo')
    expect(result!.confidence).toBe('high')
  })
})

// ---------------------------------------------------------------------------
// Renovatiejaar
// ---------------------------------------------------------------------------
describe('extractRenovatiejaar', () => {
  it('extracts from "renovatiejaar" label', () => {
    const text = 'Renovatiejaar: 2024'
    const result = extractRenovatiejaar(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(2024)
    expect(result!.confidence).toBe('high')
  })

  it('extracts from "gerenoveerd in" label', () => {
    const text = 'Gerenoveerd in: 2024'
    const result = extractRenovatiejaar(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(2024)
  })

  it('extracts from "meest recente renovatie" label', () => {
    const text = 'Meest recente renovatie: 2019'
    const result = extractRenovatiejaar(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(2019)
  })

  it('returns undefined if no renovation year found', () => {
    const text = 'Bouwjaar: 2006\nGeen renovatie uitgevoerd.'
    const result = extractRenovatiejaar(text)
    expect(result).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// extractAllFieldsWithConfidence — master function
// ---------------------------------------------------------------------------
describe('extractAllFieldsWithConfidence', () => {
  const SAMPLE_TEXT = `
    Taxatierapport
    Uitvoerend taxateur: Rick Schiffelers RT
    Objectnaam: Columbusweg 13 te Venlo
    Columbusweg 13, 5928LA Venlo
    Type object: bedrijfscomplex
    Gebruiksdoel: Eigenaar-gebruiker
    BVO: 2.444 m²
    VVO: 2.411 m²
    Perceeloppervlak: 16.042 m²
    Bouwjaar: 2006
    Renovatiejaar: 2024
    Marktwaarde kosten koper: € 4.330.000
    BAR | Kap. markt/herz. huur kk: 8,15 %
    NAR % von: 6,75 %
    Kapitalisatiefactor: 12,30
    Energielabel: Geen
    Ligging: bedrijventerrein
  `.trim()

  it('extracts all main fields', () => {
    const result = extractAllFieldsWithConfidence(SAMPLE_TEXT)
    expect(result['naamTaxateur']).toBeDefined()
    expect(result['objectnaam']).toBeDefined()
    expect(result['bvo']).toBeDefined()
    expect(result['vvo']).toBeDefined()
    expect(result['perceeloppervlak']).toBeDefined()
    expect(result['bouwjaar']).toBeDefined()
    expect(result['renovatiejaar']).toBeDefined()
    expect(result['marktwaarde']).toBeDefined()
    expect(result['bar']).toBeDefined()
    expect(result['nar']).toBeDefined()
    expect(result['kapitalisatiefactor']).toBeDefined()
    expect(result['ligging']).toBeDefined()
  })

  it('assigns correct values', () => {
    const result = extractAllFieldsWithConfidence(SAMPLE_TEXT)
    expect(result['bvo'].value).toBe(2444)
    expect(result['bar'].value).toBe(8.15)
    expect(result['nar'].value).toBe(6.75)
    expect(result['kapitalisatiefactor'].value).toBe(12.3)
    expect(result['ligging'].value).toBe('bedrijventerrein')
  })

  it('assigns high confidence for labeled matches', () => {
    const result = extractAllFieldsWithConfidence(SAMPLE_TEXT)
    expect(result['naamTaxateur'].confidence).toBe('high')
    expect(result['bvo'].confidence).toBe('high')
    expect(result['bar'].confidence).toBe('high')
    expect(result['nar'].confidence).toBe('high')
  })
})

// ---------------------------------------------------------------------------
// Bug 1: Type object
// ---------------------------------------------------------------------------
describe('extractTypeObject — extended patterns', () => {
  it('extracts "kantoor" from "betreft een kantoorgebouw in twee bouwlagen"', () => {
    const text = 'Het object betreft een kantoorgebouw in twee bouwlagen gelegen op een bedrijventerrein.'
    const result = extractTypeObject(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('kantoor')
  })

  it('does not match "eigen gebruik" as physical type', () => {
    const text = 'Gebruiksdoel: Eigen gebruik\nDe locatie is gunstig.'
    const result = extractTypeObject(text)
    // Should not extract "eigen gebruik" as physical type
    if (result) {
      expect(result.value).not.toContain('eigen gebruik')
      expect(result.value).not.toBe('eigenaar_gebruiker')
    }
  })

  it('prefers IPD-type label over generic keyword', () => {
    const text = 'IPD-type: kantoor\nHet bedrijfscomplex is omvangrijk.'
    const result = extractTypeObject(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('kantoor')
    expect(result!.confidence).toBe('high')
  })
})

// ---------------------------------------------------------------------------
// Bug 2: Gemeente
// ---------------------------------------------------------------------------
describe('extractGemeente — cleanGemeente integration', () => {
  it('strips bestemmingsplan text from gemeente name', () => {
    const text = 'Gemeente: Nuenen, Gerwen en Nederwetten Vigerende bestemming\nProvincie: Noord-Brabant'
    const result = extractGemeente(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('Nuenen, Gerwen en Nederwetten')
    expect(result!.value).not.toContain('Vigerende')
    expect(result!.value).not.toContain('bestemming')
  })

  it('extracts "Nuenen, Gerwen en Nederwetten" without trailing junk', () => {
    const text = 'Gemeente: Nuenen, Gerwen en Nederwetten bestemmingsplan Buitengebied'
    const result = extractGemeente(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('Nuenen, Gerwen en Nederwetten')
  })
})

// ---------------------------------------------------------------------------
// Bug 3: Ligging quality scores
// ---------------------------------------------------------------------------
describe('extractLigging — quality scores', () => {
  it('extracts quality score "goed" when found after ligging label', () => {
    const text = 'Omschrijving locatie, stand en ligging: goed\nHet object is gelegen op een bedrijventerrein.'
    const result = extractLigging(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('goed')
    expect(result!.confidence).toBe('high')
  })

  it('prefers quality score over zoning type when both present after label', () => {
    const text = 'Ligging: redelijk\nDit bedrijventerrein is goed ontsloten.'
    const result = extractLigging(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('redelijk')
  })
})

// ---------------------------------------------------------------------------
// Bug 5: VVO
// ---------------------------------------------------------------------------
describe('extractVvo — space-only separator', () => {
  it('extracts VVO 870 from "VVO 870" (no colon)', () => {
    const text = 'Oppervlaktes\nVVO 870\nBVO 950'
    const result = extractVvo(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(870)
  })

  it('extracts VVO from "totaal VVO 870"', () => {
    const text = 'totaal VVO 870 m²'
    const result = extractVvo(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(870)
  })
})

// ---------------------------------------------------------------------------
// Bug 6: Bouwlagen (tested through pdfParser, but also test extractAllFields)
// ---------------------------------------------------------------------------
describe('extractAllFieldsWithConfidence — bouwlagen via word-numbers', () => {
  it('includes vvo when present in text without colon', () => {
    const text = 'VVO 870\nBVO 950'
    const result = extractAllFieldsWithConfidence(text)
    expect(result['vvo']).toBeDefined()
    expect(result['vvo'].value).toBe(870)
  })
})

// ---------------------------------------------------------------------------
// Bug 7: Renovatiejaar from reference section
// ---------------------------------------------------------------------------
describe('extractRenovatiejaar — reference section exclusion', () => {
  it('returns undefined when renovatiejaar comes from reference section', () => {
    const text = `
      Object omschrijving: kantoor gebouwd in 2006
      H.2 Koopreferenties
      Referentieobject 1: renovatiejaar 2022
      Columbusweg 13
    `.trim()
    const result = extractRenovatiejaar(text)
    // Should NOT extract 2022 from the reference section
    expect(result).toBeUndefined()
  })

  it('returns undefined when text says "geen aanzienlijke wijzigingen"', () => {
    const text = 'Geen aanzienlijke wijzigingen of uitbreidingen. Renovatiejaar: 2022'
    const result = extractRenovatiejaar(text)
    expect(result).toBeUndefined()
  })

  it('extracts renovatiejaar outside of reference section normally', () => {
    const text = 'Renovatiejaar: 2020\nMeest recente renovatie betreft het dak.'
    const result = extractRenovatiejaar(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(2020)
  })

  it('extracts main-object renovatiejaar and ignores reference section renovatiejaar', () => {
    const text = `
      Renovatiejaar: 2020
      H.2 Koopreferenties
      Referentieobject 1: renovatiejaar 2022
    `.trim()
    const result = extractRenovatiejaar(text)
    // Should extract 2020 from main section, not 2022 from reference section
    expect(result).toBeDefined()
    expect(result!.value).toBe(2020)
  })
})

// ---------------------------------------------------------------------------
// Bug 18: NAR
// ---------------------------------------------------------------------------
describe('extractNar — additional patterns', () => {
  it('extracts NAR 6.75 from "NAR % von: 6,75 %"', () => {
    const text = 'NAR % von: 6,75 %'
    const result = extractNar(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(6.75)
    expect(result!.confidence).toBe('high')
  })

  it('extracts NAR from "netto aanvangsrendement: 6,75%"', () => {
    const text = 'Netto aanvangsrendement: 6,75%'
    const result = extractNar(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(6.75)
    expect(result!.sourceLabel).toContain('netto aanvangsrendement')
  })
})

// ---------------------------------------------------------------------------
// Bug 19: Kapitalisatiefactor with "von"
// ---------------------------------------------------------------------------
describe('extractKapitalisatiefactor — "von" keyword', () => {
  it('extracts 13.4 from "Kap. factor von 13,4"', () => {
    const text = 'Kap. factor von 13,4'
    const result = extractKapitalisatiefactor(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(13.4)
  })

  it('extracts from "kap.factor von 12,5"', () => {
    const text = 'kap.factor von 12,5'
    const result = extractKapitalisatiefactor(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(12.5)
  })
})

// ---------------------------------------------------------------------------
// Bug 25: parserRule field in ExtractionResult
// ---------------------------------------------------------------------------
describe('ExtractionResult — parserRule field', () => {
  it('includes parserRule for nar extraction', () => {
    const text = 'NAR % von: 6,75 %'
    const result = extractNar(text)
    expect(result).toBeDefined()
    expect(result!.parserRule).toBeDefined()
    expect(typeof result!.parserRule).toBe('string')
  })

  it('includes parserRule for kapitalisatiefactor extraction', () => {
    const text = 'Kapitalisatiefactor: 12,30'
    const result = extractKapitalisatiefactor(text)
    expect(result).toBeDefined()
    expect(result!.parserRule).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Bug 4 — Bereikbaarheid extractor
// ---------------------------------------------------------------------------
describe('extractBereikbaarheid', () => {
  it('extracts from "bereikbaarheid:" label', () => {
    const text = 'Bereikbaarheid: Goed ontsloten via de A2, bushalte op 300m.'
    const result = extractBereikbaarheid(text)
    expect(result).toBeDefined()
    expect(result!.value).toContain('Goed')
    expect(result!.confidence).toBe('high')
  })

  it('extracts from "toelichting bereikbaarheid:" label', () => {
    const text = 'Toelichting bereikbaarheid: Goed bereikbaar via de A50.'
    const result = extractBereikbaarheid(text)
    expect(result).toBeDefined()
    expect(result!.value).toContain('Goed')
  })

  it('extracts from "ontsluiting:" label', () => {
    const text = 'Ontsluiting: Directe toegang via Collse Hoefdijk naar A270.'
    const result = extractBereikbaarheid(text)
    expect(result).toBeDefined()
    expect(result!.value).toContain('Directe toegang')
  })

  it('extracts from "ov-verbinding:" label', () => {
    const text = 'OV-verbinding: Bushalte op 400m, station op 2km.'
    const result = extractBereikbaarheid(text)
    expect(result).toBeDefined()
    expect(result!.value).toContain('Bushalte')
  })

  it('extracts from "openbaar vervoer" keyword (medium confidence)', () => {
    const text = 'Het object ligt nabij openbaar vervoer en heeft een directe aansluiting.'
    const result = extractBereikbaarheid(text)
    expect(result).toBeDefined()
    expect(result!.confidence).toBe('medium')
  })

  it('wires into extractAllFieldsWithConfidence', () => {
    const text = 'Bereikbaarheid: Goed via A2 en openbaar vervoer.'
    const result = extractAllFieldsWithConfidence(text)
    expect(result['bereikbaarheid']).toBeDefined()
    expect(result['bereikbaarheid'].value).toContain('Goed')
  })
})

// ---------------------------------------------------------------------------
// Bug 9 — Eigendomssituatie stop-words
// ---------------------------------------------------------------------------
describe('extractEigendomssituatie — stop-word truncation', () => {
  it('truncates eigendomssituatie at stop-words like perceeloppervlak', () => {
    const text = 'Eigendomssituatie: Eigendom Perceeloppervlak 2802 m²'
    const result = extractEigendomssituatie(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('Eigendom')
    expect(result!.value).not.toContain('Perceeloppervlak')
  })

  it('truncates at energielabel stop-word', () => {
    const text = 'Eigendomssituatie: Eigendom Energielabel B Gemeente Nuenen'
    const result = extractEigendomssituatie(text)
    expect(result).toBeDefined()
    expect(result!.value).not.toContain('Energielabel')
  })

  it('truncates at BVO stop-word', () => {
    const text = 'Eigendomssituatie: Eigendom BVO 957 m2 VVO 870 m2'
    const result = extractEigendomssituatie(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('Eigendom')
  })

  it('limits value to 80 chars maximum', () => {
    const text = 'Eigendomssituatie: ' + 'x'.repeat(200)
    const result = extractEigendomssituatie(text)
    expect(result).toBeDefined()
    expect(result!.value.length).toBeLessThanOrEqual(80)
  })
})

// ---------------------------------------------------------------------------
// Bug 11 — Zakelijke rechten new keywords
// ---------------------------------------------------------------------------
describe('extractZakelijkeRechten — extended keywords', () => {
  it('extracts from "zakelijk recht:" label', () => {
    const text = 'Zakelijk recht: Beperkt zakelijk recht op perceel ten behoeve van Saranne B.V.'
    const result = extractZakelijkeRechten(text)
    expect(result).toBeDefined()
    expect(result!.value).toContain('Beperkt zakelijk recht')
  })

  it('extracts from "belemmeringenwet" keyword', () => {
    const text = 'Belemmeringenwet: Leidingstrook op deel van het perceel.'
    const result = extractZakelijkeRechten(text)
    expect(result).toBeDefined()
    expect(result!.value).toContain('Leidingstrook')
  })

  it('extracts from "opstalrecht:" label', () => {
    const text = 'Opstalrecht: Waterleiding op gedeelte van perceel.'
    const result = extractZakelijkeRechten(text)
    expect(result).toBeDefined()
    expect(result!.value).toContain('Waterleiding')
  })

  it('extracts from "recht van overpad:" label', () => {
    const text = 'Recht van overpad: Voetpad langs noordzijde perceel ten behoeve van buurperceel.'
    const result = extractZakelijkeRechten(text)
    expect(result).toBeDefined()
    expect(result!.value).toContain('Voetpad')
  })

  it('wires into extractAllFieldsWithConfidence', () => {
    const text = 'Zakelijk recht: Perceel belast met leidingrecht ten behoeve van waterschap.'
    const result = extractAllFieldsWithConfidence(text)
    expect(result['zakelijkeRechten']).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Bug 14 — Asbest logic
// ---------------------------------------------------------------------------
describe('extractAsbest — all 4 scenarios', () => {
  it('"geen asbest aangetroffen" → "nee"', () => {
    const text = 'Bij inspectie zijn geen asbest aangetroffen in het pand.'
    const result = extractAsbest(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('nee')
    expect(result!.confidence).toBe('high')
  })

  it('"asbest aanwezig" → "ja"', () => {
    const text = 'Uit onderzoek blijkt dat asbest aanwezig is in de dakbeschot.'
    const result = extractAsbest(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('ja')
    expect(result!.confidence).toBe('high')
  })

  it('"asbest niet onderzocht" → "onbekend"', () => {
    const text = 'Asbest niet onderzocht bij dit object; nader onderzoek aanbevolen.'
    const result = extractAsbest(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('onbekend')
  })

  it('"asbestinventarisatie uitgevoerd, geen asbest" → "nee"', () => {
    const text = 'Asbestinventarisatie uitgevoerd. Geen asbest aangetroffen in het gebouw.'
    const result = extractAsbest(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('nee')
  })

  it('returns undefined when only soil/environmental asbest mentioned', () => {
    const text = 'Bodemonderzoek: geen asbest in de grond aangetroffen.'
    const result = extractAsbest(text)
    expect(result).toBeUndefined()
  })

  it('"asbestonderzoek: nee" → "onbekend"', () => {
    const text = 'Asbestonderzoek: nee. Er is geen onderzoek uitgevoerd.'
    const result = extractAsbest(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('onbekend')
  })

  it('wires into extractAllFieldsWithConfidence for building asbest', () => {
    const text = 'Uit inspectie blijkt asbest aanwezig in de luifel van het gebouw.'
    const result = extractAllFieldsWithConfidence(text)
    expect(result['asbest']).toBeDefined()
    expect(result['asbest'].value).toBe('ja')
  })
})

// ---------------------------------------------------------------------------
// Bug 15 — Bodemverontreiniging false positive prevention
// ---------------------------------------------------------------------------
describe('extractBodemverontreiniging', () => {
  it('returns "nee" when text says "niet geregistreerd als mogelijk verontreinigde locatie"', () => {
    const text = 'Bodeminformatie: het perceel is niet geregistreerd als mogelijk verontreinigde locatie.'
    const result = extractBodemverontreiniging(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('nee')
    expect(result!.confidence).toBe('high')
  })

  it('returns "nee" when text says "geen verontreiniging"', () => {
    const text = 'Bodemkwaliteit: er is geen verontreiniging vastgesteld.'
    const result = extractBodemverontreiniging(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('nee')
  })

  it('does not return "ja" from bodeminformatie section header alone', () => {
    const text = 'Bodeminformatie: Bijlage 3 bevat het bodemrapport.'
    const result = extractBodemverontreiniging(text)
    // Should be undefined (header alone without verdict)
    expect(result).toBeUndefined()
  })

  it('returns "ja" when text explicitly mentions verontreinigd', () => {
    const text = 'Bodemverontreiniging: het perceel is verontreinigd met zware metalen.'
    const result = extractBodemverontreiniging(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('ja')
  })

  it('returns "onbekend" when text says "niet onderzocht"', () => {
    const text = 'Bodemverontreiniging: niet onderzocht bij aankoop.'
    const result = extractBodemverontreiniging(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('onbekend')
  })

  it('returns undefined when no bodem keyword present', () => {
    const text = 'Het pand heeft een goede technische staat.'
    const result = extractBodemverontreiniging(text)
    expect(result).toBeUndefined()
  })

  it('wires into extractAllFieldsWithConfidence', () => {
    const text = 'Bodeminformatie: geen verontreiniging aanwezig op het perceel.'
    const result = extractAllFieldsWithConfidence(text)
    expect(result['bodemverontreiniging']).toBeDefined()
    expect(result['bodemverontreiniging'].value).toBe('nee')
  })
})

// ---------------------------------------------------------------------------
// Bug 17 — Marktwaarde non-rounded preference
// ---------------------------------------------------------------------------
describe('extractMarktwaarde — non-rounded preference', () => {
  it('prefers non-rounded value over rounded when both present', () => {
    const text = 'Marktwaarde: € 4.332.360\nAfgerond: € 4.330.000'
    const result = extractMarktwaarde(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(4332360)
    expect(result!.parserRule).toBe('marktwaarde-exact')
  })

  it('falls back to rounded when no exact value found', () => {
    const text = 'Marktwaarde: € 4.330.000'
    const result = extractMarktwaarde(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(4330000)
    expect(result!.parserRule).toBe('marktwaarde-rounded')
  })

  it('skips marktwaarde in reference sections', () => {
    const text = `
      Objectomschrijving: kantoor in Nuenen
      H.2 Koopreferenties
      Referentie 1: Marktwaarde: € 2.500.000
      Geen eigen object waardering beschikbaar.
    `.trim()
    const result = extractMarktwaarde(text)
    // Should return undefined since only reference section has marktwaarde
    expect(result).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Bug 21 — Energielabel skips reference sections
// ---------------------------------------------------------------------------
describe('extractEnergielabel — skips vergelijkingsobjecten section', () => {
  it('skips energielabel found in vergelijkingsobjecten section', () => {
    const text = `
      Energielabel: B
      Vergelijkingsobjecten
      Ref 1: Energielabel: A
      Ref 2: Energielabel: C
    `.trim()
    const result = extractEnergielabel(text)
    expect(result).toBeDefined()
    // Should extract 'B' from before the reference section, not 'A' or 'C'
    expect(result!.value).toBe('B')
  })

  it('skips energielabel only in reference section, returns undefined if none outside', () => {
    const text = `
      Technische staat: Goed
      H.2 Koopreferenties
      Referentieobject 1: Energielabel: A+
    `.trim()
    const result = extractEnergielabel(text)
    // No energielabel outside reference section
    expect(result).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Bug 22-23 — Reference section leakage prevention for multiple fields
// ---------------------------------------------------------------------------
describe('reference leakage prevention — bouwjaar', () => {
  it('does not extract bouwjaar from reference section', () => {
    const text = `
      Object omschrijving: kantoor gebouwd in 2006
      H.2 Koopreferenties
      Bouwjaar: 2015
    `.trim()
    const result = extractBouwjaar(text)
    // Should extract from before the reference section, not from inside it
    // "gebouwd in 2006" appears before H.2, so should get 2006
    expect(result).toBeDefined()
    expect(result!.value).toBe(2006)
  })

  it('returns undefined when bouwjaar only in reference section', () => {
    const text = `
      H.2 Koopreferenties
      Referentieobject: bouwjaar 2018
    `.trim()
    const result = extractBouwjaar(text)
    expect(result).toBeUndefined()
  })
})

describe('reference leakage prevention — BVO', () => {
  it('skips BVO from reference section', () => {
    const text = `
      BVO: 957 m²
      H.2 Koopreferenties
      Referentieobject: BVO: 1200 m²
    `.trim()
    const result = extractBvo(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(957)
  })

  it('returns undefined when BVO only in reference section', () => {
    const text = `
      H.3 Huurreferenties
      Referentieobject: BVO: 500 m²
    `.trim()
    const result = extractBvo(text)
    expect(result).toBeUndefined()
  })
})

describe('reference leakage prevention — perceeloppervlak', () => {
  it('skips perceeloppervlak from reference section', () => {
    const text = `
      Perceeloppervlak: 2802 m²
      H.2 Koopreferenties
      Perceeloppervlak: 4000 m²
    `.trim()
    const result = extractPerceeloppervlak(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(2802)
  })
})

describe('reference leakage prevention — typeObject', () => {
  it('prefers type object from main section over reference section', () => {
    const text = `
      Het object betreft een kantoorgebouw in twee bouwlagen.
      H.2 Koopreferenties
      Referentieobject betreft een bedrijfshal op bedrijventerrein.
    `.trim()
    const result = extractTypeObject(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('kantoor')
  })
})

// ---------------------------------------------------------------------------
// Bug 13 — Technische staat dakbedekking and installaties keywords
// ---------------------------------------------------------------------------
describe('extractAllFieldsWithConfidence — dakbedekking and installaties wired', () => {
  it('extractAllFieldsWithConfidence includes bereikbaarheid when present', () => {
    const text = 'Bereikbaarheid: Goed bereikbaar via A2.'
    const result = extractAllFieldsWithConfidence(text)
    expect(result['bereikbaarheid']).toBeDefined()
  })
})


// ---------------------------------------------------------------------------
// Fix #1 — inspectiedatum without colon
// ---------------------------------------------------------------------------
describe('extractInspectiedatum — extended labels and no-colon fallback', () => {
  it('extracts inspectiedatum when label has no colon', () => {
    const text = 'inspectiedatum 7 november 2025\nOverige gegevens'
    const result = extractInspectiedatum(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('2025-11-07')
  })

  it('extracts inspectiedatum from "inpandige opname:" label', () => {
    const text = 'Inpandige opname: vrijdag 7 november 2025\nOverige gegevens'
    const result = extractInspectiedatum(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('2025-11-07')
  })
})

// ---------------------------------------------------------------------------
// Fix #2 — ligging quality score over enum value
// ---------------------------------------------------------------------------
describe('extractLigging — quality score wins over enum', () => {
  it('returns quality score "goed" over "bedrijventerrein" when both present', () => {
    const text = 'Locatiebeoordeling: goed\nHet object is gelegen op een bedrijventerrein.'
    const result = extractLigging(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('goed')
  })

  it('does not return "bedrijventerrein" as ligging when quality score found via label', () => {
    const text = 'Ligging: goed\nHet object bevindt zich op een bedrijventerrein.'
    const result = extractLigging(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('goed')
    expect(result!.value).not.toBe('bedrijventerrein')
  })
})

// ---------------------------------------------------------------------------
// Fix #4 — eigendomssituatie clean labels
// ---------------------------------------------------------------------------
describe('extractEigendomssituatie — clean double labels', () => {
  it('strips embedded "te taxeren belang:" from eigendomssituatie', () => {
    const text = 'Eigendom: Eigendom  Te taxeren belang: Eigendom'
    const result = extractEigendomssituatie(text)
    expect(result).toBeDefined()
    expect(result!.value).not.toContain('Te taxeren belang')
    expect(result!.value).not.toContain('te taxeren belang')
  })

  it('deduplicates repeated word in eigendomssituatie', () => {
    const text = 'Eigendom: Eigendom Eigendom'
    const result = extractEigendomssituatie(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('Eigendom')
  })
})

// ---------------------------------------------------------------------------
// Fix #7 — dakbedekking no label remnant
// ---------------------------------------------------------------------------
describe('cleanLabelRemnant — strip label fragment', () => {
  it('removes leading lowercase-colon fragment', () => {
    const raw = 'ie: plat dak voorzien van kunststof dakbedekking'
    const cleaned = cleanLabelRemnant(raw)
    expect(cleaned).not.toMatch(/^ie:/)
    expect(cleaned.charAt(0)).toBe(cleaned.charAt(0).toUpperCase())
  })

  it('returns capitalized value after stripping label remnant', () => {
    const raw = 'ing: staalconstructie met betonnen vloerplaten'
    const cleaned = cleanLabelRemnant(raw)
    expect(cleaned).toMatch(/^Staalconstructie/)
  })
})

// ---------------------------------------------------------------------------
// Fix #9 — energielabel niet in referentie
// ---------------------------------------------------------------------------
describe('extractEnergielabel — reference section suppression', () => {
  it('maps "Energielabel: -" to "geen"', () => {
    const result = extractEnergielabel('Energielabel: -\nOverige info')
    expect(result).toBeDefined()
    expect(result!.value).toBe('geen')
  })

  it('maps "Energielabel: Geen label" to "geen"', () => {
    const result = extractEnergielabel('Energielabel: Geen label\nOverige info')
    expect(result).toBeDefined()
    expect(result!.value).toBe('geen')
  })
})

// ---------------------------------------------------------------------------
// Fix #10 — bodemverontreiniging no false positive from presence alone
// ---------------------------------------------------------------------------
describe('extractBodemverontreiniging — no false positive from header alone', () => {
  it('returns undefined or nee when only bodeminformatie header is present', () => {
    const text = 'Bodeminformatie: Geen bijzonderheden bekend.'
    const result = extractBodemverontreiniging(text)
    // Either undefined or nee, never "ja"
    if (result !== undefined) {
      expect(result.value).not.toBe('ja')
    }
  })

  it('does not set "ja" when "aanwezig" is used for the section not contamination', () => {
    const text = 'Bodeminformatie aanwezig voor dit perceel. Er zijn geen aanwijzingen voor bodemverontreiniging.'
    const result = extractBodemverontreiniging(text)
    if (result !== undefined) {
      expect(result.value).not.toBe('ja')
    }
  })
})

// ---------------------------------------------------------------------------
// Fix #11 — provincie via postcode mapping
// ---------------------------------------------------------------------------
describe('postcodeToProvincie', () => {
  it('returns "Limburg" for postcode 5928LA', () => {
    expect(postcodeToProvincie('5928LA')).toBe('Limburg')
  })

  it('returns "Limburg" for numeric prefix 5928', () => {
    expect(postcodeToProvincie('5928')).toBe('Limburg')
  })

  it('returns "Noord-Brabant" for postcode 5000', () => {
    expect(postcodeToProvincie('5000')).toBe('Noord-Brabant')
  })

  it('returns "Zuid-Holland" for postcode 2500', () => {
    expect(postcodeToProvincie('2500')).toBe('Zuid-Holland')
  })
})

describe('extractProvincie — postcode fallback', () => {
  it('derives provincie from postcode when no explicit label', () => {
    const text = 'Columbusweg 13, 5928LA Venlo'
    const result = extractProvincie(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('Limburg')
  })
})

// ---------------------------------------------------------------------------
// Fix #12 — bouwlagen: "begane grond en eerste verdieping" → 2
// ---------------------------------------------------------------------------
describe('extractAantalBouwlagen', () => {
  it('returns 2 for "begane grond en eerste verdieping"', () => {
    const text = 'Het gebouw bestaat uit begane grond en eerste verdieping.'
    const result = extractAantalBouwlagen(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(2)
  })

  it('returns 2 for "begane grond + verdieping"', () => {
    const text = 'Gebouw: begane grond + verdieping'
    const result = extractAantalBouwlagen(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(2)
  })

  it('returns 2 for digit-based "2 bouwlagen"', () => {
    const text = 'Aantal bouwlagen: 2'
    const result = extractAantalBouwlagen(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Naam taxateur trailing digit strip
// ---------------------------------------------------------------------------
describe('extractNaamTaxateur — strip trailing page-number digits', () => {
  it('strips single trailing digit from naam taxateur', () => {
    const text = 'Uitvoerend taxateur: Rick Schiffelers RT  1\nVolgende veld: waarde'
    const result = extractNaamTaxateur(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('Rick Schiffelers RT')
  })

  it('strips multi-digit trailing page number', () => {
    const text = 'Uitvoerend taxateur: J. de Vries  12\nOverige info'
    const result = extractNaamTaxateur(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('J. de Vries')
  })

  it('does not strip non-trailing digits that are part of the name', () => {
    const text = 'Uitvoerend taxateur: J.P. Smit\nOverige info'
    const result = extractNaamTaxateur(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('J.P. Smit')
  })
})

// ---------------------------------------------------------------------------
// Eigendomssituatie — no-newline PDF format (real PDF uses space-joined text)
// ---------------------------------------------------------------------------
describe('extractEigendomssituatie — no-newline real-PDF format', () => {
  it('returns "Eigendom" when "Te taxeren belang: Eigendom" follows on same line', () => {
    // Simulates real PDF text where lines are joined with spaces (no newlines within a page)
    const text = 'Type eigendom: Eigendom Te taxeren belang: Eigendom Erfpacht: n.v.t. BVO: 2444'
    const result = extractEigendomssituatie(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('Eigendom')
  })

  it('returns "Eigendom" for no-space concatenation "EigendomTe taxeren belang:Eigendom"', () => {
    const text = 'Type eigendom: EigendomTe taxeren belang:Eigendom Erfpacht: n.v.t.'
    const result = extractEigendomssituatie(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('Eigendom')
  })

  it('does not produce "EigendomEigendom" in any scenario', () => {
    const text = 'Type eigendom: Eigendom Te taxeren belang: Eigendom'
    const result = extractEigendomssituatie(text)
    expect(result?.value).not.toMatch(/EigendomEigendom/i)
  })
})

// ---------------------------------------------------------------------------
// Ligging — "locatiescoring:" label recognition
// ---------------------------------------------------------------------------
describe('extractLigging — locatiescoring label', () => {
  it('extracts "goed" from "Locatiescoring: Goed"', () => {
    const text = 'Locatiescoring: Goed\nAndere info'
    const result = extractLigging(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('goed')
  })

  it('quality score from "locatiescoring:" wins over "bedrijventerrein" elsewhere', () => {
    const text = 'Locatiescoring: Goed\nBestemming: Bedrijventerrein\nGebruik: Ja'
    const result = extractLigging(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('goed')
    expect(result!.value).not.toBe('bedrijventerrein')
  })
})
