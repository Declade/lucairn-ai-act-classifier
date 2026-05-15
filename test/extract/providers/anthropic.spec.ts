// Unit tests for src/extract/providers/anthropic.ts.
//
// All tests run against a mocked @anthropic-ai/sdk module via vi.mock. The
// mock lets each test customize the tool_use response the SDK would return,
// so we cover the full surface: happy paths, hallucination-drop, parse-error
// retry, error handling, env-var checks.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Tracks the queue of responses the mocked client should return on
// subsequent messages.create() calls. Each test seeds this before running.
type MockResponse =
  | { kind: 'tool_use'; toolName: string; input: unknown }
  | { kind: 'tool_use-multi'; blocks: ReadonlyArray<{ type: string; name?: string; input?: unknown; text?: string }> }
  | { kind: 'text-only'; text: string }
  | { kind: 'throw'; error: Error };

const mockResponseQueue: MockResponse[] = [];
let lastCreateParams: Record<string, unknown> | null = null;
let lastCreateOpts: { signal?: AbortSignal } | undefined = undefined;
let createCallCount = 0;

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    public readonly messages: {
      create: (
        params: Record<string, unknown>,
        opts?: { signal?: AbortSignal },
      ) => Promise<{ content: ReadonlyArray<{ type: string; name?: string; input?: unknown; text?: string }> }>;
    };

    constructor(opts: { apiKey: string }) {
      // Sanity assertion — the provider must pass apiKey. We don't assert here
      // because the test framework runs constructor in dispatch path and we
      // verify via params capture in messages.create.
      void opts;
      this.messages = {
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
              `[anthropic.spec.ts] mockResponseQueue exhausted on call ${createCallCount}; test setup error.`,
            );
          }

          if (response.kind === 'throw') {
            throw response.error;
          }
          if (response.kind === 'text-only') {
            return { content: [{ type: 'text', text: response.text }] };
          }
          if (response.kind === 'tool_use') {
            return {
              content: [
                {
                  type: 'tool_use',
                  name: response.toolName,
                  input: response.input,
                },
              ],
            };
          }
          // tool_use-multi
          return { content: response.blocks };
        },
      };
    }
  }
  return { default: MockAnthropic };
});

// Import AFTER vi.mock so the mock is in place.
import { extractWithAnthropic } from '../../../src/extract/providers/anthropic.js';

beforeEach(() => {
  mockResponseQueue.length = 0;
  lastCreateParams = null;
  lastCreateOpts = undefined;
  createCallCount = 0;
  process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-fake-key-for-spec';
});

afterEach(() => {
  delete process.env['ANTHROPIC_API_KEY'];
  delete process.env['AI_ACT_CLASSIFY_DEBUG'];
});

describe('extractWithAnthropic — happy paths', () => {
  it('returns valid ExtractedFeatures on canned Annex III employment response (EN)', async () => {
    mockResponseQueue.push({
      kind: 'tool_use',
      toolName: 'emit_features',
      input: {
        byCategory: {
          annex_iii: { '4_employment': ['cv screening', 'applicant tracking'] },
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      },
    });

    const result = await extractWithAnthropic(
      'AI system that screens CVs and tracks applicants for the hiring decision.',
      { provider: 'anthropic' },
    );

    expect(result.lang).toBe('en');
    expect(result.lexiconVersion).toBeDefined();
    expect(result.hits.length).toBe(2);
    expect(result.hits.every((h) => h.group === 'annex_iii')).toBe(true);
    expect(result.byCategory['annex_iii']?.['4_employment']).toEqual(['cv screening', 'applicant tracking']);
  });

  it('returns valid ExtractedFeatures on canned Article 5 prohibited response (DE)', async () => {
    mockResponseQueue.push({
      kind: 'tool_use',
      toolName: 'emit_features',
      input: {
        byCategory: {
          annex_iii: {},
          article_5_prohibited: { 'c_social_scoring': ['sozialbewertung'] },
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      },
    });

    const result = await extractWithAnthropic(
      'Wir nutzen ein KI-System für soziales Scoring von Bürgern durch eine Behörde.',
      { provider: 'anthropic', lang: 'de' },
    );

    expect(result.lang).toBe('de');
    expect(result.hits.length).toBe(1);
    expect(result.hits[0]?.group).toBe('article_5_prohibited');
    expect(result.hits[0]?.category).toBe('c_social_scoring');
    expect(result.hits[0]?.phrase).toBe('sozialbewertung');
  });

  it('returns empty hits when LLM emits empty byCategory (out-of-scope input)', async () => {
    mockResponseQueue.push({
      kind: 'tool_use',
      toolName: 'emit_features',
      input: {
        byCategory: {
          annex_iii: {},
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      },
    });

    const result = await extractWithAnthropic(
      'A weather forecasting tool that predicts precipitation for the next 24 hours.',
      { provider: 'anthropic', lang: 'en' },
    );

    expect(result.hits.length).toBe(0);
    expect(Object.keys(result.byCategory).every((g) => Object.keys(result.byCategory[g] ?? {}).length === 0)).toBe(true);
  });
});

describe('extractWithAnthropic — hallucination filtering (CRITICAL invariant)', () => {
  it('drops phrases not in the lexicon (case-insensitive canonical match)', async () => {
    process.env['AI_ACT_CLASSIFY_DEBUG'] = '1'; // exercises the debug trace branch
    mockResponseQueue.push({
      kind: 'tool_use',
      toolName: 'emit_features',
      input: {
        byCategory: {
          annex_iii: {
            // 'CV screening' is in the lexicon; 'totally invented phrase' is not.
            // We also include uppercase to verify the canonical lowercase match.
            '4_employment': ['CV Screening', 'totally invented phrase that does not exist', 'applicant tracking'],
          },
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      },
    });

    const result = await extractWithAnthropic(
      'AI system for screening job candidates.',
      { provider: 'anthropic', lang: 'en' },
    );

    // 'CV Screening' canonicalises to 'cv screening' (in lexicon); kept (verbatim
    // as emitted by the LLM, preserving original case).
    // 'totally invented phrase...' canonicalises to itself; NOT in lexicon; dropped.
    // 'applicant tracking' lowercase; in lexicon; kept.
    expect(result.hits.length).toBe(2);
    const phrases = result.hits.map((h) => h.phrase);
    expect(phrases).toContain('CV Screening');
    expect(phrases).toContain('applicant tracking');
    expect(phrases).not.toContain('totally invented phrase that does not exist');
  });

  it('drops entire bucket when LLM emits unknown category_key', async () => {
    mockResponseQueue.push({
      kind: 'tool_use',
      toolName: 'emit_features',
      input: {
        byCategory: {
          annex_iii: {
            '99_completely_made_up_category': ['some phrase the model invented'],
          },
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      },
    });

    const result = await extractWithAnthropic(
      'AI system for something.',
      { provider: 'anthropic', lang: 'en' },
    );

    expect(result.hits.length).toBe(0);
  });
});

describe('extractWithAnthropic — error paths', () => {
  it('throws LLM_NO_API_KEY when env var is absent', async () => {
    delete process.env['ANTHROPIC_API_KEY'];

    await expect(
      extractWithAnthropic('We use AI for CV screening.', { provider: 'anthropic' }),
    ).rejects.toThrow(/LLM_NO_API_KEY/);
  });

  it('throws LLM_NO_API_KEY when env var is empty string', async () => {
    process.env['ANTHROPIC_API_KEY'] = '';

    await expect(
      extractWithAnthropic('We use AI for CV screening.', { provider: 'anthropic' }),
    ).rejects.toThrow(/LLM_NO_API_KEY/);
  });

  it('throws LLM_PARSE_ERROR after two malformed responses', async () => {
    // First response: invalid shape.
    mockResponseQueue.push({
      kind: 'tool_use',
      toolName: 'emit_features',
      input: { byCategory: 'this should be an object, not a string' },
    });
    // Second response: still invalid.
    mockResponseQueue.push({
      kind: 'tool_use',
      toolName: 'emit_features',
      input: { byCategory: { annex_iii: 'not a record' } },
    });

    await expect(
      extractWithAnthropic('We use AI for CV screening.', { provider: 'anthropic' }),
    ).rejects.toThrow(/LLM_PARSE_ERROR/);

    expect(createCallCount).toBe(2);
  });

  it('throws LLM_PARSE_ERROR after two text-only responses (no tool_use block)', async () => {
    mockResponseQueue.push({ kind: 'text-only', text: 'sorry, I cannot help with that' });
    mockResponseQueue.push({ kind: 'text-only', text: 'still cannot help' });

    await expect(
      extractWithAnthropic('We use AI for CV screening.', { provider: 'anthropic' }),
    ).rejects.toThrow(/LLM_PARSE_ERROR/);

    expect(createCallCount).toBe(2);
  });

  it('throws LLM_API_ERROR on SDK network failure (no retry)', async () => {
    mockResponseQueue.push({
      kind: 'throw',
      error: new Error('ECONNRESET: connection reset by peer'),
    });

    await expect(
      extractWithAnthropic('We use AI for CV screening.', { provider: 'anthropic' }),
    ).rejects.toThrow(/LLM_API_ERROR/);

    // Network errors do NOT trigger the retry loop — we throw immediately.
    expect(createCallCount).toBe(1);
  });

  it('redacts API key from LLM_API_ERROR messages', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-secret-key-must-not-leak';
    mockResponseQueue.push({
      kind: 'throw',
      error: new Error('failed with key sk-ant-secret-key-must-not-leak in URL'),
    });

    let thrown: Error | null = null;
    try {
      await extractWithAnthropic('We use AI for CV screening.', { provider: 'anthropic' });
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).not.toBeNull();
    expect(thrown?.message).toContain('LLM_API_ERROR');
    expect(thrown?.message).toContain('<redacted>');
    expect(thrown?.message).not.toContain('sk-ant-secret-key-must-not-leak');
  });

  it('recovers when first response is malformed and second is valid', async () => {
    mockResponseQueue.push({ kind: 'text-only', text: 'no tool call' });
    mockResponseQueue.push({
      kind: 'tool_use',
      toolName: 'emit_features',
      input: {
        byCategory: {
          annex_iii: { '4_employment': ['cv screening'] },
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      },
    });

    const result = await extractWithAnthropic('CV screening tool', { provider: 'anthropic' });
    expect(result.hits.length).toBe(1);
    expect(createCallCount).toBe(2);
  });
});

describe('extractWithAnthropic — protocol details', () => {
  it('passes signal through to SDK request', async () => {
    const controller = new AbortController();
    mockResponseQueue.push({
      kind: 'tool_use',
      toolName: 'emit_features',
      input: {
        byCategory: {
          annex_iii: {},
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      },
    });

    await extractWithAnthropic('AI for something', {
      provider: 'anthropic',
      signal: controller.signal,
    });

    expect(lastCreateOpts?.signal).toBe(controller.signal);
  });

  it('uses default model claude-haiku-4-5-20251001 when not overridden', async () => {
    mockResponseQueue.push({
      kind: 'tool_use',
      toolName: 'emit_features',
      input: {
        byCategory: {
          annex_iii: {},
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      },
    });

    await extractWithAnthropic('AI for something', { provider: 'anthropic' });

    expect(lastCreateParams?.['model']).toBe('claude-haiku-4-5-20251001');
  });

  it('honors opts.model override', async () => {
    mockResponseQueue.push({
      kind: 'tool_use',
      toolName: 'emit_features',
      input: {
        byCategory: {
          annex_iii: {},
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      },
    });

    await extractWithAnthropic('AI for something', {
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001-custom',
    });

    expect(lastCreateParams?.['model']).toBe('claude-haiku-4-5-20251001-custom');
  });

  it('forces tool_choice on emit_features', async () => {
    mockResponseQueue.push({
      kind: 'tool_use',
      toolName: 'emit_features',
      input: {
        byCategory: {
          annex_iii: {},
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      },
    });

    await extractWithAnthropic('AI for something', { provider: 'anthropic' });

    expect(lastCreateParams?.['tool_choice']).toEqual({
      type: 'tool',
      name: 'emit_features',
    });
  });

  it('emits sources from the lexicon category metadata on each hit', async () => {
    mockResponseQueue.push({
      kind: 'tool_use',
      toolName: 'emit_features',
      input: {
        byCategory: {
          annex_iii: { '4_employment': ['cv screening'] },
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      },
    });

    const result = await extractWithAnthropic('CV screening tool', { provider: 'anthropic' });

    expect(result.hits.length).toBe(1);
    expect(result.hits[0]?.source).toMatch(/eur-lex\.europa\.eu/);
  });
});

describe('extractWithAnthropic — negative content (out-of-scope inputs)', () => {
  it('returns empty hits when LLM correctly says nothing fires on a weather tool', async () => {
    mockResponseQueue.push({
      kind: 'tool_use',
      toolName: 'emit_features',
      input: {
        byCategory: {
          annex_iii: {},
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      },
    });

    const result = await extractWithAnthropic(
      'A weather forecasting model that predicts rainfall.',
      { provider: 'anthropic', lang: 'en' },
    );

    expect(result.hits.length).toBe(0);
  });

  it('returns empty hits on a generic recipe-recommender input', async () => {
    mockResponseQueue.push({
      kind: 'tool_use',
      toolName: 'emit_features',
      input: {
        byCategory: {
          annex_iii: {},
          article_5_prohibited: {},
          article_50_gpai: {},
          scope_qualifiers: {},
        },
      },
    });

    const result = await extractWithAnthropic(
      'AI-Rezeptempfehlungen basierend auf Vorlieben des Nutzers.',
      { provider: 'anthropic', lang: 'de' },
    );

    expect(result.hits.length).toBe(0);
  });
});
