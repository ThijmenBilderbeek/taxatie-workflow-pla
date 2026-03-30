import { useState } from 'react'
import { useAIUsage } from '@/hooks/useAIUsage'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

type DateRange = 7 | 30 | 90

function formatCost(usd: number): string {
  if (usd < 0.001) return `$${(usd * 1000).toFixed(4)}m`
  return `$${usd.toFixed(4)}`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function SummaryCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}

export function AIUsageDashboard() {
  const [days, setDays] = useState<DateRange>(30)
  const {
    totalCost,
    totalCalls,
    totalTokens,
    cacheHitRate,
    costByModel,
    costByDossier,
    dailyUsage,
    recentCalls,
    isLoading,
    error,
  } = useAIUsage({ days })

  const dateRangeOptions: { label: string; value: DateRange }[] = [
    { label: '7 dagen', value: 7 },
    { label: '30 dagen', value: 30 },
    { label: '90 dagen', value: 90 },
  ]

  const modelChartData = Object.entries(costByModel).map(([model, cost]) => ({
    model,
    cost: Number(cost.toFixed(6)),
  }))

  const dailyChartData = dailyUsage.map((d) => ({
    date: d.date.slice(5), // MM-DD
    cost: Number(d.cost.toFixed(6)),
    calls: d.calls,
  }))

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-destructive">Fout bij laden van gebruiksdata: {error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">AI Gebruik Dashboard</h2>
          <p className="text-muted-foreground text-sm">OpenAI kostenmonitoring per gebruiker en dossier</p>
        </div>
        <div className="flex gap-2">
          {dateRangeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                days === opt.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-muted-foreground hover:border-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-20" /></CardContent>
            </Card>
          ))
        ) : (
          <>
            <SummaryCard title="Totale kosten" value={formatCost(totalCost)} sub={`laatste ${days} dagen`} />
            <SummaryCard title="API calls" value={totalCalls.toLocaleString()} sub={`laatste ${days} dagen`} />
            <SummaryCard title="Totale tokens" value={formatTokens(totalTokens)} />
            <SummaryCard
              title="Cache hit rate"
              value={`${cacheHitRate.toFixed(1)}%`}
              sub="calls via cache"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Cost per model */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kosten per model</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : modelChartData.length === 0 ? (
              <p className="text-muted-foreground text-sm">Geen data beschikbaar</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={modelChartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <XAxis dataKey="model" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(4)}`} width={64} />
                  <Tooltip formatter={(v: number) => formatCost(v)} labelFormatter={(l) => `Model: ${l}`} />
                  <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Daily usage chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dagelijks gebruik</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : dailyChartData.length === 0 ? (
              <p className="text-muted-foreground text-sm">Geen data beschikbaar</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={dailyChartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(4)}`} width={64} />
                  <Tooltip
                    formatter={(v: number, name: string) =>
                      name === 'cost' ? formatCost(v) : v
                    }
                    labelFormatter={(l) => `Datum: ${l}`}
                  />
                  <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top dossiers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top dossiers op kosten</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : costByDossier.length === 0 ? (
            <p className="text-muted-foreground text-sm">Geen dossier-data beschikbaar</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dossier ID</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Kosten (USD)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costByDossier.slice(0, 10).map((entry) => (
                  <TableRow key={entry.dossierId}>
                    <TableCell className="font-mono text-xs">{entry.dossierId}</TableCell>
                    <TableCell className="text-right">{entry.calls}</TableCell>
                    <TableCell className="text-right">{formatCost(entry.cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent calls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recente API calls</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : recentCalls.length === 0 ? (
            <p className="text-muted-foreground text-sm">Geen recente calls</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tijdstip</TableHead>
                    <TableHead>Sectie</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Kosten</TableHead>
                    <TableHead>Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentCalls.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString('nl-NL', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs font-mono" title={row.sectie_key}>
                        {row.sectie_key}
                      </TableCell>
                      <TableCell className="text-xs">{row.model}</TableCell>
                      <TableCell className="text-right text-xs">{formatTokens(row.total_tokens)}</TableCell>
                      <TableCell className="text-right text-xs">{formatCost(Number(row.estimated_cost_usd))}</TableCell>
                      <TableCell className="space-x-1">
                        {row.is_cached && <Badge variant="secondary" className="text-xs">Cache</Badge>}
                        {row.is_batch && <Badge variant="outline" className="text-xs">Batch</Badge>}
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
