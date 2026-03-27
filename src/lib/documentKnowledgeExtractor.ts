import { v4 as uuidv4 } from 'uuid'
import type { DocumentChunk, DocumentWritingProfile } from '../types/kennisbank'
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
        toneOfVoice: 'neutraal',
        detailLevel: 'standaard',
        standardizationLevel: 'laag',
        dominantChapterStructure: [],
        reuseQuality: 0,
      },
    }
  }
}
