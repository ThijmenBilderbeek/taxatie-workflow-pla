// Supabase Edge Function: openai-pdf-extract
// Accepts a chunk of PDF text and a list of missing field names.
// Returns AI-extracted field values for those missing fields using GPT-4o-mini.
// The OPENAI_API_KEY is stored as a Supabase secret — never exposed to the browser.
//
// Request body:
//   text          – chunk content (required)
//   missingFields – array of field names to fill (required)
//   chunkContext  – optional metadata: { sectionTitle, chunkIndex, totalChunks }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @deno-types="https://esm.sh/openai@4/types"
import OpenAI from 'https://esm.sh/openai@4'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const apiKey = Deno.env.get('OPENAI_API_KEY')
if (!apiKey) {
  console.error('[openai-pdf-extract] OPENAI_API_KEY secret is not set')
}

const openai = new OpenAI({ apiKey: apiKey ?? '' })

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o':      { input: 2.50, output: 10.00 },
}

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o-mini']
  return (promptTokens / 1_000_000) * pricing.input + (completionTokens / 1_000_000) * pricing.output
}

async function logUsage(
  req: Request,
  model: string,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) return

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    let userId: string | null = null
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const { data } = await supabaseAdmin.auth.getUser(token)
      userId = data.user?.id ?? null
    }

    let kantoorId: string | null = null
    if (userId) {
      const { data: membership } = await supabaseAdmin
        .from('kantoor_members')
        .select('kantoor_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()
      kantoorId = membership?.kantoor_id ?? null
    }

    const estimatedCost = estimateCost(model, promptTokens, completionTokens)

    await supabaseAdmin.from('ai_usage_log').insert({
      user_id: userId,
      kantoor_id: kantoorId,
      dossier_id: null,
      sectie_key: '__pdf-extract',
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCost,
      is_cached: false,
      is_batch: false,
    })
  } catch (err) {
    console.warn('[openai-pdf-extract] Failed to log usage:', err instanceof Error ? err.message : err)
  }
}

/**
 * Builds a focused, dynamic system prompt that lists only the requested
 * missing fields. This prevents AI from returning fields that are already
 * filled by rule-based extraction and keeps the prompt compact.
 */
function buildSystemPrompt(missingFields: string[]): string {
  return `Je bent een data-extractie engine voor Nederlandse taxatierapporten.

INSTRUCTIES:
- Extraheer ALLEEN de volgende velden: ${missingFields.join(', ')}
- Gebruik ALLEEN informatie die letterlijk in de tekst staat
- Neem NIETS aan of leid NIETS af buiten de tekst
- Laat een veld WEG als de informatie niet expliciet in de tekst staat
- Retourneer ALLEEN een plat JSON-object zonder uitleg
- Gebruik geen geneste objecten met "value"/"confidence"
- SWOT velden (swot_sterktes, swot_zwaktes, swot_kansen, swot_bedreigingen) als arrays van strings
- Alle andere velden als string of nummer

Veldtypes:
- adres: volledig adres als string
- object_type: een van [kantoor, bedrijfscomplex, bedrijfshal, winkel, woning, appartement, overig]
- bouwjaar: getal (bijv. 1985)
- marktwaarde, marktwaarde_kk_afgerond: getal in euro's (bijv. 1250000)
- markthuur, netto_huurwaarde: getal in euro's per jaar
- marktwaarde_per_m2: getal in euro's per m²
- vloeroppervlak_bvo, vloeroppervlak_vvo, bebouwd_oppervlak: getal in m²
- energielabel: letter (A++++, A+++, A++, A+, A, B, C, D, E, F, G)
- locatie_score, object_score, courantheid_verhuur, courantheid_verkoop: tekst
- verhuurtijd_maanden, verkooptijd_maanden: getal
- dakoppervlak, glasoppervlak: getal in m²

Voorbeeld output:
{
  "bouwjaar": 2025,
  "energielabel": "A+",
  "swot_sterktes": ["Nieuwbouw", "Goede bereikbaarheid"]
}`
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** 
 * Maximum characters of PDF chunk text to send to the AI (cost-conscious).
 */
const MAX_TEXT_CHARS = 12000

interface ChunkContext {
  sectionTitle?: string
  chunkIndex?: number
  totalChunks?: number
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const body = await req.json() as { text?: string; missingFields?: string[]; chunkContext?: ChunkContext }
    const text = body?.text
    const missingFields = body?.missingFields
    const chunkContext = body?.chunkContext

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'text is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Reject oversized text fields early to avoid OpenAI token limit errors.
    if (text.length > MAX_TEXT_CHARS * 3) {
      return new Response(JSON.stringify({ error: 'text exceeds maximum allowed length' }), {
        status: 413,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    if (!missingFields || !Array.isArray(missingFields) || missingFields.length === 0) {
      return new Response(JSON.stringify({ error: 'missingFields is required and must be a non-empty array' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Truncate text to stay within token limits
    const truncatedText = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) + '…' : text

    // Build context line for the prompt
    const contextLine = chunkContext
      ? `\nDit is chunk ${(chunkContext.chunkIndex ?? 0) + 1}/${chunkContext.totalChunks ?? 1} uit sectie "${chunkContext.sectionTitle ?? 'onbekend'}".`
      : ''

    const userPrompt = `Extraheer de volgende velden uit deze tekst: ${missingFields.join(', ')}${contextLine}\n\nTekst:\n${truncatedText}`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: buildSystemPrompt(missingFields) },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    })

    const raw = response.choices[0]?.message?.content
    if (!raw) {
      throw new Error('OpenAI returned an empty response')
    }
    const extracted = JSON.parse(raw)

    // Log usage
    if (response.usage) {
      await logUsage(req, 'gpt-4o-mini',
        response.usage.prompt_tokens, response.usage.completion_tokens,
        response.usage.total_tokens)
    }

    return new Response(JSON.stringify(extracted), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[openai-pdf-extract] error:', err)
    return new Response(JSON.stringify({ error: 'internal server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
