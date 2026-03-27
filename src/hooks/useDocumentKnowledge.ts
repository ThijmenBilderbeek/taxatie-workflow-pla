import { useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { DocumentChunk, DocumentWritingProfile, AIEnhancementOptions } from '@/types/kennisbank'
import { extractDocumentKnowledgeWithAI } from '@/lib/documentKnowledgeExtractor'
import type { ObjectType } from '@/types'

function chunkToRow(chunk: DocumentChunk, userId: string) {
  return {
    user_id: userId,
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
    updated_at: new Date().toISOString(),
  }
}

function profileToRow(profile: DocumentWritingProfile, userId: string) {
  return {
    user_id: userId,
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
  const saveDocumentChunks = useCallback(async (chunks: DocumentChunk[]) => {
    if (chunks.length === 0) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const rows = chunks.map((c) => chunkToRow(c, user.id))
    const { error } = await supabase.from('document_chunks').insert(rows)
    if (error) {
      console.error('[useDocumentKnowledge] saveDocumentChunks error:', error)
    }
  }, [])

  const saveDocumentProfile = useCallback(async (profile: DocumentWritingProfile) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const row = profileToRow(profile, user.id)
    const { error } = await supabase
      .from('document_writing_profiles')
      .upsert(row, { onConflict: 'document_id' })
    if (error) {
      console.error('[useDocumentKnowledge] saveDocumentProfile error:', error)
    }
  }, [])

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

  return {
    saveDocumentChunks,
    saveDocumentProfile,
    getDocumentChunks,
    getDocumentProfile,
    getChunksByRapportId,
    saveDocumentKnowledgeFromText,
  }
}
