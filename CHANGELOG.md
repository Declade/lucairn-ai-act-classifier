# Changelog

All notable changes to `@lucairn/ai-act-classifier` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-05-16

Article 4 (AI literacy) + GPAI Articles 53 + 55 — two new rule modules closing the two largest coverage gaps adversarial reviewers flagged on v0.1.x → v0.2.0 retests. Both modules are non-cascade roots (independent of Annex III high-risk and Article 5 prohibition status). The three-category overlay is intentionally NOT extended — neither Art 4 nor GPAI is in any Cat 1/2/3 pairing (matches the Article 50 precedent).

### Added

- **Article 4 — AI literacy rule module** (`src/rules/article-4.ts`). New non-cascade root: providers AND deployers of an AI system must ensure their staff (and other persons dealing with operation/use on their behalf) have a sufficient level of AI literacy. Horizontal obligation; no high-risk gate; no carve-out; single paragraph. Triggered via the new `article_4_ai_literacy.provider_or_deployer_with_staff` lexicon group (25 EN + 26 DE composite phrases encoding the provider-or-deployer + staff/operator combination). Verbatim Tier-1 EN+DE chapeau (Tier-2 EU AI Office Service Desk re-verified 2026-05-16 against the Tier-3 FLI mirror; corrects "on which" → "on whom" + 4 DE paraphrase drifts from a Tier-3 mirror lookup).
- **GPAI Articles 53 + 55 rule module** (`src/rules/article-53-gpai.ts`). Two distinct triggers in one module. Article 53 fires when a named foundation model OR generic foundation-model phrasing is detected. Article 55 fires iff Article 53 fired AND systemic-risk markers are detected. New `gpai_models` lexicon group with 3 sub-categories: `named_foundation_models` (32 entries — GPT, Claude, Llama, Gemini, Mistral, Mixtral, Falcon, DeepSeek, Qwen, Command R, Yi, PaLM; same list in EN + DE since model names are language-neutral proper nouns), `generic_foundation_model_phrasing` (12 EN + 10 DE entries), `systemic_risk_markers` (conservative — 8 EN + 5 DE entries; Art 55 should fire rarely). Verbatim Tier-1 EN+DE chapeaux for Art 53(1) and Art 55(1) (Tier-2 EU AI Office Service Desk; corrects "für allgemeine Zwecke" → "mit allgemeinem Verwendungszweck" drift in the Tier-3 mirror).
- **`ClassifyResult` shape extended**: now includes `article_4: Article4Result` and `gpai: GPAIResult` fields. Public API barrel re-exports new types (`Article4Result`, `Article4TriggeredBy`, `GPAIResult`, `GPAITriggeredBy`).
- **JSON Schema artifact (`dist/classify-result.schema.json`) extended** with `article_4` + `gpai` sub-schemas + new entries in the top-level `required[]`. Ajv-validation test re-runs clean across all 71 fixtures.
- **5 new test fixtures under `test/fixtures/use-cases/day15-v0.3.0/`**: `01-art4-staff-training-en`, `02-art4-staff-training-de`, `03-art53-gpt5-foundation-en`, `04-art53-llama-deployer-de` (dual-applicability — Art 53 + Art 4), `05-art55-systemic-risk-en`.
- **Per-rule spec coverage**: `test/rules/article-4.spec.ts` (16 tests) + `test/rules/article-53-gpai.spec.ts` (22 tests). Mirror the article-50.spec.ts structure (determinism + type-guards + positive/negative + verbatim chapeau assertions + source URL). Both lock the Tier-1 verbatim text against future Tier-3-mirror drift.
- **Accuracy harness extended**: `FixtureExpected` gains optional `article_4_applicable` / `gpai_article_53_applicable` / `gpai_article_55_applicable` (additive — legacy fixtures with absent fields are skipped, not failed). `day15-v0.3.0` directory added to fixture discovery.
- **2 new citations entries** (`article_4`, `gpai_articles_53_55`) in `src/data/citations.json` + `CitationArticleId` union extended.

### Changed

- **`RULES_HASH` rotated.** Two new lexicon groups + Art 4 lexicon broadening + GPAI lexicon (32 named-model entries + 12 EN + 10 DE generic-phrasing + 8 EN + 5 DE systemic-risk markers) change the SHA-256 input. Normal — every v0.1.x → v0.1.x patch rotated it. Citations.json is intentionally NOT in the hash input (per locked decision #7 — documentation provenance, not rules data).
- **Accuracy harness corpus expanded** from 66 to 71 fixtures. Overall accuracy 98.7 % → 98.8 %, binary high-risk 98.5 % → 98.6 %, Article 5 100 % (unchanged invariant). The 1 pre-existing misclassification (`fixture-day7-28-art50-emotion-marketing-de`) is unchanged — documented in v0.2.0 "Not in this release".
- **Snapshot projections extended**. `test/classify/snapshots.spec.ts` + `test/rules/snapshots.spec.ts` projections now include `article_4` + `gpai` so the snapshot diffs lock the new fields. All 35 affected snapshots regenerated; the diffs confirm only Article-4/GPAI field additions + `rules_hash` rotation appear (no other regressions).
- **Pipeline header comment** updated from "10-stage" to "12-stage" to reflect the two new non-cascade roots inserted at stage 9b + 9c (between Article 50 and the three-category overlay).
- **`formatJson` KEY_ORDER extended** with `article_4` + `gpai` in stable position (right after `article_50`, before `three_category`).

### Not in this release

- **Hosted UI `/tools/ai-act-classifier` page update.** Scoped to a separate PR on `Declade/theveil-website` (see PRD §6). Includes the bumped `@lucairn/ai-act-classifier` dependency, version badge update `0.2.0` → `0.3.0`, zero-result-UX copy that removes Art 4 + GPAI from the "what's NOT covered" enumeration, and the new Plausible-analytics scope-honesty disclosure distinguishing CLI ("no data leaves your laptop") from hosted UI scope.
- **GPAI sub-letter classification (Art 53(1) a-d, Art 55(1) a-d).** v0.3.0 surfaces the chapeau(x) verbatim; consultants apply each sub-letter downstream.
- **Wizard surface (`src/wizard/`) extension for Art 4 + GPAI**. The wizard remains 3-step (Art 5 / Annex III / Art 50). Art 4 + GPAI fire from free-text descriptions; they are not user-facing yes/no toggles in this release.
- **`fixture-day7-28-art50-emotion-marketing-de`** pre-existing misclassification — unchanged.

## [0.2.0] — 2026-05-16

Guided-wizard mode + scope-honest UX + paraphrase tightening. Triggered by Marc's live-test of v0.1.4: a ServiceNow-consultant policy question returned a terse "No prohibition, high-risk, or transparency obligation triggered" with zero context — technically correct, useless to a real user. The classifier accepts free-form text but is ONLY equipped to handle ONE shape: AI system descriptions in regulator-adjacent vocabulary. Q&A questions return "nothing triggered" with no honest scope explanation.

v0.2.0 ships the hybrid fix: keep free-text as the fast path, ADD a guided wizard for users without a system description, AND reframe the zero-result output to honestly state scope limits.

### Added

- **`--wizard` CLI flag.** Interactive 3-step Y/N prompt against Article 5(1) letters (a)–(h), Annex III paragraphs ¶1–¶8 with sub-letter narrowing, and Article 50 transparency paragraphs (1)–(5), each shown with a regulator-anchored UX summary (paragraph-level paraphrase faithful to the EUR-Lex / EU AI Office Service Desk text). Verbatim EUR-Lex chapeau text is emitted downstream by the rules engine in `--explain` output after the wizard collects answers. Bypasses free-text keyword extraction; the rule engine is unchanged. New module `src/wizard/{answers,prompts,runner}.ts` + `synthesizeWizardText()` builds a canonical text from structured answers, then the existing classify() pipeline consumes it. Output shape byte-for-byte identical to free-text mode.
- **Public exports** (`@lucairn/ai-act-classifier`): `synthesizeWizardText`, `PROMPTS_EN`, `PROMPTS_DE`, plus types `WizardAnswers`, `WizardArticle5Letter`, `AnnexIIIParagraph`, `AnnexIIISelection`, `Article50Path`, `WizardPrompts`, `PromptItem`. Library consumers (e.g., the hosted UI) can implement their own wizard surfaces against the same canonical-phrase vocabulary.

### Fixed

- **Art 5(1)(f) webcam-emotion paraphrase miss (post-v0.1.4 reviewer feedback).** Input `Workplace surveillance system that detects employee emotions via webcam during meetings` previously fired nothing. v0.2.0 adds 8 noun-phrase paraphrases to `prohibited_practices.f_emotion_in_workplace_education` plus DE equivalents.
- **Art 5(1)(g) sensitive-category-inference natural paraphrases.** v0.1.x covered only bare verb form; v0.2.0 adds 11 EN + 6 DE paraphrases including `biometric categorization to infer political opinion` family.
- **Art 50(4) deepfake-paraphrase miss.** Input `Tool that generates photorealistic synthetic videos of real people speaking words they never said` previously fired nothing. v0.2.0 adds 13 EN + 9 DE paraphrases including `synthetic video`, `photorealistic synthetic video`, `ai-generated video`, `synthetische Medien`, `KI-generierte Videos`.
- **Art 50(3) deployer disclosure narrow expansion.** Added 4 narrow EN entries without over-firing alongside Art 5(1)(g).

### Changed

- **Lexicon version bump v0.1.4 → v0.2.0.** Rules hash rotated.
- **Accuracy floor moved UP.** 66 fixtures total (was 62). Overall 98.6 % → 98.7 %, binary high-risk 98.4 % → 98.5 %, Article 5 100 % (unchanged).
- **Hosted UI scope-honest framing.** Input placeholder + label rewritten to constrain shape (system description, NOT policy question). Zero-result output reframed to explain WHAT was checked + enumerate AI Act obligations NOT covered (Art 4 AI literacy, Articles 53/55 GPAI, AI Office governance Art 64–84, penalty regime). New "Walk me through it →" CTA + Free-text / Guided tab toggle.

### Not in this release

- **GPAI Article 53/55 detection.** Still deferred.
- **Article 4 AI literacy classification.** Wizard output enumerates as out-of-scope.
- **`fixture-day7-28-art50-emotion-marketing-de`** pre-existing misclassification — unchanged.

## [0.1.4] — 2026-05-16

Launch-feedback retest fix-up. Same two adversarial reviewers (Claude Code + Codex CLI) retested v0.1.3 on its launch day. Both confirmed every v0.1.3 BLOCKER is closed and the accuracy floor holds (100 % Article 5 + ≥ 98 % overall). The Codex reviewer flagged two new paraphrase false-negatives that would burn trust with a first-contact EU/DE consultant typing realistic natural-language inputs, plus a static-copy letter-count inconsistency between the hosted UI and the README. v0.1.4 closes both paraphrase gaps + the static-copy inconsistency.

### Fixed

- **BLOCKER 3a — EN employment paraphrase now fires.** `AI system used to evaluate job applications and CVs to select candidates for employment.` previously fired no obligations because the v0.1.3 lexicon covered `evaluate job applicants` (people who applied) but not `evaluate job applications` (the application documents themselves) or `select candidates for employment`. v0.1.4 adds 9 EN paraphrases to `annex_iii.4_employment`: `evaluate job applications`, `evaluate job applications and cvs`, `evaluates job applications`, `evaluating job applications`, `select candidates for employment`, `selects candidates for employment`, `selecting candidates for employment`, `candidates for employment`, `job applications and cvs`. Sub-letter `a` narrowing list extended to include every new paraphrase. (`select candidates for a position` was considered and dropped pre-commit after the reviewer chain flagged ¶4(a) ↔ ¶4(b) ambiguity on internal-restructuring contexts.)
- **BLOCKER 3b — EN emotion-workplace paraphrase now fires Art 5(1)(f).** `AI system infers workers' emotions during customer-service calls in a workplace.` previously fired nothing because the v0.1.3 lexicon covered the rigid `infer emotions in [the] workplace` form (infinitive verb + article `the` or no article) but not natural third-person paraphrases like `infers workers' emotions` or the article-`a` form `in a workplace`. v0.1.4 adds ~14 EN paraphrases to `prohibited_practices.f_emotion_in_workplace_education`: `infers workers emotions`, `infer workers emotions`, `detect workers emotions`, `detects workers emotions`, `analyze workers emotions`, `analyse workers emotions` (UK), `infer emotions in a workplace`, `infers emotions in a workplace`, `infers emotions in workplace`, `infers emotions in the workplace`, `infers emotions in education`, `emotion detection in a workplace`, `emotion recognition in a workplace`, `emotion analysis in a workplace`. The existing `hasEmotionFCarveOut()` rule-level medical/safety carve-out invariant continues to hold across all new paraphrases.
- **HIGH-1 carry-forward (DE Bewerbenden paraphrase) — now fires.** Claude-Code reviewer's stale-from-v0.1.3 case: the natural German recruiting paraphrase `Vorauswahl von Bewerbenden` (gender-neutral participle form, common in modern DE HR-tech copy) returned nothing on v0.1.3. v0.1.4 adds 9 DE paraphrases to `annex_iii.4_employment`: `vorauswahl von bewerbenden`, `bewerbenden bewerten`, `bewerbende bewerten`, `bewerbenden auswählen`, `bewerbende auswählen`, `anwerbung von natürlichen personen` (natural-language paraphrase that maps to the regulator's verbatim `Einstellung oder Auswahl natürlicher Personen` from Verordnung (EU) 2024/1689 Anhang III Nr. 4(a)), `recruiting-system`, `personal-recruiting`, `personalrecruiting`. Sub-letter narrowing list extended.
- **Hosted-UI letter-count inconsistency (Codex reviewer MEDIUM).** The hosted UI at `lucairn.eu/tools/ai-act-classifier` said `Article 5 prohibited practices — letters (a) through (i)` (EN body), `Buchstaben (a) bis (i)` (DE body), and `letters a-i` (SoftwareApplication JSON-LD `featureList`) in three places. Article 5(1) in Regulation (EU) 2024/1689 has letters (a) through (h) — 8 letters, not 9. README was correct. Fixed in `theveil-website` companion PR; rule-side `src/rules/article-5.ts` was already correct (only fires a-h).

### Changed

- **Accuracy floor moved UP, not down.** With 3 new fixtures + 5 misclassifications-as-correct deltas: overall accuracy 98.5 % → 98.6 %, binary high-risk 98.3 % → 98.4 %, Article 5 100 % → 100 % (unchanged, the safety-critical floor holds). CI floor (≥ 80 % overall + 100 % Article 5) unchanged.
- **Fixture corpus 59 → 62.** Total +3 fixtures, all under `test/fixtures/use-cases/day14-launch-feedback/`. Bucket counts: annex_iii 20 → 22, article_5 12 → 13, article_50 / negative / legacy unchanged at 9 each. Accuracy spec + accuracy-llm spec hard-locked counts updated to match.

### Added

- **3 new test fixtures** under `test/fixtures/use-cases/day14-launch-feedback/` covering every reviewer-cited reproduction command verbatim:
  - `10-blocker3a-evaluate-job-applications-en.json` — EN employment paraphrase → Annex III ¶4(a) + cascade.
  - `11-blocker3b-workers-emotions-customer-service-en.json` — EN emotion paraphrase → Article 5(1)(f) PROHIBITED + suppression.
  - `12-blocker3c-bewerbenden-de.json` — DE Bewerbenden paraphrase → Anhang III ¶4(a) + cascade.

### Not in this release (out of scope)

- **GPAI / Article 53 / Article 55 coverage.** Both reviewers flagged this; Claude-Code explicitly deferred to v0.1.5. Codex did not list it as a BLOCKER. The work is a genuinely new rule module + GPAI-specific lexicon — too much scope for a paraphrase-coverage retest fix-up release. Deferred to v0.1.5 (post-launch credibility-arc milestone).
- **`fixture-day7-28-art50-emotion-marketing-de`** — pre-existing v0.1.3 misclassification on an article_50 emotion-marketing edge case (DE). Not introduced by v0.1.4 and not in scope for a paraphrase-coverage release. Documented limitation; will be addressed in a future article_50 polish PR.
- **npm maintainer email refresh.** Will be a no-op side-effect of publishing v0.1.4 with a freshly-authenticated `npm publish`. No code change needed.

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
