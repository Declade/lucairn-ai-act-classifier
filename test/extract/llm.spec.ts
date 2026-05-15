// Unit tests for src/extract/llm.ts — the provider-dispatch scaffold.
//
// These tests don't hit the real Anthropic API. The Day-9 provider
// implementation lives in src/extract/providers/anthropic.ts and is tested
// separately in test/extract/providers/anthropic.spec.ts with a mocked SDK.
//
// Here we cover the dispatch contract:
//   - input validation (non-empty text + provider)
//   - unknown provider → throws
//   - openai / groq → throw "not implemented in Day 9" message (Day-10 lighting)
//   - anthropic → routes to the provider module (real path, but with mocked SDK
//     in spec files lower down the tree; here we just confirm dispatch returns
//     the provider's promise).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractFeaturesLLM } from '../../src/extract/llm.js';

// Hoisted mock state so we can reset between tests.
const mockExtractWithAnthropic = vi.fn();

// Wire @anthropic-ai/sdk to a deterministic mock so any dynamic-import inside
// the provider doesn't hit the network. The mock returns a tool_use response
// shape that the provider can parse.
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    public readonly messages: {
      create: (params: unknown, opts?: { signal?: AbortSignal }) => Promise<{
        content: ReadonlyArray<unknown>;
      }>;
    };

    constructor(_opts: { apiKey: string }) {
      void _opts;
      this.messages = {
        create: async () => ({
          content: [
            {
              type: 'tool_use',
              name: 'emit_features',
              input: {
                byCategory: {
                  annex_iii: {},
                  article_5_prohibited: {},
                  article_50_gpai: {},
                  scope_qualifiers: {},
                },
              },
            },
          ],
        }),
      };
    }
  }
  return { default: MockAnthropic };
});

beforeEach(() => {
  mockExtractWithAnthropic.mockReset();
  process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-llm-spec';
});

afterEach(() => {
  delete process.env['ANTHROPIC_API_KEY'];
});

describe('extractFeaturesLLM — input validation', () => {
  it('throws TypeError on empty input', async () => {
    await expect(
      extractFeaturesLLM('', { provider: 'anthropic' }),
    ).rejects.toThrow(TypeError);
  });

  it('throws TypeError on whitespace-only input', async () => {
    await expect(
      extractFeaturesLLM('   \n\t  ', { provider: 'anthropic' }),
    ).rejects.toThrow(TypeError);
  });

  it('throws TypeError when opts.provider is missing', async () => {
    await expect(
      // @ts-expect-error — deliberately omitting provider for runtime validation
      extractFeaturesLLM('We use AI for CV screening.', {}),
    ).rejects.toThrow(TypeError);
  });

  it('throws Error with LLM_UNKNOWN_PROVIDER on unknown provider', async () => {
    await expect(
      // @ts-expect-error — testing runtime branch
      extractFeaturesLLM('We use AI for CV screening.', { provider: 'mistral' }),
    ).rejects.toThrow(/LLM_UNKNOWN_PROVIDER/);
  });
});

describe('extractFeaturesLLM — Day-10 multi-provider dispatch', () => {
  it('openai provider rejects with LLM_NO_API_KEY when OPENAI_API_KEY is absent', async () => {
    const prev = process.env['OPENAI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    try {
      await expect(
        extractFeaturesLLM('We use AI for CV screening.', {
          provider: 'openai',
        }),
      ).rejects.toThrow(/LLM_NO_API_KEY.*OPENAI_API_KEY/);
    } finally {
      if (prev !== undefined) process.env['OPENAI_API_KEY'] = prev;
    }
  });

  it('groq provider throws LLM_PROVIDER_NOT_IMPLEMENTED (lands in next commit)', async () => {
    await expect(
      extractFeaturesLLM('We use AI for CV screening.', { provider: 'groq' }),
    ).rejects.toThrow(/LLM_PROVIDER_NOT_IMPLEMENTED/);
  });
});

describe('extractFeaturesLLM — anthropic dispatch routing', () => {
  it('routes to the anthropic provider and returns ExtractedFeatures shape', async () => {
    const result = await extractFeaturesLLM(
      'We use AI for CV screening and applicant tracking for the hiring decision.',
      { provider: 'anthropic' },
    );
    expect(result).toBeDefined();
    expect(result.input).toContain('CV screening');
    expect(result.lang).toBe('en');
    expect(Array.isArray(result.hits)).toBe(true);
    expect(result.byCategory).toBeDefined();
    expect(typeof result.lexiconVersion).toBe('string');
  });

  it('propagates opts.lang override', async () => {
    const result = await extractFeaturesLLM(
      'Wir setzen ein KI-System zur Bewerberauswahl ein.',
      { provider: 'anthropic', lang: 'de' },
    );
    expect(result.lang).toBe('de');
  });

  it('propagates opts.signal abort to the provider', async () => {
    const controller = new AbortController();
    controller.abort();
    // The mocked SDK above does NOT honor the signal — it resolves immediately.
    // What we verify here is that the call did not throw on signal-construction
    // (separate spec in providers/anthropic.spec.ts verifies actual abort behavior).
    const result = await extractFeaturesLLM(
      'We use AI for CV screening.',
      { provider: 'anthropic', signal: controller.signal },
    );
    expect(result).toBeDefined();
  });
});
