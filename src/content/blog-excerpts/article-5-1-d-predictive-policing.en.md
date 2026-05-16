# Article 5(1)(d) — when does "predictive policing" cross the prohibition line?

Article 5(1)(d) of Regulation (EU) 2024/1689 prohibits AI systems used for "making risk assessments of natural persons in order to assess or predict the risk of a natural person committing a criminal offence, based **solely** on the profiling of a natural person or on assessing their personality traits and characteristics" ([EUR-Lex Art 5(1)(d)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202401689)).

The word **solely** is the load-bearing qualifier. A risk-assessment system that mixes profiling with objective verifiable facts that are directly linked to a criminal activity does not fall under the prohibition; it falls under Annex III paragraph 6 high-risk obligations instead. The [Future of Life Institute regulation-text mirror (Tier-3)](https://artificialintelligenceact.eu/article/5/) walks through the same line.

Implementation tip: if a design document does not explicitly state that "the risk score is based solely on profiling", the classifier routes the case to Annex III ¶6 high-risk. In that case, Articles 11, 14, and 15 obligations apply — the prohibition carve-out does not take effect automatically.
