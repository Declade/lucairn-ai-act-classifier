// Article 50 — Transparency obligations for providers and deployers of certain
// AI systems (chatbots, GPAI synthetic content, emotion recognition / biometric
// categorisation deployers, deep-fake deployers).
//
// Pure-function rule module. Cascade root that is INDEPENDENT of Annex III
// high-risk classification — Article 50 transparency obligations apply to
// specific system shapes regardless of whether the system is also classified
// high-risk under Article 6 + Annex III.
//
// Cite-and-match: every emitted result carries the EUR-Lex source URL for
// Article 50 of Regulation (EU) 2024/1689. The summary fields quote EUR-Lex
// EN verbatim (via EU AI Office Service Desk Tier-2 — Tier-1 EUR-Lex HTML
// shell returns empty on programmatic fetch as of 2026-05-15) and EUR-Lex DE
// via the same Tier-2 path. The regulator-validator agent re-verifies these
// citations on every PR.
//
// EUR-Lex source: https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689
// EU AI Office Service Desk (EN): https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50
// EU AI Office Service Desk (DE): https://ai-act-service-desk.ec.europa.eu/de/ai-act/article-50
//
// Applicability — four independent paragraphs:
//   50(1) Providers of AI systems intended to INTERACT DIRECTLY with natural
//         persons must inform exposed users that they are interacting with an
//         AI system (unless this is obvious from circumstances and context).
//         Statutory carve-out: AI systems authorised by law to detect, prevent,
//         investigate or prosecute criminal offences.
//   50(2) Providers of AI systems (including GPAI) generating SYNTHETIC audio,
//         image, video or text content must ensure outputs are marked in a
//         machine-readable format and detectable as artificially generated or
//         manipulated. Statutory carve-out: AI systems that perform an
//         assistive function for standard editing OR do not substantially alter
//         the input data; AI authorised by law to detect, prevent, investigate
//         or prosecute criminal offences.
//   50(3) Deployers of EMOTION RECOGNITION or BIOMETRIC CATEGORISATION systems
//         must inform natural persons exposed to them. Statutory carve-out:
//         systems permitted by law to detect, prevent or investigate criminal
//         offences (subject to safeguards).
//   50(4) Deployers of AI systems generating or manipulating image/audio/video
//         content constituting a DEEP FAKE must disclose that the content has
//         been artificially generated or manipulated. Statutory carve-out:
//         editorial / artistic / satirical / fictional works (with proportionate
//         disclosure that does not hamper enjoyment), and AI authorised by law
//         to detect, prevent, investigate or prosecute criminal offences.
//
// Three-category mapping (locked, do NOT reopen — cite CLAUDE.md
// `## Locked decisions`):
//   Article 50 is INTENTIONALLY NOT in any Lucairn three-category pairing.
//   The three-category scheme tracks the high-risk obligation overlay
//   (Cat 1 = Art 10+15 sanitizer, Cat 2 = Art 12+14 evidence, Cat 3 =
//   Art 10+12+14+15 inventory). Article 50 is transparency-to-end-users for
//   specific GPAI/deployer shapes, on a different cascade root, and surfaces
//   independently in the classifier output.
//
// Suppression interaction with Article 5:
//   Some Article 5 prohibitions overlap with Article 50(3) (emotion recognition
//   in workplace/education is prohibited under Art 5(1)(f), making the Art 50(3)
//   transparency obligation moot for that specific case). When article5.hits
//   contains letter 'f' AND article5.prohibited === true, paragraph_3 is
//   suppressed. Other paragraphs (50(1), 50(2), 50(4)) are independent of
//   Article 5.
//
// Pure-function discipline:
//   - No I/O. No network. No module-init side effects.
//   - Same input → same output, byte-for-byte.
//   - Consumes an ExtractedFeatures + Article5Result; emits an Article50Result.
//   - Pattern matching uses word-boundary regex on the LOWERCASED raw input
//     (NOT the extractor's tokenized features) so we can apply Article-50-
//     specific phrasing without coupling to Day-2 lexicon categorization.

import type { ExtractedFeatures } from '../extract/keyword.js';
import type { Article5Result } from './article-5.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Trace of WHICH paragraphs of Article 50 triggered (or not).
 */
export interface Article50TriggeredBy {
  /** 50(1) — AI systems intended to interact directly with natural persons. */
  paragraph_1_chatbot: boolean;
  /** 50(2) — Providers generating synthetic content (GPAI + general). */
  paragraph_2_synthetic_content: boolean;
  /** 50(3) — Deployers of emotion-recognition or biometric-categorisation systems. */
  paragraph_3_emotion_or_biometric: boolean;
  /** 50(4) — Deployers generating deep-fake content. */
  paragraph_4_deep_fake: boolean;
}

export interface Article50Result {
  /** True iff at least one of the 4 paragraphs fires after Article 5 suppression. */
  applicable: boolean;
  triggered_by: Article50TriggeredBy;
  /** EN summary of all 4 paragraph chapeaux with statutory carve-outs enumerated. */
  summary_en: string;
  /** DE summary of all 4 paragraph chapeaux with statutory carve-outs enumerated. */
  summary_de: string;
  /** EUR-Lex citation URL. */
  source: string;
}

// ---------------------------------------------------------------------------
// Static metadata
// ---------------------------------------------------------------------------

const EUR_LEX_SOURCE =
  'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689';

// All four paragraph chapeaux in EN+DE. We enumerate the statutory law-
// enforcement carve-outs explicitly (per regulator-validator's anti-hand-wave
// rule, Day-3 lesson 5) — Article 50(1), (2), (3) and (4) all have
// law-enforcement carve-outs and Article 50(2) + 50(4) carry additional
// editorial / assistive-function carve-outs.
const SUMMARY_EN =
  'Article 50 transparency obligations apply to specific AI system shapes. ' +
  '(50(1)) Providers of AI systems intended to interact directly with natural ' +
  'persons shall ensure that the AI system is designed and developed in such a way ' +
  'that the natural persons concerned are informed that they are interacting with ' +
  'an AI system, unless this is obvious from the point of view of a natural person ' +
  'who is reasonably well-informed, observant and circumspect, taking into account ' +
  'the circumstances and the context of use; this obligation does not apply to AI ' +
  'systems authorised by law to detect, prevent, investigate or prosecute criminal ' +
  'offences, subject to appropriate safeguards. ' +
  '(50(2)) Providers of AI systems, including general-purpose AI systems, generating ' +
  'synthetic audio, image, video or text content, shall ensure that the outputs of ' +
  'the AI system are marked in a machine-readable format and detectable as ' +
  'artificially generated or manipulated; this obligation does not apply to AI ' +
  'systems that perform an assistive function for standard editing or do not ' +
  'substantially alter the input data, nor to AI authorised by law to detect, ' +
  'prevent, investigate or prosecute criminal offences. ' +
  '(50(3)) Deployers of an emotion recognition system or a biometric ' +
  'categorisation system shall inform the natural persons exposed thereto of the ' +
  'operation of the system; this obligation does not apply to AI systems permitted ' +
  'by law to detect, prevent or investigate criminal offences, subject to ' +
  'appropriate safeguards. ' +
  '(50(4)) Deployers of an AI system that generates or manipulates image, audio or ' +
  'video content constituting a deep fake shall disclose that the content has been ' +
  'artificially generated or manipulated; this obligation does not apply where the ' +
  'use is authorised by law to detect, prevent, investigate or prosecute criminal ' +
  'offences, nor where the content is part of an evidently artistic, creative, ' +
  'satirical, fictional or analogous work, in which case proportionate disclosure ' +
  'is required that does not hamper the display or enjoyment of the work. ' +
  '(Art 50(1)–(4))';

const SUMMARY_DE =
  'Artikel 50 Transparenzpflichten gelten für bestimmte KI-System-Konstellationen. ' +
  '(50 Abs. 1) Anbieter von KI-Systemen, die für die direkte Interaktion mit ' +
  'natürlichen Personen bestimmt sind, sorgen dafür, dass das KI-System so ' +
  'konzipiert und entwickelt wird, dass die betroffenen natürlichen Personen ' +
  'informiert werden, dass sie mit einem KI-System interagieren, es sei denn, ' +
  'dies ist aus Sicht einer angemessen aufmerksamen, gut informierten und ' +
  'umsichtigen natürlichen Person unter Berücksichtigung der Umstände und des ' +
  'Verwendungskontexts offensichtlich; diese Pflicht gilt nicht für KI-Systeme, ' +
  'die gesetzlich zur Aufdeckung, Verhütung, Ermittlung oder Verfolgung von ' +
  'Straftaten zugelassen sind, vorbehaltlich angemessener Garantien. ' +
  '(50 Abs. 2) Anbieter von KI-Systemen, einschließlich KI-Modellen mit ' +
  'allgemeinem Verwendungszweck, die synthetische Audio-, Bild-, Video- oder ' +
  'Textinhalte erzeugen, sorgen dafür, dass die Ausgaben des KI-Systems in einem ' +
  'maschinenlesbaren Format gekennzeichnet und als künstlich erzeugt oder ' +
  'manipuliert erkennbar sind; diese Pflicht gilt nicht für KI-Systeme, die eine ' +
  'unterstützende Funktion für die Standardbearbeitung ausüben oder die Eingabe ' +
  'nicht wesentlich verändern, ebenso wenig wie für KI, die gesetzlich zur ' +
  'Aufdeckung, Verhütung, Ermittlung oder Verfolgung von Straftaten zugelassen ' +
  'ist. ' +
  '(50 Abs. 3) Betreiber eines Emotionserkennungssystems oder eines biometrischen ' +
  'Kategorisierungssystems informieren die diesem System ausgesetzten natürlichen ' +
  'Personen über den Betrieb des Systems; diese Pflicht gilt nicht für KI-Systeme, ' +
  'die gesetzlich zur Aufdeckung, Verhütung oder Ermittlung von Straftaten ' +
  'zugelassen sind, vorbehaltlich angemessener Garantien. ' +
  '(50 Abs. 4) Betreiber eines KI-Systems, das Bild-, Audio- oder Videoinhalte ' +
  'erzeugt oder manipuliert, die einen Deepfake darstellen, legen offen, dass die ' +
  'Inhalte künstlich erzeugt oder manipuliert wurden; diese Pflicht gilt nicht, ' +
  'sofern die Verwendung gesetzlich zur Aufdeckung, Verhütung, Ermittlung oder ' +
  'Verfolgung von Straftaten zugelassen ist, oder sofern die Inhalte Teil eines ' +
  'offensichtlich künstlerischen, kreativen, satirischen, fiktionalen oder ' +
  'analogen Werks sind; in diesem Fall ist eine angemessene Offenlegung ' +
  'erforderlich, die die Darbietung oder den Genuss des Werks nicht ' +
  'beeinträchtigt. ' +
  '(Art. 50 Abs. 1–4)';

// ---------------------------------------------------------------------------
// Inline pattern set (Day-5 self-contained; not coupled to Day-2 lexicon)
// ---------------------------------------------------------------------------
//
// Design choice (vs consuming features.byCategory.article_50_gpai): keeping
// the Article-50 phrasing inline in this module makes the cascade-root
// trigger logic auditable in one file, decouples Day-5 from Day-2 lexicon
// categorization decisions, and follows the dispatch's recommended
// architecture (option b — mirrors article-5.ts's inline LETTER_TABLE
// pattern). The Day-7/8 fixture-curation pass can expand these phrase sets
// or extract them to JSON if real BSI/BfDI phrasing surfaces accuracy gaps.
//
// Each phrase is matched with word-boundary discipline on the LOWERCASED
// raw input (NOT the tokenized feature set), case-insensitively. Substring
// matches without boundaries would over-fire on partial words (e.g.
// "synthetic" inside "synthetically"). Boundaries also catch hyphenated and
// non-hyphenated variants of German compound nouns.

const PARAGRAPH_1_PATTERNS_EN: readonly string[] = [
  'chatbot',
  'virtual assistant',
  'ai assistant',
  'interacts with users',
  'interacts directly with',
  'conversational ai',
  'conversational agent',
  'ai agent that responds',
];

const PARAGRAPH_1_PATTERNS_DE: readonly string[] = [
  'chatbot',
  'virtueller assistent',
  'ki-assistent',
  'ki assistent',
  'interagiert mit nutzern',
  'interagiert direkt mit',
  'konversations-ki',
  'konversationelle ki',
  'dialogsystem',
];

const PARAGRAPH_2_PATTERNS_EN: readonly string[] = [
  'synthetic content',
  'synthetic audio',
  'synthetic image',
  'synthetic video',
  'synthetic text',
  'ai-generated',
  'ai generated',
  'generative ai',
  'gpai',
  'general-purpose ai',
  'foundation model',
];

const PARAGRAPH_2_PATTERNS_DE: readonly string[] = [
  'synthetische inhalte',
  'synthetisches audio',
  'synthetisches bild',
  'synthetisches video',
  'synthetischer text',
  'ki-generiert',
  'ki-generierte inhalte',
  'generative ki',
  'gpai',
  'ki mit allgemeinem verwendungszweck',
  'basismodell',
];

const PARAGRAPH_3_PATTERNS_EN: readonly string[] = [
  'emotion recognition',
  'emotion detection',
  'biometric categorisation',
  'biometric categorization',
];

const PARAGRAPH_3_PATTERNS_DE: readonly string[] = [
  'emotionserkennung',
  'emotionserkennungssystem',
  'biometrische kategorisierung',
  'biometrisches kategorisierungssystem',
];

const PARAGRAPH_4_PATTERNS_EN: readonly string[] = [
  'deep fake',
  'deep-fake',
  'deepfake',
  'ai-manipulated video',
  'ai-manipulated image',
  'ai-manipulated audio',
  'synthetic video',
  'manipulated video',
];

const PARAGRAPH_4_PATTERNS_DE: readonly string[] = [
  'deepfake',
  'deep-fake',
  'deep fake',
  'ki-manipuliertes video',
  'ki-manipuliertes bild',
  'ki-manipuliertes audio',
  'synthetisches video',
  'manipuliertes video',
];

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

/**
 * Word-boundary, case-insensitive substring match. The patterns themselves
 * may contain spaces / hyphens; we anchor with `\b` at both ends in the
 * compiled regex. Spaces inside the pattern are treated as literal spaces
 * (NOT `\s+`) — the extractor is the right layer for whitespace
 * normalisation; here we trust the caller's input as-is.
 */
function escapeRegex(pattern: string): string {
  // Escape regex metacharacters. Hyphens and spaces are intentionally left
  // unescaped — they're literal characters in our patterns.
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesAny(input: string, patterns: readonly string[]): boolean {
  const lower = input.toLowerCase();
  for (const phrase of patterns) {
    // Build a per-phrase regex with word boundaries. Pre-compiled at the
    // call site (no module-init regex array — the cost is negligible
    // compared to the I/O-less call frequency).
    const re = new RegExp(`\\b${escapeRegex(phrase.toLowerCase())}\\b`, 'i');
    if (re.test(lower)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify the input against Article 50 (transparency obligations for certain
 * AI systems — chatbots, synthetic content, emotion recognition, deep fakes).
 *
 * Workflow:
 *   1. Type-guard inputs (friendly TypeError if upstream contract violated).
 *   2. Run each paragraph's pattern set against the raw input. Each paragraph
 *      fires independently — multiple paragraphs may trigger on a single use
 *      case description.
 *   3. Apply Article 5 suppression: if `article5.prohibited === true` AND
 *      Art 5(1)(f) (emotion recognition in workplace/education) fired, set
 *      `paragraph_3_emotion_or_biometric: false` (the prohibition supersedes
 *      the transparency obligation for that specific case). Other paragraphs
 *      are independent of Article 5.
 *   4. `applicable === true` iff any of the 4 paragraphs is true after
 *      suppression.
 *
 * @param features - Result from `extractFeatures()`. We read `features.input`
 *   (raw text) and do not depend on the tokenized hits — Article 50 patterns
 *   live in this module.
 * @param article5 - Result from `classifyArticle5()`. Used for the 50(3)
 *   suppression check against Art 5(1)(f).
 */
export function classifyArticle50(
  features: ExtractedFeatures,
  article5: Article5Result,
): Article50Result {
  if (features === null || typeof features !== 'object' || typeof (features as ExtractedFeatures).input !== 'string') {
    throw new TypeError(
      'classifyArticle50(): features must be an ExtractedFeatures object with an input string (call extractFeatures() first).',
    );
  }
  if (article5 === null || typeof article5 !== 'object' || !Array.isArray((article5 as Article5Result).hits)) {
    throw new TypeError(
      'classifyArticle50(): article5 must be an Article5Result object with a hits array (call classifyArticle5() first).',
    );
  }

  const input = features.input;

  const paragraph_1_chatbot =
    matchesAny(input, PARAGRAPH_1_PATTERNS_EN) ||
    matchesAny(input, PARAGRAPH_1_PATTERNS_DE);

  const paragraph_2_synthetic_content =
    matchesAny(input, PARAGRAPH_2_PATTERNS_EN) ||
    matchesAny(input, PARAGRAPH_2_PATTERNS_DE);

  // Suppression check for 50(3): Art 5(1)(f) prohibits emotion-recognition in
  // workplace/education. When that prohibition fires, the 50(3) transparency
  // obligation is moot (a prohibited system cannot be placed on the market).
  const art5fFired =
    article5.prohibited &&
    article5.hits.some((h) => h.letter === 'f');

  let paragraph_3_emotion_or_biometric =
    matchesAny(input, PARAGRAPH_3_PATTERNS_EN) ||
    matchesAny(input, PARAGRAPH_3_PATTERNS_DE);
  if (art5fFired) {
    paragraph_3_emotion_or_biometric = false;
  }

  const paragraph_4_deep_fake =
    matchesAny(input, PARAGRAPH_4_PATTERNS_EN) ||
    matchesAny(input, PARAGRAPH_4_PATTERNS_DE);

  const applicable =
    paragraph_1_chatbot ||
    paragraph_2_synthetic_content ||
    paragraph_3_emotion_or_biometric ||
    paragraph_4_deep_fake;

  return {
    applicable,
    triggered_by: {
      paragraph_1_chatbot,
      paragraph_2_synthetic_content,
      paragraph_3_emotion_or_biometric,
      paragraph_4_deep_fake,
    },
    summary_en: SUMMARY_EN,
    summary_de: SUMMARY_DE,
    source: EUR_LEX_SOURCE,
  };
}
