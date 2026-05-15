// Integration test for the Day-9 Anthropic Haiku 4.5 provider.
//
// Hits the real Anthropic API. Gated on BOTH:
//   - LUCAIRN_LLM_INTEGRATION=1
//   - ANTHROPIC_API_KEY=...
//
// When either env var is absent, the suite SKIPS (vitest reports skipped
// instead of failing). CI never sets these env vars, so CI never bills.
//
// Cost: ~$0.005 per run (3 messages × Haiku 4.5).
// Latency: 1-5s per call.

import { describe, it, expect } from 'vitest';
import { extractWithAnthropic } from '../../src/extract/providers/anthropic.js';

const LLM_INTEGRATION = process.env['LUCAIRN_LLM_INTEGRATION'] === '1';
const HAS_KEY =
  typeof process.env['ANTHROPIC_API_KEY'] === 'string' &&
  process.env['ANTHROPIC_API_KEY'].length > 0;

const describeIntegration = LLM_INTEGRATION && HAS_KEY ? describe : describe.skip;

describeIntegration('LLM Anthropic integration (real API)', () => {
  it(
    'Annex III.4 employment fixture (EN) — fires the employment category',
    async () => {
      const result = await extractWithAnthropic(
        'We use an AI system to perform CV screening and applicant tracking for the hiring decision in our organization.',
        { provider: 'anthropic', lang: 'en' },
      );
      expect(result.lang).toBe('en');
      const annexHits = result.hits.filter((h) => h.group === 'annex_iii');
      expect(annexHits.length).toBeGreaterThanOrEqual(1);
      // At least one employment-category fire.
      const employmentHits = annexHits.filter((h) => h.category === '4_employment');
      expect(employmentHits.length).toBeGreaterThanOrEqual(1);
      // All emitted phrases must be in the lexicon (architectural guard).
      // The provider drops hallucinated phrases pre-return; assert hits non-empty.
      expect(result.hits.every((h) => h.phrase.length > 0)).toBe(true);
    },
    60_000, // 60s timeout — Haiku usually responds in <2s but allow margin.
  );

  it(
    'Article 5 prohibited fixture (DE) — fires the social-scoring prohibition',
    async () => {
      const result = await extractWithAnthropic(
        'Wir setzen ein KI-System für Sozialbewertung (social credit) von Bürgern durch eine staatliche Behörde ein.',
        { provider: 'anthropic', lang: 'de' },
      );
      expect(result.lang).toBe('de');
      const prohibitedHits = result.hits.filter(
        (h) => h.group === 'article_5_prohibited',
      );
      expect(prohibitedHits.length).toBeGreaterThanOrEqual(1);
      const socialScoringHits = prohibitedHits.filter(
        (h) => h.category === 'c_social_scoring',
      );
      expect(socialScoringHits.length).toBeGreaterThanOrEqual(1);
    },
    60_000,
  );

  it(
    'Negative fixture (EN weather forecast) — emits zero or near-zero hits',
    async () => {
      const result = await extractWithAnthropic(
        'A simple weather forecasting tool that predicts precipitation chance for the next 24 hours.',
        { provider: 'anthropic', lang: 'en' },
      );
      // Expect zero Article 5 prohibitions and zero Annex III hits.
      const a5Hits = result.hits.filter((h) => h.group === 'article_5_prohibited');
      const annexHits = result.hits.filter((h) => h.group === 'annex_iii');
      const a50Hits = result.hits.filter((h) => h.group === 'article_50_gpai');
      expect(a5Hits.length).toBe(0);
      expect(annexHits.length).toBe(0);
      expect(a50Hits.length).toBe(0);
    },
    60_000,
  );
});
