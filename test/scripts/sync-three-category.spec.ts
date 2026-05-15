// Tests for scripts/sync-three-category.ts.
//
// Coverage:
//   - Happy path (fixture → JSON) with shape + content assertions.
//   - Determinism (2 runs produce byte-identical JSON).
//   - --check mode (drift detection): matching / missing / stale output.
//   - Error paths: missing top-level export, wrong category count.
//   - SHA-based drift signal (source content change → SHA change).
//
// The fixture lives at test/fixtures/sync-three-category/sample-checklist.ts
// and uses 2/1/2 items per category (intentionally NOT 9/10/4 — the script
// preserves whatever shape the source-of-truth ships; this keeps the unit
// test stable against single-item edits to the real website file).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
  copyFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  syncThreeCategory,
  type ThreeCategoryGenJson,
} from '../../scripts/sync-three-category.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'sync-three-category');
const FIXTURE_PATH = join(FIXTURE_DIR, 'sample-checklist.ts');

let tmpRoot: string;
let outputPath: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'sync-three-category-test-'));
  outputPath = join(tmpRoot, 'three-category.gen.json');
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('syncThreeCategory() — happy path against fixture', () => {
  it('parses the fixture and emits expected JSON shape', () => {
    const result = syncThreeCategory({ sourcePath: FIXTURE_PATH, outputPath });
    expect(result.wrote).toBe(true);
    expect(result.driftDetected).toBe(false);
    expect(existsSync(outputPath)).toBe(true);

    const written = JSON.parse(readFileSync(outputPath, 'utf8')) as ThreeCategoryGenJson;

    expect(written.version.length).toBeGreaterThan(0);
    expect(written._meta._source_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(written._meta.source_file).toBe(
      'lucairn-website/compliance/checklist-content.ts',
    );

    // Category 1: Sanitizer (Art. 10 + 15) — fixture ships 2 items.
    expect(written.categories['1'].key).toBe('1');
    expect(written.categories['1'].required_articles).toEqual([10, 15]);
    expect(written.categories['1'].title_en).toMatch(/sanitizer/i);
    expect(written.categories['1'].title_de).toMatch(/sanitizer/i);
    expect(written.categories['1'].items.length).toBe(2);
    expect(written.categories['1'].items[0]?.number).toBe(1);
    expect(written.categories['1'].items[0]?.text_en).toBe('Item one EN');
    expect(written.categories['1'].items[0]?.text_de).toBe('Eintrag eins DE');

    // Category 2: Evidence (Art. 12 + 14) — fixture ships 1 item.
    expect(written.categories['2'].key).toBe('2');
    expect(written.categories['2'].required_articles).toEqual([12, 14]);
    expect(written.categories['2'].items.length).toBe(1);
    expect(written.categories['2'].items[0]?.number).toBe(3);

    // Category 3: Inventory (Art. 10 + 12 + 14 + 15) — ≥3-element sort
    // exercise on `required_articles`. Fixture ships 2 items.
    expect(written.categories['3'].key).toBe('3');
    expect(written.categories['3'].required_articles).toEqual([10, 12, 14, 15]);
    expect(written.categories['3'].items.length).toBe(2);
    expect(written.categories['3'].items[0]?.number).toBe(4);

    expect(written.disclaimer_en).toBe('Synthetic disclaimer EN.');
    expect(written.disclaimer_de).toBe('Synthetischer Hinweis DE.');
  });

  it('is deterministic: 2 runs against same source emit byte-identical JSON', () => {
    syncThreeCategory({ sourcePath: FIXTURE_PATH, outputPath });
    const first = readFileSync(outputPath, 'utf8');
    syncThreeCategory({ sourcePath: FIXTURE_PATH, outputPath });
    const second = readFileSync(outputPath, 'utf8');
    expect(second).toBe(first);
  });

  it('serialized output ends with a trailing newline (POSIX convention; git-diff friendly)', () => {
    const result = syncThreeCategory({ sourcePath: FIXTURE_PATH, outputPath });
    expect(result.serialized.endsWith('\n')).toBe(true);
  });
});

describe('syncThreeCategory() — check mode (drift detection)', () => {
  it('check: true against missing output → driftDetected: true; does NOT write', () => {
    expect(existsSync(outputPath)).toBe(false);
    const result = syncThreeCategory({ sourcePath: FIXTURE_PATH, outputPath, check: true });
    expect(result.wrote).toBe(false);
    expect(result.driftDetected).toBe(true);
    expect(existsSync(outputPath)).toBe(false);
  });

  it('check: true against matching output → driftDetected: false; does NOT write', () => {
    // First write the canonical output.
    syncThreeCategory({ sourcePath: FIXTURE_PATH, outputPath });
    const before = readFileSync(outputPath, 'utf8');
    // Then check.
    const result = syncThreeCategory({ sourcePath: FIXTURE_PATH, outputPath, check: true });
    expect(result.wrote).toBe(false);
    expect(result.driftDetected).toBe(false);
    // File should be byte-identical (we didn't re-write).
    expect(readFileSync(outputPath, 'utf8')).toBe(before);
  });

  it('check: true against stale output → driftDetected: true; does NOT write', () => {
    // Write a stale output.
    writeFileSync(outputPath, '{"stale": true}\n', 'utf8');
    const result = syncThreeCategory({ sourcePath: FIXTURE_PATH, outputPath, check: true });
    expect(result.driftDetected).toBe(true);
    expect(result.wrote).toBe(false);
    // Stale file is preserved (check mode does NOT touch the output).
    expect(readFileSync(outputPath, 'utf8')).toBe('{"stale": true}\n');
  });
});

describe('syncThreeCategory() — error paths', () => {
  it('source missing required top-level export → throws', () => {
    const broken = join(tmpRoot, 'broken.ts');
    writeFileSync(broken, 'export const somethingElse = 1;\n', 'utf8');
    expect(() => syncThreeCategory({ sourcePath: broken, outputPath })).toThrow(
      /checklistContent/,
    );
  });

  it('source with wrong number of categories → throws', () => {
    const broken = join(tmpRoot, 'wrong-shape.ts');
    // The AST walker reads the literal object shape and does NOT do name
    // resolution; we don't need a real `Locale` alias in scope.
    writeFileSync(
      broken,
      `type Locale = 'en' | 'de';\n` +
        `export const checklistContent: Record<Locale, unknown> = {\n` +
        `  en: { categories: [], disclaimer: "x" },\n` +
        `  de: { categories: [], disclaimer: "y" },\n` +
        `};\n`,
      'utf8',
    );
    expect(() => syncThreeCategory({ sourcePath: broken, outputPath })).toThrow(
      /exactly 3 categories/,
    );
  });
});

describe('syncThreeCategory() — SHA-based drift signal', () => {
  it('SHA changes when the source content changes (drift detection signal)', () => {
    // First run against the canonical fixture.
    const first = syncThreeCategory({ sourcePath: FIXTURE_PATH, outputPath });
    const firstSha = first.json._meta._source_sha256;

    // Make a mutated copy of the fixture; verify SHA changes.
    const mutated = join(tmpRoot, 'mutated.ts');
    copyFileSync(FIXTURE_PATH, mutated);
    const original = readFileSync(mutated, 'utf8');
    writeFileSync(
      mutated,
      original.replace('Item one EN', 'Item one EN MUTATED'),
      'utf8',
    );

    const secondOutPath = join(tmpRoot, 'mutated.gen.json');
    const second = syncThreeCategory({
      sourcePath: mutated,
      outputPath: secondOutPath,
    });
    expect(second.json._meta._source_sha256).not.toBe(firstSha);
    // And the substantive content reflects the mutation.
    expect(second.json.categories['1'].items[0]?.text_en).toBe('Item one EN MUTATED');
  });
});
