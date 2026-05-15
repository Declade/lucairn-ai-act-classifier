# Changelog

All notable changes to `@lucairn/ai-act-classifier` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Day 2 — keyword extractor + EN+DE seed lexicons:** deterministic feature extractor (`src/extract/normalize.ts`, `lang.ts`, `keyword.ts`) with NFKC normalization, EN+DE punctuation handling, hyphen-split for German compound nouns, runtime-discovered lexicon groups for v0.2+ extensibility. EN + DE seed lexicons (`src/data/patterns.{en,de}.json`) covering 8 Annex III categories + 8 Article 5 prohibited categories + 4 Article 50 transparency categories + 3 scope qualifiers (~180 phrases total) with `_meta.notice` flagging the regulator-validator verification gate. 43 unit tests across `test/extract/`. Packaging hardened: `build` script copies `src/data/` into `dist/` so the published npm tarball ships the lexicons.
- **Day 1 scaffold:** repo + `package.json` + `tsconfig.json` (Lucairn @lucairn/* TypeScript conventions), MIT license + CC-BY-4.0 dataset license, vitest config, GitHub Actions CI matrix (Node 18/20/22 × Ubuntu/macOS), README EN + DE with disclaimer + scope blocks, `src/cli.ts` + `src/classify.ts` + `src/index.ts` stubs, `test/classify.spec.ts` smoke covering empty-input and not-yet-implemented guards.

## [0.1.0] — planned

Initial public release. Will include: rules engine for Art 5 / 6+Annex III / 10 / 13 / 14 / 15 / 50, three-category overlay synced from the Lucairn website's compliance checklist source-of-truth, 50-case bilingual fixture dataset, CLI surface, hosted UI mirror at `lucairn.eu/tools/ai-act-classifier`. Release date will be backfilled at publish time.
