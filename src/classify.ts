// Public API stub. Implementation lands across Day 2-10 per the build plan.

export interface ClassifyOptions {
  lang?: 'en' | 'de';
  llm?: 'anthropic' | 'openai' | 'groq';
  threeCategory?: boolean;
  rulesVersion?: string;
}

export interface ArticleMapping {
  article: string;
  applies: boolean;
  annexReference?: string;
  rationale?: string;
}

export interface ThreeCategoryMapping {
  category: '1' | '2' | '3';
  label: 'Sanitizer' | 'Evidence' | 'Inventory';
  articles: string[];
  required: boolean;
}

export interface ClassifyResult {
  inputText: string;
  detectedLang: 'en' | 'de';
  articles: ArticleMapping[];
  threeCategory: ThreeCategoryMapping[];
  prohibited: boolean;
  highRisk: boolean;
  annexIVRequired: boolean;
  confidence: number;
  mode: 'deterministic' | 'llm-anthropic' | 'llm-openai' | 'llm-groq';
  rulesVersion: string;
  rulesHash: string;
  citations: string[];
}

export function classify(text: string, _opts: ClassifyOptions = {}): ClassifyResult {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('classify(): input text must be a non-empty string.');
  }
  throw new Error(
    'classify(): not yet implemented (Day 1 scaffold). Implementation lands across Day 2-10.',
  );
}
