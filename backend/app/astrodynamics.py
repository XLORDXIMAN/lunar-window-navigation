"""Lunar illumination & libration geometry from JPL DE440 + the DE440 lunar PCK.

Reference frame
---------------
All selenographic coordinates are in ``MOON_ME`` (Mean Earth / Polar Axis), as
realised by NAIF for DE440:

    MOON_ME  --(identity)-->  MOON_ME_DE440_ME421  --(fixed PA->ME angles)-->
    MOON_PA_DE440  --(binary PCK: numerically integrated lunar orientation)--> ICRF

Skyfield's ``PlanetaryConstants.build_frame_named`` only follows a single TK
link, so :func:`_resolve_frame` walks the whole chain and composes the matrices.

Kernels (auto-downloaded on first use into ``$LLSN_KERNEL_DIR`` or ./kernels):
  * de440s.bsp                - planetary/lunar ephemeris, 1849-2150
  * moon_pa_de440_200625.bpc  - high-accuracy lunar orientation (DE440)
  * moon_de440_250416.tf      - frame definitions MOON_PA / MOON_ME for DE440

Conventions
-----------
* Longitudes are east-positive, wrapped to [-180, 180). Latitudes in [-90, 90].
* Elevations are measured from the local horizontal plane of the reference
  sphere (R = 1737.4 km, IAU mean lunar radius) at the site; no horizon/terrain
  masking (that needs a DEM such as LOLA and belongs in a separate layer).
* Sun / Earth directions as seen from the Moon are *apparent* (light-time +
  stellar aberration + gravitational deflection), i.e. the direction from which
  light actually arrives at the lunar surface at instant ``t``.
* Libration follows the classical (Meeus ch. 53) geocentric convention:
  total libration = selenographic lon/lat of the sub-Earth point as observed
  from the geocentre at ``t`` (lunar orientation evaluated at the light-emission
  epoch). Optical libration is the Cassini-law mean-rotation part; physical
  libration = total - optical, so total is exact by construction (DE440) and the
  split depends only on the IAU-standard mean elements.
"""

from __future__ import annotations

import os
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import NamedTuple

import numpy as np
from skyfield.api import Loader
from skyfield.framelib import ICRS_to_J2000
from skyfield.functions import rot_x, rot_y, rot_z
from skyfield.nutationlib import mean_obliquity
from skyfield.planetarylib import Frame, PlanetaryConstants

# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #
MOON_RADIUS_KM = 1737.4          # IAU WGCCRE mean radius
SUN_RADIUS_KM = 695_700.0        # IAU 2015 nominal solar radius
EARTH_RADIUS_KM = 6_378.1366     # IERS equatorial radius
I_MOON = np.radians(1.54242)     # inclination of lunar equator to ecliptic (Cassini)
ASEC2RAD = np.pi / (180.0 * 3600.0)

_NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
KERNEL_URLS = {
    "spk": f"{_NAIF}/spk/planets/de440s.bsp",
    "bpc": f"{_NAIF}/pck/moon_pa_de440_200625.bpc",
    "tf": f"{_NAIF}/fk/satellites/moon_de440_250416.tf",
}
KERNEL_DIR = Path(os.environ.get("LLSN_KERNEL_DIR", Path(__file__).resolve().parent.parent / "kernels"))
TARGET_FRAME = "MOON_ME"

_UNIT_SCALE = {"ARCSECONDS": ASEC2RAD, "DEGREES": np.pi / 180.0, "RADIANS": 1.0}
_AXIS_ROT = {1: rot_x, 2: rot_y, 3: rot_z}


# --------------------------------------------------------------------------- #
# Kernel loading
# --------------------------------------------------------------------------- #
def _tk_matrix(pc: PlanetaryConstants, code: int) -> np.ndarray:
    """Rotation RELATIVE -> frame ``code`` for a SPICE TK (class 4) frame."""
    v = pc.variables
    spec = v[f"TKFRAME_{code}_SPEC"]
    if spec == "MATRIX":
        # SPICE stores the defined->relative matrix column-major; reading it
        # row-major therefore yields its transpose, i.e. relative->defined.
        return np.array(v[f"TKFRAME_{code}_MATRIX"], dtype=float).reshape(3, 3)
    if spec == "ANGLES":
        scale = _UNIT_SCALE[v[f"TKFRAME_{code}_UNITS"]]
        m = np.eye(3)
        for angle, axis in zip(v[f"TKFRAME_{code}_ANGLES"], v[f"TKFRAME_{code}_AXES"]):
            m = _AXIS_ROT[axis](angle * scale) @ m
        return m
    raise NotImplementedError(f"TKFRAME spec {spec!r} for frame {code}")


class _SegmentedFrame:
    """Frame whose binary-PCK base is split into several time segments.

    Skyfield keeps only the *last* PCK segment per frame ID, and
    moon_pa_de440_200625.bpc has two (1550-2426, 2426-2650). This picks the
    segment that covers each epoch.
    """

    def __init__(self, frames: list[tuple[float, float, Frame]]):
        self._frames = sorted(frames, key=lambda f: f[0])
        self.center = self._frames[0][2].center

    def _pick(self, t) -> Frame:
        jd = float(np.min(t.tdb)), float(np.max(t.tdb))
        for start, end, frame in self._frames:
            if start <= jd[0] and jd[1] <= end:
                return frame
        raise ValueError(f"epoch TDB JD {jd} outside lunar PCK coverage "
                         f"{self._frames[0][0]}-{self._frames[-1][1]}")

    def rotation_at(self, t) -> np.ndarray:
        return self._pick(t).rotation_at(t)

    def rotation_and_rate_at(self, t):
        return self._pick(t).rotation_and_rate_at(t)


def _resolve_frame(pc: PlanetaryConstants, name: str, max_depth: int = 16) -> _SegmentedFrame:
    """Build a frame for ``name``, following any depth of TK frames."""
    v = pc.variables
    code = v[f"FRAME_{name}"]
    center = v[f"FRAME_{code}_CENTER"]
    m = np.eye(3)
    for _ in range(max_depth):
        if f"TKFRAME_{code}_SPEC" not in v:
            break
        m = m @ _tk_matrix(pc, code)
        rel = v[f"TKFRAME_{code}_RELATIVE"]
        code = rel if isinstance(rel, int) else v[f"FRAME_{rel}"]
    else:
        raise RecursionError(f"TK frame chain for {name} deeper than {max_depth}")
    segments = [s for s in pc._segment_list if s.body == code]
    if not segments:
        raise LookupError(f"no binary PCK segment loaded for frame {code}")
    for s in segments:
        assert s.frame == 1, "binary PCK base frame must be J2000/ICRF"
    return _SegmentedFrame([(s.initial_jd, s.final_jd, Frame(center, s, m)) for s in segments])


class LunarEphemeris:
    """Holds the loaded kernels. Create once; it is thread-safe for reading."""

    def __init__(self, kernel_dir: Path | str = KERNEL_DIR):
        load = Loader(str(kernel_dir), verbose=False)
        self.ts = load.timescale()
        self.eph = load(KERNEL_URLS["spk"])
        self.pc = PlanetaryConstants()
        self.pc.read_text(load(KERNEL_URLS["tf"]))
        self.pc.read_binary(load(KERNEL_URLS["bpc"]))
        self.frame = _resolve_frame(self.pc, TARGET_FRAME)
        self.sun = self.eph["sun"]
        self.earth = self.eph["earth"]
        self.moon = self.eph["moon"]


@lru_cache(maxsize=1)
def get_ephemeris() -> LunarEphemeris:
    return LunarEphemeris()


# --------------------------------------------------------------------------- #
# Small vector helpers
# --------------------------------------------------------------------------- #
def _wrap180(deg):
    return (np.asarray(deg) + 180.0) % 360.0 - 180.0


def _latlon_deg(v: np.ndarray) -> tuple[float, float]:
    x, y, z = v
    return float(np.degrees(np.arctan2(z, np.hypot(x, y)))), float(_wrap180(np.degrees(np.arctan2(y, x))))


def _local_frame(lat_deg, lon_deg):
    """Unit up/east/north vectors (…, 3) in MOON_ME for the given sites."""
    la, lo = np.radians(lat_deg), np.radians(lon_deg)
    cla, sla, clo, slo = np.cos(la), np.sin(la), np.cos(lo), np.sin(lo)
    up = np.stack([cla * clo, cla * slo, sla], axis=-1)
    east = np.stack([-slo, clo, np.zeros_like(lo)], axis=-1)
    north = np.stack([-sla * clo, -sla * slo, cla], axis=-1)
    return up, east, north


def _el_az(target_me, site_me, up, east, north):
    """Topocentric elevation, azimuth (deg, az from N through E) and range (km)."""
    d = target_me - site_me
    rng = np.linalg.norm(d, axis=-1)
    u = d / rng[..., None]
    el = np.degrees(np.arcsin(np.clip(np.sum(u * up, -1), -1.0, 1.0)))
    az = np.degrees(np.arctan2(np.sum(u * east, -1), np.sum(u * north, -1))) % 360.0
    return el, az, rng


# --------------------------------------------------------------------------- #
# Libration
# --------------------------------------------------------------------------- #
def _optical_libration(t, moon_geo_icrf_km) -> tuple[float, float]:
    """Cassini-law (optical) libration, Meeus (53.1), from the precise
    geocentric apparent Moon vector referred to the mean ecliptic/equinox of date."""
    T = (t.tt - 2451545.0) / 36525.0
    # Meeus (47.7): Moon's argument of latitude F, mean ascending node Ω.
    F = np.radians(93.2720950 + 483202.0175233 * T - 0.0036539 * T**2
                   - T**3 / 3526000.0 + T**4 / 863310000.0)
    Om = np.radians(125.0445479 - 1934.1362891 * T + 0.0020754 * T**2
                    + T**3 / 467441.0 - T**4 / 60616000.0)
    eps = mean_obliquity(t.tdb) * ASEC2RAD
    v_mean_eq = t.P @ ICRS_to_J2000 @ moon_geo_icrf_km      # mean equator/equinox of date
    v_ecl = rot_x(-eps) @ v_mean_eq                           # mean ecliptic of date
    lam = np.arctan2(v_ecl[1], v_ecl[0])                      # = λ_apparent − Δψ
    beta = np.arctan2(v_ecl[2], np.hypot(v_ecl[0], v_ecl[1]))

    W = lam - Om
    A = np.arctan2(np.sin(W) * np.cos(beta) * np.cos(I_MOON) - np.sin(beta) * np.sin(I_MOON),
                   np.cos(W) * np.cos(beta))
    l_opt = float(_wrap180(np.degrees(A - F)))
    b_opt = float(np.degrees(np.arcsin(-np.sin(W) * np.cos(beta) * np.sin(I_MOON)
                                       - np.sin(beta) * np.cos(I_MOON))))
    return l_opt, b_opt


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
@dataclass(frozen=True, slots=True)
class Libration:
    lon_deg: float
    lat_deg: float


@dataclass(frozen=True, slots=True)
class LunarGeometry:
    utc: str
    tdb_jd: float
    frame: str
    site_lat_deg: float | np.ndarray
    site_lon_deg: float | np.ndarray
    site_height_m: float
    # Sun
    subsolar_lat_deg: float
    subsolar_lon_deg: float
    sun_el: float | np.ndarray
    sun_az: float | np.ndarray
    sun_semidiameter_deg: float
    sun_distance_km: float
    # Earth
    subearth_lat_deg: float
    subearth_lon_deg: float
    earth_el: float | np.ndarray
    earth_az: float | np.ndarray
    earth_semidiameter_deg: float
    earth_distance_km: float
    # Libration (geocentric)
    libration_total: Libration
    libration_optical: Libration
    libration_physical: Libration

    def to_dict(self) -> dict:
        d = asdict(self)
        return {k: (v.tolist() if isinstance(v, np.ndarray) else v) for k, v in d.items()}


def _to_utc_datetime(when: datetime | str | None) -> datetime:
    if when is None:
        return datetime.now(timezone.utc)
    if isinstance(when, str):
        when = datetime.fromisoformat(when.replace("Z", "+00:00"))
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return when.astimezone(timezone.utc)


class _EpochState(NamedTuple):
    t: object               # skyfield Time
    sun_me: np.ndarray      # apparent Sun vector from Moon centre, MOON_ME, km
    earth_me: np.ndarray    # apparent Earth vector from Moon centre, MOON_ME, km
    libration_total: Libration
    libration_optical: Libration


@lru_cache(maxsize=4096)
def _epoch_state(e: LunarEphemeris, when: datetime) -> _EpochState:
    """Everything that depends only on the epoch (cached: sites at the same
    instant cost only the vectorised topocentric step)."""
    t = e.ts.from_datetime(when)

    # Directions as seen from the Moon's centre at t, rotated into MOON_ME.
    R = e.frame.rotation_at(t)                                  # ICRF -> MOON_ME
    moon_bary = e.moon.at(t)
    sun_me = R @ moon_bary.observe(e.sun).apparent().position.km
    earth_me = R @ moon_bary.observe(e.earth).apparent().position.km
    sun_me.flags.writeable = earth_me.flags.writeable = False

    # Libration as seen from the geocentre at t (lunar orientation at t - τ).
    # Light-time only (NAIF "LT" sub-observer convention, as used by JPL
    # Horizons): stellar aberration is an observer-velocity effect and does not
    # change which surface point geometrically faces the Earth.
    astrometric = e.earth.at(t).observe(e.moon)
    moon_geo = astrometric.position.km
    R_emit = e.frame.rotation_at(t - astrometric.light_time)
    b_tot, l_tot = _latlon_deg(R_emit @ -moon_geo)
    l_opt, b_opt = _optical_libration(t, moon_geo)
    return _EpochState(t, sun_me, earth_me, Libration(l_tot, b_tot), Libration(l_opt, b_opt))


def compute_geometry(
    lat_deg: float | np.ndarray,
    lon_deg: float | np.ndarray,
    when: datetime | str | None = None,
    height_m: float = 0.0,
    *,
    ephem: LunarEphemeris | None = None,
) -> LunarGeometry:
    """Sun/Earth geometry and libration for selenographic site(s) at a UTC instant.

    ``lat_deg``/``lon_deg`` may be scalars or broadcastable NumPy arrays (many
    sites, one epoch: the ephemeris is evaluated only once). Naive datetimes
    are taken as UTC.
    """
    lat = np.asarray(lat_deg, dtype=float)
    lon = np.asarray(lon_deg, dtype=float)
    if np.any(np.abs(lat) > 90.0):
        raise ValueError("latitude must be within [-90, 90] degrees")
    s = _epoch_state(ephem or get_ephemeris(), _to_utc_datetime(when))
    t, sun_me, earth_me = s.t, s.sun_me, s.earth_me
    tot, opt = s.libration_total, s.libration_optical

    # Site-topocentric elevation / azimuth (vectorised over sites).
    up, east, north = _local_frame(lat, lon)
    site_me = up * (MOON_RADIUS_KM + height_m * 1e-3)
    sun_el, sun_az, sun_rng = _el_az(sun_me, site_me, up, east, north)
    earth_el, earth_az, earth_rng = _el_az(earth_me, site_me, up, east, north)

    scalar = lambda a: float(a) if np.ndim(a) == 0 else a  # noqa: E731
    sslat, sslon = _latlon_deg(sun_me)
    selat, selon = _latlon_deg(earth_me)
    sun_d, earth_d = float(np.linalg.norm(sun_me)), float(np.linalg.norm(earth_me))

    return LunarGeometry(
        utc=t.utc_iso(places=3),
        tdb_jd=float(t.tdb),
        frame=TARGET_FRAME,
        site_lat_deg=scalar(lat),
        site_lon_deg=scalar(_wrap180(lon)),
        site_height_m=float(height_m),
        subsolar_lat_deg=sslat,
        subsolar_lon_deg=sslon,
        sun_el=scalar(sun_el),
        sun_az=scalar(sun_az),
        sun_semidiameter_deg=float(np.degrees(np.arcsin(SUN_RADIUS_KM / np.min(sun_rng)))),
        sun_distance_km=sun_d,
        subearth_lat_deg=selat,
        subearth_lon_deg=selon,
        earth_el=scalar(earth_el),
        earth_az=scalar(earth_az),
        earth_semidiameter_deg=float(np.degrees(np.arcsin(EARTH_RADIUS_KM / np.min(earth_rng)))),
        earth_distance_km=earth_d,
        libration_total=tot,
        libration_optical=opt,
        libration_physical=Libration(float(_wrap180(tot.lon_deg - opt.lon_deg)),
                                     tot.lat_deg - opt.lat_deg),
    )


def sun_earth_vectors(t, *, ephem: LunarEphemeris | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Vectorised over a Skyfield Time *array*: apparent Sun and Earth vectors
    from the Moon's centre in MOON_ME, each shaped (N, 3) km. Same corrections as
    :func:`compute_geometry` (light-time + aberration + deflection)."""
    e = ephem or get_ephemeris()
    R = e.frame.rotation_at(t)                                   # (3, 3, N)
    moon_bary = e.moon.at(t)
    sun = moon_bary.observe(e.sun).apparent().position.km        # (3, N)
    earth = moon_bary.observe(e.earth).apparent().position.km
    return np.einsum("ijn,jn->ni", R, sun), np.einsum("ijn,jn->ni", R, earth)


def topocentric(target_me: np.ndarray, lat_deg: float, lon_deg: float, height_m: float = 0.0):
    """Elevation, azimuth (deg) and range (km) of target vectors (N, 3) from one site."""
    up, east, north = _local_frame(np.asarray(lat_deg, float), np.asarray(lon_deg, float))
    return _el_az(target_me, up * (MOON_RADIUS_KM + height_m * 1e-3), up, east, north)
