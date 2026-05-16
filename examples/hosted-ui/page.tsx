// Hosted-UI page template — Day-12 Part A deliverable.
//
// Copy this file to `theveil-website/src/app/[lang]/tools/ai-act-classifier/page.tsx`
// during the Day-12 Part B integration. Self-contained: imports `classify` and
// `formatExplain` from `@lucairn/ai-act-classifier` directly as a workspace
// dependency (no `ToolWorkspace` discriminator change required).
//
// What to swap during Part B:
//   - `metadata` → use theveil-website's `buildPageMetadata` helper (mirrors
//     `src/app/[lang]/tools/ai-payload-inspector/page.tsx:7-19`).
//   - Inline English strings → theveil-website's i18n loader pattern.
//   - Plausible analytics → wire the existing site-wide Plausible script (the
//     `data-plausible-event` attribute on the submit button is already in
//     place for the wire-up).
//
// Next.js types resolved at integration time (NOT in the classifier repo's
// devDependencies — this template is shipped as source-only).

// @ts-expect-error — Next.js types resolved at theveil-website integration time.
import type { Metadata } from 'next';
import { ClassifierClient } from './ClassifierClient';
import { classifyAction } from './server-action';

// TODO(theveil-website integration): replace with `buildPageMetadata({...})`.
export const metadata: Metadata = {
  title: 'EU AI Act classifier · Lucairn',
  description:
    'Free CLI that maps any AI use case to the EU AI Act articles it triggers. Paste a description below to see article mapping, sub-letter narrowing, and EUR-Lex citations.',
};

export default function ClassifierPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">EU AI Act classifier</h1>
        {/* TODO(i18n): swap inline English strings for theveil-website's i18n loader. */}
        <p className="text-lg text-neutral-700 mt-2">
          Paste a description of your AI use case. Get the EU AI Act articles
          it triggers, Annex III paragraphs, sub-letters, and EUR-Lex citations.
        </p>
      </header>
      <ClassifierClient classifyAction={classifyAction} />
      <footer className="mt-12 text-sm text-neutral-600">
        <p>
          Informational tool. Not legal advice. Output must be reviewed by
          qualified counsel before reliance for compliance decisions.
        </p>
      </footer>
    </div>
  );
}
