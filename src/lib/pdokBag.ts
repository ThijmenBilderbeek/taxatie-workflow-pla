/**
 * Helper functies voor het ophalen van BAG objecten via de PDOK BAG OGC API.
 * De PDOK BAG OGC API ondersteunt CORS en kan vanuit de browser worden aangeroepen.
 */

const BAG_API_URL = 'https://api.pdok.nl/bzk/bag/ogc/v1/collections'

/** Maximaal aantal BAG objecten per query (API limiet) */
const MAX_BAG_OBJECTS_PER_QUERY = 50

/**
 * Converteert WGS84 (lat/lng) naar RD New (EPSG:28992) coördinaten.
 * Gebaseerd op de officiële benaderingsformules (RDNAPTRANS2018).
 */
function wgs84ToRd(lat: number, lng: number): { x: number; y: number } {
  const dLat = 0.36 * (lat - 52.15517440)
  const dLng = 0.36 * (lng - 5.38720621)

  const x = 155000
    + 190094.945 * dLng
    - 11832.228 * dLat * dLng
    - 114.221 * dLat * dLat * dLng
    + 0.3 * dLng * dLng * dLng
    - 32.162 * dLat * dLng * dLng * dLng
    - 0.608 * dLat * dLat * dLat * dLng

  const y = 463000
    + 309056.544 * dLat
    - 3638.893 * dLng * dLng
    + 73.077 * dLat * dLat
    - 157.984 * dLat * dLng * dLng
    + 59.788 * dLat * dLat * dLat
    + 0.433 * dLng * dLng * dLng * dLng
    - 6.439 * dLat * dLat * dLng * dLng
    + 0.092 * dLng * dLng * dLng * dLng * dLng
    - 0.054 * dLat * dLat * dLat * dLng * dLng

  return { x, y }
}

export interface BagPand {
  identificatie: string
  gebruiksdoel?: string
  bouwjaar?: number
  oppervlakte?: number
}

export interface BagVerblijfsobject {
  identificatie: string
  gebruiksdoel?: string
  oppervlakte?: number
  pandIdentificaties?: string[]
}

export interface BagNummeraanduiding {
  identificatie: string
  huisnummer?: number
  huisletter?: string
  huisnummertoevoeging?: string
  postcode?: string
  woonplaats?: string
  straatnaam?: string
  verblijfsobjectIdentificatie?: string
}

export interface BagPerceelData {
  panden: BagPand[]
  verblijfsobjecten: BagVerblijfsobject[]
  nummeraanduidingen: BagNummeraanduiding[]
}

function berekenBbox(geometry: GeoJSON.GeoJsonObject): { minLng: number; minLat: number; maxLng: number; maxLat: number } {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity

  function verwerkCoords(coords: unknown): void {
    if (!Array.isArray(coords)) return
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords as number[]
      if (lng < minLng) minLng = lng
      if (lat < minLat) minLat = lat
      if (lng > maxLng) maxLng = lng
      if (lat > maxLat) maxLat = lat
    } else {
      for (const c of coords) verwerkCoords(c)
    }
  }

  const geom = geometry as GeoJSON.Geometry
  if ('coordinates' in geom) {
    verwerkCoords(geom.coordinates)
  } else if (geom.type === 'GeometryCollection') {
    for (const g of (geom as GeoJSON.GeometryCollection).geometries) verwerkCoords((g as GeoJSON.Polygon).coordinates)
  }

  return { minLng, minLat, maxLng, maxLat }
}

function mapPand(feature: GeoJSON.Feature): BagPand {
  const p = feature.properties ?? {}
  return {
    identificatie: p.identificatie ?? p.id ?? '',
    gebruiksdoel: Array.isArray(p.gebruiksdoel) ? p.gebruiksdoel[0] : p.gebruiksdoel,
    bouwjaar: p.oorspronkelijkBouwjaar ?? p.bouwjaar,
    oppervlakte: p.oppervlakte,
  }
}

function mapVerblijfsobject(feature: GeoJSON.Feature): BagVerblijfsobject {
  const p = feature.properties ?? {}
  const pandIds: string[] = Array.isArray(p.maaktDeelUitVan)
    ? p.maaktDeelUitVan
    : p.maaktDeelUitVan
      ? [p.maaktDeelUitVan]
      : []
  return {
    identificatie: p.identificatie ?? p.id ?? '',
    gebruiksdoel: Array.isArray(p.gebruiksdoel) ? p.gebruiksdoel[0] : p.gebruiksdoel,
    oppervlakte: p.oppervlakte,
    pandIdentificaties: pandIds,
  }
}

function mapNummeraanduiding(feature: GeoJSON.Feature): BagNummeraanduiding {
  const p = feature.properties ?? {}
  return {
    identificatie: p.identificatie ?? p.id ?? '',
    huisnummer: p.huisnummer,
    huisletter: p.huisletter,
    huisnummertoevoeging: p.huisnummertoevoeging,
    postcode: p.postcode,
    woonplaats: p.woonplaatsnaam ?? p.woonplaats,
    straatnaam: p.openbareRuimtenaam ?? p.straatnaam,
    verblijfsobjectIdentificatie: p.adresseertVerblijfsobject ?? p.verblijfsobjectIdentificatie,
  }
}

/**
 * Haalt BAG objecten op voor een perceel via de PDOK BAG OGC API.
 * Gebruikt de perceelgeometrie om de bounding box te berekenen.
 */
export async function haalBagObjectenVoorPerceel(perceelGeometry: GeoJSON.GeoJsonObject): Promise<BagPerceelData> {
  const wgs84Bbox = berekenBbox(perceelGeometry)

  // Converteer WGS84 naar RD coördinaten
  const rdMin = wgs84ToRd(wgs84Bbox.minLat, wgs84Bbox.minLng)
  const rdMax = wgs84ToRd(wgs84Bbox.maxLat, wgs84Bbox.maxLng)

  // Buffer van 5 meter in RD coördinaten
  const BUFFER_M = 5
  const bboxStr = `${rdMin.x - BUFFER_M},${rdMin.y - BUFFER_M},${rdMax.x + BUFFER_M},${rdMax.y + BUFFER_M}`

  async function fetchCollection(collection: string): Promise<GeoJSON.Feature[]> {
    try {
      const params = new URLSearchParams({ bbox: bboxStr, limit: String(MAX_BAG_OBJECTS_PER_QUERY), f: 'json' })
      const url = `${BAG_API_URL}/${collection}/items?${params.toString()}`
      console.log(`[BAG] Fetching ${collection}:`, url)
      const resp = await fetch(url)
      if (!resp.ok) {
        console.warn(`[BAG] ${collection}: HTTP ${resp.status}`)
        return []
      }
      const json = await resp.json()
      console.log(`[BAG] ${collection} features:`, json?.features?.length ?? 0)
      return json?.features ?? []
    } catch (err) {
      console.warn(`[BAG] ${collection} failed:`, err)
      return []
    }
  }

  const [pandenFeatures, vboFeatures, naFeatures] = await Promise.all([
    fetchCollection('panden'),
    fetchCollection('verblijfsobjecten'),
    fetchCollection('nummeraanduidingen'),
  ])

  return {
    panden: pandenFeatures.map(mapPand),
    verblijfsobjecten: vboFeatures.map(mapVerblijfsobject),
    nummeraanduidingen: naFeatures.map(mapNummeraanduiding),
  }
}
