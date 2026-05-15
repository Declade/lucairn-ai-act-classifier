// Tests for src/util/article-50-paragraphs.ts — the projection helper that
// the accuracy harness uses to compare expected paragraph paths against the
// actual `Article50Result.triggered_by` shape.
//
// Coverage:
//   1. Type-guards reject null / arrays / missing triggered_by.
//   2. Empty result (no paragraphs fired) → empty array.
//   3. Each of the 5 paragraph triggers fires individually.
//   4. Multi-fire emits sorted, deduplicated paragraph ids.
//   5. 50(4) sub-1 vs sub-2 disambiguation (both can fire simultaneously).
//   6. 50(5) is NOT emitted (it's format-and-timing trailer, not an
//      independent fire — see helper file header for rationale).
//   7. End-to-end via classifyArticle50 on a synthesized `chatbot` features
//      object — exercises the real production path the harness uses.

import { describe, it, expect } from 'vitest';
import {
  projectArticle50Paragraphs,
  type Article50Paragraph,
} from '../../src/util/article-50-paragraphs.js';
import type { Article50Result } from '../../src/rules/article-50.js';
import { extractFeatures } from '../../src/extract/keyword.js';
import { classifyArticle5 } from '../../src/rules/article-5.js';
import { classifyArticle50 } from '../../src/rules/article-50.js';

function makeResult(
  overrides: Partial<Article50Result['triggered_by']> = {},
  applicable = true,
): Article50Result {
  const triggered_by: Article50Result['triggered_by'] = {
    paragraph_1_interaction: false,
    paragraph_2_synthetic_content: false,
    paragraph_3_emotion_or_biometric_categorisation: false,
    paragraph_4_deepfake: false,
    paragraph_4_public_interest_text: false,
    ...overrides,
  };
  return {
    applicable,
    triggered_by,
    summary_en: '',
    summary_de: '',
    source: '',
  };
}

describe('projectArticle50Paragraphs', () => {
  it('throws TypeError on null input', () => {
    expect(() =>
      projectArticle50Paragraphs(null as unknown as Article50Result),
    ).toThrow(TypeError);
  });

  it('throws TypeError on array input', () => {
    expect(() =>
      projectArticle50Paragraphs([] as unknown as Article50Result),
    ).toThrow(TypeError);
  });

  it('throws TypeError on missing triggered_by', () => {
    expect(() =>
      projectArticle50Paragraphs(
        { applicable: false } as unknown as Article50Result,
      ),
    ).toThrow(TypeError);
  });

  it('returns empty array when no paragraph fired', () => {
    const result = makeResult({}, false);
    expect(projectArticle50Paragraphs(result)).toEqual([]);
  });

  it('emits 50(1) when paragraph_1_interaction fires', () => {
    const result = makeResult({ paragraph_1_interaction: true });
    expect(projectArticle50Paragraphs(result)).toEqual(['50(1)']);
  });

  it('emits 50(2) when paragraph_2_synthetic_content fires', () => {
    const result = makeResult({ paragraph_2_synthetic_content: true });
    expect(projectArticle50Paragraphs(result)).toEqual(['50(2)']);
  });

  it('emits 50(3) when paragraph_3 fires', () => {
    const result = makeResult({
      paragraph_3_emotion_or_biometric_categorisation: true,
    });
    expect(projectArticle50Paragraphs(result)).toEqual(['50(3)']);
  });

  it('emits 50(4)_sub1 for deep-fake path', () => {
    const result = makeResult({ paragraph_4_deepfake: true });
    expect(projectArticle50Paragraphs(result)).toEqual(['50(4)_sub1']);
  });

  it('emits 50(4)_sub2 for public-interest-text path', () => {
    const result = makeResult({ paragraph_4_public_interest_text: true });
    expect(projectArticle50Paragraphs(result)).toEqual(['50(4)_sub2']);
  });

  it('emits both sub-paragraphs when 50(4) sub-1 AND sub-2 fire together', () => {
    const result = makeResult({
      paragraph_4_deepfake: true,
      paragraph_4_public_interest_text: true,
    });
    expect(projectArticle50Paragraphs(result)).toEqual([
      '50(4)_sub1',
      '50(4)_sub2',
    ]);
  });

  it('emits paragraphs in ASCII-sorted order regardless of trigger order', () => {
    const result = makeResult({
      paragraph_4_public_interest_text: true,
      paragraph_1_interaction: true,
      paragraph_3_emotion_or_biometric_categorisation: true,
    });
    expect(projectArticle50Paragraphs(result)).toEqual([
      '50(1)',
      '50(3)',
      '50(4)_sub2',
    ]);
  });

  it('emits all 5 paragraphs when every trigger fires', () => {
    const result = makeResult({
      paragraph_1_interaction: true,
      paragraph_2_synthetic_content: true,
      paragraph_3_emotion_or_biometric_categorisation: true,
      paragraph_4_deepfake: true,
      paragraph_4_public_interest_text: true,
    });
    const out = projectArticle50Paragraphs(result);
    expect(out).toEqual([
      '50(1)',
      '50(2)',
      '50(3)',
      '50(4)_sub1',
      '50(4)_sub2',
    ] as Article50Paragraph[]);
  });

  it('NEVER emits a synthetic "50(5)" tag (format-and-timing trailer is implicit)', () => {
    const result = makeResult({ paragraph_1_interaction: true });
    const out = projectArticle50Paragraphs(result);
    // Cast assertion is intentional: '50(5)' is NOT a valid Article50Paragraph
    // value — this test pins that exclusion at the type AND runtime level.
    expect(out as readonly string[]).not.toContain('50(5)');
  });

  it('end-to-end via classifyArticle50: "chatbot" EN input → ["50(1)"]', () => {
    const features = extractFeatures(
      'We deploy a chatbot to help users navigate the website.',
      { lang: 'en' },
    );
    const article5 = classifyArticle5(features);
    const article50 = classifyArticle50(features, article5, null);
    expect(projectArticle50Paragraphs(article50)).toEqual(['50(1)']);
  });

  it('end-to-end via classifyArticle50: DE deepfake input → ["50(4)_sub1"]', () => {
    const features = extractFeatures(
      'Unsere Plattform erzeugt Deepfake-Videos für Demo-Zwecke.',
      { lang: 'de' },
    );
    const article5 = classifyArticle5(features);
    const article50 = classifyArticle50(features, article5, null);
    expect(projectArticle50Paragraphs(article50)).toEqual(['50(4)_sub1']);
  });
});
