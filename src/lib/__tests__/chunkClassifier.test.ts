import { describe, it, expect } from 'vitest'
import { classifyChunk, classifyChunks } from '../chunkClassifier'
import type { RawChunk } from '../narrativeChunker'

function makeChunk(text: string, chapter = 'A', subchapter = ''): RawChunk {
  return { chapter, subchapter, rawText: text, cleanText: text }
}

describe('classifyChunk — chunkType detection', () => {
  it('detects "opsomming" for list-like text', () => {
    const text = `De volgende punten zijn van belang:
- Eerste punt met meer tekst
- Tweede punt met meer tekst
- Derde punt met meer tekst`
    const result = classifyChunk(makeChunk(text))
    expect(result.chunkType).toBe('opsomming')
  })

  it('detects "conclusie" when conclusion words are present', () => {
    const text = 'Concluderend kan worden gesteld dat de marktwaarde is vastgesteld op een bedrag conform de geldende normen.'
    const result = classifyChunk(makeChunk(text))
    expect(result.chunkType).toBe('conclusie')
  })

  it('detects "financieel" for financial text', () => {
    const text = 'De marktwaarde is bepaald op € 1.250.000,- op basis van de BAR/NAR-methode met een kapitalisatiefactor van 12.'
    const result = classifyChunk(makeChunk(text))
    expect(result.chunkType).toBe('financieel')
  })

  it('detects "juridisch" for legal text', () => {
    const text = 'De eigendomssituatie betreft vol eigendom. Er zijn geen erfpacht of zakelijke rechten bekend.'
    const result = classifyChunk(makeChunk(text))
    expect(result.chunkType).toBe('juridisch')
  })

  it('detects "technisch" for technical text', () => {
    const text = 'De fundering bestaat uit betonpalen. De dakbedekking is van het type bitumen. De installaties zijn in goede staat.'
    const result = classifyChunk(makeChunk(text))
    expect(result.chunkType).toBe('technisch')
  })

  it('defaults to "narratief" for plain descriptive text', () => {
    const text = 'Het object is gelegen in het centrum van de stad en heeft een goede ligging ten opzichte van voorzieningen.'
    const result = classifyChunk(makeChunk(text))
    expect(result.chunkType).toBe('narratief')
  })
})

describe('classifyChunk — writingFunction detection', () => {
  it('detects "concluderend" for conclusion text', () => {
    const text = 'Derhalve is de waarde vastgesteld op het genoemde bedrag conform de geldende waarderingsrichtlijnen.'
    const result = classifyChunk(makeChunk(text))
    expect(result.writingFunction).toBe('concluderend')
  })

  it('detects "vergelijkend" for comparison text', () => {
    const text = 'In vergelijking met de vergelijkingsobjecten uit de database is het referentiepand marktconform geprijsd.'
    const result = classifyChunk(makeChunk(text))
    expect(result.writingFunction).toBe('vergelijkend')
  })

  it('detects "beschrijvend" as default', () => {
    const text = 'Het pand is gelegen aan de Hoofdstraat en heeft een totale oppervlakte van 500 m2.'
    const result = classifyChunk(makeChunk(text))
    expect(result.writingFunction).toBe('beschrijvend')
  })
})

describe('classifyChunk — tone detection', () => {
  it('detects "formeel" tone', () => {
    const text = 'Derhalve dient de onderhavige taxatie te worden bezien in het licht van de terzake geldende bepalingen.'
    const result = classifyChunk(makeChunk(text))
    expect(result.tones).toContain('formeel')
  })

  it('detects "technisch" tone for technical vocabulary', () => {
    const text = 'Het BVO bedraagt 1200 m², het VVO is 980 m². De BAR is 6,5% en de kapitalisatiefactor 12.'
    const result = classifyChunk(makeChunk(text))
    expect(result.tones).toContain('technisch')
  })

  it('falls back to "informatief" when no specific tone detected', () => {
    const text = 'Dit is een gewone zin met alledaagse woorden zonder specifieke vakjargon of taalkenmerken.'
    const result = classifyChunk(makeChunk(text))
    expect(result.tones).toContain('informatief')
  })
})

describe('classifyChunk — specificity detection', () => {
  it('detects "object_specifiek" for text with address and monetary value', () => {
    const text = 'Het object aan Keizersgracht 123, 1015 CJ Amsterdam is getaxeerd op € 2.500.000,- op peildatum 01-01-2024.'
    const result = classifyChunk(makeChunk(text))
    expect(result.specificity).toBe('object_specifiek')
  })

  it('detects "standaard" for generic text without specific details', () => {
    const text = 'Het taxatierapport beschrijft de marktwaarde van het object op basis van gangbare waarderingsmethoden.'
    const result = classifyChunk(makeChunk(text))
    expect(result.specificity).toBe('standaard')
  })
})

describe('classifyChunk — reuseScore', () => {
  it('gives higher reuse score to generic text', () => {
    const generic = 'De taxatie is uitgevoerd conform de geldende NRVT-richtlijnen voor het taxeren van commercieel vastgoed.'
    const specific = 'Het object aan Hoofdstraat 1, 1234 AB Centrum is getaxeerd op € 1.500.000,- op 15-03-2024 door dhr. J. Jansen.'
    const genericResult = classifyChunk(makeChunk(generic))
    const specificResult = classifyChunk(makeChunk(specific))
    expect(genericResult.reuseScore).toBeGreaterThan(specificResult.reuseScore)
  })

  it('returns reuseScore between 0 and 1', () => {
    const text = 'Dit is een tekst met normale inhoud voor een taxatierapport zonder specifieke details van het object.'
    const result = classifyChunk(makeChunk(text))
    expect(result.reuseScore).toBeGreaterThanOrEqual(0)
    expect(result.reuseScore).toBeLessThanOrEqual(1)
  })
})

describe('classifyChunks', () => {
  it('classifies all chunks in the array', () => {
    const chunks: RawChunk[] = [
      makeChunk('De fundering bestaat uit betonpalen en is in goede staat bevonden tijdens de inspectie.', 'A', ''),
      makeChunk('De marktwaarde is vastgesteld op € 1.200.000 op basis van de vergelijkingsmethode.', 'B', 'B.1'),
    ]
    const results = classifyChunks(chunks)
    expect(results).toHaveLength(2)
    results.forEach((r) => {
      expect(r.chunkType).toBeDefined()
      expect(r.writingFunction).toBeDefined()
      expect(r.tones.length).toBeGreaterThan(0)
    })
  })
})
