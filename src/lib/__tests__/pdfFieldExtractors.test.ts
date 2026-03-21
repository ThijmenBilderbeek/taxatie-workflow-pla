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
  extractAllFieldsWithConfidence,
} from '../pdfFieldExtractors'

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
// Asbest false positive prevention
// ---------------------------------------------------------------------------
describe('extractAllFieldsWithConfidence — asbest not extracted (no dedicated extractor)', () => {
  it('does not include asbest in field extractors (handled by pdfParser)', () => {
    const text = 'Bodemonderzoek: geen asbest in de grond aangetroffen.'
    // pdfFieldExtractors does not expose an asbest extractor;
    // this test confirms it is not in extractAllFieldsWithConfidence output
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
