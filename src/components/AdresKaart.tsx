import { useEffect, useRef } from 'react'
import L from 'leaflet'

// Fix Leaflet marker icon issue with Vite/webpack builds:
// Leaflet's default icon resolution relies on a private `_getIconUrl` method which
// webpack/Vite removes when bundling. We delete it so that the mergeOptions fallback
// (with explicit CDN URLs below) is used instead.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

interface AdresKaartProps {
  coordinaten?: { lat: number; lng: number }
}

const NL_CENTER: [number, number] = [52.1326, 5.2913]
const NL_ZOOM = 7
const ADRES_ZOOM = 18

export function AdresKaart({ coordinaten }: AdresKaartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: NL_CENTER,
      zoom: NL_ZOOM,
      zoomControl: true,
      attributionControl: true,
      maxZoom: 19,
    })

    // PDOK BRT Achtergrondkaart tiles
    L.tileLayer(
      'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png',
      {
        attribution: '© <a href="https://www.pdok.nl">PDOK</a> / Kadaster',
        maxZoom: 20,
        tileSize: 256,
      }
    ).addTo(map)

    // PDOK Kadastrale kaart WMS overlay
    L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0?', {
      layers: 'Perceelvlak',
      format: 'image/png',
      transparent: true,
      opacity: 0.5,
      attribution: '© Kadaster',
      maxZoom: 20,
      maxNativeZoom: 19,
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  // Update marker and view when coordinates change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (coordinaten?.lat && coordinaten?.lng) {
      const latlng: [number, number] = [coordinaten.lat, coordinaten.lng]

      if (markerRef.current) {
        markerRef.current.setLatLng(latlng)
      } else {
        markerRef.current = L.marker(latlng).addTo(map)
      }

      map.setView(latlng, ADRES_ZOOM)
    } else {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
      map.setView(NL_CENTER, NL_ZOOM)
    }
  }, [coordinaten?.lat, coordinaten?.lng])

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg border overflow-hidden"
      style={{ height: '320px', isolation: 'isolate', position: 'relative', zIndex: 0 }}
    />
  )
}
