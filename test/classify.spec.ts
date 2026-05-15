import { describe, it, expect } from 'vitest';
import { classify } from '../src/classify.js';

describe('classify() — Day 1 scaffold smoke', () => {
  it('exports a callable function', () => {
    expect(typeof classify).toBe('function');
  });

  it('throws on empty input', () => {
    expect(() => classify('')).toThrow(/non-empty string/);
    expect(() => classify('   ')).toThrow(/non-empty string/);
  });

  it('throws on non-string input', () => {
    // @ts-expect-error: deliberately invalid for runtime guard test
    expect(() => classify(123)).toThrow();
  });

  it('throws "not yet implemented" on valid input (placeholder)', () => {
    expect(() => classify('AI system that ranks job applicants by CV')).toThrow(
      /not yet implemented/,
    );
  });
});
