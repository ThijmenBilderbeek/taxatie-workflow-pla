import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Books, X, Copy, Star, Tag } from '@phosphor-icons/react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { ScrollArea } from './ui/scroll-area'
import { Separator } from './ui/separator'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from './ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Switch } from './ui/switch'
import { Label } from './ui/label'
import { useKennisbankSuggestions, type KennisbankSuggestie } from '@/hooks/useKennisbankSuggestions'
import { fillTemplate } from '@/hooks/useKennisbankTemplates'
import type { MarketSegment } from '@/types/kennisbank'
import type { ObjectType, Dossier } from '@/types'

interface KennisbankSuggestiesPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  objectType?: ObjectType
  marketSegment?: MarketSegment
  chapter?: string
  city?: string
  dossier: Dossier
  onGebruikTekst?: (text: string) => void
}

const CHUNK_TYPE_LABELS: Record<string, string> = {
  narratief: 'Narratief',
  opsomming: 'Opsomming',
  tabel: 'Tabel',
  conclusie: 'Conclusie',
  inleiding: 'Inleiding',
  juridisch: 'Juridisch',
  technisch: 'Technisch',
  financieel: 'Financieel',
  beschrijving: 'Beschrijving',
}

function ReuseScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const variant =
    pct >= 80 ? 'default' : pct >= 60 ? 'secondary' : 'outline'
  return (
    <Badge variant={variant} className="text-xs gap-1">
      <Star className="h-3 w-3" />
      {pct}%
    </Badge>
  )
}

function SuggestieKaart({
  suggestie,
  dossier,
  onGebruik,
}: {
  suggestie: KennisbankSuggestie
  dossier: Dossier
  onGebruik: (text: string) => void
}) {
  const displayText = suggestie.templateCandidate && suggestie.templateText
    ? fillTemplate(suggestie.templateText, dossier)
    : suggestie.cleanText
  const preview = displayText.length > 150 ? displayText.slice(0, 150) + '…' : displayText

  const handleGebruik = () => {
    navigator.clipboard.writeText(displayText).then(() => {
      toast.success('Tekst gekopieerd naar klembord')
      onGebruik(displayText)
    }).catch(() => {
      toast.error('Kopiëren mislukt')
      onGebruik(displayText)
    })
  }

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-xs gap-1">
          <Tag className="h-3 w-3" />
          {CHUNK_TYPE_LABELS[suggestie.chunkType] ?? suggestie.chunkType}
        </Badge>
        <ReuseScoreBadge score={suggestie.reuseScore} />
        {suggestie.templateCandidate && (
          <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
            Template
          </Badge>
        )}
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">{preview}</p>

      {suggestie.templateCandidate && suggestie.variablesDetected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestie.variablesDetected.map((v) => (
            <span
              key={v}
              className="text-xs font-mono bg-muted rounded px-1 py-0.5 text-muted-foreground"
            >
              {`{{${v}}}`}
            </span>
          ))}
        </div>
      )}

      <Button size="sm" variant="outline" className="w-full gap-2" onClick={handleGebruik}>
        <Copy className="h-3.5 w-3.5" />
        Gebruiken
      </Button>
    </div>
  )
}

export function KennisbankSuggestiesPanel({
  open,
  onOpenChange,
  objectType,
  marketSegment,
  chapter,
  city,
  dossier,
  onGebruikTekst,
}: KennisbankSuggestiesPanelProps) {
  const { suggesties, isLoading, error, fetchSuggesties } = useKennisbankSuggestions()

  const [filterChapter, setFilterChapter] = useState<string>('alle')
  const [filterType, setFilterType] = useState<string>('alle')
  const [alleenTemplates, setAlleenTemplates] = useState(false)

  // Fetch when panel opens or key context changes
  useEffect(() => {
    if (!open) return
    fetchSuggesties({ objectType, marketSegment, chapter, city, limit: 30 })
  }, [open, objectType, marketSegment, chapter, city, fetchSuggesties])

  // Reset chapter filter to the active chapter when it changes
  useEffect(() => {
    setFilterChapter(chapter ?? 'alle')
  }, [chapter])

  const availableChapters = Array.from(new Set(suggesties.map((s) => s.chapter).filter(Boolean))).sort()
  const availableTypes = Array.from(new Set(suggesties.map((s) => s.chunkType).filter(Boolean))).sort()

  const filtered = suggesties.filter((s) => {
    if (filterChapter !== 'alle' && s.chapter !== filterChapter) return false
    if (filterType !== 'alle' && s.chunkType !== filterType) return false
    if (alleenTemplates && !s.templateCandidate) return false
    return true
  })

  const handleGebruik = useCallback((text: string) => {
    onGebruikTekst?.(text)
  }, [onGebruikTekst])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[480px] flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-4 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Books className="h-5 w-5 text-primary" />
              Kennisbank suggesties
            </SheetTitle>
            <SheetClose asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </SheetClose>
          </div>
          {chapter && (
            <p className="text-xs text-muted-foreground mt-1">
              Hoofdstuk: <span className="font-medium">{chapter}</span>
            </p>
          )}
        </SheetHeader>

        {/* Filters */}
        <div className="px-5 py-3 border-b space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Select value={filterChapter} onValueChange={setFilterChapter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Hoofdstuk" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle hoofdstukken</SelectItem>
                  {availableChapters.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle types</SelectItem>
                  {availableTypes.map((t) => (
                    <SelectItem key={t} value={t}>{CHUNK_TYPE_LABELS[t] ?? t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="alleen-templates"
              checked={alleenTemplates}
              onCheckedChange={setAlleenTemplates}
            />
            <Label htmlFor="alleen-templates" className="text-xs cursor-pointer">
              Alleen templates
            </Label>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 px-5 py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              Suggesties laden...
            </div>
          )}

          {!isLoading && error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {!isLoading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
              <Books className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {suggesties.length === 0
                  ? 'Geen suggesties gevonden in de kennisbank.'
                  : 'Geen suggesties die voldoen aan de filters.'}
              </p>
            </div>
          )}

          {!isLoading && !error && filtered.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {filtered.length} suggestie{filtered.length !== 1 ? 's' : ''} gevonden
              </p>
              <Separator />
              {filtered.map((suggestie) => (
                <SuggestieKaart
                  key={suggestie.id}
                  suggestie={suggestie}
                  dossier={dossier}
                  onGebruik={handleGebruik}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
