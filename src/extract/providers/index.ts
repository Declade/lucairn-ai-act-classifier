// LLM provider barrel — Day 9 shipped Anthropic; Day 10 adds OpenAI (this commit) + Groq (next commit).
//
// The dispatch table lives in extract/llm.ts; this barrel is a convenience
// for direct imports in tests and any future code that wants to bypass dispatch.

export { extractWithAnthropic } from './anthropic.js';
export { extractWithOpenAI } from './openai.js';
