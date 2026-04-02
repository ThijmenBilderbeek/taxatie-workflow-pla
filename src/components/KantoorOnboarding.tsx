import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useKantoorContext } from '@/contexts/KantoorContext'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { toast } from 'sonner'
import { Building2, Users } from 'lucide-react'

function generateSlug(naam: string): string {
  return naam
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export function KantoorOnboarding() {
  const { refresh } = useKantoorContext()
  const [activeTab, setActiveTab] = useState<'aanmaken' | 'wachten'>('aanmaken')
  const [naam, setNaam] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleNaamChange = (value: string) => {
    setNaam(value)
    if (!slugManuallyEdited) {
      setSlug(generateSlug(value))
    }
  }

  const handleSlugChange = (value: string) => {
    setSlug(value)
    setSlugManuallyEdited(true)
  }

  const handleAanmaken = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!naam.trim() || !slug.trim()) return

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        toast.error('Niet ingelogd')
        return
      }

      const { data: kantoor, error: kantoorError } = await supabase
        .from('kantoren')
        .insert({ naam: naam.trim(), slug: slug.trim() })
        .select('id')
        .single()

      if (kantoorError) {
        if (kantoorError.code === '23505') {
          toast.error('Deze slug is al in gebruik. Kies een andere slug.')
        } else {
          toast.error('Fout bij aanmaken kantoor: ' + kantoorError.message)
        }
        return
      }

      const { error: memberError } = await supabase
        .from('kantoor_members')
        .insert({
          kantoor_id: kantoor.id,
          user_id: session.user.id,
          role: 'owner',
        })

      if (memberError) {
        toast.error('Fout bij koppelen aan kantoor: ' + memberError.message)
        return
      }

      toast.success(`Kantoor "${naam}" aangemaakt!`)
      refresh()
    } catch {
      toast.error('Er is een onbekende fout opgetreden')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <img src="/valyze_logo2.svg" alt="Valyze" className="w-48 mb-8" />

      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-semibold">Welkom bij Valyze</h1>
          <p className="text-muted-foreground mt-2">
            Om de app te gebruiken, moet je aan een kantoor gekoppeld zijn.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setActiveTab('aanmaken')}
            className={`p-4 rounded-lg border-2 text-left transition-colors ${
              activeTab === 'aanmaken'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <Building2 className="h-6 w-6 mb-2 text-primary" />
            <h3 className="font-semibold">Nieuw kantoor aanmaken</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Maak een nieuw kantoor aan en nodig collega's uit
            </p>
          </button>

          <button
            onClick={() => setActiveTab('wachten')}
            className={`p-4 rounded-lg border-2 text-left transition-colors ${
              activeTab === 'wachten'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <Users className="h-6 w-6 mb-2 text-primary" />
            <h3 className="font-semibold">Wachten op uitnodiging</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Word uitgenodigd door een collega die al een kantoor heeft
            </p>
          </button>
        </div>

        {activeTab === 'aanmaken' && (
          <Card>
            <CardHeader>
              <CardTitle>Nieuw kantoor aanmaken</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAanmaken} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="kantoornaam">Kantoornaam</Label>
                  <Input
                    id="kantoornaam"
                    placeholder="bijv. Makelaardij Amsterdam"
                    value={naam}
                    onChange={(e) => handleNaamChange(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kantoorslug">Slug</Label>
                  <Input
                    id="kantoorslug"
                    placeholder="bijv. makelaardij-amsterdam"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Unieke identificatie voor je kantoor (alleen kleine letters, cijfers en koppeltekens)
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={loading || !naam.trim() || !slug.trim()}>
                  {loading ? 'Bezig...' : 'Kantoor aanmaken'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {activeTab === 'wachten' && (
          <Card>
            <CardHeader>
              <CardTitle>Wachten op uitnodiging</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Je bent nog niet aan een kantoor gekoppeld. Vraag een collega om je uit te nodigen via je e-mailadres.
              </p>
              <Button variant="outline" className="w-full" onClick={refresh}>
                Opnieuw controleren
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
