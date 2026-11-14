"""Time-series simulation of Sun/Earth visibility, power and direct-to-Earth comms at a lunar site.

Pipeline:
  1. Evaluate DE440 geometry (vectorised) on the step grid, extended by a
     look-ahead window so that sunset/earthset can be found after the end.
  2. Find every rise/set as a sign change of a visibility function g(t) on the
     grid. Refine each crossing by vectorised bisection to < 1 s ("exact" event
     times). The interval statistics use these exact edges, not step counting.
  3. Per step: energy coefficient = limb-darkened visible fraction of the solar
     disk behind the horizon profile (app.horizon); DTE availability; time to
     the next sunset/earthset.

Event definitions:
  * Sun up   : the upper limb is above the local horizon at the Sun's azimuth
               (sun_el + semidiameter > horizon). The energy coefficient is > 0
               exactly then.
  * DTE up   : the Earth's centre is at least ``dte_min_elevation_deg`` above
               the local horizon at the Earth's azimuth.
  Libration is inherent: the Earth's apparent position wanders by about +/-8 deg
  in the site's sky over a month, and that drives the DTE windows at limb and
  polar sites. Each step reports the sub-Earth point (= total libration).

Limitation: a rise and set that both fall inside a single step are not
resolved. The Sun moves only about 0.5 deg/h across the lunar sky, so steps of
6 h or less are safe in practice.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np

from .astrodynamics import MOON_RADIUS_KM, SUN_RADIUS_KM, EARTH_RADIUS_KM, TARGET_FRAME, \
    get_ephemeris, sun_earth_vectors, topocentric, _latlon_deg
from .horizon import LIMB_DARKENING_U, HorizonProfile, disk_visible_fraction

AU_KM = 149_597_870.7
SOLAR_CONSTANT_W_M2 = 1361.0          # TSI at 1 au (Kopp & Lean 2011)
SECONDS_PER_DAY = 86_400.0
BISECTION_TOL_S = 0.5


@dataclass(frozen=True)
class SimulationConfig:
    lat: float
    lon: float
    start: datetime
    duration_days: float = 29.53
    step_hours: float = 1.0
    observer_height_m: float = 0.0
    horizon: HorizonProfile | None = None
    dte_min_elevation_deg: float = 0.0
    lookahead_days: float = 30.0
    limb_darkening_u: float = LIMB_DARKENING_U


# --------------------------------------------------------------------------- #
# Geometry on arbitrary TT Julian dates
# --------------------------------------------------------------------------- #
class _Evaluator:
    def __init__(self, cfg: SimulationConfig, horizon: HorizonProfile):
        self.cfg, self.hz = cfg, horizon
        self.e = get_ephemeris()

    def __call__(self, tt_jd: np.ndarray) -> dict[str, np.ndarray]:
        c = self.cfg
        t = self.e.ts.tt_jd(np.atleast_1d(tt_jd))
        sun_me, earth_me = sun_earth_vectors(t, ephem=self.e)
        sun_el, sun_az, sun_rng = topocentric(sun_me, c.lat, c.lon, c.observer_height_m)
        earth_el, earth_az, earth_rng = topocentric(earth_me, c.lat, c.lon, c.observer_height_m)
        sun_sd = np.degrees(np.arcsin(SUN_RADIUS_KM / sun_rng))
        earth_sd = np.degrees(np.arcsin(EARTH_RADIUS_KM / earth_rng))
        h_sun, h_earth = self.hz.at(sun_az), self.hz.at(earth_az)
        return dict(t=t, sun_me=sun_me, earth_me=earth_me,
                    sun_el=sun_el, sun_az=sun_az, sun_rng=sun_rng, sun_sd=sun_sd, h_sun=h_sun,
                    earth_el=earth_el, earth_az=earth_az, earth_sd=earth_sd, h_earth=h_earth,
                    g_sun=sun_el + sun_sd - h_sun,
                    g_earth=earth_el - h_earth - c.dte_min_elevation_deg)


def _find_crossings(ev: _Evaluator, tt: np.ndarray, g: np.ndarray, key: str):
    """Exact crossing times of ``key`` (TT JD) plus direction (+1 rise, -1 set)."""
    up = g > 0
    i = np.flatnonzero(up[:-1] != up[1:])
    if i.size == 0:
        return np.empty(0), np.empty(0, int)
    lo, hi = tt[i].copy(), tt[i + 1].copy()
    lo_up = up[i]
    n_iter = int(np.ceil(np.log2(max((tt[1] - tt[0]) * SECONDS_PER_DAY / BISECTION_TOL_S, 2))))
    for _ in range(n_iter):
        mid = 0.5 * (lo + hi)
        mid_up = ev(mid)[key] > 0
        same = mid_up == lo_up
        lo = np.where(same, mid, lo)
        hi = np.where(same, hi, mid)
    return 0.5 * (lo + hi), np.where(lo_up, -1, 1)


def _intervals(t0: float, t1: float, up0: bool, cross_t: np.ndarray, cross_dir: np.ndarray):
    """Up-intervals [(start, end, truncated_start, truncated_end)] clipped to [t0, t1]."""
    out, cur = [], (t0 if up0 else None)
    for tc, d in zip(cross_t, cross_dir):
        if tc <= t0 or tc >= t1:
            continue
        if d > 0 and cur is None:
            cur = tc
        elif d < 0 and cur is not None:
            out.append((cur, tc, cur == t0, False))
            cur = None
    if cur is not None:
        out.append((cur, t1, cur == t0, True))
    return out


# --------------------------------------------------------------------------- #
# Formatting helpers
# --------------------------------------------------------------------------- #
def _iso(ts, tt_jd) -> list[str] | str:
    t = ts.tt_jd(tt_jd)
    return t.utc_iso(places=0) if np.ndim(tt_jd) == 0 else list(t.utc_iso(places=0))


def _block(ts, s, e, ts_flag, te_flag) -> dict:
    return {"start_utc": _iso(ts, s), "end_utc": _iso(ts, e),
            "duration_hours": round((e - s) * 24.0, 4),
            "truncated_at_start": bool(ts_flag), "truncated_at_end": bool(te_flag)}


def _complement(t0, t1, ivals):
    gaps, cur = [], t0
    for s, e, *_ in ivals:
        if s > cur:
            gaps.append((cur, s, cur == t0, False))
        cur = e
    if cur < t1:
        gaps.append((cur, t1, cur == t0, True))
    return gaps


def _longest(ts, ivals):
    if not ivals:
        return None
    return _block(ts, *max(ivals, key=lambda iv: iv[1] - iv[0]))


def _next_after(tt, cross_t, cross_dir, direction):
    """For each grid time, the next crossing time in ``direction`` (NaN if none)."""
    sel = cross_t[cross_dir == direction]
    if sel.size == 0:
        return np.full(tt.shape, np.nan)
    k = np.searchsorted(sel, tt, side="right")
    return np.where(k < sel.size, sel[np.minimum(k, sel.size - 1)], np.nan)


# --------------------------------------------------------------------------- #
# Main entry point
# --------------------------------------------------------------------------- #
def simulate(cfg: SimulationConfig) -> dict:
    e = get_ephemeris()
    ts = e.ts
    hz = cfg.horizon or HorizonProfile.spherical(lat=cfg.lat, lon=cfg.lon,
                                                 observer_height_m=cfg.observer_height_m)
    ev = _Evaluator(cfg, hz)

    start = cfg.start if cfg.start.tzinfo else cfg.start.replace(tzinfo=timezone.utc)
    t_start = ts.from_datetime(start).tt
    step = cfg.step_hours / 24.0
    n_sim = int(np.floor(cfg.duration_days / step + 1e-9)) + 1
    n_ext = n_sim + int(np.ceil(cfg.lookahead_days / step))
    tt = t_start + np.arange(n_ext) * step
    t_end = t_start + cfg.duration_days

    st = ev(tt)
    sun_cross = _find_crossings(ev, tt, st["g_sun"], "g_sun")
    earth_cross = _find_crossings(ev, tt, st["g_earth"], "g_earth")

    # ---- per-step series (simulation window only) ----
    sim = slice(0, n_sim)
    tt_s = tt[sim]
    sun_el, sun_az, sun_sd, h_sun = (st[k][sim] for k in ("sun_el", "sun_az", "sun_sd", "h_sun"))
    sun_up = st["g_sun"][sim] > 0
    dte = st["g_earth"][sim] > 0

    # Energy coefficient: exact limb-darkened visibility; only steps that can be
    # partial (disk overlaps the profile's [min, max] band) need the integral.
    energy = np.where(sun_el - sun_sd >= hz.elevation_deg.max(), 1.0, 0.0)
    partial = np.flatnonzero((sun_el + sun_sd > hz.elevation_deg.min())
                             & (sun_el - sun_sd < hz.elevation_deg.max()))
    for i in partial:
        energy[i] = disk_visible_fraction(sun_el[i], sun_az[i], sun_sd[i], hz, cfg.limb_darkening_u)
    irradiance = SOLAR_CONSTANT_W_M2 * (AU_KM / st["sun_rng"][sim]) ** 2 * energy

    next_set = np.where(sun_up, _next_after(tt_s, *sun_cross, -1), np.nan)
    next_es = np.where(dte, _next_after(tt_s, *earth_cross, -1), np.nan)
    utc = _iso(ts, tt_s)
    sunset_iso = {i: _iso(ts, v) for i, v in enumerate(next_set) if np.isfinite(v)}
    earthset_iso = {i: _iso(ts, v) for i, v in enumerate(next_es) if np.isfinite(v)}
    earth_me = st["earth_me"][sim]

    series = []
    for i in range(n_sim):
        sub_lat, sub_lon = _latlon_deg(earth_me[i])
        series.append({
            "utc": utc[i],
            "sun_el": round(float(sun_el[i]), 5),
            "sun_az": round(float(sun_az[i]), 4),
            "earth_el": round(float(st["earth_el"][i]), 5),
            "earth_az": round(float(st["earth_az"][i]), 4),
            "horizon_el_at_sun": round(float(h_sun[i]), 4),
            "horizon_el_at_earth": round(float(st["h_earth"][i]), 4),
            "sun_up": bool(sun_up[i]),
            "dte_available": bool(dte[i]),
            "energy_coefficient": round(float(energy[i]), 5),
            "solar_irradiance_w_m2": round(float(irradiance[i]), 2),
            "next_sunset_utc": sunset_iso.get(i),
            "time_to_sunset_hours": None if not np.isfinite(next_set[i])
                                    else round((next_set[i] - tt_s[i]) * 24.0, 4),
            "next_earthset_utc": earthset_iso.get(i),
            "time_to_earthset_hours": None if not np.isfinite(next_es[i])
                                      else round((next_es[i] - tt_s[i]) * 24.0, 4),
            "libration_lon_deg": round(sub_lon, 4),
            "libration_lat_deg": round(sub_lat, 4),
        })

    # ---- exact intervals & summary over [t_start, t_end] ----
    sun_iv = _intervals(t_start, t_end, bool(st["g_sun"][0] > 0), *sun_cross)
    dte_iv = _intervals(t_start, t_end, bool(st["g_earth"][0] > 0), *earth_cross)
    dark_iv = _complement(t_start, t_end, sun_iv)
    total_h = cfg.duration_days * 24.0
    sun_h = sum(e_ - s for s, e_, *_ in sun_iv) * 24.0
    dte_h = sum(e_ - s for s, e_, *_ in dte_iv) * 24.0
    efsh = float(np.trapezoid(energy, dx=cfg.step_hours)) if n_sim > 1 else 0.0

    def events(cross, rise, set_):
        return [{"utc": _iso(ts, t), "type": rise if d > 0 else set_}
                for t, d in zip(*cross) if t_start < t < t_end]

    sunset_missing = bool(np.any(sun_up & ~np.isfinite(next_set)))
    earthset_missing = bool(np.any(dte & ~np.isfinite(next_es)))

    return {
        "site": {
            "lat": cfg.lat, "lon": cfg.lon, "observer_height_m": cfg.observer_height_m,
            "horizon_source": hz.source, "custom_coordinates": hz.custom_coordinates,
            "reference_radius_km": MOON_RADIUS_KM, "frame": TARGET_FRAME,
        },
        "parameters": {
            "start_utc": _iso(ts, t_start), "end_utc": _iso(ts, t_end),
            "duration_days": cfg.duration_days, "step_hours": cfg.step_hours, "steps": n_sim,
            "dte_min_elevation_deg": cfg.dte_min_elevation_deg,
            "lookahead_days": cfg.lookahead_days, "limb_darkening_u": cfg.limb_darkening_u,
            "event_time_precision_s": BISECTION_TOL_S,
            "ephemeris": "JPL DE440 (de440s.bsp) + moon_pa_de440_200625.bpc",
        },
        "summary": {
            "sunlight": {
                "total_sunlight_hours": round(sun_h, 4),
                "sunlight_fraction": round(sun_h / total_h, 6) if total_h else 0.0,
                "equivalent_full_sun_hours": round(efsh, 4),
                "mean_energy_coefficient": round(float(energy.mean()), 6),
                "max_uninterrupted_power_period": _longest(ts, sun_iv),
                "max_continuous_darkness_period": _longest(ts, dark_iv),
                "sunlit_period_count": len(sun_iv),
            },
            "communication": {
                "total_dte_hours": round(dte_h, 4),
                "dte_fraction": round(dte_h / total_h, 6) if total_h else 0.0,
                "window_count": len(dte_iv),
                "longest_window": _longest(ts, dte_iv),
                "longest_blackout": _longest(ts, _complement(t_start, t_end, dte_iv)),
                "windows": [_block(ts, *iv) for iv in dte_iv],
            },
            "notes": [n for n in (
                sunset_missing and "Some sunlit steps have no sunset within the look-ahead window "
                                   "(time_to_sunset_hours = null); increase lookahead_days.",
                earthset_missing and "Some DTE steps have no earthset within the look-ahead window "
                                     "(time_to_earthset_hours = null); increase lookahead_days.",
                hz.source == "spherical_model" and "Spherical horizon model (no terrain): polar results "
                                                   "are idealised; supply a horizon profile for real sites.",
            ) if n],
        },
        "events": sorted(events(sun_cross, "sunrise", "sunset") + events(earth_cross, "earthrise", "earthset"),
                         key=lambda ev_: ev_["utc"]),
        "series": series,
    }
