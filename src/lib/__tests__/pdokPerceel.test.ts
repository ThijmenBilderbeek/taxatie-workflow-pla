import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parsePerceelString,
  extractPercelenUitPdokDoc,
  haalPerceelVerrijking,
} from '../pdokPerceel'

// ---------------------------------------------------------------------------
// parsePerceelString
// ---------------------------------------------------------------------------
describe('parsePerceelString', () => {
  it('parses dash-separated format', () => {
    const result = parsePerceelString('VLO00-E-600')
    expect(result).toEqual({
      gemeente: 'VLO00',
      sectie: 'E',
      perceelnummer: '600',
      volledigeAanduiding: 'VLO00-E-600',
    })
  })

  it('parses space-separated format', () => {
    const result = parsePerceelString('VLO00 E 600')
    expect(result).toEqual({
      gemeente: 'VLO00',
      sectie: 'E',
      perceelnummer: '600',
      volledigeAanduiding: 'VLO00-E-600',
    })
  })

  it('returns null for invalid format', () => {
    expect(parsePerceelString('ongeldig')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// extractPercelenUitPdokDoc
// ---------------------------------------------------------------------------
describe('extractPercelenUitPdokDoc', () => {
  it('extracts single perceel string', () => {
    const doc = { gekoppeld_perceel: 'VLO00-E-600' }
    const result = extractPercelenUitPdokDoc(doc)
    expect(result).toHaveLength(1)
    expect(result[0].gemeente).toBe('VLO00')
  })

  it('extracts multiple percelen from array', () => {
    const doc = { gekoppeld_perceel: ['VLO00-E-600', 'VLO00-E-601'] }
    const result = extractPercelenUitPdokDoc(doc)
    expect(result).toHaveLength(2)
  })

  it('returns empty array when no percelen', () => {
    expect(extractPercelenUitPdokDoc({})).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// haalPerceelVerrijking
// ---------------------------------------------------------------------------
describe('haalPerceelVerrijking', () => {
  const perceel = { gemeente: 'VLO00', sectie: 'E', perceelnummer: '600', volledigeAanduiding: 'VLO00-E-600' }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls the correct PDOK BRK endpoint with query parameters (no CQL filter)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ properties: { kadastrale_grootte_waarde: 1234 }, geometry: { type: 'Polygon', coordinates: [] } }],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await haalPerceelVerrijking(perceel)

    expect(mockFetch).toHaveBeenCalledOnce()
    const calledUrl: string = mockFetch.mock.calls[0][0]

    // Correct endpoint
    expect(calledUrl).toContain('brk-kadastrale-kaart/ogc/v1/collections/perceel/items')

    // No CQL filter parameter (API does not support it)
    expect(calledUrl).not.toContain('filter=')
    expect(calledUrl).not.toContain('filter-lang')

    // Uses individual query parameters
    expect(calledUrl).toContain('akr_kadastrale_gemeente_code_waarde=VLO00')
    expect(calledUrl).toContain('sectie=E')
    expect(calledUrl).toContain('perceelnummer=600')
    expect(calledUrl).toContain('limit=1')
    expect(calledUrl).toContain('f=json')
  })

  it('returns enriched perceel data on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ properties: { kadastrale_grootte_waarde: 1234 }, geometry: { type: 'Polygon', coordinates: [] } }],
      }),
    }))

    const result = await haalPerceelVerrijking(perceel)

    expect(result).not.toBeNull()
    expect(result?.oppervlakte).toBe(1234)
    expect(result?.geometrie).toEqual({ type: 'Polygon', coordinates: [] })
  })

  it('returns null when API returns non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    }))

    const result = await haalPerceelVerrijking(perceel)
    expect(result).toBeNull()
  })

  it('returns null when no features are returned', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    }))

    const result = await haalPerceelVerrijking(perceel)
    expect(result).toBeNull()
  })

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const result = await haalPerceelVerrijking(perceel)
    expect(result).toBeNull()
  })

  it('throws on invalid perceel format', async () => {
    const invalid = { gemeente: 'invalid gemeente', sectie: 'E', perceelnummer: '600', volledigeAanduiding: '' }
    await expect(haalPerceelVerrijking(invalid)).rejects.toThrow('Ongeldig perceelformaat')
  })
})
