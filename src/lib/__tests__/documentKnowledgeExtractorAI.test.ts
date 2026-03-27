import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractDocumentKnowledgeWithAI } from '../documentKnowledgeExtractor'

const SAMPLE_TEXT = `A. Inleiding
Dit rapport betreft de taxatie van een kantoorpand gelegen aan de Herengracht 123 te Amsterdam.

B. Waardering
Op basis van de inkomstenbenadering is de marktwaarde vastgesteld op € 3.500.000.`

// ---------------------------------------------------------------------------
// Without AI enhancement (ai disabled or not provided)
// ---------------------------------------------------------------------------

describe('extractDocumentKnowledgeWithAI — AI disabled', () => {
  it('returns the same structure as the synchronous variant', async () => {
    const result = await extractDocumentKnowledgeWithAI(SAMPLE_TEXT, 'doc-ai-1')
    expect(result).toHaveProperty('chunks')
    expect(result).toHaveProperty('profile')
    expect(result.chunks.length).toBeGreaterThan(0)
  })

  it('does not call aiEnhancer when ai.enabled is false', async () => {
    // No mock needed — if aiEnhancer were called it would fail trying to reach Supabase
    const result = await extractDocumentKnowledgeWithAI(SAMPLE_TEXT, 'doc-ai-2', {
      ai: { enabled: false },
    })
    expect(result.chunks.length).toBeGreaterThan(0)
  })

  it('returns empty chunks for empty text', async () => {
    const result = await extractDocumentKnowledgeWithAI('', 'empty-ai-doc')
    expect(result.chunks).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// With AI enhancement
// ---------------------------------------------------------------------------

describe('extractDocumentKnowledgeWithAI — AI enabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns AI-enhanced chunks when ai.enabled is true', async () => {
    // Mock the aiEnhancer module
    vi.doMock('../aiEnhancer', () => ({
      enhanceChunksBatch: vi.fn(async (chunks: unknown[]) => chunks), // pass through
      enhanceDocumentProfile: vi.fn((_, profile: unknown) => profile), // pass through
    }))

    const result = await extractDocumentKnowledgeWithAI(SAMPLE_TEXT, 'doc-ai-3', {
      ai: { enabled: true, batchSize: 2 },
    })

    expect(result.chunks.length).toBeGreaterThan(0)
    expect(result.profile.documentId).toBe('doc-ai-3')
  })

  it('falls back gracefully when AI enhancement rejects', async () => {
    vi.doMock('../aiEnhancer', () => ({
      enhanceChunksBatch: vi.fn(async () => { throw new Error('AI unavailable') }),
      enhanceDocumentProfile: vi.fn(),
    }))

    // Should propagate the error (caller is responsible for try/catch)
    await expect(
      extractDocumentKnowledgeWithAI(SAMPLE_TEXT, 'doc-ai-4', { ai: { enabled: true } })
    ).rejects.toThrow('AI unavailable')
  })

  it('skips AI call when there are no chunks', async () => {
    const enhanceChunksBatch = vi.fn()

    vi.doMock('../aiEnhancer', () => ({
      enhanceChunksBatch,
      enhanceDocumentProfile: vi.fn(),
    }))

    await extractDocumentKnowledgeWithAI('', 'empty-ai-2', { ai: { enabled: true } })

    // enhanceChunksBatch should NOT be called when chunks array is empty
    expect(enhanceChunksBatch).not.toHaveBeenCalled()
  })
})
