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
