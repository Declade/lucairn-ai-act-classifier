import { describe, it, expect } from 'vitest';
import { classify } from '../../src/classify.js';
import { formatJson } from '../../src/format/json.js';

describe('formatJson() — input validation', () => {
  it('throws TypeError on null result', () => {
    // @ts-expect-error
    expect(() => formatJson(null)).toThrow(TypeError);
  });

  it('throws TypeError on non-object result', () => {
    // @ts-expect-error
    expect(() => formatJson('string')).toThrow(TypeError);
  });
});

describe('formatJson() — output shape', () => {
  it('snapshot — high-risk fixture (pretty=true, includeFeatures=false)', () => {
    const r = classify('We use AI for CV screening and applicant tracking.', { lang: 'en' });
    const out = formatJson(r);
    expect(out).toMatchSnapshot();
  });

  it('pretty=false → single-line output', () => {
    const r = classify('We use AI for CV screening.');
    const out = formatJson(r, { pretty: false });
    expect(out).not.toContain('\n');
  });

  it('pretty=true (default) → multi-line indented output', () => {
    const r = classify('We use AI for CV screening.');
    const out = formatJson(r);
    expect(out).toContain('\n');
    expect(out.split('\n').length).toBeGreaterThan(20);
  });

  it('JSON.parse succeeds (round-trip cleanly)', () => {
    const r = classify('We use AI for CV screening.');
    const pretty = formatJson(r, { pretty: true });
    const compact = formatJson(r, { pretty: false });
    expect(() => JSON.parse(pretty)).not.toThrow();
    expect(() => JSON.parse(compact)).not.toThrow();
    // Both forms produce the same JS object.
    expect(JSON.parse(pretty)).toEqual(JSON.parse(compact));
  });

  it('omits "features" by default (includeFeatures=false)', () => {
    const r = classify('We use AI for CV screening.');
    const parsed = JSON.parse(formatJson(r)) as Record<string, unknown>;
    expect('features' in parsed).toBe(false);
  });

  it('includes "features" when includeFeatures: true', () => {
    const r = classify('We use AI for CV screening.');
    const parsed = JSON.parse(formatJson(r, { includeFeatures: true })) as Record<string, unknown>;
    expect('features' in parsed).toBe(true);
    expect(typeof parsed['features']).toBe('object');
  });

  it('key order is stable across two runs on the same input', () => {
    const r = classify('We use AI for CV screening.');
    const a = formatJson(r);
    const b = formatJson(r);
    expect(a).toBe(b); // byte-exact stability
  });

  it('top-level key order matches the locked KEY_ORDER constant', () => {
    const r = classify('We use AI for CV screening.', { includeFeatures: false } as never);
    // Parse and re-stringify with JSON.stringify(parsed, null, 2) — if our
    // top-level order matches insertion order, re-stringification produces
    // the same bytes.
    const out = formatJson(r);
    const parsed = JSON.parse(out) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    expect(keys[0]).toBe('input_text');
    expect(keys[1]).toBe('detected_lang');
    expect(keys[2]).toBe('lang_confident');
    expect(keys[3]).toBe('rules_version');
    expect(keys[4]).toBe('rules_hash');
    expect(keys[5]).toBe('rules_hash_full');
    expect(keys[6]).toBe('mode');
    expect(keys[7]).toBe('confidence');
    // article_5 comes BEFORE annex_iii in the order.
    expect(keys.indexOf('article_5')).toBeLessThan(keys.indexOf('annex_iii'));
    expect(keys.indexOf('annex_iii')).toBeLessThan(keys.indexOf('article_10'));
    expect(keys.indexOf('article_10')).toBeLessThan(keys.indexOf('article_50'));
    expect(keys[keys.length - 1]).toBe('annex_iv_required');
  });
});
