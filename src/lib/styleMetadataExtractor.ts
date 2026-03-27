import type { DocumentWritingProfile, ToneOfVoice, DetailLevel, StandardizationLevel, MarketSegment } from '../types/kennisbank'
import type { ObjectType } from '../types'
import type { ClassifiedChunk } from './chunkClassifier'

/**
 * Known standard chapters from the taxatierapport template (A through L).
 * Used to calculate standardization level.
 */
const STANDARD_CHAPTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

/**
 * Determines the dominant tone of voice from classified chunks.
 */
function determineDominantTone(chunks: ClassifiedChunk[]): ToneOfVoice {
  const toneCount: Partial<Record<ToneOfVoice, number>> = {}

  for (const chunk of chunks) {
    for (const tone of chunk.tones) {
      toneCount[tone] = (toneCount[tone] ?? 0) + 1
    }
  }

  if (!Object.keys(toneCount).length) return 'neutraal'

  const sorted = (Object.entries(toneCount) as Array<[ToneOfVoice, number]>).sort(
    (a, b) => b[1] - a[1]
  )
  return sorted[0][0]
}

/**
 * Determines detail level based on average chunk length and total chunk count.
 */
function determineDetailLevel(chunks: ClassifiedChunk[]): DetailLevel {
  if (chunks.length === 0) return 'beknopt'

  const avgLength = chunks.reduce((sum, c) => sum + c.cleanText.length, 0) / chunks.length
  const totalLength = chunks.reduce((sum, c) => sum + c.cleanText.length, 0)

  if (totalLength < 2000 || avgLength < 100) return 'beknopt'
  if (avgLength < 250) return 'standaard'
  if (avgLength < 500) return 'uitgebreid'
  return 'zeer_uitgebreid'
}

/**
 * Determines standardization level based on how many known chapters are present.
 */
function determineStandardizationLevel(chunks: ClassifiedChunk[]): StandardizationLevel {
  const foundChapters = new Set(
    chunks
      .map((c) => c.chapter)
      .filter((ch) => STANDARD_CHAPTERS.includes(ch))
  )

  const ratio = foundChapters.size / STANDARD_CHAPTERS.length

  if (ratio >= 0.75) return 'hoog'
  if (ratio >= 0.4) return 'gemiddeld'
  return 'laag'
}

/**
 * Builds the dominant chapter structure from chunks (ordered by appearance).
 */
function buildDominantChapterStructure(chunks: ClassifiedChunk[]): string[] {
  const seen = new Set<string>()
  const structure: string[] = []

  for (const chunk of chunks) {
    const key = chunk.subchapter || chunk.chapter
    if (key && !seen.has(key)) {
      seen.add(key)
      structure.push(key)
    }
  }

  return structure
}

/**
 * Calculates overall reuse quality as weighted average of chunk reuse scores,
 * biased toward higher-scoring chunks.
 */
function calculateReuseQuality(chunks: ClassifiedChunk[]): number {
  if (chunks.length === 0) return 0

  const sorted = [...chunks].sort((a, b) => b.reuseScore - a.reuseScore)
  // Use top 50% of chunks for the quality score
  const topHalf = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)))
  const avg = topHalf.reduce((sum, c) => sum + c.reuseScore, 0) / topHalf.length
  return Math.round(avg * 100) / 100
}

/**
 * Tries to infer market segment from chunks (heuristic based on object type vocabulary).
 */
function inferMarketSegment(chunks: ClassifiedChunk[]): MarketSegment {
  const allText = chunks.map((c) => c.cleanText).join(' ').toLowerCase()

  const residentieel = ['woning', 'appartement', 'woonfunctie', 'woonhuis', 'huurwoning']
  const commercieel = ['kantoor', 'winkel', 'commercieel', 'retail', 'bedrijfsruimte', 'huurder', 'belegging']
  const industrieel = ['bedrijfshal', 'industrie', 'logistiek', 'productie', 'warehouse', 'opslag']
  const agrarisch = ['agrarisch', 'landbouw', 'perceel grond', 'akkerbouw', 'veeteelt']

  const residentiaalScore = residentieel.filter((w) => allText.includes(w)).length
  const commercieelScore = commercieel.filter((w) => allText.includes(w)).length
  const industrieelScore = industrieel.filter((w) => allText.includes(w)).length
  const agrarischScore = agrarisch.filter((w) => allText.includes(w)).length

  const max = Math.max(residentiaalScore, commercieelScore, industrieelScore, agrarischScore)
  if (max === 0) return 'overig'
  if (residentiaalScore === max) return 'residentieel'
  if (commercieelScore === max) return 'commercieel'
  if (industrieelScore === max) return 'industrieel'
  if (agrarischScore === max) return 'agrarisch'
  return 'overig'
}

/**
 * Extracts a DocumentWritingProfile from the classified chunks of a document.
 */
export function extractWritingProfile(
  documentId: string,
  chunks: ClassifiedChunk[],
  options?: {
    objectType?: ObjectType
    documentType?: string
  }
): DocumentWritingProfile {
  const toneOfVoice = determineDominantTone(chunks)
  const detailLevel = determineDetailLevel(chunks)
  const standardizationLevel = determineStandardizationLevel(chunks)
  const dominantChapterStructure = buildDominantChapterStructure(chunks)
  const reuseQuality = calculateReuseQuality(chunks)
  const marketSegment = inferMarketSegment(chunks)

  return {
    documentId,
    documentType: options?.documentType ?? 'taxatierapport',
    objectType: options?.objectType,
    marketSegment,
    toneOfVoice,
    detailLevel,
    standardizationLevel,
    dominantChapterStructure,
    reuseQuality,
  }
}
