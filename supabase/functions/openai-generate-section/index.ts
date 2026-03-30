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

// Maximale tekens voor de volledige user-prompt (voorkomt overschrijding ~3000 tokens)
const MAX_PROMPT_CHARS = 10000

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

interface TemplateChunk {
  text: string
  chapter: string
  chunkType: string
}

interface StyleExample {
  text: string
  tones: string[]
}

interface WritingGuidance {
  toneOfVoice: string
  detailLevel: string
  standardizationLevel: string
}

interface KennisbankContext {
  templateChunks: TemplateChunk[]
  styleExamples: StyleExample[]
  writingGuidance: WritingGuidance | null
}

interface EerdereFeedback {
  feedbackType: string
  reden?: string
  toelichting?: string
  origineleTekst?: string
  bewerkteTekst?: string
}

interface RequestBody {
  sectieKey: string
  sectieTitel: string
  dossierData: DossierData
  referenties?: Referentie[]
  templateTekst?: string
  schrijfstijl?: SchrijfStijl
  kennisbankContext?: KennisbankContext
  eerdereFeedback?: EerdereFeedback[]
  previousSectionsSummary?: string
  model?: string
  batchSecties?: BatchSectie[]
}

interface BatchSectie {
  sectieKey: string
  sectieTitel: string
  dossierData: DossierData
  templateTekst?: string
}

function buildUserPrompt(
  sectieKey: string,
  sectieTitel: string,
  dossierData: DossierData,
  referenties: Referentie[],
  templateTekst: string | undefined,
  schrijfstijl: SchrijfStijl | undefined,
  kennisbankContext: KennisbankContext | undefined,
  eerdereFeedback: EerdereFeedback[] | undefined,
  previousSectionsSummary?: string
): string {
  let prompt = `Genereer de tekst voor sectie "${sectieTitel}" (key: ${sectieKey}) van een taxatierapport.\n`

  // Voeg dossierdata toe
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

  // Voeg kennisbank schrijfstijl toe (prioriteit boven schrijfstijl uit referenties)
  if (kennisbankContext?.writingGuidance) {
    const g = kennisbankContext.writingGuidance
    prompt += '\nSchrijfstijl (vanuit Kennisbank):\n'
    prompt += `- Toon: ${g.toneOfVoice}\n`
    prompt += `- Detailniveau: ${g.detailLevel}\n`
    prompt += `- Standaardisatieniveau: ${g.standardizationLevel}\n`
  } else if (schrijfstijl?.toneOfVoice || schrijfstijl?.detailLevel) {
    // Fallback: schrijfstijl uit referentierapporten
    prompt += '\nSchrijfstijl:\n'
    if (schrijfstijl.toneOfVoice) {
      prompt += `- Toon: ${schrijfstijl.toneOfVoice}\n`
    }
    if (schrijfstijl.detailLevel) {
      prompt += `- Detailniveau: ${schrijfstijl.detailLevel}\n`
    }
  }

  // Voeg kennisbank template-chunks toe
  if (kennisbankContext?.templateChunks && kennisbankContext.templateChunks.length > 0) {
    prompt += '\nTemplate-teksten uit vergelijkbare rapporten (gebruik als basis):\n'
    for (const chunk of kennisbankContext.templateChunks) {
      prompt += `\n[Hoofdstuk: ${chunk.chapter}, Type: ${chunk.chunkType}]\n"${chunk.text}"\n`
    }
  }

  // Voeg kennisbank stijlvoorbeelden toe
  if (kennisbankContext?.styleExamples && kennisbankContext.styleExamples.length > 0) {
    prompt += '\nVoorbeelden van de gewenste schrijfstijl:\n'
    for (const example of kennisbankContext.styleExamples) {
      const tonenLabel = example.tones.length > 0 ? ` [${example.tones.join(', ')}]` : ''
      prompt += `\n[Stijlvoorbeeld${tonenLabel}]\n"${example.text}"\n`
    }
  }

  // Voeg referentierapporten toe
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

  // Voeg template toe als structuurhint
  if (templateTekst && templateTekst.trim()) {
    const truncatedTemplate =
      templateTekst.length > 600 ? templateTekst.slice(0, 600) + '…' : templateTekst
    prompt += `\nStructuurhint (huidige template-output, gebruik als structuurgids maar schrijf betere tekst):\n"${truncatedTemplate}"\n`
  }

  // Voeg eerdere feedback toe aan de prompt
  if (eerdereFeedback && eerdereFeedback.length > 0) {
    prompt += '\nRecente feedback op eerdere generaties van deze sectie (neem dit mee):\n'
    for (const fb of eerdereFeedback) {
      if (fb.feedbackType === 'bewerkt') {
        const origTrunc = fb.origineleTekst ? `"${fb.origineleTekst.slice(0, 200)}${fb.origineleTekst.length > 200 ? '…' : ''}"` : '(niet beschikbaar)'
        const bewTrunc = fb.bewerkteTekst ? `"${fb.bewerkteTekst.slice(0, 200)}${fb.bewerkteTekst.length > 200 ? '…' : ''}"` : '(niet beschikbaar)'
        prompt += `- Type: bewerkt — De taxateur heeft de tekst aangepast. Origineel: ${origTrunc} → Bewerkt: ${bewTrunc}\n`
      } else if (fb.feedbackType === 'negatief') {
        prompt += `- Type: negatief`
        if (fb.reden) prompt += ` — Reden: ${fb.reden}`
        if (fb.toelichting) prompt += ` — Toelichting: "${fb.toelichting}"`
        prompt += '\n'
      }
    }
  }

  // Voeg eerder gegenereerde secties toe als context voor consistentie
  if (previousSectionsSummary && previousSectionsSummary.trim()) {
    prompt += '\n--- EERDER GEGENEREERDE SECTIES (SAMENVATTING) ---\n'
    prompt += previousSectionsSummary.trim()
    prompt += '\n\nLet op: Zorg dat de tekst die je genereert consistent is met bovenstaande eerder gegenereerde secties. Vermijd tegenstrijdige informatie.\n'
  }

  prompt += `\nSchrijf nu de tekst voor sectie "${sectieTitel}". Geef alleen de sectietekst, zonder opmaak, headers of uitleg.`

  // Trunceer de volledige prompt als die te lang is
  if (prompt.length > MAX_PROMPT_CHARS) {
    prompt = prompt.slice(0, MAX_PROMPT_CHARS) + '\n…[ingekort voor token-budget]'
  }

  return prompt
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const body = (await req.json()) as RequestBody
    const { sectieKey, sectieTitel, dossierData, referenties, templateTekst, schrijfstijl, kennisbankContext, eerdereFeedback, previousSectionsSummary, model, batchSecties } = body

    // -----------------------------------------------------------------------
    // Batch mode: generate multiple short sections in one call
    // -----------------------------------------------------------------------
    if (batchSecties && Array.isArray(batchSecties) && batchSecties.length > 0) {
      const batchModel = model ?? 'gpt-4o-mini' // Batched sections are always non-complex

      const batchPrompt = batchSecties
        .map(({ sectieKey: bKey, sectieTitel: bTitel, dossierData: bData, templateTekst: bTemplate }) => {
          let part = `\n=== SECTIE "${bTitel}" (key: ${bKey}) ===\n`
          const dossierSections = Object.entries(bData ?? {}).filter(([, v]) => v && Object.keys(v as object).length > 0)
          if (dossierSections.length > 0) {
            part += 'Dossiergegevens:\n'
            for (const [stap, data] of dossierSections) {
              part += `[${stap}]\n`
              for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
                if (value !== null && value !== undefined && value !== '') {
                  const formatted = typeof value === 'object' ? JSON.stringify(value) : String(value)
                  part += `- ${key}: ${formatted}\n`
                }
              }
            }
          }
          if (bTemplate && bTemplate.trim()) {
            const truncated = bTemplate.length > 300 ? bTemplate.slice(0, 300) + '…' : bTemplate
            part += `Structuurhint: "${truncated}"\n`
          }
          return part
        })
        .join('\n')

      const batchKeys = batchSecties.map((s) => s.sectieKey)
      const batchUserPrompt = `Genereer tekst voor de volgende secties van een taxatierapport.
Geef het resultaat terug als geldig JSON-object in dit formaat (geen extra tekst erbuiten):
{"secties": {"sectieKey1": "tekst voor sectie 1", "sectieKey2": "tekst voor sectie 2"}}

De sectie-keys zijn: ${batchKeys.join(', ')}
${batchPrompt}

Schrijf voor elke sectie beknopte, professionele tekst zonder opmaak. Retourneer alleen het JSON-object.`

      const truncatedBatchPrompt = batchUserPrompt.length > MAX_PROMPT_CHARS
        ? batchUserPrompt.slice(0, MAX_PROMPT_CHARS) + '\n…[ingekort voor token-budget]'
        : batchUserPrompt

      console.log(`[openai-generate-section] Batch generating ${batchSecties.length} sections`)

      const batchResponse = await openai.chat.completions.create({
        model: batchModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: truncatedBatchPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      })

      const batchContent = batchResponse.choices[0]?.message?.content?.trim()
      if (!batchContent) {
        throw new Error('OpenAI returned an empty response for batch generation')
      }

      let batchParsed: { secties?: Record<string, string> }
      try {
        batchParsed = JSON.parse(batchContent) as { secties?: Record<string, string> }
      } catch {
        throw new Error('OpenAI returned invalid JSON for batch generation')
      }
      const results = batchParsed.secties ?? {}

      return new Response(JSON.stringify({ results }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    if (!sectieKey || typeof sectieKey !== 'string') {
      return new Response(JSON.stringify({ error: 'sectieKey is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Handle coherence check special case — always use gpt-4o-mini
    if (sectieKey === '__coherence_check') {
      const allSectionsSummary = (dossierData as unknown as { allSectionsSummary?: string }).allSectionsSummary ?? ''

      const coherenceSystemPrompt = 'Je bent een expert taxateur die taxatierapporten controleert op interne consistentie.'
      const coherenceUserPrompt = `Controleer het volgende taxatierapport op interne inconsistenties. Geef de uitkomst als JSON.

Sectie-samenvattingen:
${allSectionsSummary}

Geef een JSON-antwoord in dit formaat:
{
  "isCoherent": boolean,
  "inconsistenties": [
    {
      "sectieKeys": ["sectie-key-1", "sectie-key-2"],
      "beschrijving": "Beschrijving van de inconsistentie in het Nederlands",
      "ernst": "hoog" | "gemiddeld" | "laag"
    }
  ]
}

Gebruik ernst "hoog" voor tegenstrijdige feiten, "gemiddeld" voor stijlverschillen, "laag" voor kleine afwijkingen.
Als er geen inconsistenties zijn, geef dan isCoherent: true met een lege inconsistenties-array.`

      console.log('[openai-generate-section] Running coherence check')

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini', // Coherence check always uses gpt-4o-mini
        messages: [
          { role: 'system', content: coherenceSystemPrompt },
          { role: 'user', content: coherenceUserPrompt },
        ],
        temperature: 0.1,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      })

      const content = response.choices[0]?.message?.content?.trim()
      if (!content) {
        throw new Error('OpenAI returned an empty response for coherence check')
      }

      const parsed = JSON.parse(content) as {
        isCoherent: boolean
        inconsistenties: Array<{ sectieKeys: string[]; beschrijving: string; ernst: 'hoog' | 'gemiddeld' | 'laag' }>
      }

      return new Response(JSON.stringify(parsed), {
        status: 200,
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
      schrijfstijl,
      kennisbankContext,
      eerdereFeedback,
      previousSectionsSummary
    )

    // Use provided model or fall back to gpt-4o-mini
    const selectedModel = (model && typeof model === 'string') ? model : 'gpt-4o-mini'
    console.log(`[openai-generate-section] Generating section "${sectieKey}" with model "${selectedModel}"${kennisbankContext ? ' (met Kennisbank-context)' : ''}`)

    const response = await openai.chat.completions.create({
      model: selectedModel,
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
