// Lightweight language detection for EN/DE only.
//
// The classifier supports EN and DE inputs. Most real-world inputs are unambiguous
// because they contain frequent stopwords that uniquely identify one language.
//
// Approach: count occurrences of high-frequency EN-only and DE-only stopwords in
// the normalized input. Pick whichever has more hits. Ties (rare; mostly empty/
// numeric inputs) default to EN per project default.
//
// This is NOT a general-purpose language detector. It's a binary EN-vs-DE picker
// for short use-case descriptions, optimized for false-negative resistance over
// EN-DE ambiguous strings ("AI system" looks like neither language).
//
// Better: bundle franc-min or eld lib later. For Day 2, this is sufficient and
// adds zero deps.

import { tokenize } from './normalize.js';

// Stopwords that appear in one language and (essentially) never in the other.
// Curated rather than pulled from a generic stopword list — we want SELECTORS,
// not generic high-frequency words. Selected from the most common 50 words in
// each language that don't share form with the other.

const EN_SELECTORS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'are',
  'is',
  'be',
  'as',
  'by',
  'from',
  'has',
  'have',
  'was',
  'were',
  'an',
  'they',
  'their',
  'which',
  'used',
  'use',
  'system',
  'systems',
  'applications',
  'risk',
  'high-risk',
]);

const DE_SELECTORS = new Set([
  'der',
  'die',
  'das',
  'den',
  'dem',
  'und',
  'für',
  'mit',
  'eine',
  'einer',
  'einen',
  'einem',
  'sind',
  'ist',
  'sein',
  'werden',
  'wird',
  'wurde',
  'durch',
  'auf',
  'bei',
  'oder',
  'auch',
  'kann',
  'können',
  'sollte',
  'sollten',
  'müssen',
  'soll',
  'system',
  'systeme',
  'anwendungen',
  'risiko',
  'hochrisiko',
  'künstliche',
  'intelligenz',
  'ki-system',
  'ki-systeme',
]);

export type DetectedLang = 'en' | 'de';

export interface LangDetection {
  lang: DetectedLang;
  enHits: number;
  deHits: number;
  confident: boolean;
}

/**
 * Detect EN vs DE from a (normalized) text. If a token can be a member of either
 * selector set, it counts for both — selectors are designed to minimize overlap
 * (e.g. "der" is unambiguously DE; "the" is unambiguously EN).
 *
 * @param normalizedText output of normalize.ts (lowercased, single-spaced)
 * @returns detected language plus hit counts and a confidence flag.
 *          `confident=true` iff the winning language has at least 2 selector hits
 *          AND >=2× the loser's count. Otherwise we still return a guess but flag
 *          it as low confidence — useful for the regulator-validator agent to
 *          decide whether to verify against EN or DE EUR-Lex bodies.
 */
export function detectLang(normalizedText: string): LangDetection {
  const tokens = tokenize(normalizedText);
  let enHits = 0;
  let deHits = 0;
  for (const t of tokens) {
    if (EN_SELECTORS.has(t)) enHits++;
    if (DE_SELECTORS.has(t)) deHits++;
  }
  const lang: DetectedLang = deHits > enHits ? 'de' : 'en';
  const winner = Math.max(enHits, deHits);
  const loser = Math.min(enHits, deHits);
  const confident = winner >= 2 && winner >= loser * 2;
  return { lang, enHits, deHits, confident };
}
