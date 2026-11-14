import os
from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime

import numpy as np
from fastapi import FastAPI, HTTPException, Query, Request

from .astrodynamics import KERNEL_URLS, TARGET_FRAME, compute_geometry, get_ephemeris
from .schemas import BatchIn, BatchOut, GeometryOut
from .compare import CompareIn, compare
from .sites import Category, SiteCatalog, load_catalog


def _warm_worker():
    get_ephemeris()


@asynccontextmanager
async def lifespan(app_: FastAPI):
    get_ephemeris()  # load (and on first run download) kernels before serving
    load_catalog()   # fail fast on a malformed sites.json
    # Simulations are CPU-bound Python: run scenario comparisons on separate cores.
    workers = int(os.environ.get("LLSN_SIM_WORKERS", "2"))
    app_.state.sim_pool = (ProcessPoolExecutor(max_workers=workers, initializer=_warm_worker)
                           if workers > 0 else None)
    try:
        yield
    finally:
        if app_.state.sim_pool is not None:
            app_.state.sim_pool.shutdown(cancel_futures=True)


app = FastAPI(title="Lunar Landing Site Navigator API", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "frame": TARGET_FRAME, "kernels": list(KERNEL_URLS.values())}


@app.get("/v1/geometry", response_model=GeometryOut)
def geometry(
    lat: float = Query(..., ge=-90, le=90, description="Selenographic latitude, deg"),
    lon: float = Query(..., ge=-360, le=360, description="Selenographic east longitude, deg"),
    utc: datetime | None = Query(None, description="ISO-8601 UTC; omitted = now"),
    height_m: float = Query(0.0, description="Height above the 1737.4 km reference sphere"),
):
    try:
        return compute_geometry(lat, lon, utc, height_m).to_dict()
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/v1/geometry/batch", response_model=BatchOut)
def geometry_batch(body: BatchIn):
    lat = np.fromiter((s.lat for s in body.sites), float, len(body.sites))
    lon = np.fromiter((s.lon for s in body.sites), float, len(body.sites))
    try:
        g = compute_geometry(lat, lon, body.utc, body.height_m)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    d = g.to_dict()
    cols = [np.atleast_1d(np.asarray(d[k])).tolist()
            for k in ("site_lat_deg", "site_lon_deg", "sun_el", "sun_az", "earth_el", "earth_az")]
    keys = ("lat", "lon", "sun_el", "sun_az", "earth_el", "earth_az")
    return {
        **{k: d[k] for k in BatchOut.model_fields if k != "sites"},
        "sites": [dict(zip(keys, row)) for row in zip(*cols)],
    }


@app.get("/api/sites", response_model=SiteCatalog, response_model_exclude_none=True)
def list_sites(
    category: Category | None = Query(None, description="Filter by category"),
    far_side: bool | None = Query(None, description="Only far-side (true) or near-side (false) sites"),
):
    """Historical and candidate lunar landing sites (MOON_ME, east-positive longitudes)."""
    catalog = load_catalog()
    sites = [s for s in catalog.sites
             if (category is None or s.category == category)
             and (far_side is None or s.far_side == far_side)]
    return SiteCatalog(meta=catalog.meta, sites=sites)


MAX_SIM_POINTS = 200_000


@app.get("/api/simulate")
def simulate_site(
    lat: float = Query(..., ge=-90, le=90, description="Selenographic latitude, deg"),
    lon: float = Query(..., ge=-360, le=360, description="Selenographic east longitude, deg"),
    start_date: datetime = Query(..., description="ISO-8601 start (date or datetime; naive = UTC)"),
    duration_days: float = Query(29.53, gt=0, le=3660,
                                 description="29.53 = one synodic lunar day; 365 = annual view"),
    step_hours: float = Query(1.0, ge=1 / 60, le=24, description="Output time step, hours"),
    observer_height_m: float = Query(0.0, ge=0, le=10_000, description="Height above the local surface datum"),
    dte_min_elevation_deg: float = Query(0.0, ge=-5, le=30,
                                         description="Required Earth-centre clearance above the horizon for DTE"),
    lookahead_days: float = Query(30.0, ge=0, le=400,
                                  description="Extra time searched past the end for the next sunset/earthset"),
    horizon_profile: str | None = Query(None, description="Optional comma-separated horizon elevations (deg), "
                                                          "uniform in azimuth starting at north"),
    custom_coordinates: bool = Query(False, description="Mark the site as user-chosen (not a catalog site)"),
):
    """Time series of Sun/Earth elevation, power and direct-to-Earth comms at a lunar site."""
    from .horizon import resolve_horizon
    from .simulation import SimulationConfig, simulate

    if (duration_days + lookahead_days) * 24 / step_hours > MAX_SIM_POINTS:
        raise HTTPException(422, f"too many time steps; keep (duration+lookahead)/step <= {MAX_SIM_POINTS}")
    try:
        profile = None if horizon_profile is None else [float(x) for x in horizon_profile.split(",")]
        hz = resolve_horizon(lat, lon, profile=profile, observer_height_m=observer_height_m,
                             custom_coordinates=custom_coordinates)
        return simulate(SimulationConfig(
            lat=lat, lon=lon, start=start_date, duration_days=duration_days, step_hours=step_hours,
            observer_height_m=observer_height_m, horizon=hz,
            dte_min_elevation_deg=dte_min_elevation_deg, lookahead_days=lookahead_days))
    except ValueError as exc:   # bad profile, or epoch outside DE440s / lunar PCK coverage
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/compare")
async def compare_scenarios(body: CompareIn, request: Request):
    """Run two scenarios in parallel and diff them (launch slips, site trades).

    Scenario B inherits every field it omits from A, so a 12-day slip is just
    ``"scenario_b": {"label": "Slip +12 d", "delay_days": 12}``.
    """
    try:
        return await compare(body, request.app.state.sim_pool)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
