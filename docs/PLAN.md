# Plan

Status: `[ ]` offen, `[x]` abgenommen. Details zu Datenmodell, Solver, Zustand und Design: `docs/SPEC.md`.

## 1. Scaffold — Light — keine Abhängigkeit — [x]
Ordnerstruktur laut SPEC „Architektur“ anlegen. `index.html` (lang="de", lädt `css/app.css` und `js/main.js` als Modul, Google-Fonts-Link Barlow/Barlow Condensed), `css/app.css` mit den Design-Tokens aus SPEC „Design“ als CSS-Variablen, leere Module mit Kopfkommentar. `start.bat` startet `python -m http.server 8765` im Projektordner und öffnet `http://localhost:8765`. `tests/index.html` + `tests/runner.js`: Mini-Runner (`test(name, fn)`, `assertEqual`, `assertClose(a, b, eps)`), lädt alle in `tests/index.html` gelisteten `*.test.js`, zeigt grün/rot und Summe; ein Beispieltest. `data/gamedata.js` als Platzhalter mit leerer Struktur.
Prüfung: Server starten, `/` und `/tests/` laden ohne Konsolenfehler, Beispieltest grün.

## 2. Spieldaten-Extraktion — Careful — nach 1 — [x]
`tools/extract_gamedata.py`: liest `en-US.json` und `de.json` (UTF-16) aus dem Docs-Ordner (Standardpfad in SPEC, per `--docs` überschreibbar), erzeugt `data/gamedata.js` gemäß SPEC „Datenmodell“. Rezept-Strings (`mIngredients`, `mProduct`, `mProducedIn`) parsen; Fluidmengen /1000; Dauer aus `mManufactoringDuration`; Leistung aus `mPowerConsumption` (variable Gebäude: Mittel aus `mEstimatedMininumPowerConsumption`/`Maximum` bzw. Rezeptwerten). Filter auf Produktionsgebäude. Rohstoffliste laut SPEC. Deterministische, sortierte Ausgabe.
Prüfung: Skript läuft ohne Fehler; Stichproben (Eisenplatte, Schraube, Kunststoff mit Schweröl-Nebenprodukt, Alt-Rezept „Gegossene Schraube“/„Cast Screw“, Wasser `fluid` + `raw`) im Bericht zitiert; Anzahl Items/Rezepte/Gebäude genannt.

## 3. Solver — Heavy — nach 1 — [x]
`js/solver.js` gemäß SPEC „Solver“, reine Funktionen. `tests/solver.test.js` mit kleinem eigenem Fixture-Datensatz (nicht gamedata): Einzelkette, Diamant (zwei Pfade zum selben Zwischenprodukt), Nebenprodukt wird angerechnet, Überschuss bei negativer Rate, Alternativrezept über `recipeChoice`, Zyklus ohne Lösung → `error: "cycle"`, Fluid-Mengen, Leistung mit Untertaktung, Baumstruktur.
Prüfung: alle Tests grün im Browser-Runner.

## 4. Zustand und i18n — Medium — nach 1 — [x]
`js/state.js` gemäß SPEC „Zustand“: `encodeState/decodeState` (base64url, UTF-8-sicher), `loadInitialState()`, `saveLast()`, Plan-CRUD, kleiner Event-Mechanismus `subscribe(fn)` / `update(patch)`. `js/i18n.js`: alle UI-Texte de/en (Liste in SPEC „Abläufe“/„Design“), `t(key)`, `itemName(item)`, `formatNumber(n)`. `tests/state.test.js`: Roundtrip, kaputter Hash, Umlaute.
Prüfung: Tests grün.

## 5. Oberfläche — Careful — nach 2, 3, 4 — [x]
`js/ui/*` und `js/main.js`: Layout, Ziele mit Item-Suche, Rezeptauswahl, Kennzahlenleiste, Reiter Produktionsliste/Baum/Rohstoffe, Sprache, Link kopieren, Pläne speichern/laden/löschen — exakt nach SPEC „Design“ und „Abläufe“. Responsiv bis 390px.
Prüfung: Beispielplan 5 Modulare Rahmen/min manuell nachgerechnet; Screenshots 1440px und 390px; keine Konsolenfehler.

## 6. Abnahme — Orchestrator — nach 5 — [x]
Review, Gegenrechnung, Commit.

# Version 2 (SPEC „Version 2“)

## 7. Daten v2 — Medium — keine Abhängigkeit — [x]
`tools/extract_gamedata.py` erweitern: Somersloop-Felder an `buildings`, neue `extractors` und `pressurizer` laut SPEC „Version 2 › Daten“. `js/resourceLimits.js` von Hand anlegen. Neu erzeugen.
Prüfung: Miner Mk1/2/3 = 60/120/240 pro min, 5/15/45 MW; Wasserextraktor 120 m³/min 20 MW; Ölextraktor 120 m³/min 40 MW; Brunnen-Extraktor 60 m³/min; Druckerzeuger 150 MW; Somersloop-Plätze aller Produktionsgebäude im Bericht.

## 8. Ergebnis-Kern, Somersloops, Importe, Förderung — Careful — keine Abhängigkeit — [x]
`js/result.js` (buildResult) aus `js/solver.js` herauslösen; `solve()` nutzt es und nimmt `mods` an. Somersloops und Importe laut SPEC. `js/extraction.js` neu. Tests: bestehende 36 bleiben grün; neue Tests für Somersloops (Ausstoß, Strom), Importe, Mehrfach-Erzeuger im Baum, Förderung (Reinheit, Takt, Brunnen, Wasserextraktor).

## 9. Zustand v2 und Texte — Medium — keine Abhängigkeit — [x]
`js/state.js` auf v2 inkl. Migration v1 → v2; `js/i18n.js` mit allen Texten aus SPEC „Oberfläche v2“ (de + en). Tests für Migration und neue Felder.

## 10. Optimierer — Heavy — nach 8 — [ ]
`js/optimizer.js` laut SPEC „Optimierung“ mit eigenem Simplex. Tests: kleines LP mit bekannter Lösung, Wahl des sparsameren Alternativrezepts, Ausschlüsse, `allowAlternates: false`, infeasible, Ziel Strom vs. Rohstoffe, Somersloops; Laufzeit-Test über alle Items mit echten Daten.

## 11. Fluss-Graph — Careful — nach 8 — [ ]
`js/flowLayout.js` (rein, getestet) und `js/ui/flow.js` (SVG, Verschieben/Zoom/Einpassen, Hover) laut SPEC; vierten Reiter „Fluss“ in `js/ui/results.js` eintragen.

## 12. Oberfläche v2 — Careful — nach 7, 8, 9, 10, 11 — [ ]
Rezepte-Modus, Somersloop-Auswahl, „Zuliefern“, Kennzahlen, Rohstoffe-Tabelle mit Förderung, Fehler-Banner `infeasible`; echter Test der Zyklus-Meldung im Browser.

## 13. README — Light — nach 12 — [ ]
`README.md` und `docs/screenshot.png` laut SPEC „README“.
