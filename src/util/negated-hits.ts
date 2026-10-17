// Negated-hit safety net (after v0.3.1).
//
// The keyword extractor suppresses a lexicon phrase only when a negation cue
// directly governs it (src/extract/negation.ts). Every suppressed phrase is
// still reported here so a human can check it: "found but read as denied —
// check". This module maps a lexicon (group, category) to a short AI Act
// reference and renders the localized heading. Pure, deterministic.

import type { NegatedHit } from '../extract/keyword.js';

/** One suppressed lexicon phrase, as surfaced on ClassifyResult.negated_hits. */
export interface NegatedHitResult {
  /** canonical lexicon phrase that occurred in the input */
  phrase: string;
  /** short AI Act reference for the phrase's lexicon category, e.g. "Art 5(1)(c)", "Annex III.4", "Art 50(1)" */
  ref: string;
  /** the negation words that governed the phrase, e.g. "not use", "keine", "is not used" */
  cue: string;
  /**
   * "denied" — read as denied, did NOT fire ("found but read as denied — check").
   * "near"   — fired; a negation governs it but the sentence continues after
   *            the phrase ("near a negation — check"). Advisory only.
   */
  status: 'denied' | 'near';
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
    status: h.status,
    group: h.group,
    category: h.category,
    source: h.source,
  }));
}

/** Localized heading for the safety-net block. */
export function negatedHitsHeading(locale: 'en' | 'de'): string {
  return locale === 'de'
    ? 'Gefunden, aber als verneint gelesen — bitte prüfen'
    : 'Found but read as denied — check';
}

/** Localized heading for the advisory "near a negation" block (these phrases fired). */
export function nearNegationHeading(locale: 'en' | 'de'): string {
  return locale === 'de'
    ? 'Ausgelöst, steht aber nahe einer Verneinung — bitte prüfen'
    : 'Fired, but near a negation — check';
}

/** Split hits into the two display blocks, each with its heading. */
export function negatedHitBlocks(
  hits: ReadonlyArray<NegatedHitResult> | undefined,
  locale: 'en' | 'de',
): Array<{ heading: string; hits: NegatedHitResult[] }> {
  const all = hits ?? [];
  const out: Array<{ heading: string; hits: NegatedHitResult[] }> = [];
  const denied = all.filter((h) => h.status !== 'near');
  const near = all.filter((h) => h.status === 'near');
  if (denied.length > 0) out.push({ heading: negatedHitsHeading(locale), hits: denied });
  if (near.length > 0) out.push({ heading: nearNegationHeading(locale), hits: near });
  return out;
}

/** One localized line per negated hit: `"phrase" (ref) — cue: "…"`. */
export function negatedHitLine(h: NegatedHitResult, locale: 'en' | 'de'): string {
  const ref = negatedHitRef(h.group, h.category, locale);
  const cueLabel = locale === 'de' ? 'Verneinung' : 'negation';
  return `"${h.phrase}" (${ref}) — ${cueLabel}: "${h.cue}"`;
}
