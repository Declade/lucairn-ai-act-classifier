import { describe, it, expect } from 'vitest';
import { normalize, tokenize, ngrams } from '../../src/extract/normalize.js';

describe('normalize()', () => {
  it('lowercases ASCII', () => {
    expect(normalize('AI System')).toBe('ai system');
  });

  it('preserves German umlauts and ß', () => {
    expect(normalize('KI-Süß Größe')).toBe('ki-süß größe');
  });

  it('strips sentence punctuation', () => {
    expect(normalize('Hello, world!')).toBe('hello world');
    expect(normalize('A; B: C? D!')).toBe('a b c d');
  });

  it('preserves in-word hyphens', () => {
    expect(normalize('high-risk system')).toBe('high-risk system');
    expect(normalize('CV-screening tool')).toBe('cv-screening tool');
  });

  it('collapses whitespace', () => {
    expect(normalize('  multiple   spaces\n\ttab')).toBe('multiple spaces tab');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalize('   \n\t  ')).toBe('');
  });

  it('applies NFKC normalization', () => {
    // Latin small ligature fi (U+FB01) → "fi"
    expect(normalize('ﬁnger')).toBe('finger');
  });

  it('strips smart/curly quotes and brackets', () => {
    expect(normalize('„German" ‘single’ (paren) [bracket] {brace}')).toBe(
      'german single paren bracket brace',
    );
  });

  it('throws on non-string input', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => normalize(123)).toThrow(TypeError);
    // @ts-expect-error: deliberately invalid
    expect(() => normalize(null)).toThrow(TypeError);
  });
});

describe('tokenize()', () => {
  it('splits normalized text on single spaces', () => {
    expect(tokenize('high-risk ai system')).toEqual(['high-risk', 'ai', 'system']);
  });

  it('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('preserves hyphens within tokens', () => {
    expect(tokenize('echtzeit-fernidentifizierung von personen')).toEqual([
      'echtzeit-fernidentifizierung',
      'von',
      'personen',
    ]);
  });
});

describe('ngrams()', () => {
  it('generates 1-grams', () => {
    expect(ngrams(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });

  it('generates 2-grams', () => {
    expect(ngrams(['a', 'b', 'c'], 2, 2)).toEqual(['a b', 'b c']);
  });

  it('generates 3-grams', () => {
    expect(ngrams(['a', 'b', 'c'], 3, 3)).toEqual(['a b c']);
  });

  it('generates a range minN..maxN', () => {
    expect(ngrams(['a', 'b', 'c'], 1, 2)).toEqual(['a', 'b', 'c', 'a b', 'b c']);
  });

  it('skips sizes larger than the token list', () => {
    // tokens.length=2, asking for 1..4 should yield only 1-grams and 2-grams
    expect(ngrams(['a', 'b'], 1, 4)).toEqual(['a', 'b', 'a b']);
  });

  it('returns empty for empty token list', () => {
    expect(ngrams([], 1, 4)).toEqual([]);
  });

  it('throws on minN < 1', () => {
    expect(() => ngrams(['a'], 0, 2)).toThrow(RangeError);
  });

  it('throws on maxN < minN', () => {
    expect(() => ngrams(['a'], 3, 2)).toThrow(RangeError);
  });
});
