# LunarWindow × MainTech — Lunar Landing Site Navigator

Team **MainTech** · Astana. UI language: Russian by default, RU/EN toggle in the header (submission materials must be in English).

NASA Space Apps Challenge 2026 · Astana · Challenge: **Lunar Landing Site Navigator**

Pick a landing site and a date — see in seconds whether the Sun (power) and Earth
(direct-to-Earth communication) are above the local terrain horizon, how long until
sunset / Earthset, and how a schedule slip changes mission feasibility.

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
