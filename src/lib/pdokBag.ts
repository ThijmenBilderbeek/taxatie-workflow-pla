/**
 * Helper functies voor het ophalen van BAG objecten via de PDOK BAG OGC API.
 * De PDOK BAG OGC API ondersteunt CORS en kan vanuit de browser worden aangeroepen.
 */

const BAG_API_URL = 'https://api.pdok.nl/bzk/bag/ogc/v1/collections'

/** Maximaal aantal BAG objecten per query (API limiet) */
const MAX_BAG_OBJECTS_PER_QUERY = 50

/**
 * Kleine buffer in graden om objecten net aan de perceelrand mee te nemen.
 * 0.000005° ≈ 0.5m in WGS84-coördinaten (op Nederlandse breedte).
 */
const BBOX_BUFFER_DEGREES = 0.000005

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
  const bbox = berekenBbox(perceelGeometry)

  // Voeg kleine buffer toe zodat we objecten net aan de rand ook meenemen
  const bboxStr = `${bbox.minLng - BBOX_BUFFER_DEGREES},${bbox.minLat - BBOX_BUFFER_DEGREES},${bbox.maxLng + BBOX_BUFFER_DEGREES},${bbox.maxLat + BBOX_BUFFER_DEGREES}`

  async function fetchCollection(collection: string): Promise<GeoJSON.Feature[]> {
    try {
      const params = new URLSearchParams({ bbox: bboxStr, 'bbox-crs': 'http://www.opengis.net/def/crs/OGC/1.3/CRS84', limit: String(MAX_BAG_OBJECTS_PER_QUERY), f: 'json' })
      const resp = await fetch(`${BAG_API_URL}/${collection}/items?${params.toString()}`)
      if (!resp.ok) return []
      const json = await resp.json()
      return json?.features ?? []
    } catch {
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
