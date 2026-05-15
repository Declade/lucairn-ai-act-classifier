import { describe, it, expect } from 'vitest';
import { detectLang } from '../../src/extract/lang.js';
import { normalize } from '../../src/extract/normalize.js';

describe('detectLang()', () => {
  it('confidently identifies clear English text', () => {
    const result = detectLang(
      normalize('The AI system is used for high-risk applications and they have to comply.'),
    );
    expect(result.lang).toBe('en');
    expect(result.confident).toBe(true);
    expect(result.enHits).toBeGreaterThan(result.deHits);
  });

  it('confidently identifies clear German text', () => {
    const result = detectLang(
      normalize(
        'Das KI-System wird für Hochrisiko-Anwendungen verwendet und muss den Anforderungen genügen.',
      ),
    );
    expect(result.lang).toBe('de');
    expect(result.confident).toBe(true);
    expect(result.deHits).toBeGreaterThan(result.enHits);
  });

  it('returns low confidence when neither language is clearly present', () => {
    const result = detectLang(normalize('biometric facial recognition'));
    expect(result.confident).toBe(false);
  });

  it('defaults to en for empty/numeric input', () => {
    const result = detectLang('');
    expect(result.lang).toBe('en');
    expect(result.confident).toBe(false);
    expect(result.enHits).toBe(0);
    expect(result.deHits).toBe(0);
  });

  it('picks the language with more hits when both have matches', () => {
    // Mostly DE with one EN word
    const result = detectLang(
      normalize('Das KI-System wird für Anwendungen verwendet und the test passes.'),
    );
    // DE has at least: das, für, und = 3 hits
    // EN has at least: the = 1 hit
    expect(result.lang).toBe('de');
    expect(result.deHits).toBeGreaterThan(result.enHits);
  });
});
