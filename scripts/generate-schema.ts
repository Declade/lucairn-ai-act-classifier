// generate-schema.ts — Day-13 JSON Schema generator for `ClassifyResult`.
//
// Emits a JSON Schema draft-07 description of the public `ClassifyResult`
// type at `dist/classify-result.schema.json`. The schema is informational —
// it is NOT used at runtime to validate inputs or outputs. Its purpose is to
// give programmatic consumers (CI scripts, Python clients, etc.) a stable
// machine-readable description of what `classify()` returns.
//
// Design notes:
//   1. **Hand-curated, not auto-generated.** Auto-generators (e.g.
//      ts-json-schema-generator) trip on the conditional `mode` template-literal
//      type and on the `null` union in `three_category`. Hand-curation also
//      lets us write `description` strings that cite EUR-Lex articles, which
//      is the part of the schema actual consumers care about. The maintenance
//      cost is low: this file only changes when the `ClassifyResult` public
//      shape changes, which is a stable v0.1.x API.
//   2. **draft-07 not 2020-12.** Wider tool support (Ajv defaults to draft-07;
//      many language-specific generators target it).
//   3. **No `$ref` reuse for the article cascade types** — keeping the schema
//      flat trades verbosity for readability. The schema is informational.
//   4. **Read once, write once.** Synchronous; no async; deterministic; pure
//      output. Re-runs produce byte-identical output.
//   5. **Version pinning.** The schema's `$id` includes the package version so
//      consumers can detect schema drift across `@lucairn/ai-act-classifier`
//      versions.
//   6. **Day-13 fix-up note (B1 closure).** The previous schema version was
//      empirically broken: an Ajv-validated `classify()` output produced 382
//      errors. The shapes below have been corrected to match the actual public
//      output of `classify()` as of v0.1.2, sub-shape by sub-shape:
//        - `features.byCategory` is a 2-level nested object
//          (`Record<group, Record<category, phrase[]>>`).
//        - `features.hits[]` entries carry `{group, category, phrase, source}`
//          only — no `article`, no `start`, no `end`.
//        - `article_5.hits[]` entries carry `{letter, category_key,
//          matched_phrases, summary_en, summary_de, source}` and the result
//          carries optional `reasoning: string[]`.
//        - `annex_iii` carries `{high_risk, domains, reasoning,
//          suppressed_by_article_5}`; each domain has
//          `{annex_iii_number, key, sub_letters, matched_phrases, title_en,
//          title_de, source}`.
//        - Articles 10/12/13/14/15 each return
//          `{applicable, triggered_by: {article_5, annex_iii_domains}, summary_en,
//          summary_de, source}`. No `rationale`.
//        - Article 50 returns `{applicable, triggered_by (5 booleans),
//          summary_en, summary_de, source}`. No `paragraphs` field.
//        - `three_category` is either `null` or
//          `{categories: {'1', '2', '3'}, applicable_categories: ('1'|'2'|'3')[],
//          disclaimer_en, disclaimer_de, source}`. Each category aggregate
//          carries `{key, applicable, triggered_articles, required_articles,
//          title_en, title_de, items}`. `applicable_categories` items are
//          strings, NOT integers.
//      The Ajv-validation test in `test/scripts/generate-schema.spec.ts` is
//      the load-bearing invariant lock — it asserts the schema accepts real
//      `classify()` output across multiple input fixtures.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json');
const SCHEMA_OUTPUT_PATH = join(REPO_ROOT, 'dist', 'classify-result.schema.json');

interface PackageJson {
  readonly name: string;
  readonly version: string;
}

const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as PackageJson;

// ---------------------------------------------------------------------------
// Reusable sub-schemas
// ---------------------------------------------------------------------------

// Real lexicon hit shape (from src/extract/keyword.ts::ExtractedHit) is just
// {group, category, phrase, source} — no article identifier, no offsets.
const lexiconHit = {
  type: 'object',
  description:
    'A single matched lexicon entry surfaced during keyword extraction. Carries the lexicon group (e.g. "annex_iii"), the sub-category key (e.g. "4_employment"), the canonical phrase that matched, and the regulator source URL the category cites.',
  additionalProperties: false,
  properties: {
    group: {
      type: 'string',
      description:
        'Lexicon group: "annex_iii", "article_5_prohibited", "article_50_gpai", "scope_qualifiers", or a future v0.2+ addition.',
    },
    category: { type: 'string', description: 'Sub-category within the group, e.g. "4_employment", "c_social_scoring".' },
    phrase: { type: 'string', description: 'Canonical lexicon phrase that matched in the normalised input.' },
    source: { type: 'string', description: 'Regulator-source URL the category cites (typically EUR-Lex).' },
  },
  required: ['group', 'category', 'phrase', 'source'],
};

const extractedFeatures = {
  type: 'object',
  description: 'Output of the keyword extractor. Surfaced for debugging and explain-mode rendering.',
  additionalProperties: false,
  properties: {
    input: { type: 'string', description: 'Raw input text passed to classify().' },
    lang: { type: 'string', enum: ['en', 'de'], description: 'Locale used for extraction.' },
    langConfident: { type: 'boolean', description: 'Whether the language detector was confident in the language assignment.' },
    lexiconVersion: { type: 'string', description: 'Lexicon version pin (e.g. "v0.1.2").' },
    hits: { type: 'array', items: lexiconHit, description: 'Lexicon-phrase hits surfaced from the input.' },
    byCategory: {
      type: 'object',
      // 2-level nested: Record<group, Record<category, phrase[]>>. The outer
      // keys are lexicon groups ("annex_iii", "article_5_prohibited", ...);
      // each value is a map from sub-category key to the array of canonical
      // phrases that fired.
      additionalProperties: {
        type: 'object',
        additionalProperties: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      description: 'Map from lexicon group → sub-category → matched canonical phrases. 2-level nested object.',
    },
  },
  required: ['input', 'lang', 'langConfident', 'lexiconVersion', 'hits', 'byCategory'],
};

// Real Article5Hit shape from src/rules/article-5.ts.
const article5Hit = {
  type: 'object',
  description: 'A single Article 5(1) sub-letter that fired for the input.',
  additionalProperties: false,
  properties: {
    letter: {
      type: 'string',
      enum: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      description: 'Sub-letter of Article 5(1). See Regulation (EU) 2024/1689 Art. 5(1)(a-h).',
    },
    category_key: {
      type: 'string',
      description: 'Lexicon category key (e.g. "c_social_scoring", "d_predictive_policing").',
    },
    matched_phrases: {
      type: 'array',
      items: { type: 'string' },
      description: 'Raw phrases from the input (verbatim from the lexicon) that triggered this hit.',
    },
    summary_en: { type: 'string', description: 'Short EN summary of the prohibition (paraphrased from EUR-Lex).' },
    summary_de: { type: 'string', description: 'Short DE summary of the prohibition (paraphrased from EUR-Lex).' },
    source: { type: 'string', description: 'EUR-Lex citation URL.' },
  },
  required: ['letter', 'category_key', 'matched_phrases', 'summary_en', 'summary_de', 'source'],
};

const article5Result = {
  type: 'object',
  description:
    'Article 5 prohibited-practice check. Per Regulation (EU) 2024/1689 Art. 5(1), these uses are categorically prohibited from 2025-02-02.',
  additionalProperties: false,
  properties: {
    prohibited: { type: 'boolean', description: 'True if at least one Article 5(1) letter fired.' },
    hits: { type: 'array', items: article5Hit, description: 'Per-letter prohibition hits, sorted by letter.' },
    reasoning: {
      type: 'array',
      items: { type: 'string' },
      description: 'Human-readable reasoning steps for transparency / --explain output.',
    },
  },
  required: ['prohibited', 'hits', 'reasoning'],
};

// Real AnnexIIIDomainHit shape from src/rules/article-6-annex-iii.ts.
const annexIIIDomainHit = {
  type: 'object',
  description:
    'A single Annex III high-risk domain that fired for the input. Per Regulation (EU) 2024/1689 Annex III, points 1–8.',
  additionalProperties: false,
  properties: {
    annex_iii_number: { type: 'integer', minimum: 1, maximum: 8, description: 'Annex III paragraph number 1–8.' },
    key: { type: 'string', description: 'Domain key from annex-iii.json (e.g. "employment", "law_enforcement").' },
    sub_letters: {
      type: 'array',
      items: { type: 'string' },
      description: 'Narrowed sub-letters within the paragraph, e.g. ["a", "c"] for Annex III ¶4(a)+(c). Empty array when the lexicon hit is too general to disambiguate.',
    },
    matched_phrases: {
      type: 'array',
      items: { type: 'string' },
      description: 'Phrases from the input that triggered this domain.',
    },
    title_en: { type: 'string', description: 'Verbatim Annex III paragraph title (EN).' },
    title_de: { type: 'string', description: 'Verbatim Annex III paragraph title (DE).' },
    source: { type: 'string', description: 'Citation source for the domain (EUR-Lex Annex III paragraph reference).' },
  },
  required: [
    'annex_iii_number',
    'key',
    'sub_letters',
    'matched_phrases',
    'title_en',
    'title_de',
    'source',
  ],
};

const annexIIIResult = {
  type: 'object',
  description:
    'Article 6 + Annex III high-risk classification. A use case becomes high-risk under Article 6(2) when it falls into one of the Annex III domains, unless suppressed by Article 5 (prohibited).',
  additionalProperties: false,
  properties: {
    high_risk: { type: 'boolean', description: 'True if any Annex III domain fired and Article 5 did not suppress.' },
    suppressed_by_article_5: { type: 'boolean', description: 'True when Article 5 prohibition suppresses the high-risk classification.' },
    domains: { type: 'array', items: annexIIIDomainHit, description: 'Annex III domains that fired, sorted by paragraph number.' },
    reasoning: {
      type: 'array',
      items: { type: 'string' },
      description: 'Human-readable reasoning steps for transparency / --explain output.',
    },
  },
  required: ['high_risk', 'suppressed_by_article_5', 'domains', 'reasoning'],
};

// Real cascade shape from src/rules/article-10.ts (and identical structure in
// 12/13/14/15). The `triggered_by` is an OBJECT not a string array.
const articleCascadeResult = {
  type: 'object',
  description:
    'Article cascade module result (Articles 10/12/13/14/15). Each module projects the high-risk classification into per-article applicability and carries the verbatim EUR-Lex chapeau as a summary.',
  additionalProperties: false,
  properties: {
    applicable: { type: 'boolean', description: 'True when the article applies to this use case.' },
    triggered_by: {
      type: 'object',
      additionalProperties: false,
      description: 'Trace of WHY the article was (or was not) triggered.',
      properties: {
        article_5: {
          type: 'boolean',
          description: 'Mirror of annex_iii.suppressed_by_article_5 — true iff an Article 5 prohibition fired.',
        },
        annex_iii_domains: {
          type: 'array',
          items: { type: 'integer', minimum: 1, maximum: 8 },
          description: 'Annex III paragraph numbers that fired (empty when not high-risk). Sorted ascending.',
        },
      },
      required: ['article_5', 'annex_iii_domains'],
    },
    summary_en: { type: 'string', description: 'Verbatim EUR-Lex EN chapeau text for the article.' },
    summary_de: { type: 'string', description: 'Verbatim EUR-Lex DE chapeau text for the article.' },
    source: { type: 'string', description: 'EUR-Lex citation URL.' },
  },
  required: ['applicable', 'triggered_by', 'summary_en', 'summary_de', 'source'],
};

// Real Article50Result shape from src/rules/article-50.ts. NO `paragraphs`
// field — `triggered_by` is an OBJECT with 5 boolean trigger flags.
const article50Result = {
  type: 'object',
  description:
    'Article 50 transparency obligations (GPAI + deployer). Independent root — Annex III high-risk does NOT imply Article 50 applies, and vice versa.',
  additionalProperties: false,
  properties: {
    applicable: { type: 'boolean', description: 'True iff any of the 5 paragraph triggers fired.' },
    triggered_by: {
      type: 'object',
      additionalProperties: false,
      description: 'Per-paragraph trigger flags.',
      properties: {
        paragraph_1_interaction: {
          type: 'boolean',
          description: 'Art 50(1) — AI system intended to interact directly with natural persons.',
        },
        paragraph_2_synthetic_content: {
          type: 'boolean',
          description: 'Art 50(2) — Provider of GPAI / generative AI producing synthetic audio/image/video/text.',
        },
        paragraph_3_emotion_or_biometric_categorisation: {
          type: 'boolean',
          description: 'Art 50(3) — Deployer of emotion-recognition or biometric-categorisation system.',
        },
        paragraph_4_deepfake: {
          type: 'boolean',
          description: 'Art 50(4) first sub-paragraph — Deployer generating/manipulating image/audio/video deep fake.',
        },
        paragraph_4_public_interest_text: {
          type: 'boolean',
          description: 'Art 50(4) second sub-paragraph — Deployer generating text published to inform the public on matters of public interest.',
        },
      },
      required: [
        'paragraph_1_interaction',
        'paragraph_2_synthetic_content',
        'paragraph_3_emotion_or_biometric_categorisation',
        'paragraph_4_deepfake',
        'paragraph_4_public_interest_text',
      ],
    },
    summary_en: {
      type: 'string',
      description:
        'Verbatim EUR-Lex EN chapeau text for the fired paragraph(s), concatenated in paragraph order. When applicable === false, the 50(1) chapeau is returned alone.',
    },
    summary_de: { type: 'string', description: 'Verbatim DE; same concatenation rule.' },
    source: { type: 'string', description: 'EUR-Lex citation URL (Tier-1 canonical).' },
  },
  required: ['applicable', 'triggered_by', 'summary_en', 'summary_de', 'source'],
};

const article4Result = {
  type: 'object',
  description:
    'Article 4 AI literacy obligation (non-cascade root). Horizontal duty on every provider and deployer of an AI system, regardless of risk category. Single paragraph; no sub-letters.',
  additionalProperties: false,
  properties: {
    applicable: {
      type: 'boolean',
      description:
        'True iff the lexicon `article_4_ai_literacy.provider_or_deployer_with_staff` matched.',
    },
    triggered_by: {
      type: 'object',
      additionalProperties: false,
      description: 'Single-trigger flag.',
      properties: {
        provider_or_deployer_with_staff: {
          type: 'boolean',
          description:
            'Whether the composite provider-or-deployer + staff/operator phrase fired.',
        },
      },
      required: ['provider_or_deployer_with_staff'],
    },
    summary_en: {
      type: 'string',
      description:
        'Verbatim Tier-1 EN chapeau for Article 4 with citation marker (Art 4). Always surfaced (applicable or not).',
    },
    summary_de: {
      type: 'string',
      description: 'Verbatim Tier-1 DE chapeau for Artikel 4 with citation marker (Art. 4). Always surfaced.',
    },
    source: { type: 'string', description: 'EUR-Lex citation URL (Tier-1 canonical).' },
  },
  required: ['applicable', 'triggered_by', 'summary_en', 'summary_de', 'source'],
};

const gpaiResult = {
  type: 'object',
  description:
    'Articles 53 + 55 GPAI provider obligations (non-cascade root). Article 53 fires on a named foundation model OR generic foundation-model phrasing. Article 55 fires iff Article 53 fired AND systemic-risk markers are detected (overlay).',
  additionalProperties: false,
  properties: {
    article_53_applicable: {
      type: 'boolean',
      description:
        'True iff named foundation model OR generic foundation-model phrasing matched.',
    },
    article_55_applicable: {
      type: 'boolean',
      description:
        'True iff article_53_applicable AND systemic-risk markers matched.',
    },
    triggered_by: {
      type: 'object',
      additionalProperties: false,
      description: 'Per-sub-category trigger flags from the gpai_models lexicon group.',
      properties: {
        named_foundation_model: {
          type: 'boolean',
          description:
            'Whether `gpai_models.named_foundation_models` matched (closed list of GPAI model names).',
        },
        generic_foundation_model_phrasing: {
          type: 'boolean',
          description:
            'Whether `gpai_models.generic_foundation_model_phrasing` matched (e.g. "foundation model", "large language model").',
        },
        systemic_risk_markers: {
          type: 'boolean',
          description:
            'Whether `gpai_models.systemic_risk_markers` matched (e.g. "10^25 FLOP", "systemic risk").',
        },
      },
      required: ['named_foundation_model', 'generic_foundation_model_phrasing', 'systemic_risk_markers'],
    },
    summary_en: {
      type: 'string',
      description:
        'Verbatim Tier-1 EN chapeau for Art 53(1) (always present). Art 55(1) chapeau appended iff article_55_applicable.',
    },
    summary_de: {
      type: 'string',
      description: 'Verbatim Tier-1 DE chapeau; same surfacing rule.',
    },
    source: { type: 'string', description: 'EUR-Lex citation URL (Tier-1 canonical).' },
  },
  required: [
    'article_53_applicable',
    'article_55_applicable',
    'triggered_by',
    'summary_en',
    'summary_de',
    'source',
  ],
};

const threeCategoryItem = {
  type: 'object',
  description: 'One item in a Lucairn three-category checklist.',
  additionalProperties: false,
  properties: {
    number: { type: 'integer', minimum: 1, description: 'Item ordinal within the category.' },
    text_en: { type: 'string', description: 'EN item text.' },
    text_de: { type: 'string', description: 'DE item text.' },
  },
  required: ['number', 'text_en', 'text_de'],
};

const threeCategoryAggregate = {
  type: 'object',
  description:
    'One Lucairn category aggregate (Cat 1 sanitizer Art 10+15, Cat 2 evidence Art 12+14, Cat 3 inventory Art 10+12+14+15). The three-category scheme is a locked Lucairn opinion (see project README + EUR-Lex citations on each per-Article module).',
  additionalProperties: false,
  properties: {
    key: { type: 'string', enum: ['1', '2', '3'], description: 'Category key.' },
    applicable: { type: 'boolean', description: 'True iff all required_articles for this category are applicable.' },
    triggered_articles: {
      type: 'array',
      items: { type: 'integer' },
      description: 'Intersection of required_articles with currently-applicable. Sorted ascending.',
    },
    required_articles: {
      type: 'array',
      items: { type: 'integer' },
      description: 'Articles required for this category to be applicable. Locked per the three-category scheme. Sorted ascending.',
    },
    title_en: { type: 'string', description: 'EN category title.' },
    title_de: { type: 'string', description: 'DE category title.' },
    items: { type: 'array', items: threeCategoryItem, description: 'Checklist items for the category.' },
  },
  required: ['key', 'applicable', 'triggered_articles', 'required_articles', 'title_en', 'title_de', 'items'],
};

const threeCategoryResult = {
  oneOf: [
    {
      type: 'object',
      description:
        'Lucairn three-category obligation overlay (Cat 1 sanitizer Art 10+15, Cat 2 evidence Art 12+14, Cat 3 inventory Art 10+12+14+15). The categories partition the high-risk obligation surface into operational groupings.',
      additionalProperties: false,
      properties: {
        categories: {
          type: 'object',
          additionalProperties: false,
          description: 'Aggregate per Lucairn category, keyed by category number.',
          properties: {
            '1': threeCategoryAggregate,
            '2': threeCategoryAggregate,
            '3': threeCategoryAggregate,
          },
          required: ['1', '2', '3'],
        },
        applicable_categories: {
          type: 'array',
          items: { type: 'string', enum: ['1', '2', '3'] },
          description: 'Sorted ascending list of category keys that are applicable. Items are STRING keys, not integers.',
        },
        disclaimer_en: { type: 'string', description: 'EN disclaimer.' },
        disclaimer_de: { type: 'string', description: 'DE disclaimer.' },
        source: {
          type: 'object',
          additionalProperties: false,
          description: 'Provenance: what generated file was loaded and which source-of-truth it was synced from.',
          properties: {
            generated_file: { type: 'string', description: 'Path to the generated artifact loaded at module init.' },
            source_file: { type: 'string', description: 'Path to the website source-of-truth the generator read from.' },
            version: { type: 'string', description: 'Version stamp from the generated JSON.' },
          },
          required: ['generated_file', 'source_file', 'version'],
        },
      },
      required: ['categories', 'applicable_categories', 'disclaimer_en', 'disclaimer_de', 'source'],
    },
    { type: 'null', description: 'Returned when classify() was called with opts.threeCategory === false.' },
  ],
};

// ---------------------------------------------------------------------------
// Top-level ClassifyResult schema
// ---------------------------------------------------------------------------

const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  // $id is a stable versioning marker so consumers can detect schema drift
  // across releases. It is NOT currently a fetchable URL — the schema ships
  // inside the npm tarball at dist/classify-result.schema.json; downstream
  // consumers load it from disk via require/readFileSync, not over HTTPS. A
  // future v0.2 may publish the schema at this URL; until then the path
  // serves only as a unique identifier.
  $id: `https://lucairn.eu/tools/ai-act-classifier/schemas/classify-result-${pkg.version}.json`,
  title: 'ClassifyResult',
  description:
    'Output shape of `classify(text, opts)` from @lucairn/ai-act-classifier. Maps free-text AI-use-case descriptions to applicable EU AI Act articles (Regulation (EU) 2024/1689). Informational tool — not legal advice.',
  type: 'object',
  additionalProperties: false,
  properties: {
    input_text: { type: 'string', description: 'Raw input text passed to classify(), unmodified.' },
    detected_lang: { type: 'string', enum: ['en', 'de'], description: 'Locale used for extraction.' },
    lang_confident: { type: 'boolean', description: 'Whether the language detector was confident.' },
    rules_version: { type: 'string', description: 'Loaded rules-version pin with v-prefix, e.g. "v0.1.2".' },
    rules_hash: { type: 'string', pattern: '^[0-9a-f]{8}$', description: 'First 8 hex chars of rules_hash_full.' },
    rules_hash_full: { type: 'string', pattern: '^[0-9a-f]{64}$', description: 'Full SHA-256 of the rule + lexicon JSON file set.' },
    mode: {
      type: 'string',
      description:
        'Classification mode: "deterministic" or "llm-<provider>". When --llm is set the value is one of "llm-anthropic", "llm-openai", "llm-groq".',
      pattern: '^(deterministic|llm-[a-z]+)$',
    },
    confidence: {
      type: 'number',
      minimum: 0.2,
      maximum: 0.99,
      description: 'v0.1 placeholder confidence in [0.20, 0.99]. Refined in future versions.',
    },
    features: extractedFeatures,
    article_5: article5Result,
    annex_iii: annexIIIResult,
    article_10: articleCascadeResult,
    article_12: articleCascadeResult,
    article_13: articleCascadeResult,
    article_14: articleCascadeResult,
    article_15: articleCascadeResult,
    article_50: article50Result,
    article_4: article4Result,
    gpai: gpaiResult,
    three_category: threeCategoryResult,
    annex_iv_required: {
      type: 'boolean',
      description: 'True iff annex_iii.high_risk && !annex_iii.suppressed_by_article_5. Annex IV technical-documentation file required.',
    },
  },
  required: [
    'input_text',
    'detected_lang',
    'lang_confident',
    'rules_version',
    'rules_hash',
    'rules_hash_full',
    'mode',
    'confidence',
    'features',
    'article_5',
    'annex_iii',
    'article_10',
    'article_12',
    'article_13',
    'article_14',
    'article_15',
    'article_50',
    'article_4',
    'gpai',
    'three_category',
    'annex_iv_required',
  ],
};

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

mkdirSync(dirname(SCHEMA_OUTPUT_PATH), { recursive: true });
// Pretty-print with stable indent for diff-readability + final newline.
writeFileSync(SCHEMA_OUTPUT_PATH, JSON.stringify(schema, null, 2) + '\n', 'utf8');
// eslint-disable-next-line no-console
console.log(`[generate-schema] Wrote ${SCHEMA_OUTPUT_PATH} (${pkg.name}@${pkg.version})`);
