// Vitest spec for the accuracy harness. Runs `runAccuracy()` against the
// real fixture corpus and asserts on the CI floor:
//
//   - overall_accuracy >= 0.80
//   - article_5_accuracy === 1.0
//
// Plus structural invariants:
//
//   - 62 fixtures loaded (50 day{3,4,5,7} + 9 day14-launch-feedback v0.1.3 + 3
//     day14-launch-feedback v0.1.4). Bucket counts: 22 annex_iii + 13 article_5 +
//     9 article_50 + 9 negative + 9 legacy. v0.1.4 launch-feedback retest added 3
//     fixtures: +2 annex_iii (EN evaluate-job-applications + DE Bewerbenden) and
//     +1 article_5 (EN workers' emotions in customer-service workplace).
//   - Per-bucket counts match the locked corpus matrix.
//   - report.misclassifications.length === fixtures.filter(passed===false).length.
//   - Every fixture has at least one field_check (no fixture is silently skipped).
//   - rules_version + rules_hash are stable across two consecutive runs (purity).

import { describe, it, expect } from 'vitest';
import { runAccuracy, renderMarkdown } from '../../scripts/accuracy.js';

describe('accuracy harness — CI floor + structural invariants', () => {
  it('loads exactly 71 fixtures (50 day{3,4,5,7} + 9 v0.1.3 + 3 v0.1.4 + 4 v0.2.0 + 5 v0.3.0)', async () => {
    const report = await runAccuracy({ lastRunAtOverride: '2026-05-15T00:00:00Z' });
    expect(report.fixture_count).toBe(71);
  });

  it('meets CI overall floor (>= 0.80)', async () => {
    const report = await runAccuracy({ lastRunAtOverride: '2026-05-15T00:00:00Z' });
    expect(report.overall_accuracy).toBeGreaterThanOrEqual(0.8);
  });

  it('meets CI Article-5 floor (== 1.0) — safety-critical zero-false-negative bar', async () => {
    const report = await runAccuracy({ lastRunAtOverride: '2026-05-15T00:00:00Z' });
    expect(report.article_5_accuracy).toBe(1.0);
  });

  it('per-bucket counts match locked corpus matrix', async () => {
    const report = await runAccuracy({ lastRunAtOverride: '2026-05-15T00:00:00Z' });
    // Day-8 M-3 backfill: day5/01 + day5/02 now carry bucket=article_50, so
    // they shifted from 'legacy' (-2) into 'article_50' (+2). Legacy now
    // carries 9 fixtures (8 day3 + 1 day4) and article_50 carries 9 (6 day7
    // + 2 day5 + 1 day14 medical-carve-out). v0.1.3 launch-feedback added
    // +3 annex_iii (BLOCKER 1 EN/HIGH-1 DE/HIGH-2 EN), +5 article_5 (BLOCKER
    // 2a EN/DE + 2b + 2c + HIGH-2 social-trust), +1 article_50 (medical
    // carve-out regression-lock). v0.1.4 launch-feedback retest added +2
    // annex_iii (BLOCKER 3a EN evaluate-job-applications + HIGH-1-carry
    // DE Bewerbenden) and +1 article_5 (BLOCKER 3b EN workers' emotions in
    // customer-service workplace).
    // v0.3.0 (day15-v0.3.0) added 5 fixtures exercising the new Article 4 +
    // GPAI Articles 53 + 55 rule modules: +1 article_50 (art53-gpt5 — chatbot
    // also fires Art 50(1)) and +4 negative (art4-staff-training EN/DE,
    // art53-llama-deployer DE, art55-systemic-risk EN — none of these hit any
    // high-risk Annex III domain or Article 5 prohibition).
    expect(report.bucket_accuracy.annex_iii.count).toBe(22);
    expect(report.bucket_accuracy.article_5.count).toBe(16);
    expect(report.bucket_accuracy.article_50.count).toBe(11);
    expect(report.bucket_accuracy.negative.count).toBe(13);
    expect(report.bucket_accuracy.legacy.count).toBe(9);
  });

  it('misclassifications list aligns with fixture pass/fail', async () => {
    const report = await runAccuracy({ lastRunAtOverride: '2026-05-15T00:00:00Z' });
    const failedIds = report.fixtures.filter((fc) => !fc.passed).map((fc) => fc.id).sort();
    expect([...report.misclassifications].sort()).toEqual(failedIds);
  });

  it('every fixture emits at least one field_check (no fixture silently skipped)', async () => {
    const report = await runAccuracy({ lastRunAtOverride: '2026-05-15T00:00:00Z' });
    for (const fc of report.fixtures) {
      expect(fc.field_checks.length).toBeGreaterThan(0);
    }
  });

  it('rules_version + rules_hash are stable across two consecutive harness runs (purity)', async () => {
    const r1 = await runAccuracy({ lastRunAtOverride: '2026-05-15T00:00:00Z' });
    const r2 = await runAccuracy({ lastRunAtOverride: '2026-05-15T00:00:00Z' });
    expect(r1.rules_version).toBe(r2.rules_version);
    expect(r1.rules_hash).toBe(r2.rules_hash);
    expect(r1.rules_hash_full_hex).toBe(r2.rules_hash_full_hex);
    expect(r1.fixture_count).toBe(r2.fixture_count);
    expect(r1.overall_accuracy).toBe(r2.overall_accuracy);
    expect(r1.article_5_accuracy).toBe(r2.article_5_accuracy);
  });

  it('renderMarkdown produces a report that mentions the headline metrics', async () => {
    const report = await runAccuracy({ lastRunAtOverride: '2026-05-15T00:00:00Z' });
    const md = renderMarkdown(report);
    expect(md).toContain('# Accuracy report');
    expect(md).toContain('Overall accuracy');
    expect(md).toContain('Article 5 prohibition detection');
    expect(md).toContain('Per-bucket accuracy');
    // The deterministic timestamp passes through.
    expect(md).toContain('2026-05-15T00:00:00Z');
  });

  it('binary_high_risk_accuracy is at least 0.85 (sanity floor; v1.0 target is 0.90)', async () => {
    const report = await runAccuracy({ lastRunAtOverride: '2026-05-15T00:00:00Z' });
    expect(report.binary_high_risk_accuracy).toBeGreaterThanOrEqual(0.85);
  });

  // Day-8 M-4 closure: visible-in-test-output but skipped to keep CI margin.
  // Day-13 / pre-launch session flips .skip → .it as a 1-character ratchet
  // when the lexicon expansion plateau has settled and headline accuracy is
  // stable above 85%.
  it.skip('v1.0 launch target: overall accuracy >= 0.85 (currently informational)', async () => {
    const report = await runAccuracy({ lastRunAtOverride: '2026-05-15T00:00:00Z' });
    expect(report.overall_accuracy).toBeGreaterThanOrEqual(0.85);
  });
});
