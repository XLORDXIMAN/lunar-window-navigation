import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { Sky } from './sky.js';
import { latLonToVector } from '../coords.js';
import { siteFrame } from './horizon.js';
import { R_KM } from '../polar/PolarData.js';

// Вид с поверхности для точек вне тайла полюса (Apollo, Chang'e 4 и т.д.).
// Детального рельефа здесь нет — гладкая сфера R с честной пометкой «terrain not modeled».
// Локальная система (км): X — восток, Y — вверх, Z — юг; начало — точка на сфере.

const EARTH_RADIUS_KM = 6371;

export class SphereSiteView {
  constructor({ onAssetError } = {}) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.0005, 30000);

    this.sunLight = new THREE.DirectionalLight(0xffffff, 4.4);
    // real cast shadows (hard, black — no air): ortho box follows the focus point (landing site / lander)
    this.sunLight.castShadow = true;
    const sc = this.sunLight.shadow.camera;
    sc.left = sc.bottom = -0.16; sc.right = sc.top = 0.16; sc.near = 0.01; sc.far = 3;
    this.sunLight.shadow.mapSize.set(4096, 4096);
    this.sunLight.shadow.bias = -0.00015;
    this.sunLight.shadow.normalBias = 0.00025;
    this.shadowFocus = new THREE.Vector3();
    this.earthLight = new THREE.DirectionalLight(0x9db8ff, 0);
    this.scene.add(this.sunLight, this.sunLight.target, this.earthLight, this.earthLight.target);

    // гладкий «колпак» сферы радиусом 120 км: y = −d²/(2R) (край лунной сферы).
    // Integration: dense-near-centre ring mesh (was a single-ring fan) so the curvature and the
    // LROC albedo mapping are resolved under the camera; procedural regolith detail in the shader.
    this.ground = new THREE.Mesh(capGeometry(120, 80, 160), groundMaterial());
    this.ground.receiveShadow = true;
    // Blender-built relief (scripts/blender/build_site_patch.py): real crater bowls, rims and blocks that
    // cast shadows; shaded with the same material as the cap so it blends in seamlessly.
    this.patch = null;
    loadPatch().then((p) => {
      if (!p) return;
      this.patch = p;
      p.ground.material = this.ground.material;
      p.ground.receiveShadow = p.ground.castShadow = true;
      p.rocks.material = rockMaterial();
      p.rocks.castShadow = p.rocks.receiveShadow = true;
      this.scene.add(p.ground, p.rocks);
      if (p.mid) { p.mid.material = this.ground.material; p.mid.receiveShadow = true; this.scene.add(p.mid); this.ground.material.userData.uMid.value = 1 }
      sinkCapCentre(this.ground.geometry);
      this.ground.material.userData.uPatch.value = 1;
      if (this.siteMoon) this._mapPatch();
    });
    this.dust = new DustSheet();
    this.scene.add(this.dust.points);
    this.scene.add(this.ground);

    this.sky = null;
    this.onAssetError = onAssetError;
    this.models = new THREE.Group();
    this.scene.add(this.models);
  }

  /** Перестроить локальную систему под точку (lat, lon). */
  setSite(lat, lon) {
    this.siteMoon = latLonToVector(lat, lon, R_KM);
    this.frame = siteFrame(this.siteMoon);
    const { east, up, north } = this.frame;
    // строки матрицы: восток, вверх, юг → «система Луны → локальная»
    const m = new THREE.Matrix4().set(
      east.x, east.y, east.z, 0,
      up.x, up.y, up.z, 0,
      -north.x, -north.y, -north.z, 0,
      0, 0, 0, 1,
    );
    this.moonToLocal = new THREE.Quaternion().setFromRotationMatrix(m);
    mapCapToGlobe(this.ground.geometry, this.siteMoon, this.moonToLocal.clone().invert());
    if (this.patch) this._mapPatch();
    if (this.sky) {
      this.sky.clearDome();
      this.scene.remove(this.sky.group);
    }
    this.sky = new Sky({ moonToLocal: this.moonToLocal, onAssetError: this.onAssetError });
    this.scene.add(this.sky.group);
  }

  _mapPatch() {
    const inv = this.moonToLocal.clone().invert();
    mapCapToGlobe(this.patch.ground.geometry, this.siteMoon, inv);
    mapCapToGlobe(this.patch.rocks.geometry, this.siteMoon, inv);
    if (this.patch.mid) mapCapToGlobe(this.patch.mid.geometry, this.siteMoon, inv);
  }

  /** Height of the relief (km) under local (x, z) km — for landing contact and camera clearance. */
  heightAt(x, z) {
    const base = -(x * x + z * z) / (2 * R_KM);
    const H = Math.hypot(x, z) < 0.445 ? this.patch?.height : this.patch?.midHeight;
    if (!H) return base;
    const fx = (x + H.R) / H.step, fz = (z + H.R) / H.step;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= H.n - 1 || j >= H.n - 1) return base;
    const u = fx - i, v = fz - j, a = H.h[j * H.n + i], b = H.h[j * H.n + i + 1], c = H.h[(j + 1) * H.n + i], d = H.h[(j + 1) * H.n + i + 1];
    if (Number.isNaN(a + b + c + d)) return base;
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  dirToLocal(d, out = new THREE.Vector3()) {
    return out.copy(d).applyQuaternion(this.moonToLocal);
  }

  /** Положение глаза в системе Луны (для параллакса Земли). */
  eyeMoon(camera = this.camera) {
    const inv = this.moonToLocal.clone().invert();
    return camera.position.clone().applyQuaternion(inv).add(this.siteMoon);
  }

  applyState(sub, date) {
    const sunDir = latLonToVector(sub.sunLat, sub.sunLon);
    const earthPos = latLonToVector(sub.earthLat, sub.earthLon, sub.earthDistKm);
    const eye = this.eyeMoon();
    const earthDir = earthPos.clone().sub(eye).normalize();
    const sl = this.dirToLocal(sunDir);
    this.sunLight.target.position.copy(this.shadowFocus);
    this.sunLight.position.copy(this.shadowFocus).addScaledVector(sl, 1.5);
    this.sunLight.target.updateMatrixWorld();
    // the Sun below the local horizon would light the ground from beneath
    this.sunLight.intensity = 4.4 * THREE.MathUtils.smoothstep(sl.y, -0.01, 0.02);
    this.earthLight.position.copy(this.dirToLocal(earthDir)).multiplyScalar(100);
    // earthshine (+ a floor so shadowed rocks keep a hint of form, like an exposed Apollo frame)
    this.earthLight.intensity = Math.max(this.sunLight.intensity * (this.earthshineRatio ?? 0.015) * sub.earthPhase, 0.42);
    this.sky.update(this.camera, {
      sunDirMoon: sunDir,
      earthDirMoon: earthDir,
      earthAngR: Math.asin(EARTH_RADIUS_KM / earthPos.distanceTo(eye)),
      sub,
      date,
    });
    return { sunL: this.dirToLocal(sunDir) };
  }

  placeModel(object) {
    this.models.clear();
    if (!object) return;
    object.position.set(0, 0, 0);
    object.quaternion.identity();
    object.scale.setScalar(0.001);
    object.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } });
    this.models.add(object);
  }
}


// ---------------------------------------------------------------------------------------------
// Integration additions: textured ground + engine dust for landings away from the polar tile.

/** Concentric rings, dense near the centre (r_i ∝ (i/N)^2.4), with the lunar curvature drop. */
const INNER = [0.002, 0.03, 0.09, 0.17, 0.25, 0.32, 0.38, 0.42, 0.435, 0.445, 0.455, 0.47, 0.5,
  0.8, 1.2, 1.7, 2.2, 2.7, 3.1, 3.45, 3.7, 3.85, 3.92, 3.94, 3.955, 3.97, 3.99, 4.02, 4.08, 4.2]
function capGeometry(radiusKm, rings, segs) {
  const pos = [0, 0, 0], idx = []
  const radii = [...INNER]
  for (let i = 1; i <= rings; i++) radii.push(4.2 + (radiusKm - 4.2) * Math.pow(i / rings, 2.0))
  rings = radii.length
  for (let i = 1; i <= rings; i++) {
    const r = radii[i - 1]
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r
      pos.push(x, -(r * r) / (2 * R_KM), z)
    }
  }
  const ring = (i, j) => 1 + (i - 1) * segs + (j % segs)
  for (let j = 0; j < segs; j++) idx.push(0, ring(1, j + 1), ring(1, j))
  for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = ring(i, j), b = ring(i, j + 1), c = ring(i + 1, j), d = ring(i + 1, j + 1)
    idx.push(a, b, d, a, d, c)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Map each cap vertex to the global LROC mosaic (same UV convention as THREE.SphereGeometry). */
function mapCapToGlobe(geo, siteMoon, localToMoon) {
  const p = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3()
  const uOf = (d) => { const u = Math.atan2(d.z, -d.x) / (2 * Math.PI); return u < 0 ? u + 1 : u }
  const uc = uOf(siteMoon.clone().normalize())
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).applyQuaternion(localToMoon).add(siteMoon).normalize()
    let u = uOf(v)
    if (u - uc > 0.5) u -= 1; else if (uc - u > 0.5) u += 1 // continuous across the ±180° seam (RepeatWrapping)
    uv.setXY(i, u, 1 - Math.acos(THREE.MathUtils.clamp(v.y, -1, 1)) / Math.PI)
  }
  uv.needsUpdate = true
}

/** Once the patch is in, push the cap under it (stays visible only past the patch rim at 450 m). */
function sinkCapCentre(geo) {
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i))
    const k = 1 - THREE.MathUtils.smoothstep(r, 3.93, 3.962)
    p.setY(i, -(r * r) / (2 * R_KM) - 0.0003 - 0.2 * k)
  }
  p.needsUpdate = true // normals stay those of the smooth cap: the hidden wall must not tilt the visible rim
  geo.computeBoundingSphere()
}

let PATCH = null
function loadPatch() {
  if (!PATCH) {
    const draco = new DRACOLoader().setDecoderPath('/draco/')
    PATCH = new GLTFLoader().setDRACOLoader(draco).loadAsync('/models/site_patch.glb').then(async (g) => {
      const get = (n) => { let m = null; g.scene.traverse((o) => { if (o.isMesh && !m && o.name.startsWith(n)) m = o }); return m }
      const out = {}
      const mid = await new GLTFLoader().setDRACOLoader(draco).loadAsync('/models/site_midfield.glb').catch(() => null)
      if (mid) mid.scene.traverse((o) => { if (o.isMesh && !get.mid) get.mid = o })
      for (const [k, n] of [['ground', 'site_ground'], ['rocks', 'site_rocks'], ['mid', 'site_midfield']]) {
        const src = n === 'site_midfield' ? get.mid : get(n)
        if (!src && k === 'mid') continue
        if (!src) throw new Error('patch: missing ' + n)
        src.updateWorldMatrix(true, false)
        const geo = src.geometry.clone().applyMatrix4(src.matrixWorld).scale(0.001, 0.001, 0.001) // metres → km
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2))
        geo.deleteAttribute('normal'); geo.computeVertexNormals() // Draco-quantised normals band at grazing light
        out[k] = new THREE.Mesh(geo)
      }
      // the ground is a regular lattice (Blender grid) → exact height lookup table, km
      const pos = out.ground.geometry.attributes.position, R = 0.45, n = 521, step = (2 * R) / (n - 1)
      const h = new Float32Array(n * n).fill(NaN)
      for (let i = 0; i < pos.count; i++) {
        const ix = Math.round((pos.getX(i) + R) / step), iz = Math.round((pos.getZ(i) + R) / step)
        if (ix >= 0 && iz >= 0 && ix < n && iz < n) h[iz * n + ix] = pos.getY(i)
      }
      out.height = { h, n, step, R }
      if (out.mid) {
        out.midHeight = lattice(out.mid.geometry, 4.0, 521)
        // the sunken centre's wall must not tilt the normals of the visible ring just outside the patch
        const P = out.mid.geometry.attributes.position, Nn = out.mid.geometry.attributes.normal
        for (let i = 0; i < P.count; i++) { const r = Math.hypot(P.getX(i), P.getZ(i)); if (r > 0.42 && r < 0.48) Nn.setXYZ(i, 0, 1, 0) }
        Nn.needsUpdate = true
      }
      return out
    }).catch((e) => { console.warn('[SphereSiteView] site patch unavailable:', e.message); return null })
  }
  return PATCH.then((p) => p && { ground: p.ground.clone(), rocks: p.rocks.clone(), mid: p.mid?.clone(), height: p.height, midHeight: p.midHeight })
}

function lattice(geo, R, n) {
  const pos = geo.attributes.position, step = (2 * R) / (n - 1), h = new Float32Array(n * n).fill(NaN)
  for (let i = 0; i < pos.count; i++) {
    const ix = Math.round((pos.getX(i) + R) / step), iz = Math.round((pos.getZ(i) + R) / step)
    if (ix >= 0 && iz >= 0 && ix < n && iz < n) h[iz * n + ix] = pos.getY(i)
  }
  return { h, n, step, R }
}

/** Fresh blocks are brighter than mature regolith; angular facets read in a grazing Sun. */
function rockMaterial() {
  const m = new THREE.MeshStandardMaterial({ map: GROUND_TEX, color: 0xffffff, roughness: 0.95, metalness: 0 })
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
diffuseColor.rgb = min(diffuseColor.rgb * 3.6, vec3(.95));`)
  }
  return m
}

let GROUND_TEX = null
function groundMaterial() {
  if (!GROUND_TEX) {
    const loader = new THREE.TextureLoader()
    GROUND_TEX = loader.load('/textures/moon_color_8k.jpg', undefined, undefined, () => { GROUND_TEX.image = undefined; loader.load('/textures/moon_color_2k.jpg', (t) => { GROUND_TEX.image = t.image; GROUND_TEX.needsUpdate = true }) })
    GROUND_TEX.colorSpace = THREE.SRGBColorSpace
    GROUND_TEX.anisotropy = 8
    GROUND_TEX.wrapS = THREE.RepeatWrapping
  }
  const mat = new THREE.MeshStandardMaterial({ map: GROUND_TEX, color: 0xffffff, roughness: 1, metalness: 0 })
  mat.userData.uPatch = { value: 0 }
  mat.userData.uMid = { value: 0 }
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPatch = mat.userData.uPatch
    sh.uniforms.uMid = mat.userData.uMid
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocalM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalM = position * 1000.0;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vLocalM;
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p *= 2.07; a *= .5; } return s; }
// bowl-shaped craters with raised rims on a jittered grid (cell size = scale, metres)
float craters(vec2 p, float scale){ vec2 c = floor(p / scale); float h = 0.;
  for (int dx = -1; dx <= 1; dx++) for (int dy = -1; dy <= 1; dy++){ vec2 cell = c + vec2(dx, dy);
    float pr = h21(cell + 7.1); if (pr < .55) continue;
    float hr = h21(cell + 9.7), fresh = h21(cell + 4.4);
    vec2 ctr = (cell + vec2(h21(cell), h21(cell + 3.3))) * scale; float r = scale * (.06 + .36 * hr * hr);
    float d = length(p - ctr) / r, k = mix(.35, 1.25, fresh);       // degraded … fresh: depth and rim vary
    h += k * (d < 1. ? -(1. - pow(d, 2.2)) * .35 + .08 * pow(d, 6.) * fresh : .08 * fresh * exp(-pow(d - 1., 2.) * 14.) * (1. - smoothstep(1.2, 1.4, d))); }
  return h; }
uniform float uPatch, uMid;
float patchK(vec2 p){ return max(uPatch * (1. - smoothstep(360., 440., length(p))), uMid * .85 * (1. - smoothstep(3300., 3950., length(p)))); } // real Blender relief there
float PX = 0.; // metres per pixel at this fragment (set in main)
float aa(float scale){ return 1. - smoothstep(scale * .06, scale * .22, PX); }
float regH(vec2 p){ float h = 0., w;
  float pk = patchK(p);
  w = aa(1.2); if (w > 0.) h += craters(p, 1.2) * .08 * w;
  w = aa(3.);  if (w > 0.) h += craters(p, 3.) * .25 * w;
  w = aa(9.);  if (w > 0.) h += craters(p, 9.) * .45 * w;
  w = (1. - pk) * aa(70.); if (w > 0.) h += craters(p, 70.) * 1.6 * w;
  w = aa(1.6); if (w > 0.) h += fbm(p * .6) * .25 * w;
  w = aa(.15); if (w > 0.) h += fbm(p * 7.) * .04 * w;
  return h; }
float bigH(vec2 p){ float k = 1. - patchK(p), h = fbm(p * .0025) * 4.;
  if (k > 0.) h += (craters(p, 150.) * 4. * aa(150.) + craters(p, 320.) * 9. + craters(p, 1400.) * 30.) * k;
  return h; }
`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float camD = length(vViewPosition);
PX = length(fwidth(vLocalM.xz));
float fineFade = 1. - smoothstep(30., 400., camD);
float grain = mix(1., mix(.8, 1.16, fbm(vLocalM.xz * 4.)), aa(.25)) * mix(1., mix(.9, 1.1, fbm(vLocalM.xz * .35)), aa(3.));
diffuseColor.rgb *= grain;
// pebbles and small rocks near the eye (Apollo-photo look)
vec2 pc = floor(vLocalM.xz * 3.); float pr = h21(pc);
if (pr > .972) diffuseColor.rgb *= mix(1., pr > .99 ? 1.45 : .55, smoothstep(.0, .5, 1. - length(fract(vLocalM.xz * 3.) - .5) * 2.) * aa(.35));
float pk = patchK(vLocalM.xz);
diffuseColor.rgb *= 1. + craters(vLocalM.xz, 70.) * .08 * (1. - smoothstep(400., 4000., camD)) * (1. - pk);
diffuseColor.rgb *= 1. + craters(vLocalM.xz, 320.) * .05 * (1. - pk) + (fbm(vLocalM.xz * .003) - .5) * .2; // ejecta brightening / mare tone
diffuseColor.rgb = min(diffuseColor.rgb * 2.7, vec3(.95)); // mare albedo is low (~0.07): expose like the Apollo Hasselblad frames`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ // one height evaluation per pixel, gradient from screen-space derivatives (was 3 full evaluations)
  vec2 q = vLocalM.xz;
  float bigFade = 1. - smoothstep(4000., 30000., camD);
  float H = (regH(q) * .9 + (bigFade > 0. ? bigH(q) * 1.05 * bigFade : 0.)) * .001;   // metres → scene km
  vec3 sp = -vViewPosition, sx = dFdx(sp), sy = dFdy(sp);
  vec3 R1 = cross(sy, normal), R2 = cross(normal, sx); float det = dot(sx, R1);
  vec3 grad = sign(det) * (dFdx(H) * R1 + dFdy(H) * R2);
  normal = normalize(abs(det) * normal - grad); }`)
  }
  return mat
}

/** Engine-blown regolith: flat ballistic sheets (no air), km units, local frame. */
export class DustSheet {
  constructor(n = 2600) {
    this.n = n; this.i = 0
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.life = new Float32Array(n)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3))
    const c = document.createElement('canvas'); c.width = c.height = 64
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64)
    const tex = new THREE.CanvasTexture(c)
    // soft, sunlit regolith grains (no air: flat ballistic sheets, no billowing clouds)
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe2dace, map: tex, alphaMap: tex, size: 0.00045, sizeAttenuation: true, transparent: true, opacity: 0.4, depthWrite: false }))
    this.points.frustumCulled = false
  }
  emit(groundY, strength, dt) {
    const k = Math.floor(strength * 2600 * dt)
    for (let j = 0; j < k; j++) {
      const i = this.i++ % this.n, a = Math.random() * Math.PI * 2, r = 0.002 + Math.random() * 0.004
      const sp = (0.02 + Math.random() * 0.03) * strength // 20–50 m/s outward
      this.p.set([Math.cos(a) * r, groundY + 0.0002, Math.sin(a) * r], i * 3)
      this.v.set([Math.cos(a) * sp, sp * (0.03 + Math.random() * 0.08), Math.sin(a) * sp], i * 3)
      this.life[i] = 2.5
    }
  }
  update(dt) {
    const g = 0.00162 // km/s²
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.p[i * 3 + 1] = -1e3; continue }
      this.life[i] -= dt
      this.v[i * 3 + 1] -= g * dt
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt
    }
    this.points.geometry.attributes.position.needsUpdate = true
  }
  clear() { this.life.fill(0) }
}
