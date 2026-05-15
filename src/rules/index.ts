// Barrel export for the Day 3 rule modules. Public API stable across v0.1.x.

export { classifyArticle5 } from './article-5.js';
export type {
  Article5Result,
  Article5Hit,
  Article5Letter,
} from './article-5.js';

export { classifyAnnexIII } from './article-6-annex-iii.js';
export type { AnnexIIIResult, AnnexIIIDomainHit } from './article-6-annex-iii.js';
