import { v4 as uuidv4 } from 'uuid'
import type { DocumentChunk, DocumentWritingProfile, AIEnhancementOptions, MarketSegment } from '../types/kennisbank'
import type { ObjectType } from '../types'
import { detectChapters } from './chapterDetector'
import { chunkSections } from './narrativeChunker'
import { classifyChunks } from './chunkClassifier'
import { extractWritingProfile } from './styleMetadataExtractor'
import { extractTemplates } from './templateExtractor'

export interface DocumentKnowledge {
  chunks: DocumentChunk[]
  profile: DocumentWritingProfile
}

/**
 * Derives a MarketSegment from an ObjectType when no explicit marketSegment is provided.
 */
export function deriveMarketSegment(objectType?: ObjectType): MarketSegment | undefined {
  switch (objectType) {
    case 'woning':
    case 'appartement':
      return 'residentieel'
    case 'kantoor':
    case 'winkel':
      return 'commercieel'
    case 'bedrijfscomplex':
    case 'bedrijfshal':
      return 'industrieel'
    case 'overig':
      return 'overig'
    default:
      return undefined
  }
}

/**
 * Orchestrates the full document knowledge extraction pipeline:
 * 1. Chapter detection
 * 2. Narrative chunking
 * 3. Chunk classification
 * 4. Template extraction
 * 5. Writing profile generation
 *
 * This function is non-blocking — it is designed to be called after
 * parsePdfToRapport() and should not throw, only return empty results
 * on failure.
 */
export function extractDocumentKnowledge(
  text: string,
  rapportId: string,
  options?: {
    objectType?: ObjectType
    documentType?: string
    objectAddress?: string
    city?: string
    region?: string
    marketSegment?: DocumentChunk['marketSegment']
  }
): DocumentKnowledge {
  const now = new Date().toISOString()

  try {
    // Step 1: Detect chapters and sections
    const sections = detectChapters(text)

    // Step 2: Split sections into narrative chunks
    const rawChunks = chunkSections(sections)

    // Step 3: Classify chunks
    const classifiedChunks = classifyChunks(rawChunks)

    // Step 4: Extract template information
    const templatedChunks = extractTemplates(classifiedChunks)

    // Step 5: Generate writing profile
    const profile = extractWritingProfile(rapportId, classifiedChunks, {
      objectType: options?.objectType,
      documentType: options?.documentType,
    })

    // Override inferred marketSegment if provided explicitly
    if (options?.marketSegment) {
      profile.marketSegment = options.marketSegment
    }

    // Step 6: Map to DocumentChunk interface
    const chunks: DocumentChunk[] = templatedChunks.map((chunk) => ({
      id: uuidv4(),
      documentId: rapportId,
      chapter: chunk.chapter,
      subchapter: chunk.subchapter,
      chunkType: chunk.chunkType,
      rawText: chunk.rawText,
      cleanText: chunk.cleanText,
      writingFunction: chunk.writingFunction,
      tones: chunk.tones,
      specificity: chunk.specificity,
      reuseScore: chunk.reuseScore,
      reuseAsStyleExample: chunk.reuseAsStyleExample,
      templateCandidate: chunk.templateCandidate,
      templateText: chunk.templateText,
      variablesDetected: chunk.variablesDetected,
      objectAddress: options?.objectAddress,
      objectType: options?.objectType,
      marketSegment: options?.marketSegment,
      city: options?.city,
      region: options?.region,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    }))

    return { chunks, profile }
  } catch (err) {
    console.error('[documentKnowledgeExtractor] pipeline failed:', err)
    // Return empty results so the rapport save is not blocked
    return {
      chunks: [],
      profile: {
        documentId: rapportId,
        documentType: options?.documentType ?? 'taxatierapport',
        objectType: options?.objectType,
        marketSegment: options?.marketSegment,
        toneOfVoice: 'neutraal',
        detailLevel: 'standaard',
        standardizationLevel: 'laag',
        dominantChapterStructure: [],
        reuseQuality: 0,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// AI-enhanced (async) variant
// ---------------------------------------------------------------------------

export interface ExtractOptions {
  objectType?: ObjectType
  documentType?: string
  objectAddress?: string
  city?: string
  region?: string
  marketSegment?: DocumentChunk['marketSegment']
  ai?: AIEnhancementOptions
}

/**
 * Async version of `extractDocumentKnowledge` that optionally applies
 * AI-enhanced classification after the rule-based pipeline.
 *
 * When `options.ai.enabled` is false (the default) this behaves identically
 * to the synchronous variant but returns a Promise.
 */
export async function extractDocumentKnowledgeWithAI(
  text: string,
  rapportId: string,
  options?: ExtractOptions
): Promise<DocumentKnowledge> {
  // Run the synchronous rule-based pipeline first
  const result = extractDocumentKnowledge(text, rapportId, {
    objectType: options?.objectType,
    documentType: options?.documentType,
    objectAddress: options?.objectAddress,
    city: options?.city,
    region: options?.region,
    marketSegment: options?.marketSegment,
  })

  if (!options?.ai?.enabled || result.chunks.length === 0) {
    return result
  }

  // Lazily import to avoid loading the Supabase client in SSR / test environments
  const { enhanceChunksBatch, enhanceDocumentProfile } = await import('./aiEnhancer')

  const batchSize = options.ai.batchSize ?? 5

  const enhancedChunks = await enhanceChunksBatch(result.chunks, batchSize)
  const enhancedProfile = enhanceDocumentProfile(enhancedChunks, result.profile)

  return { chunks: enhancedChunks, profile: enhancedProfile }
}
