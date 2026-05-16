// Public API — orchestrates the 12-stage classification pipeline.
//
// Async (since Day 9) because the LLM extraction path is asynchronous. The
// deterministic mode `await` resolves immediately (no microtask delay beyond
// the awaited value) — no network call, no I/O.
//
// Pipeline (DO NOT REORDER — Day-4/5 cascade modules depend on the prior outputs):
//   1a. extractFeatures(text, {lang})            — Day 2 deterministic keyword extractor (default)
//   1b. extractFeaturesLLM(text, {provider})     — Day 9 LLM extractor (when opts.llm set)
//   2.  classifyArticle5(features)               — Day 3 prohibited practices
//   3.  classifyAnnexIII(features, art5)         — Day 3 high-risk classification
//   4.  classifyArticle10(annex, art5)           — Day 4 data governance
//   5.  classifyArticle12(annex, art5)           — Day 5 record-keeping
//   6.  classifyArticle13(annex, art5)           — Day 4 deployer transparency
//   7.  classifyArticle14(annex, art5)           — Day 4 human oversight
//   8.  classifyArticle15(annex, art5)           — Day 4 accuracy/robustness/cybersecurity
//   9.  classifyArticle50(features, art5, annex) — Day 5 GPAI/deployer transparency
//   9b. classifyArticle4(features)               — Day 15 (v0.3.0) AI literacy (non-cascade root)
//   9c. classifyGPAI(features)                   — Day 15 (v0.3.0) Articles 53 + 55 (non-cascade root)
//  10.  classifyThreeCategory(annex, art5, art10, art12, art14, art15) — Day 5 overlay
//  11.  annex_iv_required derived from annex.high_risk && !suppressed_by_article_5
//  12.  confidence computed via v0.1 placeholder formula
//
// `mode` is `'deterministic'` when `opts.llm` is unset, or `\`llm-${provider}\``
// (Day 9: `'llm-anthropic'`) when set. The rules engine downstream is identical
// in both modes — the LLM only changes how features are extracted.

import { extractFeatures } from './extract/keyword.js';
import { extractFeaturesLLM } from './extract/llm.js';
import type { LLMProvider, CacheOptions } from './extract/llm.js';
import type { ExtractedFeatures } from './extract/keyword.js';
import { classifyArticle5 } from './rules/article-5.js';
import { classifyAnnexIII } from './rules/article-6-annex-iii.js';
import { classifyArticle10 } from './rules/article-10.js';
import { classifyArticle12 } from './rules/article-12.js';
import { classifyArticle13 } from './rules/article-13.js';
import { classifyArticle14 } from './rules/article-14.js';
import { classifyArticle15 } from './rules/article-15.js';
import { classifyArticle50 } from './rules/article-50.js';
import { classifyArticle4 } from './rules/article-4.js';
import { classifyGPAI } from './rules/article-53-gpai.js';
import { classifyThreeCategory } from './rules/three-category.js';
import type {
  Article5Result,
  AnnexIIIResult,
  Article10Result,
  Article12Result,
  Article13Result,
  Article14Result,
  Article15Result,
  Article50Result,
  Article4Result,
  GPAIResult,
  ThreeCategoryResult,
} from './rules/index.js';
import { RULES_VERSION, RULES_HASH, RULES_HASH_FULL_HEX } from './util/rules-hash.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClassifyOptions {
  /** Force locale (default: auto-detect from input). */
  lang?: 'en' | 'de';
  /**
   * When set, replaces the deterministic keyword extractor with an LLM-based
   * feature extractor. Day 10 supports `anthropic` + `openai` + `groq`. The
   * downstream rules engine is unchanged — the LLM only extracts features.
   */
  llm?: LLMProvider;
  /**
   * Cache options for LLM-mode (Day 10). When unset, the cache is enabled
   * with defaults (`~/.cache/lucairn-ai-act-classifier/llm/`). Set
   * `{ disabled: true }` to bypass cache READ + WRITE on this call.
   * Ignored in deterministic mode (which is already fast + reproducible).
   */
  cache?: CacheOptions;
  /** When false, the three-category overlay is omitted (returns null). Default: true. */
  threeCategory?: boolean;
  /** Display-pass-through; mismatched value vs current rules version throws Error (CLI maps to exit 2). Default: undefined. */
  rulesVersion?: string;
}

export interface ClassifyResult {
  /** Raw input text (unmodified). */
  input_text: string;
  /** Detected (or overridden) locale used for extraction. */
  detected_lang: 'en' | 'de';
  /** Day-2 lang detector's confidence flag. */
  lang_confident: boolean;
  /** package.json `version` field with `v` prefix; e.g. 'v0.1.0'. */
  rules_version: string;
  /** First 8 hex chars of `rules_hash_full` for display. */
  rules_hash: string;
  /** Full 64-char SHA-256 of the loaded JSON rule data. */
  rules_hash_full: string;
  /** Always 'deterministic' in Day 6; reserves space for `llm-anthropic` etc. in Day 9. */
  mode: 'deterministic' | `llm-${string}`;
  /** v0.1 placeholder confidence in [0.20, 0.99]; refined in Day 8. */
  confidence: number;
  /** Day-2 extractor output. Surfaced for debugging + downstream introspection. */
  features: ExtractedFeatures;
  /** Article 5 prohibited practices check. */
  article_5: Article5Result;
  /** Article 6 + Annex III high-risk classification. */
  annex_iii: AnnexIIIResult;
  /** Article 10 — data governance cascade. */
  article_10: Article10Result;
  /** Article 12 — record-keeping cascade. */
  article_12: Article12Result;
  /** Article 13 — transparency to deployers cascade. */
  article_13: Article13Result;
  /** Article 14 — human oversight cascade. */
  article_14: Article14Result;
  /** Article 15 — accuracy/robustness/cybersecurity cascade. */
  article_15: Article15Result;
  /** Article 50 — GPAI/deployer transparency (non-cascade root). */
  article_50: Article50Result;
  /** Article 4 — AI literacy (non-cascade root). */
  article_4: Article4Result;
  /** GPAI Articles 53 + 55 — General-purpose AI obligations + systemic risk overlay. */
  gpai: GPAIResult;
  /** Lucairn opinionated overlay; null iff `opts.threeCategory === false`. */
  three_category: ThreeCategoryResult | null;
  /** True iff annex_iii.high_risk && !annex_iii.suppressed_by_article_5. */
  annex_iv_required: boolean;
}

// ---------------------------------------------------------------------------
// Confidence (v0.1 placeholder)
// ---------------------------------------------------------------------------

/**
 * v0.1 placeholder confidence formula.
 *
 * Designed to land at sensible numbers across the 11 existing fixtures:
 *   - Day-4 low-risk fixture (1 hit) ≈ 0.40
 *   - Day-3 fixtures (5-15 hits) ≈ 0.80-0.95
 *
 * Day 8 will measure accuracy against the 50-case fixture corpus and tune.
 * The formula is intentionally simple — clamp(0.20, 0.99) bounds + linear
 * per-hit slope + a small bonus when the lang detector was confident.
 *
 * @internal
 */
function computeConfidence(features: ExtractedFeatures): number {
  const baseline = 0.4;
  const perHit = 0.04;
  const langBonus = features.langConfident ? 0.08 : 0;
  const raw = baseline + perHit * features.hits.length + langBonus;
  const clamped = Math.min(0.99, Math.max(0.2, raw));
  return Number(clamped.toFixed(2));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Orchestrate the 9-stage AI-Act classification pipeline.
 *
 * Workflow:
 *   1. Validate `text` is a non-empty string after `.trim()`. Throw `TypeError`
 *      if not.
 *   2. Validate `opts.rulesVersion` (if set) against current `RULES_VERSION`.
 *      Throw `Error('classify(): rules_version mismatch — ...')` on mismatch.
 *      The CLI converts this to exit code 2 + a helpful stderr message.
 *   3. Run the 9 pipeline stages in order. Each stage type-guards its own
 *      inputs (TypeError if upstream contract violated).
 *   4. Derive `annex_iv_required` + `confidence`.
 *   5. Return a structured ClassifyResult.
 *
 * @throws TypeError if `text` is not a non-empty string after trim, or if any
 *   pipeline stage's input fails its own type-guard.
 * @throws Error if `opts.rulesVersion` is set and does not match the current
 *   rules version.
 */
export async function classify(text: string, opts: ClassifyOptions = {}): Promise<ClassifyResult> {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new TypeError('classify(): input text must be a non-empty string.');
  }
  if (opts.rulesVersion !== undefined && opts.rulesVersion !== RULES_VERSION) {
    throw new Error(
      `classify(): rules_version mismatch — requested "${opts.rulesVersion}", current "${RULES_VERSION}".`,
    );
  }

  // 1. Feature extraction.
  //    - Deterministic mode (default): `extractFeatures` (keyword.ts) — zero-network,
  //      zero-dep, synchronous-equivalent under the await.
  //    - LLM mode (opts.llm set): `extractFeaturesLLM` dispatches to the
  //      provider module (dynamic-imported). The returned ExtractedFeatures
  //      has the same shape; downstream rule modules are unchanged.
  //    extractFeatures validates `text` again (defense in depth) and normalizes
  //    the `lang` option.
  const features: ExtractedFeatures =
    opts.llm !== undefined
      ? await extractFeaturesLLM(text, {
          provider: opts.llm,
          ...(opts.lang !== undefined ? { lang: opts.lang } : {}),
          ...(opts.cache !== undefined ? { cache: opts.cache } : {}),
        })
      : extractFeatures(text, opts.lang !== undefined ? { lang: opts.lang } : {});

  // 2. Article 5 prohibited practices — must run BEFORE classifyAnnexIII (which
  //    consumes its `prohibited` flag).
  const article_5 = classifyArticle5(features);

  // 3. Article 6 + Annex III high-risk classification.
  const annex_iii = classifyAnnexIII(features, article_5);

  // 4-8. Day-4/5 cascade modules. All consume `(annex, article5)` and project
  //      the high-risk-cascade decision into article-level applicability.
  const article_10 = classifyArticle10(annex_iii, article_5);
  const article_12 = classifyArticle12(annex_iii, article_5);
  const article_13 = classifyArticle13(annex_iii, article_5);
  const article_14 = classifyArticle14(annex_iii, article_5);
  const article_15 = classifyArticle15(annex_iii, article_5);

  // 9. Article 50 — independent non-cascade root. Consumes features + art5 +
  //    optional annex (for the 50(3) Annex-III-style fallback).
  const article_50 = classifyArticle50(features, article_5, annex_iii);

  // 9b. Article 4 — AI literacy (non-cascade root; provider/deployer + staff
  //     fires the horizontal obligation regardless of risk category).
  const article_4 = classifyArticle4(features);

  // 9c. GPAI Articles 53 + 55 — provider of foundation models / systemic-risk
  //     markers (non-cascade root; independent obligation track).
  const gpai = classifyGPAI(features);

  // 10. Three-category overlay (Cat 1/2/3). Omitted when opts.threeCategory === false.
  const three_category =
    opts.threeCategory === false
      ? null
      : classifyThreeCategory(annex_iii, article_5, article_10, article_12, article_14, article_15);

  // 11. Annex IV technical-documentation required iff high-risk AND not suppressed.
  const annex_iv_required = annex_iii.high_risk && !annex_iii.suppressed_by_article_5;

  // 12. v0.1 placeholder confidence.
  const confidence = computeConfidence(features);

  const mode: ClassifyResult['mode'] =
    opts.llm !== undefined ? (`llm-${opts.llm}` as const) : 'deterministic';

  return {
    input_text: text,
    detected_lang: features.lang,
    lang_confident: features.langConfident,
    rules_version: RULES_VERSION,
    rules_hash: RULES_HASH,
    rules_hash_full: RULES_HASH_FULL_HEX,
    mode,
    confidence,
    features,
    article_5,
    annex_iii,
    article_10,
    article_12,
    article_13,
    article_14,
    article_15,
    article_50,
    article_4,
    gpai,
    three_category,
    annex_iv_required,
  };
}
