import { useState, useEffect } from 'react'
import { useDossiers } from '../hooks/useDossiers'
import { useHistorischeRapporten } from '../hooks/useHistorischeRapporten'
import { useSimilarityInstellingen } from '../hooks/useSimilarityInstellingen'
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
  shouldSaveAndNavigateToDashboard,
  onSavedAndNavigated,
}: {
  activeDossierId: string
  shouldSaveAndNavigateToDashboard?: boolean
  onSavedAndNavigated?: () => void
}) {
  const { dossiers, updateDossier } = useDossiers()
  const { historischeRapporten } = useHistorischeRapporten()
  const { similarityInstellingen } = useSimilarityInstellingen()

  const activeDossier = (dossiers || []).find(d => d.id === activeDossierId)
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
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (activeDossier && !initialized) {
      setInitialized(true)
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
  }, [activeDossier?.id, initialized])

  // Reset initialized when switching to a different dossier
  useEffect(() => {
    setInitialized(false)
  }, [activeDossierId])

  const buildDossierPayload = (overrides: Partial<Dossier> = {}): Dossier => {
    const base: Dossier = activeDossier ?? {
      id: activeDossierId,
      dossiernummer: '',
      versieNummer: 1,
      isActualisatie: false,
      status: 'concept',
      similarityResults: [],
      geselecteerdeReferenties: [],
      rapportSecties: {},
      huidigeStap: currentStep,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    return {
      ...base,
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
      updatedAt: new Date().toISOString(),
      ...overrides,
    }
  }

  const saveAndNavigateTo = (targetStep: number) => {
    updateDossier(buildDossierPayload({ huidigeStap: targetStep }))
    setCurrentStep(targetStep)
  }

  const saveCurrentData = () => {
    updateDossier(buildDossierPayload({ huidigeStap: currentStep }))
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
    const updatedDossier = buildDossierPayload()

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

    updateDossier({
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