# Known misclassifications & v0.2 polish backlog

This document lists known classifier limitations surfaced during the Day-7+8 build of the 50-case fixture corpus + accuracy harness. As of v0.1.1 (Day 8) the harness reports 1 fixture-level misclassification on the 50-case corpus (overall 98.2%, Art 5 100.0%, binary high-risk 98.0%). The harness only checks what the fixtures pin; the items below are limitations either caught by the harness (G-5) or not currently caught. Pre-launch items closed by Day-8 are marked with closure SHAs; post-launch items remain `v0.2 fix`.

The full discussion of why the headline is a fixture-engineering metric rather than a real-world-accuracy metric lives in [`METHODOLOGY.md`](./METHODOLOGY.md) §"Honest limitations". The entries below are the concrete, actionable items.

## High-priority gaps (Day-8 / pre-launch target)

### G-1. Annex III sub-letter narrowing for paragraphs 2, 3, 7, 8

**Status: closed Day-8** (rule extension in commit `c29ac1e`; fixture backfill in commit `94be382`).

**Affected fixtures:** `fixture-day7-04` (water), `fixture-day7-05` (electricity), `fixture-day7-06` (admission), `fixture-day7-07` (grading), `fixture-day7-14` (asylum), `fixture-day7-15` (visa), `fixture-day7-16` (judicial), `fixture-day7-17` (election).
**Where:** `src/rules/article-6-annex-iii.ts` `narrowSubLetters()`.

The function only implements narrowing for Annex III paragraphs 1, 4, 5, 6. For paragraphs 2 (critical infrastructure), 3 (education), 7 (migration/border), 8 (justice/democracy), the result emits `sub_letters: []` — a "domain X applies, sub-letter unspecified" outcome. Day-7 fixtures for those domains correspondingly omit `expected.annex_iii_sub_letters` rather than pin a sub-letter expectation that the harness would fail.

**Day-8 fix:** extend `narrowSubLetters()` with case branches for paragraphs 2, 3, 7, 8. Then backfill `expected.annex_iii_sub_letters` on the 8 Day-7 fixtures listed above.

### G-2. Annex III.6(a) victim-risk lexicon coverage gap

**Status: closed Day-8** (lexicon + rule extension in commit `c185a44`; fixture-12 Path A extension in commit `87f8f4e`).

**Affected fixtures:** `fixture-day7-12` (recidivism-DE).
**Where:** `src/data/patterns.{en,de}.json` `annex_iii.6_law_enforcement`.

The fixture covers a hybrid case where a recidivism-assessment system also assesses the risk of a natural person becoming a victim of crime (Annex III.6(a)). The lexicon currently only has `rückfallrisiko` mapping to sub-letter `d`. The fixture's `expected.annex_iii_sub_letters` was narrowed to `[d]` only — the (a) coverage gap is documented in the fixture's `notes` field.

**Day-8 fix:** add EN+DE lexicon phrases for Annex III.6(a) "risk of becoming victim of a criminal offence" (e.g. `victim-risk assessment`, `opfer-risiko-bewertung`, `risikobewertung opfer`). Add sub-letter narrowing in `narrowSubLetters()` paragraph 6 branch. Update fixture expectation back to `[a, d]`.

### G-3. Plurals + German morphology not normalised

**Status: closed Day-8** (additive lexicon expansion in commit `bbd158c`; no stemmer / lemmatizer introduced per the Day-2 normalize.ts lock).

**Affected fixtures:** `fixture-day7-14` (asylum-EN — was `asylum applications`, now `each asylum application`), `fixture-day7-15` (visa-DE — was `Visumantragen`, now `jedes Visumantrag`), `fixture-day7-12` (recidivism-DE — was `des Rückfallrisikos`, now `von Rückfallrisiko bei`).
**Where:** `src/extract/normalize.ts` + `src/extract/keyword.ts`.

The keyword extractor matches n-grams against the lexicon verbatim after NFKC normalization, lowercasing, punctuation stripping, and tokenization — but no stemming or lemmatization. English plurals (`-s`, `-es`, `-ies`) and German morphological inflections (genitive `-s`, accusative `-en`, dative `-em`, irregular plurals) are NOT collapsed to canonical forms.

**Day-8 fix:** add a simple stemming pass for English (`-s`, `-es`, `-ies` → singular) and a lemma-lookup table for German irregular morphology. Alternatively, expand the lexicon to include morphological variants. The stemming path is cheaper to maintain.

### G-4. DE fixture-engineering contamination — lexicon-aligned phrasings that an EU/DE consultant would spot as unnatural

**Status: closed Day-8** (G-4(a) paraphrase variants in commit `ddf394a`; G-4(b) natural-German lexicon expansion in commit `541d94c`; fixture rewrites in commit `a6f7a1b`).

**Where:** `src/data/patterns.de.json` lexicon + 5 DE fixtures listed below.
**Surfaced by:** Day-7 PR #7 reviewer chain (bug-hunter M1; regulator-validator W-4/5/6).

Two related issues land under G-4:

**(a) Art 5(1)(d) "solely on profiling" disambiguator is substring-match, not n-gram-match.** Implemented in `src/rules/article-5.ts` as `String.prototype.includes` against the raw lower-cased input, not n-gram match against the tokenized form. Inputs that EXPRESS the disambiguator semantically but don't contain the exact substring (`ausschließlich profiling`, `solely on profiling`, `persönlichkeit ausschließlich`) will NOT trigger the prohibition — even if a real consultant would read the input as describing prohibited predictive policing. `fixture-day7-21` (predictive-policing-DE) was rewritten during Day-7 to include `ausschließlich profiling der natürlichen Person` as a literal substring.

**(b) Five DE fixtures contain phrasings shaped to match the lexicon's canonical phrases rather than natural German.** An EU/DE consultant reading them would flag the wording as wooden / lowercase compound nouns / spliced lexicon objects:

1. **`fixture-day7-19-art5-vulnerability-de.json`** — input contains `gezielt eine ausnutzung schutzbedürftigkeit von Kindern ein`. Natural German would be `nutzt gezielt die Schutzbedürftigkeit von Kindern aus`. The fixture is shaped this way because the lexicon's `b_exploitation_vulnerability` group expects the canonical compound `ausnutzung schutzbedürftigkeit` as adjacent tokens.

2. **`fixture-day7-21-art5-predictive-policing-de.json`** — input contains `vorhersagende polizeiarbeit profiling` and `ausschließlich profiling der natürlichen Person`. Natural German would be `vorhersagende Polizeiarbeit, die ausschließlich auf Profiling der natürlichen Person basiert`. The fixture is shaped this way because (a) the lexicon's `d_predictive_policing_individual` requires the 3-gram `vorhersagende polizeiarbeit profiling` and (b) Art 5(1)(d)'s `solely on profiling` disambiguator (issue G-4(a) above) requires the literal substring.

3. **`fixture-day7-23-art5-emotion-workplace-de.json`** — input contains lowercase compound nouns `emotionserkennung arbeitsplatz` and `stimmungserkennung mitarbeiter`. Natural German would be `Emotionserkennung am Arbeitsplatz` and `Stimmungserkennung der Mitarbeiter` (with proper capitalisation and prepositions). The lexicon's `f_emotion_in_workplace_education` group stores these as lowercase 2-grams without prepositions.

4. **`fixture-day7-28-art50-emotion-marketing-de.json`** — input contains `Als Emotionserkennung Betreiber`. Natural German would be `Als Betreiber eines Emotionserkennungssystems`. The lexicon's `3_emotion_biometric_categorisation_disclosure` group stores `emotionserkennung betreiber` as a single 2-gram for matching efficiency.

5. **`fixture-day7-30-art50-news-summarization-de.json`** — input contains `berichterstattung öffentliches interesse` (missing preposition). Natural German would be `Berichterstattung über Angelegenheiten von öffentlichem Interesse`. The lexicon's `4_sub2_public_interest_text` group stores `berichterstattung öffentliches interesse` as a 3-gram.

**Day-8 fix (pre-launch path):**
- For each of the 5 fixtures, expand `src/data/patterns.de.json` with natural-German variants (e.g. add `Schutzbedürftigkeit ausnutzen`, `Stimmungen der Mitarbeiter erkennen`, `Berichterstattung über Angelegenheiten von öffentlichem Interesse`) alongside the existing lexicon-canonical phrases. Then rewrite each fixture INPUT to natural German.
- For G-4(a), either (a) loosen the disambiguator to accept paraphrased forms (e.g. add `ausschließlich auf profiling`, `nur profiling`, `solely based on profiling` as accepted substrings), or (b) move the disambiguator to n-gram match against a curated lexicon group `article_5_d_disambiguator`, or (c) document the strict-substring requirement loudly in the public CLI's `--explain` output (Day 9 work) so a consultant whose input doesn't trigger 5(1)(d) sees WHY and can rephrase.

**Why this matters for credibility:** Marc's launch audience is EU/DE consultants. The "every case has REAL German phrasing — no Google-Translate" credibility moat is undercut whenever a fixture reads as wooden lexicon-aligned text. The Day-8 lexicon expansion is the single highest-leverage polish item before the 2026-05-29 public launch.

### G-5. DE compound-noun tokenization — lexicon 1-grams don't fire inside German compounds

**Status:** documented as a real residual classified miss surfaced by Day-8 G-4 fixture rewrite.
**Affected fixtures:** `fixture-day7-28` (art50-emotion-marketing-de).
**Where:** `src/extract/normalize.ts` + `src/extract/keyword.ts` n-gram tokenization.

The Day-8 G-4 rewrite of fixture-28 changed the input from "Als Emotionserkennung Betreiber..." (lexicon-aligned compound noun) to "Als Betreiber eines Emotionserkennungssystems im Customer-Marketing-Kontext..." (natural German). The lexicon hit `betreiber eines emotionserkennungssystems` (Day-8 G-4 added entry) fires Art 50(3) correctly. BUT the lexicon 1-gram `emotionserkennung` does NOT fire on the compound noun `Emotionserkennungssystems` because the extractor tokenizes on whitespace + punctuation, not compound-noun-internal-roots. Hence Annex III.1(c) high-risk emotion-recognition does NOT fire.

An EU/DE consultant reading the fixture would mark this as BOTH Annex III.1(c) high-risk (because the system IS an emotion-recognition system) AND Art 50(3) deployer (because the deployer's disclosure obligation IS triggered). The classifier currently reads it as Art 50(3) only.

**Expected vs actual:**
- expected: `annex_iii_high_risk: true, annex_iii_domains: [1], annex_iii_sub_letters: {"1": ["c"]}, article_50_paragraphs: ["50(3)"]`
- actual: `annex_iii_high_risk: false, annex_iii_domains: [], annex_iii_sub_letters: {}, article_50_paragraphs: ["50(3)"]`

**Hypothesis:** lexicon-coverage gap (no compound-noun-decomposing tokenizer for DE). The compound noun `Emotionserkennungssystems` contains `Emotionserkennung` as a morphological constituent; an extractor that did naive substring matching against the raw lower-cased input (mirroring the Art 5(1)(d) disambiguator architecture) would catch it. Or: a DE compound-noun decomposer (e.g. a hand-curated split table) would split `Emotionserkennungssystem → Emotionserkennung + System`.

**v0.2 fix candidates (rank-ordered by leverage):**
1. **Hand-curated compound-noun splits.** Add a small table (~20 entries) of DE compounds that include lexicon 1-grams: `emotionserkennungssystem → emotionserkennung`, `kreditwürdigkeitsprüfung → kreditwürdigkeit`, etc. Apply BEFORE n-gram tokenization. Low risk; predictable behavior.
2. **Naive substring fallback for high-risk Annex III categories.** When a lexicon n-gram fails to fire AND the input contains the lexicon phrase as a substring of a longer token, surface the hit with a "compound-noun fallback" reasoning tag. Higher risk (false positives on partial-word matches like `traffic` in `pacific`).
3. **Full DE compound-noun decomposer** (e.g. `compound-splitter` npm package or a hand-rolled `CharLM`-style splitter). Highest leverage; biggest engineering cost; orthogonal to the Day-2 normalize.ts lock.

**Why this is shipped honestly rather than engineered away:** Day-7 lesson logged in CLAUDE.md and Day-8 dispatch §0 — write fixtures per consultant judgment, observe misclassifications, document them. DO NOT engineer fixtures back to fit the lexicon. The 98.2% honest-with-disclosure number beats a fake 100%.

## Medium-priority gaps (Day-8 nice-to-have / v0.2 hardening)

### M-1. Annex III.4 worker-monitoring phrase coverage

**Status:** lexicon-completeness gap.
**Affected fixtures:** `fixture-day7-23` (emotion-workplace-DE — expected annex_iii_domains adjusted from `[1, 4]` to `[1]` because `mitarbeiterüberwachung` requires the literal compound, not "Mitarbeiter" + "auswertet" separately).

The `4_employment` DE lexicon includes `mitarbeiterüberwachung` as a single compound, but the fixture-23 input uses `mitarbeiter` separately. Real consultant descriptions of workplace emotion-tracking would routinely separate the words; the lexicon's monolithic compound misses them.

**Day-8 fix:** add a 2-gram pattern like `mitarbeiter überwachen`, `mitarbeiter auswerten`, `arbeitnehmer beobachten` to the lexicon, OR add a normalization pass that merges compound-collocation pairs into compound-noun candidates before lexicon lookup.

### M-2. Annex III set-equality vs subset asymmetry

**Status:** documented; intentional for v0.1 to preserve legacy semantics.
**Where:** `scripts/accuracy.ts` `checkFixture()`.

The harness uses set-equality for Day-7 fixtures (where `bucket` is present) and subset-containment for legacy day3/4/5 fixtures (matching the existing snapshot-spec semantics at `test/rules/snapshots.spec.ts:205-207`). This means a Day-7 fixture asserting `[5]` fails if the classifier also fires `[7]`; a legacy fixture would not.

**Day-8 fix:** after backfilling Day-7 fields onto the 11 legacy fixtures, unify on set-equality. The legacy subset-containment will be removed.

### M-3. No `article_50_paragraphs` on legacy day5 fixtures

**Status: closed Day-8** (backfill in commit `87f8f4e`). Both day5/01 + day5/02 now carry `bucket: "article_50"` + `source_url` + `article_50_paragraphs`. They shifted from "legacy" per-bucket counter (subset-containment) to "article_50" (set-equality); per-bucket counts in REPORT.md and the vitest spec updated accordingly.

**Affected fixtures:** `day5/01-art50-chatbot-en.json`, `day5/02-art50-deepfake-de.json`.

The 2 existing day5 fixtures cover Art 50 paragraph paths but don't carry the new `expected.article_50_paragraphs` field. The harness silently skips that check on them, so an unintended over-firing of (e.g.) 50(3) on the chatbot fixture would NOT be caught.

**Day-8 fix:** backfill `expected.article_50_paragraphs: ['50(1)']` on day5/01 and `expected.article_50_paragraphs: ['50(4)_sub1']` on day5/02. (Also backfill `bucket`, `source_url`.)

### M-4. No adversarial / out-of-distribution cases

**Status:** documented in METHODOLOGY.md §"Honest limitations" #8.

The corpus is curated and friendly. v0.2 should add 5-10 "adversarial" cases per bucket: semantically AI-Act-relevant but lexically distant; deliberate paraphrase to evade lexicon; code-switched EN/DE; consultant-jargon vs reg-text vs everyday-language variants.

**v0.2 fix:** add `test/fixtures/use-cases/day7-adversarial/` directory; expand harness to a 100+ case corpus.

### M-5. No LLM-extractor harness pass

**Status:** the `--llm` flag is reserved for Day 9; the harness only runs deterministic mode.

**v0.2 fix:** after Day 9 lands `--llm anthropic` LLM-feature-extraction, add a `pnpm accuracy:llm` variant that runs the harness with `opts.llm = 'anthropic'` and compares the two accuracy numbers. The delta measures whether LLM extraction lifts accuracy on adversarial inputs.

## Low-priority items

### L-1. The 11 legacy fixtures lack `source_url`

**Status:** additive-schema; backfilled in Day-8.

### L-2. `legacy` bucket is a catch-all

The harness lumps the 11 day3/4/5 fixtures into a single `legacy` bucket. Day-8 should re-tag them with the correct corpus bucket (annex_iii / article_5 / article_50 / negative).

### L-3. EN Article 5(1)(d) disambiguator coverage parity

The EN lexicon's Art 5(1)(d) disambiguator (`solely on profiling`, `personality only`) is symmetric to DE (`ausschließlich profiling`, `persönlichkeit ausschließlich`). When Day-8 loosens the disambiguator (G-4 above), maintain EN/DE parity in both substring sets.

## How to add an entry to this file

When the accuracy harness reveals a fixture failure that is NOT closed by re-shaping the fixture or fixing the lexicon, add an entry here with:

1. **G-N / M-N / L-N tag** — priority (G = high, M = medium, L = low).
2. **Fixture ID + URL of source.**
3. **Expected vs actual** — paste the field check that failed.
4. **Hypothesis** — fixture-side bug, lexicon-coverage gap, rule-engine narrowing gap, or genuine consultant-judgment disagreement.
5. **Pointer to the fix-up workstream** — Day-8 pre-launch polish, v0.2 post-launch hardening, or explicit consultant-input-needed flag.

This is the public-disclosure record. Better to ship "we score 100% on this corpus + these 5 known limitations" honestly than to ship a fake "100% accurate".
