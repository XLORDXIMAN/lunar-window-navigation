from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.astrodynamics import compute_geometry
from app.main import app
from app.simulation import SimulationConfig, simulate

START = datetime(2026, 11, 14, tzinfo=timezone.utc)
APOLLO11 = (0.67416, 23.47314)
CHANGE4 = (-45.4446, 177.5991)


@pytest.fixture(scope="module")
def apollo():
    return simulate(SimulationConfig(*APOLLO11, START, duration_days=29.53, step_hours=1.0))


def test_event_times_are_exact(apollo):
    # At each refined sunrise/sunset the Sun's upper limb sits on the (flat) horizon.
    events = [e for e in apollo["events"] if e["type"] in ("sunrise", "sunset")]
    assert len(events) == 2
    for ev in events:
        g = compute_geometry(*APOLLO11, ev["utc"])
        assert g.sun_el + g.sun_semidiameter_deg == pytest.approx(0.0, abs=0.003)  # ~1 s of motion + 1 s rounding


def test_time_to_sunset_consistent(apollo):
    row = next(r for r in apollo["series"] if r["sun_up"])
    t_row = datetime.fromisoformat(row["utc"].replace("Z", "+00:00"))
    t_set = datetime.fromisoformat(row["next_sunset_utc"].replace("Z", "+00:00"))
    assert (t_set - t_row).total_seconds() / 3600 == pytest.approx(row["time_to_sunset_hours"], abs=1e-3)
    assert all(r["time_to_sunset_hours"] is None for r in apollo["series"] if not r["sun_up"])


def test_summary_consistency(apollo):
    s = apollo["summary"]
    assert s["communication"]["dte_fraction"] == 1.0                    # near side: Earth always up
    assert 340 < s["sunlight"]["total_sunlight_hours"] < 370            # ~half a synodic month
    assert s["sunlight"]["equivalent_full_sun_hours"] <= s["sunlight"]["total_sunlight_hours"] + 1
    for r in apollo["series"]:
        assert (r["energy_coefficient"] > 0) == r["sun_up"]


def test_change4_never_has_dte():
    res = simulate(SimulationConfig(*CHANGE4, START, duration_days=29.53, step_hours=2.0))
    assert res["summary"]["communication"]["window_count"] == 0
    assert not any(r["dte_available"] for r in res["series"])
    assert all(r["time_to_earthset_hours"] is None for r in res["series"])


def test_polar_site_has_partial_sun_and_libration_driven_dte():
    res = simulate(SimulationConfig(-84.6, 31.0, START, duration_days=29.53, step_hours=1.0))
    e = [r["energy_coefficient"] for r in res["series"]]
    assert any(0 < x < 1 for x in e)                                     # disk straddling horizon
    assert 0 < res["summary"]["communication"]["dte_fraction"] < 1


def test_endpoint_and_validation():
    with TestClient(app) as c:
        r = c.get("/api/simulate", params={"lat": -84.6, "lon": 31, "start_date": "2026-11-14",
                                           "duration_days": 3, "step_hours": 6})
        assert r.status_code == 200 and len(r.json()["series"]) == 13
        r = c.get("/api/simulate", params={"lat": -84.6, "lon": 31, "start_date": "2026-11-14",
                                           "duration_days": 3, "horizon_profile": "5,5,5,5"})
        assert r.status_code == 200 and r.json()["summary"]["sunlight"]["total_sunlight_hours"] == 0
        assert c.get("/api/simulate", params={"lat": 0, "lon": 0, "start_date": "2026-01-01",
                                              "horizon_profile": "1,2,x"}).status_code == 422
        assert c.get("/api/simulate", params={"lat": 0, "lon": 0, "start_date": "2200-01-01"}).status_code == 422
        assert c.get("/api/simulate", params={"lat": 0, "lon": 0, "start_date": "2026-01-01",
                                              "duration_days": 3660, "step_hours": 1 / 60}).status_code == 422
