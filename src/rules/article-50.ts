// Article 50 — Transparency obligations for providers and deployers of certain
// AI systems (chatbots, GPAI synthetic content, emotion recognition /
// biometric categorisation deployers, deepfake deployers, public-interest-
// text deployers).
//
// Pure-function rule module. NEW non-cascade root: Article 50 transparency
// obligations apply based on AI-system FUNCTION (interaction with persons,
// GPAI synthetic content, emotion/biometric categorisation, deep fakes,
// public-interest text). It is NOT gated on Annex III high-risk.
//
// Article 50 fires independently of Article 5: Art 5 prohibits market placement,
// Art 50 applies to systems that are on-market with specific functions. The two
// articles operate at different lifecycle stages and obligation tracks. Art 50(6)
// further clarifies that Article 50 (a) shall not affect Chapter III high-risk
// requirements and (b) is without prejudice to OTHER transparency obligations
// laid down in Union or national law for deployers of AI systems — i.e., Art 50
// does not replace Art 13 / GDPR transparency obligations either. We surface
// Article 5 as a sanity input only; current logic does not branch on it.
//
// Cite-and-match: every emitted result carries the EUR-Lex source URL for
// Article 50 of Regulation (EU) 2024/1689. The summary fields concatenate
// verbatim Tier-1 EUR-Lex EN+DE PDF chapeau text(s) for the fired paragraph(s)
// in paragraph order: 50(1) → 50(2) → 50(3) → 50(4) sub-paragraph 1 (deepfake)
// → 50(4) sub-paragraph 2 (public-interest text), with 50(5) format-and-
// timing language appended as a trailing sentence when applicable === true.
// If applicable === false, summary_en/de still carries the 50(1) chapeau
// alone so consultants can read what Article 50 would require.
//
// EUR-Lex source: https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689
// EU AI Office Service Desk (EN): https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50
// EU AI Office Service Desk (DE): https://ai-act-service-desk.ec.europa.eu/de/ai-act/article-50
//
// DE wording provenance: all 6 DE chapeaux (50(1), 50(2), 50(3), 50(4) sub-
// paragraph 1, 50(4) sub-paragraph 2, 50(5)) are verbatim from the Tier-1
// EUR-Lex DE PDF (page 82-83). Earlier drafts shipped the Tier-3 mirror
// artificialintelligenceact.eu/de/article/50/ paraphrase after Tier-2 EU AI
// Office Service Desk DE was observed to be truncated on a programmatic
// fetch; regulator-validator's re-fetch of the Tier-1 DE PDF succeeded with
// the full carve-out text (including 50(2)'s second sentence on technical
// effectiveness, which the Tier-3 paraphrase had dropped). Day-5 fix-up
// replaced all 6 paraphrased DE chapeaux with Tier-1 verbatim text.
//
// Applicability — five independent paragraph paths consuming Day-2 lexicon:
//   50(1) Providers of AI systems intended to INTERACT DIRECTLY with natural
//         persons must inform exposed users that they are interacting with an
//         AI system. Statutory carve-outs (verbatim in summary): obvious from
//         a reasonable person's perspective; AI authorised by law to detect/
//         prevent/investigate/prosecute criminal offences (unless the system
//         is available for the public to report a criminal offence).
//   50(2) Providers of AI systems (including GPAI) generating SYNTHETIC audio,
//         image, video or text content must ensure outputs are marked in a
//         machine-readable format and detectable as artificially generated
//         or manipulated. Statutory carve-outs (verbatim in summary): assistive
//         function for standard editing OR no substantial alteration of input
//         data / semantics; AI authorised by law for criminal-offence purposes.
//   50(3) Deployers of EMOTION RECOGNITION or BIOMETRIC CATEGORISATION
//         systems must inform exposed natural persons. Statutory carve-out
//         (verbatim in summary): AI permitted by law to detect/prevent/
//         investigate criminal offences, subject to safeguards.
//   50(4) FIRST sub-paragraph — Deployers generating or manipulating image/
//         audio/video content constituting a DEEP FAKE must disclose
//         artificial generation/manipulation. Statutory carve-outs (verbatim
//         in summary): AI authorised by law for criminal-offence purposes;
//         artistic / creative / satirical / fictional / analogous works (with
//         proportionate disclosure that doesn't hamper display/enjoyment).
//   50(4) SECOND sub-paragraph — Deployers generating or manipulating TEXT
//         published to inform the public on matters of PUBLIC INTEREST must
//         disclose artificial generation/manipulation. Statutory carve-outs
//         (verbatim in summary): AI authorised by law for criminal-offence
//         purposes; human-reviewed / editorially-controlled content where a
//         natural or legal person holds editorial responsibility.
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
// Carve-outs — programmatic detection is NOT attempted.
//   Day 5 does NOT classify whether a system actually qualifies for a
//   law-enforcement / artistic-work / editorial-review carve-out (no NLP for
//   "law enforcement", "artistic", or "editorial responsibility"). The
//   carve-out language is enumerated VERBATIM in summary_en / summary_de so
//   consultants can apply them downstream. This mirrors the Day-3 design
//   choice on Art 5(1)(h) carve-outs (commit `bda998c`).
//
// Pure-function discipline:
//   - No I/O. No network. No module-init side effects.
//   - Same input → same output, byte-for-byte.
//   - Consumes ExtractedFeatures + Article5Result + optional AnnexIIIResult;
//     emits Article50Result.

import type { ExtractedFeatures } from '../extract/keyword.js';
import type { Article5Result } from './article-5.js';
import type { AnnexIIIResult } from './article-6-annex-iii.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Trace of WHICH of the 5 Article-50 paragraph paths fired.
 *
 * Note: 50(4) splits into two distinct sub-paragraphs (deepfake; public-
 * interest text). We track them separately because they have different
 * applicability conditions and different statutory carve-outs.
 */
export interface Article50TriggeredBy {
  /** 50(1) — AI system intended to interact directly with natural persons. */
  paragraph_1_interaction: boolean;
  /** 50(2) — Provider of GPAI / generative AI producing synthetic audio/image/video/text. */
  paragraph_2_synthetic_content: boolean;
  /** 50(3) — Deployer of emotion-recognition or biometric-categorisation system. */
  paragraph_3_emotion_or_biometric_categorisation: boolean;
  /** 50(4) first sub-paragraph — Deployer generating/manipulating image/audio/video deep fake. */
  paragraph_4_deepfake: boolean;
  /** 50(4) second sub-paragraph — Deployer generating text published informing public on public-interest matters. */
  paragraph_4_public_interest_text: boolean;
}

export interface Article50Result {
  /** True iff ANY of the 5 paragraph triggers fired. */
  applicable: boolean;
  triggered_by: Article50TriggeredBy;
  /**
   * Verbatim EUR-Lex EN chapeau text(s) for the fired paragraph(s),
   * concatenated in paragraph order: 50(1) → 50(2) → 50(3) → 50(4)a → 50(4)b,
   * each ending with its citation marker e.g. "(Art 50(1))", separated by a
   * single space. If applicable === false, the 50(1) chapeau text is
   * returned alone (so consultants can still read what Article 50 would
   * require when applicable). Concatenates 50(5) format-and-timing chapeau
   * as a trailing sentence IFF applicable === true.
   */
  summary_en: string;
  /** Verbatim DE; same concatenation rule. */
  summary_de: string;
  /** EUR-Lex citation URL (Tier-1 canonical). */
  source: string;
}

// ---------------------------------------------------------------------------
// Static metadata (verbatim EUR-Lex citation)
// ---------------------------------------------------------------------------

const EUR_LEX_SOURCE =
  'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689';

// Per-paragraph EN chapeau quotes — verbatim EUR-Lex EN. Statutory carve-outs
// enumerated in full (anti-hand-wave per regulator-validator Day-3 lesson 5).
const CHAPEAU_EN: Record<keyof Article50TriggeredBy | '5', string> = {
  paragraph_1_interaction:
    'Providers shall ensure that AI systems intended to interact directly with natural persons are designed and developed in such a way that the natural persons concerned are informed that they are interacting with an AI system, unless this is obvious from the point of view of a natural person who is reasonably well-informed, observant and circumspect, taking into account the circumstances and the context of use. This obligation shall not apply to AI systems authorised by law to detect, prevent, investigate or prosecute criminal offences, subject to appropriate safeguards for the rights and freedoms of third parties, unless those systems are available for the public to report a criminal offence. (Art 50(1))',
  paragraph_2_synthetic_content:
    'Providers of AI systems, including general-purpose AI systems, generating synthetic audio, image, video or text content, shall ensure that the outputs of the AI system are marked in a machine-readable format and detectable as artificially generated or manipulated. Providers shall ensure their technical solutions are effective, interoperable, robust and reliable as far as this is technically feasible, taking into account the specificities and limitations of various types of content, the costs of implementation and the generally acknowledged state of the art, as may be reflected in relevant technical standards. This obligation shall not apply to the extent the AI systems perform an assistive function for standard editing or do not substantially alter the input data provided by the deployer or the semantics thereof, or where authorised by law to detect, prevent, investigate or prosecute criminal offences. (Art 50(2))',
  paragraph_3_emotion_or_biometric_categorisation:
    'Deployers of an emotion recognition system or a biometric categorisation system shall inform the natural persons exposed thereto of the operation of the system, and shall process the personal data in accordance with Regulations (EU) 2016/679 and (EU) 2018/1725 and Directive (EU) 2016/680, as applicable. This obligation shall not apply to AI systems used for biometric categorisation and emotion recognition, which are permitted by law to detect, prevent or investigate criminal offences, subject to appropriate safeguards for the rights and freedoms of third parties, and in accordance with Union law. (Art 50(3))',
  paragraph_4_deepfake:
    'Deployers of an AI system that generates or manipulates image, audio or video content constituting a deep fake, shall disclose that the content has been artificially generated or manipulated. This obligation shall not apply where the use is authorised by law to detect, prevent, investigate or prosecute criminal offence. Where the content forms part of an evidently artistic, creative, satirical, fictional or analogous work or programme, the transparency obligations set out in this paragraph are limited to disclosure of the existence of such generated or manipulated content in an appropriate manner that does not hamper the display or enjoyment of the work. (Art 50(4) sub-paragraph 1)',
  paragraph_4_public_interest_text:
    'Deployers of an AI system that generates or manipulates text which is published with the purpose of informing the public on matters of public interest shall disclose that the text has been artificially generated or manipulated. This obligation shall not apply where the use is authorised by law to detect, prevent, investigate or prosecute criminal offences or where the AI-generated content has undergone a process of human review or editorial control and where a natural or legal person holds editorial responsibility for the publication of the content. (Art 50(4) sub-paragraph 2)',
  '5':
    'The information referred to in paragraphs 1 to 4 shall be provided to the natural persons concerned in a clear and distinguishable manner at the latest at the time of the first interaction or exposure. The information shall conform to the applicable accessibility requirements. (Art 50(5))',
};

// Per-paragraph DE chapeau quotes — verbatim Tier-1 EUR-Lex DE PDF (page 82-83).
// Earlier draft shipped Tier-3 mirror paraphrase; Day-5 fix-up replaced with
// Tier-1 verbatim after regulator-validator re-fetched the Tier-1 DE PDF
// successfully. Most notable correction: 50(2) DE now includes the second
// sentence on technical effectiveness that the Tier-3 paraphrase had dropped.
const CHAPEAU_DE: Record<keyof Article50TriggeredBy | '5', string> = {
  paragraph_1_interaction:
    'Die Anbieter stellen sicher, dass KI-Systeme, die für die direkte Interaktion mit natürlichen Personen bestimmt sind, so konzipiert und entwickelt werden, dass die betreffenden natürlichen Personen informiert werden, dass sie mit einem KI-System interagieren, es sei denn, dies ist aus Sicht einer angemessen informierten, aufmerksamen und verständigen natürlichen Person aufgrund der Umstände und des Kontexts der Nutzung offensichtlich. Diese Pflicht gilt nicht für gesetzlich zur Aufdeckung, Verhütung, Ermittlung oder Verfolgung von Straftaten zugelassene KI-Systeme, wenn geeignete Schutzvorkehrungen für die Rechte und Freiheiten Dritter bestehen, es sei denn, diese Systeme stehen der Öffentlichkeit zur Anzeige einer Straftat zur Verfügung. (Art. 50 Abs. 1)',
  paragraph_2_synthetic_content:
    'Anbieter von KI-Systemen, einschließlich KI-Systemen mit allgemeinem Verwendungszweck, die synthetische Audio-, Bild-, Video- oder Textinhalte erzeugen, stellen sicher, dass die Ausgaben des KI-Systems in einem maschinenlesbaren Format gekennzeichnet und als künstlich erzeugt oder manipuliert erkennbar sind. Die Anbieter sorgen dafür, dass — soweit technisch möglich — ihre technischen Lösungen wirksam, interoperabel, belastbar und zuverlässig sind und berücksichtigen dabei die Besonderheiten und Beschränkungen der verschiedenen Arten von Inhalten, die Umsetzungskosten und den allgemein anerkannten Stand der Technik, wie er in den einschlägigen technischen Normen zum Ausdruck kommen kann. Diese Pflicht gilt nicht, soweit die KI-Systeme eine unterstützende Funktion für die Standardbearbeitung ausführen oder die vom Betreiber bereitgestellten Eingabedaten oder deren Semantik nicht wesentlich verändern oder wenn sie zur Aufdeckung, Verhütung, Ermittlung oder Verfolgung von Straftaten gesetzlich zugelassen sind. (Art. 50 Abs. 2)',
  paragraph_3_emotion_or_biometric_categorisation:
    'Die Betreiber eines Emotionserkennungssystems oder eines Systems zur biometrischen Kategorisierung informieren die davon betroffenen natürlichen Personen über den Betrieb des Systems und verarbeiten personenbezogene Daten gemäß den Verordnungen (EU) 2016/679 und (EU) 2018/1725 und der Richtlinie (EU) 2016/680. Diese Pflicht gilt nicht für gesetzlich zur Aufdeckung, Verhütung oder Ermittlung von Straftaten zugelassene KI-Systeme, die zur biometrischen Kategorisierung und Emotionserkennung im Einklang mit dem Unionsrecht verwendet werden, sofern geeignete Schutzvorkehrungen für die Rechte und Freiheiten Dritter bestehen. (Art. 50 Abs. 3)',
  paragraph_4_deepfake:
    'Betreiber eines KI-Systems, das Bild-, Ton- oder Videoinhalte erzeugt oder manipuliert, die ein Deepfake sind, müssen offenlegen, dass die Inhalte künstlich erzeugt oder manipuliert wurden. Diese Pflicht gilt nicht, wenn die Verwendung zur Aufdeckung, Verhütung, Ermittlung oder Verfolgung von Straftaten gesetzlich zugelassen ist. Ist der Inhalt Teil eines offensichtlich künstlerischen, kreativen, satirischen, fiktionalen oder analogen Werks oder Programms, so beschränken sich die in diesem Absatz festgelegten Transparenzpflichten darauf, das Vorhandensein solcher künstlich erzeugten oder manipulierten Inhalte in geeigneter Weise offenzulegen, die die Darstellung oder den Genuss des Werks nicht beeinträchtigt. (Art. 50 Abs. 4 Unterabsatz 1)',
  paragraph_4_public_interest_text:
    'Betreiber eines KI-Systems, das Text erzeugt oder manipuliert, der veröffentlicht wird, um die Öffentlichkeit über Angelegenheiten von öffentlichem Interesse zu informieren, müssen offenlegen, dass der Text künstlich erzeugt oder manipuliert wurde. Diese Pflicht gilt nicht, wenn die Verwendung zur Aufdeckung, Verhütung, Ermittlung oder Verfolgung von Straftaten gesetzlich zugelassen ist oder wenn die durch KI erzeugten Inhalte einem Verfahren der menschlichen Überprüfung oder redaktionellen Kontrolle unterzogen wurden und wenn eine natürliche oder juristische Person die redaktionelle Verantwortung für die Veröffentlichung der Inhalte trägt. (Art. 50 Abs. 4 Unterabsatz 2)',
  '5':
    'Die in den Absätzen 1 bis 4 genannten Informationen werden den betreffenden natürlichen Personen spätestens zum Zeitpunkt der ersten Interaktion oder Aussetzung in klarer und eindeutiger Weise bereitgestellt. Die Informationen müssen den geltenden Barrierefreiheitsanforderungen entsprechen. (Art. 50 Abs. 5)',
};

// ---------------------------------------------------------------------------
// Lexicon → paragraph mapping (consumes Day-2 lexicon `article_50_gpai` group)
// ---------------------------------------------------------------------------
//
// Day-2 extractor already curates the AI-Act-50-relevant phrases under the
// `article_50_gpai` lexicon group at `src/data/patterns.{en,de}.json`. We
// project the lexicon match into paragraph applicability via the static map
// below. Day-5 extends the group with the new `5_public_interest_text`
// category (see CHANGELOG); the 4 prior categories (1_interaction_disclosure,
// 2_synthetic_content_marking, 3_emotion_categorisation_disclosure,
// 4_deepfake_labeling) are unchanged.
//
// Why consume the lexicon instead of inlining patterns: keeps phrase curation
// (and EN+DE coverage) in ONE place. The lexicon is what regulator-validator
// reviews; ad-hoc inline patterns would split the source-of-truth and create
// drift between phrase coverage and module behavior. Day-3 design choice.

const LEXICON_GROUP = 'article_50_gpai';

type Article50Category =
  | '1_interaction_disclosure'
  | '2_synthetic_content_marking'
  | '3_emotion_categorisation_disclosure'
  | '4_deepfake_labeling'
  | '5_public_interest_text';

const CATEGORY_TO_PARAGRAPH: Record<Article50Category, keyof Article50TriggeredBy> = {
  '1_interaction_disclosure': 'paragraph_1_interaction',
  '2_synthetic_content_marking': 'paragraph_2_synthetic_content',
  '3_emotion_categorisation_disclosure': 'paragraph_3_emotion_or_biometric_categorisation',
  '4_deepfake_labeling': 'paragraph_4_deepfake',
  '5_public_interest_text': 'paragraph_4_public_interest_text',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify the input against Article 50 (transparency obligations for
 * chatbots, GPAI synthetic content, emotion recognition / biometric
 * categorisation, deep fakes, public-interest text).
 *
 * Workflow:
 *   1. Type-guard inputs (friendly TypeError if upstream contract violated).
 *   2. For each of the 5 Article-50 paragraph paths, check whether the Day-2
 *      lexicon's `article_50_gpai.<category>` matched in the extracted
 *      features.
 *   3. Paragraph 50(3) also fires via the optional `annex` fallback when
 *      Annex III paragraph 1 (biometrics) was matched with sub-letter `b`
 *      (biometric categorisation by sensitive attributes) or sub-letter `c`
 *      (emotion recognition) — useful when the user describes the system in
 *      Annex-III-style language without using GPAI-side phrases. Pass
 *      `annex: null` to disable the fallback.
 *   4. `applicable === true` iff ANY of the 5 paragraphs is true.
 *   5. `summary_en` / `summary_de` concatenate the verbatim chapeau text(s)
 *      for the fired paragraphs in paragraph order. If no paragraph fires,
 *      the 50(1) chapeau is returned alone. If at least one fires, the 50(5)
 *      format-and-timing chapeau is appended as a trailing sentence.
 *
 * Article 5 is taken as a sanity input only — current logic does not branch
 * on it. Rationale: Article 50 obligations are scoped by SYSTEM FUNCTION
 * (interaction with persons, synthetic content, etc.), not by Annex III
 * high-risk classification or Article 5 prohibition status. Art 5 and Art 50
 * operate at different lifecycle stages — Art 5 prohibits market placement,
 * Art 50 applies to on-market systems with specific functions. Art 50(6)
 * further clarifies that Art 50 does not affect Chapter III requirements and
 * is without prejudice to OTHER transparency obligations in Union or national
 * law (Art 13, GDPR, etc.). A prohibited system shouldn't be placed on the
 * market in the first place — that's downstream consultant judgment.
 *
 * @param features - Result from `extractFeatures()`. We read `features.byCategory`.
 * @param article5 - Result from `classifyArticle5()`. Sanity input only.
 * @param annex - Optional `AnnexIIIResult`. When provided AND Annex III
 *   paragraph 1 fired with sub-letter `b` or `c`, paragraph_3 also fires
 *   (Annex-III-style description fallback).
 */
export function classifyArticle50(
  features: ExtractedFeatures,
  article5: Article5Result,
  annex: AnnexIIIResult | null = null,
): Article50Result {
  if (
    features === null ||
    typeof features !== 'object' ||
    Array.isArray(features) ||
    typeof (features as ExtractedFeatures).input !== 'string' ||
    (features as ExtractedFeatures).byCategory === null ||
    typeof (features as ExtractedFeatures).byCategory !== 'object' ||
    Array.isArray((features as ExtractedFeatures).byCategory)
  ) {
    throw new TypeError(
      'classifyArticle50(): features must be an ExtractedFeatures object with input:string and byCategory:object (call extractFeatures() first).',
    );
  }
  if (article5 === null || typeof article5 !== 'object' || Array.isArray(article5)) {
    throw new TypeError(
      'classifyArticle50(): article5 must be an Article5Result object (call classifyArticle5() first).',
    );
  }
  if (annex !== null) {
    if (typeof annex !== 'object' || !Array.isArray((annex as AnnexIIIResult).domains)) {
      throw new TypeError(
        'classifyArticle50(): annex must be an AnnexIIIResult object with a domains array or null (call classifyAnnexIII() first, or pass null to disable the fallback).',
      );
    }
  }

  // Suppress unused-warning while preserving public-API stability: Article 5
  // is a sanity input documented above; current logic does not branch on it.
  void article5;

  // Project Day-2 lexicon matches into the 5 paragraph booleans.
  const lex = features.byCategory[LEXICON_GROUP] ?? {};
  const triggers: Article50TriggeredBy = {
    paragraph_1_interaction: false,
    paragraph_2_synthetic_content: false,
    paragraph_3_emotion_or_biometric_categorisation: false,
    paragraph_4_deepfake: false,
    paragraph_4_public_interest_text: false,
  };
  for (const [cat, paragraphKey] of Object.entries(CATEGORY_TO_PARAGRAPH) as ReadonlyArray<
    [Article50Category, keyof Article50TriggeredBy]
  >) {
    const matched = lex[cat];
    if (Array.isArray(matched) && matched.length > 0) {
      triggers[paragraphKey] = true;
    }
  }

  // Annex III fallback for 50(3): biometrics (Annex III.1) with sub-letter
  // `b` (biometric categorisation) or `c` (emotion recognition) is described
  // in Annex-III language and we accept that as a paragraph_3 trigger even
  // when the GPAI-side lexicon doesn't fire.
  if (annex !== null && !triggers.paragraph_3_emotion_or_biometric_categorisation) {
    for (const domain of annex.domains) {
      if (domain.annex_iii_number !== 1) continue;
      if (
        Array.isArray(domain.sub_letters) &&
        (domain.sub_letters.includes('b') || domain.sub_letters.includes('c'))
      ) {
        triggers.paragraph_3_emotion_or_biometric_categorisation = true;
        break;
      }
    }
  }

  const applicable =
    triggers.paragraph_1_interaction ||
    triggers.paragraph_2_synthetic_content ||
    triggers.paragraph_3_emotion_or_biometric_categorisation ||
    triggers.paragraph_4_deepfake ||
    triggers.paragraph_4_public_interest_text;

  // Concatenation in fixed paragraph order: 50(1) → 50(2) → 50(3) → 50(4)a → 50(4)b.
  // If none fired, summary carries 50(1) chapeau alone (consultants still see
  // what Article 50 would require). 50(5) format-and-timing trails when applicable.
  const PARAGRAPH_ORDER: ReadonlyArray<keyof Article50TriggeredBy> = [
    'paragraph_1_interaction',
    'paragraph_2_synthetic_content',
    'paragraph_3_emotion_or_biometric_categorisation',
    'paragraph_4_deepfake',
    'paragraph_4_public_interest_text',
  ];

  const firedEN: string[] = [];
  const firedDE: string[] = [];
  for (const key of PARAGRAPH_ORDER) {
    if (triggers[key]) {
      firedEN.push(CHAPEAU_EN[key]);
      firedDE.push(CHAPEAU_DE[key]);
    }
  }

  let summary_en: string;
  let summary_de: string;
  if (applicable) {
    firedEN.push(CHAPEAU_EN['5']);
    firedDE.push(CHAPEAU_DE['5']);
    summary_en = firedEN.join(' ');
    summary_de = firedDE.join(' ');
  } else {
    // Non-applicable: surface the 50(1) chapeau alone (no 50(5) trailer).
    summary_en = CHAPEAU_EN.paragraph_1_interaction;
    summary_de = CHAPEAU_DE.paragraph_1_interaction;
  }

  return {
    applicable,
    triggered_by: triggers,
    summary_en,
    summary_de,
    source: EUR_LEX_SOURCE,
  };
}
