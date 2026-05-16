// `--explain` formatter for ClassifyResult.
//
// Pure function. Renders a reasoning trace + EUR-Lex citation block + optional
// hand-curated commentary excerpt — the "why each article fired" defensibility
// surface the rules-first architecture was built for. Consultants paste the
// markdown form directly into DPIA / audit documents; the JSON form is for
// programmatic consumers; the text form is the lowest-friction terminal default.
//
// Output formats (locked Day 11):
//   - 'markdown' (default) — GitHub-flavoured. Headings for input + per-fired-
//     article + nearest-miss + disambiguator-state + optional excerpt + footer.
//   - 'json' — structured `{header, fired[], nearest_miss[], disambiguator,
//     excerpt?, disclaimer}`. Stable-key-order serialization (snapshot-stable).
//   - 'text' — plain ASCII, no fences, no emoji. Useful when piping through
//     `less` or pasting into a plain-text issue tracker.
//
// What gets emitted per fired article:
//   - Verbatim EUR-Lex chapeau text. For Annex IV the chapeau is the regulation
//     preamble at `i18n/{en,de}.json::annex_iv_chapeau`. For Annex III the
//     chapeau is the per-paragraph lead-in at
//     `i18n/{en,de}.json::annex_iii_chapeaux.<n>` (NOT the paragraph title; the
//     title omits the "in so far as their use is permitted under relevant Union
//     or national law" carve-out wording carried by ¶¶1/6/7's chapeaux).
//     Article-level fires (5/10/12/13/14/15/50) use the rule module's
//     `summary_{en,de}` field (this is the article's operative-clause verbatim).
//   - Which lexicon phrases triggered the hit (from `matched_phrases`).
//   - Which sub-letter narrowed (when applicable) + the narrowing branch's
//     deterministic rationale.
//   - The EUR-Lex citation URL.
//
// What gets emitted per nearest-miss (1-2 max):
//   - "Article X did NOT fire because [reason]" — useful for negative-
//     classification defensibility. Limited to specific actionable misses:
//     Art 5(1)(d) without disambiguator, Annex III with research-only carve-out,
//     Article 10/12/13/14/15 suppressed by Article 5.
//
// Disambiguator-state surfacing:
//   - When the input contains a `d_predictive_policing` lexicon hit but the
//     disambiguator did NOT fire, we surface the rule-module's reasoning trace
//     verbatim so the user sees the "solely on profiling" gap.
//
// Optional blog-excerpt block:
//   - When `opts.withExcerpt === true`, the formatter reads
//     `src/content/blog-excerpts/<key>.<locale>.md` for each fired article and
//     appends the file's contents in a dedicated section. Missing files do NOT
//     error — they are simply omitted. The lookup keys map fired articles to
//     curated excerpt files (see EXCERPT_KEY_MAP below).
//
// Disclaimer footer: always present (matches the other formatters).
//
// Citation discipline (cite-implicit disclosure):
//   - This formatter is a presentation layer; the citation URLs and verbatim
//     chapeau strings it renders come from upstream sources:
//       * Article/Annex citation URLs come from `src/util/citations.ts::getCitation()`
//         which reads `src/data/citations.json` (the EUR-Lex Tier-1 + Future of
//         Life Institute Tier-3 regulation-text mirror URL table).
//       * Verbatim chapeau strings come from `src/i18n/{en,de}.json` keys
//         `annex_iii_chapeaux.<n>` (per-paragraph) and `annex_iv_chapeau`, or
//         from each rule module's `summary_{en,de}` field for article-level fires.
//   - The formatter does NOT fabricate citations or chapeau text. If a fired
//     article has no citation entry, the renderer emits the EUR-Lex regulation
//     root URL as a safe fallback (never an empty `[ … ](url)` link).
//   - When auditing or extending this module, sanity-check that every new
//     emit path goes through `getCitation()` or the i18n chapeau tables;
//     never inline a citation URL or verbatim regulator text.
//
// Locale-driven labels. Pure function — no I/O at module init. The excerpt
// loader reads from disk only when `opts.withExcerpt === true`.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { ClassifyResult } from '../classify.js';
import type { AnnexIIIResult, AnnexIIIDomainHit, Article5Result, Article5Hit, Article50Result } from '../rules/index.js';
import { getCitation, type CitationArticleId } from '../util/citations.js';
import { getLocale } from '../i18n/load.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExplainFormatOptions {
  /** Output locale for labels (en|de). Independent of result.detected_lang. */
  locale: 'en' | 'de';
  /** Output format. Default chosen by the caller; this module accepts all three. */
  format: 'markdown' | 'json' | 'text';
  /** When true, append hand-curated commentary excerpts where available. */
  withExcerpt: boolean;
}

interface FiredArticle {
  /** Stable identifier (e.g. 'article_5_d', 'annex_iii_4', 'article_50_4a'). */
  id: string;
  /** Display heading (e.g. 'Article 5(1)(d) — Predictive policing'). */
  heading: string;
  /** Verbatim EUR-Lex chapeau text (locale-keyed). */
  chapeau: string;
  /** Lexicon phrases that triggered the fire (deduplicated, ordered as matched). */
  matched_phrases: string[];
  /** Sub-letter narrowing rationale (when applicable). */
  sub_letter_rationale: string | null;
  /** One-line "why this paragraph fires" rationale. */
  rationale: string;
  /** EUR-Lex citation URL (Service Desk preferred for the locale; falls back to EUR-Lex root). */
  citation_url: string;
  /** Excerpt-corpus key for the optional commentary block. May be null when no excerpt is curated. */
  excerpt_key: string | null;
}

interface NearestMiss {
  /** Stable identifier (e.g. 'article_5_d_no_disambiguator'). */
  id: string;
  /** Display heading. */
  heading: string;
  /** One-line "did NOT fire because ..." rationale. */
  rationale: string;
}

interface DisambiguatorState {
  /** Article identifier (currently always 'article_5_d'). */
  id: string;
  /** Verbatim reasoning-trace line from `classifyArticle5()` when the disambiguator fired or did not. */
  rationale: string;
  /** True iff the disambiguator was satisfied (Art 5(1)(d) fired). */
  fired: boolean;
}

interface ExplainJsonShape {
  header: {
    input_text: string;
    detected_lang: 'en' | 'de';
    lang_confident: boolean;
    mode: string;
    rules_version: string;
    rules_hash: string;
    confidence: number;
  };
  fired: ReadonlyArray<FiredArticle>;
  nearest_miss: ReadonlyArray<NearestMiss>;
  disambiguator: DisambiguatorState | null;
  excerpts?: ReadonlyArray<{ key: string; locale: 'en' | 'de'; body: string }>;
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Excerpt corpus
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// dist/format/explain.js → ../content/blog-excerpts/
const EXCERPT_DIR = join(__dirname, '..', 'content', 'blog-excerpts');

/**
 * Map a fired article identifier to its hand-curated excerpt file key. Day-11
 * ships 5 keys × 2 locales = 10 files. Articles without a curated excerpt are
 * mapped to null and silently omitted from the excerpt block.
 *
 * @internal
 */
export function getExcerptKey(firedId: string): string | null {
  // Art 5(1)(d) — predictive policing (the disambiguator-bearing branch).
  if (firedId === 'article_5_d') return 'article-5-1-d-predictive-policing';
  // Annex III ¶4 — employment (recruitment + worker monitoring).
  if (firedId === 'annex_iii_4') return 'annex-iii-4-employment';
  // Annex III ¶6 — law enforcement (with the ¶7 polygraph carve-out documented).
  if (firedId === 'annex_iii_6') return 'annex-iii-6-law-enforcement';
  // Article 10 — data governance cascade.
  if (firedId === 'article_10') return 'article-10-data-governance';
  // Article 50 — any of the 5 paragraph fires share the same overview excerpt.
  if (firedId === 'article_50') return 'article-50-transparency';
  if (firedId.startsWith('article_50_')) return 'article-50-transparency';
  return null;
}

/**
 * Read an excerpt file from disk. Returns `null` on miss (file absent),
 * empty-string (file empty), or any read error. Never throws — missing
 * excerpts are silently omitted from the output.
 *
 * @internal
 */
export function readExcerpt(key: string, locale: 'en' | 'de'): string | null {
  const path = join(EXCERPT_DIR, `${key}.${locale}.md`);
  if (!existsSync(path)) return null;
  try {
    const body = readFileSync(path, 'utf8');
    if (body.trim().length === 0) return null;
    return body;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Article-level builders
// ---------------------------------------------------------------------------

function citationUrlForArticle(id: CitationArticleId, locale: 'en' | 'de'): string {
  // v0.1.3 (reviewer-feedback MEDIUM-1): primary "Citation" URL MUST be the
  // EUR-Lex Tier-1 URL (eur_lex_html_{en,de}), NOT the Future of Life
  // Institute Tier-3 mirror (regulation_text_mirror_*). The Tier-3 mirror
  // is preserved in citations.json as a secondary "See also" surface but
  // is not the operative citation a DPIA reviewer should follow.
  //
  // EUR-Lex per-article anchors are inconsistent across page versions (see
  // citations.json `_provenance_notice`), so we use the regulation-level
  // HTML URL with an in-prose paragraph reference rather than fabricating
  // a per-article anchor. PDF URLs are available in citations.json but the
  // HTML form is friendlier for in-CLI / in-Markdown viewing.
  const c = getCitation(id);
  if (locale === 'de') {
    return c.eur_lex_html_de;
  }
  return c.eur_lex_html_en;
}

function buildArticle5Fires(article5: Article5Result, locale: 'en' | 'de'): FiredArticle[] {
  if (!article5.prohibited) return [];
  return article5.hits.map((hit: Article5Hit): FiredArticle => {
    const heading =
      locale === 'de'
        ? `Artikel 5 Abs. 1 Buchst. ${hit.letter} — Verbotene Praxis`
        : `Article 5(1)(${hit.letter}) — Prohibited practice`;
    const chapeau = locale === 'de' ? hit.summary_de : hit.summary_en;
    const phraseList = hit.matched_phrases.map((p) => `"${p}"`).join(', ');
    const rationale =
      locale === 'de'
        ? `Lexikon-Treffer auf "${hit.category_key}" — Artikel 5 Abs. 1 Buchst. ${hit.letter} feuert. Phrasen: ${phraseList}.`
        : `Lexicon hit on "${hit.category_key}" — Article 5(1)(${hit.letter}) fires. Matched phrases: ${phraseList}.`;
    return {
      id: `article_5_${hit.letter}`,
      heading,
      chapeau,
      matched_phrases: [...hit.matched_phrases],
      sub_letter_rationale: null,
      rationale,
      citation_url: citationUrlForArticle('article_5', locale),
      excerpt_key: getExcerptKey(`article_5_${hit.letter}`),
    };
  });
}

function buildAnnexIIIFires(annex: AnnexIIIResult, locale: 'en' | 'de'): FiredArticle[] {
  if (!annex.high_risk || annex.suppressed_by_article_5) return [];
  const localeBundle = getLocale(locale);
  return [...annex.domains]
    .sort((a, b) => a.annex_iii_number - b.annex_iii_number)
    .map((d: AnnexIIIDomainHit): FiredArticle => {
      const title = locale === 'de' ? d.title_de : d.title_en;
      const prefix = locale === 'de' ? 'Anhang III' : 'Annex III';
      const subLetterDisplay =
        d.sub_letters.length > 0
          ? `(${[...d.sub_letters].sort().join(', ')})`
          : '';
      const heading = `${prefix} ¶${d.annex_iii_number}${subLetterDisplay} — ${title}`;
      // The chapeau for Annex III is the verbatim EUR-Lex paragraph lead-in,
      // sourced from i18n/{en,de}.json::annex_iii_chapeaux. The title alone
      // omits the "in so far as their use is permitted under relevant Union or
      // national law" carve-out wording that lives in ¶¶1/6/7 chapeaux —
      // DPIA evidence reviewers need the full verbatim. Defensive fallback to
      // the title for any paragraph number outside 1-8 (data files only carry
      // 1-8 today; the fallback prevents an i18n drift from crashing
      // --explain).
      const chapeauKey = String(d.annex_iii_number) as keyof typeof localeBundle.annex_iii_chapeaux;
      const chapeau = localeBundle.annex_iii_chapeaux[chapeauKey] ?? title;
      const phraseList = d.matched_phrases.map((p) => `"${p}"`).join(', ');
      let subLetterRationale: string | null = null;
      if (d.sub_letters.length > 0) {
        const subs = [...d.sub_letters].sort();
        subLetterRationale =
          locale === 'de'
            ? `Buchstabe(n) ${subs.map((s) => `(${s})`).join(', ')} eingegrenzt aus den Phrasen (via narrowSubLetters() ¶${d.annex_iii_number}-Branch).`
            : `Sub-letter(s) ${subs.map((s) => `(${s})`).join(', ')} narrowed from matched phrases (per narrowSubLetters() ¶${d.annex_iii_number} branch).`;
      }
      const rationale =
        locale === 'de'
          ? `${prefix} ¶${d.annex_iii_number} (${d.key}) feuert. Phrasen: ${phraseList}.`
          : `${prefix} ¶${d.annex_iii_number} (${d.key}) fires. Matched phrases: ${phraseList}.`;
      return {
        id: `annex_iii_${d.annex_iii_number}`,
        heading,
        chapeau,
        matched_phrases: [...d.matched_phrases],
        sub_letter_rationale: subLetterRationale,
        rationale,
        citation_url: citationUrlForArticle('annex_iii', locale),
        excerpt_key: getExcerptKey(`annex_iii_${d.annex_iii_number}`),
      };
    });
}

function buildCascadeFire(
  applicable: boolean,
  citationId: CitationArticleId,
  headingEn: string,
  headingDe: string,
  summaryEn: string,
  summaryDe: string,
  excerptKey: string | null,
  locale: 'en' | 'de',
): FiredArticle | null {
  if (!applicable) return null;
  const rationale =
    locale === 'de'
      ? 'Hochrisiko-Kaskade: feuert weil Annex III hochrisikoreich UND Artikel 5 nicht verboten.'
      : 'High-risk cascade: fires because Annex III high-risk AND Article 5 not prohibited.';
  return {
    id: citationId,
    heading: locale === 'de' ? headingDe : headingEn,
    chapeau: locale === 'de' ? summaryDe : summaryEn,
    matched_phrases: [],
    sub_letter_rationale: null,
    rationale,
    citation_url: citationUrlForArticle(citationId, locale),
    excerpt_key: excerptKey,
  };
}

function buildArticle50Fires(article50: Article50Result, locale: 'en' | 'de'): FiredArticle[] {
  if (!article50.applicable) return [];
  const t = article50.triggered_by;
  const out: FiredArticle[] = [];
  // Walk in legislative order. Each paragraph that fired emits one FiredArticle.
  const PARAGRAPHS: ReadonlyArray<{
    key: keyof typeof t;
    id: string;
    en: string;
    de: string;
  }> = [
    {
      key: 'paragraph_1_interaction',
      id: 'article_50_1',
      en: 'Article 50(1) — Direct interaction with natural persons',
      de: 'Artikel 50 Abs. 1 — Direkte Interaktion mit natürlichen Personen',
    },
    {
      key: 'paragraph_2_synthetic_content',
      id: 'article_50_2',
      en: 'Article 50(2) — Synthetic content marking',
      de: 'Artikel 50 Abs. 2 — Kennzeichnung synthetischer Inhalte',
    },
    {
      key: 'paragraph_3_emotion_or_biometric_categorisation',
      id: 'article_50_3',
      en: 'Article 50(3) — Emotion recognition / biometric categorisation deployer disclosure',
      de: 'Artikel 50 Abs. 3 — Offenlegung durch Betreiber von Emotionserkennungs- / biometrischen Kategorisierungssystemen',
    },
    {
      key: 'paragraph_4_deepfake',
      id: 'article_50_4a',
      en: 'Article 50(4) sub-paragraph 1 — Deep fake disclosure',
      de: 'Artikel 50 Abs. 4 Unterabsatz 1 — Offenlegung von Deepfakes',
    },
    {
      key: 'paragraph_4_public_interest_text',
      id: 'article_50_4b',
      en: 'Article 50(4) sub-paragraph 2 — Public-interest text disclosure',
      de: 'Artikel 50 Abs. 4 Unterabsatz 2 — Offenlegung KI-erzeugter Texte von öffentlichem Interesse',
    },
  ];
  for (const p of PARAGRAPHS) {
    if (!t[p.key]) continue;
    const rationale =
      locale === 'de'
        ? `Lexikon-Treffer im article_50_gpai-Korpus → ${p.de} feuert.`
        : `Lexicon hit in the article_50_gpai corpus → ${p.en} fires.`;
    out.push({
      id: p.id,
      heading: locale === 'de' ? p.de : p.en,
      chapeau: '',
      matched_phrases: [],
      sub_letter_rationale: null,
      rationale,
      citation_url: citationUrlForArticle('article_50', locale),
      excerpt_key: getExcerptKey('article_50'),
    });
  }
  // The summary_{en,de} on Article50Result carries the verbatim chapeau text
  // concatenated for the fired paragraphs in legislative order. Put it on the
  // FIRST fired paragraph so it appears once per classification.
  const first = out[0];
  if (first !== undefined) {
    first.chapeau = locale === 'de' ? article50.summary_de : article50.summary_en;
  }
  return out;
}

function buildFiredArticles(result: ClassifyResult, locale: 'en' | 'de'): FiredArticle[] {
  const out: FiredArticle[] = [];
  // Article 5 first (prohibition wins).
  out.push(...buildArticle5Fires(result.article_5, locale));
  // Annex III high-risk paragraphs (only when not suppressed).
  out.push(...buildAnnexIIIFires(result.annex_iii, locale));
  // Cascade articles (10/12/13/14/15) — Article 13 included.
  const art10 = buildCascadeFire(
    result.article_10.applicable,
    'article_10',
    'Article 10 — Data and data governance',
    'Artikel 10 — Daten und Daten-Governance',
    result.article_10.summary_en,
    result.article_10.summary_de,
    getExcerptKey('article_10'),
    locale,
  );
  if (art10 !== null) out.push(art10);
  const art12 = buildCascadeFire(
    result.article_12.applicable,
    'article_12',
    'Article 12 — Record-keeping',
    'Artikel 12 — Aufzeichnungspflichten',
    result.article_12.summary_en,
    result.article_12.summary_de,
    null,
    locale,
  );
  if (art12 !== null) out.push(art12);
  const art13 = buildCascadeFire(
    result.article_13.applicable,
    'article_13',
    'Article 13 — Transparency and information for deployers',
    'Artikel 13 — Transparenz und Bereitstellung von Informationen für die Betreiber',
    result.article_13.summary_en,
    result.article_13.summary_de,
    null,
    locale,
  );
  if (art13 !== null) out.push(art13);
  const art14 = buildCascadeFire(
    result.article_14.applicable,
    'article_14',
    'Article 14 — Human oversight',
    'Artikel 14 — Menschliche Aufsicht',
    result.article_14.summary_en,
    result.article_14.summary_de,
    null,
    locale,
  );
  if (art14 !== null) out.push(art14);
  const art15 = buildCascadeFire(
    result.article_15.applicable,
    'article_15',
    'Article 15 — Accuracy, robustness and cybersecurity',
    'Artikel 15 — Genauigkeit, Robustheit und Cybersicherheit',
    result.article_15.summary_en,
    result.article_15.summary_de,
    null,
    locale,
  );
  if (art15 !== null) out.push(art15);
  // Article 50 paragraphs (independent root).
  out.push(...buildArticle50Fires(result.article_50, locale));
  // Annex IV — derived; emit a single fire when required.
  if (result.annex_iv_required) {
    // The chapeau slot must carry the VERBATIM EUR-Lex Annex IV preamble (the
    // "shall contain at least the following information" lead-in sentence)
    // — that's the audit-evidence-grade quote a DPIA reviewer expects to see
    // beneath the "Annex IV" heading. The rationale slot carries the
    // classifier-internal reason ("this fires because the system is
    // high-risk"). Before Day-11 fix-up these two were swapped: the chapeau
    // slot rendered the cascade-rationale, and the rationale slot rendered the
    // Article 11(1) reference — which made the markdown output unusable for
    // pasting into DPIA evidence sections.
    const av = getLocale(locale);
    out.push({
      id: 'annex_iv',
      heading:
        locale === 'de'
          ? 'Anhang IV — Technische Dokumentation'
          : 'Annex IV — Technical documentation',
      chapeau: av.annex_iv_chapeau,
      matched_phrases: [],
      sub_letter_rationale: null,
      rationale:
        locale === 'de'
          ? 'Hochrisiko-Kaskade: Anhang IV technische Dokumentation ist gemäß Artikel 11 Abs. 1 für jedes als Hochrisiko klassifizierte System erforderlich.'
          : 'High-risk cascade: Annex IV technical documentation is required for every system classified as high-risk under Article 11(1).',
      citation_url: citationUrlForArticle('annex_iv', locale),
      excerpt_key: null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Nearest-miss builders + disambiguator state
// ---------------------------------------------------------------------------

/**
 * Detect the Art 5(1)(d) disambiguator state.
 *
 * Returns a DisambiguatorState whenever the input has a `d_predictive_policing`
 * lexicon hit, regardless of whether the disambiguator actually fired. The
 * `fired` boolean disambiguates the two states. Returns null when the input
 * doesn't touch predictive-policing at all (nothing to surface).
 */
function buildDisambiguator(result: ClassifyResult, locale: 'en' | 'de'): DisambiguatorState | null {
  const a5p = result.features.byCategory.article_5_prohibited;
  if (a5p === undefined) return null;
  const matched = a5p['d_predictive_policing'];
  if (matched === undefined || matched.length === 0) return null;
  const fired = result.article_5.hits.some((h) => h.letter === 'd');
  const rationale = fired
    ? locale === 'de'
      ? 'Disambiguator erfüllt: Eingabe enthält "ausschließlich auf Profiling" oder gleichwertige Phrase. Artikel 5 Abs. 1 Buchst. d feuert.'
      : 'Disambiguator satisfied: input contains "solely on profiling" or equivalent phrase. Article 5(1)(d) fires.'
    : locale === 'de'
      ? 'Disambiguator NICHT erfüllt: Eingabe enthält keine "ausschließlich auf Profiling"-Phrase. Gemäß Art. 5 Abs. 1 Buchst. d gilt das Verbot nur, wenn die Risikobewertung AUSSCHLIESSLICH auf Profiling beruht. Klassifizierung fällt zurück auf Anhang III ¶6 Hochrisiko (nicht verboten).'
      : 'Disambiguator NOT satisfied: input lacks a "solely on profiling" / "ausschließlich auf Profiling" phrase. Per Art 5(1)(d), the prohibition only applies to risk assessment based SOLELY on profiling. Classification falls back to Annex III ¶6 high-risk (not prohibited).';
  return { id: 'article_5_d', rationale, fired };
}

function buildNearestMisses(result: ClassifyResult, locale: 'en' | 'de'): NearestMiss[] {
  const out: NearestMiss[] = [];
  // Miss 1: research-only carve-out present, high-risk landed.
  const scopeQualifiers = result.features.byCategory.scope_qualifiers ?? {};
  const researchOnly = scopeQualifiers['research_only'];
  if (researchOnly !== undefined && researchOnly.length > 0 && result.annex_iii.high_risk) {
    // The classifyAnnexIII() reasoning trace covers both branches (research-only
    // with-real-world-conditions and without). Surface the rationale that
    // applies here: if real-world conditions are present, the carve-out is
    // blocked (high-risk stands); else the carve-out MAY apply but we still
    // surfaced high-risk because the classifier defaults to surfacing the hit
    // for transparency.
    const reasoning = result.annex_iii.reasoning;
    const carveOutLine = reasoning.find((r) => r.toLowerCase().includes('research') || r.toLowerCase().includes('art 2(8)'));
    if (carveOutLine !== undefined) {
      out.push({
        id: 'annex_iii_research_only_carve_out',
        heading:
          locale === 'de'
            ? 'Mögliche Art. 2 Abs. 8 Forschungs-Ausnahme'
            : 'Possible Art 2(8) research-only carve-out',
        rationale: carveOutLine,
      });
    }
  }
  // Miss 2: cascade articles suppressed by Article 5.
  if (result.annex_iii.suppressed_by_article_5) {
    out.push({
      id: 'cascade_suppressed_by_article_5',
      heading:
        locale === 'de'
          ? 'Hochrisiko-Kaskade durch Artikel 5 unterdrückt'
          : 'High-risk cascade suppressed by Article 5',
      rationale:
        locale === 'de'
          ? 'Artikel 10/12/13/14/15 sind nicht aktiv: Eine verbotene Praxis nach Artikel 5 darf nicht in Verkehr gebracht werden, weshalb die Hochrisiko-Pflichten nach Artikel 6 entfallen.'
          : 'Articles 10/12/13/14/15 are not active: a system prohibited under Article 5 cannot be placed on the market, so the Article 6 high-risk obligations do not apply.',
    });
  }
  // Limit to 2 misses max.
  return out.slice(0, 2);
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

function toJsonShape(result: ClassifyResult, opts: ExplainFormatOptions): ExplainJsonShape {
  const fired = buildFiredArticles(result, opts.locale);
  const nearestMiss = buildNearestMisses(result, opts.locale);
  const disambiguator = buildDisambiguator(result, opts.locale);
  const disclaimer = getLocale(opts.locale).labels.disclaimer_footer;
  const shape: ExplainJsonShape = {
    header: {
      input_text: result.input_text,
      detected_lang: result.detected_lang,
      lang_confident: result.lang_confident,
      mode: result.mode,
      rules_version: result.rules_version,
      rules_hash: result.rules_hash,
      confidence: result.confidence,
    },
    fired,
    nearest_miss: nearestMiss,
    disambiguator,
    disclaimer,
  };
  if (opts.withExcerpt) {
    const excerpts: Array<{ key: string; locale: 'en' | 'de'; body: string }> = [];
    const seen = new Set<string>();
    for (const f of fired) {
      if (f.excerpt_key === null) continue;
      if (seen.has(f.excerpt_key)) continue;
      const body = readExcerpt(f.excerpt_key, opts.locale);
      if (body === null) continue;
      excerpts.push({ key: f.excerpt_key, locale: opts.locale, body });
      seen.add(f.excerpt_key);
    }
    shape.excerpts = excerpts;
  }
  return shape;
}

function renderJson(shape: ExplainJsonShape): string {
  return JSON.stringify(shape, null, 2);
}

// ---------------------------------------------------------------------------
// Markdown output
// ---------------------------------------------------------------------------

function renderMarkdown(result: ClassifyResult, opts: ExplainFormatOptions, shape: ExplainJsonShape): string {
  const lines: string[] = [];
  const labels = getLocale(opts.locale).labels;
  const sectionTitle =
    opts.locale === 'de'
      ? 'EU-KI-VO Klassifizierungs-Begründung'
      : 'EU AI Act classification — reasoning trace';
  lines.push(`## ${sectionTitle}`);
  lines.push('');
  // Header table
  const inputLabel = opts.locale === 'de' ? 'Eingabe' : 'Input';
  const langLabel = opts.locale === 'de' ? 'Sprache' : 'Language';
  const langConfidentSuffix = shape.header.lang_confident
    ? (opts.locale === 'de' ? ' (sicher)' : ' (confident)')
    : (opts.locale === 'de' ? ' (unsicher)' : ' (uncertain)');
  lines.push(`**${inputLabel}:** \`${shape.header.input_text}\``);
  lines.push('');
  lines.push(
    `**${langLabel}:** ${shape.header.detected_lang}${langConfidentSuffix} · ` +
      `**${labels.label_mode}:** ${shape.header.mode} · ` +
      `**${labels.label_rules}:** ${shape.header.rules_version} (sha256:${shape.header.rules_hash}…) · ` +
      `**${labels.label_confidence}:** ${shape.header.confidence.toFixed(2)}`,
  );
  // Fired articles
  if (shape.fired.length === 0) {
    const negLine =
      opts.locale === 'de'
        ? 'Keine Verbots-, Hochrisiko- oder Transparenz-Pflicht ausgelöst.'
        : 'No prohibition, high-risk, or transparency obligation triggered.';
    lines.push('');
    lines.push(`> ${negLine}`);
  } else {
    for (const f of shape.fired) {
      lines.push('');
      lines.push(`### ${f.heading}`);
      lines.push('');
      if (f.chapeau.length > 0) {
        lines.push(`> ${f.chapeau}`);
        lines.push('');
      }
      lines.push(`- ${f.rationale}`);
      if (f.sub_letter_rationale !== null) {
        lines.push(`- ${f.sub_letter_rationale}`);
      }
      const citeLabel = opts.locale === 'de' ? 'Zitat' : 'Citation';
      lines.push(`- **${citeLabel}:** ${f.citation_url}`);
    }
  }
  // Nearest misses
  if (shape.nearest_miss.length > 0) {
    lines.push('');
    const nmTitle =
      opts.locale === 'de'
        ? 'Nicht ausgelöste, aber relevante Artikel'
        : 'Articles considered but not fired';
    lines.push(`### ${nmTitle}`);
    lines.push('');
    for (const nm of shape.nearest_miss) {
      lines.push(`- **${nm.heading}** — ${nm.rationale}`);
    }
  }
  // Disambiguator state (Art 5(1)(d))
  if (shape.disambiguator !== null) {
    lines.push('');
    const dTitle =
      opts.locale === 'de'
        ? 'Disambiguator-Zustand — Art. 5 Abs. 1 Buchst. d'
        : 'Disambiguator state — Art 5(1)(d)';
    lines.push(`### ${dTitle}`);
    lines.push('');
    lines.push(`- ${shape.disambiguator.rationale}`);
  }
  // Excerpts
  if (shape.excerpts !== undefined && shape.excerpts.length > 0) {
    lines.push('');
    const exTitle =
      opts.locale === 'de'
        ? 'Lucairn-Kommentar (Auszüge)'
        : 'Lucairn commentary (excerpts)';
    lines.push(`### ${exTitle}`);
    lines.push('');
    for (const ex of shape.excerpts) {
      lines.push('---');
      lines.push('');
      lines.push(ex.body.trimEnd());
      lines.push('');
    }
  }
  // Disclaimer footer
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`> ${shape.disclaimer}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Plain-text output
// ---------------------------------------------------------------------------

function renderText(opts: ExplainFormatOptions, shape: ExplainJsonShape): string {
  const lines: string[] = [];
  const sectionTitle =
    opts.locale === 'de'
      ? 'EU-KI-VO Klassifizierungs-Begründung'
      : 'EU AI Act classification reasoning trace';
  lines.push(sectionTitle);
  lines.push('='.repeat(sectionTitle.length));
  lines.push('');
  const inputLabel = opts.locale === 'de' ? 'Eingabe' : 'Input';
  lines.push(`${inputLabel}: ${shape.header.input_text}`);
  const langLabel = opts.locale === 'de' ? 'Sprache' : 'Language';
  const modeLabel = opts.locale === 'de' ? 'Modus' : 'Mode';
  const rulesLabel = opts.locale === 'de' ? 'Regeln' : 'Rules';
  const confLabel = opts.locale === 'de' ? 'Konfidenz' : 'Confidence';
  lines.push(
    `${langLabel}: ${shape.header.detected_lang} · ${modeLabel}: ${shape.header.mode} · ` +
      `${rulesLabel}: ${shape.header.rules_version} (sha256:${shape.header.rules_hash}...) · ` +
      `${confLabel}: ${shape.header.confidence.toFixed(2)}`,
  );
  if (shape.fired.length === 0) {
    lines.push('');
    lines.push(
      opts.locale === 'de'
        ? 'Keine Verbots-, Hochrisiko- oder Transparenz-Pflicht ausgelöst.'
        : 'No prohibition, high-risk, or transparency obligation triggered.',
    );
  } else {
    for (const f of shape.fired) {
      lines.push('');
      lines.push(`-- ${f.heading} --`);
      if (f.chapeau.length > 0) {
        lines.push(f.chapeau);
      }
      lines.push(`* ${f.rationale}`);
      if (f.sub_letter_rationale !== null) {
        lines.push(`* ${f.sub_letter_rationale}`);
      }
      const citeLabel = opts.locale === 'de' ? 'Zitat' : 'Citation';
      lines.push(`* ${citeLabel}: ${f.citation_url}`);
    }
  }
  if (shape.nearest_miss.length > 0) {
    lines.push('');
    lines.push(
      opts.locale === 'de'
        ? 'Nicht ausgelöste, aber relevante Artikel:'
        : 'Articles considered but not fired:',
    );
    for (const nm of shape.nearest_miss) {
      lines.push(`* ${nm.heading} -- ${nm.rationale}`);
    }
  }
  if (shape.disambiguator !== null) {
    lines.push('');
    lines.push(
      opts.locale === 'de'
        ? 'Disambiguator-Zustand (Art. 5 Abs. 1 Buchst. d):'
        : 'Disambiguator state (Art 5(1)(d)):',
    );
    lines.push(`* ${shape.disambiguator.rationale}`);
  }
  if (shape.excerpts !== undefined && shape.excerpts.length > 0) {
    lines.push('');
    lines.push(
      opts.locale === 'de'
        ? 'Lucairn-Kommentar (Auszüge):'
        : 'Lucairn commentary (excerpts):',
    );
    for (const ex of shape.excerpts) {
      lines.push('');
      lines.push('---');
      lines.push(ex.body.trimEnd());
    }
  }
  lines.push('');
  lines.push(shape.disclaimer);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a ClassifyResult as a reasoning-trace explainer.
 *
 * @throws TypeError if `result` is not a ClassifyResult-shaped object or
 *   `opts.locale` is invalid or `opts.format` is invalid.
 */
export function formatExplain(result: ClassifyResult, opts: ExplainFormatOptions): string {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    throw new TypeError('formatExplain(): result must be a ClassifyResult object.');
  }
  if (opts === null || typeof opts !== 'object' || Array.isArray(opts)) {
    throw new TypeError('formatExplain(): opts must be an ExplainFormatOptions object.');
  }
  if (opts.locale !== 'en' && opts.locale !== 'de') {
    throw new TypeError(`formatExplain(): opts.locale must be 'en' or 'de'. Got: ${String(opts.locale)}`);
  }
  if (opts.format !== 'markdown' && opts.format !== 'json' && opts.format !== 'text') {
    throw new TypeError(
      `formatExplain(): opts.format must be 'markdown' | 'json' | 'text'. Got: ${String(opts.format)}`,
    );
  }
  const shape = toJsonShape(result, opts);
  switch (opts.format) {
    case 'json':
      return renderJson(shape);
    case 'text':
      return renderText(opts, shape);
    case 'markdown':
    default:
      return renderMarkdown(result, opts, shape);
  }
}
