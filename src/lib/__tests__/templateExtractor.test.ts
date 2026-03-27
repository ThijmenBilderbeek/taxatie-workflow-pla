import { describe, it, expect } from 'vitest'
import { applyPlaceholders, extractTemplate } from '../templateExtractor'
import type { ClassifiedChunk } from '../chunkClassifier'

function makeClassifiedChunk(
  text: string,
  reuseScore: number,
  specificity: ClassifiedChunk['specificity'] = 'standaard'
): ClassifiedChunk {
  return {
    chapter: 'A',
    subchapter: '',
    rawText: text,
    cleanText: text,
    chunkType: 'narratief',
    writingFunction: 'beschrijvend',
    tones: ['informatief'],
    specificity,
    reuseScore,
  }
}

describe('applyPlaceholders', () => {
  it('replaces monetary values with {{marktwaarde}}', () => {
    const { templateText, variablesDetected } = applyPlaceholders(
      'De marktwaarde is vastgesteld op € 1.250.000,-.'
    )
    expect(templateText).toContain('{{marktwaarde}}')
    expect(variablesDetected).toContain('marktwaarde')
  })

  it('replaces short Dutch dates with {{datum}}', () => {
    const { templateText, variablesDetected } = applyPlaceholders(
      'De peildatum is 15-03-2024 en de inspectie vond plaats op 01/02/2024.'
    )
    expect(templateText).toContain('{{datum}}')
    expect(variablesDetected).toContain('datum')
  })

  it('replaces Dutch long-form dates with {{datum}}', () => {
    const { templateText, variablesDetected } = applyPlaceholders(
      'De taxatie heeft plaatsgevonden op 15 maart 2024.'
    )
    expect(templateText).toContain('{{datum}}')
    expect(variablesDetected).toContain('datum')
  })

  it('replaces surface areas with {{oppervlakte}}', () => {
    const { templateText, variablesDetected } = applyPlaceholders(
      'Het bruto vloeroppervlak bedraagt 1.250 m² en het vvo is 980 m2.'
    )
    expect(templateText).toContain('{{oppervlakte}}')
    expect(variablesDetected).toContain('oppervlakte')
  })

  it('replaces postcodes with {{postcode}}', () => {
    const { templateText, variablesDetected } = applyPlaceholders(
      'Het object is gelegen op postcode 1234 AB in Amsterdam.'
    )
    expect(templateText).toContain('{{postcode}}')
    expect(variablesDetected).toContain('postcode')
  })

  it('replaces percentages with {{percentage}}', () => {
    const { templateText, variablesDetected } = applyPlaceholders(
      'De BAR bedraagt 5,75% en de NAR is 4,50%.'
    )
    expect(templateText).toContain('{{percentage}}')
    expect(variablesDetected).toContain('percentage')
  })

  it('returns unchanged text when no patterns match', () => {
    const plainText = 'Dit is een gewone zin zonder specifieke waarden of adressen.'
    const { templateText, variablesDetected } = applyPlaceholders(plainText)
    expect(templateText).toBe(plainText)
    expect(variablesDetected).toHaveLength(0)
  })

  it('detects multiple variable types in one text', () => {
    const text = 'Het object aan postcode 1234 AB is getaxeerd op € 2.000.000,- op 01-01-2024.'
    const { variablesDetected } = applyPlaceholders(text)
    expect(variablesDetected.length).toBeGreaterThanOrEqual(2)
  })

  it('does not duplicate variable names', () => {
    const text = 'De waarde is € 1.000.000,- of € 1.200.000,-.'
    const { variablesDetected } = applyPlaceholders(text)
    const unique = new Set(variablesDetected)
    expect(unique.size).toBe(variablesDetected.length)
  })
})

describe('extractTemplate', () => {
  it('marks chunk as templateCandidate when reuseScore >= 0.6 and has variables', () => {
    const chunk = makeClassifiedChunk(
      'De taxatie heeft plaatsgevonden op 15-03-2024 met een waarde van € 1.500.000,-.',
      0.7,
      'gemengd'
    )
    const result = extractTemplate(chunk)
    expect(result.templateCandidate).toBe(true)
    expect(result.templateText).toBeDefined()
    expect(result.variablesDetected.length).toBeGreaterThan(0)
  })

  it('does not mark chunk as templateCandidate when reuseScore < 0.6', () => {
    const chunk = makeClassifiedChunk(
      'De taxatie heeft plaatsgevonden op 15-03-2024.',
      0.4,
      'object_specifiek'
    )
    const result = extractTemplate(chunk)
    expect(result.templateCandidate).toBe(false)
    expect(result.templateText).toBeUndefined()
  })

  it('does not set templateText when high reuse but no detectable variables', () => {
    const chunk = makeClassifiedChunk(
      'De taxatie is uitgevoerd conform de geldende richtlijnen en normen voor vastgoedwaardering.',
      0.8,
      'standaard'
    )
    const result = extractTemplate(chunk)
    // templateCandidate requires both high reuseScore AND detectable variables
    expect(result.templateCandidate).toBe(false)
    expect(result.templateText).toBeUndefined()
    expect(result.variablesDetected).toHaveLength(0)
  })

  it('sets reuseAsStyleExample for generic chunks with reuseScore >= 0.5', () => {
    const chunk = makeClassifiedChunk(
      'De taxateur heeft de standaard werkwijze gevolgd conform NRVT-richtlijnen.',
      0.6,
      'standaard'
    )
    const result = extractTemplate(chunk)
    expect(result.reuseAsStyleExample).toBe(true)
  })

  it('does not set reuseAsStyleExample for object_specifiek chunks', () => {
    const chunk = makeClassifiedChunk(
      'Het pand aan Hoofdstraat 1 te Amsterdam.',
      0.5,
      'object_specifiek'
    )
    const result = extractTemplate(chunk)
    expect(result.reuseAsStyleExample).toBe(false)
  })
})
