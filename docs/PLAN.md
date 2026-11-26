# Plan

Status: `[ ]` offen, `[x]` abgenommen. Details zu Datenmodell, Solver, Zustand und Design: `docs/SPEC.md`.

## 1. Scaffold — Light — keine Abhängigkeit — [ ]
Ordnerstruktur laut SPEC „Architektur“ anlegen. `index.html` (lang="de", lädt `css/app.css` und `js/main.js` als Modul, Google-Fonts-Link Barlow/Barlow Condensed), `css/app.css` mit den Design-Tokens aus SPEC „Design“ als CSS-Variablen, leere Module mit Kopfkommentar. `start.bat` startet `python -m http.server 8080` im Projektordner und öffnet `http://localhost:8080`. `tests/index.html` + `tests/runner.js`: Mini-Runner (`test(name, fn)`, `assertEqual`, `assertClose(a, b, eps)`), lädt alle in `tests/index.html` gelisteten `*.test.js`, zeigt grün/rot und Summe; ein Beispieltest. `data/gamedata.js` als Platzhalter mit leerer Struktur.
Prüfung: Server starten, `/` und `/tests/` laden ohne Konsolenfehler, Beispieltest grün.

## 2. Spieldaten-Extraktion — Careful — nach 1 — [ ]
`tools/extract_gamedata.py`: liest `en-US.json` und `de.json` (UTF-16) aus dem Docs-Ordner (Standardpfad in SPEC, per `--docs` überschreibbar), erzeugt `data/gamedata.js` gemäß SPEC „Datenmodell“. Rezept-Strings (`mIngredients`, `mProduct`, `mProducedIn`) parsen; Fluidmengen /1000; Dauer aus `mManufactoringDuration`; Leistung aus `mPowerConsumption` (variable Gebäude: Mittel aus `mEstimatedMininumPowerConsumption`/`Maximum` bzw. Rezeptwerten). Filter auf Produktionsgebäude. Rohstoffliste laut SPEC. Deterministische, sortierte Ausgabe.
Prüfung: Skript läuft ohne Fehler; Stichproben (Eisenplatte, Schraube, Kunststoff mit Schweröl-Nebenprodukt, Alt-Rezept „Gegossene Schraube“/„Cast Screw“, Wasser `fluid` + `raw`) im Bericht zitiert; Anzahl Items/Rezepte/Gebäude genannt.

## 3. Solver — Heavy — nach 1 — [ ]
`js/solver.js` gemäß SPEC „Solver“, reine Funktionen. `tests/solver.test.js` mit kleinem eigenem Fixture-Datensatz (nicht gamedata): Einzelkette, Diamant (zwei Pfade zum selben Zwischenprodukt), Nebenprodukt wird angerechnet, Überschuss bei negativer Rate, Alternativrezept über `recipeChoice`, Zyklus ohne Lösung → `error: "cycle"`, Fluid-Mengen, Leistung mit Untertaktung, Baumstruktur.
Prüfung: alle Tests grün im Browser-Runner.

## 4. Zustand und i18n — Medium — nach 1 — [ ]
`js/state.js` gemäß SPEC „Zustand“: `encodeState/decodeState` (base64url, UTF-8-sicher), `loadInitialState()`, `saveLast()`, Plan-CRUD, kleiner Event-Mechanismus `subscribe(fn)` / `update(patch)`. `js/i18n.js`: alle UI-Texte de/en (Liste in SPEC „Abläufe“/„Design“), `t(key)`, `itemName(item)`, `formatNumber(n)`. `tests/state.test.js`: Roundtrip, kaputter Hash, Umlaute.
Prüfung: Tests grün.

## 5. Oberfläche — Careful — nach 2, 3, 4 — [ ]
`js/ui/*` und `js/main.js`: Layout, Ziele mit Item-Suche, Rezeptauswahl, Kennzahlenleiste, Reiter Produktionsliste/Baum/Rohstoffe, Sprache, Link kopieren, Pläne speichern/laden/löschen — exakt nach SPEC „Design“ und „Abläufe“. Responsiv bis 390px.
Prüfung: Beispielplan 5 Modulare Rahmen/min manuell nachgerechnet; Screenshots 1440px und 390px; keine Konsolenfehler.

## 6. Abnahme — Orchestrator — nach 5 — [ ]
Review, Gegenrechnung, Commit.
