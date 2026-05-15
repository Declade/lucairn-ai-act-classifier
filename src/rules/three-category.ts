// Three-category overlay — Lucairn's locked Cat 1 / Cat 2 / Cat 3 scheme.
//
// Pure-function rule module. Projects the per-article cascade results from
// Day-4 + Day-5 (Art 10 + 12 + 14 + 15) into a single three-category overlay
// mirroring Lucairn's compliance checklist source-of-truth on the website.
//
// Locked three-category mapping (do NOT reopen — cite CLAUDE.md
// `## Locked decisions`):
//   Cat 1 (Sanitizer)  = Art 10 + 15
//   Cat 2 (Evidence)   = Art 12 + 14
//   Cat 3 (Inventory)  = Art 10 + 12 + 14 + 15
//
// Applicability rule (locked):
//   For each category:
//     1. Compute the set of currently-applicable contributing articles
//        ({10 if article10.applicable, 12 if article12.applicable, ...}).
//     2. triggered_articles = sorted ascending intersection of required_articles
//        with the applicable set.
//     3. applicable = required_articles.length === triggered_articles.length
//        (every required article must be applicable for the category to fire).
//   applicable_categories = ['1','2','3'].filter(k => categories[k].applicable).
//
// Articles INTENTIONALLY OMITTED from the three-category pairing:
//   - Article 13 (transparency to deployers) — separate obligation track.
//     Surfaces independently in the classifier output.
//   - Article 50 (GPAI / deployer transparency) — different cascade root
//     (not gated on Annex III high-risk). Surfaces independently.
//
// Suppression interaction:
//   - Article 5 prohibition propagates through Day-4 cascade modules: when
//     annex.suppressed_by_article_5 === true, article10/12/14/15.applicable
//     === false, so the three-category overlay inherits suppression
//     automatically. No explicit article5 branch is needed inside the
//     aggregation.
//   - The `article5` parameter is taken for DEFENSIVE SANITY-CHECKING only:
//     if `article5.prohibited === true && annex.suppressed_by_article_5 ===
//     false`, throw — this catches integration bugs where the caller forgot
//     to refresh the annex result after re-running classifyArticle5().
//
// Source-of-truth: the static text content (category titles, item lists,
// disclaimer) is synced from the Lucairn website's compliance checklist at
// `theveil-website/src/lib/compliance/checklist-content.ts` via
// `scripts/sync-three-category.ts`, which emits the committed build artifact
// `src/data/three-category.gen.json`. This module reads that JSON at module
// init (the file is build-output checked into git, not regenerated at
// runtime). Mirrors the readFileSync+fileURLToPath pattern from
// `article-6-annex-iii.ts` (cite: `src/rules/article-6-annex-iii.ts:28-36`)
// so the JSON ships as a separate asset in dist/data/ rather than being
// inlined into the JS bundle by --resolveJsonModule.
//
// Source field shape (provenance, NOT EUR-Lex):
//   The `source` field points at the GENERATED FILE + the SOURCE FILE, not
//   at EUR-Lex. The three-category scheme is Lucairn's opinionated overlay;
//   regulator-level citations live on each underlying article module (Art
//   10, 12, 14, 15) which each have their own `source` field pointing at
//   EUR-Lex. `rules/three-category.ts:source` is provenance metadata.
//
// Pure-function discipline:
//   - No I/O at runtime. The JSON load happens once at module init.
//   - Same input → same output, byte-for-byte.
//   - Type-guards every result-input parameter (Day-4 M-2 closure pattern).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { AnnexIIIResult } from './article-6-annex-iii.js';
import type { Article5Result } from './article-5.js';
import type { Article10Result } from './article-10.js';
import type { Article12Result } from './article-12.js';
import type { Article14Result } from './article-14.js';
import type { Article15Result } from './article-15.js';

// ---------------------------------------------------------------------------
// JSON shape (kept in sync with scripts/sync-three-category.ts output)
// ---------------------------------------------------------------------------

interface ThreeCategoryJsonItem {
  number: number;
  text_en: string;
  text_de: string;
}

interface ThreeCategoryJsonCategory {
  key: '1' | '2' | '3';
  title_en: string;
  title_de: string;
  required_articles: number[];
  items: ThreeCategoryJsonItem[];
}

interface ThreeCategoryJson {
  version: string;
  _meta: {
    notice: string;
    source_file: string;
    source_lines: string;
    generator: string;
    _source_sha256: string;
  };
  disclaimer_en: string;
  disclaimer_de: string;
  categories: {
    '1': ThreeCategoryJsonCategory;
    '2': ThreeCategoryJsonCategory;
    '3': ThreeCategoryJsonCategory;
  };
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ThreeCategoryItem {
  number: number;
  text_en: string;
  text_de: string;
}

export interface ThreeCategoryAggregate {
  /** Category key in the generated JSON ('1' | '2' | '3'). */
  key: '1' | '2' | '3';
  /** True iff ALL `required_articles` for this category are applicable. */
  applicable: boolean;
  /** Intersection of `required_articles` with currently-applicable. Sorted ascending. */
  triggered_articles: ReadonlyArray<number>;
  /** Locked per CLAUDE.md. Sorted ascending. */
  required_articles: ReadonlyArray<number>;
  title_en: string;
  title_de: string;
  items: ReadonlyArray<ThreeCategoryItem>;
}

export interface ThreeCategoryResult {
  categories: {
    '1': ThreeCategoryAggregate;
    '2': ThreeCategoryAggregate;
    '3': ThreeCategoryAggregate;
  };
  /** Sorted ascending list of category keys that are applicable. */
  applicable_categories: ReadonlyArray<'1' | '2' | '3'>;
  disclaimer_en: string;
  disclaimer_de: string;
  /** Provenance: what generated file was loaded and which source-of-truth it was synced from. */
  source: {
    /** Path to the generated artifact loaded at module init. */
    generated_file: string;
    /** Path to the website source-of-truth the generator read from. */
    source_file: string;
    /** Version stamp from the generated JSON. */
    version: string;
  };
}

// ---------------------------------------------------------------------------
// JSON data load (cached at module init — mirrors article-6-annex-iii pattern)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// dist/rules/three-category.js → ../data/three-category.gen.json
const DATA_DIR = join(__dirname, '..', 'data');
const GEN_FILE_LABEL = 'src/data/three-category.gen.json';
const SOURCE_FILE_LABEL = 'theveil-website/src/lib/compliance/checklist-content.ts';

function loadGenJson(): ThreeCategoryJson {
  const path = join(DATA_DIR, 'three-category.gen.json');
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as ThreeCategoryJson;
}

let GEN: ThreeCategoryJson = loadGenJson();

/**
 * Reload the three-category.gen.json data from disk. Test helper — not part
 * of the public API.
 * @internal
 */
export function _reloadThreeCategoryGen(): void {
  GEN = loadGenJson();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type ArticleApplicabilityPair = readonly [number, boolean];

function aggregateCategory(
  catKey: '1' | '2' | '3',
  applicabilityPairs: ReadonlyArray<ArticleApplicabilityPair>,
): ThreeCategoryAggregate {
  const cat = GEN.categories[catKey];
  // Defensive sort (the sync script already sorts, but lock the invariant here
  // so an upstream JSON edit can't drift the contract).
  const requiredArticles: ReadonlyArray<number> = [...cat.required_articles].sort(
    (a, b) => a - b,
  );

  // Build the set of currently-applicable articles among the contributing
  // articles. Sort ascending. Then intersect with required_articles.
  const applicableNums = applicabilityPairs
    .filter(([, applicable]) => applicable)
    .map(([n]) => n);
  const triggered = requiredArticles.filter((n) => applicableNums.includes(n));
  // requiredArticles is already sorted; filter preserves order, so triggered
  // is already sorted ascending. Still .sort() defensively (cheap; locks
  // invariant against any future change to requiredArticles ordering).
  const triggeredSorted = [...triggered].sort((a, b) => a - b);

  const applicable = requiredArticles.length === triggeredSorted.length;

  return {
    key: catKey,
    applicable,
    triggered_articles: triggeredSorted,
    required_articles: requiredArticles,
    title_en: cat.title_en,
    title_de: cat.title_de,
    items: cat.items.map((it) => ({
      number: it.number,
      text_en: it.text_en,
      text_de: it.text_de,
    })),
  };
}

/**
 * Project the Day-4 cascade results into Lucairn's locked three-category
 * scheme. Aggregates ONLY Art 10 / 12 / 14 / 15 — Article 13 and Article 50
 * intentionally do not pair into any category and surface independently.
 *
 * @param annex - Result from `classifyAnnexIII()`. Used for sanity-checking.
 * @param article5 - Result from `classifyArticle5()`. Used for sanity-checking.
 * @param article10 - Result from `classifyArticle10()`.
 * @param article12 - Result from `classifyArticle12()`.
 * @param article14 - Result from `classifyArticle14()`.
 * @param article15 - Result from `classifyArticle15()`.
 *
 * @throws TypeError if any input has the wrong shape (Day-4 M-2 closure).
 * @throws Error if upstream state is inconsistent (article5.prohibited true
 *   but annex.suppressed_by_article_5 false). This catches integration bugs
 *   where the caller forgot to refresh the annex result.
 */
export function classifyThreeCategory(
  annex: AnnexIIIResult,
  article5: Article5Result,
  article10: Article10Result,
  article12: Article12Result,
  article14: Article14Result,
  article15: Article15Result,
): ThreeCategoryResult {
  // Type-guards — Day-4 M-2 closure pattern. Each guard verifies the shape
  // (non-null, object, not Array, and at least one load-bearing field).
  if (
    annex === null ||
    typeof annex !== 'object' ||
    Array.isArray(annex) ||
    !Array.isArray((annex as AnnexIIIResult).domains) ||
    typeof (annex as AnnexIIIResult).suppressed_by_article_5 !== 'boolean'
  ) {
    throw new TypeError(
      'classifyThreeCategory(): annex must be an AnnexIIIResult object with a domains array and suppressed_by_article_5 boolean (call classifyAnnexIII() first).',
    );
  }
  if (
    article5 === null ||
    typeof article5 !== 'object' ||
    Array.isArray(article5) ||
    typeof (article5 as Article5Result).prohibited !== 'boolean'
  ) {
    throw new TypeError(
      'classifyThreeCategory(): article5 must be an Article5Result object with a prohibited boolean (call classifyArticle5() first).',
    );
  }
  const articleArgs: ReadonlyArray<readonly [string, unknown]> = [
    ['article10', article10],
    ['article12', article12],
    ['article14', article14],
    ['article15', article15],
  ];
  for (const [name, value] of articleArgs) {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      typeof (value as { applicable: unknown }).applicable !== 'boolean'
    ) {
      throw new TypeError(
        `classifyThreeCategory(): ${name} must be a result object with an applicable boolean (call the corresponding classify*() first).`,
      );
    }
  }

  // Sanity guard: integration-bug catch. classifyAnnexIII() always sets
  // suppressed_by_article_5 === article5.prohibited when fed a fresh
  // article5; if the caller passes an article5 that prohibited but an annex
  // that did NOT suppress, the inputs are inconsistent.
  if (article5.prohibited && !annex.suppressed_by_article_5) {
    throw new Error(
      'classifyThreeCategory(): inconsistent upstream state (article5.prohibited === true but annex.suppressed_by_article_5 === false). Re-run classifyAnnexIII(features, article5) to refresh.',
    );
  }

  const cat1 = aggregateCategory('1', [
    [10, article10.applicable],
    [15, article15.applicable],
  ]);
  const cat2 = aggregateCategory('2', [
    [12, article12.applicable],
    [14, article14.applicable],
  ]);
  const cat3 = aggregateCategory('3', [
    [10, article10.applicable],
    [12, article12.applicable],
    [14, article14.applicable],
    [15, article15.applicable],
  ]);

  const applicable_categories: ReadonlyArray<'1' | '2' | '3'> = (
    ['1', '2', '3'] as const
  ).filter((k) => {
    if (k === '1') return cat1.applicable;
    if (k === '2') return cat2.applicable;
    return cat3.applicable;
  });

  return {
    categories: {
      '1': cat1,
      '2': cat2,
      '3': cat3,
    },
    applicable_categories,
    disclaimer_en: GEN.disclaimer_en,
    disclaimer_de: GEN.disclaimer_de,
    source: {
      generated_file: GEN_FILE_LABEL,
      source_file: SOURCE_FILE_LABEL,
      version: GEN.version,
    },
  };
}
