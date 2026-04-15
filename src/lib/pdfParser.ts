import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { Dossier, HistorischRapport, ObjectType, Gebruiksdoel, Ligging, Onderhoudsstaat, Energielabel, WaarderingsMethode } from '../types'
import {
  normalizeDutchDate,
  normalizeEuro,
  normalizePercent,
  normalizeDecimalNumber,
  normalizeArea,
  cleanupLongFieldText,
  compactWhitespace,
  parseAddress,
  dutchNumberWordToDigit,
  cleanGemeente,
  truncateField,
  postcodeToProvincie,
  stripHeaderFooterNoise,
  cleanLabelRemnant,
  summarizeTechnicalField,
  summarizeAannames,
} from './pdfNormalizers'
import { extractAllFieldsWithConfidence, extractAantalBouwlagen, extractBar, extractNar, extractMarktwaarde } from './pdfFieldExtractors'
import { detectChapters } from './chapterDetector'

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
 * Parses bullet items from a text block.
 * Bullets may be prefixed with -, •, –, *, or appear on their own line.
 */
function parseBulletItems(text: string): string[] {
  const MIN_BULLET_ITEM_LENGTH = 2
  const lines = text.split('\n')
  const items: string[] = []
  for (const line of lines) {
    const trimmed = line.replace(/^[\s\-–•*]+/, '').trim()
    if (trimmed.length > MIN_BULLET_ITEM_LENGTH) {
      items.push(trimmed)
    }
  }
  return items
}

/** Maximum characters to scan after a SWOT category heading. */
const MAX_SWOT_SECTION_CHARS = 600

/**
 * Extracts SWOT sections (Sterktes, Zwaktes, Kansen, Bedreigingen) from raw text.
 * Returns newline-separated strings for each SWOT category.
 */
export function extractSwotFromText(text: string): {
  swotSterktes?: string
  swotZwaktes?: string
  swotKansen?: string
  swotBedreigingen?: string
} {
  const result: {
    swotSterktes?: string
    swotZwaktes?: string
    swotKansen?: string
    swotBedreigingen?: string
  } = {}

  // SWOT category headings and their output key
  const categories: Array<{ headings: string[]; key: keyof typeof result }> = [
    { headings: ['sterktes', 'strengths'], key: 'swotSterktes' },
    { headings: ['zwaktes', 'weaknesses', 'zwakheden'], key: 'swotZwaktes' },
    { headings: ['kansen', 'opportunities'], key: 'swotKansen' },
    { headings: ['bedreigingen', 'threats'], key: 'swotBedreigingen' },
  ]

  // All possible SWOT heading labels for section-end detection
  const ALL_SWOT_HEADINGS = categories.flatMap((c) => c.headings)
  const lowerText = text.toLowerCase()

  for (const { headings, key } of categories) {
    for (const heading of headings) {
      // Look for the heading as a standalone line or followed by a colon/newline
      const re = new RegExp(`(?:^|\\n)[\\s]*${heading}[:\\s]*\\n`, 'i')
      const match = re.exec(text)
      if (!match) {
        // Also try finding it inline after "SWOT" section header
        const idx = lowerText.indexOf('\n' + heading)
        if (idx === -1) continue
        // Extract up to MAX_SWOT_SECTION_CHARS after the heading
        const afterHeading = text.slice(idx + heading.length + 1, idx + MAX_SWOT_SECTION_CHARS)
        // Stop at the next SWOT category heading
        let endIdx = afterHeading.length
        for (const otherHeading of ALL_SWOT_HEADINGS) {
          if (otherHeading === heading) continue
          const re2 = new RegExp(`(?:^|\\n)[\\s]*${otherHeading}[:\\s]*`, 'i')
          const m2 = re2.exec(afterHeading)
          if (m2 && m2.index < endIdx) endIdx = m2.index
        }
        // Also stop at double newline (paragraph break)
        const dnl = afterHeading.indexOf('\n\n')
        if (dnl !== -1 && dnl < endIdx) endIdx = dnl
        const section = afterHeading.slice(0, endIdx).trim()
        if (section.length > 0) {
          const items = parseBulletItems(section)
          if (items.length > 0) {
            result[key] = items.join('\n')
            break
          }
        }
        continue
      }
      // Extract up to MAX_SWOT_SECTION_CHARS after the heading match
      const afterHeading = text.slice(match.index + match[0].length, match.index + match[0].length + MAX_SWOT_SECTION_CHARS)
      // Stop at the next SWOT category heading
      let endIdx = afterHeading.length
      for (const otherHeading of ALL_SWOT_HEADINGS) {
        if (otherHeading === heading) continue
        const re2 = new RegExp(`(?:^|\\n)[\\s]*${otherHeading}[:\\s]*`, 'i')
        const m2 = re2.exec(afterHeading)
        if (m2 && m2.index < endIdx) endIdx = m2.index
      }
      const dnl = afterHeading.indexOf('\n\n')
      if (dnl !== -1 && dnl < endIdx) endIdx = dnl
      const section = afterHeading.slice(0, endIdx).trim()
      if (section.length > 0) {
        const items = parseBulletItems(section)
        if (items.length > 0) {
          result[key] = items.join('\n')
          break
        }
      }
    }
  }

  return result
}

/**
 * Maps a detected chapter heading to a logical section key used in `rapportTeksten`.
 *
 * @param chapter   - Top-level chapter identifier (e.g. "A", "B", "1"), used as a
 *                    fallback when no subchapter heading is available.
 * @param subchapter - Sub-section identifier (e.g. "B.1") or empty string.
 * @param headingText - The primary label used for matching: typically `subchapter`
 *                      when present, otherwise `chapter`.
 * @returns A section key such as "samenvatting", "technisch", etc., or undefined
 *          when the heading cannot be mapped to a known section.
 */
function mapChapterToSectionKey(chapter: string, subchapter: string, headingText: string): string | undefined {
  const lower = (headingText + ' ' + chapter + ' ' + subchapter).toLowerCase()

  if (/samenvatting|inhoudsopgave|resume|inleiding|conclusie|summary/.test(lower)) return 'samenvatting'
  if (/object(?:omschrijving|beschrijving|gegevens)|type\s+object|vastgoed(?:type)?|object\s+type/.test(lower)) return 'object'
  if (/locatie|ligging|omgeving|bereikbaarheid|infrastructuur|buurt|ontsluiting/.test(lower)) return 'locatie'
  if (/juridisch|eigendom|erfpacht|bestemmingsplan|planolog|kadaster|recht(?:en)?/.test(lower)) return 'juridisch'
  if (/technisch|bouwkundig|onderhoud|fundering|dak|installatie|constructie|gebouwstaat/.test(lower)) return 'technisch'
  if (/waarde(?:ring|peildatum)?|taxatie(?:methode)?|marktwaarde|bar|nar|dcf|rendement/.test(lower)) return 'waardering'
  if (/swot/.test(lower)) return 'swot'
  if (/referentie|vergelijking(?:sobject)?|koopreferentie|huurreferentie|comparable/.test(lower)) return 'referenties'
  if (/markt(?:analyse|onderzoek|ontwikkeling|context)|vraag\s+en\s+aanbod|\btransacties\b|conjunctuur/.test(lower)) return 'marktanalyse'
  if (/aannam|voorbehoud|uitgangspunt|bijzondere\s+omstandigh|disclaimer/.test(lower)) return 'aannames'
  if (/duurzaamheid|energie(?:label|prestatie)?|milieu|epc|verduurzaming|co2|gas(?:verbruik)?/.test(lower)) return 'duurzaamheid'

  return undefined
}

/**
 * Splits raw PDF text into logical named sections for a Dutch taxatie rapport.
 *
 * Sections are detected using chapter headings (letter/numeric/ALL-CAPS) and
 * mapped to predefined keys. The full text is always stored under `volledig`
 * for backward compatibility.
 *
 * Section keys: samenvatting, object, locatie, juridisch, technisch, waardering,
 *               swot, marktanalyse, referenties, aannames, duurzaamheid, volledig
 */
export function splitReportIntoSections(text: string): Record<string, string> {
  const sections: Record<string, string[]> = {}
  const detectedSections = detectChapters(text)

  for (const section of detectedSections) {
    if (!section.text) continue
    // Use the full heading line from the original text as the primary label for
    // section mapping so that title keywords (e.g. "Samenvatting" in "A. Samenvatting")
    // are available to mapChapterToSectionKey even for letter-based chapters.
    const headingLine = text.slice(section.startIndex, section.startIndex + 200).split('\n')[0]
    const key = mapChapterToSectionKey(section.chapter, section.subchapter, headingLine)
    if (key) {
      if (!sections[key]) sections[key] = []
      sections[key].push(section.text)
    }
  }

  // Build the result, joining multiple detected sections under the same key
  const result: Record<string, string> = { volledig: text }
  for (const [key, parts] of Object.entries(sections)) {
    result[key] = parts.join('\n\n')
  }

  return result
}

/**
 * Extracts wizard-relevant fields from raw PDF text.
 * Returns a partial Dossier with the sections found.
 * This is best-effort: missing sections simply return undefined.
 */
export function extractWizardDataFromText(text: string): Partial<Dossier> {
  // Strip header/footer noise before parsing
  text = stripHeaderFooterNoise(text)
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
  const stap1naamTaxateurRaw = extractSectionAfterKeyword(
    text,
    [
      'uitvoerend taxateur:',
      'uitvoerend taxateur',
      'naam taxateur:',
      'taxateur:',
      'beëdigd taxateur:',
      'getaxeerd door:',
    ],
    60,
    { singleLine: true }
  )
  // Strip trailing page-number digits (e.g. "Rick Schiffelers RT  1" → "Rick Schiffelers RT")
  const stap1naamTaxateur = stap1naamTaxateurRaw?.replace(/\s+\d{1,3}$/, '').trim() || undefined

  // Inspectiedatum: extended label synonyms, handle "vrijdag 7 november 2025"
  const stap1inspectiedatumRaw = extractSectionAfterKeyword(
    text,
    [
      'inspectiedatum:',
      'datum opname en inspectie:',
      'datum opname:',
      'datum inspectie:',
      'opnamedatum:',
      'inpandige opname:',
      'opgenomen op:',
      'inspectiedatum',
      'inpandige opname',
      'opgenomen op',
    ],
    50,
    { singleLine: true }
  )
  let stap1inspectiedatum = stap1inspectiedatumRaw
    ? normalizeDutchDate(stap1inspectiedatumRaw)
    : undefined
  // Broader fallback: scan for date patterns near "opname"/"inspectie" keywords
  if (!stap1inspectiedatum) {
    const DUTCH_MONTH_PAT_LOCAL = 'januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december'
    const inspFallbackRe = new RegExp(
      `(?:opname|inspectie)[^\\n]{0,50}?(\\d{1,2}[\\s\\-](?:${DUTCH_MONTH_PAT_LOCAL})[\\s\\-]\\d{4}|\\d{1,2}-\\d{1,2}-\\d{4})`,
      'i'
    )
    const inspFallbackMatch = text.match(inspFallbackRe)
    if (inspFallbackMatch) {
      stap1inspectiedatum = normalizeDutchDate(inspFallbackMatch[1]) ?? undefined
    }
  }

  // --- Stap 2: Adres & Locatie ---
  // Gemeente: strict label with colon only, use cleanGemeente to strip bestemmingsplan text
  const stap2gemeenteRaw = extractSectionAfterKeyword(text, ['gemeente:'], 80, { singleLine: true })
  const stap2gemeente = stap2gemeenteRaw ? cleanGemeente(stap2gemeenteRaw) || undefined : undefined

  let stap2provincie = extractSectionAfterKeyword(text, ['provincie:'], 30, { singleLine: true })
  // Fallback: derive from postcode
  if (!stap2provincie) {
    const pcMatch = text.match(/\b(\d{4})\s?[A-Z]{2}\b/)
    if (pcMatch) {
      stap2provincie = postcodeToProvincie(pcMatch[1])
    }
  }

  // Ligging: use extractLigging from pdfFieldExtractors which prioritizes quality scores
  // over enum values. Quality scores ('goed', 'uitstekend', etc.) take priority.
  const LIGGING_QUALITY = ['uitstekend', 'goed', 'redelijk', 'matig', 'slecht']
  const LIGGING_ENUM_VALUES: Ligging[] = ['bedrijventerrein', 'binnenstad', 'woonwijk', 'buitengebied', 'gemengd']
  let stap2ligging: Ligging | undefined

  // Step 1: check for quality score near explicit ligging/locatie labels
  for (const keyword of ['locatiebeoordeling:', 'beoordeling ligging:', 'kwaliteit ligging:', 'ligging:', 'ligging object:', 'type ligging:', 'locatiescore:', 'locatiescoring:', 'score locatie:', 'omschrijving locatie, stand en ligging:']) {
    const idx = lowerText.indexOf(keyword)
    if (idx === -1) continue
    const afterLabel = lowerText.slice(idx + keyword.length).trimStart()
    const context200 = afterLabel.slice(0, 200)
    for (const val of LIGGING_QUALITY) {
      if (context200.includes(val)) {
        stap2ligging = val as Ligging
        break
      }
    }
    if (stap2ligging) break
  }
  // Step 2: if no quality score found yet, check contextual search for quality scores
  if (!stap2ligging) {
    for (const keyword of ['ligging', 'locatie', 'omgeving']) {
      const idx = lowerText.indexOf(keyword)
      if (idx === -1) continue
      const context = lowerText.slice(Math.max(0, idx - 20), idx + 200)
      for (const val of LIGGING_QUALITY) {
        if (context.includes(val)) {
          stap2ligging = val as Ligging
          break
        }
      }
      if (stap2ligging) break
    }
  }
  // Step 3: fallback to enum values only if no quality score found
  if (!stap2ligging) {
    const liggingRaw = extractSectionAfterKeyword(
      text,
      ['ligging:', 'ligging object:', 'type ligging:'],
      50,
      { singleLine: true }
    )
    if (liggingRaw) {
      const lower = liggingRaw.toLowerCase()
      for (const val of LIGGING_ENUM_VALUES) {
        if (lower.includes(val)) {
          stap2ligging = val
          break
        }
      }
    }
  }
  if (!stap2ligging) {
    for (const keyword of ['ligging', 'locatie', 'omgeving']) {
      const idx = lowerText.indexOf(keyword)
      if (idx === -1) continue
      const context = lowerText.slice(Math.max(0, idx - 20), idx + 200)
      for (const val of LIGGING_ENUM_VALUES) {
        if (context.includes(val)) {
          stap2ligging = val
          break
        }
      }
      if (stap2ligging) break
    }
  }
  if (!stap2ligging) {
    for (const val of LIGGING_ENUM_VALUES) {
      if (lowerText.includes(val)) {
        stap2ligging = val
        break
      }
    }
  }

  // Bereikbaarheid: use stopAtInlineLabel to prevent capturing sub-fields
  const stap2bereikbaarheidRaw = extractSectionAfterKeyword(
    text,
    ['toelichting bereikbaarheid:', 'bereikbaarheid:', 'bereikbaarheid', 'ontsluiting:', 'infrastructuur:'],
    1000,
    { stopAtInlineLabel: true }
  )
  const stap2bereikbaarheid = stap2bereikbaarheidRaw
    ? cleanupLongFieldText(compactWhitespace(stap2bereikbaarheidRaw), 900)
    : undefined

  // Omgeving en belendingen
  const stap2omgevingEnBelendingen = extractSectionAfterKeyword(text, [
    'omgeving en belendingen:',
    'belendingen:',
    'belendende percelen:',
  ], 1000)

  // Voorzieningen
  const stap2voorzieningen = extractSectionAfterKeyword(text, [
    'voorzieningen:',
    'voorzieningen in de omgeving:',
  ], 1000)

  // Verwachte ontwikkelingen
  const stap2verwachteOntwikkelingen = extractSectionAfterKeyword(text, [
    'verwachte ontwikkelingen:',
    'toekomstige ontwikkelingen:',
    'geplande ontwikkelingen:',
  ], 1000)

  // --- Stap 3: Oppervlaktes ---
  // BVO: extended label synonyms including "Totaal BVO m² of stuks"
  const bvoMatch = text.match(
    /(?:Totaal\s+BVO(?:\s+m[²2]\s+of\s+stuks)?|BVO|bruto\s+vloeroppervlak|gebruiksoppervlak(?:te)?|bruto\s+oppervlak(?:te)?|bruto\s+vloeroppervlakte|totale?\s+oppervlak(?:te)?|totaal\s+m[²2]|bruto\s+m[²2])[:\s]+([0-9]{1,3}(?:[.,][0-9]{3})*[.,]?[0-9]*)\s*m[²2]?/i
  )
  const stap3bvo = bvoMatch ? normalizeArea(bvoMatch[1]) : undefined

  // VVO: extended label synonyms, handle "VVO 870" (space only, no colon)
  const vvoMatch = text.match(
    /(?:Totaal\s+VVO(?:\s+m[²2]\s+of\s+stuks)?|totaal\s+VVO|VVO|NVO|verhuurbaar\s+vloeroppervlak|verhuurbare\s+oppervlak(?:te)?|netto\s+vloeroppervlak(?:te)?|netto\s+oppervlak(?:te)?)[\s:]+([0-9]{1,6}[.,]?[0-9]*)\s*(?:m[²2])?/i
  )
  const stap3vvo = vvoMatch ? normalizeArea(vvoMatch[1]) : undefined

  // Perceeloppervlak: extended label synonyms including "Kadastrale grootte"
  const perceelMatch = text.match(
    /(?:Perceeloppervlak(?:te)?|Kaveloppervlak|Kadastrale\s+grootte|Kadastrale\s+oppervlak(?:te)?|terreinoppervlak(?:te)?|grondoppervlak(?:te)?|kavelmaat)[:\s]+([0-9]{1,3}(?:[.,][0-9]{3})*[.,]?[0-9]*)\s*m[²2]?/i
  )
  const stap3perceeloppervlak = perceelMatch ? normalizeArea(perceelMatch[1]) : undefined

  // Bouwlagen: match digit-based first, then Dutch word-numbers
  let stap3aantalBouwlagen: number | undefined
  const bouwlagenExtracted = extractAantalBouwlagen(text)
  if (bouwlagenExtracted) {
    stap3aantalBouwlagen = bouwlagenExtracted.value
  }

  const bouwjaarMatch = text.match(/(?:bouwjaar|gebouwd\s+in|jaar\s+van\s+oplevering|jaar\s+van\s+bouw|oorspronkelijk\s+bouwjaar|bouwperiode|opgeleverd\s+in)[:\s]+([0-9]{4})/i)
  const stap3bouwjaar = bouwjaarMatch ? parseInt(bouwjaarMatch[1], 10) : undefined

  // Renovatiejaar: skip reference sections and negative context
  let stap3renovatiejaar: number | undefined
  if (!/geen\s+aanzienlijke\s+wijzigingen|geen\s+renovatie|niet\s+gerenoveerd/.test(lowerText)) {
    const renovatieRe = /(?:renovatiejaar|gerenoveerd\s+in|meest\s+recente\s+renovatie|jaar\s+renovatie|laatst\s+gerenoveerd)[:\s]+([0-9]{4})/gi
    let renovatieMatch: RegExpExecArray | null
    while ((renovatieMatch = renovatieRe.exec(text)) !== null) {
      const mIdx = renovatieMatch.index
      // Skip if in reference/comparable section
      const contextBefore = lowerText.slice(Math.max(0, mIdx - 150), mIdx)
      if (/referentie|vergelijkingsobject|koopreferentie|huurreferentie/.test(contextBefore)) continue
      stap3renovatiejaar = parseInt(renovatieMatch[1], 10)
      break
    }
  }

  // Aanbouwen: strict labels only, limited length, single line
  const stap3aanbouwen = extractSectionAfterKeyword(
    text,
    ['aanbouw:', 'uitbreiding:', 'bijgebouw:'],
    100,
    { singleLine: true }
  )

  // --- Stap 4: Huurgegevens ---
  // (?<!\w) prevents "markthuurprijs" from matching the huurprijs pattern
  const huurprijsMatch = text.match(
    /(?<!\w)(?:huurprijs|jaarhuur|huur\s+per\s+jaar|jaarhuursom|contracthuur|huuropbrengst)[:\s]+(?:€\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/i
  )
  const stap4huurprijsPerJaar = huurprijsMatch ? normalizeEuro(huurprijsMatch[1]) : undefined

  // Markthuur: extended label synonyms including "Markt/herz. huur"
  const markthuurMatch = text.match(
    /(?:Markt\/herz\.\s*huur|markthuur(?:waarde|prijs)?|marktconforme\s+huur|bruto\s+huur)[:\s|]+(?:€\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/i
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

  // verhuurd: only set true for current/active rental evidence; ignore past-tense rental
  // Past: "verhuurd geweest", "voormalige huurder", "tot <year> verhuurd geweest", "voorheen verhuurd", "was verhuurd", "niet meer verhuurd"
  const hasPastRental = /verhuurd\s+geweest|voormalige?\s+huurder|voorheen\s+verhuurd|tot\s+\d{1,2}\s+\w+\s+\d{4}\s+verhuurd|was\s+verhuurd|niet\s+meer\s+verhuurd/.test(lowerText)
  // Eigenaar-gebruiker detection: if owner-occupied, default to not rented unless active rental evidence
  const isEigenaarGebruiker = /eigenaar[-\s]gebruiker|eigen\s+gebruik|owner\s+occupied/.test(lowerText)
  const hasActiveTenant = stap4huurder !== undefined
  const hasActualRentAmount = stap4huurprijsPerJaar !== undefined
  const hasRentalPhrase = /thans\s+verhuurd|lopende\s+huurovereenkomst/.test(lowerText)
  const hasContractType = stap4contracttype !== undefined && stap4contracttype.length < 60
  const hasActiveRental = hasActiveTenant || hasActualRentAmount || hasRentalPhrase || hasContractType
  // For eigenaar-gebruiker: verhuurd is ONLY true when there is SIMULTANEOUSLY an
  // explicit tenant, an explicit rent amount AND an explicit rental phrase
  // ("thans verhuurd" / "lopende huurovereenkomst").  Market-analysis sentences
  // that mention rental in passing must not flip this flag.
  const stap4verhuurd = isEigenaarGebruiker
    ? (hasRentalPhrase && hasActiveTenant && hasActualRentAmount)
    : hasActiveRental && !hasPastRental

  // --- Stap 6: Technische Staat ---
  const ONDERHOUD_VALUES: Onderhoudsstaat[] = ['uitstekend', 'goed', 'redelijk', 'matig', 'slecht']

  let stap6exterieurStaat: Onderhoudsstaat | undefined
  // Look for label "exterieur" or "bouwkundige staat exterieur" or "staat van onderhoud buiten"
  const exterieurRaw = extractSectionAfterKeyword(
    text,
    [
      'staat van onderhoud buiten:',
      'bouwkundige staat exterieur:',
      'bouwkundige staat:',
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

  const stap6funderingRaw = extractSectionAfterKeyword(text, [
    'fundering:',
    'funderingstype:',
    'funderingssituatie:',
    'fundering',
  ], 300, { stopAtInlineLabel: true })
  // Truncate fundering at first occurrence of a technical sub-label
  const stap6fundering = stap6funderingRaw
    ? (() => {
        let v = stap6funderingRaw
        const techStop = v.search(/\b(?:constructie|dak|gevels|kozijnen|installaties|interieur|exterieur)\s*:/i)
        if (techStop !== -1) v = v.slice(0, techStop)
        return summarizeTechnicalField(v, 500) || undefined
      })()
    : undefined

  const stap6dakbedekkingRaw = extractSectionAfterKeyword(text, [
    'dakbedekking:',
    'daktype:',
    'dak:',
    'dakconstruct',
    'plat dak',
    'bitumineus',
    'bitumen',
    'dakpannen',
    'sedumdak',
  ], 300, { stopAtInlineLabel: true })
  // Strip label remnant from start (e.g. "ie: plat dak..." when "dakconstruct" was matched)
  const stap6dakbedekking = stap6dakbedekkingRaw ? cleanLabelRemnant(stap6dakbedekkingRaw) || undefined : undefined

  // Constructie: extract separately, stop at next technical label
  const stap6constructieRaw = extractSectionAfterKeyword(text, [
    'constructie:',
    'bouwconstructie:',
    'draagconstructie:',
  ], 300, { singleLine: true })
  const stap6constructie = stap6constructieRaw ? summarizeTechnicalField(stap6constructieRaw, 300) || undefined : undefined

  const stap6installatiesRaw = extractSectionAfterKeyword(text, [
    'installaties:',
    'installatie:',
    'klimaatinstallatie:',
    'verwarmingssysteem:',
    'technische installaties:',
    'cv-ketel',
    'airconditioning',
    'mechanische ventilatie',
    'radiatoren',
    'warmtepomp',
    'zonnepanelen',
  ], 1000)
  const stap6installaties = stap6installatiesRaw ? summarizeTechnicalField(stap6installatiesRaw, 1000) || undefined : undefined

  const stap6achterstallig = extractSectionAfterKeyword(text, [
    'achterstallig onderhoud:',
    'achterstalligonderhoud:',
    'onderhoudstoestand:',
  ], 300)

  // Terrein
  const stap6terreinRaw = extractSectionAfterKeyword(text, [
    'terrein:',
    'terreinbeschrijving:',
    'buitenterrein:',
  ], 1000)
  const stap6terrein = stap6terreinRaw ? summarizeTechnicalField(stap6terreinRaw, 1000) || undefined : undefined

  // Gevels
  const stap6gevelsRaw = extractSectionAfterKeyword(text, [
    'gevels:',
    'gevel:',
    'gevelbekleding:',
  ], 1000)
  const stap6gevels = stap6gevelsRaw ? summarizeTechnicalField(stap6gevelsRaw, 1000) || undefined : undefined

  // Afwerking
  const stap6afwerkingRaw = extractSectionAfterKeyword(text, [
    'afwerking:',
    'binnenafwerking:',
    'afwerkingsniveau:',
  ], 1000)
  const stap6afwerking = stap6afwerkingRaw ? summarizeTechnicalField(stap6afwerkingRaw, 1000) || undefined : undefined

  // Beveiliging
  const stap6beveiligingRaw = extractSectionAfterKeyword(text, [
    'beveiliging:',
    'beveiligingsinstallatie:',
    'beveiligingssysteem:',
  ], 1000)
  const stap6beveiliging = stap6beveiligingRaw ? summarizeTechnicalField(stap6beveiligingRaw, 1000) || undefined : undefined

  // Omschrijving milieuaspecten
  const stap6omschrijvingMilieuaspectenRaw = extractSectionAfterKeyword(text, [
    'milieuaspecten:',
    'milieu:',
    'omschrijving milieuaspecten:',
    'milieu-aspecten:',
  ], 1000)
  const stap6omschrijvingMilieuaspecten = stap6omschrijvingMilieuaspectenRaw
    ? cleanupLongFieldText(stap6omschrijvingMilieuaspectenRaw, 1000) || undefined
    : undefined

  // Toelichting onderhoud
  const stap6toelichtingOnderhoudRaw = extractSectionAfterKeyword(text, [
    'toelichting onderhoud:',
    'toelichting bouwkundig:',
    'toelichting staat van onderhoud:',
  ], 2000)
  const stap6toelichtingOnderhoud = stap6toelichtingOnderhoudRaw
    ? cleanupLongFieldText(stap6toelichtingOnderhoudRaw, 2000) || undefined
    : undefined

  // Toelichting parkeren
  const stap6toelichtingParkerenRaw = extractSectionAfterKeyword(text, [
    'toelichting parkeren:',
    'parkeerfaciliteiten:',
    'parkeermogelijkheden:',
    'parkeerplaatsen:',
    'parkeren:',
  ], 1000)
  const stap6toelichtingParkeren = stap6toelichtingParkerenRaw
    ? cleanupLongFieldText(stap6toelichtingParkerenRaw, 1000) || undefined
    : undefined

  // Toelichting functionaliteit
  const stap6toelichtingFunctionaliteitRaw = extractSectionAfterKeyword(text, [
    'toelichting functionaliteit:',
    'functionaliteit:',
    'gebruiksmogelijkheden:',
    'indeelbaarheid:',
  ], 1000)
  const stap6toelichtingFunctionaliteit = stap6toelichtingFunctionaliteitRaw
    ? cleanupLongFieldText(stap6toelichtingFunctionaliteitRaw, 1000) || undefined
    : undefined

  // --- Stap 5: Juridische Info ---
  // Eigendomssituatie: limit to 100 chars, stop at unrelated field markers
  // stopAtInlineLabel stops before "Te taxeren belang:" and similar inline follow-up labels
  const stap5eigendomssituatieRaw = extractSectionAfterKeyword(text, [
    'eigendomssituatie:',
    'eigendomsvorm:',
    'eigendom:',
    'type eigendom:',
  ], 100, { singleLine: true, stopAtInlineLabel: true })
  // Strip junk: truncate at known unrelated-field stop-words, remove embedded labels
  let stap5eigendomssituatie = stap5eigendomssituatieRaw
  if (stap5eigendomssituatie) {
    // Remove embedded "Te taxeren belang: ..." from eigendomssituatie text
    // Use ' ' as replacement (not '') to avoid direct concatenation like "EigendomEigendom"
    stap5eigendomssituatie = stap5eigendomssituatie.replace(/\s*te\s+taxeren\s+belang\s*:\s*/gi, ' ').trim()
    // Remove repeated value caused by PDF concatenation glitch (e.g. "EigendomEigendom" → "Eigendom")
    // Non-anchored form handles the case where more content follows the repeated prefix
    stap5eigendomssituatie = stap5eigendomssituatie.replace(/^([A-Za-zÀ-öø-ÿ]{3,})\1+/i, '$1')
    // Anchored form for full-string repetitions (e.g. short isolated values)
    stap5eigendomssituatie = stap5eigendomssituatie.replace(/^(.{3,}?)\1+$/i, '$1')
    // Remove duplicate words
    const words = stap5eigendomssituatie.split(/\s+/)
    const seen = new Set<string>()
    stap5eigendomssituatie = words.filter((w) => {
      const lower = w.toLowerCase()
      if (seen.has(lower)) return false
      seen.add(lower)
      return true
    }).join(' ')
    const EIGEN_STOP = /perceeloppervlak|energielabel|kadaster|oppervlak|bvo|vvo/i
    const stopMatch = stap5eigendomssituatie.search(EIGEN_STOP)
    if (stopMatch !== -1) stap5eigendomssituatie = stap5eigendomssituatie.slice(0, stopMatch).trim()
    if (stap5eigendomssituatie.length === 0) stap5eigendomssituatie = undefined
  }
  // Te taxeren belang as separate field
  const stap5teTaxerenBelang = extractSectionAfterKeyword(text, ['te taxeren belang:'], 80, { singleLine: true })

  // Erfpacht: only set when explicitly present; clear if text says "geen erfpacht" / "n.v.t." / "vol eigendom"
  const stap5erfpachtRaw = extractSectionAfterKeyword(text, [
    'erfpacht:',
    'erfpachtsituatie:',
    'canonverplichting:',
  ], 80, { singleLine: true })
  let stap5erfpacht = stap5erfpachtRaw
  if (stap5erfpacht) {
    const lower5 = stap5erfpacht.toLowerCase()
    if (/geen\s+erfpacht|niet\s+van\s+toepassing|n\.v\.t\.|nvt|geen|vol\s+eigendom/.test(lower5)) {
      stap5erfpacht = undefined
    }
  }
  // Also check if "geen erfpacht" or "vol eigendom" appears near an erfpacht keyword in the full text
  if (!stap5erfpacht && /geen\s+erfpacht|vol\s+eigendom/i.test(text)) {
    stap5erfpacht = undefined
  }

  const stap5zakelijkeRechten = extractSectionAfterKeyword(text, [
    'zakelijke rechten:',
    'zakelijkerechten:',
    'zakelijk recht:',
    'belemmeringenwet',
    'recht van overpad:',
    'opstalrecht:',
    'recht van opstal:',
    'erfdienstbaarheid:',
  ], 1000)

  const stap5kwalitatieveVerplichtingen = extractSectionAfterKeyword(text, [
    'kwalitatieve verplichting:',
    'kwalitatieve verplichtingen:',
    'kettingbeding:',
  ], 300)

  const stap5bestemmingsplanRaw = extractSectionAfterKeyword(text, [
    'vigerend bestemmingsplan:',
    'omgevingsplan:',
    'bestemmingsplan naam:',
    'bestemmingsplan:',
    'bestemming:',
    'planologische bestemming:',
  ], 1000)
  // Apply stop-word truncation (Bug 12)
  let stap5bestemmingsplan = stap5bestemmingsplanRaw
  if (stap5bestemmingsplan) {
    const stopIdx = stap5bestemmingsplan.search(/raadsbesluit|vastgesteld\s+op/i)
    if (stopIdx !== -1) stap5bestemmingsplan = stap5bestemmingsplan.slice(0, stopIdx).trim()
    // Remove header/footer noise fragments within extracted text
    stap5bestemmingsplan = stap5bestemmingsplan
      .replace(/\s*(?:Pagina\s+\d+(\s+van\s+\d+)?|Printdatum[:\s][^\n]*|Uitvoerend\s+taxateur[:\s][^\n]*|\d+\s+van\s+\d+|[A-Z][a-z]+\s+[A-Z][a-z]+\s+R\.?T\.?)\s*/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    stap5bestemmingsplan = cleanupLongFieldText(stap5bestemmingsplan, 1000) || undefined
  }

  // Gebruik conform omgevingsplan
  const stap5gebruikConformOmgevingsplan = extractSectionAfterKeyword(text, [
    'gebruik conform omgevingsplan:',
    'conform omgevingsplan:',
    'gebruik conform bestemmingsplan:',
  ], 1000)

  // Bijzondere publiekrechtelijke bepalingen
  const stap5bijzonderePubliekrechtelijkeBepalingen = extractSectionAfterKeyword(text, [
    'bijzondere publiekrechtelijke bepalingen:',
    'publiekrechtelijke bepalingen:',
    'publiekrechtelijke beperkingen:',
  ], 1000)

  // Aantekeningen kadastraal object
  const stap5aantekeningenKadastraalObject = extractSectionAfterKeyword(text, [
    'aantekeningen kadastraal object:',
    'aantekeningen kadaster:',
    'kadastraal object aantekeningen:',
    'aantekeningen:',
  ], 1000)

  // Toelichting eigendom perceel
  const stap5toelichtingEigendomPerceel = extractSectionAfterKeyword(text, [
    'toelichting eigendom perceel:',
    'toelichting eigendomssituatie:',
    'toelichting perceel:',
  ], 1000)

  // --- Stap 7: Vergunningen ---
  // Energielabel: check for "Geen"/"-"/undefined values first
  let stap7energielabel: Energielabel | undefined
  // Suppression phrases: if any are found, force 'geen' regardless of other matches
  const ENERGIELABEL_SUPPRESSION_PHRASES = [
    'geen energielabel geregistreerd',
    'geen energielabel beschikbaar',
    'geen energielabel aanwezig',
    'er is geen energielabel',
    'energielabel niet geregistreerd',
    'check ep-online',
  ]
  const hasEnergielabelSuppression = ENERGIELABEL_SUPPRESSION_PHRASES.some((p) => lowerText.includes(p))
  if (hasEnergielabelSuppression) {
    stap7energielabel = 'geen'
  } else {
    const energielabelRaw = extractSectionAfterKeyword(
      text,
      ['energielabel:', 'energieklasse:', 'energie-index:', 'epc:', 'energieprestatie:', 'energielabel'],
      20,
      { singleLine: true }
    )
    if (energielabelRaw) {
      const lower = energielabelRaw.trim().toLowerCase()
      const INVALID_LABELS = ['geen', '-', 'n.v.t.', 'nvt', 'niet beschikbaar', 'onbekend', 'niet', '- / geen', 'nee']
      const SUPPOSITION_PHRASES = ['vermoedelijk', 'kan voldoen aan', 'wordt verwacht']
      if (INVALID_LABELS.some((v) => lower === v || lower.startsWith(v))) {
        stap7energielabel = 'geen'
      } else if (SUPPOSITION_PHRASES.some((p) => lower.includes(p))) {
        stap7energielabel = 'geen'
      } else {
        const labelMatch = energielabelRaw.trim().match(/^([A-G][+]{0,4})/i)
        if (labelMatch) {
          stap7energielabel = labelMatch[1].toUpperCase() as Energielabel
        }
      }
    }
  }

  // Asbest: CRITICAL FIX — check for soil/environmental context and fix logical order
  // Only set "ja" when asbest is explicitly found in building (not just mentioned)
  let stap7asbest: 'ja' | 'nee' | 'onbekend' | undefined
  const asbestIdx = lowerText.indexOf('asbest')
  if (asbestIdx !== -1) {
    const contextBefore = lowerText.slice(Math.max(0, asbestIdx - 60), asbestIdx)
    const contextAfter = lowerText.slice(asbestIdx, asbestIdx + 200)
    const fullContext = contextBefore + contextAfter

    // Check if this "asbest" occurrence is in soil/environmental text (not about the building)
    const isSoilContext = /bodem|grond|verontreiniging|milieu|omgeving/.test(contextBefore)

    if (!isSoilContext) {
      // Negation FIRST
      if (
        /geen\s+asbest|asbestvrij|niet\s+aanwezig|niet\s+vastgesteld|vrij\s+van\s+asbest|niet\s+bekend\s+met\s+asbesthoudende/.test(fullContext)
      ) {
        stap7asbest = 'nee'
      } else if (
        /asbestonderzoek[:\s]+nee|onbekend|niet\s+onderzocht|nader\s+onderzoek/.test(fullContext)
      ) {
        stap7asbest = 'onbekend'
      } else if (
        // Only set "ja" for explicit confirmation of presence in the building
        /asbest\s+aangetroffen|asbesthoudend\s+materiaal\s+aanwezig/.test(fullContext)
      ) {
        stap7asbest = 'ja'
      } else {
        stap7asbest = 'onbekend'
      }
    }
  }

  let stap7bodemverontreiniging: 'ja' | 'nee' | 'onbekend' | undefined
  // Presence of "bodeminformatie" or "bodemkwaliteit" header alone is NOT evidence of contamination
  let bodemIdx = lowerText.indexOf('bodemverontreiniging')
  // If "bodeminformatie" appears, look further for actual contamination statements
  if (bodemIdx === -1) {
    const infoIdx = lowerText.indexOf('bodeminformatie')
    if (infoIdx !== -1) {
      // Scan up to 400 chars after bodeminformatie for actual verdict
      bodemIdx = infoIdx
    }
  }
  if (bodemIdx === -1) bodemIdx = lowerText.indexOf('bodemkwaliteit')
  if (bodemIdx !== -1) {
    const bodemContext = lowerText.slice(bodemIdx, bodemIdx + 400)
    // Phrases indicating that even though contamination is mentioned, there is no usage impact
    const NO_IMPACT_PHRASES = [
      'geen saneringsnoodzaak',
      'geen sanering noodzakelijk',
      'geen gebruiksbeperking',
      'geen beperkingen voor huidig gebruik',
      'geen gegevens bekend die wijzen op beperkingen',
      'niet verontreinigd verklaard',
    ]
    // Check NEGATIVE patterns FIRST — these override positive matches
    if (
      /niet\s+geregistreerd\s+als\s+mogelijk\s+verontreinigd|geen\s+informatie\s+bekend\s+die\s+duidt\s+op\s+bodemverontreiniging|geen\s+visuele\s+waarnemingen|geen\s+aanwijzingen\s+voor\s+bodemverontreiniging|geen\s+verontreiniging/.test(bodemContext) ||
      bodemContext.includes('niet aanwezig') ||
      bodemContext.includes('schoon') ||
      /\bnee\b/.test(bodemContext)
    ) {
      stap7bodemverontreiniging = 'nee'
    } else if (NO_IMPACT_PHRASES.some((p) => bodemContext.includes(p))) {
      // Verontreiniging exists but without saneringsnoodzaak / usage restrictions → 'onbekend'
      stap7bodemverontreiniging = 'onbekend'
    } else if (
      bodemContext.includes('verontreinigd') ||
      bodemContext.includes('sanering nodig') ||
      bodemContext.includes('vervuild')
    ) {
      stap7bodemverontreiniging = 'ja'
    } else if (bodemContext.includes('aanwezig') && !bodemContext.includes('niet aanwezig')) {
      stap7bodemverontreiniging = 'ja'
    } else if (bodemContext.includes('onbekend') || bodemContext.includes('niet onderzocht')) {
      stap7bodemverontreiniging = 'onbekend'
    }
    // If only header text found with no verdict keywords → leave undefined (not auto-set to 'ja')
  }

  const stap7toelichting = extractSectionAfterKeyword(text, [
    'toelichting vergunningen:',
    'vergunningen toelichting:',
    'asbest toelichting:',
  ], 1000)

  // Toelichting duurzaamheid: extract from energielabel/duurzaamheid section
  const stap7toelichtingDuurzaamheid = extractSectionAfterKeyword(text, [
    'toelichting duurzaamheid:',
    'duurzaamheid:',
    'duurzaamheidstoelichting:',
    'duurzaamheidsmaatregelen:',
    'energetische maatregelen:',
    'verduurzaming:',
    'energieprestatie toelichting:',
  ], 1000)

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

  // Kapitalisatiefactor: priority 1 = explicit "Kapitalisatiefactor: X" label,
  // priority 2 = "Kap. markt/herz. huur ... | X" pipe-separated summary line,
  // priority 3 = detail table "Kap. factor von X"
  const kapFacMatchLabel = text.match(/kapitalisatiefactor[:\s|]+([0-9]{1,2}[.,][0-9]{1,2})/i)
  const kapFacMatchPipe = text.match(/kap\.?\s*markt[^\n|]{0,60}\|\s*([0-9]{1,2}[.,][0-9]{1,2})/i)
  const kapFacMatchDetail = text.match(/kap\.?\s*factor[:\s|]+(?:von\s+)?([0-9]{1,2}[.,][0-9]{1,2})/i)
  const kapFacMatch = kapFacMatchLabel ?? kapFacMatchPipe ?? kapFacMatchDetail
  const stap8kapitalisatiefactor = kapFacMatch ? normalizeDecimalNumber(kapFacMatch[1]) : undefined

  // BAR extraction for wizardData stap8
  const stap8bar = extractBar(text)?.value

  // NAR extraction for wizardData stap8
  const stap8nar = extractNar(text)?.value

  // Marktwaarde extraction for wizardData stap8
  const stap8marktwaarde = extractMarktwaarde(text)?.value

  // --- Stap 9: Aannames ---
  const stap9aannames = (() => {
    const raw = extractSectionAfterKeyword(text, [
      'aannames:',
      'aanname:',
      'uitgangspunten en aannames:',
      'algemene uitgangspunten:',
      'uitgangspunten:',
      'taxatie onnauwkeurigheid:',
    ], 2000)
    return raw ? summarizeAannames(raw, 1500) || undefined : undefined
  })()

  const stap9voorbehouden = (() => {
    const raw = extractSectionAfterKeyword(text, [
      'voorbehouden:',
      'voorbehoud:',
      'voorbehoud en bijzondere omstandigheden:',
      'beperkingen:',
      'bijzondere aannames:',
      'onzekerheidsmarge:',
      'disclaimer:',
    ], 2000)
    return raw ? summarizeAannames(raw, 1500) || undefined : undefined
  })()

  const stap9bijzondereOmstandigheden = extractSectionAfterKeyword(text, [
    'bijzondere omstandigheden:',
    'bijzonderheden:',
  ], 1000)

  // Algemene uitgangspunten (separate from aannames to avoid overlap with the combined field)
  const stap9algemeneUitgangspunten = extractSectionAfterKeyword(text, [
    'algemene uitgangspunten:',
    'uitgangspunten:',
  ], 2000)

  // Bijzondere uitgangspunten
  const stap9bijzondereUitgangspunten = extractSectionAfterKeyword(text, [
    'bijzondere uitgangspunten:',
    'specifieke uitgangspunten:',
  ], 2000)

  // Ontvangen informatie
  const stap9ontvangenInformatie = extractSectionAfterKeyword(text, [
    'ontvangen informatie:',
    'verstrekte informatie:',
    'ingeziene documenten:',
    'informatieverstrekking:',
  ], 2000)

  // Wezenlijke veranderingen
  const stap9wezenlijkeVeranderingen = extractSectionAfterKeyword(text, [
    'wezenlijke veranderingen:',
    'relevante veranderingen:',
    'veranderingen na inspectie:',
    'verklaring wezenlijke veranderingen:',
  ], 1000)

  // Taxatie onnauwkeurigheid
  const stap9taxatieOnnauwkeurigheid = extractSectionAfterKeyword(text, [
    'taxatie onnauwkeurigheid:',
    'onnauwkeurigheid:',
    'onzekerheidsmarge:',
    'marge van onnauwkeurigheid:',
  ], 1000)

  // --- Build wizardData ---
  // Field-length constants (Bug 24)
  const MAX_FIELD_LENGTH_SHORT = 120    // objectnaam, gemeente, provincie, huurder, contracttype
  const MAX_FIELD_LENGTH_MEDIUM = 2000  // bereikbaarheid, eigendomssituatie, erfpacht, zakelijkeRechten, bestemmingsplan
  const MAX_FIELD_LENGTH_TEXTAREA = 5000 // fundering, dakbedekking, installaties, achterstalligOnderhoud, aannames, voorbehouden, bijzondereOmstandigheden, toelichting

  const wizardData: Partial<Dossier> = {}

  const stap1Fields: Partial<NonNullable<Dossier['stap1']>> = {}
  if (stap1objectnaam) stap1Fields.objectnaam = truncateField(stap1objectnaam, MAX_FIELD_LENGTH_SHORT)
  if (stap1naamTaxateur) stap1Fields.naamTaxateur = truncateField(stap1naamTaxateur, MAX_FIELD_LENGTH_SHORT)
  if (stap1inspectiedatum) stap1Fields.inspectiedatum = stap1inspectiedatum
  if (Object.keys(stap1Fields).length > 0) {
    wizardData.stap1 = stap1Fields as Dossier['stap1']
  }

  const stap2Fields: Partial<NonNullable<Dossier['stap2']>> = {}
  if (stap2bereikbaarheid) stap2Fields.bereikbaarheid = truncateField(stap2bereikbaarheid, MAX_FIELD_LENGTH_MEDIUM)
  if (stap2gemeente) stap2Fields.gemeente = truncateField(stap2gemeente, MAX_FIELD_LENGTH_SHORT)
  if (stap2provincie) stap2Fields.provincie = truncateField(stap2provincie, MAX_FIELD_LENGTH_SHORT)
  if (stap2ligging) stap2Fields.ligging = stap2ligging
  if (stap2omgevingEnBelendingen) stap2Fields.omgevingEnBelendingen = truncateField(stap2omgevingEnBelendingen, MAX_FIELD_LENGTH_MEDIUM)
  if (stap2voorzieningen) stap2Fields.voorzieningen = truncateField(stap2voorzieningen, MAX_FIELD_LENGTH_MEDIUM)
  if (stap2verwachteOntwikkelingen) stap2Fields.verwachteOntwikkelingen = truncateField(stap2verwachteOntwikkelingen, MAX_FIELD_LENGTH_MEDIUM)
  if (Object.keys(stap2Fields).length > 0) {
    wizardData.stap2 = stap2Fields as Dossier['stap2']
  }

  const stap3Fields: Partial<NonNullable<Dossier['stap3']>> = {}
  if (stap3bvo !== undefined) stap3Fields.bvo = stap3bvo
  if (stap3vvo !== undefined) stap3Fields.vvo = stap3vvo
  if (stap3perceeloppervlak !== undefined) stap3Fields.perceeloppervlak = stap3perceeloppervlak
  if (stap3aantalBouwlagen !== undefined) stap3Fields.aantalBouwlagen = stap3aantalBouwlagen
  if (stap3bouwjaar !== undefined) stap3Fields.bouwjaar = stap3bouwjaar
  if (stap3renovatiejaar !== undefined) stap3Fields.renovatiejaar = stap3renovatiejaar
  if (stap3aanbouwen) stap3Fields.aanbouwen = stap3aanbouwen
  if (Object.keys(stap3Fields).length > 0) {
    wizardData.stap3 = stap3Fields as Dossier['stap3']
  }

  const stap4Fields: Partial<NonNullable<Dossier['stap4']>> = {}
  stap4Fields.verhuurd = stap4verhuurd
  // For eigenaar-gebruiker with verhuurd=false: suppress tenant/rent fields to avoid
  // incorrect data leaking from market-analysis sections, but always keep markthuur.
  const allowRentalFields = stap4verhuurd || !isEigenaarGebruiker
  if (allowRentalFields && stap4huurder) stap4Fields.huurder = truncateField(stap4huurder, MAX_FIELD_LENGTH_SHORT)
  if (allowRentalFields && stap4huurprijsPerJaar !== undefined) stap4Fields.huurprijsPerJaar = stap4huurprijsPerJaar
  if (allowRentalFields && stap4contracttype) stap4Fields.contracttype = truncateField(stap4contracttype, MAX_FIELD_LENGTH_SHORT)
  if (stap4markthuurPerJaar !== undefined) stap4Fields.markthuurPerJaar = stap4markthuurPerJaar
  wizardData.stap4 = stap4Fields as Dossier['stap4']

  const stap5Fields: Partial<NonNullable<Dossier['stap5']>> = {}
  if (stap5eigendomssituatie) stap5Fields.eigendomssituatie = truncateField(stap5eigendomssituatie, MAX_FIELD_LENGTH_MEDIUM)
  if (stap5erfpacht) stap5Fields.erfpacht = truncateField(stap5erfpacht, MAX_FIELD_LENGTH_MEDIUM)
  if (stap5zakelijkeRechten) stap5Fields.zakelijkeRechten = truncateField(stap5zakelijkeRechten, MAX_FIELD_LENGTH_MEDIUM)
  if (stap5kwalitatieveVerplichtingen) stap5Fields.kwalitatieveVerplichtingen = truncateField(stap5kwalitatieveVerplichtingen, MAX_FIELD_LENGTH_MEDIUM)
  if (stap5bestemmingsplan) stap5Fields.bestemmingsplan = truncateField(stap5bestemmingsplan, MAX_FIELD_LENGTH_MEDIUM)
  if (stap5teTaxerenBelang) stap5Fields.teTaxerenBelang = truncateField(stap5teTaxerenBelang, MAX_FIELD_LENGTH_MEDIUM)
  if (stap5gebruikConformOmgevingsplan) stap5Fields.gebruikConformOmgevingsplan = truncateField(stap5gebruikConformOmgevingsplan, MAX_FIELD_LENGTH_MEDIUM)
  if (stap5bijzonderePubliekrechtelijkeBepalingen) stap5Fields.bijzonderePubliekrechtelijkeBepalingen = truncateField(stap5bijzonderePubliekrechtelijkeBepalingen, MAX_FIELD_LENGTH_MEDIUM)
  if (stap5aantekeningenKadastraalObject) stap5Fields.aantekeningenKadastraalObject = truncateField(stap5aantekeningenKadastraalObject, MAX_FIELD_LENGTH_MEDIUM)
  if (stap5toelichtingEigendomPerceel) stap5Fields.toelichtingEigendomPerceel = truncateField(stap5toelichtingEigendomPerceel, MAX_FIELD_LENGTH_MEDIUM)
  if (Object.keys(stap5Fields).length > 0) {
    wizardData.stap5 = stap5Fields as Dossier['stap5']
  }

  const stap6Fields: Partial<NonNullable<Dossier['stap6']>> = {}
  if (stap6fundering) stap6Fields.fundering = truncateField(stap6fundering, MAX_FIELD_LENGTH_TEXTAREA)
  if (stap6dakbedekking) stap6Fields.dakbedekking = truncateField(stap6dakbedekking, MAX_FIELD_LENGTH_TEXTAREA)
  if (stap6installaties) stap6Fields.installaties = truncateField(stap6installaties, MAX_FIELD_LENGTH_TEXTAREA)
  if (stap6constructie) stap6Fields.constructie = truncateField(stap6constructie, MAX_FIELD_LENGTH_TEXTAREA)
  if (stap6achterstallig) stap6Fields.achterstalligOnderhoudBeschrijving = truncateField(stap6achterstallig, MAX_FIELD_LENGTH_TEXTAREA)
  if (stap6exterieurStaat) stap6Fields.exterieurStaat = stap6exterieurStaat
  if (stap6interieurStaat) stap6Fields.interieurStaat = stap6interieurStaat
  if (stap6onderhoudskosten !== undefined) stap6Fields.onderhoudskosten = stap6onderhoudskosten
  if (stap6terrein) stap6Fields.terrein = truncateField(stap6terrein, MAX_FIELD_LENGTH_MEDIUM)
  if (stap6gevels) stap6Fields.gevels = truncateField(stap6gevels, MAX_FIELD_LENGTH_MEDIUM)
  if (stap6afwerking) stap6Fields.afwerking = truncateField(stap6afwerking, MAX_FIELD_LENGTH_MEDIUM)
  if (stap6beveiliging) stap6Fields.beveiliging = truncateField(stap6beveiliging, MAX_FIELD_LENGTH_MEDIUM)
  if (stap6omschrijvingMilieuaspecten) stap6Fields.omschrijvingMilieuaspecten = truncateField(stap6omschrijvingMilieuaspecten, MAX_FIELD_LENGTH_MEDIUM)
  if (stap6toelichtingOnderhoud) stap6Fields.toelichtingOnderhoud = truncateField(stap6toelichtingOnderhoud, MAX_FIELD_LENGTH_TEXTAREA)
  if (stap6toelichtingParkeren) stap6Fields.toelichtingParkeren = truncateField(stap6toelichtingParkeren, MAX_FIELD_LENGTH_MEDIUM)
  if (stap6toelichtingFunctionaliteit) stap6Fields.toelichtingFunctionaliteit = truncateField(stap6toelichtingFunctionaliteit, MAX_FIELD_LENGTH_MEDIUM)
  if (Object.keys(stap6Fields).length > 0) {
    wizardData.stap6 = stap6Fields as Dossier['stap6']
  }

  const stap7Fields: Partial<NonNullable<Dossier['stap7']>> = {}
  // Merge vergunningen toelichting with duurzaamheid toelichting if present.
  // The " | " separator is intentional: it visually separates the two distinct
  // toelichting topics in a single text field.
  const TOELICHTING_SEPARATOR = ' | '
  const stap7toelichtingCombined = [stap7toelichting, stap7toelichtingDuurzaamheid].filter(Boolean).join(TOELICHTING_SEPARATOR)
  if (stap7toelichtingCombined) stap7Fields.toelichting = truncateField(stap7toelichtingCombined, MAX_FIELD_LENGTH_TEXTAREA)
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
  if (stap8bar !== undefined) stap8Fields.bar = stap8bar
  if (stap8nar !== undefined) stap8Fields.nar = stap8nar
  if (stap8marktwaarde !== undefined) stap8Fields.marktwaarde = stap8marktwaarde
  if (Object.keys(stap8Fields).length > 0) {
    wizardData.stap8 = stap8Fields as Dossier['stap8']
  }

  const stap9Fields: Partial<NonNullable<Dossier['stap9']>> = {}
  if (stap9aannames) stap9Fields.aannames = truncateField(stap9aannames, MAX_FIELD_LENGTH_TEXTAREA)
  if (stap9voorbehouden) stap9Fields.voorbehouden = truncateField(stap9voorbehouden, MAX_FIELD_LENGTH_TEXTAREA)
  if (stap9bijzondereOmstandigheden) stap9Fields.bijzondereOmstandigheden = truncateField(stap9bijzondereOmstandigheden, MAX_FIELD_LENGTH_TEXTAREA)

  // SWOT extraction — merged into stap9
  const swotData = extractSwotFromText(text)
  if (swotData.swotSterktes) stap9Fields.swotSterktes = truncateField(swotData.swotSterktes, MAX_FIELD_LENGTH_TEXTAREA)
  if (swotData.swotZwaktes) stap9Fields.swotZwaktes = truncateField(swotData.swotZwaktes, MAX_FIELD_LENGTH_TEXTAREA)
  if (swotData.swotKansen) stap9Fields.swotKansen = truncateField(swotData.swotKansen, MAX_FIELD_LENGTH_TEXTAREA)
  if (swotData.swotBedreigingen) stap9Fields.swotBedreigingen = truncateField(swotData.swotBedreigingen, MAX_FIELD_LENGTH_TEXTAREA)
  if (stap9algemeneUitgangspunten) stap9Fields.algemeneUitgangspunten = truncateField(stap9algemeneUitgangspunten, MAX_FIELD_LENGTH_TEXTAREA)
  if (stap9bijzondereUitgangspunten) stap9Fields.bijzondereUitgangspunten = truncateField(stap9bijzondereUitgangspunten, MAX_FIELD_LENGTH_TEXTAREA)
  if (stap9ontvangenInformatie) stap9Fields.ontvangenInformatie = truncateField(stap9ontvangenInformatie, MAX_FIELD_LENGTH_TEXTAREA)
  if (stap9wezenlijkeVeranderingen) stap9Fields.wezenlijkeVeranderingen = truncateField(stap9wezenlijkeVeranderingen, MAX_FIELD_LENGTH_MEDIUM)
  if (stap9taxatieOnnauwkeurigheid) stap9Fields.taxatieOnnauwkeurigheid = truncateField(stap9taxatieOnnauwkeurigheid, MAX_FIELD_LENGTH_MEDIUM)

  if (Object.keys(stap9Fields).length > 0) {
    wizardData.stap9 = stap9Fields as Dossier['stap9']
  }

  return wizardData
}

export async function parsePdfToRapport(
  file: File,
): Promise<Partial<HistorischRapport> & { _parseWarnings: string[] }> {
  const parseWarnings: string[] = []
  const text = await extractTextFromPdf(file)
  const sections = splitReportIntoSections(text)

  // Warn when section detection failed (only the fallback `volledig` key is present)
  const sectionKeys = Object.keys(sections).filter((k) => k !== 'volledig')
  if (sectionKeys.length === 0) {
    parseWarnings.push(
      'Er konden geen logische secties in het rapport worden gedetecteerd. De volledige tekst wordt als één geheel opgeslagen.',
    )
  }

  const result: Partial<HistorischRapport> = {
    rapportTeksten: sections,
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
    /(?:Totaal\s+BVO(?:\s+m[²2]\s+of\s+stuks)?|BVO|bruto\s+vloeroppervlak|gebruiksoppervlak(?:te)?|bruto\s+oppervlak(?:te)?|bruto\s+vloeroppervlakte|totale?\s+oppervlak(?:te)?|totaal\s+m[²2]|bruto\s+m[²2])[:\s]+([0-9]{1,3}(?:[.,][0-9]{3})*[.,]?[0-9]*)\s*m[²2]?/i
  )
  if (bvoMatch) {
    const val = normalizeArea(bvoMatch[1])
    if (val !== undefined) result.bvo = val
  }

  // --- Marktwaarde ---
  // Prefer exact (non-rounded) value over rounded when both labeled matches exist
  const marktwaardeRe = /(?:marktwaarde\s+kosten\s+koper|marktwaarde\s+k[.\s]?k[.]?|marktwaarde|getaxeerde\s+waarde|geschatte\s+waarde|taxatiewaarde|waarde\s+k\.?k\.?|waarde\s+kosten\s+koper)[:\s]+(?:€\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/gi
  let marktwaardeExact: number | undefined
  let marktwaardeRounded: number | undefined
  let mwMatch: RegExpExecArray | null
  while ((mwMatch = marktwaardeRe.exec(text)) !== null) {
    const v = normalizeEuro(mwMatch[1])
    if (v === undefined) continue
    // "Exact" = last 3 digits are not all zeros (i.e. value is not rounded to nearest thousand)
    if (v % 1000 !== 0) {
      if (marktwaardeExact === undefined) marktwaardeExact = v
    } else {
      if (marktwaardeRounded === undefined) marktwaardeRounded = v
    }
  }
  // Fallback: bare euro sign match
  const marktwaardeEuroMatch = text.match(/€\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{1,2})?)\b/)
  const marktwaardeEuroVal = marktwaardeEuroMatch ? normalizeEuro(marktwaardeEuroMatch[1]) : undefined
  // Prefer exact labeled > rounded labeled > bare euro
  const marktwaardeFinal = marktwaardeExact ?? marktwaardeRounded ?? marktwaardeEuroVal
  if (marktwaardeFinal !== undefined) result.marktwaarde = marktwaardeFinal

  // --- BAR ---
  // Handle "BAR: 8,15 %", "BAR | Kap. markt/herz. huur kk: 8,15 %", "bar | kap." formats.
  // Limit lookahead to 40 chars to cover longer label variants.
  const barMatch = text.match(
    /\bBAR\b[^:\n]{0,40}?:\s*([0-9]{1,2}[.,][0-9]{1,2})\s*%?/i
  )
  if (barMatch) {
    const val = normalizePercent(barMatch[1])
    if (val !== undefined) result.bar = val
  }

  // --- NAR ---
  // Handle "NAR: 6,75 %", "NAR % von: 6,75 %", "netto aanvangsrendement: 6,75%"
  const narMatch =
    text.match(/\bNAR\b[^:\n]{0,40}?:\s*([0-9]{1,2}[.,][0-9]{1,2})\s*%?/i) ??
    text.match(/netto\s+aanvangsrendement[:\s]+([0-9]{1,2}[.,][0-9]{1,2})\s*%?/i)
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
      `(?:waardepeildatum|waarde\\s+op|peildatum|getaxeerd\\s+per|getaxeerd\\s+op|datum\\s+taxatie|taxatiedatum|datum\\s+waardering|opnamedatum|datum\\s+van\\s+taxatie)[:\\s]+(\\d{1,2}[\\s\\-](?:${DUTCH_MONTH_PAT})[\\s\\-]\\d{4}|\\d{1,2}-\\d{1,2}-\\d{4})`,
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
    { keyword: 'bedrijfsruimte', value: 'bedrijfshal' },
    { keyword: 'distributiecentrum', value: 'bedrijfshal' },
    { keyword: 'logistiek', value: 'bedrijfshal' },
    { keyword: 'magazijn', value: 'bedrijfshal' },
    { keyword: 'kantoorgebouw', value: 'kantoor' },
    { keyword: 'kantoor', value: 'kantoor' },
    { keyword: 'winkel', value: 'winkel' },
    { keyword: 'horeca', value: 'overig' },
    { keyword: 'hotel', value: 'overig' },
    { keyword: 'zorgvastgoed', value: 'overig' },
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

  // --- extractionDebug: confidence info for each field ---
  result.extractionDebug = extractAllFieldsWithConfidence(text)

  // --- AI fallback: fill missing fields using OpenAI ---
  // This is optional and gracefully falls back to the regex-only result if it fails.
  try {
    const { aiExtractMissingFields } = await import('./pdfAIExtractor')
    const { result: aiResult, aiDebug, warnings: aiWarnings } = await aiExtractMissingFields(text, result)
    // Propagate any AI warnings (e.g. text truncation) to the caller
    parseWarnings.push(...aiWarnings)
    // Merge AI debug entries into extractionDebug (regex entries take precedence)
    if (Object.keys(aiDebug).length > 0) {
      result.extractionDebug = { ...aiDebug, ...result.extractionDebug }
      // Apply AI field values to result (only fields not already set by regex)
      Object.assign(result, {
        adres: aiResult.adres,
        typeObject: result.typeObject ?? aiResult.typeObject,
        gebruiksdoel: result.gebruiksdoel ?? aiResult.gebruiksdoel,
        bvo: result.bvo ?? aiResult.bvo,
        marktwaarde: result.marktwaarde ?? aiResult.marktwaarde,
        bar: result.bar ?? aiResult.bar,
        nar: result.nar ?? aiResult.nar,
        waardepeildatum: result.waardepeildatum ?? aiResult.waardepeildatum,
      })
      // Merge wizardData stap by stap (AI values only fill empty slots)
      if (aiResult.wizardData) {
        if (!result.wizardData) result.wizardData = {}
        const wd = result.wizardData
        const aiWd = aiResult.wizardData
        if (aiWd.stap1) wd.stap1 = { ...aiWd.stap1, ...wd.stap1 }
        if (aiWd.stap2) wd.stap2 = { ...aiWd.stap2, ...wd.stap2 }
        if (aiWd.stap3) wd.stap3 = { ...aiWd.stap3, ...wd.stap3 }
        if (aiWd.stap4) wd.stap4 = { ...aiWd.stap4, ...wd.stap4 }
        if (aiWd.stap5) wd.stap5 = { ...aiWd.stap5, ...wd.stap5 }
        if (aiWd.stap7) wd.stap7 = { ...aiWd.stap7, ...wd.stap7 }
        if (aiWd.stap8) wd.stap8 = { ...aiWd.stap8, ...wd.stap8 }
        if (aiWd.stap9) wd.stap9 = { ...aiWd.stap9, ...wd.stap9 }
      }
    }
  } catch (aiErr) {
    // AI fallback failed — continue with regex-only result
    console.warn('[parsePdfToRapport] AI fallback failed:', aiErr instanceof Error ? aiErr.message : aiErr)
  }

  return Object.assign(result, { _parseWarnings: parseWarnings })
}
