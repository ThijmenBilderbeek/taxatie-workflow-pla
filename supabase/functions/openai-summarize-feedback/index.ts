// Supabase Edge Function: openai-summarize-feedback
// Receives all feedback records for a given context (field or section) and
// produces a concise Dutch summary (~100 words) of the key lessons/preferences.
// Called non-blocking after new feedback is saved; result is upserted into
// the feedback_samenvattingen table by the calling client.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @deno-types="https://esm.sh/openai@4/types"
import OpenAI from 'https://esm.sh/openai@4'

const apiKey = Deno.env.get('OPENAI_API_KEY')
if (!apiKey) {
  console.error('[openai-summarize-feedback] OPENAI_API_KEY secret is not set')
}

const openai = new OpenAI({ apiKey: apiKey ?? '' })

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FeedbackRecord {
  feedback_type?: string
  reden?: string
  toelichting?: string
  gesuggereerde_tekst?: string
  originele_tekst?: string
  bewerkte_tekst?: string
}

interface RequestBody {
  contextKey: string
  contextType: 'veld' | 'sectie'
  feedbackRecords: FeedbackRecord[]
}

function buildSummarizePrompt(
  contextKey: string,
  contextType: 'veld' | 'sectie',
  feedbackRecords: FeedbackRecord[]
): string {
  const contextLabel = contextType === 'veld' ? `veld "${contextKey}"` : `sectie "${contextKey}"`

  let prompt = `Analyseer de volgende ${feedbackRecords.length} feedbackrecord(s) voor het ${contextLabel} in een Nederlands taxatierapport.\n`
  prompt += `Schrijf een beknopte samenvatting (~100 woorden max) in het Nederlands met de belangrijkste lessen en voorkeuren.\n`
  prompt += `Gebruik instructieve formuleringen zoals "Vermijd...", "Gebruik altijd...", "Schrijf in..."-stijl.\n\n`
  prompt += `Feedbackrecords:\n`

  for (let i = 0; i < feedbackRecords.length; i++) {
    const fb = feedbackRecords[i]
    prompt += `\n[Record ${i + 1}]\n`
    if (fb.feedback_type) prompt += `- Type: ${fb.feedback_type}\n`
    if (fb.reden) prompt += `- Reden: ${fb.reden}\n`
    if (fb.toelichting) prompt += `- Toelichting: ${fb.toelichting}\n`
    if (fb.originele_tekst) {
      const trunc = fb.originele_tekst.slice(0, 200)
      prompt += `- Originele tekst: "${trunc}${fb.originele_tekst.length > 200 ? '…' : ''}"\n`
    }
    if (fb.bewerkte_tekst) {
      const trunc = fb.bewerkte_tekst.slice(0, 200)
      prompt += `- Bewerkte tekst: "${trunc}${fb.bewerkte_tekst.length > 200 ? '…' : ''}"\n`
    }
  }

  prompt += `\nSchrijf nu de samenvatting. Geef alleen de samenvatting, zonder extra uitleg of opmaak.`
  return prompt
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const body = (await req.json()) as RequestBody
    const { contextKey, contextType, feedbackRecords } = body

    if (!contextKey || typeof contextKey !== 'string') {
      return new Response(JSON.stringify({ error: 'contextKey is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    if (!contextType || !['veld', 'sectie'].includes(contextType)) {
      return new Response(JSON.stringify({ error: 'contextType must be "veld" or "sectie"' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    if (!feedbackRecords || !Array.isArray(feedbackRecords) || feedbackRecords.length === 0) {
      return new Response(JSON.stringify({ error: 'feedbackRecords must be a non-empty array' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const userPrompt = buildSummarizePrompt(contextKey, contextType, feedbackRecords)

    console.log(`[openai-summarize-feedback] Summarizing ${feedbackRecords.length} records for ${contextType} "${contextKey}"`)

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Je bent een expert in het analyseren van feedback op Nederlandse taxatierapporten. Jouw taak is om feedback samen te vatten tot beknopte, bruikbare instructies voor een AI-assistent.',
        },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 300,
    })

    const samenvatting = response.choices[0]?.message?.content?.trim()
    if (!samenvatting) {
      throw new Error('OpenAI returned an empty response')
    }

    return new Response(JSON.stringify({ samenvatting }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[openai-summarize-feedback] error:', err)
    return new Response(JSON.stringify({ error: 'internal server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
