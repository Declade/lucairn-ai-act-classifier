// Shared helpers for LLM provider extractors (Anthropic + OpenAI + Groq).
//
// Day-9 shipped the Anthropic provider with these helpers inline. Day-10 adds
// OpenAI + Groq providers that need the SAME hallucination guard + lexicon
// index + source map. This module centralizes the lexicon-side bookkeeping so
// the three providers share a single source of truth for the "citation moat"
// invariant:
//
//   Every emitted phrase must be present in the per-(group, category) lexicon
//   `entries[].phrase` set (case-insensitive canonical form). Phrases not in
//   the lexicon are DROPPED before constructing the returned ExtractedFeatures.
//
// Architectural locks (see also extract/llm.ts):
//   1. Pure-function helpers — no I/O beyond the synchronous lexicon JSON read
//      at module-init.
//   2. Module-init reads `patterns.{en,de}.json` ONCE; subsequent calls reuse
//      the cached projection + index + source map.
//   3. The validation schema (the `emit_features` tool's input shape) is
//      identical across providers — same 4 required groups, same record-of-
//      string-arrays semantics. Both Anthropic's `input_schema` and OpenAI's
//      `parameters` JSON-schema reference the same structural shape.
//   4. The redaction helper covers the common case of an upstream SDK error
//      containing the api key verbatim — the shape is stable across providers
//      because it goes through `Error.message.replace(apiKey, '<redacted>')`.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { ExtractedFeatures, ExtractedHit, Lexicon } from '../keyword.js';

// ---------------------------------------------------------------------------
// Lexicon load + project + index helpers (mirrored from anthropic.ts:30-133)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', '..', 'data');

function loadLexiconRaw(lang: 'en' | 'de'): Lexicon {
  const path = join(DATA_DIR, `patterns.${lang}.json`);
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as Lexicon;
}

/**
 * Module-level lexicon cache. Both providers reuse this; the cost is one
 * synchronous JSON read per language at import time, amortised over every LLM
 * call afterwards.
 */
export const LEXICONS_CACHE: Record<'en' | 'de', Lexicon> = {
  en: loadLexiconRaw('en'),
  de: loadLexiconRaw('de'),
};

const RESERVED_KEYS: ReadonlySet<string> = new Set(['language', 'version']);

/**
 * Return the active group keys for a lexicon, filtering out reserved
 * top-level fields (`language`, `version`, anything starting with `_`).
 */
export function discoverGroups(lexicon: Lexicon): string[] {
  return Object.keys(lexicon).filter(
    (k) => !RESERVED_KEYS.has(k) && !k.startsWith('_'),
  );
}

/**
 * Project a lexicon into the prompt-injected reference shape:
 *   {
 *     annex_iii: { '1_biometrics': ['remote biometric identification', ...], ... },
 *     article_5_prohibited: { 'd_predictive_policing': [...], ... },
 *     article_50_gpai: { ... },
 *     scope_qualifiers: { ... }
 *   }
 *
 * The LLM sees the lexicon in-context; it doesn't need to memorize it. We
 * emit phrases verbatim (the canonical lowercase form from the lexicon JSON).
 */
export function projectLexiconForPrompt(
  lexicon: Lexicon,
): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  for (const group of discoverGroups(lexicon)) {
    const raw = lexicon[group];
    if (raw === undefined || raw === null || typeof raw !== 'object') continue;
    const categories = raw as Record<string, { entries: Array<{ phrase: string }> }>;
    out[group] = {};
    for (const [categoryKey, category] of Object.entries(categories)) {
      const entries = category.entries ?? [];
      out[group][categoryKey] = entries.map((e) => e.phrase);
    }
  }
  return out;
}

/**
 * Build a Map<group, Map<categoryKey, Set<canonicalPhrase>>> for fast
 * O(1)-per-phrase lexicon-membership lookup during hallucination filtering.
 */
export function buildLexiconPhraseIndex(
  lexicon: Lexicon,
): Record<string, Record<string, Set<string>>> {
  const index: Record<string, Record<string, Set<string>>> = {};
  for (const group of discoverGroups(lexicon)) {
    const raw = lexicon[group];
    if (raw === undefined || raw === null || typeof raw !== 'object') continue;
    const categories = raw as Record<string, { entries: Array<{ phrase: string }>; source?: string }>;
    index[group] = {};
    for (const [categoryKey, category] of Object.entries(categories)) {
      const entries = category.entries ?? [];
      index[group][categoryKey] = new Set(
        entries.map((e) => e.phrase.toLowerCase().trim()),
      );
    }
  }
  return index;
}

/**
 * Build a Map<group, Map<categoryKey, source-URL>> for the per-hit source
 * lookup during ExtractedFeatures construction.
 */
export function buildCategorySourceIndex(
  lexicon: Lexicon,
): Record<string, Record<string, string>> {
  const index: Record<string, Record<string, string>> = {};
  for (const group of discoverGroups(lexicon)) {
    const raw = lexicon[group];
    if (raw === undefined || raw === null || typeof raw !== 'object') continue;
    const categories = raw as Record<string, { source: string }>;
    index[group] = {};
    for (const [categoryKey, category] of Object.entries(categories)) {
      index[group][categoryKey] = category.source;
    }
  }
  return index;
}

// ---------------------------------------------------------------------------
// Emitted-features schema (provider-agnostic shape)
// ---------------------------------------------------------------------------

export interface EmittedByCategory {
  byCategory: {
    annex_iii: Record<string, string[]>;
    article_5_prohibited: Record<string, string[]>;
    article_50_gpai: Record<string, string[]>;
    scope_qualifiers: Record<string, string[]>;
  };
}

export const REQUIRED_GROUPS: ReadonlyArray<keyof EmittedByCategory['byCategory']> = [
  'annex_iii',
  'article_5_prohibited',
  'article_50_gpai',
  'scope_qualifiers',
];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isRecordOfStringArrays(v: unknown): v is Record<string, string[]> {
  if (typeof v !== 'object' || v === null) return false;
  for (const value of Object.values(v)) {
    if (!isStringArray(value)) return false;
  }
  return true;
}

export interface ValidationResult {
  success: boolean;
  data: EmittedByCategory | null;
  error: string;
}

/**
 * Validate the LLM-emitted `byCategory` shape against the strict schema. Both
 * providers call this on the parsed structured output before constructing
 * ExtractedFeatures.
 */
export function validateEmittedByCategory(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { success: false, data: null, error: 'input is not an object' };
  }
  const byCategory = (input as { byCategory?: unknown }).byCategory;
  if (typeof byCategory !== 'object' || byCategory === null) {
    return { success: false, data: null, error: 'missing or non-object `byCategory`' };
  }
  for (const group of REQUIRED_GROUPS) {
    const groupValue = (byCategory as Record<string, unknown>)[group];
    if (groupValue === undefined) {
      return {
        success: false,
        data: null,
        error: `missing required group "${group}"`,
      };
    }
    if (!isRecordOfStringArrays(groupValue)) {
      return {
        success: false,
        data: null,
        error: `group "${group}" is not a Record<string, string[]>`,
      };
    }
  }
  return { success: true, data: input as EmittedByCategory, error: '' };
}

// ---------------------------------------------------------------------------
// Tool JSON schema (shared by Anthropic + OpenAI)
// ---------------------------------------------------------------------------
//
// Both Anthropic's `tools[].input_schema` and OpenAI's
// `tools[].function.parameters` accept this same JSON-Schema-Draft-7-shaped
// object. Anthropic exposes it under the `input_schema` key; OpenAI exposes
// it under `function.parameters`.

export const EMIT_FEATURES_PARAMETERS_SCHEMA = {
  type: 'object',
  properties: {
    byCategory: {
      type: 'object',
      properties: {
        annex_iii: {
          type: 'object',
          additionalProperties: { type: 'array', items: { type: 'string' } },
        },
        article_5_prohibited: {
          type: 'object',
          additionalProperties: { type: 'array', items: { type: 'string' } },
        },
        article_50_gpai: {
          type: 'object',
          additionalProperties: { type: 'array', items: { type: 'string' } },
        },
        scope_qualifiers: {
          type: 'object',
          additionalProperties: { type: 'array', items: { type: 'string' } },
        },
      },
      required: [
        'annex_iii',
        'article_5_prohibited',
        'article_50_gpai',
        'scope_qualifiers',
      ],
    },
  },
  required: ['byCategory'],
} as const;

// ---------------------------------------------------------------------------
// Hallucination-filter + ExtractedFeatures construction (shared logic)
// ---------------------------------------------------------------------------

export interface DroppedPhrase {
  group: string;
  category: string;
  phrase: string;
}

/**
 * Cross-check every emitted (group, category, phrase) tuple against the
 * lexicon index. Phrases not in the lexicon are DROPPED; unknown group/category
 * keys cause the whole bucket to be dropped. Returns the kept phrases by
 * group+category PLUS the list of dropped tuples (for debug-trace emission).
 */
export function filterHallucinations(
  parsed: EmittedByCategory,
  lexiconIndex: Record<string, Record<string, Set<string>>>,
): {
  validatedByCategory: Record<string, Record<string, string[]>>;
  droppedPhrases: DroppedPhrase[];
} {
  const validatedByCategory: Record<string, Record<string, string[]>> = {};
  const droppedPhrases: DroppedPhrase[] = [];
  for (const [group, categories] of Object.entries(parsed.byCategory)) {
    const groupIndex = lexiconIndex[group];
    if (groupIndex === undefined) continue; // unknown group
    validatedByCategory[group] = {};
    for (const [categoryKey, phrases] of Object.entries(categories)) {
      const categorySet = groupIndex[categoryKey];
      if (categorySet === undefined) {
        // LLM emitted a category-key not in the lexicon — drop the whole bucket.
        for (const p of phrases) {
          droppedPhrases.push({ group, category: categoryKey, phrase: p });
        }
        continue;
      }
      const kept: string[] = [];
      for (const phrase of phrases) {
        const canonical = phrase.toLowerCase().trim();
        if (categorySet.has(canonical)) {
          kept.push(phrase);
        } else {
          droppedPhrases.push({ group, category: categoryKey, phrase });
        }
      }
      if (kept.length > 0) {
        validatedByCategory[group][categoryKey] = kept;
      }
    }
  }
  return { validatedByCategory, droppedPhrases };
}

/**
 * Build the `hits` array from the filtered byCategory map + the per-category
 * source-URL index. One ExtractedHit per (group, category, phrase) tuple.
 *
 * Deterministic order: group (lexicon-projection order) → category (insertion
 * order from the lexicon JSON, preserved by Object.entries on a parsed JSON
 * object) → phrase (LLM-emitted order, then filtered).
 */
export function buildHits(
  lexicon: Lexicon,
  validatedByCategory: Record<string, Record<string, string[]>>,
  sourceIndex: Record<string, Record<string, string>>,
): ExtractedHit[] {
  const hits: ExtractedHit[] = [];
  for (const group of discoverGroups(lexicon)) {
    const groupBucket = validatedByCategory[group];
    if (groupBucket === undefined) continue;
    const groupSourceIndex = sourceIndex[group] ?? {};
    for (const [categoryKey, phrases] of Object.entries(groupBucket)) {
      const source = groupSourceIndex[categoryKey] ?? '';
      for (const phrase of phrases) {
        hits.push({ group, category: categoryKey, phrase, source });
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// API-key redaction (shared envelope)
// ---------------------------------------------------------------------------

/**
 * Replace `apiKey` (if non-empty) with the literal string `<redacted>` in a
 * message. Both providers pipe SDK error messages through this before
 * surfacing them.
 */
export function redactApiKey(message: string, apiKey: string): string {
  if (typeof apiKey !== 'string' || apiKey.length === 0) return message;
  return message.split(apiKey).join('<redacted>');
}

// ---------------------------------------------------------------------------
// Debug trace
// ---------------------------------------------------------------------------

/**
 * Emit a debug line listing dropped (hallucinated) phrases when
 * `AI_ACT_CLASSIFY_DEBUG=1` is set. Silent otherwise.
 */
export function emitDebugDropTrace(
  providerLabel: string,
  droppedPhrases: ReadonlyArray<DroppedPhrase>,
): void {
  if (
    droppedPhrases.length > 0 &&
    typeof process.env['AI_ACT_CLASSIFY_DEBUG'] === 'string' &&
    process.env['AI_ACT_CLASSIFY_DEBUG'] === '1'
  ) {
    process.stderr.write(
      `[${providerLabel}] dropped ${droppedPhrases.length} hallucinated phrase(s) not in lexicon: ${JSON.stringify(droppedPhrases)}\n`,
    );
  }
}

// ---------------------------------------------------------------------------
// Shared system prompt + user message builder
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT = `You are an EU AI Act regulatory-feature extractor. Given a free-text description of an AI use case, identify which lexicon categories (from the curated set provided) fire.

Rules:
1. Output ONLY via the \`emit_features\` tool. Do not emit free-form text.
2. Each category you fire MUST cite 1-3 phrases from the provided lexicon for that category. Cite phrases VERBATIM from the lexicon — do NOT invent, paraphrase, conjugate, or translate phrases.
3. The lexicon phrases are in lowercase. Cite them in lowercase.
4. If no categories fire, return an object with empty objects for each group.
5. Be precise: only fire a category when the input clearly describes the regulated practice (not a generic mention or a denial).`;

export function buildUserMessage(
  text: string,
  lexiconProjection: Record<string, Record<string, string[]>>,
): string {
  // Render lexicon as compact JSON. Both Haiku and gpt-4o-mini handle the
  // ~1-2k tokens of lexicon context comfortably within their context windows.
  const lexiconJson = JSON.stringify(lexiconProjection, null, 2);
  return `Lexicon (cite phrases verbatim from this list — invented phrases will be dropped):

${lexiconJson}

Use case description:

${text}`;
}

// Re-export ExtractedFeatures for provider modules that import the shared
// helpers (lets them keep a single import line for shared types).
export type { ExtractedFeatures, ExtractedHit, Lexicon };
