# Accuracy report — @lucairn/ai-act-classifier

- **Rules version:** `v0.1.1`
- **Rules hash:** `5bccb27a` (full: `5bccb27af73fb79b5bfc0f5cb6b05f98fa5f5e77c43ffddca6fef01456ea58e7`)
- **Last run:** 2026-05-16T03:10:37.993Z
- **Fixture corpus:** 50 cases

> **What this report measures:** internal consistency between the curated 50-case fixture corpus and the v0.1.0 lexicon. The headline numbers below are **not** a measure of arbitrary real-world accuracy — the corpus was shaped during the Day-7 build to match the lexicon's canonical phrases. Per-fixture accuracy uses set-equality on Day-7 fixtures and subset-containment on the 11 legacy day3/4/5 fixtures pending Day-8 backfill. See [METHODOLOGY.md §"Honest limitations"](./METHODOLOGY.md#honest-limitations) for the Day-8 polish backlog. The CI floor is 80% overall + 100% Article 5; current numbers exceed both.

## Headline numbers

| Metric | Score |
|---|---|
| **Overall accuracy** (granular per-field pass rate) | **98.2%** |
| **Article 5 prohibition detection** (safety-critical) | **100.0%** |
| **Binary high-risk classification** (Annex III + Article 6) | **98.0%** |

## Per-bucket accuracy (pass-all-asserted-fields)

| Bucket | Count | Passed | Accuracy |
|---|---|---|---|
| annex_iii | 17 | 17 | 100.0% |
| article_5 | 7 | 7 | 100.0% |
| article_50 | 8 | 7 | 87.5% |
| negative | 9 | 9 | 100.0% |
| legacy | 9 | 9 | 100.0% |

## Targets vs CI floor

| | v1.0 release target | CI floor (Day 7) | Current |
|---|---|---|---|
| Overall | ≥85% | ≥80% | **98.2%** |
| Article 5 | 100% | 100% | **100.0%** |
| Binary high-risk | ≥90% | (informational) | **98.0%** |

## Per-fixture results

| Fixture | Lang | Bucket | Status | Failed fields |
|---|---|---|---|---|
| `fixture-day3-01-biometrics-prohibited-en` | en | legacy | PASS | — |
| `fixture-day3-02-critical-infrastructure-en` | en | legacy | PASS | — |
| `fixture-day3-03-education-de` | de | legacy | PASS | — |
| `fixture-day3-04-employment-en` | en | legacy | PASS | — |
| `fixture-day3-05-essential-services-life-insurance-de` | de | legacy | PASS | — |
| `fixture-day3-06-law-enforcement-broad-en` | en | legacy | PASS | — |
| `fixture-day3-07-migration-border-de` | de | legacy | PASS | — |
| `fixture-day3-08-justice-democracy-en` | en | legacy | PASS | — |
| `fixture-day4-01-low-risk-en` | en | legacy | PASS | — |
| `fixture-day5-01-art50-chatbot-en` | en | article_50 | PASS | — |
| `fixture-day5-02-art50-deepfake-de` | de | article_50 | PASS | — |
| `fixture-day7-01-annex-biometric-categorisation-de` | de | annex_iii | PASS | — |
| `fixture-day7-02-annex-emotion-recognition-en` | en | annex_iii | PASS | — |
| `fixture-day7-03-annex-remote-biometric-id-de` | de | annex_iii | PASS | — |
| `fixture-day7-04-annex-water-supply-de` | de | annex_iii | PASS | — |
| `fixture-day7-05-annex-electricity-grid-de` | de | annex_iii | PASS | — |
| `fixture-day7-06-annex-admission-en` | en | annex_iii | PASS | — |
| `fixture-day7-07-annex-grading-en` | en | annex_iii | PASS | — |
| `fixture-day7-08-annex-performance-eval-de` | de | annex_iii | PASS | — |
| `fixture-day7-09-annex-task-allocation-de` | de | annex_iii | PASS | — |
| `fixture-day7-10-annex-credit-score-en` | en | annex_iii | PASS | — |
| `fixture-day7-11-annex-health-emergency-triage-de` | de | annex_iii | PASS | — |
| `fixture-day7-12-annex-victim-risk-de` | de | annex_iii | PASS | — |
| `fixture-day7-13-annex-polygraph-en` | en | annex_iii | PASS | — |
| `fixture-day7-14-annex-asylum-application-en` | en | annex_iii | PASS | — |
| `fixture-day7-15-annex-visa-decision-de` | de | annex_iii | PASS | — |
| `fixture-day7-16-annex-judicial-research-de` | de | annex_iii | PASS | — |
| `fixture-day7-17-annex-election-influence-en` | en | annex_iii | PASS | — |
| `fixture-day7-18-art5-subliminal-de` | de | article_5 | PASS | — |
| `fixture-day7-19-art5-vulnerability-de` | de | article_5 | PASS | — |
| `fixture-day7-20-art5-social-scoring-en` | en | article_5 | PASS | — |
| `fixture-day7-21-art5-predictive-policing-de` | de | article_5 | PASS | — |
| `fixture-day7-22-art5-face-scraping-en` | en | article_5 | PASS | — |
| `fixture-day7-23-art5-emotion-workplace-de` | de | article_5 | PASS | — |
| `fixture-day7-24-art5-biometric-categorisation-sensitive-de` | de | article_5 | PASS | — |
| `fixture-day7-25-art50-customer-service-bot-de` | de | article_50 | PASS | — |
| `fixture-day7-26-art50-synthetic-marketing-image-en` | en | article_50 | PASS | — |
| `fixture-day7-27-art50-generated-music-track-de` | de | article_50 | PASS | — |
| `fixture-day7-28-art50-emotion-marketing-de` | de | article_50 | FAIL | annex_iii.high_risk, annex_iii.domains, annex_iii.sub_letters, three_category.applicable_categories, annex_iv_required, article_10.applicable, article_12.applicable, article_13.applicable, article_14.applicable, article_15.applicable |
| `fixture-day7-29-art50-political-deepfake-en` | en | article_50 | PASS | — |
| `fixture-day7-30-art50-news-summarization-de` | de | article_50 | PASS | — |
| `fixture-day7-31-neg-image-denoising-de` | de | negative | PASS | — |
| `fixture-day7-32-neg-inventory-optim-en` | en | negative | PASS | — |
| `fixture-day7-33-neg-weather-forecast-de` | de | negative | PASS | — |
| `fixture-day7-34-neg-translation-de-en` | en | negative | PASS | — |
| `fixture-day7-35-neg-code-linter-en` | en | negative | PASS | — |
| `fixture-day7-36-neg-recipe-recommend-de` | de | negative | PASS | — |
| `fixture-day7-37-neg-ad-optim-en` | en | negative | PASS | — |
| `fixture-day7-38-neg-factory-qc-de` | de | negative | PASS | — |
| `fixture-day7-39-neg-search-ranking-de` | de | negative | PASS | — |

## Misclassification details

### `fixture-day7-28-art50-emotion-marketing-de` (de, bucket: article_50)

| Field | Expected | Actual |
|---|---|---|
| `annex_iii.high_risk` | `true` | `false` |
| `annex_iii.domains` | `[1]` | `[]` |
| `annex_iii.sub_letters` | `{"1":["c"]}` | `{"1":[]}` |
| `three_category.applicable_categories` | `[1,2,3]` | `[]` |
| `annex_iv_required` | `true` | `false` |
| `article_10.applicable` | `true` | `false` |
| `article_12.applicable` | `true` | `false` |
| `article_13.applicable` | `true` | `false` |
| `article_14.applicable` | `true` | `false` |
| `article_15.applicable` | `true` | `false` |

## Methodology

See [METHODOLOGY.md](./METHODOLOGY.md) for the coverage matrix, source allowlist, formulas, and "absent field = skip" semantics.

## Citation

> *Lucairn (2026), AI Act Classifier — accuracy report v0.1, https://lucairn.eu/tools/ai-act-classifier*

> EUR-Lex Regulation (EU) 2024/1689 (full text): https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689
