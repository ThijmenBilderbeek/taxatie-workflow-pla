import { useState } from 'react'
import { FileText, Plus, Building, TrendingUp, Filter } from 'lucide-react'
import { Trash } from '@phosphor-icons/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
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
  const [teVerwijderenId, setTeVerwijderenId] = useState<string | null>(null)
  const teVerwijderenDossier = dossiers.find((d) => d.id === teVerwijderenId)

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
        <Button onClick={onCreateDossier} size="lg" className="gap-2">
          <Plus className="h-5 w-5" />
          Nieuw Dossier
        </Button>
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
            {dossiers.map((dossier) => (
              <Card
                key={dossier.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => onOpenDossier(dossier.id)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
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
                    <div className="flex justify-end pt-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="gap-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          setTeVerwijderenId(dossier.id)
                        }}
                      >
                        <Trash className="h-4 w-4" />
                        Verwijderen
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={teVerwijderenId !== null}
        onOpenChange={(open) => !open && setTeVerwijderenId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dossier verwijderen?</DialogTitle>
            <DialogDescription>
              Weet je zeker dat je dossier{' '}
              <strong>{teVerwijderenDossier?.dossiernummer}</strong> wilt verwijderen?
              Dit kan niet ongedaan worden gemaakt.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeVerwijderenId(null)}>
              Annuleren
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (teVerwijderenId) {
                  onDeleteDossier(teVerwijderenId)
                }
                setTeVerwijderenId(null)
              }}
            >
              Verwijderen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
