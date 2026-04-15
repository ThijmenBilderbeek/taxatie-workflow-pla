import { describe, it, expect } from 'vitest'
import { splitReportIntoSections } from '../pdfParser'

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
})
