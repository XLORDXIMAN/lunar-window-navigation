import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def codes(resp):
    return {a["code"] for a in resp["alerts"]}


def test_identical_scenarios_are_go(client):
    r = client.post("/api/compare", json={
        "scenario_a": {"site_id": "apollo-11", "start_date": "2026-11-16T00:00:00Z"},
        "scenario_b": {}})
    j = r.json()
    assert r.status_code == 200 and j["assessment"] == "GO" and j["same_site"]
    assert all(v.get("delta", 0) == 0 for v in j["diff"].values())
    assert codes(j) == {"NO_SIGNIFICANT_CHANGE"}


def test_launch_slip_inherits_site_and_flags_darkness(client):
    j = client.post("/api/compare", json={
        "scenario_a": {"label": "Nominal", "site_id": "artemis-mons-mouton", "start_date": "2026-11-20T00:00:00Z"},
        "scenario_b": {"label": "Slip", "delay_days": 12},
        "constraints": {"battery_autonomy_hours": 100}}).json()
    assert j["start_offset_hours"] == 288.0 and j["same_site"]
    assert j["scenario_b"]["site_id"] == "artemis-mons-mouton"
    assert j["scenario_b"]["parameters"]["start_utc"] == "2026-12-02T00:00:00Z"
    assert {"START_IN_DARKNESS", "DARKNESS_EXCEEDS_BATTERY"} <= codes(j)
    assert j["assessment"] == "NO_GO"
    assert j["alerts"][0]["message"].startswith("❌ Critical:")


def test_earlier_sunset_alert_wording(client):
    # Apollo 11: land 3 days later in the same lunar day -> sunset ~72 h earlier in MET.
    j = client.post("/api/compare", json={
        "scenario_a": {"site_id": "apollo-11", "start_date": "2026-11-16T00:00:00Z", "duration_days": 20},
        "scenario_b": {"delay_days": 3}}).json()
    a = next(x for x in j["alerts"] if x["code"] == "EARLIER_SUNSET")
    assert a["message"].startswith("⚠️ Warning: Sunset occurs 72.0 hours (3.0 days) earlier in Scenario B")
    assert j["diff"]["first_sunset_met_hours"]["delta"] == pytest.approx(-72.0, abs=0.01)


def test_far_side_site_loses_dte(client):
    j = client.post("/api/compare", json={
        "scenario_a": {"site_id": "apollo-11", "start_date": "2026-11-16T00:00:00Z"},
        "scenario_b": {"site_id": "cnsa-change-4"}}).json()
    assert not j["same_site"]
    assert {"DTE_LOST", "NO_DTE_AT_START"} <= codes(j)
    assert j["diff"]["dte_percent"] == {"a": 100.0, "b": 0.0, "delta": -100.0, "relative_change_percent": -100.0}


def test_validation(client):
    assert client.post("/api/compare", json={"scenario_a": {"lat": 0, "lon": 0},
                                             "scenario_b": {}}).status_code == 422          # no start_date
    assert client.post("/api/compare", json={"scenario_a": {"site_id": "nope", "start_date": "2026-01-01"},
                                             "scenario_b": {}}).status_code == 422
    assert client.post("/api/compare", json={"scenario_a": {"lat": 0, "lon": 0, "start_date": "2026-01-01"},
                                             "scenario_b": {"lat": 5}}).status_code == 422  # lat without lon
