# extract_mapnodes.py — erzeugt data/mapnodes.js (Rohstoffknoten der Weltkarte) aus WorldResourceNodes.json.
# Quelle: https://github.com/rockfactory/satisfactory-logistics (src/recipes/WorldResourceNodes.json),
# MIT License, Copyright (c) 2024 Leonardo Ascione. Aufruf: python tools/extract_mapnodes.py --src <json>
import argparse
import json
import pathlib

# nodeType der Quelle → Art auf der Karte; Kerne und Lagerstätten haben keinen eigenen Abbau.
KINDS = {"node": "node", "frackingSatellite": "well", "geyser": "geyser"}
PURITIES = ("impure", "normal", "pure")
SOURCE = "rockfactory/satisfactory-logistics (MIT, (c) 2024 Leonardo Ascione)"


def convert(raw):
    """Rohdaten → sortierte Zeilen [resource, purity, x_m, y_m, kind] (Spielkoordinaten in m)."""
    rows = []
    for n in raw:
        kind = KINDS.get(n.get("nodeType"))
        if not kind:
            continue
        if n["purity"] not in PURITIES:
            raise ValueError(f"unbekannte Reinheit {n['purity']!r} bei {n['id']}")
        rows.append([n["resource"], n["purity"], round(n["x"] / 100), round(n["y"] / 100), kind])
    rows.sort()
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="Pfad zu WorldResourceNodes.json")
    ap.add_argument("--out", default=str(pathlib.Path(__file__).resolve().parent.parent / "data" / "mapnodes.js"))
    args = ap.parse_args()
    rows = convert(json.loads(pathlib.Path(args.src).read_text(encoding="utf-8")))
    assert len(rows) > 400, f"nur {len(rows)} Knoten – Quelle prüfen"
    lines = ",\n".join("    " + json.dumps(r) for r in rows)
    pathlib.Path(args.out).write_text(
        "// GENERIERT von tools/extract_mapnodes.py – nicht editieren\n"
        f"// Quelle: {SOURCE}\n"
        "// Zeilen: [Rohstoff-ID, Reinheit, x (m), y (m), Art node|well|geyser]; Spielkoordinaten, +y = Süden.\n"
        "export default {\n"
        f"  source: {json.dumps(SOURCE)},\n"
        "  bounds: { x: -3247, y: -3750, width: 7500, height: 7500 },\n"
        f"  nodes: [\n{lines},\n  ],\n"
        "};\n",
        encoding="utf-8",
    )
    print(f"{len(rows)} Knoten -> {args.out}")


if __name__ == "__main__":
    main()
