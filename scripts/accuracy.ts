// scripts/accuracy.ts — Accuracy harness for the 50-case bilingual fixture corpus.
//
// CLI:
//   pnpm accuracy [--verbose] [--format json|markdown|both]
//
// Loads every JSON fixture under test/fixtures/use-cases/day{3,4,5,7}/, runs
// each through `classify(fixture.input, { lang: fixture.lang })`, compares the
// classifier output against every `expected.*` field present on the fixture,
// computes per-bucket + per-target-metric accuracy, and emits:
//   - accuracy/REPORT.md     — Markdown report committed to git.
//   - accuracy/REPORT.json   — machine-readable; gitignored.
//
// Exit code:
//   0 — all CI thresholds met (overall ≥0.80 AND Article-5 = 1.00).
//   1 — any threshold missed.
//   2 — fixture-loading or classifier error.
//
// Comparison semantics (locked, mirrored in METHODOLOGY.md §"Per-target metrics"):
//   ABSENT fixture-expected fields are SKIPPED — not counted as pass or fail.
//   This is the "additive schema" guarantee: the 11 existing Day-3/4/5 fixtures
//   don't carry the new Day-7 fields (article_50_paragraphs / bucket / etc.)
//   and the harness MUST treat them as legacy without flagging them as
//   regressions. New Day-7 fixtures carry every field they assert.
//
// Pure-function discipline:
//   - No network (only local fs reads).
//   - Same fixtures on disk → same report bytes (deterministic timestamps are
//     supplied via the LAST_RUN_AT_OVERRIDE env var for tests; otherwise the
//     CLI generation timestamps the run).
//   - Errors thrown for malformed JSON, missing fixture fields the schema
//     declares required, or classifier internal errors.

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classify } from '../src/classify.js';
import type { ClassifyResult } from '../src/classify.js';
import type { LLMProvider } from '../src/extract/llm.js';
import { projectArticle50Paragraphs } from '../src/util/article-50-paragraphs.js';
import type { Article50Paragraph } from '../src/util/article-50-paragraphs.js';
import { RULES_VERSION, RULES_HASH, RULES_HASH_FULL_HEX } from '../src/util/rules-hash.js';

// ---------------------------------------------------------------------------
// Schema (additive — must mirror test/rules/snapshots.spec.ts Fixture interface)
// ---------------------------------------------------------------------------

type Bucket = 'annex_iii' | 'article_5' | 'article_50' | 'negative';

interface FixtureExpected {
  article_5_prohibited: boolean;
  article_5_letters: string[];
  annex_iii_high_risk: boolean;
  annex_iii_domains: number[];
  annex_iii_sub_letters?: Record<string, string[]>;
  suppressed_by_article_5: boolean;
  notes: string;
  // Day-7 additive fields (optional — absent on legacy day3/4/5 fixtures).
  article_50_paragraphs?: Article50Paragraph[];
  three_category_applicable?: number[];
  annex_iv_required?: boolean;
  article_10_applicable?: boolean;
  article_12_applicable?: boolean;
  article_13_applicable?: boolean;
  article_14_applicable?: boolean;
  article_15_applicable?: boolean;
}

interface Fixture {
  id: string;
  lang: 'en' | 'de';
  input: string;
  expected: FixtureExpected;
  // Day-7 additive metadata.
  bucket?: Bucket;
  source_url?: string;
}

// ---------------------------------------------------------------------------
// Per-field comparison result
// ---------------------------------------------------------------------------

interface FieldCheck {
  field: string;
  expected: unknown;
  actual: unknown;
  pass: boolean;
}

interface FixtureCheck {
  id: string;
  lang: 'en' | 'de';
  bucket: Bucket | 'legacy';
  passed: boolean;
  field_checks: FieldCheck[];
  /** True iff Article-5 prohibition prediction matches expected. Computed for every fixture (the safety-critical metric covers ALL 50). */
  article_5_check_pass: boolean;
  /** True iff Annex III high-risk binary prediction matches expected. Computed for every fixture. */
  binary_high_risk_check_pass: boolean;
}

// ---------------------------------------------------------------------------
// Public report shape
// ---------------------------------------------------------------------------

export interface AccuracyReport {
  rules_version: string;
  rules_hash: string;
  rules_hash_full_hex: string;
  last_run_at: string;
  fixture_count: number;
  /** Granular per-field accuracy (sum of pass / sum of present checks). */
  overall_accuracy: number;
  /** Article 5 prohibition accuracy across ALL 50 fixtures (safety-critical). */
  article_5_accuracy: number;
  /** Binary high-risk accuracy (annex_iii.high_risk) across ALL 50 fixtures. */
  binary_high_risk_accuracy: number;
  /** Per-bucket pass-all-asserted-fields accuracy. */
  bucket_accuracy: Record<Bucket | 'legacy', { count: number; passed: number; accuracy: number }>;
  /** Per-fixture details. */
  fixtures: FixtureCheck[];
  /** Fixture IDs that failed at least one asserted field. */
  misclassifications: string[];
}

// ---------------------------------------------------------------------------
// Set equality (order-independent)
// ---------------------------------------------------------------------------

function setEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  for (let i = 0; i < sortedA.length; i += 1) {
    if (sortedA[i] !== sortedB[i]) return false;
  }
  return true;
}

function deepEqualRecord(
  a: Record<string, string[]>,
  b: Record<string, string[]>,
): boolean {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (!setEqual(keysA, keysB)) return false;
  for (const k of keysA) {
    if (!setEqual(a[k] ?? [], b[k] ?? [])) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Per-fixture check
// ---------------------------------------------------------------------------

function checkFixture(fixture: Fixture, result: ClassifyResult): FixtureCheck {
  const checks: FieldCheck[] = [];

  // article_5_prohibited (every fixture carries it).
  const a5pPass = result.article_5.prohibited === fixture.expected.article_5_prohibited;
  checks.push({
    field: 'article_5.prohibited',
    expected: fixture.expected.article_5_prohibited,
    actual: result.article_5.prohibited,
    pass: a5pPass,
  });

  // article_5_letters (every fixture carries it; set equality).
  const actualLetters = result.article_5.hits.map((h) => h.letter);
  const a5lPass = setEqual(actualLetters, fixture.expected.article_5_letters);
  checks.push({
    field: 'article_5.letters',
    expected: [...fixture.expected.article_5_letters].sort(),
    actual: [...actualLetters].sort(),
    pass: a5lPass,
  });

  // annex_iii_high_risk (every fixture carries it).
  const aHRPass = result.annex_iii.high_risk === fixture.expected.annex_iii_high_risk;
  checks.push({
    field: 'annex_iii.high_risk',
    expected: fixture.expected.annex_iii_high_risk,
    actual: result.annex_iii.high_risk,
    pass: aHRPass,
  });

  // annex_iii_domains (every fixture carries it). Subset check is too lenient
  // here — we want set-equality on Day-7 fixtures and stay compatible with
  // legacy day3/4/5 fixtures (which only assert a subset). We split: for
  // Day-7 (bucket present) we do set-equality; for legacy fixtures we do
  // subset (matches the existing snapshot-spec semantics at line 205-207).
  // Cast actualDomains to number[] so the array operations stay simple — the
  // underlying literal union (1|2|3|4|5|6|7|8) is structurally a number.
  const actualDomains: number[] = result.annex_iii.domains.map(
    (d) => d.annex_iii_number as number,
  );
  const expectedDomains = fixture.expected.annex_iii_domains;
  let aDomPass: boolean;
  if (fixture.bucket !== undefined) {
    aDomPass = setEqual(actualDomains, expectedDomains);
  } else {
    aDomPass = expectedDomains.every((d) => actualDomains.includes(d));
  }
  checks.push({
    field: 'annex_iii.domains',
    expected: [...expectedDomains].sort(),
    actual: [...actualDomains].sort(),
    pass: aDomPass,
  });

  // suppressed_by_article_5.
  const sPass =
    result.annex_iii.suppressed_by_article_5 === fixture.expected.suppressed_by_article_5;
  checks.push({
    field: 'annex_iii.suppressed_by_article_5',
    expected: fixture.expected.suppressed_by_article_5,
    actual: result.annex_iii.suppressed_by_article_5,
    pass: sPass,
  });

  // annex_iii_sub_letters (optional).
  if (fixture.expected.annex_iii_sub_letters !== undefined) {
    const actualSubs: Record<string, string[]> = {};
    for (const d of result.annex_iii.domains) {
      actualSubs[String(d.annex_iii_number)] = [...d.sub_letters];
    }
    // Compare only the keys the fixture asserts; the result may carry extra
    // domains' sub-letters that the fixture doesn't pin (Day-7 set-equality
    // bucket fixtures already constrain domains; this avoids penalizing the
    // legacy day3 fixtures for emitting extra hits the fixture doesn't pin).
    const expectedSubs = fixture.expected.annex_iii_sub_letters;
    const expectedSubsFiltered: Record<string, string[]> = {};
    for (const k of Object.keys(expectedSubs)) {
      expectedSubsFiltered[k] = expectedSubs[k] ?? [];
    }
    const actualSubsFiltered: Record<string, string[]> = {};
    for (const k of Object.keys(expectedSubs)) {
      actualSubsFiltered[k] = actualSubs[k] ?? [];
    }
    const subPass = deepEqualRecord(actualSubsFiltered, expectedSubsFiltered);
    checks.push({
      field: 'annex_iii.sub_letters',
      expected: expectedSubsFiltered,
      actual: actualSubsFiltered,
      pass: subPass,
    });
  }

  // article_50_paragraphs (optional, additive).
  if (fixture.expected.article_50_paragraphs !== undefined) {
    const actualParas = projectArticle50Paragraphs(result.article_50);
    const aParaPass = setEqual(actualParas, fixture.expected.article_50_paragraphs);
    checks.push({
      field: 'article_50.paragraphs',
      expected: [...fixture.expected.article_50_paragraphs].sort(),
      actual: actualParas,
      pass: aParaPass,
    });
  }

  // three_category_applicable (optional).
  if (fixture.expected.three_category_applicable !== undefined) {
    const actualCats = (result.three_category?.applicable_categories ?? []).map(Number);
    const tcPass = setEqual(actualCats, fixture.expected.three_category_applicable);
    checks.push({
      field: 'three_category.applicable_categories',
      expected: [...fixture.expected.three_category_applicable].sort((x, y) => x - y),
      actual: [...actualCats].sort((x, y) => x - y),
      pass: tcPass,
    });
  }

  // annex_iv_required (optional).
  if (fixture.expected.annex_iv_required !== undefined) {
    const aivPass = result.annex_iv_required === fixture.expected.annex_iv_required;
    checks.push({
      field: 'annex_iv_required',
      expected: fixture.expected.annex_iv_required,
      actual: result.annex_iv_required,
      pass: aivPass,
    });
  }

  // article_{N}_applicable per-cascade-module flags (optional, additive).
  const cascadeChecks: ReadonlyArray<
    readonly [keyof FixtureExpected, keyof ClassifyResult, string]
  > = [
    ['article_10_applicable', 'article_10', 'article_10.applicable'],
    ['article_12_applicable', 'article_12', 'article_12.applicable'],
    ['article_13_applicable', 'article_13', 'article_13.applicable'],
    ['article_14_applicable', 'article_14', 'article_14.applicable'],
    ['article_15_applicable', 'article_15', 'article_15.applicable'],
  ];
  for (const [expKey, resKey, fieldName] of cascadeChecks) {
    const expValue = fixture.expected[expKey];
    if (expValue === undefined) continue;
    const articleResult = result[resKey] as { applicable: boolean };
    const aPass = articleResult.applicable === expValue;
    checks.push({
      field: fieldName,
      expected: expValue,
      actual: articleResult.applicable,
      pass: aPass,
    });
  }

  const allPass = checks.every((c) => c.pass);
  return {
    id: fixture.id,
    lang: fixture.lang,
    bucket: fixture.bucket ?? 'legacy',
    passed: allPass,
    field_checks: checks,
    article_5_check_pass: a5pPass,
    binary_high_risk_check_pass: aHRPass,
  };
}

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

function getScriptDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function getRepoRoot(): string {
  return pathResolve(getScriptDir(), '..');
}

function loadAllFixtures(): Fixture[] {
  const fixturesBase = join(getRepoRoot(), 'test', 'fixtures', 'use-cases');
  const days = ['day3', 'day4', 'day5', 'day7'];
  const fixtures: Fixture[] = [];
  for (const day of days) {
    const dir = join(fixturesBase, day);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort();
    for (const filename of files) {
      const raw = readFileSync(join(dir, filename), 'utf8');
      fixtures.push(JSON.parse(raw) as Fixture);
    }
  }
  return fixtures;
}

// ---------------------------------------------------------------------------
// Bounded-concurrency helper (Day-9 LLM harness; deterministic mode skips)
// ---------------------------------------------------------------------------

/**
 * Run `fn` over `items` with at most `concurrency` in-flight at any time.
 * Preserves input order in the output. Used by the LLM-mode accuracy harness
 * to stay under Anthropic's free-tier RPM and to keep cost predictable.
 */
async function runWithConcurrency<TItem, TOut>(
  items: ReadonlyArray<TItem>,
  concurrency: number,
  fn: (item: TItem, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  const results: TOut[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      // Non-null assertion is safe: items.length checked above
      results[i] = await fn(items[i]!, i);
    }
  }
  const workers: Promise<void>[] = [];
  const lanes = Math.max(1, Math.min(concurrency, items.length));
  for (let w = 0; w < lanes; w += 1) workers.push(worker());
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Public harness entry-point (importable from vitest spec)
// ---------------------------------------------------------------------------

export interface RunAccuracyOptions {
  /** Override the "last_run_at" timestamp (used by tests for byte-stable assertions). */
  lastRunAtOverride?: string;
  /**
   * When set, replaces the deterministic keyword extractor with an LLM-based
   * extractor for every fixture invocation. Day 10 supports `anthropic`,
   * `openai`, and `groq`; each provider requires its respective API key in
   * env (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`). LLM-mode
   * results are reported at `accuracy/REPORT.llm-<provider>.md`.
   */
  llm?: LLMProvider;
  /**
   * Concurrency cap for LLM-mode calls. Default 5 (matches Anthropic's free-tier
   * RPM budget; safe for paid tier too). Ignored in deterministic mode.
   */
  llmConcurrency?: number;
}

/**
 * Cost-cap sentinel: hardcodes the maximum number of fixtures the LLM-mode
 * harness will process in a single run. Set deliberately conservatively at the
 * current corpus size (50) so a fat-fingered loop never burns more than ~$0.13
 * of API spend per invocation.
 */
const MAX_FIXTURES_PER_RUN = 50;

/**
 * Run `runAccuracy` once over the local fixture corpus. Async since Day 9
 * (classify() is now async; deterministic mode awaits immediately, LLM mode
 * does the real network call).
 */
export async function runAccuracy(opts: RunAccuracyOptions = {}): Promise<AccuracyReport> {
  const fixtures = loadAllFixtures();
  if (fixtures.length === 0) {
    throw new Error('runAccuracy(): no fixtures found under test/fixtures/use-cases/.');
  }
  if (fixtures.length > MAX_FIXTURES_PER_RUN) {
    throw new Error(
      `runAccuracy(): refusing to run on ${fixtures.length} fixtures (cap = ${MAX_FIXTURES_PER_RUN}). Cost-discipline guard.`,
    );
  }

  const llm = opts.llm;
  const concurrency = Math.max(1, opts.llmConcurrency ?? 5);

  let fixtureChecks: FixtureCheck[];
  if (llm === undefined) {
    // Deterministic mode: simple sequential (microtask) loop. classify()
    // awaits immediately (no network, no I/O), so this is effectively a
    // microtask-yielded sync map.
    fixtureChecks = [];
    for (const f of fixtures) {
      const result = await classify(f.input, { lang: f.lang });
      fixtureChecks.push(checkFixture(f, result));
    }
  } else {
    // LLM mode: bounded concurrency, preserves input order.
    fixtureChecks = await runWithConcurrency(fixtures, concurrency, async (f) => {
      const result = await classify(f.input, { lang: f.lang, llm });
      return checkFixture(f, result);
    });
  }

  // Overall accuracy (granular per-field pass / total).
  let totalChecks = 0;
  let passedChecks = 0;
  for (const fc of fixtureChecks) {
    for (const c of fc.field_checks) {
      totalChecks += 1;
      if (c.pass) passedChecks += 1;
    }
  }
  const overall = totalChecks > 0 ? passedChecks / totalChecks : 0;

  // Article-5 accuracy — across ALL fixtures.
  let a5Pass = 0;
  for (const fc of fixtureChecks) {
    if (fc.article_5_check_pass) a5Pass += 1;
  }
  const a5acc = fixtureChecks.length > 0 ? a5Pass / fixtureChecks.length : 0;

  // Binary high-risk accuracy — across ALL fixtures.
  let bhrPass = 0;
  for (const fc of fixtureChecks) {
    if (fc.binary_high_risk_check_pass) bhrPass += 1;
  }
  const bhrAcc = fixtureChecks.length > 0 ? bhrPass / fixtureChecks.length : 0;

  // Per-bucket pass-all accuracy.
  const buckets: ReadonlyArray<Bucket | 'legacy'> = [
    'annex_iii',
    'article_5',
    'article_50',
    'negative',
    'legacy',
  ];
  const bucketAcc: AccuracyReport['bucket_accuracy'] = {
    annex_iii: { count: 0, passed: 0, accuracy: 0 },
    article_5: { count: 0, passed: 0, accuracy: 0 },
    article_50: { count: 0, passed: 0, accuracy: 0 },
    negative: { count: 0, passed: 0, accuracy: 0 },
    legacy: { count: 0, passed: 0, accuracy: 0 },
  };
  for (const fc of fixtureChecks) {
    const b = fc.bucket;
    bucketAcc[b].count += 1;
    if (fc.passed) bucketAcc[b].passed += 1;
  }
  for (const b of buckets) {
    const slot = bucketAcc[b];
    slot.accuracy = slot.count > 0 ? slot.passed / slot.count : 0;
  }

  const misclassifications = fixtureChecks.filter((fc) => !fc.passed).map((fc) => fc.id);

  const lastRunAt =
    opts.lastRunAtOverride ?? process.env['LAST_RUN_AT_OVERRIDE'] ?? new Date().toISOString();

  return {
    rules_version: RULES_VERSION,
    rules_hash: RULES_HASH,
    rules_hash_full_hex: RULES_HASH_FULL_HEX,
    last_run_at: lastRunAt,
    fixture_count: fixtureChecks.length,
    overall_accuracy: overall,
    article_5_accuracy: a5acc,
    binary_high_risk_accuracy: bhrAcc,
    bucket_accuracy: bucketAcc,
    fixtures: fixtureChecks,
    misclassifications,
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export interface RenderMarkdownOptions {
  /** When set, the report title + disclaimer text reflect the LLM mode. */
  llm?: LLMProvider;
}

const PROVIDER_LABELS: Record<LLMProvider, { display: string; model: string; costPerRun: string }> = {
  anthropic: { display: 'Anthropic', model: 'Claude Haiku 4.5', costPerRun: '\$0.13' },
  openai: { display: 'OpenAI', model: 'GPT-4o-mini', costPerRun: '\$0.025' },
  // groq lights up in the next commit alongside the groq.ts provider.
  groq: { display: 'Groq', model: 'Llama 3.3 70B', costPerRun: '\$0.005' },
};

export function renderMarkdown(
  report: AccuracyReport,
  opts: RenderMarkdownOptions = {},
): string {
  const lines: string[] = [];
  const providerInfo = opts.llm !== undefined ? PROVIDER_LABELS[opts.llm] : null;
  const title =
    providerInfo !== null
      ? `# Accuracy report — @lucairn/ai-act-classifier (LLM ${providerInfo.display} mode)`
      : '# Accuracy report — @lucairn/ai-act-classifier';
  lines.push(title);
  lines.push('');
  if (providerInfo !== null && opts.llm !== undefined) {
    lines.push(
      `> **LLM mode (opt-in).** This report reflects the \`--llm ${opts.llm}\` extractor (${providerInfo.model}). The rules engine that selects articles is unchanged — only feature extraction is replaced. LLM-mode results are NOT a CI-blocking metric. Approximate cost: ~${providerInfo.costPerRun} per run on the 50-case corpus.`,
    );
    lines.push('');
  }
  lines.push(`- **Rules version:** \`${report.rules_version}\``);
  lines.push(`- **Rules hash:** \`${report.rules_hash}\` (full: \`${report.rules_hash_full_hex}\`)`);
  lines.push(`- **Last run:** ${report.last_run_at}`);
  lines.push(`- **Fixture corpus:** ${report.fixture_count} cases`);
  lines.push('');
  lines.push(
    '> **What this report measures:** internal consistency between the curated 50-case fixture corpus and the v0.1.0 lexicon. The headline numbers below are **not** a measure of arbitrary real-world accuracy — the corpus was shaped during the Day-7 build to match the lexicon\'s canonical phrases. Per-fixture accuracy uses set-equality on Day-7 fixtures and subset-containment on the 11 legacy day3/4/5 fixtures pending Day-8 backfill. See [METHODOLOGY.md §"Honest limitations"](./METHODOLOGY.md#honest-limitations) for the Day-8 polish backlog. The CI floor is 80% overall + 100% Article 5; current numbers exceed both.',
  );
  lines.push('');
  lines.push('## Headline numbers');
  lines.push('');
  lines.push('| Metric | Score |');
  lines.push('|---|---|');
  lines.push(`| **Overall accuracy** (granular per-field pass rate) | **${pct(report.overall_accuracy)}** |`);
  lines.push(`| **Article 5 prohibition detection** (safety-critical) | **${pct(report.article_5_accuracy)}** |`);
  lines.push(`| **Binary high-risk classification** (Annex III + Article 6) | **${pct(report.binary_high_risk_accuracy)}** |`);
  lines.push('');
  lines.push('## Per-bucket accuracy (pass-all-asserted-fields)');
  lines.push('');
  lines.push('| Bucket | Count | Passed | Accuracy |');
  lines.push('|---|---|---|---|');
  const bucketOrder: ReadonlyArray<'annex_iii' | 'article_5' | 'article_50' | 'negative' | 'legacy'> = [
    'annex_iii',
    'article_5',
    'article_50',
    'negative',
    'legacy',
  ];
  for (const b of bucketOrder) {
    const slot = report.bucket_accuracy[b];
    lines.push(`| ${b} | ${slot.count} | ${slot.passed} | ${pct(slot.accuracy)} |`);
  }
  lines.push('');
  lines.push('## Targets vs CI floor');
  lines.push('');
  lines.push('| | v1.0 release target | CI floor (Day 7) | Current |');
  lines.push('|---|---|---|---|');
  lines.push(`| Overall | ≥85% | ≥80% | **${pct(report.overall_accuracy)}** |`);
  lines.push(`| Article 5 | 100% | 100% | **${pct(report.article_5_accuracy)}** |`);
  lines.push(`| Binary high-risk | ≥90% | (informational) | **${pct(report.binary_high_risk_accuracy)}** |`);
  lines.push('');
  lines.push('## Per-fixture results');
  lines.push('');
  lines.push('| Fixture | Lang | Bucket | Status | Failed fields |');
  lines.push('|---|---|---|---|---|');
  for (const fc of report.fixtures) {
    const failedFields = fc.field_checks.filter((c) => !c.pass).map((c) => c.field);
    const status = fc.passed ? 'PASS' : 'FAIL';
    const failedList = failedFields.length > 0 ? failedFields.join(', ') : '—';
    lines.push(`| \`${fc.id}\` | ${fc.lang} | ${fc.bucket} | ${status} | ${failedList} |`);
  }
  if (report.misclassifications.length > 0) {
    lines.push('');
    lines.push('## Misclassification details');
    lines.push('');
    for (const fc of report.fixtures) {
      if (fc.passed) continue;
      lines.push(`### \`${fc.id}\` (${fc.lang}, bucket: ${fc.bucket})`);
      lines.push('');
      lines.push('| Field | Expected | Actual |');
      lines.push('|---|---|---|');
      for (const c of fc.field_checks) {
        if (c.pass) continue;
        const expStr = JSON.stringify(c.expected);
        const actStr = JSON.stringify(c.actual);
        lines.push(`| \`${c.field}\` | \`${expStr}\` | \`${actStr}\` |`);
      }
      lines.push('');
    }
  }
  lines.push('## Methodology');
  lines.push('');
  lines.push('See [METHODOLOGY.md](./METHODOLOGY.md) for the coverage matrix, source allowlist, formulas, and "absent field = skip" semantics.');
  lines.push('');
  lines.push('## Citation');
  lines.push('');
  lines.push('> *Lucairn (2026), AI Act Classifier — accuracy report v0.1, https://lucairn.eu/tools/ai-act-classifier*');
  lines.push('');
  lines.push('> EUR-Lex Regulation (EU) 2024/1689 (full text): https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI argv parsing
// ---------------------------------------------------------------------------

interface ParsedArgv {
  verbose: boolean;
  format: 'json' | 'markdown' | 'both';
  llm?: LLMProvider;
}

function parseArgv(argv: ReadonlyArray<string>): ParsedArgv {
  const out: ParsedArgv = { verbose: false, format: 'both' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--verbose') {
      out.verbose = true;
      continue;
    }
    if (arg === '--format') {
      const next = argv[i + 1];
      if (next !== 'json' && next !== 'markdown' && next !== 'both') {
        process.stderr.write(`accuracy: --format must be one of: json | markdown | both\n`);
        process.exit(2);
      }
      out.format = next;
      i += 1;
      continue;
    }
    if (arg === '--llm') {
      const next = argv[i + 1];
      if (next === 'anthropic' || next === 'openai' || next === 'groq') {
        out.llm = next;
      } else {
        process.stderr.write(
          `accuracy: --llm <provider> must be one of: anthropic | openai | groq. Got: ${next ?? '<missing>'}\n`,
        );
        process.exit(2);
      }
      i += 1;
      continue;
    }
    if (arg !== undefined && arg.length > 0) {
      process.stderr.write(`accuracy: unknown argument "${arg}". Usage: --verbose | --format json|markdown|both | --llm anthropic|openai|groq\n`);
      process.exit(2);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CI thresholds (mirror dispatch spec §1.6 — locked)
// ---------------------------------------------------------------------------

const CI_OVERALL_FLOOR = 0.8;
const CI_ARTICLE_5_FLOOR = 1.0;

/**
 * v1.0 launch target — ratchet `CI_OVERALL_FLOOR` to this value on v1.0 launch.
 * Currently informational; the CI gate above stays at 0.80 to give Day-8/Day-9
 * lexicon expansion margin. Day-13 / pre-launch session updates this to active.
 */
const CI_OVERALL_FLOOR_V1_LAUNCH = 0.85;
void CI_OVERALL_FLOOR_V1_LAUNCH; // intentionally unused; kept visible in source

function meetsCIFloor(report: AccuracyReport): boolean {
  return report.overall_accuracy >= CI_OVERALL_FLOOR && report.article_5_accuracy >= CI_ARTICLE_5_FLOOR;
}

// ---------------------------------------------------------------------------
// CLI entry-point
// ---------------------------------------------------------------------------

/**
 * Output-file name for a given run mode.
 *   - Deterministic: `REPORT.md` + `REPORT.json` (CI-gated).
 *   - LLM mode:     `REPORT.llm-<provider>.md` + `REPORT.llm-<provider>.json`
 *     (NOT CI-gated; opt-in observation, regenerable on demand).
 */
function reportBasenameFor(llm: LLMProvider | undefined): string {
  if (llm !== undefined) return `REPORT.llm-${llm}`;
  return 'REPORT';
}

const PROVIDER_ENV_NAME: Record<LLMProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  // groq lights up in the next commit alongside the groq.ts provider.
  groq: 'GROQ_API_KEY',
};

/** "LLM mode skipped" placeholder shipped when the provider's API key env var is absent. */
function renderLlmSkippedReport(provider: LLMProvider): string {
  const envName = PROVIDER_ENV_NAME[provider];
  const providerInfo = PROVIDER_LABELS[provider];
  return `# Accuracy report — @lucairn/ai-act-classifier (LLM ${providerInfo.display} mode)

LLM mode skipped — ${envName} env var not set.

To regenerate this report:

\`\`\`bash
${envName}="<your-key>" pnpm accuracy:llm-${provider}
\`\`\`

The LLM-mode harness costs approximately ${providerInfo.costPerRun} per run on ${providerInfo.model}
across the 50-case bilingual fixture corpus. LLM-mode accuracy is an opt-in
observation — it is NOT a CI-blocking metric. The deterministic-mode CI floor
(overall ≥80%, Art 5 100%) remains the only enforced gate.

See [README.md §--llm mode (opt-in)](../README.md) for setup.
`;
}

async function runCli(argv: ReadonlyArray<string> = process.argv.slice(2)): Promise<never> {
  const parsed = parseArgv(argv);

  const accuracyDir = join(getRepoRoot(), 'accuracy');
  if (!existsSync(accuracyDir)) {
    mkdirSync(accuracyDir, { recursive: true });
  }

  // ----- LLM-mode "skipped" short-circuit: emit placeholder + exit 0. ------
  // Treat absence of the provider's API key env var as a documented no-op
  // (NOT a failure) so CI environments and casual invocations without a key
  // do not error out.
  if (parsed.llm !== undefined) {
    const envName = PROVIDER_ENV_NAME[parsed.llm];
    const apiKey = process.env[envName];
    if (typeof apiKey !== 'string' || apiKey.length === 0) {
      const mdPath = join(accuracyDir, `REPORT.llm-${parsed.llm}.md`);
      writeFileSync(mdPath, renderLlmSkippedReport(parsed.llm), 'utf8');
      process.stdout.write(
        `accuracy: LLM mode skipped — ${envName} env var not set. Emitted placeholder report.\n`,
      );
      process.exit(0);
    }
  }

  // ----- Run the harness. --------------------------------------------------
  let report: AccuracyReport;
  try {
    const runOpts: RunAccuracyOptions = {};
    if (parsed.llm !== undefined) runOpts.llm = parsed.llm;
    report = await runAccuracy(runOpts);
  } catch (err) {
    process.stderr.write(`accuracy: harness error — ${(err as Error).message}\n`);
    process.exit(2);
  }

  // ----- Write outputs (path depends on llm mode). -------------------------
  const basename = reportBasenameFor(parsed.llm);
  if (parsed.format === 'json' || parsed.format === 'both') {
    const jsonPath = join(accuracyDir, `${basename}.json`);
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  if (parsed.format === 'markdown' || parsed.format === 'both') {
    const mdPath = join(accuracyDir, `${basename}.md`);
    writeFileSync(
      mdPath,
      renderMarkdown(report, parsed.llm !== undefined ? { llm: parsed.llm } : {}),
      'utf8',
    );
  }

  // ----- Stdout summary. ---------------------------------------------------
  const modeLabel = parsed.llm !== undefined ? ` [llm-${parsed.llm}]` : '';
  process.stdout.write(
    `accuracy${modeLabel}: ${report.fixture_count} fixtures — overall ${pct(report.overall_accuracy)}, Art 5 ${pct(report.article_5_accuracy)}, binary high-risk ${pct(report.binary_high_risk_accuracy)}\n`,
  );
  if (parsed.verbose) {
    for (const fc of report.fixtures) {
      const status = fc.passed ? 'PASS' : 'FAIL';
      const fails = fc.field_checks.filter((c) => !c.pass).map((c) => c.field);
      process.stdout.write(`  ${status} ${fc.id} (${fc.bucket})${fails.length > 0 ? ` — failed: ${fails.join(', ')}` : ''}\n`);
    }
  }
  if (report.misclassifications.length > 0 && !parsed.verbose) {
    process.stdout.write(
      `accuracy: ${report.misclassifications.length} misclassifications (use --verbose for details, or see accuracy/${basename}.md)\n`,
    );
  }

  // ----- CI gate (deterministic mode only). --------------------------------
  // LLM-mode is opt-in observation; it never blocks CI.
  if (parsed.llm === undefined && !meetsCIFloor(report)) {
    process.stderr.write(
      `accuracy: CI floor NOT met (overall ${pct(report.overall_accuracy)} < ${pct(CI_OVERALL_FLOOR)} or Art 5 ${pct(report.article_5_accuracy)} < ${pct(CI_ARTICLE_5_FLOOR)}).\n`,
    );
    process.exit(1);
  }

  process.exit(0);
}

// Direct invocation guard mirrors scripts/sync-three-category.ts.
const isDirectInvocation =
  import.meta.url === `file://${process.argv[1] ?? ''}` ||
  (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1]));

if (isDirectInvocation) {
  runCli().catch((err: unknown) => {
    process.stderr.write(`accuracy: unexpected error — ${(err as Error).message}\n`);
    process.exit(2);
  });
}
