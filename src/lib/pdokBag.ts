/**
 * Helper functies voor het ophalen van BAG objecten via de PDOK BAG OGC API.
 * De PDOK BAG OGC API ondersteunt CORS en kan vanuit de browser worden aangeroepen.
 */

import { pointInGeoJsonGeometry } from './geoUtils';

const BAG_API_URL = 'https://api.pdok.nl/kadaster/bag/ogc/v2/collections';

/** Maximaal aantal BAG objecten per query (API limiet) */
const MAX_BAG_OBJECTS_PER_QUERY = 50;

export interface BagPand {
  identificatie: string;
  gebruiksdoel?: string;
  bouwjaar?: number;
  oppervlakte?: number;
}

export interface BagVerblijfsobject {
  identificatie: string;
  gebruiksdoel?: string;
  oppervlakte?: number;
  pandIdentificaties?: string[];
}

export interface BagNummeraanduiding {
  identificatie: string;
  huisnummer?: number;
  huisletter?: string;
  huisnummertoevoeging?: string;
  postcode?: string;
  woonplaats?: string;
  straatnaam?: string;
  verblijfsobjectIdentificatie?: string;
}

export interface BagPerceelData {
  panden: BagPand[];
  verblijfsobjecten: BagVerblijfsobject[];
  nummeraanduidingen: BagNummeraanduiding[];
}

function berekenBbox(geometry: GeoJSON.GeoJsonObject): { minLng: number; minLat: number; maxLng: number; maxLat: number } {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

  function verwerkCoords(coords: unknown): void {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords as number[];
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    } else {
      for (const c of coords) verwerkCoords(c);
    }
  }

  const geom = geometry as GeoJSON.Geometry;
  if ('coordinates' in geom) {
    verwerkCoords(geom.coordinates);
  } else if (geom.type === 'GeometryCollection') {
    for (const g of (geom as GeoJSON.GeometryCollection).geometries) verwerkCoords((g as GeoJSON.Polygon).coordinates);
  }

  return { minLng, minLat, maxLng, maxLat };
}

function mapPand(feature: GeoJSON.Feature): BagPand {
  const p = feature.properties ?? {};
  return {
    identificatie: p.identificatie ?? p.id ?? '',
    gebruiksdoel: Array.isArray(p.gebruiksdoel) ? p.gebruiksdoel[0] : p.gebruiksdoel,
    bouwjaar: p.oorspronkelijkBouwjaar ?? p.bouwjaar,
    oppervlakte: p.oppervlakte,
  };
}

function extractId(value: unknown): string {
  if (typeof value !== 'string') return '';
  if (value.startsWith('http')) {
    const parts = value.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  }
  return value;
}

function mapVerblijfsobject(feature: GeoJSON.Feature): BagVerblijfsobject {
  const p = feature.properties ?? {};
  const pandIds: string[] = (Array.isArray(p.maaktDeelUitVan)
    ? p.maaktDeelUitVan
    : p.maaktDeelUitVan ? [p.maaktDeelUitVan] : [])
    .map((v: unknown) => extractId(v))
    .filter(Boolean);
  return {
    identificatie: p.identificatie ?? p.id ?? '',
    gebruiksdoel: Array.isArray(p.gebruiksdoel) ? p.gebruiksdoel[0] : p.gebruiksdoel,
    oppervlakte: p.oppervlakte,
    pandIdentificaties: pandIds,
  };
}

function mapNummeraanduiding(feature: GeoJSON.Feature): BagNummeraanduiding {
  const p = feature.properties ?? {};
  return {
    identificatie: p.identificatie ?? p.id ?? '',
    huisnummer: p.huisnummer,
    huisletter: p.huisletter,
    huisnummertoevoeging: p.huisnummertoevoeging,
    postcode: p.postcode,
    woonplaats: p.woonplaatsnaam ?? p.woonplaats,
    straatnaam: p.openbareruimtenaam ?? p.openbareRuimtenaam ?? p.straatnaam,
    verblijfsobjectIdentificatie: extractId(p.adresseertVerblijfsobject) || extractId(p.verblijfsobjectIdentificatie),
  };
}

/**
 * Controleert of een BAG feature geometrisch overlapt met de perceelgeometrie.
 * - Voor Point: check of het punt binnen het perceel valt.
 * - Voor Polygon/MultiPolygon: vereist dat >50% van de coördinaten van de feature
 *   binnen het perceel vallen. Dit voorkomt dat gebouwen die slechts met een
 *   klein hoekje over de perceelgrens steken (zoals de garage van een buurperceel)
 *   worden meegenomen.
 */
function featureOverlaptMetPerceel(feature: GeoJSON.Feature, perceelGeometry: GeoJSON.GeoJsonObject): boolean {
  const geom = feature.geometry;
  if (!geom) return false;

  if (geom.type === 'Point') {
    const [lng, lat] = (geom as GeoJSON.Point).coordinates;
    return pointInGeoJsonGeometry(lng, lat, perceelGeometry);
  }

  // Verzamel alle coördinaten van de feature
  function alleCoords(g: GeoJSON.Geometry): number[][] {
    if (g.type === 'Polygon') return (g as GeoJSON.Polygon).coordinates.flat();
    if (g.type === 'MultiPolygon') return (g as GeoJSON.MultiPolygon).coordinates.flat(2);
    return [];
  }

  // Meer dan 50% van de coördinaten van de feature moet binnen het perceel vallen
  const featureCoords = alleCoords(geom as GeoJSON.Geometry);
  if (featureCoords.length === 0) return false;
  let aantalBinnen = 0;
  for (const [lng, lat] of featureCoords) {
    if (pointInGeoJsonGeometry(lng, lat, perceelGeometry)) aantalBinnen++;
  }
  return aantalBinnen / featureCoords.length > 0.5;
}


/**
 * Haalt BAG objecten op voor een perceel via de PDOK BAG OGC API.
 * Gebruikt de perceelgeometrie om de bounding box te berekenen.
 */
export async function haalBagObjectenVoorPerceel(perceelGeometry: GeoJSON.GeoJsonObject): Promise<BagPerceelData> {
  const bbox = berekenBbox(perceelGeometry);

  // Buffer van ~5m in WGS84 graden (op Nederlandse breedte)
  const BUFFER = 0.00005;
  const bboxStr = `${bbox.minLng - BUFFER},${bbox.minLat - BUFFER},${bbox.maxLng + BUFFER},${bbox.maxLat + BUFFER}`;

  async function fetchCollection(collection: string): Promise<GeoJSON.Feature[]> {
    try {
      const url = `${BAG_API_URL}/${encodeURIComponent(collection)}/items?bbox=${bboxStr}&limit=${MAX_BAG_OBJECTS_PER_QUERY}`;
      const resp = await fetch(url);
      if (!resp.ok) return [];
      const json = await resp.json();
      return json?.features ?? [];
    } catch {
      return [];
    }
  }

  const [pandenFeatures, vboFeatures, naFeatures] = await Promise.all([
    fetchCollection('pand'),
    fetchCollection('verblijfsobject'),
    fetchCollection('adres'),
  ]);

  const gefilterdePanden = pandenFeatures.filter((f) => featureOverlaptMetPerceel(f, perceelGeometry));
  const gefilterdeVbos = vboFeatures.filter((f) => featureOverlaptMetPerceel(f, perceelGeometry));

  return {
    panden: gefilterdePanden.map(mapPand),
    verblijfsobjecten: gefilterdeVbos.map(mapVerblijfsobject),
    nummeraanduidingen: naFeatures.map(mapNummeraanduiding),
  };
}