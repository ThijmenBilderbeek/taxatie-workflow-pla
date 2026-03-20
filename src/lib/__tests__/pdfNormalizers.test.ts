import { describe, it, expect } from 'vitest'
import {
  normalizeDutchDate,
  normalizeEuro,
  normalizePercent,
  normalizeArea,
  compactWhitespace,
  cleanupLongFieldText,
  parseAddress,
  normalizeBooleanLike,
} from '../pdfNormalizers'

// ---------------------------------------------------------------------------
// normalizeDutchDate
// ---------------------------------------------------------------------------
describe('normalizeDutchDate', () => {
  it('converts DD-MM-YYYY format', () => {
    expect(normalizeDutchDate('15-03-2024')).toBe('2024-03-15')
  })

  it('converts D-M-YYYY format (no leading zeros)', () => {
    expect(normalizeDutchDate('7-11-2025')).toBe('2025-11-07')
  })

  it('converts Dutch long-form date with day-of-week prefix', () => {
    expect(normalizeDutchDate('vrijdag 7 november 2025')).toBe('2025-11-07')
  })

  it('converts Dutch long-form without day-of-week prefix', () => {
    expect(normalizeDutchDate('7 november 2025')).toBe('2025-11-07')
  })

  it('passes through ISO YYYY-MM-DD', () => {
    expect(normalizeDutchDate('2024-01-15')).toBe('2024-01-15')
  })

  it('handles other Dutch month names', () => {
    expect(normalizeDutchDate('3 januari 2023')).toBe('2023-01-03')
    expect(normalizeDutchDate('31 december 2022')).toBe('2022-12-31')
  })

  it('returns undefined for nonsense input', () => {
    expect(normalizeDutchDate('geen datum')).toBeUndefined()
  })

  it('handles date with slashes', () => {
    expect(normalizeDutchDate('07/11/2025')).toBe('2025-11-07')
  })
})

// ---------------------------------------------------------------------------
// normalizeEuro
// ---------------------------------------------------------------------------
describe('normalizeEuro', () => {
  it('strips € symbol and parses Dutch thousands separators', () => {
    expect(normalizeEuro('€ 4.332.360,-')).toBe(4332360)
  })

  it('handles no symbol', () => {
    expect(normalizeEuro('4332360')).toBe(4332360)
  })

  it('handles formatted without trailing -', () => {
    expect(normalizeEuro('€4.330.000')).toBe(4330000)
  })

  it('handles decimal comma', () => {
    expect(normalizeEuro('€ 1.250.000,00')).toBe(1250000)
  })

  it('handles short amounts', () => {
    expect(normalizeEuro('€ 352.951')).toBe(352951)
  })

  it('returns undefined for non-numeric', () => {
    expect(normalizeEuro('geen')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// normalizePercent
// ---------------------------------------------------------------------------
describe('normalizePercent', () => {
  it('converts Dutch percent with comma and space', () => {
    expect(normalizePercent('8,15 %')).toBe(8.15)
  })

  it('converts plain English format', () => {
    expect(normalizePercent('8.15%')).toBe(8.15)
  })

  it('converts bare comma decimal without %', () => {
    expect(normalizePercent('8,15')).toBe(8.15)
  })

  it('returns undefined for non-numeric', () => {
    expect(normalizePercent('geen')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// normalizeArea
// ---------------------------------------------------------------------------
describe('normalizeArea', () => {
  it('strips m² and Dutch thousands separators', () => {
    expect(normalizeArea('16.042 m²')).toBe(16042)
  })

  it('handles m2 variant', () => {
    expect(normalizeArea('16042 m2')).toBe(16042)
  })

  it('handles comma decimal with m²', () => {
    expect(normalizeArea('1.234,56 m²')).toBe(1234.56)
  })

  it('handles plain number', () => {
    expect(normalizeArea('2444')).toBe(2444)
  })
})

// ---------------------------------------------------------------------------
// compactWhitespace
// ---------------------------------------------------------------------------
describe('compactWhitespace', () => {
  it('collapses multiple spaces to single', () => {
    expect(compactWhitespace('hello   world')).toBe('hello world')
  })

  it('collapses newlines', () => {
    expect(compactWhitespace('line1\n\nline2')).toBe('line1 line2')
  })

  it('trims leading and trailing whitespace', () => {
    expect(compactWhitespace('  trimmed  ')).toBe('trimmed')
  })
})

// ---------------------------------------------------------------------------
// cleanupLongFieldText
// ---------------------------------------------------------------------------
describe('cleanupLongFieldText', () => {
  it('returns unchanged if within maxLength', () => {
    const short = 'hello world'
    expect(cleanupLongFieldText(short, 100)).toBe('hello world')
  })

  it('truncates at sentence boundary', () => {
    const text = 'First sentence. Second sentence. Third sentence.'
    const result = cleanupLongFieldText(text, 30)
    expect(result).toBe('First sentence.')
  })

  it('truncates at word boundary when no sentence boundary', () => {
    const text = 'This is a long text without a period that exceeds the limit'
    const result = cleanupLongFieldText(text, 25)
    expect(result.length).toBeLessThanOrEqual(25)
    expect(result).not.toContain('  ')
  })
})

// ---------------------------------------------------------------------------
// parseAddress
// ---------------------------------------------------------------------------
describe('parseAddress', () => {
  it('parses simple Dutch address with comma', () => {
    const result = parseAddress('Columbusweg 13, 5928LA Venlo')
    expect(result).toBeDefined()
    expect(result!.straat).toBe('Columbusweg')
    expect(result!.huisnummer).toBe('13')
    expect(result!.postcode).toBe('5928LA')
    expect(result!.plaats).toBe('Venlo')
  })

  it('parses address with space in postcode', () => {
    const result = parseAddress('Columbusweg 13 5928 LA Venlo')
    expect(result).toBeDefined()
    expect(result!.postcode).toBe('5928LA')
  })

  it('strips noise words before address', () => {
    const result = parseAddress('TAXATIERAPPORT Columbusweg 13 5928LA Venlo')
    expect(result).toBeDefined()
    expect(result!.straat).toBe('Columbusweg')
  })

  it('returns undefined when no postcode found', () => {
    expect(parseAddress('Geen adres te vinden hier')).toBeUndefined()
  })

  it('handles huisnummer with addition', () => {
    const result = parseAddress('Herengracht 13A 1234AB Amsterdam')
    expect(result).toBeDefined()
    expect(result!.huisnummer).toBe('13A')
  })
})

// ---------------------------------------------------------------------------
// normalizeBooleanLike
// ---------------------------------------------------------------------------
describe('normalizeBooleanLike', () => {
  it('returns true for "Ja"', () => {
    expect(normalizeBooleanLike('Ja')).toBe(true)
  })

  it('returns true for "Aanwezig"', () => {
    expect(normalizeBooleanLike('Aanwezig')).toBe(true)
  })

  it('returns false for "Nee"', () => {
    expect(normalizeBooleanLike('Nee')).toBe(false)
  })

  it('returns false for "Geen"', () => {
    expect(normalizeBooleanLike('Geen')).toBe(false)
  })

  it('returns false for "Niet aanwezig"', () => {
    expect(normalizeBooleanLike('Niet aanwezig')).toBe(false)
  })

  it('returns unknown for "Onbekend"', () => {
    expect(normalizeBooleanLike('Onbekend')).toBe('unknown')
  })

  it('returns unknown for "N.v.t."', () => {
    expect(normalizeBooleanLike('N.v.t.')).toBe('unknown')
  })

  it('returns unknown for "Niet van toepassing"', () => {
    expect(normalizeBooleanLike('Niet van toepassing')).toBe('unknown')
  })

  it('returns unknown for "Niet onderzocht"', () => {
    expect(normalizeBooleanLike('Niet onderzocht')).toBe('unknown')
  })

  it('is case-insensitive', () => {
    expect(normalizeBooleanLike('JA')).toBe(true)
    expect(normalizeBooleanLike('nee')).toBe(false)
  })
})
