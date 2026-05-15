// Article 5 — Prohibited AI practices.
//
// Pure-function rule module. Consumes ExtractedFeatures from src/extract/keyword.ts
// and emits an Article5Result describing which (if any) of the 8 Article 5(1) letters
// are triggered.
//
// Cite-and-match: every emitted hit carries the EUR-Lex source URL for Article 5
// of Regulation (EU) 2024/1689. Comments below cite specific letters from the
// regulation; the regulator-validator agent verifies these against EUR-Lex EN+DE
// before merge.
//
// EUR-Lex source: https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689
// EU AI Office: https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-5
//
// Disambiguation rule for letter (d) — predictive policing:
//   The lexicon category `article_5_prohibited.d_predictive_policing` surfaces
//   phrases that overlap lexically with `annex_iii.6_law_enforcement` (broader
//   law-enforcement risk assessment, which is HIGH-RISK, not prohibited).
//   The legislative line between Art 5(1)(d) and Annex III.6(d) is the qualifier
//   "based SOLELY on the profiling of a natural person or on assessing their
//   personality traits and characteristics" (cf. EUR-Lex Art 5(1)(d) and
//   Annex III paragraph 6(d) which mirrors the exclusion).
//
//   Implementation: we only fire the Art 5(1)(d) prohibition if the input ALSO
//   contains one of the disambiguating phrases (EN: "solely on profiling",
//   "personality only"; DE: "ausschließlich profiling", "persönlichkeit
//   ausschließlich"). Otherwise we DO NOT emit the prohibition hit. The
//   classifyAnnexIII() module will pick up the broader law-enforcement risk
//   assessment as Annex III.6 high-risk via the lexicon hits already present.
//
// Pure function discipline:
//   - No I/O. No network. No module-init side effects.
//   - Same input → same output, byte-for-byte.
//   - The annex-iii.json + lexicon are loaded once at module init by the
//     extract/keyword.ts module; this module touches no files.

import type { ExtractedFeatures } from '../extract/keyword.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One of the 8 letters of Article 5(1) of Regulation (EU) 2024/1689.
 *   a = subliminal / manipulative / deceptive techniques (Art 5(1)(a))
 *   b = exploitation of vulnerabilities (Art 5(1)(b))
 *   c = social scoring (Art 5(1)(c))
 *   d = predictive policing solely on profiling / personality (Art 5(1)(d))
 *   e = untargeted facial-image scraping (Art 5(1)(e))
 *   f = emotion inference in workplace / education (Art 5(1)(f))
 *   g = biometric categorisation by sensitive attributes (Art 5(1)(g))
 *   h = real-time remote biometric identification in public for LE (Art 5(1)(h))
 */
export type Article5Letter = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';

/** One emitted prohibition hit. */
export interface Article5Hit {
  letter: Article5Letter;
  /** Lexicon category key (e.g. "d_predictive_policing"). */
  category_key: string;
  /** Raw phrases from the input that triggered this hit (verbatim from the lexicon). */
  matched_phrases: string[];
  /** Short EN summary of the prohibition. */
  summary_en: string;
  /** Short DE summary of the prohibition. */
  summary_de: string;
  /** EUR-Lex citation URL. */
  source: string;
}

export interface Article5Result {
  /** True iff at least one of the 8 letters is triggered after disambiguation. */
  prohibited: boolean;
  /** All triggered letters, ordered alphabetically. */
  hits: Article5Hit[];
  /** Human-readable reasoning steps for transparency / --explain output. */
  reasoning: string[];
}

// ---------------------------------------------------------------------------
// Static metadata (in-source, NOT JSON — these are tiny and citation-bearing)
// ---------------------------------------------------------------------------

interface LetterMetadata {
  letter: Article5Letter;
  category_key: string;
  summary_en: string;
  summary_de: string;
}

const EUR_LEX_SOURCE =
  'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689';

// Each lexicon category key for `article_5_prohibited.*` already encodes the
// letter as its prefix (e.g. "a_subliminal_manipulative", "h_realtime_..."),
// matching how the lexicon is structured in src/data/patterns.{en,de}.json.
// Summaries are paraphrased from EUR-Lex Article 5(1) — short enough for the
// CLI footer / hosted-UI tooltip, long enough to be unambiguous.
const LETTER_TABLE: readonly LetterMetadata[] = [
  {
    letter: 'a',
    category_key: 'a_subliminal_manipulative',
    summary_en:
      'Subliminal, purposefully manipulative, or deceptive techniques materially distorting behaviour. (Art 5(1)(a))',
    summary_de:
      'Unterschwellige, absichtlich manipulative oder täuschende Techniken zur wesentlichen Verhaltensbeeinflussung. (Art. 5 Abs. 1 Buchst. a)',
  },
  {
    letter: 'b',
    category_key: 'b_exploit_vulnerabilities',
    summary_en:
      'Exploitation of vulnerabilities due to age, disability, or specific social/economic situation. (Art 5(1)(b))',
    summary_de:
      'Ausnutzung von Schwächen aufgrund von Alter, Behinderung oder besonderer sozialer/wirtschaftlicher Situation. (Art. 5 Abs. 1 Buchst. b)',
  },
  {
    letter: 'c',
    category_key: 'c_social_scoring',
    summary_en:
      'Social scoring — evaluating or classifying natural persons over time based on social behaviour or personality characteristics. (Art 5(1)(c))',
    summary_de:
      'Sozialbewertung — Bewertung oder Klassifizierung natürlicher Personen über einen Zeitraum aufgrund sozialen Verhaltens oder Persönlichkeitsmerkmalen. (Art. 5 Abs. 1 Buchst. c)',
  },
  {
    letter: 'd',
    category_key: 'd_predictive_policing',
    summary_en:
      'Risk assessment to predict criminal offences based SOLELY on profiling or personality traits. (Art 5(1)(d))',
    summary_de:
      'Risikobewertung zur Vorhersage von Straftaten ALLEIN auf der Grundlage von Profiling oder Persönlichkeitsmerkmalen. (Art. 5 Abs. 1 Buchst. d)',
  },
  {
    letter: 'e',
    category_key: 'e_facial_scraping',
    summary_en:
      'Untargeted scraping of facial images from the internet or CCTV to build facial-recognition databases. (Art 5(1)(e))',
    summary_de:
      'Ungezieltes Scraping von Gesichtsbildern aus dem Internet oder von CCTV-Aufnahmen zum Aufbau von Gesichtserkennungsdatenbanken. (Art. 5 Abs. 1 Buchst. e)',
  },
  {
    letter: 'f',
    category_key: 'f_emotion_in_workplace_education',
    summary_en:
      'Inferring emotions in workplace or educational institutions (with narrow medical/safety exceptions). (Art 5(1)(f))',
    summary_de:
      'Schlussfolgerungen auf Emotionen am Arbeitsplatz oder in Bildungseinrichtungen (mit engen medizinischen/Sicherheits-Ausnahmen). (Art. 5 Abs. 1 Buchst. f)',
  },
  {
    letter: 'g',
    category_key: 'g_biometric_categorisation_sensitive',
    summary_en:
      'Biometric categorisation to infer race, political opinion, trade-union membership, religious or philosophical beliefs, sex life, or sexual orientation. (Art 5(1)(g))',
    summary_de:
      'Biometrische Kategorisierung zur Ableitung von Rasse, politischer Meinung, Gewerkschaftszugehörigkeit, religiösen oder weltanschaulichen Überzeugungen, Sexualleben oder sexueller Orientierung. (Art. 5 Abs. 1 Buchst. g)',
  },
  {
    letter: 'h',
    category_key: 'h_realtime_remote_biometric_le',
    summary_en:
      'Real-time remote biometric identification in publicly accessible spaces for law-enforcement (narrow exceptions only). (Art 5(1)(h))',
    summary_de:
      'Biometrische Echtzeit-Fernidentifizierung in öffentlich zugänglichen Räumen zu Strafverfolgungszwecken (nur enge Ausnahmen). (Art. 5 Abs. 1 Buchst. h)',
  },
];

const CATEGORY_TO_LETTER: ReadonlyMap<string, LetterMetadata> = new Map(
  LETTER_TABLE.map((row) => [row.category_key, row]),
);

// ---------------------------------------------------------------------------
// Disambiguation phrases for letter (d)
// ---------------------------------------------------------------------------

// Substrings checked against the LOWERCASED raw input. Lowercasing is a
// pre-step (mirrors what normalize.ts does for the extractor); we don't run
// the full NFKC normalization pipeline because we want the raw user phrasing
// to be the truth-source for "did the user explicitly say this is solely
// profiling-based?".
//
// Each phrase below is a verbatim lift from EUR-Lex Art 5(1)(d) (EN) and the
// EUR-Lex DE body, with two near-equivalent rephrasings the spec calls out
// ("personality only" / "Persönlichkeit ausschließlich").
const PREDICTIVE_POLICING_DISAMBIGUATORS_EN: readonly string[] = [
  'solely on profiling',
  'solely on the profiling',
  'solely on the basis of profiling',
  'based solely on profiling',
  'personality only',
  'personality traits only',
];

const PREDICTIVE_POLICING_DISAMBIGUATORS_DE: readonly string[] = [
  'ausschließlich profiling',
  'ausschließlich auf profiling',
  'allein auf profiling',
  'allein auf der grundlage des profilings',
  'persönlichkeit ausschließlich',
  'persönlichkeitsmerkmale ausschließlich',
];

/**
 * Returns true iff the input contains at least one disambiguating phrase that
 * marks predictive policing as Art 5(1)(d) prohibition (vs broader Annex III.6
 * law-enforcement risk assessment, which is high-risk-only).
 *
 * Pure function. Substring match against `input.toLowerCase()`. We accept both
 * EN and DE phrases unconditionally (no lang gating) because users sometimes
 * mix the two in real descriptions, and the disambiguating phrase is a
 * narrowly-scoped tell either way.
 */
function hasPredictivePolicingDisambiguator(input: string): boolean {
  const lower = input.toLowerCase();
  for (const phrase of PREDICTIVE_POLICING_DISAMBIGUATORS_EN) {
    if (lower.includes(phrase)) return true;
  }
  for (const phrase of PREDICTIVE_POLICING_DISAMBIGUATORS_DE) {
    if (lower.includes(phrase)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify the input against Article 5 prohibited practices.
 *
 * Workflow:
 *   1. Walk `features.byCategory.article_5_prohibited`.
 *   2. For each lexicon category, look up the corresponding letter in
 *      LETTER_TABLE.
 *   3. For letter (d) only, apply the predictive-policing disambiguator —
 *      if the input does NOT contain one of the verbatim disambiguating
 *      phrases, DO NOT emit the hit. The high-risk classifier (Annex III.6)
 *      will pick up the broader law-enforcement framing.
 *   4. Sort hits alphabetically by letter for deterministic output.
 *   5. Emit reasoning steps describing what fired and why.
 */
export function classifyArticle5(features: ExtractedFeatures): Article5Result {
  if (features === null || typeof features !== 'object') {
    throw new TypeError('classifyArticle5(): features must be an ExtractedFeatures object.');
  }

  const reasoning: string[] = [];
  const hits: Article5Hit[] = [];

  const byCategoryArt5 = features.byCategory.article_5_prohibited;
  if (byCategoryArt5 === undefined || Object.keys(byCategoryArt5).length === 0) {
    reasoning.push(
      'No Article 5 prohibited-practice phrases matched in the input. No prohibition triggered.',
    );
    return { prohibited: false, hits: [], reasoning };
  }

  // Walk in deterministic order — sort lexicon category keys before iterating.
  const categoryKeys = Object.keys(byCategoryArt5).sort();

  for (const categoryKey of categoryKeys) {
    const matched = byCategoryArt5[categoryKey] ?? [];
    if (matched.length === 0) continue;

    const meta = CATEGORY_TO_LETTER.get(categoryKey);
    if (meta === undefined) {
      // Lexicon shipped a category key the rule module doesn't know about
      // (would happen if a future v0.2 lexicon adds an Art 5 sub-category
      // without a paired rule-module update). Document and skip — never
      // silently emit a hit with no metadata.
      reasoning.push(
        `Lexicon hit on unknown Article 5 category "${categoryKey}" — skipped (rule module needs update to recognize this key).`,
      );
      continue;
    }

    // Letter (d) disambiguation gate.
    if (meta.letter === 'd') {
      if (!hasPredictivePolicingDisambiguator(features.input)) {
        reasoning.push(
          `Lexicon hit on "${categoryKey}" (predictive policing) but the input does NOT contain a "solely on profiling" / "ausschließlich Profiling" disambiguator. Per Art 5(1)(d), the prohibition only applies to risk assessment based SOLELY on profiling or personality traits. Downgrading: this will surface as Annex III.6 high-risk via classifyAnnexIII(), not as an Art 5 prohibition.`,
        );
        continue;
      }
      reasoning.push(
        `Lexicon hit on "${categoryKey}" with disambiguating phrase present in the input ("solely on profiling" / equivalent). Art 5(1)(d) prohibition fires.`,
      );
    } else {
      reasoning.push(
        `Lexicon hit on "${categoryKey}" → Art 5(1)(${meta.letter}) prohibition fires. Matched phrases: ${matched.map((p) => `"${p}"`).join(', ')}.`,
      );
    }

    hits.push({
      letter: meta.letter,
      category_key: categoryKey,
      matched_phrases: [...matched],
      summary_en: meta.summary_en,
      summary_de: meta.summary_de,
      source: EUR_LEX_SOURCE,
    });
  }

  // Sort by letter for deterministic output (alphabetical = legislative order).
  hits.sort((a, b) => a.letter.localeCompare(b.letter));

  return {
    prohibited: hits.length > 0,
    hits,
    reasoning,
  };
}
