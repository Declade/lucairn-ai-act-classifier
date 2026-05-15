// Unit tests for the Day-6 `classify()` orchestration.
//
// Day-1 stub test (which expected "not yet implemented") is REPLACED by this
// suite. The Day-1 stub `ClassifyResult` shape was a placeholder that no
// caller consumed; rewriting it is non-breaking pre-v0.1.0-publish.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from '../src/classify.js';
import { RULES_VERSION } from '../src/util/rules-hash.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_BASE = join(__dirname, 'fixtures', 'use-cases');

interface Fixture {
  id: string;
  lang: 'en' | 'de';
  input: string;
  expected: {
    article_5_prohibited: boolean;
    annex_iii_high_risk: boolean;
    suppressed_by_article_5: boolean;
  };
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

describe('classify() — input validation', () => {
  it('throws TypeError on empty string', () => {
    expect(() => classify('')).toThrow(TypeError);
    expect(() => classify('')).toThrow(/non-empty string/);
  });

  it('throws TypeError on whitespace-only input', () => {
    expect(() => classify('   ')).toThrow(TypeError);
    expect(() => classify('\n\t  ')).toThrow(TypeError);
  });

  it('throws TypeError on non-string input', () => {
    // @ts-expect-error: deliberately invalid for runtime guard test
    expect(() => classify(123)).toThrow(TypeError);
    // @ts-expect-error: deliberately invalid for runtime guard test
    expect(() => classify(null)).toThrow(TypeError);
    // @ts-expect-error: deliberately invalid for runtime guard test
    expect(() => classify(undefined)).toThrow(TypeError);
  });
});

describe('classify() — result shape', () => {
  it('returns an object with all 18 top-level keys + correct types', () => {
    const r = classify('We use AI for CV screening and applicant tracking.');
    expect(typeof r.input_text).toBe('string');
    expect(r.detected_lang === 'en' || r.detected_lang === 'de').toBe(true);
    expect(typeof r.lang_confident).toBe('boolean');
    expect(typeof r.rules_version).toBe('string');
    expect(r.rules_hash).toMatch(/^[0-9a-f]{8}$/);
    expect(r.rules_hash_full).toMatch(/^[0-9a-f]{64}$/);
    expect(r.mode).toBe('deterministic');
    expect(typeof r.confidence).toBe('number');
    expect(typeof r.features).toBe('object');
    expect(typeof r.article_5).toBe('object');
    expect(typeof r.annex_iii).toBe('object');
    expect(typeof r.article_10).toBe('object');
    expect(typeof r.article_12).toBe('object');
    expect(typeof r.article_13).toBe('object');
    expect(typeof r.article_14).toBe('object');
    expect(typeof r.article_15).toBe('object');
    expect(typeof r.article_50).toBe('object');
    expect(typeof r.annex_iv_required).toBe('boolean');
    // three_category may be ThreeCategoryResult or null (only null when opt-out).
    expect(r.three_category !== null && typeof r.three_category === 'object').toBe(true);
  });

  it('rules_version matches the current package.json version', () => {
    const r = classify('We use AI for CV screening.');
    expect(r.rules_version).toBe(RULES_VERSION);
  });

  it('mode === "deterministic" always in Day 6 (LLM mode is Day 9)', () => {
    const r = classify('We use AI for CV screening.', { llm: 'anthropic' });
    expect(r.mode).toBe('deterministic');
  });
});

describe('classify() — opts.threeCategory', () => {
  it('opts.threeCategory: false → three_category is null', () => {
    const r = classify('We use AI for CV screening.', { threeCategory: false });
    expect(r.three_category).toBeNull();
  });

  it('opts.threeCategory: true (default) → three_category is ThreeCategoryResult', () => {
    const r = classify('We use AI for CV screening.', { threeCategory: true });
    expect(r.three_category).not.toBeNull();
    expect(r.three_category!.categories['1'].key).toBe('1');
  });

  it('opts.threeCategory omitted → three_category is ThreeCategoryResult (default true)', () => {
    const r = classify('We use AI for CV screening.');
    expect(r.three_category).not.toBeNull();
  });
});

describe('classify() — opts.lang override', () => {
  it('opts.lang: "de" on EN text → detected_lang === "de"', () => {
    const r = classify('AI system for facial recognition.', { lang: 'de' });
    expect(r.detected_lang).toBe('de');
  });

  it('opts.lang: "en" on DE text → detected_lang === "en"', () => {
    const r = classify('Wir setzen ein KI-System zur Bewerberauswahl ein.', { lang: 'en' });
    expect(r.detected_lang).toBe('en');
  });
});

describe('classify() — opts.rulesVersion', () => {
  it('matching → no throw', () => {
    expect(() => classify('We use AI for CV screening.', { rulesVersion: RULES_VERSION })).not.toThrow();
  });

  it('mismatching → throws Error with specific message format', () => {
    expect(() => classify('We use AI for CV screening.', { rulesVersion: 'v99.99.99' })).toThrow(
      /rules_version mismatch/,
    );
  });
});

describe('classify() — fixture invariants', () => {
  const fixtures = loadAllFixtures();

  it('loaded 11 fixtures total (8 Day-3 + 1 Day-4 + 2 Day-5)', () => {
    expect(fixtures.length).toBe(11);
  });

  for (const fixture of fixtures) {
    it(`${fixture.id} — annex_iv_required derivation matches annex_iii.high_risk && !suppressed_by_article_5`, () => {
      const r = classify(fixture.input, { lang: fixture.lang });
      expect(r.annex_iv_required).toBe(
        r.annex_iii.high_risk && !r.annex_iii.suppressed_by_article_5,
      );
    });

    it(`${fixture.id} — confidence is in [0.20, 0.99]`, () => {
      const r = classify(fixture.input, { lang: fixture.lang });
      expect(r.confidence).toBeGreaterThanOrEqual(0.2);
      expect(r.confidence).toBeLessThanOrEqual(0.99);
    });

    it(`${fixture.id} — mode === 'deterministic'`, () => {
      const r = classify(fixture.input, { lang: fixture.lang });
      expect(r.mode).toBe('deterministic');
    });
  }
});

describe('classify() — confidence formula sanity', () => {
  it('produces a confidence in [0.20, 0.99] for every fixture (invariant)', () => {
    const fixtures = loadAllFixtures();
    for (const f of fixtures) {
      const r = classify(f.input, { lang: f.lang });
      expect(r.confidence).toBeGreaterThanOrEqual(0.2);
      expect(r.confidence).toBeLessThanOrEqual(0.99);
    }
  });

  it('rounds to 2 decimal places (no floating-point spew)', () => {
    const r = classify('We use AI for CV screening and applicant tracking.');
    const rounded = Number(r.confidence.toFixed(2));
    expect(r.confidence).toBe(rounded);
  });
});
