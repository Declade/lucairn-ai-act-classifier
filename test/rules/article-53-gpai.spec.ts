import { describe, it, expect } from 'vitest';
import { extractFeatures } from '../../src/extract/keyword.js';
import { classifyGPAI } from '../../src/rules/article-53-gpai.js';
import type { ExtractedFeatures } from '../../src/extract/keyword.js';

// Helper: run the deterministic pipeline.
function classify(input: string, opts: { lang?: 'en' | 'de' } = {}) {
  const features = opts.lang
    ? extractFeatures(input, { lang: opts.lang })
    : extractFeatures(input);
  return classifyGPAI(features);
}

function makeFeatures(input: string, lang: 'en' | 'de' = 'en'): ExtractedFeatures {
  return extractFeatures(input, { lang });
}

describe('classifyGPAI() — pure-function determinism', () => {
  it('returns the same output for the same input', () => {
    const input = 'We use GPT-5 to power our chatbot.';
    const a = classify(input);
    const b = classify(input);
    expect(a).toEqual(b);
  });

  it('returns clean negative on empty input (Art 53 chapeau still surfaced)', () => {
    const features = extractFeatures('');
    const result = classifyGPAI(features);
    expect(result.article_53_applicable).toBe(false);
    expect(result.article_55_applicable).toBe(false);
    expect(result.triggered_by.named_foundation_model).toBe(false);
    expect(result.triggered_by.generic_foundation_model_phrasing).toBe(false);
    expect(result.triggered_by.systemic_risk_markers).toBe(false);
    // Even when not applicable, the Art 53(1) chapeau is surfaced so
    // consultants can read what Article 53 would require.
    expect(result.summary_en.length).toBeGreaterThan(0);
    expect(result.summary_de.length).toBeGreaterThan(0);
  });

  it('returns clean negative on unrelated input', () => {
    const result = classify('My cat enjoys naps on the windowsill.');
    expect(result.article_53_applicable).toBe(false);
    expect(result.article_55_applicable).toBe(false);
  });

  it('throws TypeError on non-object features', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyGPAI(null)).toThrow(TypeError);
  });

  it('throws TypeError on features shape missing input/byCategory (e.g. {})', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyGPAI({})).toThrow(TypeError);
  });

  it('throws TypeError on features array shape (e.g. [])', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyGPAI([])).toThrow(TypeError);
  });

  it('throws TypeError on features.byCategory = [] (Array.isArray guard — Day-5 bug-hunter M2 closure)', () => {
    const features = makeFeatures('hello');
    const brokenFeatures = {
      ...features,
      byCategory: [] as unknown as ExtractedFeatures['byCategory'],
    };
    expect(() => classifyGPAI(brokenFeatures)).toThrow(TypeError);
  });
});

describe('classifyGPAI() — Article 53 only (no systemic risk)', () => {
  it('EN named foundation model (GPT-5) fires Art 53 but NOT Art 55', () => {
    const result = classify('We integrate GPT-5 into our customer-facing chatbot.');
    expect(result.triggered_by.named_foundation_model).toBe(true);
    expect(result.triggered_by.systemic_risk_markers).toBe(false);
    expect(result.article_53_applicable).toBe(true);
    expect(result.article_55_applicable).toBe(false);
  });

  it('EN named model "Claude 4" fires Art 53', () => {
    const result = classify('Our pipeline uses Claude 4 for document analysis.');
    expect(result.triggered_by.named_foundation_model).toBe(true);
    expect(result.article_53_applicable).toBe(true);
  });

  it('EN generic phrasing "foundation model" fires Art 53', () => {
    const result = classify('We are evaluating foundation model offerings for our search infrastructure.');
    expect(result.triggered_by.generic_foundation_model_phrasing).toBe(true);
    expect(result.article_53_applicable).toBe(true);
    expect(result.article_55_applicable).toBe(false);
  });

  it('EN generic phrasing "large language model" fires Art 53', () => {
    const result = classify('Our product is a large language model trained on legal corpora.');
    expect(result.triggered_by.generic_foundation_model_phrasing).toBe(true);
    expect(result.article_53_applicable).toBe(true);
  });

  it('DE named model "Llama 3" fires Art 53', () => {
    const result = classify('Wir integrieren Llama 3 in unsere interne Dokumenten-Suche.', {
      lang: 'de',
    });
    expect(result.triggered_by.named_foundation_model).toBe(true);
    expect(result.article_53_applicable).toBe(true);
  });

  it('DE generic phrasing "Basismodell" fires Art 53', () => {
    const result = classify('Wir entwickeln ein Basismodell für die Rechtsbranche.', { lang: 'de' });
    expect(result.triggered_by.generic_foundation_model_phrasing).toBe(true);
    expect(result.article_53_applicable).toBe(true);
  });
});

describe('classifyGPAI() — Article 55 systemic-risk overlay', () => {
  it('EN "10^25 FLOP" + foundation model fires Art 53 AND Art 55', () => {
    const result = classify(
      "We're training a frontier model with 10^25 floating-point operations of compute for general-purpose use. It's a foundation model with presumed systemic risk.",
    );
    expect(result.triggered_by.systemic_risk_markers).toBe(true);
    expect(result.article_53_applicable).toBe(true);
    expect(result.article_55_applicable).toBe(true);
  });

  it('systemic_risk_markers WITHOUT Art 53 trigger does NOT fire Art 55 (Art 55 requires Art 53)', () => {
    // By construction, Art 55 is the "in addition to" overlay on Art 53.
    // If no foundation model / generic phrasing is detected, Art 55 cannot
    // fire even if a systemic-risk marker is present.
    const result = classify('The board reviewed systemic risk in third-party vendors.');
    expect(result.triggered_by.systemic_risk_markers).toBe(true);
    expect(result.article_53_applicable).toBe(false);
    expect(result.article_55_applicable).toBe(false);
  });

  it('DE "systemisches Risiko" + Basismodell fires Art 53 AND Art 55', () => {
    const result = classify('Wir trainieren ein Basismodell mit erheblichem systemisches Risiko.', {
      lang: 'de',
    });
    expect(result.triggered_by.generic_foundation_model_phrasing).toBe(true);
    expect(result.triggered_by.systemic_risk_markers).toBe(true);
    expect(result.article_55_applicable).toBe(true);
  });
});

describe('classifyGPAI() — summary + source URL', () => {
  it('summary_en always carries the verbatim Art 53(1) chapeau (applicable === false)', () => {
    const result = classify('My cat enjoys naps on the windowsill.');
    expect(result.article_53_applicable).toBe(false);
    expect(result.summary_en).toContain('Providers of general-purpose AI models shall:');
    expect(result.summary_en).toContain('(Art 53(1))');
    expect(result.summary_en).not.toContain('In addition to');
  });

  it('summary_en includes Art 53(1) chapeau when Art 53 applicable but Art 55 not', () => {
    const result = classify('We use GPT-5 in our internal workflows.');
    expect(result.article_53_applicable).toBe(true);
    expect(result.article_55_applicable).toBe(false);
    expect(result.summary_en).toContain('Providers of general-purpose AI models shall:');
    expect(result.summary_en).not.toContain('In addition to the obligations listed');
  });

  it('summary_en appends Art 55(1) chapeau when Art 55 is applicable', () => {
    const result = classify(
      "We're training a frontier model with 10^25 floating-point operations of compute. Foundation model. Systemic risk.",
    );
    expect(result.article_55_applicable).toBe(true);
    expect(result.summary_en).toContain('Providers of general-purpose AI models shall:');
    expect(result.summary_en).toContain(
      'In addition to the obligations listed in Articles 53 and 54, providers of general-purpose AI models with systemic risk shall:',
    );
    expect(result.summary_en).toContain('(Art 55(1))');
  });

  it('summary_de carries the verbatim Tier-1 DE Art 53(1) chapeau (Tier-2 EU AI Office Service Desk)', () => {
    // The official Tier-1 DE chapeau is "Anbieter von KI-Modellen mit
    // allgemeinem Verwendungszweck" — NOT the Tier-3 FLI mirror's "für
    // allgemeine Zwecke" paraphrase. Locks the verbatim choice.
    const result = classify('Wir nutzen ein Basismodell für die Rechtsbranche.', { lang: 'de' });
    expect(result.summary_de).toContain('Anbieter von KI-Modellen mit allgemeinem Verwendungszweck');
    expect(result.summary_de).toContain('(Art. 53 Abs. 1)');
  });

  it('summary_de appends Art 55(1) DE chapeau when applicable', () => {
    const result = classify('Wir trainieren ein Basismodell mit systemisches Risiko.', {
      lang: 'de',
    });
    expect(result.article_55_applicable).toBe(true);
    expect(result.summary_de).toContain(
      'Zusätzlich zu den in den Artikeln 53 und 54 aufgeführten Pflichten',
    );
    expect(result.summary_de).toContain('mit systemischem Risiko');
    expect(result.summary_de).toContain('(Art. 55 Abs. 1)');
  });

  it('source URL points at EUR-Lex (HTTPS)', () => {
    const result = classify('We use GPT-5.');
    expect(result.source.startsWith('https://')).toBe(true);
    expect(result.source).toMatch(/eur-lex\.europa\.eu/);
  });
});
