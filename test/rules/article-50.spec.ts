import { describe, it, expect } from 'vitest';
import { extractFeatures } from '../../src/extract/keyword.js';
import { classifyArticle5 } from '../../src/rules/article-5.js';
import { classifyArticle50 } from '../../src/rules/article-50.js';
import type { ExtractedFeatures } from '../../src/extract/keyword.js';
import type { Article5Result } from '../../src/rules/article-5.js';

function classify(input: string, lang?: 'en' | 'de') {
  const features = lang ? extractFeatures(input, { lang }) : extractFeatures(input);
  const article5 = classifyArticle5(features);
  return classifyArticle50(features, article5);
}

function makeFeatures(input: string, lang: 'en' | 'de' = 'en'): ExtractedFeatures {
  return extractFeatures(input, { lang });
}

function makeArt5(prohibited: boolean, letters: string[] = []): Article5Result {
  return {
    prohibited,
    hits: letters.map((letter) => ({
      letter: letter as Article5Result['hits'][number]['letter'],
      category_key: `${letter}_synthetic`,
      matched_phrases: [],
      summary_en: 'synthetic',
      summary_de: 'synthetic',
      source: 'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689',
    })),
    reasoning: ['synthetic'],
  };
}

describe('classifyArticle50() — pure-function determinism', () => {
  it('returns the same output for the same input', () => {
    const input = 'A chatbot that interacts directly with our customers.';
    const a = classify(input);
    const b = classify(input);
    expect(a).toEqual(b);
  });

  it('returns clean negative on empty input', () => {
    const features = extractFeatures('');
    const article5 = classifyArticle5(features);
    const result = classifyArticle50(features, article5);
    expect(result.applicable).toBe(false);
    expect(result.triggered_by.paragraph_1_chatbot).toBe(false);
    expect(result.triggered_by.paragraph_2_synthetic_content).toBe(false);
    expect(result.triggered_by.paragraph_3_emotion_or_biometric).toBe(false);
    expect(result.triggered_by.paragraph_4_deep_fake).toBe(false);
  });

  it('returns clean negative on unrelated input', () => {
    const result = classify('My cat enjoys naps on the windowsill.');
    expect(result.applicable).toBe(false);
  });

  it('throws TypeError on non-object features', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyArticle50(null, makeArt5(false))).toThrow(TypeError);
  });

  it('throws TypeError on features shape missing the input string (e.g. {})', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyArticle50({}, makeArt5(false))).toThrow(TypeError);
  });

  it('throws TypeError on non-object article5', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyArticle50(makeFeatures('hello'), null)).toThrow(TypeError);
  });

  it('throws TypeError on article5 missing hits array (e.g. {})', () => {
    // @ts-expect-error: deliberately invalid
    expect(() => classifyArticle50(makeFeatures('hello'), {})).toThrow(TypeError);
  });
});

describe('classifyArticle50() — paragraph 1 (chatbot / interaction)', () => {
  it('EN "chatbot" fires paragraph 1', () => {
    const result = classify('We deploy a chatbot for customer support.');
    expect(result.triggered_by.paragraph_1_chatbot).toBe(true);
    expect(result.applicable).toBe(true);
  });

  it('EN "virtual assistant" fires paragraph 1', () => {
    const result = classify('A virtual assistant on our website answers product questions.');
    expect(result.triggered_by.paragraph_1_chatbot).toBe(true);
  });

  it('DE "Chatbot" fires paragraph 1', () => {
    const result = classify('Wir setzen einen Chatbot für den Kundenservice ein.', 'de');
    expect(result.triggered_by.paragraph_1_chatbot).toBe(true);
  });

  it('DE "Dialogsystem" fires paragraph 1', () => {
    const result = classify('Unser Dialogsystem beantwortet Produktfragen.', 'de');
    expect(result.triggered_by.paragraph_1_chatbot).toBe(true);
  });
});

describe('classifyArticle50() — paragraph 2 (synthetic content / GPAI)', () => {
  it('EN "synthetic content" fires paragraph 2', () => {
    const result = classify('Our product generates synthetic content for marketing.');
    expect(result.triggered_by.paragraph_2_synthetic_content).toBe(true);
    expect(result.applicable).toBe(true);
  });

  it('EN "GPAI" fires paragraph 2', () => {
    const result = classify('We integrate a GPAI model into the workflow.');
    expect(result.triggered_by.paragraph_2_synthetic_content).toBe(true);
  });

  it('DE "synthetische Inhalte" fires paragraph 2', () => {
    const result = classify('Unsere Plattform erzeugt synthetische Inhalte für Marketing.', 'de');
    expect(result.triggered_by.paragraph_2_synthetic_content).toBe(true);
  });
});

describe('classifyArticle50() — paragraph 3 (emotion / biometric categorisation)', () => {
  it('EN "emotion recognition" fires paragraph 3', () => {
    const result = classify('A system that performs emotion recognition on customer interactions.');
    expect(result.triggered_by.paragraph_3_emotion_or_biometric).toBe(true);
    expect(result.applicable).toBe(true);
  });

  it('EN "biometric categorisation" fires paragraph 3', () => {
    const result = classify('We use biometric categorisation for marketing segmentation.');
    expect(result.triggered_by.paragraph_3_emotion_or_biometric).toBe(true);
  });

  it('DE "Emotionserkennung" fires paragraph 3', () => {
    const result = classify('Ein System zur Emotionserkennung bei Kundengesprächen.', 'de');
    expect(result.triggered_by.paragraph_3_emotion_or_biometric).toBe(true);
  });

  it('cascade-invariant cell: Art 5(1)(f) prohibition AND emotion-recognition phrasing → paragraph_3 SUPPRESSED', () => {
    // Workplace/education emotion recognition triggers Art 5(1)(f) absolute
    // prohibition. When that fires, Article 50(3) transparency obligation is
    // moot — a prohibited system cannot be placed on the market regardless
    // of disclosure. Mandatory cascade-invariant test per Day-4 lesson 7 +
    // dispatch step 3.
    const features = makeFeatures(
      'We use emotion recognition in the workplace to assess team morale during interviews.',
    );
    const article5WithFLetter = makeArt5(true, ['f']);
    const result = classifyArticle50(features, article5WithFLetter);
    expect(result.triggered_by.paragraph_3_emotion_or_biometric).toBe(false);
  });

  it('Art 5 prohibited WITHOUT letter f → paragraph_3 still fires on emotion phrasing', () => {
    // Suppression is letter-specific (only (f)). Other Art 5 prohibitions
    // (e.g. (h) real-time biometric ID for LE) do NOT suppress 50(3).
    const features = makeFeatures(
      'Our emotion recognition system is deployed on public transit cameras.',
    );
    const article5WithHLetter = makeArt5(true, ['h']);
    const result = classifyArticle50(features, article5WithHLetter);
    expect(result.triggered_by.paragraph_3_emotion_or_biometric).toBe(true);
  });
});

describe('classifyArticle50() — paragraph 4 (deep fakes)', () => {
  it('EN "deepfake" fires paragraph 4', () => {
    const result = classify('Our tool can produce a deepfake video of any person.');
    expect(result.triggered_by.paragraph_4_deep_fake).toBe(true);
    expect(result.applicable).toBe(true);
  });

  it('EN "deep-fake" (hyphenated) fires paragraph 4', () => {
    const result = classify('We label any deep-fake content as AI-manipulated.');
    expect(result.triggered_by.paragraph_4_deep_fake).toBe(true);
  });

  it('DE "Deepfake" fires paragraph 4', () => {
    const result = classify('Unser Werkzeug erzeugt Deepfake-Videos.', 'de');
    expect(result.triggered_by.paragraph_4_deep_fake).toBe(true);
  });
});

describe('classifyArticle50() — multi-paragraph cases', () => {
  it('chatbot that also generates synthetic content → paragraphs 1 AND 2 fire', () => {
    const result = classify('A chatbot that generates synthetic content responses.');
    expect(result.triggered_by.paragraph_1_chatbot).toBe(true);
    expect(result.triggered_by.paragraph_2_synthetic_content).toBe(true);
    expect(result.applicable).toBe(true);
  });

  it('emotion-recognition deep-fake system → paragraphs 3 AND 4 fire', () => {
    const result = classify(
      'A platform that does emotion recognition and also produces deepfake content.',
    );
    expect(result.triggered_by.paragraph_3_emotion_or_biometric).toBe(true);
    expect(result.triggered_by.paragraph_4_deep_fake).toBe(true);
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

  it('summary_en enumerates 50(2) editorial / assistive-function carve-out', () => {
    const result = classify('Our product generates synthetic content.');
    expect(result.summary_en).toContain('assistive function for standard editing');
  });

  it('summary_en enumerates 50(4) artistic / satirical work carve-out', () => {
    const result = classify('A deepfake video tool.');
    expect(result.summary_en).toContain('satirical');
  });

  it('summary_de enumerates the law-enforcement carve-out (DE)', () => {
    const result = classify('Wir setzen einen Chatbot für den Kundenservice ein.', 'de');
    expect(result.summary_de).toContain('Aufdeckung, Verhütung, Ermittlung oder Verfolgung von Straftaten');
  });

  it('source URL points at EUR-Lex (HTTPS)', () => {
    const result = classify('A chatbot.');
    expect(result.source.startsWith('https://')).toBe(true);
    expect(result.source).toMatch(/eur-lex\.europa\.eu/);
  });
});
