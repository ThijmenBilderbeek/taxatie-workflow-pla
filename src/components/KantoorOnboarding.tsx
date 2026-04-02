import { useKantoorContext } from '@/contexts/KantoorContext'
import { Button } from './ui/button'

export function KantoorOnboarding() {
  const { refresh } = useKantoorContext()

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <img src="/valyze_logo2.svg" alt="Valyze" className="w-48 mb-8" />
      <div className="text-center space-y-4 max-w-sm">
        <h1 className="text-2xl font-semibold">Nog geen kantoor gekoppeld</h1>
        <p className="text-muted-foreground">
          Neem contact op met de beheerder om toegang te krijgen.
        </p>
        <Button variant="outline" onClick={refresh}>
          Opnieuw controleren
        </Button>
      </div>
    </div>
  )
}
