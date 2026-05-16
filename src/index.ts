// Public API barrel. Stable across v0.1.x.

export { classify } from './classify.js';
export type { ClassifyOptions, ClassifyResult } from './classify.js';

// Re-export rule result types so library consumers can type-check on them.
export type {
  Article5Result,
  Article5Hit,
  Article5Letter,
  AnnexIIIResult,
  AnnexIIIDomainHit,
  Article10Result,
  Article10TriggeredBy,
  Article12Result,
  Article12TriggeredBy,
  Article13Result,
  Article13TriggeredBy,
  Article14Result,
  Article14TriggeredBy,
  Article15Result,
  Article15TriggeredBy,
  Article50Result,
  Article50TriggeredBy,
  ThreeCategoryResult,
  ThreeCategoryAggregate,
  ThreeCategoryItem,
} from './rules/index.js';
export type { ExtractedFeatures, ExtractedHit } from './extract/keyword.js';

// Format module — public surface for downstream consumers that want to render
// classify() output without going through the CLI binary.
export { formatExplain } from './format/explain.js';
export type { ExplainFormatOptions } from './format/explain.js';
