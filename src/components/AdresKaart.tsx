import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { MagnifyingGlass } from '@phosphor-icons/react'

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

interface PerceelClickResult {
  gemeente: string
  sectie: string
  perceelnummer: string
  volledigeAanduiding: string
}

interface AdresKaartProps {
  coordinaten?: { lat: number; lng: number }
  onPerceelClick?: (perceel: PerceelClickResult) => void
  zoekterm?: string
  onZoektermChange?: (value: string) => void
  pdokSuggesties?: Array<{ id: string; weergavenaam: string }>
  onSuggestieSelect?: (id: string) => void
  isLaden?: boolean
  toonSuggesties?: boolean
  onBlur?: () => void
}

const NL_CENTER: [number, number] = [52.1326, 5.2913]
const NL_ZOOM = 7
const ADRES_ZOOM = 18

const WMS_URL = 'https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0?'

interface PerceelPreview extends PerceelClickResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geometry: any | null
}

async function haalPerceelViaWms(map: L.Map, latlng: L.LatLng): Promise<PerceelPreview | null> {
  const size = map.getSize()
  const bounds = map.getBounds()
  const sw = bounds.getSouthWest()
  const ne = bounds.getNorthEast()
  const bbox = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`

  const containerPoint = map.latLngToContainerPoint(latlng)
  const x = Math.round(containerPoint.x)
  const y = Math.round(containerPoint.y)

  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetFeatureInfo',
    LAYERS: 'Perceelvlak',
    QUERY_LAYERS: 'Perceelvlak',
    INFO_FORMAT: 'application/json',
    SRS: 'EPSG:4326',
    BBOX: bbox,
    WIDTH: String(size.x),
    HEIGHT: String(size.y),
    X: String(x),
    Y: String(y),
  })

  const resp = await fetch(`${WMS_URL}${params.toString()}`)
  if (!resp.ok) return null

  const json = await resp.json()
  console.log('WMS GetFeatureInfo response:', JSON.stringify(json, null, 2))
  const feature = json?.features?.[0]
  if (!feature) return null

  const props = feature.properties
  // PDOK WMS v5_0 Perceelvlak GetFeatureInfo property names:
  // - akr_kadastrale_gemeente_code_waarde (gemeente code)
  // - kadastrale_sectie (sectie letter)
  // - perceelnummer (perceelnummer)
  const gemeente: string = props?.akr_kadastrale_gemeente_code_waarde ?? props?.akr_kadastrale_gemeente_code ?? props?.kadastrale_gemeente_code ?? ''
  const sectie: string = props?.kadastrale_sectie ?? props?.sectie ?? ''
  const perceelnummer: string = props?.perceelnummer != null ? String(props.perceelnummer) : ''

  if (!gemeente || !sectie || !perceelnummer) return null

  return {
    gemeente,
    sectie,
    perceelnummer,
    volledigeAanduiding: `${gemeente}-${sectie}-${perceelnummer}`,
    geometry: feature.geometry ?? null,
  }
}

export function AdresKaart({
  coordinaten,
  onPerceelClick,
  zoekterm,
  onZoektermChange,
  pdokSuggesties = [],
  onSuggestieSelect,
  isLaden = false,
  toonSuggesties = false,
  onBlur,
}: AdresKaartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const highlightLayerRef = useRef<L.GeoJSON | null>(null)
  const onPerceelClickRef = useRef(onPerceelClick)
  const [previewPerceel, setPreviewPerceel] = useState<PerceelPreview | null>(null)

  // Keep ref in sync so the map click handler always uses the latest callback
  useEffect(() => {
    onPerceelClickRef.current = onPerceelClick
  }, [onPerceelClick])

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
    L.tileLayer.wms(WMS_URL, {
      layers: 'Perceelvlak',
      format: 'image/png',
      transparent: true,
      opacity: 0.5,
      attribution: '© Kadaster',
      maxZoom: 20,
      maxNativeZoom: 19,
    }).addTo(map)

    // Klik-handler: toon perceel preview + highlight op kaart
    map.on('click', async (e: L.LeafletMouseEvent) => {
      try {
        const perceel = await haalPerceelViaWms(map, e.latlng)
        if (perceel) {
          setPreviewPerceel(perceel)
        }
      } catch (err) {
        console.warn('Fout bij ophalen perceel via kaart klik:', err)
      }
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
      highlightLayerRef.current = null
    }
  }, [])

  // Update highlight layer when preview perceel changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (highlightLayerRef.current) {
      highlightLayerRef.current.remove()
      highlightLayerRef.current = null
    }

    if (previewPerceel?.geometry) {
      highlightLayerRef.current = L.geoJSON(previewPerceel.geometry, {
        style: {
          fillColor: '#3388ff',
          fillOpacity: 0.4,
          color: '#3388ff',
          weight: 2,
        },
      }).addTo(map)
    }
  }, [previewPerceel])

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

  const handleToevoegen = () => {
    if (previewPerceel && onPerceelClickRef.current) {
      const { geometry: _geometry, ...perceelData } = previewPerceel
      onPerceelClickRef.current(perceelData)
      setPreviewPerceel(null)
    }
  }

  return (
    <div className="relative w-full rounded-lg border overflow-hidden" style={{ height: '320px' }}>
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ isolation: 'isolate', position: 'absolute', inset: 0, zIndex: 0, cursor: onPerceelClick ? 'crosshair' : undefined }}
      />
      {onZoektermChange && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-md z-[1000]">
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <input
              type="text"
              value={zoekterm ?? ''}
              onChange={(e) => onZoektermChange(e.target.value)}
              onBlur={onBlur}
              placeholder="Zoek adres of perceel"
              autoComplete="off"
              className="w-full pl-9 pr-4 py-2 text-sm rounded-md border bg-white shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {toonSuggesties && (
              <div className="absolute z-50 w-full mt-1 bg-white rounded-md border shadow-lg">
                {isLaden ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Zoeken…</div>
                ) : (
                  pdokSuggesties.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onSuggestieSelect?.(s.id)}
                    >
                      {s.weergavenaam}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {previewPerceel && (
        <div className="absolute bottom-6 right-2 z-[1000] flex items-center gap-2 rounded-md border bg-white px-3 py-2 shadow-lg">
          <span className="text-sm font-medium">{previewPerceel.volledigeAanduiding}</span>
          <button
            type="button"
            onClick={handleToevoegen}
            className="rounded-md bg-rose-500 px-3 py-1 text-sm text-white transition-colors hover:bg-rose-600"
          >
            Toevoegen…
          </button>
        </div>
      )}
    </div>
  )
}
