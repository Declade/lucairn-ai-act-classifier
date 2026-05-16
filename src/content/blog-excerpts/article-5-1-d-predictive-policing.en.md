# Article 5(1)(d) — when does "predictive policing" cross the prohibition line?

Article 5(1)(d) of Regulation (EU) 2024/1689 prohibits AI systems used for "making risk assessments of natural persons in order to assess or predict the risk of a natural person committing a criminal offence, based **solely** on the profiling of a natural person or on assessing their personality traits and characteristics" ([EUR-Lex Art 5(1)(d)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202401689)).

The word **solely** is the load-bearing qualifier. A risk-assessment system that mixes profiling with objective verifiable facts that are directly linked to a criminal activity does not fall under the prohibition; it falls under Annex III paragraph 6 high-risk obligations instead. The EU AI Office's [service-desk page](https://artificialintelligenceact.eu/article/5/) walks through the same line.

Implementation tip: if your design document does not explicitly say "the risk score is based solely on profiling", the classifier will route to Annex III ¶6 high-risk. Add Article 11 + Article 15 + the human-oversight requirements of Article 14; do not assume the carve-out applies.
