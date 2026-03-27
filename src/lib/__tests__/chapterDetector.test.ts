import { describe, it, expect } from 'vitest'
import { detectChapters } from '../chapterDetector'

describe('detectChapters', () => {
  it('detects letter chapters (A., B., C.)', () => {
    const text = `A. Inleiding
Dit is de inleiding van het rapport.

B. Objectomschrijving
Het object betreft een kantoorpand.`

    const sections = detectChapters(text)
    expect(sections.length).toBeGreaterThanOrEqual(2)
    const chapterLabels = sections.map((s) => s.chapter)
    expect(chapterLabels).toContain('A')
    expect(chapterLabels).toContain('B')
  })

  it('detects subchapters (A.1, B.2)', () => {
    const text = `B. Objectgegevens
Algemeen.

B.1 Adres en ligging
Het object is gelegen te Amsterdam.

B.2 Oppervlaktes
Het bruto vloeroppervlak bedraagt 1.200 m².`

    const sections = detectChapters(text)
    const subchapters = sections.map((s) => s.subchapter)
    expect(subchapters).toContain('B.1')
    expect(subchapters).toContain('B.2')
  })

  it('extracts text for each section', () => {
    const text = `A. Inleiding
Dit is de tekst van de inleiding.

B. Objectomschrijving
Dit is de tekst van de objectomschrijving.`

    const sections = detectChapters(text)
    const intro = sections.find((s) => s.chapter === 'A')
    expect(intro?.text).toContain('tekst van de inleiding')
    const desc = sections.find((s) => s.chapter === 'B')
    expect(desc?.text).toContain('tekst van de objectomschrijving')
  })

  it('returns a single fallback section when no headings found', () => {
    const text = `Dit is gewone tekst zonder hoofdstuk aanduidingen.
Het bevat meerdere zinnen maar geen structuur.`

    const sections = detectChapters(text)
    expect(sections.length).toBe(1)
    expect(sections[0].chapter).toBe('')
    expect(sections[0].text).toContain('gewone tekst')
  })

  it('handles ALL-CAPS headings', () => {
    const text = `INLEIDING
Dit is de inleiding.

OBJECTOMSCHRIJVING
Het object is een kantoor.`

    const sections = detectChapters(text)
    expect(sections.length).toBeGreaterThanOrEqual(2)
    const chaptersUpper = sections.map((s) => s.chapter)
    expect(chaptersUpper.some((c) => c.includes('INLEIDING'))).toBe(true)
  })

  it('correctly sets startIndex and endIndex for sections', () => {
    const text = `A. Sectie een
Inhoud van sectie A.

B. Sectie twee
Inhoud van sectie B.`

    const sections = detectChapters(text)
    const sectionA = sections.find((s) => s.chapter === 'A')
    const sectionB = sections.find((s) => s.chapter === 'B')
    expect(sectionA).toBeDefined()
    expect(sectionB).toBeDefined()
    expect(sectionA!.startIndex).toBeLessThan(sectionB!.startIndex)
    expect(sectionA!.endIndex).toBeLessThanOrEqual(sectionB!.startIndex)
  })

  it('handles numeric chapter headings', () => {
    const text = `1. Inleiding
Tekst van inleiding.

2. Analyse
Tekst van analyse.`

    const sections = detectChapters(text)
    const chapters = sections.map((s) => s.chapter)
    expect(chapters).toContain('1')
    expect(chapters).toContain('2')
  })

  it('handles empty text', () => {
    const sections = detectChapters('')
    expect(sections).toHaveLength(0)
  })

  it('detects multi-level subchapters', () => {
    const text = `B. Objectgegevens
Introductie.

B.1 Adres
Adresgegevens staan hier.

B.2 Oppervlakte
Oppervlaktegegevens.

C. Waardering
De waardebepaling.`

    const sections = detectChapters(text)
    const subchapters = sections.map((s) => s.subchapter).filter(Boolean)
    expect(subchapters).toContain('B.1')
    expect(subchapters).toContain('B.2')
  })
})
