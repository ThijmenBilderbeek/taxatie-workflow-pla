import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Switch } from './ui/switch'
import { Progress } from './ui/progress'
import { ArrowLeft, ArrowRight, Check, Lightbulb } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { 
  Dossier, 
  AlgemeneGegevens, 
  AdresLocatie, 
  Oppervlaktes, 
  Huurgegevens, 
  JuridischeInfo, 
  TechnischeStaat, 
  Vergunningen, 
  Waardering, 
  Aannames,
  HistorischRapport,
  SimilarityInstellingen
} from '@/types'
import { calculateSimilarity, calculateAllSimilarities } from '@/lib/similarity'
import { getSuggestiesVoorStap, type VeldSuggestie } from '@/lib/suggestions'
import { generateAlleSecties } from '@/lib/templates'
import { formatBedrag, formatOppervlakte, formatDatum } from '@/lib/fluxFormatter'

export function WizardFlow({
  activeDossierId,
  dossiers,
  historischeRapporten,
  similarityInstellingen,
  onUpdateDossier,
  shouldSaveAndNavigateToDashboard,
  onSavedAndNavigated,
}: {
  activeDossierId: string
  dossiers: Dossier[]
  historischeRapporten: HistorischRapport[]
  similarityInstellingen: SimilarityInstellingen
  onUpdateDossier: (dossier: Dossier) => void
  shouldSaveAndNavigateToDashboard?: boolean
  onSavedAndNavigated?: () => void
}) {
  const activeDossier = dossiers.find(d => d.id === activeDossierId)
  const [currentStep, setCurrentStep] = useState(activeDossier?.huidigeStap || 1)

  const [stap1, setStap1] = useState<Partial<AlgemeneGegevens>>(activeDossier?.stap1 || {})
  const [stap2, setStap2] = useState<Partial<AdresLocatie>>(activeDossier?.stap2 || {})
  const [stap3, setStap3] = useState<Partial<Oppervlaktes>>(activeDossier?.stap3 || {})
  const [stap4, setStap4] = useState<Partial<Huurgegevens>>(activeDossier?.stap4 || { verhuurd: false })
  const [stap5, setStap5] = useState<Partial<JuridischeInfo>>(activeDossier?.stap5 || {})
  const [stap6, setStap6] = useState<Partial<TechnischeStaat>>(activeDossier?.stap6 || { achterstalligOnderhoud: false })
  const [stap7, setStap7] = useState<Partial<Vergunningen>>(activeDossier?.stap7 || { omgevingsvergunning: false })
  const [stap8, setStap8] = useState<Partial<Waardering>>(activeDossier?.stap8 || { vergelijkingsobjecten: [] })
  const [stap9, setStap9] = useState<Partial<Aannames>>(activeDossier?.stap9 || {})
  const [selectedReferenties, setSelectedReferenties] = useState<string[]>(activeDossier?.geselecteerdeReferenties || [])
  const [dismissedSuggesties, setDismissedSuggesties] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (activeDossier) {
      setCurrentStep(activeDossier.huidigeStap)
      if (activeDossier.stap1) setStap1(activeDossier.stap1)
      if (activeDossier.stap2) setStap2(activeDossier.stap2)
      if (activeDossier.stap3) setStap3(activeDossier.stap3)
      if (activeDossier.stap4) setStap4(activeDossier.stap4)
      if (activeDossier.stap5) setStap5(activeDossier.stap5)
      if (activeDossier.stap6) setStap6(activeDossier.stap6)
      if (activeDossier.stap7) setStap7(activeDossier.stap7)
      if (activeDossier.stap8) setStap8(activeDossier.stap8)
      if (activeDossier.stap9) setStap9(activeDossier.stap9)
      if (activeDossier.geselecteerdeReferenties) setSelectedReferenties(activeDossier.geselecteerdeReferenties)
    }
  }, [activeDossier?.id])

  const saveAndNavigateTo = (targetStep: number) => {
    if (!activeDossier) return

    onUpdateDossier({
      ...activeDossier,
      stap1: stap1 as AlgemeneGegevens,
      stap2: stap2 as AdresLocatie,
      stap3: stap3 as Oppervlaktes,
      stap4: stap4 as Huurgegevens,
      stap5: stap5 as JuridischeInfo,
      stap6: stap6 as TechnischeStaat,
      stap7: stap7 as Vergunningen,
      stap8: stap8 as Waardering,
      stap9: stap9 as Aannames,
      geselecteerdeReferenties: selectedReferenties,
      huidigeStap: targetStep,
      updatedAt: new Date().toISOString(),
    })
    setCurrentStep(targetStep)
  }

  const saveCurrentData = () => {
    if (!activeDossier) return
    onUpdateDossier({
      ...activeDossier,
      stap1: stap1 as AlgemeneGegevens,
      stap2: stap2 as AdresLocatie,
      stap3: stap3 as Oppervlaktes,
      stap4: stap4 as Huurgegevens,
      stap5: stap5 as JuridischeInfo,
      stap6: stap6 as TechnischeStaat,
      stap7: stap7 as Vergunningen,
      stap8: stap8 as Waardering,
      stap9: stap9 as Aannames,
      geselecteerdeReferenties: selectedReferenties,
      huidigeStap: currentStep,
      updatedAt: new Date().toISOString(),
    })
  }

  useEffect(() => {
    if (shouldSaveAndNavigateToDashboard) {
      saveCurrentData()
      onSavedAndNavigated?.()
    }
  }, [shouldSaveAndNavigateToDashboard])

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        if (!stap1.objectnaam || !stap1.typeObject || !stap1.gebruiksdoel || !stap1.naamTaxateur) {
          toast.error('Vul alle verplichte velden in')
          return false
        }
        return true
      case 2:
        if (!stap2.straatnaam || !stap2.huisnummer || !stap2.postcode || !stap2.plaats) {
          toast.error('Vul alle verplichte velden in')
          return false
        }
        return true
      case 3:
        if (!stap3.bvo || !stap3.bouwjaar) {
          toast.error('Vul alle verplichte velden in')
          return false
        }
        return true
      case 4:
        if (stap4.verhuurd && !stap4.huurder) {
          toast.error('Vul de huurder in')
          return false
        }
        return true
      case 5:
        if (!stap5.eigendomssituatie || !stap5.bestemmingsplan) {
          toast.error('Vul alle verplichte velden in')
          return false
        }
        return true
      case 6:
        if (!stap6.exterieurStaat || !stap6.interieurStaat) {
          toast.error('Vul alle verplichte velden in')
          return false
        }
        return true
      case 7:
        if (!stap7.energielabel) {
          toast.error('Vul alle verplichte velden in')
          return false
        }
        return true
      case 8:
        if (!stap8.methode || !stap8.marktwaarde) {
          toast.error('Vul alle verplichte velden in')
          return false
        }
        return true
      default:
        return true
    }
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < 10) {
        saveAndNavigateTo(currentStep + 1)
        toast.success('Stap opgeslagen')
      }
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      saveAndNavigateTo(currentStep - 1)
    }
  }

  const handleGenerateRapport = () => {
    if (!activeDossier) return

    const updatedDossier: Dossier = {
      ...activeDossier,
      stap1: stap1 as AlgemeneGegevens,
      stap2: stap2 as AdresLocatie,
      stap3: stap3 as Oppervlaktes,
      stap4: stap4 as Huurgegevens,
      stap5: stap5 as JuridischeInfo,
      stap6: stap6 as TechnischeStaat,
      stap7: stap7 as Vergunningen,
      stap8: stap8 as Waardering,
      stap9: stap9 as Aannames,
      geselecteerdeReferenties: selectedReferenties,
    }

    const secties = generateAlleSecties(updatedDossier, historischeRapporten || [])

    const rapportSecties: Record<string, any> = {}
    Object.entries(secties).forEach(([key, inhoud]) => {
      rapportSecties[key] = {
        titel: getTitelForKey(key),
        inhoud,
        gegenereerdeInhoud: inhoud,
        fluxKlaarTekst: inhoud,
      }
    })

    onUpdateDossier({
      ...updatedDossier,
      rapportSecties,
      status: 'in_behandeling' as const,
    })

    toast.success('Rapport gegenereerd!')
  }

  const getTitelForKey = (key: string): string => {
    const titels: Record<string, string> = {
      'rapport-samenvatting': 'Rapport samenvatting',
      'a1-opdrachtgever': 'A.1 Opdrachtgever',
      'a2-taxateur': 'A.2 Opdrachtnemer en uitvoerend taxateur',
      'b1-algemeen': 'B.1 Algemeen',
      'b2-doel-taxatie': 'B.2 Doel van de taxatie',
      'b3-waardering-basis': 'B.3 Waardering & basis van de waarde',
      'b4-inspectie': 'B.4 Inspectie',
      'b5-uitgangspunten': 'B.5 Uitgangspunten en afwijkingen',
      'b6-toelichting-waardering': 'B.6 Nadere toelichting op de waardering',
      'b7-eerdere-taxaties': 'B.7 Eerdere taxaties',
      'b8-inzage-documenten': 'B.8 Overzicht inzage documenten',
      'b9-taxatiemethodiek': 'B.9 Gehanteerde taxatiemethodiek',
      'b10-plausibiliteit': 'B.10 Plausibiliteit taxatie',
      'c1-swot': 'C.1 SWOT-analyse',
      'c2-beoordeling': 'C.2 Beoordeling',
      'd1-privaatrechtelijk': 'D.1 Privaatrechtelijke aspecten',
      'd2-publiekrechtelijk': 'D.2 Publiekrechtelijke aspecten',
      'e1-locatie-overzicht': 'E.1 Locatieoverzicht',
      'e2-locatie-informatie': 'E.2 Locatie informatie',
      'f1-object-informatie': 'F.1 Objectinformatie',
      'f2-oppervlakte': 'F.2 Oppervlakte',
      'f4-milieuaspecten': 'F.4 Milieuaspecten en beoordeling',
      'g1-gebruik-object': 'G.1 Gebruik van het object',
      'g2-alternatieve-aanwendbaarheid': 'G.2 Alternatieve aanwendbaarheid / Huursituatie',
      'h1-marktvisie': 'H.1 Marktvisie',
      'h2-huurreferenties': 'H.2 Huurreferenties en overzicht ruimtes en markthuur',
      'h3-koopreferenties': 'H.3 Koopreferenties en onderbouwing yields',
      'h4-correcties': 'H.4 Onderbouwing correcties',
      'i-duurzaamheid': 'I. Duurzaamheid',
      'j-algemene-uitgangspunten': 'J. Algemene uitgangspunten',
      'k-waardebegrippen': 'K. Waardebegrippen en definities',
      'l-bijlagen': 'L. Bijlagen',
      'ondertekening': 'Ondertekening',
    }
    return titels[key] || key
  }

  const progress = (currentStep / 10) * 100

  const similarityResults = activeDossier && stap2.coordinaten && stap3.bvo && stap1.typeObject
    ? (historischeRapporten || []).map(rapport => {
        const tempDossier: Dossier = {
          ...activeDossier,
          stap1: stap1 as AlgemeneGegevens,
          stap2: stap2 as AdresLocatie,
          stap3: stap3 as Oppervlaktes,
        }
        return calculateSimilarity(
          tempDossier,
          rapport,
          similarityInstellingen?.gewichten
        )
      }).filter(r => r !== null) as any[]
    : []

  const toggleReferentie = (rapportId: string) => {
    setSelectedReferenties((current) => {
      if (current.includes(rapportId)) {
        return current.filter((id) => id !== rapportId)
      } else if (current.length < 3) {
        return [...current, rapportId]
      } else {
        toast.error('Maximaal 3 referenties selecteren')
        return current
      }
    })
  }

  const handleSuggestieAccept = (veldNaam: string, waarde: string) => {
    switch (currentStep) {
      case 2:
        setStap2((prev) => ({ ...prev, [veldNaam]: waarde }))
        break
      case 5:
        setStap5((prev) => ({ ...prev, [veldNaam]: waarde }))
        break
      case 6:
        setStap6((prev) => ({ ...prev, [veldNaam]: waarde }))
        break
      case 7:
        setStap7((prev) => ({ ...prev, [veldNaam]: waarde }))
        break
      case 9:
        setStap9((prev) => ({ ...prev, [veldNaam]: waarde }))
        break
    }
    setDismissedSuggesties((prev) => new Set([...prev, veldNaam]))
  }

  const handleSuggestieDismiss = (veldNaam: string) => {
    setDismissedSuggesties((prev) => new Set([...prev, veldNaam]))
  }

  const suggestiesHuidigeStap = getSuggestiesVoorStap(
    currentStep,
    { stap1, stap2, stap3, stap4, stap5, stap6, stap7, stap8, stap9 } as Partial<Dossier>,
    historischeRapporten || [],
    similarityInstellingen
  )

  if (!activeDossier) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Geen actief dossier gevonden</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Stap {currentStep} van 10</h2>
          <span className="text-sm text-muted-foreground">{Math.round(progress)}% voltooid</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{getStepTitle(currentStep)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {currentStep === 1 && <Stap1 data={stap1} onChange={setStap1} />}
          {currentStep === 2 && <Stap2 data={stap2} onChange={setStap2} suggesties={suggestiesHuidigeStap} dismissedSuggesties={dismissedSuggesties} onSuggestieAccept={handleSuggestieAccept} onSuggestieDismiss={handleSuggestieDismiss} />}
          {currentStep === 3 && <Stap3 data={stap3} onChange={setStap3} />}
          {currentStep === 4 && <Stap4 data={stap4} onChange={setStap4} />}
          {currentStep === 5 && <Stap5 data={stap5} onChange={setStap5} suggesties={suggestiesHuidigeStap} dismissedSuggesties={dismissedSuggesties} onSuggestieAccept={handleSuggestieAccept} onSuggestieDismiss={handleSuggestieDismiss} />}
          {currentStep === 6 && <Stap6 data={stap6} onChange={setStap6} suggesties={suggestiesHuidigeStap} dismissedSuggesties={dismissedSuggesties} onSuggestieAccept={handleSuggestieAccept} onSuggestieDismiss={handleSuggestieDismiss} />}
          {currentStep === 7 && <Stap7 data={stap7} onChange={setStap7} suggesties={suggestiesHuidigeStap} dismissedSuggesties={dismissedSuggesties} onSuggestieAccept={handleSuggestieAccept} onSuggestieDismiss={handleSuggestieDismiss} />}
          {currentStep === 8 && <Stap8 data={stap8} onChange={setStap8} />}
          {currentStep === 9 && <Stap9 data={stap9} onChange={setStap9} suggesties={suggestiesHuidigeStap} dismissedSuggesties={dismissedSuggesties} onSuggestieAccept={handleSuggestieAccept} onSuggestieDismiss={handleSuggestieDismiss} />}
          {currentStep === 10 && (
            <Stap10
              results={similarityResults}
              historischeRapporten={historischeRapporten || []}
              selectedReferenties={selectedReferenties}
              onToggleReferentie={toggleReferentie}
            />
          )}

          <div className="flex items-center justify-between pt-6 border-t">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 1}
            >
              <ArrowLeft className="mr-2" />
              Vorige
            </Button>

            {currentStep < 10 ? (
              <Button onClick={handleNext}>
                Volgende
                <ArrowRight className="ml-2" />
              </Button>
            ) : (
              <Button onClick={handleGenerateRapport}>
                <Check className="mr-2" />
                Genereer Rapport
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function getStepTitle(step: number): string {
  const titles = [
    'Algemene objectgegevens',
    'Adres en locatie',
    'Oppervlaktes en metrages',
    'Huurgegevens',
    'Juridische informatie',
    'Technische staat en onderhoud',
    'Vergunningen, energielabel en milieu',
    'Waarderingsgegevens',
    'Aannames en bijzonderheden',
    'Vergelijkbare rapporten',
  ]
  return titles[step - 1] || ''
}

function SuggestieBanner({
  suggestie,
  bronAdres,
  bronScore,
  onAccept,
  onDismiss,
}: {
  suggestie: string
  bronAdres: string
  bronScore: number | null
  onAccept: () => void
  onDismiss: () => void
}) {
  const preview = suggestie.length > 150 ? suggestie.slice(0, 150) + '...' : suggestie
  return (
    <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm text-accent-foreground font-medium">
        <Lightbulb className="h-4 w-4" />
        <span>
          Suggestie op basis van {bronAdres}
          {bronScore !== null ? ` (score: ${bronScore})` : ''}
        </span>
      </div>
      <p className="text-sm text-muted-foreground italic">"{preview}"</p>
      <div className="flex gap-2">
        <Button size="sm" variant="default" onClick={onAccept}>
          ✓ Overnemen
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          ✗ Negeren
        </Button>
      </div>
    </div>
  )
}

interface SuggestieProps {
  suggesties?: VeldSuggestie[]
  dismissedSuggesties?: Set<string>
  onSuggestieAccept?: (veldNaam: string, waarde: string) => void
  onSuggestieDismiss?: (veldNaam: string) => void
}

function Stap1({ data, onChange }: { data: Partial<AlgemeneGegevens>; onChange: (data: Partial<AlgemeneGegevens>) => void }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="objectnaam">Objectnaam / omschrijving *</Label>
        <Input
          id="objectnaam"
          value={data.objectnaam || ''}
          onChange={(e) => onChange({ ...data, objectnaam: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="typeObject">Type object *</Label>
          <Select
            value={data.typeObject}
            onValueChange={(value) => onChange({ ...data, typeObject: value as any })}
          >
            <SelectTrigger id="typeObject">
              <SelectValue placeholder="Selecteer type" />
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

        <div className="grid gap-2">
          <Label htmlFor="gebruiksdoel">Gebruiksdoel *</Label>
          <Select
            value={data.gebruiksdoel}
            onValueChange={(value) => onChange({ ...data, gebruiksdoel: value as any })}
          >
            <SelectTrigger id="gebruiksdoel">
              <SelectValue placeholder="Selecteer doel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="eigenaar_gebruiker">Eigenaar gebruiker</SelectItem>
              <SelectItem value="verhuurd_belegging">Verhuurd / Belegging</SelectItem>
              <SelectItem value="leegstand">Leegstand</SelectItem>
              <SelectItem value="overig">Overig</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Opdrachtgever</Label>
        <div className="grid grid-cols-2 gap-4">
          <Input
            placeholder="Naam"
            value={data.opdrachtgever?.naam || ''}
            onChange={(e) =>
              onChange({
                ...data,
                opdrachtgever: { ...data.opdrachtgever!, naam: e.target.value },
              })
            }
          />
          <Input
            placeholder="Bedrijf"
            value={data.opdrachtgever?.bedrijf || ''}
            onChange={(e) =>
              onChange({
                ...data,
                opdrachtgever: { ...data.opdrachtgever!, bedrijf: e.target.value },
              })
            }
          />
          <Input
            placeholder="E-mail"
            type="email"
            value={data.opdrachtgever?.email || ''}
            onChange={(e) =>
              onChange({
                ...data,
                opdrachtgever: { ...data.opdrachtgever!, email: e.target.value },
              })
            }
          />
          <Input
            placeholder="Telefoon"
            value={data.opdrachtgever?.telefoon || ''}
            onChange={(e) =>
              onChange({
                ...data,
                opdrachtgever: { ...data.opdrachtgever!, telefoon: e.target.value },
              })
            }
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="naamTaxateur">Naam taxateur *</Label>
        <Input
          id="naamTaxateur"
          value={data.naamTaxateur || ''}
          onChange={(e) => onChange({ ...data, naamTaxateur: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="waardepeildatum">Waardepeildatum</Label>
          <Input
            id="waardepeildatum"
            type="date"
            value={data.waardepeildatum || ''}
            onChange={(e) => onChange({ ...data, waardepeildatum: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="inspectiedatum">Inspectiedatum</Label>
          <Input
            id="inspectiedatum"
            type="date"
            value={data.inspectiedatum || ''}
            onChange={(e) => onChange({ ...data, inspectiedatum: e.target.value })}
          />
        </div>
      </div>
    </div>
  )
}

function Stap2({ data, onChange, suggesties, dismissedSuggesties, onSuggestieAccept, onSuggestieDismiss }: { data: Partial<AdresLocatie>; onChange: (data: Partial<AdresLocatie>) => void } & SuggestieProps) {
  const [pdokSuggesties, setPdokSuggesties] = useState<Array<{ id: string; weergavenaam: string }>>([])
  const [toonSuggesties, setToonSuggesties] = useState(false)
  const [isLaden, setIsLaden] = useState(false)

  useEffect(() => {
    const zoekterm = data.straatnaam || ''
    if (zoekterm.length < 3) {
      setPdokSuggesties([])
      setToonSuggesties(false)
      return
    }
    const q = data.huisnummer ? `${zoekterm} ${data.huisnummer}` : zoekterm
    const timer = setTimeout(async () => {
      setIsLaden(true)
      try {
        const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(q)}&rows=6&fq=type:adres`
        const resp = await fetch(url)
        const json = await resp.json()
        const docs: Array<{ id: string; weergavenaam: string }> = json?.response?.docs ?? []
        setPdokSuggesties(docs)
        setToonSuggesties(docs.length > 0)
      } catch {
        setPdokSuggesties([])
        setToonSuggesties(false)
      } finally {
        setIsLaden(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [data.straatnaam, data.huisnummer])

  const DROPDOWN_CLOSE_DELAY = 200

  const selecteerPdokSuggestie = async (id: string) => {
    setToonSuggesties(false)
    try {
      const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${encodeURIComponent(id)}`
      const resp = await fetch(url)
      const json = await resp.json()
      const doc = json?.response?.docs?.[0]
      if (!doc) return
      let lat = data.coordinaten?.lat
      let lng = data.coordinaten?.lng
      if (doc.centroide_ll) {
        const match = doc.centroide_ll.match(/POINT\(([+-]?[0-9.eE-]+)\s+([+-]?[0-9.eE-]+)\)/)
        if (match) {
          lng = parseFloat(match[1])
          lat = parseFloat(match[2])
        }
      }
      onChange({
        ...data,
        straatnaam: doc.straatnaam || data.straatnaam || '',
        huisnummer: doc.huis_nlt || data.huisnummer || '',
        postcode: doc.postcode || data.postcode || '',
        plaats: doc.woonplaatsnaam || data.plaats || '',
        gemeente: doc.gemeentenaam || data.gemeente || '',
        provincie: doc.provincienaam || data.provincie || '',
        ...(lat !== undefined && lng !== undefined ? { coordinaten: { lat, lng } } : {}),
      })
    } catch {
      // silently ignore lookup errors
    }
  }

  const handleStraatnaamBlur = () => {
    setTimeout(() => setToonSuggesties(false), DROPDOWN_CLOSE_DELAY)
  }

  const renderSuggestie = (veldNaam: string) => {
    if (!suggesties || !onSuggestieAccept || !onSuggestieDismiss) return null
    if (dismissedSuggesties?.has(veldNaam)) return null
    const s = suggesties.find((sg) => sg.veldNaam === veldNaam)
    if (!s) return null
    return (
      <SuggestieBanner
        suggestie={s.suggestie}
        bronAdres={s.bronAdres}
        bronScore={s.bronScore}
        onAccept={() => onSuggestieAccept(veldNaam, s.suggestie)}
        onDismiss={() => onSuggestieDismiss(veldNaam)}
      />
    )
  }
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 grid gap-2">
          <Label htmlFor="straatnaam">Straatnaam *</Label>
          <div className="relative">
            <Input
              id="straatnaam"
              value={data.straatnaam || ''}
              onChange={(e) => onChange({ ...data, straatnaam: e.target.value })}
              onBlur={handleStraatnaamBlur}
              autoComplete="off"
            />
            {toonSuggesties && (
              <Card className="absolute z-50 w-full mt-1 shadow-lg">
                <CardContent className="p-1">
                  {isLaden ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Zoeken…</div>
                  ) : (
                    pdokSuggesties.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent hover:text-accent-foreground transition-colors"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selecteerPdokSuggestie(s.id)}
                      >
                        {s.weergavenaam}
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="huisnummer">Huisnummer *</Label>
          <Input
            id="huisnummer"
            value={data.huisnummer || ''}
            onChange={(e) => onChange({ ...data, huisnummer: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="postcode">Postcode *</Label>
          <Input
            id="postcode"
            value={data.postcode || ''}
            onChange={(e) => onChange({ ...data, postcode: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="plaats">Plaats *</Label>
          <Input
            id="plaats"
            value={data.plaats || ''}
            onChange={(e) => onChange({ ...data, plaats: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="gemeente">Gemeente</Label>
          <Input
            id="gemeente"
            value={data.gemeente || ''}
            onChange={(e) => onChange({ ...data, gemeente: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="provincie">Provincie</Label>
          <Input
            id="provincie"
            value={data.provincie || ''}
            onChange={(e) => onChange({ ...data, provincie: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Kadastrale aanduiding</Label>
        <div className="grid grid-cols-3 gap-4">
          <Input
            placeholder="Gemeente"
            value={data.kadasterAanduiding?.gemeente || ''}
            onChange={(e) =>
              onChange({
                ...data,
                kadasterAanduiding: { ...data.kadasterAanduiding!, gemeente: e.target.value },
              })
            }
          />
          <Input
            placeholder="Sectie"
            value={data.kadasterAanduiding?.sectie || ''}
            onChange={(e) =>
              onChange({
                ...data,
                kadasterAanduiding: { ...data.kadasterAanduiding!, sectie: e.target.value },
              })
            }
          />
          <Input
            placeholder="Perceelnummer"
            value={data.kadasterAanduiding?.perceelnummer || ''}
            onChange={(e) =>
              onChange({
                ...data,
                kadasterAanduiding: { ...data.kadasterAanduiding!, perceelnummer: e.target.value },
              })
            }
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="kadastraalOppervlak">Kadastraal oppervlak (m²)</Label>
        <Input
          id="kadastraalOppervlak"
          type="number"
          value={data.kadastraalOppervlak || ''}
          onChange={(e) => onChange({ ...data, kadastraalOppervlak: Number(e.target.value) })}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="ligging">Ligging</Label>
        <Select
          value={data.ligging}
          onValueChange={(value) => onChange({ ...data, ligging: value as any })}
        >
          <SelectTrigger id="ligging">
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

      <div className="grid gap-2">
        <Label htmlFor="bereikbaarheid">Bereikbaarheid / infrastructuur</Label>
        {renderSuggestie('bereikbaarheid')}
        <Textarea
          id="bereikbaarheid"
          value={data.bereikbaarheid || ''}
          onChange={(e) => onChange({ ...data, bereikbaarheid: e.target.value })}
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="lat">Latitude</Label>
          <Input
            id="lat"
            type="number"
            step="0.000001"
            value={data.coordinaten?.lat || ''}
            onChange={(e) =>
              onChange({
                ...data,
                coordinaten: { ...data.coordinaten!, lat: Number(e.target.value) },
              })
            }
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="lng">Longitude</Label>
          <Input
            id="lng"
            type="number"
            step="0.000001"
            value={data.coordinaten?.lng || ''}
            onChange={(e) =>
              onChange({
                ...data,
                coordinaten: { ...data.coordinaten!, lng: Number(e.target.value) },
              })
            }
          />
        </div>
      </div>
    </div>
  )
}

function Stap3({ data, onChange }: { data: Partial<Oppervlaktes>; onChange: (data: Partial<Oppervlaktes>) => void }) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="bvo">BVO (m²) *</Label>
          <Input
            id="bvo"
            type="number"
            value={data.bvo || ''}
            onChange={(e) => onChange({ ...data, bvo: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="vvo">VVO (m²)</Label>
          <Input
            id="vvo"
            type="number"
            value={data.vvo || ''}
            onChange={(e) => onChange({ ...data, vvo: Number(e.target.value) })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="perceeloppervlak">Perceeloppervlak (m²)</Label>
          <Input
            id="perceeloppervlak"
            type="number"
            value={data.perceeloppervlak || ''}
            onChange={(e) => onChange({ ...data, perceeloppervlak: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="aantalBouwlagen">Aantal bouwlagen</Label>
          <Input
            id="aantalBouwlagen"
            type="number"
            value={data.aantalBouwlagen || ''}
            onChange={(e) => onChange({ ...data, aantalBouwlagen: Number(e.target.value) })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="bouwjaar">Bouwjaar *</Label>
          <Input
            id="bouwjaar"
            type="number"
            value={data.bouwjaar || ''}
            onChange={(e) => onChange({ ...data, bouwjaar: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="aanbouwen">Aanbouwen / bijgebouwen</Label>
        <Textarea
          id="aanbouwen"
          value={data.aanbouwen || ''}
          onChange={(e) => onChange({ ...data, aanbouwen: e.target.value })}
          rows={3}
        />
      </div>
    </div>
  )
}

function Stap4({ data, onChange }: { data: Partial<Huurgegevens>; onChange: (data: Partial<Huurgegevens>) => void }) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Switch
          id="verhuurd"
          checked={data.verhuurd}
          onCheckedChange={(checked) => onChange({ ...data, verhuurd: checked })}
        />
        <Label htmlFor="verhuurd">Object is verhuurd</Label>
      </div>

      {data.verhuurd && (
        <>
          <div className="grid gap-2">
            <Label htmlFor="huurder">Huurder *</Label>
            <Input
              id="huurder"
              value={data.huurder || ''}
              onChange={(e) => onChange({ ...data, huurder: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="huurprijsPerJaar">Huurprijs per jaar (€)</Label>
              <Input
                id="huurprijsPerJaar"
                type="number"
                value={data.huurprijsPerJaar || ''}
                onChange={(e) => onChange({ ...data, huurprijsPerJaar: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="markthuurPerJaar">Markthuur per jaar (€)</Label>
              <Input
                id="markthuurPerJaar"
                type="number"
                value={data.markthuurPerJaar || ''}
                onChange={(e) => onChange({ ...data, markthuurPerJaar: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="ingangsdatum">Ingangsdatum</Label>
              <Input
                id="ingangsdatum"
                type="date"
                value={data.ingangsdatum || ''}
                onChange={(e) => onChange({ ...data, ingangsdatum: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="einddatum">Einddatum</Label>
              <Input
                id="einddatum"
                type="date"
                value={data.einddatum || ''}
                onChange={(e) => onChange({ ...data, einddatum: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contracttype">Contracttype</Label>
            <Input
              id="contracttype"
              value={data.contracttype || ''}
              onChange={(e) => onChange({ ...data, contracttype: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="indexering">Indexering</Label>
            <Input
              id="indexering"
              value={data.indexering || ''}
              onChange={(e) => onChange({ ...data, indexering: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="leegstandsrisico">Leegstandsrisico</Label>
            <Textarea
              id="leegstandsrisico"
              value={data.leegstandsrisico || ''}
              onChange={(e) => onChange({ ...data, leegstandsrisico: e.target.value })}
              rows={2}
            />
          </div>
        </>
      )}
    </div>
  )
}

function Stap5({ data, onChange, suggesties, dismissedSuggesties, onSuggestieAccept, onSuggestieDismiss }: { data: Partial<JuridischeInfo>; onChange: (data: Partial<JuridischeInfo>) => void } & SuggestieProps) {
  const renderSuggestie = (veldNaam: string) => {
    if (!suggesties || !onSuggestieAccept || !onSuggestieDismiss) return null
    if (dismissedSuggesties?.has(veldNaam)) return null
    const s = suggesties.find((sg) => sg.veldNaam === veldNaam)
    if (!s) return null
    return (
      <SuggestieBanner
        suggestie={s.suggestie}
        bronAdres={s.bronAdres}
        bronScore={s.bronScore}
        onAccept={() => onSuggestieAccept(veldNaam, s.suggestie)}
        onDismiss={() => onSuggestieDismiss(veldNaam)}
      />
    )
  }
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="eigendomssituatie">Eigendomssituatie *</Label>
        {renderSuggestie('eigendomssituatie')}
        <Textarea
          id="eigendomssituatie"
          value={data.eigendomssituatie || ''}
          onChange={(e) => onChange({ ...data, eigendomssituatie: e.target.value })}
          rows={2}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="erfpacht">Erfpacht</Label>
        {renderSuggestie('erfpacht')}
        <Textarea
          id="erfpacht"
          value={data.erfpacht || ''}
          onChange={(e) => onChange({ ...data, erfpacht: e.target.value })}
          rows={2}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="zakelijkeRechten">Zakelijke rechten</Label>
        {renderSuggestie('zakelijkeRechten')}
        <Textarea
          id="zakelijkeRechten"
          value={data.zakelijkeRechten || ''}
          onChange={(e) => onChange({ ...data, zakelijkeRechten: e.target.value })}
          rows={2}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="kwalitatieveVerplichtingen">Kwalitatieve verplichtingen</Label>
        {renderSuggestie('kwalitatieveVerplichtingen')}
        <Textarea
          id="kwalitatieveVerplichtingen"
          value={data.kwalitatieveVerplichtingen || ''}
          onChange={(e) => onChange({ ...data, kwalitatieveVerplichtingen: e.target.value })}
          rows={2}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="bestemmingsplan">Bestemmingsplan *</Label>
        {renderSuggestie('bestemmingsplan')}
        <Textarea
          id="bestemmingsplan"
          value={data.bestemmingsplan || ''}
          onChange={(e) => onChange({ ...data, bestemmingsplan: e.target.value })}
          rows={2}
        />
      </div>
    </div>
  )
}

function Stap6({ data, onChange, suggesties, dismissedSuggesties, onSuggestieAccept, onSuggestieDismiss }: { data: Partial<TechnischeStaat>; onChange: (data: Partial<TechnischeStaat>) => void } & SuggestieProps) {
  const renderSuggestie = (veldNaam: string) => {
    if (!suggesties || !onSuggestieAccept || !onSuggestieDismiss) return null
    if (dismissedSuggesties?.has(veldNaam)) return null
    const s = suggesties.find((sg) => sg.veldNaam === veldNaam)
    if (!s) return null
    return (
      <SuggestieBanner
        suggestie={s.suggestie}
        bronAdres={s.bronAdres}
        bronScore={s.bronScore}
        onAccept={() => onSuggestieAccept(veldNaam, s.suggestie)}
        onDismiss={() => onSuggestieDismiss(veldNaam)}
      />
    )
  }
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="exterieurStaat">Exterieur staat *</Label>
          <Select
            value={data.exterieurStaat}
            onValueChange={(value) => onChange({ ...data, exterieurStaat: value as any })}
          >
            <SelectTrigger id="exterieurStaat">
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

        <div className="grid gap-2">
          <Label htmlFor="interieurStaat">Interieur staat *</Label>
          <Select
            value={data.interieurStaat}
            onValueChange={(value) => onChange({ ...data, interieurStaat: value as any })}
          >
            <SelectTrigger id="interieurStaat">
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
      </div>

      <div className="grid gap-2">
        <Label htmlFor="fundering">Fundering</Label>
        {renderSuggestie('fundering')}
        <Textarea
          id="fundering"
          value={data.fundering || ''}
          onChange={(e) => onChange({ ...data, fundering: e.target.value })}
          rows={2}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="dakbedekking">Dakbedekking</Label>
        {renderSuggestie('dakbedekking')}
        <Textarea
          id="dakbedekking"
          value={data.dakbedekking || ''}
          onChange={(e) => onChange({ ...data, dakbedekking: e.target.value })}
          rows={2}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="installaties">Installaties</Label>
        {renderSuggestie('installaties')}
        <Textarea
          id="installaties"
          value={data.installaties || ''}
          onChange={(e) => onChange({ ...data, installaties: e.target.value })}
          rows={2}
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="achterstalligOnderhoud"
          checked={data.achterstalligOnderhoud}
          onCheckedChange={(checked) => onChange({ ...data, achterstalligOnderhoud: checked })}
        />
        <Label htmlFor="achterstalligOnderhoud">Achterstallig onderhoud</Label>
      </div>

      {data.achterstalligOnderhoud && (
        <div className="grid gap-2">
          <Label htmlFor="achterstalligOnderhoudBeschrijving">Beschrijving achterstallig onderhoud</Label>
          {renderSuggestie('achterstalligOnderhoudBeschrijving')}
          <Textarea
            id="achterstalligOnderhoudBeschrijving"
            value={data.achterstalligOnderhoudBeschrijving || ''}
            onChange={(e) => onChange({ ...data, achterstalligOnderhoudBeschrijving: e.target.value })}
            rows={3}
          />
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="onderhoudskosten">Onderhoudskosten per jaar (€)</Label>
        <Input
          id="onderhoudskosten"
          type="number"
          value={data.onderhoudskosten || ''}
          onChange={(e) => onChange({ ...data, onderhoudskosten: Number(e.target.value) })}
        />
      </div>
    </div>
  )
}

function Stap7({ data, onChange, suggesties, dismissedSuggesties, onSuggestieAccept, onSuggestieDismiss }: { data: Partial<Vergunningen>; onChange: (data: Partial<Vergunningen>) => void } & SuggestieProps) {
  const renderSuggestie = (veldNaam: string) => {
    if (!suggesties || !onSuggestieAccept || !onSuggestieDismiss) return null
    if (dismissedSuggesties?.has(veldNaam)) return null
    const s = suggesties.find((sg) => sg.veldNaam === veldNaam)
    if (!s) return null
    return (
      <SuggestieBanner
        suggestie={s.suggestie}
        bronAdres={s.bronAdres}
        bronScore={s.bronScore}
        onAccept={() => onSuggestieAccept(veldNaam, s.suggestie)}
        onDismiss={() => onSuggestieDismiss(veldNaam)}
      />
    )
  }
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Switch
          id="omgevingsvergunning"
          checked={data.omgevingsvergunning}
          onCheckedChange={(checked) => onChange({ ...data, omgevingsvergunning: checked })}
        />
        <Label htmlFor="omgevingsvergunning">Omgevingsvergunning aanwezig</Label>
      </div>

      {data.omgevingsvergunning && (
        <div className="grid gap-2">
          <Label htmlFor="omgevingsvergunningNummer">Vergunningnummer</Label>
          <Input
            id="omgevingsvergunningNummer"
            value={data.omgevingsvergunningNummer || ''}
            onChange={(e) => onChange({ ...data, omgevingsvergunningNummer: e.target.value })}
          />
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="energielabel">Energielabel *</Label>
        <Select
          value={data.energielabel}
          onValueChange={(value) => onChange({ ...data, energielabel: value as any })}
        >
          <SelectTrigger id="energielabel">
            <SelectValue placeholder="Selecteer energielabel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="A++++">A++++</SelectItem>
            <SelectItem value="A+++">A+++</SelectItem>
            <SelectItem value="A++">A++</SelectItem>
            <SelectItem value="A+">A+</SelectItem>
            <SelectItem value="A">A</SelectItem>
            <SelectItem value="B">B</SelectItem>
            <SelectItem value="C">C</SelectItem>
            <SelectItem value="D">D</SelectItem>
            <SelectItem value="E">E</SelectItem>
            <SelectItem value="F">F</SelectItem>
            <SelectItem value="G">G</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="epcBengWaarde">EPC/BENG waarde</Label>
        <Input
          id="epcBengWaarde"
          value={data.epcBengWaarde || ''}
          onChange={(e) => onChange({ ...data, epcBengWaarde: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="asbest">Asbest</Label>
          <Select
            value={data.asbest}
            onValueChange={(value) => onChange({ ...data, asbest: value as any })}
          >
            <SelectTrigger id="asbest">
              <SelectValue placeholder="Selecteer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ja">Ja</SelectItem>
              <SelectItem value="nee">Nee</SelectItem>
              <SelectItem value="onbekend">Onbekend</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="bodemverontreiniging">Bodemverontreiniging</Label>
          <Select
            value={data.bodemverontreiniging}
            onValueChange={(value) => onChange({ ...data, bodemverontreiniging: value as any })}
          >
            <SelectTrigger id="bodemverontreiniging">
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

      <div className="grid gap-2">
        <Label htmlFor="toelichting">Toelichting</Label>
        {renderSuggestie('toelichting')}
        <Textarea
          id="toelichting"
          value={data.toelichting || ''}
          onChange={(e) => onChange({ ...data, toelichting: e.target.value })}
          rows={3}
        />
      </div>
    </div>
  )
}

function Stap8({ data, onChange }: { data: Partial<Waardering>; onChange: (data: Partial<Waardering>) => void }) {
  const addVergelijkingsobject = () => {
    const newObj = { adres: '', prijs: 0, datum: '' }
    onChange({
      ...data,
      vergelijkingsobjecten: [...(data.vergelijkingsobjecten || []), newObj],
    })
  }

  const removeVergelijkingsobject = (index: number) => {
    onChange({
      ...data,
      vergelijkingsobjecten: data.vergelijkingsobjecten?.filter((_, i) => i !== index) || [],
    })
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="methode">Waarderingsmethode *</Label>
        <Select
          value={data.methode}
          onValueChange={(value) => onChange({ ...data, methode: value as any })}
        >
          <SelectTrigger id="methode">
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

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="marktwaarde">Marktwaarde (€) *</Label>
          <Input
            id="marktwaarde"
            type="number"
            value={data.marktwaarde || ''}
            onChange={(e) => onChange({ ...data, marktwaarde: Number(e.target.value) })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="onderhandseVerkoopwaarde">Onderhandse verkoopwaarde (€)</Label>
          <Input
            id="onderhandseVerkoopwaarde"
            type="number"
            value={data.onderhandseVerkoopwaarde || ''}
            onChange={(e) => onChange({ ...data, onderhandseVerkoopwaarde: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="bar">BAR (%)</Label>
          <Input
            id="bar"
            type="number"
            step="0.1"
            value={data.bar || ''}
            onChange={(e) => onChange({ ...data, bar: Number(e.target.value) })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="nar">NAR (%)</Label>
          <Input
            id="nar"
            type="number"
            step="0.1"
            value={data.nar || ''}
            onChange={(e) => onChange({ ...data, nar: Number(e.target.value) })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="kapitalisatiefactor">Kapitalisatiefactor</Label>
          <Input
            id="kapitalisatiefactor"
            type="number"
            step="0.1"
            value={data.kapitalisatiefactor || ''}
            onChange={(e) => onChange({ ...data, kapitalisatiefactor: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>Vergelijkingsobjecten</Label>
          <Button size="sm" onClick={addVergelijkingsobject}>
            + Toevoegen
          </Button>
        </div>
        {(data.vergelijkingsobjecten || []).map((obj, index) => (
          <Card key={index} className="p-4">
            <div className="grid gap-2">
              <div className="grid gap-2">
                <Input
                  placeholder="Adres"
                  value={obj.adres}
                  onChange={(e) => {
                    const updated = [...(data.vergelijkingsobjecten || [])]
                    updated[index] = { ...obj, adres: e.target.value }
                    onChange({ ...data, vergelijkingsobjecten: updated })
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Prijs (€)"
                  type="number"
                  value={obj.prijs || ''}
                  onChange={(e) => {
                    const updated = [...(data.vergelijkingsobjecten || [])]
                    updated[index] = { ...obj, prijs: Number(e.target.value) }
                    onChange({ ...data, vergelijkingsobjecten: updated })
                  }}
                />
                <Input
                  placeholder="Datum"
                  type="date"
                  value={obj.datum}
                  onChange={(e) => {
                    const updated = [...(data.vergelijkingsobjecten || [])]
                    updated[index] = { ...obj, datum: e.target.value }
                    onChange({ ...data, vergelijkingsobjecten: updated })
                  }}
                />
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => removeVergelijkingsobject(index)}
              >
                Verwijderen
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function Stap9({ data, onChange, suggesties, dismissedSuggesties, onSuggestieAccept, onSuggestieDismiss }: { data: Partial<Aannames>; onChange: (data: Partial<Aannames>) => void } & SuggestieProps) {
  const renderSuggestie = (veldNaam: string) => {
    if (!suggesties || !onSuggestieAccept || !onSuggestieDismiss) return null
    if (dismissedSuggesties?.has(veldNaam)) return null
    const s = suggesties.find((sg) => sg.veldNaam === veldNaam)
    if (!s) return null
    return (
      <SuggestieBanner
        suggestie={s.suggestie}
        bronAdres={s.bronAdres}
        bronScore={s.bronScore}
        onAccept={() => onSuggestieAccept(veldNaam, s.suggestie)}
        onDismiss={() => onSuggestieDismiss(veldNaam)}
      />
    )
  }
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="aannames">Aannames</Label>
        {renderSuggestie('aannames')}
        <Textarea
          id="aannames"
          value={data.aannames || ''}
          onChange={(e) => onChange({ ...data, aannames: e.target.value })}
          rows={4}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="voorbehouden">Voorbehouden</Label>
        {renderSuggestie('voorbehouden')}
        <Textarea
          id="voorbehouden"
          value={data.voorbehouden || ''}
          onChange={(e) => onChange({ ...data, voorbehouden: e.target.value })}
          rows={4}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="bijzondereOmstandigheden">Bijzondere omstandigheden</Label>
        {renderSuggestie('bijzondereOmstandigheden')}
        <Textarea
          id="bijzondereOmstandigheden"
          value={data.bijzondereOmstandigheden || ''}
          onChange={(e) => onChange({ ...data, bijzondereOmstandigheden: e.target.value })}
          rows={4}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="interneNotities">Interne notities (niet zichtbaar in rapport)</Label>
        <Textarea
          id="interneNotities"
          value={data.interneNotities || ''}
          onChange={(e) => onChange({ ...data, interneNotities: e.target.value })}
          rows={4}
        />
      </div>
    </div>
  )
}

function Stap10({
  results,
  historischeRapporten,
  selectedReferenties,
  onToggleReferentie,
}: {
  results: any[]
  historischeRapporten: HistorischRapport[]
  selectedReferenties: string[]
  onToggleReferentie: (id: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">Vergelijkbare rapporten gevonden</h3>
        <p className="text-sm text-muted-foreground">
          Selecteer 1 tot 3 referentierapporten (geselecteerd: {selectedReferenties.length}/3)
        </p>
      </div>

      {results.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Geen vergelijkbare rapporten gevonden</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {results.slice(0, 5).map((result) => {
            const rapport = historischeRapporten.find((r) => r.id === result.rapportId)
            if (!rapport) return null

            const isSelected = selectedReferenties.includes(result.rapportId)
            const classificatieKleur =
              result.classificatie === 'uitstekend'
                ? 'bg-success/10 text-success border-success/30'
                : result.classificatie === 'goed'
                ? 'bg-warning/10 text-warning border-warning/30'
                : result.classificatie === 'matig'
                ? 'bg-accent/10 text-accent border-accent/30'
                : 'bg-destructive/10 text-destructive border-destructive/30'

            return (
              <Card
                key={result.rapportId}
                className={`cursor-pointer transition-all ${
                  isSelected ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => onToggleReferentie(result.rapportId)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">
                          {rapport.adres.straat} {rapport.adres.huisnummer}
                        </h4>
                        {isSelected && <Check className="text-primary" weight="bold" />}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Type:</span>{' '}
                          {rapport.typeObject}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Afstand:</span>{' '}
                          {result.afstandKm.toFixed(1)} km
                        </div>
                        <div>
                          <span className="text-muted-foreground">BVO:</span>{' '}
                          {formatOppervlakte(rapport.bvo)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Marktwaarde:</span>{' '}
                          {formatBedrag(rapport.marktwaarde)}
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Datum:</span>{' '}
                          {formatDatum(rapport.waardepeildatum)}
                        </div>
                      </div>
                    </div>

                    <div className={`px-3 py-2 rounded-lg text-center ${classificatieKleur}`}>
                      <div className="text-2xl font-bold">{result.totaalScore}</div>
                      <div className="text-xs uppercase">{result.classificatie}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
