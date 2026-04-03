import { useEffect, useState } from 'react'
import { CaretRight, CaretDown, Buildings, House, MapPin } from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { haalBagObjectenVoorPerceel, type BagPerceelData, type BagPand, type BagVerblijfsobject, type BagNummeraanduiding } from '@/lib/pdokBag'

interface PerceelToevoegenDialogProps {
  open: boolean
  volledigeAanduiding: string
  perceelGeometry: GeoJSON.GeoJsonObject | null
  onAnnuleren: () => void
  onBevestigen: () => void
}

function formatGebruiksdoel(g?: string): string {
  if (!g) return ''
  return g.charAt(0).toUpperCase() + g.slice(1).replace(/_/g, ' ')
}

function PandRij({ pand, verblijfsobjecten, nummeraanduidingen }: {
  pand: BagPand
  verblijfsobjecten: BagVerblijfsobject[]
  nummeraanduidingen: BagNummeraanduiding[]
}) {
  const [open, setOpen] = useState(true)
  const vbosVoorPand = verblijfsobjecten.filter(
    (v) => v.pandIdentificaties?.includes(pand.identificatie)
  )

  return (
    <>
      <TableRow className="bg-muted/30">
        <TableCell className="font-medium">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 hover:text-primary"
            aria-label={open ? 'Klap pand in' : 'Klap pand uit'}
          >
            {open ? <CaretDown className="h-3 w-3" /> : <CaretRight className="h-3 w-3" />}
            <Buildings className="h-4 w-4 text-slate-500" />
            <span>Pand</span>
          </button>
        </TableCell>
        <TableCell className="font-mono text-xs">{pand.identificatie}</TableCell>
        <TableCell>{pand.oppervlakte != null ? `${pand.oppervlakte} m²` : '—'}</TableCell>
        <TableCell colSpan={7} className="text-muted-foreground text-xs">
          {formatGebruiksdoel(pand.gebruiksdoel)}{pand.bouwjaar ? ` · bouwjaar ${pand.bouwjaar}` : ''}
        </TableCell>
      </TableRow>
      {open && vbosVoorPand.map((vbo) => {
        const na = nummeraanduidingen.find(
          (n) => n.verblijfsobjectIdentificatie === vbo.identificatie
        )
        return (
          <VerblijfsobjectRij key={vbo.identificatie} vbo={vbo} na={na} />
        )
      })}
    </>
  )
}

function VerblijfsobjectRij({ vbo, na }: {
  vbo: BagVerblijfsobject
  na: BagNummeraanduiding | undefined
}) {
  return (
    <TableRow>
      <TableCell>
        <span className="ml-5 flex items-center gap-1">
          <House className="h-4 w-4 text-slate-400" />
          <span>Verblijfsobject</span>
        </span>
      </TableCell>
      <TableCell className="font-mono text-xs">{vbo.identificatie}</TableCell>
      <TableCell>{vbo.oppervlakte != null ? `${vbo.oppervlakte} m²` : '—'}</TableCell>
      <TableCell>{na?.straatnaam ?? '—'}</TableCell>
      <TableCell>{na?.huisnummer ?? '—'}</TableCell>
      <TableCell>{na?.huisletter ?? '—'}</TableCell>
      <TableCell>{na?.huisnummertoevoeging ?? '—'}</TableCell>
      <TableCell>{na?.postcode ?? '—'}</TableCell>
      <TableCell>{na?.woonplaats ?? '—'}</TableCell>
      <TableCell>
        {na && (
          <span className="ml-4 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span className="font-mono">{na.identificatie}</span>
          </span>
        )}
      </TableCell>
    </TableRow>
  )
}

export function PerceelToevoegenDialog({
  open,
  volledigeAanduiding,
  perceelGeometry,
  onAnnuleren,
  onBevestigen,
}: PerceelToevoegenDialogProps) {
  const [bagData, setBagData] = useState<BagPerceelData | null>(null)
  const [isLaden, setIsLaden] = useState(false)

  useEffect(() => {
    if (!open || !perceelGeometry) return
    setIsLaden(true)
    setBagData(null)
    haalBagObjectenVoorPerceel(perceelGeometry)
      .then((data) => setBagData(data))
      .catch(() => setBagData({ panden: [], verblijfsobjecten: [], nummeraanduidingen: [] }))
      .finally(() => setIsLaden(false))
  }, [open, perceelGeometry])

  const aantalVbo = bagData?.verblijfsobjecten.length ?? 0
  const aantalPanden = bagData?.panden.length ?? 0

  // Verblijfsobjecten zonder pand (niet gekoppeld aan een bekend pand)
  const losseVbos = bagData?.verblijfsobjecten.filter(
    (v) => !bagData.panden.some((p) => v.pandIdentificaties?.includes(p.identificatie))
  ) ?? []

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onAnnuleren() }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            Perceel toevoegen — <span className="font-mono">{volledigeAanduiding}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {isLaden ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              BAG objecten worden opgehaald…
            </div>
          ) : bagData && (bagData.panden.length > 0 || bagData.verblijfsobjecten.length > 0) ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>BAG Object ID</TableHead>
                  <TableHead>GBO m²</TableHead>
                  <TableHead>Straat</TableHead>
                  <TableHead>Huisnr.</TableHead>
                  <TableHead>Ltr.</TableHead>
                  <TableHead>Toev.</TableHead>
                  <TableHead>Postcode</TableHead>
                  <TableHead>Plaats</TableHead>
                  <TableHead>Nummeraanduiding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bagData.panden.map((pand) => (
                  <PandRij
                    key={pand.identificatie}
                    pand={pand}
                    verblijfsobjecten={bagData.verblijfsobjecten}
                    nummeraanduidingen={bagData.nummeraanduidingen}
                  />
                ))}
                {losseVbos.map((vbo) => {
                  const na = bagData.nummeraanduidingen.find(
                    (n) => n.verblijfsobjectIdentificatie === vbo.identificatie
                  )
                  return <VerblijfsobjectRij key={vbo.identificatie} vbo={vbo} na={na} />
                })}
              </TableBody>
            </Table>
          ) : bagData ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
              <Buildings className="h-8 w-8 opacity-40" />
              <span>Geen BAG objecten gevonden voor dit perceel.</span>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-muted-foreground order-last sm:order-first">
            {isLaden
              ? 'BAG data wordt opgehaald…'
              : bagData
                ? `${aantalVbo} verblijfsobject${aantalVbo !== 1 ? 'en' : ''} in ${aantalPanden} gebouw${aantalPanden !== 1 ? 'en' : ''}`
                : ''}
          </span>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onAnnuleren}>
              Annuleren
            </Button>
            <Button onClick={onBevestigen}>
              Voeg perceel en adressen toe
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
