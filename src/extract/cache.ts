// LLM-mode filesystem cache (Day 10).
//
// Purpose: same input + same provider + same model + same lexicon-version
// returns a byte-stable ExtractedFeatures across runs, restoring run-to-run
// reproducibility for LLM mode. Day-9's non-determinism observation (93.5%
// vs 97.6% across two runs) is the load-bearing motivation; with the cache,
// the second-and-subsequent runs on the same input are free + identical.
//
// Architecture:
//   - File-per-entry: `~/.cache/lucairn-ai-act-classifier/llm/<sha256>.json`.
//   - Cache key inputs (hashed together): provider, model, lexiconVersion,
//     lang, inputNormalized. Adding any of these as a key dimension means a
//     change there invalidates the cache automatically (lexicon-version bump,
//     model swap, language override, prompt-text edit).
//   - Cache scope: LLM mode only. Deterministic mode is fast + reproducible
//     and not worth cache management overhead.
//   - Atomic writes: `<sha>.tmp` → `rename(<sha>.json)`. POSIX rename is
//     atomic within the same filesystem. Survives concurrent writes from
//     parallel processes (last writer wins; readers always see a complete
//     file or fall through to a cache miss).
//   - Tolerant reads: any JSON parse failure or filesystem I/O error on read
//     is treated as a cache MISS. Cache-state corruption never blocks an LLM
//     call; the provider runs and overwrites the broken file.
//   - Failed API calls are NEVER written to cache. The caller (`extractFeaturesLLM`
//     in `llm.ts`) only writes after the provider successfully returns.
//
// Storage location resolution order:
//   1. `opts.cacheDir` (explicit override; primarily for tests).
//   2. `XDG_CACHE_HOME` env (Linux/macOS XDG Base Directory standard).
//   3. `~/.cache` (POSIX default).
//   Subdirectory: always `lucairn-ai-act-classifier/llm/`.
//
// XDG_CACHE_HOME compliance: see
// https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html

import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import type { ExtractedFeatures } from './keyword.js';
import type { LLMProvider } from './llm.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CacheKeyParams {
  provider: LLMProvider | string;
  model: string;
  lexiconVersion: string;
  lang: 'en' | 'de';
  inputNormalized: string;
}

export interface CacheReadOptions {
  /** Override the cache root dir. Default: XDG_CACHE_HOME ?? ~/.cache. */
  cacheDir?: string;
}

export type CacheWriteOptions = CacheReadOptions;

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

/**
 * Derive a stable sha256 hex key from the canonical params object.
 *
 * The key changes if ANY of provider / model / lexiconVersion / lang /
 * inputNormalized changes. This is the cache-invalidation strategy: a
 * lexicon-version bump rolls every entry's key (because lexicon-version is
 * a key input), so an upgrade automatically misses every existing cache file.
 *
 * Pure function — same inputs → same hex string. No I/O, no env reads.
 */
export function cacheKey(params: CacheKeyParams): string {
  // Stable-key-order JSON of the inputs. JSON.stringify on a plain object
  // emits keys in insertion order; we construct the object below in a fixed
  // order so the serialized form is byte-stable.
  const canonical = JSON.stringify({
    provider: params.provider,
    model: params.model,
    lexiconVersion: params.lexiconVersion,
    lang: params.lang,
    inputNormalized: params.inputNormalized,
  });
  const h = createHash('sha256');
  h.update(canonical, 'utf8');
  return h.digest('hex');
}

// ---------------------------------------------------------------------------
// Cache directory resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the absolute path of the `llm/` subdirectory under the cache root.
 * The cache root is `opts.cacheDir`, else `XDG_CACHE_HOME`, else `~/.cache`.
 */
export function resolveCacheLlmDir(opts: CacheReadOptions = {}): string {
  if (typeof opts.cacheDir === 'string' && opts.cacheDir.length > 0) {
    return join(opts.cacheDir, 'llm');
  }
  const xdg = process.env['XDG_CACHE_HOME'];
  const root =
    typeof xdg === 'string' && xdg.length > 0 ? xdg : join(homedir(), '.cache');
  return join(root, 'lucairn-ai-act-classifier', 'llm');
}

function entryPathFor(key: string, opts: CacheReadOptions): string {
  return join(resolveCacheLlmDir(opts), `${key}.json`);
}

// ---------------------------------------------------------------------------
// Read + write
// ---------------------------------------------------------------------------

/**
 * Read a cache entry. Returns the parsed `ExtractedFeatures` on hit, or
 * `null` on miss (file not present) or on any filesystem / JSON-parse error
 * (corrupted file → treat as miss; do not throw).
 *
 * @example
 *   const hit = await cacheRead('abc...', {});
 *   if (hit !== null) return hit;
 *   const features = await provider(text, opts);
 *   await cacheWrite('abc...', features, {});
 *   return features;
 */
export async function cacheRead(
  key: string,
  opts: CacheReadOptions = {},
): Promise<ExtractedFeatures | null> {
  const path = entryPathFor(key, opts);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    // ENOENT (file not present) is the expected cache-miss path. Any other
    // errno (EACCES, EIO, ...) is also treated as a miss — the provider will
    // re-run, and the next cacheWrite() can retry.
    void err;
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ExtractedFeatures;
    return parsed;
  } catch {
    // Corrupted JSON — treat as miss. The next cacheWrite() will overwrite.
    return null;
  }
}

/**
 * Write a cache entry atomically. The write goes to `<key>.tmp` first, then
 * `rename` to `<key>.json`. POSIX rename is atomic within the same fs.
 *
 * Throws on filesystem errors; the caller in `extractFeaturesLLM` catches +
 * swallows them so a write failure never blocks classification.
 *
 * Creates the cache directory recursively on first write.
 */
export async function cacheWrite(
  key: string,
  value: ExtractedFeatures,
  opts: CacheWriteOptions = {},
): Promise<void> {
  const dir = resolveCacheLlmDir(opts);
  await mkdir(dir, { recursive: true });
  const finalPath = join(dir, `${key}.json`);
  // The tmp name carries random bytes so parallel writers don't clobber each
  // other's tmp files before rename. POSIX rename(2) is atomic so the
  // final file is either the previous version or the new one — never partial.
  const tmpPath = join(dir, `${key}.${randomBytes(6).toString('hex')}.tmp`);
  const body = JSON.stringify(value);
  await writeFile(tmpPath, body, 'utf8');
  await rename(tmpPath, finalPath);
}
