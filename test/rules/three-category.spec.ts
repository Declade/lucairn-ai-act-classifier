import { describe, it, expect } from 'vitest';
import { classifyThreeCategory } from '../../src/rules/three-category.js';
import type { AnnexIIIResult } from '../../src/rules/article-6-annex-iii.js';
import type { Article5Result } from '../../src/rules/article-5.js';
import type { Article10Result } from '../../src/rules/article-10.js';
import type { Article12Result } from '../../src/rules/article-12.js';
import type { Article14Result } from '../../src/rules/article-14.js';
import type { Article15Result } from '../../src/rules/article-15.js';

const EUR_LEX = 'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689';

function makeArt5(prohibited: boolean): Article5Result {
  return { prohibited, hits: [], reasoning: ['synthetic'] };
}

function makeAnnex(opts: {
  high_risk: boolean;
  domains?: number[];
  suppressed_by_article_5?: boolean;
}): AnnexIIIResult {
  return {
    high_risk: opts.high_risk,
    suppressed_by_article_5: opts.suppressed_by_article_5 ?? false,
    reasoning: ['synthetic'],
    domains: (opts.domains ?? []).map((n) => ({
      annex_iii_number: n as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
      key: `domain-${n}`,
      sub_letters: [],
      matched_phrases: [],
      title_en: `Annex III domain ${n}`,
      title_de: `Anhang-III-Bereich ${n}`,
      source: `EUR-Lex Regulation (EU) 2024/1689 — Annex III paragraph ${n}`,
    })),
  };
}

function makeArticleResult<T extends { applicable: boolean; triggered_by: unknown; summary_en: string; summary_de: string; source: string }>(
  applicable: boolean,
  triggered_by: T['triggered_by'],
): T {
  return {
    applicable,
    triggered_by,
    summary_en: 'synthetic',
    summary_de: 'synthetic',
    source: EUR_LEX,
  } as T;
}

function art10(applicable: boolean, domains: number[] = applicable ? [4] : []): Article10Result {
  return makeArticleResult<Article10Result>(applicable, {
    article_5: false,
    annex_iii_domains: applicable ? [...domains].sort((a, b) => a - b) : [],
  });
}
function art12(applicable: boolean, domains: number[] = applicable ? [4] : []): Article12Result {
  return makeArticleResult<Article12Result>(applicable, {
    article_5: false,
    annex_iii_domains: applicable ? [...domains].sort((a, b) => a - b) : [],
  });
}
function art14(applicable: boolean, domains: number[] = applicable ? [4] : []): Article14Result {
  return makeArticleResult<Article14Result>(applicable, {
    article_5: false,
    annex_iii_domains: applicable ? [...domains].sort((a, b) => a - b) : [],
  });
}
function art15(applicable: boolean, domains: number[] = applicable ? [4] : []): Article15Result {
  return makeArticleResult<Article15Result>(applicable, {
    article_5: false,
    annex_iii_domains: applicable ? [...domains].sort((a, b) => a - b) : [],
  });
}

describe('classifyThreeCategory() — pure-function determinism', () => {
  it('returns the same output for the same input', () => {
    const annex = makeAnnex({ high_risk: true, domains: [4] });
    const article5 = makeArt5(false);
    const a = classifyThreeCategory(annex, article5, art10(true), art12(true), art14(true), art15(true));
    const b = classifyThreeCategory(annex, article5, art10(true), art12(true), art14(true), art15(true));
    expect(a).toEqual(b);
  });

  it('throws TypeError on non-object annex', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyThreeCategory(null, makeArt5(false), art10(false), art12(false), art14(false), art15(false))).toThrow(TypeError);
  });

  it('throws TypeError on annex shape missing the domains array (e.g. {})', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyThreeCategory({}, makeArt5(false), art10(false), art12(false), art14(false), art15(false))).toThrow(TypeError);
  });

  it('throws TypeError on non-object article5', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyThreeCategory(makeAnnex({ high_risk: false }), null, art10(false), art12(false), art14(false), art15(false))).toThrow(TypeError);
  });

  it('throws TypeError when an article result has a non-boolean `applicable`', () => {
    const broken = { ...art10(true), applicable: 'yes' as unknown as boolean } as Article10Result;
    expect(() =>
      classifyThreeCategory(
        makeAnnex({ high_risk: true, domains: [4] }),
        makeArt5(false),
        broken,
        art12(true),
        art14(true),
        art15(true),
      ),
    ).toThrow(TypeError);
  });

  it('throws Error on inconsistent upstream state (article5.prohibited true but annex.suppressed_by_article_5 false)', () => {
    expect(() =>
      classifyThreeCategory(
        makeAnnex({ high_risk: false, suppressed_by_article_5: false }),
        makeArt5(true),
        art10(false),
        art12(false),
        art14(false),
        art15(false),
      ),
    ).toThrow(/inconsistent upstream state/);
  });

  it('throws Error on inconsistent upstream state — OPPOSITE direction (annex.suppressed_by_article_5 true but article5.prohibited false) — Day-5 bug-hunter M4 closure', () => {
    // The original asymmetric guard caught only one direction
    // (article5.prohibited && !annex.suppressed_by_article_5) and silently
    // accepted the opposite (!article5.prohibited && annex.suppressed_by_article_5),
    // producing all-categories-non-applicable output without flagging the
    // upstream inconsistency. Day-5 made the guard symmetric — it now throws
    // in EITHER direction of divergence. This lock-test pins the new behavior.
    expect(() =>
      classifyThreeCategory(
        makeAnnex({ high_risk: false, suppressed_by_article_5: true }),
        makeArt5(false),
        art10(false),
        art12(false),
        art14(false),
        art15(false),
      ),
    ).toThrow(/inconsistent upstream state/);
  });
});

describe('classifyThreeCategory() — category applicable: true (all required articles applicable)', () => {
  it('Cat 1 applicable when BOTH Art 10 AND Art 15 are applicable', () => {
    const result = classifyThreeCategory(
      makeAnnex({ high_risk: true, domains: [4] }),
      makeArt5(false),
      art10(true),
      art12(false),
      art14(false),
      art15(true),
    );
    expect(result.categories['1'].applicable).toBe(true);
    expect(result.categories['1'].required_articles).toEqual([10, 15]);
    expect(result.categories['1'].triggered_articles).toEqual([10, 15]);
    // Sort discipline (Day-3 lesson 3): use sorted toEqual, not toContain.
    expect(result.applicable_categories).toEqual(['1']);
  });

  it('Cat 2 applicable when BOTH Art 12 AND Art 14 are applicable', () => {
    const result = classifyThreeCategory(
      makeAnnex({ high_risk: true, domains: [4] }),
      makeArt5(false),
      art10(false),
      art12(true),
      art14(true),
      art15(false),
    );
    expect(result.categories['2'].applicable).toBe(true);
    expect(result.categories['2'].required_articles).toEqual([12, 14]);
    expect(result.categories['2'].triggered_articles).toEqual([12, 14]);
    expect(result.applicable_categories).toEqual(['2']);
  });

  it('Cat 3 applicable when ALL of Art 10/12/14/15 are applicable (≥3-element sort exercise)', () => {
    const result = classifyThreeCategory(
      makeAnnex({ high_risk: true, domains: [4] }),
      makeArt5(false),
      art10(true),
      art12(true),
      art14(true),
      art15(true),
    );
    expect(result.categories['3'].applicable).toBe(true);
    expect(result.categories['3'].required_articles).toEqual([10, 12, 14, 15]);
    // 4 elements → exercises sort logic beyond a swap (Day-4 C32 lesson).
    expect(result.categories['3'].triggered_articles).toEqual([10, 12, 14, 15]);
  });

  it('all 3 categories applicable when all 4 cascade articles applicable', () => {
    const result = classifyThreeCategory(
      makeAnnex({ high_risk: true, domains: [4] }),
      makeArt5(false),
      art10(true),
      art12(true),
      art14(true),
      art15(true),
    );
    expect(result.applicable_categories).toEqual(['1', '2', '3']);
  });
});

describe('classifyThreeCategory() — category applicable: false (some required article missing)', () => {
  it('Cat 1 NOT applicable when only Art 10 (not Art 15) is applicable — strict AND', () => {
    const result = classifyThreeCategory(
      makeAnnex({ high_risk: true, domains: [4] }),
      makeArt5(false),
      art10(true),
      art12(false),
      art14(false),
      art15(false),
    );
    expect(result.categories['1'].applicable).toBe(false);
    // triggered_articles still surfaces the partial match for transparency.
    expect(result.categories['1'].triggered_articles).toEqual([10]);
    expect(result.applicable_categories).toEqual([]);
  });

  it('Cat 3 NOT applicable unless ALL of Art 10/12/14/15 are applicable (3-of-4 fails strict AND)', () => {
    const result = classifyThreeCategory(
      makeAnnex({ high_risk: true, domains: [4] }),
      makeArt5(false),
      art10(true),
      art12(true),
      art14(true),
      art15(false),
    );
    expect(result.categories['3'].applicable).toBe(false);
    // ≥3-element sort exercise on triggered_articles: 3-of-4 still tests sort.
    expect(result.categories['3'].triggered_articles).toEqual([10, 12, 14]);
  });

  it('all 4 articles not applicable → all 3 categories applicable: false; applicable_categories empty', () => {
    const result = classifyThreeCategory(
      makeAnnex({ high_risk: false }),
      makeArt5(false),
      art10(false),
      art12(false),
      art14(false),
      art15(false),
    );
    expect(result.categories['1'].applicable).toBe(false);
    expect(result.categories['2'].applicable).toBe(false);
    expect(result.categories['3'].applicable).toBe(false);
    expect(result.applicable_categories).toEqual([]);
    expect(result.categories['1'].triggered_articles).toEqual([]);
    expect(result.categories['2'].triggered_articles).toEqual([]);
    expect(result.categories['3'].triggered_articles).toEqual([]);
  });
});

describe('classifyThreeCategory() — Article 5 suppression propagates via cascade', () => {
  it('cascade-invariant: article5.prohibited and annex.suppressed_by_article_5 BOTH true → cascades return non-applicable → all 3 categories applicable: false', () => {
    // Cascade-invariant lock per Day-4 lesson 7 + dispatch step 3. When
    // suppression fires upstream, the per-article classifiers ALL return
    // applicable: false, and the three-category overlay inherits that
    // automatically (no explicit article5 branch needed inside).
    const result = classifyThreeCategory(
      makeAnnex({ high_risk: false, suppressed_by_article_5: true }),
      makeArt5(true),
      art10(false),
      art12(false),
      art14(false),
      art15(false),
    );
    expect(result.categories['1'].applicable).toBe(false);
    expect(result.categories['2'].applicable).toBe(false);
    expect(result.categories['3'].applicable).toBe(false);
    expect(result.applicable_categories).toEqual([]);
  });
});

describe('classifyThreeCategory() — synced metadata from website source-of-truth', () => {
  it('category titles + items come from the generated JSON (load-bearing fields)', () => {
    const result = classifyThreeCategory(
      makeAnnex({ high_risk: false }),
      makeArt5(false),
      art10(false),
      art12(false),
      art14(false),
      art15(false),
    );

    expect(result.categories['1'].title_en).toMatch(/Sanitizer/i);
    expect(result.categories['1'].title_de).toMatch(/Sanitizer/i);
    expect(result.categories['1'].items.length).toBeGreaterThan(0);
    expect(result.categories['1'].items[0]?.text_en.length).toBeGreaterThan(0);
    expect(result.categories['1'].items[0]?.text_de.length).toBeGreaterThan(0);

    expect(result.categories['2'].title_en).toMatch(/Evidence/i);
    // DE title for cat 2 is "Nachweis" (per website source).
    expect(result.categories['2'].title_de).toMatch(/Nachweis/);

    expect(result.categories['3'].title_en).toMatch(/Inventory/i);
    expect(result.categories['3'].title_de).toMatch(/Inventar/);
  });

  it('category item counts match website source (9 / 10 / 4)', () => {
    const result = classifyThreeCategory(
      makeAnnex({ high_risk: false }),
      makeArt5(false),
      art10(false),
      art12(false),
      art14(false),
      art15(false),
    );
    expect(result.categories['1'].items.length).toBe(9);
    expect(result.categories['2'].items.length).toBe(10);
    expect(result.categories['3'].items.length).toBe(4);
  });

  it('disclaimer fields are populated in both locales', () => {
    const result = classifyThreeCategory(
      makeAnnex({ high_risk: false }),
      makeArt5(false),
      art10(false),
      art12(false),
      art14(false),
      art15(false),
    );
    expect(result.disclaimer_en.length).toBeGreaterThan(0);
    expect(result.disclaimer_de.length).toBeGreaterThan(0);
    expect(result.disclaimer_en).toMatch(/legal advice/i);
    expect(result.disclaimer_de).toMatch(/Rechtsberatung/);
  });

  it('source field is provenance metadata (NOT EUR-Lex — three-category is opinionated overlay)', () => {
    const result = classifyThreeCategory(
      makeAnnex({ high_risk: false }),
      makeArt5(false),
      art10(false),
      art12(false),
      art14(false),
      art15(false),
    );
    expect(result.source.generated_file).toMatch(/three-category\.gen\.json/);
    expect(result.source.source_file).toMatch(/checklist-content\.ts/);
    expect(result.source.version.length).toBeGreaterThan(0);
    // Anti-claim: three-category source field MUST NOT cite EUR-Lex
    // (regulatory citations live on the per-article modules).
    expect(result.source.generated_file).not.toMatch(/eur-lex/);
    expect(result.source.source_file).not.toMatch(/eur-lex/);
  });
});
