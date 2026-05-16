# @lucairn/ai-act-classifier

Kostenloses CLI, das jede Beschreibung eines KI-Anwendungsfalls den auslösenden Artikeln der EU-KI-Verordnung zuordnet. Keine Netzwerkverbindung, keine Konfiguration, kein API-Key im deterministischen Standardmodus. MIT-lizenziert für den Code; CC-BY-4.0 für den kuratierten Testkorpus.

## Schnelleinstieg

```bash
# Deterministischer Modus (Standard — kein API-Key, kein Netzwerk)
npx @lucairn/ai-act-classifier "KI-System, das Bewerber nach Lebenslauf bewertet"

# --explain — Begründungs-Spur + EUR-Lex-Zitate + Beinahe-Treffer + Disambiguator-Zustand
npx @lucairn/ai-act-classifier --explain "Emotionserkennung in Kundenservice-Telefonaten"

# --explain --with-excerpt — fügt kuratierten Regulator-Kommentar hinzu
npx @lucairn/ai-act-classifier --explain --with-excerpt \
  "KI-erzeugtes politisches Deepfake-Video für Social-Media-Verbreitung"

# Optionale LLM-gestützte Feature-Extraktion (nutzt Ihren eigenen API-Key)
ANTHROPIC_API_KEY="<ihr-key>" npx @lucairn/ai-act-classifier --llm anthropic \
  --explain "KI-System, das Bewerber nach Lebenslauf bewertet"
```

## Was das Tool leistet

- Klassifiziert jede freie Anwendungsfall-Beschreibung (Englisch oder Deutsch) gegen die EU-KI-Verordnung:
  - **Artikel 5** verbotene Praktiken (acht Buchstaben a–h mit dem Disambiguator „ausschließlich auf Profiling" für Art. 5 Abs. 1 Buchst. d)
  - **Artikel 6 + Anhang III** Hochrisiko-Klassifikation (acht Domänen mit Buchstaben-Eingrenzung, wo das Lexikon ausreichend ist)
  - **Artikel 10 / 12 / 13 / 14 / 15** Pflichten aus der Hochrisiko-Kaskade
  - **Artikel 50** Transparenzpflichten (vier Absatz-Pfade)
  - **Anhang IV** Pflicht zur technischen Dokumentation
- Liefert Lucairns Drei-Kategorien-Pflichten-Overlay (Sanitizer / Nachweis / Inventar)
- Verweist auf die EUR-Lex-Quelle pro ausgelöstem Artikel sowie auf den Service Desk des EU-AI-Office und (optional) den Lucairn-Kommentar
- Stempelt Regelsatz-Version und SHA in jede Ausgabe — dieselbe Eingabe auf demselben Regelsatz erzeugt eine byte-stabile Ausgabe
- Verfügbar als CLI-Binary (dieses Paket) und als Bibliothek (`formatExplain` und `classify` exportiert aus `@lucairn/ai-act-classifier`)

## Was das Tool NICHT leistet

- **Keine Rechtsberatung.** Informationelles Werkzeug. Siehe [Haftungsausschluss](#haftungsausschluss).
- **Keine Lucairn-Datenverarbeitung.** Im deterministischen Modus verlässt Ihr Text Ihren Rechner nicht. Im `--llm`-Modus wird Ihr Text nur an den von Ihnen gewählten LLM-Anbieter (über Ihren eigenen API-Key) gesendet — Lucairn steht nicht im Datenpfad.
- **Keine Telemetrie, keine Analytics, kein Remote-Logging.** Der Quelltext ist prüfbar.
- **Kein Ersatz für die Konformitätsbewertung nach der EU-KI-Verordnung.** Eine Hochrisiko-Klassifikation löst die Pflichten der Artikel 9 bis 15 aus, einschließlich der Konformitätsbewertung durch eine notifizierte Stelle für bestimmte Anhang-III-Kategorien. Dieses Tool hilft beim Pflichten-Scoping; es führt die Konformitätsbewertung nicht durch.

## Flag `--explain`

Das Flag `--explain` liefert zusätzlich zur Klassifikation eine strukturierte Begründungs-Spur:

- **Pro ausgelöstem Artikel:** wörtlicher EUR-Lex-Kopfsatz + getroffene Lexikon-Phrasen + Buchstaben-Eingrenzungs-Zweig + einzeilige Begründung + Tier-1-Zitations-URL
- **Disambiguator-Zustand:** für Art. 5 Abs. 1 Buchst. d wird angezeigt, ob das Qualifikationsmerkmal „ausschließlich auf Profiling" erfüllt war (sonst Weiterleitung in Anhang III ¶6 Hochrisiko)
- **Beinahe-Treffer:** bis zu zwei Artikel, die geprüft, aber NICHT ausgelöst wurden — etwa Kaskaden-Artikel, die durch ein Artikel-5-Verbot unterdrückt sind, oder die Forschungs-Ausnahme nach Art. 2 Abs. 8
- **Optional `--with-excerpt`:** hängt einen handkuratierten Regulator-Kommentar aus dem ausgelieferten Auszugs-Korpus an (fünf Schlüssel × EN+DE = zehn Dateien unter `src/content/blog-excerpts/`)

Drei Ausgabeformate: `--explain-format markdown` (Standard — gut zum Einfügen in Beraterdokumente), `--explain-format json` (strukturiert, snapshot-stabil, für programmatische Konsumenten), `--explain-format text` (reines ASCII für Terminal-Pipes).

**Hinweis:** `--explain` überschreibt `--format` / `--json` — über `--explain-format <markdown|json|text>` wird das Ausgabeformat der Begründungs-Spur gewählt. `ai-act-classify --explain --format json "..."` liefert die Standard-Markdown-Ausgabe von `--explain` (das `--format json` wird ignoriert).

Die `--explain`-Ausgabe ist so gestaltet, dass sie direkt in eine Datenschutz-Folgenabschätzung, in ein Audit-Arbeitspapier oder in eine EU-KI-Verordnungs-Compliance-Checkliste übernommen werden kann — als Beleg für eine verteidigungsfähige Klassifikation. Jeder ausgelöste Artikel verweist auf die gesetzliche Quelle; die SHA-fixierte Regelsatz-Version macht das Ergebnis reproduzierbar.

## Modi — deterministisch oder `--llm`

Der Standardmodus ist **deterministisch**: ein kuratierter EN+DE-Stichwort- und Phrasen-Matcher gegen das Lexikon unter `src/data/patterns.{en,de}.json`. Kein Netzwerk, kein API-Key, keine Kosten. Auf dem kuratierten 62-Fall-zweisprachigen-Testdatensatz ist der deterministische Modus genauer als jeder LLM-Modus (der Korpus wurde so geformt, dass er den kanonischen Lexikon-Phrasen entspricht). Empfohlen für die meisten Anwendungsfälle.

Der optionale `--llm <provider>`-Modus ersetzt den Stichwort-Extraktor durch ein LLM für semantische Feature-Extraktion. Die nachgelagerte Regel-Engine, die die Artikel tatsächlich auswählt, bleibt **unverändert**. Das LLM ist darauf beschränkt, Phrasen aus dem kuratierten Lexikon zu zitieren; jede halluzinierte Phrase wird verworfen, bevor die Regel-Engine sie sieht. Drei Anbieter werden unterstützt, jeweils mit Ihrem eigenen API-Key:

| Anbieter | Standard-Modell | Kosten pro Aufruf (ca.) | Kosten pro 50-Fixture-Lauf (ca.) |
|---|---|---|---|
| `anthropic` | Claude Haiku 4.5 | 0,003 $ | 0,13 $ |
| `openai` | GPT-4o-mini | 0,0005 $ | 0,025 $ |
| `groq` | Llama 3.3 70B Versatile | 0,0014 $ | 0,07 $ |

Preise zum Stand 2026-05-16. Modell pro Aufruf via `--llm <provider> --model <name>` überschreibbar.

### Einrichtung für den `--llm`-Modus

```bash
# Optionale Abhängigkeiten — installieren Sie nur die SDK(s), die Sie nutzen.
pnpm add @anthropic-ai/sdk      # für --llm anthropic
pnpm add openai                 # für --llm openai UND --llm groq (Groq nutzt das OpenAI-SDK)

export ANTHROPIC_API_KEY="<ihr-anthropic-key>"
ai-act-classify --llm anthropic "KI-System, das Bewerber nach Lebenslauf bewertet"

export OPENAI_API_KEY="<ihr-openai-key>"
ai-act-classify --llm openai "KI-System, das Bewerber nach Lebenslauf bewertet"

export GROQ_API_KEY="<ihr-groq-key>"
ai-act-classify --llm groq "KI-System, das Bewerber nach Lebenslauf bewertet"
```

> **Hinweis zur LLM-Modus-Nichtdeterministik.** LLMs sind probabilistisch; ein erneuter Aufruf mit derselben Eingabe kann unterschiedliche (korrelierte, aber nicht identische) Merkmale liefern. Anthropic Haiku 4.5 wurde mit 93,5–97,6 % Gesamtgenauigkeit über zwei unabhängige Läufe auf dem v0.1.0 50-Fall-Korpus gemessen (LLM-Modus-Neumessung gegen den v0.1.4 62-Fall-Korpus ist auf v0.1.5 verschoben). Die Cache-Schicht (nächster Abschnitt) mildert das ab — Wiederholungen auf identischen Eingaben sind byte-stabil. Für reproduzierbare Klassifikation auf neuen Eingaben empfehlen wir den deterministischen Standardmodus.

## Cache-Schicht

LLM-Modus-Ergebnisse werden auf der Festplatte unter `~/.cache/lucairn-ai-act-classifier/llm/` gespeichert (`XDG_CACHE_HOME` wird respektiert). Der Cache-Schlüssel ist `sha256(provider + model + lexikon-version + prompt-checksum + lang + normalisierte-eingabe)`, sodass dieselbe Eingabe auf derselben Regelsatz- und Prompt-Version ein byte-stabiles Ergebnis liefert, ohne die API zu belasten.

> **Cache-Dateiinhalt:** Jeder Cache-Eintrag speichert das vollständige `ExtractedFeatures`-Objekt einschließlich des ursprünglichen Eingabetexts (damit die Regel-Engine bei einem Cache-Hit ihre Zitationskette neu rendern kann). Cache-Dateien werden mit POSIX-Modus `0o600` geschrieben (nur Lese- und Schreibrechte für die Eigentümerin; keine Gruppen- oder Welt-Rechte); das Cache-Verzeichnis wird mit Modus `0o700` erstellt (nur Lese-, Schreib- und Ausführungsrechte für die Eigentümerin). Der Cache liegt im benutzerprivaten Verzeichnis `~/.cache/` und wird nirgendwohin übertragen. Für sensible Anwendungsfall-Beschreibungen: entweder einmalig mit `--no-cache` ausführen oder `~/.cache/lucairn-ai-act-classifier/` in die Sitzungs-Aufräum-Routine aufnehmen.

- **Cache-Hit:** typischerweise <100 ms (kein Netzwerk) gegenüber ~1–5 s für einen frischen API-Aufruf.
- **Cache-Miss:** der Anbieter wird aufgerufen, das Ergebnis atomar in den Cache geschrieben (`<key>.tmp` → `rename`), und die zwischengespeicherten Merkmale bedienen jeden weiteren Aufruf, bis sich die Lexikon-Version ODER der Prompt-Checksum ändert.
- **Umgehen:** mit `--no-cache` wird ein frischer API-Aufruf erzwungen (der Cache wird für diesen Aufruf weder gelesen noch geschrieben).
- **Invalidierung:** automatisch bei Lexikon-Version-Bump (z. B. v0.1.2 → v0.2.0) oder bei jeder Änderung am LLM-System-Prompt / Tool-Schema; beides ist Teil des Cache-Schlüssels.
- **Fehlgeschlagene Aufrufe werden NICHT zwischengespeichert.** Nur erfolgreiche Provider-Ergebnisse landen im Cache.

Cache manuell löschen: `rm -rf ~/.cache/lucairn-ai-act-classifier`.

## Architektur (in einem Absatz)

Regelwerk-zuerst-Hybrid. Eine deterministische TypeScript-Regel-Engine wertet die Artikel 5, 6 + Anhang III, 10, 12, 13, 14, 15 und 50 gegen Merkmale aus, die aus Ihrer Eingabe extrahiert werden. Die Standard-Extraktion ist ein Stichwort- und Phrasen-Mustererkenner in EN+DE — funktioniert offline, ohne API-Key. Der optionale `--llm`-Modus nutzt Ihren eigenen API-Key für eine bessere Feature-Extraktion; die Regel-Engine wählt die Artikel weiterhin deterministisch aus. Jede Ausgabe verweist auf ihre Regelsatz-Version (SHA-fixiert) — dieselbe Eingabe erzeugt immer dieselbe Klassifikation. Quellbaum: `src/extract/` (Stichwort- und Spracherkennung + LLM-Anbieter + Cache), `src/rules/` (Pro-Artikel-Module mit Cite-and-Match-Zusammenfassungen), `src/format/` (CLI-Tabelle + JSON + Markdown + `--explain`-Ausgabe), `src/data/` (kuratierte Lexika + Anhang-III-Metadaten + Zitate), `src/i18n/` (EN+DE-Lokalisierungsbündel), `src/content/blog-excerpts/` (kuratierte Regulator-Kommentare).

## Genauigkeit (Accuracy)

Der Klassifizierer wird gegen einen 66-Fall-zweisprachigen Fixture-Korpus (CC-BY-4.0) gebenchmarkt: 50 day{3,4,5,7} Fixtures + 9 v0.1.3 + 3 v0.1.4 + 4 v0.2.0 Launch-Feedback Fixtures; ~32 EN + ~34 DE über 5 Buckets (annex_iii / article_5 / article_50 / negative / legacy). Aktuelle Zahlen auf dem v0.2.0-Regelsatz:

- **Gesamtgenauigkeit:** 98,7 % (granulare Feld-Trefferquote; up von 98,6 % in v0.1.4, 98,5 % in v0.1.3 und 98,2 % in v0.1.2)
- **Art. 5 Verbots-Erkennung** (sicherheitskritisch): 100,0 %
- **Binäre Hochrisiko-Klassifikation:** 98,5 %

CI-Untergrenze (festgelegt): ≥ 80 % Gesamt + 100 % Art. 5. v1.0-Release-Ziel: ≥ 85 % Gesamt + 100 % Art. 5 + ≥ 90 % binäre Hochrisiko-Klassifikation.

Die Schlagzeile spiegelt die interne Konsistenz zwischen kuratiertem Fixture-Korpus und kuratiertem Lexikon wider — nicht die Genauigkeit auf beliebigen realen Eingaben. Der DE-Fixture-Korpus ist in natürlichem Deutsch nach Berater-Urteil verfasst, und das Lexikon deckt natürlich-deutsche Varianten ab; eine verbleibende Lücke (Compound-Noun-Tokenisierung bei `Emotionserkennungssystems`) ist in [accuracy/KNOWN-MISCLASSIFICATIONS.md](./accuracy/KNOWN-MISCLASSIFICATIONS.md) §G-5 dokumentiert, statt sie wegzudesignen. Siehe [accuracy/METHODOLOGY.md](./accuracy/METHODOLOGY.md) §"Honest limitations" für die vollständige Offenlegung.

Berichte: [accuracy/REPORT.md](./accuracy/REPORT.md) (deterministisch, CI-überwacht), [accuracy/REPORT.llm-anthropic.md](./accuracy/REPORT.llm-anthropic.md), [accuracy/REPORT.llm-openai.md](./accuracy/REPORT.llm-openai.md), [accuracy/REPORT.llm-groq.md](./accuracy/REPORT.llm-groq.md).

## Methodik

Die Klassifizierungs-Methodik ist unter [accuracy/METHODOLOGY.md](./accuracy/METHODOLOGY.md) dokumentiert. Die wichtigsten Punkte:

- **Cite-and-Match-Disziplin.** Jeder ausgelöste Artikel trägt eine EUR-Lex-Zitations-URL im Ergebnisobjekt. Eine automatisierte Zitations-Verifikationsstufe überprüft jedes `source`- und `summary_*`-Feld vor jedem PR-Merge erneut gegen EUR-Lex EN+DE.
- **Lexikon-zuerst Feature-Extraktion.** Der deterministische Extraktor matcht n-Gramme der Eingabe gegen ein kuratiertes Lexikon unter `src/data/patterns.{en,de}.json`. Der LLM-Modus nutzt dasselbe Lexikon als Halluzinations-Wächter — jede vom LLM gelieferte Phrase, die nicht im Lexikon steht, wird verworfen, bevor die Regel-Engine sie sieht.
- **Tier-1-Quellen-Allowlist.** Fixture-Korpus-`source_url`-Felder sind auf EUR-Lex / Service Desk des EU-AI-Office / BSI / BfDI / Bitkom beschränkt — dieselben Quellen, auf die unsere `--explain`-Ausgabe verweist.
- **Ehrliche Offenlegung.** Bekannte Lücken und das v0.2-Polish-Backlog sind öffentlich unter [accuracy/KNOWN-MISCLASSIFICATIONS.md](./accuracy/KNOWN-MISCLASSIFICATIONS.md).

## Zitate

Der Klassifizierer verweist auf folgende Quellen, geordnet nach Regulator-Autoritäts-Stufe:

**Tier 1 — Primäre Regulator-Oberflächen.**

- **EUR-Lex Verordnung (EU) 2024/1689:** [DE HTML](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=OJ:L_202401689) · [EN HTML](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202401689) · [DE PDF](https://eur-lex.europa.eu/legal-content/DE/TXT/PDF/?uri=OJ:L_202401689) · [EN PDF](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202401689) — die kanonische Tier-1-Quelle.
- **Service Desk des EU-AI-Office:** [ai-act-service-desk.ec.europa.eu/de](https://ai-act-service-desk.ec.europa.eu/) · [ai-act-service-desk.ec.europa.eu/en](https://ai-act-service-desk.ec.europa.eu/) — der offizielle Service Desk des EU-AI-Office auf der europa.eu-Domain.

**Tier 2 — Veröffentlichungen mitgliedstaatlicher Aufsichtsbehörden.**

- **BSI** (Bundesamt für Sicherheit in der Informationstechnik): [bsi.bund.de](https://www.bsi.bund.de/) — Leitlinien zur KI-Cybersicherheit und Artikel-15-Robustheit.
- **BfDI** (Bundesbeauftragte für den Datenschutz und die Informationsfreiheit): [bfdi.bund.de](https://www.bfdi.bund.de/) — Zusammenspiel der KI-Verordnung mit der DSGVO.
- **Bitkom**-Arbeitsgruppen-Papiere zur KI-Verordnung: [bitkom.org](https://www.bitkom.org/) — Branchenleitfaden für den deutschen Mittelstand zur Umsetzung der KI-Verordnung.

**Tier 3 — Regulierungstext-Spiegel.**

- **Future of Life Institute** Regulierungstext-Spiegel: [artificialintelligenceact.eu/de](https://artificialintelligenceact.eu/de/) · [artificialintelligenceact.eu/en](https://artificialintelligenceact.eu/) · [ai-act-law.eu/de](https://www.ai-act-law.eu/) — Drittanbieter-Spiegel der Regulierungstexte. Der Blog-Excerpt-Korpus des Classifiers verlinkt hierhin für Absatz-spezifische Deep-Anchors, die das EUR-Lex HTML auslässt. NICHT regulator-autoritativ; immer gegen EUR-Lex oder den Service Desk des EU-AI-Office gegenprüfen.

Lucairns Kommentar-Inhalte aus dem `--explain --with-excerpt`-Auszugs-Korpus sind handkuratierte Originaltexte und stehen wie der Quellcode unter MIT-Lizenz.

## Lücken und bekannte Fehlklassifikationen

Der Klassifizierer unterscheidet bewusst NICHT:

- Anbieter- vs. Betreiber-Status. Beide Oberflächen treffen dieselbe Regel-Engine.
- Ob ein System tatsächlich eine gesetzliche Ausnahme in Anspruch nehmen kann (z. B. die Strafverfolgungs-Ausnahme nach Art. 50 Abs. 1). Die Ausnahme-Sprache wird WÖRTLICH im Kopfsatz-Output ausgegeben, damit der Berater sie nachgelagert anwenden kann.
- Vollständige Buchstaben-Eingrenzung für jeden Anhang-III-Absatz. Die Abdeckung ist vollständig über die Absätze 1–8 mit konservativen Standards: bei mehrdeutiger Eingrenzung geben wir ein leeres Buchstaben-Array zurück, statt zu viel zu behaupten.
- Pluralformen und deutsche Morphologie im Stichwort-Extraktor. Komposita wie `Emotionserkennungssystems` sind eine bekannte v0.2-Lücke (siehe [accuracy/KNOWN-MISCLASSIFICATIONS.md](./accuracy/KNOWN-MISCLASSIFICATIONS.md) §G-5).

Fehlklassifikation gefunden? Öffnen Sie ein GitHub-Issue mit: (a) der Anwendungsfall-Beschreibung, (b) Ihrer erwarteten Klassifikation, (c) Ihrer Begründung mit Verweis auf den entsprechenden EUR-Lex-Absatz der Verordnung (EU) 2024/1689 und (d) der aktuellen Klassifizierer-Ausgabe. Wir reagieren auf Issues während der mitteleuropäischen Geschäftszeiten.

## Lizenz

Quellcode: MIT (siehe [LICENSE](./LICENSE)).
Testdatensatz und kuratierte Blog-Auszüge: CC-BY-4.0 (siehe [DATASET-LICENSE](./DATASET-LICENSE)).

## Haftungsausschluss

Dieses Werkzeug dient ausschließlich der Information. Es stellt **keine Rechtsberatung** dar. Es begründet kein Mandatsverhältnis. Die Ausgabe ist vor jeder Compliance-Entscheidung durch qualifizierte Rechtsberatung zu überprüfen. Lucairn UG (haftungsbeschränkt) i.Gr. — vor Inkorporation als natürliche Person betrieben durch Marc Schülke — schließt jede Haftung aus. Siehe [LICENSE](./LICENSE) §AS-IS-Klausel.

Der Klassifizierer spiegelt eine Interpretation der EU-KI-Verordnung zum Stand der in jeder Ausgabe gedruckten Regelsatz-Version wider. Das EU-KI-Büro veröffentlicht laufend Leitlinien, die Interpretationen ändern können. Jede Ausgabe verweist auf die Regulator-Quelle zur direkten Verifikation.

## Über

Entwickelt von [Lucairn](https://lucairn.eu) — der Compliance-Nachweis-Layer für die EU-KI-Verordnung. Vor Inkorporation betrieben als natürliche Person durch Marc Schülke; Lucairn UG (haftungsbeschränkt) i.Gr. (Gründung eingeleitet; vor Handelsregistereintrag).

Hosted UI-Spiegel: `https://lucairn.eu/tools/ai-act-classifier`.

Zitiervorschlag:

> *Lucairn (2026), AI Act Classifier v0.1, https://lucairn.eu/tools/ai-act-classifier*
