import { useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { WizardFlow } from './components/WizardFlow'
import { RapportView } from './components/RapportView'
import { Instellingen } from './components/Instellingen'
import { Kennisbank } from './components/Kennisbank'
import { LoginPage } from './components/LoginPage'
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs'
import { Toaster } from './components/ui/sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './components/ui/dialog'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { Button } from './components/ui/button'
import { useAuth } from './context/AuthContext'
import { useDossiers } from './hooks/useDossiers'
import { useHistorischeRapporten } from './hooks/useHistorischeRapporten'
import { useSimilarityInstellingen } from './hooks/useSimilarityInstellingen'
import { useSimilarityFeedback } from './hooks/useSimilarityFeedback'
import type { Dossier, HistorischRapport } from './types'

type View = 'dashboard' | 'wizard' | 'rapport' | 'kennisbank' | 'instellingen'

function AppInner() {
  const { user, signOut } = useAuth()
  const { dossiers, addDossier, updateDossier, deleteDossier } = useDossiers()
  const { historischeRapporten, addRapport, deleteRapport, updateRapport, addRapporten } = useHistorischeRapporten()
  const { similarityInstellingen, updateInstellingen } = useSimilarityInstellingen()
  const { similarityFeedback } = useSimilarityFeedback()

  const [currentView, setCurrentView] = useState<View>('dashboard')
  const [activeDossierId, setActiveDossierId] = useState<string | null>(null)
  const [showNieuwDossierDialog, setShowNieuwDossierDialog] = useState(false)
  const [nieuwDossiernummer, setNieuwDossiernummer] = useState('')
  const [dossiernummerFout, setDossiernummerFout] = useState(false)
  const [wizardShouldSaveAndNavigate, setWizardShouldSaveAndNavigate] = useState(false)

  const activeDossier = activeDossierId
    ? (dossiers || []).find((d) => d.id === activeDossierId)
    : null

  const handleCreateDossier = () => {
    setNieuwDossiernummer('')
    setDossiernummerFout(false)
    setShowNieuwDossierDialog(true)
  }

  const handleConfirmCreateDossier = async () => {
    if (!nieuwDossiernummer.trim()) {
      setDossiernummerFout(true)
      return
    }

    const newDossier: Dossier = {
      id: crypto.randomUUID(),
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

    await addDossier(newDossier)
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

  const handleDeleteDossier = async (dossierId: string) => {
    await deleteDossier(dossierId)
    if (activeDossierId === dossierId) {
      setActiveDossierId(null)
      setCurrentView('dashboard')
    }
  }

  const handleDeleteHistorischRapport = async (id: string) => {
    await deleteRapport(id)
  }

  const handleUpdateHistorischRapport = async (rapport: HistorischRapport) => {
    await updateRapport(rapport)
  }

  const handleLogoClick = () => {
    if (currentView === 'wizard') {
      setWizardShouldSaveAndNavigate(true)
    } else {
      setCurrentView('dashboard')
    }
  }

  const handleWizardSavedAndNavigated = () => {
    setWizardShouldSaveAndNavigate(false)
    setCurrentView('dashboard')
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div
              className="cursor-pointer select-none hover:opacity-80 transition-opacity"
              onClick={handleLogoClick}
              role="button"
              aria-label="Naar dashboard"
            >
              <h1 className="text-2xl font-semibold text-foreground">
                Taxatieplatform
              </h1>
              <p className="text-sm text-muted-foreground">
                Intelligente Vastgoedwaardering
              </p>
            </div>
            <div className="flex items-center gap-4">
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
                  <TabsTrigger value="kennisbank">Kennisbank</TabsTrigger>
                  <TabsTrigger value="instellingen">Instellingen</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{user?.email}</span>
                <Button variant="outline" size="sm" onClick={signOut}>
                  Uitloggen
                </Button>
              </div>
            </div>
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
          <WizardFlow
            activeDossierId={activeDossierId}
            shouldSaveAndNavigateToDashboard={wizardShouldSaveAndNavigate}
            onSavedAndNavigated={handleWizardSavedAndNavigated}
          />
        )}

        {currentView === 'rapport' && activeDossier && (
          <RapportView onAfgerond={() => setCurrentView('dashboard')} />
        )}

        {currentView === 'kennisbank' && (
          <Kennisbank
            historischeRapporten={historischeRapporten || []}
            onAddRapport={addRapport}
            onDeleteRapport={handleDeleteHistorischRapport}
            onUpdateRapport={handleUpdateHistorischRapport}
          />
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
            historischeRapporten={historischeRapporten || []}
            onUpdateInstellingen={updateInstellingen}
            onSeedRapporten={addRapporten}
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

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Laden...</p>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return <AppInner />
}

export default App
