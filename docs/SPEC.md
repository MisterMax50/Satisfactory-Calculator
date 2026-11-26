# Satisfactory-Rechner — Spezifikation

## Ziele
- Produktionsplaner für Satisfactory 1.0 im Browser: Zielprodukte + Menge/min eingeben → alle Zwischenprodukte, Maschinen (Anzahl, Taktung), Rohstoffbedarf, Strom, Überschuss.
- Alternativrezepte pro Produkt wählbar.
- Oberfläche und Itemnamen Deutsch und Englisch, umschaltbar.
- Pläne lokal im Browser speichern und als Link teilen.
- Keine Installation: statische Dateien, läuft über `python -m http.server`.

## Nicht-Ziele (MVP)
- Keine Optimierung (z.B. minimaler Rohstoffverbrauch, automatische Rezeptwahl).
- Kein grafischer Fluss-Graph (nur eingerückter Baum). Später möglich.
- Kein Stromverbrauch von Minern/Extraktoren, keine Erzknoten-Reinheit, keine Somersloops/Produktionsverstärkung.
- Kein Import/Export von Spielständen, kein Server, kein Login.
- Keine Spiel-Grafiken, Icons oder Logos (Urheberrecht). Items werden als Text dargestellt.

## Stack
- HTML5, CSS, JavaScript (ES2022, native ES-Module), kein Build, keine npm-Abhängigkeiten.
- Python 3.13 nur für das Datenskript (`tools/`) und den lokalen Server.
- Schriften: Barlow und Barlow Condensed über Google Fonts, Fallback `system-ui` / `Arial Narrow`.
- Tests: eigener Mini-Testrunner im Browser (`tests/index.html`), keine Bibliothek.

## Architektur
```
index.html            Shell, lädt js/main.js als Modul
css/app.css           Design-Tokens + Layout
data/gamedata.js      GENERIERT: export default { items, recipes, buildings }
tools/extract_gamedata.py   erzeugt data/gamedata.js aus den Docs-JSON des Spiels
js/solver.js          reine Funktion solve(): keine DOM-Zugriffe
js/state.js           App-Zustand, URL-Hash-Kodierung, localStorage-Pläne
js/i18n.js            UI-Texte de/en, t(key), itemName(item, lang)
js/ui/*.js            Rendering der Bereiche (Ziele, Rezepte, Übersicht, Liste, Baum)
js/main.js            verdrahtet state → solver → ui
tests/                Testrunner + *.test.js
```
Abhängigkeitsrichtung: `ui → state, solver, i18n, gamedata`; `solver` kennt nur die Daten, die ihm übergeben werden.

## Datenquelle
Das Spiel liefert offizielle Daten mit:
`C:\Program Files (x86)\Steam\steamapps\common\Satisfactory\CommunityResources\Docs\en-US.json` und `de.json` (UTF-16 LE mit BOM, Array von `{ NativeClass, Classes[] }`).
`tools/extract_gamedata.py` liest beide und schreibt `data/gamedata.js`. Die Datei wird eingecheckt, damit die App ohne Spiel läuft. Pfad per Argument überschreibbar.

## Datenmodell (`data/gamedata.js`)
```js
export default {
  version: "1.0",
  items: {
    "Desc_IronPlate_C": { id, name: { de, en }, form: "solid" | "fluid" | "gas", raw: bool,
                          defaultRecipe: "Recipe_IronPlate_C" | null }   // null bei Rohstoffen / ohne Rezept
  },
  recipes: {
    "Recipe_IronPlate_C": {
      id, name: { de, en }, alternate: bool,
      building: "Build_ConstructorMk1_C",
      duration: 6,                              // Sekunden pro Durchlauf
      inputs:  [{ item, amount }],              // pro Durchlauf; Fluide in m³ (Docs-Wert / 1000)
      outputs: [{ item, amount }],              // erstes Element = Hauptprodukt
      power: 1500                               // optional, MW: nur bei variabler Leistung (Mittelwert), sonst building.power
    }
  },
  buildings: {
    "Build_ConstructorMk1_C": { id, name: { de, en }, power: 4 }   // MW bei 100 %; variable Leistung: Mittelwert
  }
}
```
- Nur Rezepte, die in Produktionsgebäuden laufen (Konstruktor, Monteur, Fertiger, Hersteller, Schmelzofen, Gießerei, Raffinerie, Mischer, Packer, Teilchenbeschleuniger, Konverter, Quantenkodierer). Keine Werkbank-, Ausrüstungs- oder Baurezepte.
- `raw: true` für Rohstoffe: alle Erze, Kalkstein, Kohle, Quarz, Schwefel, Bauxit, Uran, SAM, Wasser, Rohöl, Stickstoffgas.
- Nur Items, die in mindestens einem enthaltenen Rezept vorkommen.
- `defaultRecipe` in Stufen, jeweils nur Rezepte mit dem Item als erstem Output und ohne Entpack-Rezepte (`Recipe_Unpackage*`):
  1. nicht alternativ, kein Konverter, kein `*Residual*` → bevorzugt ID `Recipe_<Basisname>_C`, sonst alphabetisch erste;
  2. sonst nicht alternativ inkl. Konverter/Residual (alphabetisch erste);
  3. sonst alternativ (alphabetisch erste);
  4. sonst `null` (Rohstoffe immer `null`).

## Solver (`js/solver.js`)
`solve({ targets, recipeChoice, data }) → Result`
- `targets`: `[{ item, rate }]` (Einheiten bzw. m³ pro Minute).
- `recipeChoice`: `{ [itemId]: recipeId }`; fehlt ein Eintrag, gilt `items[id].defaultRecipe`. Rohstoffe werden nie produziert. Nicht-Rohstoff ohne Rezept → erscheint in `raw` mit `missingRecipe: true`.
- Strom je Maschine: `recipe.power ?? buildings[recipe.building].power`.
- Verfahren: Für jedes erreichbare Nicht-Rohstoff-Item genau ein Rezept. Lineares Gleichungssystem „Nettoproduktion je Item = Bedarf“, Nebenprodukte werden angerechnet. Lösen per Gauß-Elimination. Wird eine Rezeptrate negativ (Nebenprodukt deckt mehr als den Bedarf), wird das Rezept auf 0 gesetzt, das Item als Überschuss geführt und neu gelöst. Singuläres System → Fehler `{ error: "cycle", items }`.
- `Result`:
  ```js
  {
    rows: [{ recipe, item, runsPerMin, machines, building, power,
             inputs: [{item, rate}], outputs: [{item, rate}] }],   // Reihenfolge: Ziel zuerst, dann nach Tiefe
    raw:     [{ item, rate, missingRecipe? }],
    surplus: [{ item, rate }],
    power:   number,         // MW
    machineCount: number,    // Summe aufgerundeter Maschinen
    tree:    Node[]          // je Ziel ein Knoten { item, rate, recipe, children: Node[] }
  }
  ```
- Baum: Kinder = Eingänge des gewählten Rezepts, skaliert mit `rate / Hauptprodukt-Menge pro Minute` (ohne Nebenprodukt-Gutschrift, reine Anzeige). Ein Item, das auf dem aktuellen Pfad schon vorkommt, wird nicht weiter aufgeklappt (`cycle: true`).
- `rows`-Reihenfolge: nach Tiefe (längster Pfad von einem Ziel), bei Gleichstand nach Item-ID.
- `machines` ist die exakte Bruchzahl. Vorschlag in der UI: `ceil(machines)` Maschinen mit Taktung `machines / ceil(machines)`.
- Leistung je Zeile: `ceil(m) × P × (m / ceil(m)) ^ 1.321928`.
- Werte mit Toleranz 1e-9 runden, damit keine Fließkomma-Artefakte entstehen.

## Zustand, Speichern, Teilen (`js/state.js`)
- Zustand: `{ v: 1, targets: [[itemId, rate]], recipes: { itemId: recipeId }, lang: "de" | "en" }`.
- URL: `#p=` + base64url(JSON). Beim Laden hat der Hash Vorrang vor dem zuletzt genutzten Zustand.
- localStorage: `sfcalc.last` (letzter Zustand), `sfcalc.plans` (`[{ name, state, savedAt }]`).
- Ungültige Hashes/Einträge werden ignoriert, nie ein Absturz.

## Design
Kontrollraum einer Fabrik. Eine einzige Akzentfarbe, Zahlen in schmaler Beschilderungsschrift.
- Farben: Grund `#1B242B`, Fläche `#24313A`, Fläche erhöht `#2D3C47`, Linie `#3A4B57`, Text `#E6EBEE`, Text gedämpft `#9AA9B3`, Akzent Sicherheitsorange `#FF9A3C`, Fluide Rohrblau `#5BB8E6`, Fehler `#F06A5E`.
- Schrift: Barlow 400/500 für Text (15px Basis, Zeilenhöhe 1.5); Barlow Condensed 500 für Zahlen, Überschriften und Maschinenschilder, `font-variant-numeric: tabular-nums`. Keine Großbuchstaben-Labels.
- Layout Desktop: links feste Spalte 300px (Ziele, Rezepte, Sprache/Teilen/Pläne), rechts Inhalt: oben Kennzahlenleiste (Strom, Maschinen, Top-Rohstoffe, Überschuss), darunter Ansichten „Produktionsliste“, „Baum“, „Rohstoffe“ als Reiter. Unter 900px eine Spalte, Eingaben zuerst.
- Produktionsliste: Zeilen mit Trennlinien (keine Karten): Produkt · Maschinenschild (`3 × Konstruktor`, darunter `bei 83,3 %`) · Menge/min · Eingänge · Ausgänge/Nebenprodukte. Maschinenschild: Barlow Condensed, Rahmen 1px Akzent, Radius 4px.
- Fluide überall mit `m³/min` und rohrblauer Farbmarkierung; Stückgut `/min`.
- Rezeptauswahl: je Item im Plan ein Select; gewählte Alternativrezepte mit orangem Rahmen.
- Leerer Zustand: „Füge ein Produkt hinzu, um deine Fabrik zu planen.“ mit Item-Suche fokussiert.
- Zahlenformat nach Sprache (`Intl.NumberFormat`, max. 2 Nachkommastellen).
- Fokus sichtbar (2px Akzent-Outline), Tastatur bedienbar, `prefers-reduced-motion` beachtet. Kein dekoratives Animieren.

## Wichtige Abläufe
1. Item suchen (Name in aktueller Sprache, Teilstring) → Ziel mit 10/min angelegt → Ergebnis sofort aktualisiert.
2. Menge ändern → Neuberechnung bei jeder Eingabe.
3. Rezept für ein Zwischenprodukt umstellen → Neuberechnung, URL-Hash aktualisiert.
4. „Link kopieren“ → URL mit Hash in Zwischenablage, Bestätigung „Link kopiert“.
5. „Plan speichern“ (Name) / Plan laden / löschen.
6. Sprache umschalten → Texte und Itemnamen wechseln, Zustand bleibt.

## Definition of Done (MVP)
- `data/gamedata.js` aus Spieldaten erzeugt; Stichproben stimmen (Eisenplatte: 3 Eisenbarren → 2 Platten in 6 s, Konstruktor 4 MW).
- Alle Solver-Tests grün in `tests/index.html` (Einzelkette, Nebenprodukt, Alternativrezept, Überschuss, Zyklus-Fehler, Fluide).
- Beispielplan „5 Modulare Rahmen/min“ stimmt mit manueller Rechnung überein.
- Sprache, Speichern, Link teilen funktionieren nach Neuladen.
- Keine Konsolenfehler; Layout bei 1440px und 390px Breite in Ordnung.
