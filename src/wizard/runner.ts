// Wizard mode — interactive readline runner for `--wizard` CLI flag.
//
// Walks the user through 3 steps of Y/N prompts. Collects structured answers
// into a WizardAnswers object. Returns the answers for the CLI to feed into
// synthesizeWizardText() + classify().
//
// I/O: reads from process.stdin via readline, writes prompts to process.stdout.
// No network. Pure-side-effect on terminal I/O.

import { createInterface } from 'node:readline/promises';
import type { Interface } from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';
import type {
  Article5Letter,
  AnnexIIIParagraph,
  AnnexIIISelection,
  Article50Path,
  WizardAnswers,
} from './answers.js';
import { PROMPTS_EN, PROMPTS_DE } from './prompts.js';
import type { PromptItem, WizardPrompts } from './prompts.js';

export interface RunnerOptions {
  lang: 'en' | 'de';
  input?: Readable;
  output?: Writable;
}

/**
 * Thrown when the readline stream closes (EOF or SIGINT) mid-wizard. The CLI
 * catches this and emits a lang-aware "Wizard cancelled" message before
 * exiting with code 2 (parse-error class).
 *
 * Without this sentinel, a closed stdin causes `rl.question()` to silently
 * abandon its promise — the event loop drains and the process exits 0 with
 * no diagnostic, which made every `printf "y\n" | --wizard` invocation look
 * like a success to scripted callers.
 */
export class WizardCancelledError extends Error {
  override readonly name = 'WizardCancelledError';
  /**
   * Distinguishes spontaneous-EOF cancellation from explicit SIGINT.
   * Both currently route to the same exit code, but the field exists for
   * future shell-friendly exit-130 wiring.
   */
  readonly reason: 'eof' | 'sigint';
  constructor(reason: 'eof' | 'sigint' = 'eof') {
    super(`Wizard cancelled (reason: ${reason}).`);
    this.reason = reason;
  }
}

/**
 * Race a readline `question()` against the readline's `close` event. If the
 * stream EOFs or SIGINT closes the line interface BEFORE the question
 * resolves, reject with `WizardCancelledError` so the caller can emit a
 * diagnostic and exit cleanly.
 *
 * Background: `readline/promises`' `rl.question()` neither resolves nor
 * rejects when stdin closes — its underlying promise is silently abandoned
 * and the event loop drains, producing exit 0 with no error. Wrapping with
 * a Promise.race against the `close` event re-attaches a failure path.
 *
 * The `cancelled` flag is the canonical state carried by the runner; we
 * read it here instead of attaching a one-shot listener so that a single
 * close event correctly fails ALL subsequent question() calls (not just
 * the one in flight when close fires).
 *
 * @internal
 */
function questionOrCancel(
  rl: Interface,
  state: { cancelled: 'eof' | 'sigint' | null },
  prompt: string,
): Promise<string> {
  if (state.cancelled !== null) {
    return Promise.reject(new WizardCancelledError(state.cancelled));
  }
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const onClose = () => {
      if (settled) return;
      settled = true;
      reject(new WizardCancelledError(state.cancelled ?? 'eof'));
    };
    rl.once('close', onClose);
    rl.question(prompt).then(
      (answer) => {
        if (settled) return;
        settled = true;
        rl.off('close', onClose);
        resolve(answer);
      },
      (err: unknown) => {
        if (settled) return;
        settled = true;
        rl.off('close', onClose);
        // Surface readline ERR_USE_AFTER_CLOSE as a cancellation too. Belt-and-
        // suspenders: the close listener above usually fires first, but on
        // some Node minor versions the rejection beats the close emit.
        if (
          err instanceof Error &&
          (err as NodeJS.ErrnoException).code === 'ERR_USE_AFTER_CLOSE'
        ) {
          reject(new WizardCancelledError(state.cancelled ?? 'eof'));
          return;
        }
        reject(err);
      },
    );
  });
}

/**
 * Parse a Y/N answer. Accepts (case-insensitive): "y", "yes", "n", "no", plus
 * DE "j", "ja", "n", "nein". Empty / unrecognized = false (default to "no").
 *
 * @internal
 */
function parseYesNo(raw: string, lang: 'en' | 'de'): boolean {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === '') return false;
  if (lang === 'de') {
    return trimmed === 'j' || trimmed === 'ja' || trimmed === 'y' || trimmed === 'yes';
  }
  return trimmed === 'y' || trimmed === 'yes' || trimmed === 'j' || trimmed === 'ja';
}

/**
 * Ask a single Y/N question and return the boolean answer. Rejects with
 * `WizardCancelledError` if the stream closes mid-question.
 *
 * @internal
 */
async function askYesNo(
  rl: Interface,
  state: { cancelled: 'eof' | 'sigint' | null },
  item: PromptItem<unknown>,
  yesShort: string,
  noShort: string,
  output: Writable,
): Promise<boolean> {
  output.write(`\n  ${item.label}\n  ${item.description}\n`);
  const raw = await questionOrCancel(rl, state, `  [${yesShort}/${noShort}] > `);
  return parseYesNo(raw, yesShort.startsWith('j') ? 'de' : 'en');
}

/**
 * Ask the user to enter comma-separated sub-letter selections (e.g., "a,b").
 * Returns the parsed array. Empty or "all" returns all available sub-letters.
 * Rejects with `WizardCancelledError` if the stream closes mid-question.
 *
 * @internal
 */
async function askSubLetters(
  rl: Interface,
  state: { cancelled: 'eof' | 'sigint' | null },
  available: Array<PromptItem<string>>,
  output: Writable,
  lang: 'en' | 'de',
): Promise<string[]> {
  const labels = available.map((s) => s.label).join('  ');
  const promptText =
    lang === 'de'
      ? `\n  Welche Buchstaben treffen zu? (z.B. "a,b" — Komma getrennt, leer/Enter überspringt)\n  Optionen: ${labels}\n  > `
      : `\n  Which sub-letters apply? (e.g. "a,b" — comma-separated, empty/Enter skips)\n  Options: ${labels}\n  > `;
  const raw = await questionOrCancel(rl, state, promptText);
  if (raw.trim() === '') return [];
  const allowed = new Set(available.map((s) => s.key));
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && allowed.has(s));
}

/**
 * Run the 3-step wizard interactively. Returns the collected answers.
 *
 * Throws `WizardCancelledError` if the input stream closes mid-wizard
 * (EOF or SIGINT). Caller (CLI) catches this sentinel and exits with code 2
 * + a lang-aware "Wizard cancelled" diagnostic on stderr.
 *
 * Cancellation paths covered:
 *   - stdin reaches EOF before all prompts are answered (e.g. `printf "y\n"`
 *     piped to --wizard, which previously silently exited 0)
 *   - Ctrl-C / SIGINT received via the terminal (readline emits `close`)
 *   - `ERR_USE_AFTER_CLOSE` thrown by `rl.question()` (defensive, in case
 *     close-event ordering varies across Node minor versions)
 */
export async function runWizard(opts: RunnerOptions): Promise<WizardAnswers> {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const prompts: WizardPrompts = opts.lang === 'de' ? PROMPTS_DE : PROMPTS_EN;

  const rl = createInterface({ input, output });
  const yesShort = prompts.yes_no.yes_short;
  const noShort = prompts.yes_no.no_short;

  // Shared cancellation state. Set by the `close` handler below; read inside
  // questionOrCancel() so EVERY pending or future question() call short-
  // circuits to a WizardCancelledError once the line interface has closed.
  const state: { cancelled: 'eof' | 'sigint' | null } = { cancelled: null };
  rl.once('close', () => {
    if (state.cancelled === null) state.cancelled = 'eof';
  });
  // SIGINT (Ctrl-C) emits `close` on the readline; we record it as a distinct
  // reason here so the CLI can route to exit-code 130 in a future revision if
  // desired. Today both reasons map to exit 2.
  rl.once('SIGINT', () => {
    state.cancelled = 'sigint';
    rl.close();
  });

  try {
    output.write(`\n${prompts.banner}\n`);

    // --- Step 1: Article 5(1) prohibitions ---
    output.write(`\n${prompts.step_intro.step1}\n`);
    const article_5_letters: Article5Letter[] = [];
    for (const item of prompts.article_5) {
      const yes = await askYesNo(rl, state, item, yesShort, noShort, output);
      if (yes) article_5_letters.push(item.key);
    }

    // --- Step 2: Annex III high-risk domains + sub-letters ---
    output.write(`\n${prompts.step_intro.step2}\n`);
    const annex_iii_selections: AnnexIIISelection[] = [];
    for (const item of prompts.annex_iii) {
      const yes = await askYesNo(rl, state, item, yesShort, noShort, output);
      if (!yes) continue;
      const subOptions = prompts.annex_iii_sub_letters[item.key];
      const sub_letters = await askSubLetters(rl, state, subOptions, output, opts.lang);
      annex_iii_selections.push({ paragraph: item.key as AnnexIIIParagraph, sub_letters });
    }

    // --- Step 3: Article 50 transparency ---
    output.write(`\n${prompts.step_intro.step3}\n`);
    const article_50_paths: Article50Path[] = [];
    for (const item of prompts.article_50) {
      const yes = await askYesNo(rl, state, item, yesShort, noShort, output);
      if (yes) article_50_paths.push(item.key);
    }

    output.write(`\n${prompts.step_intro.submit}\n`);

    return {
      article_5_letters,
      annex_iii_selections,
      article_50_paths,
      lang: opts.lang,
    };
  } finally {
    rl.close();
  }
}
