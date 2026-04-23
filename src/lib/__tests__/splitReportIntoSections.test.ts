import { describe, it, expect } from 'vitest'
import { splitReportIntoSections } from '../pdfParser'
import { mergeFieldValue, type FieldSourceMeta } from '../pdfChunkAIExtractor'
import { extractTypeObject } from '../pdfFieldExtractors'

describe('splitReportIntoSections', () => {
  it('always includes volledig key with the full original text', () => {
    const text = 'Dit is een taxatierapport zonder hoofdstukken.'
    const result = splitReportIntoSections(text)
    expect(result).toHaveProperty('volledig')
    expect(result.volledig).toBe(text)
  })

  it('backward compat — volledig equals full input when text is short', () => {
    const text = `A. Samenvatting\nDit is de samenvatting.\n\nB. Waardering\nDe marktwaarde is €1.000.000.`
    const result = splitReportIntoSections(text)
    // Short text is never truncated even when sections are detected
    expect(result.volledig).toBe(text)
  })

  it('truncates volledig to 50 000 chars when sections are detected and text is large', () => {
    // Build a text large enough to trigger truncation (> 50 000 chars)
    const sectionContent = 'x'.repeat(30000)
    const text = `A. Samenvatting\n${sectionContent}\n\nB. Waardering\n${sectionContent}`
    expect(text.length).toBeGreaterThan(50000)

    const result = splitReportIntoSections(text)

    // Named sections are detected so truncation should apply
    expect(result).toHaveProperty('samenvatting')
    expect(result).toHaveProperty('waardering')
    // volledig must be capped at 50 000 chars + '…'
    expect(result.volledig.length).toBeLessThanOrEqual(50001)
    expect(result.volledig.endsWith('…')).toBe(true)
  })

  it('detects letter-based chapters and maps to correct section keys', () => {
    const text = `A. Samenvatting
Dit is de samenvatting van het rapport.

B. Waardering
De marktwaarde is vastgesteld op €1.000.000.

C. SWOT-analyse
Sterktes en zwaktes van het object.

D. Juridisch kader
Eigendomssituatie is vol eigendom.

E. Locatie en omgeving
Het object ligt in een woonwijk.

F. Technisch rapport
De bouwkundige staat is goed.

H. Waardering methode
BAR/NAR methode toegepast.

J. Aannames en voorbehouden
De taxatie is uitgevoerd onder voorbehoud.`

    const result = splitReportIntoSections(text)

    expect(result).toHaveProperty('samenvatting')
    expect(result.samenvatting).toContain('samenvatting van het rapport')

    expect(result).toHaveProperty('swot')
    expect(result.swot).toContain('Sterktes en zwaktes')

    expect(result).toHaveProperty('juridisch')
    expect(result.juridisch).toContain('vol eigendom')

    expect(result).toHaveProperty('locatie')
    expect(result.locatie).toContain('woonwijk')

    expect(result).toHaveProperty('technisch')
    expect(result.technisch).toContain('bouwkundige staat')

    expect(result).toHaveProperty('waardering')
    expect(result.waardering).toContain('marktwaarde')

    expect(result).toHaveProperty('aannames')
    expect(result.aannames).toContain('voorbehoud')
  })

  it('handles numeric chapters', () => {
    const text = `1. Inleiding
Dit is de inleiding.

2. Objectbeschrijving
Het object is een kantoorpand.`

    const result = splitReportIntoSections(text)

    expect(result).toHaveProperty('samenvatting')
    expect(result.samenvatting).toContain('inleiding')

    expect(result).toHaveProperty('object')
    expect(result.object).toContain('kantoorpand')
  })

  it('handles ALL-CAPS headings', () => {
    const text = `SAMENVATTING
Dit is een samenvatting.

LOCATIE EN OMGEVING
Het object is gelegen in Amsterdam.`

    const result = splitReportIntoSections(text)

    expect(result).toHaveProperty('samenvatting')
    expect(result.samenvatting).toContain('samenvatting')

    expect(result).toHaveProperty('locatie')
    expect(result.locatie).toContain('Amsterdam')
  })

  it('merges multiple subchapters into the same section key', () => {
    const text = `E. Locatie
Algemene locatiebeschrijving.

E.1 Ligging
Het object ligt in de binnenstad.

E.2 Bereikbaarheid
Goed bereikbaar per openbaar vervoer.`

    const result = splitReportIntoSections(text)

    expect(result).toHaveProperty('locatie')
    // Both subchapters should be merged under locatie
    expect(result.locatie).toContain('binnenstad')
    expect(result.locatie).toContain('openbaar vervoer')
  })

  it('unrecognized chapters are silently skipped but volledig still contains everything', () => {
    const text = `A. Samenvatting
De samenvatting van het rapport.

K. Bijlagen
Bijlage 1: tekeningen.`

    const result = splitReportIntoSections(text)

    expect(result).toHaveProperty('samenvatting')
    expect(result).not.toHaveProperty('bijlagen')
    // volledig should still contain the unrecognized chapter text
    expect(result.volledig).toContain('Bijlage 1: tekeningen')
  })

  it('returns only volledig when there are no chapter headings', () => {
    const text = 'Gewone tekst zonder hoofdstukaanduidingen. Gewoon een paar zinnen.'
    const result = splitReportIntoSections(text)

    const keys = Object.keys(result)
    expect(keys).toEqual(['volledig'])
    expect(result.volledig).toBe(text)
  })

  it('production scenario: UPPERCASE-heading PDF produces multiple named sections', () => {
    // Simulates what the y-coordinate line reconstruction produces for a real
    // taxatie PDF with chapter headings like "C SWOT-ANALYSE EN BEOORDELING".
    // Each heading on its own line (as guaranteed by extractTextFromPdf after fix).
    const text = [
      'C SWOT-ANALYSE EN BEOORDELING',
      'De SWOT-analyse van het object.',
      '',
      'C.2 BEOORDELING',
      'Courantheid verhuur: Goed.',
      '',
      'E LOCATIE',
      'Het object is gelegen in Amsterdam.',
      '',
      'F OBJECT',
      'Het betreft een kantoorpand.',
      '',
      'H ONDERBOUWING',
      'Markthuur: € 109.050.',
      '',
      'I DUURZAAMHEID',
      'Energielabel: A.',
    ].join('\n')

    const result = splitReportIntoSections(text)

    // Must produce multiple named sections — NOT collapse into one
    const namedKeys = Object.keys(result).filter((k) => k !== 'volledig' && k !== 'overig')
    expect(namedKeys.length).toBeGreaterThanOrEqual(4)

    expect(result).toHaveProperty('swot')
    expect(result.swot).toContain('SWOT-analyse')

    expect(result).toHaveProperty('beoordeling')
    expect(result.beoordeling).toContain('Courantheid')

    expect(result).toHaveProperty('locatie')
    expect(result.locatie).toContain('Amsterdam')

    expect(result).toHaveProperty('object')
    expect(result.object).toContain('kantoorpand')

    expect(result).toHaveProperty('onderbouwing')
    expect(result.onderbouwing).toContain('Markthuur')

    expect(result).toHaveProperty('duurzaamheid')
    expect(result.duurzaamheid).toContain('Energielabel')
  })

  it('locatie terms without word boundary do NOT accidentally map to locatie', () => {
    // "infrastructuur" embedded in longer words should not match
    // Generic headings like "OMSCHRIJVING" have no locatie keyword → overig
    const text = 'OMSCHRIJVING\nAlgemene tekst over het pand.\n'
    const result = splitReportIntoSections(text)
    // OMSCHRIJVING has no locatie keywords → must not appear as locatie
    expect(result).not.toHaveProperty('locatie')
  })
})

// ---------------------------------------------------------------------------
// object_type false-positive prevention (Task 5 + Task 7)
// ---------------------------------------------------------------------------

describe('extractTypeObject — no woning false positive for office reports', () => {
  it('returns kantoor when document has explicit kantoor label', () => {
    const text = 'Type object: kantoor\nHet betreft een kantoorpand in Amsterdam.'
    const result = extractTypeObject(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('kantoor')
  })

  it('does NOT return woning when document has office signals + residential market text', () => {
    // This simulates the production failure: market analysis text in an office report
    // contains standalone "woning" mentions, but the report is clearly about a kantoor.
    const text = [
      'De kantorenmarkt in Amsterdam is actief.',
      'Het kantoorpand beschikt over moderne faciliteiten.',
      'In vergelijking met de woningmarkt is de kantorenmarkt stabieler.',
      'Een gemiddelde huurwoning kost € 1.500 per maand.',
      'Het betreft een kantoor aan de Herengracht.',
    ].join('\n')

    const result = extractTypeObject(text)
    // kantoor should be detected, NOT woning
    expect(result).toBeDefined()
    expect(result!.value).toBe('kantoor')
    expect(result!.value).not.toBe('woning')
  })

  it('detects kantoorpand as kantoor', () => {
    const text = 'Het object betreft een kantoorpand uit 2005.'
    const result = extractTypeObject(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('kantoor')
  })

  it('detects kantoorruimte as kantoor', () => {
    const text = 'De kantoorruimte heeft een BVO van 500 m².'
    const result = extractTypeObject(text)
    expect(result).toBeDefined()
    expect(result!.value).toBe('kantoor')
  })
})

// ---------------------------------------------------------------------------
// mergeFieldValue — office beats woning in conflict resolution (Task 7)
// ---------------------------------------------------------------------------

describe('mergeFieldValue — object_type office-over-woning rule', () => {
  const metaRuleBased: FieldSourceMeta = {
    sectionTitle: 'locatie',
    chunkIndex: 0,
    extractionType: 'rule_based',
  }

  it('office type (kantoor) overrides weak woning when existing=woning, incoming=kantoor', () => {
    const { value, conflict } = mergeFieldValue('woning', metaRuleBased, 'kantoor', metaRuleBased, 'object_type')
    expect(value).toBe('kantoor')
    expect(conflict).toBeDefined()
    expect(conflict!.reason).toMatch(/office type/i)
  })

  it('office type (bedrijfshal) overrides woning', () => {
    const { value } = mergeFieldValue('woning', metaRuleBased, 'bedrijfshal', metaRuleBased, 'object_type')
    expect(value).toBe('bedrijfshal')
  })

  it('existing office type (kantoor) is NOT overridden by incoming woning', () => {
    const { value, conflict } = mergeFieldValue('kantoor', metaRuleBased, 'woning', metaRuleBased, 'object_type')
    expect(value).toBe('kantoor')
    expect(conflict).toBeDefined()
    expect(conflict!.reason).toMatch(/office type/i)
  })

  it('does not apply office-over-woning rule for non-object_type fields', () => {
    // For other fields, normal priority logic applies
    const { value } = mergeFieldValue('woning', metaRuleBased, 'kantoor', metaRuleBased, 'adres')
    // rule_based vs rule_based, existing wins (equal priority → stability preference)
    expect(value).toBe('woning')
  })
})
