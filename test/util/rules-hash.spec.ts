import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_VERSION, RULES_HASH, RULES_HASH_FULL_HEX, _reloadRulesMeta } from '../../src/util/rules-hash.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SRC_DATA = join(REPO_ROOT, 'src', 'data');

// The set of files folded into the hash MUST match `RULES_HASH_FILES` in
// `src/util/rules-hash.ts`. citations.json is INTENTIONALLY EXCLUDED.
const EXPECTED_FILES: ReadonlyArray<string> = [
  'annex-iii.json',
  'patterns.de.json',
  'patterns.en.json',
  'three-category.gen.json',
];

function expectedHash(): { full: string; short: string } {
  const hasher = createHash('sha256');
  const sorted = [...EXPECTED_FILES].sort();
  for (const filename of sorted) {
    const bytes = readFileSync(join(SRC_DATA, filename));
    hasher.update(filename);
    hasher.update('\0');
    hasher.update(bytes);
    hasher.update('\0');
  }
  const full = hasher.digest('hex');
  return { full, short: full.slice(0, 8) };
}

describe('RULES_HASH — deterministic SHA-256 of 4 rules JSON files', () => {
  it('RULES_HASH is exactly 8 hex chars', () => {
    expect(RULES_HASH).toMatch(/^[0-9a-f]{8}$/);
  });

  it('RULES_HASH_FULL_HEX is exactly 64 hex chars', () => {
    expect(RULES_HASH_FULL_HEX).toMatch(/^[0-9a-f]{64}$/);
  });

  it('RULES_HASH matches an independently-computed SHA-256 over the same 4 files', () => {
    const expected = expectedHash();
    expect(RULES_HASH).toBe(expected.short);
    expect(RULES_HASH_FULL_HEX).toBe(expected.full);
  });

  it('RULES_HASH is the first 8 hex chars of RULES_HASH_FULL_HEX', () => {
    expect(RULES_HASH).toBe(RULES_HASH_FULL_HEX.slice(0, 8));
  });

  it('_reloadRulesMeta() returns the same values as the constants at module init', () => {
    const reloaded = _reloadRulesMeta();
    expect(reloaded.version).toBe(RULES_VERSION);
    expect(reloaded.hash).toBe(RULES_HASH);
    expect(reloaded.hashFull).toBe(RULES_HASH_FULL_HEX);
  });

  it('hash is stable across repeated _reloadRulesMeta() calls (no hidden state)', () => {
    const a = _reloadRulesMeta();
    const b = _reloadRulesMeta();
    expect(a).toEqual(b);
  });
});

describe('RULES_VERSION — sourced from package.json', () => {
  it('starts with "v" prefix', () => {
    expect(RULES_VERSION).toMatch(/^v\d/);
  });

  it('matches package.json version field with v prefix', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(RULES_VERSION).toBe(`v${pkg.version}`);
  });
});
