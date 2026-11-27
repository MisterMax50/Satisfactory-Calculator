# fetch_icons.py — lädt die Spiel-Icons der Rohstoffe (64 px PNG, © Coffee Stain Studios) aus dem
# Satisfactory-Wiki (satisfactory.wiki.gg) nach data/icons/<Item-ID>.png. Aufruf: python tools/fetch_icons.py
import json
import pathlib
import urllib.parse
import urllib.request

API = "https://satisfactory.wiki.gg/api.php"
UA = {"User-Agent": "icon-fetch/1.0"}
# Item-ID → Dateiname im Wiki; Geysir ist kein Item, nur ein Kartenknoten.
FILES = {
    "Desc_OreIron_C": "Iron_Ore.png",
    "Desc_OreCopper_C": "Copper_Ore.png",
    "Desc_Stone_C": "Limestone.png",
    "Desc_Coal_C": "Coal.png",
    "Desc_OreGold_C": "Caterium_Ore.png",
    "Desc_RawQuartz_C": "Raw_Quartz.png",
    "Desc_Sulfur_C": "Sulfur.png",
    "Desc_OreBauxite_C": "Bauxite.png",
    "Desc_OreUranium_C": "Uranium.png",
    "Desc_SAM_C": "SAM.png",
    "Desc_LiquidOil_C": "Crude_Oil.png",
    "Desc_Water_C": "Water.png",
    "Desc_NitrogenGas_C": "Nitrogen_Gas.png",
    "Desc_GeothermalEnergy_C": "Geyser.png",
}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read()


def main():
    out = pathlib.Path(__file__).resolve().parent.parent / "data" / "icons"
    out.mkdir(parents=True, exist_ok=True)
    titles = "|".join(f"File:{f}" for f in FILES.values())
    q = urllib.parse.urlencode({"action": "query", "titles": titles, "prop": "imageinfo", "iiprop": "url", "iiurlwidth": 64, "format": "json"})
    pages = json.loads(get(f"{API}?{q}"))["query"]["pages"].values()
    thumbs = {p["title"].removeprefix("File:").replace(" ", "_"): p["imageinfo"][0]["thumburl"] for p in pages if p.get("imageinfo")}
    for item, f in FILES.items():
        body = get(thumbs[f])
        if body[:8] != b"\x89PNG\r\n\x1a\n":
            raise ValueError(f"{f} ist kein PNG")
        (out / f"{item}.png").write_bytes(body)
    print(f"{len(FILES)} Icons -> {out}")


if __name__ == "__main__":
    main()
