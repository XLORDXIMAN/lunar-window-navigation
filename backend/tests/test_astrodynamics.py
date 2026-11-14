"""Regression tests against JPL Horizons (DE440, MOON_ME) and Meeus Example 53.a."""

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.astrodynamics import compute_geometry, get_ephemeris
from app.main import app

ARCSEC = 1 / 3600


@pytest.fixture(scope="module")
def eph():
    return get_ephemeris()


def test_total_libration_matches_horizons(eph):
    # Horizons: Moon from geocentre, 1992-Apr-12 00:00 TT, ObsSub-LON/LAT (q14)
    g = compute_geometry(0, 0, eph.ts.tt(1992, 4, 12).utc_datetime())
    assert g.libration_total.lon_deg == pytest.approx(358.767038 - 360, abs=0.5 * ARCSEC)
    assert g.libration_total.lat_deg == pytest.approx(4.174341, abs=0.5 * ARCSEC)


def test_optical_libration_matches_meeus_53a(eph):
    # Meeus, Astronomical Algorithms 2nd ed., Example 53.a: l' = -1.206, b' = +4.194
    # (Meeus uses the aberrated λ; our light-time-only vector shifts l' by ~0.002°)
    g = compute_geometry(0, 0, eph.ts.tt(1992, 4, 12).utc_datetime())
    assert g.libration_optical.lon_deg == pytest.approx(-1.206, abs=0.004)
    assert g.libration_optical.lat_deg == pytest.approx(4.194, abs=0.001)


def test_topocentric_sun_earth_match_horizons():
    # Horizons: site E-lon 30.0, lat -85.4, alt 0 on Moon (R=1737.4), 2026-Nov-14 12:00 UT, q4 airless
    g = compute_geometry(-85.4, 30.0, "2026-11-14T12:00:00Z")
    assert g.sun_az == pytest.approx(90.646916, abs=1 * ARCSEC)
    assert g.sun_el == pytest.approx(1.509594, abs=1 * ARCSEC)
    assert g.earth_az == pytest.approx(328.158626, abs=1 * ARCSEC)
    assert g.earth_el == pytest.approx(-0.215433, abs=1 * ARCSEC)


def test_vectorised_sites_match_scalar():
    lat, lon = np.array([-89.9, -85.4, 0.0]), np.array([0.0, 30.0, -120.0])
    many = compute_geometry(lat, lon, "2026-11-14T12:00:00Z")
    for i in range(3):
        one = compute_geometry(lat[i], lon[i], "2026-11-14T12:00:00Z")
        assert many.sun_el[i] == pytest.approx(one.sun_el, abs=1e-12)
        assert many.earth_az[i] == pytest.approx(one.earth_az, abs=1e-12)


def test_subsolar_point_has_sun_near_zenith():
    g = compute_geometry(0, 0, "2026-11-14T12:00:00Z")
    z = compute_geometry(g.subsolar_lat_deg, g.subsolar_lon_deg, "2026-11-14T12:00:00Z")
    assert z.sun_el > 89.99  # parallax from the 1737 km radius is < 0.0007°


def test_api_endpoints():
    with TestClient(app) as c:
        r = c.get("/v1/geometry", params={"lat": -85.4, "lon": 30, "utc": "2026-11-14T12:00:00Z"})
        assert r.status_code == 200 and r.json()["frame"] == "MOON_ME"
        r = c.post("/v1/geometry/batch", json={"utc": "2026-11-14T12:00:00Z",
                                               "sites": [{"lat": -85.4, "lon": 30}, {"lat": -89, "lon": 0}]})
        assert r.status_code == 200 and len(r.json()["sites"]) == 2
        assert c.get("/v1/geometry", params={"lat": 95, "lon": 0}).status_code == 422


def test_sites_endpoint():
    with TestClient(app) as c:
        r = c.get("/api/sites")
        assert r.status_code == 200 and len(r.json()["sites"]) >= 11
        far = c.get("/api/sites", params={"far_side": True}).json()["sites"]
        ce4 = next(s for s in far if s["id"] == "cnsa-change-4")
        assert ce4["visibility"]["earth_visible_fraction"] == 0.0
        assert ce4["visibility"]["earth_el_max_deg"] < 0
        apollo = c.get("/api/sites", params={"category": "apollo"}).json()["sites"]
        assert {s["id"] for s in apollo} == {"apollo-11", "apollo-15", "apollo-17"}
        assert c.get("/api/sites", params={"category": "nope"}).status_code == 422


def test_change4_has_no_earth_line_of_sight():
    # Independent of the catalog: sample a month with the engine directly.
    for day in range(0, 30):
        g = compute_geometry(-45.4446, 177.5991, f"2026-11-{1 + day % 30:02d}T00:00:00Z")
        assert g.earth_el < -30
