// Unit tests for `synthesizeWizardText()` — pure-function transformer from
// structured wizard answers → synthetic canonical text the rule engine
// can chew on.
//
// Three groups:
//   - Positive: each Article 5 letter (a-h), each Annex III paragraph (1-8)
//     with and without sub-letters, each Article 50 path produces a
//     non-empty text containing at least one lexicon-matching phrase.
//     (Lexicon-membership of each individual canonical phrase is asserted
//     by `lexicon-invariant.spec.ts`; here we only check that the
//     synthesizer assembles them correctly.)
//   - Negative: empty wizard answers produce the fallback sentinel string.
//   - Input validation (closes H-3): every documented TypeError path is
//     exercised.

import { describe, it, expect } from 'vitest';
import {
  synthesizeWizardText,
  CANONICAL_PHRASES_EN,
  CANONICAL_PHRASES_DE,
  type Article5Letter,
  type AnnexIIIParagraph,
  type Article50Path,
  type WizardAnswers,
} from '../../src/wizard/answers.js';

describe('synthesizeWizardText() — Article 5 letters (EN)', () => {
  for (const letter of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const) {
    it(`emits non-empty text containing the canonical phrase for letter ${letter}`, () => {
      const answers: WizardAnswers = {
        article_5_letters: [letter as Article5Letter],
        annex_iii_selections: [],
        article_50_paths: [],
        lang: 'en',
      };
      const text = synthesizeWizardText(answers);
      expect(text.length).toBeGreaterThan(0);
      expect(text.toLowerCase()).toContain(
        CANONICAL_PHRASES_EN.article_5[letter as Article5Letter].toLowerCase(),
      );
    });
  }
});

describe('synthesizeWizardText() — Annex III paragraphs (EN)', () => {
  for (let p = 1; p <= 8; p++) {
    const para = p as AnnexIIIParagraph;
    it(`paragraph ${p} without sub_letters emits the default canonical phrase`, () => {
      const answers: WizardAnswers = {
        article_5_letters: [],
        annex_iii_selections: [{ paragraph: para, sub_letters: [] }],
        article_50_paths: [],
        lang: 'en',
      };
      const text = synthesizeWizardText(answers);
      expect(text.length).toBeGreaterThan(0);
      expect(text.toLowerCase()).toContain(
        CANONICAL_PHRASES_EN.annex_iii[para].default.toLowerCase(),
      );
    });

    for (const subLetter of Object.keys(CANONICAL_PHRASES_EN.annex_iii[para].sub_letters)) {
      it(`paragraph ${p} with sub_letter "${subLetter}" emits the matching narrowing phrase`, () => {
        const expected = CANONICAL_PHRASES_EN.annex_iii[para].sub_letters[subLetter];
        if (expected === undefined) throw new Error(`missing sub-letter ${subLetter}`);
        const answers: WizardAnswers = {
          article_5_letters: [],
          annex_iii_selections: [{ paragraph: para, sub_letters: [subLetter] }],
          article_50_paths: [],
          lang: 'en',
        };
        const text = synthesizeWizardText(answers);
        expect(text.length).toBeGreaterThan(0);
        expect(text.toLowerCase()).toContain(expected.toLowerCase());
      });
    }
  }
});

describe('synthesizeWizardText() — Article 50 paths (EN)', () => {
  for (const path of ['50(1)', '50(2)', '50(3)', '50(4)_sub1', '50(4)_sub2'] as const) {
    it(`path "${path}" emits the canonical phrase`, () => {
      const answers: WizardAnswers = {
        article_5_letters: [],
        annex_iii_selections: [],
        article_50_paths: [path as Article50Path],
        lang: 'en',
      };
      const text = synthesizeWizardText(answers);
      expect(text.length).toBeGreaterThan(0);
      expect(text.toLowerCase()).toContain(
        CANONICAL_PHRASES_EN.article_50[path as Article50Path].toLowerCase(),
      );
    });
  }
});

describe('synthesizeWizardText() — DE smoke tests', () => {
  it('DE Article 5(a) emits the German canonical phrase', () => {
    const answers: WizardAnswers = {
      article_5_letters: ['a'],
      annex_iii_selections: [],
      article_50_paths: [],
      lang: 'de',
    };
    const text = synthesizeWizardText(answers);
    expect(text.toLowerCase()).toContain(
      CANONICAL_PHRASES_DE.article_5.a.toLowerCase(),
    );
  });

  it('DE Annex III ¶4 default emits the German canonical phrase', () => {
    const answers: WizardAnswers = {
      article_5_letters: [],
      annex_iii_selections: [{ paragraph: 4, sub_letters: [] }],
      article_50_paths: [],
      lang: 'de',
    };
    const text = synthesizeWizardText(answers);
    expect(text.toLowerCase()).toContain(
      CANONICAL_PHRASES_DE.annex_iii[4].default.toLowerCase(),
    );
  });

  it('DE Article 50(4)_sub1 emits the German canonical phrase', () => {
    const answers: WizardAnswers = {
      article_5_letters: [],
      annex_iii_selections: [],
      article_50_paths: ['50(4)_sub1'],
      lang: 'de',
    };
    const text = synthesizeWizardText(answers);
    expect(text.toLowerCase()).toContain(
      CANONICAL_PHRASES_DE.article_50['50(4)_sub1'].toLowerCase(),
    );
  });
});

describe('synthesizeWizardText() — combined selections', () => {
  it('multi-letter Art 5 + multi-paragraph Annex III + multi-path Art 50 joins all phrases', () => {
    const answers: WizardAnswers = {
      article_5_letters: ['a', 'c'],
      annex_iii_selections: [
        { paragraph: 4, sub_letters: ['a'] },
        { paragraph: 5, sub_letters: [] },
      ],
      article_50_paths: ['50(1)', '50(4)_sub1'],
      lang: 'en',
    };
    const text = synthesizeWizardText(answers).toLowerCase();
    const sub4a = CANONICAL_PHRASES_EN.annex_iii[4].sub_letters.a;
    if (sub4a === undefined) throw new Error('missing ¶4 sub-letter a');
    expect(text).toContain(CANONICAL_PHRASES_EN.article_5.a.toLowerCase());
    expect(text).toContain(CANONICAL_PHRASES_EN.article_5.c.toLowerCase());
    expect(text).toContain(sub4a.toLowerCase());
    expect(text).toContain(CANONICAL_PHRASES_EN.annex_iii[5].default.toLowerCase());
    expect(text).toContain(CANONICAL_PHRASES_EN.article_50['50(1)'].toLowerCase());
    expect(text).toContain(CANONICAL_PHRASES_EN.article_50['50(4)_sub1'].toLowerCase());
  });

  it('unknown sub_letter on a known paragraph falls back to the paragraph default', () => {
    // The wizard runner filters unknown sub-letters at parse time, but the
    // synthesizer's nullish-coalesce fallback is the second line of defence.
    // Type-cast bypass: a TS caller cannot trip this but a JS caller can.
    const answers = {
      article_5_letters: [],
      annex_iii_selections: [{ paragraph: 4 as AnnexIIIParagraph, sub_letters: ['x'] }],
      article_50_paths: [],
      lang: 'en' as const,
    } as WizardAnswers;
    const text = synthesizeWizardText(answers);
    expect(text.toLowerCase()).toContain(
      CANONICAL_PHRASES_EN.annex_iii[4].default.toLowerCase(),
    );
  });
});

describe('synthesizeWizardText() — empty-selection fallback', () => {
  it('returns the EN sentinel string when no selections are present', () => {
    const text = synthesizeWizardText({
      article_5_letters: [],
      annex_iii_selections: [],
      article_50_paths: [],
      lang: 'en',
    });
    expect(text).toBe('No use case selected.');
  });

  it('returns the DE sentinel string when no selections are present', () => {
    const text = synthesizeWizardText({
      article_5_letters: [],
      annex_iii_selections: [],
      article_50_paths: [],
      lang: 'de',
    });
    expect(text).toBe('Kein Anwendungsfall ausgewählt.');
  });
});

describe('synthesizeWizardText() — input validation (H-3)', () => {
  it('throws TypeError for null', () => {
    expect(() => synthesizeWizardText(null as unknown as WizardAnswers)).toThrow(TypeError);
  });

  it('throws TypeError for undefined', () => {
    expect(() => synthesizeWizardText(undefined as unknown as WizardAnswers)).toThrow(TypeError);
  });

  it('throws TypeError when answers is an array (not a plain object)', () => {
    expect(() => synthesizeWizardText([] as unknown as WizardAnswers)).toThrow(TypeError);
  });

  it('throws TypeError when lang is missing', () => {
    const answers = {
      article_5_letters: [],
      annex_iii_selections: [],
      article_50_paths: [],
    } as unknown as WizardAnswers;
    expect(() => synthesizeWizardText(answers)).toThrow(/lang must be/);
  });

  it('throws TypeError when lang is not "en" or "de"', () => {
    const answers = {
      article_5_letters: [],
      annex_iii_selections: [],
      article_50_paths: [],
      lang: 'fr',
    } as unknown as WizardAnswers;
    expect(() => synthesizeWizardText(answers)).toThrow(/lang must be/);
  });

  it('throws TypeError when article_5_letters is not an array', () => {
    const answers = {
      article_5_letters: 'a' as unknown as Article5Letter[],
      annex_iii_selections: [],
      article_50_paths: [],
      lang: 'en',
    } as unknown as WizardAnswers;
    expect(() => synthesizeWizardText(answers)).toThrow(/article_5_letters must be an array/);
  });

  it('throws TypeError when article_5_letters contains an invalid letter', () => {
    const answers = {
      article_5_letters: ['z'] as unknown as Article5Letter[],
      annex_iii_selections: [],
      article_50_paths: [],
      lang: 'en',
    } as unknown as WizardAnswers;
    expect(() => synthesizeWizardText(answers)).toThrow(/invalid Article 5 letter/);
  });

  it('throws TypeError when annex_iii_selections contains an invalid paragraph', () => {
    const answers = {
      article_5_letters: [],
      annex_iii_selections: [{ paragraph: 99 as unknown as AnnexIIIParagraph, sub_letters: [] }],
      article_50_paths: [],
      lang: 'en',
    } as unknown as WizardAnswers;
    expect(() => synthesizeWizardText(answers)).toThrow(/invalid Annex III paragraph/);
  });

  it('throws TypeError when sub_letters contains a non-string', () => {
    const answers = {
      article_5_letters: [],
      annex_iii_selections: [{ paragraph: 4 as AnnexIIIParagraph, sub_letters: [123 as unknown as string] }],
      article_50_paths: [],
      lang: 'en',
    } as unknown as WizardAnswers;
    expect(() => synthesizeWizardText(answers)).toThrow(/sub_letters entries must be strings/);
  });

  it('throws TypeError when article_50_paths contains an invalid path', () => {
    const answers = {
      article_5_letters: [],
      annex_iii_selections: [],
      article_50_paths: ['50(99)' as unknown as Article50Path],
      lang: 'en',
    } as unknown as WizardAnswers;
    expect(() => synthesizeWizardText(answers)).toThrow(/invalid Article 50 path/);
  });
});
