// Lexicon version invariant — must match package.json semver.
//
// Bug-hunter M3 closure (Day-10 fix-up round 1). Background:
//   The LLM-mode filesystem cache key (see src/extract/cache.ts) includes
//   the active lexicon's `version` field. Adding entries to the lexicon
//   without bumping the version would otherwise leave stale cache entries
//   keyed at the OLD version unreachable to any caller carrying the new
//   version — silent miss. Worse, if someone manually edited the version
//   string without re-running the cache-invalidation workflow we'd serve
//   features computed under the OLD lexicon when the NEW lexicon should
//   have applied.
//
// Lock: `patterns.{en,de}.json` `version` MUST equal `v${package.json.version}`.
// EN + DE versions MUST also equal each other (the two lexicons co-evolve;
// drift would surface as language-specific cache-key collisions).
//
// This guard test runs in CI alongside the rest of the suite; a forgotten
// version bump after a lexicon edit fails the gate at PR time, not at
// post-merge regression time.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// dist-test layout: test/data/this-file.ts → ../../package.json (repo root).
const ROOT = join(__dirname, '..', '..');

interface PackageJson {
  version: string;
}
interface LexiconHeader {
  language: 'en' | 'de';
  version: string;
}

const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as PackageJson;
const EN = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'patterns.en.json'), 'utf8')) as LexiconHeader;
const DE = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'patterns.de.json'), 'utf8')) as LexiconHeader;

describe('Lexicon version invariant — must match package.json semver to keep cache valid (bug-hunter M3)', () => {
  // package.json `0.1.2` → lexicon expects `v0.1.2` (with `v` prefix per the
  // RULES_VERSION convention in src/util/rules-hash.ts).
  const expected = `v${PKG.version}`;

  it('patterns.en.json version matches `v${package.json.version}`', () => {
    expect(EN.version).toBe(expected);
  });

  it('patterns.de.json version matches `v${package.json.version}`', () => {
    expect(DE.version).toBe(expected);
  });

  it('EN + DE lexicon versions are identical (co-evolution invariant)', () => {
    expect(EN.version).toBe(DE.version);
  });
});
