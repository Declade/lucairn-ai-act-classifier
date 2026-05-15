import { describe, it, expect } from 'vitest';
import { classifyArticle14 } from '../../src/rules/article-14.js';
import type { AnnexIIIResult } from '../../src/rules/article-6-annex-iii.js';
import type { Article5Result } from '../../src/rules/article-5.js';

function makeAnnex(opts: {
  high_risk: boolean;
  domains: number[];
  suppressed_by_article_5: boolean;
}): AnnexIIIResult {
  return {
    high_risk: opts.high_risk,
    suppressed_by_article_5: opts.suppressed_by_article_5,
    reasoning: ['synthetic'],
    domains: opts.domains.map((n) => ({
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

function makeArt5(prohibited: boolean): Article5Result {
  return {
    prohibited,
    hits: [],
    reasoning: ['synthetic'],
  };
}

describe('classifyArticle14() — pure-function determinism', () => {
  it('returns the same output for the same input', () => {
    const annex = makeAnnex({ high_risk: true, domains: [4], suppressed_by_article_5: false });
    const art5 = makeArt5(false);
    const a = classifyArticle14(annex, art5);
    const b = classifyArticle14(annex, art5);
    expect(a).toEqual(b);
  });

  it('throws TypeError on non-object annex', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyArticle14(null, makeArt5(false))).toThrow(TypeError);
  });

  it('throws TypeError on non-object article5', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyArticle14(makeAnnex({ high_risk: false, domains: [], suppressed_by_article_5: false }), null)).toThrow(TypeError);
  });
});

describe('classifyArticle14() — applicable: true cascade (multiple Annex III domains)', () => {
  it('biometric high-risk (Annex III.1) → applicable === true', () => {
    const annex = makeAnnex({ high_risk: true, domains: [1], suppressed_by_article_5: false });
    const result = classifyArticle14(annex, makeArt5(false));
    expect(result.applicable).toBe(true);
    expect(result.triggered_by.article_5).toBe(false);
    expect(result.triggered_by.annex_iii_domains).toEqual([1]);
  });

  it('employment high-risk (Annex III.4) → applicable === true', () => {
    const annex = makeAnnex({ high_risk: true, domains: [4], suppressed_by_article_5: false });
    const result = classifyArticle14(annex, makeArt5(false));
    expect(result.applicable).toBe(true);
    expect(result.triggered_by.annex_iii_domains).toEqual([4]);
  });

  it('multiple Annex III domains → triggered_by lists them sorted ascending', () => {
    const annex = makeAnnex({ high_risk: true, domains: [7, 3, 5], suppressed_by_article_5: false });
    const result = classifyArticle14(annex, makeArt5(false));
    expect(result.applicable).toBe(true);
    expect(result.triggered_by.annex_iii_domains).toEqual([3, 5, 7]);
  });
});

describe('classifyArticle14() — applicable: false when not high-risk', () => {
  it('high_risk === false → applicable === false; annex_iii_domains === []', () => {
    const annex = makeAnnex({ high_risk: false, domains: [], suppressed_by_article_5: false });
    const result = classifyArticle14(annex, makeArt5(false));
    expect(result.applicable).toBe(false);
    expect(result.triggered_by.article_5).toBe(false);
    expect(result.triggered_by.annex_iii_domains).toEqual([]);
  });
});

describe('classifyArticle14() — applicable: false when suppressed by Article 5', () => {
  it('suppressed_by_article_5 === true → applicable === false; triggered_by.article_5 === true', () => {
    const annex = makeAnnex({ high_risk: false, domains: [1], suppressed_by_article_5: true });
    const result = classifyArticle14(annex, makeArt5(true));
    expect(result.applicable).toBe(false);
    expect(result.triggered_by.article_5).toBe(true);
    expect(result.triggered_by.annex_iii_domains).toEqual([]);
  });
});

describe('classifyArticle14() — summary spot-check + source URL', () => {
  it('summary_en contains the verbatim EUR-Lex phrase "effectively overseen by natural persons"', () => {
    const annex = makeAnnex({ high_risk: true, domains: [4], suppressed_by_article_5: false });
    const result = classifyArticle14(annex, makeArt5(false));
    expect(result.summary_en).toContain('effectively overseen by natural persons');
  });

  it('summary_de contains the verbatim EUR-Lex phrase "wirksam beaufsichtigt"', () => {
    const annex = makeAnnex({ high_risk: true, domains: [4], suppressed_by_article_5: false });
    const result = classifyArticle14(annex, makeArt5(false));
    expect(result.summary_de).toContain('wirksam beaufsichtigt');
  });

  it('source URL points at EUR-Lex (HTTPS)', () => {
    const annex = makeAnnex({ high_risk: true, domains: [1], suppressed_by_article_5: false });
    const result = classifyArticle14(annex, makeArt5(false));
    expect(result.source.startsWith('https://')).toBe(true);
    expect(result.source).toMatch(/eur-lex\.europa\.eu/);
  });
});
