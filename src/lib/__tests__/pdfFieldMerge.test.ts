import { describe, it, expect } from 'vitest'
import {
  mergeFieldCandidates,
  normalizeCanonicalAddress,
  SOURCE_PRIORITY,
  type FieldCandidate,
} from '../pdfFieldMerge'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function candidate(
  field: string,
  value: unknown,
  source: FieldCandidate['source'],
  confidence: FieldCandidate['confidence'] = 'high',
): FieldCandidate {
  return {
    field,
    value,
    source,
    confidence,
    priority: SOURCE_PRIORITY[source],
  }
}

// ---------------------------------------------------------------------------
// SOURCE_PRIORITY constants
// ---------------------------------------------------------------------------

describe('SOURCE_PRIORITY constants', () => {
  it('exact_label has highest priority (300)', () => {
    expect(SOURCE_PRIORITY.exact_label).toBe(300)
  })

  it('heading_block is second (250)', () => {
    expect(SOURCE_PRIORITY.heading_block).toBe(250)
  })

  it('chunk_rule is third (200)', () => {
    expect(SOURCE_PRIORITY.chunk_rule).toBe(200)
  })

  it('ai is fourth (100)', () => {
    expect(SOURCE_PRIORITY.ai).toBe(100)
  })

  it('appendix_ai is lowest (25)', () => {
    expect(SOURCE_PRIORITY.appendix_ai).toBe(25)
  })

  it('all priorities are strictly ordered', () => {
    const { exact_label, heading_block, chunk_rule, ai, appendix_ai } = SOURCE_PRIORITY
    expect(exact_label).toBeGreaterThan(heading_block)
    expect(heading_block).toBeGreaterThan(chunk_rule)
    expect(chunk_rule).toBeGreaterThan(ai)
    expect(ai).toBeGreaterThan(appendix_ai)
  })
})

// ---------------------------------------------------------------------------
// mergeFieldCandidates — basic scalar fields
// ---------------------------------------------------------------------------

describe('mergeFieldCandidates — scalar fields', () => {
  it('returns empty object for no candidates', () => {
    expect(mergeFieldCandidates([])).toEqual({})
  })

  it('returns single candidate when only one is provided', () => {
    const c = candidate('netto_huurwaarde', 98885, 'exact_label')
    const result = mergeFieldCandidates([c])
    expect(result['netto_huurwaarde']?.value).toBe(98885)
    expect(result['netto_huurwaarde']?.source).toBe('exact_label')
  })

  it('rule-based (exact_label) beats AI for scalar fields', () => {
    const ruleCandidate  = candidate('netto_huurwaarde', 98885, 'exact_label')
    const aiCandidate    = candidate('netto_huurwaarde', 95000, 'ai')
    const result = mergeFieldCandidates([ruleCandidate, aiCandidate])
    expect(result['netto_huurwaarde']?.value).toBe(98885)
    expect(result['netto_huurwaarde']?.source).toBe('exact_label')
  })

  it('rule-based (exact_label) beats AI even when AI candidate appears first', () => {
    const aiCandidate   = candidate('object_score', 'Voldoende', 'ai')
    const ruleCandidate = candidate('object_score', 'Goed',      'exact_label')
    const result = mergeFieldCandidates([aiCandidate, ruleCandidate])
    expect(result['object_score']?.value).toBe('Goed')
    expect(result['object_score']?.source).toBe('exact_label')
  })

  it('netto_huurwaarde from exact_label beats AI value', () => {
    const candidates = [
      candidate('netto_huurwaarde', 90000, 'ai', 'medium'),
      candidate('netto_huurwaarde', 98885, 'exact_label', 'high'),
    ]
    const result = mergeFieldCandidates(candidates)
    expect(result['netto_huurwaarde']?.value).toBe(98885)
    expect(result['netto_huurwaarde']?.source).toBe('exact_label')
  })

  it('object_score from exact_label beats AI value', () => {
    const candidates = [
      candidate('object_score', 'Redelijk', 'ai', 'medium'),
      candidate('object_score', 'Goed',     'exact_label', 'high'),
    ]
    const result = mergeFieldCandidates(candidates)
    expect(result['object_score']?.value).toBe('Goed')
    expect(result['object_score']?.source).toBe('exact_label')
  })

  it('heading_block beats AI for scalar fields', () => {
    const result = mergeFieldCandidates([
      candidate('marktwaarde_per_m2', 1522, 'heading_block', 'high'),
      candidate('marktwaarde_per_m2', 1600, 'ai', 'medium'),
    ])
    expect(result['marktwaarde_per_m2']?.value).toBe(1522)
  })

  it('chunk_rule beats ai but loses to exact_label', () => {
    const result = mergeFieldCandidates([
      candidate('energielabel', 'A', 'chunk_rule', 'medium'),
      candidate('energielabel', 'B', 'ai', 'medium'),
      candidate('energielabel', 'C', 'exact_label', 'high'),
    ])
    expect(result['energielabel']?.value).toBe('C')
    expect(result['energielabel']?.source).toBe('exact_label')
  })

  it('discards non-meaningful candidates (null, empty string)', () => {
    const result = mergeFieldCandidates([
      candidate('object_type', null, 'exact_label'),
      candidate('object_type', 'kantoor', 'ai'),
    ])
    expect(result['object_type']?.value).toBe('kantoor')
  })

  it('discards placeholder values (onbekend, -)', () => {
    const result = mergeFieldCandidates([
      candidate('locatie_score', 'onbekend', 'exact_label'),
      candidate('locatie_score', 'Goed',     'ai'),
    ])
    expect(result['locatie_score']?.value).toBe('Goed')
  })
})

// ---------------------------------------------------------------------------
// mergeFieldCandidates — appendix_ai
// ---------------------------------------------------------------------------

describe('mergeFieldCandidates — appendix_ai never beats non-appendix', () => {
  it('appendix_ai loses to exact_label', () => {
    const result = mergeFieldCandidates([
      candidate('adres', 'Bijlage Straat 1, 1234AB, Bijlagen', 'appendix_ai'),
      candidate('adres', 'Collse Hoefdijk, 16, 5674VK, Nuenen', 'exact_label'),
    ])
    expect(result['adres']?.value).toBe('Collse Hoefdijk, 16, 5674VK, Nuenen')
    expect(result['adres']?.source).toBe('exact_label')
  })

  it('appendix_ai loses to ai (same confidence)', () => {
    const result = mergeFieldCandidates([
      candidate('object_type', 'woning',  'appendix_ai', 'low'),
      candidate('object_type', 'kantoor', 'ai',          'medium'),
    ])
    expect(result['object_type']?.value).toBe('kantoor')
    expect(result['object_type']?.source).toBe('ai')
  })

  it('appendix_ai also loses to chunk_rule', () => {
    const result = mergeFieldCandidates([
      candidate('energielabel', 'G', 'appendix_ai', 'low'),
      candidate('energielabel', 'A', 'chunk_rule',  'medium'),
    ])
    expect(result['energielabel']?.value).toBe('A')
  })

  it('appendix_ai wins when it is the only meaningful candidate', () => {
    const result = mergeFieldCandidates([
      candidate('vloeroppervlak_bvo', null, 'exact_label'),
      candidate('vloeroppervlak_bvo', 850,  'appendix_ai'),
    ])
    expect(result['vloeroppervlak_bvo']?.value).toBe(850)
  })

  it('object_type "kantoor" from strong source beats "woning" from appendix_ai', () => {
    const result = mergeFieldCandidates([
      candidate('object_type', 'woning',  'appendix_ai', 'low'),
      candidate('object_type', 'kantoor', 'exact_label', 'high'),
    ])
    expect(result['object_type']?.value).toBe('kantoor')
  })
})

// ---------------------------------------------------------------------------
// mergeFieldCandidates — confidence tie-breaking
// ---------------------------------------------------------------------------

describe('mergeFieldCandidates — confidence tie-breaking', () => {
  it('prefers high confidence over medium when priority is equal', () => {
    const result = mergeFieldCandidates([
      candidate('marktwaarde_per_m2', 1400, 'ai', 'medium'),
      candidate('marktwaarde_per_m2', 1522, 'ai', 'high'),
    ])
    expect(result['marktwaarde_per_m2']?.value).toBe(1522)
  })

  it('prefers medium over low confidence at same priority', () => {
    const result = mergeFieldCandidates([
      candidate('locatie_score', 'Matig', 'appendix_ai', 'low'),
      candidate('locatie_score', 'Goed',  'appendix_ai', 'medium'),
    ])
    expect(result['locatie_score']?.value).toBe('Goed')
  })

  it('uses stability preference when priority and confidence are equal', () => {
    // First candidate seen should win (stability)
    const result = mergeFieldCandidates([
      candidate('bouwjaar', 2000, 'ai', 'medium'),
      candidate('bouwjaar', 2005, 'ai', 'medium'),
    ])
    expect(result['bouwjaar']?.value).toBe(2000)
  })
})

// ---------------------------------------------------------------------------
// mergeFieldCandidates — SWOT arrays always combined
// ---------------------------------------------------------------------------

describe('mergeFieldCandidates — SWOT fields', () => {
  it('SWOT fields from AI are present when rule-based is absent', () => {
    const result = mergeFieldCandidates([
      candidate('swot_sterktes', ['Goede locatie', 'Nieuwbouw'], 'ai'),
    ])
    expect(result['swot_sterktes']?.value).toEqual(['Goede locatie', 'Nieuwbouw'])
  })

  it('SWOT arrays from multiple sources are combined without duplicates', () => {
    const result = mergeFieldCandidates([
      candidate('swot_sterktes', ['Goede locatie', 'Nieuwbouw'], 'heading_block'),
      candidate('swot_sterktes', ['Nieuwbouw', 'Moderne uitstraling'], 'ai'),
    ])
    const val = result['swot_sterktes']?.value as string[]
    expect(val).toContain('Goede locatie')
    expect(val).toContain('Nieuwbouw')
    expect(val).toContain('Moderne uitstraling')
    // No duplicates
    expect(val.filter((v) => v === 'Nieuwbouw').length).toBe(1)
  })

  it('SWOT fields still come from AI when rule-based is absent', () => {
    // No rule-based (exact_label/heading_block) candidates; AI fills it
    const result = mergeFieldCandidates([
      candidate('swot_bedreigingen', ['Leegstandsrisico'], 'ai', 'medium'),
    ])
    expect(result['swot_bedreigingen']?.value).toEqual(['Leegstandsrisico'])
  })

  it('combines string SWOT value from rule-based with array from AI', () => {
    const result = mergeFieldCandidates([
      candidate('swot_zwaktes', 'Ouder gebouw\nBeperkt parkeren', 'heading_block'),
      candidate('swot_zwaktes', ['Beperkt parkeren', 'Hoge onderhoudskosten'], 'ai'),
    ])
    const val = result['swot_zwaktes']?.value as string[]
    expect(val).toContain('Ouder gebouw')
    expect(val).toContain('Beperkt parkeren')
    expect(val).toContain('Hoge onderhoudskosten')
    expect(val.filter((v) => v === 'Beperkt parkeren').length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// normalizeCanonicalAddress
// ---------------------------------------------------------------------------

describe('normalizeCanonicalAddress', () => {
  it('returns empty string unchanged', () => {
    expect(normalizeCanonicalAddress('')).toBe('')
  })

  it('returns clean address unchanged', () => {
    const clean = 'Collse Hoefdijk, 16, 5674VK, Nuenen'
    // May or may not be changed by the function, but result must still contain postcode
    const result = normalizeCanonicalAddress(clean)
    expect(result).toContain('5674VK')
  })

  it('strips leading evaluation word "Goed"', () => {
    const input = 'Goed Collse Hoefdijk, 16, 5674VK, Nuenen'
    const result = normalizeCanonicalAddress(input)
    expect(result).not.toMatch(/^Goed\s/)
    expect(result).toContain('Collse Hoefdijk')
    expect(result).toContain('5674VK')
  })

  it('strips pipe-prefixed city fragment "| Eindhoven"', () => {
    const input = '| Eindhoven Collse Hoefdijk, 16, 5674VK, Nuenen'
    const result = normalizeCanonicalAddress(input)
    expect(result).not.toMatch(/^\|/)
    expect(result).not.toMatch(/^Eindhoven\s/)
    expect(result).toContain('5674VK')
  })

  it('strips "Verhuurbare eenheid" prefix', () => {
    const input = 'Verhuurbare eenheid Collse Hoefdijk, 16, 5674VK, Nuenen'
    const result = normalizeCanonicalAddress(input)
    expect(result).not.toMatch(/^Verhuurbare eenheid/i)
    expect(result).toContain('5674VK')
  })

  it('strips "bij EP-online." sentence fragment', () => {
    const input = 'bij EP-online. Collse Hoefdijk, 16, 5674VK, Nuenen'
    const result = normalizeCanonicalAddress(input)
    expect(result).not.toMatch(/^bij EP-online/i)
    expect(result).toContain('Collse Hoefdijk')
    expect(result).toContain('5674VK')
  })

  it('strips leading "Redelijk" evaluation word', () => {
    const input = 'Redelijk Industrieweg, 42, 5482TK, Schijndel'
    const result = normalizeCanonicalAddress(input)
    expect(result).not.toMatch(/^Redelijk\s/i)
    expect(result).toContain('5482TK')
  })

  it('address without postcode returns stripped result', () => {
    const input = 'Goed Hoofdstraat 12 Amsterdam'
    const result = normalizeCanonicalAddress(input)
    // Should still strip the leading word
    expect(result).not.toMatch(/^Goed\s/)
  })

  it('clean address with postcode is not modified adversely', () => {
    const input = 'Kerkstraat 5, 1234AB, Teststad'
    const result = normalizeCanonicalAddress(input)
    expect(result).toContain('1234AB')
    expect(result).toContain('Kerkstraat')
  })
})
