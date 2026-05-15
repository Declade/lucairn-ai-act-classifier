import { describe, it, expect } from 'vitest';
import { classify } from '../../src/classify.js';
import { formatMarkdown } from '../../src/format/markdown.js';

describe('formatMarkdown() — input validation', () => {
  it('throws TypeError on null result', async () => {
    // @ts-expect-error
    expect(() => formatMarkdown(null, { locale: 'en', cite: false })).toThrow(TypeError);
  });

  it('throws TypeError on invalid locale', async () => {
    const r = await classify('We use AI for CV screening.');
    // @ts-expect-error
    expect(() => formatMarkdown(r, { locale: 'fr', cite: false })).toThrow(TypeError);
  });
});

describe('formatMarkdown() — output shape', () => {
  it('EN snapshot — high-risk fixture, cite: false', async () => {
    const r = await classify('We use AI for CV screening and applicant tracking.', { lang: 'en' });
    expect(formatMarkdown(r, { locale: 'en', cite: false })).toMatchSnapshot();
  });

  it('DE snapshot — high-risk fixture, cite: false', async () => {
    const r = await classify('Wir setzen ein KI-System zur Bewerberauswahl ein.', { lang: 'de' });
    expect(formatMarkdown(r, { locale: 'de', cite: false })).toMatchSnapshot();
  });

  it('--cite toggle adds the Citations section', async () => {
    const r = await classify('We use AI for CV screening.', { lang: 'en' });
    const without = formatMarkdown(r, { locale: 'en', cite: false });
    const withCite = formatMarkdown(r, { locale: 'en', cite: true });
    expect(without).not.toContain('### Citations');
    expect(withCite).toContain('### Citations');
  });

  it('--no-three-category toggle removes the Lucairn overlay table', async () => {
    const r = await classify('We use AI for CV screening.', { lang: 'en', threeCategory: false });
    const out = formatMarkdown(r, { locale: 'en', cite: false });
    expect(out).toContain('## Lucairn obligation overlay');
    expect(out).toContain('suppressed via --no-three-category');
    // No category-row table rows should appear (we still emit the heading + suppression note).
    expect(out).not.toContain('Cat 1 Sanitizer');
  });

  it('disclaimer footer present in every variant', async () => {
    const r = await classify('We use AI for CV screening.', { lang: 'en' });
    const variants: ReadonlyArray<{ locale: 'en' | 'de'; cite: boolean }> = [
      { locale: 'en', cite: false },
      { locale: 'en', cite: true },
      { locale: 'de', cite: false },
      { locale: 'de', cite: true },
    ];
    for (const v of variants) {
      const out = formatMarkdown(r, v);
      const expectedFooter = v.locale === 'de' ? 'Informationelles Werkzeug' : 'Informational tool';
      expect(out).toContain(expectedFooter);
      expect(out).toContain('§Disclaimer');
    }
  });
});
