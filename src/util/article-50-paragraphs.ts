// article-50-paragraphs.ts — Project an `Article50Result` into a paragraph-id
// list for the accuracy harness.
//
// The harness compares `fixture.expected.article_50_paragraphs` (a string
// array like `['50(2)', '50(4)_sub1']`) against the actual classifier output.
// The output shape `Article50Result.triggered_by` carries 5 boolean fields
// (paragraph_1_interaction, paragraph_2_synthetic_content,
// paragraph_3_emotion_or_biometric_categorisation, paragraph_4_deepfake,
// paragraph_4_public_interest_text). This helper produces a sorted,
// deduplicated string-array representation that matches the fixture schema.
//
// 50(5) is INTENTIONALLY OMITTED from the projection — Article 50(5) is
// format-and-timing language that always trails when ANY of 50(1)..(4) fires;
// it's not an independent fire. Including '50(5)' would create N+1 set
// equality where N is the number of fired paragraphs, doubling the comparison
// surface for zero added signal. The fixture schema reflects this: a fixture
// asserting `article_50_paragraphs: ['50(1)']` means paragraph_1 fired and
// nothing else.
//
// Sort order locked: ASCII ascending, which for these labels yields the
// paragraph-paragraph order 50(1) → 50(2) → 50(3) → 50(4)_sub1 → 50(4)_sub2.
// The accuracy harness compares via set-equality (sorted), so the exact sort
// order is documentation only — but pinning it here keeps the projection
// deterministic across `JSON.stringify` round-trips and prevents accidental
// shuffle in future refactors.
//
// Pure-function discipline: same input → same output, byte-for-byte. No I/O.

import type { Article50Result } from '../rules/article-50.js';

/**
 * String tags for each Article 50 paragraph path the helper can emit.
 *
 * - `'50(1)'` — provider, AI system intended for direct interaction with natural persons.
 * - `'50(2)'` — provider of GPAI / generative AI producing synthetic audio/image/video/text.
 * - `'50(3)'` — deployer of emotion-recognition or biometric-categorisation system.
 * - `'50(4)_sub1'` — deployer generating/manipulating image/audio/video deep fake.
 * - `'50(4)_sub2'` — deployer generating text published informing public on public-interest matters.
 *
 * `'50(5)'` is omitted by design — see file header.
 */
export type Article50Paragraph =
  | '50(1)'
  | '50(2)'
  | '50(3)'
  | '50(4)_sub1'
  | '50(4)_sub2';

/**
 * Project an Article50Result into a sorted, deduplicated paragraph-id array.
 *
 * Type-guards the input (Day-4 lesson-2 closure pattern): mistyped input
 * throws TypeError so the harness fails loud rather than silently emitting
 * `[]`.
 *
 * @param result The output of `classifyArticle50()`.
 * @returns Sorted paragraph-id array. Empty when no paragraph fired.
 */
export function projectArticle50Paragraphs(
  result: Article50Result,
): Article50Paragraph[] {
  if (
    result === null ||
    typeof result !== 'object' ||
    Array.isArray(result) ||
    typeof (result as Article50Result).triggered_by !== 'object' ||
    (result as Article50Result).triggered_by === null
  ) {
    throw new TypeError(
      'projectArticle50Paragraphs(): result must be an Article50Result object (call classifyArticle50() first).',
    );
  }
  const t = result.triggered_by;
  const out: Article50Paragraph[] = [];
  if (t.paragraph_1_interaction) out.push('50(1)');
  if (t.paragraph_2_synthetic_content) out.push('50(2)');
  if (t.paragraph_3_emotion_or_biometric_categorisation) out.push('50(3)');
  if (t.paragraph_4_deepfake) out.push('50(4)_sub1');
  if (t.paragraph_4_public_interest_text) out.push('50(4)_sub2');
  // Already in sorted order because the push order matches the locked
  // ascending sort — but sort defensively so a future reorder of the
  // pushes doesn't silently break the determinism contract.
  return out.sort();
}
