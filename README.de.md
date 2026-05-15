# @lucairn/ai-act-classifier

Kostenloses CLI, das jede Beschreibung eines KI-Anwendungsfalls den auslösenden Artikeln der EU-KI-Verordnung zuordnet.

> **⚠ Status: Vorab-Gerüst (v0.1.1, Tag 10 eines 14-tägigen Builds).**
> Build-Fenster: 2026-05-16 → 2026-05-29. Das Paket ist noch nicht einsatzbereit; die öffentliche CLI-Oberfläche landet an Tag 6, die Klassifizierungsregeln an Tag 3-5, der kuratierte Testdatensatz an Tag 7-8. Repository ist während des Builds privat und wird am Launch-Tag öffentlich.

## Was das Tool leisten wird (Ziel v0.1.1)

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

Optionale LLM-gestützte Feature-Extraktion mit einem von drei Anbietern (verwendet Ihren eigenen API-Key; wird ausschließlich an den gewählten Anbieter gesendet):

```bash
ANTHROPIC_API_KEY="<ihr-key>" npx @lucairn/ai-act-classifier --llm anthropic "..."
OPENAI_API_KEY="<ihr-key>"    npx @lucairn/ai-act-classifier --llm openai    "..."
GROQ_API_KEY="<ihr-key>"      npx @lucairn/ai-act-classifier --llm groq      "..."
```

## `--llm` Modus (optional, 3 Anbieter)

Der Standardmodus ist deterministisch: ein Stichwort- und Phrasen-Matcher in DE+EN gegen das kuratierte Lexikon. Kein Netzwerk, kein API-Key, keine Kosten. Dies ist der empfohlene Modus für die meisten Anwendungsfälle — die deterministische Genauigkeit liegt auf dem kuratierten 50-Fall-Korpus über der LLM-Genauigkeit.

Der optionale `--llm <provider>` Modus ersetzt den Stichwort-Extraktor durch ein LLM für semantische Feature-Extraktion. Die Regel-Engine, die die Artikel auswählt, ist **unverändert** — nur die Feature-Extraktion wird ersetzt. Das LLM ist darauf beschränkt, Phrasen aus dem kuratierten Lexikon zu zitieren; jede halluzinierte Phrase wird verworfen, bevor die Regel-Engine sie sieht.

**Unterstützte Anbieter und Standard-Modelle:**

| Anbieter | Standard-Modell | Kosten pro Aufruf (ca.) | Kosten pro 50-Fixture-Lauf (ca.) |
|---|---|---|---|
| `anthropic` | Claude Haiku 4.5 | \$0,003 | \$0,13 |
| `openai` | GPT-4o-mini | \$0,0005 | \$0,025 |
| `groq` | Llama 3.3 70B Versatile | \$0,0014 | \$0,07 |

(Preise zum Versanddatum 2026-05-16. Modell pro Aufruf via SDK-Parameter `model` überschreibbar; die CLI verwendet derzeit die Standardwerte.)

**Einrichtung:**

```bash
# Optionale Abhängigkeiten — installieren Sie nur die SDKs, die Sie nutzen werden.
pnpm add @anthropic-ai/sdk      # für --llm anthropic
pnpm add openai                 # für --llm openai UND --llm groq (Groq nutzt das OpenAI-SDK)

export ANTHROPIC_API_KEY="<ihr-anthropic-key>"
ai-act-classify --llm anthropic "KI-System, das Bewerber nach Lebenslauf bewertet"

export OPENAI_API_KEY="<ihr-openai-key>"
ai-act-classify --llm openai "KI-System, das Bewerber nach Lebenslauf bewertet"

export GROQ_API_KEY="<ihr-groq-key>"
ai-act-classify --llm groq "KI-System, das Bewerber nach Lebenslauf bewertet"
```

> ⚠️ **Hinweis zum LLM-Modus-Nicht-Determinismus.** LLMs sind probabilistisch; ein erneuter
> Aufruf auf derselben Eingabe kann unterschiedliche (korrelierte aber nicht identische)
> Merkmale zurückliefern. Tag 9 maß Anthropic Haiku 4.5 bei **93,5 %–97,6 %**
> Gesamtgenauigkeit über zwei unabhängige Läufe auf dem 50-Fall-Korpus. Die Cache-Schicht
> (nächster Abschnitt) mildert dies, indem sie das Ergebnis des ersten Aufrufs speichert
> — Wiederholungen auf identischen Eingaben sind byte-stabil. Für reproduzierbare
> Klassifizierung auf neuen Eingaben empfehlen wir den deterministischen Standardmodus.

**Tag-9 Genauigkeits-Delta (Anthropic) gegenüber dem deterministischen Basiswert (50-Fall-Korpus):**

| Metrik | Deterministisch (Standard) | `--llm anthropic` (Tag 9) |
|---|---|---|
| Gesamtgenauigkeit | 98,2% | 97,6% _(einer von zwei beobachteten Läufen; Bereich 93,5–97,6 %)_ |
| Art. 5 Verbots-Erkennung | 100,0% | 100,0% |
| Binäre Hochrisiko-Klassifikation | 98,0% | 98,0% |

OpenAI- + Groq-Genauigkeitszahlen werden ergänzt, sobald der Harness gegen diese Anbieter ausgeführt wurde. Marc kann jeden Bericht bei Bedarf mit `<PROVIDER>_API_KEY=... pnpm accuracy:llm-<provider>` neu erzeugen.

Der deterministische Modus ist auf dem kuratierten Korpus in der Regel zuverlässiger, weil der Korpus so geformt wurde, dass er den kanonischen Phrasen des Lexikons entspricht. Der LLM-Modus tauscht Reproduzierbarkeit gegen eine bessere Abdeckung von semantisch ähnlichen Paraphrasen ein, die nicht im Lexikon erscheinen (z. B. deutsche Komposita wie `Emotionserkennungssystems`, die der deterministische n-Gramm-Extraktor verfehlt). Wählen Sie den Modus, der zu Ihrer Eingabe-Verteilung passt.

Berichte: [accuracy/REPORT.md](./accuracy/REPORT.md) (deterministisch, CI-überwacht), [accuracy/REPORT.llm-anthropic.md](./accuracy/REPORT.llm-anthropic.md), [accuracy/REPORT.llm-openai.md](./accuracy/REPORT.llm-openai.md) und [accuracy/REPORT.llm-groq.md](./accuracy/REPORT.llm-groq.md).

## Cache-Schicht

Die Ergebnisse des LLM-Modus werden auf der Festplatte unter `~/.cache/lucairn-ai-act-classifier/llm/` zwischengespeichert (respektiert `XDG_CACHE_HOME`). Der Cache-Schlüssel ist `sha256(provider + model + lexikon-version + lang + normalisierte-eingabe)`, sodass dieselbe Eingabe auf derselben Lexikon-Version ein byte-stabiles Ergebnis liefert, ohne die API zu belasten.

> 🔒 **Cache-Dateiinhalt:** Jeder Cache-Eintrag speichert das vollständige `ExtractedFeatures`-Objekt einschließlich des ursprünglichen Eingabetexts (damit die Regel-Engine bei einem Cache-Hit ihre Zitationskette neu rendern kann). Der Cache liegt im benutzerprivaten Verzeichnis `~/.cache/` und wird nirgendwohin übertragen. Für sensible Anwendungsfall-Beschreibungen entweder mit `--no-cache` (einmalig) ausführen oder `~/.cache/lucairn-ai-act-classifier/` in die Sitzungs-Aufräumroutine aufnehmen (wiederkehrend).

- **Cache-Hit:** typischerweise <100 ms (kein Netzwerk) gegenüber ~1–5 s für einen frischen API-Aufruf — über 10-facher Speedup bei jeder Wiederholung.
- **Cache-Miss:** der Provider wird aufgerufen, das Ergebnis in den Cache geschrieben, und die zwischengespeicherten Merkmale bedienen jeden weiteren Aufruf, bis sich die Lexikon-Version ändert.
- **Umgehung:** mit `--no-cache` einen frischen API-Aufruf erzwingen (für diesen Aufruf wird der Cache weder gelesen noch geschrieben).
- **Invalidierung:** automatisch bei Lexikon-Version-Bump (z. B. v0.1.1 → v0.2.0); die Lexikon-Version ist Teil des Cache-Schlüssels, sodass alte Einträge nach einem Upgrade einfach nicht mehr referenziert werden.
- **Fehlgeschlagene Aufrufe werden nicht zwischengespeichert.** Nur erfolgreiche Provider-Ergebnisse landen im Cache.

Cache manuell löschen: `rm -rf ~/.cache/lucairn-ai-act-classifier`.

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
