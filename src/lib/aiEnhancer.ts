/**
 * aiEnhancer.ts
 *
 * Calls the `openai-classify` Supabase Edge Function to enhance rule-based
 * chunk classification with GPT-4o-mini.  Falls back silently to the
 * rule-based result whenever the AI call fails.
 */

import { supabase } from './supabaseClient'
import type { DocumentChunk, DocumentWritingProfile, AIChunkClassification } from '../types/kennisbank'

// ---------------------------------------------------------------------------
// Single chunk enhancement
// ---------------------------------------------------------------------------

/**
 * Sends a chunk's text to the `openai-classify` Edge Function and returns
 * an AI-enhanced classification.  Returns `null` on any error so callers
 * can fall back to rule-based values.
 */
export async function enhanceChunkClassification(
  chunk: DocumentChunk
): Promise<AIChunkClassification | null> {
  try {
    const { data, error } = await supabase.functions.invoke<AIChunkClassification>(
      'openai-classify',
      { body: { text: chunk.cleanText || chunk.rawText } }
    )

    if (error) {
      console.warn('[aiEnhancer] edge function error:', error)
      return null
    }

    if (!data || typeof data.chunkType !== 'string') {
      console.warn('[aiEnhancer] unexpected response shape:', data)
      return null
    }

    return data
  } catch (err) {
    console.warn('[aiEnhancer] enhanceChunkClassification failed:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Batch enhancement
// ---------------------------------------------------------------------------

/**
 * Enhances an array of chunks in batches to avoid overwhelming the Edge
 * Function with concurrent requests.  Chunks for which AI fails keep their
 * original rule-based classification.
 */
export async function enhanceChunksBatch(
  chunks: DocumentChunk[],
  batchSize = 5
): Promise<DocumentChunk[]> {
  const results: DocumentChunk[] = []

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const enhanced = await Promise.all(
      batch.map(async (chunk) => {
        const ai = await enhanceChunkClassification(chunk)
        if (!ai) return chunk // Fall back to rule-based classification

        return {
          ...chunk,
          chunkType: ai.chunkType ?? chunk.chunkType,
          writingFunction: ai.writingFunction ?? chunk.writingFunction,
          tones: ai.tones?.length ? ai.tones : chunk.tones,
          specificity: ai.specificity ?? chunk.specificity,
          templateCandidate: typeof ai.templateCandidate === 'boolean'
            ? ai.templateCandidate
            : chunk.templateCandidate,
          variablesDetected: ai.variablesDetected?.length
            ? ai.variablesDetected
            : chunk.variablesDetected,
        } satisfies DocumentChunk
      })
    )
    results.push(...enhanced)
  }

  return results
}

// ---------------------------------------------------------------------------
// Document profile enhancement
// ---------------------------------------------------------------------------

/**
 * Uses AI-enhanced chunk data to improve the document writing profile.
 * The profile fields are re-derived from the (now AI-classified) chunks,
 * so no extra AI call is needed here — the improvement comes automatically.
 *
 * Returns the profile unchanged when the chunk array is empty.
 */
export function enhanceDocumentProfile(
  chunks: DocumentChunk[],
  profile: DocumentWritingProfile
): DocumentWritingProfile {
  if (chunks.length === 0) return profile

  // Re-derive toneOfVoice from the most frequent tone across all chunks
  const toneCounts: Record<string, number> = {}
  for (const chunk of chunks) {
    for (const tone of chunk.tones) {
      toneCounts[tone] = (toneCounts[tone] ?? 0) + 1
    }
  }

  const dominantTone = Object.entries(toneCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as DocumentWritingProfile['toneOfVoice'] | undefined

  // Re-derive reuseQuality from average reuseScore of high-scoring chunks
  const highScoreChunks = chunks.filter((c) => c.reuseScore >= 0.6)
  const reuseQuality = highScoreChunks.length > 0
    ? highScoreChunks.reduce((sum, c) => sum + c.reuseScore, 0) / highScoreChunks.length
    : profile.reuseQuality

  return {
    ...profile,
    toneOfVoice: dominantTone ?? profile.toneOfVoice,
    reuseQuality: Math.round(reuseQuality * 100) / 100,
  }
}
