import { useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useKantoor } from './useKantoor'
import type { DocumentChunk, DocumentWritingProfile, AIEnhancementOptions } from '@/types/kennisbank'
import { extractDocumentKnowledgeWithAI } from '@/lib/documentKnowledgeExtractor'
import type { ObjectType } from '@/types'

function chunkToRow(chunk: DocumentChunk, userId: string, kantoorId: string | null) {
  return {
    user_id: userId,
    kantoor_id: kantoorId,
    document_id: chunk.documentId,
    chapter: chunk.chapter,
    subchapter: chunk.subchapter,
    chunk_type: chunk.chunkType,
    raw_text: chunk.rawText,
    clean_text: chunk.cleanText,
    writing_function: chunk.writingFunction,
    tones: chunk.tones,
    specificity: chunk.specificity,
    reuse_score: chunk.reuseScore,
    reuse_as_style_example: chunk.reuseAsStyleExample,
    template_candidate: chunk.templateCandidate,
    template_text: chunk.templateText ?? null,
    variables_detected: chunk.variablesDetected,
    object_address: chunk.objectAddress ?? null,
    object_type: chunk.objectType ?? null,
    market_segment: chunk.marketSegment ?? null,
    city: chunk.city ?? null,
    region: chunk.region ?? null,
    metadata: chunk.metadata,
    embedding: chunk.embedding ?? null,
    updated_at: new Date().toISOString(),
  }
}

function profileToRow(profile: DocumentWritingProfile, userId: string, kantoorId: string | null) {
  return {
    user_id: userId,
    kantoor_id: kantoorId,
    document_id: profile.documentId,
    document_type: profile.documentType,
    object_type: profile.objectType ?? null,
    market_segment: profile.marketSegment ?? null,
    tone_of_voice: profile.toneOfVoice,
    detail_level: profile.detailLevel,
    standardization_level: profile.standardizationLevel,
    dominant_chapter_structure: profile.dominantChapterStructure,
    reuse_quality: profile.reuseQuality,
    updated_at: new Date().toISOString(),
  }
}

function rowToChunk(row: Record<string, unknown>): DocumentChunk {
  return {
    id: row.id as string,
    documentId: row.document_id as string,
    chapter: (row.chapter as string) ?? '',
    subchapter: (row.subchapter as string) ?? '',
    chunkType: row.chunk_type as DocumentChunk['chunkType'],
    rawText: (row.raw_text as string) ?? '',
    cleanText: (row.clean_text as string) ?? '',
    writingFunction: row.writing_function as DocumentChunk['writingFunction'],
    tones: (row.tones as DocumentChunk['tones']) ?? [],
    specificity: row.specificity as DocumentChunk['specificity'],
    reuseScore: (row.reuse_score as number) ?? 0,
    reuseAsStyleExample: (row.reuse_as_style_example as boolean) ?? false,
    templateCandidate: (row.template_candidate as boolean) ?? false,
    templateText: row.template_text as string | undefined,
    variablesDetected: (row.variables_detected as string[]) ?? [],
    objectAddress: row.object_address as string | undefined,
    objectType: row.object_type as DocumentChunk['objectType'],
    marketSegment: row.market_segment as DocumentChunk['marketSegment'],
    city: row.city as string | undefined,
    region: row.region as string | undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    embedding: (row.embedding as number[]) ?? undefined,
  }
}

function rowToProfile(row: Record<string, unknown>): DocumentWritingProfile {
  return {
    documentId: row.document_id as string,
    documentType: (row.document_type as string) ?? 'taxatierapport',
    objectType: row.object_type as DocumentWritingProfile['objectType'],
    marketSegment: row.market_segment as DocumentWritingProfile['marketSegment'],
    toneOfVoice: row.tone_of_voice as DocumentWritingProfile['toneOfVoice'],
    detailLevel: row.detail_level as DocumentWritingProfile['detailLevel'],
    standardizationLevel: row.standardization_level as DocumentWritingProfile['standardizationLevel'],
    dominantChapterStructure: (row.dominant_chapter_structure as string[]) ?? [],
    reuseQuality: (row.reuse_quality as number) ?? 0,
  }
}

export function useDocumentKnowledge() {
  const { kantoorId } = useKantoor()

  const saveDocumentChunks = useCallback(async (chunks: DocumentChunk[]) => {
    if (chunks.length === 0) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const rows = chunks.map((c) => chunkToRow(c, user.id, kantoorId))
    const { error } = await supabase.from('document_chunks').insert(rows)
    if (error) {
      console.error('[useDocumentKnowledge] saveDocumentChunks error:', error)
    }
  }, [kantoorId])

  const saveDocumentProfile = useCallback(async (profile: DocumentWritingProfile) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const row = profileToRow(profile, user.id, kantoorId)
    const { error } = await supabase
      .from('document_writing_profiles')
      .upsert(row, { onConflict: 'document_id' })
    if (error) {
      console.error('[useDocumentKnowledge] saveDocumentProfile error:', error)
    }
  }, [kantoorId])

  const getDocumentChunks = useCallback(async (documentId: string): Promise<DocumentChunk[]> => {
    const { data, error } = await supabase
      .from('document_chunks')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: true })
    if (error || !data) return []
    return data.map(rowToChunk)
  }, [])

  const getDocumentProfile = useCallback(async (documentId: string): Promise<DocumentWritingProfile | null> => {
    const { data, error } = await supabase
      .from('document_writing_profiles')
      .select('*')
      .eq('document_id', documentId)
      .maybeSingle()
    if (error || !data) return null
    return rowToProfile(data)
  }, [])

  const getChunksByRapportId = useCallback(async (rapportId: string): Promise<DocumentChunk[]> => {
    return getDocumentChunks(rapportId)
  }, [getDocumentChunks])

  /**
   * Full pipeline helper: extracts knowledge from raw PDF text, optionally
   * applies AI enhancement, and persists chunks + profile to Supabase.
   *
   * Knowledge extraction errors are swallowed so the calling flow is never
   * blocked.
   */
  const saveDocumentKnowledgeFromText = useCallback(async (
    text: string,
    rapportId: string,
    options?: {
      objectType?: ObjectType
      documentType?: string
      objectAddress?: string
      city?: string
      region?: string
      marketSegment?: DocumentChunk['marketSegment']
      ai?: AIEnhancementOptions
    }
  ) => {
    try {
      const { chunks, profile } = await extractDocumentKnowledgeWithAI(text, rapportId, {
        objectType: options?.objectType,
        documentType: options?.documentType,
        ai: options?.ai,
      })

      // Enrich chunks with additional metadata from the calling context
      const enrichedChunks = chunks.map((chunk) => ({
        ...chunk,
        objectAddress: options?.objectAddress,
        objectType: options?.objectType,
        city: options?.city,
        region: options?.region,
        marketSegment: options?.marketSegment,
      }))

      const enrichedProfile = {
        ...profile,
        objectType: options?.objectType ?? profile.objectType,
        marketSegment: options?.marketSegment ?? profile.marketSegment,
      }

      await Promise.all([
        saveDocumentChunks(enrichedChunks),
        saveDocumentProfile(enrichedProfile),
      ])
    } catch (err) {
      console.warn('[useDocumentKnowledge] saveDocumentKnowledgeFromText failed silently:', err)
    }
  }, [saveDocumentChunks, saveDocumentProfile])

  /**
   * Updates the reuse_score of document_chunks in the Kennisbank based on
   * the acceptance rates of sections with feedback data.
   *
   * Uses the formula: new_reuse_score = clamp(current + (acceptance_rate - 0.5) * 0.1, 0, 1)
   * This means:
   * - acceptance_rate = 1.0 → +0.05 per update cycle
   * - acceptance_rate = 0.5 → no change
   * - acceptance_rate = 0.0 → -0.05 per update cycle
   */
  const updateReuseScoresFromFeedback = useCallback(async () => {
    try {
      // Fetch all feedback in one query, then group by sectie_key in memory
      const { data: allFeedback, error: feedbackError } = await supabase
        .from('sectie_feedback')
        .select('sectie_key, feedback_type')

      if (feedbackError) {
        console.warn('[useDocumentKnowledge] updateReuseScoresFromFeedback: could not fetch feedback:', feedbackError.message)
        return
      }

      if (!allFeedback || allFeedback.length === 0) return

      // Group feedback by sectie_key and compute acceptance rates in memory
      const feedbackBySectie = new Map<string, { totaal: number; geaccepteerd: number }>()
      for (const row of allFeedback) {
        const key = row.sectie_key as string
        const existing = feedbackBySectie.get(key) ?? { totaal: 0, geaccepteerd: 0 }
        existing.totaal += 1
        if (row.feedback_type === 'positief') existing.geaccepteerd += 1
        feedbackBySectie.set(key, existing)
      }

      for (const [sectieKey, stats] of feedbackBySectie) {
        if (stats.totaal === 0) continue
        const acceptanceRate = stats.geaccepteerd / stats.totaal

        // Derive chapter from sectie_key (e.g. 'b1-algemeen' → 'B')
        const chapterMatch = sectieKey.match(/^([a-zA-Z]+)/i)
        if (!chapterMatch) continue
        const chapter = chapterMatch[1].toUpperCase()

        // Fetch matching chunks
        const { data: chunks, error: chunksError } = await supabase
          .from('document_chunks')
          .select('id, reuse_score')
          .eq('chapter', chapter)

        if (chunksError) {
          console.warn('[useDocumentKnowledge] updateReuseScoresFromFeedback: could not fetch chunks for chapter', chapter)
          continue
        }

        for (const chunk of chunks ?? []) {
          const currentScore = chunk.reuse_score ?? 0.5
          const delta = (acceptanceRate - 0.5) * 0.1
          const newScore = Math.min(1.0, Math.max(0.0, currentScore + delta))

          if (Math.abs(newScore - currentScore) > 0.001) {
            await supabase
              .from('document_chunks')
              .update({ reuse_score: newScore })
              .eq('id', chunk.id)
          }
        }
      }
    } catch (err) {
      console.warn('[useDocumentKnowledge] updateReuseScoresFromFeedback failed silently:', err)
    }
  }, [])

  return {
    saveDocumentChunks,
    saveDocumentProfile,
    getDocumentChunks,
    getDocumentProfile,
    getChunksByRapportId,
    saveDocumentKnowledgeFromText,
    updateReuseScoresFromFeedback,
  }
}
