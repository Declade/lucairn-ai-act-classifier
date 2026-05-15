// Integration test for the Day-10 OpenAI gpt-4o-mini provider.
//
// Hits the real OpenAI API. Gated on BOTH:
//   - LUCAIRN_LLM_INTEGRATION=1
//   - OPENAI_API_KEY=...
//
// When either env var is absent, the suite SKIPS (vitest reports skipped
// instead of failing). CI never sets these env vars, so CI never bills.
//
// The local `~/.lucairn-classifier-key` ships with only ANTHROPIC_API_KEY
// (verified via grep -c at dispatch time); this suite is therefore SKIPPED
// during the Day-10 dispatch verification gate. Marc can position
// OPENAI_API_KEY locally + run the suite with `LUCAIRN_LLM_INTEGRATION=1
// OPENAI_API_KEY=... pnpm test test/extract/llm-openai-integration.spec.ts`.
//
// Cost: ~$0.0015 per run (3 messages × gpt-4o-mini at ~$0.00050/call).
// Latency: 1-5s per call.

import { describe, it, expect } from 'vitest';
import { extractWithOpenAI } from '../../src/extract/providers/openai.js';

const LLM_INTEGRATION = process.env['LUCAIRN_LLM_INTEGRATION'] === '1';
const HAS_KEY =
  typeof process.env['OPENAI_API_KEY'] === 'string' &&
  process.env['OPENAI_API_KEY'].length > 0;

const describeIntegration = LLM_INTEGRATION && HAS_KEY ? describe : describe.skip;

describeIntegration('LLM OpenAI integration (real API)', () => {
  it(
    'Annex III.4 employment fixture (EN) — fires the employment category',
    async () => {
      const result = await extractWithOpenAI(
        'We use an AI system to perform CV screening and applicant tracking for the hiring decision in our organization.',
        { provider: 'openai', lang: 'en' },
      );
      expect(result.lang).toBe('en');
      const annexHits = result.hits.filter((h) => h.group === 'annex_iii');
      expect(annexHits.length).toBeGreaterThanOrEqual(1);
      const employmentHits = annexHits.filter((h) => h.category === '4_employment');
      expect(employmentHits.length).toBeGreaterThanOrEqual(1);
      // All emitted phrases must be in the lexicon (architectural guard).
      // The provider drops hallucinated phrases pre-return; assert hits non-empty.
      expect(result.hits.every((h) => h.phrase.length > 0)).toBe(true);
    },
    60_000, // 60s timeout — gpt-4o-mini usually responds in <2s.
  );

  it(
    'Article 5 prohibited fixture (DE) — fires the social-scoring prohibition',
    async () => {
      const result = await extractWithOpenAI(
        'Wir setzen ein KI-System für Sozialbewertung (social credit) von Bürgern durch eine staatliche Behörde ein.',
        { provider: 'openai', lang: 'de' },
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
      const result = await extractWithOpenAI(
        'A simple weather forecasting tool that predicts precipitation chance for the next 24 hours.',
        { provider: 'openai', lang: 'en' },
      );
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
