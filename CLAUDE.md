# Satisfactory-Rechner

Stack: statisches HTML/CSS/JS (native ES-Module, kein Build, keine npm-Pakete); Python 3 nur für `tools/` und den lokalen Server.

## Befehle
- Starten: `start.bat` oder `python -m http.server 8765` im Projektordner → http://localhost:8765
- Tests: Server starten, http://localhost:8765/tests/ öffnen (Browser-Runner)
- Spieldaten neu erzeugen: `python tools/extract_gamedata.py` (optional `--docs <Pfad>`)

## Konventionen
- `data/gamedata.js` ist generiert: nie von Hand editieren, Skript ändern und neu laufen lassen.
- `js/solver.js` bleibt rein (kein DOM, kein localStorage, keine globalen Daten-Importe).
- Jeder sichtbare Text kommt aus `js/i18n.js` (de + en); Itemnamen aus `item.name[lang]`.
- Fluide intern und in der Anzeige in m³ (Docs-Werte / 1000).
- Keine Spiel-Grafiken, Logos oder Icons einbinden.
- Farben/Schriften nur über die CSS-Variablen in `css/app.css`.
- Neue/verschobene Dateien in `filemap.md` eintragen.

## Doku
- Spezifikation: `docs/SPEC.md`
- Aufgaben und Status: `docs/PLAN.md`
- Dateiübersicht: `filemap.md`
