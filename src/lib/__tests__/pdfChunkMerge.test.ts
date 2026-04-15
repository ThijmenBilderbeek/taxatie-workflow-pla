import { describe, it, expect } from 'vitest'
import {
  isMeaningfulValue,
  getFieldPriority,
  mergeFieldValue,
  mergeExtractionResults,
  type ChunkExtractionResult,
  type FieldSourceMeta,
} from '../pdfChunkAIExtractor'

// ---------------------------------------------------------------------------
// isMeaningfulValue
// ---------------------------------------------------------------------------

describe('isMeaningfulValue', () => {
  it('returns false for null and undefined', () => {
    expect(isMeaningfulValue(null)).toBe(false)
    expect(isMeaningfulValue(undefined)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isMeaningfulValue('')).toBe(false)
    expect(isMeaningfulValue('   ')).toBe(false)
  })

  it('returns false for placeholder strings', () => {
    expect(isMeaningfulValue('onbekend')).toBe(false)
    expect(isMeaningfulValue('-')).toBe(false)
    expect(isMeaningfulValue('n.v.t.')).toBe(false)
    expect(isMeaningfulValue('nvt')).toBe(false)
    expect(isMeaningfulValue('niet beschikbaar')).toBe(false)
    expect(isMeaningfulValue('geen')).toBe(false)
  })

  it('returns true for real strings', () => {
    expect(isMeaningfulValue('€ 220.000')).toBe(true)
    expect(isMeaningfulValue('2025')).toBe(true)
    expect(isMeaningfulValue('Nieuwbouw')).toBe(true)
  })

  it('returns false for infinite / NaN numbers', () => {
    expect(isMeaningfulValue(Infinity)).toBe(false)
    expect(isMeaningfulValue(NaN)).toBe(false)
  })

  it('returns true for finite numbers including 0', () => {
    expect(isMeaningfulValue(0)).toBe(true)
    expect(isMeaningfulValue(220000)).toBe(true)
  })

  it('returns false for empty arrays', () => {
    expect(isMeaningfulValue([])).toBe(false)
    expect(isMeaningfulValue(['', '   '])).toBe(false)
  })

  it('returns true for non-empty string arrays', () => {
    expect(isMeaningfulValue(['Goede ligging'])).toBe(true)
    expect(isMeaningfulValue(['', 'Moderne uitstraling'])).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getFieldPriority
// ---------------------------------------------------------------------------

describe('getFieldPriority', () => {
  it('gives rule_based higher priority than ai', () => {
    const rb = getFieldPriority('bouwjaar', 'rule_based', 'samenvatting')
    const ai = getFieldPriority('bouwjaar', 'ai', 'samenvatting')
    expect(rb).toBeGreaterThan(ai)
  })

  it('gives priority fields a bonus for rule_based', () => {
    const normal = getFieldPriority('adres', 'rule_based', 'samenvatting')
    const priority = getFieldPriority('marktwaarde_kk_afgerond', 'rule_based', 'samenvatting')
    expect(priority).toBeGreaterThan(normal)
  })

  it('gives ai from specific section higher priority than ai from FULL_DOCUMENT', () => {
    const specific = getFieldPriority('bouwjaar', 'ai', 'B. Objectomschrijving')
    const fullDoc = getFieldPriority('bouwjaar', 'ai', 'FULL_DOCUMENT')
    expect(specific).toBeGreaterThan(fullDoc)
  })

  it('gives combined the same tier as rule_based', () => {
    const combined = getFieldPriority('energielabel', 'combined', 'samenvatting')
    const rb = getFieldPriority('energielabel', 'rule_based', 'samenvatting')
    expect(combined).toBe(rb)
  })
})

// ---------------------------------------------------------------------------
// mergeFieldValue
// ---------------------------------------------------------------------------

const metaRuleBased: FieldSourceMeta = {
  sectionTitle: 'samenvatting',
  chunkIndex: 0,
  extractionType: 'rule_based',
}
const metaAI: FieldSourceMeta = {
  sectionTitle: 'samenvatting',
  chunkIndex: 1,
  extractionType: 'ai',
}

describe('mergeFieldValue — scalar fields', () => {
  it('returns incoming when existing is undefined', () => {
    const { value } = mergeFieldValue(undefined, undefined, '2025', metaAI, 'bouwjaar')
    expect(value).toBe('2025')
  })

  it('ignores non-meaningful incoming', () => {
    const { value } = mergeFieldValue('2025', metaRuleBased, '', metaAI, 'bouwjaar')
    expect(value).toBe('2025')
  })

  it('ignores placeholder incoming values', () => {
    const { value } = mergeFieldValue('2025', metaRuleBased, 'onbekend', metaAI, 'bouwjaar')
    expect(value).toBe('2025')
  })

  it('rule_based beats AI for the same field', () => {
    const { value, conflict } = mergeFieldValue('€ 220.000', metaRuleBased, '€ 225.000', metaAI, 'marktwaarde_kk_afgerond')
    expect(value).toBe('€ 220.000')
    // Conflict must be logged (values differ)
    expect(conflict).toBeDefined()
    expect(conflict!.chosenValue).toBe('€ 220.000')
  })

  it('AI wins when existing is empty string', () => {
    const { value } = mergeFieldValue('', metaAI, '€ 225.000', metaAI, 'marktwaarde')
    expect(value).toBe('€ 225.000')
  })

  it('no conflict logged when values are identical', () => {
    const { conflict } = mergeFieldValue('2025', metaRuleBased, '2025', metaAI, 'bouwjaar')
    expect(conflict).toBeUndefined()
  })
})

describe('mergeFieldValue — SWOT fields', () => {
  it('combines two string[] arrays without duplicates', () => {
    const a = ['Nieuwbouw', 'Goede bereikbaarheid']
    const b = ['Goede bereikbaarheid', 'Moderne uitstraling']
    const { value } = mergeFieldValue(a, metaAI, b, metaAI, 'swot_sterktes')
    expect(value).toEqual(['Nieuwbouw', 'Goede bereikbaarheid', 'Moderne uitstraling'])
  })

  it('handles string existing + array incoming', () => {
    const { value } = mergeFieldValue(
      'Goede ligging\nNieuwbouw',
      metaAI,
      ['Moderne uitstraling'],
      metaAI,
      'swot_sterktes',
    )
    expect(value).toEqual(['Goede ligging', 'Nieuwbouw', 'Moderne uitstraling'])
  })

  it('preserves order: existing items first', () => {
    const { value } = mergeFieldValue(
      ['A', 'B'],
      metaAI,
      ['C', 'A'],
      metaAI,
      'swot_zwaktes',
    )
    expect(value).toEqual(['A', 'B', 'C'])
  })
})

// ---------------------------------------------------------------------------
// mergeExtractionResults
// ---------------------------------------------------------------------------

describe('mergeExtractionResults', () => {
  it('merges rule_based and AI results with rule_based taking priority', () => {
    const results: ChunkExtractionResult[] = [
      {
        sectionTitle: 'chunk A',
        chunkIndex: 0,
        totalChunks: 2,
        extractionType: 'rule_based',
        extractedFields: { marktwaarde_kk_afgerond: '€ 220.000', bouwjaar: '2025' },
      },
      {
        sectionTitle: 'chunk B',
        chunkIndex: 1,
        totalChunks: 2,
        extractionType: 'ai',
        extractedFields: { marktwaarde_kk_afgerond: '€ 225.000', energielabel: 'A' },
      },
    ]

    const { fields, conflicts } = mergeExtractionResults(results)

    // Rule-based wins for marktwaarde_kk_afgerond
    expect(fields['marktwaarde_kk_afgerond']).toBe('€ 220.000')
    // bouwjaar only from rule_based
    expect(fields['bouwjaar']).toBe('2025')
    // energielabel only from AI
    expect(fields['energielabel']).toBe('A')
    // Conflict logged for marktwaarde_kk_afgerond
    expect(conflicts.some((c) => c.fieldName === 'marktwaarde_kk_afgerond')).toBe(true)
  })

  it('preserves existing non-empty value when incoming is empty', () => {
    const results: ChunkExtractionResult[] = [
      {
        sectionTitle: 'chunk A',
        chunkIndex: 0,
        totalChunks: 2,
        extractionType: 'ai',
        extractedFields: { bouwjaar: '2025' },
      },
      {
        sectionTitle: 'chunk B',
        chunkIndex: 1,
        totalChunks: 2,
        extractionType: 'ai',
        extractedFields: { bouwjaar: '' },
      },
    ]

    const { fields } = mergeExtractionResults(results)
    expect(fields['bouwjaar']).toBe('2025')
  })

  it('combines SWOT arrays across chunks without duplicates', () => {
    const results: ChunkExtractionResult[] = [
      {
        sectionTitle: 'chunk A',
        chunkIndex: 0,
        totalChunks: 2,
        extractionType: 'ai',
        extractedFields: { swot_sterktes: ['Nieuwbouw', 'Goede bereikbaarheid'] },
      },
      {
        sectionTitle: 'chunk B',
        chunkIndex: 1,
        totalChunks: 2,
        extractionType: 'ai',
        extractedFields: { swot_sterktes: ['Goede bereikbaarheid', 'Moderne uitstraling'] },
      },
    ]

    const { fields } = mergeExtractionResults(results)
    expect(fields['swot_sterktes']).toEqual(['Nieuwbouw', 'Goede bereikbaarheid', 'Moderne uitstraling'])
  })

  it('returns correct sourceMeta for each field', () => {
    const results: ChunkExtractionResult[] = [
      {
        sectionTitle: 'secA',
        chunkIndex: 0,
        totalChunks: 1,
        extractionType: 'rule_based',
        extractedFields: { bouwjaar: '2025' },
      },
    ]

    const { sourceMeta } = mergeExtractionResults(results)
    expect(sourceMeta['bouwjaar']).toMatchObject({
      sectionTitle: 'secA',
      chunkIndex: 0,
      extractionType: 'rule_based',
    })
  })

  it('processes chunks in ascending chunkIndex order', () => {
    // chunk 1 (AI, higher index) provides value first; chunk 0 (AI) should win
    const results: ChunkExtractionResult[] = [
      {
        sectionTitle: 'chunk B',
        chunkIndex: 1,
        totalChunks: 2,
        extractionType: 'ai',
        extractedFields: { adres: 'Latere straat 99' },
      },
      {
        sectionTitle: 'chunk A',
        chunkIndex: 0,
        totalChunks: 2,
        extractionType: 'ai',
        extractedFields: { adres: 'Eerste straat 1' },
      },
    ]

    const { fields } = mergeExtractionResults(results)
    // chunk 0 is processed first → wins at equal priority (stability preference)
    expect(fields['adres']).toBe('Eerste straat 1')
  })

  it('returns empty results for empty input', () => {
    const { fields, sourceMeta, conflicts } = mergeExtractionResults([])
    expect(fields).toEqual({})
    expect(sourceMeta).toEqual({})
    expect(conflicts).toEqual([])
  })

  it('does not crash when values are null or undefined in extractedFields', () => {
    const results: ChunkExtractionResult[] = [
      {
        sectionTitle: 'chunk A',
        chunkIndex: 0,
        totalChunks: 1,
        extractionType: 'ai',
        extractedFields: { bouwjaar: null as unknown as string },
      },
    ]
    expect(() => mergeExtractionResults(results)).not.toThrow()
  })
})
