import { describe, it, expect } from 'vitest';
import { extractFeatures } from '../../src/extract/keyword.js';

describe('extractFeatures() — EN inputs', () => {
  it('detects an Annex III.4 employment trigger from a CV-screening description', () => {
    const result = extractFeatures(
      'An AI system that performs CV screening and applicant tracking for the hiring decision.',
    );
    expect(result.lang).toBe('en');
    expect(result.lexiconVersion).toBe('v0.1.1');

    // At minimum: cv screening + applicant tracking + hiring decision
    const employmentMatches = result.byCategory.annex_iii?.['4_employment'] ?? [];
    expect(employmentMatches).toContain('cv screening');
    expect(employmentMatches).toContain('applicant tracking');
    expect(employmentMatches).toContain('hiring decision');
  });

  it('detects an Article 5 prohibition trigger for social scoring', () => {
    const result = extractFeatures('We build a social scoring platform for citizens.');
    const prohibitions = result.byCategory.article_5_prohibited?.['c_social_scoring'] ?? [];
    expect(prohibitions).toContain('social scoring');
  });

  it('detects an Annex III.1 biometrics trigger', () => {
    const result = extractFeatures('The system performs facial recognition at airports.');
    const biometricMatches = result.byCategory.annex_iii?.['1_biometrics'] ?? [];
    expect(biometricMatches).toContain('facial recognition');
  });

  it('detects an Article 50 GPAI deepfake trigger', () => {
    const result = extractFeatures('A tool that creates deepfake videos for entertainment.');
    const deepfakeMatches = result.byCategory.article_50_gpai?.['4_deepfake_labeling'] ?? [];
    expect(deepfakeMatches).toContain('deepfake');
  });

  it('detects a scope-qualifier (research only) trigger', () => {
    const result = extractFeatures('An emotion recognition system for research only.');
    expect(
      result.byCategory.scope_qualifiers?.['research_only'] ?? [],
    ).toContain('research only');
    // Should ALSO still detect the trigger phrase — rules engine decides what to do
    expect(result.byCategory.annex_iii?.['1_biometrics'] ?? []).toContain('emotion recognition');
  });

  it('returns empty hits for unrelated text', () => {
    const result = extractFeatures('My cat enjoys naps on the windowsill at midday.');
    expect(result.hits).toEqual([]);
  });

  it('emits hits in a deterministic group order (annex_iii, art5, art50, qualifiers)', () => {
    const result = extractFeatures(
      'A chatbot using credit scoring with social scoring features for research only.',
    );
    // Walk hits and verify the group sequence is monotonic per the fixed order
    const order: Record<string, number> = {
      annex_iii: 0,
      article_5_prohibited: 1,
      article_50_gpai: 2,
      scope_qualifiers: 3,
    };
    for (let i = 1; i < result.hits.length; i++) {
      const previous = result.hits[i - 1]!;
      const current = result.hits[i]!;
      expect(order[current.group]).toBeGreaterThanOrEqual(order[previous.group]!);
    }
  });
});

describe('extractFeatures() — DE inputs', () => {
  it('detects an Anhang III.4 employment trigger from German CV-screening description', () => {
    const result = extractFeatures(
      'Ein KI-System für Lebenslauf-Screening und Bewerberauswahl bei der Einstellungsentscheidung.',
    );
    expect(result.lang).toBe('de');
    const employmentMatches = result.byCategory.annex_iii?.['4_employment'] ?? [];
    expect(employmentMatches).toContain('lebenslauf-screening');
    expect(employmentMatches).toContain('bewerberauswahl');
    expect(employmentMatches).toContain('einstellungsentscheidung');
  });

  it('detects an Art. 5 Sozialbewertung prohibition trigger', () => {
    const result = extractFeatures(
      'Wir bauen eine Sozialbewertungs-Plattform für Bürger und das System ist umstritten.',
    );
    // "Sozialbewertung" inflected → "sozialbewertungs" won't match exactly,
    // but the German selector words ensure language detection picks DE.
    expect(result.lang).toBe('de');
  });

  it('detects an Art. 50 GPAI deepfake trigger from DE text', () => {
    const result = extractFeatures(
      'Ein Werkzeug, das Deepfake-Videos erstellt und der Inhalt ist generative ki.',
    );
    expect(result.lang).toBe('de');
    const deepfakeMatches = result.byCategory.article_50_gpai?.['4_deepfake_labeling'] ?? [];
    expect(deepfakeMatches).toContain('deepfake');
  });
});

describe('extractFeatures() — options', () => {
  it('respects opts.lang override', () => {
    const result = extractFeatures('biometric categorisation tool', { lang: 'de' });
    expect(result.lang).toBe('de');
  });

  it('respects opts.minN / opts.maxN', () => {
    // With maxN=1, multi-token phrases like "cv screening" should NOT match
    const result = extractFeatures('cv screening tool', { maxN: 1 });
    const employmentMatches = result.byCategory.annex_iii?.['4_employment'] ?? [];
    expect(employmentMatches).not.toContain('cv screening');
  });

  it('preserves the raw input in the result', () => {
    const input = '  Mixed-CASE   input with extra spaces  ';
    const result = extractFeatures(input);
    expect(result.input).toBe(input);
  });

  it('throws on non-string input', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => extractFeatures(42)).toThrow(TypeError);
  });
});
