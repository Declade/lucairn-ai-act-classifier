// Article 13 — Transparency and provision of information to deployers.
//
// Pure-function rule module. Cascades off the high-risk classification produced
// by `classifyAnnexIII()`. Emits an Article13Result describing whether
// Article 13 obligations apply to the system.
//
// Cite-and-match: every emitted result carries the EUR-Lex source URL for
// Article 13 of Regulation (EU) 2024/1689. The summary fields quote EUR-Lex
// EN verbatim (via EU AI Office Service Desk Tier-2 — Tier-1 EUR-Lex HTML
// shell returns empty on programmatic fetch as of 2026-05-15) and EUR-Lex DE
// via the same Tier-2 path. The regulator-validator agent re-verifies these
// citations on every PR.
//
// EUR-Lex source: https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689
// EU AI Office Service Desk (EN): https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-13
// EU AI Office Service Desk (DE): https://ai-act-service-desk.ec.europa.eu/de/ai-act/article-13
//
// Applicability:
//   Article 13(1) chapeau applies to all "High-risk AI systems" without
//   narrowing to specific Annex III paragraphs. For Day 4 we apply Article 13
//   to ALL high-risk Annex III systems whenever Article 5 prohibition does NOT
//   fire.
//
// Pure-function discipline:
//   - No I/O. No network. No module-init side effects.
//   - Same input → same output, byte-for-byte.
//   - Consumes an AnnexIIIResult + Article5Result; emits an Article13Result.

import type { AnnexIIIResult } from './article-6-annex-iii.js';
import type { Article5Result } from './article-5.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Article13TriggeredBy {
  article_5: boolean;
  annex_iii_domains: number[];
}

export interface Article13Result {
  applicable: boolean;
  triggered_by: Article13TriggeredBy;
  summary_en: string;
  summary_de: string;
  source: string;
}

// ---------------------------------------------------------------------------
// Static metadata (verbatim EUR-Lex citation)
// ---------------------------------------------------------------------------

const EUR_LEX_SOURCE =
  'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689';

// Article 13(1) chapeau — verbatim from EUR-Lex EN/DE via EU AI Office Service Desk
// (Tier-2 secondary citation per regulator-validator escalation ladder Day-3 lesson 4).
const SUMMARY_EN =
  "High-risk AI systems shall be designed and developed in such a way as to ensure that their operation is sufficiently transparent to enable deployers to interpret a system's output and use it appropriately. (Art 13(1))";

const SUMMARY_DE =
  'Hochrisiko-KI-Systeme werden so konzipiert und entwickelt, dass ihr Betrieb hinreichend transparent ist, damit die Betreiber die Ausgaben eines Systems angemessen interpretieren und verwenden können. (Art. 13 Abs. 1)';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify the input against Article 13 (Transparency and provision of
 * information to deployers).
 *
 * Cascading rule: Article 13 applies iff `annex.high_risk === true` AND
 * `annex.suppressed_by_article_5 === false`. The chapeau does not narrow
 * applicability by Annex III paragraph.
 */
export function classifyArticle13(
  annex: AnnexIIIResult,
  article5: Article5Result,
): Article13Result {
  if (annex === null || typeof annex !== 'object') {
    throw new TypeError(
      'classifyArticle13(): annex must be an AnnexIIIResult object (call classifyAnnexIII() first).',
    );
  }
  if (article5 === null || typeof article5 !== 'object') {
    throw new TypeError(
      'classifyArticle13(): article5 must be an Article5Result object (call classifyArticle5() first).',
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
