// Deterministic negation scoping for the keyword extractor (after v0.3.1).
//
// Problem this solves: the n-gram matcher used to fire on a lexicon phrase even
// when the sentence DENIED the practice ("Our CV tool does NOT rank job
// applicants." → Annex III.4(a); "does not use emotion recognition and does
// not do social scoring" → Article 5 PROHIBITED). A public classifier calling
// a system prohibited because its description denies the practice is the
// worst failure mode, so a lexicon hit that sits inside a negated clause no
// longer fires.
//
// Design constraints (same as keyword.ts): zero network, zero LLM, zero deps,
// deterministic byte-for-byte. This is a small rule-based scope model, not a
// parser. It is deliberately conservative: when in doubt the hit FIRES (the
// v0.3.1 behaviour), because silently dropping a real Article 5 /
// Annex III trigger is also harmful.
//
// The WORD LISTS live in the lexicon (`_negation` block of
// src/data/patterns.{en,de}.json, so they are covered by the rules hash); this
// module holds only the scope RULES. The `_` prefix keeps the block out of the
// extractor's category-group discovery and out of the LLM prompt.
//
// ---------------------------------------------------------------------------
// The model (also summarised in README "How it works" + CHANGELOG):
//
// 1. Clauses. The raw text is split into clauses at
//      - hard punctuation: . ! ? ; : and line breaks
//      - `clause_words` (EN: and, but, however, although, though, whereas,
//        while, instead · DE: und, aber, sondern, jedoch, allerdings, während,
//        obwohl, stattdessen)
//    A negation never reaches across a clause boundary.
//
// 2. Forward scope. A cue negates every token AFTER it up to the end of its
//    clause. `cues` (EN: not, no, never, cannot, neither, nor · DE: nicht,
//    kein, keine, keinen, keiner, keinem, keines, nie, niemals, weder), plus
//    n't-contractions via `contraction_stems` (EN: doesn't, don't, isn't,
//    won't, can't, …; normalize() strips the apostrophe, so "doesn't" arrives
//    as "doesn" + "t"), plus `paired_cues` (DE: noch counts only after weder
//    in the same clause — "noch" alone usually means "still").
//    A comma ends the scope too, UNLESS the rest of the clause continues a
//    list closed by a `list_disjunctions` word (or / nor / oder / noch):
//    "does not use emotion recognition, biometric categorisation or social
//    scoring" stays negated throughout.
//
// 3. Not a cue: a cue directly followed by a `limiters` word ("not only /
//    not just / not merely", "nicht nur / nicht bloß / nicht lediglich"):
//    "not only ranks applicants but also …" still fires.
//
// 4. without / ohne (`without`).
//      - On its own it negates only the FIRST lexicon phrase that starts in a
//        short window after it (`without_window` tokens, never across a
//        comma): "ranks applicants without facial recognition" → only the
//        facial-recognition hit is dropped; "soll ohne Gesichtserkennung
//        Bewerber sortieren" → "bewerber sortieren" still fires. keyword.ts
//        resolves which phrase is first.
//      - Inside an open negation it is a DOUBLE negation and cancels that
//        whole negation ("cannot be used without human review", "does not
//        rank applicants without a recruiter's sign-off", "darf nicht ohne
//        menschliche Prüfung …" → everything still fires).
//
// 5. Trailing denial (cue AFTER the phrase), narrow shapes only:
//      <phrase> <trailing_aux> <trailing_negators> [<trailing_be>] <trailing_predicates>
//        EN: "Facial recognition is not used." / "… will never be performed" /
//            "… isn't used" / "… cannot be used"
//        DE: "Gesichtserkennung wird nicht eingesetzt." (DE has no predicate
//            list: the participle sits at the clause end and varies too much)
//      <phrase> <trailing_negators>   only when `trailing_bare_negation`
//        DE: "Wir nutzen Emotionserkennung nicht."
//    A later without / ohne in the same clause cancels it (double negation),
//    and a `limiters` word right after the negator ("nicht nur") disarms it.
//
// Known limits (documented, all in the conservative "still fires" direction):
// negation carried by a main verb ("we refrain from", "excludes", "verzichten
// auf"), negation across sentences ("Facial recognition? No."), and objects
// coordinated with and/und under one cue ("does not use emotion recognition
// and social scoring" — the second object still fires).
// ---------------------------------------------------------------------------

import { normalize, tokenize } from './normalize.js';

/** Word lists for one language — the `_negation` block of patterns.<lang>.json. */
export interface NegationLexicon {
  clause_words: string[];
  cues: string[];
  contraction_stems: string[];
  /** cue → word that must appear earlier in the same clause (DE: noch → weder). */
  paired_cues: Record<string, string>;
  limiters: string[];
  without: string;
  without_window: number;
  list_disjunctions: string[];
  trailing_aux: string[];
  trailing_negators: string[];
  trailing_be: string[];
  /** Empty list = any word may follow (used for DE). */
  trailing_predicates: string[];
  trailing_bare_negation: boolean;
}

/** Per-token negation analysis aligned with `tokenize(normalize(text))`. */
export interface NegationScope {
  /** Tokens, identical to `tokenize(normalize(text))`. */
  tokens: string[];
  /** `negated[i]` — token i sits inside a forward negation scope. */
  negated: boolean[];
  /** Clause index per token (tokens in different clauses never interact). */
  clause: number[];
  /** `commaBefore[i]` — a comma sat directly before token i in the raw text. */
  commaBefore: boolean[];
  /**
   * Stand-alone without / ohne windows, token range [start, end). The FIRST
   * lexicon phrase starting inside a window is negated; later ones still fire.
   */
  withoutWindows: Array<{ start: number; end: number }>;
  /**
   * False when negation is OFF for this call: no `_negation` block, or the
   * clause-wise tokenisation did not reproduce the global tokenisation
   * byte-for-byte (exotic Unicode). Then nothing is negated and the extractor
   * behaves exactly as before negation scoping (≤ v0.3.1).
   */
  active: boolean;
}

/** Compiled (Set-based) view of a NegationLexicon. */
interface Compiled {
  clauseWords: ReadonlySet<string>;
  cues: ReadonlySet<string>;
  ntStems: ReadonlySet<string>;
  paired: ReadonlyMap<string, string>;
  limiters: ReadonlySet<string>;
  without: string;
  withoutWindow: number;
  disjunctions: ReadonlySet<string>;
  trailAux: ReadonlySet<string>;
  trailNeg: ReadonlySet<string>;
  trailBe: ReadonlySet<string>;
  trailPred: ReadonlySet<string>;
  trailBare: boolean;
}

const compiledCache = new WeakMap<NegationLexicon, Compiled>();

function compile(lex: NegationLexicon): Compiled {
  const cached = compiledCache.get(lex);
  if (cached !== undefined) return cached;
  const c: Compiled = {
    clauseWords: new Set(lex.clause_words),
    cues: new Set(lex.cues),
    ntStems: new Set(lex.contraction_stems),
    paired: new Map(Object.entries(lex.paired_cues)),
    limiters: new Set(lex.limiters),
    without: lex.without,
    withoutWindow: lex.without_window,
    disjunctions: new Set(lex.list_disjunctions),
    trailAux: new Set(lex.trailing_aux),
    trailNeg: new Set(lex.trailing_negators),
    trailBe: new Set(lex.trailing_be),
    trailPred: new Set(lex.trailing_predicates),
    trailBare: lex.trailing_bare_negation,
  };
  compiledCache.set(lex, c);
  return c;
}

/** Shape check for the `_negation` block (a malformed block disables negation). */
export function isNegationLexicon(value: unknown): value is NegationLexicon {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const strList = (k: string): boolean =>
    Array.isArray(v[k]) && (v[k] as unknown[]).every((x) => typeof x === 'string');
  return (
    strList('clause_words') &&
    strList('cues') &&
    strList('contraction_stems') &&
    strList('limiters') &&
    strList('list_disjunctions') &&
    strList('trailing_aux') &&
    strList('trailing_negators') &&
    strList('trailing_be') &&
    strList('trailing_predicates') &&
    typeof v.without === 'string' &&
    typeof v.without_window === 'number' &&
    Number.isInteger(v.without_window) &&
    (v.without_window as number) >= 0 &&
    typeof v.trailing_bare_negation === 'boolean' &&
    v.paired_cues !== null &&
    typeof v.paired_cues === 'object' &&
    !Array.isArray(v.paired_cues) &&
    Object.values(v.paired_cues as object).every((x) => typeof x === 'string')
  );
}

// ---------------------------------------------------------------------------
// Tokenisation with clause + comma bookkeeping
// ---------------------------------------------------------------------------

const HARD_BOUNDARY = /[.!?;:\n\r]/;

/**
 * Split raw text at hard punctuation, then each segment at commas, and
 * tokenise every piece with the SAME normalize()/tokenize() the extractor
 * uses. Every split character is one normalize() turns into a space, so the
 * concatenated tokens equal `tokenize(normalize(text))`; the caller verifies
 * that and switches negation off if not.
 */
function tokenizeWithBoundaries(
  text: string,
  c: Compiled,
): { tokens: string[]; clause: number[]; commaBefore: boolean[] } {
  const tokens: string[] = [];
  const clause: number[] = [];
  const commaBefore: boolean[] = [];
  let clauseId = 0;
  for (const segment of text.split(HARD_BOUNDARY)) {
    let firstPiece = true;
    for (const piece of segment.split(',')) {
      const pieceTokens = tokenize(normalize(piece));
      pieceTokens.forEach((tok, k) => {
        // A clause word opens a new clause and belongs to it.
        if (c.clauseWords.has(tok)) clauseId++;
        tokens.push(tok);
        clause.push(clauseId);
        commaBefore.push(k === 0 && !firstPiece);
      });
      firstPiece = false;
    }
    clauseId++;
  }
  return { tokens, clause, commaBefore };
}

/** If a cue starts at token i, return where its scope starts; else -1. */
function cueAt(tokens: string[], i: number, c: Compiled, seenInClause: ReadonlySet<string>): number {
  const tok = tokens[i] as string;
  let scopeStart: number;
  if (c.ntStems.has(tok) && tokens[i + 1] === 't') {
    scopeStart = i + 2;
  } else if (c.cues.has(tok)) {
    scopeStart = i + 1;
  } else {
    const partner = c.paired.get(tok);
    if (partner === undefined || !seenInClause.has(partner)) return -1;
    scopeStart = i + 1;
  }
  const after = tokens[scopeStart];
  if (after !== undefined && c.limiters.has(after)) return -1;
  return scopeStart;
}

/**
 * Compute forward negation scopes and without-windows for `text`.
 *
 * @param text raw user input (NOT normalized — punctuation marks the clauses)
 * @param lex  the active lexicon's `_negation` block, or undefined (negation off)
 */
export function computeNegationScope(text: string, lex: NegationLexicon | undefined): NegationScope {
  const reference = tokenize(normalize(text));
  const off: NegationScope = {
    tokens: reference,
    negated: reference.map(() => false),
    clause: reference.map(() => 0),
    commaBefore: reference.map(() => false),
    withoutWindows: [],
    active: false,
  };
  if (lex === undefined) return off;
  const c = compile(lex);
  const { tokens, clause, commaBefore } = tokenizeWithBoundaries(text, c);
  const aligned =
    reference.length === tokens.length && reference.every((t, i) => t === tokens[i]);
  if (!aligned) return off;

  const negated = tokens.map(() => false);
  const withoutWindows: Array<{ start: number; end: number }> = [];
  const consumed = new Set<number>(); // without tokens used up by a double negation
  let seenClause = -1;
  let seen = new Set<string>();

  for (let i = 0; i < tokens.length; i++) {
    const ci = clause[i] as number;
    const tok = tokens[i] as string;
    if (ci !== seenClause) {
      seenClause = ci;
      seen = new Set<string>();
    }

    if (tok === c.without) {
      if (!consumed.has(i)) {
        let j = i + 1;
        while (j < tokens.length && j <= i + c.withoutWindow && clause[j] === ci && !commaBefore[j]) j++;
        if (j > i + 1) withoutWindows.push({ start: i + 1, end: j });
      }
      seen.add(tok);
      continue;
    }

    const start = cueAt(tokens, i, c, seen);
    seen.add(tok);
    if (start < 0) continue;

    // Scope end: clause end, or the first comma unless a list continues.
    let end = start;
    while (end < tokens.length && clause[end] === ci) end++;
    let stop = end;
    for (let j = start; j < end; j++) {
      if (!commaBefore[j]) continue;
      let listContinues = false;
      for (let k = j; k < end; k++) {
        if (c.disjunctions.has(tokens[k] as string)) {
          listContinues = true;
          break;
        }
      }
      if (!listContinues) {
        stop = j;
        break;
      }
    }

    // Double negation: a without/ohne inside the scope cancels it entirely.
    let doubleNegation = false;
    for (let j = start; j < stop; j++) {
      if (tokens[j] === c.without) {
        doubleNegation = true;
        consumed.add(j);
      }
    }
    if (doubleNegation) continue;
    for (let j = start; j < stop; j++) negated[j] = true;
  }

  return { tokens, negated, clause, commaBefore, withoutWindows, active: true };
}

/**
 * Trailing-denial check for a phrase occurrence ending at token `end`
 * (exclusive). See header §5.
 */
export function deniedAfter(scope: NegationScope, lex: NegationLexicon | undefined, end: number): boolean {
  if (!scope.active || lex === undefined || end < 1) return false;
  const c = compile(lex);
  const { tokens, clause, commaBefore } = scope;
  const ci = clause[end - 1];
  const at = (j: number): string | undefined =>
    j < tokens.length && clause[j] === ci && !commaBefore[j] ? tokens[j] : undefined;

  let j = end;
  const first = at(j);
  const second = at(j + 1);
  if (first === undefined) return false;
  if (c.trailBare && c.trailNeg.has(first)) {
    j += 1; // "Wir nutzen Emotionserkennung nicht"
  } else if (c.cues.has(first) && c.trailAux.has(first)) {
    j += 1; // fused aux + negator ("cannot")
  } else if (c.ntStems.has(first) && second === 't') {
    j += 2; // "isn't", "won't", "can't"
  } else if (c.trailAux.has(first) && second !== undefined && c.trailNeg.has(second)) {
    j += 2; // "is not", "wird nicht"
  } else {
    return false;
  }
  const next = at(j);
  if (next !== undefined && c.limiters.has(next)) return false; // "nicht nur"
  if (c.trailPred.size > 0) {
    if (next !== undefined && c.trailBe.has(next)) j += 1;
    const pred = at(j);
    if (pred === undefined || !c.trailPred.has(pred)) return false;
  }
  // Double negation: a later without/ohne in the same clause cancels it.
  for (let k = j; k < tokens.length && clause[k] === ci; k++) {
    if (tokens[k] === c.without) return false;
  }
  return true;
}
