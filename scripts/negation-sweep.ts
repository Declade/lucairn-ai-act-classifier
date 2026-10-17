// scripts/negation-sweep.ts — differential safety report for negation handling.
//
// CLI:
//   node --import tsx scripts/negation-sweep.ts --reference <dir | git rev> [--json] [--verbose]
//
//   --reference (REQUIRED)  the PRE-negation engine to compare against:
//                           - a git revision of this repo (e.g. `cee0381b`): its
//                             `src/` + `package.json` are extracted with
//                             `git archive` into a temp dir (removed at exit), or
//                           - a directory holding a checkout (its src/classify.ts).
//                           The reference revision is printed. A reference whose
//                           src/ tree is identical to this working tree's is
//                           refused (that would compare the engine with itself).
//
// Reports (EN + DE), per shape family (scripts/negation-cases.ts buildSweep):
//   unrelated-negation · post-phrase-continuation · subject-position ·
//   list-plus-affirmative · reviewer-inputs
//   → sentences whose verdict is LOWER than the reference's (3 prohibited ·
//     2 high-risk · 1 Art 50 · 0 none), and sentences that lost an Art 5 letter
//     / Annex III domain. Target 0.
//   Generator honesty: every unrelated-negation trigger ALONE, and every
//   sentence of the other families, must be high-risk or prohibited on the
//   reference — otherwise the shape tests nothing and the run FAILS.
// Plus MUST_STILL_FIRE (verdict ≥ reference, no lost trigger) and the
// GOVERNED_NEGATION_SET (0 prohibited / high-risk, each phrase in
// negated_hits with status "denied"; PRD Locked criterion 1).
//
// Exit code: 0 all targets met · 1 any target missed · 2 usage / setup error.

import { resolve as pathResolve, join, relative } from 'node:path';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { classify } from '../src/classify.js';
import type { ClassifyResult } from '../src/classify.js';
import {
  MUST_STILL_FIRE,
  GOVERNED_NEGATION_SET,
  SWEEP_FAMILIES,
  buildSweep,
  verdictLevel,
  verdictLabel,
  droppedTriggers,
} from './negation-cases.js';
import type { Lang, SweepFamily, VerdictLike } from './negation-cases.js';

type Classifier = (text: string, opts: { lang: Lang }) => Promise<VerdictLike>;

const REPO_ROOT = pathResolve(fileURLToPath(new URL('..', import.meta.url)));

function parseArgs(argv: string[]): { reference: string; json: boolean; verbose: boolean } {
  let reference: string | undefined;
  let json = false;
  let verbose = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reference') {
      reference = argv[++i];
      if (reference === undefined) throw new Error('--reference needs a directory or git revision');
    } else if (a === '--json') json = true;
    else if (a === '--verbose') verbose = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (reference === undefined) {
    throw new Error('--reference <dir | git rev> is required (e.g. --reference cee0381b, the pre-negation main)');
  }
  return { reference, json, verbose };
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Content hash of every file under dir (relative path + bytes, sorted). */
function treeHash(dir: string): string {
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(dir);
  files.sort();
  const h = createHash('sha256');
  for (const f of files) {
    h.update(relative(dir, f));
    h.update('\0');
    h.update(readFileSync(f));
    h.update('\0');
  }
  return h.digest('hex');
}

interface Reference {
  classify: Classifier;
  revision: string;
  cleanup: () => void;
}

async function loadReference(spec: string): Promise<Reference> {
  let root: string;
  let revision: string;
  let cleanup = (): void => {};
  const asDir = pathResolve(spec);
  if (existsSync(join(asDir, 'src', 'classify.ts'))) {
    root = asDir;
    try {
      const head = git(['rev-parse', 'HEAD'], root);
      const dirty = git(['status', '--porcelain', '--', 'src', 'package.json'], root).length > 0;
      revision = `${head}${dirty ? ' (dirty working tree)' : ''} at ${root}`;
    } catch {
      revision = `(not a git checkout) ${root}`;
    }
  } else {
    let sha: string;
    try {
      sha = git(['rev-parse', '--verify', `${spec}^{commit}`], REPO_ROOT);
    } catch {
      throw new Error(`--reference ${spec}: neither a checkout directory nor a git revision of this repo`);
    }
    root = mkdtempSync(join(tmpdir(), 'negation-sweep-ref-'));
    cleanup = (): void => rmSync(root, { recursive: true, force: true });
    const tar = execFileSync('git', ['archive', '--format=tar', sha, 'src', 'package.json'], {
      cwd: REPO_ROOT,
      maxBuffer: 256 * 1024 * 1024,
    });
    execFileSync('tar', ['-x', '-C', root], { input: tar });
    revision = sha;
  }
  if (treeHash(join(root, 'src')) === treeHash(join(REPO_ROOT, 'src'))) {
    cleanup();
    throw new Error(`--reference ${spec}: its src/ is identical to this working tree — refusing to compare the engine with itself`);
  }
  const mod = (await import(pathToFileURL(join(root, 'src', 'classify.ts')).href)) as { classify: Classifier };
  return { classify: mod.classify, revision, cleanup };
}

interface FamilyReport {
  total: number;
  lowered: number;
  dropped_trigger: number;
  reference_not_triggering: number;
  lowered_cases: Array<{ text: string; reference: string; candidate: string }>;
  dropped_cases: Array<{ text: string; lost: string[] }>;
  reference_not_triggering_cases: string[];
}

async function main(): Promise<number> {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`negation-sweep: ${(e as Error).message}\n`);
    return 2;
  }
  let reference: Reference;
  try {
    reference = await loadReference(args.reference);
  } catch (e) {
    process.stderr.write(`negation-sweep: ${(e as Error).message}\n`);
    return 2;
  }
  try {
    return await run(args, reference);
  } finally {
    reference.cleanup();
  }
}

async function run(args: { json: boolean; verbose: boolean }, reference: Reference): Promise<number> {
  const candidate: Classifier = (text, opts) => classify(text, opts);
  const report: Record<string, unknown> = { reference: reference.revision };
  let failed = false;

  // 1. Sweep, per language × family.
  const sweep: Record<string, Record<string, FamilyReport>> = {};
  for (const lang of ['en', 'de'] as const) {
    const perFamily: Record<string, FamilyReport> = {};
    for (const f of SWEEP_FAMILIES) {
      perFamily[f] = {
        total: 0,
        lowered: 0,
        dropped_trigger: 0,
        reference_not_triggering: 0,
        lowered_cases: [],
        dropped_cases: [],
        reference_not_triggering_cases: [],
      };
    }
    const triggerChecked = new Set<string>();
    for (const c of buildSweep(lang)) {
      const fr = perFamily[c.family] as FamilyReport;
      fr.total++;
      // Generator honesty: the shape must trigger on the reference.
      if (c.family === 'unrelated-negation' && c.trigger !== undefined) {
        if (!triggerChecked.has(c.trigger)) {
          triggerChecked.add(c.trigger);
          const alone = await reference.classify(`${c.trigger.charAt(0).toUpperCase()}${c.trigger.slice(1)}.`, { lang });
          if (verdictLevel(alone) < 2) {
            fr.reference_not_triggering++;
            fr.reference_not_triggering_cases.push(`(trigger alone) ${c.trigger}`);
          }
        }
      }
      const ref = await reference.classify(c.text, { lang });
      if (c.family !== 'unrelated-negation' && verdictLevel(ref) < 2) {
        fr.reference_not_triggering++;
        fr.reference_not_triggering_cases.push(c.text);
      }
      const cand = await candidate(c.text, { lang });
      if (verdictLevel(cand) < verdictLevel(ref)) {
        fr.lowered++;
        fr.lowered_cases.push({ text: c.text, reference: verdictLabel(ref), candidate: verdictLabel(cand) });
      }
      const lost = droppedTriggers(ref, cand);
      if (lost.length > 0) {
        fr.dropped_trigger++;
        fr.dropped_cases.push({ text: c.text, lost });
      }
    }
    for (const fr of Object.values(perFamily)) {
      if (fr.lowered > 0 || fr.dropped_trigger > 0 || fr.reference_not_triggering > 0) failed = true;
    }
    sweep[lang] = perFamily;
  }
  report.sweep = sweep;

  // 2. MUST_STILL_FIRE.
  const mustFire: Array<{ id: string; text: string; reference: string; candidate: string; ok: boolean }> = [];
  for (const c of MUST_STILL_FIRE) {
    const cand = await candidate(c.text, { lang: c.lang });
    const ref = await reference.classify(c.text, { lang: c.lang });
    const ok = verdictLevel(cand) >= verdictLevel(ref) && droppedTriggers(ref, cand).length === 0 && verdictLevel(ref) >= 2;
    if (!ok) failed = true;
    mustFire.push({ id: c.id, text: c.text, reference: verdictLabel(ref), candidate: verdictLabel(cand), ok });
  }
  report.must_still_fire = {
    total: mustFire.length,
    failures: mustFire.filter((m) => !m.ok).length,
    cases: args.verbose ? mustFire : mustFire.filter((m) => !m.ok),
  };

  // 3. GOVERNED_NEGATION_SET.
  const negSet: Array<{ id: string; text: string; candidate: string; false_trigger: boolean; negated_hit: boolean; ok: boolean }> = [];
  for (const c of GOVERNED_NEGATION_SET) {
    const r = (await candidate(c.text, { lang: c.lang })) as ClassifyResult;
    const falseTrigger = r.article_5.prohibited || r.annex_iii.high_risk;
    const negatedHit = r.negated_hits.some((h) => h.phrase === c.phrase && h.status === 'denied');
    const ok = !falseTrigger && negatedHit;
    if (!ok) failed = true;
    negSet.push({ id: c.id, text: c.text, candidate: verdictLabel(r), false_trigger: falseTrigger, negated_hit: negatedHit, ok });
  }
  report.governed_negation_set = {
    total: negSet.length,
    false_triggers: negSet.filter((n) => n.false_trigger).length,
    missing_negated_hits: negSet.filter((n) => !n.negated_hit).length,
    cases: args.verbose ? negSet : negSet.filter((n) => !n.ok),
  };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const lines: string[] = [];
    lines.push(`negation-sweep — reference revision: ${reference.revision}`);
    for (const lang of ['en', 'de'] as const) {
      const perFamily = sweep[lang] as Record<SweepFamily, FamilyReport>;
      let lt = 0;
      let tt = 0;
      for (const f of SWEEP_FAMILIES) {
        const fr = perFamily[f];
        lt += fr.lowered;
        tt += fr.total;
        lines.push(
          `  ${lang.toUpperCase()} ${f.padEnd(25)} ${String(fr.lowered).padStart(3)} / ${String(fr.total).padStart(4)} lowered · ${fr.dropped_trigger} lost a trigger · ${fr.reference_not_triggering} not triggering on reference`,
        );
        for (const c of [...fr.lowered_cases, ...fr.dropped_cases, ...fr.reference_not_triggering_cases]) {
          lines.push(`      ${JSON.stringify(c)}`);
        }
      }
      lines.push(`  ${lang.toUpperCase()} ${'ALL'.padEnd(25)} ${String(lt).padStart(3)} / ${String(tt).padStart(4)} lowered`);
    }
    const mf = report.must_still_fire as { total: number; failures: number; cases: unknown[] };
    lines.push(`  must-still-fire: ${mf.total - mf.failures} / ${mf.total} equal or higher than reference`);
    for (const c of mf.cases) lines.push(`    ${JSON.stringify(c)}`);
    const ns = report.governed_negation_set as { total: number; false_triggers: number; missing_negated_hits: number; cases: unknown[] };
    lines.push(`  governed negation set: ${ns.false_triggers} false triggers / ${ns.total} · ${ns.missing_negated_hits} missing negated_hits (status "denied")`);
    for (const c of ns.cases) lines.push(`    ${JSON.stringify(c)}`);
    lines.push(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
    process.stdout.write(`${lines.join('\n')}\n`);
  }
  return failed ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(`negation-sweep: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exitCode = 2;
  },
);
