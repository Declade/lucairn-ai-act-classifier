// Anthropic Haiku 4.5 provider for LLM feature extraction (Day 9).
//
// EU AI Act regulatory-feature extractor with Claude Haiku 4.5 via the
// Anthropic SDK. Uses tool-use structured output (`emit_features` tool) to
// force a typed JSON return; validates the response shape inline; cross-checks
// every emitted phrase against the active lexicon before constructing the
// returned ExtractedFeatures.
//
// Architectural locks (mirrored from extract/llm.ts):
//   1. Dynamic-import of @anthropic-ai/sdk — module-init has zero SDK dep.
//   2. Lexicon-phrase validation — drop any LLM-emitted phrase not in the
//      lexicon's `entries[].phrase` set (case-insensitive match against the
//      canonical form). This is the citation-moat guard against hallucinations.
//   3. Strict secrets hygiene — read the API key from process.env, NEVER log
//      it, NEVER include it in error messages.
//   4. One retry on malformed responses; second failure throws LLM_PARSE_ERROR.
//   5. Honor AbortSignal — passed through to the SDK request and as a 30s
//      default timeout if the caller doesn't supply one.
//
// EUR-Lex regulation reference: Regulation (EU) 2024/1689.
// Lexicon source: src/data/patterns.{en,de}.json (loaded via keyword.ts cache).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectLang } from '../lang.js';
import type { ExtractedFeatures, ExtractedHit, Lexicon } from '../keyword.js';
import type { LLMExtractOptions } from '../llm.js';

// ---------------------------------------------------------------------------
// Lexicon access (independent of keyword.ts's private cache)
// ---------------------------------------------------------------------------
//
// We don't reuse keyword.ts's private LEXICONS cache because (a) it's not
// exported and (b) the provider has a distinct concern: it needs the FLAT
// phrase set for hallucination filtering and the structured groups for the
// prompt's lexicon context block. We re-read the JSON files here (small, ~kB);
// the read is amortized over a network call so the overhead is irrelevant.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', '..', 'data');

function loadLexiconRaw(lang: 'en' | 'de'): Lexicon {
  const path = join(DATA_DIR, `patterns.${lang}.json`);
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as Lexicon;
}

const LEXICONS_CACHE: Record<'en' | 'de', Lexicon> = {
  en: loadLexiconRaw('en'),
  de: loadLexiconRaw('de'),
};

const RESERVED_KEYS: ReadonlySet<string> = new Set(['language', 'version']);

function discoverGroups(lexicon: Lexicon): string[] {
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
function projectLexiconForPrompt(
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
 * Build a Map<categoryKey, Set<canonicalPhrase>> per group for fast
 * O(1)-per-phrase lexicon-membership lookup during hallucination filtering.
 */
function buildLexiconPhraseIndex(
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
function buildCategorySourceIndex(
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
// Prompt construction
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an EU AI Act regulatory-feature extractor. Given a free-text description of an AI use case, identify which lexicon categories (from the curated set provided) fire.

Rules:
1. Output ONLY via the \`emit_features\` tool. Do not emit free-form text.
2. Each category you fire MUST cite 1-3 phrases from the provided lexicon for that category. Cite phrases VERBATIM from the lexicon — do NOT invent, paraphrase, conjugate, or translate phrases.
3. The lexicon phrases are in lowercase. Cite them in lowercase.
4. If no categories fire, return an object with empty objects for each group.
5. Be precise: only fire a category when the input clearly describes the regulated practice (not a generic mention or a denial).`;

function buildUserMessage(
  text: string,
  lexiconProjection: Record<string, Record<string, string[]>>,
): string {
  // Render lexicon as compact JSON. Haiku handles ~1-2k tokens of lexicon
  // context comfortably, well within the 200k context window.
  const lexiconJson = JSON.stringify(lexiconProjection, null, 2);
  return `Lexicon (cite phrases verbatim from this list — invented phrases will be dropped):

${lexiconJson}

Use case description:

${text}`;
}

// ---------------------------------------------------------------------------
// Tool definition (Anthropic tool-use schema)
// ---------------------------------------------------------------------------

const EMIT_FEATURES_TOOL = {
  name: 'emit_features',
  description:
    'Emit the lexicon categories and phrases that fire for this EU AI Act use case.',
  input_schema: {
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
        required: ['annex_iii', 'article_5_prohibited', 'article_50_gpai', 'scope_qualifiers'],
      },
    },
    required: ['byCategory'],
  },
} as const;

// ---------------------------------------------------------------------------
// Inline schema validation (zero-dep)
// ---------------------------------------------------------------------------
//
// We validate the tool_use input shape inline rather than pull a runtime
// validation dep (the dispatch spec mentioned zod but zod is not a project
// dep, and Day 9's scope is to avoid pulling deps beyond the optional SDK).

interface EmittedByCategory {
  byCategory: {
    annex_iii: Record<string, string[]>;
    article_5_prohibited: Record<string, string[]>;
    article_50_gpai: Record<string, string[]>;
    scope_qualifiers: Record<string, string[]>;
  };
}

const REQUIRED_GROUPS: ReadonlyArray<keyof EmittedByCategory['byCategory']> = [
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

interface ValidationResult {
  success: boolean;
  data: EmittedByCategory | null;
  error: string;
}

function validateEmittedByCategory(input: unknown): ValidationResult {
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
// SDK shape (kept narrow — we only use Messages.create + a few error helpers)
// ---------------------------------------------------------------------------

interface AnthropicMessageContentToolUse {
  type: 'tool_use';
  name: string;
  input: unknown;
}

interface AnthropicMessageResponse {
  content: ReadonlyArray<AnthropicMessageContentToolUse | { type: string }>;
}

interface AnthropicSDKClient {
  messages: {
    create(params: Record<string, unknown>, opts?: { signal?: AbortSignal }): Promise<AnthropicMessageResponse>;
  };
}

interface AnthropicSDKModule {
  default: new (opts: { apiKey: string }) => AnthropicSDKClient;
}

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TOKENS = 1024;

/**
 * Extract regulator-keyed features via Anthropic Haiku 4.5.
 *
 * Workflow:
 *   1. Read ANTHROPIC_API_KEY from env; throw LLM_NO_API_KEY if absent.
 *   2. Dynamic-import @anthropic-ai/sdk; throw LLM_SDK_NOT_INSTALLED on import failure.
 *   3. Detect/override language; load lexicon projection + index + source map.
 *   4. Build prompt: system instruction + user message with lexicon JSON + use case.
 *   5. Call Anthropic Messages API with the `emit_features` tool + forced tool_choice.
 *   6. Validate response shape with zod. On parse failure, retry once with a
 *      clarified follow-up message. Second failure → LLM_PARSE_ERROR.
 *   7. Cross-check every emitted phrase against the lexicon index; drop any
 *      phrase the LLM invented.
 *   8. Construct ExtractedFeatures with one ExtractedHit per (group, category, phrase).
 *
 * @throws Error with stable error-code prefix ('LLM_NO_API_KEY:', 'LLM_SDK_NOT_INSTALLED:',
 *   'LLM_PARSE_ERROR:', 'LLM_NO_TOOL_USE:', 'LLM_API_ERROR:').
 */
export async function extractWithAnthropic(
  text: string,
  opts: LLMExtractOptions,
): Promise<ExtractedFeatures> {
  // 1. API key.
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new Error(
      'LLM_NO_API_KEY: ANTHROPIC_API_KEY env var not set. See README §--llm anthropic mode setup.',
    );
  }

  // 2. Dynamic-import SDK.
  let sdkMod: AnthropicSDKModule;
  try {
    sdkMod = (await import('@anthropic-ai/sdk')) as unknown as AnthropicSDKModule;
  } catch {
    throw new Error(
      'LLM_SDK_NOT_INSTALLED: @anthropic-ai/sdk is not installed. Run: pnpm add @anthropic-ai/sdk',
    );
  }

  // 3. Language + lexicon projection.
  const detection = detectLang(text);
  const lang: 'en' | 'de' = opts.lang ?? detection.lang;
  const lexicon = LEXICONS_CACHE[lang];
  const lexiconProjection = projectLexiconForPrompt(lexicon);
  const lexiconIndex = buildLexiconPhraseIndex(lexicon);
  const sourceIndex = buildCategorySourceIndex(lexicon);

  // 4. Build prompt.
  const userMessage = buildUserMessage(text, lexiconProjection);

  // 5. Instantiate client.
  const AnthropicCtor = sdkMod.default;
  const client = new AnthropicCtor({ apiKey });

  // Resolve abort signal: caller-supplied wins; otherwise 30s default.
  const signal: AbortSignal = opts.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const model = opts.model ?? DEFAULT_MODEL;

  // 6. Call + parse (with one retry on malformed response).
  let parsed: EmittedByCategory | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: AnthropicMessageResponse;
    try {
      response = await client.messages.create(
        {
          model,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
          tools: [EMIT_FEATURES_TOOL],
          tool_choice: { type: 'tool', name: 'emit_features' },
        },
        { signal },
      );
    } catch (err) {
      // Network / auth / model errors: throw immediately without retry. The
      // SDK throws subclasses of Error with provider-specific names; we wrap
      // with a stable error-code prefix and DROP the api key from the message.
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`LLM_API_ERROR: ${msg.replace(apiKey, '<redacted>')}`);
    }

    // Find the tool_use block in the response content.
    const toolUseBlock = response.content.find(
      (b): b is AnthropicMessageContentToolUse => b.type === 'tool_use' && (b as AnthropicMessageContentToolUse).name === 'emit_features',
    );
    if (toolUseBlock === undefined) {
      // No tool_use block — model returned plain text or aborted. Try once more.
      lastErr = new Error(
        'LLM_NO_TOOL_USE: model did not call the emit_features tool.',
      );
      continue;
    }

    // Validate shape inline.
    const validation = validateEmittedByCategory(toolUseBlock.input);
    if (validation.success && validation.data !== null) {
      parsed = validation.data;
      break;
    }
    lastErr = new Error(
      `LLM_PARSE_ERROR: emit_features payload failed schema validation — ${validation.error}`,
    );
  }

  if (parsed === null) {
    const lastMsg = lastErr instanceof Error ? lastErr.message : 'unknown';
    throw new Error(
      `LLM_PARSE_ERROR: failed to obtain a valid emit_features response after 2 attempts. Last: ${lastMsg}`,
    );
  }

  // 7. Cross-check emitted phrases against the lexicon. Drop hallucinated entries.
  const validatedByCategory: Record<string, Record<string, string[]>> = {};
  const droppedPhrases: Array<{ group: string; category: string; phrase: string }> = [];
  for (const [group, categories] of Object.entries(parsed.byCategory)) {
    const groupIndex = lexiconIndex[group];
    if (groupIndex === undefined) continue; // unknown group
    validatedByCategory[group] = {};
    for (const [categoryKey, phrases] of Object.entries(categories)) {
      const categorySet = groupIndex[categoryKey];
      if (categorySet === undefined) {
        // LLM emitted a category-key not in the lexicon — drop the entire bucket.
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

  // 8. Build hits array. One ExtractedHit per (group, category, phrase) tuple.
  //    Deterministic order: group (lexicon-projection order) → category (insertion
  //    order from the lexicon JSON, preserved by Object.entries on a parsed JSON
  //    object) → phrase (LLM-emitted order, then filtered).
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

  // Debug trace (kept silent in normal operation — surface only via env flag).
  if (
    droppedPhrases.length > 0 &&
    typeof process.env['AI_ACT_CLASSIFY_DEBUG'] === 'string' &&
    process.env['AI_ACT_CLASSIFY_DEBUG'] === '1'
  ) {
    process.stderr.write(
      `[llm-anthropic] dropped ${droppedPhrases.length} hallucinated phrase(s) not in lexicon: ${JSON.stringify(droppedPhrases)}\n`,
    );
  }

  return {
    input: text,
    lang,
    langConfident: detection.confident,
    lexiconVersion: lexicon.version,
    hits,
    byCategory: validatedByCategory,
  };
}
