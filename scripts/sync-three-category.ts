// sync-three-category.ts — Build-time sync of Lucairn's locked three-category
// scheme from the website's compliance checklist source-of-truth to a
// generated JSON artifact that `src/rules/three-category.ts` consumes.
//
// CLI:
//   tsx scripts/sync-three-category.ts [--input <path>] [--output <path>] [--check]
//
//   --input    Path to the website checklist TypeScript file. Defaults to
//              ../theveil-website/src/lib/compliance/checklist-content.ts
//              relative to this repo's root. Override via env var
//              THREE_CATEGORY_SOURCE_PATH (CLI flag wins over env; env wins
//              over relative fallback).
//   --output   Path to the generated JSON artifact. Defaults to
//              src/data/three-category.gen.json relative to this repo's
//              root.
//   --check    Read the input, compare against the existing output, and exit
//              0 if they match, 1 if they differ. Do NOT overwrite the
//              output. CI drift detection.
//
// Exit codes:
//   0   — success (sync OK, or --check matched).
//   1   — --check detected drift between input and output.
//   2   — file error (input not found / unreadable, output not writable, parse
//         error in input file, etc.).
//
// Parsing strategy: TypeScript's official `createSourceFile` AST walker reads
// the exported `checklistContent` object literal. We intentionally do NOT use
// `tsx` dynamic import here because the website source file imports
// `@/i18n/config` (a Next.js project alias that does NOT resolve outside the
// website repo). AST parsing is robust against that — it doesn't actually
// load the module.
//
// Determinism guarantees:
//   - NO wall-clock `_synced_at` timestamp (would defeat --check).
//   - `_source_sha256` is computed over LF-normalised content (no \r\n) so
//     Windows checkouts don't drift the SHA.
//   - All object keys serialized in fixed order via the buildOutput shape.
//   - JSON.stringify with 2-space indent + trailing newline (POSIX
//     convention; git-diff friendly).
//
// `required_articles` is HARDCODED below (CATEGORY_REQUIRED_ARTICLES). It is
// NOT parsed from the website source's title strings — title parsing is
// fragile and the article-list mapping is locked at the architecture layer
// in CLAUDE.md `## Locked decisions`.

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  resolve as pathResolve,
  relative as pathRelative,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as ts from 'typescript';

// ---------------------------------------------------------------------------
// Locked three-category → required-articles mapping (CLAUDE.md `## Locked decisions`)
// ---------------------------------------------------------------------------

const CATEGORY_REQUIRED_ARTICLES: Record<'1' | '2' | '3', readonly number[]> = {
  '1': [10, 15],
  '2': [12, 14],
  '3': [10, 12, 14, 15],
};

const VERSION = 'v0.1.0-gen';
// Neutral repo-relative label (Day-5 fix-up — claim-enforce W1 + personal-info-leak W2
// bundled closure). The pre-rebrand internal repo name (`theveil-website`) is replaced
// with the neutral Lucairn-brand-aligned label before the classifier repo flips public
// on Day 14. Both the in-memory `ThreeCategoryResult.source.source_file` field (read
// from the generated JSON's `_meta.source_file`) and the literal string in `META_NOTICE`
// use the same neutral label.
const SOURCE_FILE_LABEL = 'lucairn-website/compliance/checklist-content.ts';
const SOURCE_LINES_LABEL = '18-107';
const GENERATOR_LABEL = 'scripts/sync-three-category.ts';
const META_NOTICE =
  'GENERATED FILE — DO NOT EDIT. Source: lucairn-website/compliance/checklist-content.ts. ' +
  'Regenerate via `pnpm sync:three-category`. Drift check: `pnpm sync:three-category:check`. ' +
  'Locked three-category mapping: Cat 1 = Art 10+15 (Sanitizer); Cat 2 = Art 12+14 (Evidence); ' +
  'Cat 3 = Art 10+12+14+15 (Inventory). Source file SHA-256 captured in _source_sha256 for drift detection.';

// ---------------------------------------------------------------------------
// Output shape (kept in sync with src/rules/three-category.ts ThreeCategoryJson)
// ---------------------------------------------------------------------------

interface ThreeCategoryItemOut {
  number: number;
  text_en: string;
  text_de: string;
}

interface ThreeCategoryCategoryOut {
  key: '1' | '2' | '3';
  title_en: string;
  title_de: string;
  required_articles: number[];
  items: ThreeCategoryItemOut[];
}

export interface ThreeCategoryGenJson {
  version: string;
  _meta: {
    notice: string;
    source_file: string;
    source_lines: string;
    generator: string;
    _source_sha256: string;
  };
  disclaimer_en: string;
  disclaimer_de: string;
  categories: {
    '1': ThreeCategoryCategoryOut;
    '2': ThreeCategoryCategoryOut;
    '3': ThreeCategoryCategoryOut;
  };
}

// ---------------------------------------------------------------------------
// CLI argv parsing
// ---------------------------------------------------------------------------

interface ParsedArgv {
  input?: string;
  output?: string;
  check: boolean;
}

function parseArgv(argv: ReadonlyArray<string>): ParsedArgv {
  const out: ParsedArgv = { check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') {
      out.check = true;
      continue;
    }
    if (arg === '--input') {
      const next = argv[i + 1];
      if (next === undefined) {
        fail('--input requires a path argument.\n');
      }
      out.input = next;
      i += 1;
      continue;
    }
    if (arg === '--output') {
      const next = argv[i + 1];
      if (next === undefined) {
        fail('--output requires a path argument.\n');
      }
      out.output = next;
      i += 1;
      continue;
    }
    if (arg !== undefined && arg.length > 0) {
      fail(`Unknown argument "${arg}". Usage: --input <path> --output <path> --check\n`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

function fail(msg: string): never {
  process.stderr.write(`sync-three-category: ${msg}`);
  process.exit(2);
}

function resolveSourcePath(scriptDir: string, cliInput?: string): string {
  // Precedence: CLI flag > env var > relative fallback.
  if (cliInput !== undefined && cliInput.length > 0) {
    const absolute = isAbsolute(cliInput)
      ? cliInput
      : pathResolve(process.cwd(), cliInput);
    if (existsSync(absolute)) return absolute;
    fail(
      `--input points at "${absolute}" but the file does not exist. ` +
        `Fix the path or unset --input to fall through to the env override / relative fallback.\n`,
    );
  }

  const envOverride = process.env['THREE_CATEGORY_SOURCE_PATH'];
  if (envOverride !== undefined && envOverride.length > 0) {
    const absolute = isAbsolute(envOverride)
      ? envOverride
      : pathResolve(process.cwd(), envOverride);
    if (existsSync(absolute)) return absolute;
    fail(
      `THREE_CATEGORY_SOURCE_PATH points at "${absolute}" but the file does not exist. ` +
        `Fix the env var or unset it to fall back to the relative path.\n`,
    );
  }

  // Relative fallback. scriptDir is .../lucairn-ai-act-classifier/scripts.
  // Walk up two levels to ~/, then into ~/theveil-website.
  const fallback = pathResolve(
    scriptDir,
    '..',
    '..',
    'theveil-website',
    'src',
    'lib',
    'compliance',
    'checklist-content.ts',
  );
  if (existsSync(fallback)) return fallback;

  // Day-5 fix-up: use pathRelative to avoid leaking the absolute home directory
  // (e.g. /Users/<name>/...) into stderr when the fallback path doesn't exist.
  // The relative form is repo-rooted and safe to print in CI logs.
  fail(
    `Could not find the website checklist source-of-truth.\n` +
      `Looked for it at: ${pathRelative(process.cwd(), fallback)}\n` +
      `Set --input <path> or env THREE_CATEGORY_SOURCE_PATH=<absolute path to checklist-content.ts>.\n`,
  );
}

function resolveOutputPath(scriptDir: string, cliOutput?: string): string {
  if (cliOutput !== undefined && cliOutput.length > 0) {
    return isAbsolute(cliOutput) ? cliOutput : pathResolve(process.cwd(), cliOutput);
  }
  return pathResolve(scriptDir, '..', 'src', 'data', 'three-category.gen.json');
}

// ---------------------------------------------------------------------------
// AST walker — extract checklistContent.{en,de}
// ---------------------------------------------------------------------------

interface ParsedChecklistItem {
  number: number;
  text: string;
}

interface ParsedChecklistCategory {
  title: string;
  items: ParsedChecklistItem[];
}

interface ParsedLocaleContent {
  categories: ParsedChecklistCategory[];
  disclaimer: string;
}

interface ParsedChecklistContent {
  en: ParsedLocaleContent;
  de: ParsedLocaleContent;
}

function getStringLiteral(node: ts.Node): string {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  throw new Error(
    `Expected string literal, got ${ts.SyntaxKind[node.kind]} at position ${node.getStart()}`,
  );
}

function getNumberLiteral(node: ts.Node): number {
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  throw new Error(
    `Expected numeric literal, got ${ts.SyntaxKind[node.kind]} at position ${node.getStart()}`,
  );
}

function getPropertyValue(obj: ts.ObjectLiteralExpression, name: string): ts.Expression {
  for (const prop of obj.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ((ts.isIdentifier(prop.name) && prop.name.text === name) ||
        (ts.isStringLiteral(prop.name) && prop.name.text === name))
    ) {
      return prop.initializer;
    }
  }
  throw new Error(`Object literal is missing required property "${name}".`);
}

function parseItem(node: ts.Expression): ParsedChecklistItem {
  if (!ts.isObjectLiteralExpression(node)) {
    throw new Error(`Expected item object literal, got ${ts.SyntaxKind[node.kind]}`);
  }
  const number = getNumberLiteral(getPropertyValue(node, 'number'));
  const text = getStringLiteral(getPropertyValue(node, 'text'));
  return { number, text };
}

function parseCategory(node: ts.Expression): ParsedChecklistCategory {
  if (!ts.isObjectLiteralExpression(node)) {
    throw new Error(`Expected category object literal, got ${ts.SyntaxKind[node.kind]}`);
  }
  const title = getStringLiteral(getPropertyValue(node, 'title'));
  const itemsExpr = getPropertyValue(node, 'items');
  if (!ts.isArrayLiteralExpression(itemsExpr)) {
    throw new Error(
      `Expected category.items to be an array literal, got ${ts.SyntaxKind[itemsExpr.kind]}`,
    );
  }
  const items = itemsExpr.elements.map((el) => parseItem(el));
  return { title, items };
}

function parseLocaleContent(node: ts.Expression): ParsedLocaleContent {
  if (!ts.isObjectLiteralExpression(node)) {
    throw new Error(
      `Expected locale-content object literal, got ${ts.SyntaxKind[node.kind]}`,
    );
  }
  const categoriesExpr = getPropertyValue(node, 'categories');
  if (!ts.isArrayLiteralExpression(categoriesExpr)) {
    throw new Error(
      `Expected categories to be an array literal, got ${ts.SyntaxKind[categoriesExpr.kind]}`,
    );
  }
  const categories = categoriesExpr.elements.map((el) => parseCategory(el));
  const disclaimer = getStringLiteral(getPropertyValue(node, 'disclaimer'));
  return { categories, disclaimer };
}

function parseChecklistContent(sourceText: string, sourcePath: string): ParsedChecklistContent {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TS,
  );

  let initializer: ts.Expression | undefined;
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const hasExport = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!hasExport) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (
        ts.isVariableDeclaration(decl) &&
        ts.isIdentifier(decl.name) &&
        decl.name.text === 'checklistContent' &&
        decl.initializer !== undefined
      ) {
        initializer = decl.initializer;
        break;
      }
    }
    if (initializer !== undefined) break;
  }

  if (initializer === undefined) {
    throw new Error(
      `Could not locate \`export const checklistContent = { ... }\` in ${sourcePath}.`,
    );
  }
  if (!ts.isObjectLiteralExpression(initializer)) {
    throw new Error(
      `Expected checklistContent initializer to be an object literal, got ${ts.SyntaxKind[initializer.kind]}.`,
    );
  }

  const en = parseLocaleContent(getPropertyValue(initializer, 'en'));
  const de = parseLocaleContent(getPropertyValue(initializer, 'de'));
  return { en, de };
}

// ---------------------------------------------------------------------------
// Build the output JSON in fixed key order
// ---------------------------------------------------------------------------

function buildOutput(
  parsed: ParsedChecklistContent,
  sourceSha256: string,
): ThreeCategoryGenJson {
  if (parsed.en.categories.length !== 3 || parsed.de.categories.length !== 3) {
    throw new Error(
      `Expected exactly 3 categories in both locales, got en=${parsed.en.categories.length} de=${parsed.de.categories.length}.`,
    );
  }

  const buildCategory = (idx: 0 | 1 | 2): ThreeCategoryCategoryOut => {
    const enCat = parsed.en.categories[idx]!;
    const deCat = parsed.de.categories[idx]!;
    if (enCat.items.length !== deCat.items.length) {
      throw new Error(
        `Category ${idx + 1} item count mismatch between locales: en=${enCat.items.length} de=${deCat.items.length}.`,
      );
    }
    const items: ThreeCategoryItemOut[] = [];
    for (let i = 0; i < enCat.items.length; i += 1) {
      const enItem = enCat.items[i]!;
      const deItem = deCat.items[i]!;
      if (enItem.number !== deItem.number) {
        throw new Error(
          `Category ${idx + 1} item index ${i}: number mismatch en=${enItem.number} de=${deItem.number}.`,
        );
      }
      items.push({ number: enItem.number, text_en: enItem.text, text_de: deItem.text });
    }
    const categoryKey = String(idx + 1) as '1' | '2' | '3';
    return {
      key: categoryKey,
      title_en: enCat.title,
      title_de: deCat.title,
      required_articles: [...CATEGORY_REQUIRED_ARTICLES[categoryKey]],
      items,
    };
  };

  // Hand-built object literal in fixed key order. Do NOT reorder fields here —
  // src/rules/three-category.ts and the published consumers may depend on
  // key-stable serialization for downstream snapshot tests.
  return {
    version: VERSION,
    _meta: {
      notice: META_NOTICE,
      source_file: SOURCE_FILE_LABEL,
      source_lines: SOURCE_LINES_LABEL,
      generator: GENERATOR_LABEL,
      _source_sha256: sourceSha256,
    },
    disclaimer_en: parsed.en.disclaimer,
    disclaimer_de: parsed.de.disclaimer,
    categories: {
      '1': buildCategory(0),
      '2': buildCategory(1),
      '3': buildCategory(2),
    },
  };
}

// ---------------------------------------------------------------------------
// Public entry point (also re-exported for unit tests)
// ---------------------------------------------------------------------------

export interface SyncOptions {
  sourcePath?: string;
  outputPath?: string;
  /** True = compare against existing output only; do not write. */
  check?: boolean;
  /** Override scriptDir for path resolution (testing only). */
  scriptDir?: string;
}

export interface SyncResult {
  json: ThreeCategoryGenJson;
  serialized: string;
  sourcePath: string;
  outputPath: string;
  /** True iff a file was written. */
  wrote: boolean;
  /** Only meaningful in check mode. True iff output differs from would-be-generated content. */
  driftDetected: boolean;
}

function serialize(json: ThreeCategoryGenJson): string {
  return `${JSON.stringify(json, null, 2)}\n`;
}

/**
 * Pure-ish entry point. Reads source, optionally writes output, optionally
 * compares to existing output. Does NOT process.exit on drift. Throws for
 * parse errors. Drift is signalled via SyncResult.driftDetected.
 */
export function syncThreeCategory(opts: SyncOptions = {}): SyncResult {
  const scriptDir =
    opts.scriptDir ?? dirname(fileURLToPath(import.meta.url));

  const sourcePath =
    opts.sourcePath ?? resolveSourcePath(scriptDir);

  if (!existsSync(sourcePath)) {
    fail(`Source path "${sourcePath}" does not exist (after override resolution).\n`);
  }

  const sourceTextRaw = readFileSync(sourcePath, 'utf8');
  // LF-normalise before SHA — Windows checkouts may flip to \r\n and we don't
  // want the SHA to drift on that alone.
  const sourceTextNormalised = sourceTextRaw.replace(/\r\n/g, '\n');
  const sourceSha256 = createHash('sha256')
    .update(sourceTextNormalised, 'utf8')
    .digest('hex');

  const parsed = parseChecklistContent(sourceTextNormalised, sourcePath);
  const json = buildOutput(parsed, sourceSha256);
  const serialized = serialize(json);

  const outputPath = opts.outputPath ?? resolveOutputPath(scriptDir);
  const check = opts.check === true;

  if (check) {
    if (!existsSync(outputPath)) {
      return {
        json,
        serialized,
        sourcePath,
        outputPath,
        wrote: false,
        driftDetected: true,
      };
    }
    const existing = readFileSync(outputPath, 'utf8');
    const driftDetected = existing !== serialized;
    return {
      json,
      serialized,
      sourcePath,
      outputPath,
      wrote: false,
      driftDetected,
    };
  }

  const outDir = dirname(outputPath);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  writeFileSync(outputPath, serialized, 'utf8');
  return {
    json,
    serialized,
    sourcePath,
    outputPath,
    wrote: true,
    driftDetected: false,
  };
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

function rel(p: string): string {
  const cwd = process.cwd();
  if (p.startsWith(cwd)) return p.slice(cwd.length + 1);
  try {
    return pathRelative(cwd, p);
  } catch {
    return p;
  }
}

/** Run the sync as a CLI tool. Exits with the appropriate code. */
export function runCli(argv: ReadonlyArray<string> = process.argv.slice(2)): never {
  let parsed: ParsedArgv;
  try {
    parsed = parseArgv(argv);
  } catch (err) {
    fail(`${(err as Error).message}\n`);
  }

  let result: SyncResult;
  try {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const sourcePath = resolveSourcePath(scriptDir, parsed.input);
    const outputPath = resolveOutputPath(scriptDir, parsed.output);
    result = syncThreeCategory({
      sourcePath,
      outputPath,
      check: parsed.check,
      scriptDir,
    });
  } catch (err) {
    fail(`${(err as Error).message}\n`);
  }

  if (parsed.check) {
    if (result.driftDetected) {
      process.stderr.write(
        `sync-three-category: drift detected between ${rel(result.sourcePath)} and ${rel(result.outputPath)}. ` +
          `Run \`pnpm sync:three-category\` to regenerate.\n`,
      );
      process.exit(1);
    }
    process.stdout.write(
      `sync-three-category: check OK (${rel(result.outputPath)} matches source ${rel(result.sourcePath)})\n`,
    );
    process.exit(0);
  }

  process.stdout.write(
    `sync-three-category: wrote ${rel(result.outputPath)} from ${rel(result.sourcePath)}\n`,
  );
  process.exit(0);
}

// When run directly via `tsx scripts/sync-three-category.ts`, fire the CLI.
// When imported (from tests), only the named exports are used.
const isDirectInvocation =
  import.meta.url === `file://${process.argv[1] ?? ''}` ||
  (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1]));

if (isDirectInvocation) {
  runCli();
}
