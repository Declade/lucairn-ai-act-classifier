# Changelog

All notable changes to `@lucairn/ai-act-classifier` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Day 3 — Article 5 prohibited-practices + Article 6 / Annex III high-risk classification rule modules with EN+DE disambiguation, scope-qualifier handling, and 8-fixture snapshot test suite.** New `src/rules/article-5.ts` (8 letters a-h with the Art 5(1)(d) "solely on profiling" disambiguator), `src/rules/article-6-annex-iii.ts` (8 high-risk domains with sub-letter narrowing for domains 1, 4, 5, 6 and Annex III.5(c) life/health insurance scope rule), `src/rules/index.ts` barrel, and `src/data/annex-iii.json` (EUR-Lex-cited Annex III data for all 8 domains with EN+DE summaries). Article 5 prohibition supersedes Annex III high-risk in `classifyAnnexIII()`. `internal_use` scope qualifier never suppresses; `research_only` Art 2(8) carve-out is blocked when "real-world conditions" / "Realbedingungen" phrasing is present. 8 bilingual test fixtures at `test/fixtures/use-cases/day3/` (5 EN + 3 DE), 32 unit tests in `test/rules/article-5.spec.ts` + `test/rules/article-6-annex-iii.spec.ts`, plus 16 snapshot assertions in `test/rules/snapshots.spec.ts`.
- **Day 2 — keyword extractor + EN+DE seed lexicons:** deterministic feature extractor (`src/extract/normalize.ts`, `lang.ts`, `keyword.ts`) with NFKC normalization, EN+DE punctuation handling, hyphen-split for German compound nouns, runtime-discovered lexicon groups for v0.2+ extensibility. EN + DE seed lexicons (`src/data/patterns.{en,de}.json`) covering 8 Annex III categories + 8 Article 5 prohibited categories + 4 Article 50 transparency categories + 3 scope qualifiers (~180 phrases total) with `_meta.notice` flagging the regulator-validator verification gate. 43 unit tests across `test/extract/`. Packaging hardened: `build` script copies `src/data/` into `dist/` so the published npm tarball ships the lexicons.
- **Day 1 scaffold:** repo + `package.json` + `tsconfig.json` (Lucairn @lucairn/* TypeScript conventions), MIT license + CC-BY-4.0 dataset license, vitest config, GitHub Actions CI matrix (Node 18/20/22 × Ubuntu/macOS), README EN + DE with disclaimer + scope blocks, `src/cli.ts` + `src/classify.ts` + `src/index.ts` stubs, `test/classify.spec.ts` smoke covering empty-input and not-yet-implemented guards.

## [0.1.0] — planned

Initial public release. Will include: rules engine for Art 5 / 6+Annex III / 10 / 13 / 14 / 15 / 50, three-category overlay synced from the Lucairn website's compliance checklist source-of-truth, 50-case bilingual fixture dataset, CLI surface, hosted UI mirror at `lucairn.eu/tools/ai-act-classifier`. Release date will be backfilled at publish time.
