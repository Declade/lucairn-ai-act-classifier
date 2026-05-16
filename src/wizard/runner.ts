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
 * Ask a single Y/N question and return the boolean answer.
 *
 * @internal
 */
async function askYesNo(
  rl: Interface,
  item: PromptItem<unknown>,
  yesShort: string,
  noShort: string,
  output: Writable,
): Promise<boolean> {
  output.write(`\n  ${item.label}\n  ${item.description}\n`);
  const raw = await rl.question(`  [${yesShort}/${noShort}] > `);
  return parseYesNo(raw, yesShort.startsWith('j') ? 'de' : 'en');
}

/**
 * Ask the user to enter comma-separated sub-letter selections (e.g., "a,b").
 * Returns the parsed array. Empty or "all" returns all available sub-letters.
 *
 * @internal
 */
async function askSubLetters(
  rl: Interface,
  available: Array<PromptItem<string>>,
  output: Writable,
  lang: 'en' | 'de',
): Promise<string[]> {
  const labels = available.map((s) => s.label).join('  ');
  const promptText =
    lang === 'de'
      ? `\n  Welche Buchstaben treffen zu? (z.B. "a,b" — Komma getrennt, leer/Enter überspringt)\n  Optionen: ${labels}\n  > `
      : `\n  Which sub-letters apply? (e.g. "a,b" — comma-separated, empty/Enter skips)\n  Options: ${labels}\n  > `;
  const raw = await rl.question(promptText);
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
 * Throws if the input stream closes mid-wizard. Caller wraps in try/catch +
 * exit code 1 for clean SIGINT handling.
 */
export async function runWizard(opts: RunnerOptions): Promise<WizardAnswers> {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const prompts: WizardPrompts = opts.lang === 'de' ? PROMPTS_DE : PROMPTS_EN;

  const rl = createInterface({ input, output });
  const yesShort = prompts.yes_no.yes_short;
  const noShort = prompts.yes_no.no_short;

  try {
    output.write(`\n${prompts.banner}\n`);

    // --- Step 1: Article 5(1) prohibitions ---
    output.write(`\n${prompts.step_intro.step1}\n`);
    const article_5_letters: Article5Letter[] = [];
    for (const item of prompts.article_5) {
      const yes = await askYesNo(rl, item, yesShort, noShort, output);
      if (yes) article_5_letters.push(item.key);
    }

    // --- Step 2: Annex III high-risk domains + sub-letters ---
    output.write(`\n${prompts.step_intro.step2}\n`);
    const annex_iii_selections: AnnexIIISelection[] = [];
    for (const item of prompts.annex_iii) {
      const yes = await askYesNo(rl, item, yesShort, noShort, output);
      if (!yes) continue;
      const subOptions = prompts.annex_iii_sub_letters[item.key];
      const sub_letters = await askSubLetters(rl, subOptions, output, opts.lang);
      annex_iii_selections.push({ paragraph: item.key as AnnexIIIParagraph, sub_letters });
    }

    // --- Step 3: Article 50 transparency ---
    output.write(`\n${prompts.step_intro.step3}\n`);
    const article_50_paths: Article50Path[] = [];
    for (const item of prompts.article_50) {
      const yes = await askYesNo(rl, item, yesShort, noShort, output);
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
