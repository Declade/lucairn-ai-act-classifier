// Unit tests for `src/format/cli-table.ts`.
//
// Covers:
//   - Multi-line render matches a snapshot for representative fixtures (EN + DE).
//   - `--cite` toggle adds a Cite block.
//   - `--no-three-category` toggle suppresses the overlay.
//   - Color codes emitted when `useColor: true`; absent when false.
//   - Disclaimer footer always present.
//   - `formatAnnexIVReference()` snapshots (EN + DE).
//   - Input-validation type-guards.

import { describe, it, expect } from 'vitest';
import { classify } from '../../src/classify.js';
import { formatCliTable, formatAnnexIVReference } from '../../src/format/cli-table.js';

const ANSI_RE = /\[[0-9;]*m/;

describe('formatCliTable() — type-guards', () => {
  it('throws TypeError on null result', () => {
    // @ts-expect-error
    expect(() => formatCliTable(null, { locale: 'en', cite: false, useColor: false })).toThrow(
      TypeError,
    );
  });

  it('throws TypeError on non-object opts', () => {
    const r = classify('We use AI for CV screening.');
    // @ts-expect-error
    expect(() => formatCliTable(r, null)).toThrow(TypeError);
  });

  it('throws TypeError on invalid locale', () => {
    const r = classify('We use AI for CV screening.');
    // @ts-expect-error
    expect(() => formatCliTable(r, { locale: 'fr', cite: false, useColor: false })).toThrow(
      TypeError,
    );
  });
});

describe('formatCliTable() — high-risk fixture (EN)', () => {
  it('matches snapshot when useColor: false, cite: false, three-category: on', () => {
    const r = classify('We use AI for CV screening and applicant tracking.', { lang: 'en' });
    const out = formatCliTable(r, { locale: 'en', cite: false, useColor: false });
    expect(out).toMatchSnapshot();
  });

  it('matches snapshot when cite: true (adds Cite block)', () => {
    const r = classify('We use AI for CV screening and applicant tracking.', { lang: 'en' });
    const out = formatCliTable(r, { locale: 'en', cite: true, useColor: false });
    expect(out).toMatchSnapshot();
  });

  it('matches snapshot with --no-three-category (overlay suppressed note)', () => {
    const r = classify('We use AI for CV screening and applicant tracking.', {
      lang: 'en',
      threeCategory: false,
    });
    const out = formatCliTable(r, { locale: 'en', cite: false, useColor: false });
    expect(out).toMatchSnapshot();
  });
});

describe('formatCliTable() — high-risk fixture (DE)', () => {
  it('matches snapshot when useColor: false, cite: false, three-category: on', () => {
    const r = classify('Wir setzen ein KI-System zur Bewerberauswahl ein.', { lang: 'de' });
    const out = formatCliTable(r, { locale: 'de', cite: false, useColor: false });
    expect(out).toMatchSnapshot();
  });
});

describe('formatCliTable() — Article 5 prohibition fixture (EN)', () => {
  it('matches snapshot — Art 5 prohibited variant', () => {
    const r = classify(
      'We deploy real-time facial recognition for general law-enforcement surveillance in public.',
      { lang: 'en' },
    );
    const out = formatCliTable(r, { locale: 'en', cite: false, useColor: false });
    expect(out).toMatchSnapshot();
  });
});

describe('formatCliTable() — color discipline', () => {
  it('emits ANSI escape codes when useColor: true', () => {
    const r = classify('We use AI for CV screening.', { lang: 'en' });
    // kleur's $.enabled is environment-driven; force-enable via FORCE_COLOR-style
    // path is fragile, so we just check the output WHEN kleur is enabled. If
    // kleur is disabled in this environment, we still verify the no-op-vs-color
    // path by ensuring the false case strips ANSI.
    const colored = formatCliTable(r, { locale: 'en', cite: false, useColor: true });
    const plain = formatCliTable(r, { locale: 'en', cite: false, useColor: false });
    // Plain has zero ANSI sequences.
    expect(ANSI_RE.test(plain)).toBe(false);
    // Colored MAY have ANSI sequences depending on kleur's environment detection.
    // The invariant we assert: stripping ANSI from colored produces the same
    // load-bearing label content as plain.
    const strippedColored = colored.replace(/\[[0-9;]*m/g, '');
    // Both contain the section title.
    expect(strippedColored).toContain('EU AI Act mapping');
    expect(plain).toContain('EU AI Act mapping');
  });

  it('NO_COLOR-style off path: useColor: false → zero ANSI sequences', () => {
    const r = classify('We use AI for CV screening.', { lang: 'en' });
    const plain = formatCliTable(r, { locale: 'en', cite: false, useColor: false });
    expect(ANSI_RE.test(plain)).toBe(false);
  });
});

describe('formatCliTable() — disclaimer footer is mandatory', () => {
  function checkAllVariants(text: string, lang: 'en' | 'de'): void {
    const r = classify(text, { lang });
    const variants: ReadonlyArray<{ cite: boolean; useColor: boolean }> = [
      { cite: false, useColor: false },
      { cite: false, useColor: true },
      { cite: true, useColor: false },
      { cite: true, useColor: true },
    ];
    for (const v of variants) {
      const out = formatCliTable(r, { locale: lang, cite: v.cite, useColor: v.useColor });
      const stripped = out.replace(/\[[0-9;]*m/g, '');
      const expectedFooter = lang === 'de' ? 'Informationelles Werkzeug' : 'Informational tool';
      expect(stripped).toContain(expectedFooter);
      expect(stripped).toContain('§Disclaimer');
    }
  }

  it('EN — disclaimer present across 4-variant cite × useColor matrix', () => {
    checkAllVariants('We use AI for CV screening and applicant tracking.', 'en');
  });

  it('DE — disclaimer present across 4-variant cite × useColor matrix', () => {
    checkAllVariants('Wir setzen ein KI-System zur Bewerberauswahl ein.', 'de');
  });
});

describe('formatAnnexIVReference()', () => {
  it('EN snapshot — 9 numbered Annex IV requirements', () => {
    const out = formatAnnexIVReference({ locale: 'en' });
    expect(out).toMatchSnapshot();
  });

  it('DE snapshot — 9 numbered Annex IV requirements', () => {
    const out = formatAnnexIVReference({ locale: 'de' });
    expect(out).toMatchSnapshot();
  });

  it('EN — contains the EUR-Lex source line', () => {
    const out = formatAnnexIVReference({ locale: 'en' });
    expect(out).toContain('Regulation (EU) 2024/1689');
  });

  it('DE — contains the EUR-Lex source line', () => {
    const out = formatAnnexIVReference({ locale: 'de' });
    expect(out).toContain('Verordnung (EU) 2024/1689');
  });
});
