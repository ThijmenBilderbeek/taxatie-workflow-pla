import { useState, useEffect } from 'react'
import { useKV } from '@github/spark/hooks'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Separator } from './ui/separator'
import { Badge } from './ui/badge'
import { Copy, ThumbsUp, ThumbsDown, ArrowCounterClockwise, FileText, Download, CheckCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { Dossier, HistorischRapport, RapportSectie, SimilarityFeedback, RapportVariant } from '@/types'
import { formatForFlux, createFluxReport } from '@/lib/fluxFormatter'
import { generateAlleSecties } from '@/lib/templates'

function getRapportVariant(dossier: Dossier): RapportVariant {
  const isVerhuurd = dossier.stap4?.verhuurd || false
  const typeObject = dossier.stap1?.typeObject || 'kantoor'
  
  if (isVerhuurd) {
    return 'verhuurd_belegging'
  }
  
  if (typeObject === 'bedrijfscomplex' || typeObject === 'bedrijfshal') {
    return 'eigenaar_gebruiker_bedrijfscomplex'
  }
  
  return 'eigenaar_gebruiker_kantoor'
}

interface SectieDefinitie {
  key: string
  titel: string
}

const ALLE_SECTIES: SectieDefinitie[] = [
  { key: 'samenvatting', titel: 'Rapport Samenvatting' },
  { key: 'a1-opdrachtgever', titel: 'A.1 Opdrachtgever' },
  { key: 'a2-taxateur', titel: 'A.2 Opdrachtnemer en Uitvoerend Taxateur' },
  { key: 'b1-algemeen', titel: 'B.1 Algemeen' },
  { key: 'b2-doel-taxatie', titel: 'B.2 Doel van de Taxatie' },
  { key: 'b3-waardering-basis', titel: 'B.3 Waardering & Basis van de Waarde' },
  { key: 'b4-inspectie', titel: 'B.4 Inspectie' },
  { key: 'b5-uitgangspunten', titel: 'B.5 Uitgangspunten en Afwijkingen' },
  { key: 'b6-toelichting-waardering', titel: 'B.6 Nadere Toelichting op de Waardering' },
  { key: 'b7-eerdere-taxaties', titel: 'B.7 Eerdere Taxaties' },
  { key: 'b8-inzage-documenten', titel: 'B.8 Overzicht Inzage Documenten' },
  { key: 'b9-taxatiemethodiek', titel: 'B.9 Gehanteerde Taxatiemethodiek' },
  { key: 'b10-plausibiliteit', titel: 'B.10 Plausibiliteit Taxatie' },
  { key: 'c1-swot', titel: 'C.1 SWOT-Analyse' },
  { key: 'c2-beoordeling', titel: 'C.2 Beoordeling Courantheid' },
  { key: 'd1-privaatrechtelijk', titel: 'D.1 Privaatrechtelijke Aspecten' },
  { key: 'd2-publiekrechtelijk', titel: 'D.2 Publiekrechtelijke Aspecten' },
  { key: 'e1-locatie-overzicht', titel: 'E.1 Locatieoverzicht' },
  { key: 'e2-locatie-informatie', titel: 'E.2 Locatie Informatie' },
  { key: 'f1-object-informatie', titel: 'F.1 Objectinformatie' },
  { key: 'f2-oppervlakte', titel: 'F.2 Oppervlakte' },
  { key: 'f3-renovatie', titel: 'F.3 Renovatie' },
  { key: 'f4-milieuaspecten', titel: 'F.4 Milieuaspecten en Beoordeling' },
  { key: 'g1-gebruik-object', titel: 'G.1 Gebruik Object' },
  { key: 'g2-alternatieve-aanwendbaarheid', titel: 'G.2 Huursituatie / Alternatieve Aanwendbaarheid' },
  { key: 'h1-marktvisie', titel: 'H.1 Marktvisie' },
  { key: 'h2-huurreferenties', titel: 'H.2 Huurreferenties en Overzicht Ruimtes en Markthuur' },
  { key: 'h3-koopreferenties', titel: 'H.3 Koopreferenties en Onderbouwing Yields' },
  { key: 'h4-correcties', titel: 'H.4 Correcties en Bijzondere Waardecomponenten' },
  { key: 'i-duurzaamheid', titel: 'I. Duurzaamheid' },
  { key: 'j-algemene-uitgangspunten', titel: 'J. Algemene Uitgangspunten' },
  { key: 'k-waardebegrippen', titel: 'K. Waardebegrippen en Definities' },
  { key: 'l-bijlagen', titel: 'L. Bijlagen' },
  { key: 'ondertekening', titel: 'Ondertekening' },
]

export function RapportView({ onAfgerond }: { onAfgerond?: () => void }) {
  const [dossiers, setDossiers] = useKV<Dossier[]>('dossiers', [])
  const [historischeRapporten, setHistorischeRapporten] = useKV<HistorischRapport[]>('historische-rapporten', [])
  const [similarityFeedback, setSimilarityFeedback] = useKV<SimilarityFeedback[]>('similarity-feedback', [])

  const activeDossier = (dossiers || []).find(
    d => d.status === 'in_behandeling' || d.status === 'concept'
  )

  const [editingStates, setEditingStates] = useState<Record<string, string>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [isAfronden, setIsAfronden] = useState(false)

  useEffect(() => {
    if (!activeDossier) return

    if (Object.keys(activeDossier.rapportSecties).length === 0) {
      setIsGenerating(true)
      const generatedContent = generateAlleSecties(activeDossier, historischeRapporten || [])
      
      const newRapportSecties: Record<string, RapportSectie> = {}
      Object.entries(generatedContent).forEach(([key, content]) => {
        const sectieDefinitie = ALLE_SECTIES.find(s => s.key === key)
        newRapportSecties[key] = {
          titel: sectieDefinitie?.titel || key,
          inhoud: content,
          gegenereerdeInhoud: content,
          fluxKlaarTekst: formatForFlux(content),
        }
      })

      setDossiers((current) =>
        (current || []).map((d) =>
          d.id === activeDossier.id
            ? {
                ...d,
                rapportSecties: newRapportSecties,
                updatedAt: new Date().toISOString(),
              }
            : d
        )
      )
      setIsGenerating(false)
      toast.success('Rapport gegenereerd')
    } else {
      const initial: Record<string, string> = {}
      Object.entries(activeDossier.rapportSecties).forEach(([key, sectie]) => {
        initial[key] = sectie.inhoud
      })
      setEditingStates(initial)
    }
  }, [activeDossier?.id])

  if (!activeDossier) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Selecteer een dossier vanuit het dashboard</p>
        </CardContent>
      </Card>
    )
  }

  if (isGenerating) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Rapport wordt gegenereerd...</p>
        </CardContent>
      </Card>
    )
  }

  const variant = getRapportVariant(activeDossier)
  const secties = ALLE_SECTIES.map(def => {
    const sectie = activeDossier.rapportSecties[def.key]
    return sectie ? { key: def.key, ...sectie } : null
  }).filter(Boolean) as Array<{ key: string } & RapportSectie>

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

  const kanAfronden =
    !!activeDossier?.stap1 &&
    !!activeDossier?.stap2 &&
    !!activeDossier?.stap3 &&
    !!activeDossier?.stap8

  const handleAfrondenEnOpslaan = async () => {
    if (!activeDossier || !kanAfronden) return
    setIsAfronden(true)
    try {
      const rapportTeksten: Record<string, string> = {}
      Object.entries(activeDossier.rapportSecties).forEach(([key, sectie]) => {
        rapportTeksten[key] = sectie.inhoud
      })

      const historischRapport: HistorischRapport = {
        id: `hr-${crypto.randomUUID()}`,
        adres: {
          straat: activeDossier.stap2!.straatnaam,
          huisnummer: activeDossier.stap2!.huisnummer,
          postcode: activeDossier.stap2!.postcode,
          plaats: activeDossier.stap2!.plaats,
        },
        coordinaten: activeDossier.stap2!.coordinaten,
        typeObject: activeDossier.stap1!.typeObject,
        gebruiksdoel: activeDossier.stap1!.gebruiksdoel,
        gbo: activeDossier.stap3!.gbo,
        marktwaarde: activeDossier.stap8!.marktwaarde,
        bar: activeDossier.stap8!.bar,
        nar: activeDossier.stap8!.nar,
        waardepeildatum: activeDossier.stap1!.waardepeildatum,
        rapportTeksten,
        wizardData: activeDossier,
      }

      setHistorischeRapporten((current) => [...(current || []), historischRapport])
      setDossiers((current) =>
        (current || []).map((d) =>
          d.id === activeDossier.id
            ? { ...d, status: 'afgerond', updatedAt: new Date().toISOString() }
            : d
        )
      )
      toast.success('Dossier afgerond en opgeslagen in kennisbank')
      onAfgerond?.()
    } finally {
      setIsAfronden(false)
    }
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
          <Badge variant="secondary" className="mt-2">
            Variant: {variant === 'verhuurd_belegging' ? 'Verhuurd (Belegging)' : 'Eigenaar-Gebruiker'}
          </Badge>
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
          {activeDossier.status === 'afgerond' ? (
            <Badge variant="secondary" className="flex items-center gap-1 px-3 py-1 text-sm">
              <CheckCircle className="h-4 w-4" />
              Opgeslagen in kennisbank
            </Badge>
          ) : (
            <Button
              variant="default"
              onClick={handleAfrondenEnOpslaan}
              disabled={!kanAfronden || isAfronden}
            >
              <CheckCircle className="mr-2" />
              {isAfronden ? 'Bezig...' : 'Dossier afronden & opslaan in kennisbank'}
            </Button>
          )}
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
          secties.map((sectie) => {
            const referentieInfo = getReferentieInfo(sectie.gebaseerdOpReferentie)
            const hasBeenEdited = editingStates[sectie.key] !== sectie.gegenereerdeInhoud

            return (
              <Card key={sectie.key}>
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
                        onClick={() => handleCopySectie(sectie.key)}
                        title="Kopieer sectie"
                      >
                        <Copy />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRegenereerSectie(sectie.key)}
                        title="Regenereer"
                      >
                        <ArrowCounterClockwise />
                      </Button>
                      <Separator orientation="vertical" className="h-6 mx-1" />
                      <Button
                        size="sm"
                        variant={sectie.feedbackScore === 'positief' ? 'default' : 'ghost'}
                        onClick={() => handleFeedback(sectie.key, 'positief')}
                        title="Goed"
                      >
                        <ThumbsUp />
                      </Button>
                      <Button
                        size="sm"
                        variant={sectie.feedbackScore === 'negatief' ? 'destructive' : 'ghost'}
                        onClick={() => handleFeedback(sectie.key, 'negatief')}
                        title="Niet goed"
                      >
                        <ThumbsDown />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={editingStates[sectie.key] || ''}
                    onChange={(e) =>
                      setEditingStates((current) => ({
                        ...current,
                        [sectie.key]: e.target.value,
                      }))
                    }
                    rows={10}
                    className="font-mono text-sm"
                  />

                  <div className="flex justify-end">
                    <Button onClick={() => handleSaveSectie(sectie.key)}>
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
