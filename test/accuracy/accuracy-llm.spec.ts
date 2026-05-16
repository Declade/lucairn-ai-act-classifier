// Vitest spec for the Day-9 LLM-mode accuracy harness.
//
// All tests use a mocked @anthropic-ai/sdk module via vi.mock so the
// vitest suite stays fully offline (CI never makes network calls). The
// real-API integration coverage lives at
// `test/extract/llm-anthropic-integration.spec.ts` and is opt-in via
// LUCAIRN_LLM_INTEGRATION=1 + ANTHROPIC_API_KEY.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Tracks the next response shape per messages.create() call. Each test
// pushes a response; subsequent calls receive the next queued item.
type MockToolUseInput = {
  byCategory: {
    annex_iii: Record<string, string[]>;
    article_5_prohibited: Record<string, string[]>;
    article_50_gpai: Record<string, string[]>;
    scope_qualifiers: Record<string, string[]>;
  };
};

let mockCallCount = 0;

vi.mock('@anthropic-ai/sdk', () => {
  // Build a single canned "no fires" response shape; the LLM harness
  // calls the API per fixture, and for the offline test the exact contents
  // don't matter (the harness compares against expected fields; an
  // all-empty response will fail many fixtures but the structural test is
  // that runAccuracy() RUNS end-to-end with concurrency).
  const cannedInput: MockToolUseInput = {
    byCategory: {
      annex_iii: {},
      article_5_prohibited: {},
      article_50_gpai: {},
      scope_qualifiers: {},
    },
  };

  class MockAnthropic {
    public readonly messages: {
      create: () => Promise<{ content: ReadonlyArray<{ type: string; name?: string; input?: unknown }> }>;
    };
    constructor(_opts: { apiKey: string }) {
      void _opts;
      this.messages = {
        create: async () => {
          mockCallCount += 1;
          return {
            content: [{ type: 'tool_use', name: 'emit_features', input: cannedInput }],
          };
        },
      };
    }
  }
  return { default: MockAnthropic };
});

// Import AFTER vi.mock.
import { runAccuracy, parseAccuracyArgv } from '../../scripts/accuracy.js';

beforeEach(() => {
  mockCallCount = 0;
  process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-accuracy-llm-spec';
});

afterEach(() => {
  delete process.env['ANTHROPIC_API_KEY'];
});

describe('runAccuracy({ llm: "anthropic" }) — offline (mocked SDK)', () => {
  it('runs end-to-end against the full 66-fixture corpus', async () => {
    const report = await runAccuracy({
      llm: 'anthropic',
      lastRunAtOverride: '2026-05-15T00:00:00Z',
      cache: { disabled: true },
    });
    expect(report.fixture_count).toBe(66);
    // 66 fixtures → 66 LLM calls (cache disabled so every call hits the mock).
    expect(mockCallCount).toBe(66);
  });

  it('emits the same metric structure as deterministic mode', async () => {
    const report = await runAccuracy({
      llm: 'anthropic',
      lastRunAtOverride: '2026-05-15T00:00:00Z',
      cache: { disabled: true },
    });
    expect(typeof report.overall_accuracy).toBe('number');
    expect(typeof report.article_5_accuracy).toBe('number');
    expect(typeof report.binary_high_risk_accuracy).toBe('number');
    expect(report.bucket_accuracy.annex_iii.count).toBe(22);
    expect(report.bucket_accuracy.article_5.count).toBe(16);
    expect(report.bucket_accuracy.article_50.count).toBe(10);
    expect(report.bucket_accuracy.negative.count).toBe(9);
    expect(report.bucket_accuracy.legacy.count).toBe(9);
  });

  it('honors low concurrency (1) without changing the result shape', async () => {
    const report = await runAccuracy({
      llm: 'anthropic',
      llmConcurrency: 1,
      lastRunAtOverride: '2026-05-15T00:00:00Z',
      cache: { disabled: true },
    });
    expect(report.fixture_count).toBe(66);
    expect(mockCallCount).toBe(66);
  });

  it('all-empty mocked extractor produces deterministic results (no flake)', async () => {
    const r1 = await runAccuracy({
      llm: 'anthropic',
      lastRunAtOverride: '2026-05-15T00:00:00Z',
      cache: { disabled: true },
    });
    const r2 = await runAccuracy({
      llm: 'anthropic',
      lastRunAtOverride: '2026-05-15T00:00:00Z',
      cache: { disabled: true },
    });
    expect(r1.fixture_count).toBe(r2.fixture_count);
    expect(r1.bucket_accuracy.negative.count).toBe(r2.bucket_accuracy.negative.count);
  });

  it('negative-bucket fixtures should still pass (LLM emits empty == no false positives)', async () => {
    const report = await runAccuracy({
      llm: 'anthropic',
      lastRunAtOverride: '2026-05-15T00:00:00Z',
      cache: { disabled: true },
    });
    // Negative fixtures' expected.article_5_prohibited === false; the all-empty
    // LLM response correctly produces prohibited === false. Same for high_risk.
    // We don't pin a specific overall accuracy because the all-empty response
    // will fail every fixture that expects high-risk or prohibited (i.e.
    // most of the 41 non-negative fixtures); the structural assertion here is
    // that NEGATIVE fixtures CAN pass under the empty-canned-response.
    const negativeFixtures = report.fixtures.filter((f) => f.bucket === 'negative');
    expect(negativeFixtures.length).toBe(9);
    expect(negativeFixtures.every((f) => f.article_5_check_pass === true)).toBe(true);
  });
});

describe('accuracy harness CLI argv — default-disable LLM cache (bug-hunter M2 closure)', () => {
  it('default (no --cache flag) → useCache === false', () => {
    const opts = parseAccuracyArgv(['--llm', 'anthropic']);
    expect(opts.useCache).toBe(false);
    expect(opts.llm).toBe('anthropic');
  });

  it('explicit --cache flag → useCache === true', () => {
    const opts = parseAccuracyArgv(['--llm', 'anthropic', '--cache']);
    expect(opts.useCache).toBe(true);
    expect(opts.llm).toBe('anthropic');
  });

  it('deterministic-mode default (no --llm) also exposes useCache=false (cache only consulted when --llm is set; flag is inert otherwise)', () => {
    const opts = parseAccuracyArgv([]);
    expect(opts.useCache).toBe(false);
    expect(opts.llm).toBeUndefined();
  });

  it('--cache before --llm parses identically', () => {
    const opts = parseAccuracyArgv(['--cache', '--llm', 'groq']);
    expect(opts.useCache).toBe(true);
    expect(opts.llm).toBe('groq');
  });
});
