// Hosted-UI server action — Day-12 Part A deliverable.
//
// Copy alongside `page.tsx` + `ClassifierClient.tsx` to
// `theveil-website/src/app/[lang]/tools/ai-act-classifier/`. The classify()
// call runs server-side so the package's lexicon + rules JSON never ship to
// the browser bundle. Returns both the raw `ClassifyResult` (for future
// programmatic rendering via TagPill / structured tables) and the markdown
// `--explain` output (for v0.1.1 simple-pre rendering).

'use server';

import { classify, formatExplain } from '@lucairn/ai-act-classifier';
import type { ClassifyResult } from '@lucairn/ai-act-classifier';

// Upper bound on user input. Mirrors a sensible request-body cap; the classifier
// itself has no hard upper limit, but rendering a 10 MB paste in a server action
// would block the worker for too long. v0.2 polish: surface this limit via the
// theveil-website API-route guard layer.
const MAX_INPUT_BYTES = 8 * 1024; // 8 KiB

export async function classifyAction(
  text: string,
  lang: 'en' | 'de',
): Promise<{ result: ClassifyResult; explainMarkdown: string }> {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Input must be a non-empty string.');
  }
  if (text.length > MAX_INPUT_BYTES) {
    throw new Error(
      `Input too long (max ${MAX_INPUT_BYTES} bytes). Trim the description and retry.`,
    );
  }
  if (lang !== 'en' && lang !== 'de') {
    throw new Error('Language must be "en" or "de".');
  }

  const result = await classify(text, { lang, threeCategory: true });
  const explainMarkdown = formatExplain(result, {
    locale: lang,
    format: 'markdown',
    withExcerpt: false,
  });
  return { result, explainMarkdown };
}
