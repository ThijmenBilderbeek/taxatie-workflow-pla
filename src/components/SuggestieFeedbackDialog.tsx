import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Textarea } from './ui/textarea'
import { Label } from './ui/label'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { triggerFeedbackSamenvattingUpdate } from '@/lib/feedbackEnrichment'

const REDENEN = [
  { value: 'te_generiek', label: 'Te generiek' },
  { value: 'feitelijk_onjuist', label: 'Feitelijk onjuist' },
  { value: 'verkeerde_schrijfstijl', label: 'Verkeerde schrijfstijl' },
  { value: 'niet_relevant', label: 'Niet relevant voor dit object' },
  { value: 'anders', label: 'Anders' },
]

interface Props {
  open: boolean
  dossierId: string
  stap: number
  veldNaam: string
  gesuggeerdeTekst: string
  onClose: () => void
}

export function SuggestieFeedbackDialog({
  open,
  dossierId,
  stap,
  veldNaam,
  gesuggeerdeTekst,
  onClose,
}: Props) {
  const [reden, setReden] = useState<string>('')
  const [toelichting, setToelichting] = useState<string>('')
  const [isBezig, setIsBezig] = useState(false)

  const handleVerzenden = async () => {
    if (!reden) {
      toast.error('Selecteer een reden')
      return
    }

    setIsBezig(true)
    try {
      const { error } = await supabase.from('suggestie_feedback').insert({
        dossier_id: dossierId,
        stap,
        veld_naam: veldNaam,
        gesuggereerde_tekst: gesuggeerdeTekst,
        feedback_type: 'negatief',
        reden,
        toelichting: toelichting.trim() || null,
      })

      if (error) {
        throw error
      }

      // Trigger non-blocking summary update (Layer 1)
      triggerFeedbackSamenvattingUpdate(veldNaam, 'veld')

      toast.success('Feedback opgeslagen, bedankt!')
      setReden('')
      setToelichting('')
      onClose()
    } catch (err) {
      console.error('[SuggestieFeedbackDialog] fout bij opslaan:', err)
      toast.error('Feedback kon niet worden opgeslagen')
    } finally {
      setIsBezig(false)
    }
  }

  const handleAnnuleren = () => {
    setReden('')
    setToelichting('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) handleAnnuleren() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Suggestie afwijzen</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="feedback-reden">Wat klopt er niet aan de suggestie?</Label>
            <Select value={reden} onValueChange={setReden}>
              <SelectTrigger id="feedback-reden">
                <SelectValue placeholder="Selecteer een reden" />
              </SelectTrigger>
              <SelectContent>
                {REDENEN.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-toelichting">Toelichting (optioneel)</Label>
            <Textarea
              id="feedback-toelichting"
              placeholder="Geef meer details over wat er niet klopte..."
              value={toelichting}
              onChange={(e) => setToelichting(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleAnnuleren} disabled={isBezig}>
            Annuleren
          </Button>
          <Button onClick={handleVerzenden} disabled={isBezig || !reden}>
            {isBezig ? 'Bezig…' : 'Verzenden'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
