// Integration test for the Day-10 Groq Llama 3.3 70B provider.
//
// Hits the real Groq API (OpenAI-compatible chat-completions at
// api.groq.com/openai/v1). Gated on BOTH:
//   - LUCAIRN_LLM_INTEGRATION=1
//   - GROQ_API_KEY=...
//
// When either env var is absent, the suite SKIPS. The local
// `~/.lucairn-classifier-key` only ships with ANTHROPIC_API_KEY (verified
// via grep -c at dispatch time); this suite is therefore SKIPPED during the
// Day-10 dispatch verification gate. Marc can position GROQ_API_KEY locally
// + run with `LUCAIRN_LLM_INTEGRATION=1 GROQ_API_KEY=... pnpm test
// test/extract/llm-groq-integration.spec.ts`.
//
// Cost: ~$0.0003 per run (3 messages × Llama 3.3 70B at ~$0.0001/call;
// Groq is by far the cheapest of the three providers).
// Latency: <1s per call (Groq is fast).

import { describe, it, expect } from 'vitest';
import { extractWithGroq } from '../../src/extract/providers/groq.js';

const LLM_INTEGRATION = process.env['LUCAIRN_LLM_INTEGRATION'] === '1';
const HAS_KEY =
  typeof process.env['GROQ_API_KEY'] === 'string' &&
  process.env['GROQ_API_KEY'].length > 0;

const describeIntegration = LLM_INTEGRATION && HAS_KEY ? describe : describe.skip;

describeIntegration('LLM Groq integration (real API)', () => {
  it(
    'Annex III.4 employment fixture (EN) — fires the employment category',
    async () => {
      const result = await extractWithGroq(
        'We use an AI system to perform CV screening and applicant tracking for the hiring decision in our organization.',
        { provider: 'groq', lang: 'en' },
      );
      expect(result.lang).toBe('en');
      const annexHits = result.hits.filter((h) => h.group === 'annex_iii');
      expect(annexHits.length).toBeGreaterThanOrEqual(1);
      const employmentHits = annexHits.filter((h) => h.category === '4_employment');
      expect(employmentHits.length).toBeGreaterThanOrEqual(1);
      expect(result.hits.every((h) => h.phrase.length > 0)).toBe(true);
    },
    60_000,
  );

  it(
    'Article 5 prohibited fixture (DE) — fires the social-scoring prohibition',
    async () => {
      const result = await extractWithGroq(
        'Wir setzen ein KI-System für Sozialbewertung (social credit) von Bürgern durch eine staatliche Behörde ein.',
        { provider: 'groq', lang: 'de' },
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
      const result = await extractWithGroq(
        'A simple weather forecasting tool that predicts precipitation chance for the next 24 hours.',
        { provider: 'groq', lang: 'en' },
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
