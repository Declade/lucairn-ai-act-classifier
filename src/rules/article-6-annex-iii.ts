// Article 6 + Annex III — High-risk AI systems classification.
//
// Pure rule module. Consumes ExtractedFeatures (from src/extract/keyword.ts)
// AND the Article 5 result (so prohibition takes priority over high-risk
// classification — a system can be prohibited under Art 5 even if it ALSO
// meets a high-risk Annex III description).
//
// EUR-Lex sources:
//   EN PDF: https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689
//   DE PDF: https://eur-lex.europa.eu/legal-content/DE/TXT/PDF/?uri=OJ:L_202401689
// EU AI Office Service Desk Annex III:
//   https://ai-act-service-desk.ec.europa.eu/en/ai-act/annex-3
//
// Disambiguation rules carried forward from Day 2 lexicon notes (handover §
// "Day-3 rule-engine carry-forwards"):
//
//   1. Annex III.5 "insurance pricing" / "versicherungstarifierung" scopes
//      to LIFE and HEALTH insurance only (sub-letter (c) of paragraph 5).
//      Property & casualty / motor / Kfz insurance is OUT OF SCOPE for
//      Annex III.5(c). If the input clearly references P&C/motor insurance
//      we DO NOT claim insurance-pricing high-risk for the 5_essential_services
//      domain.
//
//   2. scope_qualifiers.internal_use MUST NEVER suppress high-risk or
//      prohibition classification. The lexicon description already pins this
//      at the data layer; we surface it in `reasoning` for transparency but
//      do NOT use it to gate the boolean outputs.
//
//   3. scope_qualifiers.research_only triggers the Art 2(8) carve-out UNLESS
//      the input also references "real-world conditions" / "Realbedingungen"
//      / "real-world pilot" / "Pilot unter Realbedingungen". When real-world
//      condition language is present, the carve-out does NOT apply.
//
// Pure-function discipline: same input → same output, byte-for-byte.
// Module-init file load mirrors src/extract/keyword.ts (loaded once via
// fileURLToPath relative to the compiled module's directory; the package.json
// build script copies src/data → dist/data so the JSON ships in the npm tarball).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { ExtractedFeatures } from '../extract/keyword.js';
import type { Article5Result } from './article-5.js';

// ---------------------------------------------------------------------------
// JSON shape
// ---------------------------------------------------------------------------

interface AnnexIIISubLetter {
  letter: string;
  summary_en: string;
  summary_de: string;
  /** Optional inline note (e.g. for Annex III.6(d) cross-reference to Art 5(1)(d)). */
  _note?: string;
}

interface AnnexIIIDomain {
  annex_iii_number: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  key: string;
  title_en: string;
  title_de: string;
  /**
   * Lexicon category keys (under `annex_iii.*` in patterns.{en,de}.json) that
   * map to this domain. If any of these category keys appears in the
   * extractor's hits, this domain fires.
   */
  lexicon_categories: string[];
  source: string;
  sub_letters: AnnexIIISubLetter[];
}

interface AnnexIIIData {
  version: string;
  source_primary: string;
  source_secondary: string;
  domains: AnnexIIIDomain[];
  /** Opaque metadata block; ignored by the rule module. */
  _meta?: unknown;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AnnexIIIDomainHit {
  annex_iii_number: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  key: string;
  /** Sub-letters that the matched phrases narrow to. May be empty when the lexicon hit is too general to disambiguate. */
  sub_letters: string[];
  /** Phrases from the input that triggered this domain. */
  matched_phrases: string[];
  title_en: string;
  title_de: string;
  source: string;
}

export interface AnnexIIIResult {
  /** True iff at least one Annex III domain fires AND classifyArticle5 did not prohibit. */
  high_risk: boolean;
  /** Ordered by Annex III number ascending. */
  domains: AnnexIIIDomainHit[];
  /** Human-readable reasoning trace. */
  reasoning: string[];
  /** True iff classifyArticle5().prohibited === true (prohibition wins over high-risk). */
  suppressed_by_article_5: boolean;
}

// ---------------------------------------------------------------------------
// Annex III data load (cached at module init; mirrors keyword.ts pattern)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// dist/rules/article-6-annex-iii.js → ../data/annex-iii.json
const DATA_DIR = join(__dirname, '..', 'data');

function loadAnnexIII(): AnnexIIIData {
  const path = join(DATA_DIR, 'annex-iii.json');
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as AnnexIIIData;
}

const ANNEX_III: AnnexIIIData = loadAnnexIII();

/**
 * Reload the annex-iii.json data from disk. Test helper — not part of the
 * public API.
 * @internal
 */
export function _reloadAnnexIII(): void {
  // Re-read; Object.assign onto the stable reference so existing closures
  // see the updated data.
  const fresh = loadAnnexIII();
  ANNEX_III.version = fresh.version;
  ANNEX_III.source_primary = fresh.source_primary;
  ANNEX_III.source_secondary = fresh.source_secondary;
  ANNEX_III.domains = fresh.domains;
  ANNEX_III._meta = fresh._meta;
}

// Build the lexicon-key → domain index once (module init, post-load).
function buildIndex(data: AnnexIIIData): Map<string, AnnexIIIDomain> {
  const index = new Map<string, AnnexIIIDomain>();
  for (const domain of data.domains) {
    for (const lexKey of domain.lexicon_categories) {
      if (index.has(lexKey)) {
        throw new Error(
          `annex-iii.json: lexicon_category "${lexKey}" mapped to multiple domains (data integrity error).`,
        );
      }
      index.set(lexKey, domain);
    }
  }
  return index;
}

let LEXICON_INDEX: Map<string, AnnexIIIDomain> = buildIndex(ANNEX_III);

/** @internal */
export function _rebuildLexiconIndex(): void {
  LEXICON_INDEX = buildIndex(ANNEX_III);
}

// ---------------------------------------------------------------------------
// Disambiguation phrase tables
// ---------------------------------------------------------------------------

/**
 * Phrases (substring match against lowercased input) that indicate the
 * insurance context is property/casualty/motor — i.e. OUTSIDE Annex III.5(c)
 * which scopes to life/health only.
 */
const NON_LIFE_HEALTH_INSURANCE_PHRASES_EN: readonly string[] = [
  'motor insurance',
  'auto insurance',
  'car insurance',
  'vehicle insurance',
  'property insurance',
  'casualty insurance',
  'p&c insurance',
  'p & c insurance',
  'property and casualty',
  'travel insurance',
  'pet insurance',
  'home insurance',
  'homeowners insurance',
  'renters insurance',
];

const NON_LIFE_HEALTH_INSURANCE_PHRASES_DE: readonly string[] = [
  'kfz-versicherung',
  'kfz versicherung',
  'autoversicherung',
  'fahrzeugversicherung',
  'sachversicherung',
  'schadenversicherung',
  'reiseversicherung',
  'tierversicherung',
  'hausratversicherung',
  'gebäudeversicherung',
  'wohngebäudeversicherung',
  'haftpflichtversicherung',
];

/**
 * Phrases (substring match against lowercased input) that EXPLICITLY scope
 * the insurance context to life/health — strengthens the case for firing
 * Annex III.5(c) even if the more generic "insurance pricing" phrase also
 * appears.
 */
const LIFE_HEALTH_INSURANCE_PHRASES_EN: readonly string[] = [
  'life insurance',
  'health insurance',
  'medical insurance',
  'private health',
];

const LIFE_HEALTH_INSURANCE_PHRASES_DE: readonly string[] = [
  'lebensversicherung',
  'krankenversicherung',
  'private krankenversicherung',
  'gesundheitsversicherung',
];

/**
 * "Insurance pricing" / "Versicherungstarifierung" lexicon entries — these are
 * the phrases that need scope-checking against life/health vs P&C/motor.
 */
const INSURANCE_PRICING_PHRASES: readonly string[] = [
  // EN lexicon entries (from patterns.en.json annex_iii.5_essential_services)
  'insurance pricing',
  'insurance risk assessment',
  // DE lexicon entries (from patterns.de.json annex_iii.5_essential_services)
  'versicherungstarifierung',
  'versicherungsrisiko',
];

/**
 * Phrases that BLOCK the Art 2(8) research-only carve-out (because the system
 * is being tested under real-world conditions, not pre-market R&D in a closed
 * environment). Lifted from EUR-Lex Art 2(8) wording.
 */
const REAL_WORLD_CONDITIONS_PHRASES_EN: readonly string[] = [
  'real-world conditions',
  'real world conditions',
  'real-world pilot',
  'real world pilot',
  'real-world testing',
  'real world testing',
  'real-world deployment',
  'real world deployment',
];

const REAL_WORLD_CONDITIONS_PHRASES_DE: readonly string[] = [
  'realbedingungen',
  'realen bedingungen',
  'unter realbedingungen',
  'pilot unter realbedingungen',
  'realer einsatz',
  'realbetrieb',
];

function inputContainsAny(input: string, phrases: readonly string[]): boolean {
  const lower = input.toLowerCase();
  for (const phrase of phrases) {
    if (lower.includes(phrase)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Sub-letter narrowing (best-effort; empty array when generic)
// ---------------------------------------------------------------------------

/**
 * For a given Annex III domain and the matched phrases, narrow to specific
 * sub-letters where the phrase obviously maps. This is best-effort: if we
 * cannot narrow confidently we return [] and the rule engine treats the hit
 * as "domain X applies, sub-letter unspecified" — better than over-claiming.
 *
 * The lexicon does NOT carry sub-letter metadata directly (it's grouped by
 * domain only), so this is keyed off heuristic phrase → sub-letter maps that
 * are intentionally CONSERVATIVE: when in doubt, return [].
 */
function narrowSubLetters(
  domain: AnnexIIIDomain,
  matchedPhrases: string[],
  rawInput: string,
): string[] {
  const lowerInput = rawInput.toLowerCase();
  const matchedLower = matchedPhrases.map((p) => p.toLowerCase());

  // Only narrow for the cases where the lexicon → sub-letter mapping is
  // unambiguous. Add more cases as we hand-curate the 50-fixture test set
  // (Day 7-8 of the build plan). Until then, it's safer to leave sub_letters
  // empty than to over-claim.

  if (domain.annex_iii_number === 5) {
    // EUR-Lex Annex III paragraph 5 sub-letters (verbatim scope):
    //   (a) public assistance benefits / healthcare-service access eligibility
    //   (b) creditworthiness / credit-scoring (excluding fraud detection)
    //   (c) life and health insurance risk-assessment and pricing
    //   (d) emergency-call classification / dispatch / triage
    // Each sub-letter check is independent: if the input matches multiple
    // sub-areas (e.g. life-insurance pricing AND credit scoring) ALL of them
    // must be returned. This mirrors the accumulator pattern used for
    // domains 1, 4, 6 above.
    const hits = new Set<string>();

    // 5(a) — public benefits / healthcare-access eligibility.
    if (
      matchedLower.some((p) =>
        ['benefit eligibility', 'sozialleistung'].includes(p),
      )
    ) {
      hits.add('a');
    }

    // 5(b) — creditworthiness / credit scoring.
    if (
      matchedLower.some((p) =>
        ['credit scoring', 'creditworthiness', 'bonitätsprüfung', 'kreditwürdigkeit', 'scoring'].includes(p),
      )
    ) {
      hits.add('b');
    }

    // 5(c) — life/health insurance pricing. Only fires when an
    // insurance-pricing phrase is present AND the input has explicit
    // life/health framing (paragraph 5(c) scopes to life and health only;
    // P&C/motor is OUT). Without explicit life/health framing we leave it
    // unnarrowed even if the insurance-pricing phrase matched.
    const hasInsurancePricing = matchedLower.some((p) =>
      INSURANCE_PRICING_PHRASES.includes(p),
    );
    if (hasInsurancePricing) {
      const isLifeHealth =
        inputContainsAny(rawInput, LIFE_HEALTH_INSURANCE_PHRASES_EN) ||
        inputContainsAny(rawInput, LIFE_HEALTH_INSURANCE_PHRASES_DE);
      if (isLifeHealth) hits.add('c');
    }

    // 5(d) — emergency dispatch / triage.
    if (
      matchedLower.some((p) =>
        ['emergency dispatch', 'triage', 'notrufdisposition'].includes(p),
      )
    ) {
      hits.add('d');
    }

    return [...hits].sort();
  }

  if (domain.annex_iii_number === 1) {
    // Remote biometric ID → 1(a); biometric categorisation → 1(b); emotion → 1(c).
    const hits = new Set<string>();
    if (
      matchedLower.some((p) =>
        ['remote biometric identification', 'facial recognition', 'fingerprint identification', 'biometrische fernidentifizierung', 'gesichtserkennung', 'fingerabdruckerkennung'].includes(p),
      )
    ) {
      hits.add('a');
    }
    if (
      matchedLower.some((p) =>
        ['biometric categorisation', 'biometric categorization', 'biometrische kategorisierung'].includes(p),
      )
    ) {
      hits.add('b');
    }
    if (
      matchedLower.some((p) =>
        ['emotion recognition', 'emotionserkennung'].includes(p),
      )
    ) {
      hits.add('c');
    }
    return [...hits].sort();
  }

  if (domain.annex_iii_number === 4) {
    // Recruitment / CV screening → 4(a); performance evaluation / monitoring → 4(b).
    const hits = new Set<string>();
    if (
      matchedLower.some((p) =>
        ['cv screening', 'resume screening', 'candidate ranking', 'applicant tracking', 'hiring decision', 'lebenslauf-screening', 'bewerberauswahl', 'bewerber-ranking', 'personalauswahl', 'einstellungsentscheidung'].includes(p),
      )
    ) {
      hits.add('a');
    }
    if (
      matchedLower.some((p) =>
        ['performance evaluation', 'worker monitoring', 'leistungsbewertung', 'mitarbeiterüberwachung'].includes(p),
      )
    ) {
      hits.add('b');
    }
    return [...hits].sort();
  }

  if (domain.annex_iii_number === 6) {
    // Polygraph → 6(b); evidence reliability → 6(c); recidivism / crime profiling → 6(d) or 6(e).
    const hits = new Set<string>();
    if (
      matchedLower.some((p) =>
        ['polygraph', 'lie detector', 'lügendetektor'].includes(p),
      )
    ) {
      hits.add('b');
    }
    if (
      matchedLower.some((p) =>
        ['evidence reliability', 'beweismittelzuverlässigkeit'].includes(p),
      )
    ) {
      hits.add('c');
    }
    if (
      matchedLower.some((p) =>
        ['recidivism risk', 'rückfallrisiko'].includes(p),
      )
    ) {
      hits.add('d');
    }
    if (
      matchedLower.some((p) =>
        ['crime profiling', 'kriminalprofiling', 'predictive policing', 'vorhersagende polizeiarbeit'].includes(p),
      )
    ) {
      // Without "solely on profiling" disambiguator it's the broader 6(d) /
      // 6(e) territory. Default to 6(d) as the common case.
      // (lowerInput is currently unused in this branch but the helper signature
      // keeps it available for future heuristics.)
      void lowerInput;
      hits.add('d');
    }
    return [...hits].sort();
  }

  // For domains 2, 3, 7, 8 we do not yet have enough disambiguating signal
  // in the lexicon; leave sub_letters empty. The 50-case fixture set in Day 7
  // will surface concrete sub-letter mappings to add here in v0.2.
  return [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify the input against Article 6 + Annex III high-risk obligations.
 *
 * Workflow:
 *   1. Walk `features.byCategory.annex_iii`. For each lexicon category,
 *      look up the corresponding Annex III domain via the precomputed index.
 *   2. Apply Annex III.5 "insurance pricing → life/health only" disambiguation.
 *   3. Narrow each domain hit to specific sub-letters where possible.
 *   4. If `article5Result.prohibited === true`, set
 *      `suppressed_by_article_5: true` and explain in reasoning that
 *      prohibition wins (Art 5 absolute prohibition overrides Art 6
 *      high-risk obligations).
 *   5. Surface scope_qualifier interactions in reasoning:
 *      - internal_use: never suppress.
 *      - research_only: triggers Art 2(8) carve-out unless real-world
 *        conditions phrasing is present in the raw input.
 *   6. Sort domains by Annex III number ascending for deterministic output.
 */
export function classifyAnnexIII(
  features: ExtractedFeatures,
  article5Result: Article5Result,
): AnnexIIIResult {
  if (features === null || typeof features !== 'object') {
    throw new TypeError('classifyAnnexIII(): features must be an ExtractedFeatures object.');
  }
  if (article5Result === null || typeof article5Result !== 'object') {
    throw new TypeError(
      'classifyAnnexIII(): article5Result must be an Article5Result object (call classifyArticle5() first).',
    );
  }

  const reasoning: string[] = [];
  const domains: AnnexIIIDomainHit[] = [];

  const byCategoryAnnexIII = features.byCategory.annex_iii;

  if (byCategoryAnnexIII === undefined || Object.keys(byCategoryAnnexIII).length === 0) {
    reasoning.push(
      'No Annex III domain phrases matched in the input. No high-risk classification triggered.',
    );
    return {
      high_risk: false,
      domains: [],
      reasoning,
      suppressed_by_article_5: article5Result.prohibited,
    };
  }

  // Walk in deterministic order — sort lexicon category keys.
  const categoryKeys = Object.keys(byCategoryAnnexIII).sort();

  for (const categoryKey of categoryKeys) {
    const matched = byCategoryAnnexIII[categoryKey] ?? [];
    if (matched.length === 0) continue;

    const domain = LEXICON_INDEX.get(categoryKey);
    if (domain === undefined) {
      reasoning.push(
        `Lexicon hit on unknown Annex III category "${categoryKey}" — skipped (annex-iii.json data needs update to map this key).`,
      );
      continue;
    }

    // Insurance-pricing scope check (Annex III.5(c) is life/health only).
    if (domain.annex_iii_number === 5) {
      const matchedLower = matched.map((p) => p.toLowerCase());
      const hasInsurancePricing = matchedLower.some((p) =>
        INSURANCE_PRICING_PHRASES.includes(p),
      );
      if (hasInsurancePricing) {
        const hasNonLifeHealth =
          inputContainsAny(features.input, NON_LIFE_HEALTH_INSURANCE_PHRASES_EN) ||
          inputContainsAny(features.input, NON_LIFE_HEALTH_INSURANCE_PHRASES_DE);
        const hasLifeHealth =
          inputContainsAny(features.input, LIFE_HEALTH_INSURANCE_PHRASES_EN) ||
          inputContainsAny(features.input, LIFE_HEALTH_INSURANCE_PHRASES_DE);

        if (hasNonLifeHealth && !hasLifeHealth) {
          // Filter the matched phrases: drop only the insurance-pricing
          // entries; keep any other 5_essential_services phrases that may
          // independently trigger (credit scoring, public benefits, etc.).
          const remaining = matched.filter(
            (p) => !INSURANCE_PRICING_PHRASES.includes(p.toLowerCase()),
          );
          if (remaining.length === 0) {
            reasoning.push(
              `Annex III.5 lexicon hit on insurance-pricing phrases only, but the input clearly references property/casualty/motor insurance. Annex III.5(c) is scoped to LIFE and HEALTH insurance per EUR-Lex paragraph 5(c). Not claiming Annex III.5 high-risk for this input.`,
            );
            continue;
          }
          // Re-narrow with remaining phrases.
          const subLetters = narrowSubLetters(domain, remaining, features.input);
          domains.push({
            annex_iii_number: domain.annex_iii_number,
            key: domain.key,
            sub_letters: subLetters,
            matched_phrases: remaining,
            title_en: domain.title_en,
            title_de: domain.title_de,
            source: domain.source,
          });
          reasoning.push(
            `Annex III.5 lexicon hit included insurance-pricing phrases, but P&C/motor insurance context detected — dropped insurance-pricing match. Remaining 5_essential_services phrases (${remaining.map((p) => `"${p}"`).join(', ')}) still trigger Annex III.5.`,
          );
          continue;
        }
      }
    }

    const subLetters = narrowSubLetters(domain, matched, features.input);
    domains.push({
      annex_iii_number: domain.annex_iii_number,
      key: domain.key,
      sub_letters: subLetters,
      matched_phrases: [...matched],
      title_en: domain.title_en,
      title_de: domain.title_de,
      source: domain.source,
    });

    const subLettersStr = subLetters.length > 0 ? ` (sub-letters: ${subLetters.join(', ')})` : '';
    reasoning.push(
      `Annex III.${domain.annex_iii_number} (${domain.key})${subLettersStr} fires from lexicon category "${categoryKey}". Matched phrases: ${matched.map((p) => `"${p}"`).join(', ')}.`,
    );
  }

  // Sort by Annex III number ascending (deterministic).
  domains.sort((a, b) => a.annex_iii_number - b.annex_iii_number);

  // ---------------------------------------------------------------------
  // Scope-qualifier interaction reasoning
  // ---------------------------------------------------------------------

  const scopeQualifiers = features.byCategory.scope_qualifiers ?? {};

  if (scopeQualifiers['internal_use'] !== undefined && scopeQualifiers['internal_use'].length > 0) {
    reasoning.push(
      `User input mentioned internal-use phrasing ("${scopeQualifiers['internal_use'].join('", "')}") — this is NOT a regulatory exemption. Internal use does not exempt a system from Annex III high-risk classification or Article 5 prohibitions if otherwise triggered.`,
    );
  }

  if (scopeQualifiers['research_only'] !== undefined && scopeQualifiers['research_only'].length > 0) {
    const hasRealWorld =
      inputContainsAny(features.input, REAL_WORLD_CONDITIONS_PHRASES_EN) ||
      inputContainsAny(features.input, REAL_WORLD_CONDITIONS_PHRASES_DE);
    if (hasRealWorld) {
      reasoning.push(
        `User input mentioned research/testing phrasing ("${scopeQualifiers['research_only'].join('", "')}") AND real-world conditions language. Per Art 2(8), the research/testing carve-out does NOT apply when AI systems are tested under real-world conditions. High-risk obligations remain applicable.`,
      );
    } else {
      reasoning.push(
        `User input mentioned research/testing phrasing ("${scopeQualifiers['research_only'].join('", "')}") and no real-world conditions language. Art 2(8) carve-out may apply — pre-market R&D activity is outside the AI Act's substantive obligations until placement on the market or putting into service.`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // Prohibition wins — surface but do not erase the high_risk hits.
  // ---------------------------------------------------------------------

  if (article5Result.prohibited) {
    const letters = article5Result.hits.map((h) => `(${h.letter})`).join(', ');
    reasoning.push(
      `Article 5 prohibition fired (${letters}). Article 5 is an absolute prohibition that supersedes Article 6 high-risk obligations: a prohibited system cannot be placed on the market or put into service regardless of whether it ALSO meets a high-risk Annex III description. Annex III hits are retained for transparency but the operative classification is "prohibited".`,
    );
    return {
      high_risk: false,
      domains,
      reasoning,
      suppressed_by_article_5: true,
    };
  }

  return {
    high_risk: domains.length > 0,
    domains,
    reasoning,
    suppressed_by_article_5: false,
  };
}
