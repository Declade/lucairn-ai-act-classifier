// Integration tests for `runWizard()` — the readline-driven runner that
// powers `--wizard` mode.
//
// Strategy: feed scripted stdin via `Readable.from([...])` and capture
// stdout via a Writable buffer. No TTY, no spawned subprocess. The runner
// reads + writes through the injected streams (RunnerOptions.input/output).
//
// Three scenarios:
//   - All-N path: every prompt answered 'n' → returns empty selections,
//     no crash.
//   - All-Y path: every prompt answered 'y' (with empty sub-letter input
//     for Annex III paragraphs) → returns fully-populated WizardAnswers.
//   - EOF mid-flow: stream ends after N prompts → runner rejects with
//     WizardCancelledError. Closes B-2 at the spec level.

import { describe, it, expect } from 'vitest';
import { PassThrough, Readable, Writable } from 'node:stream';
import { runWizard, WizardCancelledError } from '../../src/wizard/runner.js';

/**
 * Build a Readable stream and a writer task that feeds the given answers
 * line-by-line via setImmediate microtask boundaries. This avoids the
 * `Readable.from()` quirk where a single bulk chunk + immediate end
 * causes readline to emit `close` after the first question() resolves,
 * losing subsequent buffered lines as `readline was closed` errors.
 *
 * Returns the PassThrough as the runner input.
 */
function makeInput(answers: string[]): Readable {
  const stream = new PassThrough();
  setImmediate(async () => {
    for (const a of answers) {
      stream.write(`${a}\n`);
      // Yield to the event loop so readline's `line` listener fires before
      // we queue the next chunk. Without this, all chunks coalesce and the
      // close timing reverts to the Readable.from() failure mode.
      await new Promise((r) => setImmediate(r));
    }
    stream.end();
  });
  return stream;
}

/** Capture-stdout sink. Discards bytes; tests only inspect the return value. */
function makeOutput(): Writable {
  return new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
}

describe('runWizard() — happy paths', () => {
  it('all-N answers (29 prompts) → returns empty WizardAnswers (EN)', async () => {
    // 8 Art 5 letters + 8 Annex III paragraphs + 5 Art 50 paths = 21 Y/N prompts.
    // Annex III sub-letter follow-ups only fire on Y → none here.
    const input = makeInput(Array(21).fill('n'));
    const output = makeOutput();
    const answers = await runWizard({ lang: 'en', input, output });
    expect(answers).toEqual({
      article_5_letters: [],
      annex_iii_selections: [],
      article_50_paths: [],
      lang: 'en',
    });
  });

  it('all-N answers (DE) → returns empty WizardAnswers, lang preserved', async () => {
    const input = makeInput(Array(21).fill('n'));
    const output = makeOutput();
    const answers = await runWizard({ lang: 'de', input, output });
    expect(answers.lang).toBe('de');
    expect(answers.article_5_letters).toEqual([]);
    expect(answers.annex_iii_selections).toEqual([]);
    expect(answers.article_50_paths).toEqual([]);
  });

  it('DE accepts "ja" / "j" as yes', async () => {
    // 8 Y answers for Art 5; for each Annex III paragraph: Y answer + empty
    // sub-letter line (just ENTER); 5 Y for Art 50 = 8 + 8*2 + 5 = 29 lines.
    const script = [
      ...Array(8).fill('j'),
      ...Array(8).fill('j').flatMap(() => ['j', '']),
      ...Array(5).fill('j'),
    ];
    const input = makeInput(script);
    const output = makeOutput();
    const answers = await runWizard({ lang: 'de', input, output });
    expect(answers.article_5_letters.length).toBe(8);
    expect(answers.annex_iii_selections.length).toBe(8);
    expect(answers.article_50_paths.length).toBe(5);
  });

  it('all-Y answers (with empty sub-letters) → returns full WizardAnswers (EN)', async () => {
    // 8 Y for Art 5 + (8 paragraphs × 2 lines = Y + empty sub-letter) + 5 Y
    // for Art 50 = 8 + 16 + 5 = 29 input lines.
    const script = [
      ...Array(8).fill('y'),
      ...Array(8).fill('y').flatMap(() => ['y', '']),
      ...Array(5).fill('y'),
    ];
    const input = makeInput(script);
    const output = makeOutput();
    const answers = await runWizard({ lang: 'en', input, output });
    expect(answers.article_5_letters).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(answers.annex_iii_selections.map((s) => s.paragraph)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(answers.annex_iii_selections.every((s) => s.sub_letters.length === 0)).toBe(true);
    expect(answers.article_50_paths).toEqual(['50(1)', '50(2)', '50(3)', '50(4)_sub1', '50(4)_sub2']);
  });

  it('sub-letter parser drops unknown letters silently (covers M-2 area)', async () => {
    // Target ¶4 (which has sub-letters a + b). Sub-letter input "a,z,b"
    // should drop the unknown "z" silently and retain "a" + "b".
    const script = [
      ...Array(8).fill('n'),  // Art 5: all N (a-h)
      'n', 'n', 'n',          // Annex III ¶1, ¶2, ¶3: all N
      'y', 'a,z,b',           // ¶4 Y with sub-letters a,z,b
      'n', 'n', 'n', 'n',     // ¶5-8: all N
      ...Array(5).fill('n'),  // Art 50: all N
    ];
    const input = makeInput(script);
    const output = makeOutput();
    const answers = await runWizard({ lang: 'en', input, output });
    expect(answers.annex_iii_selections).toHaveLength(1);
    const sel = answers.annex_iii_selections[0];
    if (sel === undefined) throw new Error('expected one selection');
    expect(sel.paragraph).toBe(4);
    // "z" silently dropped; "a" and "b" survive.
    expect(sel.sub_letters.sort()).toEqual(['a', 'b']);
  });
});

describe('runWizard() — cancellation paths (B-2)', () => {
  it('rejects with WizardCancelledError when stdin closes after the first answer', async () => {
    // Only 1 answer — the rest of the 28 prompts will get nothing and the
    // stream will close.
    const input = makeInput(['y']);
    const output = makeOutput();
    await expect(runWizard({ lang: 'en', input, output })).rejects.toBeInstanceOf(
      WizardCancelledError,
    );
  });

  it('rejects with WizardCancelledError when stdin is immediately empty', async () => {
    // Zero answers — readline emits close on next-tick after construction
    // because there's nothing buffered to read.
    const input = Readable.from([]);
    const output = makeOutput();
    await expect(runWizard({ lang: 'en', input, output })).rejects.toBeInstanceOf(
      WizardCancelledError,
    );
  });

  it('WizardCancelledError default reason is "eof"', async () => {
    const input = makeInput(['n', 'n']);
    const output = makeOutput();
    try {
      await runWizard({ lang: 'en', input, output });
      throw new Error('expected runWizard to reject');
    } catch (e) {
      expect(e).toBeInstanceOf(WizardCancelledError);
      if (e instanceof WizardCancelledError) {
        expect(e.reason).toBe('eof');
      }
    }
  });
});
