// Negation is ADVISORY ONLY (PRD Amendment 1, Marc 2026-10-17) — it never
// changes a verdict.
//
// History: three review rounds on PR #24 found that every design which DROPPED
// a negated hit also dropped real prohibited / high-risk practices (854 /
// 1,020 EN and 428 / 560 DE sentences in round 1; open constructions in round
// 2; verb-left, particle-verb, "Nobody … without", comma-closed denials in
// round 3). These tests pin:
//   1. MUST_STILL_FIRE — every reviewer input keeps the verdict of the
//      pre-negation engine (origin/main cee0381b). The expected labels below
//      were produced by running that engine on each input
//      (`pnpm negation:sweep --reference cee0381b --json --verbose` prints them).
//   2. Structural: with negation detection switched OFF (mocked), every sweep
//      sentence, reviewer input and governed-negation sentence produces the
//      byte-identical verdict fingerprint — the verdict logic does not read
//      negation at all. (The differential run against a real cee0381b
//      checkout is scripts/negation-sweep.ts, also in CI.)
//   3. GOVERNED_NEGATION_SET — the verdict equals the pre-negation engine's
//      (the phrase still fires) AND the phrase carries the advisory note
//      (PRD Locked criterion 1, Amendment 1).

import { describe, it, expect, vi } from 'vitest';

const detection = vi.hoisted(() => ({ off: false }));
vi.mock('../../src/extract/negation.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/extract/negation.js')>();
  return {
    ...orig,
    findNegated: (...args: Parameters<typeof orig.findNegated>) =>
      detection.off ? { active: false, negated: new Map<number, string>() } : orig.findNegated(...args),
  };
});

import { classify } from '../../src/classify.js';
import {
  MUST_STILL_FIRE,
  GOVERNED_NEGATION_SET,
  buildSweep,
  verdictLabel,
  verdictLevel,
  verdictFingerprint,
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
  'R3-en-01': 'high-risk III[4]',
  'R3-en-02': 'prohibited 5(1)(f) III[1]',
  'R3-de-03': 'high-risk III[5]',
  'R3-en-04': 'high-risk III[5]',
  'R3-de-05': 'high-risk III[5]',
  'R3-en-06': 'prohibited 5(1)(c)',
  'R3-en-07': 'prohibited 5(1)(c) III[1,5]',
  'R3-de-01': 'high-risk III[4]',
  'R3-de-02': 'prohibited 5(1)(f) III[1]',
  'R3-en-03': 'high-risk III[5]',
  'R3-de-04': 'high-risk III[5]',
  'R3-en-05': 'high-risk III[5]',
  'R3-de-06': 'prohibited 5(1)(c)',
  'R3-de-07': 'prohibited 5(1)(c) III[1,5]',
  // Round-3 bug-hunter inputs (the suppression design lowered all of them to "none").
  'R4-B1-de-01': 'prohibited 5(1)(f) III[1]',
  'R4-B1-en-01': 'prohibited 5(1)(f) III[1]',
  'R4-B1-en-02': 'high-risk III[5]',
  'R4-B1-de-02': 'high-risk III[5]',
  'R4-B2-de-01': 'prohibited 5(1)(f) III[1]',
  'R4-B2-de-02': 'prohibited 5(1)(f) III[1]',
  'R4-B3-en-01': 'high-risk III[5]',
  'R4-B3-de-01': 'high-risk III[5]',
  'R4-B4-en-01': 'prohibited 5(1)(c)',
  'R4-B4-de-01': 'prohibited 5(1)(c)',
  'R4-B5-de-01': 'prohibited 5(1)(f) III[1]',
  'R4-B5-en-01': 'high-risk III[1]',
  'R4-I1-en-01': 'high-risk III[5]',
  'R4-I2-en-01': 'prohibited 5(1)(c)',
};

/** Verdict of the pre-negation engine (origin/main cee0381b) per governed-negation sentence. */
const GOVERNED_REFERENCE: Record<string, string> = {
  'N-en-01': 'high-risk III[4]',
  'N-en-02': 'prohibited 5(1)(c) III[1]',
  'N-en-03': 'prohibited 5(1)(f) III[1]',
  'N-en-04': 'prohibited 5(1)(c)',
  'N-en-05': 'prohibited 5(1)(c)',
  'N-en-06': 'high-risk III[5]',
  'N-en-07': 'high-risk III[1]',
  'N-en-08': 'prohibited 5(1)(f) III[1]',
  'N-en-09': 'prohibited 5(1)(c) III[1]',
  'N-en-10': 'prohibited 5(1)(c) III[1]',
  'N-de-01': 'prohibited 5(1)(f) III[1]',
  'N-de-02': 'prohibited 5(1)(c)',
  'N-de-03': 'high-risk III[4]',
  'N-de-04': 'high-risk III[1]',
  'N-de-05': 'high-risk III[1]',
  'N-de-06': 'high-risk III[1]',
  'N-de-07': 'high-risk III[4]',
  'N-de-08': 'prohibited 5(1)(c) III[1]',
};

async function classifyBoth(text: string, lang: 'en' | 'de') {
  detection.off = true;
  const off = await classify(text, { lang });
  detection.off = false;
  const on = await classify(text, { lang });
  return { on, off };
}

describe('negation safety — MUST_STILL_FIRE (verdict equals the pre-negation engine)', () => {
  it('every case has a reference verdict', () => {
    expect(MUST_STILL_FIRE.map((c) => c.id).sort()).toEqual(Object.keys(REFERENCE).sort());
  });
  it.each(MUST_STILL_FIRE.map((c) => [c.id, c.text, c.lang] as const))('%s: %s', async (id, text, lang) => {
    const r = await classify(text, { lang });
    expect(verdictLabel(r)).toBe(REFERENCE[id]);
  });
});

describe('negation safety — the verdict never reads negation (detection on vs off)', () => {
  it('the mock really switches detection off (guards this test itself)', async () => {
    const { on, off } = await classifyBoth('Our CV tool does NOT rank job applicants.', 'en');
    expect(on.negated_hits.length).toBeGreaterThan(0);
    expect(off.negated_hits).toEqual([]);
  });

  for (const lang of ['en', 'de'] as const) {
    it(`${lang.toUpperCase()}: every sweep sentence has the identical verdict with detection on and off`, async () => {
      const changed: string[] = [];
      for (const c of buildSweep(lang)) {
        const { on, off } = await classifyBoth(c.text, lang);
        if (verdictFingerprint(on) !== verdictFingerprint(off)) changed.push(`${c.text} → on ${verdictLabel(on)} / off ${verdictLabel(off)}`);
        if (c.family !== 'unrelated-negation' && verdictLevel(on) < 2) changed.push(`[${c.family}] does not fire: ${c.text}`);
      }
      expect(changed).toEqual([]);
    }, 240_000);
  }

  it('reviewer inputs and the governed-negation set: identical verdict with detection on and off', async () => {
    const changed: string[] = [];
    for (const c of [...MUST_STILL_FIRE, ...GOVERNED_NEGATION_SET]) {
      const { on, off } = await classifyBoth(c.text, c.lang);
      if (verdictFingerprint(on) !== verdictFingerprint(off)) changed.push(c.text);
    }
    expect(changed).toEqual([]);
  }, 120_000);
});

describe('negation safety — governed negation set (fires as on main, carries the advisory note)', () => {
  it('has at least 12 sentences across EN and DE, each with a reference verdict', () => {
    expect(GOVERNED_NEGATION_SET.length).toBeGreaterThanOrEqual(12);
    expect(new Set(GOVERNED_NEGATION_SET.map((c) => c.lang))).toEqual(new Set(['en', 'de']));
    expect(GOVERNED_NEGATION_SET.map((c) => c.id).sort()).toEqual(Object.keys(GOVERNED_REFERENCE).sort());
  });
  it.each(GOVERNED_NEGATION_SET.map((c) => [c.id, c.text, c.lang, c.phrase] as const))(
    '%s: %s',
    async (id, text, lang, phrase) => {
      const r = await classify(text, { lang });
      expect(verdictLabel(r)).toBe(GOVERNED_REFERENCE[id]);
      const hit = r.negated_hits.find((h) => h.phrase === phrase);
      expect(hit, `negated_hits should carry the note for "${phrase}"`).toBeDefined();
      expect(hit?.cue.length).toBeGreaterThan(0);
      expect(hit?.ref.length).toBeGreaterThan(0);
      // Advisory: the noted phrase also fired.
      expect(r.features.hits.map((h) => h.phrase)).toContain(phrase);
    },
  );
});

describe('negation safety — open constructions fire and carry the advisory note too', () => {
  it.each([
    ['en', 'We do not rank job applicants only by experience; age is also scored.', 'rank job applicants'],
    ['en', 'No credit scoring request is left unprocessed.', 'credit scoring'],
    ['en', 'Not using social scoring is impossible.', 'social scoring'],
    ['en', 'We do not offer facial recognition, social scoring or credit scoring is used instead.', 'facial recognition'],
    ['de', 'Keine Bonitätsprüfung wird ausgelassen.', 'bonitätsprüfung'],
    ['de', 'Nicht die Bonitätsprüfung allein entscheidet über den Kredit.', 'bonitätsprüfung'],
  ] as const)('%s: %s', async (lang, text, phrase) => {
    const r = await classify(text, { lang });
    expect(verdictLevel(r)).toBeGreaterThanOrEqual(2);
    expect(r.negated_hits).toContainEqual(expect.objectContaining({ phrase }));
  });
});
