import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { ChunkType, MarketSegment } from '@/types/kennisbank'
import type { ObjectType, Dossier } from '@/types'

export interface TemplateChunk {
  id: string
  documentId: string
  cleanText: string
  templateText: string
  chapter: string
  chunkType: ChunkType
  reuseScore: number
  variablesDetected: string[]
}

export interface TemplatesPerChapter {
  chapter: string
  templates: TemplateChunk[]
}

interface UseKennisbankTemplatesOptions {
  objectType?: ObjectType
  marketSegment?: MarketSegment
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Fills template placeholders with actual dossier data.
 * Unmappable placeholders (e.g. {{percentage}}) are left unchanged.
 */
export function fillTemplate(templateText: string, dossier: Dossier): string {
  let filled = templateText

  if (dossier.stap2) {
    const { straatnaam, huisnummer, postcode, plaats } = dossier.stap2
    const adres = [straatnaam, huisnummer].filter(Boolean).join(' ') +
      (postcode || plaats ? ', ' + [postcode, plaats].filter(Boolean).join(' ') : '')
    filled = filled.replace(/\{\{adres\}\}/g, adres)
    filled = filled.replace(/\{\{postcode\}\}/g, postcode || '{{postcode}}')
  }

  if (dossier.stap8?.marktwaarde) {
    filled = filled.replace(/\{\{marktwaarde\}\}/g, formatCurrency(dossier.stap8.marktwaarde))
  }

  if (dossier.stap1?.waardepeildatum) {
    filled = filled.replace(/\{\{datum\}\}/g, dossier.stap1.waardepeildatum)
  }

  if (dossier.stap3?.bvo) {
    filled = filled.replace(/\{\{oppervlakte\}\}/g, `${dossier.stap3.bvo} m²`)
  }

  if (dossier.stap3?.bouwjaar) {
    filled = filled.replace(/\{\{bouwjaar\}\}/g, String(dossier.stap3.bouwjaar))
  }

  if (dossier.stap1?.dossiernummer) {
    filled = filled.replace(/\{\{dossiernummer\}\}/g, dossier.stap1.dossiernummer)
  }

  // {{percentage}} is intentionally left as-is (not auto-fillable)

  return filled
}

export function useKennisbankTemplates() {
  const [templates, setTemplates] = useState<TemplatesPerChapter[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTemplates = useCallback(async (options: UseKennisbankTemplatesOptions) => {
    const { objectType, marketSegment } = options

    setIsLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('document_chunks')
        .select('id, document_id, clean_text, template_text, chapter, chunk_type, reuse_score, variables_detected')
        .eq('template_candidate', true)
        .order('reuse_score', { ascending: false })
        .limit(50)

      if (objectType) {
        query = query.eq('object_type', objectType)
      }

      if (marketSegment) {
        query = query.eq('market_segment', marketSegment)
      }

      const { data, error: queryError } = await query

      if (queryError) {
        setError(queryError.message)
        return
      }

      const byChapter: Record<string, TemplateChunk[]> = {}
      for (const row of (data || [])) {
        const chapter = (row.chapter as string) || 'Onbekend'
        if (!byChapter[chapter]) byChapter[chapter] = []
        byChapter[chapter].push({
          id: row.id as string,
          documentId: row.document_id as string,
          cleanText: (row.clean_text as string) || '',
          templateText: (row.template_text as string) || (row.clean_text as string) || '',
          chapter,
          chunkType: row.chunk_type as ChunkType,
          reuseScore: (row.reuse_score as number) || 0,
          variablesDetected: (row.variables_detected as string[]) || [],
        })
      }

      const grouped: TemplatesPerChapter[] = Object.entries(byChapter)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([chapter, templateList]) => ({ chapter, templates: templateList }))

      setTemplates(grouped)
    } catch (err) {
      setError('Fout bij het ophalen van templates')
      console.error('[useKennisbankTemplates] fetchTemplates error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    templates,
    isLoading,
    error,
    fetchTemplates,
    fillTemplate,
  }
}
