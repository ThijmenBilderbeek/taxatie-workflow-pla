// Supabase Edge Function: openai-classify
// Accepts chunk text and returns AI-enhanced classification using GPT-4o-mini.
// The OPENAI_API_KEY is stored as a Supabase secret — never exposed to the browser.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @deno-types="https://esm.sh/openai@4/types"
import OpenAI from 'https://esm.sh/openai@4'

const apiKey = Deno.env.get('OPENAI_API_KEY')
if (!apiKey) {
  console.error('[openai-classify] OPENAI_API_KEY secret is not set')
}

const openai = new OpenAI({ apiKey: apiKey ?? '' })

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
    const body = await req.json() as { text?: string }
    const text = body?.text

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
