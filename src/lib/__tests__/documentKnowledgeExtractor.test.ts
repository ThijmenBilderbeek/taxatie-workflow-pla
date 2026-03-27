import { describe, it, expect } from 'vitest'
import { extractDocumentKnowledge } from '../documentKnowledgeExtractor'

const SAMPLE_TEXT = `A. Inleiding
Dit rapport betreft de taxatie van een kantoorpand gelegen aan de Herengracht 123 te Amsterdam.
Het object is geïnspecteerd op 15 januari 2024 door een gecertificeerd taxateur.

B. Objectomschrijving
Het object betreft een kantoorpand uit 1985 met een bruto vloeroppervlak van 1.200 m².

B.1 Adres en ligging
Het object is centraal gelegen in Amsterdam aan de Herengracht 123, 1017 BT Amsterdam.
De ligging is uitstekend met directe toegang tot het openbaar vervoer.

B.2 Oppervlaktes
Het bruto vloeroppervlak bedraagt 1.200 m².
Het verhuurbaar vloeroppervlak bedraagt 1.050 m².

C. Marktanalyse
De kantorenmarkt in Amsterdam laat een stabiele vraag zien.
Leegstandspercentages zijn gedaald naar circa 8%.
De markthuur voor vergelijkbare objecten bedraagt € 225 per m² per jaar.

D. Waardering
Op basis van de inkomstenbenadering is de marktwaarde vastgesteld op € 3.500.000.
De BAR bedraagt 6,4% en de NAR bedraagt 5,9%.
De kapitalisatiefactor bedraagt 15,6.`

describe('extractDocumentKnowledge', () => {
  it('returns chunks and a writing profile', () => {
    const result = extractDocumentKnowledge(SAMPLE_TEXT, 'test-doc-001')
    expect(result).toHaveProperty('chunks')
    expect(result).toHaveProperty('profile')
  })

  it('detects at least one chunk', () => {
    const result = extractDocumentKnowledge(SAMPLE_TEXT, 'test-doc-001')
    expect(result.chunks.length).toBeGreaterThan(0)
  })

  it('assigns the given documentId to all chunks', () => {
    const result = extractDocumentKnowledge(SAMPLE_TEXT, 'test-doc-42')
    for (const chunk of result.chunks) {
      expect(chunk.documentId).toBe('test-doc-42')
    }
  })

  it('populates required chunk fields', () => {
    const result = extractDocumentKnowledge(SAMPLE_TEXT, 'test-doc-001')
    const chunk = result.chunks[0]
    expect(chunk.id).toBeTruthy()
    expect(chunk.chunkType).toBeTruthy()
    expect(chunk.rawText).toBeTruthy()
    expect(chunk.cleanText).toBeTruthy()
    expect(chunk.writingFunction).toBeTruthy()
    expect(Array.isArray(chunk.tones)).toBe(true)
    expect(typeof chunk.reuseScore).toBe('number')
    expect(typeof chunk.templateCandidate).toBe('boolean')
    expect(Array.isArray(chunk.variablesDetected)).toBe(true)
  })

  it('generates a writing profile with the given documentId', () => {
    const result = extractDocumentKnowledge(SAMPLE_TEXT, 'profile-doc-99')
    expect(result.profile.documentId).toBe('profile-doc-99')
    expect(result.profile.toneOfVoice).toBeTruthy()
    expect(result.profile.detailLevel).toBeTruthy()
    expect(result.profile.standardizationLevel).toBeTruthy()
    expect(Array.isArray(result.profile.dominantChapterStructure)).toBe(true)
  })

  it('accepts objectType and documentType options', () => {
    const result = extractDocumentKnowledge(SAMPLE_TEXT, 'opt-doc-001', {
      objectType: 'kantoor',
      documentType: 'taxatierapport',
    })
    expect(result.profile.objectType).toBe('kantoor')
    expect(result.profile.documentType).toBe('taxatierapport')
  })

  it('returns empty chunks and a default profile for empty text', () => {
    const result = extractDocumentKnowledge('', 'empty-doc')
    expect(result.chunks).toEqual([])
    expect(result.profile.documentId).toBe('empty-doc')
  })

  it('is non-blocking — does not throw on malformed input', () => {
    expect(() => extractDocumentKnowledge('   \n\n\n   ', 'bad-doc')).not.toThrow()
  })
})
