import type { ChunkType, WritingFunction, ToneOfVoice, Specificity } from '../types/kennisbank'
import type { RawChunk } from './narrativeChunker'

export interface ClassifiedChunk extends RawChunk {
  chunkType: ChunkType
  writingFunction: WritingFunction
  tones: ToneOfVoice[]
  specificity: Specificity
  reuseScore: number
}

// ---------------------------------------------------------------------------
// ChunkType detection
// ---------------------------------------------------------------------------

const LIST_INDICATORS = [/^[\s]*[-•*]\s/m, /^[\s]*\d+[.)]\s/m]
const TABLE_INDICATORS = [/\t|  {3,}/]

const CONCLUSION_WORDS = [
  'concludeer', 'geconcludeerd', 'conclusie', 'samenvattend', 'samengevat',
  'derhalve', 'kortom', 'al met al', 'concluderend', 'eindoordeel',
  'waarderingsoordeel', 'vastgesteld',
]

const INTRO_WORDS = [
  'inleiding', 'ten aanzien van', 'in het kader van', 'onderwerp van deze',
  'dit rapport betreft', 'betreft de taxatie', 'opdracht betreft',
  'het betreft', 'de taxatie heeft betrekking', 'hierin beschrijven',
]

const LEGAL_WORDS = [
  'eigendomssituatie', 'erfpacht', 'hypotheek', 'zakelijk recht', 'kwalitatieve verplichting',
  'bestemmingsplan', 'omgevingsvergunning', 'eigendomsakte', 'kadaster',
  'huurcontract', 'contractueel', 'juridisch', 'privaatrechtelijk', 'publiekrechtelijk',
]

const TECHNICAL_WORDS = [
  'fundering', 'constructie', 'dakbedekking', 'installatie', 'verwarming',
  'bouwjaar', 'renovatie', 'asbest', 'bodemverontreiniging', 'energielabel',
  'onderhoud', 'bouwlaag', 'technische staat', 'exterieur', 'interieur',
]

const FINANCIAL_WORDS = [
  '€', 'euro', 'marktwaarde', 'huurprijs', 'bar', 'nar', 'kapitalisatiefactor',
  'opbrengst', 'rendement', 'waarde', 'kosten', 'investering', 'dcf',
  'nettohuur', 'brutohuur', 'markthuur', 'leegstandsrisico',
]

function detectChunkType(text: string): ChunkType {
  const lower = text.toLowerCase()

  // List blocks
  if (LIST_INDICATORS.some((r) => r.test(text))) return 'opsomming'

  // Table blocks
  if (TABLE_INDICATORS.some((r) => r.test(text))) return 'tabel'

  // Conclusion
  if (CONCLUSION_WORDS.some((w) => lower.includes(w))) return 'conclusie'

  // Introduction
  if (INTRO_WORDS.some((w) => lower.includes(w))) return 'inleiding'

  // Domain-specific
  if (LEGAL_WORDS.some((w) => lower.includes(w))) return 'juridisch'
  if (TECHNICAL_WORDS.some((w) => lower.includes(w))) return 'technisch'
  if (FINANCIAL_WORDS.some((w) => lower.includes(w))) return 'financieel'

  return 'narratief'
}

// ---------------------------------------------------------------------------
// WritingFunction detection
// ---------------------------------------------------------------------------

const ANALYZING_WORDS = [
  'analyse', 'vergelijk', 'beoordeeld', 'beoordeling', 'weging',
  'overweging', 'afgewogen', 'verhouding', 'ten opzichte van', 'relatief',
]

const CONCLUDING_WORDS = [
  'derhalve', 'hierdoor', 'waardoor', 'resulteer', 'leidt tot',
  'vastgesteld op', 'geconcludeerd', 'uitkomst', 'eindwaarde',
]

const LISTING_WORDS = [
  'als volgt', 'de volgende', 'onderstaand', 'opsomming', 'omvat',
  'bestaat uit', 'onderdelen', 'punten zijn',
]

const COMPARING_WORDS = [
  'vergelijkingsobject', 'referentie', 'transactie', 'vergeleken', 'vergelijkbaar',
  'marktconforme', 'marktprijs', 'transactieprijs',
]

const NORMATIVE_WORDS = [
  'dient', 'moet', 'is vereist', 'conform', 'overeenkomstig', 'volgens norm',
  'voldoet aan', 'voldoen aan', 'standaard', 'norm', 'wettelijk', 'regelgeving',
]

function detectWritingFunction(text: string): WritingFunction {
  const lower = text.toLowerCase()

  if (CONCLUDING_WORDS.some((w) => lower.includes(w))) return 'concluderend'
  if (COMPARING_WORDS.some((w) => lower.includes(w))) return 'vergelijkend'
  if (ANALYZING_WORDS.some((w) => lower.includes(w))) return 'analyserend'
  if (LISTING_WORDS.some((w) => lower.includes(w))) return 'opsommend'
  if (NORMATIVE_WORDS.some((w) => lower.includes(w))) return 'normatief'

  return 'beschrijvend'
}

// ---------------------------------------------------------------------------
// Tone detection
// ---------------------------------------------------------------------------

const FORMAL_INDICATORS = [
  'derhalve', 'mitsdien', 'terzake', 'zulks', 'alsook', 'alsmede', 'dientengevolge',
  'in casu', 'ten behoeve van', 'te dien aanzien', 'onderhavige',
]

const TECHNICAL_INDICATORS = [
  'bvo', 'vvo', 'bar', 'nar', 'dcf', 'energielabel', 'bouwlaag', 'fundering',
  'm²', 'kapitalisatiefactor', 'constructie', 'installaties',
]

const ZAKELIJK_INDICATORS = [
  'opdrachtgever', 'opdracht', 'taxateur', 'rapport', 'dossier', 'waarde',
  'object', 'perceel', 'taxatie', 'waardering',
]

function detectTones(text: string): ToneOfVoice[] {
  const lower = text.toLowerCase()
  const tones: ToneOfVoice[] = []

  if (FORMAL_INDICATORS.some((w) => lower.includes(w))) tones.push('formeel')
  if (TECHNICAL_INDICATORS.some((w) => lower.includes(w))) tones.push('technisch')
  if (ZAKELIJK_INDICATORS.some((w) => lower.includes(w))) tones.push('zakelijk')

  // Default to informatief if nothing else detected
  if (tones.length === 0) tones.push('informatief')

  return tones
}

// ---------------------------------------------------------------------------
// Specificity detection
// ---------------------------------------------------------------------------

// Patterns that indicate object-specific content
const ADDRESS_PATTERN = /\b[A-Za-zÀ-öø-ÿ\s]+\s+\d+[a-z]?\s*,?\s*\d{4}\s*[A-Z]{2}\b/
const MONETARY_PATTERN = /€\s*[\d.,]+/
const DATE_PATTERN = /\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b|\b\d{4}[-/]\d{2}[-/]\d{2}\b/
const SPECIFIC_NUMBER_PATTERN = /\b\d{3,}\b/
const NAME_PATTERN = /\b[A-Z][a-zà-öø-ÿ]+\s+[A-Z][a-zà-öø-ÿ]+\b/

function detectSpecificity(text: string): Specificity {
  let specificIndicators = 0
  if (ADDRESS_PATTERN.test(text)) specificIndicators += 2
  if (MONETARY_PATTERN.test(text)) specificIndicators += 1
  if (DATE_PATTERN.test(text)) specificIndicators += 1
  if (SPECIFIC_NUMBER_PATTERN.test(text)) specificIndicators += 1
  if (NAME_PATTERN.test(text)) specificIndicators += 1

  if (specificIndicators >= 3) return 'object_specifiek'
  if (specificIndicators >= 1) return 'gemengd'
  return 'standaard'
}

// ---------------------------------------------------------------------------
// Reuse score calculation
// ---------------------------------------------------------------------------

function calculateReuseScore(
  text: string,
  specificity: Specificity,
  chunkType: ChunkType
): number {
  let score = 0.5

  // Specificity impact
  if (specificity === 'standaard') score += 0.25
  else if (specificity === 'gemengd') score += 0.05
  else score -= 0.25

  // Chunk type bonuses
  if (chunkType === 'narratief' || chunkType === 'beschrijving') score += 0.1
  if (chunkType === 'inleiding') score += 0.1
  if (chunkType === 'conclusie') score -= 0.05
  if (chunkType === 'financieel') score -= 0.1

  // Penalize very short or very long chunks
  const len = text.length
  if (len < 100) score -= 0.1
  if (len > 1500) score -= 0.1

  // Bonus for template-like patterns (uses generic vocabulary)
  const genericWords = ['het object', 'de woning', 'het pand', 'het perceel', 'de taxatie', 'de waarde']
  const genericCount = genericWords.filter((w) => text.toLowerCase().includes(w)).length
  score += Math.min(genericCount * 0.05, 0.15)

  return Math.max(0, Math.min(1, score))
}

// ---------------------------------------------------------------------------
// Main classifier
// ---------------------------------------------------------------------------

/**
 * Classifies a raw chunk with type, writing function, tone, specificity, and reuse score.
 */
export function classifyChunk(chunk: RawChunk): ClassifiedChunk {
  const { cleanText } = chunk
  const chunkType = detectChunkType(cleanText)
  const writingFunction = detectWritingFunction(cleanText)
  const tones = detectTones(cleanText)
  const specificity = detectSpecificity(cleanText)
  const reuseScore = calculateReuseScore(cleanText, specificity, chunkType)

  return {
    ...chunk,
    chunkType,
    writingFunction,
    tones,
    specificity,
    reuseScore,
  }
}

/**
 * Classifies an array of raw chunks.
 */
export function classifyChunks(chunks: RawChunk[]): ClassifiedChunk[] {
  return chunks.map(classifyChunk)
}
