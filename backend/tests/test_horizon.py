import numpy as np
import pytest

from app.horizon import (
    R_M, HorizonProfile, disk_visible_fraction, distance_to_horizon_m, horizon_drop,
    illumination, obstacle_elevation_angle, resolve_horizon, segment_fraction,
    spherical_horizon_dip_deg,
)

SD = 0.265


def test_horizon_drop_formula_and_exact_form():
    assert horizon_drop(10_000) == pytest.approx(10_000**2 / (2 * R_M))   # 28.78 m
    assert horizon_drop(10_000) == pytest.approx(28.78, abs=0.01)
    # d^2/2R is accurate to < 1 m out to 100 km
    assert abs(horizon_drop(100_000, method="exact") - horizon_drop(100_000)) < 1.0


def test_obstacle_angle_approx_matches_exact():
    d = np.array([1e3, 1e4, 5e4, 1e5])
    H = np.array([50.0, 500.0, 2000.0, 4000.0])
    a = obstacle_elevation_angle(d, H, 10.0, method="approx")
    e = obstacle_elevation_angle(d, H, 10.0, method="exact")
    assert np.max(np.abs(a - e)) < 0.01                                   # degrees


def test_spherical_dip():
    assert spherical_horizon_dip_deg(0.0) == 0.0
    assert spherical_horizon_dip_deg(1000.0) == pytest.approx(-np.degrees(np.sqrt(2e3 / R_M)), rel=1e-3)
    assert distance_to_horizon_m(2.0) == pytest.approx(np.sqrt(2 * 2.0 * R_M), rel=1e-6)  # ~2.6 km


def test_profile_interpolation_wraps_through_north():
    hp = HorizonProfile.from_array(np.r_[np.full(359, 0.0), 2.0])        # 2 deg at az 359
    assert hp.at(359.5) == pytest.approx(1.0)
    assert hp.at(-0.5) == pytest.approx(1.0)
    assert hp.at(720.0) == pytest.approx(0.0)


def test_from_terrain_mountain_and_curvature():
    n_az, d = 360, np.linspace(500, 100_000, 200)
    H = np.zeros((n_az, d.size))
    H[90, :] = 3000.0                                                     # wall due east
    hp = HorizonProfile.from_terrain(d, H, observer_height_m=0.0)
    assert hp.at(90) == pytest.approx(obstacle_elevation_angle(500, 3000.0), abs=1e-9)
    # flat datum: nearest sample is highest -> slightly below 0 because of the drop
    assert -0.01 < hp.at(0) < 0


@pytest.mark.parametrize("offset", np.linspace(-0.3, 0.3, 25))
def test_disk_fraction_flat_horizon_matches_closed_form(offset):
    hp = HorizonProfile.spherical()
    assert disk_visible_fraction(offset, 123.0, SD, hp) == pytest.approx(
        float(segment_fraction(offset, SD)), abs=2e-4)


def test_disk_fraction_limits_monotonic_and_limb_darkening():
    hp = HorizonProfile.spherical()
    els = np.linspace(-0.4, 0.4, 161)
    f = np.array([disk_visible_fraction(e, 0.0, SD, hp) for e in els])
    assert f[0] == 0.0 and f[-1] == 1.0 and np.all(np.diff(f) >= -1e-9)
    assert disk_visible_fraction(0.0, 0.0, SD, hp, 0.6) == pytest.approx(0.5, abs=1e-4)
    # A thin sliver of the dim limb gives less power than its area share.
    area = disk_visible_fraction(-0.2, 0.0, SD, hp)
    flux = disk_visible_fraction(-0.2, 0.0, SD, hp, 0.6)
    assert 0 < flux < area


def test_jagged_horizon_partially_covers_sun():
    # A notch: horizon at 0 deg except a 2 deg peak covering az [99.9, 100.1].
    az = np.arange(3600) / 10.0
    elev = np.where(np.abs(az - 100.0) <= 0.1, 2.0, 0.0)
    hp = HorizonProfile.from_array(elev)
    f = disk_visible_fraction(1.0, 100.0, SD, hp)           # Sun 1 deg up, peak blocks its middle
    assert 0.2 < f < 0.8


def test_resolve_horizon_and_illumination_flags():
    hp = resolve_horizon(-89.0, 0.0, custom_coordinates=True, observer_height_m=2.0)
    assert hp.source == "spherical_model" and hp.custom_coordinates
    il = illumination(-85.4, 30.0, "2026-11-14T12:00:00Z", custom_coordinates=True)
    assert il.solar_fraction == 1.0                        # sun_el 1.51 deg > 0.265 deg
    assert il.custom_coordinates and il.horizon_source == "spherical_model"
    # A 3 deg ridge toward the Sun puts the site in full shadow.
    il2 = illumination(-85.4, 30.0, "2026-11-14T12:00:00Z", horizon=np.full(360, 3.0))
    assert il2.solar_fraction == 0.0 and il2.horizon_source == "custom_profile"
