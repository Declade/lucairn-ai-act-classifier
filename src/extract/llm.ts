// LLM-based feature extractor scaffold (Day 9 + Day 10).
//
// Lights up the `--llm <provider>` CLI flag for `anthropic` (Day 9) + `openai`
// + `groq` (Day 10). Day 10 also adds an opt-out filesystem cache layer
// (lands in a follow-up commit).
//
// Architectural lock — `the LLM only extracts features`:
//   The LLM produces an ExtractedFeatures-shaped object (same shape as
//   keyword.ts). The downstream rules engine (article-5.ts, article-6-annex-iii.ts,
//   article-10/12/13/14/15.ts, article-50.ts, three-category.ts) consumes the
//   same shape unchanged. The LLM does NOT select articles or sub-letters; the
//   rules engine retains the deterministic citation-bearing decision path.
//
// Dynamic-import discipline:
//   - Provider SDKs (e.g. @anthropic-ai/sdk, openai) are loaded via
//     `await import('./providers/<name>.js')` at call-time, NOT at module-init.
//   - Provider modules themselves dynamic-import the upstream SDK so deterministic
//     mode stays zero-dep on provider SDKs (both SDKs are declared in
//     `optionalDependencies` — the default install does not pull them).
//   - If the SDK is absent + the user invokes `--llm <provider>`, we throw a
//     well-typed error with exit-code-3 stderr guidance.
//
// Lexicon-phrase validation:
//   - Each provider's extract function MUST cross-check every emitted phrase
//     against the active lexicon's `entries[].phrase` set; any phrase not in the
//     lexicon is dropped before constructing the returned ExtractedFeatures.
//   - This is the architectural guard against LLM hallucinations bypassing the
//     citation moat (the rules engine's `narrowSubLetters()` reads
//     `matched_phrases` and matches against EXACT lexicon strings).

import type { ExtractedFeatures } from './keyword.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported LLM provider IDs. Day 10 supports all three. */
export type LLMProvider = 'anthropic' | 'openai' | 'groq';

export interface LLMExtractOptions {
  /** Which provider to dispatch to. Day 10 supports `anthropic` + `openai` + `groq`. */
  provider: LLMProvider;
  /** Override automatic language detection (mirrors keyword.ts semantics). */
  lang?: 'en' | 'de';
  /** Override the default model for the provider. Provider-specific. Optional. */
  model?: string;
  /**
   * Abort/timeout signal. If unset, each provider applies its own 30s default.
   * Used by tests to short-circuit hangs.
   */
  signal?: AbortSignal;
  /**
   * Override the SDK `baseURL`. Day 10 load-bearing: the Groq provider passes
   * `https://api.groq.com/openai/v1` here so the OpenAI SDK reaches Groq's
   * upstream. Default undefined → SDK's own default endpoint.
   */
  baseURL?: string;
  /**
   * API key override. When set, takes precedence over `process.env.<PROVIDER>_API_KEY`.
   * The Groq provider passes its own `GROQ_API_KEY` here so the OpenAI SDK
   * never reads `OPENAI_API_KEY` from env on the Groq reuse path.
   */
  apiKey?: string;
}

/**
 * Provider extractor signature. Each provider module's `extract*` function
 * conforms to this shape. The provider is responsible for (a) reading its own
 * env vars, (b) dynamic-importing its SDK, (c) calling the API, (d) parsing
 * the structured output, (e) cross-checking against the lexicon, and
 * (f) returning a valid ExtractedFeatures.
 */
export type ProviderExtractFn = (
  text: string,
  opts: LLMExtractOptions,
) => Promise<ExtractedFeatures>;

// ---------------------------------------------------------------------------
// Provider dispatch
// ---------------------------------------------------------------------------

/**
 * Map of provider IDs → dynamic-importer of the provider's extract function.
 *
 * The importers are wrapped in arrow functions so that `import()` is only
 * invoked when a provider is actually selected — keeping deterministic mode
 * zero-network and zero-dep on provider SDKs. The dynamic-import path is also
 * what lets vitest swap in mocked providers via `vi.doMock(...)`.
 */
const PROVIDER_DISPATCH: Record<LLMProvider, () => Promise<ProviderExtractFn>> = {
  anthropic: async () => {
    const mod = await import('./providers/anthropic.js');
    return mod.extractWithAnthropic;
  },
  openai: async () => {
    const mod = await import('./providers/openai.js');
    return mod.extractWithOpenAI;
  },
  groq: async () => {
    const mod = await import('./providers/groq.js');
    return mod.extractWithGroq;
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract regulator-keyed features via an LLM provider.
 *
 * Pipeline:
 *   1. Validate `text` is a non-empty string after trim.
 *   2. Validate `opts.provider` is one of the supported provider IDs.
 *   3. Dynamic-import the provider's extract function (zero SDK dep at module init).
 *   4. Delegate. The provider returns a fully-formed ExtractedFeatures that the
 *      downstream rules engine consumes unchanged.
 *
 * The returned ExtractedFeatures has the same shape as keyword.ts emits, so the
 * caller (classify.ts) can swap extractors without any other change.
 *
 * @throws TypeError if text is not a non-empty string after trim.
 * @throws Error if provider is unknown OR if the provider dispatch throws
 *   (e.g. LLM_NO_API_KEY, LLM_SDK_NOT_INSTALLED, LLM_PARSE_ERROR).
 */
export async function extractFeaturesLLM(
  text: string,
  opts: LLMExtractOptions,
): Promise<ExtractedFeatures> {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new TypeError('extractFeaturesLLM(): input text must be a non-empty string.');
  }
  if (
    typeof opts !== 'object' ||
    opts === null ||
    typeof opts.provider !== 'string'
  ) {
    throw new TypeError('extractFeaturesLLM(): opts.provider is required.');
  }
  const importer = PROVIDER_DISPATCH[opts.provider as LLMProvider];
  if (importer === undefined) {
    throw new Error(
      `LLM_UNKNOWN_PROVIDER: unknown LLM provider "${opts.provider}". Supported: anthropic, openai, groq.`,
    );
  }
  const extractFn = await importer();
  return extractFn(text, opts);
}
