import { useState } from 'react'
import { useKV } from '@github/spark/hooks'
import { Dashboard } from './components/Dashboard'
import { WizardFlow } from './components/WizardFlow'
import { RapportView } from './components/RapportView'
import { Instellingen } from './components/Instellingen'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import { Toaster } from './components/ui/sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './components/ui/dialog'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { Button } from './components/ui/button'
import type { Dossier, HistorischRapport, SimilarityInstellingen, SimilarityFeedback } from './types'

type View = 'dashboard' | 'wizard' | 'rapport' | 'instellingen'

function App() {
  const [dossiers, setDossiers] = useKV<Dossier[]>('dossiers', [])
  const [historischeRapporten] = useKV<HistorischRapport[]>('historische-rapporten', [])
  const [similarityInstellingen, setSimilarityInstellingen] = useKV<SimilarityInstellingen>(
    'similarity-instellingen',
    {
      gewichten: {
        afstand: 30,
        typeObject: 25,
        oppervlakte: 20,
        ouderheidRapport: 15,
        gebruiksdoel: 10,
      },
    }
  )
  const [similarityFeedback, setSimilarityFeedback] = useKV<SimilarityFeedback[]>(
    'similarity-feedback',
    []
  )

  const [currentView, setCurrentView] = useState<View>('dashboard')
  const [activeDossierId, setActiveDossierId] = useState<string | null>(null)
  const [showNieuwDossierDialog, setShowNieuwDossierDialog] = useState(false)
  const [nieuwDossiernummer, setNieuwDossiernummer] = useState('')
  const [dossiernummerFout, setDossiernummerFout] = useState(false)

  const activeDossier = activeDossierId
    ? (dossiers || []).find((d) => d.id === activeDossierId)
    : null

  const handleCreateDossier = () => {
    setNieuwDossiernummer('')
    setDossiernummerFout(false)
    setShowNieuwDossierDialog(true)
  }

  const handleConfirmCreateDossier = () => {
    if (!nieuwDossiernummer.trim()) {
      setDossiernummerFout(true)
      return
    }

    const newDossier: Dossier = {
      id: `doss-${Date.now()}`,
      dossiernummer: nieuwDossiernummer.trim(),
      versieNummer: 1,
      isActualisatie: false,
      status: 'concept',
      similarityResults: [],
      geselecteerdeReferenties: [],
      rapportSecties: {},
      huidigeStap: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setDossiers((current) => [...(current || []), newDossier])
    setActiveDossierId(newDossier.id)
    setShowNieuwDossierDialog(false)
    setCurrentView('wizard')
  }

  const handleOpenDossier = (dossierId: string) => {
    setActiveDossierId(dossierId)
    const dossier = (dossiers || []).find((d) => d.id === dossierId)
    if (dossier) {
      if (Object.keys(dossier.rapportSecties).length > 0) {
        setCurrentView('rapport')
      } else {
        setCurrentView('wizard')
      }
    }
  }

  const handleUpdateDossier = (updatedDossier: Dossier) => {
    setDossiers((current) =>
      (current || []).map((d) => (d.id === updatedDossier.id ? updatedDossier : d))
    )
  }

  const handleDeleteDossier = (dossierId: string) => {
    setDossiers((current) => (current || []).filter((d) => d.id !== dossierId))
    if (activeDossierId === dossierId) {
      setActiveDossierId(null)
      setCurrentView('dashboard')
    }
  }

  const handleNavigate = (view: View, dossierId?: string) => {
    setCurrentView(view)
    if (dossierId) {
      setActiveDossierId(dossierId)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">
                Taxatieplatform
              </h1>
              <p className="text-sm text-muted-foreground">
                Intelligente Vastgoedwaardering
              </p>
            </div>
            <Tabs
              value={currentView}
              onValueChange={(v) => setCurrentView(v as View)}
            >
              <TabsList>
                <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                <TabsTrigger value="wizard" disabled={!activeDossier}>
                  Wizard
                </TabsTrigger>
                <TabsTrigger value="rapport" disabled={!activeDossier}>
                  Rapport
                </TabsTrigger>
                <TabsTrigger value="instellingen">Instellingen</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {currentView === 'dashboard' && (
          <Dashboard
            dossiers={dossiers || []}
            historischeRapporten={historischeRapporten || []}
            onCreateDossier={handleCreateDossier}
            onOpenDossier={handleOpenDossier}
            onDeleteDossier={handleDeleteDossier}
          />
        )}

        {currentView === 'wizard' && activeDossier && activeDossierId && (
          <WizardFlow activeDossierId={activeDossierId} />
        )}

        {currentView === 'rapport' && activeDossier && (
          <RapportView />
        )}

        {currentView === 'instellingen' && (
          <Instellingen
            instellingen={similarityInstellingen || {
              gewichten: {
                afstand: 30,
                typeObject: 25,
                oppervlakte: 20,
                ouderheidRapport: 15,
                gebruiksdoel: 10,
              },
            }}
            feedback={similarityFeedback || []}
            onUpdateInstellingen={setSimilarityInstellingen}
          />
        )}
      </main>

      <Dialog open={showNieuwDossierDialog} onOpenChange={setShowNieuwDossierDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nieuw dossier aanmaken</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="dossiernummer">Dossiernummer</Label>
              <Input
                id="dossiernummer"
                placeholder="bijv. T260305"
                value={nieuwDossiernummer}
                onChange={(e) => {
                  setNieuwDossiernummer(e.target.value)
                  if (e.target.value.trim()) setDossiernummerFout(false)
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmCreateDossier()}
              />
              {dossiernummerFout && (
                <p className="text-sm text-destructive">Dossiernummer mag niet leeg zijn.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNieuwDossierDialog(false)}>
              Annuleren
            </Button>
            <Button onClick={handleConfirmCreateDossier}>Aanmaken</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  )
}

export default App
