// Integration tests for the LLM-mode filesystem cache as wired through
// `extractFeaturesLLM` (Day-10 fix-up round 1, bug-hunter M4 closure).
//
// Locks 3 invariants the cache-layer architecture promises:
//   1. Cache-hit short-circuits the provider call (no second API spend).
//   2. Failed provider calls are NEVER written to cache (cache directory
//      stays empty after a rejected call).
//   3. cache.disabled === true bypasses BOTH read and write paths.
//
// The tests use a hoisted call counter in the vi.mock factory so the
// post-cache-hit assertion `mockCallCount === 1` is empirically observable.
// Each test uses a fresh tmpdir for cacheDir so test bleed-over is impossible.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Hoisted mock state. Vitest hoists vi.mock above imports, so a top-level
// `let` here is initialized AFTER the mock factory runs once — but the
// factory captures the closure reference, so subsequent assignments are
// visible inside the mock.
const mockState = {
  callCount: 0,
  shouldError: false,
};

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
        create: async () => {
          mockState.callCount += 1;
          if (mockState.shouldError) {
            throw new Error('mocked API error');
          }
          return {
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
          };
        },
      };
    }
  }
  return { default: MockAnthropic };
});

// Import AFTER vi.mock so the dynamic-import inside extractFeaturesLLM
// resolves to the mock.
import { extractFeaturesLLM } from '../../src/extract/llm.js';

let tmpCacheDir = '';

beforeEach(() => {
  mockState.callCount = 0;
  mockState.shouldError = false;
  process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-cache-integration';
  tmpCacheDir = mkdtempSync(join(tmpdir(), 'llm-cache-integration-'));
});

afterEach(() => {
  delete process.env['ANTHROPIC_API_KEY'];
  if (tmpCacheDir.length > 0 && existsSync(tmpCacheDir)) {
    rmSync(tmpCacheDir, { recursive: true, force: true });
  }
});

describe('extractFeaturesLLM — cache integration (regression locks; bug-hunter M4)', () => {
  it('cache-write happens after successful provider return; second call on the same input is a HIT (no provider call)', async () => {
    const input = 'We use AI for CV screening and applicant tracking for the hiring decision.';

    // First call: cache miss → provider runs → cache write.
    const r1 = await extractFeaturesLLM(input, {
      provider: 'anthropic',
      cache: { cacheDir: tmpCacheDir },
    });
    expect(mockState.callCount).toBe(1);
    expect(r1.input).toContain('CV screening');

    // Second call on byte-identical input: cache hit → no provider call.
    const r2 = await extractFeaturesLLM(input, {
      provider: 'anthropic',
      cache: { cacheDir: tmpCacheDir },
    });
    expect(mockState.callCount).toBe(1); // unchanged — cache hit short-circuited
    expect(r2.input).toContain('CV screening');

    // The cache file should exist on disk.
    const llmDir = join(tmpCacheDir, 'llm');
    expect(existsSync(llmDir)).toBe(true);
    const files = readdirSync(llmDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBe(1);
  });

  it('cache-write does NOT happen on provider error (failed calls are not cached)', async () => {
    const input = 'We use AI for CV screening for the hiring decision.';
    mockState.shouldError = true;

    await expect(
      extractFeaturesLLM(input, {
        provider: 'anthropic',
        cache: { cacheDir: tmpCacheDir },
      }),
    ).rejects.toThrow();
    expect(mockState.callCount).toBe(1); // the provider was called

    // The cache `<root>/llm/` directory either doesn't exist (provider threw
    // before cacheWrite() ran mkdir) or is empty — either is acceptable.
    const llmDir = join(tmpCacheDir, 'llm');
    if (existsSync(llmDir)) {
      const cached = readdirSync(llmDir).filter((f) => f.endsWith('.json'));
      expect(cached.length).toBe(0);
    }
  });

  it('cache.disabled=true bypasses both read AND write paths', async () => {
    const input = 'We use AI for CV screening and applicant tracking for the hiring decision.';

    await extractFeaturesLLM(input, {
      provider: 'anthropic',
      cache: { cacheDir: tmpCacheDir, disabled: true },
    });
    expect(mockState.callCount).toBe(1);

    // Second call with disabled=true on the SAME input → must call provider
    // again (no read), and must not have written anything from the first call
    // (no write).
    await extractFeaturesLLM(input, {
      provider: 'anthropic',
      cache: { cacheDir: tmpCacheDir, disabled: true },
    });
    expect(mockState.callCount).toBe(2);

    // No cache files should exist on disk (write was bypassed both times).
    const llmDir = join(tmpCacheDir, 'llm');
    if (existsSync(llmDir)) {
      const cached = readdirSync(llmDir).filter((f) => f.endsWith('.json'));
      expect(cached.length).toBe(0);
    }
  });
});
