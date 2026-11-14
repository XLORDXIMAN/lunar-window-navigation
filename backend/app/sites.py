"""Landing-site catalog (data/sites.json), validated once at import time."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

SITES_PATH = Path(__file__).resolve().parent.parent / "data" / "sites.json"

Category = Literal["apollo", "artemis_iii_candidate", "commercial_clps", "international"]


class Visibility(BaseModel):
    earth_visible_fraction: float
    sun_visible_fraction: float
    earth_el_min_deg: float
    earth_el_max_deg: float


class LandingSite(BaseModel):
    id: str
    name: str
    mission: str
    category: Category
    agency: str
    country: str
    status: str
    landing_utc: str | None
    lat: float
    lon: float
    coordinate_type: Literal["lander_position", "region_representative_point"]
    coordinate_uncertainty_m: float
    coordinate_source: str
    region: str
    far_side: bool
    highlight: str | None = None
    description: str
    visibility: Visibility | None = None


class SiteCatalog(BaseModel):
    meta: dict
    sites: list[LandingSite]


@lru_cache(maxsize=1)
def load_catalog() -> SiteCatalog:
    return SiteCatalog.model_validate(json.loads(SITES_PATH.read_text(encoding="utf-8")))
