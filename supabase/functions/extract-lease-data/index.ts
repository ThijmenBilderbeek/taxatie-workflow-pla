// Supabase Edge Function: extract-lease-data
// Accepts a PDF (as base64), uploads it to the OpenAI Files API, extracts
// structured lease information, and returns it as JSON.
// The OPENAI_API_KEY is stored as a Supabase secret — never exposed to the browser.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @deno-types="https://esm.sh/openai@4/types"
import OpenAI from 'https://esm.sh/openai@4'

const apiKey = Deno.env.get('OPENAI_API_KEY')
if (!apiKey) {
  console.error('[extract-lease-data] OPENAI_API_KEY secret is not set')
}

const openai = new OpenAI({ apiKey: apiKey ?? '' })

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  fileBase64: string
  fileName: string
}

const EXTRACTION_PROMPT = `Analyseer dit huurcontract en extraheer de volgende gegevens.
Retourneer uitsluitend een geldig JSON-object met de onderstaande velden.
Gebruik null voor velden die niet aanwezig zijn in het document.

{
  "huurder": "volledige naam van de huurder",
  "huurprijsPerJaar": 12000,
  "markthuurPerJaar": 13000,
  "ingangsdatum": "YYYY-MM-DD",
  "einddatum": "YYYY-MM-DD",
  "contracttype": "type huurcontract (bijv. kantoorruimte, bedrijfsruimte, woning)",
  "indexering": "beschrijving van de indexeringsclausule",
  "leegstandsrisico": "beoordeling of beschrijving van het leegstandsrisico"
}

Retourneer alleen het JSON-object, geen andere tekst of uitleg.`

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const body = await req.json() as RequestBody
    const { fileBase64, fileName } = body

    if (!fileBase64 || typeof fileBase64 !== 'string') {
      return new Response(JSON.stringify({ error: 'fileBase64 is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    if (!fileName || typeof fileName !== 'string') {
      return new Response(JSON.stringify({ error: 'fileName is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Decode base64 → Uint8Array → File
    const pdfBytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0))
    const pdfFile = new File([pdfBytes], fileName, { type: 'application/pdf' })

    console.log(`[extract-lease-data] Uploading file "${fileName}" (${pdfBytes.length} bytes) to OpenAI`)

    // Upload PDF to OpenAI Files API
    const uploadedFile = await openai.files.create({
      file: pdfFile,
      purpose: 'user_data',
    })

    let uploadedFileId: string | null = uploadedFile.id

    try {
      console.log(`[extract-lease-data] File uploaded with id ${uploadedFileId}, running extraction`)

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            // The 'file' content type is supported by gpt-4o but not yet reflected
            // in the OpenAI SDK TypeScript types, hence the cast.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content: [
              { type: 'text', text: EXTRACTION_PROMPT },
              { type: 'file', file: { file_id: uploadedFileId } },
            ] as any,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('OpenAI returned an empty response')
      }

      const extracted = JSON.parse(content)

      console.log('[extract-lease-data] Extraction successful')

      return new Response(JSON.stringify({ success: true, data: extracted }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    } finally {
      // Always clean up the uploaded file
      if (uploadedFileId) {
        await openai.files.del(uploadedFileId).catch((err) =>
          console.warn('[extract-lease-data] Failed to delete uploaded file:', err instanceof Error ? err.message : err)
        )
      }
    }
  } catch (err) {
    console.error('[extract-lease-data] error:', err)
    return new Response(JSON.stringify({ error: 'internal server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
