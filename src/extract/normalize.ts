// Text normalization for keyword extraction. Deterministic, language-agnostic.
//
// Design choices:
//   - Lowercase via toLocaleLowerCase() so German ß → ss substitution doesn't fire
//     (toLowerCase() in Node treats locale="tr" specially, breaking İ→i; toLocaleLowerCase()
//     respects the document locale but doesn't normalize ß). The EUR-Lex German body
//     uses ß; preserving it keeps lexicon matches working as written.
//   - Hyphens inside words ("high-risk", "echtzeit-fernidentifizierung") are PRESERVED.
//     This is load-bearing: AI Act phrasing uses hyphenation extensively and we'd lose
//     trigger phrases if we split on hyphens.
//   - Punctuation (.,;:!?"'`) is stripped EXCEPT in-word hyphens and apostrophes inside
//     contractions ("isn't" stays "isn't"). Quotes and sentence punctuation only.
//   - Unicode normalization (NFKC) collapses compatibility variants (e.g. ﬁ ligature → fi)
//     so paste-from-PDF inputs match the lexicon.
//   - Whitespace collapsed to single space, trimmed.
//
// NOT done here (intentional): stemming, lemmatization, stopword removal. The lexicon
// itself encodes phrases as they appear in EUR-Lex; we match literally.

// Explicit Unicode codepoints so character-by-character ordering doesn't
// surprise anyone reading the source. Covers ASCII + Latin-1 + Unicode
// punctuation blocks commonly produced by paste-from-PDF / paste-from-Word.
//   ‘ ' left single quotation mark
//   ’ ' right single quotation mark
//   ‚ ‚ German low single quote
//   ‛ ‛ reversed single high quote
//   “ " left double quotation mark
//   ” " right double quotation mark
//   „ „ German low double quote
//   ‟ ‟ reversed double high quote
//   « « left guillemet
//   » » right guillemet
const PUNCT_TO_STRIP =
  /[.,;:!?"'`()[\]{}<>‘’‚‛“”„‟«»]/g;
const WHITESPACE = /\s+/g;

/**
 * Normalize free-text input for keyword matching.
 *
 * Preserves: hyphens inside words, apostrophes inside contractions, all letters,
 * digits, German umlauts, ß, accented characters.
 *
 * @param text raw user input
 * @returns lowercased, NFKC-normalized, punctuation-stripped, single-spaced text
 */
export function normalize(text: string): string {
  if (typeof text !== 'string') {
    throw new TypeError('normalize(): input must be a string.');
  }
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(PUNCT_TO_STRIP, ' ')
    .replace(WHITESPACE, ' ')
    .trim();
}

/**
 * Tokenize normalized text into words. Splits on whitespace only; preserves in-word
 * hyphens. Returns empty array for empty input.
 */
export function tokenize(normalizedText: string): string[] {
  if (normalizedText.length === 0) return [];
  return normalizedText.split(' ').filter((t) => t.length > 0);
}

/**
 * Generate n-grams from a token list, sizes minN..maxN inclusive. n-grams are
 * space-joined so they match lexicon phrase entries directly.
 *
 * For minN=1, maxN=4 on tokens ["high","risk","ai","system"]:
 *   1-grams: "high", "risk", "ai", "system"
 *   2-grams: "high risk", "risk ai", "ai system"
 *   3-grams: "high risk ai", "risk ai system"
 *   4-grams: "high risk ai system"
 */
export function ngrams(tokens: string[], minN: number, maxN: number): string[] {
  if (minN < 1) throw new RangeError('ngrams(): minN must be >= 1.');
  if (maxN < minN) throw new RangeError('ngrams(): maxN must be >= minN.');
  const out: string[] = [];
  for (let n = minN; n <= maxN; n++) {
    if (n > tokens.length) break;
    for (let i = 0; i <= tokens.length - n; i++) {
      out.push(tokens.slice(i, i + n).join(' '));
    }
  }
  return out;
}
