import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Separator } from './ui/separator'
import { Badge } from './ui/badge'
import { Copy, ThumbsUp, ThumbsDown, ArrowCounterClockwise, FileText, Download, CheckCircle, Books, Sparkle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { Dossier, HistorischRapport, RapportSectie, SimilarityFeedback, RapportVariant, CoherentieResultaat } from '@/types'
import { formatForFlux, createFluxReport } from '@/lib/fluxFormatter'
import { generateAlleSecties } from '@/lib/templates'
import { generateAlleSectiesMetAI, checkRapportCoherentie } from '@/lib/aiRapportGenerator'
import { extractDocumentKnowledge, deriveMarketSegment } from '@/lib/documentKnowledgeExtractor'
import { useDocumentKnowledge } from '@/hooks/useDocumentKnowledge'
import { invalidateKennisbankCache } from '@/lib/kennisbankRetriever'
import { KennisbankSuggestiesPanel } from './KennisbankSuggestiesPanel'
import { saveSectieFeedback } from '@/hooks/useSectieFeedback'
import { useAlleSectieStats } from '@/hooks/useSectieKwaliteit'

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

export function RapportView({
  activeDossierId,
  dossiers,
  historischeRapporten,
  similarityFeedback,
  onUpdateDossier,
  onAddHistorischRapport,
  onAddSimilarityFeedback,
  onAfgerond,
}: {
  activeDossierId: string
  dossiers: Dossier[]
  historischeRapporten: HistorischRapport[]
  similarityFeedback: SimilarityFeedback[]
  onUpdateDossier: (dossier: Dossier) => void
  onAddHistorischRapport: (rapport: HistorischRapport) => void
  onAddSimilarityFeedback: (feedback: SimilarityFeedback) => void
  onAfgerond?: () => void
}) {
  const activeDossier = dossiers.find(d => d.id === activeDossierId)

  const { saveDocumentChunks, saveDocumentProfile, updateReuseScoresFromFeedback } = useDocumentKnowledge()
  const { allStats } = useAlleSectieStats()
  const [editingStates, setEditingStates] = useState<Record<string, string>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [aiProgress, setAiProgress] = useState<{ current: number; total: number; sectie: string } | null>(null)
  const [kennisbankSecties, setKennisbankSecties] = useState<Set<string>>(new Set())
  const [cachedSecties, setCachedSecties] = useState<Set<string>>(new Set())
  const [isAfronden, setIsAfronden] = useState(false)
  const [suggestiePanelOpen, setSuggestiePanelOpen] = useState(false)
  const [suggestiePanelChapter, setSuggestiePanelChapter] = useState<string | undefined>()
  const [suggestiePanelSectieKey, setSuggestiePanelSectieKey] = useState<string | undefined>()
  const [coherentieResultaat, setCoherentieResultaat] = useState<CoherentieResultaat | null>(null)
  const [isCheckingCoherentie, setIsCheckingCoherentie] = useState(false)

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

      onUpdateDossier({
        ...activeDossier,
        rapportSecties: newRapportSecties,
        updatedAt: new Date().toISOString(),
      })
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
    const sectie = activeDossier.rapportSecties[key]
    const nieuweInhoud = editingStates[key]

    // Sla 'bewerkt' feedback op als de inhoud afwijkt van de AI-gegenereerde tekst
    const isBewerkt = !!sectie?.gegenereerdeInhoud && nieuweInhoud !== sectie.gegenereerdeInhoud
    if (isBewerkt) {
      void saveSectieFeedback(
        activeDossier.id,
        key,
        'bewerkt',
        sectie.gegenereerdeInhoud,
        nieuweInhoud
      )
    }

    onUpdateDossier({
      ...activeDossier,
      rapportSecties: {
        ...activeDossier.rapportSecties,
        [key]: {
          ...activeDossier.rapportSecties[key],
          inhoud: nieuweInhoud,
          fluxKlaarTekst: formatForFlux(nieuweInhoud),
        },
      },
      updatedAt: new Date().toISOString(),
    })

    if (isBewerkt) {
      toast.success('Feedback opgeslagen — dit helpt toekomstige AI-suggesties verbeteren')
    } else {
      toast.success('Sectie opgeslagen')
    }
  }

  const handleRegenereerSectie = async (key: string) => {
    const sectie = activeDossier.rapportSecties[key]
    if (!sectie) return

    const updatedInhoud = sectie.gegenereerdeInhoud

    setEditingStates((current) => ({
      ...current,
      [key]: updatedInhoud,
    }))

    onUpdateDossier({
      ...activeDossier,
      rapportSecties: {
        ...activeDossier.rapportSecties,
        [key]: {
          ...activeDossier.rapportSecties[key],
          inhoud: updatedInhoud,
          fluxKlaarTekst: formatForFlux(updatedInhoud),
        },
      },
    })

    toast.success('Sectie geregenereerd')
  }

  const handleGenereerMetAI = async () => {
    if (isGeneratingAI) return
    setIsGeneratingAI(true)
    setAiProgress(null)

    try {
      const objectType = activeDossier.stap1?.typeObject
      const marketSegment = deriveMarketSegment(objectType)

      const aiResultaten = await generateAlleSectiesMetAI(
        activeDossier,
        historischeRapporten || [],
        (sectieKey, current, total) => {
          setAiProgress({ current, total, sectie: sectieKey })
        },
        objectType,
        marketSegment
      )

      const nieuweKennisbankSecties = new Set<string>()
      const nieuweCachedSecties = new Set<string>()
      const nieuweRapportSecties = { ...activeDossier.rapportSecties }

      Object.entries(aiResultaten).forEach(([key, resultaat]) => {
        const sectieDefinitie = ALLE_SECTIES.find((s) => s.key === key)
        nieuweRapportSecties[key] = {
          titel: sectieDefinitie?.titel || key,
          inhoud: resultaat.tekst,
          gegenereerdeInhoud: resultaat.tekst,
          fluxKlaarTekst: formatForFlux(resultaat.tekst),
          gebaseerdOpReferentie: nieuweRapportSecties[key]?.gebaseerdOpReferentie,
        }
        if (resultaat.hasKennisbankContext) {
          nieuweKennisbankSecties.add(key)
        }
        if (resultaat.isCached) {
          nieuweCachedSecties.add(key)
        }
      })

      setKennisbankSecties(nieuweKennisbankSecties)
      setCachedSecties(nieuweCachedSecties)
      setEditingStates(
        Object.fromEntries(Object.entries(nieuweRapportSecties).map(([k, v]) => [k, v.inhoud]))
      )

      onUpdateDossier({
        ...activeDossier,
        rapportSecties: nieuweRapportSecties,
        updatedAt: new Date().toISOString(),
      })

      // Non-blocking coherence check after all sections are generated
      void (async () => {
        setIsCheckingCoherentie(true)
        try {
          const result = await checkRapportCoherentie(
            Object.fromEntries(
              Object.entries(nieuweRapportSecties).map(([k, v]) => [k, { titel: v.titel, inhoud: v.inhoud }])
            )
          )
          setCoherentieResultaat(result)
          if (!result.isCoherent) {
            toast.warning(`${result.inconsistenties.length} inconsistentie(s) gevonden in het rapport`)
          }
        } catch {
          // Silently ignore coherence check failures
        } finally {
          setIsCheckingCoherentie(false)
        }
      })()

      const metKennisbank = nieuweKennisbankSecties.size
      if (metKennisbank > 0) {
        toast.success(`Rapport gegenereerd met AI — ${metKennisbank} sectie(s) verrijkt met Kennisbank`)
      } else {
        toast.success('Rapport gegenereerd met AI')
      }
    } catch (err) {
      console.error('[RapportView] AI generatie mislukt:', err)
      toast.error('AI generatie mislukt')
    } finally {
      setIsGeneratingAI(false)
      setAiProgress(null)
    }
  }

  const handleFeedback = (key: string, score: 'positief' | 'negatief') => {
    const sectie = activeDossier.rapportSecties[key]

    onUpdateDossier({
      ...activeDossier,
      rapportSecties: {
        ...activeDossier.rapportSecties,
        [key]: {
          ...activeDossier.rapportSecties[key],
          feedbackScore: score,
        },
      },
    })

    // Sla feedback op in sectie_feedback tabel
    const origineleTekst = sectie?.gegenereerdeInhoud ?? sectie?.inhoud ?? ''
    if (origineleTekst) {
      void saveSectieFeedback(activeDossier.id, key, score, origineleTekst)
    }

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

      onAddSimilarityFeedback(newFeedback)
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
          straat: activeDossier.stap2?.straatnaam ?? '',
          huisnummer: activeDossier.stap2?.huisnummer ?? '',
          postcode: activeDossier.stap2?.postcode ?? '',
          plaats: activeDossier.stap2?.plaats ?? '',
        },
        coordinaten: activeDossier.stap2?.coordinaten ?? { lat: 0, lng: 0 },
        typeObject: activeDossier.stap1?.typeObject ?? 'overig',
        gebruiksdoel: activeDossier.stap1?.gebruiksdoel ?? 'overig',
        bvo: activeDossier.stap3?.bvo ?? 0,
        marktwaarde: activeDossier.stap8?.marktwaarde ?? 0,
        bar: activeDossier.stap8?.bar,
        nar: activeDossier.stap8?.nar,
        waardepeildatum: activeDossier.stap1?.waardepeildatum ?? '',
        rapportTeksten,
        wizardData: activeDossier,
      }

      onAddHistorischRapport(historischRapport)
      onUpdateDossier({ ...activeDossier, status: 'afgerond', updatedAt: new Date().toISOString() })

      // Extract and persist document knowledge non-blocking
      const fullText = Object.values(rapportTeksten).filter(Boolean).join('\n\n')
      const objectAddress = [activeDossier.stap2?.straatnaam, activeDossier.stap2?.huisnummer]
        .filter(Boolean)
        .join(' ')
        .trim() || undefined
      const city = activeDossier.stap2?.plaats || undefined
      const region = activeDossier.stap2?.provincie || undefined
      const objectType = activeDossier.stap1?.typeObject
      const marketSegment = deriveMarketSegment(objectType)

      if (fullText) {
        try {
          const knowledge = extractDocumentKnowledge(fullText, historischRapport.id, {
            objectType,
            objectAddress,
            city,
            region,
            marketSegment,
          })

          // Identify edited sections (user changed the AI-generated content)
          const editedSecties = Object.entries(activeDossier.rapportSecties).filter(
            ([, sectie]) =>
              sectie.gegenereerdeInhoud !== null &&
              sectie.gegenereerdeInhoud !== undefined &&
              sectie.inhoud !== sectie.gegenereerdeInhoud
          )

          // Boost reuseQuality when human-edited sections are present
          const enrichedProfile = editedSecties.length > 0
            ? { ...knowledge.profile, reuseQuality: Math.max(knowledge.profile.reuseQuality, 0.8) }
            : knowledge.profile

          // Build style_example chunks for each edited section
          const styleExampleChunks = editedSecties.map(([key, sectie]) => {
            const now = new Date().toISOString()
            return {
              id: crypto.randomUUID(),
              documentId: historischRapport.id,
              chapter: getChapterFromSectieKey(key),
              subchapter: key,
              chunkType: 'style_example' as const,
              rawText: sectie.inhoud,
              cleanText: sectie.inhoud,
              writingFunction: 'beschrijvend' as const,
              tones: [],
              specificity: 'object_specifiek' as const,
              reuseScore: 0.9,
              reuseAsStyleExample: true,
              templateCandidate: true,
              variablesDetected: [],
              objectAddress,
              objectType,
              city,
              region,
              marketSegment,
              metadata: {
                originalAiText: sectie.gegenereerdeInhoud,
                editedByUser: true,
              },
              createdAt: now,
              updatedAt: now,
            }
          })

          const savePromises: Promise<void>[] = [
            saveDocumentChunks(knowledge.chunks),
            saveDocumentProfile(enrichedProfile),
          ]
          if (styleExampleChunks.length > 0) {
            savePromises.push(saveDocumentChunks(styleExampleChunks))
          }

          void Promise.all(savePromises).then(() => {
            if (styleExampleChunks.length > 0) {
              invalidateKennisbankCache()
              void updateReuseScoresFromFeedback().catch((err) => {
                console.warn('[updateReuseScores] failed silently:', err)
              })
            }
          }).catch((err) => {
            console.warn('[knowledge save] failed silently:', err)
          })
        } catch (err) {
          console.warn('[knowledge extraction] failed silently:', err)
        }
      }

      toast.success('Dossier afgerond en opgeslagen in kennisbank')
      onAfgerond?.()
    } finally {
      setIsAfronden(false)
    }
  }

  const handleCoherentieCheck = async () => {
    if (isCheckingCoherentie || !activeDossier) return
    setIsCheckingCoherentie(true)
    try {
      const sectieSummaries = Object.fromEntries(
        Object.entries(activeDossier.rapportSecties).map(([k, v]) => [k, { titel: v.titel, inhoud: v.inhoud }])
      )
      const result = await checkRapportCoherentie(sectieSummaries)
      setCoherentieResultaat(result)
      if (result.isCoherent) {
        toast.success('Rapport is intern consistent — geen inconsistenties gevonden')
      } else {
        toast.warning(`${result.inconsistenties.length} inconsistentie(s) gevonden`)
      }
    } catch {
      toast.error('Coherentie check mislukt')
    } finally {
      setIsCheckingCoherentie(false)
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

  const getChapterFromSectieKey = (key: string): string => {
    const match = key.match(/^([a-zA-Z]+)\d*/i)
    if (!match) return key
    return match[1].toUpperCase()
  }

  const handleOpenSuggesties = (sectieKey: string) => {
    const chapter = getChapterFromSectieKey(sectieKey)
    setSuggestiePanelChapter(chapter)
    setSuggestiePanelSectieKey(sectieKey)
    setSuggestiePanelOpen(true)
  }

  const handleGebruikSuggestie = (text: string) => {
    if (!suggestiePanelSectieKey) return
    setEditingStates((current) => ({
      ...current,
      [suggestiePanelSectieKey]: (current[suggestiePanelSectieKey] ? current[suggestiePanelSectieKey] + '\n\n' : '') + text,
    }))
    toast.success('Tekst toegevoegd aan sectie')
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenereerMetAI}
            disabled={isGeneratingAI}
          >
            <Sparkle className="mr-2" />
            {isGeneratingAI
              ? aiProgress
                ? `AI bezig… ${aiProgress.current}/${aiProgress.total}`
                : 'AI generatie starten…'
              : 'Genereer met AI + Kennisbank'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCoherentieCheck}
            disabled={isCheckingCoherentie || secties.length === 0}
          >
            {isCheckingCoherentie ? 'Coherentie check bezig...' : 'Coherentie check'}
          </Button>
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

      {coherentieResultaat && coherentieResultaat.isCoherent && (
        <Badge variant="outline" className="border-green-500 text-green-700">
          ✓ Rapport coherent
        </Badge>
      )}

      {coherentieResultaat && !coherentieResultaat.isCoherent && (
        <Card className="border-orange-300 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-orange-800">
              ⚠️ Coherentie-check: {coherentieResultaat.inconsistenties.length} inconsistentie(s) gevonden
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {coherentieResultaat.inconsistenties.map((inc, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border border-orange-200 bg-white">
                  <Badge
                    variant={inc.ernst === 'hoog' ? 'destructive' : inc.ernst === 'gemiddeld' ? 'secondary' : 'outline'}
                    className="mt-0.5"
                  >
                    {inc.ernst}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium">
                      Secties: {inc.sectieKeys.join(', ')}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {inc.beschrijving}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
                      {kennisbankSecties.has(sectie.key) && (
                        <Badge variant="secondary" className="text-xs" aria-label="Gegenereerd met Kennisbank-context">
                          📚 Kennisbank
                        </Badge>
                      )}
                      {cachedSecties.has(sectie.key) && (
                        <Badge variant="outline" className="text-xs border-blue-400 text-blue-600" aria-label="Geserveerd vanuit cache">
                          ⚡ Cache
                        </Badge>
                      )}
                      {allStats[sectie.key] && allStats[sectie.key].totaal >= 3 && (
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            allStats[sectie.key].acceptatieRatio >= 0.8
                              ? 'border-green-500 text-green-700'
                              : allStats[sectie.key].acceptatieRatio >= 0.5
                              ? 'border-yellow-500 text-yellow-700'
                              : 'border-orange-500 text-orange-700'
                          }`}
                          title={`Gebaseerd op ${allStats[sectie.key].totaal} eerdere generaties`}
                        >
                          {Math.round(allStats[sectie.key].acceptatieRatio * 100)}% geaccepteerd
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenSuggesties(sectie.key)}
                        title="Kennisbank suggesties"
                      >
                        <Books />
                      </Button>
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
                  {isGeneratingAI && aiProgress?.sectie === sectie.key && (
                    <div className="flex items-center gap-2">
                      <img
                        src="/valyze_logo2.svg"
                        alt="Valyze logo"
                        className="h-6 w-auto animate-pulse"
                      />
                      <span className="text-sm text-muted-foreground">AI genereert...</span>
                    </div>
                  )}
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
                        {rapport.typeObject} • BVO: {rapport.bvo} m²
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

      <KennisbankSuggestiesPanel
        open={suggestiePanelOpen}
        onOpenChange={setSuggestiePanelOpen}
        objectType={activeDossier.stap1?.typeObject}
        marketSegment={deriveMarketSegment(activeDossier.stap1?.typeObject)}
        chapter={suggestiePanelChapter}
        city={activeDossier.stap2?.plaats}
        dossier={activeDossier}
        onGebruikTekst={handleGebruikSuggestie}
      />
    </div>
  )
}
