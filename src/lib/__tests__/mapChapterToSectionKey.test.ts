import { describe, it, expect } from 'vitest'
import { splitReportIntoSections } from '../pdfParser'

/**
 * Tests for the chapter→section key mapping logic.
 *
 * `mapChapterToSectionKey` is not exported directly, so we test it indirectly
 * through `splitReportIntoSections` by constructing text with specific chapter
 * headings and verifying the resulting section keys.
 */
describe('mapChapterToSectionKey (via splitReportIntoSections)', () => {
  function makeText(heading: string, body: string): string {
    return `${heading}\n${body}`
  }

  const cases: Array<{ heading: string; expectedKey: string; body: string }> = [
    {
      heading: 'A. Samenvatting',
      expectedKey: 'samenvatting',
      body: 'Dit is de samenvatting van het rapport.',
    },
    {
      heading: 'B. Objectgegevens',
      expectedKey: 'object',
      body: 'Het object betreft een kantoorpand te Amsterdam.',
    },
    {
      heading: 'C. SWOT',
      expectedKey: 'swot',
      body: 'Sterktes, zwaktes, kansen en bedreigingen.',
    },
    {
      heading: 'D. Juridisch kader',
      expectedKey: 'juridisch',
      body: 'De eigendomssituatie is vol eigendom.',
    },
    {
      heading: 'E. Locatie en omgeving',
      expectedKey: 'locatie',
      body: 'Het object ligt in een woonwijk.',
    },
    {
      heading: 'F. Technisch rapport',
      expectedKey: 'technisch',
      body: 'De bouwkundige staat van het pand is goed.',
    },
    {
      heading: 'G. Duurzaamheid',
      expectedKey: 'duurzaamheid',
      body: 'Energielabel A. EPC waarde 0.6.',
    },
    {
      heading: 'H. Waardering',
      expectedKey: 'waardering',
      body: 'De marktwaarde is vastgesteld op €1.200.000.',
    },
    {
      heading: 'J. Aannames en voorbehouden',
      expectedKey: 'aannames',
      body: 'De taxatie is uitgevoerd onder voorbehoud.',
    },
    {
      heading: 'I. Marktanalyse',
      expectedKey: 'marktanalyse',
      body: 'Vraag en aanbod in de kantorenmarkt.',
    },
    {
      heading: 'K. Referentietransacties',
      expectedKey: 'referenties',
      body: 'Vergelijkingsobjecten gebruikt bij de taxatie.',
    },
    {
      heading: 'C.2 BEOORDELING',
      expectedKey: 'beoordeling',
      body: 'Courantheid verhuur: Goed. Verhuurtijd: 6 maanden.',
    },
    {
      heading: 'H ONDERBOUWING',
      expectedKey: 'onderbouwing',
      body: 'Markthuur: € 109.050. Netto huurwaarde: € 98.885.',
    },
    {
      heading: 'F OBJECT',
      expectedKey: 'object',
      body: 'Het object betreft een kantoorgebouw.',
    },
  ]

  for (const { heading, expectedKey, body } of cases) {
    it(`"${heading}" maps to section key "${expectedKey}"`, () => {
      const text = makeText(heading, body)
      const result = splitReportIntoSections(text)
      expect(result).toHaveProperty(expectedKey)
      expect(result[expectedKey]).toContain(body)
    })
  }

  it('"C SWOT-ANALYSE EN BEOORDELING" maps to swot (not beoordeling)', () => {
    // SWOT must take priority over beoordeling because the heading contains both terms
    const text = makeText('C SWOT-ANALYSE EN BEOORDELING', 'Sterktes: goede ligging.')
    const result = splitReportIntoSections(text)
    expect(result).toHaveProperty('swot')
    expect(result).not.toHaveProperty('beoordeling')
  })

  it('"E LOCATIE" maps to locatie (word-boundary match)', () => {
    const text = makeText('E LOCATIE', 'Het object ligt in Amsterdam.')
    const result = splitReportIntoSections(text)
    expect(result).toHaveProperty('locatie')
  })

  it('"I DUURZAAMHEID" maps to duurzaamheid', () => {
    const text = makeText('I DUURZAAMHEID', 'Energielabel: A.')
    const result = splitReportIntoSections(text)
    expect(result).toHaveProperty('duurzaamheid')
  })

  it('unrecognized uppercase heading maps to overig (never to locatie)', () => {
    // An unmapped heading must go to 'overig', not accidentally become 'locatie'
    const text = makeText('X ONBEKEND HOOFDSTUK', 'Tekst zonder locatie keyword.')
    const result = splitReportIntoSections(text)
    expect(result).not.toHaveProperty('locatie')
    expect(result).toHaveProperty('overig')
  })
})
