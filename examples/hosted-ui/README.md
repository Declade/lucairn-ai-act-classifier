# Hosted UI integration template

Ready-to-copy Next.js page template for hosting the AI Act classifier at `lucairn.eu/tools/ai-act-classifier`.

## Files

| File | Role |
|---|---|
| `page.tsx` | Server component. Renders header + classifier + disclaimer footer. Sets `Metadata`. |
| `ClassifierClient.tsx` | Client component. Textarea + language toggle + submit button + result rendering. |
| `server-action.ts` | Server action. Validates input + calls `classify()` + `formatExplain()`. |

Total: ~140 lines of TypeScript across three files. No `ToolWorkspace` integration required — fully self-contained.

## Integration steps (estimated 30-60 min)

1. Copy this directory's contents to `theveil-website/src/app/[lang]/tools/ai-act-classifier/`:

   ```bash
   mkdir -p ~/theveil-website/src/app/\[lang\]/tools/ai-act-classifier
   cp ~/lucairn-ai-act-classifier/examples/hosted-ui/*.{tsx,ts} \
      ~/theveil-website/src/app/\[lang\]/tools/ai-act-classifier/
   ```

2. Add `@lucairn/ai-act-classifier` as a workspace dependency in `theveil-website/package.json`:
   - Pre-Day-14 (npm not yet published): use `workspace:*` if both repos share a pnpm workspace, OR `file:../lucairn-ai-act-classifier` for a non-workspace local link.
   - Post-Day-14 (after `pnpm publish` ships v0.1.1 to npm): use `"^0.1.1"`.

3. Replace the placeholder `metadata` block in `page.tsx` with theveil-website's `buildPageMetadata` helper (mirrors `src/app/[lang]/tools/ai-payload-inspector/page.tsx:7-19`):

   ```typescript
   import { buildPageMetadata } from "@/lib/seo/page-metadata";
   import { isValidLocale } from "@/i18n/config";

   export async function generateMetadata({ params }: PageProps<"/[lang]/tools/ai-act-classifier">): Promise<Metadata> {
     const { lang } = await params;
     if (!isValidLocale(lang)) return {};
     return buildPageMetadata({
       path: "/tools/ai-act-classifier",
       lang,
       title: "EU AI Act classifier · Lucairn",
       description: "Free CLI that maps any AI use case to the EU AI Act articles it triggers. Article 5 prohibited, Article 6 + Annex III high-risk, Article 50 transparency, sub-letter narrowing, EUR-Lex citations.",
     });
   }
   ```

4. Replace inline English/German strings in `page.tsx` + `ClassifierClient.tsx` with theveil-website's i18n loader pattern (look for `TODO(i18n)` markers in the source).

5. Wire up Plausible analytics: the submit button already has `data-plausible-event="classify-submit"`. Confirm theveil-website's root layout's Plausible script propagates `data-plausible-event` attributes (or replace with the site's existing helper, e.g. `usePlausible()`).

6. Add the page's route to the existing sitemap source-of-truth (theveil-website's `src/lib/seo/sitemap.ts` or equivalent).

7. Local-test:

   ```bash
   cd ~/theveil-website
   pnpm install
   pnpm dev
   open http://localhost:3000/en/tools/ai-act-classifier
   open http://localhost:3000/de/tools/ai-act-classifier
   ```

8. Deploy via theveil-website's standard manual deploy:

   ```bash
   ssh deploy@<hetzner-ip> /opt/bin/deploy-website.sh
   ```

## Architecture notes

- **Server-side classify.** The classify() call runs in the server action. The classifier's lexicon + rules JSON never ship to the browser bundle. Bundle-size impact on the client is exactly the React-state machinery for the textarea + lang toggle (no classifier code crosses the boundary).
- **Cache layer.** The server-side `~/.cache/lucairn-ai-act-classifier/` cache is process-local on the host. For high-traffic deployments, add a server-action-level memoization (e.g. LRU keyed by `sha256(input + lang)`) — v0.2 polish.
- **LLM mode.** The hosted UI runs in deterministic mode only. LLM mode (`--llm anthropic` etc.) needs an `apiKey` parameter — exposing that surface in the hosted UI is a v0.2 feature; until then, point LLM-mode users at the CLI.
- **Plausible:** `data-plausible-event="classify-submit"` is the wire-up surface; theveil-website's root layout's Plausible script propagates the event.
- **TagPill rendering (v0.2).** The current implementation renders the markdown `--explain` output verbatim in a `<pre>` block. The plan canonical Day 12 row (line 245) calls for reusing `theveil-website/src/components/blog/TagPill.tsx`; v0.2 polish replaces the `<pre>` block with structured tag pills per fired article.
- **Input cap.** `server-action.ts` enforces `MAX_INPUT_BYTES = 8192`; mirror this in any API-route guard layer theveil-website wraps around the server action.

## Validation

After integration, smoke-test the page end-to-end:

1. Open `/en/tools/ai-act-classifier`.
2. Paste: `Our AI tool performs CV screening and applicant tracking, ranks candidates, and supports the hiring decision for our enterprise customers.`
3. Click **Classify**.
4. Expect: result shows Annex III ¶4 employment fired with sub-letter (a).
5. Switch language to **Deutsch** and paste a German use-case (e.g. `KI-System zur Bewertung von Bewerbern anhand des Lebenslaufs.`).
6. Expect: same classification, German labels in the explain block.

## Cross-references

- Plan canonical row: `~/.claude/plans/ok-lets-plan-this-fluffy-graham.md` line 245.
- Page-template reference (mirror): `theveil-website/src/app/[lang]/tools/ai-payload-inspector/page.tsx`.
- Public API barrel: `src/index.ts` in this repo.
