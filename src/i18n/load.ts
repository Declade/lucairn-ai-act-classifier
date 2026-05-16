// i18n locale loader. Reads the two JSON locales at module init and caches them.
//
// Mirrors the readFileSync + fileURLToPath pattern used by
// `src/extract/keyword.ts` + `src/rules/article-6-annex-iii.ts`. The JSON files
// ship in `dist/i18n/{en,de}.json` via the package.json build script's
// `cp -R src/i18n dist/i18n` step.
//
// Zero network, zero runtime I/O — same as the rules JSON loaders.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const I18N_DIR = __dirname;

export interface I18nAnnexIVItem {
  number: string;
  title: string;
}

export interface I18nLabels {
  section_title: string;
  section_overlay: string;
  overlay_suppressed_note: string;
  article_5: string;
  article_6_annex_iii: string;
  article_10: string;
  article_12: string;
  article_13: string;
  article_14: string;
  article_15: string;
  article_50: string;
  annex_iv: string;
  cat_1: string;
  cat_2: string;
  cat_3: string;
  status_prohibited: string;
  status_high_risk: string;
  status_applies: string;
  status_required: string;
  status_not_triggered: string;
  status_not_applicable: string;
  status_suppressed_by_art_5: string;
  label_confidence: string;
  label_mode: string;
  label_rules: string;
  label_cite: string;
  label_commentary: string;
  label_primary_eur_lex: string;
  label_commentary_block: string;
  disclaimer_footer: string;
  warning_both_stdin_and_text: string;
  error_empty_input: string;
  error_invalid_lang: string;
  error_rules_version_mismatch: string;
  error_annex_invalid: string;
  error_wizard_cancelled: string;
  annex_iv_reference_title: string;
  annex_iv_reference_source: string;
  annex_iii_prefix: string;
  annex_iv_prefix: string;
}

export type I18nAnnexIIIChapeaux = Readonly<Record<'1' | '2' | '3' | '4' | '5' | '6' | '7' | '8', string>>;

export interface I18nLocale {
  language: 'en' | 'de';
  version: string;
  labels: I18nLabels;
  /**
   * Verbatim EUR-Lex chapeau text per Annex III paragraph (1-8). Keyed by the
   * paragraph number as a string. Used by the `--explain` formatter to render
   * the paragraph's lead-in sentence in the chapeau slot (the paragraph title
   * is NOT the chapeau — Annex III's verbatim chapeaux carry the
   * "in so far as their use is permitted under relevant Union or national law"
   * carve-out language for the law-enforcement / migration / biometrics
   * paragraphs).
   */
  annex_iii_chapeaux: I18nAnnexIIIChapeaux;
  /**
   * Verbatim EUR-Lex Annex IV preamble (the chapeau text that immediately
   * follows the Annex IV heading and introduces the technical-documentation
   * checklist). Used by the `--explain` formatter to render the chapeau quote
   * in the Annex IV section.
   */
  annex_iv_chapeau: string;
  annex_iv_reference: ReadonlyArray<I18nAnnexIVItem>;
}

function loadLocale(lang: 'en' | 'de'): I18nLocale {
  const path = join(I18N_DIR, `${lang}.json`);
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as I18nLocale;
  if (parsed.language !== lang) {
    throw new Error(
      `i18n/load: ${lang}.json claims language="${parsed.language}", expected "${lang}".`,
    );
  }
  return parsed;
}

const LOCALES: Record<'en' | 'de', I18nLocale> = {
  en: loadLocale('en'),
  de: loadLocale('de'),
};

/** Get the locale bundle for `lang`. Cached at module init. */
export function getLocale(lang: 'en' | 'de'): I18nLocale {
  return LOCALES[lang];
}

/**
 * Test helper — re-read locales from disk.
 * @internal
 */
export function _reloadLocales(): void {
  LOCALES.en = loadLocale('en');
  LOCALES.de = loadLocale('de');
}
