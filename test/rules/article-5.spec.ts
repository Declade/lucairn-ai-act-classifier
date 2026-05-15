import { describe, it, expect } from 'vitest';
import { extractFeatures } from '../../src/extract/keyword.js';
import { classifyArticle5 } from '../../src/rules/article-5.js';

// Helper: run the deterministic pipeline and return the Article 5 result.
function classify(input: string, lang?: 'en' | 'de') {
  const features = lang ? extractFeatures(input, { lang }) : extractFeatures(input);
  return classifyArticle5(features);
}

describe('classifyArticle5() — pure-function determinism', () => {
  it('returns the same output for the same input', () => {
    const input = 'A social scoring platform that evaluates citizens.';
    const a = classify(input);
    const b = classify(input);
    expect(a).toEqual(b);
  });

  it('returns clean negative on empty input', () => {
    const features = extractFeatures('');
    const result = classifyArticle5(features);
    expect(result.prohibited).toBe(false);
    expect(result.hits).toEqual([]);
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it('returns clean negative on unrelated input', () => {
    const features = extractFeatures('My cat enjoys naps on the windowsill.');
    const result = classifyArticle5(features);
    expect(result.prohibited).toBe(false);
    expect(result.hits).toEqual([]);
  });

  it('throws TypeError on non-object input', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyArticle5(null)).toThrow(TypeError);
  });
});

describe('classifyArticle5() — EN trigger cases (one per letter a–h)', () => {
  it('letter (a) — subliminal/manipulative technique fires', () => {
    const result = classify('Our product uses a subliminal technique to influence purchase decisions.');
    expect(result.prohibited).toBe(true);
    expect(result.hits.map((h) => h.letter)).toContain('a');
  });

  it('letter (b) — exploiting vulnerabilities fires', () => {
    const result = classify('Marketing assistant designed to exploit elderly customers in financial decisions.');
    expect(result.prohibited).toBe(true);
    expect(result.hits.map((h) => h.letter)).toContain('b');
  });

  it('letter (c) — social scoring fires', () => {
    const result = classify('A social scoring platform for tracking citizen trustworthiness.');
    expect(result.prohibited).toBe(true);
    expect(result.hits.map((h) => h.letter)).toContain('c');
  });

  it('letter (d) — predictive policing PROFILING-ONLY fires when disambiguator present', () => {
    const result = classify(
      'Tool that performs criminal risk profiling based solely on profiling of personality traits.',
    );
    expect(result.prohibited).toBe(true);
    expect(result.hits.map((h) => h.letter)).toContain('d');
  });

  it('letter (d) — predictive policing does NOT fire on broad crime-pattern analysis (negative case)', () => {
    // Input contains the bare 2-gram "predictive policing" (which hits the
    // Annex III.6 lexicon) but does NOT contain the 3-gram lexicon entry
    // "predictive policing profiling" or the EN disambiguator "solely on
    // profiling". Per Art 5(1)(d), prohibition only applies when the risk
    // assessment is based SOLELY on profiling/personality. Pipeline result:
    // (d) does NOT fire as a prohibition; the broader law-enforcement
    // framing is picked up later by classifyAnnexIII() instead.
    const result = classify(
      'Our system supports law enforcement with predictive policing risk analytics combining demographic and economic indicators.',
    );
    expect(result.hits.map((h) => h.letter)).not.toContain('d');
    expect(result.prohibited).toBe(false);
  });

  it('letter (d) — disambiguator gate engages when lexicon DOES hit but disambiguator absent', () => {
    // This input DOES match the lexicon 3-gram "criminal risk profiling" so
    // the lexicon fires on `d_predictive_policing`, but there is no "solely
    // on profiling" disambiguator → the rule module must skip the hit and
    // record the downgrade in `reasoning` for transparency.
    const result = classify(
      'A criminal risk profiling tool that combines past records, witness statements, and forensic evidence.',
    );
    expect(result.hits.map((h) => h.letter)).not.toContain('d');
    expect(result.prohibited).toBe(false);
    // The downgrade reasoning line MUST mention the lexicon category that
    // was downgraded so consultants can audit the decision.
    expect(
      result.reasoning.some((r) =>
        r.toLowerCase().includes('d_predictive_policing'),
      ),
    ).toBe(true);
  });

  it('letter (e) — facial scraping fires', () => {
    const result = classify('A scraper that performs untargeted facial scraping from public webcams.');
    expect(result.prohibited).toBe(true);
    expect(result.hits.map((h) => h.letter)).toContain('e');
  });

  it('letter (f) — emotion inference at work fires', () => {
    const result = classify(
      'Tool offering classroom emotion recognition for teachers to monitor pupils.',
    );
    expect(result.prohibited).toBe(true);
    expect(result.hits.map((h) => h.letter)).toContain('f');
  });

  it('letter (g) — biometric inference of sensitive attributes fires', () => {
    const result = classify(
      'A biometric system that aims to infer sexual orientation from facial photographs.',
    );
    expect(result.prohibited).toBe(true);
    expect(result.hits.map((h) => h.letter)).toContain('g');
  });

  it('letter (h) — real-time remote biometric ID for LE fires', () => {
    const result = classify(
      'Real-time facial recognition system deployed for police surveillance in train stations.',
    );
    expect(result.prohibited).toBe(true);
    expect(result.hits.map((h) => h.letter)).toContain('h');
  });
});

describe('classifyArticle5() — DE trigger cases (3+ letters covered)', () => {
  it('DE letter (c) — Sozialbewertung fires', () => {
    const result = classify(
      'Wir bauen eine Sozialbewertung-Plattform für die Verwaltung mit Bürgerprofilen.',
      'de',
    );
    expect(result.prohibited).toBe(true);
    expect(result.hits.map((h) => h.letter)).toContain('c');
  });

  it('DE letter (h) — Live-Gesichtserkennung fires', () => {
    const result = classify(
      'Wir setzen Live-Gesichtserkennung in öffentlichen Räumen für die Polizei ein.',
      'de',
    );
    expect(result.prohibited).toBe(true);
    expect(result.hits.map((h) => h.letter)).toContain('h');
  });

  it('DE letter (g) — Religion ableiten fires', () => {
    const result = classify(
      'Ein biometrisches System, das versucht, Religion ableiten aus Gesichtsbildern.',
      'de',
    );
    expect(result.prohibited).toBe(true);
    expect(result.hits.map((h) => h.letter)).toContain('g');
  });

  it('DE letter (d) — predictive policing fires when "ausschließlich Profiling" present', () => {
    const result = classify(
      'Unser System führt Kriminalrisiko-Profiling ausschließlich Profiling-basiert durch.',
      'de',
    );
    expect(result.prohibited).toBe(true);
    expect(result.hits.map((h) => h.letter)).toContain('d');
  });

  it('DE letter (d) — predictive policing fires when EUR-Lex "ausschließlich auf Persönlichkeitsmerkmalen" phrasing present', () => {
    // Canonical EUR-Lex DE Art 5(1)(d) phrasing where the qualifier precedes
    // the noun (Persönlichkeitsmerkmalen). Before this fix-up the
    // disambiguator list only covered "persönlichkeit ausschließlich" /
    // "persönlichkeitsmerkmale ausschließlich" (qualifier-after-noun) and
    // missed the literal EUR-Lex morphology.
    const result = classify(
      'Tool für Kriminalrisiko-Profiling, das ausschließlich auf Persönlichkeitsmerkmalen basiert.',
      'de',
    );
    expect(result.prohibited).toBe(true);
    expect(result.hits.some((h) => h.letter === 'd')).toBe(true);
  });
});

describe('classifyArticle5() — output shape and metadata', () => {
  it('every hit carries an EUR-Lex source URL', () => {
    const result = classify('A social scoring tool combined with subliminal technique.');
    expect(result.hits.length).toBeGreaterThan(0);
    for (const hit of result.hits) {
      expect(hit.source).toMatch(/eur-lex\.europa\.eu/);
    }
  });

  it('every hit has both EN and DE summaries', () => {
    const result = classify('A social scoring tool.');
    expect(result.hits.length).toBeGreaterThan(0);
    for (const hit of result.hits) {
      expect(hit.summary_en.length).toBeGreaterThan(10);
      expect(hit.summary_de.length).toBeGreaterThan(10);
    }
  });

  it('hits are sorted alphabetically by letter', () => {
    const result = classify(
      'A subliminal technique combined with social scoring and live facial recognition for law enforcement.',
    );
    const letters = result.hits.map((h) => h.letter);
    const sorted = [...letters].sort();
    expect(letters).toEqual(sorted);
  });

  it('matched_phrases contains the verbatim phrases from the input', () => {
    const result = classify('A social scoring system.');
    const cHit = result.hits.find((h) => h.letter === 'c');
    expect(cHit?.matched_phrases).toContain('social scoring');
  });
});
