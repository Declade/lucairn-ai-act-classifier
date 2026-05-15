import { describe, it, expect } from 'vitest';
import { classifyThreeCategory } from '../../src/rules/three-category.js';
import type { AnnexIIIResult } from '../../src/rules/article-6-annex-iii.js';
import type { Article5Result } from '../../src/rules/article-5.js';
import type { Article10Result } from '../../src/rules/article-10.js';
import type { Article12Result } from '../../src/rules/article-12.js';
import type { Article13Result } from '../../src/rules/article-13.js';
import type { Article14Result } from '../../src/rules/article-14.js';
import type { Article15Result } from '../../src/rules/article-15.js';
import type { Article50Result } from '../../src/rules/article-50.js';

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
function art13(applicable: boolean, domains: number[] = applicable ? [4] : []): Article13Result {
  return makeArticleResult<Article13Result>(applicable, {
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
function art50(applicable: boolean): Article50Result {
  return makeArticleResult<Article50Result>(applicable, {
    paragraph_1_chatbot: applicable,
    paragraph_2_synthetic_content: false,
    paragraph_3_emotion_or_biometric: false,
    paragraph_4_deep_fake: false,
  });
}

describe('classifyThreeCategory() — pure-function determinism', () => {
  it('returns the same output for the same input', () => {
    const inputs = {
      article5: makeArt5(false),
      annex: makeAnnex({ high_risk: true, domains: [4] }),
      article10: art10(true),
      article12: art12(true),
      article13: art13(true),
      article14: art14(true),
      article15: art15(true),
      article50: art50(false),
    };
    const a = classifyThreeCategory(inputs);
    const b = classifyThreeCategory(inputs);
    expect(a).toEqual(b);
  });

  it('throws TypeError on non-object inputs', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyThreeCategory(null)).toThrow(TypeError);
  });

  it('throws TypeError on inputs shape missing required article results (e.g. {})', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyThreeCategory({})).toThrow(TypeError);
  });

  it('throws TypeError when an article result has a non-boolean `applicable`', () => {
    const inputs = {
      article5: makeArt5(false),
      annex: makeAnnex({ high_risk: true, domains: [4] }),
      article10: { ...art10(true), applicable: 'yes' as unknown as boolean } as Article10Result,
      article12: art12(true),
      article13: art13(true),
      article14: art14(true),
      article15: art15(true),
      article50: art50(false),
    };
    expect(() => classifyThreeCategory(inputs)).toThrow(TypeError);
  });
});

describe('classifyThreeCategory() — category required: true cases', () => {
  it('Cat 1 required when Art 10 OR Art 15 is applicable', () => {
    const inputs = {
      article5: makeArt5(false),
      annex: makeAnnex({ high_risk: true, domains: [4] }),
      article10: art10(true),
      article12: art12(false),
      article13: art13(false),
      article14: art14(false),
      article15: art15(true),
      article50: art50(false),
    };
    const result = classifyThreeCategory(inputs);
    expect(result.category_1_sanitizer.required).toBe(true);
    expect(result.category_1_sanitizer.articles).toEqual(['10', '15']);
    // Sort discipline (Day-3 lesson 3): use sorted toEqual, not toContain.
    expect(result.category_1_sanitizer.contributing_articles).toEqual(['10', '15']);
  });

  it('Cat 2 required when only Art 12 is applicable (Art 14 not)', () => {
    const inputs = {
      article5: makeArt5(false),
      annex: makeAnnex({ high_risk: true, domains: [4] }),
      article10: art10(false),
      article12: art12(true),
      article13: art13(false),
      article14: art14(false),
      article15: art15(false),
      article50: art50(false),
    };
    const result = classifyThreeCategory(inputs);
    expect(result.category_2_evidence.required).toBe(true);
    expect(result.category_2_evidence.articles).toEqual(['12', '14']);
    expect(result.category_2_evidence.contributing_articles).toEqual(['12']);
  });

  it('Cat 3 required when any of Art 10/12/14/15 is applicable', () => {
    const inputs = {
      article5: makeArt5(false),
      annex: makeAnnex({ high_risk: true, domains: [4] }),
      article10: art10(true),
      article12: art12(true),
      article13: art13(true),
      article14: art14(true),
      article15: art15(true),
      article50: art50(false),
    };
    const result = classifyThreeCategory(inputs);
    expect(result.category_3_inventory.required).toBe(true);
    expect(result.category_3_inventory.articles).toEqual(['10', '12', '14', '15']);
    // ≥3 out-of-order contributing articles exercise actual sort (Day-4 C32).
    expect(result.category_3_inventory.contributing_articles).toEqual(['10', '12', '14', '15']);
  });

  it('contributing_articles is alphabetically sorted (≥3-element sort discipline)', () => {
    const inputs = {
      article5: makeArt5(false),
      annex: makeAnnex({ high_risk: true, domains: [4] }),
      article10: art10(true),
      article12: art12(false),
      article13: art13(false),
      article14: art14(true),
      article15: art15(true),
      article50: art50(false),
    };
    const result = classifyThreeCategory(inputs);
    // Cat 3 contributors here are Art 10, 14, 15 (3 elements out of natural
    // declaration order). The Day-4 C32 lesson requires ≥3 elements to
    // exercise actual sort logic — Art 10/14/15 satisfies that and tests the
    // sort behaviour rather than just a swap-of-two.
    expect(result.category_3_inventory.contributing_articles).toEqual(['10', '14', '15']);
  });
});

describe('classifyThreeCategory() — category required: false cases', () => {
  it('all 4 articles not applicable → all 3 categories required: false', () => {
    const inputs = {
      article5: makeArt5(false),
      annex: makeAnnex({ high_risk: false }),
      article10: art10(false),
      article12: art12(false),
      article13: art13(false),
      article14: art14(false),
      article15: art15(false),
      article50: art50(false),
    };
    const result = classifyThreeCategory(inputs);
    expect(result.category_1_sanitizer.required).toBe(false);
    expect(result.category_2_evidence.required).toBe(false);
    expect(result.category_3_inventory.required).toBe(false);
    expect(result.category_1_sanitizer.contributing_articles).toEqual([]);
    expect(result.category_2_evidence.contributing_articles).toEqual([]);
    expect(result.category_3_inventory.contributing_articles).toEqual([]);
  });

  it('Art 13 applicable alone does NOT make any category required (Art 13 is OUT of the 3-cat pairing)', () => {
    const inputs = {
      article5: makeArt5(false),
      annex: makeAnnex({ high_risk: true, domains: [4] }),
      article10: art10(false),
      article12: art12(false),
      article13: art13(true),
      article14: art14(false),
      article15: art15(false),
      article50: art50(false),
    };
    const result = classifyThreeCategory(inputs);
    expect(result.category_1_sanitizer.required).toBe(false);
    expect(result.category_2_evidence.required).toBe(false);
    expect(result.category_3_inventory.required).toBe(false);
  });

  it('Art 50 applicable alone does NOT make any category required (Art 50 is OUT of the 3-cat pairing)', () => {
    const inputs = {
      article5: makeArt5(false),
      annex: makeAnnex({ high_risk: false }),
      article10: art10(false),
      article12: art12(false),
      article13: art13(false),
      article14: art14(false),
      article15: art15(false),
      article50: art50(true),
    };
    const result = classifyThreeCategory(inputs);
    expect(result.category_1_sanitizer.required).toBe(false);
    expect(result.category_2_evidence.required).toBe(false);
    expect(result.category_3_inventory.required).toBe(false);
  });
});

describe('classifyThreeCategory() — Article 5 suppression (cascade-invariant)', () => {
  it('article5.prohibited === true → all 3 categories required: false even if articles applicable', () => {
    // Cascade-invariant lock per dispatch step 3 + Day-4 lesson 7. Even if
    // the underlying article cascades incorrectly returned applicable: true
    // (which they shouldn't when suppression fires upstream), the
    // three-category overlay still suppresses to required: false because
    // prohibition supersedes the high-risk obligation overlay.
    const inputs = {
      article5: makeArt5(true),
      annex: makeAnnex({ high_risk: false, suppressed_by_article_5: true }),
      // Synthetic "leaked" applicable: true to exercise the suppression
      // path. In the real pipeline these would all be false here.
      article10: art10(true),
      article12: art12(true),
      article13: art13(true),
      article14: art14(true),
      article15: art15(true),
      article50: art50(false),
    };
    const result = classifyThreeCategory(inputs);
    expect(result.category_1_sanitizer.required).toBe(false);
    expect(result.category_2_evidence.required).toBe(false);
    expect(result.category_3_inventory.required).toBe(false);
    expect(result.category_1_sanitizer.contributing_articles).toEqual([]);
    expect(result.category_2_evidence.contributing_articles).toEqual([]);
    expect(result.category_3_inventory.contributing_articles).toEqual([]);
  });
});

describe('classifyThreeCategory() — synced metadata from website source-of-truth', () => {
  it('category titles + items come from the generated JSON (load-bearing fields)', () => {
    const inputs = {
      article5: makeArt5(false),
      annex: makeAnnex({ high_risk: false }),
      article10: art10(false),
      article12: art12(false),
      article13: art13(false),
      article14: art14(false),
      article15: art15(false),
      article50: art50(false),
    };
    const result = classifyThreeCategory(inputs);

    expect(result.category_1_sanitizer.title_en).toContain('Sanitizer');
    expect(result.category_1_sanitizer.title_de).toContain('Sanitizer');
    expect(result.category_1_sanitizer.items.length).toBeGreaterThan(0);
    expect(result.category_1_sanitizer.items[0]?.text_en.length).toBeGreaterThan(0);
    expect(result.category_1_sanitizer.items[0]?.text_de.length).toBeGreaterThan(0);

    expect(result.category_2_evidence.title_en).toMatch(/Evidence/i);
    // DE title for cat 2 is "Nachweis" (per website source).
    expect(result.category_2_evidence.title_de).toMatch(/Nachweis/);

    expect(result.category_3_inventory.title_en).toMatch(/Inventory/i);
    expect(result.category_3_inventory.title_de).toMatch(/Inventar/);
  });

  it('disclaimer fields are populated in both locales', () => {
    const inputs = {
      article5: makeArt5(false),
      annex: makeAnnex({ high_risk: false }),
      article10: art10(false),
      article12: art12(false),
      article13: art13(false),
      article14: art14(false),
      article15: art15(false),
      article50: art50(false),
    };
    const result = classifyThreeCategory(inputs);
    expect(result.disclaimer_en.length).toBeGreaterThan(0);
    expect(result.disclaimer_de.length).toBeGreaterThan(0);
    expect(result.disclaimer_en).toMatch(/legal advice/i);
    expect(result.disclaimer_de).toMatch(/Rechtsberatung/);
  });

  it('source URL points at the Lucairn overlay docs (NOT EUR-Lex — three-category is opinionated)', () => {
    const inputs = {
      article5: makeArt5(false),
      annex: makeAnnex({ high_risk: false }),
      article10: art10(false),
      article12: art12(false),
      article13: art13(false),
      article14: art14(false),
      article15: art15(false),
      article50: art50(false),
    };
    const result = classifyThreeCategory(inputs);
    expect(result.source.startsWith('https://')).toBe(true);
    expect(result.source).toMatch(/lucairn\.eu/);
    // Anti-claim: must NOT cite EUR-Lex (three-category is opinionated overlay).
    expect(result.source).not.toMatch(/eur-lex\.europa\.eu/);
  });
});
