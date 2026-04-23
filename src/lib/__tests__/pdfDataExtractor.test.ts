import { describe, it, expect } from 'vitest'
import {
  extractObjectScore,
  extractNettoHuurwaarde,
  extractMarktwaardePerM2,
  extractField,
  extractFreeText,
  extractSections,
  parseCurrency,
} from '../pdfDataExtractor'

// ---------------------------------------------------------------------------
// extractObjectScore — rule-based with tolerant regex
// ---------------------------------------------------------------------------
describe('extractObjectScore', () => {
  it('extracts "Goed" from "Object score: Goed"', () => {
    expect(extractObjectScore('Object score: Goed')).toBe('Goed')
  })

  it('extracts "Redelijk" from "Objectscore: Redelijk"', () => {
    expect(extractObjectScore('Objectscore: Redelijk')).toBe('Redelijk')
  })

  it('extracts "Matig" from "Object-score: Matig"', () => {
    expect(extractObjectScore('Object-score: Matig')).toBe('Matig')
  })

  it('extracts "Slecht" from "Object score - Slecht"', () => {
    expect(extractObjectScore('Object score - Slecht')).toBe('Slecht')
  })

  it('extracts "Voldoende" (case-insensitive label)', () => {
    expect(extractObjectScore('OBJECT SCORE: Voldoende')).toBe('Voldoende')
  })

  it('extracts from a multi-line object section', () => {
    const section = `
F OBJECT
Bouwjaar: 1985
Object score: Goed
Constructie: Betonnen skelet
`
    expect(extractObjectScore(section)).toBe('Goed')
  })

  it('returns null when no object score found', () => {
    expect(extractObjectScore('Dit is een testrapport zonder score')).toBeNull()
  })

  it('returns null for non-matching label', () => {
    expect(extractObjectScore('Locatie score: Goed')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// extractNettoHuurwaarde — multiple label variants
// ---------------------------------------------------------------------------
describe('extractNettoHuurwaarde', () => {
  it('extracts from "Netto huurwaarde: € 98.885"', () => {
    const section = 'Netto huurwaarde: € 98.885'
    expect(extractNettoHuurwaarde(section)).toBe(98885)
  })

  it('extracts from "Netto markt/herz. huur: € 98.885"', () => {
    const section = 'Netto markt/herz. huur: € 98.885'
    expect(extractNettoHuurwaarde(section)).toBe(98885)
  })

  it('extracts from "Netto markt-/herz. huur: € 98.885"', () => {
    const section = 'Netto markt-/herz. huur: € 98.885'
    expect(extractNettoHuurwaarde(section)).toBe(98885)
  })

  it('extracts from realistic onderbouwing text with label on same line', () => {
    const section = `
Onderbouwing huurwaarde
Netto huurwaarde: € 98.885
Marktwaarde per m²: € 1.522
`
    expect(extractNettoHuurwaarde(section)).toBe(98885)
  })

  it('returns null when no label found', () => {
    expect(extractNettoHuurwaarde('Dit bevat geen huurwaarde label')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// extractMarktwaardePerM2 — multiple label variants
// ---------------------------------------------------------------------------
describe('extractMarktwaardePerM2', () => {
  it('extracts from "Marktwaarde per m²: € 1.522"', () => {
    const section = 'Marktwaarde per m²: € 1.522'
    expect(extractMarktwaardePerM2(section)).toBe(1522)
  })

  it('extracts from "Marktwaarde per m2: € 1.522"', () => {
    const section = 'Marktwaarde per m2: € 1.522'
    expect(extractMarktwaardePerM2(section)).toBe(1522)
  })

  it('extracts from "Marktwaarde p/m²: € 1.522"', () => {
    const section = 'Marktwaarde p/m²: € 1.522'
    expect(extractMarktwaardePerM2(section)).toBe(1522)
  })

  it('extracts from "Marktwaarde p/m2: 1522"', () => {
    const section = 'Marktwaarde p/m2: 1522'
    expect(extractMarktwaardePerM2(section)).toBe(1522)
  })

  it('extracts from realistic onderbouwing text', () => {
    const section = `
Onderbouwing waardering
Netto huurwaarde: € 98.885
Marktwaarde per m²: € 1.522
`
    expect(extractMarktwaardePerM2(section)).toBe(1522)
  })

  it('returns null when no label found', () => {
    expect(extractMarktwaardePerM2('Geen waardering hier')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// extractFreeText — heading-based field capture for constructie / terrein /
//                   voorzieningen / omgeving_en_belendingen
// ---------------------------------------------------------------------------
describe('extractFreeText — heading-based text field capture', () => {
  it('captures constructie body text until next heading', () => {
    const section = `
Constructie
Het gebouw heeft een betonnen skelet met prefab gevelelementen.

Terrein
Het terrein is verhard en deels groen ingericht.
`
    const result = extractFreeText(section, 'Constructie')
    expect(result).toBeTruthy()
    expect(result).toContain('betonnen skelet')
    expect(result).not.toContain('Terrein')
  })

  it('captures terrein body text', () => {
    const section = `
Terrein
Het terrein is verhard en voorzien van parkeergelegenheid.

Omgeving en belendingen
De omgeving bestaat uit kantoren en bedrijfspanden.
`
    const result = extractFreeText(section, 'Terrein')
    expect(result).toBeTruthy()
    expect(result).toContain('parkeergelegenheid')
  })

  it('captures voorzieningen body text', () => {
    const section = `
Voorzieningen
Er zijn diverse voorzieningen in de directe omgeving aanwezig, waaronder supermarkten en openbaar vervoer.

Omgeving en belendingen
De omgeving bestaat uit woonbebouwing.
`
    const result = extractFreeText(section, 'Voorzieningen')
    expect(result).toBeTruthy()
    expect(result).toContain('supermarkten')
  })

  it('captures omgeving en belendingen body text', () => {
    const section = `
Omgeving en belendingen
Het pand is gelegen in een gemengd woon-werkgebied.

Volgende sectie
`
    const result = extractFreeText(section, 'Omgeving en belendingen')
    expect(result).toBeTruthy()
    expect(result).toContain('gemengd woon-werkgebied')
  })

  it('captures "Constructie en afwerking" variant', () => {
    const section = `
Constructie en afwerking
Het gebouw heeft een staalconstructie met gevelpanelen.

Terrein
`
    const result = extractFreeText(section, 'Constructie en afwerking')
    expect(result).toBeTruthy()
    expect(result).toContain('staalconstructie')
  })

  it('captures "Terreingesteldheid" variant', () => {
    const section = `
Terreingesteldheid
Het terrein is deels verhard met klinkers.

Volgende sectie
`
    const result = extractFreeText(section, 'Terreingesteldheid')
    expect(result).toBeTruthy()
    expect(result).toContain('klinkers')
  })

  it('returns null when heading is absent', () => {
    const section = 'Geen relevante sectie aanwezig in dit tekstblok.'
    expect(extractFreeText(section, 'Constructie')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// parseCurrency — Dutch number parsing
// ---------------------------------------------------------------------------
describe('parseCurrency — Dutch currency strings', () => {
  it('parses "€ 98.885"', () => {
    expect(parseCurrency('€ 98.885')).toBe(98885)
  })

  it('parses "€ 1.522"', () => {
    expect(parseCurrency('€ 1.522')).toBe(1522)
  })

  it('parses "1522" (no formatting)', () => {
    expect(parseCurrency('1522')).toBe(1522)
  })

  it('parses "€ 1.325.000 k.k."', () => {
    expect(parseCurrency('€ 1.325.000 k.k.')).toBe(1325000)
  })
})
