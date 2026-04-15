import { describe, it, expect, vi } from 'vitest'

// Mock the Supabase client to avoid requiring env vars in tests
vi.mock('../supabaseClient', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
  },
}))

import { getRelevantTextForFields } from '../pdfAIExtractor'

// MIN_SECTION_LENGTH_THRESHOLD is 500 — sections must be at least this combined
// to avoid the volledig fallback. Use padding to ensure we exceed the threshold.
const PAD = ' x'.repeat(260) // ~520 chars padding

describe('getRelevantTextForFields', () => {
  it('selects correct sections for waardering fields', () => {
    const rapportTeksten = {
      volledig: 'Volledig rapport tekst hier.',
      waardering: 'De marktwaarde is €1.000.000. BAR is 7%.' + PAD,
      samenvatting: 'Samenvatting van het rapport.' + PAD,
      locatie: 'Het object ligt in Amsterdam.',
    }

    const { text } = getRelevantTextForFields(rapportTeksten, ['marktwaarde', 'bar'])

    expect(text).toContain('marktwaarde is €1.000.000')
    expect(text).toContain('Samenvatting van het rapport')
    // locatie is not relevant for waardering fields
    expect(text).not.toContain('Amsterdam')
  })

  it('always includes samenvatting even when fields only map to other sections', () => {
    const rapportTeksten = {
      volledig: 'Volledig rapport.',
      technisch: 'De bouwkundige staat is goed.' + PAD,
      samenvatting: 'Korte samenvatting van het object.' + PAD,
    }

    const { text } = getRelevantTextForFields(rapportTeksten, ['bouwjaar'])

    expect(text).toContain('bouwkundige staat')
    expect(text).toContain('Korte samenvatting')
  })

  it('falls back to volledig when no sections match or content is too short', () => {
    const fullText = 'Dit is de volledige tekst van het rapport. '.repeat(20)
    const rapportTeksten = {
      volledig: fullText,
    }

    const { text } = getRelevantTextForFields(rapportTeksten, ['marktwaarde'])

    expect(text).toContain('volledige tekst')
  })

  it('truncates when total text exceeds MAX_TEXT_CHARS', () => {
    // Create very long sections that together exceed 30000 characters (MAX_TEXT_CHARS)
    const longSection = 'A'.repeat(20000)
    const anotherLongSection = 'B'.repeat(20000)
    const rapportTeksten = {
      volledig: longSection + anotherLongSection,
      waardering: longSection,
      samenvatting: anotherLongSection,
    }

    const { text, truncated } = getRelevantTextForFields(rapportTeksten, ['marktwaarde'])

    expect(truncated).toBe(true)
    // Max length: MAX_TEXT_CHARS (30000) + section separator (\n\n---\n\n = 7 chars) + ellipsis (1 char)
    expect(text.length).toBeLessThanOrEqual(30008)
  })

  it('handles missing section keys gracefully', () => {
    const rapportTeksten = {
      volledig: 'Dit is het volledige rapport met voldoende tekst om de drempel te overschrijden. '.repeat(10),
      samenvatting: 'Samenvatting tekst hier. '.repeat(30),
    }

    // duurzaamheid key does not exist in rapportTeksten
    expect(() =>
      getRelevantTextForFields(rapportTeksten, ['energielabel'])
    ).not.toThrow()

    const { text } = getRelevantTextForFields(rapportTeksten, ['energielabel'])
    // Should still return content from samenvatting (always included)
    expect(text).toContain('Samenvatting tekst')
  })
})
