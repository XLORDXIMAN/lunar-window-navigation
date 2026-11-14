"""Export real ephemerides for the static frontend (works on Vercel without a server).

Writes, from the DE440s / MOON_ME engine in app.astrodynamics:
  ../public/data/sites.json  - catalog in the frontend's format (+ provenance)
  ../public/data/ephem.json  - hourly Sun/Earth azimuth & elevation per site for one year,
                               stored as integer centi-degrees to keep the file small.

    cd backend && .venv/bin/python -m scripts.export_frontend [--start 2027-01-01] [--days 365] [--step-hours 1]

Horizon profiles are NOT exported yet: the catalog has no LOLA-derived profiles, so the
frontend keeps its clearly-labelled synthetic terrain until a LOLA profile is supplied
(field ``horizon``: 360 values, deg, azimuth 0..359 from north).
"""

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from app.astrodynamics import KERNEL_URLS, compute_geometry

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "sites.json"
OUT = ROOT.parent / "public" / "data"

CATEGORY = {"apollo": "apollo", "artemis_iii_candidate": "artemis", "commercial_clps": "clps", "international": "intl"}
# Display names (EN / RU) and the terrain type used only for the placeholder horizon.
NAMES = {
    "apollo-11": ("Apollo 11 — Tranquility Base", "Apollo 11 — База Спокойствия", "plain", 2),
    "apollo-15": ("Apollo 15 — Hadley-Apennine", "Apollo 15 — Хэдли-Апеннины", "plain", 4),
    "apollo-17": ("Apollo 17 — Taurus-Littrow", "Apollo 17 — Тавр-Литтров", "plain", 4),
    "artemis-malapert-massif": ("Malapert Massif", "Массив Малаперт", "peak", 7),
    "artemis-mons-mouton": ("Mons Mouton", "Монс-Мутон", "peak", 5),
    "artemis-nobile-rim-1": ("Nobile Rim 1", "Край Нобиле 1", "rim", 8),
    "artemis-nobile-rim-2": ("Nobile Rim 2", "Край Нобиле 2", "rim", 8),
    "artemis-de-gerlache-rim-2": ("de Gerlache Rim 2", "Край де Жерлаш 2", "rim", 8),
    "clps-im-2-athena": ("IM-2 Athena (2025)", "IM-2 Athena (2025)", "plain", 6),
    "clps-blue-ghost-m1": ("Blue Ghost M1 — Mare Crisium (2025)", "Blue Ghost M1 — Море Кризисов (2025)", "plain", 2),
    "cnsa-change-4": ("Chang'e 4 — Far Side (China)", "Чанъэ-4 — обратная сторона (Китай)", "plain", 4),
    "cnsa-change-6": ("Chang'e 6 — Far Side (China)", "Чанъэ-6 — обратная сторона (Китай)", "plain", 4),
    "isro-chandrayaan-3": ("Chandrayaan-3 (India)", "Чандраян-3 (Индия)", "plain", 5),
    "jaxa-slim": ("SLIM (Japan)", "SLIM (Япония)", "plain", 10),
}


def main(start: datetime, days: int, step_h: float) -> None:
    doc = json.loads(CATALOG.read_text(encoding="utf-8"))
    sites = doc["sites"]
    lat = np.array([s["lat"] for s in sites])
    lon = np.array([s["lon"] for s in sites])
    n = int(days * 24 / step_h)
    cols = {k: np.empty((n, lat.size), np.float32) for k in ("sun_el", "sun_az", "earth_el", "earth_az")}
    for i in range(n):
        g = compute_geometry(lat, lon, start + timedelta(hours=i * step_h))
        for k in cols:
            cols[k][i] = getattr(g, k)

    out_sites = []
    for s in sites:
        en, ru, terrain, slope = NAMES.get(s["id"], (s["name"], s["name"], "plain", 5))
        out_sites.append({
            "id": s["id"], "name": en, "nameRu": ru, "category": CATEGORY.get(s["category"], "custom"),
            "lat": s["lat"], "lon": s["lon"], "slope_deg": slope, "terrain": terrain,
            "mission": s.get("mission"), "far_side": s.get("far_side"),
            "coordinate_type": s.get("coordinate_type"), "coordinate_source": s.get("coordinate_source"),
        })
    eph = {
        "meta": {
            "source": "DE440s + lunar PA (MOON_ME) via skyfield — backend/app/astrodynamics.py",
            "kernels": list(KERNEL_URLS.values()),
            "start_utc": start.isoformat().replace("+00:00", "Z"), "step_hours": step_h, "n": n,
            "units": "centi-degrees (int); azimuth from north, clockwise",
        },
        "sites": {s["id"]: {k: np.round(cols[k][:, j] * 100).astype(int).tolist() for k in cols}
                  for j, s in enumerate(sites)},
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "sites.json").write_text(json.dumps(out_sites, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "ephem.json").write_text(json.dumps(eph, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(out_sites)} sites, {n} samples each -> {OUT}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2027-01-01")
    ap.add_argument("--days", type=int, default=365)
    ap.add_argument("--step-hours", type=float, default=1.0)
    a = ap.parse_args()
    main(datetime.fromisoformat(a.start).replace(tzinfo=timezone.utc), a.days, a.step_hours)
