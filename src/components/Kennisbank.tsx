import { useState, useMemo, useRef } from 'react'
import type { HistorischRapport, ObjectType, Gebruiksdoel, AlgemeneGegevens, AdresLocatie, Oppervlaktes, Waardering } from '../types'
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
      coordinaten: { lat: 0, lng: 0 },
      typeObject: (preview.typeObject ?? 'overig') as ObjectType,
      gebruiksdoel: (preview.gebruiksdoel ?? 'overig') as Gebruiksdoel,
      bvo: preview.bvo ?? 0,
      marktwaarde: preview.marktwaarde ?? 0,
      bar: preview.bar,
      nar: preview.nar,
      waardepeildatum: preview.waardepeildatum ?? new Date().toISOString().slice(0, 10),
      rapportTeksten: preview.rapportTeksten ?? {},
      wizardData: {
        ...(preview.typeObject || preview.gebruiksdoel
          ? {
              stap1: {
                typeObject: preview.typeObject,
                gebruiksdoel: preview.gebruiksdoel,
              } as AlgemeneGegevens,
            }
          : {}),
        ...(preview.adres
          ? {
              stap2: {
                straatnaam: preview.adres.straat,
                huisnummer: preview.adres.huisnummer,
                postcode: preview.adres.postcode,
                plaats: preview.adres.plaats,
                ...preview.wizardData?.stap2,
              } as AdresLocatie,
            }
          : preview.wizardData?.stap2
            ? { stap2: preview.wizardData.stap2 }
            : {}),
        ...(preview.bvo
          ? {
              stap3: {
                bvo: preview.bvo,
              } as Oppervlaktes,
            }
          : {}),
        ...(preview.wizardData?.stap5 ? { stap5: preview.wizardData.stap5 } : {}),
        ...(preview.wizardData?.stap6 ? { stap6: preview.wizardData.stap6 } : {}),
        ...(preview.wizardData?.stap7 ? { stap7: preview.wizardData.stap7 } : {}),
        ...(preview.marktwaarde || preview.bar || preview.nar
          ? {
              stap8: {
                marktwaarde: preview.marktwaarde,
                bar: preview.bar,
                nar: preview.nar,
              } as Waardering,
            }
          : {}),
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Taxatierapport uploaden als PDF</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
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
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Controleer en pas de geëxtraheerde gegevens aan voor het opslaan.
                </p>

                <div className="grid grid-cols-2 gap-4">
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
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                    <Label htmlFor="prev-marktwaarde">Marktwaarde (€)</Label>
                    <Input
                      id="prev-marktwaarde"
                      type="number"
                      value={preview.marktwaarde ?? ''}
                      onChange={(e) => setPreview((p) => ({ ...p, marktwaarde: parseFloat(e.target.value) || 0 }))}
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
              </div>
            )}
          </div>
          <DialogFooter>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Rapport bewerken</DialogTitle>
          </DialogHeader>
          {bewerkFormulier && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
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

              <div className="grid grid-cols-2 gap-4">
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

              <div className="grid grid-cols-2 gap-4">
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

              <div className="grid grid-cols-2 gap-4">
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
          <DialogFooter>
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
