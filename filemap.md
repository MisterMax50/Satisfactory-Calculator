# Dateiübersicht

- `CLAUDE.md` — Kurzregeln für Agenten
- `docs/SPEC.md` — Spezifikation (Ziele, Datenmodell, Solver, Design)
- `docs/PLAN.md` — Aufgaben, Status, Prüfungen
- `index.html` — App-Shell
- `start.bat` — lokaler Server + Browser öffnen
- `css/app.css` — Design-Tokens und Layout
- `data/gamedata.js` — GENERIERT aus Spieldaten, nicht editieren
- `tools/extract_gamedata.py` — erzeugt `data/gamedata.js` aus en-US.json/de.json der Spiel-Docs (`--docs`, `--out`)
- `js/main.js` — Einstieg, verdrahtet Zustand → Solver → UI
- `js/solver.js` — Produktionsberechnung, rein
- `js/state.js` — Zustand, URL-Hash, localStorage-Pläne
- `js/i18n.js` — UI-Texte de/en, Zahlenformat
- `js/ui/README.md` — Rendering der Bereiche (Platzhalter)
- `tests/index.html` — Browser-Testrunner (Testliste)
- `tests/runner.js` — Mini-Testrunner (`test`, `assertEqual`, `assertClose`, `assertThrows`)
- `tests/example.test.js` — Beispieltest
- `tests/state.test.js` — Tests für state.js und i18n.js
- `tests/solver.test.js` — Solver-Tests mit eigenem Fixture-Datensatz
