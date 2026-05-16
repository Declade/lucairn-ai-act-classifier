// Tests for scripts/generate-schema.ts.
//
// Coverage:
//   - Schema artifact exists after `pnpm build` (sandbox-EPERM-friendly skip
//     when dist/ is absent).
//   - Schema is valid JSON.
//   - Top-level shape: draft-07 marker, $id includes the package version,
//     `required` array enumerates every public ClassifyResult field.
//   - The schema is informational only — these tests document the public
//     contract that downstream consumers can rely on, not enforce runtime
//     validation.
//
// Sandbox-EPERM-friendly pattern: when `dist/classify-result.schema.json` is
// absent (fresh checkout without `pnpm build`), skip the suite with a console
// warning rather than failing — mirrors test/cli.spec.ts and
// test/integration/workspace-import.spec.ts.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SCHEMA_PATH = join(REPO_ROOT, 'dist', 'classify-result.schema.json');
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json');
const HAS_SCHEMA = existsSync(SCHEMA_PATH);

if (!HAS_SCHEMA) {
  // eslint-disable-next-line no-console
  console.warn(
    `[generate-schema.spec.ts] dist/classify-result.schema.json not found — skipping suite. Run "pnpm build" first.`,
  );
}

const itSchema = HAS_SCHEMA ? it : it.skip;

interface SchemaShape {
  readonly $schema: string;
  readonly $id: string;
  readonly title: string;
  readonly description: string;
  readonly type: string;
  readonly properties: Record<string, unknown>;
  readonly required: ReadonlyArray<string>;
  readonly additionalProperties: boolean;
}

interface PackageJsonShape {
  readonly name: string;
  readonly version: string;
}

describe('scripts/generate-schema.ts — JSON Schema artifact', () => {
  itSchema('dist/classify-result.schema.json exists and is valid JSON', () => {
    const raw = readFileSync(SCHEMA_PATH, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  itSchema('schema declares draft-07 marker', () => {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as SchemaShape;
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
  });

  itSchema('schema $id includes the current package version', () => {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as SchemaShape;
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as PackageJsonShape;
    expect(schema.$id).toContain(pkg.version);
    expect(schema.$id).toContain('classify-result');
  });

  itSchema('schema title is ClassifyResult and type is object', () => {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as SchemaShape;
    expect(schema.title).toBe('ClassifyResult');
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
  });

  itSchema('schema required array enumerates every public ClassifyResult field', () => {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as SchemaShape;
    // These fields MUST appear in the schema's required list — they are the
    // public contract surface of `classify()`. Adding fields here without
    // updating src/classify.ts::ClassifyResult is the load-bearing drift
    // signal this test catches.
    const expectedRequired = [
      'input_text',
      'detected_lang',
      'lang_confident',
      'rules_version',
      'rules_hash',
      'rules_hash_full',
      'mode',
      'confidence',
      'features',
      'article_5',
      'annex_iii',
      'article_10',
      'article_12',
      'article_13',
      'article_14',
      'article_15',
      'article_50',
      'three_category',
      'annex_iv_required',
    ];
    for (const field of expectedRequired) {
      expect(schema.required, `expected schema.required to contain "${field}"`).toContain(field);
      expect(schema.properties[field], `expected schema.properties to define "${field}"`).toBeDefined();
    }
  });

  itSchema('schema description mentions the informational-tool framing', () => {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as SchemaShape;
    expect(schema.description).toMatch(/informational tool|not legal advice/i);
  });
});
