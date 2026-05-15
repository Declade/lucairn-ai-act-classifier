// Article 12 — Record-keeping.
//
// Pure-function rule module. Cascades off the high-risk classification produced
// by `classifyAnnexIII()`. Emits an Article12Result describing whether
// Article 12 obligations apply to the system.
//
// Cite-and-match: every emitted result carries the EUR-Lex source URL for
// Article 12 of Regulation (EU) 2024/1689. The summary fields quote EUR-Lex
// EN verbatim (via EU AI Office Service Desk Tier-2 — Tier-1 EUR-Lex HTML
// shell returns empty on programmatic fetch as of 2026-05-15) and EUR-Lex DE
// via the same Tier-2 path. The regulator-validator agent re-verifies these
// citations on every PR.
//
// EUR-Lex source: https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689
// EU AI Office Service Desk (EN): https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-12
// EU AI Office Service Desk (DE): https://ai-act-service-desk.ec.europa.eu/de/ai-act/article-12
//
// Applicability:
//   Article 12(1) chapeau applies to all "High-risk AI systems" without
//   narrowing to specific Annex III paragraphs. For Day 5 we apply Article 12
//   to ALL high-risk Annex III systems whenever Article 5 prohibition does NOT
//   fire. Article 12 maps to Lucairn's locked three-category scheme Category 2
//   + Category 3 (paired with Article 14 for Cat 2 Evidence;
//   paired with Articles 10 + 14 + 15 for Cat 3 Inventory).
//
//   Locked three-category mapping (do NOT reopen — cite CLAUDE.md
//   `## Locked decisions`):
//     Cat 1 (Sanitizer) = Art 10 + 15
//     Cat 2 (Evidence)  = Art 12 + 14
//     Cat 3 (Inventory) = Art 10 + 12 + 14 + 15
//
// Pure-function discipline:
//   - No I/O. No network. No module-init side effects.
//   - Same input → same output, byte-for-byte.
//   - Consumes an AnnexIIIResult + Article5Result; emits an Article12Result.

import type { AnnexIIIResult } from './article-6-annex-iii.js';
import type { Article5Result } from './article-5.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Trace of WHY Article 12 obligations were triggered (or not).
 */
export interface Article12TriggeredBy {
  /** Mirror of `annex.suppressed_by_article_5` — true iff Art 5 prohibition fired. */
  article_5: boolean;
  /** Annex III paragraph numbers that fired (empty when not high-risk). */
  annex_iii_domains: number[];
}

export interface Article12Result {
  /** True iff `annex.high_risk === true && annex.suppressed_by_article_5 === false`. */
  applicable: boolean;
  triggered_by: Article12TriggeredBy;
  /** Short EN summary of the Article 12 obligation (verbatim EUR-Lex chapeau). */
  summary_en: string;
  /** Short DE summary of the Article 12 obligation (verbatim EUR-Lex chapeau). */
  summary_de: string;
  /** EUR-Lex citation URL. */
  source: string;
}

// ---------------------------------------------------------------------------
// Static metadata (verbatim EUR-Lex citation)
// ---------------------------------------------------------------------------

const EUR_LEX_SOURCE =
  'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689';

// Article 12(1) chapeau — verbatim from EUR-Lex EN/DE via EU AI Office Service Desk
// (Tier-2 secondary citation per regulator-validator escalation ladder Day-3 lesson 4).
const SUMMARY_EN =
  'High-risk AI systems shall technically allow for the automatic recording of events (logs) over the lifetime of the system. (Art 12(1))';

// EUR-Lex DE — Tier-3 mirror (artificialintelligenceact.eu/de/article/12/).
// Tier-1 EUR-Lex HTML shell returns empty on programmatic fetch as of
// 2026-05-15; Tier-2 EU AI Office Service Desk DE returned an abridged
// variant; Tier-3 mirror is cross-validated against EUR-Lex PDF.
const SUMMARY_DE =
  'Die Technik der Hochrisiko-KI-Systeme muss die automatische Aufzeichnung von Ereignissen (im Folgenden „Protokollierung“) während des Lebenszyklus des Systems ermöglichen. (Art. 12 Abs. 1)';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify the input against Article 12 (Record-keeping).
 *
 * Cascading rule: Article 12 applies iff `annex.high_risk === true` AND
 * `annex.suppressed_by_article_5 === false`. The chapeau does not narrow
 * applicability by Annex III paragraph.
 *
 * @param annex - Result from `classifyAnnexIII()`.
 * @param article5 - Result from `classifyArticle5()` (used as a sanity guard;
 *   the operative signal for the cascade is `annex.suppressed_by_article_5`).
 */
export function classifyArticle12(
  annex: AnnexIIIResult,
  article5: Article5Result,
): Article12Result {
  if (annex === null || typeof annex !== 'object' || !Array.isArray((annex as AnnexIIIResult).domains)) {
    throw new TypeError(
      'classifyArticle12(): annex must be an AnnexIIIResult object with a domains array (call classifyAnnexIII() first).',
    );
  }
  if (article5 === null || typeof article5 !== 'object') {
    throw new TypeError(
      'classifyArticle12(): article5 must be an Article5Result object (call classifyArticle5() first).',
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
