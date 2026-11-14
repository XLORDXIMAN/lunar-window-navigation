"""LunarWindow landing diorama — procedural Blender build + glTF 2.0 (Draco) export.

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        --python scripts/blender/build_diorama.py -- --out public/models/diorama

Produces
  lunar_terrain.glb  south-pole crater-rim patch, radius 500 m, metres, Z-up in Blender (Y-up in glTF):
                     multi-scale craters (bowl + raised rim + ejecta), fractal micro-roughness, a 6° sloped
                     landing zone in the centre, boulder field + ejecta rims; regolith PBR baked to 2K
                     (albedo, tangent-space normal, roughness) so it renders identically in three.js.
                     Marker empties: landing_zone, hero_boulder (camera anchor beside a boulder).
  lander.glb         lander with animation anchors: thruster_main, rcs_1..4, landing_leg_1..4 (pivots at the
                     hinges, Z-axis = swing), footpad_1..4; materials: gold Kapton foil (metallic 1, rough .25,
                     baked crinkle normal), white thermal blankets, matte carbon composite, emissive strobes.

Everything is generated here — no third-party models or textures.
"""
import math
import os
import random
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[ARGS.index("--out") + 1] if "--out" in ARGS else "public/models/diorama"
os.makedirs(OUT, exist_ok=True)
BAKE_DIR = os.path.join(OUT, "_bake")
os.makedirs(BAKE_DIR, exist_ok=True)
rng = np.random.default_rng(1969)
random.seed(1969)

# --------------------------------------------------------------------------- helpers
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system = "METRIC"
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = 1


def principled(mat):
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def new_mat(name, color, rough=0.5, metal=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = principled(m)
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if "Specular IOR Level" in p.inputs:
        p.inputs["Specular IOR Level"].default_value = spec
    return m


def hexrgb(h):
    h = h.lstrip("#")
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))  # sRGB → linear


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def empty(name, loc=(0, 0, 0), parent=None, size=0.3):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = size
    e.location = loc
    link(e)
    if parent:
        e.parent = parent
    return e


def export_glb(path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_materials="EXPORT", export_image_format="JPEG", export_jpeg_quality=86,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )
    print(f"[diorama] wrote {path}  {os.path.getsize(path) / 1e6:.2f} MB")


# --------------------------------------------------------------------------- terrain
def fbm2(x, y, octaves=6, base=0.004, seed=0):
    """Value-noise fBm on numpy arrays (deterministic)."""
    out = np.zeros_like(x)
    amp, freq = 1.0, base
    g = np.random.default_rng(seed).random((257, 257))
    g[256, :] = g[0, :]; g[:, 256] = g[:, 0]                 # periodic table: no seam where x·freq wraps at 0
    for _ in range(octaves):
        xs, ys = (x * freq) % 256, (y * freq) % 256          # freq in cycles per metre
        xi, yi = np.floor(xs).astype(int), np.floor(ys).astype(int)
        xf, yf = xs - xi, ys - yi
        u, v = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf)
        a, b = g[xi, yi], g[xi + 1, yi]
        c, d = g[xi, yi + 1], g[xi + 1, yi + 1]
        out += amp * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v - 0.5)
        amp *= 0.5
        freq *= 2.03
    return out


def crater_field(x, y, n, rmin, rmax, depth_ratio=0.2, keep_out=0.0):
    h = np.zeros_like(x)
    for _ in range(n):
        cx, cy = rng.uniform(-520, 520, 2)
        r = rmin * (rmax / rmin) ** rng.random() ** 1.6   # many small, few big
        if math.hypot(cx, cy) < keep_out + r:
            continue
        d = np.hypot(x - cx, y - cy) / r
        bowl = np.where(d < 1, -(1 - d * d) * depth_ratio * r, 0)
        rim = 0.045 * r * np.exp(-((d - 1) ** 2) * 16) * (d > 0.7)
        ejecta = 0.02 * r * np.exp(-(d - 1) * 2.2) * (d > 1) * (1 + 0.6 * np.sin(np.arctan2(y - cy, x - cx) * 9))
        h += bowl + rim + np.clip(ejecta, 0, None)
    return h


def build_terrain():
    R, N = 500.0, 360
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=N, y_subdivisions=N, size=2 * R)
    t = bpy.context.active_object
    t.name = "lunar_terrain"
    me = t.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    x, y = co[:, 0], co[:, 1]
    r = np.hypot(x, y)

    # crater rim of a large polar crater sweeping across the north edge (we sit on its outer slope)
    big = 26.0 * np.exp(-((np.hypot(x, y - 980) - 700) / 140) ** 2) - 18.0 * (np.hypot(x, y - 980) < 640)
    h = big
    h += crater_field(x, y, 14, 40, 140, 0.18, keep_out=70)
    h += crater_field(x, y, 140, 8, 40, 0.18, keep_out=45)
    h += fbm2(x, y, 6, 0.004, 1) * 14.0          # rolling relief (≈250 m features)
    h += fbm2(x, y, 4, 0.12, 2) * 0.5             # micro-roughness (Musgrave-like); finer detail lives in the normal tile
    # 6° sloped landing zone in the centre, blended into the surroundings
    slope = math.tan(math.radians(6.0))
    zone = np.clip(1 - (r - 35) / 45, 0, 1) ** 2
    plane = (x * 0.6 + y * 0.8) * slope
    h = h * (1 - zone) + (plane + fbm2(x, y, 3, 0.08, 3) * 0.06) * zone
    h -= h[np.argmin(r)]                          # landing point at z = 0
    co[:, 2] = h
    me.vertices.foreach_set("co", co.ravel())
    me.update()

    # circular patch
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().xy.length > R], context="FACES")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True

    # regolith material (procedural) → baked
    mat = bpy.data.materials.new("regolith")
    mat.use_nodes = True
    nt = mat.node_tree
    N_, L_ = nt.nodes, nt.links
    p = principled(mat)
    p.inputs["Roughness"].default_value = 0.92
    if "Specular IOR Level" in p.inputs:
        p.inputs["Specular IOR Level"].default_value = 0.0
    tc = N_.new("ShaderNodeTexCoord")
    n_big = N_.new("ShaderNodeTexNoise"); n_big.inputs["Scale"].default_value = 0.008; n_big.inputs["Detail"].default_value = 8
    n_fine = N_.new("ShaderNodeTexNoise"); n_fine.inputs["Scale"].default_value = 3.0; n_fine.inputs["Detail"].default_value = 12
    vor = N_.new("ShaderNodeTexVoronoi"); vor.inputs["Scale"].default_value = 0.6
    for n in (n_big, n_fine, vor):
        L_.new(tc.outputs["Object"], n.inputs["Vector"])
    ramp = N_.new("ShaderNodeValToRGB")
    e0, e1 = ramp.color_ramp.elements
    e0.color = (*hexrgb("#1c1c1e"), 1)
    e1.color = (*hexrgb("#4a4642"), 1)
    mix = N_.new("ShaderNodeMath"); mix.operation = "MULTIPLY_ADD"
    L_.new(n_big.outputs["Fac"], mix.inputs[0]); mix.inputs[1].default_value = 0.7
    L_.new(n_fine.outputs["Fac"], mix.inputs[2])
    mix2 = N_.new("ShaderNodeMath"); mix2.operation = "MULTIPLY"; mix2.inputs[1].default_value = 0.6
    L_.new(mix.outputs[0], mix2.inputs[0])
    L_.new(mix2.outputs[0], ramp.inputs["Fac"])
    L_.new(ramp.outputs["Color"], p.inputs["Base Color"])
    bump = N_.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.6; bump.inputs["Distance"].default_value = 0.02
    gr = N_.new("ShaderNodeMath"); gr.operation = "ADD"
    L_.new(n_fine.outputs["Fac"], gr.inputs[0]); L_.new(vor.outputs["Distance"], gr.inputs[1])
    L_.new(gr.outputs[0], bump.inputs["Height"])
    L_.new(bump.outputs["Normal"], p.inputs["Normal"])
    me.materials.append(mat)
    return t, mat


def build_boulders():
    rocks = bpy.data.meshes.new("boulders")
    bm = bmesh.new()
    terrain = bpy.data.objects["lunar_terrain"]
    dg = bpy.context.evaluated_depsgraph_get()
    placed = []
    for i in range(260):
        ang = rng.uniform(0, 2 * math.pi)
        rad = 60 + (rng.random() ** 0.7) * 420
        x, y = math.cos(ang) * rad, math.sin(ang) * rad
        hit, loc, *_ = terrain.ray_cast(Vector((x, y, 300)), Vector((0, 0, -1)))
        if not hit:
            continue
        size = 0.25 + rng.random() ** 3 * (4.0 if rad > 120 else 1.6)
        geom = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=size)
        verts = geom["verts"]
        for v in verts:
            v.co.x *= 1 + rng.uniform(-0.35, 0.35); v.co.y *= 1 + rng.uniform(-0.35, 0.35); v.co.z *= 0.55 + rng.uniform(-0.15, 0.15)
            v.co += Vector((x, y, loc.z + size * 0.25))
        placed.append((x, y, loc.z, size))
    # hero boulder for the low-angle touchdown shot, 14 m from the pad
    hit, loc, *_ = terrain.ray_cast(Vector((11, -9, 300)), Vector((0, 0, -1)))
    g = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.9)
    for v in g["verts"]:
        v.co.x *= 1.25; v.co.z *= 0.7
        v.co += Vector((11, -9, loc.z + 0.6))
    bm.to_mesh(rocks)
    bm.free()
    o = link(bpy.data.objects.new("boulders", rocks))
    for p in rocks.polygons:
        p.use_smooth = True
    m = new_mat("boulder_rock", hexrgb("#3b3a39"), rough=0.88, spec=0.05)
    rocks.materials.append(m)
    empty("hero_boulder", (11, -9, loc.z + 1.6))
    empty("landing_zone", (0, 0, 0))
    return o


def detail_tile(n=2048, metres=8.0, seed=7):
    """Seamless regolith detail: height = 1/f^beta noise (FFT → tileable) + periodic dimple craters + pebbles.
    Returns a tangent-space normal map (RGB 0..1) as numpy (n, n, 3)."""
    g = np.random.default_rng(seed)
    fx = np.fft.fftfreq(n)[:, None]; fy = np.fft.fftfreq(n)[None, :]
    f = np.sqrt(fx * fx + fy * fy); f[0, 0] = 1
    spec = (g.normal(size=(n, n)) + 1j * g.normal(size=(n, n))) / f ** 1.8
    spec[0, 0] = 0
    h = np.real(np.fft.ifft2(spec)); h = (h - h.mean()) / h.std()
    px = metres / n                                     # metres per pixel
    yy, xx = np.mgrid[0:n, 0:n] * px
    for _ in range(140):                                 # small craters 4–40 cm, wrapped
        cx, cy = g.uniform(0, metres, 2); r = 0.04 + g.random() ** 2 * 0.36
        dx = (xx - cx + metres / 2) % metres - metres / 2; dy = (yy - cy + metres / 2) % metres - metres / 2
        d = np.hypot(dx, dy) / r
        h += np.where(d < 1, -(1 - d * d) * 2.2, 0.35 * np.exp(-((d - 1) ** 2) * 12))
    for _ in range(420):                                 # pebbles 1–6 cm
        cx, cy = g.uniform(0, metres, 2); r = 0.01 + g.random() ** 3 * 0.05
        dx = (xx - cx + metres / 2) % metres - metres / 2; dy = (yy - cy + metres / 2) % metres - metres / 2
        d = np.hypot(dx, dy) / r
        h += np.where(d < 1, np.sqrt(np.clip(1 - d * d, 0, 1)) * 1.6, 0)
    dx_ = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy_ = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    S = 0.55 / np.percentile(np.hypot(dx_, dy_), 95)      # normalise: 95th-percentile slope ≈ 0.55
    gx, gy = dx_ * S, dy_ * S
    nz = 1 / np.sqrt(1 + gx * gx + gy * gy)
    return np.dstack([(-gx * nz) * 0.5 + 0.5, (-gy * nz) * 0.5 + 0.5, nz * 0.5 + 0.5])


def bake_terrain(t, mat):
    """Bake the macro albedo (2K over the whole patch) and attach a seamless 2K detail normal tile
    (8 m repeat, exported via KHR_texture_transform). Roughness 0.92, no specular."""
    s = bpy.context.scene
    bpy.ops.object.select_all(action="DESELECT")
    t.select_set(True)
    bpy.context.view_layer.objects.active = t
    nt = mat.node_tree
    alb = bpy.data.images.new("regolith_albedo", 2048, 2048, alpha=False)
    node = nt.nodes.new("ShaderNodeTexImage"); node.image = alb; nt.nodes.active = node
    s.render.bake.use_pass_direct = False; s.render.bake.use_pass_indirect = False; s.render.bake.use_pass_color = True
    bpy.ops.object.bake(type="DIFFUSE")
    alb.filepath_raw = os.path.join(BAKE_DIR, "regolith_albedo.png"); alb.file_format = "PNG"; alb.save()
    print("[diorama] baked albedo")
    nrm = detail_tile()
    img = bpy.data.images.new("regolith_detail_normal", nrm.shape[1], nrm.shape[0], alpha=True)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(np.dstack([nrm, np.ones(nrm.shape[:2])]).astype(np.float32)[::-1].ravel())
    img.filepath_raw = os.path.join(BAKE_DIR, "regolith_detail_normal.png"); img.file_format = "PNG"; img.save()
    print("[diorama] generated seamless detail normal")
    for n in list(nt.nodes):
        if n.type not in ("BSDF_PRINCIPLED", "OUTPUT_MATERIAL") and n.name != node.name:
            nt.nodes.remove(n)
    p = principled(mat)
    p.inputs["Roughness"].default_value = 0.92
    nt.links.new(node.outputs["Color"], p.inputs["Base Color"])
    uv = nt.nodes.new("ShaderNodeUVMap")
    mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (125, 125, 1)   # 1000 m / 8 m
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
    nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = 1.0
    nt.links.new(uv.outputs["UV"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], p.inputs["Normal"])


# --------------------------------------------------------------------------- lander
def build_lander():
    kapton = new_mat("kapton_gold", (0.83, 0.55, 0.17), rough=0.25, metal=1.0)
    blanket = new_mat("thermal_blanket_white", (0.86, 0.86, 0.84), rough=0.62)
    carbon = new_mat("carbon_composite", (0.03, 0.03, 0.035), rough=0.55, spec=0.3)
    alu = new_mat("aluminium", (0.78, 0.79, 0.8), rough=0.35, metal=1.0)
    nozzle_m = new_mat("nozzle_niobium", (0.2, 0.18, 0.17), rough=0.45, metal=1.0)
    strobes = {}
    for nm, col in (("strobe_red", (1, 0.05, 0.05)), ("strobe_green", (0.05, 1, 0.2)), ("strobe_white", (1, 1, 1))):
        m = new_mat(nm, col, rough=0.3)
        p = principled(m)
        p.inputs["Emission Color"].default_value = (*col, 1)
        p.inputs["Emission Strength"].default_value = 12.0
        strobes[nm] = m

    root = empty("lander", (0, 0, 0), size=1)
    parts = []

    def add(obj, mat, name, parent=root):
        obj.name = name
        obj.data.materials.clear(); obj.data.materials.append(mat)
        obj.parent = parent
        parts.append(obj)
        return obj

    LEG_H = 1.25  # footpads at z = 0, body bottom at 1.25 m
    # descent stage: octagonal, gold Kapton
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=1.55, depth=1.5, location=(0, 0, LEG_H + 0.75))
    ds = add(bpy.context.active_object, kapton, "descent_stage")
    bpy.ops.object.shade_flat()
    # crinkle: displace a subdivided copy slightly so the baked normal has folds
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.uv.smart_project(angle_limit=1.2); bpy.ops.object.mode_set(mode="OBJECT")
    # deck + ascent stage (white blankets), carbon frame
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=1.65, depth=0.1, location=(0, 0, LEG_H + 1.55))
    add(bpy.context.active_object, carbon, "deck")
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, LEG_H + 2.35))
    a = add(bpy.context.active_object, blanket, "ascent_stage"); a.scale = (2.0, 1.7, 1.5)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(1.0, 0, LEG_H + 2.5))
    w = add(bpy.context.active_object, carbon, "window_panel"); w.scale = (0.05, 0.8, 0.5)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.65, depth=0.9, location=(0, 0, LEG_H + 3.45))
    add(bpy.context.active_object, blanket, "docking_tunnel")
    # antenna dish
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.45, location=(-0.9, 0.8, LEG_H + 3.4))
    d = add(bpy.context.active_object, alu, "hga_dish"); d.scale = (1, 1, 0.25); d.rotation_euler = (0.6, 0.3, 0)
    # main engine bell + thruster_main anchor
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=0.62, radius2=0.28, depth=0.7, location=(0, 0, LEG_H - 0.05))
    add(bpy.context.active_object, nozzle_m, "engine_bell")
    empty("thruster_main", (0, 0, LEG_H - 0.42), parent=root)
    # four legs: hinge pivots at the deck rim; the strut swings about the pivot's local Z
    for i in range(4):
        ang = math.radians(45 + 90 * i)
        cx, cy = math.cos(ang), math.sin(ang)
        hinge = empty(f"landing_leg_{i + 1}", (cx * 1.45, cy * 1.45, LEG_H + 1.2), parent=root, size=0.2)
        hinge.rotation_euler = (0, 0, ang)                 # local +X points outward
        foot_local = Vector((1.25, 0, -(LEG_H + 1.14)))    # down-and-out to the pad
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.07, depth=foot_local.length)
        s_ = bpy.context.active_object
        s_.location = foot_local / 2
        s_.rotation_mode = "QUATERNION"
        s_.rotation_quaternion = foot_local.normalized().to_track_quat("Z", "Y")
        add(s_, alu, f"leg_strut_{i + 1}", parent=hinge)
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.045, depth=1.5)
        b = bpy.context.active_object
        b.location = Vector((0.45, 0, -0.75)); b.rotation_euler = (0, 0.6, 0)
        add(b, alu, f"leg_brace_{i + 1}", parent=hinge)
        pad = empty(f"footpad_{i + 1}", foot_local, parent=hinge, size=0.15)
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.36, depth=0.09, location=(0, 0, 0.04))
        add(bpy.context.active_object, alu, f"footpad_mesh_{i + 1}", parent=pad)
        # RCS quad + strobe on each side
        ra = math.radians(90 * i)
        rcs = empty(f"rcs_{i + 1}", (math.cos(ra) * 1.6, math.sin(ra) * 1.6, LEG_H + 1.45), parent=root, size=0.12)
        rcs.rotation_euler = (0, 0, ra)
        bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.08, radius2=0.03, depth=0.16, location=(0.06, 0, 0), rotation=(0, math.pi / 2, 0))
        add(bpy.context.active_object, nozzle_m, f"rcs_nozzle_{i + 1}", parent=rcs)
        col = "strobe_red" if i == 1 else "strobe_green" if i == 3 else "strobe_white"
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.07, location=(math.cos(ra) * 1.7, math.sin(ra) * 1.7, LEG_H + 1.62))
        add(bpy.context.active_object, strobes[col], f"strobe_{i + 1}")

    # bake a crinkled-foil normal map onto the descent stage (glTF cannot carry procedural bump)
    bpy.ops.object.select_all(action="DESELECT")
    ds.select_set(True); bpy.context.view_layer.objects.active = ds
    nt = kapton.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    vn = nt.nodes.new("ShaderNodeTexVoronoi"); vn.inputs["Scale"].default_value = 9.0
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 14.0; nz.inputs["Detail"].default_value = 6
    nt.links.new(tc.outputs["Object"], vn.inputs["Vector"]); nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    add_ = nt.nodes.new("ShaderNodeMath"); add_.operation = "ADD"
    nt.links.new(vn.outputs["Distance"], add_.inputs[0]); nt.links.new(nz.outputs["Fac"], add_.inputs[1])
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.5; bump.inputs["Distance"].default_value = 0.02
    nt.links.new(add_.outputs[0], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], principled(kapton).inputs["Normal"])
    img = bpy.data.images.new("kapton_normal", 1024, 1024, alpha=False); img.colorspace_settings.name = "Non-Color"
    node = nt.nodes.new("ShaderNodeTexImage"); node.image = img; nt.nodes.active = node
    bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT")
    img.filepath_raw = os.path.join(BAKE_DIR, "kapton_normal.png"); img.file_format = "PNG"; img.save()
    for n in (tc, vn, nz, add_, bump):
        nt.nodes.remove(n)
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(node.outputs["Color"], nmap.inputs["Color"]); nt.links.new(nmap.outputs["Normal"], principled(kapton).inputs["Normal"])
    print("[diorama] baked kapton crinkle normal")
    return root, parts


# --------------------------------------------------------------------------- main
reset()
terrain, regolith = build_terrain()
rocks = build_boulders()
bake_terrain(terrain, regolith)
export_glb(os.path.join(OUT, "lunar_terrain.glb"), [terrain, rocks, bpy.data.objects["hero_boulder"], bpy.data.objects["landing_zone"]])

reset()
root, parts = build_lander()
export_glb(os.path.join(OUT, "lander.glb"), [o for o in bpy.data.objects])
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "_bake", "lander.blend"))
print("[diorama] done")
