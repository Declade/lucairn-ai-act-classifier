// Tests for scripts/generate-schema.ts.
//
// Coverage:
//   - Schema artifact exists after `pnpm build` (sandbox-EPERM-friendly skip
//     when dist/ is absent).
//   - Schema is valid JSON.
//   - Top-level shape: draft-07 marker, $id includes the package version,
//     `required` array enumerates every public ClassifyResult field, schema
//     properties define those required fields. These top-level tests catch
//     "someone added a field to ClassifyResult but forgot to update the
//     schema" — a useful but tautological check.
//   - **The load-bearing invariant (added Day 13 fix-up round 1, B1 BLOCKER
//     closure):** the schema MUST empirically validate real `classify()`
//     output across multiple input fixtures via Ajv. Previously the test
//     suite only checked top-level field names — a tautology that silently
//     allowed a schema with 382 sub-shape errors to ship. The empirical Ajv
//     gate below is what actually catches sub-shape drift between
//     `ClassifyResult` (source of truth) and the published JSON Schema.
//
// Sandbox-EPERM-friendly pattern: when `dist/classify-result.schema.json` or
// `dist/index.js` are absent (fresh checkout without `pnpm build`), skip the
// suite with a console warning rather than failing — mirrors test/cli.spec.ts
// and test/integration/workspace-import.spec.ts.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SCHEMA_PATH = join(REPO_ROOT, 'dist', 'classify-result.schema.json');
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json');
const DIST_INDEX_PATH = join(REPO_ROOT, 'dist', 'index.js');
const HAS_SCHEMA = existsSync(SCHEMA_PATH);
const HAS_DIST = existsSync(DIST_INDEX_PATH);

if (!HAS_SCHEMA) {
  // eslint-disable-next-line no-console
  console.warn(
    `[generate-schema.spec.ts] dist/classify-result.schema.json not found — skipping suite. Run "pnpm build" first.`,
  );
}

const itSchema = HAS_SCHEMA ? it : it.skip;
const itEmpirical = HAS_SCHEMA && HAS_DIST ? it : it.skip;

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
    // public contract surface of `classify()`. This is a top-level name
    // check: it catches "someone added a field to ClassifyResult but forgot
    // to update the schema" (one specific drift class). It does NOT catch
    // sub-shape drift — see the empirical Ajv test below, which validates
    // the full nested shape against real `classify()` output.
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

  // -------------------------------------------------------------------------
  // Day-13 fix-up round 1 — B1 BLOCKER closure
  //
  // The empirical Ajv gate. Validates the published schema accepts real
  // `classify()` output across multiple input fixtures spanning the major
  // code paths (no triggers, Annex III high-risk EN, Annex III high-risk DE,
  // Article 5 prohibition fire, Article 50 deepfake fire). This is the
  // load-bearing test that catches sub-shape drift between `ClassifyResult`
  // (source of truth in src/classify.ts) and the published JSON Schema. It
  // would have caught all 382 Ajv errors the pre-fix-up schema produced.
  // -------------------------------------------------------------------------

  itEmpirical('schema empirically validates real classify() output across fixtures (B1 lock)', async () => {
    // Ajv 8.x ships its constructor on the module's `default` export under
    // ESM. Some TypeScript module-interop configurations type the namespace
    // import as non-constructable; we tolerate both by reading the default
    // export off the namespace and falling back to the namespace itself.
    const ajvNs = (await import('ajv')) as unknown as { default?: unknown };
    type AjvCtor = new (opts?: { strict?: boolean; allErrors?: boolean }) => {
      compile(schema: unknown): (data: unknown) => boolean;
      errors?: unknown;
    };
    const Ajv = (ajvNs.default ?? ajvNs) as AjvCtor;
    // Dynamic import via file URL so the test resolves against the built dist
    // module without TypeScript needing to know about its existence at test-
    // compile time.
    const distIndex = await import(/* @vite-ignore */ DIST_INDEX_PATH);
    const classify = distIndex.classify as (
      text: string,
      opts?: { lang?: 'en' | 'de'; threeCategory?: boolean },
    ) => Promise<Record<string, unknown>>;

    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
    const ajv = new Ajv({ strict: false, allErrors: true });
    const validate = ajv.compile(schema);

    // 5 representative inputs covering the major code paths.
    const fixtures: ReadonlyArray<{ readonly name: string; readonly text: string }> = [
      {
        name: 'EN — no triggers (low-confidence path)',
        text: 'A simple chatbot that answers FAQs about cooking recipes.',
      },
      {
        name: 'EN — Annex III ¶4 employment + cascade fires',
        text: 'Recruitment AI ranks job applicants by CV and makes hiring decisions.',
      },
      {
        name: 'DE — Annex III ¶4 employment via lexicon-aligned phrasing',
        text: 'Mein KI-System nutzt Lebenslauf-Screening für Bewerberauswahl und Einstellungsentscheidungen.',
      },
      {
        name: 'EN — Article 5(1)(c) social scoring prohibition fires',
        text: 'AI social scoring system for citizens.',
      },
      {
        name: 'EN — Article 50(4) deepfake fires (independent root)',
        text: 'AI deepfake video generation for synthetic political content.',
      },
    ];

    for (const fixture of fixtures) {
      const result = await classify(fixture.text);
      const ok = validate(result);
      expect(
        ok,
        `Schema must validate real classify() output for fixture "${fixture.name}". Ajv errors: ${JSON.stringify(ajv.errors ?? null, null, 2)}`,
      ).toBe(true);
    }
  });

  itEmpirical('schema accepts classify() result with three_category: null (opts.threeCategory === false)', async () => {
    const ajvNs = (await import('ajv')) as unknown as { default?: unknown };
    type AjvCtor = new (opts?: { strict?: boolean; allErrors?: boolean }) => {
      compile(schema: unknown): (data: unknown) => boolean;
      errors?: unknown;
    };
    const Ajv = (ajvNs.default ?? ajvNs) as AjvCtor;
    const distIndex = await import(/* @vite-ignore */ DIST_INDEX_PATH);
    const classify = distIndex.classify as (
      text: string,
      opts?: { lang?: 'en' | 'de'; threeCategory?: boolean },
    ) => Promise<Record<string, unknown>>;

    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
    const ajv = new Ajv({ strict: false, allErrors: true });
    const validate = ajv.compile(schema);

    const result = await classify('Recruitment AI ranks job applicants by CV.', { threeCategory: false });
    expect(result['three_category']).toBeNull();
    const ok = validate(result);
    expect(
      ok,
      `Schema must accept three_category: null. Ajv errors: ${JSON.stringify(ajv.errors ?? null, null, 2)}`,
    ).toBe(true);
  });
});
