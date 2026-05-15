// Markdown formatter for ClassifyResult.
//
// Pure function. Renders GitHub-flavoured markdown suitable for issue paste +
// Notion paste + Confluence paste. Tables for the article mapping + category
// overlay; trailing disclaimer block.
//
// Locale-driven labels; emoji are intentional (rendered correctly by GitHub /
// Notion / Confluence / Slack).

import type { ClassifyResult } from '../classify.js';
import { getCitation, type CitationArticleId } from '../util/citations.js';
import { getLocale, type I18nLocale } from '../i18n/load.js';

export interface MarkdownFormatOptions {
  locale: 'en' | 'de';
  cite: boolean;
}

function statusEmojiAndLabel(
  kind: 'art5' | 'annex_iii' | 'cascade' | 'annex_iv' | 'art50' | 'category',
  flag: boolean,
  suppressedByArt5: boolean,
  labels: I18nLocale['labels'],
): string {
  switch (kind) {
    case 'art5':
      return flag ? `🛑 ${labels.status_prohibited}` : `✅ ${labels.status_not_triggered}`;
    case 'annex_iii':
      if (suppressedByArt5) return `🛑 ${labels.status_suppressed_by_art_5}`;
      return flag ? `⚠️ ${labels.status_high_risk}` : `✅ ${labels.status_not_triggered}`;
    case 'cascade':
      return flag ? `✅ ${labels.status_applies}` : `⬜ ${labels.status_not_applicable}`;
    case 'art50':
      return flag ? `✅ ${labels.status_applies}` : `⬜ ${labels.status_not_triggered}`;
    case 'annex_iv':
      return flag ? `📄 ${labels.status_required}` : `⬜ ${labels.status_not_applicable}`;
    case 'category':
      return flag ? `🔴 ${labels.status_required}` : `⬜ ${labels.status_not_applicable}`;
  }
}

function annexIIINotes(annex: ClassifyResult['annex_iii'], locale: 'en' | 'de'): string {
  if (!annex.high_risk || annex.suppressed_by_article_5) return '';
  const sortedDomains = [...annex.domains].sort((a, b) => a.annex_iii_number - b.annex_iii_number);
  const parts: string[] = [];
  // M1 fix-up — the "Annex III" prefix is locale-aware ("Anhang III" in DE).
  const prefix = getLocale(locale).labels.annex_iii_prefix;
  for (const d of sortedDomains) {
    const title = locale === 'de' ? d.title_de : d.title_en;
    if (d.sub_letters.length === 0) {
      parts.push(`${prefix}.${d.annex_iii_number} — ${title}`);
    } else {
      const sortedSubs = [...d.sub_letters].sort();
      for (const letter of sortedSubs) {
        parts.push(`${prefix}.${d.annex_iii_number}(${letter}) — ${title}`);
      }
    }
  }
  return parts.join('; ');
}

interface CiteRow {
  id: CitationArticleId;
  label: string;
}

function citationRows(result: ClassifyResult, locale: 'en' | 'de'): CiteRow[] {
  const labels = getLocale(locale).labels;
  const out: CiteRow[] = [];
  if (result.article_5.prohibited) {
    out.push({ id: 'article_5', label: labels.article_5 });
  }
  if (result.annex_iii.high_risk && !result.annex_iii.suppressed_by_article_5) {
    out.push({ id: 'annex_iii', label: labels.article_6_annex_iii });
  }
  if (result.article_10.applicable) out.push({ id: 'article_10', label: labels.article_10 });
  if (result.article_12.applicable) out.push({ id: 'article_12', label: labels.article_12 });
  if (result.article_13.applicable) out.push({ id: 'article_13', label: labels.article_13 });
  if (result.article_14.applicable) out.push({ id: 'article_14', label: labels.article_14 });
  if (result.article_15.applicable) out.push({ id: 'article_15', label: labels.article_15 });
  if (result.article_50.applicable) out.push({ id: 'article_50', label: labels.article_50 });
  if (result.annex_iv_required) out.push({ id: 'annex_iv', label: labels.annex_iv });
  return out;
}

function renderCitations(
  result: ClassifyResult,
  locale: 'en' | 'de',
  labels: I18nLocale['labels'],
): string[] {
  const rows = citationRows(result, locale);
  const out: string[] = [];
  out.push('');
  out.push(locale === 'de' ? '### Zitate' : '### Citations');
  out.push('');
  const primaryUrl =
    locale === 'de'
      ? 'https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=OJ:L_202401689'
      : 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202401689';
  out.push(`- **${labels.label_primary_eur_lex}** ${primaryUrl}`);
  for (const row of rows) {
    const c = getCitation(row.id);
    const desk = locale === 'de' ? c.service_desk_de ?? c.eur_lex_html_de : c.service_desk_en ?? c.eur_lex_html_en;
    out.push(`- ${row.label}: ${desk}`);
  }
  if (rows.length > 0) {
    const first = rows[0];
    if (first !== undefined) {
      const c = getCitation(first.id);
      const commentary = locale === 'de' ? c.lucairn_commentary_de : c.lucairn_commentary_en;
      if (commentary !== null) {
        out.push(`- **${labels.label_commentary_block}** ${commentary}`);
      }
    }
  }
  return out;
}

/**
 * Render a ClassifyResult as GitHub-flavoured markdown.
 *
 * @throws TypeError if `result` is not a ClassifyResult-shaped object or
 *   `opts.locale` is invalid.
 */
export function formatMarkdown(result: ClassifyResult, opts: MarkdownFormatOptions): string {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    throw new TypeError('formatMarkdown(): result must be a ClassifyResult object.');
  }
  if (opts === null || typeof opts !== 'object' || Array.isArray(opts)) {
    throw new TypeError('formatMarkdown(): opts must be a MarkdownFormatOptions object.');
  }
  if (opts.locale !== 'en' && opts.locale !== 'de') {
    throw new TypeError(`formatMarkdown(): opts.locale must be 'en' or 'de'. Got: ${String(opts.locale)}`);
  }

  const localeBundle = getLocale(opts.locale);
  const labels = localeBundle.labels;
  const annexIIINotesText = annexIIINotes(result.annex_iii, opts.locale);
  const lines: string[] = [];

  lines.push(`## ${labels.section_title}`);
  lines.push('');
  const articleHeader = opts.locale === 'de' ? 'Artikel' : 'Article';
  const statusHeader = opts.locale === 'de' ? 'Status' : 'Status';
  const notesHeader = opts.locale === 'de' ? 'Hinweise' : 'Notes';
  lines.push(`| ${articleHeader} | ${statusHeader} | ${notesHeader} |`);
  lines.push('| --- | --- | --- |');
  lines.push(
    `| ${labels.article_5} | ${statusEmojiAndLabel('art5', result.article_5.prohibited, false, labels)} |  |`,
  );
  lines.push(
    `| ${labels.article_6_annex_iii} | ${statusEmojiAndLabel(
      'annex_iii',
      result.annex_iii.high_risk,
      result.annex_iii.suppressed_by_article_5,
      labels,
    )} | ${annexIIINotesText} |`,
  );
  lines.push(
    `| ${labels.article_10} | ${statusEmojiAndLabel('cascade', result.article_10.applicable, false, labels)} |  |`,
  );
  lines.push(
    `| ${labels.article_12} | ${statusEmojiAndLabel('cascade', result.article_12.applicable, false, labels)} |  |`,
  );
  lines.push(
    `| ${labels.article_13} | ${statusEmojiAndLabel('cascade', result.article_13.applicable, false, labels)} |  |`,
  );
  lines.push(
    `| ${labels.article_14} | ${statusEmojiAndLabel('cascade', result.article_14.applicable, false, labels)} |  |`,
  );
  lines.push(
    `| ${labels.article_15} | ${statusEmojiAndLabel('cascade', result.article_15.applicable, false, labels)} |  |`,
  );
  lines.push(
    `| ${labels.article_50} | ${statusEmojiAndLabel('art50', result.article_50.applicable, false, labels)} |  |`,
  );
  lines.push(
    `| ${labels.annex_iv} | ${statusEmojiAndLabel('annex_iv', result.annex_iv_required, false, labels)} |  |`,
  );

  // Three-category overlay table (or suppressed note).
  lines.push('');
  lines.push(`## ${labels.section_overlay}`);
  lines.push('');
  if (result.three_category === null) {
    lines.push(`> ${labels.overlay_suppressed_note}`);
  } else {
    const catHeader = opts.locale === 'de' ? 'Kategorie' : 'Category';
    const reqHeader = opts.locale === 'de' ? 'Erforderliche Artikel' : 'Required articles';
    const statusHeader2 = opts.locale === 'de' ? 'Status' : 'Status';
    lines.push(`| ${catHeader} | ${reqHeader} | ${statusHeader2} |`);
    lines.push('| --- | --- | --- |');
    lines.push(
      `| ${labels.cat_1} | 10 + 15 | ${statusEmojiAndLabel(
        'category',
        result.three_category.categories['1'].applicable,
        false,
        labels,
      )} |`,
    );
    lines.push(
      `| ${labels.cat_2} | 12 + 14 | ${statusEmojiAndLabel(
        'category',
        result.three_category.categories['2'].applicable,
        false,
        labels,
      )} |`,
    );
    lines.push(
      `| ${labels.cat_3} | 10 + 12 + 14 + 15 | ${statusEmojiAndLabel(
        'category',
        result.three_category.categories['3'].applicable,
        false,
        labels,
      )} |`,
    );
  }

  // Confidence + mode + rules line.
  lines.push('');
  lines.push(
    `**${labels.label_confidence}:** ${result.confidence.toFixed(2)} · **${labels.label_mode}:** ${result.mode} · **${labels.label_rules}:** ${result.rules_version} (sha256:${result.rules_hash}…)`,
  );

  if (opts.cite) {
    const citationLines = renderCitations(result, opts.locale, labels);
    for (const line of citationLines) lines.push(line);
  }

  // Disclaimer footer (always).
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`> ${labels.disclaimer_footer}`);

  return lines.join('\n');
}

/**
 * Render the static Annex IV technical-documentation reference as
 * GitHub-flavoured markdown.
 *
 * Pure function. Locale-keyed. Source-of-truth: `src/i18n/{en,de}.json` field
 * `annex_iv_reference[]`. Output: H2 title heading, numbered list of the 9
 * top-level requirements, source line, mandatory disclaimer footer.
 *
 * M4 fix-up — `--annex iv` now honours `--format markdown` (was previously
 * CLI-table-only). See cli.ts:runAnnexIV().
 */
export function formatAnnexIVReferenceMarkdown(opts: { locale: 'en' | 'de' }): string {
  if (opts.locale !== 'en' && opts.locale !== 'de') {
    throw new TypeError(
      `formatAnnexIVReferenceMarkdown(): opts.locale must be 'en' or 'de'. Got: ${String(opts.locale)}`,
    );
  }
  const locale = getLocale(opts.locale);
  const lines: string[] = [];
  lines.push(`## ${locale.labels.annex_iv_reference_title}`);
  lines.push('');
  for (const item of locale.annex_iv_reference) {
    lines.push(`${item.number} ${item.title}`);
  }
  lines.push('');
  lines.push(`_${locale.labels.annex_iv_reference_source}_`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`> ${locale.labels.disclaimer_footer}`);
  return lines.join('\n');
}
