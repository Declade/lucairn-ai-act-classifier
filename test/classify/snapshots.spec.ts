// End-to-end snapshot tests for the `classify()` orchestration.
//
// Companion to `test/rules/snapshots.spec.ts` (per-module snapshots). This
// suite snapshots the full `ClassifyResult` projection across all 11 fixtures
// (8 Day-3 + 1 Day-4 + 2 Day-5), exercising:
//   - the orchestration order is correct
//   - `annex_iv_required` derivation
//   - `three_category` aggregation when not opted-out
//   - `rules_version` + `rules_hash` + `mode` + `confidence` surfacing
//
// Projection design (Day-3 lesson 2 carry-forward): load-bearing structural
// fields ONLY. Drops `summary_en` / `summary_de` prose (covered by per-module
// specs) and full `features` (volatile lexicon hits — covered by Day-2 extract
// specs).

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, type ClassifyResult } from '../../src/classify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_BASE = join(__dirname, '..', 'fixtures', 'use-cases');

interface Fixture {
  id: string;
  lang: 'en' | 'de';
  input: string;
  expected: unknown;
}

function loadAllFixtures(): Fixture[] {
  const dirs = ['day3', 'day4', 'day5'];
  const out: Fixture[] = [];
  for (const day of dirs) {
    const dir = join(FIXTURES_BASE, day);
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort();
    for (const filename of files) {
      const raw = readFileSync(join(dir, filename), 'utf8');
      out.push(JSON.parse(raw) as Fixture);
    }
  }
  return out;
}

/** Project a ClassifyResult down to its load-bearing structural fields. */
function project(r: ClassifyResult): Record<string, unknown> {
  return {
    detected_lang: r.detected_lang,
    lang_confident: r.lang_confident,
    rules_version: r.rules_version,
    rules_hash: r.rules_hash,
    mode: r.mode,
    // Round confidence to 2 places for stable snapshots (the formula already
    // does this, but the JSON serializer can sometimes emit 0.40 → 0.4; force
    // via toFixed string for snapshot stability).
    confidence: Number(r.confidence.toFixed(2)),
    article_5: {
      prohibited: r.article_5.prohibited,
      hits: r.article_5.hits.map((h) => ({ letter: h.letter, category_key: h.category_key })),
    },
    annex_iii: {
      high_risk: r.annex_iii.high_risk,
      suppressed_by_article_5: r.annex_iii.suppressed_by_article_5,
      domains: r.annex_iii.domains.map((d) => ({
        annex_iii_number: d.annex_iii_number,
        sub_letters: d.sub_letters,
      })),
    },
    article_10: { applicable: r.article_10.applicable },
    article_12: { applicable: r.article_12.applicable },
    article_13: { applicable: r.article_13.applicable },
    article_14: { applicable: r.article_14.applicable },
    article_15: { applicable: r.article_15.applicable },
    article_50: {
      applicable: r.article_50.applicable,
      triggered_by: r.article_50.triggered_by,
    },
    article_4: {
      applicable: r.article_4.applicable,
      triggered_by: r.article_4.triggered_by,
    },
    gpai: {
      article_53_applicable: r.gpai.article_53_applicable,
      article_55_applicable: r.gpai.article_55_applicable,
      triggered_by: r.gpai.triggered_by,
    },
    three_category:
      r.three_category === null
        ? null
        : {
            applicable_categories: r.three_category.applicable_categories,
            cat_1_applicable: r.three_category.categories['1'].applicable,
            cat_2_applicable: r.three_category.categories['2'].applicable,
            cat_3_applicable: r.three_category.categories['3'].applicable,
          },
    annex_iv_required: r.annex_iv_required,
  };
}

describe('classify() — end-to-end orchestration snapshots', () => {
  const fixtures = loadAllFixtures();

  it('loaded 11 fixtures total', () => {
    expect(fixtures.length).toBe(11);
  });

  for (const fixture of fixtures) {
    it(`${fixture.id} — projected ClassifyResult matches snapshot`, async () => {
      const r = await classify(fixture.input, { lang: fixture.lang });
      expect(project(r)).toMatchSnapshot();
    });
  }

  it('all 11 fixtures produce a ClassifyResult without throwing', async () => {
    for (const f of fixtures) {
      await expect(classify(f.input, { lang: f.lang })).resolves.toBeDefined();
    }
  });

  it('idempotency: classifying the same fixture twice returns equal projections', async () => {
    // Pick a representative high-risk fixture.
    const employment = fixtures.find((f) => f.id === 'fixture-day3-04-employment-en');
    expect(employment).toBeDefined();
    const a = await classify(employment!.input, { lang: employment!.lang });
    const b = await classify(employment!.input, { lang: employment!.lang });
    expect(project(a)).toEqual(project(b));
  });
});
