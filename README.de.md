# @lucairn/ai-act-classifier

Kostenloses CLI, das jede Beschreibung eines KI-Anwendungsfalls den auslösenden Artikeln der EU-KI-Verordnung zuordnet.

> **⚠ Status: Vorab-Gerüst (v0.1.0, Tag 1 eines 14-tägigen Builds).**
> Build-Fenster: 2026-05-16 → 2026-05-29. Das Paket ist noch nicht einsatzbereit; die öffentliche CLI-Oberfläche landet an Tag 6, die Klassifizierungsregeln an Tag 3-5, der kuratierte Testdatensatz an Tag 7-8. Repository ist während des Builds privat und wird am Launch-Tag öffentlich.

## Was das Tool leisten wird (Ziel v0.1.0)

Eine freitext-formulierte Beschreibung eines KI-Anwendungsfalls (Englisch oder Deutsch) entgegennehmen und zurückgeben:

- Welche Artikel und Anhänge der EU-KI-Verordnung gelten (Art. 5, 6, 10, 13, 14, 15, 50; Anhang III, Anhang IV)
- Lucairns Drei-Kategorien-Pflichten-Overlay (Sanitizer / Nachweis / Inventar)
- Zitations-URLs zu primären Regulator-Quellen (EUR-Lex Verordnung 2024/1689, EU-KI-Büro, BSI, BfDI)
- Konfidenz-Wert + SHA-fixierter Regelsatz-Version, damit das Ergebnis reproduzierbar und verteidigbar ist

## Installation (nach Launch)

```bash
npx @lucairn/ai-act-classifier "KI-System, das Lebensläufe bewertet und Einstellungs-Empfehlungen ausgibt"
```

Keine Konfiguration. Keine Netzwerkverbindung. Kein API-Key erforderlich für den deterministischen Modus.

Optionale LLM-gestützte Feature-Extraktion (verwendet Ihren eigenen API-Key; wird ausschließlich an den gewählten Anbieter gesendet):

```bash
ANTHROPIC_API_KEY="<ihr-anthropic-key>" npx @lucairn/ai-act-classifier --llm anthropic "..."
```

## Architektur (in einem Absatz)

Regelwerk-zuerst-Hybrid. Eine deterministische Regel-Engine in TypeScript wertet Art. 5, 6 + Anhang III, 10, 13, 14, 15, 50 gegen aus Ihrer Eingabe extrahierte Merkmale aus. Die Standard-Extraktion ist ein Stichwort- und Phrasen-Mustererkenner in DE+EN — funktioniert offline, ohne API-Key. Der optionale `--llm`-Modus nutzt Ihren eigenen API-Key für genauere Feature-Extraktion; die Regel-Engine wählt die Artikel weiterhin deterministisch aus. Jede Ausgabe enthält die Regelsatz-Version (SHA-fixiert), sodass dieselbe Eingabe immer dieselbe Klassifizierung erzeugt.

## Genauigkeit (Accuracy)

Der Klassifizierer wird gegen einen 50-Fall-zweisprachigen Fixture-Korpus (CC-BY-4.0) gebenchmarkt: 24 Anhang III Hochrisiko + 8 Art. 5 verboten + 8 Art. 50 Transparenz + 10 Negativfälle; 21 EN + 29 DE. Aktuelle Zahlen auf dem v0.1.1-Regelsatz:

- **Gesamt:** 98,2% (granulare Feld-Trefferquote)
- **Art. 5 Verbots-Erkennung** (sicherheitskritisch): 100,0%
- **Binäre Hochrisiko-Klassifikation:** 98,0%

CI-Untergrenze (festgelegt): ≥80% Gesamt + 100% Art. 5. v1.0-Release-Ziel: ≥85% Gesamt + 100% Art. 5 + ≥90% binäre Hochrisiko-Klassifikation.

Die Schlagzeile spiegelt die interne Konsistenz zwischen kuratiertem Fixture-Korpus und kuratiertem Lexikon wider — nicht die Genauigkeit auf beliebigen realen Eingaben. v0.1.1 (Tag 8) hat fünf Day-7-DE-Fixtures mit natürlichem Deutsch nach Berater-Urteil umgeschrieben und das Lexikon um natürlich-deutsche Varianten erweitert; eine verbleibende Lücke wurde aufgedeckt (Compound-Noun-Tokenisierung bei `Emotionserkennungssystems`) und in [accuracy/KNOWN-MISCLASSIFICATIONS.md](./accuracy/KNOWN-MISCLASSIFICATIONS.md) G-5 dokumentiert, statt sie wegzudesignen. Siehe [accuracy/METHODOLOGY.md](./accuracy/METHODOLOGY.md) §"Honest limitations" für die vollständige Offenlegung.

Berichte: [accuracy/REPORT.md](./accuracy/REPORT.md).

Fehlklassifikation gefunden? Öffnen Sie ein GitHub-Issue mit der Anwendungsfall-Beschreibung, Ihrer erwarteten Klassifikation, Ihrer Begründung (mit Zitat des entsprechenden EUR-Lex-Absatzes aus Verordnung (EU) 2024/1689) und der aktuellen Klassifizierer-Ausgabe.

## Lizenz

Quellcode: MIT (siehe [LICENSE](./LICENSE)).
Testdatensatz: CC-BY-4.0 (siehe [DATASET-LICENSE](./DATASET-LICENSE)).

## Haftungsausschluss

Dieses Werkzeug dient ausschließlich der Information. Es stellt **keine Rechtsberatung** dar. Es begründet kein Mandatsverhältnis. Die Ausgabe ist vor jeder Compliance-Entscheidung durch qualifizierte Rechtsberatung zu überprüfen. Lucairn / Declade UG (i.G.) schließen jede Haftung aus. Siehe [LICENSE](./LICENSE) §AS-IS-Klausel.

Der Klassifizierer spiegelt eine Interpretation der EU-KI-Verordnung zum Stand der in jeder Ausgabe gedruckten Regelsatz-Version wider. Das EU-KI-Büro veröffentlicht laufend Leitlinien, die Interpretationen ändern können. Jede Ausgabe verweist auf die Regulator-Quelle (EUR-Lex, EU-KI-Büro, BSI, BfDI) zur direkten Verifikation.

## Über

Entwickelt von [Lucairn](https://lucairn.eu) — der Compliance-Nachweis-Layer für die EU-KI-Verordnung. Betrieben durch Declade UG (i.G.).

Zitiervorschlag:

> *Lucairn (2026), AI Act Classifier v0.1, https://lucairn.eu/tools/ai-act-classifier*
