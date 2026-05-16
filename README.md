# @lucairn/ai-act-classifier

Free CLI that maps any AI use case description to the EU AI Act articles it triggers. Zero network, zero config, zero API key in the default deterministic mode. MIT-licensed for the code; CC-BY-4.0 for the curated test corpus.

## Quick start

```bash
# Deterministic mode (default — no API key, no network)
npx @lucairn/ai-act-classifier "AI system that ranks job applicants by CV"

# --explain — reasoning trace + EUR-Lex citations + nearest-miss + disambiguator state
npx @lucairn/ai-act-classifier --explain "Emotion detection in customer-service calls"

# --explain --with-excerpt — adds curated regulator-explainer commentary
npx @lucairn/ai-act-classifier --explain --with-excerpt \
  "AI-generated political deepfake video for social-media distribution"

# Optional LLM-augmented feature extraction (uses your own API key)
ANTHROPIC_API_KEY="<your-key>" npx @lucairn/ai-act-classifier --llm anthropic \
  --explain "AI system that ranks job applicants by CV"
```

## What it does

- Classifies any free-text use-case description (EN or DE) against the EU AI Act:
  - **Article 5** prohibited practices (8 letters a-h with the Art 5(1)(d) "solely on profiling" disambiguator)
  - **Article 6 + Annex III** high-risk classification (8 domains with sub-letter narrowing where the lexicon supports it)
  - **Articles 10 / 12 / 13 / 14 / 15** high-risk-cascade obligations
  - **Article 50** transparency obligations (4 paragraph paths)
  - **Annex IV** technical-documentation requirement
- Emits Lucairn's three-category obligation overlay (Sanitizer / Evidence / Inventory)
- Cites the EUR-Lex source URL on every fired article + the EU AI Office Service Desk reference + optional Lucairn commentary
- Stamps the rules version + SHA on every output so the same input on the same rule-set is byte-reproducible
- Available as a CLI binary (this package) and as a library (`formatExplain` + `classify` exported from `@lucairn/ai-act-classifier`)

## What it does NOT do

- **Not legal advice.** Informational tool. See [Disclaimer](#disclaimer).
- **No Lucairn data processing.** Your use-case text never leaves your machine in deterministic mode. In `--llm` mode, your text is sent only to the LLM provider you choose (via your own API key) — Lucairn is not in the data path.
- **No telemetry, no analytics, no remote logging.** Source is auditable.
- **Not a substitute for an EU AI Act conformity assessment.** A high-risk classification triggers Article 9-15 obligations including a notified-body conformity assessment for certain Annex III categories. This tool helps you scope the obligations; it does not perform them.

## `--explain` flag

The `--explain` flag emits a structured reasoning trace alongside the classification:

- **Per fired article:** verbatim EUR-Lex chapeau + matched lexicon phrases + sub-letter narrowing branch + a 1-line rationale + a Tier-1 citation URL
- **Disambiguator state:** for Art 5(1)(d), surfaces whether the "solely on profiling" qualifier was satisfied (and routes to Annex III ¶6 high-risk if not)
- **Nearest-miss reasoning:** up to 2 articles that were considered but did NOT fire — e.g. cascade articles suppressed by Article 5 prohibition, or the Art 2(8) research-only carve-out
- **Optional `--with-excerpt`:** appends a hand-curated regulator-explainer paragraph from the shipped excerpt corpus (5 keys × EN+DE = 10 files at `src/content/blog-excerpts/`)

Three output formats: `--explain-format markdown` (default — consultant-paste-friendly), `--explain-format json` (structured, snapshot-stable, programmatic consumers), `--explain-format text` (plain ASCII for terminal pipes).

**Note:** `--explain` overrides `--format` / `--json` — use `--explain-format <markdown|json|text>` to choose the explain output format. `ai-act-classify --explain --format json "..."` produces the default markdown `--explain` output (the `--format json` flag is silently ignored).

The `--explain` output is designed to drop directly into a DPIA, an audit working-paper, or an EU AI Act compliance checklist as evidence of defensible classification. Every fired article cites the legislative source, and the SHA-pinned rules version makes the result reproducible.

## Modes — deterministic vs `--llm`

Default mode is **deterministic**: a curated EN+DE keyword + phrase matcher against the lexicon at `src/data/patterns.{en,de}.json`. Zero network, zero API key, zero cost. On the curated 50-case test set, deterministic mode is more accurate than any LLM mode (the corpus was shaped to match the lexicon's canonical phrases). Recommended for most use cases.

Optional `--llm <provider>` mode replaces the keyword extractor with an LLM for semantic feature extraction. The downstream rules engine — which actually selects articles — is **unchanged**. The LLM is constrained to cite phrases from the curated lexicon; any hallucinated phrase is dropped before the rules engine sees it. Three providers supported, each using your own API key:

| Provider | Default model | Cost per call (≈) | Cost per 50-fixture run (≈) |
|---|---|---|---|
| `anthropic` | Claude Haiku 4.5 | $0.003 | $0.13 |
| `openai` | GPT-4o-mini | $0.0005 | $0.025 |
| `groq` | Llama 3.3 70B Versatile | $0.0014 | $0.07 |

Pricing as of 2026-05-16. Override the model per call with `--llm <provider> --model <name>`.

### Setup for `--llm` mode

```bash
# Optional dependencies — install only the SDK(s) you'll use.
pnpm add @anthropic-ai/sdk      # for --llm anthropic
pnpm add openai                 # for --llm openai AND --llm groq (Groq reuses the OpenAI SDK)

export ANTHROPIC_API_KEY="<your-anthropic-key>"
ai-act-classify --llm anthropic "AI system that ranks job applicants by CV"

export OPENAI_API_KEY="<your-openai-key>"
ai-act-classify --llm openai "AI system that ranks job applicants by CV"

export GROQ_API_KEY="<your-groq-key>"
ai-act-classify --llm groq "AI system that ranks job applicants by CV"
```

> **LLM-mode non-determinism note.** LLMs are probabilistic; re-running on the same input may return different (correlated but not identical) features. Anthropic Haiku 4.5 was measured at 93.5–97.6 % overall accuracy across two independent runs on the 50-case corpus. The cache layer (next section) mitigates by storing first-call results — repeated runs on identical inputs are byte-stable. For reproducible classification on novel inputs, prefer deterministic mode.

## Cache layer

LLM-mode results are cached on disk at `~/.cache/lucairn-ai-act-classifier/llm/` (respects `XDG_CACHE_HOME`). The cache key is `sha256(provider + model + lexicon-version + prompt-checksum + lang + normalized-input)`, so the same input on the same rule + prompt version returns a byte-stable result without burning the API.

> **Cache file contents:** each cache entry stores the full `ExtractedFeatures` object including the original input text (so the rules engine can re-render its citation chain on a hit). Cache files are written with POSIX mode `0o600` (owner read+write only; no group or world access); the cache directory is created with mode `0o700` (owner read+write+execute only). The cache lives in your user-private `~/.cache/` directory and is not transmitted anywhere. For sensitive use-case descriptions, either run with `--no-cache` (one-off) or include `~/.cache/lucairn-ai-act-classifier/` in your session-cleanup routine (recurring).

- **Cache hit:** typically <100 ms (no network) vs ~1-5 s for a fresh API call.
- **Cache miss:** the provider runs, the result is written to cache atomically (`<key>.tmp` → `rename`), and the cached features serve every subsequent call until the lexicon version OR the prompt checksum changes.
- **Bypass:** pass `--no-cache` to force a fresh API call (the cache is neither read nor written for that invocation).
- **Invalidation:** automatic on lexicon-version bump (e.g. v0.1.2 → v0.2.0) or on any edit to the LLM system prompt / tool schema; both are part of the cache key.
- **Failed calls are not cached.** Only successful provider returns hit the cache.

To clear the cache manually: `rm -rf ~/.cache/lucairn-ai-act-classifier`.

## Architecture (one paragraph)

Rules-first hybrid. A deterministic TypeScript rules engine evaluates Article 5, 6 + Annex III, 10, 12, 13, 14, 15, and 50 against features extracted from your input. Default extraction is a keyword + phrase pattern matcher in EN+DE — works offline, no API key. The optional `--llm` mode uses your own API key to do better feature extraction; the rules engine still picks the articles deterministically. Every output cites its rule version (SHA-pinned) so the same input always produces the same classification. Source layout: `src/extract/` (keyword + lang detection + LLM providers + cache), `src/rules/` (per-article modules with cite-and-match summaries), `src/format/` (CLI table + JSON + Markdown + `--explain` output), `src/data/` (the curated lexicons + Annex III metadata + citations), `src/i18n/` (EN+DE locale bundles), `src/content/blog-excerpts/` (curated regulator-explainer commentary).

## Accuracy

The classifier is benchmarked against a 50-case bilingual fixture corpus (CC-BY-4.0): 24 Annex III high-risk + 8 Article 5 prohibited + 8 Article 50 transparency + 10 negative cases; 21 EN + 29 DE. Current numbers on the v0.1.2 rule-set:

- **Overall accuracy:** 98.2 % (granular per-field pass rate)
- **Article 5 prohibition** (safety-critical): 100.0 %
- **Binary high-risk classification:** 98.0 %

CI floor (locked): ≥ 80 % overall + 100 % Article 5. v1.0 release target: ≥ 85 % overall + 100 % Article 5 + ≥ 90 % binary high-risk.

The headline reflects internal consistency between the curated fixture corpus and the curated lexicon — not arbitrary real-world accuracy. The DE fixture corpus is written in natural German per consultant judgment, and the lexicon covers natural-German phrasings; one residual gap (compound-noun tokenisation on `Emotionserkennungssystems`) is tracked in [accuracy/KNOWN-MISCLASSIFICATIONS.md](./accuracy/KNOWN-MISCLASSIFICATIONS.md) §G-5 rather than engineered away. See [accuracy/METHODOLOGY.md](./accuracy/METHODOLOGY.md) §"Honest limitations" for the full disclosure.

Reports: [accuracy/REPORT.md](./accuracy/REPORT.md) (deterministic, CI-gated), [accuracy/REPORT.llm-anthropic.md](./accuracy/REPORT.llm-anthropic.md), [accuracy/REPORT.llm-openai.md](./accuracy/REPORT.llm-openai.md), [accuracy/REPORT.llm-groq.md](./accuracy/REPORT.llm-groq.md).

## Methodology

The classification methodology is documented at [accuracy/METHODOLOGY.md](./accuracy/METHODOLOGY.md). Key points:

- **Cite-and-match discipline.** Every fired article carries an EUR-Lex citation URL on the result object. An automated citation-verification step re-runs every `source` and `summary_*` field against EUR-Lex EN+DE before every PR merge.
- **Lexicon-first feature extraction.** The deterministic extractor matches input n-grams against a curated lexicon at `src/data/patterns.{en,de}.json`. The LLM mode uses the same lexicon as a hallucination guard — any phrase the LLM emits that is not in the lexicon is dropped before the rules engine sees it.
- **Tier-1 source allowlist.** Fixture-corpus `source_url` fields are restricted to EUR-Lex / EU AI Office Service Desk / BSI / BfDI / Bitkom — the same hosts cited in our `--explain` output.
- **Honest disclosure.** Known limitations + the v0.2 polish backlog are public at [accuracy/KNOWN-MISCLASSIFICATIONS.md](./accuracy/KNOWN-MISCLASSIFICATIONS.md).

## Citations

The classifier cites these sources, organised by regulator authority tier:

**Tier 1 — Primary regulator surfaces.**

- **EUR-Lex Regulation (EU) 2024/1689:** [EN HTML](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202401689) · [DE HTML](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=OJ:L_202401689) · [EN PDF](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689) · [DE PDF](https://eur-lex.europa.eu/legal-content/DE/TXT/PDF/?uri=OJ:L_202401689) — the canonical Tier-1 source.
- **EU AI Office Service Desk:** [ai-act-service-desk.ec.europa.eu/en](https://ai-act-service-desk.ec.europa.eu/) · [ai-act-service-desk.ec.europa.eu/de](https://ai-act-service-desk.ec.europa.eu/) — the EU AI Office's official Service Desk on the europa.eu domain.

**Tier 2 — Member-state regulator publications.**

- **BSI** (Bundesamt für Sicherheit in der Informationstechnik): [bsi.bund.de](https://www.bsi.bund.de/) — guidance on AI cybersecurity and Article 15 robustness.
- **BfDI** (Bundesbeauftragte für den Datenschutz und die Informationsfreiheit): [bfdi.bund.de](https://www.bfdi.bund.de/) — interplay of the AI Act with the GDPR.
- **Bitkom** AI Act working-group papers: [bitkom.org](https://www.bitkom.org/) — industry guidance for the German Mittelstand on AI Act implementation.

**Tier 3 — Regulation-text mirrors.**

- **Future of Life Institute** regulation-text mirror: [artificialintelligenceact.eu/en](https://artificialintelligenceact.eu/) · [artificialintelligenceact.eu/de](https://artificialintelligenceact.eu/de/) · [ai-act-law.eu/de](https://www.ai-act-law.eu/) — third-party regulation-text mirrors. The classifier's blog-excerpt corpus links here for paragraph-level deep-anchors that the EUR-Lex HTML omits. NOT regulator-authoritative; always cross-reference against EUR-Lex or the EU AI Office Service Desk.

Lucairn's commentary content cited from the `--explain --with-excerpt` blog-excerpt corpus is hand-curated original prose, MIT-licensed alongside the source code.

## Limitations + known misclassifications

The classifier intentionally does NOT:

- Distinguish provider vs deployer status. Both surfaces hit the same rule engine.
- Decide whether a system actually qualifies for a statutory carve-out (e.g. Art 50(1) law-enforcement carve-out). The carve-out language is enumerated VERBATIM in the chapeau output for the consultant to apply downstream.
- Implement full sub-letter narrowing for every Annex III paragraph. Coverage is complete across paragraphs 1-8 with conservative defaults: when narrowing is ambiguous we return an empty sub-letters array rather than over-claim.
- Normalise plurals and German morphology in the keyword extractor. Compound nouns like `Emotionserkennungssystems` are a known v0.2 gap (cite [accuracy/KNOWN-MISCLASSIFICATIONS.md](./accuracy/KNOWN-MISCLASSIFICATIONS.md) §G-5).

Found a misclassification? Open a GitHub issue with: (a) the use-case description, (b) your expected classification, (c) your reasoning citing EUR-Lex Regulation (EU) 2024/1689 paragraph numbers, and (d) the current classifier output. We respond to issues during European business hours.

## License

Code: MIT (see [LICENSE](./LICENSE)).
Test fixtures + curated blog excerpts: CC-BY-4.0 (see [DATASET-LICENSE](./DATASET-LICENSE)).

## Disclaimer

This tool is informational. It is **not legal advice**. It does not establish a lawyer-client relationship. Output must be reviewed by qualified counsel before reliance for compliance decisions. Lucairn UG (haftungsbeschränkt) i.Gr. — operated pre-incorporation by Marc Schülke as a natural person — disclaims all liability. See [LICENSE](./LICENSE) §AS-IS clause.

The classifier reflects one interpretation of the EU AI Act as of the rule-set version printed in every output. The EU AI Office publishes ongoing guidance that may change interpretation. Each output cites the regulator source so you can verify directly.

## About

Built by [Lucairn](https://lucairn.eu) — the EU AI Act compliance evidence layer. Operated pre-incorporation by Marc Schülke as a natural person; Lucairn UG (haftungsbeschränkt) i.Gr. (formation initiated, pending Handelsregister entry).

Hosted UI: `https://lucairn.eu/tools/ai-act-classifier`.

Citation:

> *Lucairn (2026), AI Act Classifier v0.1, https://lucairn.eu/tools/ai-act-classifier*
