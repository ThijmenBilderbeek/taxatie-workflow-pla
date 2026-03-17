import { useState, useMemo } from 'react'
import type { HistorischRapport } from '../types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { MagnifyingGlass, MapPin, Buildings, Calendar, CurrencyCircleDollar, ChartBar } from '@phosphor-icons/react'

interface KennisbankProps {
  historischeRapporten: HistorischRapport[]
}

export function Kennisbank({ historischeRapporten }: KennisbankProps) {
  const [zoekterm, setZoekterm] = useState('')
  const [filterType, setFilterType] = useState<string>('alle')
  const [filterGebruiksdoel, setFilterGebruiksdoel] = useState<string>('alle')

  const stats = useMemo(() => {
    const totaal = historischeRapporten.length
    const perType: Record<string, number> = {}
    const perRegio: Record<string, number> = {}
    let totaleWaarde = 0

    historischeRapporten.forEach((rapport) => {
      perType[rapport.typeObject] = (perType[rapport.typeObject] || 0) + 1
      perRegio[rapport.adres.plaats] = (perRegio[rapport.adres.plaats] || 0) + 1
      totaleWaarde += rapport.marktwaarde
    })

    return {
      totaal,
      perType,
      perRegio,
      gemiddeldeWaarde: totaal > 0 ? totaleWaarde / totaal : 0,
    }
  }, [historischeRapporten])

  const gefilterdRapporten = useMemo(() => {
    return historischeRapporten.filter((rapport) => {
      const matchZoekterm =
        zoekterm === '' ||
        rapport.adres.straat.toLowerCase().includes(zoekterm.toLowerCase()) ||
        rapport.adres.plaats.toLowerCase().includes(zoekterm.toLowerCase()) ||
        rapport.adres.postcode.toLowerCase().includes(zoekterm.toLowerCase())

      const matchType = filterType === 'alle' || rapport.typeObject === filterType
      const matchGebruiksdoel =
        filterGebruiksdoel === 'alle' || rapport.gebruiksdoel === filterGebruiksdoel

      return matchZoekterm && matchType && matchGebruiksdoel
    })
  }, [historischeRapporten, zoekterm, filterType, filterGebruiksdoel])

  const formatBedrag = (bedrag: number) => {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(bedrag)
  }

  const formatDatum = (datum: string) => {
    return new Date(datum).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-foreground mb-2">Kennisbank</h1>
        <p className="text-muted-foreground">
          Overzicht van alle historische rapporten beschikbaar voor de similarity engine
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totaal Rapporten</CardTitle>
            <Buildings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{stats.totaal}</div>
            <p className="text-xs text-muted-foreground mt-1">In kennisbank</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gemiddelde Waarde</CardTitle>
            <CurrencyCircleDollar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatBedrag(stats.gemiddeldeWaarde)}</div>
            <p className="text-xs text-muted-foreground mt-1">Marktwaarde k.k.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Objecttypes</CardTitle>
            <ChartBar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{Object.keys(stats.perType).length}</div>
            <p className="text-xs text-muted-foreground mt-1">Verschillende types</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Regio's</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{Object.keys(stats.perRegio).length}</div>
            <p className="text-xs text-muted-foreground mt-1">Verschillende plaatsen</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters en zoeken</CardTitle>
          <CardDescription>
            Filter en doorzoek de kennisbank om specifieke rapporten te vinden
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="zoekterm">Zoeken</Label>
              <div className="relative">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="zoekterm"
                  placeholder="Adres, plaats, postcode..."
                  value={zoekterm}
                  onChange={(e) => setZoekterm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-type">Objecttype</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger id="filter-type">
                  <SelectValue placeholder="Alle types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle types</SelectItem>
                  <SelectItem value="kantoor">Kantoor</SelectItem>
                  <SelectItem value="bedrijfscomplex">Bedrijfscomplex</SelectItem>
                  <SelectItem value="bedrijfshal">Bedrijfshal</SelectItem>
                  <SelectItem value="winkel">Winkel</SelectItem>
                  <SelectItem value="woning">Woning</SelectItem>
                  <SelectItem value="appartement">Appartement</SelectItem>
                  <SelectItem value="overig">Overig</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-gebruiksdoel">Gebruiksdoel</Label>
              <Select value={filterGebruiksdoel} onValueChange={setFilterGebruiksdoel}>
                <SelectTrigger id="filter-gebruiksdoel">
                  <SelectValue placeholder="Alle gebruiksdoelen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle gebruiksdoelen</SelectItem>
                  <SelectItem value="eigenaar_gebruiker">Eigenaar-gebruiker</SelectItem>
                  <SelectItem value="verhuurd_belegging">Verhuurd / Belegging</SelectItem>
                  <SelectItem value="leegstand">Leegstand</SelectItem>
                  <SelectItem value="overig">Overig</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(zoekterm || filterType !== 'alle' || filterGebruiksdoel !== 'alle') && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {gefilterdRapporten.length} van {stats.totaal} rapporten gevonden
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setZoekterm('')
                  setFilterType('alle')
                  setFilterGebruiksdoel('alle')
                }}
              >
                Filters wissen
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historische rapporten</CardTitle>
          <CardDescription>
            Alle rapporten in de kennisbank die gebruikt kunnen worden voor similarity matching
          </CardDescription>
        </CardHeader>
        <CardContent>
          {gefilterdRapporten.length === 0 ? (
            <div className="text-center py-12">
              <Buildings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {stats.totaal === 0
                  ? 'Nog geen rapporten in de kennisbank'
                  : 'Geen rapporten gevonden met de huidige filters'}
              </p>
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Adres</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Gebruiksdoel</TableHead>
                    <TableHead className="text-right">GBO (m²)</TableHead>
                    <TableHead className="text-right">Marktwaarde</TableHead>
                    <TableHead className="text-right">BAR</TableHead>
                    <TableHead className="text-right">NAR</TableHead>
                    <TableHead>Peildatum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gefilterdRapporten.map((rapport) => (
                    <TableRow key={rapport.id}>
                      <TableCell>
                        <div className="font-medium">
                          {rapport.adres.straat} {rapport.adres.huisnummer}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {rapport.adres.postcode} {rapport.adres.plaats}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{rapport.typeObject}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {rapport.gebruiksdoel === 'eigenaar_gebruiker'
                            ? 'Eigenaar-gebruiker'
                            : rapport.gebruiksdoel === 'verhuurd_belegging'
                            ? 'Verhuurd'
                            : rapport.gebruiksdoel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {rapport.gbo.toLocaleString('nl-NL')}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatBedrag(rapport.marktwaarde)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {rapport.bar
                          ? `${rapport.bar.toLocaleString('nl-NL', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })} %`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {rapport.nar
                          ? `${rapport.nar.toLocaleString('nl-NL', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })} %`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDatum(rapport.waardepeildatum)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
