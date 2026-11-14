"""LunarWindow — landing-site ground patch for the 3D Moon surface view and descent (Blender, headless).

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        --python scripts/blender/build_site_patch.py -- --out public/models

Produces site_patch.glb (Draco, metres, glTF Y-up), no materials — the web app shades it with the same
LROC-albedo + procedural regolith shader as the surrounding 120 km cap, so the seam is invisible:
  site_ground  disc of radius 450 m: mare-like relief with real crater bowls / raised rims / ejecta,
               rolling fBm, a level 30 m landing zone at the origin, height tapering to 0 at the rim
               (so it meets the smooth cap exactly).
  site_rocks   ~1700 angular blocks: ejecta blocks clustered on fresh crater rims + a scattered
               field + fine cobbles near the landing point (the eye-level detail).
Everything here is generated — no third-party data.
"""
import math
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[ARGS.index("--out") + 1] if "--out" in ARGS else "public/models"
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1971)

R, N = 450.0, 520           # radius (m), grid subdivisions (~1.7 m spacing)
TAPER0, TAPER1 = 300.0, 440.0
ZONE = 30.0


def fbm2(x, y, octaves=6, base=0.004, seed=0):
    out = np.zeros_like(x)
    amp, freq = 1.0, base
    g = np.random.default_rng(seed).random((257, 257))
    g[256, :] = g[0, :]; g[:, 256] = g[:, 0]                 # periodic table: no seam where x·freq wraps at 0
    for _ in range(octaves):
        xs, ys = (x * freq) % 256, (y * freq) % 256
        xi, yi = np.floor(xs).astype(int), np.floor(ys).astype(int)
        xf, yf = xs - xi, ys - yi
        u, v = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf)
        a, b = g[xi, yi], g[xi + 1, yi]
        c, d = g[xi, yi + 1], g[xi + 1, yi + 1]
        out += amp * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v - 0.5)
        amp *= 0.5
        freq *= 2.03
    return out


CRATERS = []


def crater_field(x, y, n, rmin, rmax, depth, keep_out, fresh_p=0.3):
    h = np.zeros_like(x)
    for _ in range(n):
        cx, cy = rng.uniform(-R, R, 2)
        r = rmin * (rmax / rmin) ** (rng.random() ** 1.8)
        if math.hypot(cx, cy) < keep_out + r or math.hypot(cx, cy) > TAPER1:
            continue
        fresh = rng.random() < fresh_p
        k = depth * (1.0 if fresh else rng.uniform(0.35, 0.7))     # degraded craters are shallower
        d = np.hypot(x - cx, y - cy) / r
        bowl = np.where(d < 1, -(1 - d ** 2.2) * k * r, 0)
        rim = (0.06 if fresh else 0.025) * r * np.exp(-((d - 1) ** 2) * (18 if fresh else 7))
        ang = np.arctan2(y - cy, x - cx)
        ejecta = (0.025 if fresh else 0.008) * r * np.exp(-(d - 1) * 2.4) * (d > 1) * (1 + 0.7 * np.sin(ang * 11 + cx))
        h += bowl + rim + np.clip(ejecta, 0, None)
        CRATERS.append((cx, cy, r, fresh))
    return h


def build_ground():
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=N, y_subdivisions=N, size=2 * R)
    t = bpy.context.active_object
    t.name = "site_ground"
    me = t.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    x, y = co[:, 0], co[:, 1]
    r = np.hypot(x, y)
    h = fbm2(x, y, 6, 0.0035, 1) * 9.0            # gentle mare undulation
    h += fbm2(x, y, 2, 0.03, 2) * 0.35            # long, low swells only — anything finer than ~4 vertex
                                                  # spacings reads as 'cloth folds' under a grazing Sun
    h += crater_field(x, y, 7, 45, 95, 0.22, 55, 0.5)
    h += crater_field(x, y, 90, 8, 40, 0.24, 34, 0.35)
    h += crater_field(x, y, 200, 5.0, 10, 0.2, 18, 0.3)   # smaller craters are drawn per-pixel by the shader
    zone = np.clip(1 - (r - ZONE) / 30, 0, 1) ** 2
    h = h * (1 - zone) + fbm2(x, y, 3, 0.15, 3) * 0.05 * zone
    h -= h[np.argmin(r)]
    taper = np.clip((TAPER1 - r) / (TAPER1 - TAPER0), 0, 1)
    taper = taper * taper * (3 - 2 * taper)
    co[:, 2] = h * taper
    me.vertices.foreach_set("co", co.ravel())
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().xy.length > R], context="FACES")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return t


def rock(bm, x, y, z, size, flat=0.6):
    g = bmesh.ops.create_icosphere(bm, subdivisions=3 if size > 1.0 else 2, radius=size)
    ph = rng.uniform(0, 100, 3)
    yaw = rng.uniform(0, 2 * math.pi)
    c, s = math.cos(yaw), math.sin(yaw)
    for v in g["verts"]:
        v.co.x *= 1 + rng.uniform(-0.3, 0.3)
        v.co.y *= 1 + rng.uniform(-0.3, 0.3)
        v.co.z *= flat + rng.uniform(-0.12, 0.12)
        # planar facets: snap some vertices onto cutting planes → angular, fractured blocks
        # low-frequency lumps + fracture planes → weathered block, not a crystal
        d = v.co.normalized()
        lump = 0.22 * math.sin(d.x * 3.1 + ph[0]) * math.sin(d.y * 2.7 + ph[1]) + 0.12 * math.sin(d.z * 5.3 + ph[2])
        v.co *= 1 + lump
        if v.co.z > size * 0.35 and d.z > 0.55:
            v.co.z = size * 0.35 + (v.co.z - size * 0.35) * 0.35
        vx, vy = v.co.x * c - v.co.y * s, v.co.x * s + v.co.y * c
        v.co = Vector((vx + x, vy + y, v.co.z + z))


def build_rocks(ground):
    bm = bmesh.new()
    n = 0

    def place(x, y, size, flat=0.6):
        nonlocal n
        rr = math.hypot(x, y)
        if rr > TAPER0 + 60 or rr < 7 + size:
            return
        hit, loc, *_ = ground.ray_cast(Vector((x, y, 400)), Vector((0, 0, -1)))
        if not hit:
            return
        rock(bm, x, y, loc.z - size * 0.22, size, flat)            # seated: partly buried in regolith
        n += 1

    # ejecta blocks on the rims of fresh craters
    for cx, cy, r, fresh in CRATERS:
        if not fresh or r < 6:
            continue
        for _ in range(int(min(60, r * 1.3))):
            a = rng.uniform(0, 2 * math.pi)
            d = r * (0.85 + rng.exponential(0.35))
            place(cx + math.cos(a) * d, cy + math.sin(a) * d, 0.15 + rng.random() ** 3 * min(2.2, r * 0.05), 0.75)
    # scattered field
    for _ in range(500):
        a = rng.uniform(0, 2 * math.pi)
        d = 12 + rng.random() ** 0.8 * 340
        place(math.cos(a) * d, math.sin(a) * d, 0.12 + rng.random() ** 4 * 1.8, 0.72)
    # fine cobbles around the landing point (camera distance)
    for _ in range(700):
        a = rng.uniform(0, 2 * math.pi)
        d = 8 + rng.random() * 90
        place(math.cos(a) * d, math.sin(a) * d, 0.05 + rng.random() ** 3 * 0.3, 0.5)
    me = bpy.data.meshes.new("site_rocks")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("site_rocks", me)
    bpy.context.scene.collection.objects.link(o)
    for p in me.polygons:
        p.use_smooth = True
    print(f"[patch] rocks {n}, verts {len(me.vertices)}")
    return o


bpy.ops.wm.read_factory_settings(use_empty=True)
ground = build_ground()
rocks = build_rocks(ground)
bpy.ops.object.select_all(action="DESELECT")
ground.select_set(True)
rocks.select_set(True)
path = os.path.join(OUT, "site_patch.glb")
bpy.ops.export_scene.gltf(
    filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
    export_materials="NONE", export_normals=True, export_texcoords=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
    export_draco_position_quantization=16, export_draco_normal_quantization=10,
)
print(f"[patch] wrote {path} {os.path.getsize(path) / 1e6:.2f} MB, craters {len(CRATERS)}")


# --------------------------------------------------------------------------- mid-field (4 km)
# Real crater geometry for the approach view: power-law population 8–350 m (overlapping, fresh and
# degraded), ~10 m grid. The inner 440 m sinks under site_patch; the rim tapers to 0 to meet the cap.
def build_midfield():
    RM, NM = 4000.0, 520
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=NM, y_subdivisions=NM, size=2 * RM)
    t = bpy.context.active_object
    t.name = "site_midfield"
    me = t.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    x, y = co[:, 0], co[:, 1]
    r = np.hypot(x, y)
    h = fbm2(x, y, 5, 0.0006, 11) * 40.0 + fbm2(x, y, 3, 0.004, 12) * 4.0
    g = np.random.default_rng(77)
    for _ in range(1400):
        cx, cy = g.uniform(-RM, RM, 2)
        rad = 8.0 * (350.0 / 8.0) ** (g.random() ** 2.6)      # power law: many small, few large
        if math.hypot(cx, cy) > RM * 0.97:
            continue
        sel = (np.abs(x - cx) < rad * 3) & (np.abs(y - cy) < rad * 3)
        if not sel.any():
            continue
        fresh = g.random()
        k = 0.12 + 0.12 * fresh                                # depth/radius: degraded 0.12 … fresh 0.24
        d = np.hypot(x[sel] - cx, y[sel] - cy) / rad
        bowl = np.where(d < 1, -(1 - d ** 2.2) * k * rad, 0)
        rim = (0.02 + 0.045 * fresh) * rad * np.exp(-((d - 1) ** 2) * (6 + 14 * fresh))
        ej = 0.02 * fresh * rad * np.exp(-(d - 1) * 2.5) * (d > 1)
        h[sel] += bowl + rim + ej
    sink = np.clip((446 - r) / 16, 0, 1)                       # hide under the 450 m Blender patch
    taper = np.clip((3950 - r) / 900, 0, 1); taper = taper * taper * (3 - 2 * taper)
    inner = np.clip((r - 450) / 300, 0, 1); inner = inner * inner * (3 - 2 * inner)   # meet the patch rim at 0
    co[:, 2] = h * taper * inner - 35.0 * sink
    me.vertices.foreach_set("co", co.ravel())
    me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().xy.length > RM], context="FACES")
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    bpy.ops.object.select_all(action="DESELECT")
    t.select_set(True)
    path = os.path.join(OUT, "site_midfield.glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
        export_materials="NONE", export_normals=False, export_texcoords=False,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
        export_draco_position_quantization=16,
    )
    print(f"[patch] wrote {path} {os.path.getsize(path) / 1e6:.2f} MB")


build_midfield()
