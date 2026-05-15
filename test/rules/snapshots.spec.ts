// Snapshot tests for Day 3 rule modules.
//
// Loads each fixture under test/fixtures/use-cases/day3/, runs it through the
// full pipeline (extractFeatures → classifyArticle5 → classifyAnnexIII), and
// snapshots the structural output. Snapshot files are committed to git; first
// run via `pnpm test` writes them, subsequent runs compare.
//
// Why snapshots: the per-rule spec files validate specific invariants
// (sub-letter narrowing, suppression, scope qualifiers). Snapshots catch
// SHAPE drift — e.g. a refactor that accidentally drops a reasoning line or
// reorders fields in the public API.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFeatures } from '../../src/extract/keyword.js';
import { classifyArticle5 } from '../../src/rules/article-5.js';
import { classifyAnnexIII } from '../../src/rules/article-6-annex-iii.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'use-cases', 'day3');

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

function loadFixtures(): Fixture[] {
  const files = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  return files.map((filename) => {
    const raw = readFileSync(join(FIXTURES_DIR, filename), 'utf8');
    return JSON.parse(raw) as Fixture;
  });
}

describe('snapshot — Day 3 fixtures (8 Annex III domains)', () => {
  const fixtures = loadFixtures();

  it('loaded exactly 8 fixtures (one per Annex III domain)', () => {
    expect(fixtures.length).toBe(8);
  });

  for (const fixture of fixtures) {
    it(`${fixture.id} — pipeline output matches snapshot`, () => {
      const features = extractFeatures(fixture.input, { lang: fixture.lang });
      const article5 = classifyArticle5(features);
      const annexIII = classifyAnnexIII(features, article5);

      // Snapshot the load-bearing structural output (omits internal noise like
      // raw input, lang detection internals — those are covered by unit tests
      // on the extractor itself).
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
});
