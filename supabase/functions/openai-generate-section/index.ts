// Supabase Edge Function: openai-generate-section
// Generates AI-powered rapport section text for NRVT-conforme taxatierapporten.
// The OPENAI_API_KEY is stored as a Supabase secret — never exposed to the browser.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @deno-types="https://esm.sh/openai@4/types"
import OpenAI from 'https://esm.sh/openai@4'

const apiKey = Deno.env.get('OPENAI_API_KEY')
if (!apiKey) {
  console.error('[openai-generate-section] OPENAI_API_KEY secret is not set')
}

const openai = new OpenAI({ apiKey: apiKey ?? '' })

const MAX_REFERENCE_TEXT_LENGTH = 800

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `Je bent een expert taxateur die professionele NRVT-conforme taxatierapporten schrijft.

Instructies:
- Schrijf in formeel, zakelijk Nederlands geschikt voor een taxatierapport
- Volg de NRVT-richtlijnen (Richtlijnen Vastgoedtaxaties)
- Gebruik de verstrekte dossierdata om specifieke, feitelijke tekst te schrijven
- Neem de schrijfstijl en structuur over van de referentierapporten indien beschikbaar
- Gebruik NOOIT placeholders zoals [invullen] — schrijf altijd concrete tekst
- Als informatie ontbreekt, schrijf "Informatie niet beschikbaar" of laat de passage weg
- Houd de tekst professioneel en beknopt
- Genereer alleen de tekst voor de gevraagde sectie, geen extra uitleg of markdown`

interface DossierData {
  stap1?: Record<string, unknown>
  stap2?: Record<string, unknown>
  stap3?: Record<string, unknown>
  stap4?: Record<string, unknown>
  stap5?: Record<string, unknown>
  stap6?: Record<string, unknown>
  stap7?: Record<string, unknown>
  stap8?: Record<string, unknown>
  stap9?: Record<string, unknown>
  stap10?: Record<string, unknown>
}

interface Referentie {
  adres: string
  similarityScore: number
  sectieTekst: string
}

interface SchrijfStijl {
  toneOfVoice?: string
  detailLevel?: string
}

interface RequestBody {
  sectieKey: string
  sectieTitel: string
  dossierData: DossierData
  referenties?: Referentie[]
  templateTekst?: string
  schrijfstijl?: SchrijfStijl
}

function buildUserPrompt(
  sectieKey: string,
  sectieTitel: string,
  dossierData: DossierData,
  referenties: Referentie[],
  templateTekst: string | undefined,
  schrijfstijl: SchrijfStijl | undefined
): string {
  let prompt = `Genereer de tekst voor sectie "${sectieTitel}" (key: ${sectieKey}) van een taxatierapport.\n`

  // Add dossier data
  const dossierSections = Object.entries(dossierData).filter(([, v]) => v && Object.keys(v).length > 0)
  if (dossierSections.length > 0) {
    prompt += '\nDossiergegevens:\n'
    for (const [stap, data] of dossierSections) {
      prompt += `\n[${stap}]\n`
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (value !== null && value !== undefined && value !== '') {
          const formatted = typeof value === 'object' ? JSON.stringify(value) : String(value)
          prompt += `- ${key}: ${formatted}\n`
        }
      }
    }
  }

  // Add writing style hints
  if (schrijfstijl?.toneOfVoice || schrijfstijl?.detailLevel) {
    prompt += '\nSchrijfstijl:\n'
    if (schrijfstijl.toneOfVoice) {
      prompt += `- Toon: ${schrijfstijl.toneOfVoice}\n`
    }
    if (schrijfstijl.detailLevel) {
      prompt += `- Detailniveau: ${schrijfstijl.detailLevel}\n`
    }
  }

  // Add reference reports
  if (referenties.length > 0) {
    prompt += '\nVergelijkbare rapporten als stijlreferentie:\n'
    for (const ref of referenties) {
      const truncated =
        ref.sectieTekst.length > MAX_REFERENCE_TEXT_LENGTH
          ? ref.sectieTekst.slice(0, MAX_REFERENCE_TEXT_LENGTH) + '…'
          : ref.sectieTekst
      prompt += `\n[Referentie: ${ref.adres}, score: ${ref.similarityScore}]\n"${truncated}"\n`
    }
  }

  // Add template as structural hint
  if (templateTekst && templateTekst.trim()) {
    const truncatedTemplate =
      templateTekst.length > 600 ? templateTekst.slice(0, 600) + '…' : templateTekst
    prompt += `\nStructuurhint (huidige template-output, gebruik als structuurgids maar schrijf betere tekst):\n"${truncatedTemplate}"\n`
  }

  prompt += `\nSchrijf nu de tekst voor sectie "${sectieTitel}". Geef alleen de sectietekst, zonder opmaak, headers of uitleg.`

  return prompt
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const body = (await req.json()) as RequestBody
    const { sectieKey, sectieTitel, dossierData, referenties, templateTekst, schrijfstijl } = body

    if (!sectieKey || typeof sectieKey !== 'string') {
      return new Response(JSON.stringify({ error: 'sectieKey is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    if (!sectieTitel || typeof sectieTitel !== 'string') {
      return new Response(JSON.stringify({ error: 'sectieTitel is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    if (!dossierData || typeof dossierData !== 'object') {
      return new Response(JSON.stringify({ error: 'dossierData is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const userPrompt = buildUserPrompt(
      sectieKey,
      sectieTitel,
      dossierData,
      referenties ?? [],
      templateTekst,
      schrijfstijl
    )

    console.log(`[openai-generate-section] Generating section "${sectieKey}"`)

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    })

    const tekst = response.choices[0]?.message?.content?.trim()
    if (!tekst) {
      throw new Error('OpenAI returned an empty response')
    }

    return new Response(JSON.stringify({ tekst }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[openai-generate-section] error:', err)
    return new Response(JSON.stringify({ error: 'internal server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
