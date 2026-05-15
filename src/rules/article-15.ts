// Article 15 — Accuracy, robustness and cybersecurity.
//
// Pure-function rule module. Cascades off the high-risk classification produced
// by `classifyAnnexIII()`. Emits an Article15Result describing whether
// Article 15 obligations apply to the system.
//
// Cite-and-match: every emitted result carries the EUR-Lex source URL for
// Article 15 of Regulation (EU) 2024/1689. The summary fields quote EUR-Lex
// EN verbatim (via EU AI Office Service Desk Tier-2 — Tier-1 EUR-Lex HTML
// shell returns empty on programmatic fetch as of 2026-05-15) and EUR-Lex DE
// via the same Tier-2 path. The regulator-validator agent re-verifies these
// citations on every PR.
//
// EUR-Lex source: https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689
// EU AI Office Service Desk (EN): https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-15
// EU AI Office Service Desk (DE): https://ai-act-service-desk.ec.europa.eu/de/ai-act/article-15
//
// Applicability:
//   Article 15(1) chapeau applies to all "High-risk AI systems" without
//   narrowing to specific Annex III paragraphs. For Day 4 we apply Article 15
//   to ALL high-risk Annex III systems whenever Article 5 prohibition does NOT
//   fire. Article 15 maps to Lucairn's locked three-category scheme Category 1
//   + Category 3 (paired with Article 10 sanitizer/data-governance).
//
// Pure-function discipline:
//   - No I/O. No network. No module-init side effects.
//   - Same input → same output, byte-for-byte.
//   - Consumes an AnnexIIIResult + Article5Result; emits an Article15Result.

import type { AnnexIIIResult } from './article-6-annex-iii.js';
import type { Article5Result } from './article-5.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Article15TriggeredBy {
  article_5: boolean;
  annex_iii_domains: number[];
}

export interface Article15Result {
  applicable: boolean;
  triggered_by: Article15TriggeredBy;
  summary_en: string;
  summary_de: string;
  source: string;
}

// ---------------------------------------------------------------------------
// Static metadata (verbatim EUR-Lex citation)
// ---------------------------------------------------------------------------

const EUR_LEX_SOURCE =
  'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689';

// Article 15(1) chapeau — verbatim from EUR-Lex EN/DE via EU AI Office Service Desk
// (Tier-2 secondary citation per regulator-validator escalation ladder Day-3 lesson 4).
const SUMMARY_EN =
  'High-risk AI systems shall be designed and developed in such a way that they achieve an appropriate level of accuracy, robustness, and cybersecurity, and that they perform consistently in those respects throughout their lifecycle. (Art 15(1))';

const SUMMARY_DE =
  'Hochrisiko-KI-Systeme werden so konzipiert und entwickelt, dass sie ein angemessenes Maß an Genauigkeit, Robustheit und Cybersicherheit erreichen und in dieser Hinsicht während ihres gesamten Lebenszyklus beständig funktionieren. (Art. 15 Abs. 1)';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify the input against Article 15 (Accuracy, robustness and
 * cybersecurity).
 *
 * Cascading rule: Article 15 applies iff `annex.high_risk === true` AND
 * `annex.suppressed_by_article_5 === false`. The chapeau does not narrow
 * applicability by Annex III paragraph.
 */
export function classifyArticle15(
  annex: AnnexIIIResult,
  article5: Article5Result,
): Article15Result {
  if (annex === null || typeof annex !== 'object' || !Array.isArray((annex as AnnexIIIResult).domains)) {
    throw new TypeError(
      'classifyArticle15(): annex must be an AnnexIIIResult object with a domains array (call classifyAnnexIII() first).',
    );
  }
  if (article5 === null || typeof article5 !== 'object') {
    throw new TypeError(
      'classifyArticle15(): article5 must be an Article5Result object (call classifyArticle5() first).',
    );
  }

  const article5Triggered = annex.suppressed_by_article_5;
  const annexDomains = annex.domains.map((d) => d.annex_iii_number);
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
