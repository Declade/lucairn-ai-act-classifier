// OpenAI gpt-4o-mini provider for LLM feature extraction (Day 10).
//
// EU AI Act regulatory-feature extractor with GPT-4o-mini via the OpenAI
// SDK. Uses `chat.completions.create` with `tools` + a forced `tool_choice`
// on the `emit_features` function to obtain a strict JSON return; validates
// the response shape; cross-checks every emitted phrase against the active
// lexicon before constructing the returned ExtractedFeatures.
//
// Architectural locks (mirrored from anthropic.ts):
//   1. Dynamic-import of `openai` — module-init has zero SDK dep.
//   2. Lexicon-phrase validation — drop any LLM-emitted phrase not in the
//      lexicon's `entries[].phrase` set. This is the citation-moat guard
//      against hallucinations and is identical across providers.
//   3. Strict secrets hygiene — API key read from process.env (or from
//      `opts.apiKey` for the Groq-reuse case); NEVER logged, NEVER included
//      in error messages — `redactApiKey()` strips it from every wrapped
//      message before re-throwing.
//   4. One retry on malformed responses; second failure throws LLM_PARSE_ERROR.
//   5. Honor AbortSignal — passed through to the SDK request and as a 30s
//      default timeout if the caller doesn't supply one.
//   6. `baseURL` override — load-bearing for the Groq provider, which reuses
//      this module against `https://api.groq.com/openai/v1`.
//
// Groq compatibility:
//   The Groq cloud API exposes an OpenAI-compatible surface at
//   `https://api.groq.com/openai/v1`. The Groq provider (groq.ts) calls into
//   this module with `opts.baseURL` + `opts.apiKey` overridden and an
//   appropriate Groq model name. The OpenAI SDK constructor accepts both,
//   so we don't need a Groq-specific SDK or transport.
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
// Tool definition (OpenAI function-tool schema)
// ---------------------------------------------------------------------------
//
// OpenAI's tool schema differs from Anthropic's only structurally: a top-
// level `type: 'function'` wrapper with the schema under `function.parameters`
// instead of Anthropic's top-level `input_schema`. The inner JSON-Schema is
// identical (shared via `EMIT_FEATURES_PARAMETERS_SCHEMA`).

const EMIT_FEATURES_TOOL = {
  type: 'function',
  function: {
    name: 'emit_features',
    description:
      'Emit the lexicon categories and phrases that fire for this EU AI Act use case.',
    parameters: EMIT_FEATURES_PARAMETERS_SCHEMA,
  },
} as const;

// ---------------------------------------------------------------------------
// SDK shape (narrow — we only use chat.completions.create + the OpenAIError
// shape for redaction). Mirrors the structural shape the OpenAI SDK ships.
// ---------------------------------------------------------------------------

interface OpenAIChatCompletionToolCall {
  id?: string;
  type?: 'function';
  function: {
    name: string;
    /** JSON-string serialization of the function arguments. */
    arguments: string;
  };
}

interface OpenAIChatCompletionChoice {
  message?: {
    role?: string;
    content?: string | null;
    tool_calls?: ReadonlyArray<OpenAIChatCompletionToolCall>;
  };
  finish_reason?: string;
}

interface OpenAIChatCompletionResponse {
  choices: ReadonlyArray<OpenAIChatCompletionChoice>;
}

interface OpenAISDKClient {
  chat: {
    completions: {
      create(
        params: Record<string, unknown>,
        opts?: { signal?: AbortSignal },
      ): Promise<OpenAIChatCompletionResponse>;
    };
  };
}

interface OpenAISDKModule {
  default: new (opts: {
    apiKey: string;
    baseURL?: string;
  }) => OpenAISDKClient;
}

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TOKENS = 1024;

/**
 * Extract regulator-keyed features via OpenAI gpt-4o-mini (or any OpenAI
 * chat-completions-compatible upstream, including Groq via `opts.baseURL`).
 *
 * Workflow:
 *   1. Resolve API key: prefer `opts.apiKey` (used by Groq's reuse path);
 *      fall back to `process.env.OPENAI_API_KEY`. Throw LLM_NO_API_KEY if
 *      both absent.
 *   2. Dynamic-import `openai`; throw LLM_SDK_NOT_INSTALLED on import failure.
 *   3. Detect/override language; load lexicon projection + index + source map.
 *   4. Build prompt: system + user message with lexicon JSON + use case.
 *   5. Call chat.completions.create with the `emit_features` function-tool
 *      + forced tool_choice + JSON-string arguments.
 *   6. Parse `choices[0].message.tool_calls[0].function.arguments` as JSON;
 *      validate shape. On parse failure retry once. Second failure → LLM_PARSE_ERROR.
 *   7. Cross-check emitted phrases against the lexicon index; drop hallucinations.
 *   8. Construct ExtractedFeatures.
 *
 * @throws Error with stable error-code prefix ('LLM_NO_API_KEY:',
 *   'LLM_SDK_NOT_INSTALLED:', 'LLM_PARSE_ERROR:', 'LLM_NO_TOOL_USE:',
 *   'LLM_API_ERROR:').
 */
export async function extractWithOpenAI(
  text: string,
  opts: LLMExtractOptions,
): Promise<ExtractedFeatures> {
  // 1. API key. `opts.apiKey` takes precedence — this is the Groq reuse path.
  //    The Groq provider passes its own key explicitly so we never read
  //    OPENAI_API_KEY from env when running on Groq's baseURL.
  const apiKey = opts.apiKey ?? process.env['OPENAI_API_KEY'];
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new Error(
      'LLM_NO_API_KEY: OPENAI_API_KEY env var not set. See README §--llm mode setup.',
    );
  }

  // 2. Dynamic-import SDK.
  let sdkMod: OpenAISDKModule;
  try {
    sdkMod = (await import('openai')) as unknown as OpenAISDKModule;
  } catch {
    throw new Error(
      'LLM_SDK_NOT_INSTALLED: openai SDK is not installed. Run: pnpm add openai',
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

  // 5. Instantiate client. `baseURL` is undefined by default; the Groq path
  //    sets it to `https://api.groq.com/openai/v1`.
  const OpenAICtor = sdkMod.default;
  const clientOpts: { apiKey: string; baseURL?: string } = { apiKey };
  if (typeof opts.baseURL === 'string' && opts.baseURL.length > 0) {
    clientOpts.baseURL = opts.baseURL;
  }
  const client = new OpenAICtor(clientOpts);

  // Resolve abort signal: caller-supplied wins; otherwise 30s default.
  const signal: AbortSignal = opts.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const model = opts.model ?? DEFAULT_MODEL;

  // 6. Call + parse (with one retry on malformed response).
  let parsed: EmittedByCategory | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: OpenAIChatCompletionResponse;
    try {
      response = await client.chat.completions.create(
        {
          model,
          max_tokens: MAX_TOKENS,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          tools: [EMIT_FEATURES_TOOL],
          tool_choice: {
            type: 'function',
            function: { name: 'emit_features' },
          },
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

    // Find the tool_call in the first choice's message.
    const choice = response.choices[0];
    const toolCalls = choice?.message?.tool_calls ?? [];
    const toolCall = toolCalls.find(
      (tc): tc is OpenAIChatCompletionToolCall =>
        typeof tc === 'object' &&
        tc !== null &&
        typeof tc.function === 'object' &&
        tc.function !== null &&
        tc.function.name === 'emit_features',
    );
    if (toolCall === undefined) {
      lastErr = new Error(
        'LLM_NO_TOOL_USE: model did not call the emit_features tool.',
      );
      continue;
    }

    // Parse the function arguments JSON-string.
    let parsedArgs: unknown;
    try {
      parsedArgs = JSON.parse(toolCall.function.arguments);
    } catch (parseErr) {
      lastErr = new Error(
        `LLM_PARSE_ERROR: emit_features arguments failed JSON parse — ${(parseErr as Error).message}`,
      );
      continue;
    }

    // Validate shape inline.
    const validation = validateEmittedByCategory(parsedArgs);
    if (validation.success && validation.data !== null) {
      parsed = validation.data;
      break;
    }
    lastErr = new Error(
      `LLM_PARSE_ERROR: emit_features arguments failed schema validation — ${validation.error}`,
    );
  }

  if (parsed === null) {
    const lastMsg = lastErr instanceof Error ? lastErr.message : 'unknown';
    throw new Error(
      `LLM_PARSE_ERROR: failed to obtain a valid emit_features response after 2 attempts. Last: ${lastMsg}`,
    );
  }

  // 7. Cross-check emitted phrases against the lexicon. Drop hallucinations.
  const { validatedByCategory, droppedPhrases } = filterHallucinations(
    parsed,
    lexiconIndex,
  );

  // 8. Build hits array.
  const hits = buildHits(lexicon, validatedByCategory, sourceIndex);

  // Debug trace (silent unless AI_ACT_CLASSIFY_DEBUG=1).
  emitDebugDropTrace('llm-openai', droppedPhrases);

  return {
    input: text,
    lang,
    langConfident: detection.confident,
    lexiconVersion: lexicon.version,
    hits,
    byCategory: validatedByCategory,
  };
}
