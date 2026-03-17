import type { Dossier } from '@/types'

export function formatForFlux(text: string): string {
  let formatted = text

  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '$1')
  formatted = formatted.replace(/\*(.*?)\*/g, '$1')
  formatted = formatted.replace(/^#{1,6}\s+/gm, '')
  formatted = formatted.replace(/\[(.*?)\]\(.*?\)/g, '$1')

  formatted = formatted.replace(/(\d+)(\d{3})/g, '$1.$2')

  const lines = formatted.split('\n')
  const maxLength = 100
  const wrappedLines: string[] = []

  for (const line of lines) {
    if (line.length <= maxLength || line.trim() === '') {
      wrappedLines.push(line)
    } else {
      const words = line.split(' ')
      let currentLine = ''

      for (const word of words) {
        if ((currentLine + ' ' + word).length <= maxLength) {
          currentLine += (currentLine ? ' ' : '') + word
        } else {
          wrappedLines.push(currentLine)
          currentLine = word
        }
      }

      if (currentLine) {
        wrappedLines.push(currentLine)
      }
    }
  }

  formatted = wrappedLines.join('\n')

  formatted = formatted.replace(/\n{3,}/g, '\n\n')

  return formatted
}

export function formatDatum(datum: string): string {
  const d = new Date(datum)
  const dag = String(d.getDate()).padStart(2, '0')
  const maand = String(d.getMonth() + 1).padStart(2, '0')
  const jaar = d.getFullYear()
  return `${dag}-${maand}-${jaar}`
}

export function formatBedrag(bedrag: number): string {
  return `€ ${bedrag.toLocaleString('nl-NL')}`
}

export function formatOppervlakte(oppervlakte: number): string {
  return `${oppervlakte.toLocaleString('nl-NL')} m²`
}

export function formatPercentage(percentage: number): string {
  return `${percentage.toFixed(2).replace('.', ',')} %`
}

export function createFluxReport(dossier: Dossier): string {
  const secties = Object.values(dossier.rapportSecties)
    .map((sectie, index) => {
      const sectieNummer = index + 1
      const titel = sectie.titel.toUpperCase()
      const inhoud = formatForFlux(sectie.inhoud)
      return `${sectieNummer}. ${titel}\n\n${inhoud}`
    })
    .join('\n\n\n')

  return formatForFlux(secties)
}
