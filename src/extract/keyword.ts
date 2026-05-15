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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalize, tokenize, ngrams } from './normalize.js';
import { detectLang } from './lang.js';

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
}

export interface ExtractOptions {
  /** override automatic language detection */
  lang?: 'en' | 'de';
  /** minimum n-gram length (default 1) */
  minN?: number;
  /** maximum n-gram length (default 4; AI Act phrases rarely exceed 4 tokens after normalization) */
  maxN?: number;
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
 *   4. ngrams(1..4) → candidate phrases
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
  const maxN = opts.maxN ?? 4;

  const tokens = tokenize(normalized);
  const candidates = ngrams(tokens, minN, maxN);
  const candidateSet = new Set(candidates);

  // Hyphen-split sub-tokens. German compound nouns ("deepfake-videos",
  // "live-gesichtserkennung") routinely combine a lexicon-targeted base
  // term with a domain suffix. Adding the split sub-tokens as 1-gram
  // candidates lets the base term match without exploding the lexicon
  // with every possible compound. False-positive risk is low because the
  // sub-tokens still have to match a curated lexicon phrase verbatim.
  for (const token of tokens) {
    if (token.includes('-')) {
      for (const part of token.split('-')) {
        if (part.length > 0) candidateSet.add(part);
      }
    }
  }

  const hits: ExtractedHit[] = [];
  const byCategory: Record<string, Record<string, string[]>> = {};
  const groups = discoverGroups(lexicon);
  for (const group of groups) byCategory[group] = {};

  for (const group of groups) {
    const raw = lexicon[group];
    if (raw === undefined || raw === null || typeof raw !== 'object') continue;
    const categories = raw as Record<string, LexiconCategory>;
    for (const [categoryKey, category] of Object.entries(categories)) {
      const matched: string[] = [];
      for (const entry of category.entries) {
        const phraseNormalized = normalize(entry.phrase);
        if (candidateSet.has(phraseNormalized)) {
          matched.push(entry.phrase);
          hits.push({
            group,
            category: categoryKey,
            phrase: entry.phrase,
            source: entry.source ?? category.source,
          });
        }
      }
      if (matched.length > 0) {
        const groupBucket = byCategory[group];
        if (groupBucket !== undefined) {
          groupBucket[categoryKey] = matched;
        }
      }
    }
  }

  return {
    input: text,
    lang,
    langConfident: detection.confident,
    lexiconVersion: lexicon.version,
    hits,
    byCategory,
  };
}
