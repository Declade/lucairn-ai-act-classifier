// Unit tests for src/extract/providers/openai.ts.
//
// All tests run against a mocked `openai` SDK module via vi.mock. The mock
// lets each test customize the chat-completion response, so we cover the
// full surface: happy paths, hallucination-drop, parse-error retry, error
// handling, env-var checks, baseURL propagation (load-bearing for Groq
// reuse), abort signal, JSON-string arguments parsing.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type MockToolCall = {
  function: { name: string; arguments: string };
};

type MockResponse =
  | { kind: 'tool_call'; toolCallName: string; argumentsJson: string }
  | { kind: 'text-only'; text: string }
  | { kind: 'throw'; error: Error };

const mockResponseQueue: MockResponse[] = [];
let lastCreateParams: Record<string, unknown> | null = null;
let lastCreateOpts: { signal?: AbortSignal } | undefined = undefined;
let lastClientCtorOpts: { apiKey?: string; baseURL?: string } | null = null;
let createCallCount = 0;

vi.mock('openai', () => {
  class MockOpenAI {
    public readonly chat: {
      completions: {
        create: (
          params: Record<string, unknown>,
          opts?: { signal?: AbortSignal },
        ) => Promise<{
          choices: ReadonlyArray<{
            message?: { tool_calls?: ReadonlyArray<MockToolCall>; content?: string | null };
          }>;
        }>;
      };
    };

    constructor(opts: { apiKey: string; baseURL?: string }) {
      lastClientCtorOpts = opts;
      this.chat = {
        completions: {
          create: async (
            params: Record<string, unknown>,
            createOpts?: { signal?: AbortSignal },
          ) => {
            lastCreateParams = params;
            lastCreateOpts = createOpts;
            createCallCount += 1;

            const response = mockResponseQueue.shift();
            if (response === undefined) {
              throw new Error(
                `[openai.spec.ts] mockResponseQueue exhausted on call ${createCallCount}; test setup error.`,
              );
            }

            if (response.kind === 'throw') {
              throw response.error;
            }
            if (response.kind === 'text-only') {
              return { choices: [{ message: { content: response.text } }] };
            }
            return {
              choices: [
                {
                  message: {
                    tool_calls: [
                      {
                        function: {
                          name: response.toolCallName,
                          arguments: response.argumentsJson,
                        },
                      },
                    ],
                  },
                },
              ],
            };
          },
        },
      };
    }
  }
  return { default: MockOpenAI };
});

// Import AFTER vi.mock so the mock is in place.
import { extractWithOpenAI } from '../../../src/extract/providers/openai.js';

beforeEach(() => {
  mockResponseQueue.length = 0;
  lastCreateParams = null;
  lastCreateOpts = undefined;
  lastClientCtorOpts = null;
  createCallCount = 0;
  process.env['OPENAI_API_KEY'] = 'sk-openai-test-fake-key-for-spec';
});

afterEach(() => {
  delete process.env['OPENAI_API_KEY'];
  delete process.env['AI_ACT_CLASSIFY_DEBUG'];
});

describe('extractWithOpenAI — happy paths', () => {
  it('returns valid ExtractedFeatures on canned Annex III employment response (EN)', async () => {
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: JSON.stringify({
        byCategory: {
          annex_iii: { '4_employment': ['cv screening', 'applicant tracking'] },
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      }),
    });

    const result = await extractWithOpenAI(
      'AI system that screens CVs and tracks applicants for the hiring decision.',
      { provider: 'openai' },
    );

    expect(result.lang).toBe('en');
    expect(result.lexiconVersion).toBeDefined();
    expect(result.hits.length).toBe(2);
    expect(result.hits.every((h) => h.group === 'annex_iii')).toBe(true);
    expect(result.byCategory['annex_iii']?.['4_employment']).toEqual(['cv screening', 'applicant tracking']);
  });

  it('returns valid ExtractedFeatures on canned Article 5 prohibited response (DE)', async () => {
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: JSON.stringify({
        byCategory: {
          annex_iii: {},
          article_5_prohibited: { 'c_social_scoring': ['sozialbewertung'] },
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      }),
    });

    const result = await extractWithOpenAI(
      'Wir nutzen ein KI-System für soziales Scoring von Bürgern durch eine Behörde.',
      { provider: 'openai', lang: 'de' },
    );

    expect(result.lang).toBe('de');
    expect(result.hits.length).toBe(1);
    expect(result.hits[0]?.group).toBe('article_5_prohibited');
    expect(result.hits[0]?.category).toBe('c_social_scoring');
    expect(result.hits[0]?.phrase).toBe('sozialbewertung');
  });

  it('returns empty hits when LLM emits empty byCategory (out-of-scope input)', async () => {
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: JSON.stringify({
        byCategory: {
          annex_iii: {},
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      }),
    });

    const result = await extractWithOpenAI(
      'A weather forecasting tool that predicts precipitation for the next 24 hours.',
      { provider: 'openai', lang: 'en' },
    );

    expect(result.hits.length).toBe(0);
    expect(Object.keys(result.byCategory).every((g) => Object.keys(result.byCategory[g] ?? {}).length === 0)).toBe(true);
  });
});

describe('extractWithOpenAI — hallucination filtering (CRITICAL invariant)', () => {
  it('drops phrases not in the lexicon (case-insensitive canonical match)', async () => {
    process.env['AI_ACT_CLASSIFY_DEBUG'] = '1';
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: JSON.stringify({
        byCategory: {
          annex_iii: {
            '4_employment': ['CV Screening', 'totally invented phrase that does not exist', 'applicant tracking'],
          },
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      }),
    });

    const result = await extractWithOpenAI(
      'AI system for screening job candidates.',
      { provider: 'openai', lang: 'en' },
    );

    // 'CV Screening' canonicalises to 'cv screening' (in lexicon); kept.
    // 'totally invented phrase...' NOT in lexicon; dropped.
    // 'applicant tracking' lowercase; in lexicon; kept.
    expect(result.hits.length).toBe(2);
    const phrases = result.hits.map((h) => h.phrase);
    expect(phrases).toContain('CV Screening');
    expect(phrases).toContain('applicant tracking');
    expect(phrases).not.toContain('totally invented phrase that does not exist');
  });

  it('drops entire bucket when LLM emits unknown category_key', async () => {
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: JSON.stringify({
        byCategory: {
          annex_iii: {
            '99_completely_made_up_category': ['some phrase the model invented'],
          },
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      }),
    });

    const result = await extractWithOpenAI(
      'AI system for something.',
      { provider: 'openai', lang: 'en' },
    );

    expect(result.hits.length).toBe(0);
  });
});

describe('extractWithOpenAI — error paths', () => {
  it('throws LLM_NO_API_KEY when env var is absent', async () => {
    delete process.env['OPENAI_API_KEY'];

    await expect(
      extractWithOpenAI('We use AI for CV screening.', { provider: 'openai' }),
    ).rejects.toThrow(/LLM_NO_API_KEY/);
  });

  it('throws LLM_NO_API_KEY when env var is empty string', async () => {
    process.env['OPENAI_API_KEY'] = '';

    await expect(
      extractWithOpenAI('We use AI for CV screening.', { provider: 'openai' }),
    ).rejects.toThrow(/LLM_NO_API_KEY/);
  });

  it('accepts opts.apiKey override (load-bearing for Groq reuse path)', async () => {
    // Delete env key to prove apiKey override wins.
    delete process.env['OPENAI_API_KEY'];
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: JSON.stringify({
        byCategory: {
          annex_iii: {},
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      }),
    });
    await extractWithOpenAI('AI for something', {
      provider: 'openai',
      apiKey: 'gsk-groq-test-key-for-spec',
    });
    expect(lastClientCtorOpts?.apiKey).toBe('gsk-groq-test-key-for-spec');
  });

  it('throws LLM_PARSE_ERROR on JSON parse failure of tool_call.function.arguments', async () => {
    // Both attempts return invalid JSON string.
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: '{this is not valid json',
    });
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: '{this is still not valid json',
    });

    await expect(
      extractWithOpenAI('We use AI for CV screening.', { provider: 'openai' }),
    ).rejects.toThrow(/LLM_PARSE_ERROR/);
    expect(createCallCount).toBe(2);
  });

  it('throws LLM_PARSE_ERROR after two malformed responses (schema-invalid)', async () => {
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: JSON.stringify({ byCategory: 'this should be an object, not a string' }),
    });
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: JSON.stringify({ byCategory: { annex_iii: 'not a record' } }),
    });

    await expect(
      extractWithOpenAI('We use AI for CV screening.', { provider: 'openai' }),
    ).rejects.toThrow(/LLM_PARSE_ERROR/);
    expect(createCallCount).toBe(2);
  });

  it('throws LLM_PARSE_ERROR after two text-only responses (no tool_call)', async () => {
    mockResponseQueue.push({ kind: 'text-only', text: 'sorry, I cannot help with that' });
    mockResponseQueue.push({ kind: 'text-only', text: 'still cannot help' });

    await expect(
      extractWithOpenAI('We use AI for CV screening.', { provider: 'openai' }),
    ).rejects.toThrow(/LLM_PARSE_ERROR/);
    expect(createCallCount).toBe(2);
  });

  it('throws LLM_API_ERROR on SDK network failure (no retry)', async () => {
    mockResponseQueue.push({
      kind: 'throw',
      error: new Error('ECONNRESET: connection reset by peer'),
    });

    await expect(
      extractWithOpenAI('We use AI for CV screening.', { provider: 'openai' }),
    ).rejects.toThrow(/LLM_API_ERROR/);

    expect(createCallCount).toBe(1);
  });

  it('redacts API key from LLM_API_ERROR messages', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-openai-secret-key-must-not-leak';
    mockResponseQueue.push({
      kind: 'throw',
      error: new Error('failed with key sk-openai-secret-key-must-not-leak in URL'),
    });

    let thrown: Error | null = null;
    try {
      await extractWithOpenAI('We use AI for CV screening.', { provider: 'openai' });
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).not.toBeNull();
    expect(thrown?.message).toContain('LLM_API_ERROR');
    expect(thrown?.message).toContain('<redacted>');
    expect(thrown?.message).not.toContain('sk-openai-secret-key-must-not-leak');
  });

  it('recovers when first response is malformed and second is valid', async () => {
    mockResponseQueue.push({ kind: 'text-only', text: 'no tool call' });
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: JSON.stringify({
        byCategory: {
          annex_iii: { '4_employment': ['cv screening'] },
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      }),
    });

    const result = await extractWithOpenAI('CV screening tool', { provider: 'openai' });
    expect(result.hits.length).toBe(1);
    expect(createCallCount).toBe(2);
  });
});

describe('extractWithOpenAI — protocol details', () => {
  it('passes signal through to SDK request', async () => {
    const controller = new AbortController();
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: JSON.stringify({
        byCategory: {
          annex_iii: {},
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      }),
    });

    await extractWithOpenAI('AI for something', {
      provider: 'openai',
      signal: controller.signal,
    });

    expect(lastCreateOpts?.signal).toBe(controller.signal);
  });

  it('uses default model gpt-4o-mini when not overridden', async () => {
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: JSON.stringify({
        byCategory: {
          annex_iii: {},
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      }),
    });

    await extractWithOpenAI('AI for something', { provider: 'openai' });
    expect(lastCreateParams?.['model']).toBe('gpt-4o-mini');
  });

  it('honors opts.model override', async () => {
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: JSON.stringify({
        byCategory: {
          annex_iii: {},
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      }),
    });

    await extractWithOpenAI('AI for something', {
      provider: 'openai',
      model: 'gpt-4o',
    });
    expect(lastCreateParams?.['model']).toBe('gpt-4o');
  });

  it('forces tool_choice on emit_features function', async () => {
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: JSON.stringify({
        byCategory: {
          annex_iii: {},
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      }),
    });

    await extractWithOpenAI('AI for something', { provider: 'openai' });
    expect(lastCreateParams?.['tool_choice']).toEqual({
      type: 'function',
      function: { name: 'emit_features' },
    });
  });

  it('passes opts.baseURL to SDK client constructor (load-bearing for Groq reuse)', async () => {
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: JSON.stringify({
        byCategory: {
          annex_iii: {},
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      }),
    });

    await extractWithOpenAI('AI for something', {
      provider: 'openai',
      baseURL: 'https://api.groq.com/openai/v1',
    });
    expect(lastClientCtorOpts?.baseURL).toBe('https://api.groq.com/openai/v1');
  });

  it('omits baseURL from constructor opts when not supplied (SDK uses its default endpoint)', async () => {
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: JSON.stringify({
        byCategory: {
          annex_iii: {},
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      }),
    });

    await extractWithOpenAI('AI for something', { provider: 'openai' });
    expect(lastClientCtorOpts?.baseURL).toBeUndefined();
  });

  it('emits sources from the lexicon category metadata on each hit', async () => {
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: JSON.stringify({
        byCategory: {
          annex_iii: { '4_employment': ['cv screening'] },
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      }),
    });

    const result = await extractWithOpenAI('CV screening tool', { provider: 'openai' });
    expect(result.hits.length).toBe(1);
    expect(result.hits[0]?.source).toMatch(/eur-lex\.europa\.eu/);
  });
});
