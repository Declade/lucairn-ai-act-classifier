// scripts/negation-sweep.ts — differential report: negation must never change a verdict.
//
// CLI:
//   node --import tsx scripts/negation-sweep.ts --reference <dir | git rev> [--json] [--verbose]
//
//   --reference (REQUIRED)  the PRE-negation engine to compare against (PRD
//                           Locked criterion 1: main `cee0381b`):
//                           - a git revision of this repo (e.g. `cee0381b`): its
//                             `src/` + `package.json` are extracted with
//                             `git archive` into a temp dir (removed at exit), or
//                           - a directory holding a checkout (its src/classify.ts).
//                           The reference revision is printed. Refused (exit 2):
//                           a src/ tree identical to this working tree's; a
//                           reference that reports `negated_hits` (it already
//                           has negation handling, so it is not the
//                           pre-negation engine); a reference that does not
//                           fire high-risk / prohibited on EVERY sentence of
//                           the governed-negation set (a suppressing near-copy).
//
// Reports (EN + DE), per shape family (scripts/negation-cases.ts buildSweep):
//   unrelated-negation · post-phrase-continuation · subject-position ·
//   list-plus-affirmative · reviewer-inputs
//   → sentences whose verdict differs from the reference IN EITHER DIRECTION
//     (full fingerprint: every rule result, confidence, fired hits). Target 0.
//     Plus how many sentences carry the advisory note.
//   Generator honesty: every unrelated-negation trigger ALONE, and every
//   sentence of the other families, must be high-risk or prohibited on the
//   reference — otherwise the shape tests nothing and the run FAILS.
// Plus MUST_STILL_FIRE (verdict identical, reference high-risk / prohibited)
// and the GOVERNED_NEGATION_SET (verdict identical AND the phrase carries the
// advisory note; PRD Locked criterion 1, Amendment 1).
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
  verdictFingerprint,
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
  // The reference must be the PRE-negation engine (closes the near-copy loophole).
  const problems: string[] = [];
  for (const c of GOVERNED_NEGATION_SET) {
    const r = (await mod.classify(c.text, { lang: c.lang })) as VerdictLike & Record<string, unknown>;
    if ('negated_hits' in r) {
      problems.push('it reports negated_hits, so it already has negation handling');
      break;
    }
    if (verdictLevel(r) < 2) problems.push(`it does not fire high-risk / prohibited on governed-negation sentence ${c.id} ("${c.text}")`);
  }
  if (problems.length > 0) {
    cleanup();
    throw new Error(`--reference ${spec}: not the pre-negation engine — ${problems.join('; ')}`);
  }
  return { classify: mod.classify, revision, cleanup };
}

interface FamilyReport {
  total: number;
  changed: number;
  noted: number;
  reference_not_triggering: number;
  changed_cases: Array<{ text: string; reference: string; candidate: string }>;
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
  const candidate = (text: string, opts: { lang: Lang }): Promise<ClassifyResult> => classify(text, opts);
  const report: Record<string, unknown> = { reference: reference.revision };
  let failed = false;
  let notedTotal = 0;
  let sentencesTotal = 0;

  // 1. Sweep, per language × family.
  const sweep: Record<string, Record<string, FamilyReport>> = {};
  for (const lang of ['en', 'de'] as const) {
    const perFamily: Record<string, FamilyReport> = {};
    for (const f of SWEEP_FAMILIES) {
      perFamily[f] = { total: 0, changed: 0, noted: 0, reference_not_triggering: 0, changed_cases: [], reference_not_triggering_cases: [] };
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
      if (verdictFingerprint(cand) !== verdictFingerprint(ref)) {
        fr.changed++;
        fr.changed_cases.push({ text: c.text, reference: verdictLabel(ref), candidate: verdictLabel(cand) });
      }
      if (cand.negated_hits.length > 0) fr.noted++;
    }
    for (const fr of Object.values(perFamily)) {
      if (fr.changed > 0 || fr.reference_not_triggering > 0) failed = true;
      notedTotal += fr.noted;
      sentencesTotal += fr.total;
    }
    sweep[lang] = perFamily;
  }
  report.sweep = sweep;

  // 2. MUST_STILL_FIRE — identical verdict, and the reference fires.
  const mustFire: Array<{ id: string; text: string; reference: string; candidate: string; noted: boolean; ok: boolean }> = [];
  for (const c of MUST_STILL_FIRE) {
    const cand = await candidate(c.text, { lang: c.lang });
    const ref = await reference.classify(c.text, { lang: c.lang });
    const ok = verdictFingerprint(cand) === verdictFingerprint(ref) && verdictLevel(ref) >= 2;
    if (!ok) failed = true;
    const noted = cand.negated_hits.length > 0;
    if (noted) notedTotal++;
    sentencesTotal++;
    mustFire.push({ id: c.id, text: c.text, reference: verdictLabel(ref), candidate: verdictLabel(cand), noted, ok });
  }
  report.must_still_fire = {
    total: mustFire.length,
    failures: mustFire.filter((m) => !m.ok).length,
    noted: mustFire.filter((m) => m.noted).length,
    cases: args.verbose ? mustFire : mustFire.filter((m) => !m.ok),
  };

  // 3. GOVERNED_NEGATION_SET — identical verdict AND the advisory note for the phrase.
  const negSet: Array<{ id: string; text: string; reference: string; candidate: string; changed: boolean; note: boolean; ok: boolean }> = [];
  for (const c of GOVERNED_NEGATION_SET) {
    const cand = await candidate(c.text, { lang: c.lang });
    const ref = await reference.classify(c.text, { lang: c.lang });
    const changed = verdictFingerprint(cand) !== verdictFingerprint(ref);
    const note = cand.negated_hits.some((h) => h.phrase === c.phrase);
    const ok = !changed && note;
    if (!ok) failed = true;
    if (cand.negated_hits.length > 0) notedTotal++;
    sentencesTotal++;
    negSet.push({ id: c.id, text: c.text, reference: verdictLabel(ref), candidate: verdictLabel(cand), changed, note, ok });
  }
  report.governed_negation_set = {
    total: negSet.length,
    changed: negSet.filter((n) => n.changed).length,
    with_note: negSet.filter((n) => n.note).length,
    cases: args.verbose ? negSet : negSet.filter((n) => !n.ok),
  };

  let changedTotal = 0;
  for (const perFamily of Object.values(sweep)) for (const fr of Object.values(perFamily)) changedTotal += fr.changed;
  changedTotal += mustFire.filter((m) => !m.ok).length + negSet.filter((n) => n.changed).length;
  report.summary = { sentences: sentencesTotal, changed: changedTotal, with_advisory_note: notedTotal };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const lines: string[] = [];
    lines.push(`negation-sweep — reference revision: ${reference.revision}`);
    for (const lang of ['en', 'de'] as const) {
      const perFamily = sweep[lang] as Record<SweepFamily, FamilyReport>;
      let ct = 0;
      let tt = 0;
      let nt = 0;
      for (const f of SWEEP_FAMILIES) {
        const fr = perFamily[f];
        ct += fr.changed;
        tt += fr.total;
        nt += fr.noted;
        lines.push(
          `  ${lang.toUpperCase()} ${f.padEnd(25)} ${String(fr.changed).padStart(3)} / ${String(fr.total).padStart(4)} changed · ${String(fr.noted).padStart(4)} with note · ${fr.reference_not_triggering} not triggering on reference`,
        );
        for (const c of [...fr.changed_cases, ...fr.reference_not_triggering_cases]) {
          lines.push(`      ${JSON.stringify(c)}`);
        }
      }
      lines.push(`  ${lang.toUpperCase()} ${'ALL'.padEnd(25)} ${String(ct).padStart(3)} / ${String(tt).padStart(4)} changed · ${String(nt).padStart(4)} with note`);
    }
    const mf = report.must_still_fire as { total: number; failures: number; noted: number; cases: unknown[] };
    lines.push(`  must-still-fire: ${mf.total - mf.failures} / ${mf.total} identical to reference · ${mf.noted} with note`);
    for (const c of mf.cases) lines.push(`    ${JSON.stringify(c)}`);
    const ns = report.governed_negation_set as { total: number; changed: number; with_note: number; cases: unknown[] };
    lines.push(`  governed negation set: ${ns.changed} / ${ns.total} changed · note on ${ns.with_note} / ${ns.total}`);
    for (const c of ns.cases) lines.push(`    ${JSON.stringify(c)}`);
    lines.push(`  TOTAL: ${changedTotal} / ${sentencesTotal} verdicts changed (either direction) · ${notedTotal} sentences with the advisory note`);
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
