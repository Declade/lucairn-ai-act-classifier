# Changelog

All notable changes to `@lucairn/ai-act-classifier` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] — 2026-05-16

Launch-feedback fix-up. Two adversarial reviewers (Claude Code + Codex CLI) independently flagged the same 5 BLOCKER cases the day v0.1.2 shipped: the README's own example (`AI system that ranks job applicants by CV`) fired no obligations; three Article 5 prohibitions were misclassified as mere high-risk; the DE lexicon was materially weaker than EN; and explain-mode citations pointed at the Tier-3 mirror rather than EUR-Lex Tier-1. v0.1.3 closes all five reproductions plus the surrounding HIGH gaps.

### Fixed

- **BLOCKER 1 — README/CLI example now fires.** `ai-act-classify "AI system that ranks job applicants by CV"` now correctly fires Annex III ¶4(a) + the Articles 10/12/13/14/15 cascade. Closed via ~25 EN paraphrase additions to `annex_iii.4_employment` (`rank job applicants`, `ranks applicants`, `shortlist`, `recruitment`, `selection of candidates`, `evaluate job applicants`, `automated hiring`, etc.).
- **BLOCKER 2a — Real-time RBI by police now fires Article 5(1)(h).** Both EN ("Real-time remote biometric identification system deployed by police in publicly accessible spaces for law enforcement purposes") and DE ("Echtzeit-Fernidentifizierungssystem mittels biometrischer Daten im öffentlich zugänglichen Raum durch die Polizei") now fire Art 5(1)(h) prohibition with Annex III.1(a) suppressed. The lexicon entries are intentionally narrow — `biometrische fernidentifizierung` without an `echtzeit-` prefix stays Annex III ¶1(a) high-risk (forensic post-event biometric ID is high-risk, not prohibited).
- **BLOCKER 2b — Predictive policing solely on profiling now fires Article 5(1)(d).** `Predictive policing system based solely on profiling to predict that a natural person will commit a criminal offence.` now fires Art 5(1)(d). The disambiguator already accepted "solely on profiling" / "based solely on profiling" — the missing piece was a base `predictive policing` lexicon entry in `d_predictive_policing`. DE side accepts colloquial "nur auf Profiling" / "lediglich auf Profiling" via documented colloquial-paraphrase coverage.
- **BLOCKER 2c — Emotion recognition in workplace now fires Article 5(1)(f).** `Emotion recognition in the workplace.` now fires Art 5(1)(f) prohibition (was previously Annex III.1(c) + Article 50(3)). A new `hasEmotionFCarveOut()` rule-side disambiguator preserves the EUR-Lex Art 5(1)(f) second-clause medical/safety carve-out: when the input mentions "medical", "patient", "safety reason" (or DE `medizinisch`, `Patient`, `Sicherheitsgründen`) the prohibition is downgraded back to the Annex III.1(c) high-risk path, which is the correct EUR-Lex reading.
- **HIGH-1 — DE lexicon parity.** v0.1.2 DE materially weaker than EN: natural recruiting descriptions like `Bewerber sortieren`, `Kandidaten für eine Stelle zu sortieren`, `Bewertet Bewerbungen` fired nothing. v0.1.3 adds ~17 DE paraphrase entries to `annex_iii.4_employment` so the Codex reproduction `KI-System bewertet Bewerbungen, Lebensläufe und Vorstellungsgespräche, um Kandidaten für eine Stelle zu sortieren.` now correctly fires Anhang III ¶4(a).
- **HIGH-2 — Natural-paraphrase coverage.** Three reviewer-cited paraphrases close in this release: `ranks citizens by social trustworthiness and restricts access to public services` (Art 5(1)(c)), `AI system used to determine access to educational institutions` (Annex III ¶3(a)), `Real-time biometric identification by police` (Art 5(1)(h)). Plus ~12 additional EN + ~10 additional DE entries across `c_social_scoring`, `3_education`, `f_emotion_in_workplace_education`, `h_realtime_remote_biometric_le`.
- **MEDIUM-1 — Citation tier fix.** `--explain` output's primary `Citation:` line per fired article now emits the EUR-Lex Tier-1 URL (e.g. `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202401689`), not the Future of Life Institute Tier-3 mirror (artificialintelligenceact.eu). The Tier-3 mirror remains in `citations.json` as documentation provenance but is no longer the operative citation a DPIA reviewer follows.

### Changed

- **Default extractor n-gram max (`maxN`) bumped from 4 → 6.** The 4-token cap excluded EUR-Lex verbatim sub-phrases that surface as 5- or 6-token n-grams after filler words ("in the", "of a", "for the") expand the token count. The bump enables matches like "emotion recognition in the workplace" (5 tokens) and "biometric identification in publicly accessible spaces" (6 tokens). Test fixture for `extract/keyword.spec.ts` `respects opts.minN / opts.maxN` still uses an explicit `maxN: 1` override so behaviour is unchanged when callers pin the value.
- **Accuracy harness fixture cap bumped 50 → 75.** Cost-discipline guard relaxed to admit the 9 launch-feedback fixtures (`test/fixtures/use-cases/day14-launch-feedback/`).

### Added

- **9 new test fixtures** under `test/fixtures/use-cases/day14-launch-feedback/` — one per reviewer reproduction command, each carrying the verbatim input plus expected article/letters/sub-letters/cascade. Total fixture corpus: 59 (was 50). Accuracy harness reports 98.5 % overall (up from 98.2 % in v0.1.2), 100 % Article 5, 98.3 % binary high-risk.

### Not in this release (out of scope)

- **GPAI / Article 53 / Article 55 coverage.** v0.1 scope covers Article 5 prohibitions + Article 6 / Annex III high-risk + Article 50 transparency. General-purpose AI provider obligations (foundation model / large language model classification) are v0.2 scope. Reviewer-cited input `Foundation language model trained on 1 trillion tokens` correctly fires nothing in v0.1.3 — documented limitation, not a bug.
- **npm maintainer email (`contact@dsaveil.io`).** Not fixable in the repo — set by the npm account profile. Marc updates separately via npm account settings.
- **DE textarea aria-label fix.** Cross-repo (`theveil-website`); shipped separately under the lead-dev override for `lucairn-ai-act-classifier` only.

## [0.1.2] — 2026-05-16

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

[0.1.1]: https://github.com/Declade/lucairn-ai-act-classifier/releases/tag/v0.1.2
