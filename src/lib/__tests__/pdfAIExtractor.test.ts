import { describe, it, expect, vi } from 'vitest'

// Mock the Supabase client to avoid requiring env vars in tests
vi.mock('../supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}))

import { getRelevantTextForFields, aiExtractMissingFields } from '../pdfAIExtractor'
import { supabase } from '../supabaseClient'

// MIN_SECTION_LENGTH_THRESHOLD is 500 — use padding to exceed it
const PAD = ' x'.repeat(260) // ~520 chars

// ─── getRelevantTextForFields — new stap9/SWOT fields ──────────────────────────

describe('getRelevantTextForFields — stap9/SWOT sections', () => {
  it('selects swot section for SWOT fields', () => {
    const rapportTeksten = {
      volledig: 'volledig tekst',
      swot: 'STERKTES: Goede ligging. ZWAKTES: Oud dak.' + PAD,
      samenvatting: 'Samenvatting.' + PAD,
      aannames: 'Aannames tekst.',
    }

    const { text } = getRelevantTextForFields(rapportTeksten, ['swotSterktes', 'swotZwaktes'])

    expect(text).toContain('Goede ligging')
    expect(text).toContain('Oud dak')
    // aannames is not relevant for SWOT fields
    expect(text).not.toContain('Aannames tekst')
  })

  it('selects aannames section for aannames/voorbehouden fields', () => {
    const rapportTeksten = {
      volledig: 'volledig tekst',
      aannames: 'Aannames: vrij van hypotheek. Voorbehouden: conform NVM.' + PAD,
      samenvatting: 'Samenvatting.' + PAD,
      swot: 'SWOT data hier.',
    }

    const { text } = getRelevantTextForFields(rapportTeksten, ['aannames', 'voorbehouden'])

    expect(text).toContain('vrij van hypotheek')
    expect(text).toContain('conform NVM')
    // swot is not relevant for aannames fields
    expect(text).not.toContain('SWOT data hier')
  })

  it('selects aannames section for bijzondereUitgangspunten', () => {
    const rapportTeksten = {
      volledig: 'volledig tekst',
      aannames: 'Bijzondere uitgangspunten: eigendom vrij en onbelast.' + PAD,
      samenvatting: 'Samenvatting.' + PAD,
    }

    const { text } = getRelevantTextForFields(rapportTeksten, ['bijzondereUitgangspunten'])

    expect(text).toContain('eigendom vrij en onbelast')
  })

  it('selects aannames and waardering sections for taxatieOnnauwkeurigheid', () => {
    const rapportTeksten = {
      volledig: 'volledig tekst',
      aannames: 'Onzekerheidsmarge: ±5%.' + PAD,
      waardering: 'Marktwaarde is €500.000.' + PAD,
      samenvatting: 'Samenvatting.' + PAD,
      swot: 'SWOT hier.',
    }

    const { text } = getRelevantTextForFields(rapportTeksten, ['taxatieOnnauwkeurigheid'])

    expect(text).toContain('Onzekerheidsmarge')
    expect(text).toContain('Marktwaarde is')
    // swot is not relevant
    expect(text).not.toContain('SWOT hier')
  })

  it('selects swot section for all SWOT sub-fields', () => {
    const rapportTeksten = {
      volledig: 'volledig tekst',
      swot: 'Kansen: groeimarkt. Bedreigingen: stijgende rente.' + PAD,
      samenvatting: 'Samenvatting.' + PAD,
    }

    const { text } = getRelevantTextForFields(rapportTeksten, ['swotKansen', 'swotBedreigingen'])

    expect(text).toContain('groeimarkt')
    expect(text).toContain('stijgende rente')
  })
})

// ─── getMissingFields — stap9/SWOT fields included ────────────────────────────

describe('aiExtractMissingFields — stap9 merge logic', () => {
  it('merges AI-extracted stap9 fields into wizardData.stap9', async () => {
    const mockInvoke = vi.mocked(supabase.functions.invoke)
    mockInvoke.mockResolvedValueOnce({
      data: {
        aannames: { value: 'Taxatie conform NRVT', confidence: 'high' },
        swotSterktes: { value: 'Goede bereikbaarheid\nModerne uitstraling', confidence: 'medium' },
        swotZwaktes: { value: 'Beperkte parkeerruimte', confidence: 'medium' },
      },
      error: null,
    })

    const currentResult = {
      adres: { straat: 'Teststraat', huisnummer: '1', postcode: '1234 AB', plaats: 'Amsterdam' },
      typeObject: 'kantoor' as const,
      gebruiksdoel: 'verhuurd_belegging' as const,
      bvo: 1000,
      marktwaarde: 500000,
      bar: 7.5,
      nar: 6.5,
      waardepeildatum: '2024-01-01',
      wizardData: {
        stap1: { inspectiedatum: '2024-01-01', naamTaxateur: 'Jan Jansen', objectnaam: 'Kantoorpand' },
        stap2: { gemeente: 'Amsterdam', provincie: 'Noord-Holland', ligging: 'binnenstad' as const },
        stap3: { vvo: 900, perceeloppervlak: 500, bouwjaar: 2000 },
        stap4: { markthuurPerJaar: 40000, huurprijsPerJaar: 38000 },
        stap5: { eigendomssituatie: 'Eigendom' },
        stap7: { energielabel: 'A' as const },
        stap8: { kapitalisatiefactor: 13.5 },
        // stap9 is intentionally missing so AI fills it
      },
      rapportTeksten: {
        volledig: 'volledig tekst',
        aannames: ('Aannames: taxatie conform NRVT ' + ' x'.repeat(300)),
        swot: ('SWOT: Goede bereikbaarheid ' + ' x'.repeat(300)),
        samenvatting: ('Samenvatting hier.' + ' x'.repeat(300)),
      },
    }

    const { result, aiDebug } = await aiExtractMissingFields('dummy text', currentResult)

    expect(result.wizardData?.stap9?.aannames).toBe('Taxatie conform NRVT')
    expect(result.wizardData?.stap9?.swotSterktes).toBe('Goede bereikbaarheid\nModerne uitstraling')
    expect(result.wizardData?.stap9?.swotZwaktes).toBe('Beperkte parkeerruimte')
    expect(aiDebug['aannames']).toBeDefined()
    expect(aiDebug['aannames']?.sourceType).toBe('ai')
    expect(aiDebug['swotSterktes']).toBeDefined()
  })

  it('does not overwrite existing regex-extracted stap9 fields with AI values', async () => {
    const mockInvoke = vi.mocked(supabase.functions.invoke)
    mockInvoke.mockResolvedValueOnce({
      data: {
        aannames: { value: 'AI-extracted aannames', confidence: 'medium' },
        swotSterktes: { value: 'AI-extracted sterktes', confidence: 'medium' },
      },
      error: null,
    })

    const currentResult = {
      adres: { straat: 'Teststraat', huisnummer: '1', postcode: '1234 AB', plaats: 'Amsterdam' },
      typeObject: 'kantoor' as const,
      gebruiksdoel: 'verhuurd_belegging' as const,
      bvo: 1000,
      marktwaarde: 500000,
      bar: 7.5,
      nar: 6.5,
      waardepeildatum: '2024-01-01',
      wizardData: {
        stap1: { inspectiedatum: '2024-01-01', naamTaxateur: 'Jan Jansen', objectnaam: 'Kantoorpand' },
        stap2: { gemeente: 'Amsterdam', provincie: 'Noord-Holland', ligging: 'binnenstad' as const },
        stap3: { vvo: 900, perceeloppervlak: 500, bouwjaar: 2000 },
        stap4: { markthuurPerJaar: 40000, huurprijsPerJaar: 38000 },
        stap5: { eigendomssituatie: 'Eigendom' },
        stap7: { energielabel: 'A' as const },
        stap8: { kapitalisatiefactor: 13.5 },
        stap9: {
          aannames: 'Regex-extracted aannames',  // already filled by regex
          voorbehouden: '',
          bijzondereOmstandigheden: '',
          interneNotities: '',
          swotSterktes: 'Regex-extracted sterktes', // already filled by regex
        },
      },
    }

    const { result } = await aiExtractMissingFields('dummy text', currentResult)

    // Existing values must not be overwritten
    expect(result.wizardData?.stap9?.aannames).toBe('Regex-extracted aannames')
    expect(result.wizardData?.stap9?.swotSterktes).toBe('Regex-extracted sterktes')
  })

  it('returns current result gracefully when edge function returns an error', async () => {
    const mockInvoke = vi.mocked(supabase.functions.invoke)
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'Bad Request' },
    })

    const currentResult = {
      adres: { straat: 'Teststraat', huisnummer: '1', postcode: '1234 AB', plaats: 'Amsterdam' },
      typeObject: 'kantoor' as const,
      gebruiksdoel: 'verhuurd_belegging' as const,
      bvo: 1000,
      marktwaarde: 500000,
      bar: 7.5,
      nar: 6.5,
      waardepeildatum: '2024-01-01',
      wizardData: {},
    }

    // Should not throw — graceful return with current result
    const { result, aiDebug } = await aiExtractMissingFields('dummy text', currentResult)

    expect(result).toEqual(currentResult)
    expect(aiDebug).toEqual({})
  })
})
