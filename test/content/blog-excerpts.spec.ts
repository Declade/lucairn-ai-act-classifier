// Invariants for the blog-excerpt corpus at src/content/blog-excerpts/.
//
// Day 11 ships 5 hand-curated regulator-explainer excerpts × 2 locales = 10
// files. This spec locks the parity + Tier-1-citation invariants:
//
//   - 5 EN files exist; 5 DE files exist (10 total).
//   - Each file is non-empty (after trim).
//   - Every EN file has a DE counterpart and vice versa.
//   - Every file cites at least one Tier-1 source URL (EUR-Lex, EU AI Office,
//     BSI, BfDI, or Bitkom).
//   - No banned literals (Pro+, Solo Free, retired tier names, /Users/marcschuelke/,
//     CLAUDE.md, fluffy-graham, ok-lets-plan, Opus Advisor).
//   - The hand-curated keys MUST match the 5 keys the explain.ts module looks
//     up via getExcerptKey().

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXCERPT_DIR = join(__dirname, '..', '..', 'src', 'content', 'blog-excerpts');

// Locked Day-11 excerpt keys (cite-back: src/format/explain.ts:getExcerptKey()).
const EXPECTED_KEYS: ReadonlyArray<string> = [
  'article-5-1-d-predictive-policing',
  'annex-iii-4-employment',
  'annex-iii-6-law-enforcement',
  'article-10-data-governance',
  'article-50-transparency',
];

const TIER_1_HOST_PATTERN = /(eur-lex\.europa\.eu|artificialintelligenceact\.eu|ec\.europa\.eu|bsi\.bund\.de|bfdi\.bund\.de|bitkom\.org)/i;

// Banned literals — match retired tier names, internal-build-plan paths, real
// keys / spec paths that must never leak to a customer-facing surface. The
// classifier repo flips public on Day 14; these regexes guard the npm-shipped
// content.
const BANNED_PATTERNS: ReadonlyArray<RegExp> = [
  /Pro\+/, // retired tier name
  /Solo Free/i,
  /Solo Pro/i,
  /pro_plus/i,
  /\/Users\/marcschuelke\//,
  /CLAUDE\.md/,
  /fluffy-graham/i,
  /ok-lets-plan/i,
  /Opus Advisor/,
  /sk-ant-api03-/,
  /sk-proj-/,
];

function listExcerptFiles(locale: 'en' | 'de'): string[] {
  if (!existsSync(EXCERPT_DIR)) return [];
  return readdirSync(EXCERPT_DIR)
    .filter((f) => f.endsWith(`.${locale}.md`))
    .sort();
}

function fileBodyFor(key: string, locale: 'en' | 'de'): string {
  const path = join(EXCERPT_DIR, `${key}.${locale}.md`);
  return readFileSync(path, 'utf8');
}

describe('blog-excerpts/ — file inventory', () => {
  it('5 EN excerpt files exist', () => {
    const files = listExcerptFiles('en');
    expect(files.length).toBe(5);
  });

  it('5 DE excerpt files exist', () => {
    const files = listExcerptFiles('de');
    expect(files.length).toBe(5);
  });

  it('total 10 files (parity invariant)', () => {
    const total = listExcerptFiles('en').length + listExcerptFiles('de').length;
    expect(total).toBe(10);
  });
});

describe('blog-excerpts/ — keys match explain.ts getExcerptKey() mapping', () => {
  for (const key of EXPECTED_KEYS) {
    it(`EN file exists for key "${key}"`, () => {
      const path = join(EXCERPT_DIR, `${key}.en.md`);
      expect(existsSync(path)).toBe(true);
    });
    it(`DE file exists for key "${key}"`, () => {
      const path = join(EXCERPT_DIR, `${key}.de.md`);
      expect(existsSync(path)).toBe(true);
    });
  }
});

describe('blog-excerpts/ — body invariants', () => {
  for (const locale of ['en', 'de'] as const) {
    for (const key of EXPECTED_KEYS) {
      it(`${key}.${locale}.md is non-empty after trim`, () => {
        const body = fileBodyFor(key, locale);
        expect(body.trim().length).toBeGreaterThan(0);
      });
      it(`${key}.${locale}.md cites at least one Tier-1 source URL`, () => {
        const body = fileBodyFor(key, locale);
        expect(body).toMatch(TIER_1_HOST_PATTERN);
      });
      it(`${key}.${locale}.md contains no banned literals`, () => {
        const body = fileBodyFor(key, locale);
        for (const pattern of BANNED_PATTERNS) {
          expect(body).not.toMatch(pattern);
        }
      });
    }
  }
});

describe('blog-excerpts/ — parity invariant', () => {
  it('every EN file has a DE counterpart', () => {
    const enKeys = listExcerptFiles('en').map((f) => f.replace(/\.en\.md$/, ''));
    for (const key of enKeys) {
      const dePath = join(EXCERPT_DIR, `${key}.de.md`);
      expect(existsSync(dePath)).toBe(true);
    }
  });

  it('every DE file has an EN counterpart', () => {
    const deKeys = listExcerptFiles('de').map((f) => f.replace(/\.de\.md$/, ''));
    for (const key of deKeys) {
      const enPath = join(EXCERPT_DIR, `${key}.en.md`);
      expect(existsSync(enPath)).toBe(true);
    }
  });
});

describe('blog-excerpts/ — content discipline', () => {
  it('all 10 files are within reasonable byte-size range (100 < len < 5000)', () => {
    for (const locale of ['en', 'de'] as const) {
      for (const key of EXPECTED_KEYS) {
        const body = fileBodyFor(key, locale);
        expect(body.length).toBeGreaterThan(100);
        expect(body.length).toBeLessThan(5000);
      }
    }
  });
});
