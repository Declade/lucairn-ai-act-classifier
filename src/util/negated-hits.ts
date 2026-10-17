// Advisory negation note (after v0.3.1).
//
// The keyword extractor fires every lexicon phrase exactly as in v0.3.1; it
// only MARKS a fired phrase that stands near a negation
// (src/extract/negation.ts). Those phrases are surfaced on
// ClassifyResult.negated_hits and shown directly under the result line they
// belong to: "Found, but the text appears to deny it — please check". The
// note never changes a verdict. This module maps a lexicon (group, category)
// to a short AI Act reference, to the result line it belongs under, and
// renders the localized note. Pure, deterministic.

import type { NegatedHit } from '../extract/keyword.js';

/**
 * One fired lexicon phrase that stands near a negation, as surfaced on
 * ClassifyResult.negated_hits. Every entry is advisory: the phrase FIRED and
 * counts in the verdict exactly as without the note.
 */
export interface NegatedHitResult {
  /** canonical lexicon phrase that occurred in the input (and fired) */
  phrase: string;
  /** short AI Act reference for the phrase's lexicon category, e.g. "Art 5(1)(c)", "Annex III.4", "Art 50(1)" */
  ref: string;
  /** the negation words near the phrase, e.g. "not use", "keine", "is not used" */
  cue: string;
  /** lexicon group, e.g. "article_5_prohibited" */
  group: string;
  /** lexicon category key, e.g. "c_social_scoring" */
  category: string;
  /** regulator-source URL the category cites */
  source: string;
}

/** Article 50 lexicon category → paragraph (category 5 = public-interest text, Art 50(4)). */
const ART50_PARAGRAPH: Record<string, number> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 4,
};

/**
 * Short AI Act reference for a lexicon (group, category).
 * EN: "Art 5(1)(c)", "Annex III.4", "Art 50(1)", "Art 4", "Art 53", "Art 55".
 * DE: "Art. 5 Abs. 1 Buchst. c", "Anhang III Nr. 4", "Art. 50 Abs. 1", …
 */
export function negatedHitRef(group: string, category: string, locale: 'en' | 'de' = 'en'): string {
  const de = locale === 'de';
  const lead = category.split('_')[0] ?? '';
  switch (group) {
    case 'article_5_prohibited':
      return /^[a-h]$/.test(lead) ? (de ? `Art. 5 Abs. 1 Buchst. ${lead}` : `Art 5(1)(${lead})`) : de ? 'Art. 5' : 'Art 5';
    case 'annex_iii':
      return /^[1-8]$/.test(lead) ? (de ? `Anhang III Nr. ${lead}` : `Annex III.${lead}`) : de ? 'Anhang III' : 'Annex III';
    case 'article_50_gpai': {
      const p = ART50_PARAGRAPH[lead];
      if (p === undefined) return de ? 'Art. 50' : 'Art 50';
      return de ? `Art. 50 Abs. ${p}` : `Art 50(${p})`;
    }
    case 'article_4_ai_literacy':
      return de ? 'Art. 4' : 'Art 4';
    case 'gpai_models':
      return category === 'systemic_risk_markers' ? (de ? 'Art. 55' : 'Art 55') : de ? 'Art. 53' : 'Art 53';
    case 'scope_qualifiers':
      return de ? 'Anwendungsbereich' : 'scope qualifier';
    default:
      return `${group}/${category}`;
  }
}

/** Project extractor negated hits onto the ClassifyResult shape (EN reference). */
export function toNegatedHitResults(hits: ReadonlyArray<NegatedHit> | undefined): NegatedHitResult[] {
  if (hits === undefined) return [];
  return hits.map((h) => ({
    phrase: h.phrase,
    ref: negatedHitRef(h.group, h.category, 'en'),
    cue: h.cue,
    group: h.group,
    category: h.category,
    source: h.source,
  }));
}

/**
 * The result line a note belongs under. Scope qualifiers ("research only")
 * belong to the Annex III line (they feed its research carve-out); an unknown
 * group falls back to the last line of the article list.
 */
export type NoteRow = 'article_5' | 'annex_iii' | 'article_50' | 'article_4' | 'gpai' | 'other';

export function noteRow(group: string): NoteRow {
  switch (group) {
    case 'article_5_prohibited':
      return 'article_5';
    case 'annex_iii':
    case 'scope_qualifiers':
      return 'annex_iii';
    case 'article_50_gpai':
      return 'article_50';
    case 'article_4_ai_literacy':
      return 'article_4';
    case 'gpai_models':
      return 'gpai';
    default:
      return 'other';
  }
}

/** The notes that belong under one result line, in output order. */
export function notesForRow(hits: ReadonlyArray<NegatedHitResult> | undefined, row: NoteRow): NegatedHitResult[] {
  return (hits ?? []).filter((h) => noteRow(h.group) === row);
}

/** The localized advisory note text (EN / DE). */
export function negationNote(locale: 'en' | 'de'): string {
  return locale === 'de'
    ? 'Gefunden, aber der Text scheint es zu verneinen — bitte prüfen'
    : 'Found, but the text appears to deny it — please check';
}

/**
 * One localized note line per hit:
 * `Found, but the text appears to deny it — please check: "phrase" (ref; negation: "cue")`.
 */
export function negatedHitLine(h: NegatedHitResult, locale: 'en' | 'de'): string {
  const ref = negatedHitRef(h.group, h.category, locale);
  const cueLabel = locale === 'de' ? 'Verneinung' : 'negation';
  return `${negationNote(locale)}: "${h.phrase}" (${ref}; ${cueLabel}: "${h.cue}")`;
}
