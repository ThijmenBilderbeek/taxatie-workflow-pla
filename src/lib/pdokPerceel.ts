/**
 * Helper functies voor het ophalen en parsen van kadastrale perceeldata via de PDOK API.
 */

// --- Types ---

/** Basis kadastrale perceel data */
export interface PerceelData {
  gemeente: string             // bijv. "VLO00"
  sectie: string               // bijv. "E"
  perceelnummer: string        // bijv. "600"
  volledigeAanduiding: string  // bijv. "VLO00-E-600"
}

/** Verrijkte perceeldata met oppervlakte en geometrie */
export interface PerceelVerrijking extends PerceelData {
  oppervlakte?: number  // m² uit Kadastrale Kaart API
  geometrie?: any       // GeoJSON geometry (optioneel, voor toekomstig kaartgebruik)
}

/** @deprecated Gebruik PerceelData */
export type KadastraalPerceel = PerceelData

// --- Functies ---

/**
 * Parse een perceelstring "GEM00-S-1234" of "GEM00 S 1234" naar PerceelData.
 * Kan null teruggeven als parsing faalt.
 */
export function parsePerceelString(perceelStr: string): PerceelData | null {
  // Probeer formaat "GEMEENTE-SECTIE-NUMMER" (koppelteken als separator)
  const matchDash = perceelStr.trim().match(/^(.+)-([A-Z]{1,2})-(\d+)$/)
  if (matchDash) {
    const gemeente = matchDash[1]
    const sectie = matchDash[2]
    const perceelnummer = matchDash[3]
    return { gemeente, sectie, perceelnummer, volledigeAanduiding: `${gemeente}-${sectie}-${perceelnummer}` }
  }
  // Probeer formaat "GEMEENTE SECTIE NUMMER" (spatie als separator)
  const matchSpace = perceelStr.trim().match(/^(.+)\s+([A-Z]{1,2})\s+(\d+)$/)
  if (matchSpace) {
    const gemeente = matchSpace[1]
    const sectie = matchSpace[2]
    const perceelnummer = matchSpace[3]
    return { gemeente, sectie, perceelnummer, volledigeAanduiding: `${gemeente}-${sectie}-${perceelnummer}` }
  }
  return null
}

/** @deprecated Gebruik parsePerceelString */
export function parsePerceelIdentificatie(id: string): PerceelData | null {
  return parsePerceelString(id)
}

/**
 * Haal percelen op uit een PDOK lookup doc.
 * gekoppeld_perceel kan een string of string[] zijn. Normaliseer naar PerceelData[].
 */
export function extractPercelenUitPdokDoc(doc: any): PerceelData[] {
  // gekoppeld_perceel kan een string (1 perceel) of string[] (meerdere) zijn
  const rawPercelen = doc?.gekoppeld_perceel
  const gekoppeld: string[] = Array.isArray(rawPercelen)
    ? rawPercelen
    : typeof rawPercelen === 'string'
      ? [rawPercelen]
      : []
  const percelen: PerceelData[] = []
  for (const id of gekoppeld) {
    const parsed = parsePerceelString(id)
    if (parsed) percelen.push(parsed)
  }
  return percelen
}

/**
 * Haalt de gekoppelde kadastrale percelen op via de PDOK Locatieserver lookup.
 * Leest het veld `gekoppeld_perceel` uit het response.
 */
export async function haalGekoppeldePercelenOp(adresId: string): Promise<PerceelData[]> {
  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${encodeURIComponent(adresId)}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`PDOK lookup mislukt: ${resp.status}`)
  const json = await resp.json()
  const doc = json?.response?.docs?.[0]
  if (!doc) return []
  return extractPercelenUitPdokDoc(doc)
}

/**
 * Haal verrijkte perceeldata op via de PDOK BRK Kadastrale Kaart OGC API.
 * Endpoint: https://api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1/collections/perceel/items
 * Haalt oppervlakte en geometrie op.
 * Geeft null terug bij een error of geen resultaten.
 */
export async function haalPerceelVerrijking(perceel: PerceelData): Promise<PerceelVerrijking | null> {
  // Validate fields to prevent filter injection: gemeente is alphanumeric, sectie is letters, perceelnummer is digits
  if (!/^[A-Z0-9]+$/.test(perceel.gemeente) || !/^[A-Z]{1,2}$/.test(perceel.sectie) || !/^\d+$/.test(perceel.perceelnummer)) {
    throw new Error('Ongeldig perceelformaat')
  }
  try {
    const filter = `akr_kadastrale_gemeente_code_waarde='${perceel.gemeente}' AND sectie='${perceel.sectie}' AND perceelnummer=${perceel.perceelnummer}`
    const url = `https://api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1/collections/perceel/items?filter=${encodeURIComponent(filter)}&limit=1`
    const resp = await fetch(url)
    if (!resp.ok) {
      console.warn(`PDOK Kadastrale Kaart API mislukt: ${resp.status} ${resp.statusText}`)
      return null
    }
    const json = await resp.json()
    const feature = json?.features?.[0]
    if (!feature) {
      console.warn('Geen perceel gevonden via Kadastrale Kaart API')
      return null
    }
    return {
      ...perceel,
      oppervlakte: feature.properties?.kadastrale_grootte_waarde,
      geometrie: feature.geometry,
    }
  } catch (err) {
    console.warn('Fout bij ophalen perceelverrijking:', err)
    return null
  }
}
