# Anchor blog post draft — `@lucairn/ai-act-classifier` v0.1.1 launch

This directory ships the Day-13 hand-written anchor blog post draft (EN + DE). The drafts are **copy-paste-ready templates** that Marc places into `theveil-website/src/content/blog/eu-ai-act-classifier-launch.{en,de}.mdx` during Day-14 launch, with the website's standard frontmatter, hero image, and MDX layout integration.

## Files

| File | Purpose |
|---|---|
| `eu-ai-act-classifier-launch.en.mdx` | ~2200-word English draft. Hand-written; CLI output blocks are real `dist/cli.js` output captured during Day 13. |
| `eu-ai-act-classifier-launch.de.mdx` | ~2200-word German draft. Hand-written natural German (NOT machine-translated from EN). |
| `eu-ai-act-classifier-launch.README.md` | This file. |

## Publish workflow (Marc, Day 14)

1. Copy each draft into `theveil-website/src/content/blog/eu-ai-act-classifier-launch.{en,de}.mdx`.
2. Prepend the standard theveil-website MDX frontmatter block (see `theveil-website/src/content/blog/eu-ai-act-architecture-2026.en.mdx` for the canonical shape):
   ```mdx
   ---
   title: "We Built a Free CLI That Maps Any AI Use Case to the EU AI Act Articles It Triggers. Here's What 50 Real Cases Taught Us."
   description: "<150-char description per Lucairn buildPageMetadata helper>"
   publishedAt: "2026-05-29"
   tags: ["eu-ai-act", "compliance", "tools", "lucairn"]
   author: "Marc Schülke"
   ---
   ```
3. Verify the cross-links to `eu-ai-act-architecture-2026`, `ai-act-article-12-logging-in-practice`, and `article-50-gpai-deployers-2026` resolve (those posts already exist on lucairn.eu/{en,de}/blog).
4. Run `pnpm build` in theveil-website + edge-verify the rendered HTML on `https://lucairn.eu/{en,de}/blog/eu-ai-act-classifier-launch`.

## SEO meta (Marc-facing notes)

The launch is targeted at:

- **EU/DE compliance consultants** searching for "EU AI Act classifier", "Annex III high-risk checker", "Article 5 prohibition check"
- **AI product builders** searching for "is my AI high-risk under EU AI Act", "Annex IV technical documentation required"
- **AI Act lawyers** searching for "Article 50 GPAI transparency obligations", "AI Act compliance tool"

Suggested title (≤70 chars per the website's SEO buildPageMetadata helper):

> *"Free CLI that maps any AI use case to EU AI Act articles"*

Suggested description (≤160 chars):

> *"Built a free CLI that classifies AI use cases against Annex III, Article 5 prohibitions, and Article 50 transparency obligations. 98.2% on 50 test cases."*

Suggested keywords (in priority order):

- `eu ai act classifier`
- `annex iii high risk ai`
- `article 5 prohibited ai`
- `article 50 gpai transparency`
- `eu ai act compliance tool`
- `annex iv technical documentation`
- `regulation eu 2024 1689`
- `lucairn ai act tools`

## Cross-links (already live on lucairn.eu)

The blog draft cross-links three existing AI Act posts AND three `/tools/` pages. Verify each before publish:

- `https://lucairn.eu/{en,de}/blog/eu-ai-act-architecture-2026`
- `https://lucairn.eu/{en,de}/blog/ai-act-article-12-logging-in-practice`
- `https://lucairn.eu/{en,de}/blog/article-50-gpai-deployers-2026`
- `https://lucairn.eu/{en,de}/tools/ai-payload-inspector`
- `https://lucairn.eu/{en,de}/tools/evidence-readiness`
- `https://lucairn.eu/{en,de}/tools/mcp-risk-scanner`
- `https://lucairn.eu/{en,de}/tools/ai-act-classifier` (becomes live with this launch)

## Key shareable claims (for social-card-friendly extracts)

The blog post is designed around three credibility-moat extracts that work as standalone LinkedIn/social posts:

1. **The 50-case data point:** *"We tested it on 50 real EU AI Act cases. 98.2% accuracy overall. 100% on Article 5 prohibitions."*
2. **The 3-category framing:** *"Article 10+15 = sanitizer. Article 12+14 = evidence. Article 10+12+14+15 = inventory. The high-risk obligation surface is exactly three categories of work."*
3. **The honest disclosure:** *"It misclassifies German compound nouns 1 out of 50 times. We documented it in `KNOWN-MISCLASSIFICATIONS.md` rather than engineering around it."*

## Cross-link to Day-14 Resend blast template

The Day-14 launch will send a Resend email blast announcing the tool to:
- Lucairn waitlist (pricing page signups since 2026-04)
- Public GitHub watchers of `Declade/dual-sandbox-architecture` and `Declade/theveil-website`
- Anyone who has interacted with a Lucairn `/tools/` page (Plausible-tracked event)

The Resend template should pull the same three credibility-moat extracts and link to the published blog post. The template itself lives in `theveil-website/scripts/resend-templates/` (Marc-controlled; not shipped from this repo).

## Target audience anti-patterns

The blog post is NOT for:

- **General-tech audiences** who haven't heard of the EU AI Act. The post assumes baseline regulation literacy (knows what Annex III is, recognises "Article 5 prohibited" as a concept).
- **First-time builders** evaluating whether to comply. The post is a *classifier announcement*, not a compliance primer.
- **Sales prospects.** No CTA to book a sales call. No "talk to us about pilot pricing." The CTA is *"use the tool, fork it, break it, file a bug."*

## What this draft does NOT do

- Does NOT make accuracy claims beyond what `accuracy/REPORT.md` already documents.
- Does NOT claim the tool gives legal advice. The disclaimer is repeated.
- Does NOT credit individual alpha testers by name (per Lucairn project operating rule — credit anonymously OR not at all unless the tester explicitly authorises naming).
- Does NOT mention sub-processors. The tool is local-only by default (deterministic mode). The opt-in `--llm <provider>` mode mentions Anthropic / OpenAI / Groq as *user-supplied keys to existing accounts* — NOT as Lucairn sub-processors.
- Does NOT cite competitive products by name. We're talking about *our tool*, not against alternatives.
- Does NOT discuss pricing, deployment models, or the Lucairn product surface beyond "the classifier is part of a bigger compliance-tooling story."

## Polishing checklist (Marc, Day 14 morning)

- [ ] Verify all 5 CLI output blocks still render byte-identical (re-run `node dist/cli.js "..."` for each example; if any output drifts, regenerate the block).
- [ ] Verify the 98.2% / 100% / 98% numbers still match `accuracy/REPORT.md`.
- [ ] Verify cross-link URLs resolve 200 on lucairn.eu.
- [ ] Verify the disclaimer language matches the website's standard `<DisclaimerBlock>` component.
- [ ] Run banned-literal sweep on both drafts: legal-entity references must read `Lucairn UG (i.Gr.)` only (the retired entity name must not appear); no plan-canonical-path leaks; no real `ANTHROPIC_API_KEY` values in the example invocations.
- [ ] Run readability check on DE draft with a native German speaker (consultant-network ping; ≤ 30 minutes).
- [ ] Trigger Plausible event when blog post is published (`blog-publish-classifier-launch`).
