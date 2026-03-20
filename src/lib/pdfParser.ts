import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { Dossier, HistorischRapport, ObjectType, Gebruiksdoel, Ligging, Onderhoudsstaat, Energielabel, WaarderingsMethode } from '../types'
import {
  normalizeDutchDate,
  normalizeEuro,
  normalizePercent,
  normalizeArea,
  cleanupLongFieldText,
  compactWhitespace,
  parseAddress,
} from './pdfNormalizers'

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pages.push(pageText)
  }

  return pages.join('\n')
}

const NOISE_WORDS = ['taxatierapport', 'rapport', 'inhoud', 'pagina', 'inhoudsopgave', 'samenvatting']
/** Minimum text length before a sudden ALL-CAPS section header triggers truncation in cleanExtracted */
const MIN_TEXT_BEFORE_CAPS_HEADER = 10

/**
 * Strips leading/trailing punctuation and whitespace, removes content after noise markers.
 */
function cleanExtracted(text: string): string {
  // Remove leading punctuation/whitespace
  let result = text.replace(/^[\s:\-–,\.]+/, '').replace(/[\s:\-–,\.]+$/, '')
  // Truncate at "Pagina", "©", or sudden page number markers
  result = result.replace(/\s*(Pagina|©|\bPg\.?\s*\d+\b).*$/i, '')
  // Truncate at sudden ALL-CAPS section headers (3+ uppercase chars at word boundary)
  const capsMatch = result.match(/\s{2,}[A-Z]{3,}/)
  if (capsMatch && capsMatch.index !== undefined && capsMatch.index > MIN_TEXT_BEFORE_CAPS_HEADER) {
    result = result.slice(0, capsMatch.index)
  }
  return result.trim()
}

/**
 * Finds a keyword/heading in the text and extracts the section following it.
 * More conservative than the naive approach: stops at newlines, next labels, etc.
 *
 * Options:
 *   singleLine: stop at first newline
 *   stopAtLabel: stop at next "Label: " pattern on new line (default: true)
 *   stopAtInlineLabel: also stop at inline "Label: " patterns (without newline)
 */
function extractSectionAfterKeyword(
  text: string,
  keywords: string[],
  maxChars = 120,
  options: { singleLine?: boolean; stopAtLabel?: boolean; stopAtInlineLabel?: boolean } = {}
): string | undefined {
  const { singleLine = false, stopAtLabel = true, stopAtInlineLabel = false } = options
  const lowerText = text.toLowerCase()
  for (const keyword of keywords) {
    const idx = lowerText.indexOf(keyword.toLowerCase())
    if (idx === -1) continue
    // Start after the keyword
    const afterKeyword = text.slice(idx + keyword.length)
    // Skip any leading colon/whitespace/dash
    const trimmed = afterKeyword.replace(/^[\s:\-–]+/, '')
    if (!trimmed) continue

    let endIdx = maxChars

    // Stop at first newline if singleLine mode
    if (singleLine) {
      const nlIdx = trimmed.indexOf('\n')
      if (nlIdx !== -1 && nlIdx < endIdx) endIdx = nlIdx
    }

    // Stop at next label-like pattern (word + colon) on its own line
    if (stopAtLabel) {
      const labelMatch = trimmed.match(/\n\s*[A-Za-zÀ-öø-ÿ][A-Za-zÀ-öø-ÿ\s]{1,25}:/)
      if (labelMatch && labelMatch.index !== undefined && labelMatch.index < endIdx) {
        endIdx = labelMatch.index
      }
    }

    // Stop at inline "Word(s): " pattern (helps with bereikbaarheid sub-fields etc.)
    if (stopAtInlineLabel) {
      // Match a space followed by a label-like word (capture group avoids lookbehind for compatibility)
      const inlineMatch = trimmed.match(/(\s{1,3})([A-Za-zÀ-öø-ÿ][A-Za-zÀ-öø-ÿ\s]{2,30}:)/)
      if (inlineMatch && inlineMatch.index !== undefined) {
        // The actual label starts after the leading whitespace
        const labelStart = inlineMatch.index + inlineMatch[1].length
        if (labelStart > 5 && labelStart < endIdx) {
          endIdx = labelStart
        }
      }
    }

    // Also stop at double newline
    const dnl = trimmed.indexOf('\n\n')
    if (dnl !== -1 && dnl < endIdx) endIdx = dnl

    const extracted = cleanExtracted(trimmed.slice(0, endIdx))
    // Filter noise: too short or starts with a noise word
    if (extracted.length < 2) continue
    if (NOISE_WORDS.some(w => extracted.toLowerCase().startsWith(w))) continue
    if (extracted.length > 5) return extracted
  }
  return undefined
}

/**
 * Extracts wizard-relevant fields from raw PDF text.
 * Returns a partial Dossier with the sections found.
 * This is best-effort: missing sections simply return undefined.
 */
export function extractWizardDataFromText(text: string): Partial<Dossier> {
  const lowerText = text.toLowerCase()

  // --- Stap 1: Algemene Gegevens ---
  // Objectnaam: look for explicit label first
  const stap1objectnaam = extractSectionAfterKeyword(
    text,
    ['objectnaam:', 'naam object:', 'pand:'],
    80,
    { singleLine: true }
  )

  // Naam taxateur: extended label synonyms
  const stap1naamTaxateur = extractSectionAfterKeyword(
    text,
    [
      'uitvoerend taxateur:',
      'naam taxateur:',
      'taxateur:',
      'beëdigd taxateur:',
      'getaxeerd door:',
    ],
    60,
    { singleLine: true }
  )

  // Inspectiedatum: extended label synonyms, handle "vrijdag 7 november 2025"
  const stap1inspectiedatumRaw = extractSectionAfterKeyword(
    text,
    [
      'inspectiedatum:',
      'datum opname en inspectie:',
      'datum opname:',
      'datum inspectie:',
      'opnamedatum:',
      'inspectiedatum',
    ],
    50,
    { singleLine: true }
  )
  const stap1inspectiedatum = stap1inspectiedatumRaw
    ? normalizeDutchDate(stap1inspectiedatumRaw)
    : undefined

  // --- Stap 2: Adres & Locatie ---
  // Gemeente: strict label with colon only, filter bestemmingsplan context
  let stap2gemeente = extractSectionAfterKeyword(text, ['gemeente:'], 50, { singleLine: true })
  if (stap2gemeente && /omgevingsplan|bestemmingsplan|raadsbesluit/i.test(stap2gemeente)) {
    stap2gemeente = undefined
  }

  const stap2provincie = extractSectionAfterKeyword(text, ['provincie:'], 30, { singleLine: true })

  const LIGGING_VALUES: Ligging[] = ['binnenstad', 'woonwijk', 'bedrijventerrein', 'buitengebied', 'gemengd']
  let stap2ligging: Ligging | undefined
  // Prefer explicit ligging label context over bare keyword match
  const liggingRaw = extractSectionAfterKeyword(
    text,
    ['ligging:', 'ligging object:', 'type ligging:'],
    50,
    { singleLine: true }
  )
  if (liggingRaw) {
    const lower = liggingRaw.toLowerCase()
    for (const val of LIGGING_VALUES) {
      if (lower.includes(val)) {
        stap2ligging = val
        break
      }
    }
  }
  if (!stap2ligging) {
    // Fallback: keyword in full text
    for (const val of LIGGING_VALUES) {
      if (lowerText.includes(val)) {
        stap2ligging = val
        break
      }
    }
  }

  // Bereikbaarheid: use stopAtInlineLabel to prevent capturing sub-fields
  const stap2bereikbaarheidRaw = extractSectionAfterKeyword(
    text,
    ['bereikbaarheid:', 'bereikbaarheid', 'ontsluiting:', 'infrastructuur:'],
    300,
    { stopAtInlineLabel: true }
  )
  const stap2bereikbaarheid = stap2bereikbaarheidRaw
    ? cleanupLongFieldText(compactWhitespace(stap2bereikbaarheidRaw), 250)
    : undefined

  // --- Stap 3: Oppervlaktes ---
  // BVO: extended label synonyms including "Totaal BVO m² of stuks"
  const bvoMatch = text.match(
    /(?:Totaal\s+BVO(?:\s+m[²2]\s+of\s+stuks)?|BVO|bruto\s+vloeroppervlak|gebruiksoppervlak(?:te)?)[:\s]+([0-9]{1,3}(?:[.,][0-9]{3})*[.,]?[0-9]*)\s*m[²2]?/i
  )
  const stap3bvo = bvoMatch ? normalizeArea(bvoMatch[1]) : undefined

  // VVO: extended label synonyms including "Totaal VVO m² of stuks"
  const vvoMatch = text.match(
    /(?:Totaal\s+VVO(?:\s+m[²2]\s+of\s+stuks)?|VVO|verhuurbaar\s+vloeroppervlak)[:\s]+([0-9]{1,3}(?:[.,][0-9]{3})*[.,]?[0-9]*)\s*m[²2]?/i
  )
  const stap3vvo = vvoMatch ? normalizeArea(vvoMatch[1]) : undefined

  // Perceeloppervlak: extended label synonyms including "Kadastrale grootte"
  const perceelMatch = text.match(
    /(?:Perceeloppervlak(?:te)?|Kaveloppervlak|Kadastrale\s+grootte|Kadastrale\s+oppervlak(?:te)?)[:\s]+([0-9]{1,3}(?:[.,][0-9]{3})*[.,]?[0-9]*)\s*m[²2]?/i
  )
  const stap3perceeloppervlak = perceelMatch ? normalizeArea(perceelMatch[1]) : undefined

  // Bouwlagen
  const bouwlagenMatch = text.match(
    /(?:aantal\s+bouwlagen|bouwlagen|verdiepingen(?:\s+incl\.?\s+begane\s+grond)?)[:\s]+([0-9]{1,2})/i
  )
  const stap3aantalBouwlagen = bouwlagenMatch ? parseInt(bouwlagenMatch[1], 10) : undefined

  const bouwjaarMatch = text.match(/(?:bouwjaar|gebouwd\s+in|jaar\s+van\s+oplevering)[:\s]+([0-9]{4})/i)
  const stap3bouwjaar = bouwjaarMatch ? parseInt(bouwjaarMatch[1], 10) : undefined

  // Aanbouwen: strict labels only, limited length, single line
  const stap3aanbouwen = extractSectionAfterKeyword(
    text,
    ['aanbouw:', 'uitbreiding:', 'bijgebouw:'],
    100,
    { singleLine: true }
  )

  // --- Stap 4: Huurgegevens ---
  const huurprijsMatch = text.match(
    /(?:huurprijs|jaarhuur|huur\s+per\s+jaar)[:\s]+(?:€\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/i
  )
  const stap4huurprijsPerJaar = huurprijsMatch ? normalizeEuro(huurprijsMatch[1]) : undefined

  // Markthuur: extended label synonyms including "Markt/herz. huur"
  const markthuurMatch = text.match(
    /(?:Markt\/herz\.\s*huur|markthuur(?:waarde|prijs)?|marktconforme\s+huur)[:\s|]+(?:€\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/i
  )
  const stap4markthuurPerJaar = markthuurMatch ? normalizeEuro(markthuurMatch[1]) : undefined

  // Contracttype: only from explicit rental contract labels, NOT from "Algemene uitgangspunten"
  // Avoid matching broad text sections by requiring colon after label
  const stap4contracttype = extractSectionAfterKeyword(
    text,
    ['contracttype:', 'type huurcontract:', 'huurovereenkomst type:'],
    80,
    { singleLine: true }
  )

  const stap4huurder = extractSectionAfterKeyword(text, ['huurder:'], 60, { singleLine: true })

  // verhuurd: only mark as verhuurd when there's actual rental evidence (not just the word "verhuurd" in descriptions)
  const stap4verhuurd =
    stap4huurder !== undefined ||
    stap4huurprijsPerJaar !== undefined ||
    (stap4contracttype !== undefined && stap4contracttype.length < 60)

  // --- Stap 6: Technische Staat ---
  const ONDERHOUD_VALUES: Onderhoudsstaat[] = ['uitstekend', 'goed', 'redelijk', 'matig', 'slecht']

  let stap6exterieurStaat: Onderhoudsstaat | undefined
  // Look for label "exterieur" or "bouwkundige staat exterieur" or "staat van onderhoud buiten"
  const exterieurRaw = extractSectionAfterKeyword(
    text,
    [
      'staat van onderhoud buiten:',
      'bouwkundige staat exterieur:',
      'exterieur staat:',
      'exterieur:',
    ],
    30,
    { singleLine: true }
  )
  if (exterieurRaw) {
    const lower = exterieurRaw.toLowerCase()
    for (const val of ONDERHOUD_VALUES) {
      if (lower.includes(val)) {
        stap6exterieurStaat = val
        break
      }
    }
  }
  if (!stap6exterieurStaat) {
    // Fallback: look for "exterieur" keyword in context
    const exterieurIdx = lowerText.indexOf('exterieur')
    if (exterieurIdx !== -1) {
      const exterieurContext = lowerText.slice(exterieurIdx, exterieurIdx + 100)
      for (const val of ONDERHOUD_VALUES) {
        if (exterieurContext.includes(val)) {
          stap6exterieurStaat = val
          break
        }
      }
    }
  }

  let stap6interieurStaat: Onderhoudsstaat | undefined
  const interieurRaw = extractSectionAfterKeyword(
    text,
    [
      'staat van onderhoud binnen:',
      'bouwkundige staat interieur:',
      'interieur staat:',
      'interieur:',
    ],
    30,
    { singleLine: true }
  )
  if (interieurRaw) {
    const lower = interieurRaw.toLowerCase()
    for (const val of ONDERHOUD_VALUES) {
      if (lower.includes(val)) {
        stap6interieurStaat = val
        break
      }
    }
  }
  if (!stap6interieurStaat) {
    const interieurIdx = lowerText.indexOf('interieur')
    if (interieurIdx !== -1) {
      const interieurContext = lowerText.slice(interieurIdx, interieurIdx + 100)
      for (const val of ONDERHOUD_VALUES) {
        if (interieurContext.includes(val)) {
          stap6interieurStaat = val
          break
        }
      }
    }
  }

  const onderhoudskostenMatch = text.match(
    /(?:onderhoudskosten|onderhoud\s+per\s+jaar)[:\s]+(?:€\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/i
  )
  const stap6onderhoudskosten = onderhoudskostenMatch
    ? normalizeEuro(onderhoudskostenMatch[1])
    : undefined

  const stap6fundering = extractSectionAfterKeyword(text, [
    'fundering:',
    'funderingstype:',
    'funderingssituatie:',
    'fundering',
  ], 120)

  const stap6dakbedekking = extractSectionAfterKeyword(text, [
    'dakbedekking:',
    'daktype:',
    'dak:',
    'dakconstruct',
  ], 120)

  const stap6installaties = extractSectionAfterKeyword(text, [
    'installaties:',
    'installatie:',
    'klimaatinstallatie:',
    'verwarmingssysteem:',
    'technische installaties:',
  ], 120)

  const stap6achterstallig = extractSectionAfterKeyword(text, [
    'achterstallig onderhoud:',
    'achterstalligonderhoud:',
    'onderhoudstoestand:',
  ], 100)

  // --- Stap 5: Juridische Info ---
  const stap5eigendomssituatie = extractSectionAfterKeyword(text, [
    'eigendomssituatie:',
    'eigendomsvorm:',
    'eigendom:',
  ], 80, { singleLine: true })

  const stap5erfpacht = extractSectionAfterKeyword(text, [
    'erfpacht:',
    'erfpachtsituatie:',
    'canonverplichting:',
  ], 80, { singleLine: true })

  const stap5zakelijkeRechten = extractSectionAfterKeyword(text, [
    'zakelijke rechten:',
    'zakelijkerechten:',
    'recht van opstal:',
    'erfdienstbaarheid:',
  ], 120)

  const stap5kwalitatieveVerplichtingen = extractSectionAfterKeyword(text, [
    'kwalitatieve verplichting:',
    'kwalitatieve verplichtingen:',
    'kettingbeding:',
  ], 120)

  const stap5bestemmingsplan = extractSectionAfterKeyword(text, [
    'bestemmingsplan:',
    'bestemming:',
    'planologische bestemming:',
  ], 150)

  // --- Stap 7: Vergunningen ---
  // Energielabel: check for "Geen"/"-"/undefined values first
  let stap7energielabel: Energielabel | undefined
  const energielabelRaw = extractSectionAfterKeyword(
    text,
    ['energielabel:', 'energieklasse:', 'energielabel'],
    20,
    { singleLine: true }
  )
  if (energielabelRaw) {
    const lower = energielabelRaw.trim().toLowerCase()
    const INVALID_LABELS = ['geen', '-', 'n.v.t.', 'nvt', 'niet beschikbaar', 'onbekend', 'niet']
    if (!INVALID_LABELS.some((v) => lower === v || lower.startsWith(v))) {
      const labelMatch = energielabelRaw.trim().match(/^([A-G][+]{0,4})/i)
      if (labelMatch) {
        stap7energielabel = labelMatch[1].toUpperCase() as Energielabel
      }
    }
  }

  // Asbest: CRITICAL FIX — check for soil/environmental context and fix logical order
  let stap7asbest: 'ja' | 'nee' | 'onbekend' | undefined
  const asbestIdx = lowerText.indexOf('asbest')
  if (asbestIdx !== -1) {
    // Get context around "asbest" (50 chars before, 200 chars after)
    const contextBefore = lowerText.slice(Math.max(0, asbestIdx - 60), asbestIdx)
    const contextAfter = lowerText.slice(asbestIdx, asbestIdx + 200)
    const fullContext = contextBefore + contextAfter

    // Check if this "asbest" occurrence is in soil/environmental text (not about the building)
    const isSoilContext = /bodem|grond|verontreiniging|milieu|omgeving/.test(contextBefore)

    if (!isSoilContext) {
      // Check negation FIRST (before positive matches, to avoid "niet aanwezig" triggering "ja")
      if (
        /geen\s+asbest|asbestvrij|niet\s+aanwezig|niet\s+vastgesteld|vrij\s+van\s+asbest/.test(fullContext)
      ) {
        stap7asbest = 'nee'
      } else if (
        /onbekend|niet\s+onderzocht|nader\s+onderzoek/.test(fullContext)
      ) {
        stap7asbest = 'onbekend'
      } else if (
        /aanwezig|vastgesteld|aangetroffen/.test(contextAfter) &&
        !/niet\s+aanwezig|niet\s+vastgesteld/.test(contextAfter)
      ) {
        stap7asbest = 'ja'
      } else {
        stap7asbest = 'onbekend'
      }
    }
    // If in soil context: don't set asbest at all (leave as undefined → will show as 'onbekend' in form)
  }

  let stap7bodemverontreiniging: 'ja' | 'nee' | 'onbekend' | undefined
  let bodemIdx = lowerText.indexOf('bodemverontreiniging')
  if (bodemIdx === -1) bodemIdx = lowerText.indexOf('bodemkwaliteit')
  if (bodemIdx !== -1) {
    const bodemContext = lowerText.slice(bodemIdx, bodemIdx + 150)
    if (bodemContext.includes('niet aanwezig') || bodemContext.includes('schoon') || bodemContext.includes('nee')) {
      stap7bodemverontreiniging = 'nee'
    } else if (bodemContext.includes('aanwezig') || bodemContext.includes('verontreinigd') || bodemContext.includes('ja')) {
      stap7bodemverontreiniging = 'ja'
    } else if (bodemContext.includes('onbekend') || bodemContext.includes('niet onderzocht')) {
      stap7bodemverontreiniging = 'onbekend'
    }
  }

  const stap7toelichting = extractSectionAfterKeyword(text, [
    'toelichting vergunningen:',
    'vergunningen toelichting:',
    'asbest toelichting:',
  ], 200)

  // --- Stap 8: Waardering ---
  const WAARDERINGSMETHODEN: { keyword: string; value: WaarderingsMethode }[] = [
    { keyword: 'vergelijkingsmethode', value: 'vergelijkingsmethode' },
    { keyword: 'bar/nar', value: 'BAR_NAR' },
    { keyword: 'bar-nar', value: 'BAR_NAR' },
    { keyword: 'dcf', value: 'DCF' },
    { keyword: 'discounted cash flow', value: 'DCF' },
    { keyword: 'kostenmethode', value: 'kostenmethode' },
    { keyword: 'combinatie', value: 'combinatie' },
  ]
  let stap8methode: WaarderingsMethode | undefined
  const methodeIdx = lowerText.search(/waarderingsmethode|taxatiemethode|gehanteerde\s+methode/)
  if (methodeIdx !== -1) {
    const methodeContext = lowerText.slice(methodeIdx, methodeIdx + 120)
    for (const { keyword, value } of WAARDERINGSMETHODEN) {
      if (methodeContext.includes(keyword)) {
        stap8methode = value
        break
      }
    }
  }
  // Fallback: detect BAR/NAR method from context if both BAR and NAR values are present
  if (!stap8methode) {
    const hasBar = /\bBAR\b/.test(text)
    const hasNar = /\bNAR\b/.test(text)
    if (hasBar && hasNar) stap8methode = 'BAR_NAR'
  }

  const ovwMatch = text.match(
    /onderhandse\s+verkoopwaarde[:\s]+(?:€\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/i
  )
  const stap8onderhandseVerkoopwaarde = ovwMatch ? normalizeEuro(ovwMatch[1]) : undefined

  // Kapitalisatiefactor: multiple label synonyms
  const kapFacMatch = text.match(/(?:kapitalisatiefactor|kap\.?factor)[:\s|]+([0-9]{1,2}[.,][0-9]{1,2})/i)
  const stap8kapitalisatiefactor = kapFacMatch ? normalizePercent(kapFacMatch[1]) : undefined

  // --- Stap 9: Aannames ---
  const stap9aannames = extractSectionAfterKeyword(text, [
    'aannames:',
    'aanname:',
  ], 200)

  const stap9voorbehouden = extractSectionAfterKeyword(text, [
    'voorbehouden:',
    'voorbehoud:',
  ], 200)

  const stap9bijzondereOmstandigheden = extractSectionAfterKeyword(text, [
    'bijzondere omstandigheden:',
    'bijzonderheden:',
  ], 200)

  // --- Build wizardData ---
  const wizardData: Partial<Dossier> = {}

  const stap1Fields: Partial<NonNullable<Dossier['stap1']>> = {}
  if (stap1objectnaam) stap1Fields.objectnaam = stap1objectnaam
  if (stap1naamTaxateur) stap1Fields.naamTaxateur = stap1naamTaxateur
  if (stap1inspectiedatum) stap1Fields.inspectiedatum = stap1inspectiedatum
  if (Object.keys(stap1Fields).length > 0) {
    wizardData.stap1 = stap1Fields as Dossier['stap1']
  }

  const stap2Fields: Partial<NonNullable<Dossier['stap2']>> = {}
  if (stap2bereikbaarheid) stap2Fields.bereikbaarheid = stap2bereikbaarheid
  if (stap2gemeente) stap2Fields.gemeente = stap2gemeente
  if (stap2provincie) stap2Fields.provincie = stap2provincie
  if (stap2ligging) stap2Fields.ligging = stap2ligging
  if (Object.keys(stap2Fields).length > 0) {
    wizardData.stap2 = stap2Fields as Dossier['stap2']
  }

  const stap3Fields: Partial<NonNullable<Dossier['stap3']>> = {}
  if (stap3bvo !== undefined) stap3Fields.bvo = stap3bvo
  if (stap3vvo !== undefined) stap3Fields.vvo = stap3vvo
  if (stap3perceeloppervlak !== undefined) stap3Fields.perceeloppervlak = stap3perceeloppervlak
  if (stap3aantalBouwlagen !== undefined) stap3Fields.aantalBouwlagen = stap3aantalBouwlagen
  if (stap3bouwjaar !== undefined) stap3Fields.bouwjaar = stap3bouwjaar
  if (stap3aanbouwen) stap3Fields.aanbouwen = stap3aanbouwen
  if (Object.keys(stap3Fields).length > 0) {
    wizardData.stap3 = stap3Fields as Dossier['stap3']
  }

  const stap4Fields: Partial<NonNullable<Dossier['stap4']>> = {}
  stap4Fields.verhuurd = stap4verhuurd
  if (stap4huurder) stap4Fields.huurder = stap4huurder
  if (stap4huurprijsPerJaar !== undefined) stap4Fields.huurprijsPerJaar = stap4huurprijsPerJaar
  if (stap4markthuurPerJaar !== undefined) stap4Fields.markthuurPerJaar = stap4markthuurPerJaar
  if (stap4contracttype) stap4Fields.contracttype = stap4contracttype
  wizardData.stap4 = stap4Fields as Dossier['stap4']

  const stap5Fields: Partial<NonNullable<Dossier['stap5']>> = {}
  if (stap5eigendomssituatie) stap5Fields.eigendomssituatie = stap5eigendomssituatie
  if (stap5erfpacht) stap5Fields.erfpacht = stap5erfpacht
  if (stap5zakelijkeRechten) stap5Fields.zakelijkeRechten = stap5zakelijkeRechten
  if (stap5kwalitatieveVerplichtingen) stap5Fields.kwalitatieveVerplichtingen = stap5kwalitatieveVerplichtingen
  if (stap5bestemmingsplan) stap5Fields.bestemmingsplan = stap5bestemmingsplan
  if (Object.keys(stap5Fields).length > 0) {
    wizardData.stap5 = stap5Fields as Dossier['stap5']
  }

  const stap6Fields: Partial<NonNullable<Dossier['stap6']>> = {}
  if (stap6fundering) stap6Fields.fundering = stap6fundering
  if (stap6dakbedekking) stap6Fields.dakbedekking = stap6dakbedekking
  if (stap6installaties) stap6Fields.installaties = stap6installaties
  if (stap6achterstallig) stap6Fields.achterstalligOnderhoudBeschrijving = stap6achterstallig
  if (stap6exterieurStaat) stap6Fields.exterieurStaat = stap6exterieurStaat
  if (stap6interieurStaat) stap6Fields.interieurStaat = stap6interieurStaat
  if (stap6onderhoudskosten !== undefined) stap6Fields.onderhoudskosten = stap6onderhoudskosten
  if (Object.keys(stap6Fields).length > 0) {
    wizardData.stap6 = stap6Fields as Dossier['stap6']
  }

  const stap7Fields: Partial<NonNullable<Dossier['stap7']>> = {}
  if (stap7toelichting) stap7Fields.toelichting = stap7toelichting
  if (stap7energielabel) stap7Fields.energielabel = stap7energielabel
  if (stap7asbest) stap7Fields.asbest = stap7asbest
  if (stap7bodemverontreiniging) stap7Fields.bodemverontreiniging = stap7bodemverontreiniging
  if (Object.keys(stap7Fields).length > 0) {
    wizardData.stap7 = stap7Fields as Dossier['stap7']
  }

  const stap8Fields: Partial<NonNullable<Dossier['stap8']>> = {}
  if (stap8methode) stap8Fields.methode = stap8methode
  if (stap8onderhandseVerkoopwaarde !== undefined) stap8Fields.onderhandseVerkoopwaarde = stap8onderhandseVerkoopwaarde
  if (stap8kapitalisatiefactor !== undefined) stap8Fields.kapitalisatiefactor = stap8kapitalisatiefactor
  if (Object.keys(stap8Fields).length > 0) {
    wizardData.stap8 = stap8Fields as Dossier['stap8']
  }

  const stap9Fields: Partial<NonNullable<Dossier['stap9']>> = {}
  if (stap9aannames) stap9Fields.aannames = stap9aannames
  if (stap9voorbehouden) stap9Fields.voorbehouden = stap9voorbehouden
  if (stap9bijzondereOmstandigheden) stap9Fields.bijzondereOmstandigheden = stap9bijzondereOmstandigheden
  if (Object.keys(stap9Fields).length > 0) {
    wizardData.stap9 = stap9Fields as Dossier['stap9']
  }

  return wizardData
}

export async function parsePdfToRapport(file: File): Promise<Partial<HistorischRapport>> {
  const text = await extractTextFromPdf(file)
  const result: Partial<HistorischRapport> = {
    rapportTeksten: { volledig: text },
  }

  // --- Adres ---
  const parsedAddr = parseAddress(text)
  if (parsedAddr) {
    result.adres = {
      straat: parsedAddr.straat,
      huisnummer: parsedAddr.huisnummer,
      postcode: parsedAddr.postcode,
      plaats: parsedAddr.plaats,
    }
  } else {
    result.adres = { straat: '', huisnummer: '', postcode: '', plaats: '' }
  }

  // --- BVO ---
  // Extended label synonyms, normalizeArea handles Dutch dot-thousands format
  const bvoMatch = text.match(
    /(?:Totaal\s+BVO(?:\s+m[²2]\s+of\s+stuks)?|BVO|bruto\s+vloeroppervlak|gebruiksoppervlak(?:te)?)[:\s]+([0-9]{1,3}(?:[.,][0-9]{3})*[.,]?[0-9]*)\s*m[²2]?/i
  )
  if (bvoMatch) {
    const val = normalizeArea(bvoMatch[1])
    if (val !== undefined) result.bvo = val
  }

  // --- Marktwaarde ---
  // Prefer explicit "marktwaarde" keyword label
  const marktwaardeKeyMatch = text.match(
    /marktwaarde[:\s]+(?:€\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/i
  )
  const marktwaardeEuroMatch = text.match(/€\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{1,2})?)\b/)
  const marktwaardeMatch = marktwaardeKeyMatch ?? marktwaardeEuroMatch
  if (marktwaardeMatch) {
    const val = normalizeEuro(marktwaardeMatch[1])
    if (val !== undefined) result.marktwaarde = val
  }

  // --- BAR ---
  // Handle "BAR: 8,15 %", "BAR | Kap. markt/herz. huur kk: 8,15 %" formats.
  // Limit lookahead to 30 chars to avoid capturing unrelated content.
  const barMatch = text.match(
    /\bBAR\b[^:\n]{0,30}?:\s*([0-9]{1,2}[.,][0-9]{1,2})\s*%?/i
  )
  if (barMatch) {
    const val = normalizePercent(barMatch[1])
    if (val !== undefined) result.bar = val
  }

  // --- NAR ---
  const narMatch = text.match(
    /\bNAR\b[^:\n]{0,30}?:\s*([0-9]{1,2}[.,][0-9]{1,2})\s*%?/i
  )
  if (narMatch) {
    const val = normalizePercent(narMatch[1])
    if (val !== undefined) result.nar = val
  }

  // Dutch month names used for date patterns
  const DUTCH_MONTH_PAT = 'januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december'

  // --- Waardepeildatum ---
  // Priority 1: explicit peildatum label with date (numeric or Dutch month name format)
  const peildatumMatch = text.match(
    new RegExp(
      `(?:waardepeildatum|waarde\\s+op|peildatum|getaxeerd\\s+per|getaxeerd\\s+op)[:\\s]+(\\d{1,2}[\\s\\-](?:${DUTCH_MONTH_PAT})[\\s\\-]\\d{4}|\\d{1,2}-\\d{1,2}-\\d{4})`,
      'i'
    )
  )
  if (peildatumMatch) {
    const parsed = normalizeDutchDate(peildatumMatch[1])
    if (parsed) result.waardepeildatum = parsed
  }
  // Priority 2: "getaxeerd op/per:" followed by a Dutch long-form date (optionally with day-of-week)
  if (!result.waardepeildatum) {
    const getaxeerdMatch = text.match(
      new RegExp(
        `getaxeerd\\s+(?:per|op)[:\\s]+(?:(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\\s+)?(\\d{1,2}\\s+(?:${DUTCH_MONTH_PAT})\\s+\\d{4}|\\d{1,2}-\\d{1,2}-\\d{4})`,
        'i'
      )
    )
    if (getaxeerdMatch) {
      const parsed = normalizeDutchDate(getaxeerdMatch[1])
      if (parsed) result.waardepeildatum = parsed
    }
  }
  // NOTE: We deliberately do NOT fall back to a standalone date pattern,
  // as this causes wrong dates to be filled from unrelated text.

  // --- Type object vs gebruiksdoel (CRITICAL FIX) ---
  // Physical object types only (NOT usage types like "eigen gebruik")
  const PHYSICAL_OBJECT_TYPES: { keyword: string; value: ObjectType }[] = [
    { keyword: 'bedrijfscomplex', value: 'bedrijfscomplex' },
    { keyword: 'bedrijfshal', value: 'bedrijfshal' },
    { keyword: 'kantoorgebouw', value: 'kantoor' },
    { keyword: 'kantoor', value: 'kantoor' },
    { keyword: 'winkel', value: 'winkel' },
    { keyword: 'appartement', value: 'appartement' },
    { keyword: 'woning', value: 'woning' },
  ]

  const lowerText = text.toLowerCase()

  // Try to find type object from an explicit label first (to avoid "Eigen gebruik" contamination)
  const typeObjectLabelRaw = extractSectionAfterKeyword(
    text,
    ['type vastgoed:', 'type object:', 'soort object:', 'object type:'],
    60,
    { singleLine: true }
  )
  if (typeObjectLabelRaw) {
    const lower = typeObjectLabelRaw.toLowerCase()
    for (const { keyword, value } of PHYSICAL_OBJECT_TYPES) {
      if (lower.includes(keyword)) {
        result.typeObject = value
        break
      }
    }
  }
  // Fallback: keyword scan in full text, but only if strong contextual signal
  if (!result.typeObject) {
    for (const { keyword, value } of PHYSICAL_OBJECT_TYPES) {
      if (lowerText.includes(keyword)) {
        result.typeObject = value
        break
      }
    }
  }

  // --- Gebruiksdoel ---
  // Check for explicit label first
  const gebruiksdoelLabelRaw = extractSectionAfterKeyword(
    text,
    ['gebruiksdoel:', 'type eigendom:', 'gebruik:', 'type gebruik:'],
    60,
    { singleLine: true }
  )
  const gebruiksdoelen: { keyword: string; value: Gebruiksdoel }[] = [
    { keyword: 'eigenaar-gebruiker', value: 'eigenaar_gebruiker' },
    { keyword: 'eigenaar gebruiker', value: 'eigenaar_gebruiker' },
    { keyword: 'eigen gebruik', value: 'eigenaar_gebruiker' },
    { keyword: 'belegging', value: 'verhuurd_belegging' },
    { keyword: 'verhuurd', value: 'verhuurd_belegging' },
    { keyword: 'leegstand', value: 'leegstand' },
  ]
  if (gebruiksdoelLabelRaw) {
    const lower = gebruiksdoelLabelRaw.toLowerCase()
    for (const { keyword, value } of gebruiksdoelen) {
      if (lower.includes(keyword)) {
        result.gebruiksdoel = value
        break
      }
    }
  }
  if (!result.gebruiksdoel) {
    for (const { keyword, value } of gebruiksdoelen) {
      if (lowerText.includes(keyword)) {
        result.gebruiksdoel = value
        break
      }
    }
  }

  // --- WizardData extracted from text ---
  result.wizardData = extractWizardDataFromText(text)

  // --- Post-processing: fill derived fields ---

  // If objectnaam was not found via explicit label, construct from address
  if (!result.wizardData?.stap1?.objectnaam && result.adres?.straat && result.adres?.plaats) {
    const parts = [result.adres.straat, result.adres.huisnummer].filter(Boolean).join(' ')
    const objectnaam = `${parts} te ${result.adres.plaats}`.trim()
    if (objectnaam.length > 5) {
      if (!result.wizardData) result.wizardData = {}
      if (!result.wizardData.stap1) {
        result.wizardData.stap1 = { objectnaam } as NonNullable<Dossier['stap1']>
      } else {
        result.wizardData.stap1 = { ...result.wizardData.stap1, objectnaam }
      }
    }
  }

  // If gemeente was not found, fall back to plaats
  if (!result.wizardData?.stap2?.gemeente && result.adres?.plaats) {
    if (!result.wizardData) result.wizardData = {}
    if (!result.wizardData.stap2) {
      result.wizardData.stap2 = { gemeente: result.adres.plaats } as NonNullable<Dossier['stap2']>
    } else if (!result.wizardData.stap2.gemeente) {
      result.wizardData.stap2 = { ...result.wizardData.stap2, gemeente: result.adres.plaats }
    }
  }

  // Propagate bvo from wizardData.stap3 if not already on result
  if (result.bvo === undefined && result.wizardData?.stap3?.bvo !== undefined) {
    result.bvo = result.wizardData.stap3.bvo
  }

  return result
}
