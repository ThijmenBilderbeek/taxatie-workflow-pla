import { useState, useEffect } from 'react'
import { useKV } from '@github/spark/hooks'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Separator } from './ui/separator'
import { Badge } from './ui/badge'
import { Copy, ThumbsUp, ThumbsDown, ArrowCounterClockwise, FileText, Download } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { Dossier, HistorischRapport, RapportSectie, SimilarityFeedback } from '@/types'
import { formatForFlux, createFluxReport } from '@/lib/fluxFormatter'

export function RapportView() {
  const [dossiers, setDossiers] = useKV<Dossier[]>('dossiers', [])
  const [historischeRapporten] = useKV<HistorischRapport[]>('historische-rapporten', [])
  const [similarityFeedback, setSimilarityFeedback] = useKV<SimilarityFeedback[]>('similarity-feedback', [])

  const activeDossier = (dossiers || []).find(d => d.status === 'in_behandeling' || (d.status === 'concept' && Object.keys(d.rapportSecties).length > 0))

  const [editingStates, setEditingStates] = useState<Record<string, string>>({})

  useEffect(() => {
    if (activeDossier && Object.keys(editingStates).length === 0) {
      const initial: Record<string, string> = {}
      Object.entries(activeDossier.rapportSecties).forEach(([key, sectie]) => {
        initial[key] = sectie.inhoud
      })
      setEditingStates(initial)
    }
  }, [activeDossier])

  if (!activeDossier) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Geen rapport beschikbaar. Voltooi eerst de wizard.</p>
        </CardContent>
      </Card>
    )
  }

  const secties = Object.entries(activeDossier.rapportSecties).sort(([keyA], [keyB]) => {
    const numA = parseInt(keyA.split('-')[0])
    const numB = parseInt(keyB.split('-')[0])
    return numA - numB
  })

  const handleSaveSectie = (key: string) => {
    setDossiers((current) =>
      (current || []).map((d) =>
        d.id === activeDossier.id
          ? {
              ...d,
              rapportSecties: {
                ...d.rapportSecties,
                [key]: {
                  ...d.rapportSecties[key],
                  inhoud: editingStates[key],
                  fluxKlaarTekst: formatForFlux(editingStates[key]),
                },
              },
              updatedAt: new Date().toISOString(),
            }
          : d
      )
    )
    toast.success('Sectie opgeslagen')
  }

  const handleRegenereerSectie = async (key: string) => {
    const sectie = activeDossier.rapportSecties[key]
    if (!sectie) return

    const updatedInhoud = sectie.gegenereerdeInhoud

    setEditingStates((current) => ({
      ...current,
      [key]: updatedInhoud,
    }))

    setDossiers((current) =>
      (current || []).map((d) =>
        d.id === activeDossier.id
          ? {
              ...d,
              rapportSecties: {
                ...d.rapportSecties,
                [key]: {
                  ...d.rapportSecties[key],
                  inhoud: updatedInhoud,
                  fluxKlaarTekst: formatForFlux(updatedInhoud),
                },
              },
            }
          : d
      )
    )

    toast.success('Sectie geregenereerd')
  }

  const handleFeedback = (key: string, score: 'positief' | 'negatief') => {
    const sectie = activeDossier.rapportSecties[key]

    setDossiers((current) =>
      (current || []).map((d) =>
        d.id === activeDossier.id
          ? {
              ...d,
              rapportSecties: {
                ...d.rapportSecties,
                [key]: {
                  ...d.rapportSecties[key],
                  feedbackScore: score,
                },
              },
            }
          : d
      )
    )

    if (score === 'negatief') {
      const newFeedback: SimilarityFeedback = {
        id: `fb-${Date.now()}`,
        dossierId: activeDossier.id,
        referentieRapportId: sectie.gebaseerdOpReferentie || '',
        sectie: key,
        score,
        reden: 'Handmatige feedback',
        categorie: 'anders',
        createdAt: new Date().toISOString(),
      }

      setSimilarityFeedback((current) => [...(current || []), newFeedback])
    }

    toast.success(score === 'positief' ? 'Bedankt voor je feedback!' : 'Feedback geregistreerd')
  }

  const handleCopySectie = async (key: string) => {
    const sectie = activeDossier.rapportSecties[key]
    if (!sectie) return

    const fluxTekst = formatForFlux(sectie.inhoud)

    try {
      await navigator.clipboard.writeText(fluxTekst)
      toast.success('Sectie gekopieerd naar klembord')
    } catch (err) {
      toast.error('Kopiëren mislukt')
    }
  }

  const handleCopyVolledigRapport = async () => {
    const volledigRapport = createFluxReport(activeDossier)

    try {
      await navigator.clipboard.writeText(volledigRapport)
      toast.success('Volledig rapport gekopieerd voor Flux')
    } catch (err) {
      toast.error('Kopiëren mislukt')
    }
  }

  const handleExportTxt = () => {
    const volledigRapport = createFluxReport(activeDossier)
    const blob = new Blob([volledigRapport], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeDossier.dossiernummer}-rapport.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Rapport geëxporteerd als TXT')
  }

  const handleExportDocx = () => {
    toast.info('DOCX export komt in volgende versie')
  }

  const getReferentieInfo = (referentieId?: string) => {
    if (!referentieId) return null
    const rapport = (historischeRapporten || []).find(r => r.id === referentieId)
    if (!rapport) return null
    return {
      adres: `${rapport.adres.straat} ${rapport.adres.huisnummer}, ${rapport.adres.plaats}`,
      score: 87,
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Taxatierapport</h2>
          <p className="text-sm text-muted-foreground">
            {activeDossier.dossiernummer} • {activeDossier.stap1?.objectnaam || 'Onbekend object'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportTxt}>
            <Download className="mr-2" />
            Exporteer TXT
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportDocx}>
            <FileText className="mr-2" />
            Exporteer DOCX
          </Button>
          <Button onClick={handleCopyVolledigRapport}>
            <Copy className="mr-2" />
            Kopieer volledig rapport voor Flux
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {secties.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Geen rapportsecties gevonden</p>
            </CardContent>
          </Card>
        ) : (
          secties.map(([key, sectie]) => {
            const referentieInfo = getReferentieInfo(sectie.gebaseerdOpReferentie)
            const hasBeenEdited = editingStates[key] !== sectie.gegenereerdeInhoud

            return (
              <Card key={key}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <CardTitle>{sectie.titel}</CardTitle>
                      {referentieInfo && (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            Gebaseerd op: {referentieInfo.adres}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Score: {referentieInfo.score}/100
                          </Badge>
                        </div>
                      )}
                      {hasBeenEdited && (
                        <Badge variant="outline" className="text-xs border-accent text-accent">
                          Aangepast
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopySectie(key)}
                        title="Kopieer sectie"
                      >
                        <Copy />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRegenereerSectie(key)}
                        title="Regenereer"
                      >
                        <ArrowCounterClockwise />
                      </Button>
                      <Separator orientation="vertical" className="h-6 mx-1" />
                      <Button
                        size="sm"
                        variant={sectie.feedbackScore === 'positief' ? 'default' : 'ghost'}
                        onClick={() => handleFeedback(key, 'positief')}
                        title="Goed"
                      >
                        <ThumbsUp />
                      </Button>
                      <Button
                        size="sm"
                        variant={sectie.feedbackScore === 'negatief' ? 'destructive' : 'ghost'}
                        onClick={() => handleFeedback(key, 'negatief')}
                        title="Niet goed"
                      >
                        <ThumbsDown />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={editingStates[key] || ''}
                    onChange={(e) =>
                      setEditingStates((current) => ({
                        ...current,
                        [key]: e.target.value,
                      }))
                    }
                    rows={10}
                    className="font-mono text-sm"
                  />

                  <div className="flex justify-end">
                    <Button onClick={() => handleSaveSectie(key)}>
                      Opslaan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {activeDossier.geselecteerdeReferenties.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Gebruikte referentierapporten</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeDossier.geselecteerdeReferenties.map((refId) => {
                const rapport = (historischeRapporten || []).find(r => r.id === refId)
                if (!rapport) return null

                const similarityResult = activeDossier.similarityResults.find(
                  r => r.rapportId === refId
                )

                return (
                  <div
                    key={refId}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                  >
                    <div>
                      <p className="font-medium">
                        {rapport.adres.straat} {rapport.adres.huisnummer}, {rapport.adres.plaats}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {rapport.typeObject} • GBO: {rapport.gbo} m²
                      </p>
                    </div>
                    {similarityResult && (
                      <Badge
                        variant={
                          similarityResult.classificatie === 'uitstekend'
                            ? 'default'
                            : similarityResult.classificatie === 'goed'
                            ? 'secondary'
                            : 'outline'
                        }
                      >
                        {similarityResult.totaalScore}/100
                      </Badge>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
