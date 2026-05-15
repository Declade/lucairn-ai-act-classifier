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
// Day 10: refactored to share lexicon/projection/index/hallucination-filter
// helpers with the OpenAI + Groq providers via `./_shared.js`. The public
// behaviour and error shapes are byte-stable from Day 9.
//
// EUR-Lex regulation reference: Regulation (EU) 2024/1689.
// Lexicon source: src/data/patterns.{en,de}.json (loaded via _shared.ts cache).

import { detectLang } from '../lang.js';
import type { ExtractedFeatures } from '../keyword.js';
import type { LLMExtractOptions } from '../llm.js';
import {
  LEXICONS_CACHE,
  projectLexiconForPrompt,
  buildLexiconPhraseIndex,
  buildCategorySourceIndex,
  validateEmittedByCategory,
  filterHallucinations,
  buildHits,
  redactApiKey,
  emitDebugDropTrace,
  SYSTEM_PROMPT,
  buildUserMessage,
  EMIT_FEATURES_PARAMETERS_SCHEMA,
  type EmittedByCategory,
} from './_shared.js';

// ---------------------------------------------------------------------------
// Tool definition (Anthropic tool-use schema)
// ---------------------------------------------------------------------------

const EMIT_FEATURES_TOOL = {
  name: 'emit_features',
  description:
    'Emit the lexicon categories and phrases that fire for this EU AI Act use case.',
  input_schema: EMIT_FEATURES_PARAMETERS_SCHEMA,
} as const;

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
 *   6. Validate response shape. On parse failure, retry once with a clarified
 *      follow-up message. Second failure → LLM_PARSE_ERROR.
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
      throw new Error(`LLM_API_ERROR: ${redactApiKey(msg, apiKey)}`);
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
  const { validatedByCategory, droppedPhrases } = filterHallucinations(
    parsed,
    lexiconIndex,
  );

  // 8. Build hits array.
  const hits = buildHits(lexicon, validatedByCategory, sourceIndex);

  // Debug trace (silent unless AI_ACT_CLASSIFY_DEBUG=1).
  emitDebugDropTrace('llm-anthropic', droppedPhrases);

  return {
    input: text,
    lang,
    langConfident: detection.confident,
    lexiconVersion: lexicon.version,
    hits,
    byCategory: validatedByCategory,
  };
}
