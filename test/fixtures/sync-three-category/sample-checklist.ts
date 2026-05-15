// Test fixture for sync-three-category.spec.ts. Mirrors the website
// checklist-content.ts structure but with smaller, fixture-only content.
// NOT a copy of real Lucairn legal copy — synthetic placeholder text only.
//
// We DO NOT import `Locale` from the website here — the website source uses
// `Record<Locale, ChecklistContent>` because Locale is its own type alias
// over there. The sync script's AST walker reads the literal object shape
// and does NOT resolve the `Record<Locale, ...>` type annotation, so the
// fixture can use an inline string-union without breaking the parser. This
// avoids needing path-alias plumbing inside the classifier's tsconfig.test.

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
        title: "Category 1: Test fixture — sanitizer (Art. 10 + 15)",
        items: [
          { number: 1, text: "Item one EN" },
          { number: 2, text: "Item two EN" },
        ],
      },
      {
        title: "Category 2: Test fixture — evidence (Art. 12 + 14)",
        items: [
          { number: 3, text: "Item three EN" },
        ],
      },
      {
        title: "Category 3: Test fixture — inventory (Art. 10 + 12 + 14 + 15)",
        items: [
          { number: 4, text: "Item four EN" },
          { number: 5, text: "Item five EN" },
        ],
      },
    ],
    disclaimer: "Synthetic disclaimer EN.",
  },
  de: {
    categories: [
      {
        title: "Kategorie 1: Test-Fixture — Sanitizer (Art. 10 + 15)",
        items: [
          { number: 1, text: "Eintrag eins DE" },
          { number: 2, text: "Eintrag zwei DE" },
        ],
      },
      {
        title: "Kategorie 2: Test-Fixture — Nachweis (Art. 12 + 14)",
        items: [
          { number: 3, text: "Eintrag drei DE" },
        ],
      },
      {
        title: "Kategorie 3: Test-Fixture — Inventar (Art. 10 + 12 + 14 + 15)",
        items: [
          { number: 4, text: "Eintrag vier DE" },
          { number: 5, text: "Eintrag fünf DE" },
        ],
      },
    ],
    disclaimer: "Synthetischer Hinweis DE.",
  },
};
