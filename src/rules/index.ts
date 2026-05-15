// Barrel export for the rule modules. Public API stable across v0.1.x.

export { classifyArticle5 } from './article-5.js';
export type {
  Article5Result,
  Article5Hit,
  Article5Letter,
} from './article-5.js';

export { classifyAnnexIII } from './article-6-annex-iii.js';
export type { AnnexIIIResult, AnnexIIIDomainHit } from './article-6-annex-iii.js';

export { classifyArticle10 } from './article-10.js';
export type { Article10Result, Article10TriggeredBy } from './article-10.js';

export { classifyArticle12 } from './article-12.js';
export type { Article12Result, Article12TriggeredBy } from './article-12.js';

export { classifyArticle13 } from './article-13.js';
export type { Article13Result, Article13TriggeredBy } from './article-13.js';

export { classifyArticle14 } from './article-14.js';
export type { Article14Result, Article14TriggeredBy } from './article-14.js';

export { classifyArticle15 } from './article-15.js';
export type { Article15Result, Article15TriggeredBy } from './article-15.js';

export { classifyArticle50 } from './article-50.js';
export type { Article50Result, Article50TriggeredBy } from './article-50.js';

export { classifyThreeCategory } from './three-category.js';
export type {
  ThreeCategoryResult,
  ThreeCategoryAggregate,
  ThreeCategoryItem,
  ThreeCategoryInputs,
} from './three-category.js';
