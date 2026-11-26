#!/usr/bin/env python3
"""Erzeugt data/gamedata.js aus den offiziellen Satisfactory-Docs (en-US.json, de.json).

Aufruf:  python tools/extract_gamedata.py [--docs <Docs-Ordner>] [--out <Ausgabedatei>]

Nur Python-Standardbibliothek. Datenmodell: siehe docs/SPEC.md ("Datenmodell").
"""
import argparse
import json
import re
import sys
from pathlib import Path

DEFAULT_DOCS = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Satisfactory\CommunityResources\Docs")
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "data" / "gamedata.js"

# Klassen der Produktionsgebaeude, deren Rezepte uebernommen werden.
PRODUCTION_NATIVE_CLASSES = ("FGBuildableManufacturer", "FGBuildableManufacturerVariablePower")
VARIABLE_POWER_NATIVE_CLASS = "FGBuildableManufacturerVariablePower"

FORMS = {"RF_SOLID": "solid", "RF_LIQUID": "fluid", "RF_GAS": "gas"}
FLUID_FORMS = ("fluid", "gas")

ITEM_RE = re.compile(r"ItemClass=\"[^\"]*?\.(\w+)'\",Amount=(\d+)")
PRODUCED_IN_RE = re.compile(r"\.(\w+)\"")


def fail(msg):
    sys.exit("FEHLER: " + msg)


def load_docs(path):
    """Liest eine Docs-Datei (UTF-16 LE mit BOM) und gibt {NativeClass-Kurzname: [Klassen]} zurueck."""
    raw = Path(path).read_bytes()
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        text = raw.decode("utf-16")  # entfernt die BOM
    elif raw[:3] == b"\xef\xbb\xbf":
        text = raw.decode("utf-8-sig")
    else:
        text = raw.decode("utf-16-le")
    by_native = {}
    for entry in json.loads(text):
        short = entry["NativeClass"].split(".")[-1].rstrip("'")
        by_native.setdefault(short, []).extend(entry["Classes"])
    return by_native


def num(value):
    """Zahl als int, wenn ganzzahlig, sonst als gerundeter float (JS-Zahl, nie String)."""
    value = round(float(value), 6)
    return int(value) if value == int(value) else value


def parse_items(text):
    return [(m.group(1), int(m.group(2))) for m in ITEM_RE.finditer(text)]


def names_by_class(by_native, ids):
    out = {}
    for classes in by_native.values():
        for c in classes:
            if c["ClassName"] in ids and c.get("mDisplayName"):
                out[c["ClassName"]] = c["mDisplayName"]
    return out


def main():
    ap = argparse.ArgumentParser(description="Erzeugt data/gamedata.js aus den Satisfactory-Docs.")
    ap.add_argument("--docs", type=Path, default=DEFAULT_DOCS, help="Ordner mit en-US.json und de.json")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Ausgabedatei (Standard: data/gamedata.js)")
    args = ap.parse_args()

    en_path, de_path = args.docs / "en-US.json", args.docs / "de.json"
    for p in (en_path, de_path):
        if not p.is_file():
            fail(f"{p} nicht gefunden (Docs-Ordner per --docs angeben)")
    en, de = load_docs(en_path), load_docs(de_path)

    # --- Item-Stammdaten (alle Desc_*-Klassen mit mForm) und Namen ---
    item_form = {}
    for classes in en.values():
        for c in classes:
            if c.get("mForm") in FORMS:
                item_form[c["ClassName"]] = FORMS[c["mForm"]]
    raw_ids = {c["ClassName"] for c in en.get("FGResourceDescriptor", [])}
    item_en, item_de = names_by_class(en, item_form), names_by_class(de, item_form)

    # --- Gebaeude ---
    buildings, variable_buildings = {}, set()
    for native in PRODUCTION_NATIVE_CLASSES:
        de_names = {c["ClassName"]: c["mDisplayName"] for c in de.get(native, [])}
        for c in en.get(native, []):
            bid = c["ClassName"]
            if native == VARIABLE_POWER_NATIVE_CLASS:
                variable_buildings.add(bid)
                power = (float(c["mEstimatedMininumPowerConsumption"]) + float(c["mEstimatedMaximumPowerConsumption"])) / 2
            else:
                power = float(c["mPowerConsumption"])
            if bid not in de_names:
                fail(f"Gebaeude {bid} fehlt in de.json")
            buildings[bid] = {"id": bid, "name": {"de": de_names[bid], "en": c["mDisplayName"]}, "power": num(power)}

    # --- Rezepte ---
    de_recipes = {c["ClassName"]: c for c in de["FGRecipe"]}
    recipes, used_items = {}, set()
    for c in en["FGRecipe"]:
        rid = c["ClassName"]
        building = [b for b in PRODUCED_IN_RE.findall(c["mProducedIn"]) if b in buildings]
        if not building:
            continue  # Werkbank, Build-Gun, Ausruestung, ...
        if len(building) > 1:
            fail(f"Rezept {rid} laeuft in mehreren Produktionsgebaeuden: {building}")
        if rid not in de_recipes:
            fail(f"Rezept {rid} fehlt in de.json")
        ins, outs = parse_items(c["mIngredients"]), parse_items(c["mProduct"])
        if not outs:
            fail(f"Rezept {rid} ohne Produkt")
        duration = float(c["mManufactoringDuration"])
        if duration <= 0:
            fail(f"Rezept {rid} mit Dauer {duration}")

        def convert(pairs):
            res = []
            for item, amount in pairs:
                if item not in item_form:
                    fail(f"Rezept {rid}: Item {item} ohne bekannte Form (mForm)")
                used_items.add(item)
                res.append({"item": item, "amount": num(amount / 1000 if item_form[item] in FLUID_FORMS else amount)})
            return res

        rec = {
            "id": rid,
            "name": {"de": de_recipes[rid]["mDisplayName"], "en": c["mDisplayName"]},
            # Die Klassennamen sind unzuverlaessig (Recipe_Alternate_Turbofuel_C ist Standard,
            # Recipe_PureAluminumIngot_C ist alternativ): massgeblich ist der Praefix des englischen Namens.
            "alternate": c["mDisplayName"].startswith("Alternate:"),
            "building": building[0],
            "duration": num(duration),
            "inputs": convert(ins),
            "outputs": convert(outs),
        }
        if building[0] in variable_buildings:
            # Variable Leistung: Mittelwert aus Konstante und Faktor (Spanne = Konstante .. Konstante + Faktor)
            rec["power"] = num(float(c["mVariablePowerConsumptionConstant"]) + float(c["mVariablePowerConsumptionFactor"]) / 2)
        recipes[rid] = rec

    # Gebaeude ohne Rezepte weglassen
    buildings = {b: v for b, v in buildings.items() if any(r["building"] == b for r in recipes.values())}

    # --- Items (nur solche, die in mindestens einem Rezept vorkommen) ---
    items = {}
    for iid in sorted(used_items):
        if iid not in item_en or iid not in item_de:
            fail(f"Item {iid} ohne Namen in en-US.json/de.json")
        items[iid] = {
            "id": iid,
            "name": {"de": item_de[iid], "en": item_en[iid]},
            "form": item_form[iid],
            "raw": iid in raw_ids,
            "defaultRecipe": None,
        }

    # --- defaultRecipe (Stufen laut SPEC; nur Rezepte mit dem Item als erstem Output, nie Entpack-Rezepte) ---
    by_first_output = {}
    for rid in sorted(recipes):
        if not rid.startswith("Recipe_Unpackage"):
            by_first_output.setdefault(recipes[rid]["outputs"][0]["item"], []).append(rid)
    for iid, item in items.items():
        if item["raw"]:
            continue
        cands = by_first_output.get(iid, [])
        plain = [r for r in cands if not recipes[r]["alternate"]]
        tier1 = [r for r in plain if "Residual" not in r and recipes[r]["building"] != "Build_Converter_C"]
        base = re.sub(r"^(?:Desc_|BP_ItemDescriptor)|_C$", "", iid)
        preferred = f"Recipe_{base}_C"
        if tier1:
            item["defaultRecipe"] = preferred if preferred in tier1 else tier1[0]
        elif plain:
            item["defaultRecipe"] = plain[0]
        elif cands:
            item["defaultRecipe"] = cands[0]  # nur alternative Rezepte

    # --- Ausgabe ---
    def block(name, mapping):
        lines = [f'  {name}: {{']
        keys = sorted(mapping)
        for i, k in enumerate(keys):
            comma = "," if i < len(keys) - 1 else ""
            lines.append(f"    {json.dumps(k)}: {json.dumps(mapping[k], ensure_ascii=False)}{comma}")
        lines.append("  }")
        return "\n".join(lines)

    out = (
        "// GENERIERT von tools/extract_gamedata.py \u2013 nicht editieren\n"
        "export default {\n"
        '  version: "1.0",\n'
        + block("items", items) + ",\n"
        + block("recipes", recipes) + ",\n"
        + block("buildings", buildings) + "\n"
        "};\n"
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        f.write(out)
    print(f"{args.out}: {len(items)} Items, {len(recipes)} Rezepte, {len(buildings)} Gebaeude")


if __name__ == "__main__":
    main()
