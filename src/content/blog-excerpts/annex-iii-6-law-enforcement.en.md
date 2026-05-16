# Annex III paragraph 6 — law enforcement (and the ¶7 polygraph carve-out)

Annex III paragraph 6 of Regulation (EU) 2024/1689 covers AI systems used by, or on behalf of, law-enforcement authorities. Five sub-letters cover (a) victim-risk assessment, (b) polygraphs and similar truthfulness-assessment tools, (c) reliability-of-evidence assessment, (d) crime-profiling/recidivism risk where the system does not fall under the Article 5(1)(d) prohibition, and (e) crime analytics across criminal data ([EUR-Lex Annex III ¶6](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202401689)).

A common confusion: a polygraph used at a **border-control checkpoint** is governed by Annex III paragraph 7 (migration, asylum, border control), not paragraph 6. The classifier disambiguates by looking for the border/migration/asylum context phrase in the input; without it, the polygraph fires under ¶6(b) law enforcement. The EU AI Office's [service-desk page](https://artificialintelligenceact.eu/annex/3/) walks through the same split.

If the input describes risk-of-future-offence profiling without the "solely on profiling" qualifier of Art 5(1)(d), classification lands at ¶6(d) — high-risk, but not prohibited.
