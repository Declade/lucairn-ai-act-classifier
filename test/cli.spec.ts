// CLI integration tests. Spawn the built `dist/cli.js` via `child_process.spawnSync`.
//
// Sandbox-EPERM-friendly: if `dist/cli.js` doesn't exist, skip the suite with
// a console warning rather than failing (Day-4 lesson 6 / Day-5 PR #5 effective-PASS
// pattern — orchestrator pre-commit gates confirm all-green against the same
// SHA).

import { describe, it, expect } from 'vitest';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync } from 'node:fs';
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

  itDist('--rules-version v0.1.1 → exits 0 (matches current)', () => {
    const r = runCli(['--rules-version', 'v0.1.1', 'We use AI for CV screening.']);
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

describe('CLI integration — --llm flag (Day 10: anthropic + openai)', () => {
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
  });

  itDist('--llm openai without OPENAI_API_KEY → exit 3 + helpful stderr', () => {
    const env = { ...process.env };
    delete env['OPENAI_API_KEY'];
    const r = spawnSync(process.execPath, [CLI_PATH, '--llm', 'openai', 'We use AI for CV screening.'], {
      input: '',
      encoding: 'utf8',
      env: { ...env, NO_COLOR: '1' },
    });
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('OPENAI_API_KEY');
  });

  itDist('--llm groq → exit 3 with "lands in the next commit" hint', () => {
    const r = runCli(['--llm', 'groq', 'We use AI for CV screening.']);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('next commit');
  });

  itDist('--llm mistral → exit 3 with "Supported: anthropic, openai" hint', () => {
    const r = runCli(['--llm', 'mistral', 'We use AI for CV screening.']);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('Supported');
    expect(r.stderr).toContain('anthropic');
    expect(r.stderr).toContain('openai');
  });

  itDist('--help mentions --llm flag with anthropic + openai', () => {
    const r = runCli(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('--llm');
    expect(r.stdout).toContain('anthropic');
    expect(r.stdout).toContain('openai');
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
