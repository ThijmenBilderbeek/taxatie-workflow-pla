import { describe, it, expect } from 'vitest'
import {
  extractKeyValuePairs,
  normalizeLabel,
  cleanExtractedValue,
  extractFieldsFromChunks,
} from '../pdfKeyValueExtractor'
import type { TextChunk } from '../pdfTextChunker'

describe('normalizeLabel', () => {
  it('maps known labels to normalized keys', () => {
    expect(normalizeLabel('Marktwaarde kk afgerond')).toBe('marktwaarde_kk_afgerond')
    expect(normalizeLabel('Netto huurwaarde')).toBe('netto_huurwaarde')
    expect(normalizeLabel('Markthuur')).toBe('markthuur')
    expect(normalizeLabel('Walk Score 0-100')).toBe('walk_score')
    expect(normalizeLabel('Bebouwd oppervlak')).toBe('bebouwd_oppervlak')
    expect(normalizeLabel('Dakoppervlak van daken')).toBe('dakoppervlak')
    expect(normalizeLabel('Glasoppervlak')).toBe('glasoppervlak')
    expect(normalizeLabel('Bouwjaar')).toBe('bouwjaar')
    expect(normalizeLabel('Type object')).toBe('type_object')
    expect(normalizeLabel('Object score')).toBe('object_score')
    expect(normalizeLabel('Locatiescore')).toBe('locatie_score')
    expect(normalizeLabel('Courantheid verhuur')).toBe('courantheid_verhuur')
    expect(normalizeLabel('Courantheid verkoop')).toBe('courantheid_verkoop')
    expect(normalizeLabel('Verhuurtijd (maanden)')).toBe('verhuurtijd_maanden')
    expect(normalizeLabel('Verkooptijd (maanden)')).toBe('verkooptijd_maanden')
    expect(normalizeLabel('Marktwaarde per m²')).toBe('marktwaarde_per_m2')
  })

  it('is case-insensitive', () => {
    expect(normalizeLabel('bouwjaar')).toBe('bouwjaar')
    expect(normalizeLabel('BOUWJAAR')).toBe('bouwjaar')
    expect(normalizeLabel('MARKTHUUR')).toBe('markthuur')
  })

  it('handles extra whitespace', () => {
    expect(normalizeLabel('  Bouwjaar  ')).toBe('bouwjaar')
    expect(normalizeLabel('Type  object')).toBe('type_object')
  })

  it('returns null for unknown labels', () => {
    expect(normalizeLabel('Onbekend veld')).toBeNull()
    expect(normalizeLabel('')).toBeNull()
    expect(normalizeLabel('foo bar baz')).toBeNull()
  })
})

describe('cleanExtractedValue', () => {
  it('trims whitespace', () => {
    expect(cleanExtractedValue('  220.000  ')).toBe('220.000')
  })

  it('collapses multiple spaces', () => {
    expect(cleanExtractedValue('€  220.000')).toBe('€ 220.000')
  })

  it('removes leading/trailing stray punctuation', () => {
    expect(cleanExtractedValue(',220.000,')).toBe('220.000')
    expect(cleanExtractedValue(';Goed;')).toBe('Goed')
    expect(cleanExtractedValue('|waarde|')).toBe('waarde')
  })

  it('leaves normal values unchanged', () => {
    expect(cleanExtractedValue('Eigen gebruik')).toBe('Eigen gebruik')
    expect(cleanExtractedValue('€ 220.000')).toBe('€ 220.000')
    expect(cleanExtractedValue('4 maand(en)')).toBe('4 maand(en)')
  })
})

describe('extractKeyValuePairs', () => {
  it('extracts colon-separated labels', () => {
    const text = `Bouwjaar: 2025
Type object: Eigen gebruik
Object score: Goed
Locatiescore: Goed
Courantheid verhuur: Goed
Courantheid verkoop: Goed
Verhuurtijd (maanden): 4 maand(en)
Verkooptijd (maanden): 4 maand(en)`
    const pairs = extractKeyValuePairs(text)
    expect(pairs['bouwjaar']).toBe('2025')
    expect(pairs['type_object']).toBe('Eigen gebruik')
    expect(pairs['object_score']).toBe('Goed')
    expect(pairs['locatie_score']).toBe('Goed')
    expect(pairs['courantheid_verhuur']).toBe('Goed')
    expect(pairs['courantheid_verkoop']).toBe('Goed')
    expect(pairs['verhuurtijd_maanden']).toBe('4 maand(en)')
    expect(pairs['verkooptijd_maanden']).toBe('4 maand(en)')
  })

  it('extracts space-separated labels with euro amounts', () => {
    const text = `Marktwaarde kk afgerond € 220.000
Netto huurwaarde € 12.282
Markthuur € 14.000
Marktwaarde per m² € 2.215`
    const pairs = extractKeyValuePairs(text)
    expect(pairs['marktwaarde_kk_afgerond']).toBe('€ 220.000')
    expect(pairs['netto_huurwaarde']).toBe('€ 12.282')
    expect(pairs['markthuur']).toBe('€ 14.000')
    expect(pairs['marktwaarde_per_m2']).toBe('€ 2.215')
  })

  it('extracts space-separated labels with numeric values', () => {
    const text = `Bebouwd oppervlak 36
Dakoppervlak van daken 36
Glasoppervlak 10
Walk Score 0-100 24`
    const pairs = extractKeyValuePairs(text)
    expect(pairs['bebouwd_oppervlak']).toBe('36')
    expect(pairs['dakoppervlak']).toBe('36')
    expect(pairs['glasoppervlak']).toBe('10')
    expect(pairs['walk_score']).toBe('24')
  })

  it('handles multiple spaces (OCR/PDF-style spacing)', () => {
    const text = 'Bouwjaar:   2025'
    const pairs = extractKeyValuePairs(text)
    expect(pairs['bouwjaar']).toBe('2025')
  })

  it('returns empty object for empty text', () => {
    expect(extractKeyValuePairs('')).toEqual({})
    expect(extractKeyValuePairs('   \n  ')).toEqual({})
  })

  it('returns empty object when no recognized labels are present', () => {
    const text = 'Dit is een willekeurige zin zonder herkende labels.'
    expect(extractKeyValuePairs(text)).toEqual({})
  })

  it('does not produce duplicate keys (first match wins)', () => {
    const text = `Bouwjaar: 2024
Bouwjaar: 2025`
    const pairs = extractKeyValuePairs(text)
    expect(pairs['bouwjaar']).toBe('2024')
  })

  it('handles m2 variant in label', () => {
    const text = 'Marktwaarde per m2 € 2.215'
    const pairs = extractKeyValuePairs(text)
    expect(pairs['marktwaarde_per_m2']).toBe('€ 2.215')
  })
})

describe('extractFieldsFromChunks', () => {
  it('returns one result per chunk', () => {
    const chunks: TextChunk[] = [
      { sectionTitle: 'waardering', chunkIndex: 0, totalChunks: 2, content: 'Bouwjaar: 2020' },
      { sectionTitle: 'waardering', chunkIndex: 1, totalChunks: 2, content: 'Geen herkende velden hier.' },
    ]
    const results = extractFieldsFromChunks(chunks)
    expect(results).toHaveLength(2)
  })

  it('extracts fields from each chunk independently', () => {
    const chunks: TextChunk[] = [
      { sectionTitle: 'sec1', chunkIndex: 0, totalChunks: 1, content: 'Bouwjaar: 2022\nMarkthuur € 14.000' },
    ]
    const [res] = extractFieldsFromChunks(chunks)
    expect(res.extractedFields['bouwjaar']).toBe('2022')
    expect(res.extractedFields['markthuur']).toBe('€ 14.000')
  })

  it('preserves chunk metadata in result', () => {
    const chunks: TextChunk[] = [
      { sectionTitle: 'FULL_DOCUMENT', chunkIndex: 0, totalChunks: 1, content: 'Glasoppervlak 10' },
    ]
    const [res] = extractFieldsFromChunks(chunks)
    expect(res.sectionTitle).toBe('FULL_DOCUMENT')
    expect(res.chunkIndex).toBe(0)
    expect(res.totalChunks).toBe(1)
  })

  it('returns empty extractedFields for chunks with no matches', () => {
    const chunks: TextChunk[] = [
      { sectionTitle: 'sec1', chunkIndex: 0, totalChunks: 1, content: 'Geen herkenbare data hier.' },
    ]
    const [res] = extractFieldsFromChunks(chunks)
    expect(res.extractedFields).toEqual({})
  })

  it('handles empty chunks array', () => {
    expect(extractFieldsFromChunks([])).toEqual([])
  })
})
