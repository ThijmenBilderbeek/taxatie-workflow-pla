/**
 * Gedeelde geo-hulpfuncties voor ruimtelijke bewerkingen.
 * Implementeert point-in-polygon via het ray casting algoritme.
 */

/**
 * Simple point-in-polygon check using ray casting algorithm.
 * Works for GeoJSON Polygon and MultiPolygon geometries.
 */
export function pointInGeoJsonGeometry(lng: number, lat: number, geometry: GeoJSON.GeoJsonObject): boolean {
  if (!geometry) return false
  if ((geometry as GeoJSON.Polygon).type === 'Polygon') {
    return pointInPolygonRings(lng, lat, (geometry as GeoJSON.Polygon).coordinates)
  }
  if ((geometry as GeoJSON.MultiPolygon).type === 'MultiPolygon') {
    return (geometry as GeoJSON.MultiPolygon).coordinates.some((polygon) => pointInPolygonRings(lng, lat, polygon))
  }
  return false
}

export function pointInPolygonRings(lng: number, lat: number, rings: number[][][]): boolean {
  if (!rings || rings.length === 0) return false
  if (!pointInRing(lng, lat, rings[0])) return false
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lng, lat, rings[i])) return false
  }
  return true
}

export function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}
