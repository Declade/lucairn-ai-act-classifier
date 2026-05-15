# @lucairn/ai-act-classifier

Free CLI that maps any AI use case description to the EU AI Act articles it triggers.

> **⚠ Status: Pre-release scaffold (v0.1.0, Day 1 of a 14-day build).**
> Build window: 2026-05-16 → 2026-05-29. The package is not yet usable; the public CLI surface lands across Day 6, classification rules across Day 3-5, and the curated test set across Day 7-8. Repo is private during build and flips public on the launch day.

## What this will do (target v0.1.0)

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

Optional LLM-augmented feature extraction (uses your own API key, never sent anywhere except the chosen provider):

```bash
ANTHROPIC_API_KEY="<your-anthropic-key>" npx @lucairn/ai-act-classifier --llm anthropic "..."
```

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
