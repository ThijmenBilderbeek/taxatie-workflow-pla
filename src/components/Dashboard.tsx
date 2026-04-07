import { useState } from 'react'
import { FileText, Plus, Building, TrendingUp, Filter } from 'lucide-react'
import { Trash } from '@phosphor-icons/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Checkbox } from './ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import type { Dossier, HistorischRapport } from '../types'
import { formatDatum, formatBedrag } from '../lib/fluxFormatter'
import { cn } from '../lib/utils'

interface DashboardProps {
  dossiers: Dossier[]
  historischeRapporten: HistorischRapport[]
  onCreateDossier: () => void
  onOpenDossier: (id: string) => void
  onDeleteDossier: (id: string) => void
}

export function Dashboard({
  dossiers,
  historischeRapporten,
  onCreateDossier,
  onOpenDossier,
  onDeleteDossier,
}: DashboardProps) {
  const [selectieModus, setSelectieModus] = useState(false)
  const [geselecteerdeIds, setGeselecteerdeIds] = useState<Set<string>>(new Set())
  const [toonBevestigDialog, setToonBevestigDialog] = useState(false)

  const toggleSelectie = (id: string) => {
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

  const annuleerSelectie = () => {
    setSelectieModus(false)
    setGeselecteerdeIds(new Set())
  }

  const bevestigVerwijderen = () => {
    geselecteerdeIds.forEach((id) => onDeleteDossier(id))
    setGeselecteerdeIds(new Set())
    setSelectieModus(false)
    setToonBevestigDialog(false)
  }

  const getStatusBadge = (status: Dossier['status']) => {
    const variants = {
      concept: 'bg-muted text-muted-foreground',
      in_behandeling: 'bg-accent text-accent-foreground',
      afgerond: 'bg-success text-white',
    }
    const labels = {
      concept: 'Concept',
      in_behandeling: 'In behandeling',
      afgerond: 'Afgerond',
    }
    return (
      <Badge className={variants[status]}>{labels[status]}</Badge>
    )
  }

  const stats = {
    totaalDossiers: dossiers.length,
    inBehandeling: dossiers.filter((d) => d.status === 'in_behandeling').length,
    afgerond: dossiers.filter((d) => d.status === 'afgerond').length,
    totaalRapporten: historischeRapporten.length,
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-semibold">Dashboard</h2>
          <p className="text-muted-foreground">Overzicht van uw taxaties</p>
        </div>
        <div className="flex items-center gap-2">
          {selectieModus ? (
            <>
              <Button
                variant="destructive"
                size="lg"
                className="gap-2"
                disabled={geselecteerdeIds.size === 0}
                onClick={() => setToonBevestigDialog(true)}
              >
                <Trash className="h-5 w-5" />
                Bevestig verwijderen ({geselecteerdeIds.size})
              </Button>
              <Button variant="outline" size="lg" onClick={annuleerSelectie}>
                Annuleren
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="destructive"
                size="lg"
                className="gap-2"
                onClick={() => setSelectieModus(true)}
              >
                <Trash className="h-5 w-5" />
                Verwijderen
              </Button>
              <Button onClick={onCreateDossier} size="lg" className="gap-2">
                <Plus className="h-5 w-5" />
                Nieuw Dossier
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Totaal Dossiers
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totaalDossiers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              In Behandeling
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.inBehandeling}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Afgerond</CardTitle>
            <Building className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.afgerond}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Kennisbank</CardTitle>
            <Filter className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totaalRapporten}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Historische rapporten
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-xl font-semibold mb-4">Recente Dossiers</h3>
        {dossiers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Geen dossiers</h3>
              <p className="text-muted-foreground text-center mb-6">
                Maak uw eerste taxatiedossier aan om te beginnen
              </p>
              <Button onClick={onCreateDossier}>
                <Plus className="h-4 w-4 mr-2" />
                Nieuw Dossier
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dossiers.map((dossier) => {
              const isGeselecteerd = geselecteerdeIds.has(dossier.id)
              return (
              <Card
                key={dossier.id}
                className={cn('cursor-pointer hover:shadow-lg transition-shadow', selectieModus && isGeselecteerd && 'ring-2 ring-destructive')}
                onClick={() => {
                  if (selectieModus) {
                    toggleSelectie(dossier.id)
                  } else {
                    onOpenDossier(dossier.id)
                  }
                }}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    {selectieModus && (
                      <Checkbox
                        checked={isGeselecteerd}
                        onCheckedChange={() => toggleSelectie(dossier.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 mr-2"
                      />
                    )}
                    <div className="flex-1">
                      <CardTitle className="text-base">
                        {dossier.stap1?.objectnaam || 'Naamloos object'}
                      </CardTitle>
                      <CardDescription className="mono">
                        {dossier.dossiernummer}
                      </CardDescription>
                    </div>
                    {getStatusBadge(dossier.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {dossier.stap2 && (
                      <div className="text-muted-foreground">
                        {dossier.stap2.straatnaam} {dossier.stap2.huisnummer},{' '}
                        {dossier.stap2.plaats}
                      </div>
                    )}
                    {dossier.stap1 && (
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4 text-muted-foreground" />
                        <span className="capitalize">
                          {dossier.stap1.typeObject}
                        </span>
                      </div>
                    )}
                    {dossier.stap8 && (
                      <div className="font-semibold text-primary">
                        {formatBedrag(dossier.stap8.marktwaarde)}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground pt-2 border-t">
                      Bijgewerkt: {formatDatum(dossier.updatedAt)}
                    </div>
                  </div>
                </CardContent>
              </Card>
              )
            })}
          </div>
        )}
      </div>

      <Dialog
        open={toonBevestigDialog}
        onOpenChange={(open) => !open && setToonBevestigDialog(false)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Dossier(s) verwijderen?</DialogTitle>
            <DialogDescription>
              Weet je zeker dat je {geselecteerdeIds.size} dossier{geselecteerdeIds.size !== 1 ? 's' : ''} wilt verwijderen?
              Dit kan niet ongedaan worden gemaakt.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToonBevestigDialog(false)}>
              Annuleren
            </Button>
            <Button
              variant="destructive"
              onClick={bevestigVerwijderen}
            >
              Verwijderen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
