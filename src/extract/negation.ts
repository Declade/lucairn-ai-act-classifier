// Deterministic negation handling for the keyword extractor (after v0.3.1).
//
// Problem this solves: the n-gram matcher used to fire on a lexicon phrase even
// when the sentence DENIED the practice ("Our CV tool does NOT rank job
// applicants." → Annex III.4(a); "does not use emotion recognition and does
// not do social scoring" → Article 5 PROHIBITED).
//
// Design rule — GOVERNED-ONLY suppression. For a compliance classifier a
// false negative (hiding a real prohibited / high-risk system) is far worse
// than a false positive. So a lexicon hit is suppressed ONLY when a negation
// cue DIRECTLY governs the matched phrase. Everything else fires, exactly as
// before negation handling (≤ v0.3.1). Every suppressed hit is reported back
// (keyword.ts → `negatedHits` → ClassifyResult.negated_hits) so a human can
// check it ("found but read as denied — check").
//
// Design constraints (same as keyword.ts): zero network, zero LLM, zero deps,
// deterministic byte-for-byte. A small rule set, not a parser. The WORD LISTS
// live in the lexicon (`_negation` block of src/data/patterns.{en,de}.json, so
// they are covered by the rules hash); this module holds only the RULES.
//
// ---------------------------------------------------------------------------
// The rules (also summarised in README "How it works" + CHANGELOG):
//
// 0. Segments. Tokens are those of `tokenize(normalize(text))`. Governance
//    never crosses a BREAK: sentence punctuation (. ! ? ; : line break), a
//    comma, a bracket, or a token made of / containing a dash, slash or
//    bullet (" - ", "—", "/", "•"). Clauses for the parity and "without"
//    checks additionally end at `clause_words` (and / but / und / aber …).
//
// 1. Forward governance. A cue governs a phrase when the phrase starts right
//    after the cue, with at most `max_gap` tokens in between, all from an
//    allowlist:
//      verbal cue (not, never, cannot, n't · nicht, nie, niemals):
//        [infinitive_marker] [governed_verb] (determiner | modifier)*
//        "does not use emotion recognition", "we do not rank job applicants",
//        "decided not to use facial recognition", "nicht die Emotionserkennung"
//      nominal cue (no, neither, nor · kein…, weder, noch-after-weder):
//        (determiner | modifier)*                 "no social scoring",
//        "keine Emotionserkennung", "neither X nor Y"
//    Anything else in between — a noun (subject change: "No human reviews
//    how …"), a finite verb that is not a governed verb ("cannot opt out of"),
//    a subordinator or avoidance verb (`breakers`), a limiter — means NOT
//    governed, and the hit fires.
//    A cue followed directly by a `void_after` word is no cue at all:
//    limiters ("not only", "not exclusively", "nicht nur") and fixed
//    non-denials ("not limited to", "no limits on", "no consent is required",
//    "no way to avoid", "keine Einschränkungen").
//
// 2. Closed construction (strict). A governed phrase is suppressed ONLY when
//    the construction is closed right after it:
//      - sentence punctuation (. ! ? ; :) or end of text follows the phrase
//        (DE: optionally after ONE `closers` word — a clause-final particle,
//        verb-final verb or participle: "findet keine Sozialbewertung
//        statt.", "…, der keine Gesichtserkennung nutzt.", "Es wird keine
//        Sozialbewertung durchgeführt."), or
//      - "," / and / or / nor · und / oder / noch introduces a FURTHER
//        member of an object list (lexicon phrases only) — the whole list
//        must then end the clause the same way — or a further NEGATED
//        clause ("does not use X and does not do Y", "…, we never …").
//    ANY other continuation fires: only / alone / solely / allein / nur …,
//    but / rather / sondern / aber, a following verb or predicate ("No credit
//    scoring request is left unprocessed", "Keine Bonitätsprüfung wird
//    ausgelassen", "Not using social scoring is impossible"), a prepositional
//    restriction ("… only by experience", "… during interviews"), a dash or
//    bracket, an affirmative clause after a list ("… or credit scoring is
//    used instead"). Such a phrase FIRES and is listed in negated_hits with
//    status "near" ("near a negation — check"); that note never changes the
//    verdict.
//
// 3. without / ohne negates only a phrase that starts immediately after it
//    (determiners / modifiers allowed), and rule 2 applies to it too.
//    "Without human review the tool ranks job applicants" → the ranking
//    still fires.
//
// 4. Trailing denial (cue AFTER the phrase), only when the predicate ends the
//    clause:
//      EN  <phrase> [aux] (not | never | cannot | n't) [be|been] <predicate>
//          "Facial recognition is not used." / "… will never be performed."
//      DE  <phrase> [aux | filler]{0,3} (nicht | nie | niemals) <participle>
//          [werden | worden | wird | wurde]
//          "Gesichtserkennung wird nicht eingesetzt." (participles: eingesetzt,
//          genutzt, verwendet, durchgeführt, angeboten, betrieben)
//      DE  <bare_verb> [det|mod]* <phrase> (nicht | nie | niemals) [particle]
//          "Wir nutzen Emotionserkennung nicht." / "Wir setzen X nicht ein."
//    A `cancel_after` word right after the clause end ("…, but", "only",
//    "rather", "sondern", "nur") cancels the denial. "is not optional",
//    "cannot be disabled", "nicht abschaltbar" are not predicates → fire.
//
// 5. Parity. Cues are counted in the cue's clause up to the governing cue
//    (list cues nor / noch do not add). An EVEN count is a double negation
//    → fires ("There is no case in which the system does not rank job
//    applicants"). A without / ohne after the phrase in the same clause is a
//    double negation too ("does not rank job applicants without a recruiter's
//    sign-off" → fires); a cue before a without / ohne cancels it as well.
//
// 6. Overlap. A phrase occurrence that starts inside a suppressed occurrence
//    (e.g. "emotion recognition" inside "emotion recognition in the
//    workplace") is suppressed with it.
//
// Known limits (all in the conservative "still fires" direction): negation
// carried by a main verb ("we refrain from", "verzichten auf"), negation in
// another sentence, ANY words after a governed phrase ("we do not use facial
// recognition in this product", "no facial recognition is used", "neither X
// nor Y is part of it", "das System soll ohne Gesichtserkennung arbeiten"),
// list members that are not lexicon phrases, a trailing denial with a
// complement ("is not used in this product"), a noun between cue and phrase
// ("no use of facial recognition", "keinen Einsatz von Gesichtserkennung"),
// and a negated main clause before a comma ("Wir garantieren nicht, dass …").
// Phrases that fire only because of the closed-construction rule are flagged
// with status "near" in negated_hits.
// ---------------------------------------------------------------------------

import { normalize, tokenize } from './normalize.js';

/** Word lists for one language — the `_negation` block of patterns.<lang>.json. */
export interface NegationLexicon {
  clause_words: string[];
  cues: string[];
  /** Cues that govern only (determiner | modifier)* before the phrase. */
  nominal_cues: string[];
  /** Cues that continue an earlier cue (nor, noch) — do not add to the parity count. */
  list_cues: string[];
  contraction_stems: string[];
  /** cue → word that must appear earlier in the same clause (DE: noch → weder). */
  paired_cues: Record<string, string>;
  /** A cue directly followed by one of these is not a cue (limiters + fixed non-denials). */
  void_after: string[];
  determiners: string[];
  modifiers: string[];
  /** Verbs allowed between a verbal cue and its object phrase ("does not USE …"). */
  governed_verbs: string[];
  /** "to" in "not to use …"; empty string = none. */
  infinitive_marker: string;
  max_gap: number;
  /** Subordinators + avoidance verbs: never allowed in a governed gap. */
  breakers: string[];
  /** Words that open a subordinate / relative clause after a comma (parity reaches back across it). */
  subclause_openers: string[];
  /** Prepositions allowed before a relative opener (", in which", ", in dem"). */
  prepositions: string[];
  without: string;
  /** Words that join members of an object list, or a further negated clause (and/or/nor · und/oder/noch). */
  list_joiners: string[];
  /** Subject pronouns allowed before the cue of a following negated clause ("…, we do not …"). */
  clause_pronouns: string[];
  /** DE: one clause-final particle / verb-final verb allowed right after the phrase ("findet keine X statt", "der keine X nutzt"). */
  closers: string[];
  /** A word right after a trailing denial's clause end that cancels the denial. */
  cancel_after: string[];
  trailing_aux: string[];
  trailing_fillers: string[];
  trailing_negators: string[];
  trailing_be: string[];
  trailing_predicates: string[];
  trailing_post: string[];
  /** DE "Wir nutzen X nicht": verbs allowed directly before the phrase. Empty = form off. */
  bare_verbs: string[];
  bare_particles: string[];
}

/** One phrase occurrence: token range [start, end). */
export interface PhraseOccurrence {
  start: number;
  end: number;
}

/** Compiled (Set-based) view of a NegationLexicon. */
interface Compiled {
  clauseWords: ReadonlySet<string>;
  cues: ReadonlySet<string>;
  nominal: ReadonlySet<string>;
  listCues: ReadonlySet<string>;
  ntStems: ReadonlySet<string>;
  paired: ReadonlyMap<string, string>;
  voidAfter: ReadonlySet<string>;
  det: ReadonlySet<string>;
  mod: ReadonlySet<string>;
  verbs: ReadonlySet<string>;
  inf: string;
  maxGap: number;
  breakers: ReadonlySet<string>;
  openers: ReadonlySet<string>;
  preps: ReadonlySet<string>;
  without: string;
  joiners: ReadonlySet<string>;
  pronouns: ReadonlySet<string>;
  closers: ReadonlySet<string>;
  cancel: ReadonlySet<string>;
  trailAux: ReadonlySet<string>;
  trailFill: ReadonlySet<string>;
  trailNeg: ReadonlySet<string>;
  trailBe: ReadonlySet<string>;
  trailPred: ReadonlySet<string>;
  trailPost: ReadonlySet<string>;
  bareVerbs: ReadonlySet<string>;
  bareParticles: ReadonlySet<string>;
}

const compiledCache = new WeakMap<NegationLexicon, Compiled>();

function compile(lex: NegationLexicon): Compiled {
  const cached = compiledCache.get(lex);
  if (cached !== undefined) return cached;
  const c: Compiled = {
    clauseWords: new Set(lex.clause_words),
    cues: new Set(lex.cues),
    nominal: new Set(lex.nominal_cues),
    listCues: new Set(lex.list_cues),
    ntStems: new Set(lex.contraction_stems),
    paired: new Map(Object.entries(lex.paired_cues)),
    voidAfter: new Set(lex.void_after),
    det: new Set(lex.determiners),
    mod: new Set(lex.modifiers),
    verbs: new Set(lex.governed_verbs),
    inf: lex.infinitive_marker,
    maxGap: lex.max_gap,
    breakers: new Set(lex.breakers),
    openers: new Set(lex.subclause_openers),
    preps: new Set(lex.prepositions),
    without: lex.without,
    joiners: new Set(lex.list_joiners),
    pronouns: new Set(lex.clause_pronouns),
    closers: new Set(lex.closers),
    cancel: new Set(lex.cancel_after),
    trailAux: new Set(lex.trailing_aux),
    trailFill: new Set(lex.trailing_fillers),
    trailNeg: new Set(lex.trailing_negators),
    trailBe: new Set(lex.trailing_be),
    trailPred: new Set(lex.trailing_predicates),
    trailPost: new Set(lex.trailing_post),
    bareVerbs: new Set(lex.bare_verbs),
    bareParticles: new Set(lex.bare_particles),
  };
  compiledCache.set(lex, c);
  return c;
}

const STRING_LISTS = [
  'clause_words',
  'cues',
  'nominal_cues',
  'list_cues',
  'contraction_stems',
  'void_after',
  'determiners',
  'modifiers',
  'governed_verbs',
  'breakers',
  'subclause_openers',
  'prepositions',
  'list_joiners',
  'clause_pronouns',
  'closers',
  'cancel_after',
  'trailing_aux',
  'trailing_fillers',
  'trailing_negators',
  'trailing_be',
  'trailing_predicates',
  'trailing_post',
  'bare_verbs',
  'bare_particles',
] as const;

/** Shape check for the `_negation` block (a malformed block disables negation). */
export function isNegationLexicon(value: unknown): value is NegationLexicon {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const strList = (k: string): boolean =>
    Array.isArray(v[k]) && (v[k] as unknown[]).every((x) => typeof x === 'string');
  return (
    STRING_LISTS.every(strList) &&
    typeof v.without === 'string' &&
    typeof v.infinitive_marker === 'string' &&
    typeof v.max_gap === 'number' &&
    Number.isInteger(v.max_gap) &&
    (v.max_gap as number) >= 0 &&
    v.paired_cues !== null &&
    typeof v.paired_cues === 'object' &&
    !Array.isArray(v.paired_cues) &&
    Object.values(v.paired_cues as object).every((x) => typeof x === 'string')
  );
}

// ---------------------------------------------------------------------------
// Tokenisation with break bookkeeping
// ---------------------------------------------------------------------------

/** Characters normalize() strips, so splitting on them keeps tokens aligned. */
const SPLIT = /[.!?;:\n\r,()[\]{}<>«»]/;

/** A token that is, or contains, a dash / slash / bullet is a break by itself. */
const BREAK_TOKEN = /^[^\p{L}\p{N}]+$|[–—/\\•·|]/u;

interface Tokens {
  tokens: string[];
  /** breakBefore[i] — a split character (or several) sat directly before token i. */
  breakBefore: boolean[];
  /** commaOnly[i] — the only split characters before token i were commas / spaces. */
  commaOnly: boolean[];
  /** hardBefore[i] — sentence punctuation (. ! ? ; : line break) sat before token i. */
  hardBefore: boolean[];
  /** isBreak[i] — token i is a dash / slash / bullet token. */
  isBreak: boolean[];
  /** Clause id per token (breaks, break tokens and clause words open a new clause). */
  clause: number[];
}

function tokenizeWithBreaks(text: string, c: Compiled): Tokens | null {
  const reference = tokenize(normalize(text));
  const tokens: string[] = [];
  const breakBefore: boolean[] = [];
  const commaOnly: boolean[] = [];
  const hardBefore: boolean[] = [];
  const nfkc = text.normalize('NFKC');
  // Walk the text, splitting at SPLIT characters while remembering which
  // characters separated consecutive pieces.
  let piece = '';
  let pendingSep = '';
  const flush = (): void => {
    const toks = tokenize(normalize(piece));
    toks.forEach((tok, k) => {
      tokens.push(tok);
      const sep = k === 0 ? pendingSep : '';
      breakBefore.push(sep.length > 0);
      commaOnly.push(sep.length > 0 && /^[,\s]+$/.test(sep));
      hardBefore.push(/[.!?;:\n\r]/.test(sep));
    });
    if (toks.length > 0) pendingSep = '';
    piece = '';
  };
  for (const ch of nfkc) {
    if (SPLIT.test(ch)) {
      flush();
      pendingSep += ch;
    } else {
      piece += ch;
    }
  }
  flush();
  const aligned = reference.length === tokens.length && reference.every((t, i) => t === tokens[i]);
  if (!aligned) return null;
  // The first token never has a "break before" (nothing to separate from).
  if (breakBefore.length > 0) {
    breakBefore[0] = false;
    commaOnly[0] = false;
    hardBefore[0] = false;
  }
  const isBreak = tokens.map((t) => BREAK_TOKEN.test(t));
  const clause: number[] = [];
  let id = 0;
  tokens.forEach((t, i) => {
    if (i > 0 && (breakBefore[i] || isBreak[i] || isBreak[i - 1] || c.clauseWords.has(t))) id++;
    clause.push(id);
  });
  return { tokens, breakBefore, commaOnly, hardBefore, isBreak, clause };
}

// ---------------------------------------------------------------------------
// Cue detection
// ---------------------------------------------------------------------------

interface Cue {
  /** first token of the cue */
  start: number;
  /** last token of the cue */
  last: number;
  nominal: boolean;
  list: boolean;
  /** human-readable cue text */
  text: string;
}

/** Can tokens i-1 and i be read together (no break between them)? */
function joined(t: Tokens, i: number): boolean {
  return i > 0 && !t.breakBefore[i] && !t.isBreak[i] && !t.isBreak[i - 1];
}

/** The cue whose LAST token is i, or null. A voided cue (limiter etc.) is null. */
function cueEndingAt(t: Tokens, c: Compiled, i: number): Cue | null {
  const tok = t.tokens[i] as string;
  let cue: Cue | null = null;
  if (tok === 't' && i > 0 && c.ntStems.has(t.tokens[i - 1] as string) && joined(t, i)) {
    cue = { start: i - 1, last: i, nominal: false, list: false, text: `${t.tokens[i - 1]}'t` };
  } else if (c.cues.has(tok)) {
    cue = { start: i, last: i, nominal: c.nominal.has(tok), list: c.listCues.has(tok), text: tok };
  } else {
    const partner = c.paired.get(tok);
    if (partner !== undefined) {
      for (let k = i - 1; k >= 0 && t.clause[k] === t.clause[i]; k--) {
        if (t.tokens[k] === partner) {
          cue = { start: i, last: i, nominal: c.nominal.has(tok), list: c.listCues.has(tok), text: tok };
          break;
        }
      }
    }
  }
  if (cue === null) return null;
  const next = t.tokens[i + 1];
  if (next !== undefined && joined(t, i + 1) && c.voidAfter.has(next)) return null;
  return cue;
}

/**
 * Parity count of cues in token `before`'s clause strictly before it (list
 * cues do not count; a without/ohne counts). When that clause is a
 * subordinate / relative clause opened after a comma (", in which …",
 * ", dass …"), counting continues into the clause before the comma, so
 * "Es gibt keinen Fall, in dem das System nicht …" is a double negation.
 * Reaching further only ever makes a hit FIRE, never suppresses one.
 */
function cuesBefore(t: Tokens, c: Compiled, before: number): number {
  let n = 0;
  let k = before - 1;
  let ci = t.clause[before] as number;
  for (;;) {
    let clauseStart = k + 1;
    for (; k >= 0 && t.clause[k] === ci; k--) {
      clauseStart = k;
      const cue = cueEndingAt(t, c, k);
      if (cue !== null) {
        if (!cue.list) n++;
        k = cue.start; // skip the stem of an n't contraction
        clauseStart = k;
        continue;
      }
      if (t.tokens[k] === c.without) n++;
    }
    if (k < 0 || !t.commaOnly[clauseStart]) return n;
    const first = t.tokens[clauseStart] as string;
    const second = t.tokens[clauseStart + 1];
    const opens = c.openers.has(first) || (c.preps.has(first) && second !== undefined && c.openers.has(second));
    if (!opens) return n;
    ci = t.clause[k] as number;
  }
}

/** Is there a without/ohne after `from` in the clause of token `clauseOf`? */
function withoutLater(t: Tokens, c: Compiled, from: number, clauseOf: number): boolean {
  const ci = t.clause[clauseOf] as number;
  for (let k = from; k < t.tokens.length && t.clause[k] === ci; k++) {
    if (t.tokens[k] === c.without) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Governance checks
// ---------------------------------------------------------------------------

/** Rule 1 (+ rule 3 for without/ohne): forward governance of a phrase starting at s. */
function forwardCue(t: Tokens, c: Compiled, s: number): { cue: string; clauseOf: number } | null {
  const gap: string[] = [];
  let j = s - 1;
  let cue: Cue | null = null;
  let withoutAt = -1;
  while (j >= 0) {
    if (!joined(t, j + 1)) return null; // a break between j and j+1
    const tok = t.tokens[j] as string;
    if (tok === c.without) {
      withoutAt = j;
      break;
    }
    cue = cueEndingAt(t, c, j);
    if (cue !== null) break;
    if (gap.length >= c.maxGap) return null;
    if (c.breakers.has(tok)) return null;
    if (!(c.det.has(tok) || c.mod.has(tok) || c.verbs.has(tok) || (c.inf !== '' && tok === c.inf))) return null;
    gap.unshift(tok);
    j--;
  }
  const detOrMod = (x: string): boolean => c.det.has(x) || c.mod.has(x);

  if (withoutAt >= 0) {
    // Rule 3: only determiners / modifiers between without and the phrase.
    if (!gap.every(detOrMod)) return null;
    // Rule 5: a cue before without/ohne in the clause = double negation.
    if (cuesBefore(t, c, withoutAt) % 2 === 1) return null;
    return { cue: [c.without, ...gap].join(' '), clauseOf: withoutAt };
  }
  if (cue === null) return null;

  // Gap grammar.
  let p = 0;
  if (!cue.nominal) {
    if (c.inf !== '' && gap[p] === c.inf) p++;
    if (p < gap.length && c.verbs.has(gap[p] as string)) p++;
  }
  for (; p < gap.length; p++) if (!detOrMod(gap[p] as string)) return null;

  // Rule 5: parity. List cues (nor / noch) continue an earlier cue.
  const others = cuesBefore(t, c, cue.start);
  const count = cue.list ? Math.max(others, 1) : others + 1;
  if (count % 2 === 0) return null;
  return { cue: [cue.text, ...gap].join(' '), clauseOf: cue.start };
}

/** Is token j the end of a clause (end of input, a break, or a clause word next)? */
function clauseEndsAt(t: Tokens, c: Compiled, j: number): boolean {
  if (j >= t.tokens.length) return true;
  return t.breakBefore[j] === true || t.isBreak[j] === true || c.clauseWords.has(t.tokens[j] as string);
}

/** Does a cancel word (but / only / sondern / nur …) follow the clause end at j? */
function cancelledAt(t: Tokens, c: Compiled, j: number): boolean {
  let k = j;
  while (k < t.tokens.length && t.isBreak[k]) k++;
  return k < t.tokens.length && c.cancel.has(t.tokens[k] as string);
}

/** Rule 4: trailing denial of the phrase occurrence [s, e). */
function trailingCue(t: Tokens, c: Compiled, s: number, e: number): string | null {
  const n = t.tokens.length;
  const tok = (j: number): string | undefined => (j < n && joined(t, j) ? t.tokens[j] : undefined);

  const finish = (j: number, from: number): string | null => {
    if (!clauseEndsAt(t, c, j)) return null;
    if (cancelledAt(t, c, j)) return null;
    // Parity: cues before the phrase in its clause + this one.
    if ((cuesBefore(t, c, s) + 1) % 2 === 0) return null;
    return t.tokens.slice(from, j).join(' ');
  };

  // Shape A (EN + DE): <phrase> [aux|filler]{0,max} NEG [be]* PRED [post]*
  let j = e;
  let gap = 0;
  while (gap < c.maxGap) {
    const x = tok(j);
    if (x === undefined || !(c.trailAux.has(x) || c.trailFill.has(x))) break;
    j++;
    gap++;
  }
  let negOk = false;
  const x0 = tok(j);
  if (x0 !== undefined) {
    if (c.trailNeg.has(x0)) {
      j += 1;
      negOk = true;
    } else if (c.cues.has(x0) && c.trailAux.has(x0.replace(/not$/, ''))) {
      j += 1; // fused aux + negator ("cannot")
      negOk = true;
    } else if (c.ntStems.has(x0) && tok(j + 1) === 't') {
      j += 2; // "isn't", "won't", "can't"
      negOk = true;
    }
  }
  if (negOk) {
    let k = j;
    for (let b = 0; b < 2; b++) {
      const y = tok(k);
      if (y !== undefined && c.trailBe.has(y)) k++;
    }
    const pred = tok(k);
    if (pred !== undefined && c.trailPred.has(pred)) {
      k++;
      for (let b = 0; b < 2; b++) {
        const y = tok(k);
        if (y !== undefined && c.trailPost.has(y)) k++;
      }
      const r = finish(k, e);
      if (r !== null) return r;
    }
  }

  // Shape B (DE): <bare_verb> [det|mod]* <phrase> NEG [particle]
  if (c.bareVerbs.size > 0) {
    let b = s - 1;
    let g = 0;
    while (b >= 0 && joined(t, b + 1) && g <= c.maxGap) {
      const w = t.tokens[b] as string;
      if (c.det.has(w) || c.mod.has(w)) {
        b--;
        g++;
        continue;
      }
      break;
    }
    const verb = b >= 0 && joined(t, b + 1) ? t.tokens[b] : undefined;
    const neg = tok(e);
    if (verb !== undefined && c.bareVerbs.has(verb) && neg !== undefined && c.trailNeg.has(neg)) {
      let k = e + 1;
      const part = tok(k);
      if (part !== undefined && c.bareParticles.has(part)) k++;
      const r = finish(k, e);
      if (r !== null) return r;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Closed construction (rule 2)
// ---------------------------------------------------------------------------

/** Does a further negated clause start at token k ("and does not …", ", we never …", "und keine …")? */
function negatedClauseAt(t: Tokens, c: Compiled, k: number): boolean {
  const n = t.tokens.length;
  for (let j = k, skipped = 0; j < n && skipped <= 3; j++) {
    if (j > k && !joined(t, j)) return false;
    if (t.isBreak[j]) return false;
    const cue = cueEndingAt(t, c, j);
    if (cue !== null) return true;
    if (j + 1 < n && t.tokens[j + 1] === 't' && c.ntStems.has(t.tokens[j] as string)) continue;
    const w = t.tokens[j] as string;
    if (!(c.trailAux.has(w) || c.pronouns.has(w) || c.verbs.has(w) || c.bareVerbs.has(w) || c.det.has(w))) return false;
    skipped++;
  }
  return false;
}

/**
 * The joiner at token j: a comma before j and/or a list joiner word at j.
 * Returns the index after the joiner, or -1 when nothing joins here.
 */
function joinerAt(t: Tokens, c: Compiled, j: number): number {
  if (j >= t.tokens.length) return -1;
  const comma = t.breakBefore[j] === true && t.commaOnly[j] === true;
  if (t.breakBefore[j] && !comma) return -1;
  if (t.isBreak[j]) return -1;
  const w = t.tokens[j] as string;
  if (c.joiners.has(w)) return j + 1;
  return comma ? j : -1;
}

/**
 * Rule 2. Starting from the governed phrase [s, e), walk an object list
 * (members = lexicon phrases joined by "," / and / or / nor · und / oder /
 * noch, determiners allowed) and accept it only when it is CLOSED: the last
 * member is followed by sentence punctuation / end of text (DE: optionally
 * one `closers` word first), or a joiner hands over to a further negated
 * clause. Returns the members, or null (open construction → fires).
 */
function closedList(
  t: Tokens,
  c: Compiled,
  longestAt: ReadonlyMap<number, number>,
  s: number,
  e: number,
): Array<{ start: number; end: number }> | null {
  const n = t.tokens.length;
  const members: Array<{ start: number; end: number }> = [{ start: s, end: e }];
  let pos = e;
  for (let guard = 0; guard < 32; guard++) {
    // Clause end right after the phrase (DE: one closer word may come first).
    let p = pos;
    if (p < n && joined(t, p) && c.closers.has(t.tokens[p] as string)) p++;
    if (p >= n || t.hardBefore[p] === true) return members;
    const after = joinerAt(t, c, p);
    if (after < 0) return null;
    // A further list member (only directly after the phrase, not after a closer)?
    if (p === pos) {
      let m = after;
      while (m < n && m < after + 2 && joined(t, m) && c.det.has(t.tokens[m] as string)) m++;
      const e2 = longestAt.get(m);
      if (e2 !== undefined && (m === after || joined(t, m))) {
        members.push({ start: m, end: e2 });
        pos = e2;
        continue;
      }
    }
    // Or a further negated clause.
    return negatedClauseAt(t, c, after) ? members : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface NegationResult {
  /** False when negation is OFF (no / malformed `_negation` block, or token misalignment). */
  active: boolean;
  /** occurrence index → cue text, for every suppressed occurrence. */
  suppressed: Map<number, string>;
  /**
   * occurrence index → cue text, for occurrences a cue governs but whose
   * construction is open (something follows the phrase): they FIRE; this is
   * an advisory "near a negation — check" signal only.
   */
  near: Map<number, string>;
}

/**
 * Decide which phrase occurrences are negated.
 *
 * @param text raw user input (NOT normalized — punctuation marks the breaks)
 * @param lex  the active lexicon's `_negation` block, or undefined (negation off)
 * @param occs every lexicon phrase occurrence (token ranges of tokenize(normalize(text)))
 */
export function findNegated(
  text: string,
  lex: NegationLexicon | undefined,
  occs: ReadonlyArray<PhraseOccurrence>,
): NegationResult {
  const off: NegationResult = { active: false, suppressed: new Map(), near: new Map() };
  if (lex === undefined) return off;
  const c = compile(lex);
  const t = tokenizeWithBreaks(text, c);
  if (t === null) return off;

  const suppressed = new Map<number, string>();
  // Longest occurrence per start token (lists + overlap work on these).
  const longestAt = new Map<number, number>();
  for (const o of occs) {
    const cur = longestAt.get(o.start);
    if (cur === undefined || o.end > cur) longestAt.set(o.start, o.end);
  }

  // Suppressed spans: [start, end) → cue. Near spans: governed but not closed.
  const spans: Array<{ start: number; end: number; cue: string }> = [];
  const nearSpans: Array<{ start: number; end: number; cue: string }> = [];

  const starts = [...longestAt.keys()].sort((a, b) => a - b);
  for (const s of starts) {
    const e = longestAt.get(s) as number;
    const fwd = forwardCue(t, c, s);
    if (fwd !== null && !withoutLater(t, c, s, fwd.clauseOf)) {
      // Rule 2: closed construction — the phrase (or the object list it
      // heads) must end the clause, or hand over to another negated clause.
      const members = closedList(t, c, longestAt, s, e);
      if (members !== null) {
        for (const m of members) spans.push({ start: m.start, end: m.end, cue: fwd.cue });
        continue;
      }
      nearSpans.push({ start: s, end: e, cue: fwd.cue });
    }
    const trail = trailingCue(t, c, s, e);
    if (trail !== null) spans.push({ start: s, end: e, cue: trail });
  }

  // Rule 6: every occurrence starting inside a suppressed span is suppressed.
  const near = new Map<number, string>();
  occs.forEach((o, idx) => {
    for (const sp of spans) {
      if (o.start >= sp.start && o.start < sp.end) {
        suppressed.set(idx, sp.cue);
        return;
      }
    }
    for (const sp of nearSpans) {
      if (o.start >= sp.start && o.start < sp.end) {
        near.set(idx, sp.cue);
        return;
      }
    }
  });
  return { active: true, suppressed, near };
}
