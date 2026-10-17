// scripts/negation-sweep.ts — differential safety report for negation handling.
//
// CLI:
//   node --import tsx scripts/negation-sweep.ts --reference <dir> [--json] [--verbose]
//
//   --reference <dir>  a checkout of the PRE-negation engine (e.g.
//                      `git worktree add /tmp/ref origin/main` at cee0381b, with
//                      `pnpm install`). Its src/classify.ts is the independent
//                      reference. Without it, the reference falls back to this
//                      engine on the trigger sentence ALONE (self-reference;
//                      weaker, labelled as such in the report).
//
// Reports (EN + DE):
//   1. Sweep — "<unrelated negated clause><joiner><plainly stated trigger>"
//      (scripts/negation-cases.ts). Counts sentences whose verdict is LOWER
//      than the reference's (3 prohibited · 2 high-risk · 1 Art 50 · 0 none),
//      and sentences that lost an Art 5 letter / Annex III domain. Target 0.
//   2. MUST_STILL_FIRE — the bug-hunter inputs: verdict must equal the
//      reference's.
//   3. GOVERNED_NEGATION_SET — 0 prohibited / high-risk triggers, each phrase
//      in negated_hits (PRD Locked criterion 1).
//
// Exit code: 0 all targets met · 1 any target missed · 2 usage error.

import { resolve as pathResolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { classify } from '../src/classify.js';
import type { ClassifyResult } from '../src/classify.js';
import {
  MUST_STILL_FIRE,
  GOVERNED_NEGATION_SET,
  buildSweep,
  verdictLevel,
  verdictLabel,
  droppedTriggers,
} from './negation-cases.js';
import type { Lang, VerdictLike } from './negation-cases.js';

type Classifier = (text: string, opts: { lang: Lang }) => Promise<VerdictLike>;

function parseArgs(argv: string[]): { reference?: string; json: boolean; verbose: boolean } {
  const out: { reference?: string; json: boolean; verbose: boolean } = { json: false, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reference') {
      const v = argv[++i];
      if (v === undefined) throw new Error('--reference needs a directory');
      out.reference = v;
    } else if (a === '--json') out.json = true;
    else if (a === '--verbose') out.verbose = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

async function loadReference(dir: string): Promise<Classifier> {
  const entry = join(pathResolve(dir), 'src', 'classify.ts');
  if (!existsSync(entry)) throw new Error(`reference has no src/classify.ts: ${entry}`);
  const mod = (await import(pathToFileURL(entry).href)) as { classify: Classifier };
  return mod.classify;
}

async function main(): Promise<number> {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`negation-sweep: ${(e as Error).message}\n`);
    return 2;
  }
  const candidate: Classifier = (text, opts) => classify(text, opts);
  const reference = args.reference !== undefined ? await loadReference(args.reference) : undefined;
  const referenceKind = reference !== undefined ? `checkout ${args.reference}` : 'self (trigger sentence alone)';

  const report: Record<string, unknown> = { reference: referenceKind };
  let failed = false;

  // 1. Sweep.
  const sweep: Record<string, unknown> = {};
  for (const lang of ['en', 'de'] as const) {
    const cases = buildSweep(lang);
    const lowered: Array<{ text: string; reference: string; candidate: string }> = [];
    const dropped: Array<{ text: string; lost: string[] }> = [];
    const weakTriggers = new Set<string>();
    for (const c of cases) {
      const cand = await candidate(c.text, { lang });
      const ref = reference !== undefined ? await reference(c.text, { lang }) : await candidate(`${c.trigger.charAt(0).toUpperCase()}${c.trigger.slice(1)}.`, { lang });
      if (verdictLevel(ref) < 2) weakTriggers.add(c.trigger);
      if (verdictLevel(cand) < verdictLevel(ref)) {
        lowered.push({ text: c.text, reference: verdictLabel(ref), candidate: verdictLabel(cand) });
      }
      const lost = droppedTriggers(ref, cand);
      if (lost.length > 0) dropped.push({ text: c.text, lost });
    }
    if (lowered.length > 0 || dropped.length > 0) failed = true;
    sweep[lang] = {
      total: cases.length,
      lowered: lowered.length,
      dropped_trigger: dropped.length,
      triggers_not_high_risk_in_reference: [...weakTriggers],
      lowered_cases: lowered,
      dropped_cases: dropped,
    };
  }
  report.sweep = sweep;

  // 2. MUST_STILL_FIRE.
  const mustFire: Array<{ id: string; text: string; reference: string; candidate: string; ok: boolean }> = [];
  for (const c of MUST_STILL_FIRE) {
    const cand = await candidate(c.text, { lang: c.lang });
    const ref = reference !== undefined ? await reference(c.text, { lang: c.lang }) : undefined;
    // Without a checkout the self-reference is "fires at all" (level ≥ 2).
    const ok =
      ref !== undefined
        ? verdictLevel(cand) >= verdictLevel(ref) && droppedTriggers(ref, cand).length === 0
        : verdictLevel(cand) >= 2;
    if (!ok) failed = true;
    mustFire.push({
      id: c.id,
      text: c.text,
      reference: ref !== undefined ? verdictLabel(ref) : '(no checkout)',
      candidate: verdictLabel(cand),
      ok,
    });
  }
  report.must_still_fire = {
    total: mustFire.length,
    failures: mustFire.filter((m) => !m.ok).length,
    cases: args.verbose ? mustFire : mustFire.filter((m) => !m.ok),
  };

  // 3. GOVERNED_NEGATION_SET.
  const negSet: Array<{ id: string; text: string; candidate: string; negated_hit: boolean; ok: boolean }> = [];
  for (const c of GOVERNED_NEGATION_SET) {
    const r = (await candidate(c.text, { lang: c.lang })) as ClassifyResult;
    const falseTrigger = r.article_5.prohibited || r.annex_iii.high_risk;
    const negatedHit = r.negated_hits.some((h) => h.phrase === c.phrase);
    const ok = !falseTrigger && negatedHit;
    if (!ok) failed = true;
    negSet.push({ id: c.id, text: c.text, candidate: verdictLabel(r), negated_hit: negatedHit, ok });
  }
  report.governed_negation_set = {
    total: negSet.length,
    false_triggers: negSet.filter((n) => n.candidate.startsWith('prohibited') || n.candidate.startsWith('high-risk')).length,
    missing_negated_hits: negSet.filter((n) => !n.negated_hit).length,
    cases: args.verbose ? negSet : negSet.filter((n) => !n.ok),
  };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const s = sweep as Record<Lang, { total: number; lowered: number; dropped_trigger: number; triggers_not_high_risk_in_reference: string[]; lowered_cases: unknown[]; dropped_cases: unknown[] }>;
    const lines: string[] = [];
    lines.push(`negation-sweep — reference: ${referenceKind}`);
    for (const lang of ['en', 'de'] as const) {
      lines.push(
        `  sweep ${lang.toUpperCase()}: ${s[lang].lowered} / ${s[lang].total} lowered · ${s[lang].dropped_trigger} lost a trigger` +
          (s[lang].triggers_not_high_risk_in_reference.length > 0
            ? ` · WARNING triggers not high-risk alone: ${s[lang].triggers_not_high_risk_in_reference.join(' | ')}`
            : ''),
      );
      for (const c of [...s[lang].lowered_cases, ...s[lang].dropped_cases]) lines.push(`    ${JSON.stringify(c)}`);
    }
    const mf = report.must_still_fire as { total: number; failures: number; cases: unknown[] };
    lines.push(`  must-still-fire: ${mf.total - mf.failures} / ${mf.total} equal or higher than reference`);
    for (const c of mf.cases) lines.push(`    ${JSON.stringify(c)}`);
    const ns = report.governed_negation_set as { total: number; false_triggers: number; missing_negated_hits: number; cases: unknown[] };
    lines.push(`  governed negation set: ${ns.false_triggers} false triggers / ${ns.total} · ${ns.missing_negated_hits} missing negated_hits`);
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
