"""LunarWindow — detailed Apollo Lunar Module built procedurally in Blender (after public NASA drawings).

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        --python scripts/blender/build_lm.py -- --out public/models/apollo_lm.glb [--preview out.png]

Metres, feet at z = 0, ~7 m tall, footpad span ~9.4 m. Clean flat panels with bevelled edges (no decimation
facets), named anchors: Nozzle_Main / thruster_main (engine exit, exhaust along −Z), rcs_1..4.
Materials are PBR (aluminium, gold / black Kapton, silver Mylar, niobium bell); the web app adds the
crinkled-foil normal map at runtime (src/scene/landerLook.js).
"""
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[ARGS.index("--out") + 1] if "--out" in ARGS else "public/models/apollo_lm.glb"
PREVIEW = ARGS[ARGS.index("--preview") + 1] if "--preview" in ARGS else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
ROOT = bpy.data.objects.new("apollo_lm", None)
scene.collection.objects.link(ROOT)


def mat(name, col, metal=0.0, rough=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value = (*col, 1)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    return m


M = {
    "al": mat("ascent_aluminium", (0.4, 0.41, 0.43), 0.65, 0.48),
    "white": mat("thermal_white", (0.78, 0.78, 0.76), 0.05, 0.62),
    "black": mat("black_kapton", (0.025, 0.025, 0.03), 0.25, 0.35),
    "gold": mat("gold_kapton", (0.78, 0.5, 0.12), 1.0, 0.3),
    "silver": mat("silver_mylar", (0.8, 0.8, 0.78), 0.9, 0.28),
    "bell": mat("niobium_bell", (0.2, 0.18, 0.17), 0.85, 0.4),
    "glass": mat("window", (0.01, 0.012, 0.02), 0.0, 0.05),
    "dark": mat("structure_dark", (0.08, 0.08, 0.085), 0.4, 0.5),
}


def finish(o, material, bevel=0.0, segs=3, smooth=True):
    o.data.materials.clear()
    o.data.materials.append(M[material])
    if bevel > 0:
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = segs
        b.limit_method = "ANGLE"
        b.angle_limit = math.radians(30)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    o.parent = ROOT
    return o


def box(name, size, loc, material, bevel=0.03, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, material, bevel)


def cyl(name, r, depth, loc, material, rot=(0, 0, 0), verts=32, bevel=0.0, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=depth, vertices=verts, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    return finish(o, material, bevel)


def rod(name, a, b, r, material, verts=12):
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, vertices=verts, location=(a + b) / 2)
    o = bpy.context.active_object
    o.name = name
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return finish(o, material)


def sphere(name, r, loc, material, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=32, ring_count=16)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, material)


def empty(name, loc, parent=ROOT):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    scene.collection.objects.link(e)
    e.parent = parent
    return e


def prism(name, pts2d, z0, z1, material, bevel=0.03):
    """Extruded polygon (x, y) between z0 and z1."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in pts2d]
    hi = [bm.verts.new((x, y, z1)) for x, y in pts2d]
    bm.faces.new(lo[::-1])
    bm.faces.new(hi)
    n = len(pts2d)
    for i in range(n):
        bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    return finish(o, material, bevel)


def loft(name, lo2d, z0, hi2d, z1, material, bevel=0.03):
    """Tapered prism: polygon lo2d at z0 → polygon hi2d at z1 (same vertex count)."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in lo2d]
    hi = [bm.verts.new((x, y, z1)) for x, y in hi2d]
    bm.faces.new(lo[::-1]); bm.faces.new(hi)
    n = len(lo2d)
    for i in range(n):
        bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o)
    return finish(o, material, bevel)


def octagon(w, cut):
    h = w / 2
    return [(h, -h + cut), (h, h - cut), (h - cut, h), (-h + cut, h), (-h, h - cut), (-h, -h + cut), (-h + cut, -h), (h - cut, -h)]


# ------------------------------------------------------------------ descent stage
DZ0, DZ1 = 1.2, 2.85
prism("descent_body", octagon(4.2, 1.05), DZ0, DZ1, "gold", 0.05)
# quad bays: inset black / silver panels on the 4 oblique faces and side faces
for k in range(4):
    a = math.radians(45 + 90 * k)
    c, s = math.cos(a), math.sin(a)
    r = 1.83
    box(f"bay_panel_{k}", (0.05, 1.25, 1.2), (c * r, s * r, (DZ0 + DZ1) / 2), "black" if k % 2 else "silver", 0.02, rot=(0, 0, a))
for k in range(4):
    a = math.radians(90 * k)
    c, s = math.cos(a), math.sin(a)
    # thermal blanket quilting strips (raised seams catch the low Sun)
    for j in (-0.6, 0, 0.6):
        box(f"seam_{k}_{j}", (0.03, 0.04, 1.5), (c * 2.115 - s * j, s * 2.115 + c * j, (DZ0 + DZ1) / 2), "gold", 0.01, rot=(0, 0, a))
prism("heat_shield", octagon(4.0, 1.0), DZ0 - 0.08, DZ0, "black", 0.02)
prism("deck", octagon(4.05, 1.02), DZ1, DZ1 + 0.06, "silver", 0.02)
# descent engine: gimbal housing + bell
cyl("engine_housing", 0.48, 0.25, (0, 0, DZ0 - 0.2), "dark")
bell = cyl("engine_bell", 0.75, 0.75, (0, 0, DZ0 - 0.62), "bell", r2=0.36, verts=48)
bell.modifiers.new("solid", "SOLIDIFY").thickness = 0.02
EXIT_Z = DZ0 - 1.0
empty("Nozzle_Main", (0, 0, EXIT_Z))
empty("thruster_main", (0, 0, EXIT_Z))

# landing gear: 4 legs on the side faces (+X front with ladder)
for k in range(4):
    a = math.radians(90 * k)
    c, s = math.cos(a), math.sin(a)
    P = lambda rr, t, z: (c * rr - s * t, s * rr + c * t, z)
    up = P(2.15, 0, 2.6)
    foot = P(4.15, 0, 0.32)
    rod(f"leg_primary_{k}", up, foot, 0.08, "gold", 16)
    rod(f"leg_inner_{k}", P(4.0, 0, 0.7), foot, 0.075, "silver", 16)          # shock-absorber stroke
    for t in (-0.95, 0.95):
        rod(f"leg_secondary_{k}_{t}", P(2.1, t, 1.35), P(3.55, 0, 0.95), 0.038, "gold")
        rod(f"leg_deploy_{k}_{t}", P(2.1, t, 2.5), P(2.95, 0, 1.75), 0.035, "silver")
    rod(f"leg_brace_{k}", P(2.1, 0, 1.35), P(3.55, 0, 0.95), 0.045, "dark")
    # footpad: shallow dish + rim
    fp = cyl(f"footpad_{k}", 0.47, 0.16, P(4.2, 0, 0.1), "silver", r2=0.33, verts=40, bevel=0.02)
    fp.rotation_euler = (math.pi, 0, 0)
    if k != 0:  # contact probes on 3 legs (none on the ladder leg, like the real LM)
        rod(f"probe_{k}", P(4.2, 0, 0.05), P(4.35, 0, -1.6), 0.012, "silver", 8)
        sphere(f"probe_tip_{k}", 0.025, P(4.35, 0, -1.6), "silver")

# porch + ladder on the +X leg
box("porch", (0.9, 0.95, 0.04), (2.45, 0, 2.62), "silver", 0.01)
for t in (-0.32, 0.32):
    rod(f"ladder_rail_{t}", (2.2, t, 2.55), (3.95, t, 0.55), 0.025, "gold", 10)
for i in range(9):
    f = (i + 0.5) / 9
    x, z = 2.2 + (3.95 - 2.2) * f, 2.55 + (0.55 - 2.55) * f
    rod(f"rung_{i}", (x, -0.32, z), (x, 0.32, z), 0.016, "gold", 8)

# ------------------------------------------------------------------ ascent stage
AZ = DZ1 + 0.06
# interstage black blanket band
prism("ascent_base", [(1.2, -1.3), (1.2, 1.3), (-1.4, 1.3), (-1.4, -1.3)], AZ, AZ + 0.35, "black", 0.04)
# crew compartment: faceted front cabin (angular like the real LM), aft equipment bay
cab = [(1.35, -0.95), (1.35, 0.95), (0.95, 1.25), (-0.3, 1.25), (-0.3, -1.25), (0.95, -1.25)]
prism("cabin_lower", cab, AZ + 0.35, AZ + 1.55, "al", 0.05)
cab_top = [(1.05, -0.75), (1.05, 0.75), (0.75, 1.05), (-0.3, 1.05), (-0.3, -1.05), (0.75, -1.05)]
# upper cabin leans back with slanted window facets, like the real LM front
loft("cabin_upper", cab_top, AZ + 1.55, [(0.55, -0.6), (0.55, 0.6), (0.35, 0.85), (-0.3, 0.85), (-0.3, -0.85), (0.35, -0.85)], AZ + 2.45, "al", 0.05)
# chamfer ring between them (black kapton)
prism("cabin_chamfer", [(1.38, -0.97), (1.38, 0.97), (0.97, 1.28), (-0.3, 1.28), (-0.3, -1.28), (0.97, -1.28)], AZ + 1.5, AZ + 1.6, "black", 0.02)
# front windows (two triangles) + overhead rendezvous window
for side in (-1, 1):
    bm = bmesh.new()
    xf = lambda z: 1.05 + (0.55 - 1.05) * (z - (AZ + 1.55)) / 0.9 + 0.012
    vs = [bm.verts.new(v) for v in [(xf(AZ + 2.2), side * 0.1, AZ + 2.2), (xf(AZ + 2.2), side * 0.55, AZ + 2.2), (xf(AZ + 1.72), side * 0.1, AZ + 1.72)]]
    bm.faces.new(vs if side > 0 else vs[::-1])
    me = bpy.data.meshes.new("window")
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(f"window_{side}", me)
    scene.collection.objects.link(o)
    sol = o.modifiers.new("solid", "SOLIDIFY"); sol.thickness = 0.03
    finish(o, "glass", smooth=False)
box("hatch", (0.04, 0.8, 0.8), (1.37, 0, AZ + 0.85), "white", 0.02)
box("hatch_frame", (0.03, 0.9, 0.9), (1.36, 0, AZ + 0.85), "dark", 0.01)
# aft equipment bay + midsection
box("aft_bay", (1.25, 2.3, 1.3), (-0.95, 0, AZ + 0.95), "black", 0.04)
box("aft_racks", (0.3, 2.0, 0.9), (-1.65, 0, AZ + 0.95), "silver", 0.03)
box("midsection", (0.75, 2.0, 1.1), (-0.65, 0, AZ + 2.0), "al", 0.04)
# propellant tanks (oxidizer left, fuel right) in black kapton
for side in (-1, 1):
    cyl(f"tank_{side}", 0.55, 1.1, (-0.6, side * 1.55, AZ + 1.0), "black", rot=(0, 0, 0), verts=36, bevel=0.0)
    sphere(f"tank_cap_top_{side}", 0.55, (-0.6, side * 1.55, AZ + 1.55), "black", scale=(1, 1, 0.45))
    sphere(f"tank_cap_bot_{side}", 0.55, (-0.6, side * 1.55, AZ + 0.45), "black", scale=(1, 1, 0.45))
# docking tunnel + drogue
cyl("docking_tunnel", 0.42, 0.45, (0.25, 0, AZ + 2.68), "al", verts=40, bevel=0.02)
cyl("docking_ring", 0.48, 0.06, (0.25, 0, AZ + 2.92), "silver", verts=40)
# rendezvous radar dish (front top) + steerable S-band dish (right) + VHF / EVA antennas
rod("radar_mast", (0.85, 0.6, AZ + 2.45), (0.95, 0.6, AZ + 2.85), 0.04, "dark")
rr = cyl("radar_dish", 0.3, 0.1, (0.95, 0.6, AZ + 2.95), "white", r2=0.05, verts=40, bevel=0.01)
rr.rotation_euler = (0, math.radians(-50), 0)
rod("sband_boom", (-0.2, -1.05, AZ + 2.2), (-0.2, -1.75, AZ + 2.6), 0.03, "dark")
sb = cyl("sband_dish", 0.32, 0.12, (-0.2, -1.85, AZ + 2.7), "white", r2=0.04, verts=40, bevel=0.01)
sb.rotation_euler = (math.radians(55), 0, 0)
rod("vhf_1", (-1.2, 0.8, AZ + 1.6), (-1.6, 1.3, AZ + 2.9), 0.012, "silver", 6)
rod("vhf_2", (-1.2, -0.8, AZ + 1.6), (-1.6, -1.3, AZ + 2.9), 0.012, "silver", 6)
# ascent engine cover (top of aft section)
cyl("ascent_engine_cover", 0.5, 0.2, (-0.55, 0, AZ + 2.65), "black", verts=32)

# RCS quads on booms at the four corners, each with four nozzles
for i, (qx, qy) in enumerate([(0.85, 1.45), (0.85, -1.45), (-1.55, 1.45), (-1.55, -1.45)]):
    a = math.atan2(qy, qx)
    base = Vector((qx * 0.62, qy * 0.62, AZ + 1.75))
    tip = Vector((qx, qy, AZ + 1.75))
    rod(f"rcs_boom_{i}", base, tip, 0.04, "dark")
    box(f"rcs_housing_{i}", (0.26, 0.26, 0.26), tuple(tip), "silver", 0.03, rot=(0, 0, a))
    out = Vector((math.cos(a), math.sin(a), 0))
    side = Vector((-math.sin(a), math.cos(a), 0))
    for dname, d in (("up", Vector((0, 0, 1))), ("dn", Vector((0, 0, -1))), ("l", side), ("r", -side)):
        p0 = tip + d * 0.13
        n = cyl(f"rcs_nozzle_{i}_{dname}", 0.06, 0.16, tuple(p0 + d * 0.08), "bell", r2=0.03, verts=16)
        n.rotation_mode = "QUATERNION"
        n.rotation_quaternion = Vector((0, 0, -1)).rotation_difference(d)
    # gold thermal shield plate behind each quad
    box(f"rcs_plume_shield_{i}", (0.02, 0.5, 0.6), tuple(tip - out * 0.35), "gold", 0.01, rot=(0, 0, a))
    empty(f"rcs_{i + 1}", tuple(tip))

# ------------------------------------------------------------------ export
bpy.ops.object.select_all(action="DESELECT")
for o in scene.objects:
    o.select_set(True)
tris = 0
dg = bpy.context.evaluated_depsgraph_get()
for o in scene.objects:
    if o.type == "MESH":
        me = o.evaluated_get(dg).to_mesh()
        tris += sum(len(p.vertices) - 2 for p in me.polygons)
        o.evaluated_get(dg).to_mesh_clear()
os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                          export_materials="EXPORT", export_normals=True)
print(f"[lm] wrote {OUT} {os.path.getsize(OUT) / 1e6:.2f} MB, {tris} tris")

if PREVIEW:
    cam = bpy.data.cameras.new("cam")
    co = bpy.data.objects.new("cam", cam)
    scene.collection.objects.link(co)
    co.location = (13, -10, 6.5)
    tgt = bpy.data.objects.new("tgt", None); tgt.location = (0, 0, 3.3); scene.collection.objects.link(tgt)
    tc = co.constraints.new("TRACK_TO"); tc.target = tgt; tc.track_axis = "TRACK_NEGATIVE_Z"; tc.up_axis = "UP_Y"
    scene.camera = co
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 5
    so = bpy.data.objects.new("sun", sun)
    so.rotation_euler = (math.radians(70), 0, math.radians(-30))
    scene.collection.objects.link(so)
    world = bpy.data.worlds.new("w"); world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.02, 0.025, 1)
    scene.world = world
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 960, 720
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print("[lm] preview", PREVIEW)
