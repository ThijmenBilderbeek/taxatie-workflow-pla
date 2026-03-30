/**
 * Helper functies voor het ophalen en parsen van kadastrale perceeldata via de PDOK Locatieserver.
 */

export interface KadastraalPerceel {
  gemeente: string
  sectie: string
  perceelnummer: string
}

/**
 * Parst een perceelidentificatie-string (bijv. "HTN02-A-1234") naar een KadastraalPerceel object.
 * Formaat: "<gemeente>-<sectie>-<perceelnummer>"
 */
export function parsePerceelIdentificatie(id: string): KadastraalPerceel | null {
  // Splits op het eerste en tweede koppelteken: gemeente kan ook koppeltekens bevatten
  // Formaat: GEMEENTE-SECTIE-NUMMER, waarbij NUMMER numeriek is en SECTIE één letter
  const match = id.match(/^(.+)-([A-Z]{1,2})-(\d+)$/)
  if (!match) return null
  return {
    gemeente: match[1],
    sectie: match[2],
    perceelnummer: match[3],
  }
}

/**
 * Haalt de gekoppelde kadastrale percelen op via de PDOK Locatieserver lookup.
 * Leest het veld `gekoppeld_perceel` uit het response.
 */
export async function haalGekoppeldePercelenOp(adresId: string): Promise<KadastraalPerceel[]> {
  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${encodeURIComponent(adresId)}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`PDOK lookup mislukt: ${resp.status}`)
  const json = await resp.json()
  const doc = json?.response?.docs?.[0]
  if (!doc) return []

  const gekoppeld: string[] = Array.isArray(doc.gekoppeld_perceel) ? doc.gekoppeld_perceel : []
  const percelen: KadastraalPerceel[] = []
  for (const id of gekoppeld) {
    const parsed = parsePerceelIdentificatie(id)
    if (parsed) percelen.push(parsed)
  }
  return percelen
}
