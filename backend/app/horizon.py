"""Local horizon profiles and finite-disk solar illumination on an airless Moon.

With no atmosphere there is no refraction or twilight. Whether a body is visible
depends only on the geometric horizon set by topography and the curvature of
the reference sphere (R = 1737.4 km).

Conventions (identical to :mod:`app.astrodynamics`):
  * azimuth: degrees from north through east, [0, 360)
  * elevation: degrees above the local horizontal of the reference sphere at the
    site (the plane normal to the radial "up" vector)
  * heights: metres above the 1737.4 km reference sphere

Main pieces:
  * :func:`horizon_drop`             - curvature drop  h = d^2 / (2R)  (+ exact form)
  * :func:`obstacle_elevation_angle` - elevation angle of a terrain point at distance d
  * :class:`HorizonProfile`          - 360 deg horizon (custom array, terrain samples,
                                       or smooth-sphere model)
  * :func:`disk_visible_fraction`    - visible fraction of a finite disk (Sun/Earth)
                                       behind an arbitrary horizon, optionally
                                       limb-darkened (= fraction of solar power)
  * :func:`illumination`             - all of the above at a site and UTC epoch
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

import numpy as np

from .astrodynamics import MOON_RADIUS_KM, compute_geometry

R_M = MOON_RADIUS_KM * 1e3
SUN_SEMIDIAMETER_DEG = 0.265       # nominal; the real value (0.262-0.272 deg) comes from DE440
LIMB_DARKENING_U = 0.6             # broadband linear law I(mu)/I0 = 1 - u(1 - mu) (Eddington: 0.6)

DropMethod = Literal["approx", "exact"]


# --------------------------------------------------------------------------- #
# 1. Curvature geometry
# --------------------------------------------------------------------------- #
def horizon_drop(d_m, R: float = R_M, method: DropMethod = "approx"):
    """How far the sphere's surface drops below the observer's tangent plane.

    ``d_m`` is the distance along the surface in metres (scalar or array).

    * ``"approx"``: h_drop = d^2 / (2R), the leading-order term. At 100 km it
      differs from the exact value by about 0.8 m.
    * ``"exact"``:  h_drop = R (1 - cos(d/R)), measured along the observer's vertical.
    """
    d = np.asarray(d_m, dtype=float)
    if method == "approx":
        return d * d / (2.0 * R)
    if method == "exact":
        return R * (1.0 - np.cos(d / R))
    raise ValueError(f"unknown method {method!r}")


def obstacle_elevation_angle(d_m, target_height_m, observer_height_m: float = 0.0,
                             R: float = R_M, method: DropMethod = "exact"):
    """Elevation angle (deg) of a terrain point seen from the observer.

    The terrain point is at surface distance ``d_m`` and height
    ``target_height_m``. The observer stands at ``observer_height_m``; both
    heights are measured above the reference sphere.

    The exact method is the rigorous spherical-triangle form. Its vertical
    term is (H - h0) - (1 + H/R) * R(1 - cos θ), so it reduces to the textbook
    atan((H - h0 - d^2/2R) / d) at leading order. That textbook form is what
    the ``"approx"`` method returns.
    """
    d = np.asarray(d_m, dtype=float)
    H = np.asarray(target_height_m, dtype=float)
    h0 = float(observer_height_m)
    if method == "approx":
        return np.degrees(np.arctan2(H - h0 - horizon_drop(d, R, "approx"), d))
    theta = d / R
    dx = (R + H) * np.sin(theta)
    dy = (R + H) * np.cos(theta) - (R + h0)
    return np.degrees(np.arctan2(dy, dx))


def spherical_horizon_dip_deg(observer_height_m: float = 0.0, R: float = R_M) -> float:
    """Elevation of the smooth-sphere horizon for an observer at height h.

    The value is -acos(R / (R + h)): about -0.19 deg at 10 m and -1.9 deg at 1 km.
    It is 0 for h <= 0. A point below the datum on a bare sphere is unphysical,
    so it is treated as standing on the surface.
    """
    h = max(float(observer_height_m), 0.0)
    return 0.0 - float(np.degrees(np.arccos(R / (R + h)))) + 0.0  # avoid -0.0


def distance_to_horizon_m(observer_height_m: float, R: float = R_M) -> float:
    """Surface (arc) distance to the smooth-sphere horizon: R * acos(R / (R + h))."""
    return R * float(np.arccos(R / (R + max(observer_height_m, 0.0))))


# --------------------------------------------------------------------------- #
# 2. Horizon profile
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class HorizonProfile:
    """Horizon elevation (deg) sampled on a uniform azimuth grid starting at 0 deg (N).

    ``elevation_deg[i]`` is the horizon at azimuth ``i * 360 / n``. Lookups use
    periodic linear interpolation, so the grid wraps cleanly through north.
    """

    elevation_deg: np.ndarray
    source: Literal["custom_profile", "terrain_samples", "spherical_model"]
    lat: float | None = None
    lon: float | None = None
    observer_height_m: float = 0.0
    custom_coordinates: bool = False
    meta: dict = field(default_factory=dict)

    def __post_init__(self):
        e = np.asarray(self.elevation_deg, dtype=float).ravel()
        if e.size < 4:
            raise ValueError("horizon profile needs at least 4 azimuth samples")
        if not np.all(np.isfinite(e)) or np.any(np.abs(e) > 90):
            raise ValueError("horizon elevations must be finite and within [-90, 90] deg")
        e.flags.writeable = False
        object.__setattr__(self, "elevation_deg", e)

    @property
    def azimuth_deg(self) -> np.ndarray:
        return np.arange(self.elevation_deg.size) * (360.0 / self.elevation_deg.size)

    def at(self, azimuth_deg):
        """Horizon elevation (deg) at any azimuth(s); periodic linear interpolation."""
        n = self.elevation_deg.size
        x = (np.asarray(azimuth_deg, dtype=float) % 360.0) * (n / 360.0)
        i0 = np.floor(x).astype(int) % n
        w = x - np.floor(x)
        return (1.0 - w) * self.elevation_deg[i0] + w * self.elevation_deg[(i0 + 1) % n]

    # ---- constructors ---------------------------------------------------- #
    @classmethod
    def from_array(cls, elevation_deg, *, lat=None, lon=None, observer_height_m=0.0,
                   custom_coordinates=False) -> "HorizonProfile":
        """Use a measured or precomputed 360 deg profile.

        The samples must be uniformly spaced in azimuth, starting at north.
        """
        return cls(np.asarray(elevation_deg, float), "custom_profile", lat, lon,
                   observer_height_m, custom_coordinates)

    @classmethod
    def spherical(cls, *, n_azimuths: int = 360, lat=None, lon=None,
                  observer_height_m: float = 0.0, custom_coordinates=False) -> "HorizonProfile":
        """Smooth-sphere model: the same curvature dip in every direction, no terrain."""
        dip = spherical_horizon_dip_deg(observer_height_m)
        return cls(np.full(n_azimuths, dip), "spherical_model", lat, lon, observer_height_m,
                   custom_coordinates, {"dip_deg": dip,
                                        "horizon_distance_m": distance_to_horizon_m(observer_height_m)})

    @classmethod
    def from_terrain(cls, distances_m, heights_m, *, observer_height_m: float = 0.0,
                     lat=None, lon=None, custom_coordinates=False,
                     method: DropMethod = "exact") -> "HorizonProfile":
        """Build a horizon from radial terrain samples, such as rays cast through a LOLA DEM.

        ``heights_m`` has shape (n_azimuths, n_distances): the terrain height
        above the reference sphere along each azimuth ray. Rays start at north
        and are uniformly spaced. ``distances_m`` holds the surface distances,
        either shared by every ray, shape (n_distances,), or given per ray with
        the same shape as ``heights_m``. The horizon along each ray is the
        highest obstacle angle after the curvature drop is applied. The
        smooth-sphere dip is used only as a fallback when a ray has no samples
        (all NaN).
        """
        H = np.atleast_2d(np.asarray(heights_m, float))
        d = np.broadcast_to(np.asarray(distances_m, float), H.shape)
        ang = obstacle_elevation_angle(d, H, observer_height_m, method=method)
        ang = np.where(np.isfinite(ang) & (d > 0), ang, -np.inf)
        elev = ang.max(axis=1)
        elev = np.where(np.isfinite(elev), elev, spherical_horizon_dip_deg(observer_height_m))
        return cls(elev, "terrain_samples", lat, lon, observer_height_m, custom_coordinates,
                   {"max_distance_m": float(np.nanmax(d)), "drop_method": method})


def resolve_horizon(lat: float, lon: float, *, profile=None, observer_height_m: float = 0.0,
                    custom_coordinates: bool = False, n_azimuths: int = 360) -> HorizonProfile:
    """Return the horizon for a site.

    If ``profile`` is given (an array or a HorizonProfile), it is used. Otherwise
    the simplified spherical horizon model is built.

    ``custom_coordinates=True`` marks a user-chosen arbitrary point, as opposed
    to a catalogued site. The flag is carried through to the output, so clients
    know a spherical horizon there is an idealisation: the terrain is unknown.
    """
    if isinstance(profile, HorizonProfile):
        return profile
    if profile is not None:
        return HorizonProfile.from_array(profile, lat=lat, lon=lon,
                                         observer_height_m=observer_height_m,
                                         custom_coordinates=custom_coordinates)
    return HorizonProfile.spherical(n_azimuths=n_azimuths, lat=lat, lon=lon,
                                    observer_height_m=observer_height_m,
                                    custom_coordinates=custom_coordinates)


# --------------------------------------------------------------------------- #
# 3. Finite-disk visibility (partial Sun / partial Earth)
# --------------------------------------------------------------------------- #
_GL_X = np.polynomial.legendre.leggauss(64)   # nodes across the disk (azimuth direction)
_GL_Y = np.polynomial.legendre.leggauss(24)   # nodes along each vertical chord


def segment_fraction(offset_deg, radius_deg):
    """Area fraction of a uniform disk above a straight, level horizon.

    This is the closed-form circular-segment result. ``offset_deg`` is the
    elevation of the disk centre minus the horizon elevation.
    """
    y = np.clip(np.asarray(offset_deg, float) / radius_deg, -1.0, 1.0)
    return 0.5 + (y * np.sqrt(1.0 - y * y) + np.arcsin(y)) / np.pi


def disk_visible_fraction(center_el_deg: float, center_az_deg: float, radius_deg: float,
                          horizon: HorizonProfile, limb_darkening_u: float = 0.0) -> float:
    """Visible fraction (0..1) of a disk of angular radius ``radius_deg`` above ``horizon``.

    The horizon may be jagged across the disk's width: it is evaluated at every
    azimuth the disk spans, with the 1/cos(el) stretching of azimuth near the
    zenith. The visible part of each vertical chord is integrated with
    Gauss-Legendre quadrature.

    ``limb_darkening_u`` > 0 weights the disk by I(mu) = 1 - u(1 - mu), so the
    result is the fraction of *flux* (solar power) received rather than the
    fraction of area. Partially blocked, the Sun loses power more slowly than
    area at first, because its limb is dim.
    """
    r = float(radius_deg)
    el = float(center_el_deg)
    # Fast exits: the disk is entirely above the highest, or below the lowest,
    # horizon point it could overlap.
    span = min(r / max(np.cos(np.radians(min(abs(el) + r, 89.999))), 1e-6), 180.0)
    # Piecewise-linear profile => extremes lie at the span ends or at grid nodes inside it.
    rel = (horizon.azimuth_deg - center_az_deg + 180.0) % 360.0 - 180.0
    nodes = horizon.elevation_deg[np.abs(rel) <= span]
    hz = np.concatenate([horizon.at(center_az_deg + np.array([-span, span])), nodes])
    if el - r >= hz.max():
        return 1.0
    if el + r <= hz.min():
        return 0.0

    xn, xw = _GL_X
    yn, yw = _GL_Y
    x = xn * r                                            # horizontal offset (deg on sky)
    half = np.sqrt(np.maximum(r * r - x * x, 0.0))        # half chord height
    cos_el = np.cos(np.radians(np.clip(el, -89.999, 89.999)))
    hor = horizon.at(center_az_deg + x / cos_el)          # horizon under each chord
    lo = np.clip(hor, el - half, el + half)               # visible part: [lo, el + half]
    top = el + half
    if limb_darkening_u == 0.0:
        visible = np.sum(xw * (top - lo)) * r
        return float(np.clip(visible / (np.pi * r * r), 0.0, 1.0))

    # Limb-darkened: integrate I(mu) over each visible chord and normalise by the full-disk flux.
    def chord_flux(a, b):
        mid, hw = 0.5 * (a + b), 0.5 * (b - a)
        y = mid[:, None] + hw[:, None] * yn[None, :] - el
        rho2 = (x[:, None] ** 2 + y ** 2) / (r * r)
        mu = np.sqrt(np.clip(1.0 - rho2, 0.0, 1.0))
        return np.sum(yw[None, :] * (1.0 - limb_darkening_u * (1.0 - mu)), axis=1) * hw

    vis = np.sum(xw * chord_flux(lo, top)) * r
    full = np.pi * r * r * (1.0 - limb_darkening_u / 3.0)  # integral of the linear law over the disk
    return float(np.clip(vis / full, 0.0, 1.0))


# --------------------------------------------------------------------------- #
# Site illumination at an epoch
# --------------------------------------------------------------------------- #
@dataclass(frozen=True, slots=True)
class Illumination:
    utc: str
    lat: float
    lon: float
    observer_height_m: float
    horizon_source: str
    custom_coordinates: bool
    sun_el: float
    sun_az: float
    sun_semidiameter_deg: float
    horizon_el_at_sun_az: float
    sun_clearance_deg: float      # sun_el - horizon; the disk is fully clear above +semidiameter
    solar_fraction: float         # visible disk area, 0..1
    solar_flux_fraction: float    # limb-darkened visible power, 0..1 (use this for energy)
    earth_el: float
    earth_az: float
    horizon_el_at_earth_az: float
    earth_fraction: float         # visible Earth disk area, 0..1 (direct-to-Earth line of sight)


def illumination(lat: float, lon: float, when: datetime | str | None = None, *,
                 horizon: HorizonProfile | np.ndarray | None = None,
                 observer_height_m: float = 0.0, custom_coordinates: bool = False,
                 limb_darkening_u: float = LIMB_DARKENING_U) -> Illumination:
    """Sun and Earth visibility at a site, accounting for the horizon and finite disk sizes.

    Uses the exact DE440 Sun semidiameter. The observer height is passed to the
    ephemeris geometry and to the spherical horizon model, so both stay consistent.
    """
    hz = resolve_horizon(lat, lon, profile=horizon, observer_height_m=observer_height_m,
                         custom_coordinates=custom_coordinates)
    g = compute_geometry(lat, lon, when, observer_height_m)
    sd = g.sun_semidiameter_deg
    h_sun = float(hz.at(g.sun_az))
    h_earth = float(hz.at(g.earth_az))
    return Illumination(
        utc=g.utc, lat=float(lat), lon=float(g.site_lon_deg), observer_height_m=observer_height_m,
        horizon_source=hz.source, custom_coordinates=hz.custom_coordinates,
        sun_el=g.sun_el, sun_az=g.sun_az, sun_semidiameter_deg=sd,
        horizon_el_at_sun_az=h_sun, sun_clearance_deg=g.sun_el - h_sun,
        solar_fraction=disk_visible_fraction(g.sun_el, g.sun_az, sd, hz),
        solar_flux_fraction=disk_visible_fraction(g.sun_el, g.sun_az, sd, hz, limb_darkening_u),
        earth_el=g.earth_el, earth_az=g.earth_az, horizon_el_at_earth_az=h_earth,
        earth_fraction=disk_visible_fraction(g.earth_el, g.earth_az, g.earth_semidiameter_deg, hz),
    )
