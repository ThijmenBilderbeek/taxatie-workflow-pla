import { describe, it, expect } from 'vitest'
import { cleanExtractedPdfText } from '../pdfTextCleaner'

// ---------------------------------------------------------------------------
// Noise-line removal
// ---------------------------------------------------------------------------
describe('cleanExtractedPdfText – noise line removal', () => {
  it('removes "Waarde op:" lines', () => {
    const input = 'Object: kantoorpand\nWaarde op: 01-01-2024\nLocatie: Amsterdam'
    const result = cleanExtractedPdfText(input)
    expect(result).not.toMatch(/Waarde op:/i)
    expect(result).toContain('Object: kantoorpand')
    expect(result).toContain('Locatie: Amsterdam')
  })

  it('removes "Uitvoerend taxateur:" lines', () => {
    const input = 'Marktwaarde: €500.000\nUitvoerend taxateur: Jan Jansen\nBVO: 350 m²'
    const result = cleanExtractedPdfText(input)
    expect(result).not.toMatch(/Uitvoerend taxateur:/i)
    expect(result).toContain('Marktwaarde: €500.000')
    expect(result).toContain('BVO: 350 m²')
  })

  it('removes "Printdatum:" lines', () => {
    const input = 'Printdatum: 15-04-2024\nTaxatierapport\nObject: winkel'
    const result = cleanExtractedPdfText(input)
    expect(result).not.toMatch(/Printdatum:/i)
    expect(result).toContain('Object: winkel')
  })

  it('removes "Pagina X" lines', () => {
    const input = 'Samenvatting\nPagina 3\nDe waarde is vastgesteld'
    const result = cleanExtractedPdfText(input)
    expect(result).not.toMatch(/^Pagina 3\s*$/m)
    expect(result).toContain('Samenvatting')
    expect(result).toContain('De waarde is vastgesteld')
  })

  it('removes "Pagina X van Y" lines', () => {
    const input = 'Inleiding\nPagina 2 van 10\nObject'
    const result = cleanExtractedPdfText(input)
    expect(result).not.toMatch(/^Pagina 2 van 10\s*$/m)
  })

  it('removes "X van Y" standalone page counter lines', () => {
    const input = 'Technisch\n3 van 12\nDak: plat dak'
    const result = cleanExtractedPdfText(input)
    expect(result).not.toMatch(/^3 van 12\s*$/m)
    expect(result).toContain('Dak: plat dak')
  })

  it('removes standalone numeric page numbers', () => {
    const input = 'Juridisch\n7\nEigendom: eigendom'
    const result = cleanExtractedPdfText(input)
    expect(result).not.toMatch(/^7\s*$/m)
    expect(result).toContain('Eigendom: eigendom')
  })

  it('removes standalone "Taxatierapport" title lines', () => {
    const input = 'Taxatierapport\nB TAXATIE\nMarktwaarde: €800.000'
    const result = cleanExtractedPdfText(input)
    expect(result).not.toMatch(/^Taxatierapport\s*$/m)
    expect(result).toContain('B TAXATIE')
    expect(result).toContain('Marktwaarde: €800.000')
  })

  it('removes taxateur name lines matching "Firstname Lastname R.T."', () => {
    const input = 'Getaxeerd door:\nJan Janssen R.T.\nDatum: 01-03-2024'
    const result = cleanExtractedPdfText(input)
    expect(result).not.toMatch(/^Jan Janssen R\.T\.\s*$/m)
    expect(result).toContain('Datum: 01-03-2024')
  })
})

// ---------------------------------------------------------------------------
// Double-concatenation artefact removal
// ---------------------------------------------------------------------------
describe('cleanExtractedPdfText – double-concatenated line removal', () => {
  it('removes a line that is the same text twice in a row', () => {
    const input = 'Object: kantoorpand\nPagina 1 van 5Pagina 1 van 5\nLocatie: Amsterdam'
    const result = cleanExtractedPdfText(input)
    expect(result).not.toContain('Pagina 1 van 5Pagina 1 van 5')
    expect(result).toContain('Object: kantoorpand')
    expect(result).toContain('Locatie: Amsterdam')
  })

  it('does NOT remove a line where two halves differ', () => {
    const input = 'Huurinkomsten en kosten\nLocatie'
    const result = cleanExtractedPdfText(input)
    expect(result).toContain('Huurinkomsten en kosten')
    expect(result).toContain('Locatie')
  })
})

// ---------------------------------------------------------------------------
// Excessive blank line reduction
// ---------------------------------------------------------------------------
describe('cleanExtractedPdfText – excessive blank lines', () => {
  it('reduces 3+ consecutive blank lines to at most 2', () => {
    // 3 blank lines = \n\n\n\n (4 newlines) between content
    const input = 'Sectie A\n\n\n\n\nSectie B'
    const result = cleanExtractedPdfText(input)
    // Must not have more than 2 blank lines (3 blank lines = \n\n\n\n, i.e. 4 consecutive \n)
    expect(result).not.toMatch(/\n\n\n\n/)
    expect(result).toContain('Sectie A')
    expect(result).toContain('Sectie B')
  })

  it('keeps exactly 2 blank lines when there are 2', () => {
    // 2 blank lines = \n\n\n (3 newlines) between content – within the allowed max
    const input = 'Sectie A\n\n\nSectie B'
    const result = cleanExtractedPdfText(input)
    expect(result).toContain('Sectie A')
    expect(result).toContain('Sectie B')
    // 2 blank lines are allowed so \n\n\n should still be present
    expect(result).toMatch(/Sectie A\n\n\nSectie B/)
  })
})

// ---------------------------------------------------------------------------
// Multiple-spaces normalisation
// ---------------------------------------------------------------------------
describe('cleanExtractedPdfText – space normalisation', () => {
  it('collapses multiple spaces to a single space', () => {
    const input = 'Object:  kantoorpand   te  Amsterdam'
    const result = cleanExtractedPdfText(input)
    expect(result).toContain('Object: kantoorpand te Amsterdam')
  })

  it('does not modify single spaces', () => {
    const input = 'Marktwaarde: €500.000'
    const result = cleanExtractedPdfText(input)
    expect(result).toContain('Marktwaarde: €500.000')
  })
})

// ---------------------------------------------------------------------------
// Preservation of content lines
// ---------------------------------------------------------------------------
describe('cleanExtractedPdfText – content preservation', () => {
  it('keeps "B TAXATIE" section heading intact', () => {
    const result = cleanExtractedPdfText('B TAXATIE\nMarktwaarde: €500.000')
    expect(result).toContain('B TAXATIE')
  })

  it('keeps "Object" heading intact', () => {
    const result = cleanExtractedPdfText('Object\nKantoorpand te Amsterdam')
    expect(result).toContain('Object')
  })

  it('keeps "Waardering" heading intact', () => {
    const result = cleanExtractedPdfText('Waardering\nDe waarde bedraagt €1.200.000')
    expect(result).toContain('Waardering')
  })

  it('keeps "Locatie" heading intact', () => {
    const result = cleanExtractedPdfText('Locatie\nAmsterdam, Noord-Holland')
    expect(result).toContain('Locatie')
  })

  it('keeps "Gebruik" heading intact', () => {
    const result = cleanExtractedPdfText('Gebruik\nBedrijfspand, deels verhuurd')
    expect(result).toContain('Gebruik')
  })

  it('does not strip "Taxatierapport" when it appears inline in a sentence', () => {
    const input = 'Dit Taxatierapport is opgesteld conform NEN 2580.'
    const result = cleanExtractedPdfText(input)
    expect(result).toContain('Dit Taxatierapport is opgesteld conform NEN 2580.')
  })
})

// ---------------------------------------------------------------------------
// Combined realistic scenario
// ---------------------------------------------------------------------------
describe('cleanExtractedPdfText – realistic scenario', () => {
  it('cleans a multi-page excerpt correctly', () => {
    const input = [
      'Taxatierapport',
      'Printdatum: 15-04-2024',
      'Pagina 1 van 5',
      '',
      'A. Samenvatting',
      'Dit rapport is opgesteld door een gecertificeerd taxateur.',
      '',
      '',
      '',
      'Uitvoerend taxateur: Jan Jansen RT',
      'Waarde op: 01-04-2024',
      '',
      'B TAXATIE',
      'Marktwaarde: €800.000',
      'Pagina 2 van 5',
      'Taxatierapport',
      'Printdatum: 15-04-2024',
    ].join('\n')

    const result = cleanExtractedPdfText(input)

    // Noise removed
    expect(result).not.toMatch(/^Taxatierapport\s*$/m)
    expect(result).not.toMatch(/Printdatum:/i)
    expect(result).not.toMatch(/^Pagina \d+ van \d+\s*$/m)
    expect(result).not.toMatch(/Uitvoerend taxateur:/i)
    expect(result).not.toMatch(/^Waarde op:/m)

    // Content kept
    expect(result).toContain('A. Samenvatting')
    expect(result).toContain('Dit rapport is opgesteld door een gecertificeerd taxateur.')
    expect(result).toContain('B TAXATIE')
    expect(result).toContain('Marktwaarde: €800.000')

    // At most 2 consecutive blank lines (no 4+ consecutive newlines)
    expect(result).not.toMatch(/\n\n\n\n/)
  })
})
