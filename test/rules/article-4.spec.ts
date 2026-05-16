import { describe, it, expect } from 'vitest';
import { extractFeatures } from '../../src/extract/keyword.js';
import { classifyArticle4 } from '../../src/rules/article-4.js';
import type { ExtractedFeatures } from '../../src/extract/keyword.js';

// Helper: run the deterministic pipeline.
function classify(input: string, opts: { lang?: 'en' | 'de' } = {}) {
  const features = opts.lang
    ? extractFeatures(input, { lang: opts.lang })
    : extractFeatures(input);
  return classifyArticle4(features);
}

function makeFeatures(input: string, lang: 'en' | 'de' = 'en'): ExtractedFeatures {
  return extractFeatures(input, { lang });
}

describe('classifyArticle4() — pure-function determinism', () => {
  it('returns the same output for the same input', () => {
    const input = 'Our employees use a chatbot for customer support.';
    const a = classify(input);
    const b = classify(input);
    expect(a).toEqual(b);
  });

  it('returns clean negative on empty input (Art 4 chapeau still surfaced in summary)', () => {
    const features = extractFeatures('');
    const result = classifyArticle4(features);
    expect(result.applicable).toBe(false);
    expect(result.triggered_by.provider_or_deployer_with_staff).toBe(false);
    // Even when not applicable, the Art 4 chapeau is surfaced so consultants
    // can read what Article 4 would require.
    expect(result.summary_en.length).toBeGreaterThan(0);
    expect(result.summary_de.length).toBeGreaterThan(0);
  });

  it('returns clean negative on unrelated input', () => {
    const result = classify('My cat enjoys naps on the windowsill.');
    expect(result.applicable).toBe(false);
  });

  it('throws TypeError on non-object features', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyArticle4(null)).toThrow(TypeError);
  });

  it('throws TypeError on features shape missing input/byCategory (e.g. {})', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyArticle4({})).toThrow(TypeError);
  });

  it('throws TypeError on features array shape (e.g. [])', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyArticle4([])).toThrow(TypeError);
  });

  it('throws TypeError on features.byCategory = [] (Array.isArray guard — Day-5 bug-hunter M2 closure)', () => {
    // typeof [] === 'object' so an array passes the bare typeof check. The
    // guard MUST also reject Array-shaped `byCategory` projections explicitly,
    // otherwise `features = { input: 'x', byCategory: [] }` silently returns
    // a false trigger flag — a false-negative applicability result.
    const features = makeFeatures('hello');
    const brokenFeatures = {
      ...features,
      byCategory: [] as unknown as ExtractedFeatures['byCategory'],
    };
    expect(() => classifyArticle4(brokenFeatures)).toThrow(TypeError);
  });
});

describe('classifyArticle4() — provider/deployer + staff trigger', () => {
  it('EN "our employees use" fires the trigger', () => {
    const result = classify('Our employees use an AI assistant to draft customer emails.');
    expect(result.triggered_by.provider_or_deployer_with_staff).toBe(true);
    expect(result.applicable).toBe(true);
  });

  it('EN "our staff use" fires the trigger', () => {
    const result = classify('Our staff use AI-powered analytics tools daily.');
    expect(result.triggered_by.provider_or_deployer_with_staff).toBe(true);
  });

  it('EN "our consulting team uses" (Day-15 fixture broadening) fires the trigger', () => {
    const result = classify(
      'Our consulting team uses an AI-powered code review assistant on customer projects.',
    );
    expect(result.triggered_by.provider_or_deployer_with_staff).toBe(true);
  });

  it('EN "train our consultants" fires the trigger', () => {
    const result = classify('We need to train our consultants on responsible AI use.');
    expect(result.triggered_by.provider_or_deployer_with_staff).toBe(true);
  });

  it('DE "unsere Mitarbeiter nutzen" fires the trigger', () => {
    const result = classify('Unsere Mitarbeiter nutzen ein KI-System für die Dokumentenanalyse.', {
      lang: 'de',
    });
    expect(result.triggered_by.provider_or_deployer_with_staff).toBe(true);
    expect(result.applicable).toBe(true);
  });

  it('DE "Beratungsteam nutzt" (Day-15 fixture broadening) fires the trigger', () => {
    const result = classify(
      'Unser Beratungsteam nutzt einen KI-gestützten Code-Review-Assistenten in Kundenprojekten.',
      { lang: 'de' },
    );
    expect(result.triggered_by.provider_or_deployer_with_staff).toBe(true);
  });

  it('DE "damit unsere Mitarbeiter" (Day-15 fixture broadening) fires the trigger', () => {
    const result = classify(
      'Wir integrieren Llama 3 in unsere interne Dokumenten-Suche, damit unsere Mitarbeiter schneller Informationen finden.',
      { lang: 'de' },
    );
    expect(result.triggered_by.provider_or_deployer_with_staff).toBe(true);
  });
});

describe('classifyArticle4() — summary + source URL', () => {
  it('summary_en carries the verbatim Tier-1 EN chapeau (always, even when not applicable)', () => {
    // Anti-hand-wave check: EUR-Lex Art 4 imposes a measure-taking obligation
    // "to their best extent" with a list of factors to take into account.
    // Our summary MUST carry the verbatim chapeau rather than paraphrase.
    const result = classify('My cat enjoys naps on the windowsill.');
    expect(result.applicable).toBe(false);
    expect(result.summary_en).toContain('sufficient level of AI literacy');
    expect(result.summary_en).toContain('persons or groups of persons on whom the AI systems are to be used');
    expect(result.summary_en).toContain('(Art 4)');
  });

  it('summary_en is byte-stable across applicable === true and applicable === false (single chapeau, no concatenation)', () => {
    // Art 4 has no sub-letters; the chapeau is identical whether the trigger
    // fired or not. This is a load-bearing invariant locking the design choice
    // documented in article-4.ts.
    const a = classify('Our employees use an AI assistant.');
    const b = classify('My cat enjoys naps on the windowsill.');
    expect(a.summary_en).toBe(b.summary_en);
    expect(a.summary_de).toBe(b.summary_de);
  });

  it('summary_de carries the verbatim Tier-1 DE chapeau (Tier-2 EU AI Office Service Desk)', () => {
    // The Tier-3 FLI mirror returns paraphrase drift ("nach bestem Kräften" /
    // "ausreichende KI-Kompetenz" / "Aus- und Weiterbildung" / "berücksichtigt
    // werden"). We ship Tier-2 verbatim ("nach besten Kräften" / "ein
    // ausreichendes Maß an KI-Kompetenz" / "Ausbildung und Schulung" / "zu
    // berücksichtigen sind").
    const result = classify('Unsere Mitarbeiter nutzen ein KI-System.', { lang: 'de' });
    expect(result.summary_de).toContain('nach besten Kräften');
    expect(result.summary_de).toContain('ein ausreichendes Maß an KI-Kompetenz');
    expect(result.summary_de).toContain('Ausbildung und Schulung');
    expect(result.summary_de).toContain('zu berücksichtigen sind');
    expect(result.summary_de).toContain('(Art. 4)');
  });

  it('source URL points at EUR-Lex (HTTPS)', () => {
    const result = classify('Our employees use AI.');
    expect(result.source.startsWith('https://')).toBe(true);
    expect(result.source).toMatch(/eur-lex\.europa\.eu/);
  });
});
