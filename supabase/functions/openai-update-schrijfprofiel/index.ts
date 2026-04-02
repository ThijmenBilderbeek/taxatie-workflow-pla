// Supabase Edge Function: openai-update-schrijfprofiel
// Analyses patterns in how a user edits AI-generated section text and produces
// a concise Dutch writing profile (~100 words).
// Called non-blocking after 'bewerkt' feedback is saved; result is upserted
// into the gebruiker_schrijfprofiel table by the calling client.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @deno-types="https://esm.sh/openai@4/types"
import OpenAI from 'https://esm.sh/openai@4'

const apiKey = Deno.env.get('OPENAI_API_KEY')
if (!apiKey) {
  console.error('[openai-update-schrijfprofiel] OPENAI_API_KEY secret is not set')
}

const openai = new OpenAI({ apiKey: apiKey ?? '' })

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Bewerking {
  originele_tekst?: string
  bewerkte_tekst?: string
  sectie_key?: string
}

interface RequestBody {
  bewerkingen: Bewerking[]
}

function buildProfielPrompt(bewerkingen: Bewerking[]): string {
  let prompt = `Analyseer de volgende ${bewerkingen.length} voorbeelden van hoe een taxateur AI-gegenereerde tekst heeft aangepast in een Nederlands taxatierapport.\n`
  prompt += `Identificeer patronen in de schrijfstijl en voorkeuren van deze taxateur.\n`
  prompt += `Schrijf een beknopt schrijfprofiel (~100 woorden max) in het Nederlands met concrete instructies.\n`
  prompt += `Gebruik formuleringen zoals "Schrijf in...", "Gebruik altijd...", "Vermijd...", "Voeg altijd toe...".\n\n`
  prompt += `Bewerkingen:\n`

  for (let i = 0; i < bewerkingen.length; i++) {
    const b = bewerkingen[i]
    prompt += `\n[Bewerking ${i + 1}${b.sectie_key ? ` — ${b.sectie_key}` : ''}]\n`
    if (b.originele_tekst) {
      const trunc = b.originele_tekst.slice(0, 300)
      prompt += `Origineel: "${trunc}${b.originele_tekst.length > 300 ? '…' : ''}"\n`
    }
    if (b.bewerkte_tekst) {
      const trunc = b.bewerkte_tekst.slice(0, 300)
      prompt += `Bewerkt:   "${trunc}${b.bewerkte_tekst.length > 300 ? '…' : ''}"\n`
    }
  }

  prompt += `\nSchrijf nu het schrijfprofiel. Geef alleen het profiel, zonder extra uitleg of opmaak.`
  return prompt
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const body = (await req.json()) as RequestBody
    const { bewerkingen } = body

    if (!bewerkingen || !Array.isArray(bewerkingen) || bewerkingen.length === 0) {
      return new Response(JSON.stringify({ error: 'bewerkingen must be a non-empty array' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const userPrompt = buildProfielPrompt(bewerkingen)

    console.log(`[openai-update-schrijfprofiel] Building writing profile from ${bewerkingen.length} edits`)

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Je bent een expert in het analyseren van schrijfstijlen in Nederlandse taxatierapporten. Jouw taak is om een persoonlijk schrijfprofiel samen te stellen op basis van bewerkingspatronen.',
        },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 300,
    })

    const profiel = response.choices[0]?.message?.content?.trim()
    if (!profiel) {
      throw new Error('OpenAI returned an empty response')
    }

    return new Response(JSON.stringify({ profiel }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[openai-update-schrijfprofiel] error:', err)
    return new Response(JSON.stringify({ error: 'internal server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
