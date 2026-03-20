import { useState, useMemo, useRef } from 'react'
import type { HistorischRapport, ObjectType, Gebruiksdoel, AlgemeneGegevens, AdresLocatie, Oppervlaktes, Waardering, Ligging, Onderhoudsstaat, Energielabel, WaarderingsMethode, Huurgegevens, TechnischeStaat, Vergunningen, Aannames, JuridischeInfo } from '../types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { MagnifyingGlass, MapPin, Buildings, Calendar, CurrencyCircleDollar, ChartBar, Upload, Trash, Pencil } from '@phosphor-icons/react'
import { Checkbox } from './ui/checkbox'
import { Textarea } from './ui/textarea'
import { Separator } from './ui/separator'
import { toast } from 'sonner'
import { parsePdfToRapport } from '../lib/pdfParser'

interface KennisbankProps {
  historischeRapporten: HistorischRapport[]
  onAddRapport: (rapport: HistorischRapport) => void
  onDeleteRapport: (id: string) => void
  onUpdateRapport: (rapport: HistorischRapport) => void
}

export function Kennisbank({ historischeRapporten, onAddRapport, onDeleteRapport, onUpdateRapport }: KennisbankProps) {
  const [zoekterm, setZoekterm] = useState('')
  const [filterType, setFilterType] = useState<string>('alle')
  const [filterGebruiksdoel, setFilterGebruiksdoel] = useState<string>('alle')

  // PDF upload dialog state
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [preview, setPreview] = useState<Partial<HistorischRapport> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Selectie-modus state
  const [selectieModus, setSelectieModus] = useState(false)
  const [geselecteerdeIds, setGeselecteerdeIds] = useState<Set<string>>(new Set())
  const [showVerwijderDialog, setShowVerwijderDialog] = useState(false)

  // Bewerk-dialog state
  const [bewerkRapport, setBewerkRapport] = useState<HistorischRapport | null>(null)
  const [bewerkFormulier, setBewerkFormulier] = useState<HistorischRapport | null>(null)
  const [bewerkFouten, setBewerkFouten] = useState<Partial<Record<string, string>>>({})

  const handleOpenBewerken = (rapport: HistorischRapport) => {
    setBewerkRapport(rapport)
    setBewerkFormulier(structuredClone(rapport))
    setBewerkFouten({})
  }

  const handleCloseBewerkDialog = () => {
    setBewerkRapport(null)
    setBewerkFormulier(null)
    setBewerkFouten({})
  }

  const handleSaveBewerkRapport = () => {
    if (!bewerkFormulier) return
    const fouten: Partial<Record<string, string>> = {}
    if (!bewerkFormulier.adres.straat.trim()) fouten.straat = 'Verplicht'
    if (!bewerkFormulier.adres.huisnummer.trim()) fouten.huisnummer = 'Verplicht'
    if (!bewerkFormulier.adres.postcode.trim()) fouten.postcode = 'Verplicht'
    if (!bewerkFormulier.adres.plaats.trim()) fouten.plaats = 'Verplicht'
    if (!bewerkFormulier.typeObject) fouten.typeObject = 'Verplicht'
    if (!bewerkFormulier.gebruiksdoel) fouten.gebruiksdoel = 'Verplicht'
    if (!bewerkFormulier.bvo || bewerkFormulier.bvo <= 0) fouten.bvo = 'Verplicht'
    if (!bewerkFormulier.marktwaarde || bewerkFormulier.marktwaarde <= 0) fouten.marktwaarde = 'Verplicht'
    if (!bewerkFormulier.waardepeildatum) fouten.waardepeildatum = 'Verplicht'
    if (Object.keys(fouten).length > 0) {
      setBewerkFouten(fouten)
      return
    }
    onUpdateRapport(bewerkFormulier)
    toast.success('Rapport bijgewerkt in kennisbank')
    handleCloseBewerkDialog()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsLoading(true)
    try {
      const parsed = await parsePdfToRapport(file)
      setPreview(parsed)
    } catch {
      toast.error('Kon de PDF niet uitlezen. Probeer een ander bestand.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveRapport = () => {
    if (!preview) return
    const rapport: HistorischRapport = {
      id: `rapport-${Date.now()}`,
      adres: {
        straat: preview.adres?.straat ?? '',
        huisnummer: preview.adres?.huisnummer ?? '',
        postcode: preview.adres?.postcode ?? '',
        plaats: preview.adres?.plaats ?? '',
      },
      coordinaten: preview.coordinaten ?? { lat: 0, lng: 0 },
      typeObject: (preview.typeObject ?? 'overig') as ObjectType,
      gebruiksdoel: (preview.gebruiksdoel ?? 'overig') as Gebruiksdoel,
      bvo: preview.bvo ?? 0,
      marktwaarde: preview.marktwaarde ?? 0,
      bar: preview.bar,
      nar: preview.nar,
      waardepeildatum: preview.waardepeildatum ?? new Date().toISOString().slice(0, 10),
      rapportTeksten: preview.rapportTeksten ?? {},
      wizardData: {
        stap1: {
          typeObject: preview.typeObject,
          gebruiksdoel: preview.gebruiksdoel,
          objectnaam: preview.wizardData?.stap1?.objectnaam,
          naamTaxateur: preview.wizardData?.stap1?.naamTaxateur,
          waardepeildatum: preview.waardepeildatum,
          inspectiedatum: preview.wizardData?.stap1?.inspectiedatum,
        } as AlgemeneGegevens,
        stap2: {
          straatnaam: preview.adres?.straat ?? '',
          huisnummer: preview.adres?.huisnummer ?? '',
          postcode: preview.adres?.postcode ?? '',
          plaats: preview.adres?.plaats ?? '',
          gemeente: preview.wizardData?.stap2?.gemeente,
          provincie: preview.wizardData?.stap2?.provincie,
          ligging: preview.wizardData?.stap2?.ligging,
          bereikbaarheid: preview.wizardData?.stap2?.bereikbaarheid,
          coordinaten: preview.coordinaten ?? { lat: 0, lng: 0 },
        } as AdresLocatie,
        stap3: {
          bvo: preview.bvo ?? 0,
          vvo: preview.wizardData?.stap3?.vvo,
          perceeloppervlak: preview.wizardData?.stap3?.perceeloppervlak,
          aantalBouwlagen: preview.wizardData?.stap3?.aantalBouwlagen,
          bouwjaar: preview.wizardData?.stap3?.bouwjaar,
          aanbouwen: preview.wizardData?.stap3?.aanbouwen,
        } as Oppervlaktes,
        ...(preview.wizardData?.stap4 ? { stap4: preview.wizardData.stap4 } : {}),
        ...(preview.wizardData?.stap5 ? { stap5: preview.wizardData.stap5 } : {}),
        ...(preview.wizardData?.stap6 ? { stap6: preview.wizardData.stap6 } : {}),
        ...(preview.wizardData?.stap7 ? { stap7: preview.wizardData.stap7 } : {}),
        stap8: {
          marktwaarde: preview.marktwaarde ?? 0,
          bar: preview.bar,
          nar: preview.nar,
          methode: preview.wizardData?.stap8?.methode,
          onderhandseVerkoopwaarde: preview.wizardData?.stap8?.onderhandseVerkoopwaarde,
          kapitalisatiefactor: preview.wizardData?.stap8?.kapitalisatiefactor,
          vergelijkingsobjecten: preview.wizardData?.stap8?.vergelijkingsobjecten ?? [],
        } as Waardering,
        ...(preview.wizardData?.stap9 ? { stap9: preview.wizardData.stap9 } : {}),
      },
    }
    onAddRapport(rapport)
    toast.success('Rapport toegevoegd aan kennisbank')
    handleCloseDialog()
  }

  const handleCloseDialog = () => {
    setShowUploadDialog(false)
    setPreview(null)
    setIsLoading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleToggleSelectieModus = () => {
    setSelectieModus((prev) => !prev)
    setGeselecteerdeIds(new Set())
  }

  const handleToggleSelectie = (id: string) => {
    setGeselecteerdeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleBevestigVerwijderen = () => {
    geselecteerdeIds.forEach((id) => onDeleteRapport(id))
    toast.success(
      geselecteerdeIds.size === 1
        ? 'Rapport verwijderd uit kennisbank'
        : `${geselecteerdeIds.size} rapporten verwijderd uit kennisbank`
    )
    setShowVerwijderDialog(false)
    setGeselecteerdeIds(new Set())
    setSelectieModus(false)
  }

  const stats = useMemo(() => {
    const totaal = historischeRapporten.length
    const perType: Record<string, number> = {}
    const perRegio: Record<string, number> = {}
    let totaleWaarde = 0

    historischeRapporten.forEach((rapport) => {
      perType[rapport.typeObject] = (perType[rapport.typeObject] || 0) + 1
      perRegio[rapport.adres.plaats] = (perRegio[rapport.adres.plaats] || 0) + 1
      totaleWaarde += rapport.marktwaarde
    })

    return {
      totaal,
      perType,
      perRegio,
      gemiddeldeWaarde: totaal > 0 ? totaleWaarde / totaal : 0,
    }
  }, [historischeRapporten])

  const gefilterdRapporten = useMemo(() => {
    return historischeRapporten.filter((rapport) => {
      const matchZoekterm =
        zoekterm === '' ||
        rapport.adres.straat.toLowerCase().includes(zoekterm.toLowerCase()) ||
        rapport.adres.plaats.toLowerCase().includes(zoekterm.toLowerCase()) ||
        rapport.adres.postcode.toLowerCase().includes(zoekterm.toLowerCase())

      const matchType = filterType === 'alle' || rapport.typeObject === filterType
      const matchGebruiksdoel =
        filterGebruiksdoel === 'alle' || rapport.gebruiksdoel === filterGebruiksdoel

      return matchZoekterm && matchType && matchGebruiksdoel
    })
  }, [historischeRapporten, zoekterm, filterType, filterGebruiksdoel])

  const formatBedrag = (bedrag: number) => {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(bedrag)
  }

  const formatDatum = (datum: string) => {
    return new Date(datum).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground mb-2">Kennisbank</h1>
          <p className="text-muted-foreground">
            Overzicht van alle historische rapporten beschikbaar voor de similarity engine
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={selectieModus ? 'default' : 'outline'}
            onClick={handleToggleSelectieModus}
            className="flex items-center gap-2"
          >
            <Trash className="h-4 w-4" />
            {selectieModus ? 'Selectie annuleren' : 'Verwijderen'}
          </Button>
          {selectieModus && geselecteerdeIds.size > 0 && (
            <Button
              variant="destructive"
              onClick={() => setShowVerwijderDialog(true)}
              className="flex items-center gap-2"
            >
              <Trash className="h-4 w-4" />
              Verwijder geselecteerde ({geselecteerdeIds.size})
            </Button>
          )}
          <Button onClick={() => setShowUploadDialog(true)} className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            PDF uploaden
          </Button>
        </div>
      </div>

      <Dialog open={showUploadDialog} onOpenChange={(open) => { if (!open) handleCloseDialog() }}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Taxatierapport uploaden als PDF</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {!preview && (
              <div className="space-y-2">
                <Label htmlFor="pdf-upload">PDF-bestand selecteren</Label>
                <input
                  ref={fileInputRef}
                  id="pdf-upload"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                />
              </div>
            )}

            {isLoading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <span>PDF wordt verwerkt...</span>
              </div>
            )}

            {preview && !isLoading && (
              <div className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Controleer en pas de geëxtraheerde gegevens aan voor het opslaan.
                </p>

                {/* Stap 1: Algemene gegevens */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-foreground">Algemene gegevens</h3>
                  <Separator />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="prev-objectnaam">Objectnaam</Label>
                      <Input
                        id="prev-objectnaam"
                        value={preview.wizardData?.stap1?.objectnaam ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap1: { ...p?.wizardData?.stap1, objectnaam: e.target.value } as AlgemeneGegevens } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-taxateur">Naam taxateur</Label>
                      <Input
                        id="prev-taxateur"
                        value={preview.wizardData?.stap1?.naamTaxateur ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap1: { ...p?.wizardData?.stap1, naamTaxateur: e.target.value } as AlgemeneGegevens } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-type">Type object</Label>
                      <Select
                        value={preview.typeObject ?? 'overig'}
                        onValueChange={(v) => setPreview((p) => ({ ...p, typeObject: v as ObjectType }))}
                      >
                        <SelectTrigger id="prev-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="kantoor">Kantoor</SelectItem>
                          <SelectItem value="bedrijfscomplex">Bedrijfscomplex</SelectItem>
                          <SelectItem value="bedrijfshal">Bedrijfshal</SelectItem>
                          <SelectItem value="winkel">Winkel</SelectItem>
                          <SelectItem value="woning">Woning</SelectItem>
                          <SelectItem value="appartement">Appartement</SelectItem>
                          <SelectItem value="overig">Overig</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-gebruiksdoel">Gebruiksdoel</Label>
                      <Select
                        value={preview.gebruiksdoel ?? 'overig'}
                        onValueChange={(v) => setPreview((p) => ({ ...p, gebruiksdoel: v as Gebruiksdoel }))}
                      >
                        <SelectTrigger id="prev-gebruiksdoel">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="eigenaar_gebruiker">Eigenaar-gebruiker</SelectItem>
                          <SelectItem value="verhuurd_belegging">Verhuurd / Belegging</SelectItem>
                          <SelectItem value="leegstand">Leegstand</SelectItem>
                          <SelectItem value="overig">Overig</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-peildatum">Waardepeildatum</Label>
                      <Input
                        id="prev-peildatum"
                        type="date"
                        value={preview.waardepeildatum ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, waardepeildatum: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-inspectiedatum">Inspectiedatum</Label>
                      <Input
                        id="prev-inspectiedatum"
                        type="date"
                        value={preview.wizardData?.stap1?.inspectiedatum ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap1: { ...p?.wizardData?.stap1, inspectiedatum: e.target.value } as AlgemeneGegevens } }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Stap 2: Adres & Locatie */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-foreground">Adres &amp; Locatie</h3>
                  <Separator />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="prev-straat">Straatnaam</Label>
                      <Input
                        id="prev-straat"
                        value={preview.adres?.straat ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, adres: { ...p?.adres!, straat: e.target.value } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-huisnummer">Huisnummer</Label>
                      <Input
                        id="prev-huisnummer"
                        value={preview.adres?.huisnummer ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, adres: { ...p?.adres!, huisnummer: e.target.value } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-postcode">Postcode</Label>
                      <Input
                        id="prev-postcode"
                        value={preview.adres?.postcode ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, adres: { ...p?.adres!, postcode: e.target.value } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-plaats">Plaats</Label>
                      <Input
                        id="prev-plaats"
                        value={preview.adres?.plaats ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, adres: { ...p?.adres!, plaats: e.target.value } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-gemeente">Gemeente</Label>
                      <Input
                        id="prev-gemeente"
                        value={preview.wizardData?.stap2?.gemeente ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap2: { ...p?.wizardData?.stap2, gemeente: e.target.value } as AdresLocatie } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-provincie">Provincie</Label>
                      <Input
                        id="prev-provincie"
                        value={preview.wizardData?.stap2?.provincie ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap2: { ...p?.wizardData?.stap2, provincie: e.target.value } as AdresLocatie } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-ligging">Ligging</Label>
                      <Select
                        value={preview.wizardData?.stap2?.ligging ?? ''}
                        onValueChange={(v) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap2: { ...p?.wizardData?.stap2, ligging: v as Ligging } as AdresLocatie } }))}
                      >
                        <SelectTrigger id="prev-ligging">
                          <SelectValue placeholder="Selecteer ligging" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="binnenstad">Binnenstad</SelectItem>
                          <SelectItem value="woonwijk">Woonwijk</SelectItem>
                          <SelectItem value="bedrijventerrein">Bedrijventerrein</SelectItem>
                          <SelectItem value="buitengebied">Buitengebied</SelectItem>
                          <SelectItem value="gemengd">Gemengd</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Coördinaten (lat / lng)</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.000001"
                          placeholder="Latitude"
                          value={preview.coordinaten?.lat || ''}
                          onChange={(e) => setPreview((p) => ({ ...p, coordinaten: { lat: parseFloat(e.target.value) || 0, lng: p?.coordinaten?.lng ?? 0 } }))}
                        />
                        <Input
                          type="number"
                          step="0.000001"
                          placeholder="Longitude"
                          value={preview.coordinaten?.lng || ''}
                          onChange={(e) => setPreview((p) => ({ ...p, coordinaten: { lat: p?.coordinaten?.lat ?? 0, lng: parseFloat(e.target.value) || 0 } }))}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prev-bereikbaarheid">Bereikbaarheid</Label>
                    <Textarea
                      id="prev-bereikbaarheid"
                      rows={3}
                      value={preview.wizardData?.stap2?.bereikbaarheid ?? ''}
                      onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap2: { ...p?.wizardData?.stap2, bereikbaarheid: e.target.value } as AdresLocatie } }))}
                    />
                  </div>
                </div>

                {/* Stap 3: Oppervlaktes */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-foreground">Oppervlaktes</h3>
                  <Separator />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="prev-bvo">BVO (m²)</Label>
                      <Input
                        id="prev-bvo"
                        type="number"
                        value={preview.bvo ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, bvo: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-vvo">VVO (m²)</Label>
                      <Input
                        id="prev-vvo"
                        type="number"
                        value={preview.wizardData?.stap3?.vvo ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap3: { ...p?.wizardData?.stap3, vvo: parseFloat(e.target.value) || 0 } as Oppervlaktes } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-perceel">Perceeloppervlak (m²)</Label>
                      <Input
                        id="prev-perceel"
                        type="number"
                        value={preview.wizardData?.stap3?.perceeloppervlak ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap3: { ...p?.wizardData?.stap3, perceeloppervlak: parseFloat(e.target.value) || 0 } as Oppervlaktes } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-bouwlagen">Aantal bouwlagen</Label>
                      <Input
                        id="prev-bouwlagen"
                        type="number"
                        value={preview.wizardData?.stap3?.aantalBouwlagen ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap3: { ...p?.wizardData?.stap3, aantalBouwlagen: parseInt(e.target.value) || 0 } as Oppervlaktes } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-bouwjaar">Bouwjaar</Label>
                      <Input
                        id="prev-bouwjaar"
                        type="number"
                        value={preview.wizardData?.stap3?.bouwjaar ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap3: { ...p?.wizardData?.stap3, bouwjaar: parseInt(e.target.value) || 0 } as Oppervlaktes } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-aanbouwen">Aanbouwen</Label>
                      <Input
                        id="prev-aanbouwen"
                        value={preview.wizardData?.stap3?.aanbouwen ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap3: { ...p?.wizardData?.stap3, aanbouwen: e.target.value } as Oppervlaktes } }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Stap 4: Huurgegevens */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-foreground">Huurgegevens</h3>
                  <Separator />
                  <div className="flex items-center gap-2 mb-2">
                    <Checkbox
                      id="prev-verhuurd"
                      checked={preview.wizardData?.stap4?.verhuurd ?? false}
                      onCheckedChange={(checked) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap4: { ...p?.wizardData?.stap4, verhuurd: !!checked } as Huurgegevens } }))}
                    />
                    <Label htmlFor="prev-verhuurd">Verhuurd</Label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="prev-huurder">Huurder</Label>
                      <Input
                        id="prev-huurder"
                        value={preview.wizardData?.stap4?.huurder ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap4: { ...p?.wizardData?.stap4, huurder: e.target.value } as Huurgegevens } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-huurprijs">Huurprijs per jaar (€)</Label>
                      <Input
                        id="prev-huurprijs"
                        type="number"
                        value={preview.wizardData?.stap4?.huurprijsPerJaar ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap4: { ...p?.wizardData?.stap4, huurprijsPerJaar: parseFloat(e.target.value) || undefined } as Huurgegevens } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-markthuur">Markthuur per jaar (€)</Label>
                      <Input
                        id="prev-markthuur"
                        type="number"
                        value={preview.wizardData?.stap4?.markthuurPerJaar ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap4: { ...p?.wizardData?.stap4, markthuurPerJaar: parseFloat(e.target.value) || undefined } as Huurgegevens } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-contracttype">Contracttype</Label>
                      <Input
                        id="prev-contracttype"
                        value={preview.wizardData?.stap4?.contracttype ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap4: { ...p?.wizardData?.stap4, contracttype: e.target.value } as Huurgegevens } }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Stap 5: Juridische Info */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-foreground">Juridische informatie</h3>
                  <Separator />
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="prev-eigendom">Eigendomssituatie</Label>
                      <Textarea
                        id="prev-eigendom"
                        rows={2}
                        value={preview.wizardData?.stap5?.eigendomssituatie ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap5: { ...p?.wizardData?.stap5, eigendomssituatie: e.target.value } as JuridischeInfo } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-erfpacht">Erfpacht</Label>
                      <Textarea
                        id="prev-erfpacht"
                        rows={2}
                        value={preview.wizardData?.stap5?.erfpacht ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap5: { ...p?.wizardData?.stap5, erfpacht: e.target.value } as JuridischeInfo } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-zakelijkerechten">Zakelijke rechten</Label>
                      <Textarea
                        id="prev-zakelijkerechten"
                        rows={2}
                        value={preview.wizardData?.stap5?.zakelijkeRechten ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap5: { ...p?.wizardData?.stap5, zakelijkeRechten: e.target.value } as JuridischeInfo } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-bestemmingsplan">Bestemmingsplan</Label>
                      <Textarea
                        id="prev-bestemmingsplan"
                        rows={2}
                        value={preview.wizardData?.stap5?.bestemmingsplan ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap5: { ...p?.wizardData?.stap5, bestemmingsplan: e.target.value } as JuridischeInfo } }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Stap 6: Technische Staat */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-foreground">Technische staat</h3>
                  <Separator />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="prev-exterieur">Exterieur staat</Label>
                      <Select
                        value={preview.wizardData?.stap6?.exterieurStaat ?? ''}
                        onValueChange={(v) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap6: { ...p?.wizardData?.stap6, exterieurStaat: v as Onderhoudsstaat } as TechnischeStaat } }))}
                      >
                        <SelectTrigger id="prev-exterieur">
                          <SelectValue placeholder="Selecteer staat" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="uitstekend">Uitstekend</SelectItem>
                          <SelectItem value="goed">Goed</SelectItem>
                          <SelectItem value="redelijk">Redelijk</SelectItem>
                          <SelectItem value="matig">Matig</SelectItem>
                          <SelectItem value="slecht">Slecht</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-interieur">Interieur staat</Label>
                      <Select
                        value={preview.wizardData?.stap6?.interieurStaat ?? ''}
                        onValueChange={(v) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap6: { ...p?.wizardData?.stap6, interieurStaat: v as Onderhoudsstaat } as TechnischeStaat } }))}
                      >
                        <SelectTrigger id="prev-interieur">
                          <SelectValue placeholder="Selecteer staat" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="uitstekend">Uitstekend</SelectItem>
                          <SelectItem value="goed">Goed</SelectItem>
                          <SelectItem value="redelijk">Redelijk</SelectItem>
                          <SelectItem value="matig">Matig</SelectItem>
                          <SelectItem value="slecht">Slecht</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-fundering">Fundering</Label>
                      <Input
                        id="prev-fundering"
                        value={preview.wizardData?.stap6?.fundering ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap6: { ...p?.wizardData?.stap6, fundering: e.target.value } as TechnischeStaat } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-dak">Dakbedekking</Label>
                      <Input
                        id="prev-dak"
                        value={preview.wizardData?.stap6?.dakbedekking ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap6: { ...p?.wizardData?.stap6, dakbedekking: e.target.value } as TechnischeStaat } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-installaties">Installaties</Label>
                      <Input
                        id="prev-installaties"
                        value={preview.wizardData?.stap6?.installaties ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap6: { ...p?.wizardData?.stap6, installaties: e.target.value } as TechnischeStaat } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-onderhoudskosten">Onderhoudskosten per jaar (€)</Label>
                      <Input
                        id="prev-onderhoudskosten"
                        type="number"
                        value={preview.wizardData?.stap6?.onderhoudskosten ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap6: { ...p?.wizardData?.stap6, onderhoudskosten: parseFloat(e.target.value) || 0 } as TechnischeStaat } }))}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="prev-achterstallig"
                      checked={preview.wizardData?.stap6?.achterstalligOnderhoud ?? false}
                      onCheckedChange={(checked) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap6: { ...p?.wizardData?.stap6, achterstalligOnderhoud: !!checked } as TechnischeStaat } }))}
                    />
                    <Label htmlFor="prev-achterstallig">Achterstallig onderhoud</Label>
                  </div>
                  {preview.wizardData?.stap6?.achterstalligOnderhoud && (
                    <div className="space-y-2">
                      <Label htmlFor="prev-achterstallig-beschrijving">Beschrijving achterstallig onderhoud</Label>
                      <Textarea
                        id="prev-achterstallig-beschrijving"
                        rows={2}
                        value={preview.wizardData?.stap6?.achterstalligOnderhoudBeschrijving ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap6: { ...p?.wizardData?.stap6, achterstalligOnderhoudBeschrijving: e.target.value } as TechnischeStaat } }))}
                      />
                    </div>
                  )}
                </div>

                {/* Stap 7: Vergunningen */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-foreground">Vergunningen &amp; duurzaamheid</h3>
                  <Separator />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="prev-energielabel">Energielabel</Label>
                      <Select
                        value={preview.wizardData?.stap7?.energielabel ?? ''}
                        onValueChange={(v) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap7: { ...p?.wizardData?.stap7, energielabel: v as Energielabel } as Vergunningen } }))}
                      >
                        <SelectTrigger id="prev-energielabel">
                          <SelectValue placeholder="Selecteer label" />
                        </SelectTrigger>
                        <SelectContent>
                          {(['A++++', 'A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G'] as Energielabel[]).map((l) => (
                            <SelectItem key={l} value={l}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-asbest">Asbest</Label>
                      <Select
                        value={preview.wizardData?.stap7?.asbest ?? ''}
                        onValueChange={(v) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap7: { ...p?.wizardData?.stap7, asbest: v as 'ja' | 'nee' | 'onbekend' } as Vergunningen } }))}
                      >
                        <SelectTrigger id="prev-asbest">
                          <SelectValue placeholder="Selecteer" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ja">Ja</SelectItem>
                          <SelectItem value="nee">Nee</SelectItem>
                          <SelectItem value="onbekend">Onbekend</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-bodem">Bodemverontreiniging</Label>
                      <Select
                        value={preview.wizardData?.stap7?.bodemverontreiniging ?? ''}
                        onValueChange={(v) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap7: { ...p?.wizardData?.stap7, bodemverontreiniging: v as 'ja' | 'nee' | 'onbekend' } as Vergunningen } }))}
                      >
                        <SelectTrigger id="prev-bodem">
                          <SelectValue placeholder="Selecteer" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ja">Ja</SelectItem>
                          <SelectItem value="nee">Nee</SelectItem>
                          <SelectItem value="onbekend">Onbekend</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prev-toelichting-verg">Toelichting</Label>
                    <Textarea
                      id="prev-toelichting-verg"
                      rows={2}
                      value={preview.wizardData?.stap7?.toelichting ?? ''}
                      onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap7: { ...p?.wizardData?.stap7, toelichting: e.target.value } as Vergunningen } }))}
                    />
                  </div>
                </div>

                {/* Stap 8: Waardering */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-foreground">Waardering</h3>
                  <Separator />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="prev-methode">Waarderingsmethode</Label>
                      <Select
                        value={preview.wizardData?.stap8?.methode ?? ''}
                        onValueChange={(v) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap8: { ...p?.wizardData?.stap8, methode: v as WaarderingsMethode } as Waardering } }))}
                      >
                        <SelectTrigger id="prev-methode">
                          <SelectValue placeholder="Selecteer methode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vergelijkingsmethode">Vergelijkingsmethode</SelectItem>
                          <SelectItem value="BAR_NAR">BAR/NAR</SelectItem>
                          <SelectItem value="DCF">DCF</SelectItem>
                          <SelectItem value="kostenmethode">Kostenmethode</SelectItem>
                          <SelectItem value="combinatie">Combinatie</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-marktwaarde">Marktwaarde (€)</Label>
                      <Input
                        id="prev-marktwaarde"
                        type="number"
                        value={preview.marktwaarde ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, marktwaarde: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-ovw">Onderhandse verkoopwaarde (€)</Label>
                      <Input
                        id="prev-ovw"
                        type="number"
                        value={preview.wizardData?.stap8?.onderhandseVerkoopwaarde ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap8: { ...p?.wizardData?.stap8, onderhandseVerkoopwaarde: parseFloat(e.target.value) || 0 } as Waardering } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-bar">BAR % (optioneel)</Label>
                      <Input
                        id="prev-bar"
                        type="number"
                        step="0.01"
                        value={preview.bar ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, bar: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-nar">NAR % (optioneel)</Label>
                      <Input
                        id="prev-nar"
                        type="number"
                        step="0.01"
                        value={preview.nar ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, nar: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-kapfac">Kapitalisatiefactor</Label>
                      <Input
                        id="prev-kapfac"
                        type="number"
                        step="0.01"
                        value={preview.wizardData?.stap8?.kapitalisatiefactor ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap8: { ...p?.wizardData?.stap8, kapitalisatiefactor: e.target.value ? parseFloat(e.target.value) : undefined } as Waardering } }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Stap 9: Aannames */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-foreground">Aannames &amp; voorbehouden</h3>
                  <Separator />
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="prev-aannames">Aannames</Label>
                      <Textarea
                        id="prev-aannames"
                        rows={3}
                        value={preview.wizardData?.stap9?.aannames ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap9: { ...p?.wizardData?.stap9, aannames: e.target.value } as Aannames } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-voorbehouden">Voorbehouden</Label>
                      <Textarea
                        id="prev-voorbehouden"
                        rows={3}
                        value={preview.wizardData?.stap9?.voorbehouden ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap9: { ...p?.wizardData?.stap9, voorbehouden: e.target.value } as Aannames } }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prev-bijzonder">Bijzondere omstandigheden</Label>
                      <Textarea
                        id="prev-bijzonder"
                        rows={3}
                        value={preview.wizardData?.stap9?.bijzondereOmstandigheden ?? ''}
                        onChange={(e) => setPreview((p) => ({ ...p, wizardData: { ...p?.wizardData, stap9: { ...p?.wizardData?.stap9, bijzondereOmstandigheden: e.target.value } as Aannames } }))}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={handleCloseDialog}>
              Annuleren
            </Button>
            {preview && !isLoading && (
              <Button onClick={handleSaveRapport}>
                Opslaan in kennisbank
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showVerwijderDialog} onOpenChange={(open) => !open && setShowVerwijderDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rapporten verwijderen?</DialogTitle>
            <DialogDescription>
              Weet je het zeker? Wil je{' '}
              {geselecteerdeIds.size === 1
                ? (() => {
                    const rapport = historischeRapporten.find((r) => geselecteerdeIds.has(r.id))
                    return rapport
                      ? <strong>{rapport.adres.straat} {rapport.adres.huisnummer}, {rapport.adres.plaats}</strong>
                      : 'dit rapport'
                  })()
                : <strong>{geselecteerdeIds.size} rapporten</strong>}{' '}
              verwijderen? Dit kan niet ongedaan worden gemaakt.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVerwijderDialog(false)}>
              Annuleren
            </Button>
            <Button variant="destructive" onClick={handleBevestigVerwijderen}>
              Verwijderen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bewerkRapport} onOpenChange={(open) => { if (!open) handleCloseBewerkDialog() }}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Rapport bewerken</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
          {bewerkFormulier && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bew-straat">Straatnaam</Label>
                  <Input
                    id="bew-straat"
                    value={bewerkFormulier.adres.straat}
                    onChange={(e) => setBewerkFormulier((f) => f && ({ ...f, adres: { ...f.adres, straat: e.target.value } }))}
                  />
                  {bewerkFouten.straat && <p className="text-sm text-destructive">{bewerkFouten.straat}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bew-huisnummer">Huisnummer</Label>
                  <Input
                    id="bew-huisnummer"
                    value={bewerkFormulier.adres.huisnummer}
                    onChange={(e) => setBewerkFormulier((f) => f && ({ ...f, adres: { ...f.adres, huisnummer: e.target.value } }))}
                  />
                  {bewerkFouten.huisnummer && <p className="text-sm text-destructive">{bewerkFouten.huisnummer}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bew-postcode">Postcode</Label>
                  <Input
                    id="bew-postcode"
                    value={bewerkFormulier.adres.postcode}
                    onChange={(e) => setBewerkFormulier((f) => f && ({ ...f, adres: { ...f.adres, postcode: e.target.value } }))}
                  />
                  {bewerkFouten.postcode && <p className="text-sm text-destructive">{bewerkFouten.postcode}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bew-plaats">Plaats</Label>
                  <Input
                    id="bew-plaats"
                    value={bewerkFormulier.adres.plaats}
                    onChange={(e) => setBewerkFormulier((f) => f && ({ ...f, adres: { ...f.adres, plaats: e.target.value } }))}
                  />
                  {bewerkFouten.plaats && <p className="text-sm text-destructive">{bewerkFouten.plaats}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bew-type">Type object</Label>
                  <Select
                    value={bewerkFormulier.typeObject}
                    onValueChange={(v) => setBewerkFormulier((f) => f && ({ ...f, typeObject: v as ObjectType }))}
                  >
                    <SelectTrigger id="bew-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kantoor">Kantoor</SelectItem>
                      <SelectItem value="bedrijfscomplex">Bedrijfscomplex</SelectItem>
                      <SelectItem value="bedrijfshal">Bedrijfshal</SelectItem>
                      <SelectItem value="winkel">Winkel</SelectItem>
                      <SelectItem value="woning">Woning</SelectItem>
                      <SelectItem value="appartement">Appartement</SelectItem>
                      <SelectItem value="overig">Overig</SelectItem>
                    </SelectContent>
                  </Select>
                  {bewerkFouten.typeObject && <p className="text-sm text-destructive">{bewerkFouten.typeObject}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bew-gebruiksdoel">Gebruiksdoel</Label>
                  <Select
                    value={bewerkFormulier.gebruiksdoel}
                    onValueChange={(v) => setBewerkFormulier((f) => f && ({ ...f, gebruiksdoel: v as Gebruiksdoel }))}
                  >
                    <SelectTrigger id="bew-gebruiksdoel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eigenaar_gebruiker">Eigenaar-gebruiker</SelectItem>
                      <SelectItem value="verhuurd_belegging">Verhuurd / Belegging</SelectItem>
                      <SelectItem value="leegstand">Leegstand</SelectItem>
                      <SelectItem value="overig">Overig</SelectItem>
                    </SelectContent>
                  </Select>
                  {bewerkFouten.gebruiksdoel && <p className="text-sm text-destructive">{bewerkFouten.gebruiksdoel}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bew-bvo">BVO (m²)</Label>
                  <Input
                    id="bew-bvo"
                    type="number"
                    value={bewerkFormulier.bvo || ''}
                    onChange={(e) => setBewerkFormulier((f) => f && ({ ...f, bvo: parseFloat(e.target.value) || 0 }))}
                  />
                  {bewerkFouten.bvo && <p className="text-sm text-destructive">{bewerkFouten.bvo}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bew-marktwaarde">Marktwaarde (€)</Label>
                  <Input
                    id="bew-marktwaarde"
                    type="number"
                    value={bewerkFormulier.marktwaarde || ''}
                    onChange={(e) => setBewerkFormulier((f) => f && ({ ...f, marktwaarde: parseFloat(e.target.value) || 0 }))}
                  />
                  {bewerkFouten.marktwaarde && <p className="text-sm text-destructive">{bewerkFouten.marktwaarde}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bew-bar">BAR % (optioneel)</Label>
                  <Input
                    id="bew-bar"
                    type="number"
                    step="0.01"
                    value={bewerkFormulier.bar ?? ''}
                    onChange={(e) => setBewerkFormulier((f) => f && ({ ...f, bar: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bew-nar">NAR % (optioneel)</Label>
                  <Input
                    id="bew-nar"
                    type="number"
                    step="0.01"
                    value={bewerkFormulier.nar ?? ''}
                    onChange={(e) => setBewerkFormulier((f) => f && ({ ...f, nar: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bew-peildatum">Waardepeildatum</Label>
                <Input
                  id="bew-peildatum"
                  type="date"
                  value={bewerkFormulier.waardepeildatum}
                  onChange={(e) => setBewerkFormulier((f) => f && ({ ...f, waardepeildatum: e.target.value }))}
                />
                {bewerkFouten.waardepeildatum && <p className="text-sm text-destructive">{bewerkFouten.waardepeildatum}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bew-lat">Breedtegraad (lat, optioneel)</Label>
                  <Input
                    id="bew-lat"
                    type="number"
                    step="0.000001"
                    value={bewerkFormulier.coordinaten.lat || ''}
                    onChange={(e) => setBewerkFormulier((f) => f && ({ ...f, coordinaten: { ...f.coordinaten, lat: parseFloat(e.target.value) || 0 } }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bew-lng">Lengtegraad (lng, optioneel)</Label>
                  <Input
                    id="bew-lng"
                    type="number"
                    step="0.000001"
                    value={bewerkFormulier.coordinaten.lng || ''}
                    onChange={(e) => setBewerkFormulier((f) => f && ({ ...f, coordinaten: { ...f.coordinaten, lng: parseFloat(e.target.value) || 0 } }))}
                  />
                </div>
              </div>
            </div>
          )}
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={handleCloseBewerkDialog}>
              Annuleren
            </Button>
            <Button onClick={handleSaveBewerkRapport}>
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totaal Rapporten</CardTitle>
            <Buildings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{stats.totaal}</div>
            <p className="text-xs text-muted-foreground mt-1">In kennisbank</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gemiddelde Waarde</CardTitle>
            <CurrencyCircleDollar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatBedrag(stats.gemiddeldeWaarde)}</div>
            <p className="text-xs text-muted-foreground mt-1">Marktwaarde k.k.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Objecttypes</CardTitle>
            <ChartBar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{Object.keys(stats.perType).length}</div>
            <p className="text-xs text-muted-foreground mt-1">Verschillende types</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Regio's</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{Object.keys(stats.perRegio).length}</div>
            <p className="text-xs text-muted-foreground mt-1">Verschillende plaatsen</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters en zoeken</CardTitle>
          <CardDescription>
            Filter en doorzoek de kennisbank om specifieke rapporten te vinden
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="zoekterm">Zoeken</Label>
              <div className="relative">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="zoekterm"
                  placeholder="Adres, plaats, postcode..."
                  value={zoekterm}
                  onChange={(e) => setZoekterm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-type">Objecttype</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger id="filter-type">
                  <SelectValue placeholder="Alle types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle types</SelectItem>
                  <SelectItem value="kantoor">Kantoor</SelectItem>
                  <SelectItem value="bedrijfscomplex">Bedrijfscomplex</SelectItem>
                  <SelectItem value="bedrijfshal">Bedrijfshal</SelectItem>
                  <SelectItem value="winkel">Winkel</SelectItem>
                  <SelectItem value="woning">Woning</SelectItem>
                  <SelectItem value="appartement">Appartement</SelectItem>
                  <SelectItem value="overig">Overig</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-gebruiksdoel">Gebruiksdoel</Label>
              <Select value={filterGebruiksdoel} onValueChange={setFilterGebruiksdoel}>
                <SelectTrigger id="filter-gebruiksdoel">
                  <SelectValue placeholder="Alle gebruiksdoelen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle gebruiksdoelen</SelectItem>
                  <SelectItem value="eigenaar_gebruiker">Eigenaar-gebruiker</SelectItem>
                  <SelectItem value="verhuurd_belegging">Verhuurd / Belegging</SelectItem>
                  <SelectItem value="leegstand">Leegstand</SelectItem>
                  <SelectItem value="overig">Overig</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(zoekterm || filterType !== 'alle' || filterGebruiksdoel !== 'alle') && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {gefilterdRapporten.length} van {stats.totaal} rapporten gevonden
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setZoekterm('')
                  setFilterType('alle')
                  setFilterGebruiksdoel('alle')
                }}
              >
                Filters wissen
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historische rapporten</CardTitle>
          <CardDescription>
            Alle rapporten in de kennisbank die gebruikt kunnen worden voor similarity matching
          </CardDescription>
        </CardHeader>
        <CardContent>
          {gefilterdRapporten.length === 0 ? (
            <div className="text-center py-12">
              <Buildings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {stats.totaal === 0
                  ? 'Nog geen rapporten in de kennisbank'
                  : 'Geen rapporten gevonden met de huidige filters'}
              </p>
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    {selectieModus && <TableHead className="w-10"></TableHead>}
                    <TableHead>Adres</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Gebruiksdoel</TableHead>
                    <TableHead className="text-right">BVO (m²)</TableHead>
                    <TableHead className="text-right">Marktwaarde</TableHead>
                    <TableHead className="text-right">BAR</TableHead>
                    <TableHead className="text-right">NAR</TableHead>
                    <TableHead>Peildatum</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gefilterdRapporten.map((rapport) => (
                    <TableRow
                      key={rapport.id}
                      className={selectieModus ? 'cursor-pointer' : ''}
                      onClick={selectieModus ? () => handleToggleSelectie(rapport.id) : undefined}
                      data-selected={selectieModus && geselecteerdeIds.has(rapport.id)}
                    >
                      {selectieModus && (
                        <TableCell>
                          <Checkbox
                            checked={geselecteerdeIds.has(rapport.id)}
                            onCheckedChange={() => handleToggleSelectie(rapport.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="font-medium">
                          {rapport.adres.straat} {rapport.adres.huisnummer}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {rapport.adres.postcode} {rapport.adres.plaats}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{rapport.typeObject}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {rapport.gebruiksdoel === 'eigenaar_gebruiker'
                            ? 'Eigenaar-gebruiker'
                            : rapport.gebruiksdoel === 'verhuurd_belegging'
                            ? 'Verhuurd'
                            : rapport.gebruiksdoel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {rapport.bvo ? rapport.bvo.toLocaleString('nl-NL') : '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatBedrag(rapport.marktwaarde)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {rapport.bar !== undefined && rapport.bar !== null
                          ? `${rapport.bar.toLocaleString('nl-NL', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })} %`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {rapport.nar !== undefined && rapport.nar !== null
                          ? `${rapport.nar.toLocaleString('nl-NL', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })} %`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDatum(rapport.waardepeildatum)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); handleOpenBewerken(rapport) }}
                          title="Bewerken"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
