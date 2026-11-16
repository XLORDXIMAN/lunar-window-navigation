# 🌙 Lunar Window Navigation

Built for **NASA Space Apps Challenge 2026** — challenge *Lunar Landing Site Navigator*.

Interactive 3D Moon tool that helps find the best date, time and location for a lunar landing.
Pick a landing site and a date — in seconds you see whether the Sun (power) and the Earth
(direct-to-Earth communication) are above the local horizon, and get a clear **GO / NO-GO** verdict.

🔗 **Live demo:** https://lunarwindow.vercel.app

## Features
- **Interactive 3D Moon** — real-time lighting by date, LOLA terrain with date-driven shadows at the south pole, "a lunar day in 20 seconds"
- **Landing window calculation** — Sun and Earth elevation, time to sunset / Earthset, best window in the next 60 days
- **Landing site selection** — 14 sites (Apollo, Artemis III candidates, CLPS, international missions) + any custom coordinates
- **Mission metrics** — illumination %, direct-to-Earth comms %, longest darkness, solar-panel energy (kWh/day), battery needed to survive the night
- **Mission priorities** — sliders for energy / comms / short nights / flat terrain re-rank the top-3 sites instantly
- **A/B scenarios** — same site on another date, or a neighbouring site on the same date, side by side
- **Surface view** — stand at the landing site and see where the Sun and Earth are and which ridges block them
- **Landing simulation** — Apollo-style powered descent (P64 → P66 → contact) in lunar gravity 1.62 m/s², engine plume and dust, touchdown speed
- **Landing diorama** — cinematic south-pole landing on a Blender-built terrain with the real Sun position

## Tech stack
- **Frontend:** JavaScript, React 19, Vite, Three.js, Tailwind CSS, Zustand
- **3D assets:** Blender (procedural terrain, Apollo LM, craters and rocks; Python scripts in `scripts/blender/`)
- **Backend:** Python, FastAPI — ephemerides, horizon profiles, simulation and scenario comparison
- **Data:** JPL DE440s ephemerides, NASA LRO LOLA (elevation) and LROC (imagery), IAU / IERS constants
- **Deploy:** Vercel

## My role
Frontend & 3D: website design and UI, the interactive 3D Moon chapter, surface view, landing simulation and
diorama (Blender terrain, lander, engine plume, dust, sky), performance work and the Vercel deployment.

## Team
Imanali · Nuraly · Almansur

## Run

```bash
npm install
npm run dev
```

Deploy: import the repo on vercel.com (framework: Vite). Every push to `main` redeploys.

## Structure

```
src/
  store.js                 global state (zustand) + data loader
  data/sites.js            site catalog (Apollo, Artemis III, CLPS, international) — coords APPROXIMATE, verify
  lib/i18n.js              all UI texts RU/EN
  lib/ui.jsx               animated numbers, site names
  lib/ephem.js             Sun/Earth positions, visibility, metrics, verdict, score  ← swap mock → real data here
  components/
    Starfield.jsx          animated star background
    BootScreen.jsx         mission-control intro sequence
    TopBar.jsx             date picker, RU/EN, explain mode
    SiteCatalog.jsx        site list, filters, custom coordinates, priority sliders, top-3
    MoonScene.jsx          2D globe PLACEHOLDER → replace with Three.js scene (participant 1)
    HorizonView.jsx        ⭐ Sun & Earth vs terrain horizon
    SiteCard.jsx           sun elevation, sunset/Earthset countdown, metrics, verdict, schedule slip
    Timeline.jsx           time slider + play
    WindowBars.jsx         sunlight / Earth-link windows per site (30 days)
    ScenarioCompare.jsx    ⭐ Scenario A vs B (date slip / alternate site)
```

## Data contract (participant 2 → `public/data/`)

`public/data/sites.json` — if present, it replaces the mock catalog automatically:

```json
[{ "id": "malapert", "name": "Malapert Massif", "category": "artemis",
   "lat": -86.0, "lon": 0.0, "slope_deg": 7.5,
   "horizon": [/* 360 numbers: terrain elevation angle (deg) for azimuth 0..359, from LOLA DEM */] }]
```

`category`: `apollo | artemis | clps | intl | custom`.

Ephemeris (next step): `public/data/ephem/<id>.json` with arrays `sun_az, sun_el, earth_az, earth_el`
from JPL Horizons (`CENTER='coord@301'`, `QUANTITIES='4'`). Then `sunPos/earthPos` in `src/lib/ephem.js`
read from these arrays instead of the analytic mock.

## Current mock model (until real data lands)

- Sun completes one circuit per synodic month (29.53 d); declination ±1.54° over a year (lunar axial tilt).
- Earth position wobbles with optical libration (±6.7° latitude, ±7.9° longitude).
- Far-side sites never see Earth. Elevated sites see the sphere edge below 0° (horizon dip). No atmosphere → no refraction.
- Terrain horizons are synthetic until LOLA-derived horizons are provided.

## NASA data & references

- LRO / LOLA topography (PDS Geosciences)
- JPL Horizons System — ephemerides
- NASA Moon Trek, LROC QuickMap
- React, Vite, Tailwind CSS, Zustand · Inter & JetBrains Mono (Google Fonts)
