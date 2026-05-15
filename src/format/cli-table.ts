// CLI table formatter for ClassifyResult.
//
// Pure function. Renders a multi-line plain-text block matching the
// AI-Act-classifier build-plan example output for the CLI surface (private
// build plan) with one divergence: Article 12 is included between Article 10
// and Article 13 (the build-plan example pre-dates Day 5's Article 12 promotion).
//
// Color discipline:
//   - useColor: false → no ANSI sequences (deterministic output).
//   - useColor: true → kleur ANSI: red for prohibited/high-risk/required,
//     yellow for "applies", dim gray for "not triggered" / "not applicable",
//     and traffic-light for confidence (green ≥0.80, yellow 0.50-0.80, red <0.50).
//
// Citation block (--cite):
//   Emitted ONLY for articles with `applicable === true` (or
//   `article_5.prohibited === true`). Article 50 cited only when it triggered.

import kleur from 'kleur';
import type { ClassifyResult } from '../classify.js';
import {
  getCitation,
  type CitationArticleId,
  type CitationEntry,
} from '../util/citations.js';
import { getLocale, type I18nLocale } from '../i18n/load.js';

export interface CliTableOptions {
  /** Output locale for labels (en|de). Independent of result.detected_lang. */
  locale: 'en' | 'de';
  /** When true, emit a citation block after the main render. Default: false. */
  cite: boolean;
  /** When false, suppress all color codes. Default: true (caller decides based on TTY + NO_COLOR). */
  useColor: boolean;
}

// ---------------------------------------------------------------------------
// Local color helpers
// ---------------------------------------------------------------------------

function color(useColor: boolean): typeof kleur {
  if (useColor) return kleur;
  // Return a no-op chain. kleur.options/enabled is global state — bypass it
  // by handing back functions that just return their argument when color is off.
  return makeNoOpKleur();
}

// Build a kleur-shaped no-op so callers can write `color(useColor).red().bold(...)`
// without branching at every call site. The methods we use are red/yellow/green/dim/bold.
type KleurChain = typeof kleur;

function makeNoOpKleur(): KleurChain {
  // Build a fresh function-shaped Proxy so `kleur.red().bold(...)` resolves
  // through any chain depth without collisions. Mirrors kleur 4.x semantics:
  //   - `k.red(text)` (called with arg)  → returns `String(text)`
  //   - `k.red()` (called with no arg)   → returns another chainable proxy
  //   - `k.red` (property access)        → returns another chainable proxy
  //   - `k.red().bold(text)` (chain)     → returns `String(text)`
  // Without the apply-trap branch on no-arg calls, `k.red()` would invoke the
  // underlying identity fn `(s) => String(s)` with `s === undefined`, producing
  // the literal string "undefined" — which then surfaces as `String.prototype.bold`
  // (the deprecated HTML wrapper) when the caller chains `.bold(...)` onto it.
  const make = (): unknown => {
    const target = (s: string | number): string => String(s);
    return new Proxy(target, {
      get(t, prop, _receiver) {
        if (prop === 'apply' || prop === 'call' || prop === 'bind' || prop === Symbol.toPrimitive) {
          return Reflect.get(t, prop);
        }
        if (typeof prop === 'string') return make();
        return Reflect.get(t, prop);
      },
      apply(_t, _thisArg, args) {
        if (args.length === 0) return make();
        return String(args[0]);
      },
    });
  };
  return make() as KleurChain;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function statusForArticle5(article5: ClassifyResult['article_5'], labels: I18nLocale['labels'], k: KleurChain): string {
  if (article5.prohibited) {
    return k.red().bold(labels.status_prohibited);
  }
  return k.dim(labels.status_not_triggered);
}

function statusForAnnexIII(
  annex: ClassifyResult['annex_iii'],
  labels: I18nLocale['labels'],
  k: KleurChain,
): string {
  if (annex.suppressed_by_article_5) {
    return k.dim(labels.status_suppressed_by_art_5);
  }
  if (annex.high_risk) {
    return k.red().bold(labels.status_high_risk);
  }
  return k.dim(labels.status_not_triggered);
}

function statusForCascade(applicable: boolean, labels: I18nLocale['labels'], k: KleurChain): string {
  if (applicable) {
    return k.yellow(labels.status_applies);
  }
  return k.dim(labels.status_not_applicable);
}

function statusForCategory(applicable: boolean, labels: I18nLocale['labels'], k: KleurChain): string {
  if (applicable) {
    return k.red().bold(labels.status_required);
  }
  return k.dim(labels.status_not_applicable);
}

function statusForAnnexIV(required: boolean, labels: I18nLocale['labels'], k: KleurChain): string {
  if (required) {
    return k.red().bold(labels.status_required);
  }
  return k.dim(labels.status_not_applicable);
}

function colorConfidence(value: number, k: KleurChain): string {
  const text = value.toFixed(2);
  if (value >= 0.8) return k.green(text);
  if (value >= 0.5) return k.yellow(text);
  return k.red(text);
}

// ---------------------------------------------------------------------------
// Annex III sub-letter tree rendering
// ---------------------------------------------------------------------------

function renderAnnexIIITree(annex: ClassifyResult['annex_iii'], locale: 'en' | 'de'): string[] {
  // Only render the sub-letter tree when high-risk fired and not suppressed.
  if (!annex.high_risk || annex.suppressed_by_article_5) return [];
  const out: string[] = [];
  // Domains are already sorted by classifyAnnexIII; defensive resort doesn't hurt.
  const sortedDomains = [...annex.domains].sort((a, b) => a.annex_iii_number - b.annex_iii_number);
  // M1 fix-up — the "Annex III" prefix is locale-aware ("Anhang III" in DE).
  const prefix = getLocale(locale).labels.annex_iii_prefix;
  for (const d of sortedDomains) {
    const title = locale === 'de' ? d.title_de : d.title_en;
    if (d.sub_letters.length === 0) {
      out.push(`    └─ ${prefix}.${d.annex_iii_number} — ${title}`);
    } else {
      const sortedSubs = [...d.sub_letters].sort();
      for (const letter of sortedSubs) {
        out.push(`    └─ ${prefix}.${d.annex_iii_number}(${letter}) — ${title}`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Citation block
// ---------------------------------------------------------------------------

interface ArticleCiteContext {
  id: CitationArticleId;
  applicable: boolean;
  label: string;
}

function selectCitations(result: ClassifyResult, locale: 'en' | 'de'): ArticleCiteContext[] {
  const labels = getLocale(locale).labels;
  // Order matches the main render: Art 5 first (when prohibited), then Annex III,
  // then 10/12/13/14/15, then Article 50 (when triggered), then Annex IV (when required).
  const out: ArticleCiteContext[] = [];
  if (result.article_5.prohibited) {
    out.push({ id: 'article_5', applicable: true, label: labels.article_5 });
  }
  if (result.annex_iii.high_risk && !result.annex_iii.suppressed_by_article_5) {
    out.push({ id: 'annex_iii', applicable: true, label: labels.article_6_annex_iii });
  }
  if (result.article_10.applicable) out.push({ id: 'article_10', applicable: true, label: labels.article_10 });
  if (result.article_12.applicable) out.push({ id: 'article_12', applicable: true, label: labels.article_12 });
  if (result.article_13.applicable) out.push({ id: 'article_13', applicable: true, label: labels.article_13 });
  if (result.article_14.applicable) out.push({ id: 'article_14', applicable: true, label: labels.article_14 });
  if (result.article_15.applicable) out.push({ id: 'article_15', applicable: true, label: labels.article_15 });
  if (result.article_50.applicable) out.push({ id: 'article_50', applicable: true, label: labels.article_50 });
  if (result.annex_iv_required) out.push({ id: 'annex_iv', applicable: true, label: labels.annex_iv });
  return out;
}

function citationUrlEN(c: CitationEntry): string {
  return c.service_desk_en ?? c.eur_lex_html_en;
}
function citationUrlDE(c: CitationEntry): string {
  return c.service_desk_de ?? c.eur_lex_html_de;
}
function commentaryUrl(c: CitationEntry, locale: 'en' | 'de'): string | null {
  return locale === 'de' ? c.lucairn_commentary_de : c.lucairn_commentary_en;
}

function renderCitations(
  result: ClassifyResult,
  locale: 'en' | 'de',
  labels: I18nLocale['labels'],
): string[] {
  const citations = selectCitations(result, locale);
  const out: string[] = [];
  const primaryUrl =
    locale === 'de'
      ? 'https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=OJ:L_202401689'
      : 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202401689';
  out.push(`${labels.label_cite}: ${primaryUrl}`);

  for (const ctx of citations) {
    const c = getCitation(ctx.id);
    const desk = locale === 'de' ? citationUrlDE(c) : citationUrlEN(c);
    out.push(`       ${desk}`);
  }
  // Commentary tail (one shared lucairn.eu URL per locale; collapse to a single line).
  if (citations.length > 0) {
    const firstCitation = citations[0];
    if (firstCitation !== undefined) {
      const commentary = commentaryUrl(getCitation(firstCitation.id), locale);
      if (commentary !== null) {
        out.push(`       ${commentary} ${labels.label_commentary}`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Annex IV reference table (--annex iv)
// ---------------------------------------------------------------------------

/**
 * Static Annex IV technical-documentation reference table.
 *
 * Pure function. Locale-keyed. Source-of-truth: `src/i18n/{en,de}.json` field
 * `annex_iv_reference[]`. EN+DE titles ship verbatim from Tier-1 EUR-Lex
 * Regulation (EU) 2024/1689, Annex IV / Anhang IV (PDF). The 9 top-level
 * requirements are truncated to title-only form (period replaces the trailing
 * comma/colon plus enumerated sub-letters) so the CLI prints a stable 9-line
 * reference table. DE was previously sourced from a Tier-3 mirror
 * (artificialintelligenceact.eu/de/annex/4/) which paraphrased Tier-1 with
 * "Eine "-prefixed openings; restored to Tier-1 verbatim opening clauses in
 * the PR #6 fix-up commit on `feat/day-6-cli-surface-and-formatters` (the
 * trailing-period truncation is the only deliberate divergence from Tier-1).
 */
export function formatAnnexIVReference(opts: { locale: 'en' | 'de' }): string {
  const locale = getLocale(opts.locale);
  const lines: string[] = [];
  lines.push(locale.labels.annex_iv_reference_title);
  lines.push('');
  for (const item of locale.annex_iv_reference) {
    lines.push(`  ${item.number} ${item.title}`);
  }
  lines.push('');
  lines.push(locale.labels.annex_iv_reference_source);
  lines.push('');
  lines.push(locale.labels.disclaimer_footer);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main formatter
// ---------------------------------------------------------------------------

/**
 * Render a ClassifyResult as a multi-line CLI table.
 *
 * @param result - The classification result (from `classify()`).
 * @param opts - Locale + cite toggle + color toggle.
 * @returns Multi-line text with a single trailing newline-free join; the caller
 *   adds the final newline if writing to stdout.
 */
export function formatCliTable(result: ClassifyResult, opts: CliTableOptions): string {
  if (
    result === null ||
    typeof result !== 'object' ||
    Array.isArray(result)
  ) {
    throw new TypeError('formatCliTable(): result must be a ClassifyResult object.');
  }
  if (opts === null || typeof opts !== 'object' || Array.isArray(opts)) {
    throw new TypeError('formatCliTable(): opts must be a CliTableOptions object.');
  }
  if (opts.locale !== 'en' && opts.locale !== 'de') {
    throw new TypeError(`formatCliTable(): opts.locale must be 'en' or 'de'. Got: ${String(opts.locale)}`);
  }

  const locale = getLocale(opts.locale);
  const labels = locale.labels;
  const k = color(opts.useColor);
  const lines: string[] = [];

  // Section heading.
  lines.push(`  ${labels.section_title}`);

  // Article 5.
  lines.push(`  ${labels.article_5}: ${statusForArticle5(result.article_5, labels, k)}`);

  // Article 6 + Annex III.
  lines.push(`  ${labels.article_6_annex_iii}:      ${statusForAnnexIII(result.annex_iii, labels, k)}`);
  // Annex III sub-letter tree.
  for (const line of renderAnnexIIITree(result.annex_iii, opts.locale)) {
    lines.push(line);
  }

  // Article 10 / 12 / 13 / 14 / 15.
  lines.push(`  ${labels.article_10}: ${statusForCascade(result.article_10.applicable, labels, k)}`);
  lines.push(`  ${labels.article_12}: ${statusForCascade(result.article_12.applicable, labels, k)}`);
  lines.push(`  ${labels.article_13}: ${statusForCascade(result.article_13.applicable, labels, k)}`);
  lines.push(`  ${labels.article_14}: ${statusForCascade(result.article_14.applicable, labels, k)}`);
  lines.push(`  ${labels.article_15}: ${statusForCascade(result.article_15.applicable, labels, k)}`);

  // Article 50.
  const art50Status = result.article_50.applicable
    ? k.yellow(labels.status_applies)
    : k.dim(labels.status_not_triggered);
  lines.push(`  ${labels.article_50}:  ${art50Status}`);

  // Annex IV.
  lines.push(`  ${labels.annex_iv}:  ${statusForAnnexIV(result.annex_iv_required, labels, k)}`);

  // Lucairn obligation overlay block.
  lines.push('');
  if (result.three_category === null) {
    lines.push(`  ${labels.section_overlay}`);
    lines.push(`  ${k.dim(labels.overlay_suppressed_note)}`);
  } else {
    lines.push(`  ${labels.section_overlay}`);
    lines.push(`  ${labels.cat_1}:  ${statusForCategory(result.three_category.categories['1'].applicable, labels, k)}`);
    lines.push(`  ${labels.cat_2}:  ${statusForCategory(result.three_category.categories['2'].applicable, labels, k)}`);
    lines.push(`  ${labels.cat_3}: ${statusForCategory(result.three_category.categories['3'].applicable, labels, k)}`);
  }

  // Confidence + mode + rules line.
  lines.push('');
  const confLine =
    `  ${labels.label_confidence}: ${colorConfidence(result.confidence, k)}` +
    `   ${labels.label_mode}: ${result.mode}` +
    `   ${labels.label_rules}: ${result.rules_version} (sha256:${result.rules_hash}…)`;
  lines.push(confLine);

  // Citation block.
  if (opts.cite) {
    const citationLines = renderCitations(result, opts.locale, labels);
    for (const line of citationLines) {
      lines.push(`  ${line}`);
    }
  }

  // Disclaimer footer (always).
  lines.push('');
  lines.push(`  ${k.dim(labels.disclaimer_footer)}`);

  return lines.join('\n');
}
