// Unit tests for src/extract/cache.ts.
//
// All tests use a tmpdir for `cacheDir` so the test suite never touches the
// user's real `~/.cache/lucairn-ai-act-classifier` directory. Each test cleans
// up its own subtree.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import {
  cacheKey,
  cacheRead,
  cacheWrite,
  resolveCacheLlmDir,
  type CacheKeyParams,
} from '../../src/extract/cache.js';
import {
  normalizeInputForCacheKey,
  getDefaultModel,
} from '../../src/extract/llm.js';
import type { ExtractedFeatures } from '../../src/extract/keyword.js';

let tmpCacheDir = '';

beforeEach(() => {
  tmpCacheDir = mkdtempSync(join(tmpdir(), 'cache-spec-'));
});

afterEach(() => {
  if (tmpCacheDir.length > 0 && existsSync(tmpCacheDir)) {
    rmSync(tmpCacheDir, { recursive: true, force: true });
  }
});

const SAMPLE_KEY_PARAMS: CacheKeyParams = {
  provider: 'anthropic',
  model: 'claude-haiku-4-5-20251001',
  lexiconVersion: 'v0.1.0-seed',
  promptChecksum: 'sample-checksum1',
  lang: 'en',
  inputNormalized: 'AI system for CV screening',
};

const SAMPLE_FEATURES: ExtractedFeatures = {
  input: 'AI system for CV screening',
  lang: 'en',
  langConfident: true,
  lexiconVersion: 'v0.1.0-seed',
  hits: [
    {
      group: 'annex_iii',
      category: '4_employment',
      phrase: 'cv screening',
      source: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689',
    },
  ],
  byCategory: { annex_iii: { '4_employment': ['cv screening'] } },
};

describe('cacheKey — determinism + invalidation', () => {
  it('returns a 64-char sha256 hex string', () => {
    const key = cacheKey(SAMPLE_KEY_PARAMS);
    expect(typeof key).toBe('string');
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns the SAME key for the SAME params (idempotent)', () => {
    const k1 = cacheKey(SAMPLE_KEY_PARAMS);
    const k2 = cacheKey({ ...SAMPLE_KEY_PARAMS });
    expect(k1).toBe(k2);
  });

  it('different provider → different key', () => {
    const k1 = cacheKey(SAMPLE_KEY_PARAMS);
    const k2 = cacheKey({ ...SAMPLE_KEY_PARAMS, provider: 'openai' });
    expect(k1).not.toBe(k2);
  });

  it('different model → different key', () => {
    const k1 = cacheKey(SAMPLE_KEY_PARAMS);
    const k2 = cacheKey({ ...SAMPLE_KEY_PARAMS, model: 'claude-sonnet-4-6' });
    expect(k1).not.toBe(k2);
  });

  it('different lexiconVersion → different key (cache-invalidation on lexicon bump)', () => {
    const k1 = cacheKey(SAMPLE_KEY_PARAMS);
    const k2 = cacheKey({ ...SAMPLE_KEY_PARAMS, lexiconVersion: 'v0.2.0' });
    expect(k1).not.toBe(k2);
  });

  it('different lang → different key', () => {
    const k1 = cacheKey(SAMPLE_KEY_PARAMS);
    const k2 = cacheKey({ ...SAMPLE_KEY_PARAMS, lang: 'de' });
    expect(k1).not.toBe(k2);
  });

  it('different inputNormalized → different key', () => {
    const k1 = cacheKey(SAMPLE_KEY_PARAMS);
    const k2 = cacheKey({
      ...SAMPLE_KEY_PARAMS,
      inputNormalized: 'AI system for invoice fraud detection',
    });
    expect(k1).not.toBe(k2);
  });

  it('different promptChecksum → different key (invariant: prompt or tool-schema edits invalidate cache)', () => {
    // Day-10 fix-up round 1 / bug-hunter M1 closure: editing SYSTEM_PROMPT or
    // EMIT_FEATURES_PARAMETERS_SCHEMA without bumping the lexicon version
    // would otherwise serve cached features generated under the OLD prompt to
    // callers expecting the new prompt's behavior. The PROMPT_CHECKSUM
    // constant in providers/_shared.ts rolls automatically on any edit; this
    // test locks the invariant that the cache key is sensitive to it.
    const k1 = cacheKey({ ...SAMPLE_KEY_PARAMS, promptChecksum: 'aaaaaaaaaaaaaaaa' });
    const k2 = cacheKey({ ...SAMPLE_KEY_PARAMS, promptChecksum: 'bbbbbbbbbbbbbbbb' });
    expect(k1).not.toBe(k2);
  });
});

describe('cacheRead + cacheWrite — round-trip', () => {
  it('returns null on cache miss (file does not exist)', async () => {
    const key = cacheKey(SAMPLE_KEY_PARAMS);
    const result = await cacheRead(key, { cacheDir: tmpCacheDir });
    expect(result).toBeNull();
  });

  it('writes a JSON file under <cacheDir>/llm/<key>.json', async () => {
    const key = cacheKey(SAMPLE_KEY_PARAMS);
    await cacheWrite(key, SAMPLE_FEATURES, { cacheDir: tmpCacheDir });
    const expectedPath = join(tmpCacheDir, 'llm', `${key}.json`);
    expect(existsSync(expectedPath)).toBe(true);
  });

  it('reads back the same ExtractedFeatures byte-stable', async () => {
    const key = cacheKey(SAMPLE_KEY_PARAMS);
    await cacheWrite(key, SAMPLE_FEATURES, { cacheDir: tmpCacheDir });
    const result = await cacheRead(key, { cacheDir: tmpCacheDir });
    expect(result).toEqual(SAMPLE_FEATURES);
  });

  it('different keys store independently (no collision)', async () => {
    const k1 = cacheKey(SAMPLE_KEY_PARAMS);
    const k2 = cacheKey({ ...SAMPLE_KEY_PARAMS, provider: 'openai' });
    const f1 = { ...SAMPLE_FEATURES, lexiconVersion: 'v0.1.0-seed' };
    const f2 = { ...SAMPLE_FEATURES, lexiconVersion: 'v0.2.0-marker' };
    await cacheWrite(k1, f1, { cacheDir: tmpCacheDir });
    await cacheWrite(k2, f2, { cacheDir: tmpCacheDir });
    const r1 = await cacheRead(k1, { cacheDir: tmpCacheDir });
    const r2 = await cacheRead(k2, { cacheDir: tmpCacheDir });
    expect(r1?.lexiconVersion).toBe('v0.1.0-seed');
    expect(r2?.lexiconVersion).toBe('v0.2.0-marker');
  });
});

describe('cacheRead — tolerant of corrupted files', () => {
  it('returns null when the file is invalid JSON (cache-miss, not throw)', async () => {
    const key = cacheKey(SAMPLE_KEY_PARAMS);
    const llmDir = join(tmpCacheDir, 'llm');
    mkdirSync(llmDir, { recursive: true });
    const corruptedPath = join(llmDir, `${key}.json`);
    writeFileSync(corruptedPath, '{this is not valid json', 'utf8');
    const result = await cacheRead(key, { cacheDir: tmpCacheDir });
    expect(result).toBeNull();
  });

  it('returns null when the file is empty (cache-miss, not throw)', async () => {
    const key = cacheKey(SAMPLE_KEY_PARAMS);
    const llmDir = join(tmpCacheDir, 'llm');
    mkdirSync(llmDir, { recursive: true });
    writeFileSync(join(llmDir, `${key}.json`), '', 'utf8');
    const result = await cacheRead(key, { cacheDir: tmpCacheDir });
    expect(result).toBeNull();
  });
});

describe('cacheWrite — atomic write semantics', () => {
  it('writes to <key>.<random>.tmp first, then renames (no partial files visible)', async () => {
    // We cannot easily race the rename, but we can verify the final filename
    // is exactly `<key>.json` (not `<key>.tmp`) — proving the rename succeeded.
    const key = cacheKey(SAMPLE_KEY_PARAMS);
    await cacheWrite(key, SAMPLE_FEATURES, { cacheDir: tmpCacheDir });
    const llmDir = join(tmpCacheDir, 'llm');
    const files = readdirSync(llmDir);
    expect(files).toContain(`${key}.json`);
    // No `.tmp` leftovers (the rename consumed it).
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('creates the cache directory recursively on first write', async () => {
    const key = cacheKey(SAMPLE_KEY_PARAMS);
    const deepCacheRoot = join(tmpCacheDir, 'deep', 'nested', 'path');
    // Don't pre-create it; cacheWrite must mkdir -p.
    await cacheWrite(key, SAMPLE_FEATURES, { cacheDir: deepCacheRoot });
    const expectedPath = join(deepCacheRoot, 'llm', `${key}.json`);
    expect(existsSync(expectedPath)).toBe(true);
  });
});

describe('resolveCacheLlmDir — directory resolution', () => {
  it('honors opts.cacheDir override (test path)', () => {
    const dir = resolveCacheLlmDir({ cacheDir: '/tmp/explicit-cache-root' });
    expect(dir).toBe('/tmp/explicit-cache-root/llm');
  });

  it('uses XDG_CACHE_HOME when set + opts.cacheDir absent', () => {
    const prev = process.env['XDG_CACHE_HOME'];
    process.env['XDG_CACHE_HOME'] = '/tmp/xdg-cache-root';
    try {
      const dir = resolveCacheLlmDir();
      expect(dir).toBe('/tmp/xdg-cache-root/lucairn-ai-act-classifier/llm');
    } finally {
      if (prev !== undefined) process.env['XDG_CACHE_HOME'] = prev;
      else delete process.env['XDG_CACHE_HOME'];
    }
  });

  it('falls back to ~/.cache when neither opts nor XDG is set', () => {
    const prev = process.env['XDG_CACHE_HOME'];
    delete process.env['XDG_CACHE_HOME'];
    try {
      const dir = resolveCacheLlmDir();
      expect(dir).toMatch(/\.cache\/lucairn-ai-act-classifier\/llm$/);
    } finally {
      if (prev !== undefined) process.env['XDG_CACHE_HOME'] = prev;
    }
  });
});

// ---------------------------------------------------------------------------
// L4 closure — cache file + directory permission invariants (POSIX only)
// ---------------------------------------------------------------------------

describe('cacheWrite — POSIX file permissions (Day-10 L4 closure)', () => {
  // POSIX-only: Windows reports a different mode bitset that doesn't carry the
  // 0600 / 0700 semantics. Skip the assertion on Windows but keep the test
  // structure visible.
  const isPosix = platform() !== 'win32';

  it.runIf(isPosix)('cache file is written with mode 0600 (user read/write only)', async () => {
    const key = cacheKey(SAMPLE_KEY_PARAMS);
    await cacheWrite(key, SAMPLE_FEATURES, { cacheDir: tmpCacheDir });
    const finalPath = join(tmpCacheDir, 'llm', `${key}.json`);
    const stat = statSync(finalPath);
    // The low 9 bits of `mode` are the POSIX permission bits. mask with 0o777.
    const perms = stat.mode & 0o777;
    expect(perms).toBe(0o600);
  });

  it.runIf(isPosix)('cache directory is created with mode 0700 (user-only)', async () => {
    const key = cacheKey(SAMPLE_KEY_PARAMS);
    await cacheWrite(key, SAMPLE_FEATURES, { cacheDir: tmpCacheDir });
    const llmDir = join(tmpCacheDir, 'llm');
    const stat = statSync(llmDir);
    const perms = stat.mode & 0o777;
    // Bug-hunter M2 (Day-11 PR #11): the previous "user bits intact"
    // assertion was `expect(perms & 0o700).toBe(perms & 0o700)` — a
    // tautology that always passes regardless of actual mode. Replaced
    // with a real invariant: owner MUST have read+write+execute (0o700),
    // AND group+other MUST have no bits set (0o077 mask).
    expect(perms & 0o077).toBe(0); // group + other = 0
    expect(perms & 0o700).toBe(0o700); // owner has rwx
  });
});

// ---------------------------------------------------------------------------
// L7 closure — internal-export coverage for normalizeInputForCacheKey + getDefaultModel
// ---------------------------------------------------------------------------

describe('normalizeInputForCacheKey — Day-10 L7 closure', () => {
  it('is idempotent (same input → same normalized output)', () => {
    const input = 'AI system for CV screening';
    const a = normalizeInputForCacheKey(input);
    const b = normalizeInputForCacheKey(a);
    expect(a).toBe(b);
  });

  it('collapses interior whitespace runs to a single space', () => {
    const input = 'AI    system\t\tfor\n\nCV   screening';
    expect(normalizeInputForCacheKey(input)).toBe('AI system for CV screening');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeInputForCacheKey('   hello world  \n')).toBe('hello world');
  });

  it('does NOT lowercase (German nouns like "Profiling" are case-sensitive in the lexicon)', () => {
    expect(normalizeInputForCacheKey('Ausschließlich auf Profiling der Person')).toBe(
      'Ausschließlich auf Profiling der Person',
    );
  });
});

describe('getDefaultModel — Day-10 L7 closure', () => {
  it('returns the correct default for anthropic', () => {
    expect(getDefaultModel('anthropic')).toBe('claude-haiku-4-5-20251001');
  });

  it('returns the correct default for openai', () => {
    expect(getDefaultModel('openai')).toBe('gpt-4o-mini');
  });

  it('returns the correct default for groq', () => {
    expect(getDefaultModel('groq')).toBe('llama-3.3-70b-versatile');
  });
});
