// Article 4 — AI literacy.
//
// Pure-function rule module. NEW non-cascade root: Article 4 imposes a
// horizontal obligation on EVERY provider AND deployer of an AI system —
// regardless of risk category — to ensure their staff (and other persons
// dealing with operation/use on their behalf) have a sufficient level of
// AI literacy. There is no high-risk gate. There is no carve-out. The
// obligation is single-paragraph (no sub-letters).
//
// Article 4 is INTENTIONALLY NOT in any Lucairn three-category pairing
// (Cat 1 = Art 10+15 sanitizer, Cat 2 = Art 12+14 evidence, Cat 3 =
// Art 10+12+14+15 inventory). Three-category tracks the high-risk
// obligation overlay; Art 4 is the horizontal literacy duty and surfaces
// independently in the classifier output. This matches the Article 50
// precedent (cf. `three-category.ts`).
//
// Cite-and-match: every emitted result carries the EUR-Lex source URL for
// Article 4 of Regulation (EU) 2024/1689. `summary_en` and `summary_de`
// carry the verbatim Tier-1 chapeau (EU AI Office Service Desk EN+DE,
// re-verified 2026-05-16 against the FLI mirror — both confirm the same
// chapeau text). When `applicable === false`, the chapeau is still
// surfaced so consultants can read what Article 4 would require.
//
// EUR-Lex source: https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689
// EU AI Office Service Desk (EN): https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-4
// EU AI Office Service Desk (DE): https://ai-act-service-desk.ec.europa.eu/de/ai-act/article-4
//
// Applicability — single trigger path consuming the Day-15 lexicon group
// `article_4_ai_literacy.provider_or_deployer_with_staff`. The lexicon
// encodes the "provider OR deployer + staff/operators" combination via
// composite phrases (cf. Art 50's `1_interaction_disclosure` pattern).
// We do NOT attempt role-detection NLP in v0.3.0 — the lexicon is the
// truth.
//
// Pure-function discipline:
//   - No I/O. No network. No module-init side effects.
//   - Same input → same output, byte-for-byte.
//   - Consumes ExtractedFeatures; emits Article4Result.

import type { ExtractedFeatures } from '../extract/keyword.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Trace of WHICH Article-4 trigger fired. */
export interface Article4TriggeredBy {
  /** Lexicon `article_4_ai_literacy.provider_or_deployer_with_staff` matched. */
  provider_or_deployer_with_staff: boolean;
}

export interface Article4Result {
  /** True iff the provider/deployer + staff trigger fired. */
  applicable: boolean;
  triggered_by: Article4TriggeredBy;
  /**
   * Verbatim EUR-Lex EN chapeau text for Article 4, with citation marker
   * "(Art 4)". Always surfaced (applicable === true OR false) so consultants
   * see what Article 4 would require even when the trigger didn't fire.
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

// Verbatim Tier-1 EN chapeau — Regulation (EU) 2024/1689, Article 4.
// Source verified 2026-05-16 via Tier-2 EU AI Office Service Desk EN
// (https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-4) and
// cross-checked against Tier-3 FLI mirror (artificialintelligenceact.eu).
// Both sources agree on "persons or groups of persons on whom the AI systems
// are to be used" (Marc's brief had "on which" — single-word drift caught
// during pre-ship verification).
const CHAPEAU_EN =
  'Providers and deployers of AI systems shall take measures to ensure, to their best extent, a sufficient level of AI literacy of their staff and other persons dealing with the operation and use of AI systems on their behalf, taking into account their technical knowledge, experience, education and training and the context the AI systems are to be used in, and considering the persons or groups of persons on whom the AI systems are to be used. (Art 4)';

// Verbatim Tier-1 DE chapeau — Verordnung (EU) 2024/1689, Artikel 4.
// Source verified 2026-05-16 via Tier-2 EU AI Office Service Desk DE
// (https://ai-act-service-desk.ec.europa.eu/de/ai-act/article-4). The
// Tier-3 FLI mirror (artificialintelligenceact.eu/de/article/4/) returned
// a paraphrase with several drifts ("nach bestem Kräften" vs Tier-2's
// "nach besten Kräften"; "ausreichende KI-Kompetenz" vs Tier-2's "ein
// ausreichendes Maß an KI-Kompetenz"; "Aus- und Weiterbildung" vs Tier-2's
// "Ausbildung und Schulung"; "berücksichtigt werden" vs Tier-2's "zu
// berücksichtigen sind"). We ship Tier-2 verbatim.
const CHAPEAU_DE =
  'Die Anbieter und Betreiber von KI-Systemen ergreifen Maßnahmen, um nach besten Kräften sicherzustellen, dass ihr Personal und andere Personen, die in ihrem Auftrag mit dem Betrieb und der Nutzung von KI-Systemen befasst sind, über ein ausreichendes Maß an KI-Kompetenz verfügen, wobei ihre technischen Kenntnisse, ihre Erfahrung, ihre Ausbildung und Schulung und der Kontext, in dem die KI-Systeme eingesetzt werden sollen, sowie die Personen oder Personengruppen, bei denen die KI-Systeme eingesetzt werden sollen, zu berücksichtigen sind. (Art. 4)';

// ---------------------------------------------------------------------------
// Lexicon → trigger mapping (consumes Day-15 lexicon `article_4_ai_literacy` group)
// ---------------------------------------------------------------------------

const LEXICON_GROUP = 'article_4_ai_literacy';
const LEXICON_SUBCATEGORY = 'provider_or_deployer_with_staff';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify the input against Article 4 (AI literacy).
 *
 * Workflow:
 *   1. Type-guard `features` (friendly TypeError if upstream contract violated).
 *      The same Array.isArray guard pattern Day-5 added (regulator-validator
 *      bug-hunter M2 closure) is applied to `features.byCategory` so that an
 *      array projection cannot silently return false.
 *   2. Read `features.byCategory.article_4_ai_literacy.provider_or_deployer_with_staff`.
 *      If the array has ≥1 entry, fire the trigger.
 *   3. `summary_en` / `summary_de` always carry the verbatim Tier-1 chapeau
 *      with citation marker (whether applicable === true or false).
 *
 * @param features - Result from `extractFeatures()`. We read `features.byCategory`.
 */
export function classifyArticle4(features: ExtractedFeatures): Article4Result {
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
      'classifyArticle4(): features must be an ExtractedFeatures object with input:string and byCategory:object (call extractFeatures() first).',
    );
  }

  const lex = features.byCategory[LEXICON_GROUP] ?? {};
  const matched = lex[LEXICON_SUBCATEGORY];
  const triggered =
    Array.isArray(matched) && matched.length > 0;

  const triggers: Article4TriggeredBy = {
    provider_or_deployer_with_staff: triggered,
  };

  return {
    applicable: triggered,
    triggered_by: triggers,
    summary_en: CHAPEAU_EN,
    summary_de: CHAPEAU_DE,
    source: EUR_LEX_SOURCE,
  };
}
