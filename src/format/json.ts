// JSON formatter for ClassifyResult.
//
// Pure function. Stable-key-order serialization so byte-stable across runs +
// test snapshots. The top-level key order is locked here, not computed.
//
// By default `features` is OMITTED (consultants don't need every lexicon hit
// in the JSON output). Set `includeFeatures: true` to include it.
//
// Disclaimer footer is NOT part of the JSON shape — JSON is the
// machine-readable surface; CLI table + Markdown carry the disclaimer.

import type { ClassifyResult } from '../classify.js';
import { getLocale } from '../i18n/load.js';

export interface JsonFormatOptions {
  /** When true, output is pretty-printed with 2-space indent. Default: true. */
  pretty?: boolean;
  /** When true, include the verbose `features` field (every lexicon hit). Default: false. */
  includeFeatures?: boolean;
}

/**
 * Top-level key order. Pinning this here is load-bearing for snapshot
 * stability (Day-3 lesson 2 pattern: snapshot only load-bearing fields, but
 * within a snapshot field-order matters for byte-stable output).
 *
 * NOTE: `features` is in this list. When `includeFeatures === false` we OMIT
 * the key entirely from the output object (rather than emit `null` or `{}`).
 */
const KEY_ORDER: ReadonlyArray<keyof ClassifyResult> = [
  'input_text',
  'detected_lang',
  'lang_confident',
  'rules_version',
  'rules_hash',
  'rules_hash_full',
  'mode',
  'confidence',
  'article_5',
  'annex_iii',
  'article_10',
  'article_12',
  'article_13',
  'article_14',
  'article_15',
  'article_50',
  'article_4',
  'gpai',
  'three_category',
  'annex_iv_required',
  'features',
];

/**
 * Serialize a ClassifyResult to JSON with stable key order.
 *
 * @throws TypeError if `result` is not a ClassifyResult-shaped object.
 */
export function formatJson(result: ClassifyResult, opts: JsonFormatOptions = {}): string {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    throw new TypeError('formatJson(): result must be a ClassifyResult object.');
  }
  const pretty = opts.pretty !== false; // default true
  const includeFeatures = opts.includeFeatures === true; // default false

  // Build the output object in fixed key order.
  const out: Record<string, unknown> = {};
  for (const key of KEY_ORDER) {
    if (key === 'features' && !includeFeatures) continue;
    out[key] = result[key];
  }

  return pretty ? JSON.stringify(out, null, 2) : JSON.stringify(out);
}

/**
 * Render the static Annex IV technical-documentation reference as JSON.
 *
 * Pure function. Locale-keyed. Source-of-truth: `src/i18n/{en,de}.json` field
 * `annex_iv_reference[]`. JSON shape mirrors the structured i18n data with the
 * locale's title + source + items + disclaimer footer included so machine
 * consumers can render their own UI without losing provenance.
 *
 * M4 fix-up — `--annex iv` now honours `--format json` (was previously
 * CLI-table-only). See cli.ts:runAnnexIV().
 */
export function formatAnnexIVReferenceJson(opts: { locale: 'en' | 'de'; pretty?: boolean }): string {
  if (opts.locale !== 'en' && opts.locale !== 'de') {
    throw new TypeError(
      `formatAnnexIVReferenceJson(): opts.locale must be 'en' or 'de'. Got: ${String(opts.locale)}`,
    );
  }
  const locale = getLocale(opts.locale);
  const out = {
    title: locale.labels.annex_iv_reference_title,
    source: locale.labels.annex_iv_reference_source,
    items: locale.annex_iv_reference.map((item) => ({
      number: item.number,
      title: item.title,
    })),
    disclaimer: locale.labels.disclaimer_footer,
  };
  const pretty = opts.pretty !== false; // default true
  return pretty ? JSON.stringify(out, null, 2) : JSON.stringify(out);
}
