// Deterministic keyword + phrase feature extractor.
//
// Reads patterns.{en,de}.json (the curated lexicon) and matches input n-grams
// against it. Emits a structured Features object that downstream rule modules
// (Day 3-5: src/rules/article-*.ts) consume to pick AI Act articles.
//
// Design constraints:
//   - Zero network. Zero LLM. Fully offline.
//   - Deterministic: same input → same output, byte-for-byte.
//   - Bilingual: EN and DE lexicons live side-by-side; the active lexicon is
//     picked by detectLang() (overridable via opts.lang).
//   - Cite-and-match only: each lexicon entry carries a `source` field with
//     a regulator-source URL. The regulator-validator agent verifies these
//     before merge.
//
// What this DOESN'T do (intentional, Days 3-5 territory):
//   - Map features to AI Act articles. That's the rules engine.
//   - Score confidence. The extractor returns raw hits; the rules engine
//     decides what to do with them.
//   - Filter for "scope_qualifier" negations (e.g. "research only"). The
//     extractor surfaces the negation hit; the rules engine decides whether
//     to suppress downstream classification.
//
// What it DOES do after v0.3.1: mark a phrase that stands near a negation
// ("does NOT rank job applicants", "keine Emotionserkennung") in the additive
// `negatedHits` list. ADVISORY ONLY: every hit fires exactly as in v0.3.1;
// `hits` and `byCategory` never read the mark. The rules live in ./negation.ts.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalize, tokenize } from './normalize.js';
import { detectLang } from './lang.js';
import { findNegated, isNegationLexicon } from './negation.js';
import type { NegationLexicon } from './negation.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LexiconEntry {
  phrase: string;
  source?: string;
}

export interface LexiconCategory {
  description: string;
  source: string;
  entries: LexiconEntry[];
}

/**
 * Lexicon shape. Top-level group keys are open-ended: any key NOT in the
 * reserved set ({language, version, keys starting with `_`}) is treated as a
 * category group by the extractor. This lets v0.2+ lexicons add new groups
 * (e.g. `article_53_gpai_systemic_risk`) without touching the extractor code.
 */
export interface Lexicon {
  language: 'en' | 'de';
  version: string;
  /** opaque metadata (e.g. `_meta`); ignored by the extractor */
  [reserved: `_${string}`]: unknown;
  annex_iii: Record<string, LexiconCategory>;
  article_5_prohibited: Record<string, LexiconCategory>;
  article_50_gpai: Record<string, LexiconCategory>;
  scope_qualifiers: Record<string, LexiconCategory>;
  /** any additional group added in v0.2+ */
  [group: string]: unknown;
}

/** Reserved (non-category) keys that the extractor must skip. */
const RESERVED_KEYS: ReadonlySet<string> = new Set(['language', 'version']);

/** Discover all category-group keys from a lexicon at runtime. */
function discoverGroups(lexicon: Lexicon): string[] {
  return Object.keys(lexicon).filter(
    (k) => !RESERVED_KEYS.has(k) && !k.startsWith('_'),
  );
}

export interface ExtractedHit {
  /** lexicon group: annex_iii | article_5_prohibited | article_50_gpai | scope_qualifiers | future v0.2+ additions */
  group: string;
  /** category key within the group (e.g. "1_biometrics", "social_scoring") */
  category: string;
  /** the exact phrase that matched */
  phrase: string;
  /** regulator-source URL the category cites */
  source: string;
}

export interface ExtractedFeatures {
  /** raw user input (unmodified) */
  input: string;
  /** detected (or overridden) language */
  lang: 'en' | 'de';
  /** language-detection confidence flag, for the caller to decide whether to revalidate */
  langConfident: boolean;
  /** lexicon version SHA-stamped at build time (placeholder until Day 6) */
  lexiconVersion: string;
  /** every phrase match across all categories, in deterministic order */
  hits: ExtractedHit[];
  /** convenience grouping: hits by group → category → matched phrases */
  byCategory: Record<string, Record<string, string[]>>;
  /**
   * Advisory: lexicon phrases that fired but stand near a negation in every
   * occurrence ("Found, but the text appears to deny it — please check").
   * Every entry is ALSO in `hits`; the mark never changes a verdict. Set by
   * the keyword extractor (after v0.3.1); absent on LLM-mode features and on
   * features cached before it existed.
   */
  negatedHits?: NegatedHit[];
}

/** A fired lexicon phrase that stands near a negation (advisory). */
export interface NegatedHit extends ExtractedHit {
  /** the negation words near the phrase, e.g. "not use", "keine", "is not used" */
  cue: string;
}

export interface ExtractOptions {
  /** override automatic language detection */
  lang?: 'en' | 'de';
  /** minimum n-gram length (default 1) */
  minN?: number;
  /**
   * maximum n-gram length (default 6 in v0.1.3+; was 4 in v0.1.2-).
   *
   * Bumped from 4 → 6 to accept EUR-Lex verbatim sub-phrases that surface
   * as 5- or 6-token n-grams after normalization (filler words "in the",
   * "of a", "for the" expand the token count). Examples landing in v0.1.3:
   *   - "emotion recognition in the workplace" (5 tokens)
   *   - "biometric identification in publicly accessible spaces" (6 tokens)
   *   - "predict that a natural person will commit a criminal offence" (10)
   *
   * Memory/perf cost is bounded — the candidate set scales linearly with
   * token count × n-gram width, and Day-14 launch inputs are short (≤ 200
   * tokens typical, 800-token CLI cap).
   */
  maxN?: number;
}

/** Token range [start, end) of one n-gram occurrence in the input. */
interface Occurrence {
  start: number;
  end: number;
}

// ---------------------------------------------------------------------------
// Lexicon loading (cached at module init)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data');

function loadLexicon(lang: 'en' | 'de'): Lexicon {
  const path = join(DATA_DIR, `patterns.${lang}.json`);
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as Lexicon;
  if (parsed.language !== lang) {
    throw new Error(
      `loadLexicon(): patterns.${lang}.json claims language="${parsed.language}", expected "${lang}".`,
    );
  }
  return parsed;
}

// Cache: read once, reuse across calls. Lexicons are small (a few KB each).
const LEXICONS: Record<'en' | 'de', Lexicon> = {
  en: loadLexicon('en'),
  de: loadLexicon('de'),
};

/**
 * Reload lexicons from disk. Test helper — not part of the public API.
 * @internal
 */
export function _reloadLexicons(): void {
  LEXICONS.en = loadLexicon('en');
  LEXICONS.de = loadLexicon('de');
}

// ---------------------------------------------------------------------------
// Extractor
// ---------------------------------------------------------------------------

/**
 * Extract regulator-keyed features from free-text input.
 *
 * Workflow:
 *   1. normalize(text) → NFKC, lowercase, strip punctuation, collapse whitespace
 *   2. detectLang() → EN or DE (or use opts.lang override)
 *   3. tokenize → words preserving in-word hyphens
 *   4. n-grams (minN..maxN, default 1..6) → candidate phrases
 *   5. for each n-gram, lookup against the active lexicon's flat-phrase index
 *   6. emit ExtractedFeatures with every match plus a by-group/by-category convenience
 *      structure for downstream rule modules
 */
export function extractFeatures(text: string, opts: ExtractOptions = {}): ExtractedFeatures {
  if (typeof text !== 'string') {
    throw new TypeError('extractFeatures(): input text must be a string.');
  }
  const normalized = normalize(text);
  const detection = detectLang(normalized);
  const lang = opts.lang ?? detection.lang;
  const lexicon = LEXICONS[lang];
  const minN = opts.minN ?? 1;
  const maxN = opts.maxN ?? 6;

  const tokens = tokenize(normalized);
  if (minN < 1) throw new RangeError('extractFeatures(): minN must be >= 1.');
  if (maxN < minN) throw new RangeError('extractFeatures(): maxN must be >= minN.');

  // Every n-gram (and hyphen sub-token) occurrence, with its token range.
  const occurrences = new Map<string, Occurrence[]>();
  const addOccurrence = (phrase: string, start: number, end: number): void => {
    const list = occurrences.get(phrase);
    if (list === undefined) occurrences.set(phrase, [{ start, end }]);
    else list.push({ start, end });
  };
  for (let n = minN; n <= maxN && n <= tokens.length; n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      addOccurrence(tokens.slice(i, i + n).join(' '), i, i + n);
    }
  }

  // Hyphen-split sub-tokens. German compound nouns ("deepfake-videos",
  // "live-gesichtserkennung") routinely combine a lexicon-targeted base
  // term with a domain suffix. Adding the split sub-tokens as 1-gram
  // candidates lets the base term match without exploding the lexicon
  // with every possible compound. False-positive risk is low because the
  // sub-tokens still have to match a curated lexicon phrase verbatim.
  tokens.forEach((token, i) => {
    if (token.includes('-')) {
      for (const part of token.split('-')) {
        if (part.length > 0) addOccurrence(part, i, i + 1);
      }
    }
  });

  // Pass 1 — every lexicon entry that occurs at all, in lexicon order.
  const groups = discoverGroups(lexicon);
  const matches: Array<{
    group: string;
    categoryKey: string;
    category: LexiconCategory;
    entry: LexiconEntry;
    occs: Occurrence[];
  }> = [];
  for (const group of groups) {
    const raw = lexicon[group];
    if (raw === undefined || raw === null || typeof raw !== 'object') continue;
    const categories = raw as Record<string, LexiconCategory>;
    for (const [categoryKey, category] of Object.entries(categories)) {
      for (const entry of category.entries) {
        const occs = occurrences.get(normalize(entry.phrase));
        if (occs !== undefined) matches.push({ group, categoryKey, category, entry, occs });
      }
    }
  }

  // Pass 2 — emit every hit in the deterministic lexicon order, exactly as
  // v0.3.1 did. Negation is NOT consulted here.
  const hits: ExtractedHit[] = [];
  const byCategory: Record<string, Record<string, string[]>> = {};
  for (const group of groups) byCategory[group] = {};
  for (const m of matches) {
    hits.push({ group: m.group, category: m.categoryKey, phrase: m.entry.phrase, source: m.entry.source ?? m.category.source });
    const groupBucket = byCategory[m.group];
    if (groupBucket !== undefined) {
      const bucket = groupBucket[m.categoryKey];
      if (bucket === undefined) groupBucket[m.categoryKey] = [m.entry.phrase];
      else bucket.push(m.entry.phrase);
    }
  }

  // Advisory negation note (after v0.3.1, see negation.ts). Computed AFTER the
  // hits and only appended to `negatedHits`: a phrase is listed when every
  // occurrence of it stands near a negation. It never removes a hit.
  const rawNegation = lexicon._negation;
  const negationLex: NegationLexicon | undefined = isNegationLexicon(rawNegation) ? rawNegation : undefined;
  const flat: Occurrence[] = [];
  const owner: number[] = [];
  matches.forEach((m, mi) => {
    for (const o of m.occs) {
      flat.push(o);
      owner.push(mi);
    }
  });
  const negation = findNegated(text, negationLex, flat);
  const plain = matches.map(() => false);
  const cueOf: Array<string | undefined> = matches.map(() => undefined);
  flat.forEach((_o, idx) => {
    const mi = owner[idx] as number;
    const cue = negation.negated.get(idx);
    if (cue === undefined) plain[mi] = true;
    else if (cueOf[mi] === undefined) cueOf[mi] = cue;
  });
  const negatedHits: NegatedHit[] = [];
  matches.forEach((m, mi) => {
    const cue = cueOf[mi];
    if (plain[mi] || cue === undefined) return;
    negatedHits.push({ group: m.group, category: m.categoryKey, phrase: m.entry.phrase, source: m.entry.source ?? m.category.source, cue });
  });

  return {
    input: text,
    lang,
    langConfident: detection.confident,
    lexiconVersion: lexicon.version,
    hits,
    byCategory,
    negatedHits,
  };
}
