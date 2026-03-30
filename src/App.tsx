import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { useDossiers } from './hooks/useDossiers'
import { useHistorischeRapporten } from './hooks/useHistorischeRapporten'
import { useSimilarityInstellingen } from './hooks/useSimilarityInstellingen'
import { Dashboard } from './components/Dashboard'
import { WizardFlow } from './components/WizardFlow'
import { RapportView } from './components/RapportView'
import { Instellingen } from './components/Instellingen'
import { Kennisbank } from './components/Kennisbank'
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs'
import { Toaster } from './components/ui/sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './components/ui/dialog'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { Button } from './components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import type { Dossier, SimilarityFeedback } from './types'

type View = 'dashboard' | 'wizard' | 'rapport' | 'kennisbank' | 'instellingen'

function LoginForm({ onSignIn, onSignUp }: {
  onSignIn: (email: string, password: string) => Promise<{ error: unknown }>
  onSignUp: (email: string, password: string) => Promise<{ error: unknown }>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const result = isSignUp
      ? await onSignUp(email, password)
      : await onSignIn(email, password)
    if (result.error) {
      const err = result.error
      setError(err instanceof Error ? err.message : String(err))
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center">
      <img src="/valyze_logo_transparent.svg" alt="Valyze" className="w-48 mb-8" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isSignUp ? 'Account aanmaken' : 'Inloggen'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mailadres</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Wachtwoord</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Bezig...' : isSignUp ? 'Account aanmaken' : 'Inloggen'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp ? 'Al een account? Inloggen' : 'Nog geen account? Aanmaken'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function App() {
  const { user, loading: authLoading, signIn, signUp, signOut } = useAuth()
  const { dossiers, createDossier, updateDossier, deleteDossier } = useDossiers()
  const { rapporten: historischeRapporten, addRapport, updateRapport, deleteRapport } = useHistorischeRapporten()
  const { instellingen: similarityInstellingen, updateInstellingen: setSimilarityInstellingen } = useSimilarityInstellingen()
  const [similarityFeedback, setSimilarityFeedback] = useState<SimilarityFeedback[]>([])

  const [currentView, setCurrentView] = useState<View>('dashboard')
  const [activeDossierId, setActiveDossierId] = useState<string | null>(null)
  const [showNieuwDossierDialog, setShowNieuwDossierDialog] = useState(false)
  const [nieuwDossiernummer, setNieuwDossiernummer] = useState('')
  const [dossiernummerFout, setDossiernummerFout] = useState(false)
  const [wizardShouldSaveAndNavigate, setWizardShouldSaveAndNavigate] = useState(false)

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Laden...</p>
      </div>
    )
  }

  if (!user) {
    return <LoginForm onSignIn={signIn} onSignUp={signUp} />
  }

  const activeDossier = activeDossierId
    ? dossiers.find((d) => d.id === activeDossierId)
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

    await createDossier(newDossier)
    setActiveDossierId(newDossier.id)
    setShowNieuwDossierDialog(false)
    setCurrentView('wizard')
  }

  const handleOpenDossier = (dossierId: string) => {
    setActiveDossierId(dossierId)
    const dossier = dossiers.find((d) => d.id === dossierId)
    if (dossier) {
      if (Object.keys(dossier.rapportSecties).length > 0) {
        setCurrentView('rapport')
      } else {
        setCurrentView('wizard')
      }
    }
  }

  const handleDeleteDossier = (dossierId: string) => {
    deleteDossier(dossierId)
    if (activeDossierId === dossierId) {
      setActiveDossierId(null)
      setCurrentView('dashboard')
    }
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
              <Button variant="outline" size="sm" onClick={signOut}>
                Uitloggen
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {currentView === 'dashboard' && (
          <Dashboard
            dossiers={dossiers}
            historischeRapporten={historischeRapporten}
            onCreateDossier={handleCreateDossier}
            onOpenDossier={handleOpenDossier}
            onDeleteDossier={handleDeleteDossier}
          />
        )}

        {currentView === 'wizard' && activeDossierId && (
          activeDossier ? (
            <WizardFlow
              activeDossierId={activeDossierId}
              dossiers={dossiers}
              historischeRapporten={historischeRapporten}
              similarityInstellingen={similarityInstellingen}
              onUpdateDossier={updateDossier}
              shouldSaveAndNavigateToDashboard={wizardShouldSaveAndNavigate}
              onSavedAndNavigated={handleWizardSavedAndNavigated}
            />
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Dossier laden...</p>
            </div>
          )
        )}

        {currentView === 'rapport' && activeDossier && activeDossierId && (
          <RapportView
            activeDossierId={activeDossierId}
            dossiers={dossiers}
            historischeRapporten={historischeRapporten}
            similarityFeedback={similarityFeedback}
            onUpdateDossier={updateDossier}
            onAddHistorischRapport={addRapport}
            onAddSimilarityFeedback={(fb) => setSimilarityFeedback((c) => [...c, fb])}
            onAfgerond={() => setCurrentView('dashboard')}
          />
        )}

        {currentView === 'kennisbank' && (
          <Kennisbank
            historischeRapporten={historischeRapporten}
            onAddRapport={addRapport}
            onDeleteRapport={deleteRapport}
            onUpdateRapport={updateRapport}
          />
        )}

        {currentView === 'instellingen' && (
          <Instellingen
            instellingen={similarityInstellingen}
            feedback={similarityFeedback}
            historischeRapporten={historischeRapporten}
            onUpdateInstellingen={setSimilarityInstellingen}
            onSeedRapporten={(nieuweRapporten) =>
              nieuweRapporten.forEach(addRapport)
            }
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
