import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { Dossier, HistorischRapport, ObjectType, Gebruiksdoel, Ligging, Onderhoudsstaat, Energielabel, WaarderingsMethode } from '../types'

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

/**
 * Finds a keyword/heading in the text and extracts the paragraph following it.
 * Returns up to maxChars characters or until the next heading-like line is found.
 */
function extractSectionAfterKeyword(
  text: string,
  keywords: string[],
  maxChars = 500
): string | undefined {
  const lowerText = text.toLowerCase()
  for (const keyword of keywords) {
    const idx = lowerText.indexOf(keyword.toLowerCase())
    if (idx === -1) continue
    // Start after the keyword
    const afterKeyword = text.slice(idx + keyword.length)
    // Skip any leading colon/whitespace
    const trimmed = afterKeyword.replace(/^[\s:\-–]+/, '')
    if (!trimmed) continue
    // Cut at next heading-like boundary (a short ALL-CAPS word or a blank line followed by capitalised word)
    // Use a simple heuristic: cut at double newline or at maxChars
    const cutAtDoubleNewline = trimmed.indexOf('\n\n')
    const cutAt = cutAtDoubleNewline !== -1 && cutAtDoubleNewline < maxChars
      ? cutAtDoubleNewline
      : maxChars
    const extracted = trimmed.slice(0, cutAt).trim()
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
  const stap1objectnaam = extractSectionAfterKeyword(text, ['objectnaam', 'object:', 'pand:'], 100)

  const stap1naamTaxateur = extractSectionAfterKeyword(text, [
    'taxateur:',
    'beëdigd taxateur',
    'getaxeerd door',
    'naam taxateur',
  ], 100)

  const stap1inspectiedatumRaw = extractSectionAfterKeyword(text, [
    'inspectiedatum',
    'datum inspectie',
    'opnamedatum',
  ], 30)
  const stap1inspectiedatum = stap1inspectiedatumRaw ? parseDatum(stap1inspectiedatumRaw) : undefined

  // --- Stap 2: Adres & Locatie ---
  const stap2gemeente = extractSectionAfterKeyword(text, ['gemeente:'], 80)

  const stap2provincie = extractSectionAfterKeyword(text, ['provincie:'], 80)

  const LIGGING_VALUES: Ligging[] = ['binnenstad', 'woonwijk', 'bedrijventerrein', 'buitengebied', 'gemengd']
  let stap2ligging: Ligging | undefined
  for (const val of LIGGING_VALUES) {
    if (lowerText.includes(val)) {
      stap2ligging = val
      break
    }
  }

  const stap2bereikbaarheid = extractSectionAfterKeyword(text, [
    'bereikbaarheid',
    'ontsluiting',
    'infrastructuur',
    'ov-verbinding',
    'openbaar vervoer',
    'snelweg',
  ])

  // --- Stap 3: Oppervlaktes ---
  const vvoMatch = text.match(/(?:VVO|verhuurbaar vloeroppervlak)[:\s]+([0-9]{1,6}[.,]?[0-9]*)\s*m[²2]?/i)
  const stap3vvo = vvoMatch ? parseNumber(vvoMatch[1]) : undefined

  const perceelMatch = text.match(/(?:perceeloppervlak|kaveloppervlak|perceel[:\s])[:\s]+([0-9]{1,6}[.,]?[0-9]*)\s*m[²2]?/i)
  const stap3perceeloppervlak = perceelMatch ? parseNumber(perceelMatch[1]) : undefined

  const bouwlagenMatch = text.match(/(?:bouwlagen|verdiepingen|lagen)[:\s]+([0-9]{1,2})/i)
  const stap3aantalBouwlagen = bouwlagenMatch ? parseInt(bouwlagenMatch[1], 10) : undefined

  const bouwjaarMatch = text.match(/(?:bouwjaar|gebouwd in|jaar van oplevering)[:\s]+([0-9]{4})/i)
  const stap3bouwjaar = bouwjaarMatch ? parseInt(bouwjaarMatch[1], 10) : undefined

  const stap3aanbouwen = extractSectionAfterKeyword(text, ['aanbouw', 'uitbreiding', 'bijgebouw'], 200)

  // --- Stap 4: Huurgegevens ---
  const huurprijsMatch = text.match(/(?:huurprijs|jaarhuur|huur per jaar)[:\s]+(?:€\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/i)
  const stap4huurprijsPerJaar = huurprijsMatch ? parseNumber(huurprijsMatch[1]) : undefined

  const markthuurMatch = text.match(/(?:markthuur)[:\s]+(?:€\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/i)
  const stap4markthuurPerJaar = markthuurMatch ? parseNumber(markthuurMatch[1]) : undefined

  const stap4contracttype = extractSectionAfterKeyword(text, ['huurovereenkomst', 'contracttype', 'roz'], 100)

  const stap4huurder = extractSectionAfterKeyword(text, ['huurder:'], 100)

  const stap4verhuurd = lowerText.includes('verhuurd') || stap4huurder !== undefined || stap4huurprijsPerJaar !== undefined

  // --- Stap 6: Technische Staat ---
  const ONDERHOUD_VALUES: Onderhoudsstaat[] = ['uitstekend', 'goed', 'redelijk', 'matig', 'slecht']

  let stap6exterieurStaat: Onderhoudsstaat | undefined
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

  let stap6interieurStaat: Onderhoudsstaat | undefined
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

  const onderhoudskostenMatch = text.match(/(?:onderhoudskosten|onderhoud per jaar)[:\s]+(?:€\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/i)
  const stap6onderhoudskosten = onderhoudskostenMatch ? parseNumber(onderhoudskostenMatch[1]) : undefined

  const stap6fundering = extractSectionAfterKeyword(text, [
    'fundering',
    'funderingstype',
    'funderingssituatie',
  ])

  const stap6dakbedekking = extractSectionAfterKeyword(text, [
    'dakbedekking',
    'daktype',
    'dak:',
    'dakconstruct',
  ])

  const stap6installaties = extractSectionAfterKeyword(text, [
    'installaties',
    'installatie:',
    'klimaatinstallatie',
    'verwarmingssysteem',
    'technische installaties',
  ])

  const stap6achterstallig = extractSectionAfterKeyword(text, [
    'achterstallig onderhoud',
    'achterstalligonderhoud',
    'onderhoudstoestand',
  ])

  // --- Stap 5: Juridische Info ---
  const stap5eigendomssituatie = extractSectionAfterKeyword(text, [
    'eigendomssituatie',
    'eigendomsvorm',
    'eigendom:',
  ])

  const stap5erfpacht = extractSectionAfterKeyword(text, [
    'erfpacht',
    'erfpachtsituatie',
    'canonverplichting',
  ])

  const stap5zakelijkeRechten = extractSectionAfterKeyword(text, [
    'zakelijke rechten',
    'zakelijkerechten',
    'recht van opstal',
    'erfdienstbaarheid',
  ])

  const stap5kwalitatieveVerplichtingen = extractSectionAfterKeyword(text, [
    'kwalitatieve verplichting',
    'kwalitatieve verplichtingen',
    'kettingbeding',
  ])

  const stap5bestemmingsplan = extractSectionAfterKeyword(text, [
    'bestemmingsplan',
    'bestemming:',
    'planologische bestemming',
  ])

  // --- Stap 7: Vergunningen ---
  let stap7energielabel: Energielabel | undefined
  const energielabelMatch = text.match(/energielabel[:\s]+([A-G][+]{0,4})/i)
  if (energielabelMatch) {
    stap7energielabel = energielabelMatch[1] as Energielabel
  }

  let stap7asbest: 'ja' | 'nee' | 'onbekend' | undefined
  const asbestIdx = lowerText.indexOf('asbest')
  if (asbestIdx !== -1) {
    const asbestContext = lowerText.slice(asbestIdx, asbestIdx + 150)
    if (asbestContext.includes('aanwezig') || asbestContext.includes('ja') || asbestContext.includes('vastgesteld')) {
      stap7asbest = 'ja'
    } else if (asbestContext.includes('niet aanwezig') || asbestContext.includes('nee') || asbestContext.includes('geen asbest')) {
      stap7asbest = 'nee'
    } else if (asbestContext.includes('onbekend') || asbestContext.includes('niet onderzocht')) {
      stap7asbest = 'onbekend'
    }
  }

  let stap7bodemverontreiniging: 'ja' | 'nee' | 'onbekend' | undefined
  let bodemIdx = lowerText.indexOf('bodemverontreiniging')
  if (bodemIdx === -1) bodemIdx = lowerText.indexOf('bodemkwaliteit')
  if (bodemIdx !== -1) {
    const bodemContext = lowerText.slice(bodemIdx, bodemIdx + 150)
    if (bodemContext.includes('aanwezig') || bodemContext.includes('verontreinigd') || bodemContext.includes('ja')) {
      stap7bodemverontreiniging = 'ja'
    } else if (bodemContext.includes('niet aanwezig') || bodemContext.includes('schoon') || bodemContext.includes('nee')) {
      stap7bodemverontreiniging = 'nee'
    } else if (bodemContext.includes('onbekend') || bodemContext.includes('niet onderzocht')) {
      stap7bodemverontreiniging = 'onbekend'
    }
  }

  const stap7toelichting = extractSectionAfterKeyword(text, [
    'toelichting vergunningen',
    'vergunningen toelichting',
    'omgevingsvergunning toelichting',
    'energielabel toelichting',
    'asbest toelichting',
  ])

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
  const methodeIdx = lowerText.search(/waarderingsmethode|taxatiemethode/)
  if (methodeIdx !== -1) {
    const methodeContext = lowerText.slice(methodeIdx, methodeIdx + 100)
    for (const { keyword, value } of WAARDERINGSMETHODEN) {
      if (methodeContext.includes(keyword)) {
        stap8methode = value
        break
      }
    }
  }

  const ovwMatch = text.match(/onderhandse verkoopwaarde[:\s]+(?:€\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/i)
  const stap8onderhandseVerkoopwaarde = ovwMatch ? parseNumber(ovwMatch[1]) : undefined

  const kapFacMatch = text.match(/kapitalisatiefactor[:\s]+([0-9]{1,2}[.,][0-9]{1,2})/i)
  const stap8kapitalisatiefactor = kapFacMatch ? parseNumber(kapFacMatch[1]) : undefined

  // --- Stap 9: Aannames ---
  const stap9aannames = extractSectionAfterKeyword(text, [
    'aannames',
    'aanname:',
    'uitgangspunten',
  ])

  const stap9voorbehouden = extractSectionAfterKeyword(text, [
    'voorbehouden',
    'voorbehoud:',
    'voorbehoud,',
  ])

  const stap9bijzondereOmstandigheden = extractSectionAfterKeyword(text, [
    'bijzondere omstandigheden',
    'bijzonderomstandigheid',
    'bijzonderheden',
  ])

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

  // --- WizardData extracted from text ---
  result.wizardData = extractWizardDataFromText(text)

  return result
}
