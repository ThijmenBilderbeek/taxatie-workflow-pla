/**
 * AI-based fallback extractor for PDF taxatierapport fields.
 *
 * This module calls the `openai-pdf-extract` Supabase Edge Function when the
 * regex-based parser leaves fields empty.  The AI call is optional — if it
 * fails for any reason the calling code falls back gracefully to the regex-only
 * result.
 */

import { supabase } from './supabaseClient'
import type { HistorischRapport, ObjectType, Gebruiksdoel, Ligging, Energielabel, Dossier, AlgemeneGegevens, AdresLocatie, Oppervlaktes, Huurgegevens, JuridischeInfo, TechnischeStaat, Vergunningen, Waardering, WaarderingsMethode, Aannames } from '../types'
import type { ExtractionDebugRecord } from './pdfFieldExtractors'

/** Maximum PDF text length to send to the AI (cost-conscious). */
const MAX_TEXT_CHARS = 20000

/** Per-field AI result returned by the edge function. */
interface AIFieldResult {
  value: unknown
  confidence: 'high' | 'medium' | 'low'
}

/** Shape of the edge function response. */
type EdgeFunctionResponse = Record<string, AIFieldResult>

/**
 * Determines which fields are missing / empty in the current regex result.
 * Returns an array of field names to request from the AI.
 */
function getMissingFields(result: Partial<HistorischRapport>): string[] {
  const missing: string[] = []

  if (!result.adres?.straat) missing.push('straat')
  if (!result.adres?.huisnummer) missing.push('huisnummer')
  if (!result.adres?.postcode) missing.push('postcode')
  if (!result.adres?.plaats) missing.push('plaats')
  if (!result.typeObject) missing.push('typeObject')
  if (!result.gebruiksdoel) missing.push('gebruiksdoel')
  if (!result.bvo) missing.push('bvo')
  if (!result.wizardData?.stap3?.vvo) missing.push('vvo')
  if (!result.wizardData?.stap3?.perceeloppervlak) missing.push('perceeloppervlak')
  if (!result.marktwaarde) missing.push('marktwaarde')
  if (!result.bar) missing.push('bar')
  if (!result.nar) missing.push('nar')
  if (!result.waardepeildatum) missing.push('waardepeildatum')
  if (!result.wizardData?.stap1?.inspectiedatum) missing.push('inspectiedatum')
  if (!result.wizardData?.stap3?.bouwjaar) missing.push('bouwjaar')
  if (!result.wizardData?.stap1?.naamTaxateur) missing.push('naamTaxateur')
  if (!result.wizardData?.stap1?.objectnaam) missing.push('objectnaam')
  if (!result.wizardData?.stap2?.gemeente) missing.push('gemeente')
  if (!result.wizardData?.stap2?.provincie) missing.push('provincie')
  if (!result.wizardData?.stap2?.bereikbaarheid) missing.push('bereikbaarheid')
  if (!result.wizardData?.stap2?.omgevingEnBelendingen) missing.push('omgevingEnBelendingen')
  if (!result.wizardData?.stap2?.voorzieningen) missing.push('voorzieningen')
  if (!result.wizardData?.stap2?.verwachteOntwikkelingen) missing.push('verwachteOntwikkelingen')
  if (!result.wizardData?.stap2?.locatiescore) missing.push('locatiescore')
  if (!result.wizardData?.stap7?.energielabel) missing.push('energielabel')
  if (!result.wizardData?.stap8?.kapitalisatiefactor) missing.push('kapitalisatiefactor')
  if (!result.wizardData?.stap4?.markthuurPerJaar) missing.push('markthuurPerJaar')
  if (!result.wizardData?.stap4?.huurprijsPerJaar) missing.push('huurprijsPerJaar')
  if (!result.wizardData?.stap4?.huurder) missing.push('huurder')
  if (!result.wizardData?.stap5?.eigendomssituatie) missing.push('eigendomssituatie')
  if (!result.wizardData?.stap5?.bestemmingsplan) missing.push('bestemmingsplan')
  if (!result.wizardData?.stap5?.erfpacht) missing.push('erfpacht')
  if (!result.wizardData?.stap5?.zakelijkeRechten) missing.push('zakelijkeRechten')
  if (!result.wizardData?.stap5?.teTaxerenBelang) missing.push('teTaxerenBelang')
  if (!result.wizardData?.stap2?.ligging) missing.push('ligging')
  if (!result.wizardData?.stap3?.aantalBouwlagen) missing.push('aantalBouwlagen')
  if (!result.wizardData?.stap6?.constructie) missing.push('constructie')
  if (!result.wizardData?.stap6?.fundering) missing.push('fundering')
  if (!result.wizardData?.stap6?.dakbedekking) missing.push('dakbedekking')
  if (!result.wizardData?.stap7?.asbest) missing.push('asbest')
  if (!result.wizardData?.stap7?.bodemverontreiniging) missing.push('bodemverontreiniging')
  if (!result.wizardData?.stap8?.methode) missing.push('waarderingsmethode')
  if (!result.wizardData?.stap9?.aannames) missing.push('aannames')
  if (!result.wizardData?.stap9?.voorbehouden) missing.push('voorbehouden')
  if (!result.wizardData?.stap9?.swotSterktes) missing.push('swotSterktes')
  if (!result.wizardData?.stap9?.swotZwaktes) missing.push('swotZwaktes')
  if (!result.wizardData?.stap9?.swotKansen) missing.push('swotKansen')
  if (!result.wizardData?.stap9?.swotBedreigingen) missing.push('swotBedreigingen')

  return missing
}

/** Valid ObjectType values. */
const VALID_OBJECT_TYPES = new Set<string>(['kantoor', 'bedrijfscomplex', 'bedrijfshal', 'winkel', 'woning', 'appartement', 'overig'])
/** Valid Gebruiksdoel values. */
const VALID_GEBRUIKSDOELEN = new Set<string>(['eigenaar_gebruiker', 'verhuurd_belegging', 'leegstand', 'overig'])
/** Valid Ligging values. */
const VALID_LIGGING = new Set<string>(['binnenstad', 'woonwijk', 'bedrijventerrein', 'buitengebied', 'gemengd'])
/** Valid Energielabel values. */
const VALID_ENERGIELABELS = new Set<string>(['A++++', 'A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'geen'])
/** Valid Asbest / Bodemverontreiniging values. */
const VALID_JA_NEE_ONBEKEND = new Set<string>(['ja', 'nee', 'onbekend'])
/** Valid WaarderingsMethode values. */
const VALID_WAARDERINGSMETHODE = new Set<string>(['vergelijkingsmethode', 'BAR_NAR', 'DCF', 'kostenmethode', 'combinatie'])

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string') {
    // Handle Dutch decimal notation (comma as separator)
    const normalized = v.replace(/\./g, '').replace(',', '.')
    const n = parseFloat(normalized)
    if (isFinite(n)) return n
  }
  return undefined
}

function toString(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  return undefined
}

/**
 * Merges AI-extracted fields into the current (regex-only) result.
 *
 * - Regex results always take precedence over AI results.
 * - AI-filled fields get `confidence: 'medium'` and `sourceType: 'ai'` in the debug record.
 * - Returns the merged result and the AI debug entries.
 */
export async function aiExtractMissingFields(
  text: string,
  currentResult: Partial<HistorischRapport>
): Promise<{ result: Partial<HistorischRapport>; aiDebug: ExtractionDebugRecord }> {
  const missingFields = getMissingFields(currentResult)

  if (missingFields.length === 0) {
    return { result: currentResult, aiDebug: {} }
  }

  const truncatedText = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) + '…' : text

  const { data, error } = await supabase.functions.invoke('openai-pdf-extract', {
    body: { text: truncatedText, missingFields },
  })

  if (error || !data) {
    throw new Error(error?.message ?? 'No data from AI extractor')
  }

  const fields = data as EdgeFunctionResponse
  const merged: Partial<HistorischRapport> = { ...currentResult }
  const aiDebug: ExtractionDebugRecord = {}

  // Helper to record an AI-filled debug entry
  const recordAI = (key: string, value: unknown, confidence: 'high' | 'medium' | 'low' = 'medium') => {
    aiDebug[key] = {
      value,
      confidence,
      sourceLabel: '(ai)',
      sourceSnippet: String(value).slice(0, 80),
      sourceSection: undefined,
      parserRule: 'openai-pdf-extract',
      sourceType: 'ai',
    }
  }

  // Ensure nested objects exist
  if (!merged.adres) {
    merged.adres = { straat: '', huisnummer: '', postcode: '', plaats: '' }
  }
  if (!merged.wizardData) merged.wizardData = {}

  // Adres fields
  if (fields.straat?.value && !currentResult.adres?.straat) {
    const v = toString(fields.straat.value)
    if (v) { merged.adres!.straat = v; recordAI('straat', v, fields.straat.confidence) }
  }
  if (fields.huisnummer?.value && !currentResult.adres?.huisnummer) {
    const v = toString(fields.huisnummer.value)
    if (v) { merged.adres!.huisnummer = v; recordAI('huisnummer', v, fields.huisnummer.confidence) }
  }
  if (fields.postcode?.value && !currentResult.adres?.postcode) {
    const v = toString(fields.postcode.value)
    if (v) { merged.adres!.postcode = v; recordAI('postcode', v, fields.postcode.confidence) }
  }
  if (fields.plaats?.value && !currentResult.adres?.plaats) {
    const v = toString(fields.plaats.value)
    if (v) { merged.adres!.plaats = v; recordAI('plaats', v, fields.plaats.confidence) }
  }

  // TypeObject
  if (fields.typeObject?.value && !currentResult.typeObject) {
    const v = toString(fields.typeObject.value)
    if (v && VALID_OBJECT_TYPES.has(v)) {
      merged.typeObject = v as ObjectType
      recordAI('typeObject', v, fields.typeObject.confidence)
    }
  }

  // Gebruiksdoel
  if (fields.gebruiksdoel?.value && !currentResult.gebruiksdoel) {
    const v = toString(fields.gebruiksdoel.value)
    if (v && VALID_GEBRUIKSDOELEN.has(v)) {
      merged.gebruiksdoel = v as Gebruiksdoel
      recordAI('gebruiksdoel', v, fields.gebruiksdoel.confidence)
    }
  }

  // BVO
  if (fields.bvo?.value && !currentResult.bvo) {
    const v = toNumber(fields.bvo.value)
    if (v !== undefined && v > 0) { merged.bvo = v; recordAI('bvo', v, fields.bvo.confidence) }
  }

  // Marktwaarde
  if (fields.marktwaarde?.value && !currentResult.marktwaarde) {
    const v = toNumber(fields.marktwaarde.value)
    if (v !== undefined && v > 0) { merged.marktwaarde = v; recordAI('marktwaarde', v, fields.marktwaarde.confidence) }
  }

  // BAR
  if (fields.bar?.value && !currentResult.bar) {
    const v = toNumber(fields.bar.value)
    if (v !== undefined && v > 0) { merged.bar = v; recordAI('bar', v, fields.bar.confidence) }
  }

  // NAR
  if (fields.nar?.value && !currentResult.nar) {
    const v = toNumber(fields.nar.value)
    if (v !== undefined && v > 0) { merged.nar = v; recordAI('nar', v, fields.nar.confidence) }
  }

  // Waardepeildatum
  if (fields.waardepeildatum?.value && !currentResult.waardepeildatum) {
    const v = toString(fields.waardepeildatum.value)
    if (v) { merged.waardepeildatum = v; recordAI('waardepeildatum', v, fields.waardepeildatum.confidence) }
  }

  // WizardData stap1
  if (!merged.wizardData!.stap1) merged.wizardData!.stap1 = {} as AlgemeneGegevens
  const stap1 = merged.wizardData!.stap1!

  if (fields.inspectiedatum?.value && !currentResult.wizardData?.stap1?.inspectiedatum) {
    const v = toString(fields.inspectiedatum.value)
    if (v) { stap1.inspectiedatum = v; recordAI('inspectiedatum', v, fields.inspectiedatum.confidence) }
  }
  if (fields.naamTaxateur?.value && !currentResult.wizardData?.stap1?.naamTaxateur) {
    const v = toString(fields.naamTaxateur.value)
    if (v) { stap1.naamTaxateur = v; recordAI('naamTaxateur', v, fields.naamTaxateur.confidence) }
  }
  if (fields.objectnaam?.value && !currentResult.wizardData?.stap1?.objectnaam) {
    const v = toString(fields.objectnaam.value)
    if (v) { stap1.objectnaam = v; recordAI('objectnaam', v, fields.objectnaam.confidence) }
  }

  // WizardData stap2
  if (!merged.wizardData!.stap2) merged.wizardData!.stap2 = {} as AdresLocatie
  const stap2 = merged.wizardData!.stap2!

  if (fields.gemeente?.value && !currentResult.wizardData?.stap2?.gemeente) {
    const v = toString(fields.gemeente.value)
    if (v) { stap2.gemeente = v; recordAI('gemeente', v, fields.gemeente.confidence) }
  }
  if (fields.provincie?.value && !currentResult.wizardData?.stap2?.provincie) {
    const v = toString(fields.provincie.value)
    if (v) { stap2.provincie = v; recordAI('provincie', v, fields.provincie.confidence) }
  }
  if (fields.ligging?.value && !currentResult.wizardData?.stap2?.ligging) {
    const v = toString(fields.ligging.value)
    if (v && VALID_LIGGING.has(v)) {
      stap2.ligging = v as Ligging
      recordAI('ligging', v, fields.ligging.confidence)
    }
  }
  if (fields.bereikbaarheid?.value && !currentResult.wizardData?.stap2?.bereikbaarheid) {
    const v = toString(fields.bereikbaarheid.value)
    if (v) { stap2.bereikbaarheid = v; recordAI('bereikbaarheid', v, fields.bereikbaarheid.confidence) }
  }
  if (fields.omgevingEnBelendingen?.value && !currentResult.wizardData?.stap2?.omgevingEnBelendingen) {
    const v = toString(fields.omgevingEnBelendingen.value)
    if (v) { stap2.omgevingEnBelendingen = v; recordAI('omgevingEnBelendingen', v, fields.omgevingEnBelendingen.confidence) }
  }
  if (fields.voorzieningen?.value && !currentResult.wizardData?.stap2?.voorzieningen) {
    const v = toString(fields.voorzieningen.value)
    if (v) { stap2.voorzieningen = v; recordAI('voorzieningen', v, fields.voorzieningen.confidence) }
  }
  if (fields.verwachteOntwikkelingen?.value && !currentResult.wizardData?.stap2?.verwachteOntwikkelingen) {
    const v = toString(fields.verwachteOntwikkelingen.value)
    if (v) { stap2.verwachteOntwikkelingen = v; recordAI('verwachteOntwikkelingen', v, fields.verwachteOntwikkelingen.confidence) }
  }
  if (fields.locatiescore?.value && !currentResult.wizardData?.stap2?.locatiescore) {
    const v = toString(fields.locatiescore.value)
    if (v) { stap2.locatiescore = v; recordAI('locatiescore', v, fields.locatiescore.confidence) }
  }

  // WizardData stap3
  if (!merged.wizardData!.stap3) merged.wizardData!.stap3 = {} as Oppervlaktes
  const stap3 = merged.wizardData!.stap3!

  if (fields.vvo?.value && !currentResult.wizardData?.stap3?.vvo) {
    const v = toNumber(fields.vvo.value)
    if (v !== undefined && v > 0) { stap3.vvo = v; recordAI('vvo', v, fields.vvo.confidence) }
  }
  if (fields.perceeloppervlak?.value && !currentResult.wizardData?.stap3?.perceeloppervlak) {
    const v = toNumber(fields.perceeloppervlak.value)
    if (v !== undefined && v > 0) { stap3.perceeloppervlak = v; recordAI('perceeloppervlak', v, fields.perceeloppervlak.confidence) }
  }
  if (fields.bouwjaar?.value && !currentResult.wizardData?.stap3?.bouwjaar) {
    const v = toNumber(fields.bouwjaar.value)
    if (v !== undefined && v > 1800 && v <= new Date().getFullYear()) {
      stap3.bouwjaar = v
      recordAI('bouwjaar', v, fields.bouwjaar.confidence)
    }
  }
  if (fields.aantalBouwlagen?.value && !currentResult.wizardData?.stap3?.aantalBouwlagen) {
    const v = toNumber(fields.aantalBouwlagen.value)
    if (v !== undefined && v > 0) { stap3.aantalBouwlagen = v; recordAI('aantalBouwlagen', v, fields.aantalBouwlagen.confidence) }
  }

  // WizardData stap4
  if (!merged.wizardData!.stap4) merged.wizardData!.stap4 = {} as Huurgegevens
  const stap4 = merged.wizardData!.stap4!

  if (fields.markthuurPerJaar?.value && !currentResult.wizardData?.stap4?.markthuurPerJaar) {
    const v = toNumber(fields.markthuurPerJaar.value)
    if (v !== undefined && v > 0) { stap4.markthuurPerJaar = v; recordAI('markthuurPerJaar', v, fields.markthuurPerJaar.confidence) }
  }
  if (fields.huurprijsPerJaar?.value && !currentResult.wizardData?.stap4?.huurprijsPerJaar) {
    const v = toNumber(fields.huurprijsPerJaar.value)
    if (v !== undefined && v > 0) { stap4.huurprijsPerJaar = v; recordAI('huurprijsPerJaar', v, fields.huurprijsPerJaar.confidence) }
  }
  if (fields.huurder?.value && !currentResult.wizardData?.stap4?.huurder) {
    const v = toString(fields.huurder.value)
    if (v) { stap4.huurder = v; recordAI('huurder', v, fields.huurder.confidence) }
  }

  // WizardData stap5
  if (!merged.wizardData!.stap5) merged.wizardData!.stap5 = {} as JuridischeInfo
  const stap5 = merged.wizardData!.stap5!

  if (fields.eigendomssituatie?.value && !currentResult.wizardData?.stap5?.eigendomssituatie) {
    const v = toString(fields.eigendomssituatie.value)
    if (v) { stap5.eigendomssituatie = v; recordAI('eigendomssituatie', v, fields.eigendomssituatie.confidence) }
  }
  if (fields.bestemmingsplan?.value && !currentResult.wizardData?.stap5?.bestemmingsplan) {
    const v = toString(fields.bestemmingsplan.value)
    if (v) { stap5.bestemmingsplan = v; recordAI('bestemmingsplan', v, fields.bestemmingsplan.confidence) }
  }
  if (fields.erfpacht?.value && !currentResult.wizardData?.stap5?.erfpacht) {
    const v = toString(fields.erfpacht.value)
    if (v) { stap5.erfpacht = v; recordAI('erfpacht', v, fields.erfpacht.confidence) }
  }
  if (fields.zakelijkeRechten?.value && !currentResult.wizardData?.stap5?.zakelijkeRechten) {
    const v = toString(fields.zakelijkeRechten.value)
    if (v) { stap5.zakelijkeRechten = v; recordAI('zakelijkeRechten', v, fields.zakelijkeRechten.confidence) }
  }
  if (fields.teTaxerenBelang?.value && !currentResult.wizardData?.stap5?.teTaxerenBelang) {
    const v = toString(fields.teTaxerenBelang.value)
    if (v) { stap5.teTaxerenBelang = v; recordAI('teTaxerenBelang', v, fields.teTaxerenBelang.confidence) }
  }

  // WizardData stap6
  if (!merged.wizardData!.stap6) merged.wizardData!.stap6 = {} as TechnischeStaat
  const stap6 = merged.wizardData!.stap6!

  if (fields.constructie?.value && !currentResult.wizardData?.stap6?.constructie) {
    const v = toString(fields.constructie.value)
    if (v) { stap6.constructie = v; recordAI('constructie', v, fields.constructie.confidence) }
  }
  if (fields.fundering?.value && !currentResult.wizardData?.stap6?.fundering) {
    const v = toString(fields.fundering.value)
    if (v) { stap6.fundering = v; recordAI('fundering', v, fields.fundering.confidence) }
  }
  if (fields.dakbedekking?.value && !currentResult.wizardData?.stap6?.dakbedekking) {
    const v = toString(fields.dakbedekking.value)
    if (v) { stap6.dakbedekking = v; recordAI('dakbedekking', v, fields.dakbedekking.confidence) }
  }

  // WizardData stap7
  if (fields.energielabel?.value && !currentResult.wizardData?.stap7?.energielabel) {
    if (!merged.wizardData!.stap7) merged.wizardData!.stap7 = {} as Vergunningen
    const v = toString(fields.energielabel.value)
    if (v && VALID_ENERGIELABELS.has(v)) {
      merged.wizardData!.stap7!.energielabel = v as Energielabel
      recordAI('energielabel', v, fields.energielabel.confidence)
    }
  }
  if (fields.asbest?.value && !currentResult.wizardData?.stap7?.asbest) {
    if (!merged.wizardData!.stap7) merged.wizardData!.stap7 = {} as Vergunningen
    const v = toString(fields.asbest.value)
    if (v && VALID_JA_NEE_ONBEKEND.has(v)) {
      merged.wizardData!.stap7!.asbest = v as 'ja' | 'nee' | 'onbekend'
      recordAI('asbest', v, fields.asbest.confidence)
    }
  }
  if (fields.bodemverontreiniging?.value && !currentResult.wizardData?.stap7?.bodemverontreiniging) {
    if (!merged.wizardData!.stap7) merged.wizardData!.stap7 = {} as Vergunningen
    const v = toString(fields.bodemverontreiniging.value)
    if (v && VALID_JA_NEE_ONBEKEND.has(v)) {
      merged.wizardData!.stap7!.bodemverontreiniging = v as 'ja' | 'nee' | 'onbekend'
      recordAI('bodemverontreiniging', v, fields.bodemverontreiniging.confidence)
    }
  }

  // WizardData stap8
  if (!merged.wizardData!.stap8) merged.wizardData!.stap8 = {} as Waardering
  const stap8 = merged.wizardData!.stap8!

  if (fields.kapitalisatiefactor?.value && !currentResult.wizardData?.stap8?.kapitalisatiefactor) {
    const v = toNumber(fields.kapitalisatiefactor.value)
    if (v !== undefined && v > 0) { stap8.kapitalisatiefactor = v; recordAI('kapitalisatiefactor', v, fields.kapitalisatiefactor.confidence) }
  }
  if (fields.waarderingsmethode?.value && !currentResult.wizardData?.stap8?.methode) {
    const v = toString(fields.waarderingsmethode.value)
    if (v && VALID_WAARDERINGSMETHODE.has(v)) {
      stap8.methode = v as WaarderingsMethode
      recordAI('waarderingsmethode', v, fields.waarderingsmethode.confidence)
    }
  }

  // WizardData stap9
  if (!merged.wizardData!.stap9) merged.wizardData!.stap9 = {} as Aannames
  const stap9 = merged.wizardData!.stap9!

  if (fields.aannames?.value && !currentResult.wizardData?.stap9?.aannames) {
    const v = toString(fields.aannames.value)
    if (v) { stap9.aannames = v; recordAI('aannames', v, fields.aannames.confidence) }
  }
  if (fields.voorbehouden?.value && !currentResult.wizardData?.stap9?.voorbehouden) {
    const v = toString(fields.voorbehouden.value)
    if (v) { stap9.voorbehouden = v; recordAI('voorbehouden', v, fields.voorbehouden.confidence) }
  }
  if (fields.swotSterktes?.value && !currentResult.wizardData?.stap9?.swotSterktes) {
    const v = toString(fields.swotSterktes.value)
    if (v) { stap9.swotSterktes = v; recordAI('swotSterktes', v, fields.swotSterktes.confidence) }
  }
  if (fields.swotZwaktes?.value && !currentResult.wizardData?.stap9?.swotZwaktes) {
    const v = toString(fields.swotZwaktes.value)
    if (v) { stap9.swotZwaktes = v; recordAI('swotZwaktes', v, fields.swotZwaktes.confidence) }
  }
  if (fields.swotKansen?.value && !currentResult.wizardData?.stap9?.swotKansen) {
    const v = toString(fields.swotKansen.value)
    if (v) { stap9.swotKansen = v; recordAI('swotKansen', v, fields.swotKansen.confidence) }
  }
  if (fields.swotBedreigingen?.value && !currentResult.wizardData?.stap9?.swotBedreigingen) {
    const v = toString(fields.swotBedreigingen.value)
    if (v) { stap9.swotBedreigingen = v; recordAI('swotBedreigingen', v, fields.swotBedreigingen.confidence) }
  }

  // Sync BVO between top-level and stap3 if AI filled either
  if (merged.wizardData!.stap3?.bvo && !currentResult.bvo) {
    merged.bvo = merged.wizardData!.stap3.bvo
  }
  if (merged.bvo && !merged.wizardData!.stap3?.bvo) {
    if (!merged.wizardData!.stap3) merged.wizardData!.stap3 = {} as Oppervlaktes
    merged.wizardData!.stap3.bvo = merged.bvo
  }

  return { result: merged, aiDebug }
}

/**
 * Checks whether the given extraction debug record has any AI-filled entries.
 */
export function hasAIFilledFields(debug: ExtractionDebugRecord): boolean {
  return Object.values(debug).some((entry) => entry.sourceType === 'ai')
}
