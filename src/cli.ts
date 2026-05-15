#!/usr/bin/env node
// commander-based CLI entrypoint for ai-act-classify.
//
// Design constraints:
//   - All output flows through formatter functions; cli.ts only routes data and
//     handles process-level state (stdin, exit code, color toggle).
//   - Zero network. Zero LLM. Day 6 ignores --llm flag (reserved for Day 9).
//   - The disclaimer footer is MANDATORY (rendered by every formatter). No
//     --no-disclaimer flag.
//   - Exit codes match the AI-Act-classifier build plan §exit-codes
//     (private build plan):
//       0 = ok
//       1 = Article 5 prohibited triggered
//       2 = parse error (empty input, invalid flag, version mismatch, --annex without 'iv')
//       3 = LLM error (reserved for Day 9; never produced here)
//
// Run from npx: `npx @lucairn/ai-act-classifier "..."` invokes this file
// via the package.json `bin.ai-act-classify` shim and the `#!/usr/bin/env node`
// shebang above.

import { Command, CommanderError, Option } from 'commander';
import { classify, type ClassifyOptions } from './classify.js';
import { formatCliTable, formatAnnexIVReference } from './format/cli-table.js';
import { formatJson, formatAnnexIVReferenceJson } from './format/json.js';
import { formatMarkdown, formatAnnexIVReferenceMarkdown } from './format/markdown.js';
import { RULES_VERSION } from './util/rules-hash.js';
import { getLocale } from './i18n/load.js';

// ---------------------------------------------------------------------------
// Process I/O helpers
// ---------------------------------------------------------------------------

function out(text: string): void {
  process.stdout.write(text);
  if (!text.endsWith('\n')) process.stdout.write('\n');
}

function err(text: string): void {
  process.stderr.write(text);
  if (!text.endsWith('\n')) process.stderr.write('\n');
}

function exit(code: 0 | 1 | 2 | 3): never {
  process.exit(code);
}

async function readStdin(): Promise<string> {
  // Read stdin to EOF. Returns the empty string when stdin has nothing.
  const chunks: Buffer[] = [];
  return new Promise<string>((resolve, reject) => {
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

function shouldUseColor(): boolean {
  if (!process.stdout.isTTY) return false;
  if (typeof process.env['NO_COLOR'] === 'string' && process.env['NO_COLOR'].length > 0) return false;
  if (
    typeof process.env['AI_ACT_CLASSIFY_NO_COLOR'] === 'string' &&
    process.env['AI_ACT_CLASSIFY_NO_COLOR'].length > 0
  )
    return false;
  return true;
}

function autoDetectLocaleFromEnv(): 'en' | 'de' {
  const env = process.env['LC_ALL'] ?? process.env['LANG'] ?? '';
  if (/^de(_|\.|-|$)/i.test(env)) return 'de';
  return 'en';
}

// ---------------------------------------------------------------------------
// Annex IV path
// ---------------------------------------------------------------------------

function runAnnexIV(
  value: string,
  langOverride: 'en' | 'de' | undefined,
  format: 'cli' | 'json' | 'markdown',
): void {
  if (value.toLowerCase() !== 'iv') {
    const locale = getLocale(langOverride ?? autoDetectLocaleFromEnv());
    err(`${locale.labels.error_annex_invalid}${value}`);
    exit(2);
  }
  const locale = langOverride ?? autoDetectLocaleFromEnv();
  switch (format) {
    case 'json':
      out(formatAnnexIVReferenceJson({ locale }));
      break;
    case 'markdown':
      out(formatAnnexIVReferenceMarkdown({ locale }));
      break;
    case 'cli':
    default:
      out(formatAnnexIVReference({ locale }));
      break;
  }
  exit(0);
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

interface RawOptions {
  format?: string;
  json?: boolean;
  lang?: string;
  cite?: boolean;
  threeCategory?: boolean;
  rulesVersion?: string;
  annex?: string;
}

function resolveFormat(rawOpts: RawOptions): 'cli' | 'json' | 'markdown' {
  if (rawOpts.json === true) return 'json';
  const fmt = rawOpts.format;
  if (fmt === undefined) return 'cli';
  if (fmt === 'cli' || fmt === 'json' || fmt === 'markdown') return fmt;
  // commander's --format choices() already enforces this, but defensive belt.
  return 'cli';
}

function resolveLang(rawOpts: RawOptions, errLocale: 'en' | 'de'): 'en' | 'de' | undefined {
  if (rawOpts.lang === undefined) return undefined;
  if (rawOpts.lang === 'en' || rawOpts.lang === 'de') return rawOpts.lang;
  const locale = getLocale(errLocale);
  err(`${locale.labels.error_invalid_lang}${rawOpts.lang}`);
  exit(2);
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('ai-act-classify')
    .description('Free CLI that maps EU AI Act articles to your AI use case')
    .version(RULES_VERSION.replace(/^v/, ''), '-V, --version', 'Print package version and exit 0')
    .argument('[text...]', 'Use-case description (alternatively pipe from stdin)')
    .addOption(
      new Option('--format <fmt>', 'Output format')
        .choices(['cli', 'json', 'markdown'])
        .default('cli'),
    )
    .option('--json', 'Shortcut for --format json')
    .option('--lang <locale>', 'Override locale: en|de (default: auto-detect)')
    .option('--cite', 'Emit citation block with EUR-Lex + Service Desk + lucairn.eu URLs')
    .option(
      '--no-three-category',
      'Suppress Lucairn obligation overlay',
    )
    .option('--rules-version <v>', 'Verify the loaded rules match this version (exits 2 on mismatch)')
    .option('--annex <ref>', "Print static Annex IV technical-documentation reference and exit (use 'iv')")
    .addHelpText(
      'after',
      `
Examples:
  ai-act-classify "AI system that ranks job applicants by CV"
  cat use-case.txt | ai-act-classify --format json
  ai-act-classify "..." --cite --lang de
  ai-act-classify --annex iv

Exit codes:
  0  classification ok
  1  Article 5 prohibited triggered
  2  parse error (empty input, invalid flag, version mismatch, --annex without 'iv', etc.)
  3  LLM error (reserved; not produced by Day-6 code)
`,
    )
    .allowUnknownOption(false)
    // L1 fix-up: commander's default exit code for unknown options is 1; the
    // build-plan canonical exit-code scheme reserves 1 for "Article 5
    // prohibited" and uses 2 for all parse errors. exitOverride() lets us
    // intercept commander's CommanderError and remap.
    .exitOverride();

  const errLocale = autoDetectLocaleFromEnv();
  try {
    program.parse(process.argv);
  } catch (e: unknown) {
    if (e instanceof CommanderError) {
      // Commander prints its own message to stderr before throwing; on help/
      // version we want exit 0; on parse errors exit 2 per the build-plan
      // canonical exit-code scheme.
      if (e.code === 'commander.help' || e.code === 'commander.helpDisplayed' || e.code === 'commander.version') {
        exit(0);
      }
      exit(2);
    }
    if (e instanceof Error) {
      err(`Error: ${e.message}`);
      exit(2);
    }
    err(`Error: ${String(e)}`);
    exit(2);
  }
  const rawOpts = program.opts<RawOptions>();
  const positional = program.args;

  // ----- Rules-version pre-check (BEFORE --annex iv path + before reading
  //       stdin). H1 fix-up — `--annex iv` must also respect --rules-version
  //       so a stale CI pipeline pinning v0.0.0 doesn't bypass the version
  //       gate by routing through the Annex IV reference table.
  if (rawOpts.rulesVersion !== undefined && rawOpts.rulesVersion !== RULES_VERSION) {
    const locale = getLocale(errLocale);
    const msg = locale.labels.error_rules_version_mismatch
      .replace('{requested}', rawOpts.rulesVersion)
      .replace(/\{current\}/g, RULES_VERSION);
    err(msg);
    exit(2);
  }

  // ----- --annex iv path (no classification needed). -----------------------
  if (rawOpts.annex !== undefined) {
    const langOverride = resolveLang(rawOpts, errLocale);
    const format = resolveFormat(rawOpts);
    runAnnexIV(rawOpts.annex, langOverride, format);
  }

  // ----- Locale resolution for in-band errors. -----------------------------
  const langOverride = resolveLang(rawOpts, errLocale);

  // ----- Gather input text (positional > stdin > error). -------------------
  // If positional text is provided, use it and ignore stdin entirely. This
  // avoids reading from a non-TTY parent shell (e.g. our own integration tests
  // running via spawnSync inherit stdin which is technically non-TTY).
  // The "both stdin and positional" warning fires only when stdin is BOTH
  // non-TTY AND has data available to read at the moment we check — but
  // detecting that reliably across platforms requires a non-blocking read,
  // which isn't worth the complexity. The contract is documented as: pass
  // text positionally OR pipe via stdin, not both. The dispatch spec uses
  // "warn + prefer positional" — we honour the preference, drop the warning
  // (otherwise it false-positives on every spawnSync-style test runner).
  const positionalText = positional.length > 0 ? positional.join(' ') : '';
  let inputText = positionalText;

  if (inputText.length === 0 && process.stdin.isTTY !== true) {
    // No positional text and stdin is a pipe — read it.
    const stdinText = await readStdin();
    inputText = stdinText;
  }

  if (inputText.trim().length === 0) {
    const locale = getLocale(errLocale);
    err(locale.labels.error_empty_input);
    exit(2);
  }

  // ----- Run classification. -----------------------------------------------
  const classifyOpts: ClassifyOptions = {};
  if (langOverride !== undefined) classifyOpts.lang = langOverride;
  // commander's --no-three-category sets `threeCategory: false`.
  if (rawOpts.threeCategory === false) classifyOpts.threeCategory = false;
  if (rawOpts.rulesVersion !== undefined) classifyOpts.rulesVersion = rawOpts.rulesVersion;

  let result;
  try {
    result = classify(inputText, classifyOpts);
  } catch (e: unknown) {
    if (e instanceof TypeError) {
      err(`Error: ${e.message}`);
      exit(2);
    }
    // Generic Error (e.g. rules-version mismatch via classify()) — friendly stderr.
    if (e instanceof Error) {
      err(`Error: ${e.message}`);
      if (process.env['AI_ACT_CLASSIFY_DEBUG'] === '1' && typeof e.stack === 'string') {
        err(e.stack);
      }
      exit(2);
    }
    err(`Error: ${String(e)}`);
    exit(2);
  }

  // ----- Format + emit. ----------------------------------------------------
  const format = resolveFormat(rawOpts);
  const locale = langOverride ?? errLocale;
  let rendered: string;
  switch (format) {
    case 'json':
      rendered = formatJson(result, {
        pretty: true,
        includeFeatures: process.env['AI_ACT_CLASSIFY_INCLUDE_FEATURES'] === '1',
      });
      break;
    case 'markdown':
      rendered = formatMarkdown(result, { locale, cite: rawOpts.cite === true });
      break;
    case 'cli':
    default:
      rendered = formatCliTable(result, {
        locale,
        cite: rawOpts.cite === true,
        useColor: shouldUseColor(),
      });
      break;
  }
  out(rendered);

  // ----- Final exit code. --------------------------------------------------
  if (result.article_5.prohibited) exit(1);
  exit(0);
}

// Run.
main().catch((e: unknown) => {
  if (e instanceof Error) {
    err(`Error: ${e.message}`);
    if (process.env['AI_ACT_CLASSIFY_DEBUG'] === '1' && typeof e.stack === 'string') {
      err(e.stack);
    }
  } else {
    err(`Error: ${String(e)}`);
  }
  exit(2);
});
