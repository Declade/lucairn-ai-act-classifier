// Unit tests for src/extract/providers/groq.ts.
//
// The Groq provider is a thin wrapper around `extractWithOpenAI` that:
//   1. Reads its own `GROQ_API_KEY` env var (NOT `OPENAI_API_KEY`).
//   2. Forces `baseURL = https://api.groq.com/openai/v1`.
//   3. Defaults to Groq's flagship model `llama-3.3-70b-versatile`.
//   4. Passes the Groq API key EXPLICITLY to the underlying OpenAI client
//      constructor so OPENAI_API_KEY env is never polluted/consulted.
//
// All tests run against the same mocked `openai` SDK module the OpenAI
// provider uses (via vi.mock). The mock captures the constructor opts so
// we can assert: apiKey, baseURL, and the lack of env-key leakage.

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
let lastClientCtorOpts: { apiKey?: string; baseURL?: string } | null = null;
let createCallCount = 0;

vi.mock('openai', () => {
  class MockOpenAI {
    public readonly chat: {
      completions: {
        create: (
          params: Record<string, unknown>,
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
          create: async (params: Record<string, unknown>) => {
            lastCreateParams = params;
            createCallCount += 1;

            const response = mockResponseQueue.shift();
            if (response === undefined) {
              throw new Error(
                `[groq.spec.ts] mockResponseQueue exhausted on call ${createCallCount}; test setup error.`,
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

import { extractWithGroq } from '../../../src/extract/providers/groq.js';

beforeEach(() => {
  mockResponseQueue.length = 0;
  lastCreateParams = null;
  lastClientCtorOpts = null;
  createCallCount = 0;
  process.env['GROQ_API_KEY'] = 'gsk_test_fake_groq_key_for_spec';
  // Explicitly clear OPENAI_API_KEY to prove the Groq path does NOT read it.
  delete process.env['OPENAI_API_KEY'];
});

afterEach(() => {
  delete process.env['GROQ_API_KEY'];
  delete process.env['OPENAI_API_KEY'];
});

describe('extractWithGroq — happy paths', () => {
  it('returns valid ExtractedFeatures on canned Annex III employment response (EN)', async () => {
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

    const result = await extractWithGroq(
      'AI system that screens CVs for the hiring decision.',
      { provider: 'groq' },
    );

    expect(result.lang).toBe('en');
    expect(result.hits.length).toBe(1);
    expect(result.hits[0]?.group).toBe('annex_iii');
    expect(result.hits[0]?.category).toBe('4_employment');
  });

  it('routes through the OpenAI client constructor with Groq baseURL', async () => {
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

    await extractWithGroq('AI for something', { provider: 'groq' });
    expect(lastClientCtorOpts?.baseURL).toBe('https://api.groq.com/openai/v1');
  });

  it('uses default model llama-3.3-70b-versatile when not overridden', async () => {
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

    await extractWithGroq('AI for something', { provider: 'groq' });
    expect(lastCreateParams?.['model']).toBe('llama-3.3-70b-versatile');
  });

  it('honors opts.model override (lets caller pick a different Groq model)', async () => {
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

    await extractWithGroq('AI for something', {
      provider: 'groq',
      model: 'llama-3.1-70b-versatile',
    });
    expect(lastCreateParams?.['model']).toBe('llama-3.1-70b-versatile');
  });
});

describe('extractWithGroq — secrets hygiene (load-bearing)', () => {
  it('passes GROQ_API_KEY explicitly to OpenAI client constructor', async () => {
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

    await extractWithGroq('AI for something', { provider: 'groq' });
    expect(lastClientCtorOpts?.apiKey).toBe('gsk_test_fake_groq_key_for_spec');
  });

  it('does NOT pollute process.env.OPENAI_API_KEY (key passed via constructor, not env)', async () => {
    expect(process.env['OPENAI_API_KEY']).toBeUndefined();
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
    await extractWithGroq('AI for something', { provider: 'groq' });
    // After the call, OPENAI_API_KEY MUST still be unset — the Groq path
    // passes the key via the OpenAI client constructor and never touches env.
    expect(process.env['OPENAI_API_KEY']).toBeUndefined();
  });

  it('rejects with LLM_NO_API_KEY when GROQ_API_KEY is absent', async () => {
    delete process.env['GROQ_API_KEY'];
    await expect(
      extractWithGroq('AI for something', { provider: 'groq' }),
    ).rejects.toThrow(/LLM_NO_API_KEY.*GROQ_API_KEY/);
  });

  it('rejects with LLM_NO_API_KEY when GROQ_API_KEY is an empty string', async () => {
    process.env['GROQ_API_KEY'] = '';
    await expect(
      extractWithGroq('AI for something', { provider: 'groq' }),
    ).rejects.toThrow(/LLM_NO_API_KEY.*GROQ_API_KEY/);
  });
});

describe('extractWithGroq — transitive hallucination filtering', () => {
  it('drops phrases not in the lexicon (via the OpenAI provider it reuses)', async () => {
    mockResponseQueue.push({
      kind: 'tool_call',
      toolCallName: 'emit_features',
      argumentsJson: JSON.stringify({
        byCategory: {
          annex_iii: {
            '4_employment': ['cv screening', 'totally invented phrase'],
          },
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      }),
    });

    const result = await extractWithGroq('AI screening', { provider: 'groq' });
    expect(result.hits.map((h) => h.phrase)).toEqual(['cv screening']);
  });
});
