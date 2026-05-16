// Day-10 L6 closure — DEFAULT_MODEL drift guard.
//
// Each provider module (anthropic, openai, groq) exports a `DEFAULT_MODEL`
// named constant. `src/extract/llm.ts:getDefaultModel(provider)` imports
// these named exports and dispatches to them. This spec locks the invariant
// that the centralised dispatch and the provider's own default agree, so a
// provider can never silently drift away from the cache-key-stable model
// the cache layer assumes is in use.
//
// Without this guard, a provider could bump its DEFAULT_MODEL without the
// llm.ts dispatch tracking the change. Cache keys derived from
// getDefaultModel() would point at the OLD model; the provider would call
// the NEW model; cache hits would serve features generated under the wrong
// model. The fix-up was to make each provider's DEFAULT_MODEL a named export
// and have llm.ts import it directly (single source of truth per provider).

import { describe, it, expect } from 'vitest';
import { DEFAULT_MODEL as ANTHROPIC_DEFAULT_MODEL } from '../../../src/extract/providers/anthropic.js';
import { DEFAULT_MODEL as OPENAI_DEFAULT_MODEL } from '../../../src/extract/providers/openai.js';
import { DEFAULT_MODEL as GROQ_DEFAULT_MODEL } from '../../../src/extract/providers/groq.js';
import { getDefaultModel } from '../../../src/extract/llm.js';

describe('DEFAULT_MODEL drift guard (Day-10 L6 closure)', () => {
  it('llm.ts getDefaultModel("anthropic") equals providers/anthropic.DEFAULT_MODEL', () => {
    expect(getDefaultModel('anthropic')).toBe(ANTHROPIC_DEFAULT_MODEL);
  });

  it('llm.ts getDefaultModel("openai") equals providers/openai.DEFAULT_MODEL', () => {
    expect(getDefaultModel('openai')).toBe(OPENAI_DEFAULT_MODEL);
  });

  it('llm.ts getDefaultModel("groq") equals providers/groq.DEFAULT_MODEL', () => {
    expect(getDefaultModel('groq')).toBe(GROQ_DEFAULT_MODEL);
  });

  it('each provider exports a non-empty string DEFAULT_MODEL', () => {
    expect(typeof ANTHROPIC_DEFAULT_MODEL).toBe('string');
    expect(ANTHROPIC_DEFAULT_MODEL.length).toBeGreaterThan(0);
    expect(typeof OPENAI_DEFAULT_MODEL).toBe('string');
    expect(OPENAI_DEFAULT_MODEL.length).toBeGreaterThan(0);
    expect(typeof GROQ_DEFAULT_MODEL).toBe('string');
    expect(GROQ_DEFAULT_MODEL.length).toBeGreaterThan(0);
  });

  it('the 3 providers all return DISTINCT model defaults (no shared sentinel slipped in)', () => {
    const set = new Set([ANTHROPIC_DEFAULT_MODEL, OPENAI_DEFAULT_MODEL, GROQ_DEFAULT_MODEL]);
    expect(set.size).toBe(3);
  });
});
