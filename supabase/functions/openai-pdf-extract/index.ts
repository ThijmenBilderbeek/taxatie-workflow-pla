// Supabase Edge Function: openai-pdf-extract
// Accepts raw PDF text and a list of missing field names.
// Returns AI-extracted field values for those missing fields using GPT-4o-mini.
// The OPENAI_API_KEY is stored as a Supabase secret — never exposed to the browser.

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

const SYSTEM_PROMPT = `Je bent een expert in Nederlandse taxatierapporten (vastgoedwaardering).
Analyseer de gegeven PDF-tekst van een taxatierapport en extraheer de gevraagde velden.

Retourneer een JSON-object met de velden en hun waarden. Gebruik de volgende veldnamen exact zoals opgegeven.
Voeg per veld ook een "confidence" waarde toe: "high" als je zeker bent, "medium" als je redelijk zeker bent.

Richtlijnen per veldtype:
- straat: naam van de straat (bijv. "Hoofdstraat"), zonder huisnummer
- huisnummer: huisnummer inclusief toevoeging (bijv. "13", "13-A", "13a", "13bis")
- postcode: Nederlandse postcode in formaat "1234 AB"
- plaats: naam van de stad/gemeente (bijv. "Amsterdam", "Den Haag", "'s-Hertogenbosch")
- typeObject: een van [kantoor, bedrijfscomplex, bedrijfshal, winkel, woning, appartement, overig]
- gebruiksdoel: een van [eigenaar_gebruiker, verhuurd_belegging, leegstand, overig]
- bvo: bruto vloeroppervlakte in m² als getal (bijv. 1250)
- vvo: verhuurbaar vloeroppervlakte in m² als getal
- perceeloppervlak: perceeloppervlakte in m² als getal
- marktwaarde: marktwaarde in euro's als getal (bijv. 1250000)
- bar: bruto aanvangsrendement als getal in procenten (bijv. 7.5)
- nar: netto aanvangsrendement als getal in procenten (bijv. 6.75)
- waardepeildatum: datum in ISO-formaat "YYYY-MM-DD"
- inspectiedatum: datum in ISO-formaat "YYYY-MM-DD"
- bouwjaar: bouwjaar als getal (bijv. 1985)
- naamTaxateur: volledige naam van de taxateur
- objectnaam: naam of omschrijving van het object
- gemeente: naam van de gemeente
- provincie: naam van de provincie
- energielabel: energielabel letter (A++++, A+++, A++, A+, A, B, C, D, E, F, G, of "geen")
- kapitalisatiefactor: kapitalisatiefactor als getal (bijv. 12.5)
- markthuurPerJaar: markthuur per jaar in euro's als getal
- huurprijsPerJaar: huurprijs per jaar in euro's als getal
- eigendomssituatie: eigendomssituatie als tekst (bijv. "Eigendom", "Erfpacht")
- ligging: een van [binnenstad, woonwijk, bedrijventerrein, buitengebied, gemengd]
- aannames: aannames en uitgangspunten van de taxatie als tekst
- voorbehouden: voorbehouden bij de taxatie als tekst
- bijzondereOmstandigheden: bijzondere omstandigheden als tekst
- algemeneUitgangspunten: algemene uitgangspunten als tekst
- bijzondereUitgangspunten: bijzondere uitgangspunten als tekst
- ontvangenInformatie: overzicht van ontvangen/verstrekte informatie als tekst
- wezenlijkeVeranderingen: wezenlijke veranderingen na inspectiedatum als tekst
- taxatieOnnauwkeurigheid: taxatie onnauwkeurigheid/onzekerheidsmarge als tekst
- swotSterktes: sterktes (strengths) uit de SWOT-analyse, als opsomming
- swotZwaktes: zwaktes (weaknesses) uit de SWOT-analyse, als opsomming
- swotKansen: kansen (opportunities) uit de SWOT-analyse, als opsomming
- swotBedreigingen: bedreigingen (threats) uit de SWOT-analyse, als opsomming

Retourneer ALLEEN het JSON-object met de gevraagde velden, zonder uitleg.
Laat een veld weg als de informatie niet in de tekst te vinden is.

Voorbeeldformaat:
{
  "straat": { "value": "Hoofdstraat", "confidence": "high" },
  "huisnummer": { "value": "13", "confidence": "high" },
  "marktwaarde": { "value": 1250000, "confidence": "medium" }
}`

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** 
 * Maximum characters of PDF text to send to the AI (cost-conscious).
 * 30 000 chars ≈ 7 500 tokens, which covers a significantly larger portion
 * of the report while remaining well within the gpt-4o-mini context window.
 * The client selects the most relevant sections before sending, so the
 * actual content quality is higher than a blind first-N-chars truncation.
 */
const MAX_TEXT_CHARS = 30000

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const body = await req.json() as { text?: string; missingFields?: string[] }
    const text = body?.text
    const missingFields = body?.missingFields

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'text is required' }), {
        status: 400,
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

    const userPrompt = `Extraheer de volgende velden uit de taxatierapport-tekst: ${missingFields.join(', ')}\n\nTekst:\n${truncatedText}`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
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
