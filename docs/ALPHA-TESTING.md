# Internal alpha test — @lucairn/ai-act-classifier v0.1.1

**Purpose:** validate the classifier against EU/DE consultant judgment on 5 representative test cases × 2 locales BEFORE the 2026-05-29 public launch. The credibility-moat-for-launch claim ("informational tool tuned with EU/DE consultant judgment, not a generic LLM wrapper") needs at least 3-5 real consultants to sign off on the worked examples before we publicly cite their judgment as the corpus design input.

**Owner:** Marc (Lucairn UG founder).
**Window:** Day 13 → Day 14 morning. Decision gate before launch.
**Distribution:** personal email to 3-5 EU/DE compliance consultants (Bitkom WG members, BfDI working-group contacts, named LinkedIn contacts who have engaged with Lucairn's public AI-Act work).

This doc is a **template + recipe**, not a script. Edit before sending.

---

## Test cases

For each case the tester should:

1. Read the input text.
2. Form their own professional classification judgment BEFORE running the CLI.
3. Run the CLI: `npx -y @lucairn/ai-act-classifier "<input>"` (or use `--lang de` for DE inputs).
4. Compare actual vs expected.
5. Flag any disagreement in the feedback form below.

The CLI deterministic accuracy on the 50-case fixture corpus is 98.2% overall / 100.0% on Article 5 / 98.0% on binary high-risk (see `accuracy/REPORT.md`). The alpha test is NOT an accuracy harness — it's a sanity check against fresh professional judgment.

---

### Case 1 — Employment screening (EN + DE)

**Input (EN):**
> Our AI tool screens CVs and ranks job applicants based on resume content and predicted job-fit scores; HR teams use the candidate ranking for hiring decisions.

**Input (DE):**
> Unser KI-Tool nutzt Lebenslauf-Screening und Bewerberauswahl, um anhand prognostizierter Eignungswerte Einstellungsentscheidungen zu treffen.

**Expected classification:**

| Field | Value |
|---|---|
| Article 5 prohibited | No |
| Annex III high-risk | Yes — paragraph 4(a) Employment |
| Articles 10/12/13/14/15 | All applicable (cascade) |
| Article 50 | Not triggered |
| Annex IV | Required |
| Three-category | Cat 1 + 2 + 3 |

**Citation:** EUR-Lex Regulation (EU) 2024/1689, Annex III paragraph 4(a) — *Employment, workers' management and access to self-employment ... AI systems intended to be used for the recruitment or selection of natural persons, in particular to place targeted job advertisements, to analyse and filter job applications, and to evaluate candidates.*

---

### Case 2 — Predictive policing (DE — disambiguator-driven)

**Input (DE):**
> Eine Polizeibehörde nutzt unser KI-System für vorhersagende Polizeiarbeit und Kriminalrisiko-Profiling, das ausschließlich auf Profiling der natürlichen Person basiert, um das Risiko künftiger Straftaten zu prognostizieren.

**Input (EN):**
> A police agency uses our AI system for predictive policing and criminal-risk profiling, based solely on profiling of natural persons, to forecast the risk of future criminal offences.

**Expected classification:**

| Field | Value |
|---|---|
| Article 5 prohibited | Yes — paragraph 5(1)(d) |
| Annex III high-risk | Suppressed by Article 5 |
| Articles 10/12/13/14/15 | All not applicable (suppression cascade) |
| Article 50 | Not triggered |
| Annex IV | Not required |
| Three-category | Empty (prohibition pre-empts obligation surface) |

**Why this case:** Article 5(1)(d) has a strict "solely on profiling" / "ausschließlich auf Profiling" disambiguator. Without that exact substring, the same input routes to Annex III paragraph 6 high-risk (law enforcement) — NOT to prohibition. This is the classifier's most disambiguator-sensitive case; alpha testers should pay close attention to whether the prohibition routing matches their reading.

**Citation:** EUR-Lex Regulation (EU) 2024/1689, Article 5(1)(d).

---

### Case 3 — Asylum-application processing (EN + DE)

**Input (EN):**
> Our AI system supports immigration officers in evaluating each asylum application by performing eligibility checks against case-law databases.

**Input (DE):**
> Unser KI-System bewertet jeden Asylantrag und unterstützt Einwanderungsbehörden bei Berechtigungsprüfungen gegen Rechtsprechungsdatenbanken.

**Expected classification:**

| Field | Value |
|---|---|
| Article 5 prohibited | No |
| Annex III high-risk | Yes — paragraph 7(c) Migration, asylum, border control |
| Articles 10/12/13/14/15 | All applicable (cascade) |
| Article 50 | Not triggered |
| Annex IV | Required |
| Three-category | Cat 1 + 2 + 3 |

**Why this case:** the use case sounds bureaucratic / operational — "supports officers in evaluating each application." A consultant who hasn't read Annex III paragraph 7 carefully might mark this as "low risk, no obligation" because no specific individual's rights are mentioned upfront. The classifier correctly surfaces Annex III paragraph 7(c). This is the load-bearing class of "looks operational; actually high-risk."

**Citation:** EUR-Lex Regulation (EU) 2024/1689, Annex III paragraph 7(c).

---

### Case 4 — Deepfake-generation deployer (EN — Article 50(4) sub-paragraph 1)

**Input (EN):**
> Our AI platform generates synthetic deepfake video content for news articles on matters of public interest, including political reporting on national elections.

**Input (DE):**
> Unsere KI-Plattform erzeugt synthetische Deepfake-Videos für die Berichterstattung über Angelegenheiten von öffentlichem Interesse, einschließlich politischer Berichterstattung über nationale Wahlen.

**Expected classification:**

| Field | Classifier output |
|---|---|
| Article 5 prohibited | No |
| Annex III high-risk | No |
| Articles 10/12/13/14/15 | All not applicable |
| Article 50 | Applicable — paragraph 50(4) sub-paragraph 1 fires on the `deepfake` lexicon hit (image/audio/video deep fake disclosure obligation) |
| Annex IV | Not required |
| Three-category | All three categories not applicable |

**Best-practice consideration (NOT classifier output):** Cat 2 (Art. 12 + 14 evidence) evidence may still be advisable for transparency record-keeping when the deployer publishes deepfake content. This is a Lucairn opinion, not a regulatory requirement, and is intentionally separated from the classifier-output row so testers do not flag this as a classifier disagreement.

**Why this case:** Article 50(4) sub-paragraph 1 covers AI-generated image, audio, or video content constituting a deep fake; its only carve-out is the artistic/creative/satirical/fictional-work narrowing of the disclosure form. Article 50(4) sub-paragraph 2 is a separate trigger covering AI-generated TEXT published to inform the public on matters of public interest; its editorial-review carve-out applies to the accompanying news article text, not to the deepfake video itself. The classifier should route this video-deepfake input to sub-paragraph 1 alone, NOT to sub-paragraph 2.

**Citation:** EUR-Lex Regulation (EU) 2024/1689, Article 50(4).

---

### Case 5 — Negative case: weather-forecast AI (DE)

**Input (DE):**
> Unsere KI-Anwendung liefert Wettervorhersagen für die nächsten 14 Tage anhand historischer Wetterdaten.

**Input (EN):**
> Our AI application provides 14-day weather forecasts based on historical weather data.

**Expected classification:**

| Field | Value |
|---|---|
| Article 5 prohibited | No |
| Annex III high-risk | No |
| Articles 10/12/13/14/15 | All not applicable |
| Article 50 | Not triggered |
| Annex IV | Not required |
| Three-category | Empty (limited risk; no specific Lucairn obligation surface fires) |

**Why this case:** the negative case is the litmus test for false-positive risk. A classifier that over-fires on "AI + decision" routinely flags weather forecasting as high-risk (because forecasts inform decisions). The classifier should clearly return "not triggered" / "not applicable" on the full obligation surface.

**Citation:** out of scope. Neither Article 5, Annex III, nor Article 50 mention weather forecasting; this case validates the classifier does not over-fire.

---

## Feedback collection template

Send this to each tester alongside the test cases. The 3-4 questions are designed to surface the load-bearing concerns: classification correctness, evidentiary defensibility, real-world usability, and legal red-flags.

### Tester information

- **Name:** ___
- **Role / firm:** ___ (DPO / consultant / counsel / product manager / engineer)
- **Jurisdiction expertise:** ___ (DE / EU / cross-border)
- **Hours invested:** ___ (target ≤ 30 minutes total — 5 minutes per case)

### Per-case feedback

For each of the 5 cases:

**Q1. Classification correctness.** Did the classifier's output match your professional judgment of the EU AI Act applicability?
- [ ] Yes, fully.
- [ ] Yes, with caveats (please specify).
- [ ] No, I would have classified differently (please specify the disagreement).

**Q2. Explain output defensibility.** Did running `npx -y @lucairn/ai-act-classifier --explain "<input>"` give you enough citation + chapeau + sub-letter detail to consider citing this tool in client work?
- [ ] Yes.
- [ ] Yes, with caveats (please specify what was missing).
- [ ] No, the explain output would not be defensible (please specify the gap).

### Overall feedback

**Q3.** What's the single biggest gap that would prevent you from using this in your actual workflow with real EU/DE clients?
___

**Q4.** Would you flag any classification as **legally wrong** (i.e. a tester reading our public statement would correctly call it out)?
- [ ] No.
- [ ] Yes (please specify which case + the legal basis for the disagreement).

**Q5 (optional).** Any other observations on tone, missing obligations, citation chains, regulator-text fidelity, or user experience?
___

---

## Marc-facing recipe

### Who to contact (target: 3-5 testers)

Looking for a balanced spread across:

- **At least 1 Bitkom AI-Act WG member** — Bitkom has been actively engaged with Lucairn's three-category framing public posts; a friendly informal channel exists.
- **At least 1 BfDI working-group / data-protection authority adjacent contact** — BfDI guidance is regularly cited in `accuracy/citations` Tier-1 sources; a contact who has read those guidance papers is high-value.
- **At least 1 named LinkedIn-engaged compliance consultant** — someone who has commented on Lucairn AI-Act blog posts; they self-selected as interested.
- **(Optional) 1 IT-procurement DPO** — represents the buyer perspective.
- **(Optional) 1 EU AI Office Service Desk contact** — represents the regulator perspective.

**DO NOT contact:** day-job clients (conflict of interest); any prospect with whom Lucairn has an active sales conversation (test feedback contaminates sales judgment); any contact who is publicly hostile to AI regulation (skews feedback toward "you over-classify").

### Personal email template

```
Subject: 30-minute pre-launch sanity check — Lucairn AI-Act classifier (v0.1.1)

Hi <Name>,

I'm preparing to publicly release the @lucairn/ai-act-classifier CLI — a free
informational tool that maps free-text AI use-case descriptions to applicable
EU AI Act articles. I'd value your professional judgment on 5 representative
test cases before launch on 2026-05-29.

The tool is rules-first (no LLM in the default deterministic mode), uses a
hand-curated lexicon grounded against EUR-Lex Regulation (EU) 2024/1689, and
scores 98.2% overall accuracy on a curated 50-case fixture corpus.

Time investment: ~30 minutes total (5 minutes per case).

The 5 cases + feedback form are attached. The tool is `npx -y
@lucairn/ai-act-classifier "<input>"` (no install needed). I am NOT asking
you to certify or endorse the tool — only to flag classifications that you
believe are LEGALLY wrong (so I can fix them before launch).

Feedback should not be considered legal work product; this is a pre-launch
sanity check, not a paid engagement. Happy to credit your contribution
publicly in the launch blog post if you'd like, OR keep it anonymous —
whichever you prefer.

Best,
Marc
```

### Feedback intake

- **Location:** a private Google Sheet (Marc-controlled) OR the appendix of this file.
- **Synthesis deadline:** Day-14 morning. The launch decision (proceed / hold / partial-publish-with-disclosure) hinges on the feedback synthesis.
- **Decision rules:**
  - **Proceed:** ≥3 testers complete the feedback; no Q4 "legally wrong" flag on any of the 5 core cases.
  - **Partial-publish-with-disclosure:** 1 Q4 flag; document it in `accuracy/KNOWN-MISCLASSIFICATIONS.md` and proceed.
  - **Hold:** ≥2 Q4 flags OR a single Q4 flag on Article 5 (the 100% accuracy bucket); hold launch until the regulator-validator review chain re-runs against the disputed case.

### What this is NOT

- **NOT a marketing exercise.** Don't ask for testimonials. Don't ask for case studies. Don't ask for permission to quote.
- **NOT a paid engagement.** This is a 30-minute favor request from a small early-stage project; treat it as such.
- **NOT a release-blocker for v1.0.** v0.1.1 ships either way; alpha feedback shapes the launch-day disclosure tone and the v0.2 polish backlog.

### Appendix — tester feedback log

(Append as feedback arrives.)

---

> Informational tool — not legal advice. See README §Disclaimer for the full disclosure.
