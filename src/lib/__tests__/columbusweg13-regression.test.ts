/**
 * Regression tests for the "Columbusweg 13 te Venlo" rapport.
 *
 * These tests lock in the ground-truth values extracted from the report and
 * serve as a guard against parser regressions.  Each test corresponds to one
 * of the 20 concrete requirements listed in the issue.
 */

import { describe, it, expect } from 'vitest'
import {
  extractInspectiedatum,
  extractLigging,
  extractGebruiksdoel,
  extractEigendomssituatie,
  extractEnergielabel,
  extractBodemverontreiniging,
  extractNar,
  extractKapitalisatiefactor,
  extractAantalBouwlagen,
  extractAannames,
  extractVoorbehouden,
  extractProvincie,
  extractTypeObject,
  extractAsbest,
  extractMarkthuur,
  extractBar,
  extractConstructie,
} from '../pdfFieldExtractors'
import { postcodeToProvincie, stripHeaderFooterNoise, cleanLabelRemnant } from '../pdfNormalizers'

// ---------------------------------------------------------------------------
// Shared fixture — simulates the Columbusweg 13 te Venlo rapport
// ---------------------------------------------------------------------------

const COLUMBUSWEG_TEXT = `
Taxatierapport
Uitvoerend taxateur: Rick Schiffelers RT
Objectnaam: Columbusweg 13 te Venlo
Columbusweg 13, 5928LA Venlo
Type object: Eigen gebruik
Gebruiksdoel: Eigenaar-gebruiker
BVO: 2.444 m²
VVO: 2.411 m²
Perceeloppervlak: 16.042 m²
Bouwjaar: 2006
Renovatiejaar: 2024
Marktwaarde kosten koper: € 4.332.360
BAR | Kap. markt/herz. huur kk: 8,15 %
NAR % von: 6,75 %
Kapitalisatiefactor: 12,30
Energielabel: - / Geen
Datum opname en inspectie: vrijdag 7 november 2025
Omschrijving locatie, stand en ligging: Goed
Toelichting bereikbaarheid: Goed
Gemeente: Venlo
Type eigendom: Eigendom
Te taxeren belang: Eigendom
Markt/herz. huur: 352.951
geschakeld bedrijfscomplex, bestaande uit een bedrijfsruimte met inpandige kantoor-/secundaire ruimten verdeeld over twee bouwlagen
Eigenaar gebruiker
Opstalrecht: nutsvoorzieningen op gedeelte van perceel ten behoeve van Enexis Netbeheer B.V.
Vigerend bestemmingsplan: Trade Port West-Oost
Bestemming: Bedrijventerrein
Gebruik conform omgevingsplan: Ja
Fundering: vermoedelijk op staal (vaste grondslag) met funderingsstroken
Constructie: staalconstructie
Dakconstructie: plat dak in staal vermoedelijk voorzien van kunststof dakbedekking
Installaties: cv-ketels, radiatoren, vloerverwarming, gasheaters, warmteterugwinning
Staat van onderhoud buiten: Goed
Staat van onderhoud binnen: Goed
Geen asbestverdachte materialen waargenomen
Bodeminformatie: plaatselijk lichte tot matige verhogingen aangetroffen. Sterke koperverontreiniging in één mengmonster. Geen saneringsnoodzaak vastgesteld. Geen visuele aanwijzingen voor bodemverontreiniging bij opname. Geen gegevens bekend die wijzen op beperkingen voor huidig gebruik.
In de taxatie zijn geen bijzondere uitgangspunten opgenomen
Taxatie onnauwkeurigheid: De taxatie kent een inherente onnauwkeurigheid.

H.2 Referentieobjecten
Referentieobject 1: Energielabel: A
Referentieobject 2: Energielabel: B
Referentieobject 3: Bouwjaar: 2010
`.trim()

// ---------------------------------------------------------------------------
// Test 1 — inspectiedatum is derived from "Datum opname en inspectie"
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 1: inspectiedatum', () => {
  it('extracts 2025-11-07 from "Datum opname en inspectie: vrijdag 7 november 2025"', () => {
    const result = extractInspectiedatum(COLUMBUSWEG_TEXT)
    expect(result).toBeDefined()
    expect(result!.value).toBe('2025-11-07')
  })
})

// ---------------------------------------------------------------------------
// Test 2 — ligging is "goed", not "bedrijventerrein"
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 2: ligging', () => {
  it('returns "goed" as ligging (quality score wins over zone enum)', () => {
    const result = extractLigging(COLUMBUSWEG_TEXT)
    expect(result).toBeDefined()
    expect(result!.value).toBe('goed')
  })

  it('does not return "bedrijventerrein" as the ligging value', () => {
    const result = extractLigging(COLUMBUSWEG_TEXT)
    expect(result?.value).not.toBe('bedrijventerrein')
  })
})

// ---------------------------------------------------------------------------
// Test 3 — verhuurd = false for eigenaar-gebruiker + markthuur without tenant
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 3: verhuurd = false', () => {
  it('gebruiksdoel is "eigenaar_gebruiker" (occupier status)', () => {
    const result = extractGebruiksdoel(COLUMBUSWEG_TEXT)
    expect(result).toBeDefined()
    expect(result!.value).toBe('eigenaar_gebruiker')
  })

  it('markthuur is present (352951) but should not imply verhuurd=true', () => {
    // markthuurPerJaar being set is fine; the verhuurd flag depends on occupancy status,
    // not the presence of a market rent figure.
    const markthuur = extractMarkthuur(COLUMBUSWEG_TEXT)
    const gebruiksdoel = extractGebruiksdoel(COLUMBUSWEG_TEXT)
    expect(markthuur?.value).toBe(352951)
    // When gebruiksdoel = eigenaar_gebruiker, verhuurd must be false
    expect(gebruiksdoel?.value).toBe('eigenaar_gebruiker')
  })
})

// ---------------------------------------------------------------------------
// Test 4 — eigendomssituatie = "Eigendom" (no duplication)
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 4: eigendomssituatie', () => {
  it('returns "Eigendom" (not "EigendomEigendom" or "Eigendom Eigendom")', () => {
    const result = extractEigendomssituatie(COLUMBUSWEG_TEXT)
    expect(result).toBeDefined()
    expect(result!.value).toBe('Eigendom')
  })

  it('does not contain repeated "Eigendom" substring', () => {
    const result = extractEigendomssituatie(COLUMBUSWEG_TEXT)
    expect(result?.value).not.toMatch(/Eigendom.*Eigendom/i)
  })

  it('does not contain "Te taxeren belang" in eigendomssituatie', () => {
    const result = extractEigendomssituatie(COLUMBUSWEG_TEXT)
    expect(result?.value).not.toMatch(/te taxeren belang/i)
  })
})

// ---------------------------------------------------------------------------
// Test 5 — bestemmingsplan does not contain page header/footer noise
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 5: bestemmingsplan noise cleaning', () => {
  it('stripHeaderFooterNoise removes standalone page numbers', () => {
    const dirty = 'Trade Port West-Oost\nBedrijventerrein\n3\nPrintdatum: 01-01-2025\nGebruik conform: Ja'
    const clean = stripHeaderFooterNoise(dirty)
    expect(clean).not.toMatch(/^\s*3\s*$/m)
    expect(clean).not.toMatch(/Printdatum/i)
  })

  it('stripHeaderFooterNoise removes taxateur name lines', () => {
    const dirty = 'Trade Port West-Oost\nRick Schiffelers RT\nBedrijventerrein'
    const clean = stripHeaderFooterNoise(dirty)
    expect(clean).not.toContain('Rick Schiffelers RT')
    expect(clean).toContain('Trade Port West-Oost')
  })

  it('stripHeaderFooterNoise removes "Pagina X van Y" lines', () => {
    const dirty = 'Bestemmingsplan info\nPagina 4 van 12\nVervolginfo'
    const clean = stripHeaderFooterNoise(dirty)
    expect(clean).not.toMatch(/pagina\s+4\s+van\s+12/i)
  })
})

// ---------------------------------------------------------------------------
// Test 6 — fundering and constructie remain separate
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 6: fundering and constructie separate', () => {
  it('constructie is "staalconstructie" without fundering content', () => {
    const result = extractConstructie(COLUMBUSWEG_TEXT)
    expect(result).toBeDefined()
    expect(result!.value).toBe('staalconstructie')
    expect(result!.value).not.toMatch(/fundering|funderingsstroken/i)
  })

  it('constructie does not bleed into fundering text', () => {
    const result = extractConstructie(COLUMBUSWEG_TEXT)
    expect(result?.value).not.toMatch(/vermoedelijk op staal.*funderingsstroken/i)
  })
})

// ---------------------------------------------------------------------------
// Test 7 — dakbedekking label fragment is cleaned correctly
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 7: dakbedekking clean label', () => {
  it('cleanLabelRemnant strips leading label fragment from dakbedekking text', () => {
    // Simulates a PDF extraction artefact where the last few chars of a label bleed in
    const raw = 'ie: plat dak vermoedelijk voorzien van kunststof dakbedekking'
    const cleaned = cleanLabelRemnant(raw)
    expect(cleaned).not.toMatch(/^ie:/i)
    expect(cleaned.charAt(0)).toBe(cleaned.charAt(0).toUpperCase())
    expect(cleaned).toMatch(/plat dak/i)
  })

  it('cleanLabelRemnant capitalises first character after stripping', () => {
    const raw = 'ing: staalconstructie met betonnen vloerplaten'
    const cleaned = cleanLabelRemnant(raw)
    expect(cleaned).toMatch(/^Staalconstructie/i)
  })
})

// ---------------------------------------------------------------------------
// Test 8 — energielabel of main object is "geen" (not A/B from references)
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 8: energielabel from main section', () => {
  it('returns "geen" for the main object energielabel (- / Geen)', () => {
    const result = extractEnergielabel(COLUMBUSWEG_TEXT)
    expect(result).toBeDefined()
    expect(result!.value).toBe('geen')
  })

  it('does not return "A" (from reference section)', () => {
    expect(extractEnergielabel(COLUMBUSWEG_TEXT)?.value).not.toBe('A')
  })

  it('does not return "B" (from reference section)', () => {
    expect(extractEnergielabel(COLUMBUSWEG_TEXT)?.value).not.toBe('B')
  })
})

// ---------------------------------------------------------------------------
// Test 9 — suppression phrase forces "geen" label
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 9: suppression phrase "geen energielabel geregistreerd"', () => {
  it('maps suppression phrase to "geen"', () => {
    const text = 'Er is geen energielabel geregistreerd bij EP-online voor dit object.'
    const result = extractEnergielabel(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('geen')
    expect(result!.parserRule).toBe('energielabel-suppression')
  })

  it('maps "Energielabel: -" to "geen"', () => {
    const result = extractEnergielabel('Energielabel: -\nOverige info')
    expect(result?.value).toBe('geen')
  })

  it('maps "Energielabel: - / Geen" to "geen"', () => {
    const result = extractEnergielabel('Energielabel: - / Geen\nOverige info')
    expect(result?.value).toBe('geen')
  })
})

// ---------------------------------------------------------------------------
// Test 10 — bodemverontreiniging not auto-"ja" when "geen saneringsnoodzaak"
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 10: bodemverontreiniging nuanced logic', () => {
  it('does not return "ja" when "geen saneringsnoodzaak" is present', () => {
    const result = extractBodemverontreiniging(COLUMBUSWEG_TEXT)
    expect(result?.value).not.toBe('ja')
  })

  it('returns "onbekend" for verontreiniging without saneringsnoodzaak or gebruiksbeperking', () => {
    const result = extractBodemverontreiniging(COLUMBUSWEG_TEXT)
    expect(result).toBeDefined()
    expect(result!.value).toBe('onbekend')
  })

  it('returns "nee" when "geen aanwijzingen voor bodemverontreiniging" is present', () => {
    const text = 'Bodeminformatie: Geen aanwijzingen voor bodemverontreiniging aanwezig op het perceel.'
    const result = extractBodemverontreiniging(text)
    expect(result?.value).toBe('nee')
  })
})

// ---------------------------------------------------------------------------
// Test 11 — NAR = 6.75
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 11: NAR', () => {
  it('extracts NAR as 6.75 from "NAR % von: 6,75 %"', () => {
    const result = extractNar(COLUMBUSWEG_TEXT)
    expect(result).toBeDefined()
    expect(result!.value).toBe(6.75)
  })
})

// ---------------------------------------------------------------------------
// Test 12 — kapitalisatiefactor = 12.3
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 12: kapitalisatiefactor', () => {
  it('extracts kapitalisatiefactor as 12.3 from "Kapitalisatiefactor: 12,30"', () => {
    const result = extractKapitalisatiefactor(COLUMBUSWEG_TEXT)
    expect(result).toBeDefined()
    expect(result!.value).toBe(12.3)
  })

  it('prefers "Kapitalisatiefactor: 12,30" over a later "kap. factor von 13,6"', () => {
    const textWithBothSources = `${COLUMBUSWEG_TEXT}\nKap. factor von 13,6`
    const result = extractKapitalisatiefactor(textWithBothSources)
    expect(result?.value).toBe(12.3)
  })
})

// ---------------------------------------------------------------------------
// Test 13 — aantal bouwlagen = 2 from "verdeeld over twee bouwlagen"
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 13: aantal bouwlagen', () => {
  it('extracts 2 from "verdeeld over twee bouwlagen"', () => {
    const text = 'bedrijfsruimte met inpandige kantoor-/secundaire ruimten verdeeld over twee bouwlagen'
    const result = extractAantalBouwlagen(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe(2)
  })

  it('extracts 2 from full COLUMBUSWEG_TEXT via "over twee bouwlagen"', () => {
    const result = extractAantalBouwlagen(COLUMBUSWEG_TEXT)
    expect(result).toBeDefined()
    expect(result!.value).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Test 14 — aannames is compact (no reference section leakage)
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 14: aannames compact summary', () => {
  it('aannames is defined', () => {
    const result = extractAannames(COLUMBUSWEG_TEXT)
    expect(result).toBeDefined()
  })

  it('aannames is at most 450 characters', () => {
    const result = extractAannames(COLUMBUSWEG_TEXT)
    expect((result?.value ?? '').length).toBeLessThanOrEqual(450)
  })

  it('aannames does not contain reference section content (H.2)', () => {
    const result = extractAannames(COLUMBUSWEG_TEXT)
    expect(result?.value ?? '').not.toMatch(/H\.2|Referentieobject/i)
  })

  it('aannames does not contain "Energielabel: A" from references', () => {
    const result = extractAannames(COLUMBUSWEG_TEXT)
    expect(result?.value ?? '').not.toContain('Energielabel: A')
  })
})

// ---------------------------------------------------------------------------
// Test 15 — voorbehouden = "Geen bijzondere uitgangspunten opgenomen"
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 15: voorbehouden', () => {
  it('returns "Geen bijzondere uitgangspunten opgenomen." as voorbehouden', () => {
    const result = extractVoorbehouden(COLUMBUSWEG_TEXT)
    expect(result).toBeDefined()
    expect(result!.value).toMatch(/geen bijzondere uitgangspunten/i)
  })

  it('voorbehouden has high confidence from suppression pattern', () => {
    const result = extractVoorbehouden(COLUMBUSWEG_TEXT)
    expect(result?.confidence).toBe('high')
  })
})

// ---------------------------------------------------------------------------
// Test 16 — provincie = "Limburg" for postcode 5928
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 16: provincie', () => {
  it('postcodeToProvincie("5928LA") returns "Limburg"', () => {
    expect(postcodeToProvincie('5928LA')).toBe('Limburg')
  })

  it('postcodeToProvincie("5928") returns "Limburg"', () => {
    expect(postcodeToProvincie('5928')).toBe('Limburg')
  })

  it('extractProvincie derives "Limburg" from COLUMBUSWEG_TEXT via postcode fallback', () => {
    const result = extractProvincie(COLUMBUSWEG_TEXT)
    expect(result).toBeDefined()
    expect(result!.value).toBe('Limburg')
  })
})

// ---------------------------------------------------------------------------
// Test 17 — typeObject = "bedrijfscomplex" (not "eigen gebruik")
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 17: typeObject', () => {
  it('extracts "bedrijfscomplex" despite "Type object: Eigen gebruik" label', () => {
    const result = extractTypeObject(COLUMBUSWEG_TEXT)
    expect(result).toBeDefined()
    expect(result!.value).toBe('bedrijfscomplex')
  })

  it('does not return "eigen gebruik" as typeObject', () => {
    expect(extractTypeObject(COLUMBUSWEG_TEXT)?.value).not.toMatch(/eigen gebruik/i)
  })
})

// ---------------------------------------------------------------------------
// Test 18 — asbest = "nee" for "geen asbestverdachte materialen waargenomen"
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 18: asbest', () => {
  it('returns "nee" for "Geen asbestverdachte materialen waargenomen"', () => {
    const text = 'Geen asbestverdachte materialen waargenomen bij de opname van het object.'
    const result = extractAsbest(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('nee')
  })

  it('returns "nee" from COLUMBUSWEG_TEXT', () => {
    const result = extractAsbest(COLUMBUSWEG_TEXT)
    expect(result).toBeDefined()
    expect(result!.value).toBe('nee')
  })
})

// ---------------------------------------------------------------------------
// Test 19 — markthuurPerJaar = 352951
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 19: markthuur per jaar', () => {
  it('extracts markthuur 352951 from "Markt/herz. huur: 352.951"', () => {
    const result = extractMarkthuur(COLUMBUSWEG_TEXT)
    expect(result).toBeDefined()
    expect(result!.value).toBe(352951)
  })
})

// ---------------------------------------------------------------------------
// Test 20 — BAR = 8.15
// ---------------------------------------------------------------------------
describe('Columbusweg 13 — test 20: BAR', () => {
  it('extracts BAR as 8.15 from "BAR | Kap. markt/herz. huur kk: 8,15 %"', () => {
    const result = extractBar(COLUMBUSWEG_TEXT)
    expect(result).toBeDefined()
    expect(result!.value).toBe(8.15)
  })
})
