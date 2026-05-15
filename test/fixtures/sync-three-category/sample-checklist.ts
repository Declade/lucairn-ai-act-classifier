// Test fixture for scripts/sync-three-category.ts.
//
// Mirrors the SHAPE of lucairn-website/compliance/checklist-content.ts
// but with stripped-down content (2 / 1 / 2 items per category instead of
// 9 / 10 / 4) so the unit tests run fast and don't break when the real
// website source changes by 1 item.
//
// The sync script's AST walker reads this file as raw text and does NOT
// resolve the `Locale` type alias. We can declare `type Locale = 'en' |
// 'de'` inline; no path-alias plumbing required in tsconfig.test.

type Locale = 'en' | 'de';

export interface ChecklistItem {
  number: number;
  text: string;
}

export interface ChecklistCategory {
  title: string;
  items: ChecklistItem[];
}

export interface ChecklistContent {
  categories: ChecklistCategory[];
  disclaimer: string;
}

export const checklistContent: Record<Locale, ChecklistContent> = {
  en: {
    categories: [
      {
        title: 'Category 1: Test fixture — sanitizer (Art. 10 + 15)',
        items: [
          { number: 1, text: 'Item one EN' },
          { number: 2, text: 'Item two EN' },
        ],
      },
      {
        title: 'Category 2: Test fixture — evidence (Art. 12 + 14)',
        items: [
          { number: 3, text: 'Item three EN' },
        ],
      },
      {
        title: 'Category 3: Test fixture — inventory (Art. 10 + 12 + 14 + 15)',
        items: [
          { number: 4, text: 'Item four EN' },
          { number: 5, text: 'Item five EN' },
        ],
      },
    ],
    disclaimer: 'Synthetic disclaimer EN.',
  },
  de: {
    categories: [
      {
        title: 'Kategorie 1: Test-Fixture — Sanitizer (Art. 10 + 15)',
        items: [
          { number: 1, text: 'Eintrag eins DE' },
          { number: 2, text: 'Eintrag zwei DE' },
        ],
      },
      {
        title: 'Kategorie 2: Test-Fixture — Nachweis (Art. 12 + 14)',
        items: [
          { number: 3, text: 'Eintrag drei DE' },
        ],
      },
      {
        title: 'Kategorie 3: Test-Fixture — Inventar (Art. 10 + 12 + 14 + 15)',
        items: [
          { number: 4, text: 'Eintrag vier DE' },
          { number: 5, text: 'Eintrag fünf DE' },
        ],
      },
    ],
    disclaimer: 'Synthetischer Hinweis DE.',
  },
};
