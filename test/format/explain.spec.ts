// Unit tests for `src/format/explain.ts`.
//
// Covers (Day 11 dispatch §1.7):
//   - Per-format snapshot tests on representative ClassifyResult fixtures
//     (Art 5 prohibited, Annex III high-risk single sub-letter, Annex III
//     multi sub-letter, Art 50 + Annex III cascade, negative classification).
//   - "Why did not fire" reasoning correctness on nearest-miss cases.
//   - `--with-excerpt` appends excerpt when file exists; omits when missing
//     (graceful — no error).
//   - Locale switching: EN input → EN labels + EN excerpts; DE input → DE
//     labels + DE excerpts.
//   - Disambiguator-state surfacing on Art 5(1)(d) negative-case (input has
//     `vorhersagende polizeiarbeit` hit but no `ausschließlich` substring).
//   - JSON shape parsability + stable key order.

import { describe, it, expect } from 'vitest';
import { classify } from '../../src/classify.js';
import { formatExplain, getExcerptKey, readExcerpt } from '../../src/format/explain.js';

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('formatExplain() — input validation', () => {
  it('throws TypeError on null result', () => {
    // @ts-expect-error — null is not a ClassifyResult.
    expect(() => formatExplain(null, { locale: 'en', format: 'markdown', withExcerpt: false })).toThrow(TypeError);
  });

  it('throws TypeError on invalid locale', async () => {
    const r = await classify('We use AI for CV screening.');
    // @ts-expect-error — 'fr' is not a valid locale.
    expect(() => formatExplain(r, { locale: 'fr', format: 'markdown', withExcerpt: false })).toThrow(TypeError);
  });

  it('throws TypeError on invalid format', async () => {
    const r = await classify('We use AI for CV screening.');
    // @ts-expect-error — 'yaml' is not a valid format.
    expect(() => formatExplain(r, { locale: 'en', format: 'yaml', withExcerpt: false })).toThrow(TypeError);
  });

  it('throws TypeError on null opts', async () => {
    const r = await classify('We use AI for CV screening.');
    // @ts-expect-error — null is not a valid opts object.
    expect(() => formatExplain(r, null)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// Fixture-level snapshot tests
// ---------------------------------------------------------------------------

// Canonical inputs that exercise the lexicon (taken from test/fixtures/use-cases/day7/).
const INPUT_ANNEX_III_EMPLOYMENT_EN =
  'Our AI tool screens CVs and ranks job applicants based on resume content and predicted job-fit scores; HR teams use the candidate ranking for hiring decisions.';
const INPUT_ANNEX_III_LAW_ENFORCEMENT_EN =
  'Our AI system supports law enforcement interviews by acting as a polygraph and analyzing micro-expressions and voice features for truthfulness assessment.';
const INPUT_ART5_PREDICTIVE_POLICING_DE =
  'Eine Polizeibehörde nutzt unser KI-System für vorhersagende Polizeiarbeit und Kriminalrisiko-Profiling, das ausschließlich auf Profiling der natürlichen Person basiert, um das Risiko künftiger Straftaten zu prognostizieren.';
const INPUT_ART5_PROFILING_PROHIBITED_EN =
  'A predictive policing profiling tool based solely on profiling of natural persons to forecast risk of criminal offences.';
const INPUT_ART5_PREDICTIVE_POLICING_NO_DISAMBIGUATOR_DE =
  'Eine Polizeibehörde nutzt unser KI-System für vorhersagende Polizeiarbeit und Kriminalrisiko-Profiling, um Risikobewertungen für Straftaten basierend auf Vorstrafen, Aufenthaltsort und Vorfällen zu erstellen.';
const INPUT_ART50_DEEPFAKE_EN =
  'Our marketing agency uses an AI system to produce deepfake political-commentary videos for distribution on social-media — the deep fake content includes face swap of public figures.';
const INPUT_ANNEX_III_BIOMETRIC_DE =
  'Unser KI-System nutzt biometrische Kategorisierung an Gesichtsbildern, um Personen in Altersgruppen für die Marketing-Analyse einzuordnen.';
const INPUT_NEGATIVE_EN =
  'A simple weather forecast model that returns rainfall probabilities for the next 24 hours based on satellite data.';

describe('formatExplain() — high-risk Annex III ¶4 single fixture', () => {
  it('markdown EN snapshot', async () => {
    const r = await classify(INPUT_ANNEX_III_EMPLOYMENT_EN, { lang: 'en' });
    expect(r.annex_iii.high_risk).toBe(true);
    const out = formatExplain(r, { locale: 'en', format: 'markdown', withExcerpt: false });
    expect(out).toMatchSnapshot();
  });

  it('text EN snapshot', async () => {
    const r = await classify(INPUT_ANNEX_III_EMPLOYMENT_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'text', withExcerpt: false });
    expect(out).toMatchSnapshot();
  });

  it('json EN snapshot', async () => {
    const r = await classify(INPUT_ANNEX_III_EMPLOYMENT_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'json', withExcerpt: false });
    expect(out).toMatchSnapshot();
  });

  it('json is parsable as JSON and carries header + fired keys', async () => {
    const r = await classify(INPUT_ANNEX_III_EMPLOYMENT_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out);
    expect(parsed.header).toBeDefined();
    expect(parsed.header.detected_lang).toBe('en');
    expect(parsed.header.rules_version).toMatch(/^v/);
    expect(Array.isArray(parsed.fired)).toBe(true);
    expect(Array.isArray(parsed.nearest_miss)).toBe(true);
    expect(parsed.disclaimer).toMatch(/legal advice/i);
  });
});

describe('formatExplain() — Article 5 prohibited fixture (predictive policing)', () => {
  it('markdown DE snapshot — Art 5(1)(d) fires (canonical DE fixture)', async () => {
    const r = await classify(INPUT_ART5_PREDICTIVE_POLICING_DE, { lang: 'de' });
    expect(r.article_5.prohibited).toBe(true);
    const out = formatExplain(r, { locale: 'de', format: 'markdown', withExcerpt: false });
    expect(out).toMatchSnapshot();
  });

  it('json DE — fired includes article_5_d', async () => {
    const r = await classify(INPUT_ART5_PREDICTIVE_POLICING_DE, { lang: 'de' });
    const out = formatExplain(r, { locale: 'de', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out);
    const firedIds: string[] = parsed.fired.map((f: { id: string }) => f.id);
    expect(firedIds).toContain('article_5_d');
  });

  it('json EN — Article 5(1)(d) also fires when input is in English with disambiguator', async () => {
    const r = await classify(INPUT_ART5_PROFILING_PROHIBITED_EN, { lang: 'en' });
    expect(r.article_5.prohibited).toBe(true);
    const out = formatExplain(r, { locale: 'en', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out);
    const firedIds: string[] = parsed.fired.map((f: { id: string }) => f.id);
    expect(firedIds).toContain('article_5_d');
  });
});

describe('formatExplain() — Article 50 transparency fixture', () => {
  it('markdown EN snapshot — deepfake content', async () => {
    const r = await classify(INPUT_ART50_DEEPFAKE_EN, { lang: 'en' });
    expect(r.article_50.applicable).toBe(true);
    const out = formatExplain(r, { locale: 'en', format: 'markdown', withExcerpt: false });
    expect(out).toMatchSnapshot();
  });

  it('json EN — fired includes an article_50_* paragraph', async () => {
    const r = await classify(INPUT_ART50_DEEPFAKE_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out);
    const firedIds: string[] = parsed.fired.map((f: { id: string }) => f.id);
    expect(firedIds.some((id) => id.startsWith('article_50_'))).toBe(true);
  });
});

describe('formatExplain() — multi sub-letter Annex III fixture', () => {
  it('json EN — Annex III ¶6 polygraph use case fires with sub-letter narrowing', async () => {
    const r = await classify(INPUT_ANNEX_III_LAW_ENFORCEMENT_EN, { lang: 'en' });
    expect(r.annex_iii.high_risk).toBe(true);
    const out = formatExplain(r, { locale: 'en', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out);
    const firedIds: string[] = parsed.fired.map((f: { id: string }) => f.id);
    expect(firedIds).toContain('annex_iii_6');
  });
});

describe('formatExplain() — negative fixture', () => {
  it('markdown EN — emits "no obligation triggered" message', async () => {
    const r = await classify(INPUT_NEGATIVE_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'markdown', withExcerpt: false });
    expect(out).toContain('No prohibition, high-risk, or transparency obligation triggered.');
  });

  it('json EN — fired array is empty', async () => {
    const r = await classify(INPUT_NEGATIVE_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out);
    expect(parsed.fired).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Locale switching
// ---------------------------------------------------------------------------

describe('formatExplain() — locale switching', () => {
  it('DE locale → DE labels in markdown output', async () => {
    const r = await classify(INPUT_ANNEX_III_BIOMETRIC_DE, { lang: 'de' });
    const out = formatExplain(r, { locale: 'de', format: 'markdown', withExcerpt: false });
    expect(out).toContain('Begründung');
    expect(out).toMatch(/Anhang III|Artikel/);
  });

  it('DE locale → DE labels in text output', async () => {
    const r = await classify(INPUT_ANNEX_III_BIOMETRIC_DE, { lang: 'de' });
    const out = formatExplain(r, { locale: 'de', format: 'text', withExcerpt: false });
    expect(out).toContain('Sprache');
    expect(out).toContain('Modus');
  });

  it('EN locale → EN labels in markdown output', async () => {
    const r = await classify(INPUT_ANNEX_III_EMPLOYMENT_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'markdown', withExcerpt: false });
    expect(out).toContain('reasoning trace');
    expect(out).toContain('Citation');
  });
});

// ---------------------------------------------------------------------------
// Nearest-miss reasoning
// ---------------------------------------------------------------------------

describe('formatExplain() — nearest-miss reasoning', () => {
  it('surfaces "cascade suppressed by Article 5" miss on prohibition', async () => {
    // Use the DE fixture (Art 5(1)(d) prohibition fires) so the cascade is
    // suppressed and we surface the miss with the "suppressed by Article 5"
    // rationale.
    const r = await classify(INPUT_ART5_PREDICTIVE_POLICING_DE, { lang: 'de' });
    expect(r.annex_iii.suppressed_by_article_5).toBe(true);
    const out = formatExplain(r, { locale: 'en', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out);
    const missIds: string[] = parsed.nearest_miss.map((m: { id: string }) => m.id);
    expect(missIds).toContain('cascade_suppressed_by_article_5');
  });
});

// ---------------------------------------------------------------------------
// Disambiguator-state surfacing
// ---------------------------------------------------------------------------

describe('formatExplain() — Art 5(1)(d) disambiguator state', () => {
  it('DE: surfaces NOT-fired disambiguator when lexicon hits predictive policing but no "ausschließlich" substring', async () => {
    // Predictive policing lexicon will fire but Art 5(1)(d) disambiguator won't
    // (no "ausschließlich auf Profiling" qualifier). Classification falls back
    // to Annex III ¶6.
    const r = await classify(INPUT_ART5_PREDICTIVE_POLICING_NO_DISAMBIGUATOR_DE, { lang: 'de' });
    expect(r.article_5.prohibited).toBe(false);
    const out = formatExplain(r, { locale: 'de', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out);
    expect(parsed.disambiguator).not.toBeNull();
    expect(parsed.disambiguator.id).toBe('article_5_d');
    expect(parsed.disambiguator.fired).toBe(false);
    expect(parsed.disambiguator.rationale).toMatch(/ausschließlich|Profiling/i);
  });

  it('DE: surfaces FIRED disambiguator when input has "ausschließlich auf Profiling"', async () => {
    const r = await classify(INPUT_ART5_PREDICTIVE_POLICING_DE, { lang: 'de' });
    expect(r.article_5.prohibited).toBe(true);
    const out = formatExplain(r, { locale: 'de', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out);
    expect(parsed.disambiguator).not.toBeNull();
    expect(parsed.disambiguator.fired).toBe(true);
  });

  it('EN: surfaces FIRED disambiguator when input has "solely on profiling"', async () => {
    const r = await classify(INPUT_ART5_PROFILING_PROHIBITED_EN, { lang: 'en' });
    expect(r.article_5.prohibited).toBe(true);
    const out = formatExplain(r, { locale: 'en', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out);
    expect(parsed.disambiguator).not.toBeNull();
    expect(parsed.disambiguator.fired).toBe(true);
    expect(parsed.disambiguator.rationale).toMatch(/solely on profiling/i);
  });

  it('returns null disambiguator when input does NOT touch predictive policing', async () => {
    const r = await classify(INPUT_NEGATIVE_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out);
    expect(parsed.disambiguator).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// --with-excerpt behavior (graceful when files exist or missing)
// ---------------------------------------------------------------------------

describe('formatExplain() — --with-excerpt', () => {
  it('appends excerpt block when file exists (annex-iii-4-employment for an Annex III ¶4 fire)', async () => {
    const r = await classify(INPUT_ANNEX_III_EMPLOYMENT_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'markdown', withExcerpt: true });
    // The Annex III ¶4 fire has excerpt_key 'annex-iii-4-employment'. The
    // excerpt file is shipped in src/content/blog-excerpts/ — when present, the
    // markdown output should include the commentary section.
    expect(out).toMatch(/commentary|Lucairn/);
  });

  it('omits excerpt block gracefully when no file exists for fired article', async () => {
    // Annex III ¶1 (biometric categorisation) maps to no curated excerpt — the
    // output should render fine without an excerpt section.
    const r = await classify(INPUT_ANNEX_III_BIOMETRIC_DE, { lang: 'de' });
    expect(() => formatExplain(r, { locale: 'de', format: 'markdown', withExcerpt: true })).not.toThrow();
  });

  it('does NOT append excerpts when --with-excerpt is false', async () => {
    const r = await classify(INPUT_ANNEX_III_EMPLOYMENT_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'markdown', withExcerpt: false });
    expect(out).not.toMatch(/Lucairn commentary|Lucairn-Kommentar/);
  });

  it('json excerpts array is omitted entirely when withExcerpt is false', async () => {
    const r = await classify(INPUT_ANNEX_III_EMPLOYMENT_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out);
    expect(parsed.excerpts).toBeUndefined();
  });

  it('json excerpts array is present (possibly empty) when withExcerpt is true', async () => {
    const r = await classify(INPUT_ANNEX_III_EMPLOYMENT_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'json', withExcerpt: true });
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed.excerpts)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Disclaimer footer (always present)
// ---------------------------------------------------------------------------

describe('formatExplain() — disclaimer footer', () => {
  it('always present in markdown output', async () => {
    const r = await classify(INPUT_ANNEX_III_EMPLOYMENT_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'markdown', withExcerpt: false });
    expect(out).toMatch(/not legal advice|Informational tool/i);
  });

  it('always present in text output', async () => {
    const r = await classify(INPUT_ANNEX_III_EMPLOYMENT_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'text', withExcerpt: false });
    expect(out).toMatch(/not legal advice|Informational tool/i);
  });

  it('always present in json output (disclaimer field)', async () => {
    const r = await classify(INPUT_ANNEX_III_EMPLOYMENT_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out);
    expect(parsed.disclaimer).toMatch(/not legal advice|Informational tool/i);
  });
});

// ---------------------------------------------------------------------------
// Excerpt-key mapping (pure function)
// ---------------------------------------------------------------------------

describe('getExcerptKey() — mapping for known fired-article IDs', () => {
  it('maps article_5_d → predictive-policing key', () => {
    expect(getExcerptKey('article_5_d')).toBe('article-5-1-d-predictive-policing');
  });

  it('maps annex_iii_4 → employment key', () => {
    expect(getExcerptKey('annex_iii_4')).toBe('annex-iii-4-employment');
  });

  it('maps annex_iii_6 → law-enforcement key', () => {
    expect(getExcerptKey('annex_iii_6')).toBe('annex-iii-6-law-enforcement');
  });

  it('maps article_10 → data-governance key', () => {
    expect(getExcerptKey('article_10')).toBe('article-10-data-governance');
  });

  it('maps article_50 → transparency key', () => {
    expect(getExcerptKey('article_50')).toBe('article-50-transparency');
  });

  it('maps article_50_4a → transparency key (all 50(*) paragraphs share)', () => {
    expect(getExcerptKey('article_50_4a')).toBe('article-50-transparency');
  });

  it('returns null for unmapped fired-article IDs', () => {
    expect(getExcerptKey('article_5_a')).toBeNull();
    expect(getExcerptKey('annex_iii_2')).toBeNull();
    expect(getExcerptKey('article_12')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readExcerpt() — graceful misses
// ---------------------------------------------------------------------------

describe('readExcerpt() — graceful behavior', () => {
  it('returns null for non-existent excerpt key', () => {
    const result = readExcerpt('definitely-not-a-real-excerpt-key-xyz', 'en');
    expect(result).toBeNull();
  });

  it('returns null for invalid locale (no file matches)', () => {
    // @ts-expect-error — 'fr' is intentionally invalid.
    const result = readExcerpt('article-50-transparency', 'fr');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FX4 chapeau correctness — closes bug-hunter M1 (Day-11 PR #11 fix-up r1)
// ---------------------------------------------------------------------------

describe('formatExplain() — Annex IV chapeau correctness (bug-hunter M1)', () => {
  it('EN: Annex IV section renders verbatim EUR-Lex chapeau in the chapeau slot, not the cascade rationale', async () => {
    const r = await classify(INPUT_ANNEX_III_EMPLOYMENT_EN, { lang: 'en' });
    expect(r.annex_iv_required).toBe(true);
    const out = formatExplain(r, { locale: 'en', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out) as { fired: ReadonlyArray<{ id: string; chapeau: string; rationale: string }> };
    const annexIv = parsed.fired.find((f) => f.id === 'annex_iv');
    expect(annexIv).toBeDefined();
    if (annexIv === undefined) throw new Error('annex_iv fire missing');
    // Verbatim EUR-Lex Annex IV preamble must appear in the chapeau slot.
    expect(annexIv.chapeau).toMatch(/technical documentation referred to in Article 11\(1\) shall contain/);
    // The cascade rationale must NOT appear in the chapeau slot.
    expect(annexIv.chapeau).not.toMatch(/High-risk cascade: fires because/);
    // The rationale slot carries the classifier-internal reason.
    expect(annexIv.rationale).toMatch(/Article 11\(1\)|high-risk/);
  });

  it('DE: Annex IV section renders verbatim EUR-Lex chapeau in DE locale', async () => {
    const r = await classify(INPUT_ANNEX_III_BIOMETRIC_DE, { lang: 'de' });
    expect(r.annex_iv_required).toBe(true);
    const out = formatExplain(r, { locale: 'de', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out) as { fired: ReadonlyArray<{ id: string; chapeau: string; rationale: string }> };
    const annexIv = parsed.fired.find((f) => f.id === 'annex_iv');
    expect(annexIv).toBeDefined();
    if (annexIv === undefined) throw new Error('annex_iv fire missing');
    expect(annexIv.chapeau).toMatch(/Die in Artikel 11 Absatz 1 genannte technische Dokumentation/);
    expect(annexIv.chapeau).not.toMatch(/Hochrisiko-Kaskade: feuert/);
  });

  it('markdown renders the Annex IV chapeau inside a blockquote (DPIA-paste-friendly)', async () => {
    const r = await classify(INPUT_ANNEX_III_EMPLOYMENT_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'markdown', withExcerpt: false });
    // The chapeau quote must appear directly under the Annex IV heading,
    // prefixed with the markdown blockquote marker.
    expect(out).toMatch(/### Annex IV — Technical documentation[\s\S]*?\n> The technical documentation referred to in Article 11\(1\) shall contain/);
  });
});

describe('formatExplain() — Annex III chapeau correctness (bug-hunter M1)', () => {
  it('EN: Annex III ¶4 section renders verbatim chapeau from i18n (not the title)', async () => {
    const r = await classify(INPUT_ANNEX_III_EMPLOYMENT_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out) as { fired: ReadonlyArray<{ id: string; chapeau: string }> };
    const a4 = parsed.fired.find((f) => f.id === 'annex_iii_4');
    expect(a4).toBeDefined();
    if (a4 === undefined) throw new Error('annex_iii_4 fire missing');
    // Verbatim EUR-Lex ¶4 chapeau ends with a colon (lead-in to sub-letters).
    expect(a4.chapeau).toBe("Employment, workers' management and access to self-employment:");
    // The paragraph title alone (without the colon) was the pre-fix-up output;
    // ensure we no longer emit just the bare title.
    expect(a4.chapeau).not.toBe("Employment, workers' management and access to self-employment");
  });

  it('EN: Annex III ¶6 chapeau carries the "in so far as ... permitted" carve-out wording', async () => {
    const r = await classify(INPUT_ANNEX_III_LAW_ENFORCEMENT_EN, { lang: 'en' });
    const out = formatExplain(r, { locale: 'en', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out) as { fired: ReadonlyArray<{ id: string; chapeau: string }> };
    const a6 = parsed.fired.find((f) => f.id === 'annex_iii_6');
    expect(a6).toBeDefined();
    if (a6 === undefined) throw new Error('annex_iii_6 fire missing');
    expect(a6.chapeau).toMatch(/Law enforcement, in so far as their use is permitted/);
  });

  it('DE: Annex III ¶1 chapeau renders verbatim DE EUR-Lex wording', async () => {
    const r = await classify(INPUT_ANNEX_III_BIOMETRIC_DE, { lang: 'de' });
    const out = formatExplain(r, { locale: 'de', format: 'json', withExcerpt: false });
    const parsed = JSON.parse(out) as { fired: ReadonlyArray<{ id: string; chapeau: string }> };
    const a1 = parsed.fired.find((f) => f.id === 'annex_iii_1');
    expect(a1).toBeDefined();
    if (a1 === undefined) throw new Error('annex_iii_1 fire missing');
    expect(a1.chapeau).toMatch(/Biometrie, soweit ihr Einsatz nach einschlägigem Unionsrecht/);
  });
});
