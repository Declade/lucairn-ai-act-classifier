// CLI integration tests. Spawn the built `dist/cli.js` via `child_process.spawnSync`.
//
// Sandbox-EPERM-friendly: if `dist/cli.js` doesn't exist, skip the suite with
// a console warning rather than failing (Day-4 lesson 6 / Day-5 PR #5 effective-PASS
// pattern — orchestrator pre-commit gates confirm all-green against the same
// SHA).

import { describe, it, expect } from 'vitest';
import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const CLI_PATH = join(REPO_ROOT, 'dist', 'cli.js');
const HAS_DIST = existsSync(CLI_PATH);

if (!HAS_DIST) {
  // eslint-disable-next-line no-console
  console.warn(
    `[cli.spec.ts] dist/cli.js not found at ${CLI_PATH} — skipping CLI integration suite. Run \`pnpm build\` first.`,
  );
}

function runCli(args: string[], opts: { stdin?: string; env?: Record<string, string> } = {}): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    input: opts.stdin ?? '',
    encoding: 'utf8',
    env: {
      ...process.env,
      // Force NO_COLOR by default so test assertions don't need to deal with ANSI.
      NO_COLOR: '1',
      ...(opts.env ?? {}),
    },
  });
}

function runCliThroughPipes(
  args: string[],
  opts: { stdin?: string; env?: Record<string, string> } = {},
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      env: {
        ...process.env,
        NO_COLOR: '1',
        ...(opts.env ?? {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (status) => {
      resolve({
        status,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
    child.stdin.end(opts.stdin ?? '');
  });
}

// `it.skipIf` lets us cleanly skip every test in the suite when dist isn't there.
const itDist = HAS_DIST ? it : it.skip;

describe('CLI integration — happy paths', () => {
  itDist('high-risk EN input → exit 0 + stdout contains "EU AI Act mapping" + "HIGH-RISK"', () => {
    const r = runCli(['We use AI for CV screening and applicant tracking.']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('EU AI Act mapping');
    expect(r.stdout).toContain('HIGH-RISK');
  });

  itDist('--json flag → stdout is parseable JSON', () => {
    const r = runCli(['--json', 'We use AI for CV screening.']);
    expect(r.status).toBe(0);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });

  itDist('--format markdown → stdout begins with "## EU AI Act mapping"', () => {
    const r = runCli(['--format', 'markdown', 'We use AI for CV screening.']);
    expect(r.status).toBe(0);
    expect(r.stdout.trimStart().startsWith('## EU AI Act mapping')).toBe(true);
  });

  itDist('stdin pipe → exit 0', () => {
    const r = runCli([], { stdin: 'We use AI for CV screening and applicant tracking.\n' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('EU AI Act mapping');
  });

  itDist('--annex iv → exits 0, prints Annex IV table', () => {
    const r = runCli(['--annex', 'iv']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Annex IV — Technical documentation');
    expect(r.stdout).toContain('Regulation (EU) 2024/1689');
  });

  itDist('--annex iv with --lang de → DE Anhang IV table', () => {
    const r = runCli(['--annex', 'iv', '--lang', 'de']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Anhang IV — Technische Dokumentation');
    expect(r.stdout).toContain('Verordnung (EU) 2024/1689');
  });

  itDist('--rules-version v0.3.1 → exits 0 (matches current)', () => {
    const r = runCli(['--rules-version', 'v0.3.1', 'We use AI for CV screening.']);
    expect(r.status).toBe(0);
  });

  itDist('--help → exits 0 + stdout contains every flag name', () => {
    const r = runCli(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('--format');
    expect(r.stdout).toContain('--json');
    expect(r.stdout).toContain('--lang');
    expect(r.stdout).toContain('--cite');
    expect(r.stdout).toContain('--no-three-category');
    expect(r.stdout).toContain('--rules-version');
    expect(r.stdout).toContain('--annex');
  });

  // Day-13 polish: --help text MUST include both an Examples section and an
  // Exit codes section so first-time users can copy-paste invocations and
  // understand the exit code semantics without reading the README.
  itDist('--help → contains Examples + Exit codes sections (Day-13 polish)', () => {
    const r = runCli(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Examples:');
    expect(r.stdout).toContain('Exit codes:');
    // Exit code list must enumerate all 4 documented codes (0, 1, 2, 3).
    expect(r.stdout).toMatch(/0\s+classification ok/);
    expect(r.stdout).toMatch(/1\s+Article 5 prohibited/);
    expect(r.stdout).toMatch(/2\s+parse error/);
    expect(r.stdout).toMatch(/3\s+LLM error/);
  });
});

describe('CLI integration — piped output drains before exit', () => {
  const LARGE_INPUT = 'We use AI for CV screening and applicant ranking. '.repeat(30_000);

  itDist('--json large output through a captured pipe → exit 0 + complete parseable JSON', async () => {
    const r = await runCliThroughPipes(['--json'], {
      stdin: LARGE_INPUT,
      env: { AI_ACT_CLASSIFY_INCLUDE_FEATURES: '1' },
    });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout) as { input_text: string };
    expect(parsed.input_text).toBe(LARGE_INPUT);
  });

  itDist('prohibited JSON through a captured pipe → exit 1 + complete parseable JSON', async () => {
    const r = await runCliThroughPipes([
      '--json',
      'We deploy real-time facial recognition for general law-enforcement surveillance in public spaces.',
    ]);
    expect(r.status).toBe(1);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });

  itDist('parse and LLM errors through captured stderr → exit 2/3 + complete diagnostics', async () => {
    const parseError = await runCliThroughPipes(['--rules-version', 'v99.99.99', 'anything']);
    expect(parseError.status).toBe(2);
    expect(parseError.stderr).toContain('rules-version');

    const llmError = await runCliThroughPipes(['--llm', 'mistral', 'anything']);
    expect(llmError.status).toBe(3);
    expect(llmError.stderr).toContain('Supported: anthropic, openai, groq');
  });

  it('production CLI contains no forced process.exit call', () => {
    // Keep this source-level invariant close to the process-I/O regression it protects.
    const source = readFileSync(join(REPO_ROOT, 'src', 'cli.ts'), 'utf8');
    expect(source).not.toContain('process.exit(');
  });
});

describe('CLI integration — error + exit-code paths', () => {
  itDist('empty input (no args, no stdin) → exit 2 + stderr non-empty', () => {
    const r = runCli([]);
    expect(r.status).toBe(2);
    expect(r.stderr.length).toBeGreaterThan(0);
    expect(r.stderr).toContain('no input');
  });

  itDist('Article 5 prohibited fixture → exit 1', () => {
    const r = runCli([
      'We deploy real-time facial recognition for general law-enforcement surveillance in public spaces.',
    ]);
    expect(r.status).toBe(1);
    // The output should still render (prohibited shown to the user).
    expect(r.stdout).toContain('PROHIBITED');
  });

  itDist('--annex foo (unsupported reference) → exit 2', () => {
    const r = runCli(['--annex', 'foo']);
    expect(r.status).toBe(2);
    expect(r.stderr.length).toBeGreaterThan(0);
  });

  itDist('--rules-version v99.99.99 → exits 2 + stderr', () => {
    const r = runCli(['--rules-version', 'v99.99.99', 'anything']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('rules-version');
  });

  itDist('--lang fr (invalid value) → exit 2', () => {
    const r = runCli(['--lang', 'fr', 'anything']);
    expect(r.status).toBe(2);
    expect(r.stderr.length).toBeGreaterThan(0);
  });

  // H1 fix-up — --annex iv must respect --rules-version
  itDist('--annex iv --rules-version v99.99.99 → exit 2 (H1 fix-up)', () => {
    const r = runCli(['--annex', 'iv', '--rules-version', 'v99.99.99']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('rules-version');
  });

  // L1 fix-up — commander unknown-flag must exit 2 (not 1)
  itDist('--foo bar (unknown flag) → exit 2 (L1 fix-up)', () => {
    const r = runCli(['--foo', 'bar']);
    expect(r.status).toBe(2);
    expect(r.stderr.length).toBeGreaterThan(0);
  });
});

// M4 fix-up — --annex iv honors --format / --json
describe('CLI integration — --annex iv format dispatch (M4 fix-up)', () => {
  itDist('--annex iv --format json → exit 0, stdout is parseable JSON', () => {
    const r = runCli(['--annex', 'iv', '--format', 'json']);
    expect(r.status).toBe(0);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const parsed = JSON.parse(r.stdout) as {
      items: ReadonlyArray<{ number: string; title: string }>;
    };
    expect(parsed.items.length).toBe(9);
  });

  itDist('--annex iv --json → exit 0, stdout is parseable JSON (shortcut form)', () => {
    const r = runCli(['--annex', 'iv', '--json']);
    expect(r.status).toBe(0);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });

  itDist('--annex iv --format markdown → exit 0, stdout starts with H2 heading', () => {
    const r = runCli(['--annex', 'iv', '--format', 'markdown']);
    expect(r.status).toBe(0);
    expect(r.stdout.trimStart().startsWith('## Annex IV')).toBe(true);
    expect(r.stdout).toContain('Informational tool');
  });

  itDist('--annex iv --format markdown --lang de → DE H2 + Tier-1 verbatim items', () => {
    const r = runCli(['--annex', 'iv', '--format', 'markdown', '--lang', 'de']);
    expect(r.status).toBe(0);
    expect(r.stdout.trimStart().startsWith('## Anhang IV')).toBe(true);
    expect(r.stdout).toContain('Darlegungen zur Eignung der Leistungskennzahlen');
  });
});

describe('CLI integration — --llm flag (Day 10: anthropic + openai + groq)', () => {
  itDist('--llm anthropic without ANTHROPIC_API_KEY → exit 3 + helpful stderr', () => {
    // Strip the env var explicitly so any local-shell ANTHROPIC_API_KEY
    // doesn't leak in and turn this test into a real API call.
    const env = { ...process.env };
    delete env['ANTHROPIC_API_KEY'];
    const r = spawnSync(process.execPath, [CLI_PATH, '--llm', 'anthropic', 'We use AI for CV screening.'], {
      input: '',
      encoding: 'utf8',
      env: { ...env, NO_COLOR: '1' },
    });
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
    // Day-13 polish: recovery hint with the exact export command MUST appear
    // so users can copy-paste from the terminal without consulting the README.
    expect(r.stderr).toContain('Set via:');
    expect(r.stderr).toContain('export ANTHROPIC_API_KEY=');
  });

  itDist('--llm openai without OPENAI_API_KEY → exit 3 + helpful stderr + recovery hint', () => {
    const env = { ...process.env };
    delete env['OPENAI_API_KEY'];
    const r = spawnSync(process.execPath, [CLI_PATH, '--llm', 'openai', 'We use AI for CV screening.'], {
      input: '',
      encoding: 'utf8',
      env: { ...env, NO_COLOR: '1' },
    });
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('OPENAI_API_KEY');
    // Day-13 polish: recovery hint with the exact export command.
    expect(r.stderr).toContain('export OPENAI_API_KEY=');
  });

  itDist('--llm groq without GROQ_API_KEY → exit 3 + helpful stderr + recovery hint', () => {
    const env = { ...process.env };
    delete env['GROQ_API_KEY'];
    const r = spawnSync(process.execPath, [CLI_PATH, '--llm', 'groq', 'We use AI for CV screening.'], {
      input: '',
      encoding: 'utf8',
      env: { ...env, NO_COLOR: '1' },
    });
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('GROQ_API_KEY');
    // Day-13 polish: recovery hint with the exact export command.
    expect(r.stderr).toContain('export GROQ_API_KEY=');
  });

  itDist('--llm mistral → exit 3 with "Supported: anthropic, openai, groq" hint', () => {
    const r = runCli(['--llm', 'mistral', 'We use AI for CV screening.']);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('Supported');
    expect(r.stderr).toContain('anthropic');
    expect(r.stderr).toContain('openai');
    expect(r.stderr).toContain('groq');
  });

  itDist('--help mentions --llm flag with all three providers', () => {
    const r = runCli(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('--llm');
    expect(r.stdout).toContain('anthropic');
    expect(r.stdout).toContain('openai');
    expect(r.stdout).toContain('groq');
  });

  itDist('--help mentions --no-cache flag', () => {
    const r = runCli(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('--no-cache');
  });
});

// ---------------------------------------------------------------------------
// M4 fix-up — --explain CLI integration tests (Day-11 PR #11 fix-up r1)
// ---------------------------------------------------------------------------
//
// Closes bug-hunter M4: pre-fix-up cli.spec.ts had 28 tests; none touched the
// new `--explain` flag. The 6 tests below exercise the flag via spawnSync
// against the built `dist/cli.js` — same pattern as the other --llm + --annex
// CLI tests above. Tests skip-gracefully when `dist/cli.js` is absent.

const HIGH_RISK_EMPLOYMENT_INPUT =
  'Our AI tool screens CVs and ranks job applicants based on resume content and predicted job-fit scores; HR teams use the candidate ranking for hiring decisions.';
const ART5_PROHIBITED_INPUT =
  'A predictive policing profiling tool based solely on profiling of natural persons to forecast risk of criminal offences.';

describe('CLI integration — --explain (bug-hunter M4)', () => {
  itDist('--explain produces markdown output by default (no --explain-format)', () => {
    const r = runCli(['--explain', HIGH_RISK_EMPLOYMENT_INPUT]);
    expect(r.status).toBe(0);
    // Header from formatExplain markdown renderer.
    expect(r.stdout).toMatch(/## EU AI Act classification — reasoning trace/);
    // Heading style is markdown (### per fired article).
    expect(r.stdout).toContain('### Annex III ¶4');
    // Verbatim chapeau quote (FX4 fix) is present inside a blockquote.
    expect(r.stdout).toMatch(/> Employment, workers' management and access to self-employment:/);
    // Mandatory disclaimer footer.
    expect(r.stdout).toMatch(/Informational tool — not legal advice/);
  });

  itDist('--explain --explain-format json produces valid JSON output', () => {
    const r = runCli(['--explain', '--explain-format', 'json', HIGH_RISK_EMPLOYMENT_INPUT]);
    expect(r.status).toBe(0);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const parsed = JSON.parse(r.stdout) as {
      header: { detected_lang: string; mode: string; rules_version: string };
      fired: ReadonlyArray<{ id: string }>;
      disclaimer: string;
    };
    expect(parsed.header.detected_lang).toBe('en');
    expect(parsed.header.mode).toBe('deterministic');
    expect(Array.isArray(parsed.fired)).toBe(true);
    expect(parsed.fired.some((f) => f.id === 'annex_iii_4')).toBe(true);
    expect(parsed.disclaimer).toMatch(/legal advice/i);
  });

  itDist('--explain --explain-format text produces plain-text output (no markdown syntax)', () => {
    const r = runCli(['--explain', '--explain-format', 'text', HIGH_RISK_EMPLOYMENT_INPUT]);
    expect(r.status).toBe(0);
    // Plain-text format uses "-- HEADING --" delimiters; markdown's ###/`>` MUST be absent.
    expect(r.stdout).toContain('-- Annex III ¶4');
    expect(r.stdout).not.toMatch(/^### /m);
    expect(r.stdout).not.toMatch(/^> /m);
    // ASCII underline below the section title.
    expect(r.stdout).toMatch(/EU AI Act classification reasoning trace\n=+/);
  });

  itDist('--explain --with-excerpt appends commentary excerpt when fixture matches an excerpt key', () => {
    const r = runCli(['--explain', '--with-excerpt', HIGH_RISK_EMPLOYMENT_INPUT]);
    expect(r.status).toBe(0);
    // The Annex III ¶4 fire maps to excerpt key 'annex-iii-4-employment' which
    // ships in dist/content/blog-excerpts/. The commentary block heading
    // appears in both EN and DE locales.
    expect(r.stdout).toMatch(/### Lucairn commentary \(excerpts\)/);
    // Content from the excerpt file should be present.
    expect(r.stdout).toMatch(/Annex III paragraph 4 of Regulation \(EU\) 2024\/1689/);
  });

  itDist('--explain --format json is silent override (--explain wins, JSON-explain output, not regular JSON)', () => {
    // --format json without --explain produces the regular formatJson() output
    // (a classify() result envelope). --explain --format json should produce the
    // formatExplain markdown (because --explain overrides --format, per
    // cli.ts:resolveFormat documentation in the help text). The behaviour
    // contract is: --explain wins, --format is ignored, output is the default
    // --explain-format (markdown).
    const r = runCli(['--explain', '--format', 'json', HIGH_RISK_EMPLOYMENT_INPUT]);
    expect(r.status).toBe(0);
    // Markdown output, NOT a parseable JSON envelope.
    expect(r.stdout).toMatch(/## EU AI Act classification — reasoning trace/);
    expect(() => JSON.parse(r.stdout)).toThrow();
  });

  itDist('--explain exit code is 1 when input triggers Art 5 prohibition (same as default CLI)', () => {
    const r = runCli(['--explain', ART5_PROHIBITED_INPUT]);
    // Build-plan exit-code scheme reserves 1 for "Article 5 prohibited
    // triggered" regardless of output format. The --explain markdown renders
    // the Article 5 fire + a "cascade suppressed by Article 5" nearest-miss.
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/### Article 5\(1\)\(d\)/);
    // Cascade-suppressed nearest-miss surfaces.
    expect(r.stdout).toMatch(/suppressed by Article 5/i);
  });
});

describe('CLI integration — disclaimer present', () => {
  itDist('CLI table output contains the disclaimer footer (EN)', () => {
    const r = runCli(['We use AI for CV screening.']);
    expect(r.stdout).toContain('Informational tool');
    expect(r.stdout).toContain('§Disclaimer');
  });

  itDist('CLI table output contains the disclaimer footer (DE)', () => {
    const r = runCli(['--lang', 'de', 'Wir setzen ein KI-System zur Bewerberauswahl ein.']);
    expect(r.stdout).toContain('Informationelles Werkzeug');
  });

  itDist('Markdown output contains the disclaimer footer', () => {
    const r = runCli(['--format', 'markdown', 'We use AI for CV screening.']);
    expect(r.stdout).toContain('Informational tool');
  });
});
