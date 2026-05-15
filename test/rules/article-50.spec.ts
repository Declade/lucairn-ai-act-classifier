import { describe, it, expect } from 'vitest';
import { extractFeatures } from '../../src/extract/keyword.js';
import { classifyArticle5 } from '../../src/rules/article-5.js';
import { classifyAnnexIII } from '../../src/rules/article-6-annex-iii.js';
import { classifyArticle50 } from '../../src/rules/article-50.js';
import type { ExtractedFeatures } from '../../src/extract/keyword.js';
import type { Article5Result } from '../../src/rules/article-5.js';

// Helper: run the deterministic pipeline (no annex fallback by default — pass
// `withAnnex: true` to also wire the optional Annex III fallback for 50(3)).
function classify(
  input: string,
  opts: { lang?: 'en' | 'de'; withAnnex?: boolean } = {},
) {
  const features = opts.lang
    ? extractFeatures(input, { lang: opts.lang })
    : extractFeatures(input);
  const article5 = classifyArticle5(features);
  if (opts.withAnnex === true) {
    const annex = classifyAnnexIII(features, article5);
    return classifyArticle50(features, article5, annex);
  }
  return classifyArticle50(features, article5);
}

function makeFeatures(input: string, lang: 'en' | 'de' = 'en'): ExtractedFeatures {
  return extractFeatures(input, { lang });
}

function makeArt5(prohibited: boolean): Article5Result {
  return {
    prohibited,
    hits: [],
    reasoning: ['synthetic'],
  };
}

describe('classifyArticle50() — pure-function determinism', () => {
  it('returns the same output for the same input', () => {
    const input = 'A chatbot for customer support.';
    const a = classify(input);
    const b = classify(input);
    expect(a).toEqual(b);
  });

  it('returns clean negative on empty input (50(1) chapeau still surfaced in summary)', () => {
    const features = extractFeatures('');
    const article5 = classifyArticle5(features);
    const result = classifyArticle50(features, article5);
    expect(result.applicable).toBe(false);
    expect(result.triggered_by.paragraph_1_interaction).toBe(false);
    expect(result.triggered_by.paragraph_2_synthetic_content).toBe(false);
    expect(result.triggered_by.paragraph_3_emotion_or_biometric_categorisation).toBe(false);
    expect(result.triggered_by.paragraph_4_deepfake).toBe(false);
    expect(result.triggered_by.paragraph_4_public_interest_text).toBe(false);
    // Even when not applicable, the 50(1) chapeau is surfaced so consultants
    // can read what Article 50 would require.
    expect(result.summary_en.length).toBeGreaterThan(0);
  });

  it('returns clean negative on unrelated input', () => {
    const result = classify('My cat enjoys naps on the windowsill.');
    expect(result.applicable).toBe(false);
  });

  it('throws TypeError on non-object features', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyArticle50(null, makeArt5(false))).toThrow(TypeError);
  });

  it('throws TypeError on features shape missing input/byCategory (e.g. {})', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyArticle50({}, makeArt5(false))).toThrow(TypeError);
  });

  it('throws TypeError on features array shape (e.g. [])', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyArticle50([], makeArt5(false))).toThrow(TypeError);
  });

  it('throws TypeError on non-object article5', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyArticle50(makeFeatures('hello'), null)).toThrow(TypeError);
  });

  it('throws TypeError when annex is passed but missing the domains array (e.g. {})', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyArticle50(makeFeatures('hello'), makeArt5(false), {})).toThrow(TypeError);
  });

  it('accepts annex: null (default; disables Annex III fallback)', () => {
    const features = makeFeatures('A chatbot for customer support.');
    const article5 = classifyArticle5(features);
    expect(() => classifyArticle50(features, article5, null)).not.toThrow();
  });
});

describe('classifyArticle50() — paragraph 1 (chatbot / interaction)', () => {
  it('EN "chatbot" fires paragraph 1', () => {
    const result = classify('We deploy a chatbot for customer support.');
    expect(result.triggered_by.paragraph_1_interaction).toBe(true);
    expect(result.applicable).toBe(true);
  });

  it('EN "ai assistant" fires paragraph 1', () => {
    const result = classify('An ai assistant on our website answers product questions.');
    expect(result.triggered_by.paragraph_1_interaction).toBe(true);
  });

  it('DE "Chatbot" fires paragraph 1', () => {
    const result = classify('Wir setzen einen Chatbot für den Kundenservice ein.', { lang: 'de' });
    expect(result.triggered_by.paragraph_1_interaction).toBe(true);
  });

  it('DE "Dialogsystem" fires paragraph 1', () => {
    const result = classify('Unser Dialogsystem beantwortet Produktfragen.', { lang: 'de' });
    expect(result.triggered_by.paragraph_1_interaction).toBe(true);
  });
});

describe('classifyArticle50() — paragraph 2 (synthetic content / GPAI)', () => {
  it('EN "synthetic content" fires paragraph 2', () => {
    const result = classify('Our product generates synthetic content for marketing.');
    expect(result.triggered_by.paragraph_2_synthetic_content).toBe(true);
    expect(result.applicable).toBe(true);
  });

  it('EN "generative ai" fires paragraph 2', () => {
    const result = classify('We integrate a generative ai model into the workflow.');
    expect(result.triggered_by.paragraph_2_synthetic_content).toBe(true);
  });

  it('DE "synthetische Inhalte" fires paragraph 2', () => {
    const result = classify('Unsere Plattform erzeugt synthetische Inhalte für Marketing.', { lang: 'de' });
    expect(result.triggered_by.paragraph_2_synthetic_content).toBe(true);
  });
});

describe('classifyArticle50() — paragraph 3 (emotion / biometric categorisation)', () => {
  it('EN "emotion recognition deployer" fires paragraph 3', () => {
    const result = classify('We are an emotion recognition deployer for retail analytics.');
    expect(result.triggered_by.paragraph_3_emotion_or_biometric_categorisation).toBe(true);
    expect(result.applicable).toBe(true);
  });

  it('EN "biometric categorisation deployer" fires paragraph 3', () => {
    const result = classify('Our company is a biometric categorisation deployer for marketing segmentation.');
    expect(result.triggered_by.paragraph_3_emotion_or_biometric_categorisation).toBe(true);
  });

  it('DE "Emotionserkennung Betreiber" fires paragraph 3', () => {
    const result = classify('Wir sind Emotionserkennung Betreiber im Einzelhandel.', { lang: 'de' });
    expect(result.triggered_by.paragraph_3_emotion_or_biometric_categorisation).toBe(true);
  });

  it('paragraph 3 fires via Annex III fallback when sub-letter "c" (emotion) is detected (annex passed)', () => {
    // No GPAI-side lexicon match in the input, but Annex III.1 fires with
    // sub-letter `c` (emotion recognition phrase). The optional annex
    // fallback should surface paragraph_3.
    const result = classify(
      'A retail-analytics platform that performs emotion recognition on shoppers.',
      { withAnnex: true },
    );
    expect(result.triggered_by.paragraph_3_emotion_or_biometric_categorisation).toBe(true);
  });
});

describe('classifyArticle50() — paragraph 4 (deepfakes; image/audio/video)', () => {
  it('EN "deepfake" fires paragraph 4 deepfake', () => {
    const result = classify('Our tool can produce a deepfake video of any person.');
    expect(result.triggered_by.paragraph_4_deepfake).toBe(true);
    expect(result.applicable).toBe(true);
  });

  it('EN "deep fake" (space-separated) fires paragraph 4 deepfake', () => {
    const result = classify('We label any deep fake content as AI-manipulated.');
    expect(result.triggered_by.paragraph_4_deepfake).toBe(true);
  });

  it('DE "Deepfake" fires paragraph 4 deepfake', () => {
    const result = classify('Unser Werkzeug erzeugt Deepfake-Videos.', { lang: 'de' });
    expect(result.triggered_by.paragraph_4_deepfake).toBe(true);
  });
});

describe('classifyArticle50() — paragraph 4 second sub-paragraph (public-interest text)', () => {
  it('EN "automated journalism" fires paragraph 4 public-interest text', () => {
    const result = classify('Our product is built for automated journalism on local elections.');
    expect(result.triggered_by.paragraph_4_public_interest_text).toBe(true);
    expect(result.applicable).toBe(true);
  });

  it('EN "ai-generated news" fires paragraph 4 public-interest text', () => {
    const result = classify('The platform produces ai-generated news for daily briefings.');
    expect(result.triggered_by.paragraph_4_public_interest_text).toBe(true);
  });

  it('DE "automatisierter Journalismus" fires paragraph 4 public-interest text', () => {
    const result = classify('Wir betreiben automatisierter Journalismus für lokale Wahlen.', { lang: 'de' });
    expect(result.triggered_by.paragraph_4_public_interest_text).toBe(true);
  });
});

describe('classifyArticle50() — multi-paragraph cases', () => {
  it('chatbot that also generates synthetic content → paragraphs 1 AND 2 fire', () => {
    const result = classify('A chatbot built on generative ai for customer support.');
    expect(result.triggered_by.paragraph_1_interaction).toBe(true);
    expect(result.triggered_by.paragraph_2_synthetic_content).toBe(true);
    expect(result.applicable).toBe(true);
  });

  it('emotion-recognition deployer + deepfake system → paragraphs 3 AND 4 fire', () => {
    const result = classify(
      'An emotion recognition deployer that also produces deepfake content for training videos.',
    );
    expect(result.triggered_by.paragraph_3_emotion_or_biometric_categorisation).toBe(true);
    expect(result.triggered_by.paragraph_4_deepfake).toBe(true);
  });
});

describe('classifyArticle50() — summary spot-check + source URL', () => {
  it('summary_en enumerates the law-enforcement carve-out (Art 50(1) chapeau)', () => {
    // Anti-hand-wave check: EUR-Lex Art 50(1) explicitly carves out
    // law-enforcement use authorised by law. Our summary MUST enumerate
    // this rather than gesture at "narrow exceptions".
    const result = classify('We deploy a chatbot for customer support.');
    expect(result.summary_en).toContain('detect, prevent, investigate or prosecute criminal offences');
  });

  it('summary_en enumerates 50(2) editorial / assistive-function carve-out (when applicable)', () => {
    const result = classify('Our product generates synthetic content.');
    expect(result.summary_en).toContain('assistive function for standard editing');
  });

  it('summary_en enumerates 50(4) artistic / satirical work carve-out (when applicable)', () => {
    const result = classify('A deepfake video tool.');
    expect(result.summary_en).toContain('satirical');
  });

  it('summary_en includes 50(5) format-and-timing trailer when applicable === true', () => {
    const result = classify('A chatbot for customer support.');
    expect(result.applicable).toBe(true);
    expect(result.summary_en).toContain('at the time of the first interaction or exposure');
  });

  it('summary_en omits the 50(5) trailer when applicable === false (50(1) chapeau alone)', () => {
    const features = extractFeatures('');
    const result = classifyArticle50(features, classifyArticle5(features));
    expect(result.applicable).toBe(false);
    expect(result.summary_en).not.toContain('first interaction or exposure');
    // Still includes the 50(1) chapeau citation marker so consultants know
    // what they're reading.
    expect(result.summary_en).toContain('(Art 50(1))');
  });

  it('summary_de enumerates the law-enforcement carve-out (DE)', () => {
    const result = classify('Wir setzen einen Chatbot für den Kundenservice ein.', { lang: 'de' });
    expect(result.summary_de).toContain('Aufdeckung, Verhütung, Untersuchung oder Verfolgung von Straftaten');
  });

  it('source URL points at EUR-Lex (HTTPS)', () => {
    const result = classify('A chatbot.');
    expect(result.source.startsWith('https://')).toBe(true);
    expect(result.source).toMatch(/eur-lex\.europa\.eu/);
  });
});

describe('classifyArticle50() — Article 5 interaction (sanity input only per Art 50(6))', () => {
  it('article5.prohibited === true does NOT suppress Article 50 transparency obligations', () => {
    // Per Art 50(6), Article 50 applies "without prejudice to other
    // transparency obligations." A prohibited system can still be subject
    // to Article 50 transparency obligations (downstream consultants
    // handle the prohibition separately). This is the cascade-invariant
    // cell for Article 50.
    const features = makeFeatures('Our emotion recognition deployer is rolling out across the workplace.');
    const article5Prohibited: Article5Result = {
      prohibited: true,
      hits: [
        {
          letter: 'f',
          category_key: 'f_emotion_in_workplace_education',
          matched_phrases: ['emotion recognition'],
          summary_en: 'synthetic',
          summary_de: 'synthetic',
          source: 'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689',
        },
      ],
      reasoning: ['synthetic'],
    };
    const result = classifyArticle50(features, article5Prohibited);
    // Paragraph 3 still fires — Article 5 prohibition does NOT short-circuit
    // Article 50 transparency obligation surfacing.
    expect(result.triggered_by.paragraph_3_emotion_or_biometric_categorisation).toBe(true);
    expect(result.applicable).toBe(true);
  });
});
