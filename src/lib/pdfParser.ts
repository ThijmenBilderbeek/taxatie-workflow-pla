import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { HistorischRapport, ObjectType, Gebruiksdoel } from '../types'

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

function parseNumber(raw: string): number | undefined {
  // Remove currency symbol, dots used as thousands separators, spaces, then replace comma with dot
  const cleaned = raw.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.')
  const value = parseFloat(cleaned)
  return isNaN(value) ? undefined : value
}

function parseDatum(raw: string): string | undefined {
  // Try DD-MM-YYYY or D-M-YYYY
  const dmyMatch = raw.match(/(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // Try "D maandnaam YYYY" (Dutch)
  const DUTCH_MONTHS: Record<string, string> = {
    januari: '01',
    februari: '02',
    maart: '03',
    april: '04',
    mei: '05',
    juni: '06',
    juli: '07',
    augustus: '08',
    september: '09',
    oktober: '10',
    november: '11',
    december: '12',
  }
  const dutchMonthPattern = Object.keys(DUTCH_MONTHS).join('|')
  const dutchMatch = raw.match(new RegExp(`(\\d{1,2})\\s+(${dutchMonthPattern})\\s+(\\d{4})`, 'i'))
  if (dutchMatch) {
    const [, day, monthName, year] = dutchMatch
    const month = DUTCH_MONTHS[monthName.toLowerCase()]
    return `${year}-${month}-${day.padStart(2, '0')}`
  }

  return undefined
}

export async function parsePdfToRapport(file: File): Promise<Partial<HistorischRapport>> {
  const text = await extractTextFromPdf(file)
  const result: Partial<HistorischRapport> = {
    rapportTeksten: { volledig: text },
  }

  // --- Adres ---
  // Look for pattern like "Keizersgracht 123" (street + housenumber)
  const straatMatch = text.match(/([A-Za-zÀ-öø-ÿ][A-Za-zÀ-öø-ÿ\s\-'\.]+?)\s+(\d+[\w\-]*)\b/)
  if (straatMatch) {
    result.adres = {
      straat: straatMatch[1].trim(),
      huisnummer: straatMatch[2].trim(),
      postcode: '',
      plaats: '',
    }
  } else {
    result.adres = { straat: '', huisnummer: '', postcode: '', plaats: '' }
  }

  // Postcode: 1234 AB
  const postcodeMatch = text.match(/\b(\d{4}\s?[A-Z]{2})\b/)
  if (postcodeMatch) {
    result.adres!.postcode = postcodeMatch[1].replace(/\s/, '')
  }

  // Plaats: word(s) after postcode
  if (postcodeMatch) {
    const afterPostcode = text.slice(text.indexOf(postcodeMatch[0]) + postcodeMatch[0].length)
    const plaatsMatch = afterPostcode.match(/^\s*([A-Za-zÀ-öø-ÿ][A-Za-zÀ-öø-ÿ\s\-']{1,30}?)\s*[\n,]/)
    if (plaatsMatch) {
      result.adres!.plaats = plaatsMatch[1].trim()
    }
  }

  // --- BVO ---
  const bvoMatch = text.match(/(?:BVO|GBO|bruto vloeroppervlak|gebruiksoppervlak(?:te)?)[:\s]+([0-9]{1,6}[.,]?[0-9]*)\s*m[²2]?/i)
  if (bvoMatch) {
    const val = parseNumber(bvoMatch[1])
    if (val !== undefined) result.bvo = val
  }

  // --- Marktwaarde ---
  // First try with explicit "marktwaarde" keyword for precision
  const marktwaardeKeyMatch = text.match(/marktwaarde[:\s]+(?:€\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/i)
  const marktwaardeEuroMatch = text.match(/€\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{1,2})?)\b/)
  const marktwaardeMatch = marktwaardeKeyMatch ?? marktwaardeEuroMatch
  if (marktwaardeMatch) {
    const val = parseNumber(marktwaardeMatch[1])
    if (val !== undefined) result.marktwaarde = val
  }

  // --- BAR ---
  const barMatch = text.match(/(?:BAR|bruto\s+aanvangsrendement)[:\s]+([0-9]{1,2}[.,][0-9]{1,2})\s*%?/i)
  if (barMatch) {
    const val = parseNumber(barMatch[1])
    if (val !== undefined) result.bar = val
  }

  // --- NAR ---
  const narMatch = text.match(/(?:NAR|netto\s+aanvangsrendement)[:\s]+([0-9]{1,2}[.,][0-9]{1,2})\s*%?/i)
  if (narMatch) {
    const val = parseNumber(narMatch[1])
    if (val !== undefined) result.nar = val
  }

  // --- Waardepeildatum ---
  const peildatumMatch = text.match(
    /(?:waardepeildatum|peildatum)[:\s]+(\d{1,2}[\s\-]\w+[\s\-]\d{4}|\d{1,2}-\d{1,2}-\d{4})/i
  )
  if (peildatumMatch) {
    const parsed = parseDatum(peildatumMatch[1])
    if (parsed) result.waardepeildatum = parsed
  } else {
    // Try standalone date patterns
    const datumMatch = text.match(/\b(\d{1,2}\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4})\b/i)
    if (datumMatch) {
      const parsed = parseDatum(datumMatch[1])
      if (parsed) result.waardepeildatum = parsed
    }
  }

  // --- Type object ---
  const lowerText = text.toLowerCase()
  const objectTypes: { keyword: string; value: ObjectType }[] = [
    { keyword: 'bedrijfscomplex', value: 'bedrijfscomplex' },
    { keyword: 'bedrijfshal', value: 'bedrijfshal' },
    { keyword: 'appartement', value: 'appartement' },
    { keyword: 'kantoor', value: 'kantoor' },
    { keyword: 'winkel', value: 'winkel' },
    { keyword: 'woning', value: 'woning' },
  ]
  for (const { keyword, value } of objectTypes) {
    if (lowerText.includes(keyword)) {
      result.typeObject = value
      break
    }
  }

  // --- Gebruiksdoel ---
  const gebruiksdoelen: { keyword: string; value: Gebruiksdoel }[] = [
    { keyword: 'eigenaar-gebruiker', value: 'eigenaar_gebruiker' },
    { keyword: 'eigenaar gebruiker', value: 'eigenaar_gebruiker' },
    { keyword: 'belegging', value: 'verhuurd_belegging' },
    { keyword: 'verhuurd', value: 'verhuurd_belegging' },
    { keyword: 'leegstand', value: 'leegstand' },
  ]
  for (const { keyword, value } of gebruiksdoelen) {
    if (lowerText.includes(keyword)) {
      result.gebruiksdoel = value
      break
    }
  }

  return result
}
