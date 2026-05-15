// LLM provider barrel — Day 9 ships Anthropic only.
//
// Day 10 adds OpenAI + Groq exports here. The dispatch table lives in
// extract/llm.ts; this barrel is a convenience for direct imports in tests
// and future code that wants to bypass dispatch.

export { extractWithAnthropic } from './anthropic.js';
