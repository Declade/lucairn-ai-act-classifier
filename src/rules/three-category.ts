// Three-category overlay — Lucairn's locked Cat 1 / Cat 2 / Cat 3 scheme.
//
// Pure-function rule module. Aggregates the per-article results from
// classifyArticle10 / 12 / 14 / 15 (and surfaces classifyArticle13 / 50 by
// reference as "not in any category pairing") into a single three-category
// projection that mirrors Lucairn's compliance checklist source-of-truth on
// the website.
//
// Locked three-category mapping (do NOT reopen — cite CLAUDE.md
// `## Locked decisions`):
//   Cat 1 (Sanitizer)  = Art 10 + 15
//   Cat 2 (Evidence)   = Art 12 + 14
//   Cat 3 (Inventory)  = Art 10 + 12 + 14 + 15
//
// Articles INTENTIONALLY OMITTED from the three-category pairing:
//   - Article 13 (transparency to deployers) — separate obligation track.
//     Surface independently in the classifier output.
//   - Article 50 (GPAI / deployer transparency) — different cascade root
//     (NOT gated on Annex III high-risk). Surface independently.
//   - Article 5 (prohibited practices) — supersedes the high-risk obligation
//     overlay entirely. When `article5.prohibited === true`, ALL three
//     categories are marked `required: false` (the system cannot be placed
//     on the market regardless of high-risk overlay).
//
// Source-of-truth: the static text content (category titles, item lists,
// disclaimer) is synced from the Lucairn website's compliance checklist at
// `theveil-website/src/lib/compliance/checklist-content.ts` via
// `scripts/sync-three-category.ts`, which emits the committed build artifact
// `src/data/three-category.gen.json`. This module reads that JSON at module
// init (deterministic — the file is build-output checked into git, not
// regenerated at runtime).
//
// Pure-function discipline:
//   - No I/O at runtime. The JSON load happens once at module init via the
//     same `readFileSync` pattern as `article-6-annex-iii.ts` (the npm tarball
//     ships `dist/data/` thanks to the build script's `cp -R` step).
//   - Same input → same output, byte-for-byte.
//   - Type-guards every result-input parameter (Day-4 M-2 closure pattern).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { AnnexIIIResult } from './article-6-annex-iii.js';
import type { Article5Result } from './article-5.js';
import type { Article10Result } from './article-10.js';
import type { Article12Result } from './article-12.js';
import type { Article13Result } from './article-13.js';
import type { Article14Result } from './article-14.js';
import type { Article15Result } from './article-15.js';
import type { Article50Result } from './article-50.js';

// ---------------------------------------------------------------------------
// JSON shape (kept in sync with scripts/sync-three-category.ts output)
// ---------------------------------------------------------------------------

interface ThreeCategoryJsonItem {
  number: number;
  text_en: string;
  text_de: string;
}

interface ThreeCategoryJsonCategory {
  title_en: string;
  title_de: string;
  articles: string[];
  items: ThreeCategoryJsonItem[];
}

interface ThreeCategoryJson {
  _source_sha256: string;
  _source_label: string;
  categories: {
    '1': ThreeCategoryJsonCategory;
    '2': ThreeCategoryJsonCategory;
    '3': ThreeCategoryJsonCategory;
  };
  disclaimer_en: string;
  disclaimer_de: string;
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
  /** True iff any contributing article is applicable AND Article 5 didn't prohibit. */
  required: boolean;
  /** Locked article list for this category (e.g. ['10', '15'] for Cat 1). Sorted ascending. */
  articles: string[];
  /** Subset of `articles` that returned `applicable: true`. Empty when `required: false`. */
  contributing_articles: string[];
  title_en: string;
  title_de: string;
  /** Checklist items synced from the website source-of-truth. */
  items: ThreeCategoryItem[];
}

export interface ThreeCategoryResult {
  category_1_sanitizer: ThreeCategoryAggregate;
  category_2_evidence: ThreeCategoryAggregate;
  category_3_inventory: ThreeCategoryAggregate;
  /**
   * URL of the Lucairn three-category overlay documentation page.
   * NOT EUR-Lex — the three-category scheme is an OPINIONATED overlay
   * authored by Lucairn, not regulatory text.
   */
  source: string;
  disclaimer_en: string;
  disclaimer_de: string;
}

export interface ThreeCategoryInputs {
  article5: Article5Result;
  annex: AnnexIIIResult;
  article10: Article10Result;
  article12: Article12Result;
  article13: Article13Result;
  article14: Article14Result;
  article15: Article15Result;
  article50: Article50Result;
}

// ---------------------------------------------------------------------------
// JSON data load (cached at module init — mirrors annex-iii pattern)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// dist/rules/three-category.js → ../data/three-category.gen.json
const DATA_DIR = join(__dirname, '..', 'data');

function loadGenJson(): ThreeCategoryJson {
  const path = join(DATA_DIR, 'three-category.gen.json');
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as ThreeCategoryJson;
}

const GEN: ThreeCategoryJson = loadGenJson();

/**
 * Reload the three-category.gen.json data from disk. Test helper — not part of
 * the public API.
 * @internal
 */
export function _reloadThreeCategoryGen(): void {
  const fresh = loadGenJson();
  GEN._source_sha256 = fresh._source_sha256;
  GEN._source_label = fresh._source_label;
  GEN.categories = fresh.categories;
  GEN.disclaimer_en = fresh.disclaimer_en;
  GEN.disclaimer_de = fresh.disclaimer_de;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const LUCAIRN_SOURCE = 'https://lucairn.eu/compliance/eu-ai-act';

/**
 * Project the per-article cascade results into Lucairn's locked three-category
 * scheme.
 *
 * Aggregation rules:
 *   - Cat 1 (Sanitizer) = Art 10 + 15. `required` if either applies.
 *   - Cat 2 (Evidence)  = Art 12 + 14. `required` if either applies.
 *   - Cat 3 (Inventory) = Art 10 + 12 + 14 + 15. `required` if ANY apply.
 *   - `contributing_articles` lists which articles in the category returned
 *     `applicable: true`, sorted alphabetically (Day-4 lesson — defensive
 *     sort for snapshot stability).
 *
 * Suppression interaction:
 *   - If `article5.prohibited === true`, ALL three categories are
 *     `required: false` and `contributing_articles: []`. The system shouldn't
 *     be deployed; the obligation overlay is moot.
 *
 * Article 13 and Article 50 are NOT in any category pairing — they surface
 * independently from the caller's perspective.
 */
export function classifyThreeCategory(inputs: ThreeCategoryInputs): ThreeCategoryResult {
  if (inputs === null || typeof inputs !== 'object') {
    throw new TypeError(
      'classifyThreeCategory(): inputs must be a ThreeCategoryInputs object (call the individual classifyArticle*() functions first and pass their results).',
    );
  }
  // Type-guard each result. Missing-property checks use `typeof obj.field`
  // rather than `'field' in obj` to also catch undefined-valued fields.
  const guards: ReadonlyArray<readonly [string, unknown, string]> = [
    ['article5', inputs.article5, 'Article5Result'],
    ['annex', inputs.annex, 'AnnexIIIResult'],
    ['article10', inputs.article10, 'Article10Result'],
    ['article12', inputs.article12, 'Article12Result'],
    ['article13', inputs.article13, 'Article13Result'],
    ['article14', inputs.article14, 'Article14Result'],
    ['article15', inputs.article15, 'Article15Result'],
    ['article50', inputs.article50, 'Article50Result'],
  ];
  for (const [name, value, typeName] of guards) {
    if (value === null || typeof value !== 'object') {
      throw new TypeError(
        `classifyThreeCategory(): inputs.${name} must be a non-null ${typeName} object (call classify${typeName.replace(/Result$/, '')}() first).`,
      );
    }
  }
  // Field-level sanity checks: the booleans we read MUST be booleans.
  if (typeof inputs.article5.prohibited !== 'boolean') {
    throw new TypeError(
      'classifyThreeCategory(): inputs.article5.prohibited must be a boolean (Article5Result shape violated).',
    );
  }
  for (const k of ['article10', 'article12', 'article13', 'article14', 'article15', 'article50'] as const) {
    if (typeof (inputs[k] as { applicable: unknown }).applicable !== 'boolean') {
      throw new TypeError(
        `classifyThreeCategory(): inputs.${k}.applicable must be a boolean.`,
      );
    }
  }

  // Suppression — Article 5 wins absolutely.
  const prohibited = inputs.article5.prohibited;

  function aggregate(
    catKey: '1' | '2' | '3',
    contributingPairs: ReadonlyArray<readonly [string, boolean]>,
  ): ThreeCategoryAggregate {
    const cat = GEN.categories[catKey];
    // `articles` field is taken straight from the generated JSON. We also
    // sort to be defensive — should already be sorted by the sync script's
    // CATEGORY_ARTICLES table.
    const articles = [...cat.articles].sort();

    if (prohibited) {
      return {
        required: false,
        articles,
        contributing_articles: [],
        title_en: cat.title_en,
        title_de: cat.title_de,
        items: cat.items.map((it) => ({
          number: it.number,
          text_en: it.text_en,
          text_de: it.text_de,
        })),
      };
    }

    const contributing = contributingPairs
      .filter(([, applicable]) => applicable)
      .map(([article]) => article);
    const sorted = [...contributing].sort();

    return {
      required: sorted.length > 0,
      articles,
      contributing_articles: sorted,
      title_en: cat.title_en,
      title_de: cat.title_de,
      items: cat.items.map((it) => ({
        number: it.number,
        text_en: it.text_en,
        text_de: it.text_de,
      })),
    };
  }

  return {
    category_1_sanitizer: aggregate('1', [
      ['10', inputs.article10.applicable],
      ['15', inputs.article15.applicable],
    ]),
    category_2_evidence: aggregate('2', [
      ['12', inputs.article12.applicable],
      ['14', inputs.article14.applicable],
    ]),
    category_3_inventory: aggregate('3', [
      ['10', inputs.article10.applicable],
      ['12', inputs.article12.applicable],
      ['14', inputs.article14.applicable],
      ['15', inputs.article15.applicable],
    ]),
    source: LUCAIRN_SOURCE,
    disclaimer_en: GEN.disclaimer_en,
    disclaimer_de: GEN.disclaimer_de,
  };
}
