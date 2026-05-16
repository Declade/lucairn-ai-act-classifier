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

const lexiconHit = {
  type: 'object',
  description:
    'A single matched lexicon entry surfaced during keyword extraction; identifies the article group + category + canonical phrase + position in the input text.',
  additionalProperties: false,
  properties: {
    article: { type: 'string', description: 'EU AI Act article identifier, e.g. "5(1)(d)" or "annex-iii/4".' },
    group: { type: 'string', description: 'Lexicon group name as stored in src/data/patterns.{en,de}.json.' },
    category: { type: 'string', description: 'Sub-category within the group, e.g. "a_subliminal".' },
    phrase: { type: 'string', description: 'Canonical lexicon phrase that matched in the normalised input.' },
    start: { type: 'integer', minimum: 0, description: 'UTF-16 code-unit start offset in the original input.' },
    end: { type: 'integer', minimum: 0, description: 'UTF-16 code-unit end offset in the original input.' },
  },
  required: ['article', 'group', 'category', 'phrase', 'start', 'end'],
};

const extractedFeatures = {
  type: 'object',
  description: 'Output of the keyword extractor (Day 2). Surfaced for debugging and explain-mode rendering.',
  additionalProperties: false,
  properties: {
    input: { type: 'string', description: 'Raw input text passed to classify().' },
    lang: { type: 'string', enum: ['en', 'de'], description: 'Locale used for extraction.' },
    langConfident: { type: 'boolean', description: 'Whether the language detector was confident in the language assignment.' },
    lexiconVersion: { type: 'string', description: 'Lexicon version pin (e.g. "v0.1.1").' },
    hits: { type: 'array', items: lexiconHit, description: 'Lexicon-phrase hits surfaced from the input.' },
    byCategory: {
      type: 'object',
      additionalProperties: { type: 'array', items: { type: 'string' } },
      description: 'Map from "<group>.<category>" to the array of canonical lexicon phrases that fired.',
    },
  },
  required: ['input', 'lang', 'langConfident', 'lexiconVersion', 'hits', 'byCategory'],
};

const article5Hit = {
  type: 'object',
  description: 'A single Article 5 paragraph that fired for the input.',
  additionalProperties: false,
  properties: {
    letter: {
      type: 'string',
      enum: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
      description: 'Sub-letter of Article 5(1). See Regulation (EU) 2024/1689 Art. 5(1)(a-i).',
    },
    title: { type: 'string', description: 'Human-readable label for the prohibited practice.' },
    triggered_by: {
      type: 'array',
      items: { type: 'string' },
      description: 'Lexicon phrases that triggered the rule.',
    },
    disambiguator_state: {
      type: 'string',
      enum: ['present', 'absent', 'not_applicable'],
      description: 'For Art 5(1)(d): whether the "solely on profiling" disambiguator was present in the input.',
    },
  },
  required: ['letter', 'title', 'triggered_by'],
};

const article5Result = {
  type: 'object',
  description:
    'Article 5 prohibited-practice check. Per Regulation (EU) 2024/1689 Art. 5(1), these uses are categorically prohibited from 2025-02-02.',
  additionalProperties: false,
  properties: {
    prohibited: { type: 'boolean', description: 'True if at least one Article 5(1) letter fired.' },
    hits: { type: 'array', items: article5Hit, description: 'Per-letter prohibition hits.' },
  },
  required: ['prohibited', 'hits'],
};

const annexIIIDomainHit = {
  type: 'object',
  description:
    'A single Annex III high-risk domain that fired for the input. Per Regulation (EU) 2024/1689 Annex III, points 1–8.',
  additionalProperties: false,
  properties: {
    annex_iii_number: { type: 'integer', minimum: 1, maximum: 8, description: 'Annex III paragraph number 1–8.' },
    title: { type: 'string', description: 'Verbatim Annex III paragraph title from EUR-Lex.' },
    sub_letters: {
      type: 'array',
      items: { type: 'string' },
      description: 'Narrowed sub-letters within the paragraph, e.g. ["a", "c"] for Annex III ¶4(a)+(c).',
    },
    triggered_by: { type: 'array', items: { type: 'string' }, description: 'Lexicon phrases that triggered the rule.' },
  },
  required: ['annex_iii_number', 'title', 'sub_letters', 'triggered_by'],
};

const annexIIIResult = {
  type: 'object',
  description:
    'Article 6 + Annex III high-risk classification. A use case becomes high-risk under Article 6(2) when it falls into one of the Annex III domains, unless suppressed by Article 5 (prohibited).',
  additionalProperties: false,
  properties: {
    high_risk: { type: 'boolean', description: 'True if any Annex III domain fired and Article 5 did not suppress.' },
    suppressed_by_article_5: { type: 'boolean', description: 'True when Article 5 prohibition suppresses the high-risk classification.' },
    domains: { type: 'array', items: annexIIIDomainHit, description: 'Annex III domains that fired.' },
  },
  required: ['high_risk', 'suppressed_by_article_5', 'domains'],
};

const articleCascadeResult = {
  type: 'object',
  description:
    'Article cascade module result (Articles 10/12/13/14/15). Each module projects the high-risk classification into per-article applicability.',
  additionalProperties: false,
  properties: {
    applicable: { type: 'boolean', description: 'True when the article applies to this use case.' },
    triggered_by: {
      type: 'array',
      items: { type: 'string' },
      description: 'Stable trigger codes describing why the article applies (e.g. "annex_iii", "suppressed_by_article_5").',
    },
    rationale: { type: 'string', description: 'Plain-language rationale string for explain-mode rendering.' },
  },
  required: ['applicable', 'triggered_by', 'rationale'],
};

const article50Result = {
  type: 'object',
  description:
    'Article 50 transparency obligations (GPAI + deployer). Independent root — Annex III high-risk does NOT imply Article 50 applies, and vice versa.',
  additionalProperties: false,
  properties: {
    applicable: { type: 'boolean', description: 'True if any Article 50 paragraph fired.' },
    paragraphs: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific Article 50 paragraphs that fired, e.g. ["50(1)", "50(4)_sub1"].',
    },
    triggered_by: { type: 'array', items: { type: 'string' }, description: 'Lexicon phrases that triggered the rule.' },
  },
  required: ['applicable', 'paragraphs', 'triggered_by'],
};

const threeCategoryResult = {
  oneOf: [
    {
      type: 'object',
      description:
        'Lucairn three-category obligation overlay (Cat 1 sanitizer, Cat 2 evidence, Cat 3 inventory). The categories partition the high-risk obligation surface into operational groupings.',
      additionalProperties: false,
      properties: {
        applicable_categories: {
          type: 'array',
          items: { type: 'integer', minimum: 1, maximum: 3 },
          description: 'Which Lucairn categories apply, e.g. [1, 2, 3].',
        },
        category_1: { type: 'object', additionalProperties: true },
        category_2: { type: 'object', additionalProperties: true },
        category_3: { type: 'object', additionalProperties: true },
      },
      required: ['applicable_categories'],
    },
    { type: 'null', description: 'Returned when classify() was called with opts.threeCategory === false.' },
  ],
};

// ---------------------------------------------------------------------------
// Top-level ClassifyResult schema
// ---------------------------------------------------------------------------

const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
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
    rules_version: { type: 'string', description: 'Loaded rules-version pin with v-prefix, e.g. "v0.1.1".' },
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
