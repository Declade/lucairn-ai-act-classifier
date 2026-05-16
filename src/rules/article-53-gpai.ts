// Articles 53 + 55 — General-purpose AI (GPAI) model provider obligations.
//
// Pure-function rule module. Two distinct triggers, one module (they share
// a trigger surface — both fire off the same `gpai_models` lexicon group —
// and an Art-55 fire requires an Art-53 fire first by construction).
//
// Article 53 (general GPAI provider obligations) fires when the description
// names a GPAI model (e.g. GPT-5, Claude, Llama) OR uses generic foundation-
// model phrasing ("foundation model", "large language model" as a MODEL,
// "frontier model"). The 4 sub-letter obligations (technical documentation,
// downstream-provider info, copyright policy, training-content summary)
// are surfaced via the verbatim Art 53(1) chapeau; we do NOT separately
// classify each sub-letter — the consultant downstream does that.
//
// Article 55 (systemic-risk GPAI) fires iff Article 53 fired AND the
// description carries systemic-risk markers ("10^25 FLOP", "systemic risk",
// "training compute threshold", etc.). Article 55(1) is an "in addition to"
// overlay — its obligations come ON TOP of Article 53's. The verbatim
// Art 55(1) chapeau is appended to the summary when applicable.
//
// Articles 53 + 55 are INTENTIONALLY NOT in any Lucairn three-category
// pairing. Three-category tracks the high-risk obligation overlay
// (Cat 1 = Art 10+15 sanitizer, Cat 2 = Art 12+14 evidence, Cat 3 =
// Art 10+12+14+15 inventory). GPAI is a separate obligation root —
// matching the Article 50 precedent (cf. `three-category.ts`).
//
// Cite-and-match: every emitted result carries the EUR-Lex source URL for
// Articles 53 + 55 of Regulation (EU) 2024/1689. `summary_en` and
// `summary_de` carry the verbatim Tier-1 chapeau(x) (EU AI Office Service
// Desk EN+DE, re-verified 2026-05-16). When `article_53_applicable === false`,
// the Art 53(1) chapeau is still surfaced so consultants can read what
// Article 53 would require.
//
// EUR-Lex source: https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689
// EU AI Office Service Desk (EN/Art 53): https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-53
// EU AI Office Service Desk (DE/Art 53): https://ai-act-service-desk.ec.europa.eu/de/ai-act/article-53
// EU AI Office Service Desk (EN/Art 55): https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-55
// EU AI Office Service Desk (DE/Art 55): https://ai-act-service-desk.ec.europa.eu/de/ai-act/article-55
//
// DE chapeau structural note (verified 2026-05-16 against Tier-2 EU AI
// Office Service Desk DE): neither Art 53(1) nor Art 55(1) ends with a
// colon in German — the chapeau truncates and the obligations flow into
// each sub-letter's own verb form. We preserve the verbatim DE Tier-1
// shape rather than back-translate punctuation from the EN chapeau (which
// DOES end with a colon). The Tier-3 FLI mirror (artificialintelligenceact.eu)
// returns paraphrase drift ("für allgemeine Zwecke" vs Tier-2's "mit
// allgemeinem Verwendungszweck"); we ship Tier-2 verbatim.
//
// Pure-function discipline:
//   - No I/O. No network. No module-init side effects.
//   - Same input → same output, byte-for-byte.
//   - Consumes ExtractedFeatures; emits GPAIResult.

import type { ExtractedFeatures } from '../extract/keyword.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Trace of WHICH GPAI lexicon sub-categories matched. */
export interface GPAITriggeredBy {
  /** `gpai_models.named_foundation_models` matched (e.g. "gpt-5", "claude 4", "llama 3"). */
  named_foundation_model: boolean;
  /** `gpai_models.generic_foundation_model_phrasing` matched (e.g. "foundation model", "large language model"). */
  generic_foundation_model_phrasing: boolean;
  /** `gpai_models.systemic_risk_markers` matched (e.g. "10^25 flop", "systemic risk"). */
  systemic_risk_markers: boolean;
}

export interface GPAIResult {
  /** True iff named model OR generic phrasing fired. */
  article_53_applicable: boolean;
  /** True iff Art 53 fired AND systemic-risk markers fired. */
  article_55_applicable: boolean;
  triggered_by: GPAITriggeredBy;
  /**
   * Verbatim EN chapeau(x). Article 53(1) chapeau is ALWAYS surfaced
   * (applicable or not). Article 55(1) chapeau is appended iff
   * `article_55_applicable === true`. Each chapeau ends with its
   * citation marker e.g. "(Art 53(1))".
   */
  summary_en: string;
  /** Verbatim DE; same surfacing rule. */
  summary_de: string;
  /** EUR-Lex citation URL (Tier-1 canonical). */
  source: string;
}

// ---------------------------------------------------------------------------
// Static metadata (verbatim EUR-Lex citation)
// ---------------------------------------------------------------------------

const EUR_LEX_SOURCE =
  'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689';

// Verbatim Tier-1 EN chapeaux — Regulation (EU) 2024/1689.
// Verified 2026-05-16 via Tier-2 EU AI Office Service Desk EN.
// Art 53(1) chapeau ends with a colon (the obligations a-d follow as verb
// phrases). Art 55(1) chapeau is the "in addition to" overlay sentence
// that also ends with a colon.
const CHAPEAU_53_EN =
  'Providers of general-purpose AI models shall: (Art 53(1))';
const CHAPEAU_55_EN =
  'In addition to the obligations listed in Articles 53 and 54, providers of general-purpose AI models with systemic risk shall: (Art 55(1))';

// Verbatim Tier-1 DE chapeaux — Verordnung (EU) 2024/1689.
// Verified 2026-05-16 via Tier-2 EU AI Office Service Desk DE.
// Art 53(1) DE: the official Tier-1 text does NOT terminate with a colon —
// the obligations a-d flow as separate sentences with their own verb forms
// (a) erstellen ..., b) erstellen ..., c) bringen ..., d) erstellen ...).
// Art 55(1) DE: Tier-2 confirms the chapeau DOES end with a colon (the "in
// addition to" overlay sentence carries the verb "müssen" and a colon
// before the sub-letter list). We preserve each Tier-1 shape verbatim per
// article and do NOT cross-align them.
const CHAPEAU_53_DE =
  'Anbieter von KI-Modellen mit allgemeinem Verwendungszweck (Art. 53 Abs. 1)';
const CHAPEAU_55_DE =
  'Zusätzlich zu den in den Artikeln 53 und 54 aufgeführten Pflichten müssen Anbieter von KI-Modellen mit allgemeinem Verwendungszweck mit systemischem Risiko: (Art. 55 Abs. 1)';

// ---------------------------------------------------------------------------
// Lexicon → trigger mapping (consumes Day-15 lexicon `gpai_models` group)
// ---------------------------------------------------------------------------

const LEXICON_GROUP = 'gpai_models';

type GPAICategory =
  | 'named_foundation_models'
  | 'generic_foundation_model_phrasing'
  | 'systemic_risk_markers';

const CATEGORY_TO_TRIGGER: Record<GPAICategory, keyof GPAITriggeredBy> = {
  named_foundation_models: 'named_foundation_model',
  generic_foundation_model_phrasing: 'generic_foundation_model_phrasing',
  systemic_risk_markers: 'systemic_risk_markers',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify the input against Articles 53 + 55 (GPAI model provider
 * obligations + systemic-risk overlay).
 *
 * Workflow:
 *   1. Type-guard `features` (friendly TypeError if upstream contract violated).
 *      The same Array.isArray guard pattern Day-5 added (regulator-validator
 *      bug-hunter M2 closure) is applied to `features.byCategory`.
 *   2. Read `features.byCategory.gpai_models.{named_foundation_models,
 *      generic_foundation_model_phrasing, systemic_risk_markers}`.
 *   3. `article_53_applicable === true` iff named_foundation_model OR
 *      generic_foundation_model_phrasing fired.
 *   4. `article_55_applicable === true` iff article_53_applicable AND
 *      systemic_risk_markers.
 *   5. `summary_en` / `summary_de` always include Art 53(1) chapeau (even
 *      when not applicable — consultants still see what would apply).
 *      Art 55(1) chapeau is appended iff article_55_applicable.
 *
 * @param features - Result from `extractFeatures()`. We read `features.byCategory`.
 */
export function classifyGPAI(features: ExtractedFeatures): GPAIResult {
  if (
    features === null ||
    typeof features !== 'object' ||
    Array.isArray(features) ||
    typeof (features as ExtractedFeatures).input !== 'string' ||
    (features as ExtractedFeatures).byCategory === null ||
    typeof (features as ExtractedFeatures).byCategory !== 'object' ||
    Array.isArray((features as ExtractedFeatures).byCategory)
  ) {
    throw new TypeError(
      'classifyGPAI(): features must be an ExtractedFeatures object with input:string and byCategory:object (call extractFeatures() first).',
    );
  }

  const lex = features.byCategory[LEXICON_GROUP] ?? {};
  const triggers: GPAITriggeredBy = {
    named_foundation_model: false,
    generic_foundation_model_phrasing: false,
    systemic_risk_markers: false,
  };
  for (const [cat, triggerKey] of Object.entries(CATEGORY_TO_TRIGGER) as ReadonlyArray<
    [GPAICategory, keyof GPAITriggeredBy]
  >) {
    const matched = lex[cat];
    if (Array.isArray(matched) && matched.length > 0) {
      triggers[triggerKey] = true;
    }
  }

  const article_53_applicable =
    triggers.named_foundation_model || triggers.generic_foundation_model_phrasing;
  const article_55_applicable =
    article_53_applicable && triggers.systemic_risk_markers;

  // summary_en / summary_de assembly:
  //   - Art 53(1) chapeau is ALWAYS first (applicable or not).
  //   - Art 55(1) chapeau is appended iff article_55_applicable.
  let summary_en: string = CHAPEAU_53_EN;
  let summary_de: string = CHAPEAU_53_DE;
  if (article_55_applicable) {
    summary_en = `${CHAPEAU_53_EN} ${CHAPEAU_55_EN}`;
    summary_de = `${CHAPEAU_53_DE} ${CHAPEAU_55_DE}`;
  }

  return {
    article_53_applicable,
    article_55_applicable,
    triggered_by: triggers,
    summary_en,
    summary_de,
    source: EUR_LEX_SOURCE,
  };
}
