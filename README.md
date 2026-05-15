# @lucairn/ai-act-classifier

Free CLI that maps any AI use case description to the EU AI Act articles it triggers.

> **⚠ Status: Pre-release scaffold (v0.1.1, Day 10 of a 14-day build).**
> Build window: 2026-05-16 → 2026-05-29. The package is not yet usable; the public CLI surface lands across Day 6, classification rules across Day 3-5, and the curated test set across Day 7-8. Repo is private during build and flips public on the launch day.

## What this will do (target v0.1.1)

Take a free-text description of an AI use case (English or German) and return:

- Which EU AI Act articles + annexes apply (Art 5, 6, 10, 13, 14, 15, 50; Annex III, Annex IV)
- Lucairn's three-category obligation overlay (Sanitizer / Evidence / Inventory)
- Citation URLs to primary regulator sources (EUR-Lex Regulation 2024/1689, EU AI Office, BSI, BfDI)
- Confidence score + rule-version SHA so output is reproducible and defensible

## Install (post-launch)

```bash
npx @lucairn/ai-act-classifier "AI system that ranks job applicants by CV"
```

Zero config. Zero network. No API key required for the deterministic mode.

Optional LLM-augmented feature extraction with one of three providers (uses your own API key, never sent anywhere except the chosen provider):

```bash
ANTHROPIC_API_KEY="<your-key>" npx @lucairn/ai-act-classifier --llm anthropic "..."
OPENAI_API_KEY="<your-key>"    npx @lucairn/ai-act-classifier --llm openai    "..."
GROQ_API_KEY="<your-key>"      npx @lucairn/ai-act-classifier --llm groq      "..."
```

## `--llm` mode (opt-in, 3 providers)

Default mode is deterministic: a keyword + phrase matcher in EN+DE against the curated lexicon. Zero network, zero API key, zero cost. This is the recommended mode for most use cases — the deterministic accuracy is higher than the LLM mode on the curated 50-case corpus.

The optional `--llm <provider>` mode replaces the keyword extractor with an LLM for semantic feature extraction. The rules engine that selects articles is **unchanged** — only feature extraction is replaced. The LLM is constrained to cite phrases from the curated lexicon; any hallucinated phrase is dropped before the rules engine sees it.

**Supported providers and default models:**

| Provider | Default model | Cost per call (≈) | Cost per 50-fixture run (≈) |
|---|---|---|---|
| `anthropic` | Claude Haiku 4.5 | \$0.003 | \$0.13 |
| `openai` | GPT-4o-mini | \$0.0005 | \$0.025 |
| `groq` | Llama 3.3 70B Versatile | \$0.0014 | \$0.07 |

(Pricing as of dispatch date 2026-05-16. Override the model per call with the SDK's `model` parameter; the CLI currently uses defaults.)

**Setup:**

```bash
# Optional dependencies — install only the SDKs you'll use.
pnpm add @anthropic-ai/sdk      # for --llm anthropic
pnpm add openai                 # for --llm openai AND --llm groq (Groq reuses the OpenAI SDK)

export ANTHROPIC_API_KEY="<your-anthropic-key>"
ai-act-classify --llm anthropic "AI system that ranks job applicants by CV"

export OPENAI_API_KEY="<your-openai-key>"
ai-act-classify --llm openai "AI system that ranks job applicants by CV"

export GROQ_API_KEY="<your-groq-key>"
ai-act-classify --llm groq "AI system that ranks job applicants by CV"
```

> ⚠️ **LLM-mode non-determinism note.** LLMs are probabilistic; rerunning the harness on the
> same input may return different (correlated but not identical) features.
> Day-9 measured Anthropic Haiku 4.5 at **93.5%–97.6%** overall accuracy across two
> independent runs on the 50-case corpus. The cache layer (next section) mitigates
> by storing the first-call result, so re-runs on identical inputs are byte-stable.
> For reproducible classification on novel inputs, prefer the default deterministic mode.

**Day-9 accuracy delta (Anthropic) vs deterministic baseline (50-fixture corpus):**

| Metric | Deterministic (default) | `--llm anthropic` (Day 9) |
|---|---|---|
| Overall accuracy | 98.2% | 97.6% _(one of two observed runs; range 93.5–97.6%)_ |
| Article 5 prohibition detection | 100.0% | 100.0% |
| Binary high-risk classification | 98.0% | 98.0% |

OpenAI + Groq accuracy numbers will be added when the harness is run against those providers. Marc can regenerate any report on demand with `<PROVIDER>_API_KEY=... pnpm accuracy:llm-<provider>`.

The deterministic mode is generally more reliable on the curated corpus because the corpus was shaped to match the lexicon's canonical phrases. LLM mode trades reproducibility for better coverage of semantically-similar paraphrases that don't appear in the lexicon (e.g. German compound nouns like `Emotionserkennungssystems` that the deterministic n-gram extractor misses). Choose the mode that fits your input distribution.

Reports: [accuracy/REPORT.md](./accuracy/REPORT.md) (deterministic, CI-gated), [accuracy/REPORT.llm-anthropic.md](./accuracy/REPORT.llm-anthropic.md), [accuracy/REPORT.llm-openai.md](./accuracy/REPORT.llm-openai.md), and [accuracy/REPORT.llm-groq.md](./accuracy/REPORT.llm-groq.md).

## Cache layer

LLM-mode results are cached on disk at `~/.cache/lucairn-ai-act-classifier/llm/` (respects `XDG_CACHE_HOME`). The cache key is `sha256(provider + model + lexicon-version + lang + normalized-input)`, so the same input on the same lexicon version returns a byte-stable result without burning the API.

- **Cache hit:** typically <100ms (no network) vs ~1-5s for a fresh API call — well over 10× speedup on every repeat invocation.
- **Cache miss:** the provider runs, the result is written to cache, and the cached features serve every subsequent call until the lexicon version changes.
- **Bypass:** pass `--no-cache` to force a fresh API call (the cache is neither read nor written for that invocation).
- **Invalidation:** automatic on lexicon-version bump (e.g. v0.1.1 → v0.2.0); the lexicon-version is part of the cache key, so old entries are simply unreferenced after an upgrade.
- **Failed calls are not cached.** Only successful provider returns hit the cache.

To clear the cache manually: `rm -rf ~/.cache/lucairn-ai-act-classifier`.

## Architecture (one paragraph)

Rules-first hybrid. A deterministic TypeScript rules engine evaluates Article 5, 6+Annex III, 10, 13, 14, 15, 50 against features extracted from your input. Default extraction is a keyword + phrase pattern matcher in EN+DE — works offline, no API key. The optional `--llm` mode uses your own API key to do better feature extraction; the rules engine still picks the articles deterministically. Every output cites its rule version (SHA-pinned) so the same input always produces the same classification.

## Accuracy

The classifier is benchmarked against a 50-case bilingual fixture corpus (CC-BY-4.0): 24 Annex III high-risk + 8 Article 5 prohibited + 8 Article 50 transparency + 10 negative cases; 21 EN + 29 DE. Current numbers on the v0.1.1 rule-set:

- **Overall:** 98.2% (granular per-field pass rate)
- **Article 5 prohibition** (safety-critical): 100.0%
- **Binary high-risk classification:** 98.0%

CI floor (locked): ≥80% overall + 100% Article 5. v1.0 release target: ≥85% overall + 100% Article 5 + ≥90% binary high-risk.

The headline reflects internal consistency between curated fixtures and curated lexicon — not arbitrary real-world accuracy. v0.1.1 (Day 8) rewrote five Day-7 DE fixtures with natural German per consultant judgment and extended the lexicon to cover the natural-German phrasings; one residual gap surfaced (compound-noun tokenization on `Emotionserkennungssystems`) and is tracked in [accuracy/KNOWN-MISCLASSIFICATIONS.md](./accuracy/KNOWN-MISCLASSIFICATIONS.md) G-5 rather than engineered away. See [accuracy/METHODOLOGY.md](./accuracy/METHODOLOGY.md) §"Honest limitations" for the full disclosure.

Reports: [accuracy/REPORT.md](./accuracy/REPORT.md).

Found a misclassification? Open a GitHub issue with the use-case description, your expected classification, your reasoning (cite EUR-Lex Regulation (EU) 2024/1689 paragraph numbers), and the current classifier output.

## License

Code: MIT (see [LICENSE](./LICENSE)).
Test fixtures: CC-BY-4.0 (see [DATASET-LICENSE](./DATASET-LICENSE)).

## Disclaimer

This tool is informational. It is **not legal advice**. It does not establish a lawyer-client relationship. Output must be reviewed by qualified counsel before reliance for compliance decisions. Lucairn / Declade UG (i.G.) disclaim all liability. See [LICENSE](./LICENSE) §AS-IS clause.

The classifier reflects one interpretation of the EU AI Act as of the rule-set version printed in every output. The EU AI Office publishes ongoing guidance that may change interpretation. Each output cites the regulator source (EUR-Lex, EU AI Office, BSI, BfDI) so you can verify directly.

## About

Built by [Lucairn](https://lucairn.eu) — the EU AI Act compliance evidence layer. Operated by Declade UG (i.G.).

Citation:

> *Lucairn (2026), AI Act Classifier v0.1, https://lucairn.eu/tools/ai-act-classifier*
