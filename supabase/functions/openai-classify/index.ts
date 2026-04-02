// Supabase Edge Function: openai-classify
// Accepts chunk text and returns AI-enhanced classification using GPT-4o-mini.
// The OPENAI_API_KEY is stored as a Supabase secret — never exposed to the browser.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @deno-types="https://esm.sh/openai@4/types"
import OpenAI from 'https://esm.sh/openai@4'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const apiKey = Deno.env.get('OPENAI_API_KEY')
if (!apiKey) {
  console.error('[openai-classify] OPENAI_API_KEY secret is not set')
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
      sectie_key: '__classify',
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCost,
      is_cached: false,
      is_batch: false,
    })
  } catch (err) {
    console.warn('[openai-classify] Failed to log usage:', err instanceof Error ? err.message : err)
  }
}

const SYSTEM_PROMPT = `Je bent een expert in Nederlandse taxatierapporten (vastgoedwaardering).
Analyseer de gegeven tekstpassage en retourneer een JSON-object met de volgende velden:

{
  "chunkType": een van ["narratief","opsomming","tabel","conclusie","inleiding","juridisch","technisch","financieel","beschrijving"],
  "writingFunction": een van ["beschrijvend","analyserend","concluderend","opsommend","vergelijkend","normatief"],
  "tones": array van ["formeel","zakelijk","neutraal","technisch","informatief"] (minimaal 1),
  "specificity": een van ["standaard","object_specifiek","gemengd"],
  "templateCandidate": boolean — true als de tekst herbruikbaar is als sjabloon voor andere rapporten,
  "variablesDetected": array van strings — plaatshouders gevonden in de tekst zoals adressen, bedragen, datums, namen
}

Retourneer uitsluitend het JSON-object, zonder uitleg.`

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const body = await req.json() as { text?: string; generateEmbedding?: boolean }
    const text = body?.text
    const generateEmbedding = body?.generateEmbedding === true

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'text is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Truncate to stay well within token limits (≈ 1500 chars ≈ 375 tokens)
    const truncatedText = text.length > 2000 ? text.slice(0, 2000) + '…' : text

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: truncatedText },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1, // Low temperature for consistent classification
    })

    const raw = response.choices[0]?.message?.content
    if (!raw) {
      throw new Error('OpenAI returned an empty response')
    }
    const classification = JSON.parse(raw)

    // Log usage
    if (response.usage) {
      await logUsage(req, 'gpt-4o-mini',
        response.usage.prompt_tokens, response.usage.completion_tokens,
        response.usage.total_tokens)
    }

    // Optionally generate a vector embedding for semantic search
    if (generateEmbedding) {
      try {
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: truncatedText,
        })
        const embedding = embeddingResponse.data[0]?.embedding
        if (embedding) {
          classification.embedding = embedding
        }
      } catch (embeddingErr) {
        console.warn('[openai-classify] embedding generation failed, returning classification only. Error:', embeddingErr instanceof Error ? embeddingErr.message : embeddingErr)
      }
    }

    return new Response(JSON.stringify(classification), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[openai-classify] error:', err)
    return new Response(JSON.stringify({ error: 'internal server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
