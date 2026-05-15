// Snapshot tests for Day 3 + Day 4 + Day 5 rule modules.
//
// Loads each fixture under test/fixtures/use-cases/day3/ and test/fixtures/
// use-cases/day4/, runs it through the full pipeline (extractFeatures →
// classifyArticle5 → classifyAnnexIII → classifyArticle10/12/13/14/15/50 →
// classifyThreeCategory), and snapshots the structural output. Snapshot
// files are committed to git; first run via `pnpm test` writes them,
// subsequent runs compare.
//
// Why snapshots: the per-rule spec files validate specific invariants
// (sub-letter narrowing, suppression, scope qualifiers, applicability
// cascades). Snapshots catch SHAPE drift — e.g. a refactor that accidentally
// drops a reasoning line or reorders fields in the public API.
//
// Snapshot projection design choice (Day-3 lesson 2 carry-forward): the
// projection captures load-bearing structural fields ONLY (booleans, letters,
// matched_phrases, source URLs, applicable + triggered_by). It explicitly
// OMITS prose summary fields (summary_en, summary_de) and three-category
// `items[]` / `title_*` (which are synced website-managed copy, not classifier
// behaviour) so that legitimate copy-text edits don't flood snapshot diffs.
// The per-spec files have substring-match assertions that pin the summary
// fields and three-category metadata where their content is load-bearing.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFeatures } from '../../src/extract/keyword.js';
import { classifyArticle5 } from '../../src/rules/article-5.js';
import { classifyAnnexIII } from '../../src/rules/article-6-annex-iii.js';
import { classifyArticle10 } from '../../src/rules/article-10.js';
import { classifyArticle12 } from '../../src/rules/article-12.js';
import { classifyArticle13 } from '../../src/rules/article-13.js';
import { classifyArticle14 } from '../../src/rules/article-14.js';
import { classifyArticle15 } from '../../src/rules/article-15.js';
import { classifyArticle50 } from '../../src/rules/article-50.js';
import { classifyThreeCategory } from '../../src/rules/three-category.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_BASE = join(__dirname, '..', 'fixtures', 'use-cases');
const DAY3_DIR = join(FIXTURES_BASE, 'day3');
const DAY4_DIR = join(FIXTURES_BASE, 'day4');
const DAY5_DIR = join(FIXTURES_BASE, 'day5');

interface Fixture {
  id: string;
  lang: 'en' | 'de';
  input: string;
  expected: {
    article_5_prohibited: boolean;
    article_5_letters: string[];
    annex_iii_high_risk: boolean;
    annex_iii_domains: number[];
    annex_iii_sub_letters?: Record<string, string[]>;
    suppressed_by_article_5: boolean;
    notes: string;
  };
}

function loadFixturesFrom(dir: string): Fixture[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  return files.map((filename) => {
    const raw = readFileSync(join(dir, filename), 'utf8');
    return JSON.parse(raw) as Fixture;
  });
}

describe('snapshot — Day 3 fixtures (8 Annex III domains)', () => {
  const fixtures = loadFixturesFrom(DAY3_DIR);

  it('loaded exactly 8 fixtures (one per Annex III domain)', () => {
    expect(fixtures.length).toBe(8);
  });

  for (const fixture of fixtures) {
    it(`${fixture.id} — pipeline output matches snapshot`, () => {
      const features = extractFeatures(fixture.input, { lang: fixture.lang });
      const article5 = classifyArticle5(features);
      const annexIII = classifyAnnexIII(features, article5);
      const article10 = classifyArticle10(annexIII, article5);
      const article12 = classifyArticle12(annexIII, article5);
      const article13 = classifyArticle13(annexIII, article5);
      const article14 = classifyArticle14(annexIII, article5);
      const article15 = classifyArticle15(annexIII, article5);
      const article50 = classifyArticle50(features, article5);
      const threeCategory = classifyThreeCategory(
        annexIII,
        article5,
        article10,
        article12,
        article14,
        article15,
      );

      // Snapshot the load-bearing structural output (omits internal noise like
      // raw input, lang detection internals — those are covered by unit tests
      // on the extractor itself). For Article 10/12/13/14/15/50 we project
      // ONLY load-bearing fields (`applicable`, `triggered_by`, `source`) and
      // NOT the prose summaries (Day-3 design choice — see file-header
      // comment). For three-category we project per-category `applicable`,
      // `required_articles`, `triggered_articles`, plus `applicable_categories`
      // — NOT `items[]` / `title_*` / `disclaimer_*` which are synced
      // website-managed copy.
      expect({
        id: fixture.id,
        lang: fixture.lang,
        input: fixture.input,
        article5: {
          prohibited: article5.prohibited,
          hits: article5.hits.map((h) => ({
            letter: h.letter,
            category_key: h.category_key,
            matched_phrases: h.matched_phrases,
            source: h.source,
          })),
          reasoning_count: article5.reasoning.length,
        },
        annexIII: {
          high_risk: annexIII.high_risk,
          suppressed_by_article_5: annexIII.suppressed_by_article_5,
          domains: annexIII.domains.map((d) => ({
            annex_iii_number: d.annex_iii_number,
            key: d.key,
            sub_letters: d.sub_letters,
            matched_phrases: d.matched_phrases,
            source: d.source,
          })),
          reasoning_count: annexIII.reasoning.length,
        },
        article10: {
          applicable: article10.applicable,
          triggered_by: article10.triggered_by,
          source: article10.source,
        },
        article12: {
          applicable: article12.applicable,
          triggered_by: article12.triggered_by,
          source: article12.source,
        },
        article13: {
          applicable: article13.applicable,
          triggered_by: article13.triggered_by,
          source: article13.source,
        },
        article14: {
          applicable: article14.applicable,
          triggered_by: article14.triggered_by,
          source: article14.source,
        },
        article15: {
          applicable: article15.applicable,
          triggered_by: article15.triggered_by,
          source: article15.source,
        },
        article50: {
          applicable: article50.applicable,
          triggered_by: article50.triggered_by,
          source: article50.source,
        },
        threeCategory: {
          categories: {
            '1': {
              key: threeCategory.categories['1'].key,
              applicable: threeCategory.categories['1'].applicable,
              required_articles: threeCategory.categories['1'].required_articles,
              triggered_articles: threeCategory.categories['1'].triggered_articles,
            },
            '2': {
              key: threeCategory.categories['2'].key,
              applicable: threeCategory.categories['2'].applicable,
              required_articles: threeCategory.categories['2'].required_articles,
              triggered_articles: threeCategory.categories['2'].triggered_articles,
            },
            '3': {
              key: threeCategory.categories['3'].key,
              applicable: threeCategory.categories['3'].applicable,
              required_articles: threeCategory.categories['3'].required_articles,
              triggered_articles: threeCategory.categories['3'].triggered_articles,
            },
          },
          applicable_categories: threeCategory.applicable_categories,
        },
      }).toMatchSnapshot();
    });

    it(`${fixture.id} — expected boolean flags hold`, () => {
      const features = extractFeatures(fixture.input, { lang: fixture.lang });
      const article5 = classifyArticle5(features);
      const annexIII = classifyAnnexIII(features, article5);

      expect(article5.prohibited).toBe(fixture.expected.article_5_prohibited);
      expect(annexIII.high_risk).toBe(fixture.expected.annex_iii_high_risk);
      expect(annexIII.suppressed_by_article_5).toBe(fixture.expected.suppressed_by_article_5);

      // Article 5 letters set membership.
      const actualLetters = article5.hits.map((h) => h.letter).sort();
      expect(actualLetters).toEqual([...fixture.expected.article_5_letters].sort());

      // Annex III domain set membership (subset check — the fixture lists the
      // expected domains; pipeline may surface additional unsuppressed lexicon
      // hits which is fine).
      const actualDomains = annexIII.domains.map((d) => d.annex_iii_number);
      for (const expectedDomain of fixture.expected.annex_iii_domains) {
        expect(actualDomains).toContain(expectedDomain);
      }

      // Sub-letter expectations (when the fixture pins them). Uses toEqual
      // (not toContain) so an over-narrowed OR over-claimed result fails the
      // fixture — toContain would silently accept extra sub-letters and
      // defeat the point of pinning the expected set.
      if (fixture.expected.annex_iii_sub_letters !== undefined) {
        for (const [domainStr, expectedSubs] of Object.entries(
          fixture.expected.annex_iii_sub_letters,
        )) {
          const domainNum = Number(domainStr);
          const actualDomain = annexIII.domains.find((d) => d.annex_iii_number === domainNum);
          expect(actualDomain).toBeDefined();
          expect([...actualDomain!.sub_letters].sort()).toEqual([...expectedSubs].sort());
        }
      }
    });
  }

  // Targeted Day-4 + Day-5 cascade invariants that the snapshot also pins
  // but which deserve explicit assertions for traceability.
  it('fixture-day3-01 (Art 5(1)(h) prohibition) → Article 10/12/13/14/15 all NOT applicable; all 3 categories applicable: false', () => {
    const fixture = fixtures.find((f) => f.id === 'fixture-day3-01-biometrics-prohibited-en');
    expect(fixture).toBeDefined();
    const features = extractFeatures(fixture!.input, { lang: fixture!.lang });
    const article5 = classifyArticle5(features);
    const annexIII = classifyAnnexIII(features, article5);

    const a10 = classifyArticle10(annexIII, article5);
    const a12 = classifyArticle12(annexIII, article5);
    const a13 = classifyArticle13(annexIII, article5);
    const a14 = classifyArticle14(annexIII, article5);
    const a15 = classifyArticle15(annexIII, article5);

    for (const r of [a10, a12, a13, a14, a15]) {
      expect(r.applicable).toBe(false);
      expect(r.triggered_by.article_5).toBe(true);
      // Sub-letter accumulator pattern (Day-3 lesson 1): sorted toEqual on
      // arrays, never toContain.
      expect(r.triggered_by.annex_iii_domains).toEqual([]);
    }

    const tc = classifyThreeCategory(annexIII, article5, a10, a12, a14, a15);
    expect(tc.categories['1'].applicable).toBe(false);
    expect(tc.categories['2'].applicable).toBe(false);
    expect(tc.categories['3'].applicable).toBe(false);
    expect(tc.categories['1'].triggered_articles).toEqual([]);
    expect(tc.categories['2'].triggered_articles).toEqual([]);
    expect(tc.categories['3'].triggered_articles).toEqual([]);
    expect(tc.applicable_categories).toEqual([]);
  });

  it('fixture-day3-04 (Annex III.4 employment) → Article 10/12/13/14/15 all applicable; all 3 categories applicable: true with sorted triggered_articles', () => {
    const fixture = fixtures.find((f) => f.id === 'fixture-day3-04-employment-en');
    expect(fixture).toBeDefined();
    const features = extractFeatures(fixture!.input, { lang: fixture!.lang });
    const article5 = classifyArticle5(features);
    const annexIII = classifyAnnexIII(features, article5);

    const a10 = classifyArticle10(annexIII, article5);
    const a12 = classifyArticle12(annexIII, article5);
    const a13 = classifyArticle13(annexIII, article5);
    const a14 = classifyArticle14(annexIII, article5);
    const a15 = classifyArticle15(annexIII, article5);

    for (const r of [a10, a12, a13, a14, a15]) {
      expect(r.applicable).toBe(true);
      expect(r.triggered_by.article_5).toBe(false);
      expect(r.triggered_by.annex_iii_domains).toEqual([4]);
    }

    const tc = classifyThreeCategory(annexIII, article5, a10, a12, a14, a15);
    expect(tc.categories['1'].applicable).toBe(true);
    expect(tc.categories['2'].applicable).toBe(true);
    expect(tc.categories['3'].applicable).toBe(true);
    expect(tc.categories['1'].triggered_articles).toEqual([10, 15]);
    expect(tc.categories['2'].triggered_articles).toEqual([12, 14]);
    // ≥3 out-of-order sort exercise: Cat 3 has 4 contributing articles.
    expect(tc.categories['3'].triggered_articles).toEqual([10, 12, 14, 15]);
    expect(tc.applicable_categories).toEqual(['1', '2', '3']);
  });
});

describe('snapshot — Day 4 fixtures (low-risk non-applicable path)', () => {
  const fixtures = loadFixturesFrom(DAY4_DIR);

  it('loaded at least 1 fixture', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(1);
  });

  for (const fixture of fixtures) {
    it(`${fixture.id} — pipeline output matches snapshot`, () => {
      const features = extractFeatures(fixture.input, { lang: fixture.lang });
      const article5 = classifyArticle5(features);
      const annexIII = classifyAnnexIII(features, article5);
      const article10 = classifyArticle10(annexIII, article5);
      const article12 = classifyArticle12(annexIII, article5);
      const article13 = classifyArticle13(annexIII, article5);
      const article14 = classifyArticle14(annexIII, article5);
      const article15 = classifyArticle15(annexIII, article5);
      const article50 = classifyArticle50(features, article5);
      const threeCategory = classifyThreeCategory(
        annexIII,
        article5,
        article10,
        article12,
        article14,
        article15,
      );

      expect({
        id: fixture.id,
        lang: fixture.lang,
        input: fixture.input,
        article5: {
          prohibited: article5.prohibited,
          hits: article5.hits.map((h) => ({
            letter: h.letter,
            category_key: h.category_key,
            matched_phrases: h.matched_phrases,
            source: h.source,
          })),
          reasoning_count: article5.reasoning.length,
        },
        annexIII: {
          high_risk: annexIII.high_risk,
          suppressed_by_article_5: annexIII.suppressed_by_article_5,
          domains: annexIII.domains.map((d) => ({
            annex_iii_number: d.annex_iii_number,
            key: d.key,
            sub_letters: d.sub_letters,
            matched_phrases: d.matched_phrases,
            source: d.source,
          })),
          reasoning_count: annexIII.reasoning.length,
        },
        article10: {
          applicable: article10.applicable,
          triggered_by: article10.triggered_by,
          source: article10.source,
        },
        article12: {
          applicable: article12.applicable,
          triggered_by: article12.triggered_by,
          source: article12.source,
        },
        article13: {
          applicable: article13.applicable,
          triggered_by: article13.triggered_by,
          source: article13.source,
        },
        article14: {
          applicable: article14.applicable,
          triggered_by: article14.triggered_by,
          source: article14.source,
        },
        article15: {
          applicable: article15.applicable,
          triggered_by: article15.triggered_by,
          source: article15.source,
        },
        article50: {
          applicable: article50.applicable,
          triggered_by: article50.triggered_by,
          source: article50.source,
        },
        threeCategory: {
          categories: {
            '1': {
              key: threeCategory.categories['1'].key,
              applicable: threeCategory.categories['1'].applicable,
              required_articles: threeCategory.categories['1'].required_articles,
              triggered_articles: threeCategory.categories['1'].triggered_articles,
            },
            '2': {
              key: threeCategory.categories['2'].key,
              applicable: threeCategory.categories['2'].applicable,
              required_articles: threeCategory.categories['2'].required_articles,
              triggered_articles: threeCategory.categories['2'].triggered_articles,
            },
            '3': {
              key: threeCategory.categories['3'].key,
              applicable: threeCategory.categories['3'].applicable,
              required_articles: threeCategory.categories['3'].required_articles,
              triggered_articles: threeCategory.categories['3'].triggered_articles,
            },
          },
          applicable_categories: threeCategory.applicable_categories,
        },
      }).toMatchSnapshot();
    });

    it(`${fixture.id} — non-high-risk path: all Day-4 + Day-5 cascade articles return applicable === false; all 3 categories applicable: false`, () => {
      const features = extractFeatures(fixture.input, { lang: fixture.lang });
      const article5 = classifyArticle5(features);
      const annexIII = classifyAnnexIII(features, article5);

      expect(article5.prohibited).toBe(fixture.expected.article_5_prohibited);
      expect(annexIII.high_risk).toBe(fixture.expected.annex_iii_high_risk);
      expect(annexIII.suppressed_by_article_5).toBe(fixture.expected.suppressed_by_article_5);

      const a10 = classifyArticle10(annexIII, article5);
      const a12 = classifyArticle12(annexIII, article5);
      const a13 = classifyArticle13(annexIII, article5);
      const a14 = classifyArticle14(annexIII, article5);
      const a15 = classifyArticle15(annexIII, article5);

      for (const r of [a10, a12, a13, a14, a15]) {
        expect(r.applicable).toBe(false);
        expect(r.triggered_by.article_5).toBe(false);
        expect(r.triggered_by.annex_iii_domains).toEqual([]);
      }

      const tc = classifyThreeCategory(annexIII, article5, a10, a12, a14, a15);
      expect(tc.categories['1'].applicable).toBe(false);
      expect(tc.categories['2'].applicable).toBe(false);
      expect(tc.categories['3'].applicable).toBe(false);
      expect(tc.applicable_categories).toEqual([]);
    });
  }
});

describe('snapshot — Day 5 fixtures (Article 50 non-high-risk paths)', () => {
  const fixtures = loadFixturesFrom(DAY5_DIR);

  it('loaded at least 2 fixtures (Art 50 chatbot EN + deepfake DE)', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(2);
  });

  for (const fixture of fixtures) {
    it(`${fixture.id} — pipeline output matches snapshot`, () => {
      const features = extractFeatures(fixture.input, { lang: fixture.lang });
      const article5 = classifyArticle5(features);
      const annexIII = classifyAnnexIII(features, article5);
      const article10 = classifyArticle10(annexIII, article5);
      const article12 = classifyArticle12(annexIII, article5);
      const article13 = classifyArticle13(annexIII, article5);
      const article14 = classifyArticle14(annexIII, article5);
      const article15 = classifyArticle15(annexIII, article5);
      const article50 = classifyArticle50(features, article5, annexIII);
      const threeCategory = classifyThreeCategory(
        annexIII,
        article5,
        article10,
        article12,
        article14,
        article15,
      );

      expect({
        id: fixture.id,
        lang: fixture.lang,
        input: fixture.input,
        article5: {
          prohibited: article5.prohibited,
          hits: article5.hits.map((h) => ({
            letter: h.letter,
            category_key: h.category_key,
            matched_phrases: h.matched_phrases,
            source: h.source,
          })),
          reasoning_count: article5.reasoning.length,
        },
        annexIII: {
          high_risk: annexIII.high_risk,
          suppressed_by_article_5: annexIII.suppressed_by_article_5,
          domains: annexIII.domains.map((d) => ({
            annex_iii_number: d.annex_iii_number,
            key: d.key,
            sub_letters: d.sub_letters,
            matched_phrases: d.matched_phrases,
            source: d.source,
          })),
          reasoning_count: annexIII.reasoning.length,
        },
        article10: {
          applicable: article10.applicable,
          triggered_by: article10.triggered_by,
          source: article10.source,
        },
        article12: {
          applicable: article12.applicable,
          triggered_by: article12.triggered_by,
          source: article12.source,
        },
        article13: {
          applicable: article13.applicable,
          triggered_by: article13.triggered_by,
          source: article13.source,
        },
        article14: {
          applicable: article14.applicable,
          triggered_by: article14.triggered_by,
          source: article14.source,
        },
        article15: {
          applicable: article15.applicable,
          triggered_by: article15.triggered_by,
          source: article15.source,
        },
        article50: {
          applicable: article50.applicable,
          triggered_by: article50.triggered_by,
          source: article50.source,
        },
        threeCategory: {
          categories: {
            '1': {
              key: threeCategory.categories['1'].key,
              applicable: threeCategory.categories['1'].applicable,
              required_articles: threeCategory.categories['1'].required_articles,
              triggered_articles: threeCategory.categories['1'].triggered_articles,
            },
            '2': {
              key: threeCategory.categories['2'].key,
              applicable: threeCategory.categories['2'].applicable,
              required_articles: threeCategory.categories['2'].required_articles,
              triggered_articles: threeCategory.categories['2'].triggered_articles,
            },
            '3': {
              key: threeCategory.categories['3'].key,
              applicable: threeCategory.categories['3'].applicable,
              required_articles: threeCategory.categories['3'].required_articles,
              triggered_articles: threeCategory.categories['3'].triggered_articles,
            },
          },
          applicable_categories: threeCategory.applicable_categories,
        },
      }).toMatchSnapshot();
    });

    it(`${fixture.id} — Day-5 fixtures exercise Article 50 path; Day-3/4 cascade modules return applicable === false; three-category applicable_categories === []`, () => {
      const features = extractFeatures(fixture.input, { lang: fixture.lang });
      const article5 = classifyArticle5(features);
      const annexIII = classifyAnnexIII(features, article5);

      expect(article5.prohibited).toBe(fixture.expected.article_5_prohibited);
      expect(annexIII.high_risk).toBe(fixture.expected.annex_iii_high_risk);

      const a10 = classifyArticle10(annexIII, article5);
      const a12 = classifyArticle12(annexIII, article5);
      const a13 = classifyArticle13(annexIII, article5);
      const a14 = classifyArticle14(annexIII, article5);
      const a15 = classifyArticle15(annexIII, article5);
      const a50 = classifyArticle50(features, article5, annexIII);

      // Day-3/4 cascade modules → applicable === false (these fixtures are not
      // high-risk under Annex III).
      for (const r of [a10, a12, a13, a14, a15]) {
        expect(r.applicable).toBe(false);
      }

      // Article 50 fires (whichever paragraph the fixture targets).
      expect(a50.applicable).toBe(true);

      // Three-category overlay therefore has applicable_categories === [].
      const tc = classifyThreeCategory(annexIII, article5, a10, a12, a14, a15);
      expect(tc.applicable_categories).toEqual([]);
    });
  }
});
