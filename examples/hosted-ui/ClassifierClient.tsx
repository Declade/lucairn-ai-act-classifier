// Hosted-UI client component — Day-12 Part A deliverable.
//
// Copy alongside `page.tsx` + `server-action.ts` to
// `theveil-website/src/app/[lang]/tools/ai-act-classifier/`. Handles the
// textarea + language toggle + submit button + result rendering. The server
// action does the actual classify() call so the package's lexicon + rules
// never ship to the browser bundle.

'use client';

import { useState, useTransition } from 'react';
import type { ClassifyResult } from '@lucairn/ai-act-classifier';

interface Props {
  classifyAction: (
    text: string,
    lang: 'en' | 'de',
  ) => Promise<{
    result: ClassifyResult;
    explainMarkdown: string;
  }>;
}

export function ClassifierClient({ classifyAction }: Props) {
  const [input, setInput] = useState('');
  const [lang, setLang] = useState<'en' | 'de'>('en');
  const [output, setOutput] = useState<
    { result: ClassifyResult; explainMarkdown: string } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const r = await classifyAction(input, lang);
        setOutput(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Classification failed.';
        setError(msg);
        setOutput(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <label htmlFor="classifier-lang" className="text-sm font-medium">
          {/* TODO(i18n): swap "Language:" / "Sprache:" via theveil-website's i18n loader. */}
          Language:
        </label>
        <select
          id="classifier-lang"
          value={lang}
          onChange={(e) => setLang(e.target.value as 'en' | 'de')}
          className="border rounded px-2 py-1"
        >
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </select>
      </div>
      <textarea
        className="w-full min-h-[160px] border border-neutral-300 rounded p-3 text-base"
        placeholder={
          lang === 'de'
            ? 'KI-System, das Bewerber nach Lebenslauf bewertet...'
            : 'AI system that ranks job applicants by CV...'
        }
        value={input}
        onChange={(e) => setInput(e.target.value)}
        aria-label="AI use case description"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={isPending || input.trim().length === 0}
        // Plausible custom-event wire-up. The vanilla Plausible script
        // (loaded in theveil-website's root layout) reads
        // `class="plausible-event-name=<name>"` per
        // https://plausible.io/docs/custom-event-goals — NOT a
        // data-attribute. The class is concatenated to the styling
        // classes; Plausible's script-side regex picks the name out.
        // If theveil-website later migrates to the plausible-tracker
        // npm package (which uses `data-plausible-event-name`), swap
        // this class for the equivalent data attribute.
        className="plausible-event-name=classify-submit bg-black text-white px-6 py-2 rounded hover:bg-neutral-800 disabled:opacity-50"
      >
        {isPending
          ? lang === 'de'
            ? 'Klassifiziere…'
            : 'Classifying…'
          : lang === 'de'
            ? 'Klassifizieren'
            : 'Classify'}
      </button>
      {error && (
        <div
          role="alert"
          className="mt-4 border border-red-300 bg-red-50 text-red-900 rounded p-3 text-sm"
        >
          {error}
        </div>
      )}
      {output && (
        <article className="prose max-w-none mt-6 border-t pt-6">
          {/*
            For v0.1.1 we render the explain output verbatim as a <pre> block.
            v0.2 polish: render the structured `output.result` directly via a
            tag-pill component (cite-back the reused TagPill at
            `theveil-website/src/components/blog/TagPill.tsx`).
          */}
          <pre className="whitespace-pre-wrap font-sans text-sm">
            {output.explainMarkdown}
          </pre>
        </article>
      )}
    </div>
  );
}
