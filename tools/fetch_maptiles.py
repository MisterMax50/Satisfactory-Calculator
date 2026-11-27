# fetch_maptiles.py — lädt das Kartenbild (WebP-Kacheln einer Zoomstufe) nach data/maptiles/<z>/<x>/<y>.webp.
# Quelle: Kachel-Pyramide von rockfactory/satisfactory-logistics (Kartengrafik © Coffee Stain Studios),
# kalibriert auf Spielkoordinaten x -324700..425300, y -375000..375000 (cm), +y unten.
# Aufruf: python tools/fetch_maptiles.py [--zoom 4]
import argparse
import pathlib
import urllib.request

BASE = "https://satisfactory-logistics-maps.fra1.cdn.digitaloceanspaces.com/map/v2"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zoom", type=int, default=4, help="Zoomstufe: 2^zoom Kacheln je Seite à 256 px")
    args = ap.parse_args()
    out = pathlib.Path(__file__).resolve().parent.parent / "data" / "maptiles" / str(args.zoom)
    n = 2 ** args.zoom
    total = 0
    for x in range(n):
        for y in range(n):
            req = urllib.request.Request(f"{BASE}/{args.zoom}/{x}/{y}.webp", headers={"User-Agent": "map-fetch/1.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read()
            if body[:4] != b"RIFF" or body[8:12] != b"WEBP":
                raise ValueError(f"Kachel {x}/{y} ist kein WebP")
            path = out / str(x) / f"{y}.webp"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body)
            total += len(body)
    print(f"{n * n} Kacheln, {total // 1024} KiB -> {out}")


if __name__ == "__main__":
    main()
