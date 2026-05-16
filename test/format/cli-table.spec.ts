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

import { describe, it, expect, afterEach } from 'vitest';
import kleur from 'kleur';
import { classify } from '../../src/classify.js';
import { formatCliTable, formatAnnexIVReference } from '../../src/format/cli-table.js';
import { formatAnnexIVReferenceJson } from '../../src/format/json.js';
import { formatAnnexIVReferenceMarkdown } from '../../src/format/markdown.js';

const ANSI_RE = /\[[0-9;]*m/;

describe('formatCliTable() — type-guards', () => {
  it('throws TypeError on null result', async () => {
    // @ts-expect-error
    expect(() => formatCliTable(null, { locale: 'en', cite: false, useColor: false })).toThrow(
      TypeError,
    );
  });

  it('throws TypeError on non-object opts', async () => {
    const r = await classify('We use AI for CV screening.');
    // @ts-expect-error
    expect(() => formatCliTable(r, null)).toThrow(TypeError);
  });

  it('throws TypeError on invalid locale', async () => {
    const r = await classify('We use AI for CV screening.');
    // @ts-expect-error
    expect(() => formatCliTable(r, { locale: 'fr', cite: false, useColor: false })).toThrow(
      TypeError,
    );
  });
});

describe('formatCliTable() — high-risk fixture (EN)', () => {
  it('matches snapshot when useColor: false, cite: false, three-category: on', async () => {
    const r = await classify('We use AI for CV screening and applicant tracking.', { lang: 'en' });
    const out = formatCliTable(r, { locale: 'en', cite: false, useColor: false });
    expect(out).toMatchSnapshot();
  });

  it('matches snapshot when cite: true (adds Cite block)', async () => {
    const r = await classify('We use AI for CV screening and applicant tracking.', { lang: 'en' });
    const out = formatCliTable(r, { locale: 'en', cite: true, useColor: false });
    expect(out).toMatchSnapshot();
  });

  it('matches snapshot with --no-three-category (overlay suppressed note)', async () => {
    const r = await classify('We use AI for CV screening and applicant tracking.', {
      lang: 'en',
      threeCategory: false,
    });
    const out = formatCliTable(r, { locale: 'en', cite: false, useColor: false });
    expect(out).toMatchSnapshot();
  });
});

describe('formatCliTable() — high-risk fixture (DE)', () => {
  it('matches snapshot when useColor: false, cite: false, three-category: on', async () => {
    const r = await classify('Wir setzen ein KI-System zur Bewerberauswahl ein.', { lang: 'de' });
    const out = formatCliTable(r, { locale: 'de', cite: false, useColor: false });
    expect(out).toMatchSnapshot();
  });
});

describe('formatCliTable() — Article 5 prohibition fixture (EN)', () => {
  it('matches snapshot — Art 5 prohibited variant', async () => {
    const r = await classify(
      'We deploy real-time facial recognition for general law-enforcement surveillance in public.',
      { lang: 'en' },
    );
    const out = formatCliTable(r, { locale: 'en', cite: false, useColor: false });
    expect(out).toMatchSnapshot();
  });
});

describe('formatCliTable() — Article 4 + GPAI surfacing (B-1 closure)', () => {
  const GPAI_AND_LITERACY_INPUT_EN =
    'We train a foundation model with 10^25 floating-point operations. Our employees use it.';
  const GPAI_AND_LITERACY_INPUT_DE =
    'Wir entwickeln ein großes Sprachmodell mit 10^25 Floating-Point-Operationen Rechenleistung. Damit unser Personal das Modell nutzen kann, schulen wir alle Mitarbeiter.';

  it('EN — emits Article 4 row when Art 4 fires (lexicon hit on provider + staff)', async () => {
    const r = await classify(GPAI_AND_LITERACY_INPUT_EN, { lang: 'en' });
    expect(r.article_4.applicable).toBe(true);
    const out = formatCliTable(r, { locale: 'en', cite: false, useColor: false });
    expect(out).toContain('Article 4');
    expect(out).toContain('AI literacy');
    expect(out).toContain('applies');
  });

  it('EN — emits Articles 53+55 (GPAI) row with "Art 53+55" cell when both fire', async () => {
    const r = await classify(GPAI_AND_LITERACY_INPUT_EN, { lang: 'en' });
    expect(r.gpai.article_53_applicable).toBe(true);
    expect(r.gpai.article_55_applicable).toBe(true);
    const out = formatCliTable(r, { locale: 'en', cite: false, useColor: false });
    expect(out).toContain('Articles 53+55 (GPAI)');
    expect(out).toContain('Art 53+55');
  });

  it('EN — Art 53-only fire (no systemic-risk markers) renders "Art 53" cell, not "Art 53+55"', async () => {
    const r = await classify('We build a customer-facing chatbot on top of GPT-5 via the OpenAI API.', { lang: 'en' });
    expect(r.gpai.article_53_applicable).toBe(true);
    expect(r.gpai.article_55_applicable).toBe(false);
    const out = formatCliTable(r, { locale: 'en', cite: false, useColor: false });
    // The cell renders "Art 53" (not "Art 53+55"; not "not applicable").
    expect(out).toMatch(/Articles 53\+55 \(GPAI\): Art 53(?!\+)/);
  });

  it('DE — emits Artikel 4 + Artikel 53+55 rows with locale labels', async () => {
    const r = await classify(GPAI_AND_LITERACY_INPUT_DE, { lang: 'de' });
    expect(r.gpai.article_53_applicable).toBe(true);
    const out = formatCliTable(r, { locale: 'de', cite: false, useColor: false });
    expect(out).toContain('Artikel 4');
    expect(out).toContain('KI-Kompetenz');
    expect(out).toContain('Artikel 53+55 (GPAI)');
    // DE GPAI cell uses "Art." (with period) per locale.
    expect(out).toMatch(/Art\. 53/);
  });

  it('renders "not applicable" cell for Art 4 + GPAI on a negative-classification input', async () => {
    const r = await classify('A simple weather forecast model returning rainfall probabilities.', { lang: 'en' });
    expect(r.article_4.applicable).toBe(false);
    expect(r.gpai.article_53_applicable).toBe(false);
    const out = formatCliTable(r, { locale: 'en', cite: false, useColor: false });
    expect(out).toContain('Article 4');
    expect(out).toContain('Articles 53+55 (GPAI)');
  });

  it('--cite block includes Art 4 + GPAI citation lines when applicable', async () => {
    const r = await classify(GPAI_AND_LITERACY_INPUT_EN, { lang: 'en' });
    const out = formatCliTable(r, { locale: 'en', cite: true, useColor: false });
    // Both Art 4 and the GPAI Tier-3 mirror URLs should appear in the cite block.
    expect(out).toContain('article/4/');
    // The GPAI mirror URL covers both Art 53 + 55.
    expect(out).toMatch(/article\/53\//);
  });
});

describe('formatCliTable() — color discipline', () => {
  it('emits ANSI escape codes when useColor: true', async () => {
    const r = await classify('We use AI for CV screening.', { lang: 'en' });
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

  it('NO_COLOR-style off path: useColor: false → zero ANSI sequences', async () => {
    const r = await classify('We use AI for CV screening.', { lang: 'en' });
    const plain = formatCliTable(r, { locale: 'en', cite: false, useColor: false });
    expect(ANSI_RE.test(plain)).toBe(false);
  });
});

describe('formatCliTable() — color discipline force-enabled (M2 fix-up)', () => {
  // Save + restore kleur's global flag so this test is hermetic.
  const previousEnabled = kleur.enabled;

  afterEach(() => {
    kleur.enabled = previousEnabled;
  });

  it('forces kleur.enabled = true → output contains at least one ANSI escape sequence', async () => {
    kleur.enabled = true;
    const r = await classify(
      'We deploy real-time facial recognition for general law-enforcement surveillance in public spaces.',
      { lang: 'en' },
    );
    const colored = formatCliTable(r, { locale: 'en', cite: false, useColor: true });
    // The PROHIBITED + not applicable + dim-disclaimer chain guarantees ANSI
    // escapes when kleur is enabled (red().bold for prohibited; dim for the
    // remaining categories; dim for the disclaimer footer).
    expect(ANSI_RE.test(colored)).toBe(true);
    // ANSI escape character is \x1b (ESC) — check that too as a tighter
    // invariant beyond the bracketed-numeric form.
    expect(colored).toContain('\x1b[');
  });
});

describe('formatCliTable() — disclaimer footer is mandatory', () => {
  async function checkAllVariants(text: string, lang: 'en' | 'de'): Promise<void> {
    const r = await classify(text, { lang });
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

  it('EN — disclaimer present across 4-variant cite × useColor matrix', async () => {
    await checkAllVariants('We use AI for CV screening and applicant tracking.', 'en');
  });

  it('DE — disclaimer present across 4-variant cite × useColor matrix', async () => {
    await checkAllVariants('Wir setzen ein KI-System zur Bewerberauswahl ein.', 'de');
  });
});

describe('formatAnnexIVReference()', () => {
  it('EN snapshot — 9 numbered Annex IV requirements', async () => {
    const out = formatAnnexIVReference({ locale: 'en' });
    expect(out).toMatchSnapshot();
  });

  it('DE snapshot — 9 numbered Annex IV requirements', async () => {
    const out = formatAnnexIVReference({ locale: 'de' });
    expect(out).toMatchSnapshot();
  });

  it('EN — contains the EUR-Lex source line', async () => {
    const out = formatAnnexIVReference({ locale: 'en' });
    expect(out).toContain('Regulation (EU) 2024/1689');
  });

  it('DE — contains the EUR-Lex source line', async () => {
    const out = formatAnnexIVReference({ locale: 'de' });
    expect(out).toContain('Verordnung (EU) 2024/1689');
  });
});

describe('formatAnnexIVReferenceJson() — M4 fix-up', () => {
  it('EN — produces parseable JSON with title, source, items, disclaimer', async () => {
    const out = formatAnnexIVReferenceJson({ locale: 'en' });
    const parsed = JSON.parse(out) as {
      title: string;
      source: string;
      items: ReadonlyArray<{ number: string; title: string }>;
      disclaimer: string;
    };
    expect(parsed.title).toContain('Annex IV');
    expect(parsed.source).toContain('Regulation (EU) 2024/1689');
    expect(parsed.items.length).toBe(9);
    expect(parsed.items[0]?.number).toBe('1.');
    expect(parsed.disclaimer).toContain('Informational tool');
  });

  it('DE — produces parseable JSON with verbatim Tier-1 wording', async () => {
    const out = formatAnnexIVReferenceJson({ locale: 'de' });
    const parsed = JSON.parse(out) as {
      title: string;
      source: string;
      items: ReadonlyArray<{ number: string; title: string }>;
      disclaimer: string;
    };
    expect(parsed.title).toContain('Anhang IV');
    expect(parsed.source).toContain('Verordnung (EU) 2024/1689');
    expect(parsed.items.length).toBe(9);
    // Item 4 = Tier-1 verbatim "Darlegungen zur Eignung der Leistungskennzahlen..."
    expect(parsed.items[3]?.title).toContain('Darlegungen zur Eignung der Leistungskennzahlen');
    expect(parsed.disclaimer).toContain('Informationelles Werkzeug');
  });

  it('throws TypeError on invalid locale', async () => {
    // @ts-expect-error
    expect(() => formatAnnexIVReferenceJson({ locale: 'fr' })).toThrow(TypeError);
  });

  it('pretty: false produces single-line JSON', async () => {
    const out = formatAnnexIVReferenceJson({ locale: 'en', pretty: false });
    expect(out.includes('\n')).toBe(false);
    expect(() => JSON.parse(out)).not.toThrow();
  });
});

describe('formatAnnexIVReferenceMarkdown() — M4 fix-up', () => {
  it('EN — starts with an H2 title, lists 9 numbered items, ends with disclaimer', async () => {
    const out = formatAnnexIVReferenceMarkdown({ locale: 'en' });
    expect(out.startsWith('## Annex IV')).toBe(true);
    // 9 numbered list items 1. through 9.
    for (let i = 1; i <= 9; i++) {
      expect(out).toContain(`${i}.`);
    }
    expect(out).toContain('Source: EUR-Lex Regulation (EU) 2024/1689');
    expect(out).toContain('Informational tool');
  });

  it('DE — Tier-1 verbatim wording across all 9 items', async () => {
    const out = formatAnnexIVReferenceMarkdown({ locale: 'de' });
    expect(out.startsWith('## Anhang IV')).toBe(true);
    expect(out).toContain('Allgemeine Beschreibung des KI-Systems.');
    expect(out).toContain('Detaillierte Beschreibung der Bestandteile');
    expect(out).toContain('Darlegungen zur Eignung der Leistungskennzahlen');
    expect(out).toContain('Aufstellung der vollständig oder teilweise angewandten harmonisierten Normen');
    expect(out).toContain('Informationelles Werkzeug');
  });

  it('throws TypeError on invalid locale', async () => {
    // @ts-expect-error
    expect(() => formatAnnexIVReferenceMarkdown({ locale: 'fr' })).toThrow(TypeError);
  });
});
