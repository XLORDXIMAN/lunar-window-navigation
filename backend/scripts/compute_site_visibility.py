"""Fill each site's ``visibility`` block in data/sites.json using the DE440 engine.

Samples one full lunar nodal / libration cycle (18.6 yr) so every libration
state is represented. "Visible" = any part of the disk above the local
horizontal of the 1737.4 km reference sphere (el > -semidiameter); terrain
masking is NOT included, which matters a lot at polar sites.

    python -m scripts.compute_site_visibility [--step-hours 6]
"""

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from app.astrodynamics import compute_geometry

SITES = Path(__file__).resolve().parent.parent / "data" / "sites.json"
START = datetime(2026, 1, 1, tzinfo=timezone.utc)
YEARS = 18.6


def main(step_hours: float) -> None:
    doc = json.loads(SITES.read_text(encoding="utf-8"))
    lat = np.array([s["lat"] for s in doc["sites"]])
    lon = np.array([s["lon"] for s in doc["sites"]])

    n = int(YEARS * 365.25 * 24 / step_hours)
    earth_el = np.empty((n, lat.size))
    earth_vis = np.empty((n, lat.size), bool)
    sun_vis = np.empty((n, lat.size), bool)
    for i in range(n):
        g = compute_geometry(lat, lon, START + timedelta(hours=i * step_hours))
        earth_el[i] = g.earth_el
        earth_vis[i] = g.earth_el > -g.earth_semidiameter_deg
        sun_vis[i] = g.sun_el > -g.sun_semidiameter_deg

    end = START + timedelta(hours=n * step_hours)
    for j, site in enumerate(doc["sites"]):
        site["visibility"] = {
            "earth_visible_fraction": round(float(earth_vis[:, j].mean()), 4),
            "sun_visible_fraction": round(float(sun_vis[:, j].mean()), 4),
            "earth_el_min_deg": round(float(earth_el[:, j].min()), 3),
            "earth_el_max_deg": round(float(earth_el[:, j].max()), 3),
        }
    doc["meta"]["visibility"] = {
        "method": "DE440 + MOON_ME (app.astrodynamics); smooth 1737.4 km sphere, NO terrain masking",
        "criterion": "any part of the disk above the local horizontal (el > -semidiameter)",
        "period_utc": [START.isoformat(), end.isoformat()],
        "step_hours": step_hours,
        "samples": n,
    }
    SITES.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for s in doc["sites"]:
        v = s["visibility"]
        print(f"{s['id']:28s} earth {v['earth_visible_fraction']:7.2%}  sun {v['sun_visible_fraction']:7.2%}"
              f"  earth_el [{v['earth_el_min_deg']:7.2f}, {v['earth_el_max_deg']:7.2f}]")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--step-hours", type=float, default=6.0)
    main(p.parse_args().step_hours)
