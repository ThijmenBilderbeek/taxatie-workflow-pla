import type { ClassifiedChunk } from './chunkClassifier'

export interface TemplateResult {
  templateCandidate: boolean
  templateText?: string
  variablesDetected: string[]
  reuseAsStyleExample: boolean
}

const REUSE_SCORE_THRESHOLD = 0.6

// ---------------------------------------------------------------------------
// Placeholder replacement patterns
// ---------------------------------------------------------------------------

interface PlaceholderRule {
  pattern: RegExp
  placeholder: string
  variable: string
}

const PLACEHOLDER_RULES: PlaceholderRule[] = [
  // Full Dutch address: "Straatnaam 12, 1234 AB Plaatsnaam" or "Straatnaam 12 te Plaatsnaam"
  // Components: [street name (2-30 chars)] [house number + optional letter] [postal code OR "te" + city]
  {
    pattern: /\b[A-Za-zÀ-öø-ÿ][A-Za-zÀ-öø-ÿ\s'-]{2,30}\s+\d+[a-z]?\s*(?:,?\s*\d{4}\s*[A-Z]{2}\b|\s+te\s+[A-Za-zÀ-öø-ÿ][A-Za-zÀ-öø-ÿ\s-]{2,25})/g,
    placeholder: '{{adres}}',
    variable: 'adres',
  },
  // Monetary values: € 1.234.567,- or € 1.234.567 or EUR 1.234.000
  {
    pattern: /(?:€|EUR)\s*[\d.,]+(?:,-)?/g,
    placeholder: '{{marktwaarde}}',
    variable: 'marktwaarde',
  },
  // Dutch long-form dates with optional day-of-week: "vrijdag 15 januari 2024" or "15 maart 2024"
  {
    pattern: /\b(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\s+\d{1,2}\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4}\b/gi,
    placeholder: '{{datum}}',
    variable: 'datum',
  },
  // Dutch numeric dates: "15-01-2024" or "15/01/2024", and Dutch month-name dates: "15 januari 2024"
  {
    pattern: /\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b|\b\d{1,2}\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4}\b/gi,
    placeholder: '{{datum}}',
    variable: 'datum',
  },
  // BAR/NAR percentages: "5,25%" or "6.50%"
  {
    pattern: /\b\d{1,2}[,.]?\d{0,2}\s*%/g,
    placeholder: '{{percentage}}',
    variable: 'percentage',
  },
  // Surface areas: "1.250 m²" or "1250 m2"
  {
    pattern: /\b[\d.,]+\s*m[²2]\b/g,
    placeholder: '{{oppervlakte}}',
    variable: 'oppervlakte',
  },
  // Build year with context keyword: "bouwjaar 1985" or "gebouwd in 1985"
  {
    pattern: /(?:bouwjaar|gebouwd in|bouwperiode)\s+\d{4}/gi,
    placeholder: 'bouwjaar {{bouwjaar}}',
    variable: 'bouwjaar',
  },
  // Dutch postal code: "1234 AB"
  {
    pattern: /\b\d{4}\s*[A-Z]{2}\b/g,
    placeholder: '{{postcode}}',
    variable: 'postcode',
  },
  // Dossier/reference number: "dossier 2024-001" or "referentie ABC-123"
  {
    pattern: /\b(?:dossier(?:nummer)?|referentie)\s*:?\s*[A-Z0-9-]{4,20}\b/gi,
    placeholder: 'dossier {{dossiernummer}}',
    variable: 'dossiernummer',
  },
]

/**
 * Applies placeholder rules to a text, replacing specific values with template variables.
 * Returns the template text and the list of detected variable names.
 */
export function applyPlaceholders(text: string): { templateText: string; variablesDetected: string[] } {
  let templateText = text
  const variablesDetected: string[] = []

  for (const rule of PLACEHOLDER_RULES) {
    const before = templateText
    templateText = templateText.replace(rule.pattern, rule.placeholder)
    if (templateText !== before && !variablesDetected.includes(rule.variable)) {
      variablesDetected.push(rule.variable)
    }
  }

  return { templateText, variablesDetected }
}

/**
 * Determines if a chunk is a good template candidate and if it can serve as a style example.
 * Applies placeholder substitution for template candidates.
 */
export function extractTemplate(chunk: ClassifiedChunk): TemplateResult {
  const { cleanText, reuseScore, specificity } = chunk

  const reuseAsStyleExample = reuseScore >= 0.5 && specificity !== 'object_specifiek'

  if (reuseScore < REUSE_SCORE_THRESHOLD) {
    return {
      templateCandidate: false,
      variablesDetected: [],
      reuseAsStyleExample,
    }
  }

  // Apply placeholders
  const { templateText, variablesDetected } = applyPlaceholders(cleanText)

  // A chunk is a proper template candidate if it has detectable variables
  const templateCandidate = variablesDetected.length > 0

  return {
    templateCandidate,
    templateText: templateCandidate ? templateText : undefined,
    variablesDetected,
    reuseAsStyleExample,
  }
}

/**
 * Applies template extraction to an array of classified chunks.
 */
export function extractTemplates(chunks: ClassifiedChunk[]): Array<ClassifiedChunk & TemplateResult> {
  return chunks.map((chunk) => ({
    ...chunk,
    ...extractTemplate(chunk),
  }))
}
