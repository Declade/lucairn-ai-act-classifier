// Negation safety net (after v0.3.1) — the over-correction guard.
//
// The 2026-10-17 bug-hunter review of PR #24 found that the first negation
// design LOWERED the verdict (prohibited / high-risk → nothing) on 854 / 1,020
// EN and 428 / 560 DE sentences of the form "<unrelated negated clause>
// <joiner> <plainly stated trigger>". For a compliance classifier a false
// negative is the worst failure, so these tests pin:
//   1. MUST_STILL_FIRE — every bug-hunter input (+ DE counterparts) keeps the
//      verdict of the pre-negation engine (origin/main cee0381b). The expected
//      labels below were produced by running that engine on each input
//      (scripts/negation-sweep.ts --reference <checkout> reproduces them).
//   2. The differential sweep, self-referenced: a sentence never gets a
//      lower verdict than its trigger alone.
//   3. GOVERNED_NEGATION_SET — 0 prohibited / high-risk triggers, and each
//      suppressed phrase is reported in negated_hits (PRD Locked criterion 1).

import { describe, it, expect } from 'vitest';
import { classify } from '../../src/classify.js';
import {
  MUST_STILL_FIRE,
  GOVERNED_NEGATION_SET,
  buildSweep,
  verdictLabel,
  verdictLevel,
  droppedTriggers,
} from '../../scripts/negation-cases.js';

/** Verdict of the pre-negation engine (origin/main cee0381b) per input. */
const REFERENCE: Record<string, string> = {
  'B1-en-01': 'prohibited 5(1)(f) III[1]',
  'B1-en-02': 'prohibited 5(1)(f) III[1]',
  'B1-en-03': 'prohibited 5(1)(f) III[1]',
  'B1-en-04': 'prohibited 5(1)(f) III[1]',
  'B1-en-05': 'prohibited 5(1)(f) III[1]',
  'B1-en-06': 'prohibited 5(1)(f) III[1]',
  'B1-en-07': 'prohibited 5(1)(f) III[1]',
  'B1-en-08': 'high-risk III[4]',
  'B1-en-09': 'high-risk III[5]',
  'B1-en-10': 'high-risk III[5]',
  'B1-en-11': 'high-risk III[4]',
  'B1-en-12': 'high-risk III[4]',
  'B1-en-13': 'high-risk III[4]',
  'B1-en-14': 'high-risk III[4]',
  'B1-en-15': 'high-risk III[4]',
  'B1-en-16': 'high-risk III[4,5]',
  'B1-en-17': 'high-risk III[5]',
  'B1-en-18': 'high-risk III[4]',
  'B1-de-01': 'prohibited 5(1)(f) III[1]',
  'B1-de-02': 'prohibited 5(1)(f) III[1]',
  'B1-de-03': 'prohibited 5(1)(f) III[1]',
  'B1-de-04': 'high-risk III[5]',
  'B1-de-05': 'prohibited 5(1)(f) III[1]',
  'B1-de-06': 'prohibited 5(1)(f) III[1]',
  'B1-de-07': 'high-risk III[4]',
  'B1-de-08': 'high-risk III[4]',
  'B2-en-01': 'high-risk III[4]',
  'B2-en-02': 'high-risk III[5]',
  'B2-en-03': 'high-risk III[5]',
  'B2-en-04': 'prohibited 5(1)(f) III[1]',
  'B2-de-01': 'high-risk III[4]',
  'B2-de-02': 'high-risk III[5]',
  'B3-de-01': 'high-risk III[1]',
  'B3-de-02': 'high-risk III[1]',
  'B3-de-03': 'prohibited 5(1)(f) III[1]',
  'B3-de-04': 'prohibited 5(1)(f) III[1]',
  'B3-de-05': 'prohibited 5(1)(c)',
  'B3-en-01': 'prohibited 5(1)(f) III[1]',
  'B3-en-02': 'prohibited 5(1)(c)',
  'B3-en-03': 'prohibited 5(1)(c)',
  'B3-en-04': 'prohibited 5(1)(c)',
  'B3-en-05': 'high-risk III[1]',
  'B3-en-06': 'high-risk III[1]',
  'B3-en-07': 'prohibited 5(1)(f) III[1]',
  'I1-en-01': 'high-risk III[4]',
  'I1-de-01': 'high-risk III[4]',
  'I2-en-01': 'high-risk III[5]',
  'I2-en-02': 'high-risk III[4]',
  'I2-de-01': 'high-risk III[5]',
  'I2-de-02': 'high-risk III[4]',
};

describe('negation safety — MUST_STILL_FIRE (verdict equals the pre-negation engine)', () => {
  it('every case has a reference verdict', () => {
    expect(MUST_STILL_FIRE.map((c) => c.id).sort()).toEqual(Object.keys(REFERENCE).sort());
  });
  it.each(MUST_STILL_FIRE.map((c) => [c.id, c.text, c.lang] as const))('%s: %s', async (id, text, lang) => {
    const r = await classify(text, { lang });
    expect(verdictLabel(r)).toBe(REFERENCE[id]);
  });
});

describe('negation safety — differential sweep (self-referenced)', () => {
  for (const lang of ['en', 'de'] as const) {
    it(`${lang.toUpperCase()}: no sentence gets a lower verdict than its trigger alone`, async () => {
      const alone = new Map<string, Awaited<ReturnType<typeof classify>>>();
      const lowered: string[] = [];
      for (const c of buildSweep(lang)) {
        let ref = alone.get(c.trigger);
        if (ref === undefined) {
          ref = await classify(`${c.trigger.charAt(0).toUpperCase()}${c.trigger.slice(1)}.`, { lang });
          expect(verdictLevel(ref), `trigger alone must be high-risk or prohibited: ${c.trigger}`).toBeGreaterThanOrEqual(2);
          alone.set(c.trigger, ref);
        }
        const r = await classify(c.text, { lang });
        if (verdictLevel(r) < verdictLevel(ref) || droppedTriggers(ref, r).length > 0) {
          lowered.push(`${c.text} → ${verdictLabel(r)} (alone: ${verdictLabel(ref)})`);
        }
      }
      expect(lowered).toEqual([]);
    }, 120_000);
  }
});

describe('negation safety — governed negation set (0 false triggers, each in negated_hits)', () => {
  it('has at least 12 sentences across EN and DE', () => {
    expect(GOVERNED_NEGATION_SET.length).toBeGreaterThanOrEqual(12);
    expect(new Set(GOVERNED_NEGATION_SET.map((c) => c.lang))).toEqual(new Set(['en', 'de']));
  });
  it.each(GOVERNED_NEGATION_SET.map((c) => [c.id, c.text, c.lang, c.phrase] as const))(
    '%s: %s',
    async (_id, text, lang, phrase) => {
      const r = await classify(text, { lang });
      expect(r.article_5.prohibited).toBe(false);
      expect(r.annex_iii.high_risk).toBe(false);
      const hit = r.negated_hits.find((h) => h.phrase === phrase);
      expect(hit, `negated_hits should report "${phrase}"`).toBeDefined();
      expect(hit?.cue.length).toBeGreaterThan(0);
      expect(hit?.ref.length).toBeGreaterThan(0);
    },
  );
});
