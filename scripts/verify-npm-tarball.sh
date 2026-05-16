#!/usr/bin/env bash
# verify-npm-tarball.sh — Day-13 npm publish dry-run + tarball-contents
# verification.
#
# Confirms the package can be built + packed cleanly, and that the resulting
# tarball contains every load-bearing artifact a downstream `npx` user would
# need (CLI binary, rules/lexicon data, blog excerpts, JSON schema, README,
# LICENSE). Run from the npm script `pnpm verify-tarball`.
#
# Exit code 0 on success; non-zero with a `FAIL: ...` reason on any missing
# expected entry. Cleans up the produced .tgz file on success.
#
# Day 14 will replace this dry-run with a real `pnpm publish` once Marc
# authorises npm publication. This script stays in the repo as a pre-publish
# gate.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "[verify-tarball] Building clean dist + packing tarball..."
pnpm clean >/dev/null 2>&1
pnpm build >/dev/null 2>&1

# `pnpm pack` writes the .tgz into the repo root and prints its full path on
# stdout. Capture the last line (the path) — earlier lines are progress noise.
TARBALL_PATH="$(pnpm pack 2>/dev/null | tail -1)"

if [ -z "${TARBALL_PATH:-}" ] || [ ! -f "$TARBALL_PATH" ]; then
  echo "FAIL: pnpm pack did not produce a tarball file"
  exit 1
fi

# Resolve to absolute path for the contents listing.
TARBALL_ABS="$(cd "$(dirname "$TARBALL_PATH")" && pwd)/$(basename "$TARBALL_PATH")"

CONTENTS_FILE="$(mktemp -t classifier-tarball-contents.XXXXXX)"
trap 'rm -f "$CONTENTS_FILE" "$TARBALL_ABS"' EXIT

tar tzf "$TARBALL_ABS" | sort >"$CONTENTS_FILE"

# The npm-pack-extracted form prefixes every path with `package/`. Strip the
# prefix for friendlier assertions (and so the grep patterns match the layout
# a `node_modules/@lucairn/ai-act-classifier/...` install would expose).
sed -i.bak 's|^package/||' "$CONTENTS_FILE" && rm -f "${CONTENTS_FILE}.bak"

# Required files: every entry below must be present in the tarball, otherwise
# a downstream `npx @lucairn/ai-act-classifier` would 404 at runtime.
REQUIRED_ENTRIES=(
  "dist/cli.js"
  "dist/index.js"
  "dist/index.d.ts"
  "dist/classify.js"
  "dist/data/patterns.en.json"
  "dist/data/patterns.de.json"
  "dist/data/annex-iii.json"
  "dist/data/three-category.gen.json"
  "dist/data/citations.json"
  "dist/i18n/en.json"
  "dist/i18n/de.json"
  "dist/content/blog-excerpts/annex-iii-4-employment.en.md"
  "dist/content/blog-excerpts/annex-iii-4-employment.de.md"
  "dist/content/blog-excerpts/article-5-1-d-predictive-policing.en.md"
  "dist/content/blog-excerpts/article-5-1-d-predictive-policing.de.md"
  "dist/classify-result.schema.json"
  "README.md"
  "README.de.md"
  "LICENSE"
  "DATASET-LICENSE"
  "CHANGELOG.md"
)

FAILED=0
for entry in "${REQUIRED_ENTRIES[@]}"; do
  if ! grep -qx "$entry" "$CONTENTS_FILE"; then
    echo "FAIL: required tarball entry missing — $entry"
    FAILED=1
  fi
done

# Defensive — examples/, accuracy/, test/, scripts/ MUST NOT ship in the
# tarball (they're not in package.json `files` allowlist but a regression
# could include them via top-level glob).
DENIED_PREFIXES=(
  "examples/"
  "accuracy/"
  "test/"
  "scripts/"
  "node_modules/"
  ".git/"
)
for prefix in "${DENIED_PREFIXES[@]}"; do
  if grep -q "^$prefix" "$CONTENTS_FILE"; then
    echo "FAIL: denied prefix found in tarball — $prefix"
    FAILED=1
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo "[verify-tarball] One or more checks failed. Tarball: $TARBALL_ABS"
  exit 2
fi

ENTRY_COUNT="$(wc -l <"$CONTENTS_FILE" | tr -d ' ')"
echo "OK: tarball contents verified ($ENTRY_COUNT entries)"
echo "[verify-tarball] Tarball cleaned up: $(basename "$TARBALL_ABS")"
exit 0
