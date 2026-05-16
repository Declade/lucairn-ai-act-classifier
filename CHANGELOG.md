# Changelog

All notable changes to `@lucairn/ai-act-classifier` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-05-16

Initial public release. Free CLI + hosted UI that maps any free-text AI use-case description to the EU AI Act articles, paragraphs, and sub-letters it triggers.

### Added

**Classification engine — deterministic rules-first, optional LLM-mode feature extraction.**

- **Article 5 prohibited practices.** Letters (a) through (i) with disambiguator support (e.g., "solely on profiling" narrowing Art 5(1)(d) versus Annex III ¶6).
- **Article 6 + Annex III high-risk classification.** All eight Annex III domains (biometrics, critical infrastructure, education, employment, essential services, law enforcement, migration / asylum / border, justice / democracy) with sub-letter narrowing across all paragraphs.
- **Articles 10 / 12 / 13 / 14 / 15 obligation cascade.** Fires deterministically off `AnnexIIIResult.high_risk && !suppressed_by_article_5` with verbatim EUR-Lex chapeaux per article (EN + DE).
- **Article 50 transparency.** Five paragraph paths classified independently (chatbot disclosure, synthetic content marking, emotion-recognition deployment, deep-fake sub-paragraph 1, public-interest text sub-paragraph 2) with statutory carve-outs preserved verbatim.
- **Annex IV technical documentation reference.** Locale-keyed verbatim 9-item table available via `--annex iv`.
- **Lucairn three-category obligation overlay.** Category 1 Sanitizer (Articles 10 + 15), Category 2 Evidence (Articles 12 + 14), Category 3 Inventory (Articles 10 + 12 + 14 + 15). Suppressible via `--no-three-category`.

**CLI surface.**

- Single-binary entrypoint via `npx @lucairn/ai-act-classifier "..."` or `ai-act-classify` after install.
- `--explain` — reasoning trace with verbatim EUR-Lex chapeaux, matched lexicon phrases, sub-letter narrowing branch, and citation URLs per fired article. Output formats: `--explain-format markdown|text|json`.
- `--lang en|de` — locale override (auto-detected from `LANG` / `LC_ALL` env vars).
- `--format cli|json|markdown` — top-level output formatters with stable key ordering and disclaimer-footer invariants.
- `--cite` — emit a Tier-1 + Tier-2 + Tier-3 citation block (EUR-Lex + EU AI Office Service Desk + BSI / BfDI / Bitkom + Lucairn commentary).
- `--llm anthropic|openai|groq` — opt-in LLM feature extractor (user-supplied API keys; no Lucairn data path).
- `--no-cache` — disable filesystem cache layer.
- `--rules-version <v>` — assert loaded rules match a version pin (CI guard against surprise classifier upgrades).
- Exit codes: 0 = ok, 1 = Article 5 prohibition triggered, 2 = parse error, 3 = LLM error.

**Cache layer.** LLM-mode results cached on disk at `~/.cache/lucairn-ai-act-classifier/llm/` (respects `XDG_CACHE_HOME`) with mode-0600 atomic-rename writes. Cache key includes provider + model + lexicon-version + prompt-checksum + lang + normalized-input. Cache short-circuits LLM API calls on repeated identical inputs at the same rules + prompt version.

**Bilingual lexicon.** EN + DE keyword extractor with ~200 canonical phrases across Annex III domains, Article 5 prohibitions, Article 50 transparency paths, and scope-qualifier disambiguators. Every phrase carries a verbatim EUR-Lex source.

**Accuracy on a curated 50-case corpus.**

- Overall accuracy: 98.2 %
- Article 5 prohibition detection: 100.0 %
- Binary high-risk classification: 98.0 %
- LLM-mode (Anthropic Haiku 4.5): 93.5 – 97.6 % across two independent runs (non-deterministic).

The headline numbers reflect internal consistency between the curated fixture corpus and the curated lexicon — not arbitrary real-world accuracy. One documented residual gap (compound-noun tokenisation on `Emotionserkennungssystems`) is tracked in [accuracy/KNOWN-MISCLASSIFICATIONS.md](./accuracy/KNOWN-MISCLASSIFICATIONS.md) §G-5 rather than engineered away. Methodology is documented in [accuracy/METHODOLOGY.md](./accuracy/METHODOLOGY.md).

**Citations.** Every fired article carries a Tier-1 EUR-Lex URL (EN + DE PDF + HTML), a Tier-2 EU AI Office Service Desk URL (or BSI / BfDI / Bitkom equivalent where the AI Office page is not yet published), and a Tier-3 third-party regulation-text mirror URL (Future of Life Institute mirror at artificialintelligenceact.eu).

**Provider integrations** (opt-in `--llm` mode only — never touched in the default deterministic path).

- Anthropic Haiku 4.5 via `@anthropic-ai/sdk`
- OpenAI gpt-4o-mini via `openai` SDK
- Groq Llama 3.3 70B via `groq-sdk`

All three providers are user-supplied API keys. The classifier is not a Lucairn sub-processor of the chosen LLM API call.

**Hosted UI** at `https://lucairn.eu/tools/ai-act-classifier` — deterministic mode only, zero email capture, no LLM call from the hosted UI surface.

**Open source.** MIT licence for the code; CC-BY-4.0 for the curated test corpus at `test/fixtures/use-cases/`.

**JSON Schema artifact.** `dist/classify-result.schema.json` ships the JSON Schema for the public `ClassifyResult` type. Validated empirically against real `classify()` output via Ajv in the test suite.

**Sub-letter narrowing coverage.** Annex III paragraphs 1 (biometric system kind), 4 (employment phase), 5 (essential service domain), 6 (law-enforcement category), and 8 (justice / democracy branch). Annex III paragraphs 2, 3, 7 are covered by their respective domain narrowing logic.

### Honest limitations

- Single residual classification gap (compound-noun tokenisation on `Emotionserkennungssystems`) — see [accuracy/KNOWN-MISCLASSIFICATIONS.md](./accuracy/KNOWN-MISCLASSIFICATIONS.md) §G-5.
- LLM mode is non-deterministic. Repeated runs on the same input may return correlated but not identical features. For reproducible classification, prefer deterministic mode (default).
- The classifier is informational tooling. It does not perform an EU AI Act conformity assessment, does not replace your DPO, and does not give legal advice. Output should be reviewed by qualified counsel before reliance for compliance decisions.

[0.1.1]: https://github.com/Declade/lucairn-ai-act-classifier/releases/tag/v0.1.1
