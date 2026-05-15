import { describe, it, expect } from 'vitest';
import { extractFeatures } from '../../src/extract/keyword.js';
import { classifyArticle5 } from '../../src/rules/article-5.js';
import { classifyAnnexIII } from '../../src/rules/article-6-annex-iii.js';

// Helper: full pipeline (extract → Art 5 → Annex III).
function classify(input: string, lang?: 'en' | 'de') {
  const features = lang ? extractFeatures(input, { lang }) : extractFeatures(input);
  const article5 = classifyArticle5(features);
  const annexIII = classifyAnnexIII(features, article5);
  return { features, article5, annexIII };
}

describe('classifyAnnexIII() — pure-function determinism', () => {
  it('returns the same output for the same input', () => {
    const input = 'AI tool that performs CV screening for hiring.';
    const a = classify(input);
    const b = classify(input);
    expect(a.annexIII).toEqual(b.annexIII);
  });

  it('returns clean negative on empty input', () => {
    const features = extractFeatures('');
    const article5 = classifyArticle5(features);
    const annexIII = classifyAnnexIII(features, article5);
    expect(annexIII.high_risk).toBe(false);
    expect(annexIII.domains).toEqual([]);
    expect(annexIII.suppressed_by_article_5).toBe(false);
  });

  it('returns clean negative on unrelated input', () => {
    const result = classify('My cat enjoys naps on the windowsill.');
    expect(result.annexIII.high_risk).toBe(false);
    expect(result.annexIII.domains).toEqual([]);
  });

  it('throws TypeError on non-object features', () => {
    const features = extractFeatures('cv screening');
    const article5 = classifyArticle5(features);
    // @ts-expect-error: deliberately invalid
    expect(() => classifyAnnexIII(null, article5)).toThrow(TypeError);
  });

  it('throws TypeError on non-object article5Result', () => {
    const features = extractFeatures('cv screening');
    // @ts-expect-error: deliberately invalid
    expect(() => classifyAnnexIII(features, null)).toThrow(TypeError);
  });
});

describe('classifyAnnexIII() — one trigger per Annex III domain (1–8)', () => {
  it('Annex III.1 — biometrics fires on facial recognition (non-prohibition context)', () => {
    // Plain biometric ID without "real-time" + "law enforcement" → high-risk only.
    const result = classify(
      'A facial recognition system used for biometric authentication of employees clocking in.',
    );
    // Ensure Art 5(1)(h) does NOT fire (this is not real-time LE in public).
    expect(result.article5.hits.map((h) => h.letter)).not.toContain('h');
    expect(result.annexIII.high_risk).toBe(true);
    expect(result.annexIII.domains.map((d) => d.annex_iii_number)).toContain(1);
  });

  it('Annex III.2 — critical infrastructure fires', () => {
    const result = classify(
      'AI safety component for power grid load-balancing in critical infrastructure operations.',
    );
    expect(result.annexIII.high_risk).toBe(true);
    expect(result.annexIII.domains.map((d) => d.annex_iii_number)).toContain(2);
  });

  it('Annex III.3 — education fires (DE)', () => {
    const result = classify(
      'Wir bauen ein automatisierte Benotung Werkzeug für die Prüfungsbewertung in Hochschulen.',
      'de',
    );
    expect(result.annexIII.high_risk).toBe(true);
    expect(result.annexIII.domains.map((d) => d.annex_iii_number)).toContain(3);
  });

  it('Annex III.4 — employment fires with sub-letter (a)', () => {
    const result = classify(
      'AI tool that performs CV screening and applicant tracking with candidate ranking.',
    );
    expect(result.annexIII.high_risk).toBe(true);
    const empDomain = result.annexIII.domains.find((d) => d.annex_iii_number === 4);
    expect(empDomain).toBeDefined();
    expect(empDomain!.sub_letters).toContain('a');
  });

  it('Annex III.5 — essential services fires on credit scoring with sub-letter (b)', () => {
    const result = classify(
      'A credit scoring product evaluating the creditworthiness of consumers.',
    );
    expect(result.annexIII.high_risk).toBe(true);
    const essDomain = result.annexIII.domains.find((d) => d.annex_iii_number === 5);
    expect(essDomain).toBeDefined();
    expect(essDomain!.sub_letters).toContain('b');
  });

  it('Annex III.6 — law enforcement fires (broad, no Art 5 prohibition)', () => {
    const result = classify(
      'Our system supports law enforcement with predictive policing risk analytics combining demographic factors.',
    );
    expect(result.annexIII.high_risk).toBe(true);
    expect(result.annexIII.domains.map((d) => d.annex_iii_number)).toContain(6);
    expect(result.article5.prohibited).toBe(false);
  });

  it('Annex III.7 — migration / border control fires (DE)', () => {
    const result = classify(
      'KI-System zur Prüfung von Asylantrag und Visumantrag mit Grenzkontrolle Bewertung.',
      'de',
    );
    expect(result.annexIII.high_risk).toBe(true);
    expect(result.annexIII.domains.map((d) => d.annex_iii_number)).toContain(7);
  });

  it('Annex III.8 — administration of justice fires', () => {
    const result = classify(
      'AI tool for judicial assistance with legal interpretation tasks supporting judicial decision workflows.',
    );
    expect(result.annexIII.high_risk).toBe(true);
    expect(result.annexIII.domains.map((d) => d.annex_iii_number)).toContain(8);
  });
});

describe('classifyAnnexIII() — Annex III.5 insurance-pricing scope rule', () => {
  it('LIFE insurance pricing → Annex III.5 fires with sub-letter (c)', () => {
    const result = classify(
      'AI-powered insurance pricing for our life insurance and health insurance products.',
    );
    expect(result.annexIII.high_risk).toBe(true);
    const ess = result.annexIII.domains.find((d) => d.annex_iii_number === 5);
    expect(ess).toBeDefined();
    expect(ess!.sub_letters).toContain('c');
  });

  it('MOTOR insurance pricing → Annex III.5 does NOT fire (P&C carve-out)', () => {
    const result = classify(
      'AI-powered insurance pricing for motor insurance, car insurance, and travel insurance products only.',
    );
    // No life/health context → 5(c) should NOT fire and the ONLY matched
    // 5_essential_services phrase was insurance-pricing → domain 5 should be
    // entirely absent from the high-risk set.
    expect(result.annexIII.domains.map((d) => d.annex_iii_number)).not.toContain(5);
    // The reasoning must explain the carve-out for transparency.
    expect(
      result.annexIII.reasoning.some((r) =>
        r.toLowerCase().includes('property/casualty/motor insurance'),
      ),
    ).toBe(true);
  });

  it('MOTOR insurance + credit scoring → 5(b) fires but insurance-pricing is dropped', () => {
    const result = classify(
      'A motor insurance pricing tool that ALSO performs creditworthiness checks and credit scoring on policyholders.',
    );
    const ess = result.annexIII.domains.find((d) => d.annex_iii_number === 5);
    expect(ess).toBeDefined();
    // 5(b) credit scoring fires.
    expect(ess!.sub_letters).toContain('b');
    // The insurance-pricing phrases were dropped; matched_phrases should
    // contain credit scoring / creditworthiness but NOT "insurance pricing".
    expect(ess!.matched_phrases).not.toContain('insurance pricing');
    expect(ess!.matched_phrases.some((p) => p.includes('credit'))).toBe(true);
  });
});

describe('classifyAnnexIII() — Article 5 prohibition wins (suppression)', () => {
  it('biometrics + Art 5(1)(h) prohibition → suppressed_by_article_5 = true, high_risk = false', () => {
    const result = classify(
      'We deploy a real-time facial recognition system in public spaces for general law-enforcement surveillance.',
    );
    // Art 5(1)(h) must fire.
    expect(result.article5.prohibited).toBe(true);
    expect(result.article5.hits.map((h) => h.letter)).toContain('h');
    // Annex III.1 lexicon hit IS recorded for transparency...
    expect(result.annexIII.domains.map((d) => d.annex_iii_number)).toContain(1);
    // ...but high_risk MUST be false because prohibition supersedes.
    expect(result.annexIII.high_risk).toBe(false);
    expect(result.annexIII.suppressed_by_article_5).toBe(true);
    // Reasoning must call out the supersession.
    expect(
      result.annexIII.reasoning.some((r) => r.toLowerCase().includes('supersedes')),
    ).toBe(true);
  });
});

describe('classifyAnnexIII() — internal_use NEVER suppresses', () => {
  it('CV screening + internal use only → still high-risk', () => {
    const result = classify(
      'AI tool that performs CV screening and applicant tracking — internal use only at our company.',
    );
    expect(result.annexIII.high_risk).toBe(true);
    expect(result.annexIII.domains.map((d) => d.annex_iii_number)).toContain(4);
    // Reasoning must explain that internal_use is NOT a regulatory exemption.
    expect(
      result.annexIII.reasoning.some((r) => r.toLowerCase().includes('not a regulatory exemption')),
    ).toBe(true);
  });

  it('social scoring + internal use only → Article 5 prohibition still fires (not suppressed)', () => {
    const result = classify(
      'Our internal use only social scoring system for ranking employee trustworthiness.',
    );
    expect(result.article5.prohibited).toBe(true);
    expect(result.article5.hits.map((h) => h.letter)).toContain('c');
    // suppressed_by_article_5 reflects the prohibition fired.
    expect(result.annexIII.suppressed_by_article_5).toBe(true);
  });
});

describe('classifyAnnexIII() — research_only Art 2(8) carve-out', () => {
  it('research only WITHOUT real-world conditions → carve-out applies (reasoning)', () => {
    const result = classify(
      'A facial recognition system for research only — pre-market testing in our lab.',
    );
    expect(
      result.annexIII.reasoning.some((r) => r.toLowerCase().includes('art 2(8) carve-out may apply')),
    ).toBe(true);
  });

  it('research only WITH "real-world conditions" → carve-out does NOT apply (reasoning)', () => {
    const result = classify(
      'A facial recognition system for research only — but tested under real-world conditions in our pilot.',
    );
    expect(
      result.annexIII.reasoning.some((r) =>
        r.toLowerCase().includes('the research/testing carve-out does not apply'),
      ),
    ).toBe(true);
  });

  it('DE: Forschungszwecke + Realbedingungen → carve-out does NOT apply (reasoning)', () => {
    const result = classify(
      'Ein KI-System für Forschungszwecke, aber wir testen unter Realbedingungen mit echten Nutzern bei Lebenslauf-Screening.',
      'de',
    );
    expect(
      result.annexIII.reasoning.some((r) =>
        r.toLowerCase().includes('the research/testing carve-out does not apply'),
      ),
    ).toBe(true);
  });
});

describe('classifyAnnexIII() — output shape and metadata', () => {
  it('domains are sorted by Annex III number ascending', () => {
    const result = classify(
      'A facial recognition tool combined with credit scoring and judicial assistance for legal interpretation.',
    );
    const numbers = result.annexIII.domains.map((d) => d.annex_iii_number);
    const sorted = [...numbers].sort((a, b) => a - b);
    expect(numbers).toEqual(sorted);
  });

  it('every domain hit carries an EUR-Lex / Annex III citation source', () => {
    const result = classify('AI tool for CV screening.');
    expect(result.annexIII.domains.length).toBeGreaterThan(0);
    for (const dom of result.annexIII.domains) {
      expect(dom.source).toMatch(/Annex III/);
    }
  });

  it('every domain hit has EN and DE titles', () => {
    const result = classify('AI tool for CV screening.');
    for (const dom of result.annexIII.domains) {
      expect(dom.title_en.length).toBeGreaterThan(3);
      expect(dom.title_de.length).toBeGreaterThan(3);
    }
  });
});
