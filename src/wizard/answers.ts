// Wizard mode — structured answer types.
//
// The wizard bypasses the free-text → keyword-extraction → rules-engine pipeline
// by collecting structured Y/N selections from the user against regulator-anchored
// short summaries (paragraph-level paraphrases faithful to the EUR-Lex / EU AI
// Office Service Desk text). From those selections, it builds a synthetic
// canonical-phrase text that the existing extractFeatures() + classify()
// pipeline can consume, guaranteeing the rule engine fires exactly what the
// user selected (no paraphrase ambiguity). Verbatim EUR-Lex chapeau text is
// emitted downstream by the rules engine in `--explain` output.
//
// Design rationale:
//   - Reuses 100% of the rules engine (no duplicated logic).
//   - The synthetic text contains LEXICON-MATCHING phrases — one per selected
//     article. Sub-letter narrowing works because the lexicon-narrowing phrase
//     map is a known-good vocabulary.
//   - The reasoning trace in --explain output references the canonical phrases,
//     which is honest for wizard input (the user explicitly selected these).
//
// Pure-data module: no I/O, no runtime side effects.

/** Article 5(1) letters: 8 total, (a) through (h). */
export type Article5Letter = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';

/** Annex III paragraphs: 8 total, ¶1 through ¶8. */
export type AnnexIIIParagraph = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Article 50 obligation paths classifiable by the engine. */
export type Article50Path = '50(1)' | '50(2)' | '50(3)' | '50(4)_sub1' | '50(4)_sub2';

/**
 * One Annex III selection with optional sub-letter narrowing. When `sub_letters`
 * is omitted or empty, the wizard synthesizes a paragraph-level phrase that
 * fires the domain without narrowing. When non-empty, each sub-letter triggers
 * its canonical narrowing phrase.
 */
export interface AnnexIIISelection {
  paragraph: AnnexIIIParagraph;
  sub_letters: string[];
}

/**
 * Structured wizard answers collected from the user. All arrays default to
 * empty (no selection). The wizard's "Get classification" submit takes this
 * shape, synthesizes a canonical text, and runs it through classify().
 */
export interface WizardAnswers {
  /** Article 5(1) letters the user said "yes" to. */
  article_5_letters: Article5Letter[];
  /** Annex III paragraphs (with optional sub-letter narrowing) the user said "yes" to. */
  annex_iii_selections: AnnexIIISelection[];
  /** Article 50 obligation paths the user said "yes" to. */
  article_50_paths: Article50Path[];
  /** Output language. */
  lang: 'en' | 'de';
}

/**
 * Canonical EN phrases — one per article + sub-letter — that the rule engine
 * will match. The phrase MUST appear in `src/data/patterns.en.json` AND
 * trigger the correct lexicon category. Validated by `wizard.spec.ts`.
 */
export const CANONICAL_PHRASES_EN: {
  article_5: Record<Article5Letter, string>;
  annex_iii: Record<AnnexIIIParagraph, { default: string; sub_letters: Record<string, string> }>;
  article_50: Record<Article50Path, string>;
} = {
  article_5: {
    a: 'subliminal technique that materially distorts behaviour',
    b: 'exploit vulnerability of natural persons',
    c: 'social scoring of natural persons',
    d: 'predictive policing based solely on profiling',
    e: 'untargeted facial scraping from the internet',
    f: 'emotion recognition in the workplace',
    g: 'biometric categorisation to infer political opinion',
    h: 'real-time remote biometric identification by police',
  },
  annex_iii: {
    1: {
      default: 'biometric categorisation',
      sub_letters: {
        a: 'remote biometric identification',
        b: 'biometric categorisation',
        c: 'emotion recognition',
      },
    },
    2: {
      default: 'critical infrastructure',
      sub_letters: {
        a: 'critical infrastructure',
        b: 'water supply',
        c: 'electricity grid',
      },
    },
    3: {
      default: 'access to educational institutions',
      sub_letters: {
        a: 'access to educational institutions',
        b: 'evaluate learning outcomes',
        c: 'assessment of appropriate level of education',
        d: 'exam proctoring',
      },
    },
    4: {
      default: 'cv screening',
      sub_letters: {
        a: 'cv screening',
        b: 'performance evaluation',
      },
    },
    5: {
      default: 'creditworthiness',
      sub_letters: {
        a: 'public assistance benefits eligibility',
        b: 'creditworthiness',
        c: 'life insurance pricing',
        d: 'emergency dispatch',
      },
    },
    6: {
      default: 'predictive policing',
      sub_letters: {
        a: 'victim-risk assessment',
        b: 'polygraph',
        c: 'evidence reliability',
        d: 'predictive policing',
        e: 'crime profiling',
      },
    },
    7: {
      default: 'visa application examination',
      sub_letters: {
        a: 'polygraph at the border',
        b: 'asylum risk assessment',
        c: 'visa application examination',
        d: 'border surveillance',
      },
    },
    8: {
      default: 'judicial research support',
      sub_letters: {
        a: 'judicial research support',
        b: 'election influencing',
      },
    },
  },
  article_50: {
    '50(1)': 'chatbot for customer interaction',
    '50(2)': 'generative ai producing synthetic content',
    '50(3)': 'emotion recognition deployer',
    '50(4)_sub1': 'deepfake',
    '50(4)_sub2': 'public-interest text generated by ai',
  },
};

/**
 * Canonical DE phrases — same structure as EN, paired by article + sub-letter.
 * The phrase MUST appear in `src/data/patterns.de.json`.
 */
export const CANONICAL_PHRASES_DE: typeof CANONICAL_PHRASES_EN = {
  article_5: {
    a: 'unterschwellige techniken',
    b: 'ausnutzung schutzbedürftigkeit',
    c: 'soziale bewertung',
    d: 'vorhersagende polizeiarbeit ausschließlich auf profiling',
    e: 'ungezieltes auslesen von gesichtsbildern',
    f: 'emotionserkennung am arbeitsplatz',
    g: 'biometrische kategorisierung zur ableitung',
    h: 'biometrische echtzeit-fernidentifizierung',
  },
  annex_iii: {
    1: {
      default: 'biometrische kategorisierung',
      sub_letters: {
        a: 'biometrische fernidentifizierung',
        b: 'biometrische kategorisierung',
        c: 'emotionserkennung',
      },
    },
    2: {
      default: 'kritische infrastruktur',
      sub_letters: {
        a: 'kritische infrastruktur',
        b: 'wasserversorgung',
        c: 'stromnetz',
      },
    },
    3: {
      default: 'zugang zu bildungseinrichtungen',
      sub_letters: {
        a: 'zugang zu bildungseinrichtungen',
        b: 'lernbewertung',
        c: 'bewertung des bildungsniveaus',
        d: 'prüfungsüberwachung',
      },
    },
    4: {
      default: 'lebenslauf-screening',
      sub_letters: {
        a: 'lebenslauf-screening',
        b: 'leistungsbewertung',
      },
    },
    5: {
      default: 'kreditwürdigkeit',
      sub_letters: {
        a: 'sozialleistung',
        b: 'kreditwürdigkeit',
        c: 'versicherungstarifierung',
        d: 'notrufdisposition',
      },
    },
    6: {
      default: 'vorhersagende polizeiarbeit',
      sub_letters: {
        a: 'opfer-risiko-bewertung',
        b: 'polygraph',
        c: 'beweismittelzuverlässigkeit',
        d: 'vorhersagende polizeiarbeit',
        e: 'kriminalprofiling',
      },
    },
    7: {
      default: 'visumantrag',
      sub_letters: {
        a: 'polygraph an der grenze',
        b: 'asyl-risikobewertung',
        c: 'visumantrag',
        d: 'grenzüberwachung',
      },
    },
    8: {
      default: 'richterliche unterstützung',
      sub_letters: {
        a: 'richterliche unterstützung',
        b: 'wahlbeeinflussung',
      },
    },
  },
  article_50: {
    '50(1)': 'chatbot',
    '50(2)': 'synthetische inhalte',
    '50(3)': 'emotionserkennung betreiber',
    '50(4)_sub1': 'deepfake',
    '50(4)_sub2': 'ki-generierte öffentliche texte',
  },
};

/**
 * Validation sets for `synthesizeWizardText()`. Frozen at module scope to avoid
 * re-allocating on every call and to make the accepted vocabulary auditable
 * from one source-line. TypeScript already forbids invalid values via
 * `Article5Letter | AnnexIIIParagraph | Article50Path`, but callers can bypass
 * the type system (e.g. JSON-parsed input from another process); the runtime
 * checks here close that hole.
 */
const VALID_ARTICLE_5_LETTERS: ReadonlySet<string> = new Set([
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
]);
const VALID_ANNEX_III_PARAGRAPHS: ReadonlySet<number> = new Set([
  1, 2, 3, 4, 5, 6, 7, 8,
]);
const VALID_ARTICLE_50_PATHS: ReadonlySet<string> = new Set([
  '50(1)', '50(2)', '50(3)', '50(4)_sub1', '50(4)_sub2',
]);
const VALID_LANGS: ReadonlySet<string> = new Set(['en', 'de']);

/**
 * Build a synthetic canonical text from wizard answers. The output is a single
 * sentence-per-selection paragraph that the existing extractFeatures() will
 * tokenize and feed to the rules engine, producing the same ClassifyResult
 * shape as a real free-text input.
 *
 * @param answers structured wizard answers
 * @returns synthetic canonical text matching the lexicon
 * @throws TypeError if `answers` is not a non-null object, if `lang` is not
 *   'en' or 'de', if any `article_5_letters` entry is outside a-h, if any
 *   `annex_iii_selections[].paragraph` is outside 1-8, if any sub_letter is
 *   not a string, or if any `article_50_paths` entry is outside the known
 *   path set. TypeScript callers cannot trip these at compile time; the
 *   checks defend against JSON-parsed input and `any`-cast bypasses.
 */
export function synthesizeWizardText(answers: WizardAnswers): string {
  if (answers === null || typeof answers !== 'object' || Array.isArray(answers)) {
    throw new TypeError(
      'synthesizeWizardText(): answers must be a non-null WizardAnswers object.',
    );
  }
  if (typeof answers.lang !== 'string' || !VALID_LANGS.has(answers.lang)) {
    throw new TypeError(
      `synthesizeWizardText(): answers.lang must be "en" or "de", got ${JSON.stringify(answers.lang)}.`,
    );
  }
  if (!Array.isArray(answers.article_5_letters)) {
    throw new TypeError(
      'synthesizeWizardText(): answers.article_5_letters must be an array.',
    );
  }
  for (const l of answers.article_5_letters) {
    if (typeof l !== 'string' || !VALID_ARTICLE_5_LETTERS.has(l)) {
      throw new TypeError(
        `synthesizeWizardText(): invalid Article 5 letter ${JSON.stringify(l)} (expected one of a-h).`,
      );
    }
  }
  if (!Array.isArray(answers.annex_iii_selections)) {
    throw new TypeError(
      'synthesizeWizardText(): answers.annex_iii_selections must be an array.',
    );
  }
  for (const sel of answers.annex_iii_selections) {
    if (sel === null || typeof sel !== 'object' || Array.isArray(sel)) {
      throw new TypeError(
        `synthesizeWizardText(): annex_iii_selections entry must be an object, got ${JSON.stringify(sel)}.`,
      );
    }
    if (typeof sel.paragraph !== 'number' || !VALID_ANNEX_III_PARAGRAPHS.has(sel.paragraph)) {
      throw new TypeError(
        `synthesizeWizardText(): invalid Annex III paragraph ${JSON.stringify(sel.paragraph)} (expected one of 1-8).`,
      );
    }
    if (!Array.isArray(sel.sub_letters)) {
      throw new TypeError(
        `synthesizeWizardText(): annex_iii_selections[${sel.paragraph}].sub_letters must be an array.`,
      );
    }
    for (const sub of sel.sub_letters) {
      if (typeof sub !== 'string') {
        throw new TypeError(
          `synthesizeWizardText(): annex_iii_selections[${sel.paragraph}].sub_letters entries must be strings, got ${JSON.stringify(sub)}.`,
        );
      }
    }
  }
  if (!Array.isArray(answers.article_50_paths)) {
    throw new TypeError(
      'synthesizeWizardText(): answers.article_50_paths must be an array.',
    );
  }
  for (const p of answers.article_50_paths) {
    if (typeof p !== 'string' || !VALID_ARTICLE_50_PATHS.has(p)) {
      throw new TypeError(
        `synthesizeWizardText(): invalid Article 50 path ${JSON.stringify(p)} (expected one of 50(1), 50(2), 50(3), 50(4)_sub1, 50(4)_sub2).`,
      );
    }
  }

  const phrases =
    answers.lang === 'de' ? CANONICAL_PHRASES_DE : CANONICAL_PHRASES_EN;
  const parts: string[] = [];

  for (const letter of answers.article_5_letters) {
    parts.push(phrases.article_5[letter]);
  }

  for (const selection of answers.annex_iii_selections) {
    if (selection.sub_letters.length === 0) {
      parts.push(phrases.annex_iii[selection.paragraph].default);
    } else {
      for (const subLetter of selection.sub_letters) {
        const phrase =
          phrases.annex_iii[selection.paragraph].sub_letters[subLetter] ??
          phrases.annex_iii[selection.paragraph].default;
        parts.push(phrase);
      }
    }
  }

  for (const path of answers.article_50_paths) {
    parts.push(phrases.article_50[path]);
  }

  if (parts.length === 0) {
    return answers.lang === 'de'
      ? 'Kein Anwendungsfall ausgewählt.'
      : 'No use case selected.';
  }

  return parts.join('. ') + '.';
}
