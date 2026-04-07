import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Slider } from './ui/slider'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { toast } from 'sonner'
import type { SimilarityInstellingen, SimilarityFeedback, HistorischRapport } from '../types'
import { RotateCcw } from 'lucide-react'
import { DEFAULT_GEWICHTEN } from '../lib/similarity'

interface InstellingenProps {
  instellingen: SimilarityInstellingen
  feedback: SimilarityFeedback[]
  historischeRapporten: HistorischRapport[]
  onUpdateInstellingen: (instellingen: SimilarityInstellingen) => void
  onSeedRapporten: (rapporten: HistorischRapport[]) => void
  onNavigateToAIUsage: () => void
}

const SEED_RAPPORTEN: HistorischRapport[] = [
  {
    id: 'seed-001',
    adres: { straat: 'Herengracht', huisnummer: '182', postcode: '1016BN', plaats: 'Amsterdam' },
    coordinaten: { lat: 52.3726, lng: 4.8920 },
    typeObject: 'kantoor',
    gebruiksdoel: 'eigenaar_gebruiker',
    bvo: 850,
    marktwaarde: 3200000,
    bar: 6.5,
    waardepeildatum: '2024-06-01',
    rapportTeksten: {},
    wizardData: {},
  },
  {
    id: 'seed-002',
    adres: { straat: 'Keizersgracht', huisnummer: '452', postcode: '1017EG', plaats: 'Amsterdam' },
    coordinaten: { lat: 52.3678, lng: 4.8851 },
    typeObject: 'kantoor',
    gebruiksdoel: 'verhuurd_belegging',
    bvo: 1200,
    marktwaarde: 5800000,
    bar: 5.8,
    nar: 5.2,
    waardepeildatum: '2024-03-15',
    rapportTeksten: {},
    wizardData: {},
  },
  {
    id: 'seed-003',
    adres: { straat: 'Coolsingel', huisnummer: '104', postcode: '3011AG', plaats: 'Rotterdam' },
    coordinaten: { lat: 51.9225, lng: 4.4792 },
    typeObject: 'kantoor',
    gebruiksdoel: 'verhuurd_belegging',
    bvo: 2400,
    marktwaarde: 8500000,
    bar: 7.2,
    nar: 6.8,
    waardepeildatum: '2023-11-01',
    rapportTeksten: {},
    wizardData: {},
  },
  {
    id: 'seed-004',
    adres: { straat: 'Stationsplein', huisnummer: '45', postcode: '3511ED', plaats: 'Utrecht' },
    coordinaten: { lat: 52.0894, lng: 5.1119 },
    typeObject: 'kantoor',
    gebruiksdoel: 'eigenaar_gebruiker',
    bvo: 950,
    marktwaarde: 3600000,
    bar: 6.8,
    waardepeildatum: '2024-01-20',
    rapportTeksten: {},
    wizardData: {},
  },
  {
    id: 'seed-005',
    adres: { straat: 'Molenstraat', huisnummer: '18', postcode: '2513BH', plaats: 'Den Haag' },
    coordinaten: { lat: 52.0773, lng: 4.3144 },
    typeObject: 'bedrijfshal',
    gebruiksdoel: 'eigenaar_gebruiker',
    bvo: 3500,
    marktwaarde: 4200000,
    bar: 8.5,
    waardepeildatum: '2024-02-10',
    rapportTeksten: {},
    wizardData: {},
  },
  {
    id: 'seed-006',
    adres: { straat: 'Antareslaan', huisnummer: '30', postcode: '5232JE', plaats: 'Den Bosch' },
    coordinaten: { lat: 51.7018, lng: 5.3122 },
    typeObject: 'bedrijfscomplex',
    gebruiksdoel: 'verhuurd_belegging',
    bvo: 5200,
    marktwaarde: 7800000,
    bar: 7.8,
    nar: 7.1,
    waardepeildatum: '2023-09-01',
    rapportTeksten: {},
    wizardData: {},
  },
  {
    id: 'seed-007',
    adres: { straat: 'Lange Viestraat', huisnummer: '2B', postcode: '3511BK', plaats: 'Utrecht' },
    coordinaten: { lat: 52.0915, lng: 5.1145 },
    typeObject: 'winkel',
    gebruiksdoel: 'verhuurd_belegging',
    bvo: 420,
    marktwaarde: 1950000,
    bar: 5.5,
    nar: 5.0,
    waardepeildatum: '2024-04-01',
    rapportTeksten: {},
    wizardData: {},
  },
  {
    id: 'seed-008',
    adres: { straat: 'Blaak', huisnummer: '31', postcode: '3011GA', plaats: 'Rotterdam' },
    coordinaten: { lat: 51.9198, lng: 4.4887 },
    typeObject: 'kantoor',
    gebruiksdoel: 'verhuurd_belegging',
    bvo: 1800,
    marktwaarde: 6200000,
    bar: 6.9,
    nar: 6.4,
    waardepeildatum: '2023-12-15',
    rapportTeksten: {},
    wizardData: {},
  },
  {
    id: 'seed-009',
    adres: { straat: 'Transistorstraat', huisnummer: '71', postcode: '1322CK', plaats: 'Almere' },
    coordinaten: { lat: 52.3702, lng: 5.2374 },
    typeObject: 'bedrijfshal',
    gebruiksdoel: 'eigenaar_gebruiker',
    bvo: 6800,
    marktwaarde: 5400000,
    bar: 9.2,
    waardepeildatum: '2024-05-01',
    rapportTeksten: {},
    wizardData: {},
  },
  {
    id: 'seed-010',
    adres: { straat: 'Insulindelaan', huisnummer: '115', postcode: '5642CV', plaats: 'Eindhoven' },
    coordinaten: { lat: 51.4416, lng: 5.4697 },
    typeObject: 'bedrijfscomplex',
    gebruiksdoel: 'eigenaar_gebruiker',
    bvo: 4100,
    marktwaarde: 6100000,
    bar: 8.1,
    waardepeildatum: '2024-03-01',
    rapportTeksten: {},
    wizardData: {},
  },
]

export function Instellingen({
  instellingen,
  feedback,
  historischeRapporten,
  onUpdateInstellingen,
  onSeedRapporten,
  onNavigateToAIUsage,
}: InstellingenProps) {
  const [showSeedConfirm, setShowSeedConfirm] = useState(false)

  const handleWeightChange = (key: keyof SimilarityInstellingen['gewichten'], value: number) => {
    const newGewichten = { ...instellingen.gewichten }
    newGewichten[key] = value

    const totaal = Object.values(newGewichten).reduce((sum, v) => sum + v, 0)
    const factor = 100 / totaal

    const normalized = {
      afstand: Math.round(newGewichten.afstand * factor),
      typeObject: Math.round(newGewichten.typeObject * factor),
      oppervlakte: Math.round(newGewichten.oppervlakte * factor),
      ouderheidRapport: Math.round(newGewichten.ouderheidRapport * factor),
      gebruiksdoel: Math.round(newGewichten.gebruiksdoel * factor),
    }

    onUpdateInstellingen({ gewichten: normalized })
  }

  const handleReset = () => {
    onUpdateInstellingen({ gewichten: DEFAULT_GEWICHTEN })
  }

  const handleSeedRapporten = () => {
    if (historischeRapporten.length > 0) {
      setShowSeedConfirm(true)
    } else {
      onSeedRapporten(SEED_RAPPORTEN)
      toast.success('10 voorbeeldrapporten toegevoegd aan de kennisbank')
    }
  }

  const handleConfirmSeed = () => {
    setShowSeedConfirm(false)
    onSeedRapporten(SEED_RAPPORTEN)
    toast.success('10 voorbeeldrapporten toegevoegd aan de kennisbank')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-semibold">Similarity Instellingen</h2>
          <p className="text-muted-foreground">
            Pas gewichten aan voor de similarity berekening
          </p>
        </div>
        <Button onClick={handleReset} variant="outline" className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset naar standaard
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gewichten Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Afstand</label>
                <span className="mono text-sm text-muted-foreground">
                  {instellingen.gewichten.afstand}%
                </span>
              </div>
              <Slider
                value={[instellingen.gewichten.afstand]}
                onValueChange={([value]) => handleWeightChange('afstand', value)}
                max={100}
                step={1}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Type Object</label>
                <span className="mono text-sm text-muted-foreground">
                  {instellingen.gewichten.typeObject}%
                </span>
              </div>
              <Slider
                value={[instellingen.gewichten.typeObject]}
                onValueChange={([value]) => handleWeightChange('typeObject', value)}
                max={100}
                step={1}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Oppervlakte</label>
                <span className="mono text-sm text-muted-foreground">
                  {instellingen.gewichten.oppervlakte}%
                </span>
              </div>
              <Slider
                value={[instellingen.gewichten.oppervlakte]}
                onValueChange={([value]) => handleWeightChange('oppervlakte', value)}
                max={100}
                step={1}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Ouderheid Rapport</label>
                <span className="mono text-sm text-muted-foreground">
                  {instellingen.gewichten.ouderheidRapport}%
                </span>
              </div>
              <Slider
                value={[instellingen.gewichten.ouderheidRapport]}
                onValueChange={([value]) => handleWeightChange('ouderheidRapport', value)}
                max={100}
                step={1}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Gebruiksdoel</label>
                <span className="mono text-sm text-muted-foreground">
                  {instellingen.gewichten.gebruiksdoel}%
                </span>
              </div>
              <Slider
                value={[instellingen.gewichten.gebruiksdoel]}
                onValueChange={([value]) => handleWeightChange('gebruiksdoel', value)}
                max={100}
                step={1}
              />
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>Totaal</span>
                <span className="mono">
                  {Object.values(instellingen.gewichten).reduce((s, v) => s + v, 0)}%
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feedback Overzicht</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {feedback.length === 0
              ? 'Nog geen feedback ontvangen'
              : `${feedback.length} feedback items verzameld`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kennisbank testdata</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Laad 10 realistische voorbeeldrapporten in de kennisbank zodat de similarity engine
            direct bruikbaar is voor tests.
          </p>
          <div className="flex items-center gap-3">
            <Button onClick={handleSeedRapporten}>
              Laad 10 voorbeeldrapporten
            </Button>
            {historischeRapporten.length > 0 && (
              <span className="text-sm text-muted-foreground">
                Huidige kennisbank: {historischeRapporten.length} rapport(en)
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Gebruik</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Bekijk het AI gebruik dashboard met OpenAI kostenmonitoring per gebruiker en dossier.
          </p>
          <Button onClick={onNavigateToAIUsage}>
            Bekijk AI Gebruik Dashboard
          </Button>
        </CardContent>
      </Card>

      <Dialog open={showSeedConfirm} onOpenChange={setShowSeedConfirm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Testdata toevoegen</DialogTitle>
          </DialogHeader>
          <p>
            Er zijn al <strong>{historischeRapporten.length}</strong> rapport(en) in de kennisbank.
            Wil je de testdata <strong>toevoegen</strong> (niet vervangen)?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSeedConfirm(false)}>
              Annuleren
            </Button>
            <Button onClick={handleConfirmSeed}>
              Toevoegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
