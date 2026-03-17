import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Slider } from './ui/slider'
import { Button } from './ui/button'
import type { SimilarityInstellingen, SimilarityFeedback } from '../types'
import { RotateCcw } from 'lucide-react'
import { DEFAULT_GEWICHTEN } from '../lib/similarity'

interface InstellingenProps {
  instellingen: SimilarityInstellingen
  feedback: SimilarityFeedback[]
  onUpdateInstellingen: (instellingen: SimilarityInstellingen) => void
}

export function Instellingen({
  instellingen,
  feedback,
  onUpdateInstellingen,
}: InstellingenProps) {
  const handleWeightChange = (key: keyof SimilarityInstellingen['gewichten'], value: number) => {
    const newGewichten = { ...instellingen.gewichten }
    newGewichten[key] = value

    const totaal = Object.values(newGewichten).reduce((sum, v) => sum + v, 0)
    const factor = 100 / totaal

    const normalized = {
      afstand: Math.round(newGewichten.afstand * factor),
      typeObject: Math.round(newGewichten.typeObject * factor),
      oppervlakte: Math.round(newGewichten.oppervlakte * factor),
      ouderheidRapport: Math.round(newGewichten.ouderheidRapport * factor),
      gebruiksdoel: Math.round(newGewichten.gebruiksdoel * factor),
    }

    onUpdateInstellingen({ gewichten: normalized })
  }

  const handleReset = () => {
    onUpdateInstellingen({ gewichten: DEFAULT_GEWICHTEN })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-semibold">Similarity Instellingen</h2>
          <p className="text-muted-foreground">
            Pas gewichten aan voor de similarity berekening
          </p>
        </div>
        <Button onClick={handleReset} variant="outline" className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset naar standaard
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gewichten Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Afstand</label>
                <span className="mono text-sm text-muted-foreground">
                  {instellingen.gewichten.afstand}%
                </span>
              </div>
              <Slider
                value={[instellingen.gewichten.afstand]}
                onValueChange={([value]) => handleWeightChange('afstand', value)}
                max={100}
                step={1}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Type Object</label>
                <span className="mono text-sm text-muted-foreground">
                  {instellingen.gewichten.typeObject}%
                </span>
              </div>
              <Slider
                value={[instellingen.gewichten.typeObject]}
                onValueChange={([value]) => handleWeightChange('typeObject', value)}
                max={100}
                step={1}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Oppervlakte</label>
                <span className="mono text-sm text-muted-foreground">
                  {instellingen.gewichten.oppervlakte}%
                </span>
              </div>
              <Slider
                value={[instellingen.gewichten.oppervlakte]}
                onValueChange={([value]) => handleWeightChange('oppervlakte', value)}
                max={100}
                step={1}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Ouderheid Rapport</label>
                <span className="mono text-sm text-muted-foreground">
                  {instellingen.gewichten.ouderheidRapport}%
                </span>
              </div>
              <Slider
                value={[instellingen.gewichten.ouderheidRapport]}
                onValueChange={([value]) => handleWeightChange('ouderheidRapport', value)}
                max={100}
                step={1}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Gebruiksdoel</label>
                <span className="mono text-sm text-muted-foreground">
                  {instellingen.gewichten.gebruiksdoel}%
                </span>
              </div>
              <Slider
                value={[instellingen.gewichten.gebruiksdoel]}
                onValueChange={([value]) => handleWeightChange('gebruiksdoel', value)}
                max={100}
                step={1}
              />
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>Totaal</span>
                <span className="mono">
                  {Object.values(instellingen.gewichten).reduce((s, v) => s + v, 0)}%
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feedback Overzicht</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {feedback.length === 0
              ? 'Nog geen feedback ontvangen'
              : `${feedback.length} feedback items verzameld`}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
