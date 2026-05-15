// Article 10 — Data and data governance.
//
// Pure-function rule module. Cascades off the high-risk classification produced
// by `classifyAnnexIII()`. Emits an Article10Result describing whether
// Article 10 obligations apply to the system.
//
// Cite-and-match: every emitted result carries the EUR-Lex source URL for
// Article 10 of Regulation (EU) 2024/1689. The summary fields quote EUR-Lex
// EN verbatim (via EU AI Office Service Desk Tier-2 — Tier-1 EUR-Lex HTML
// shell returns empty on programmatic fetch as of 2026-05-15) and EUR-Lex DE
// via the same Tier-2 path. The regulator-validator agent re-verifies these
// citations on every PR.
//
// EUR-Lex source: https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689
// EU AI Office Service Desk (EN): https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-10
// EU AI Office Service Desk (DE): https://ai-act-service-desk.ec.europa.eu/de/ai-act/article-10
//
// Applicability:
//   Article 10(1) chapeau scopes to "High-risk AI systems which make use of
//   techniques involving the training of AI models with data." It does NOT
//   narrow to specific Annex III paragraphs (verified verbatim against EUR-Lex
//   text; the Day-3 handover's hand-wave "applies to Annex III 1+5+6+7" was an
//   interpretation, not a literal reading of EUR-Lex). For Day 4 we apply
//   Article 10 to ALL high-risk Annex III systems — the "uses training data"
//   gate is a separate factual question the consultant verifies downstream.
//
// Pure-function discipline:
//   - No I/O. No network. No module-init side effects.
//   - Same input → same output, byte-for-byte.
//   - Consumes an AnnexIIIResult + Article5Result; emits an Article10Result.

import type { AnnexIIIResult } from './article-6-annex-iii.js';
import type { Article5Result } from './article-5.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Trace of WHY Article 10 obligations were triggered (or not).
 */
export interface Article10TriggeredBy {
  /** Mirror of `annex.suppressed_by_article_5` — true iff Art 5 prohibition fired. */
  article_5: boolean;
  /** Annex III paragraph numbers that fired (empty when not high-risk). */
  annex_iii_domains: number[];
}

export interface Article10Result {
  /** True iff `annex.high_risk === true && annex.suppressed_by_article_5 === false`. */
  applicable: boolean;
  triggered_by: Article10TriggeredBy;
  /** Short EN summary of the Article 10 obligation (verbatim EUR-Lex chapeau). */
  summary_en: string;
  /** Short DE summary of the Article 10 obligation (verbatim EUR-Lex chapeau). */
  summary_de: string;
  /** EUR-Lex citation URL. */
  source: string;
}

// ---------------------------------------------------------------------------
// Static metadata (verbatim EUR-Lex citation)
// ---------------------------------------------------------------------------

const EUR_LEX_SOURCE =
  'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689';

// Article 10(1) chapeau — verbatim from EUR-Lex EN/DE via EU AI Office Service Desk
// (Tier-2 secondary citation per regulator-validator escalation ladder Day-3 lesson 4).
const SUMMARY_EN =
  'High-risk AI systems which make use of techniques involving the training of AI models with data shall be developed on the basis of training, validation and testing data sets that meet the quality criteria referred to in paragraphs 2 to 5 whenever such data sets are used. (Art 10(1))';

const SUMMARY_DE =
  'Hochrisiko-KI-Systeme, in denen Techniken eingesetzt werden, bei denen KI-Modelle mit Daten trainiert werden, müssen mit Trainings-, Validierungs- und Testdatensätzen entwickelt werden, die den in den Absätzen 2 bis 5 genannten Qualitätskriterien entsprechen, wenn solche Datensätze verwendet werden. (Art. 10 Abs. 1)';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify the input against Article 10 (Data and data governance).
 *
 * Cascading rule: Article 10 applies iff `annex.high_risk === true` AND
 * `annex.suppressed_by_article_5 === false`. Article 10 does NOT narrow to
 * specific Annex III paragraphs in the regulation text; it applies to every
 * high-risk system that "uses training data" — the latter is a factual
 * predicate the consultant verifies downstream, not a regulatory exclusion.
 *
 * @param annex - Result from `classifyAnnexIII()`.
 * @param article5 - Result from `classifyArticle5()` (used as a sanity guard:
 *   if `article5.prohibited === true` we expect `annex.suppressed_by_article_5
 *   === true`, but we trust `annex.suppressed_by_article_5` as the operative
 *   signal so the cascade only depends on `annex`).
 */
export function classifyArticle10(
  annex: AnnexIIIResult,
  article5: Article5Result,
): Article10Result {
  if (annex === null || typeof annex !== 'object' || !Array.isArray((annex as AnnexIIIResult).domains)) {
    throw new TypeError(
      'classifyArticle10(): annex must be an AnnexIIIResult object with a domains array (call classifyAnnexIII() first).',
    );
  }
  if (article5 === null || typeof article5 !== 'object') {
    throw new TypeError(
      'classifyArticle10(): article5 must be an Article5Result object (call classifyArticle5() first).',
    );
  }

  const article5Triggered = annex.suppressed_by_article_5;
  const annexDomains = annex.domains.map((d) => d.annex_iii_number);
  // Sort deterministically (ascending integers). Domains array on AnnexIIIResult
  // is already sorted by classifyAnnexIII(); we sort again defensively in case
  // upstream invariant changes.
  const sortedDomains = [...annexDomains].sort((a, b) => a - b);

  const applicable = annex.high_risk && !article5Triggered;

  return {
    applicable,
    triggered_by: {
      article_5: article5Triggered,
      annex_iii_domains: applicable ? sortedDomains : [],
    },
    summary_en: SUMMARY_EN,
    summary_de: SUMMARY_DE,
    source: EUR_LEX_SOURCE,
  };
}
