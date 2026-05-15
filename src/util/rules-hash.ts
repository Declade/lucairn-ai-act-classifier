// Rules-hash + rules-version constants.
//
// Pure-function module init. Computes:
//   - RULES_VERSION: from package.json `version` field, prefixed with `v` (e.g. "v0.1.0").
//     For v0.1.x the classifier's package.json version IS the rules version; this
//     collapses into a separate rules-vN.json file later (per plan line 120) but for
//     Day 6 the collapse hasn't happened.
//   - RULES_HASH: SHA-256 of the 4 source rules JSON files
//     (annex-iii.json + patterns.de.json + patterns.en.json + three-category.gen.json),
//     sorted by filename for determinism, separator `\0` between filename and bytes
//     and between successive files. First 8 hex chars surfaced for display.
//   - RULES_HASH_FULL_HEX: full 64-char SHA-256 hex digest, retained for any
//     consumer that needs the full digest (currently surfaced on
//     ClassifyResult.rules_hash_full).
//
// citations.json is INTENTIONALLY NOT in the hash set — it's documentation, not
// rules data; changing a citation URL should NOT bump the hash (per dispatch
// spec §"Step 2 — locked decision #7").
//
// Pure-function discipline: same-files-on-disk → same hash, byte-for-byte.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// dist/util/rules-hash.js → ../data/<file>
const DATA_DIR = join(__dirname, '..', 'data');

/**
 * Files folded into the rules hash. Sorted alphabetically below before reading;
 * the sort is locked here so a future contributor cannot drift the order by
 * editing this constant.
 */
const RULES_HASH_FILES: ReadonlyArray<string> = [
  'annex-iii.json',
  'patterns.de.json',
  'patterns.en.json',
  'three-category.gen.json',
];

function computeRulesHash(): { full: string; short: string } {
  const hasher = createHash('sha256');
  const sorted = [...RULES_HASH_FILES].sort();
  for (const filename of sorted) {
    const bytes = readFileSync(join(DATA_DIR, filename));
    hasher.update(filename);
    hasher.update('\0');
    hasher.update(bytes);
    hasher.update('\0');
  }
  const full = hasher.digest('hex');
  return { full, short: full.slice(0, 8) };
}

function loadRulesVersion(): string {
  // dist/util/rules-hash.js → ../../package.json (climbs out of dist/util to repo root).
  const pkgPath = join(__dirname, '..', '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
  return `v${pkg.version}`;
}

const { full: RULES_HASH_FULL, short: RULES_HASH_SHORT } = computeRulesHash();

export const RULES_VERSION = loadRulesVersion();
export const RULES_HASH = RULES_HASH_SHORT;
export const RULES_HASH_FULL_HEX = RULES_HASH_FULL;

/**
 * Test helper — re-load both rules version and rules hash from disk. Mirrors
 * the `_reload*` pattern used by `extract/keyword.ts` + `rules/three-category.ts`.
 * Not part of the public API.
 * @internal
 */
export function _reloadRulesMeta(): {
  version: string;
  hash: string;
  hashFull: string;
} {
  const { full, short } = computeRulesHash();
  const version = loadRulesVersion();
  return { version, hash: short, hashFull: full };
}
