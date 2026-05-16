// Groq Llama 3.3 70B provider for LLM feature extraction (Day 10).
//
// Groq exposes an OpenAI-compatible chat-completions API at
// `https://api.groq.com/openai/v1`. We reuse the OpenAI SDK + provider via
// `baseURL` override + a Groq-specific model default + Groq's own API key
// passed EXPLICITLY (never via OPENAI_API_KEY env pollution).
//
// Architectural locks:
//   1. Reads `GROQ_API_KEY` from env — NEVER pollutes `OPENAI_API_KEY` (this
//      keeps a Groq run isolated from any OpenAI key the user might have set).
//   2. Default model: `llama-3.3-70b-versatile` (Groq's flagship as of dispatch
//      date 2026-05-16). Per-call override via `opts.model`.
//   3. Reuses the OpenAI provider's hallucination guard / lexicon validation /
//      tool-call parsing / API-key redaction logic transitively.
//   4. Dynamic-import via `./openai.js` — module-init has zero SDK dep.
//      (The `openai` SDK is in `optionalDependencies` of this package; the
//      Groq path uses the same SDK so a `pnpm add openai` install enables
//      both `--llm openai` and `--llm groq`.)

import type { ExtractedFeatures } from '../keyword.js';
import type { LLMExtractOptions } from '../llm.js';

const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
/**
 * Default Groq model. Exported as a NAMED export so `src/extract/llm.ts` can
 * import it for the centralised `getDefaultModel()` dispatch; this closes the
 * drift risk identified by Day-10 bug-hunter L6 (literal duplication across
 * providers + llm.ts).
 */
export const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_GROQ_MODEL = DEFAULT_MODEL;

/**
 * Extract regulator-keyed features via Groq's Llama 3.3 70B (or any
 * OpenAI-API-compatible Groq model selected via `opts.model`).
 *
 * Workflow:
 *   1. Read `GROQ_API_KEY` from env. Throw `LLM_NO_API_KEY` if absent.
 *   2. Dispatch to `extractWithOpenAI` with:
 *        - `baseURL` = `https://api.groq.com/openai/v1`
 *        - `apiKey`  = the Groq key (passed explicitly to the SDK
 *                       constructor; never leaks into OPENAI_API_KEY env)
 *        - `model`   = caller's `opts.model` ?? `llama-3.3-70b-versatile`
 *   3. Return the resulting ExtractedFeatures unchanged.
 *
 * @throws Error with stable error-code prefix (`LLM_NO_API_KEY:`,
 *   `LLM_SDK_NOT_INSTALLED:`, `LLM_PARSE_ERROR:`, `LLM_NO_TOOL_USE:`,
 *   `LLM_API_ERROR:`).
 */
export async function extractWithGroq(
  text: string,
  opts: LLMExtractOptions,
): Promise<ExtractedFeatures> {
  // 1. Resolve Groq's own API key. We deliberately read `GROQ_API_KEY`, NOT
  //    OPENAI_API_KEY — otherwise users running Groq would burn their OpenAI
  //    quota if both env vars happen to be set.
  const apiKey = opts.apiKey ?? process.env['GROQ_API_KEY'];
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new Error(
      'LLM_NO_API_KEY: GROQ_API_KEY env var not set. Set via: export GROQ_API_KEY=gsk_... (see README §--llm mode setup).',
    );
  }

  // 2. Dispatch to the OpenAI provider with overrides. We pass `apiKey`
  //    explicitly so the OpenAI client constructor uses Groq's key — the
  //    SDK does NOT read OPENAI_API_KEY from env when `apiKey` is passed
  //    to the constructor (verified against the OpenAI SDK type signature).
  const { extractWithOpenAI } = await import('./openai.js');
  return extractWithOpenAI(text, {
    ...opts,
    apiKey,
    baseURL: opts.baseURL ?? DEFAULT_GROQ_BASE_URL,
    model: opts.model ?? DEFAULT_GROQ_MODEL,
  });
}
