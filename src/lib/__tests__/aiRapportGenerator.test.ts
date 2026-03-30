import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Dossier, HistorischRapport } from '../../types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}))

vi.mock('../templates', () => ({
  generateAlleSecties: vi.fn((_dossier: Dossier, _historisch: HistorischRapport[]) => ({
    'b1-algemeen': 'Template tekst voor B1',
    'b4-inspectie': 'Template tekst voor B4',
  })),
}))

vi.mock('../similarity', () => ({
  calculateSimilarity: vi.fn(),
}))

import { supabase } from '../supabaseClient'
import { generateSectieMetAI, generateAlleSectiesMetAI } from '../aiRapportGenerator'

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeDossier(overrides: Partial<Dossier> = {}): Dossier {
  return {
    id: 'dossier-1',
    dossiernummer: 'DOS-001',
    versieNummer: 1,
    isActualisatie: false,
    status: 'concept',
    stap1: {
      dossiernummer: 'DOS-001',
      objectnaam: 'Kantoorpand Amsterdam',
      typeObject: 'kantoor',
      gebruiksdoel: 'eigenaar_gebruiker',
      opdrachtgever: { naam: 'Pietersen', bedrijf: 'Acme BV', email: 'p@acme.nl', telefoon: '0612345678' },
      naamTaxateur: 'J. Janssen',
      waardepeildatum: '2024-01-01',
      inspectiedatum: '2024-01-02',
    },
    stap2: {
      straatnaam: 'Herengracht',
      huisnummer: '123',
      postcode: '1017BT',
      plaats: 'Amsterdam',
      gemeente: 'Amsterdam',
      provincie: 'Noord-Holland',
      kadasterAanduiding: { gemeente: 'Amsterdam', sectie: 'A', perceelnummer: '1234' },
      kadastraalOppervlak: 500,
      ligging: 'binnenstad',
      bereikbaarheid: 'Goed bereikbaar',
      coordinaten: { lat: 52.37, lng: 4.89 },
    },
    stap3: {
      bvo: 1200,
      vvo: 1000,
      perceeloppervlak: 500,
      aantalBouwlagen: 4,
      bouwjaar: 1990,
      aanbouwen: '',
    },
    stap8: {
      methode: 'vergelijkingsmethode',
      marktwaarde: 3500000,
      onderhandseVerkoopwaarde: 3450000,
      vergelijkingsobjecten: [],
    },
    similarityResults: [],
    geselecteerdeReferenties: [],
    rapportSecties: {},
    huidigeStap: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  } as Dossier
}

function makeHistorischRapport(overrides: Partial<HistorischRapport> = {}): HistorischRapport {
  return {
    id: 'rapport-1',
    adres: { straat: 'Keizersgracht', huisnummer: '45', postcode: '1015CJ', plaats: 'Amsterdam' },
    coordinaten: { lat: 52.37, lng: 4.88 },
    typeObject: 'kantoor',
    gebruiksdoel: 'eigenaar_gebruiker',
    bvo: 1100,
    marktwaarde: 3200000,
    waardepeildatum: '2023-01-01',
    rapportTeksten: {
      'b1-algemeen': 'Referentie tekst voor B1',
      'b4-inspectie': 'Referentie tekst voor B4',
    },
    wizardData: {},
    ...overrides,
  } as HistorischRapport
}

// ---------------------------------------------------------------------------
// generateSectieMetAI
// ---------------------------------------------------------------------------

describe('generateSectieMetAI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns AI-generated text when edge function succeeds', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { tekst: 'AI gegenereerde tekst voor B1' },
      error: null,
    } as never)

    const result = await generateSectieMetAI({
      sectieKey: 'b1-algemeen',
      sectieTitel: 'B.1 Algemeen',
      dossier: makeDossier(),
      templateTekst: 'Template tekst voor B1',
    })

    expect(result.tekst).toBe('AI gegenereerde tekst voor B1')
    expect(result.isAIGenerated).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('calls the correct edge function with required parameters', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { tekst: 'Tekst' },
      error: null,
    } as never)

    await generateSectieMetAI({
      sectieKey: 'b4-inspectie',
      sectieTitel: 'B.4 Inspectie',
      dossier: makeDossier(),
    })

    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'openai-generate-section',
      expect.objectContaining({
        body: expect.objectContaining({
          sectieKey: 'b4-inspectie',
          sectieTitel: 'B.4 Inspectie',
          dossierData: expect.any(Object),
        }),
      })
    )
  })

  it('falls back to template text when edge function returns an error', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: null,
      error: { message: 'Service unavailable' },
    } as never)

    const result = await generateSectieMetAI({
      sectieKey: 'b1-algemeen',
      sectieTitel: 'B.1 Algemeen',
      dossier: makeDossier(),
      templateTekst: 'Template fallback tekst',
    })

    expect(result.tekst).toBe('Template fallback tekst')
    expect(result.isAIGenerated).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('falls back to template text when edge function throws', async () => {
    vi.mocked(supabase.functions.invoke).mockRejectedValueOnce(new Error('Network error'))

    const result = await generateSectieMetAI({
      sectieKey: 'b1-algemeen',
      sectieTitel: 'B.1 Algemeen',
      dossier: makeDossier(),
      templateTekst: 'Fallback tekst',
    })

    expect(result.tekst).toBe('Fallback tekst')
    expect(result.isAIGenerated).toBe(false)
  })

  it('falls back to empty string when no templateTekst provided and AI fails', async () => {
    vi.mocked(supabase.functions.invoke).mockRejectedValueOnce(new Error('Error'))

    const result = await generateSectieMetAI({
      sectieKey: 'b1-algemeen',
      sectieTitel: 'B.1 Algemeen',
      dossier: makeDossier(),
    })

    expect(result.tekst).toBe('')
    expect(result.isAIGenerated).toBe(false)
  })

  it('includes referentie teksten in the edge function payload', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { tekst: 'Tekst' },
      error: null,
    } as never)

    const rapport = makeHistorischRapport()
    await generateSectieMetAI({
      sectieKey: 'b1-algemeen',
      sectieTitel: 'B.1 Algemeen',
      dossier: makeDossier(),
      referenties: [rapport],
    })

    const callBody = vi.mocked(supabase.functions.invoke).mock.calls[0][1]?.body as {
      referenties?: Array<{ adres: string; similarityScore: number; sectieTekst: string }>
    }
    expect(callBody.referenties).toHaveLength(1)
    expect(callBody.referenties?.[0].sectieTekst).toBe('Referentie tekst voor B1')
  })

  it('excludes referenties without matching section text', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { tekst: 'Tekst' },
      error: null,
    } as never)

    const rapport = makeHistorischRapport({ rapportTeksten: {} })
    await generateSectieMetAI({
      sectieKey: 'b1-algemeen',
      sectieTitel: 'B.1 Algemeen',
      dossier: makeDossier(),
      referenties: [rapport],
    })

    const callBody = vi.mocked(supabase.functions.invoke).mock.calls[0][1]?.body as {
      referenties?: Array<unknown>
    }
    expect(callBody.referenties).toHaveLength(0)
  })

  it('only sends relevant dossier stappen for the given section', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { tekst: 'Tekst' },
      error: null,
    } as never)

    const dossier = makeDossier()
    await generateSectieMetAI({
      sectieKey: 'b1-algemeen',
      sectieTitel: 'B.1 Algemeen',
      dossier,
    })

    // b1-algemeen only uses stap1 and stap2
    const callBody = vi.mocked(supabase.functions.invoke).mock.calls[0][1]?.body as {
      dossierData: Record<string, unknown>
    }
    expect(callBody.dossierData).toHaveProperty('stap1')
    expect(callBody.dossierData).toHaveProperty('stap2')
    expect(callBody.dossierData).not.toHaveProperty('stap8')
  })
})

// ---------------------------------------------------------------------------
// generateAlleSectiesMetAI
// ---------------------------------------------------------------------------

describe('generateAlleSectiesMetAI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns results for all template sections', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { tekst: 'AI tekst' },
      error: null,
    } as never)

    const result = await generateAlleSectiesMetAI(makeDossier(), [])

    expect(Object.keys(result)).toEqual(['b1-algemeen', 'b4-inspectie'])
    expect(result['b1-algemeen'].isAIGenerated).toBe(true)
    expect(result['b4-inspectie'].isAIGenerated).toBe(true)
  })

  it('falls back to template when AI fails for a section', async () => {
    vi.mocked(supabase.functions.invoke)
      .mockResolvedValueOnce({ data: { tekst: 'AI tekst voor B1' }, error: null } as never)
      .mockRejectedValueOnce(new Error('AI failure'))

    const result = await generateAlleSectiesMetAI(makeDossier(), [])

    expect(result['b1-algemeen'].tekst).toBe('AI tekst voor B1')
    expect(result['b1-algemeen'].isAIGenerated).toBe(true)
    expect(result['b4-inspectie'].tekst).toBe('Template tekst voor B4')
    expect(result['b4-inspectie'].isAIGenerated).toBe(false)
  })

  it('calls onProgress after each section', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { tekst: 'Tekst' },
      error: null,
    } as never)

    const progressCalls: Array<[string, number, number]> = []
    await generateAlleSectiesMetAI(makeDossier(), [], (key, progress, total) => {
      progressCalls.push([key, progress, total])
    })

    expect(progressCalls).toHaveLength(2)
    expect(progressCalls[0]).toEqual(['b1-algemeen', 1, 2])
    expect(progressCalls[1]).toEqual(['b4-inspectie', 2, 2])
  })

  it('processes sections sequentially (one at a time)', async () => {
    const callOrder: string[] = []

    vi.mocked(supabase.functions.invoke).mockImplementation(async (_fn, options) => {
      const body = options?.body as { sectieKey?: string }
      callOrder.push(body?.sectieKey ?? 'unknown')
      return { data: { tekst: 'Tekst' }, error: null }
    })

    await generateAlleSectiesMetAI(makeDossier(), [])

    expect(callOrder).toEqual(['b1-algemeen', 'b4-inspectie'])
  })

  it('uses geselecteerdeReferenties when available', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { tekst: 'Tekst' },
      error: null,
    } as never)

    const rapport = makeHistorischRapport({ id: 'ref-1' })
    const dossier = makeDossier({
      geselecteerdeReferenties: ['ref-1'],
      similarityResults: [{ rapportId: 'ref-1', totaalScore: 85, scoreBreakdown: { afstand: 70, typeObject: 90, oppervlakte: 80, ouderheidRapport: 90, gebruiksdoel: 90 }, afstandKm: 0.5, classificatie: 'goed' }],
    })

    await generateAlleSectiesMetAI(dossier, [rapport])

    const firstCall = vi.mocked(supabase.functions.invoke).mock.calls[0]
    const body = firstCall[1]?.body as { referenties?: Array<{ similarityScore: number }> }
    expect(body.referenties?.[0].similarityScore).toBe(85)
  })
})
