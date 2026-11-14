"""Scenario comparison (A vs B) for launch-slip and site trade studies.

Scenario B may be fully specified or written as a delta on A:
``{"delay_days": 12}`` means the same site, landing 12 days later. Every
unspecified field is inherited from A. Timings are compared in mission elapsed
time (hours since each scenario's own start/touchdown), which is what matters
to a planner after a slip.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import Executor
from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from .horizon import resolve_horizon
from .simulation import SimulationConfig, simulate
from .sites import load_catalog


# --------------------------------------------------------------------------- #
# Request models
# --------------------------------------------------------------------------- #
class ScenarioIn(BaseModel):
    label: str | None = None
    site_id: str | None = Field(None, description="Catalog id from /api/sites (overrides lat/lon)")
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-360, le=360)
    start_date: datetime | None = None
    delay_days: float = Field(0.0, ge=-3650, le=3650, description="Shift of start_date (B inherits A's date)")
    duration_days: float | None = Field(None, gt=0, le=3660)
    step_hours: float | None = Field(None, ge=1 / 60, le=24)
    observer_height_m: float | None = Field(None, ge=0, le=10_000)
    dte_min_elevation_deg: float | None = Field(None, ge=-5, le=30)
    horizon_profile: list[float] | None = None


class MissionConstraints(BaseModel):
    battery_autonomy_hours: float | None = Field(None, gt=0, description="Max survivable darkness")
    max_dte_blackout_hours: float = Field(24.0, gt=0, description="Blackout length that triggers a critical alert")


class CompareIn(BaseModel):
    scenario_a: ScenarioIn
    scenario_b: ScenarioIn
    constraints: MissionConstraints = MissionConstraints()
    include_series: bool = False

    @model_validator(mode="after")
    def _a_is_complete(self):
        a = self.scenario_a
        if a.site_id is None and (a.lat is None or a.lon is None):
            raise ValueError("scenario_a needs site_id or lat+lon")
        if a.start_date is None:
            raise ValueError("scenario_a needs start_date")
        return self


DEFAULTS = dict(duration_days=29.53, step_hours=1.0, observer_height_m=0.0, dte_min_elevation_deg=0.0)


def _resolve(s: ScenarioIn, base: dict | None, name: str) -> dict:
    """Fill a scenario into a complete parameter dict (B inherits from A)."""
    r = dict(base or {})
    r.pop("label", None)
    if s.site_id is not None:
        site = next((x for x in load_catalog().sites if x.id == s.site_id), None)
        if site is None:
            raise ValueError(f"{name}: unknown site_id {s.site_id!r}")
        r.update(site_id=site.id, site_name=site.name, lat=site.lat, lon=site.lon)
    elif s.lat is not None and s.lon is not None:
        r.update(site_id=None, site_name=None, lat=s.lat, lon=s.lon)
    elif (s.lat is None) != (s.lon is None):
        raise ValueError(f"{name}: give both lat and lon")
    start = s.start_date or r.get("start_date")
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    r["start_date"] = start + timedelta(days=s.delay_days)
    for k, dflt in DEFAULTS.items():
        v = getattr(s, k)
        r[k] = v if v is not None else r.get(k, dflt)
    if s.horizon_profile is not None:
        r["horizon_profile"] = s.horizon_profile
    r.setdefault("horizon_profile", None)
    r["label"] = s.label or name
    return r


def _config(p: dict) -> SimulationConfig:
    hz = resolve_horizon(p["lat"], p["lon"], profile=p["horizon_profile"],
                         observer_height_m=p["observer_height_m"],
                         custom_coordinates=p["site_id"] is None)
    return SimulationConfig(lat=p["lat"], lon=p["lon"], start=p["start_date"],
                            duration_days=p["duration_days"], step_hours=p["step_hours"],
                            observer_height_m=p["observer_height_m"], horizon=hz,
                            dte_min_elevation_deg=p["dte_min_elevation_deg"],
                            lookahead_days=max(30.0, p["duration_days"]))


# --------------------------------------------------------------------------- #
# Metrics
# --------------------------------------------------------------------------- #
def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _met_hours(res: dict, iso: str | None) -> float | None:
    """Mission elapsed time (h) of a UTC timestamp relative to the scenario start."""
    if iso is None:
        return None
    return round((_parse(iso) - _parse(res["parameters"]["start_utc"])).total_seconds() / 3600, 3)


def _first_event(res: dict, kind: str) -> str | None:
    return next((e["utc"] for e in res["events"] if e["type"] == kind), None)


def _hours(block: dict | None) -> float:
    return block["duration_hours"] if block else 0.0


def _metrics(res: dict) -> dict:
    s, c = res["summary"]["sunlight"], res["summary"]["communication"]
    first = res["series"][0]
    sunset = first["next_sunset_utc"] if first["sun_up"] else _first_event(res, "sunset")
    earthset = first["next_earthset_utc"] if first["dte_available"] else _first_event(res, "earthset")
    return {
        "sunlight_percent": round(100 * s["sunlight_fraction"], 3),
        "total_sunlight_hours": s["total_sunlight_hours"],
        "equivalent_full_sun_hours": s["equivalent_full_sun_hours"],
        "max_uninterrupted_power_hours": _hours(s["max_uninterrupted_power_period"]),
        "max_continuous_darkness_hours": _hours(s["max_continuous_darkness_period"]),
        "dte_percent": round(100 * c["dte_fraction"], 3),
        "total_dte_hours": c["total_dte_hours"],
        "longest_dte_window_hours": _hours(c["longest_window"]),
        "longest_dte_blackout_hours": _hours(c["longest_blackout"]),
        "dte_window_count": c["window_count"],
        "sun_up_at_start": first["sun_up"],
        "dte_at_start": first["dte_available"],
        "energy_coefficient_at_start": first["energy_coefficient"],
        "first_sunset_met_hours": _met_hours(res, sunset),
        "first_sunrise_met_hours": _met_hours(res, _first_event(res, "sunrise")),
        "first_earthset_met_hours": _met_hours(res, earthset),
    }


def _diff(ma: dict, mb: dict) -> dict:
    out = {}
    for k, a in ma.items():
        b = mb[k]
        entry = {"a": a, "b": b}
        if isinstance(a, (int, float)) and not isinstance(a, bool) and isinstance(b, (int, float)):
            entry["delta"] = round(b - a, 3)
            if a:
                entry["relative_change_percent"] = round(100 * (b - a) / abs(a), 2)
        out[k] = entry
    return out


# --------------------------------------------------------------------------- #
# Alerts
# --------------------------------------------------------------------------- #
ICON = {"critical": "❌", "warning": "⚠️", "info": "ℹ️", "positive": "✅"}
TITLE = {"critical": "Critical", "warning": "Warning", "info": "Info", "positive": "Improvement"}
Severity = Literal["critical", "warning", "info", "positive"]


def _fmt_h(h: float) -> str:
    h = abs(h)
    return f"{h:.1f} hours ({h / 24:.1f} days)" if h >= 48 else f"{h:.1f} hours"


def _alerts(ma: dict, mb: dict, la: str, lb: str, cons: MissionConstraints) -> list[dict]:
    alerts: list[dict] = []

    def add(sev: Severity, code: str, text: str, metric: str | None = None):
        alerts.append({"severity": sev, "code": code, "metric": metric,
                       "a": ma.get(metric), "b": mb.get(metric),
                       "message": f"{ICON[sev]} {TITLE[sev]}: {text}"})

    # --- Conditions at touchdown/start
    if ma["sun_up_at_start"] and not mb["sun_up_at_start"]:
        rise = mb["first_sunrise_met_hours"]
        add("critical", "START_IN_DARKNESS",
            f"{lb} begins in darkness - no solar power at touchdown"
            + (f"; first sunrise at T+{rise:.1f} h" if rise is not None else "; no sunrise in the simulated window"),
            "sun_up_at_start")
    elif not ma["sun_up_at_start"] and mb["sun_up_at_start"]:
        add("positive", "START_IN_SUNLIGHT", f"{lb} begins in sunlight, {la} does not", "sun_up_at_start")
    if ma["dte_at_start"] and not mb["dte_at_start"]:
        add("critical", "NO_DTE_AT_START", f"{lb} has no direct-to-Earth link at touchdown", "dte_at_start")

    # --- Sunset timing (mission elapsed time)
    sa, sb = ma["first_sunset_met_hours"], mb["first_sunset_met_hours"]
    if sa is not None and sb is not None and ma["sun_up_at_start"] and mb["sun_up_at_start"]:
        d = sb - sa
        if d <= -1:
            add("critical" if (sa > 0 and -d / sa >= 0.5) else "warning", "EARLIER_SUNSET",
                f"Sunset occurs {_fmt_h(d)} earlier in {lb} (T+{sb:.1f} h vs T+{sa:.1f} h)",
                "first_sunset_met_hours")
        elif d >= 1:
            add("positive", "LATER_SUNSET", f"Sunset occurs {_fmt_h(d)} later in {lb} (T+{sb:.1f} h vs T+{sa:.1f} h)",
                "first_sunset_met_hours")
    elif sa is None and sb is not None and mb["sun_up_at_start"]:
        add("warning", "SUNSET_INTRODUCED", f"Sun sets at T+{sb:.1f} h in {lb}; {la} has no sunset in its window",
            "first_sunset_met_hours")

    # --- Sunlight share and continuous power
    d = mb["sunlight_percent"] - ma["sunlight_percent"]
    if d <= -15:
        add("critical", "SUNLIGHT_DROP", f"Total sunlight falls by {-d:.1f} percentage points in {lb}", "sunlight_percent")
    elif d <= -5:
        add("warning", "SUNLIGHT_DROP", f"Total sunlight falls by {-d:.1f} percentage points in {lb}", "sunlight_percent")
    elif d >= 5:
        add("positive", "SUNLIGHT_GAIN", f"Total sunlight rises by {d:.1f} percentage points in {lb}", "sunlight_percent")

    pa, pb = ma["max_uninterrupted_power_hours"], mb["max_uninterrupted_power_hours"]
    d = pb - pa
    if d <= -6:
        sev = "critical" if pa > 0 and -d / pa >= 0.25 else "warning"
        add(sev, "SHORTER_POWER_PERIOD",
            f"Longest uninterrupted power period shrinks by {_fmt_h(d)} in {lb} ({pb:.1f} h vs {pa:.1f} h)",
            "max_uninterrupted_power_hours")
    elif d >= 6:
        add("positive", "LONGER_POWER_PERIOD",
            f"Longest uninterrupted power period grows by {_fmt_h(d)} in {lb}", "max_uninterrupted_power_hours")

    na, nb = ma["max_continuous_darkness_hours"], mb["max_continuous_darkness_hours"]
    if cons.battery_autonomy_hours and nb > cons.battery_autonomy_hours:
        add("critical", "DARKNESS_EXCEEDS_BATTERY",
            f"Longest darkness in {lb} is {_fmt_h(nb)}, exceeding battery autonomy of "
            f"{_fmt_h(cons.battery_autonomy_hours)}"
            + (f"; {la} also exceeds it: {_fmt_h(na)}" if na > cons.battery_autonomy_hours
               else f"; {la} stays within it: {_fmt_h(na)}"),
            "max_continuous_darkness_hours")
    elif nb - na >= 6:
        add("warning", "LONGER_NIGHT", f"Longest darkness grows by {_fmt_h(nb - na)} in {lb}",
            "max_continuous_darkness_hours")

    # --- Direct-to-Earth
    ba, bb = ma["longest_dte_blackout_hours"], mb["longest_dte_blackout_hours"]
    if mb["total_dte_hours"] == 0 and ma["total_dte_hours"] > 0:
        add("critical", "DTE_LOST", f"Direct-to-Earth link never available in {lb} - relay required",
            "total_dte_hours")
    elif bb >= cons.max_dte_blackout_hours and bb - ba >= 1:
        add("critical", "DTE_BLACKOUT", f"Direct-to-Earth link lost for {_fmt_h(bb)} in {lb} "
                                        f"(longest blackout in {la}: {_fmt_h(ba)})", "longest_dte_blackout_hours")
    elif bb - ba >= 6:
        add("warning", "LONGER_DTE_BLACKOUT", f"Longest DTE blackout grows by {_fmt_h(bb - ba)} in {lb}",
            "longest_dte_blackout_hours")
    ea, eb = ma["first_earthset_met_hours"], mb["first_earthset_met_hours"]
    if ea is not None and eb is not None and ma["dte_at_start"] and mb["dte_at_start"] and eb - ea <= -1:
        add("warning", "EARLIER_EARTHSET", f"Earthset (loss of DTE) occurs {_fmt_h(eb - ea)} earlier in {lb} "
                                           f"(T+{eb:.1f} h vs T+{ea:.1f} h)", "first_earthset_met_hours")
    d = mb["dte_percent"] - ma["dte_percent"]
    if d <= -10:
        add("warning", "DTE_SHARE_DROP", f"DTE availability falls by {-d:.1f} percentage points in {lb}", "dte_percent")
    elif d >= 10:
        add("positive", "DTE_SHARE_GAIN", f"DTE availability rises by {d:.1f} percentage points in {lb}", "dte_percent")

    order = {"critical": 0, "warning": 1, "info": 2, "positive": 3}
    return sorted(alerts, key=lambda a: order[a["severity"]])


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
async def compare(req: CompareIn, executor: Executor | None = None) -> dict:
    pa = _resolve(req.scenario_a, None, "Scenario A")
    pb = _resolve(req.scenario_b, pa, "Scenario B")
    ca, cb = _config(pa), _config(pb)

    loop = asyncio.get_running_loop()
    ra, rb = await asyncio.gather(loop.run_in_executor(executor, simulate, ca),
                                  loop.run_in_executor(executor, simulate, cb))

    ma, mb = _metrics(ra), _metrics(rb)
    alerts = _alerts(ma, mb, pa["label"], pb["label"], req.constraints)
    if not any(a["severity"] in ("critical", "warning") for a in alerts):
        alerts.append({"severity": "info", "code": "NO_SIGNIFICANT_CHANGE", "metric": None, "a": None, "b": None,
                       "message": f"{ICON['info']} Info: no significant degradation in {pb['label']}"})
    worst = alerts[0]["severity"]

    def pack(p, r):
        out = {"label": p["label"], "site_id": p["site_id"], "site_name": p["site_name"],
               "site": r["site"], "parameters": r["parameters"], "summary": r["summary"], "events": r["events"]}
        if req.include_series:
            out["series"] = r["series"]
        return out

    return {
        "assessment": {"critical": "NO_GO", "warning": "CAUTION"}.get(worst, "GO"),  # B relative to A
        "same_site": (pa["lat"], pa["lon"]) == (pb["lat"], pb["lon"]),
        "start_offset_hours": round((pb["start_date"] - pa["start_date"]).total_seconds() / 3600, 3),
        "alerts": alerts,
        "diff": _diff(ma, mb),
        "scenario_a": pack(pa, ra),
        "scenario_b": pack(pb, rb),
    }
