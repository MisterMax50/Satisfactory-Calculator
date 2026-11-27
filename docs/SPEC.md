# Satisfactory-Rechner — Spezifikation

## Ziele
- Produktionsplaner für Satisfactory 1.0 im Browser: Zielprodukte + Menge/min eingeben → alle Zwischenprodukte, Maschinen (Anzahl, Taktung), Rohstoffbedarf, Strom, Überschuss.
- Alternativrezepte pro Produkt wählbar.
- Oberfläche und Itemnamen Deutsch und Englisch, umschaltbar.
- Pläne lokal im Browser speichern und als Link teilen.
- Keine Installation: statische Dateien, läuft über `python -m http.server`.

## Nicht-Ziele
- Optimierung, Fluss-Graph, Miner/Reinheit und Somersloops: in Version 2 umgesetzt, siehe Abschnitt „Version 2“ unten.
- Keine Power-Shards/Übertaktung von Produktionsgebäuden (nur Untertaktung auf ganze Maschinen); Übertaktung nur für Förderanlagen.
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

## Version 2

### Daten (Erweiterung `data/gamedata.js`, weiterhin generiert)
- `buildings[id]` zusätzlich: `sloopSlots` (`mProductionShardSlotSize`), `sloopBoost` (`mProductionShardBoostMultiplier`, Verstärkung je Somersloop), `boostPowerExponent` (`mProductionBoostPowerConsumptionExponent`).
- Neu `extractors`: `{ id, name: {de,en}, kind: "miner" | "pump" | "well", ratePerMin, power, allowed: [itemId] | null, forms: ["solid"|"fluid"|"gas"] }`. `ratePerMin` = `mItemsPerCycle / mExtractCycleTime × 60`, Fluide /1000, gilt für normalen Knoten und 100 %. Miner Mk1–3, Wasserextraktor, Ölextraktor, Ressourcenbrunnen-Extraktor.
- Neu `pressurizer`: `{ id, name, power }` (Ressourcenbrunnen-Quellenkompressor).
- `js/resourceLimits.js` (von Hand gepflegt, nicht generiert): maximale Weltförderung je Rohstoff pro Minute als Richtwert für die Optimierung: Eisenerz 92100, Kalkstein 69900, Kupfererz 36900, Kohle 42300, Cateriumerz 15000, Rohquarz 13500, Schwefel 10800, Bauxit 12300, Uran 2100, SAM 10200, Rohöl 12600, Stickstoffgas 12000, Wasser unbegrenzt.

### Gemeinsames Ergebnis (`js/result.js`)
`buildResult({ rates, targets, data, mods })` baut aus Rezeptraten (`{ recipeId: Durchläufe/min }`) das `Result` aus SPEC „Solver“. `solve()` und `optimize()` nutzen es beide. Ein Item darf von mehreren Rezepten kommen (eine Zeile je Rezept). Baum: Bedarf eines Items wird anteilig auf seine Erzeuger verteilt.
`mods = { sloops: { recipeId: n }, imports: [itemId] }`:
- Somersloops: `boost = n × building.sloopBoost` (0 ≤ n ≤ sloopSlots). Alle Outputs je Durchlauf × `(1 + boost)`, Inputs unverändert. Strom je Maschine × `(1 + boost) ^ boostPowerExponent`. Zeile bekommt `sloops: n`, `sloopsTotal: ceil(machines) × n`; `Result.sloopsTotal`.
- Importe: Items in `imports` werden nie produziert, sondern wie Rohstoffe geliefert (`raw`-Eintrag mit `imported: true`).

### Förderung (`js/extraction.js`, rein)
`computeExtraction({ raw, settings, data }) → { rows: [{ item, rate, extractor, purity, clock, count, clockEffective, power, pressurizers }], power }`.
- Reinheit: unrein 0,5 / normal 1 / rein 2. Wasserextraktor ohne Reinheit (immer 1).
- `count = ceil(rate / (ratePerMin × Reinheit × maxClock))`, `clockEffective = rate / (count × ratePerMin × Reinheit)`, `power = count × P × clockEffective ^ 1.321928`. `maxClock` 1–250 %.
- Ressourcenbrunnen: `count` = Satelliten-Extraktoren (0 MW), zusätzlich Quellenkompressoren `pressurizers` (Eingabe, Standard `ceil(count / 4)`, als Schätzung gekennzeichnet) × 150 MW, nicht getaktet.
- Standard je Rohstoff: fest → Miner Mk.2, Wasser → Wasserextraktor, Rohöl → Ölextraktor, Stickstoff → Ressourcenbrunnen; Reinheit normal; maxClock 100 %. Wählbar sind nur Förderanlagen, deren `allowed`/`forms` passt (Wasser und Öl auch per Brunnen).
- Importierte Items und Items ohne Rezept haben keine Förderung.

### Optimierung (`js/optimizer.js`, rein)
`optimize({ targets, objective, allowAlternates, excluded, mods, data }) → Result | { error: "infeasible", items }`.

Ziel `"max"` („Vorhandene Rohstoffe ausnutzen“): `available: { rawId: rate }` deckelt die Rohstoffe (nicht eingetragen = 0, Wasser ohne Eintrag unbegrenzt, Importe frei). Die Ziel-Raten sind ein Verhältnis; maximiert wird der Faktor k (Ergebnis `scale`), Nebenziel gewichtete Rohstoffe. Fehler `insufficient` (k = 0) und `unbounded` (nichts begrenzt). Bei k < 1 nennt `missing: [{ item, rate }]` die zusätzlich nötigen Rohstoffe für k = 1 (zweites LP mit Fehlmengen-Spalten, minimiert gewichtet); angezeigt unter „Erreicht“ bzw. im Fehlerbanner.
- Lineares Programm, eigener Simplex (zwei Phasen oder Big-M, Bland-Regel gegen Kreiseln), keine Bibliothek. Nur Rezepte, die rückwärts von den Zielen erreichbar sind; ausgeschlossene und (wenn `allowAlternates` falsch) alternative Rezepte entfallen.
- Variablen: Rezeptraten ≥ 0, Rohstoff-/Import-Lieferung ≥ 0. Je Item: Nettoproduktion + Lieferung ≥ Zielbedarf (Rest = Überschuss).
- Ziel `"resources"`: minimiere Σ Lieferung / Weltlimit (Wasser Gewicht 1e-6, Importe 0) + 1e-6 × Maschinen. Ziel `"power"`: minimiere Strom der Produktion + 1e-6 × gewichtete Rohstoffe.
- Somersloops und Importe aus `mods` gelten wie im Solver.
- Laufzeit für jedes einzelne Ziel-Item bei 10/min < 500 ms.

### Fluss-Graph (`js/flowLayout.js` rein, `js/ui/flow.js` Darstellung)
- Knoten: je Ergebniszeile ein Maschinenknoten, je Rohstoff/Import ein Quellknoten, je Ziel ein Zielknoten, je Überschuss ein Überschussknoten.
- Kanten: Angebot eines Items (Erzeuger + Lieferung) wird anteilig auf Verbraucher und Ziel-/Überschussknoten verteilt; Kante = Item + Menge.
- Layout links → rechts in Spalten: Quellen links, Maschinen nach längstem Pfad, Ziele/Überschuss rechts. Kreuzungen per Baryzentrum-Verfahren (mehrere Durchgänge) verringern. Kanten als Bézierkurven.
- Darstellung SVG: verschieben per Ziehen, Zoom per Mausrad (zum Cursor) und Knöpfe „+“, „−“, „Einpassen“; Tastatur +/−/Pfeile, wenn der Graph fokussiert ist.

### Zustand v2
`{ v: 2, targets, recipes, lang, mode: "manual" | "optimized", objective: "resources" | "power" | "max", allowAlternates: true, excluded: [recipeId], sloops: { recipeId: n }, imports: [itemId], extraction: { itemId: { extractor, purity, maxClock, pressurizers? } }, available: { itemId: rate }, progress: { tier: 0–9 | null, alternates: [recipeId] | null } }`. v1-Hashes und -Pläne werden beim Laden zu v2 migriert (fehlende Felder mit Standardwerten).

### Oberfläche v2
- **Rezepte**: Segment „Manuell | Optimiert“ oben im Bereich. Manuell wie bisher. Optimiert: Auswahl Ziel („Rohstoffe sparen“ / „Strom sparen“), Kontrollkästchen „Alternativrezepte verwenden“, Liste der genutzten Rezepte je Item (Text, mehrere pro Item möglich) mit Textknopf „Ausschließen“; darunter ausgeschlossene Rezepte mit „Wieder erlauben“.
- **Produktionsliste**: In der Maschinenspalte unter dem Schild ein kleines Select „Somersloops 0…n“ (nur wenn `sloopSlots > 0`); bei n > 0 Zusatz „+100 % Ausstoß · 6 Somersloops“ in Akzent. In der Produktspalte Textknopf „Zuliefern“ (Item wird Import). Somersloops werden im optimierten Modus ebenfalls berücksichtigt.
- **Kennzahlen**: Strom = Produktion + Förderung, darunter klein „davon Förderung 120 MW“. Fünfte Kachel „Somersloops“ nur wenn > 0.
- **Rohstoffe**: Tabelle Rohstoff · Menge · Förderanlage (Select) · Reinheit (Select, beim Wasserextraktor ausgeblendet) · Max. Takt (Zahl 1–250 %) · Ergebnis („4 × Miner Mk.2 bei 93,75 %“) · Strom; bei Brunnen Zahlenfeld „Quellenkompressoren“. Summenzeile. Darunter „Zugeliefert“: importierte Items mit Menge und Knopf „Selbst herstellen“. Darunter Überschuss wie bisher.
- **Fluss**: vierter Reiter. Maschinenknoten 200 × 56 px im Stil der Maschinenschilder (Fläche erhöht, 1px Akzentrahmen, Radius 4px, oben `3 × Konstruktor`, darunter Itemname gedämpft). Quellknoten: gestrichelter Rahmen in Linienfarbe. Ziel- und Überschussknoten: Rahmen Akzent bzw. gedämpft. Kanten 1,5px: Stückgut in gedämpfter Textfarbe, Fluide in Rohrblau; Beschriftung „Eisenbarren 30 /min“ mittig auf Flächenfarbe. Hover/Fokus auf Knoten hebt seine Kanten in Akzent hervor. Steuerknöpfe oben rechts im Graph.
- **Fehler** `infeasible`: Banner wie beim Zyklus: „Mit den erlaubten Rezepten lässt sich {items} nicht herstellen. Erlaube Alternativrezepte oder weniger Ausschlüsse.“

### README
`README.md` (Deutsch, kurz Englisch): Was es ist, Start (`start.bat` / `python -m http.server 8765`), Funktionen, Spieldaten aktualisieren, Tests, Hinweis „Inoffizielles Fan-Tool, nicht mit Coffee Stain Studios verbunden; Spieldaten aus den Community-Docs des Spiels“. Ein Screenshot unter `docs/screenshot.png`.

## Spielstand

Reiter „Spielstand“: erreichtes Tier (0–9 oder „alle“) und freigeschaltete Alternativrezepte („alle“ oder Liste). `recipes[].tier` kommt aus den Docs: kleinstes `mTechTier` der Schematics, die das Rezept freischalten (Festplatten nur, wenn es keine anderen gibt). `js/progress.js` (`applyProgress`) entfernt gesperrte Rezepte aus den Spieldaten, bevor Solver, Optimierer und Rezeptauswahl sie sehen; ein gesperrtes Standardrezept wird durch ein freies ersetzt (Standard vor Alternative), sonst ist das Item ohne Rezept. Alternativen: mit Liste zählt nur die Liste, ohne Liste das Tier. Beim Laden eines Plans bleibt der aktuelle Spielstand erhalten; im Link wird er mitgegeben. Kein MAM-Fortschritt im Detail (MAM-Rezepte zählen ab Tier 3).
