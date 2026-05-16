// Lexicon-matching invariant for the wizard canonical-phrase maps.
//
// The wizard collects structured Y/N selections and synthesizes a synthetic
// canonical text from `CANONICAL_PHRASES_EN` / `CANONICAL_PHRASES_DE` in
// `src/wizard/answers.ts`. That text is then fed back through the existing
// extractFeatures() → classify() pipeline. The load-bearing invariant is:
//
//   For each (canonical phrase, paragraph/letter the wizard claims it
//   represents) pair, calling classify() on the synthesized text MUST
//   produce the matching rule hit.
//
// This is the strict semantic version of "lexicon membership." A wizard
// canonical phrase can be a sentence that CONTAINS a lexicon entry as a
// substring (e.g. EN Art 5(a) "subliminal technique that materially
// distorts behaviour" matches the 2-gram lexicon entry "subliminal
// technique"). What matters for the wizard contract is that the rule
// engine fires the correct paragraph/letter, not that the phrase appears
// verbatim as a Set member.
//
// Pre-v0.3.0 this invariant was implicit: 14 wizard phrases drifted from
// the lexicon at v0.2.0 ship time (closed by B-1 fix in v0.3.0). This spec
// locks the invariant so future wizard expansions (additional Annex III
// sub-letters, Art 4 wizard surfaces, ...) cannot silently re-introduce
// the drift bug.

import { describe, it, expect } from 'vitest';
import { classify } from '../../src/classify.js';
import {
  synthesizeWizardText,
  CANONICAL_PHRASES_EN,
  CANONICAL_PHRASES_DE,
  type Article5Letter,
  type AnnexIIIParagraph,
  type Article50Path,
  type WizardAnswers,
} from '../../src/wizard/answers.js';

const ARTICLE_5_LETTERS: ReadonlyArray<Article5Letter> = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const ANNEX_III_PARAGRAPHS: ReadonlyArray<AnnexIIIParagraph> = [1, 2, 3, 4, 5, 6, 7, 8];
const ARTICLE_50_PATHS: ReadonlyArray<Article50Path> = [
  '50(1)',
  '50(2)',
  '50(3)',
  '50(4)_sub1',
  '50(4)_sub2',
];

/** Map an Art 50 path string to its expected `triggered_by.paragraph_*` key. */
const ARTICLE_50_TRIGGER: Record<Article50Path, string> = {
  '50(1)': 'paragraph_1_interaction',
  '50(2)': 'paragraph_2_synthetic_content',
  '50(3)': 'paragraph_3_emotion_or_biometric_categorisation',
  '50(4)_sub1': 'paragraph_4_deepfake',
  '50(4)_sub2': 'paragraph_4_public_interest_text',
};

async function classifyWizard(answers: WizardAnswers) {
  const text = synthesizeWizardText(answers);
  return classify(text, { lang: answers.lang });
}

for (const lang of ['en', 'de'] as const) {
  const phrases = lang === 'en' ? CANONICAL_PHRASES_EN : CANONICAL_PHRASES_DE;
  const label = lang.toUpperCase();

  describe(`wizard canonical-phrase invariant — Article 5 (${label})`, () => {
    for (const letter of ARTICLE_5_LETTERS) {
      it(`letter "${letter}" canonical phrase "${phrases.article_5[letter]}" fires Art 5(1)(${letter})`, async () => {
        const result = await classifyWizard({
          article_5_letters: [letter],
          annex_iii_selections: [],
          article_50_paths: [],
          lang,
        });
        expect(result.article_5.prohibited).toBe(true);
        const firedLetters = result.article_5.hits.map((h) => h.letter);
        expect(firedLetters).toContain(letter);
      });
    }
  });

  describe(`wizard canonical-phrase invariant — Annex III defaults (${label})`, () => {
    for (const para of ANNEX_III_PARAGRAPHS) {
      it(`paragraph ¶${para} default canonical phrase "${phrases.annex_iii[para].default}" fires Annex III.${para}`, async () => {
        const result = await classifyWizard({
          article_5_letters: [],
          annex_iii_selections: [{ paragraph: para, sub_letters: [] }],
          article_50_paths: [],
          lang,
        });
        const fired = result.annex_iii.domains.map((d) => d.annex_iii_number);
        expect(fired).toContain(para);
      });
    }
  });

  describe(`wizard canonical-phrase invariant — Annex III sub-letters (${label})`, () => {
    for (const para of ANNEX_III_PARAGRAPHS) {
      for (const subLetter of Object.keys(phrases.annex_iii[para].sub_letters)) {
        const phrase = phrases.annex_iii[para].sub_letters[subLetter];
        it(`paragraph ¶${para}(${subLetter}) canonical phrase "${phrase}" fires Annex III.${para}`, async () => {
          const result = await classifyWizard({
            article_5_letters: [],
            annex_iii_selections: [{ paragraph: para, sub_letters: [subLetter] }],
            article_50_paths: [],
            lang,
          });
          const fired = result.annex_iii.domains.map((d) => d.annex_iii_number);
          expect(fired).toContain(para);
        });
      }
    }
  });

  describe(`wizard canonical-phrase invariant — Article 50 paths (${label})`, () => {
    for (const path of ARTICLE_50_PATHS) {
      it(`path "${path}" canonical phrase "${phrases.article_50[path]}" fires the matching Art 50 obligation`, async () => {
        const result = await classifyWizard({
          article_5_letters: [],
          annex_iii_selections: [],
          article_50_paths: [path],
          lang,
        });
        expect(result.article_50.applicable).toBe(true);
        const tb = result.article_50.triggered_by as unknown as Record<string, boolean | undefined>;
        const expectedKey = ARTICLE_50_TRIGGER[path];
        expect(tb[expectedKey]).toBe(true);
      });
    }
  });
}
