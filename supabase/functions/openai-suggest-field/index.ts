// Supabase Edge Function: openai-suggest-field
// Generates AI-powered field suggestions for taxatie wizard based on similar historical reports.
// The OPENAI_API_KEY is stored as a Supabase secret — never exposed to the browser.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @deno-types="https://esm.sh/openai@4/types"
import OpenAI from 'https://esm.sh/openai@4'

const apiKey = Deno.env.get('OPENAI_API_KEY')
if (!apiKey) {
  console.error('[openai-suggest-field] OPENAI_API_KEY secret is not set')
}

const openai = new OpenAI({ apiKey: apiKey ?? '' })

const MAX_REFERENCE_TEXT_LENGTH = 500

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface HuidigObject {
  type?: string
  adres?: string
  bvo?: number
  bouwjaar?: number
  coordinaten?: { lat: number; lng: number }
  energielabel?: string
  gebruiksdoel?: string
}

interface Referentie {
  adres: string
  similarityScore: number
  afstandKm: number
  type?: string
  bvo?: number
  tekst: string
}

interface EerdereFeedback {
  reden: string
  toelichting?: string
}

interface RequestBody {
  veldNaam: string
  stap: number
  huidigObject: HuidigObject
  referenties: Referentie[]
  eerdereFeedback?: EerdereFeedback[]
}

function buildSystemPrompt(eerdereFeedback: EerdereFeedback[]): string {
  let prompt = `Je bent een expert in het schrijven van Nederlandse taxatierapporten (vastgoedwaardering).
Je taak is om een professionele tekst te genereren voor een specifiek veld in een taxatierapport.

Instructies:
- Gebruik een professionele, zakelijke taxatietoon
- Neem de schrijfstijl en structuur over van de gegeven referentierapporten
- Pas de inhoud aan voor het SPECIFIEKE object (gebruik het juiste adres, locatie en kenmerken)
- Schrijf in het Nederlands
- Genereer alleen de tekst voor het gevraagde veld, geen extra uitleg
- Houd de tekst beknopt en feitelijk`

  if (eerdereFeedback && eerdereFeedback.length > 0) {
    prompt += '\n\nRecente feedback op eerdere suggesties (neem dit mee):'
    for (const fb of eerdereFeedback) {
      prompt += `\n- Reden: ${fb.reden}`
      if (fb.toelichting) {
        prompt += ` — Toelichting: ${fb.toelichting}`
      }
    }
  }

  return prompt
}

function buildUserPrompt(
  veldNaam: string,
  huidigObject: HuidigObject,
  referenties: Referentie[]
): string {
  const adres = huidigObject.adres || 'onbekend adres'
  const type = huidigObject.type || 'onbekend type'
  const bvo = huidigObject.bvo ? `${huidigObject.bvo} m²` : 'onbekend'
  const bouwjaar = huidigObject.bouwjaar ? String(huidigObject.bouwjaar) : 'onbekend'
  const gebruiksdoel = huidigObject.gebruiksdoel || 'onbekend'

  let prompt = `Genereer tekst voor het veld "${veldNaam}" van een taxatierapport.

Het huidige object:
- Adres: ${adres}
- Type: ${type}
- BVO: ${bvo}
- Bouwjaar: ${bouwjaar}
- Gebruiksdoel: ${gebruiksdoel}`

  if (huidigObject.energielabel) {
    prompt += `\n- Energielabel: ${huidigObject.energielabel}`
  }

  if (referenties.length > 0) {
    prompt += '\n\nVergelijkbare rapporten als referentie:'
    for (const ref of referenties) {
      prompt += `\n\n[Referentie: ${ref.adres}, score: ${ref.similarityScore}, afstand: ${ref.afstandKm} km]`
      if (ref.tekst && ref.tekst.trim()) {
        const truncated = ref.tekst.length > MAX_REFERENCE_TEXT_LENGTH ? ref.tekst.slice(0, MAX_REFERENCE_TEXT_LENGTH) + '…' : ref.tekst
        prompt += `\nTekst: "${truncated}"`
      }
    }
  }

  prompt += `\n\nSchrijf nu de tekst voor het veld "${veldNaam}" passend bij het huidige object. Geef alleen de tekst, zonder opmaak of uitleg.`

  return prompt
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const body = await req.json() as RequestBody
    const { veldNaam, stap, huidigObject, referenties, eerdereFeedback } = body

    if (!veldNaam || typeof veldNaam !== 'string') {
      return new Response(JSON.stringify({ error: 'veldNaam is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    if (!huidigObject || typeof huidigObject !== 'object') {
      return new Response(JSON.stringify({ error: 'huidigObject is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const systemPrompt = buildSystemPrompt(eerdereFeedback ?? [])
    const userPrompt = buildUserPrompt(veldNaam, huidigObject, referenties ?? [])

    console.log(`[openai-suggest-field] Generating suggestion for veld "${veldNaam}", stap ${stap}`)

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
    })

    const suggestie = response.choices[0]?.message?.content?.trim()
    if (!suggestie) {
      throw new Error('OpenAI returned an empty response')
    }

    return new Response(JSON.stringify({ suggestie }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[openai-suggest-field] error:', err)
    return new Response(JSON.stringify({ error: 'internal server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
