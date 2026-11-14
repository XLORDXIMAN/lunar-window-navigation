from datetime import datetime

from pydantic import BaseModel, Field


class LibrationOut(BaseModel):
    lon_deg: float
    lat_deg: float


class GeometryOut(BaseModel):
    utc: str
    tdb_jd: float
    frame: str
    site_lat_deg: float
    site_lon_deg: float
    site_height_m: float
    subsolar_lat_deg: float
    subsolar_lon_deg: float
    sun_el: float = Field(description="Sun-centre elevation above local horizontal, deg")
    sun_az: float = Field(description="Sun azimuth from north through east, deg")
    sun_semidiameter_deg: float
    sun_distance_km: float
    subearth_lat_deg: float
    subearth_lon_deg: float
    earth_el: float
    earth_az: float
    earth_semidiameter_deg: float
    earth_distance_km: float
    libration_total: LibrationOut
    libration_optical: LibrationOut
    libration_physical: LibrationOut


class Site(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-360, le=360)


class BatchIn(BaseModel):
    utc: datetime | None = Field(None, description="ISO-8601; naive = UTC; omitted = now")
    height_m: float = 0.0
    sites: list[Site] = Field(min_length=1, max_length=1_000_000)


class SiteGeometry(BaseModel):
    lat: float
    lon: float
    sun_el: float
    sun_az: float
    earth_el: float
    earth_az: float


class BatchOut(BaseModel):
    utc: str
    frame: str
    subsolar_lat_deg: float
    subsolar_lon_deg: float
    subearth_lat_deg: float
    subearth_lon_deg: float
    libration_total: LibrationOut
    libration_optical: LibrationOut
    libration_physical: LibrationOut
    sites: list[SiteGeometry]
