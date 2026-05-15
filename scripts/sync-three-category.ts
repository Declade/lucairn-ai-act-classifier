// sync-three-category.ts — Build-time sync of Lucairn's locked three-category
// scheme from the website's compliance checklist source-of-truth to a
// generated JSON artifact that `src/rules/three-category.ts` consumes.
//
// Invocation: `pnpm sync-three-category` (wired in package.json).
//
// Source resolution priority:
//   1. process.env.THREE_CATEGORY_SOURCE_PATH (operator override, absolute or
//      relative to the script's CWD).
//   2. Relative fallback: ../theveil-website/src/lib/compliance/
//      checklist-content.ts (works when both repos are checked out
//      side-by-side under ~/).
//   3. If neither exists / is readable, exit 2 with a clear error pointing at
//      the env-var override.
//
// Parsing strategy: TypeScript's official `createSourceFile` AST walker reads
// the exported `checklistContent` object literal. We do NOT regex the source
// — comments, string-quote drift, or whitespace changes in the upstream file
// would break a regex-based parser. The AST walker is robust against those.
//
// CI drift detection (NOT in this PR — Day 13/14 polish):
//   `pnpm sync-three-category && git diff --exit-code
//     src/data/three-category.gen.json` — non-zero on drift. The committed
//   `three-category.gen.json` is the deterministic build artifact; if the
//   upstream checklist changes without re-sync, CI fails.
//
// `_synced_at` timestamp design choice: OMITTED from the emitted JSON.
//   Including a timestamp would defeat the CI drift-check (every re-run would
//   show a diff on the timestamp alone). Git's commit timestamp records when
//   the JSON was last regenerated.
//
// `articles` field per category: HARDCODED from CLAUDE.md `## Locked
//   decisions` rather than parsed from the category `title` text. Title-text
//   parsing is fragile (a translator could change "Art. 10 + 15" to "Articles
//   10 and 15" without changing the substantive content). The mapping is
//   locked at the architecture layer, not the copy layer.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve as pathResolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as ts from 'typescript';

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

interface ThreeCategoryItemOut {
  number: number;
  text_en: string;
  text_de: string;
}

interface ThreeCategoryCategoryOut {
  title_en: string;
  title_de: string;
  articles: string[];
  items: ThreeCategoryItemOut[];
}

export interface ThreeCategoryGenJson {
  _source_sha256: string;
  /**
   * Stable, machine-independent label identifying the source-of-truth. We
   * deliberately do NOT emit the absolute filesystem path here — that would
   * make the committed JSON differ per checkout location and defeat CI drift
   * detection. The literal string below is the canonical reference to the
   * website source-of-truth.
   */
  _source_label: string;
  categories: {
    '1': ThreeCategoryCategoryOut;
    '2': ThreeCategoryCategoryOut;
    '3': ThreeCategoryCategoryOut;
  };
  disclaimer_en: string;
  disclaimer_de: string;
}

const SOURCE_LABEL =
  'theveil-website/src/lib/compliance/checklist-content.ts';

// ---------------------------------------------------------------------------
// Locked three-category → article-list mapping (CLAUDE.md `## Locked decisions`)
// ---------------------------------------------------------------------------

const CATEGORY_ARTICLES: Record<'1' | '2' | '3', string[]> = {
  '1': ['10', '15'],
  '2': ['12', '14'],
  '3': ['10', '12', '14', '15'],
};

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

function resolveSourcePath(scriptDir: string): string {
  const envOverride = process.env['THREE_CATEGORY_SOURCE_PATH'];
  if (envOverride !== undefined && envOverride.length > 0) {
    const absolute = isAbsolute(envOverride)
      ? envOverride
      : pathResolve(process.cwd(), envOverride);
    if (existsSync(absolute)) {
      return absolute;
    }
    // Operator explicitly set the override — fail loudly rather than silently
    // falling through to the relative fallback.
    fail(
      `THREE_CATEGORY_SOURCE_PATH points at "${absolute}" but the file does not exist.\n` +
        `Either fix the env var, or unset it to fall back to the relative path.\n`,
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
  if (existsSync(fallback)) {
    return fallback;
  }

  fail(
    `Could not find the website checklist source-of-truth.\n` +
      `Looked for it at: ${fallback}\n` +
      `Set THREE_CATEGORY_SOURCE_PATH to the absolute path of checklist-content.ts\n` +
      `(usually under theveil-website/src/lib/compliance/) and re-run.\n`,
  );
}

function fail(msg: string): never {
  process.stderr.write(`sync-three-category: ${msg}\n`);
  process.exit(2);
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

function getStringLiteral(node: ts.Node): string {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  // Template strings without substitutions still match `isNoSubstitution...`,
  // but a template with substitutions wouldn't reach us in this codebase.
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
    throw new Error(
      `Expected item object literal, got ${ts.SyntaxKind[node.kind]}`,
    );
  }
  const number = getNumberLiteral(getPropertyValue(node, 'number'));
  const text = getStringLiteral(getPropertyValue(node, 'text'));
  return { number, text };
}

function parseCategory(node: ts.Expression): ParsedChecklistCategory {
  if (!ts.isObjectLiteralExpression(node)) {
    throw new Error(
      `Expected category object literal, got ${ts.SyntaxKind[node.kind]}`,
    );
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

interface ParsedChecklistContent {
  en: ParsedLocaleContent;
  de: ParsedLocaleContent;
}

function parseChecklistContent(sourceText: string, sourcePath: string): ParsedChecklistContent {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TS,
  );

  // Find: `export const checklistContent: Record<Locale, ChecklistContent> = { ... };`
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
// Build the output JSON
// ---------------------------------------------------------------------------

function buildOutput(
  parsed: ParsedChecklistContent,
  sourceSha256: string,
): ThreeCategoryGenJson {
  // Validate category counts: the website source ships exactly 3 categories per
  // locale. Anything else means the upstream contract drifted and we need to
  // re-check the mapping rather than silently shipping stale articles[].
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
    // Pair items by index — the website source maintains a stable index order
    // across locales by construction. We also assert that the `number` field
    // matches across locales to catch ordering drift early.
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
      title_en: enCat.title,
      title_de: deCat.title,
      articles: CATEGORY_ARTICLES[categoryKey],
      items,
    };
  };

  return {
    _source_sha256: sourceSha256,
    _source_label: SOURCE_LABEL,
    categories: {
      '1': buildCategory(0),
      '2': buildCategory(1),
      '3': buildCategory(2),
    },
    disclaimer_en: parsed.en.disclaimer,
    disclaimer_de: parsed.de.disclaimer,
  };
}

// ---------------------------------------------------------------------------
// Public entry point (also re-exported for unit tests)
// ---------------------------------------------------------------------------

export interface SyncOptions {
  /** Override source path. If omitted, env / fallback resolution applies. */
  sourcePath?: string;
  /** Override output path. If omitted, writes to src/data/three-category.gen.json. */
  outputPath?: string;
  /** When true, do not write the file — just return the computed JSON. */
  dryRun?: boolean;
  /** Override the script directory for path resolution (testing only). */
  scriptDir?: string;
}

export interface SyncResult {
  json: ThreeCategoryGenJson;
  /** Path that was actually read. */
  sourcePath: string;
  /** Path that was (or would be) written. */
  outputPath: string;
  /** True iff a file was written (false on dryRun). */
  wrote: boolean;
}

/** Pure(-ish) function: reads source, returns the parsed JSON. No process.exit. */
export function syncThreeCategory(opts: SyncOptions = {}): SyncResult {
  const scriptDir =
    opts.scriptDir ?? dirname(fileURLToPath(import.meta.url));
  const sourcePath = opts.sourcePath ?? resolveSourcePath(scriptDir);

  if (!existsSync(sourcePath)) {
    fail(
      `Source path "${sourcePath}" does not exist (after override resolution).\n`,
    );
  }

  const sourceTextRaw = readFileSync(sourcePath, 'utf8');
  // Normalise line endings before SHA — Windows checkouts may flip to \r\n
  // and we don't want the SHA to drift on that alone.
  const sourceTextNormalised = sourceTextRaw.replace(/\r\n/g, '\n');
  const sourceSha256 = createHash('sha256')
    .update(sourceTextNormalised, 'utf8')
    .digest('hex');

  const parsed = parseChecklistContent(sourceTextNormalised, sourcePath);
  const json = buildOutput(parsed, sourceSha256);

  const outputPath =
    opts.outputPath ??
    pathResolve(scriptDir, '..', 'src', 'data', 'three-category.gen.json');

  if (opts.dryRun === true) {
    return { json, sourcePath, outputPath, wrote: false };
  }

  const outDir = dirname(outputPath);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  // Pretty-printed with 2-space indent + trailing newline for git-diff
  // friendliness.
  writeFileSync(outputPath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  return { json, sourcePath, outputPath, wrote: true };
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

/**
 * Run the sync as a CLI tool. Returns the resolved {sourcePath, outputPath}
 * pair so callers (tests, future build scripts) can log them.
 */
export function runCli(): SyncResult {
  try {
    const result = syncThreeCategory();
    const rel = (p: string): string => {
      const cwd = process.cwd();
      return p.startsWith(cwd) ? p.slice(cwd.length + 1) : p;
    };
    process.stdout.write(
      `sync-three-category: wrote ${rel(result.outputPath)} from ${rel(result.sourcePath)}\n`,
    );
    return result;
  } catch (err) {
    fail(`${(err as Error).message}\n`);
  }
}

// When run directly via `tsx scripts/sync-three-category.ts`, fire the CLI.
// When imported (from tests), only the named exports are used.
const isDirectInvocation =
  import.meta.url === `file://${process.argv[1] ?? ''}` ||
  (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1]));

if (isDirectInvocation) {
  runCli();
}

// Suppress unused-import warnings when consumers only need the run helpers
// (TS strict mode catches these otherwise; the `join` import is reserved for
// follow-up extensions and kept for symmetry with pathResolve).
void join;
