import * as THREE from 'three';
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

    this.sunLight = new THREE.DirectionalLight(0xffffff, 3.2);
    this.earthLight = new THREE.DirectionalLight(0x9db8ff, 0);
    this.scene.add(this.sunLight, this.sunLight.target, this.earthLight, this.earthLight.target);

    // гладкий «колпак» сферы радиусом 120 км: y = −d²/(2R) (край лунной сферы).
    // Integration: dense-near-centre ring mesh (was a single-ring fan) so the curvature and the
    // LROC albedo mapping are resolved under the camera; procedural regolith detail in the shader.
    this.ground = new THREE.Mesh(capGeometry(120, 90, 160), groundMaterial());
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
    if (this.sky) {
      this.sky.clearDome();
      this.scene.remove(this.sky.group);
    }
    this.sky = new Sky({ moonToLocal: this.moonToLocal, onAssetError: this.onAssetError });
    this.scene.add(this.sky.group);
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
    this.sunLight.position.copy(this.dirToLocal(sunDir)).multiplyScalar(100);
    this.earthLight.position.copy(this.dirToLocal(earthDir)).multiplyScalar(100);
    this.earthLight.intensity = this.sunLight.intensity * (this.earthshineRatio ?? 0.015) * sub.earthPhase;
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
    this.models.add(object);
  }
}


// ---------------------------------------------------------------------------------------------
// Integration additions: textured ground + engine dust for landings away from the polar tile.

/** Concentric rings, dense near the centre (r_i ∝ (i/N)^2.4), with the lunar curvature drop. */
function capGeometry(radiusKm, rings, segs) {
  const pos = [0, 0, 0], idx = []
  for (let i = 1; i <= rings; i++) {
    const r = radiusKm * Math.pow(i / rings, 2.4)
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
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocalM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalM = position * 1000.0;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vLocalM;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p *= 2.07; a *= .5; } return s; }
// bowl-shaped craters with raised rims on a jittered grid (cell size = scale, metres)
float craters(vec2 p, float scale){ vec2 c = floor(p / scale); float h = 0.;
  for (int dx = -1; dx <= 1; dx++) for (int dy = -1; dy <= 1; dy++){ vec2 cell = c + vec2(dx, dy);
    float pr = h21(cell + 7.1); if (pr < .55) continue;
    vec2 ctr = (cell + vec2(h21(cell), h21(cell + 3.3))) * scale; float r = scale * (.12 + .3 * h21(cell + 9.7));
    float d = length(p - ctr) / r;
    h += d < 1. ? -(1. - d * d) * .35 + .08 * pow(d, 6.) : .08 * exp(-pow(d - 1., 2.) * 14.); }
  return h; }
float regH(vec2 p){ return craters(p, 9.) * .35 + craters(p, 70.) * 1.6 + fbm(p * .6) * .25 + fbm(p * 7.) * .04; }
float bigH(vec2 p){ return craters(p, 320.) * 9. + craters(p, 1400.) * 30. + fbm(p * .0025) * 4.; }
`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float camD = length(vViewPosition);
float fineFade = 1. - smoothstep(30., 400., camD);
float grain = mix(.74, 1.22, fbm(vLocalM.xz * 4.)) * mix(.9, 1.1, fbm(vLocalM.xz * .35));
diffuseColor.rgb *= mix(1., grain, fineFade);
// pebbles and small rocks near the eye (Apollo-photo look)
vec2 pc = floor(vLocalM.xz * 3.); float pr = h21(pc);
if (pr > .972) diffuseColor.rgb *= mix(1., pr > .99 ? 1.45 : .55, smoothstep(.0, .5, 1. - length(fract(vLocalM.xz * 3.) - .5) * 2.) * fineFade);
diffuseColor.rgb *= 1. + craters(vLocalM.xz, 70.) * .25 * (1. - smoothstep(400., 4000., camD));
diffuseColor.rgb *= 1. + craters(vLocalM.xz, 320.) * .18 + (fbm(vLocalM.xz * .003) - .5) * .25; // ejecta brightening / mare tone
diffuseColor.rgb *= 1.45; // mare albedo is low (~0.07): lift so a grazing Sun still reads`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ float e = .15; vec2 q = vLocalM.xz;
  float h0 = regH(q), hx = regH(q + vec2(e, 0.)), hz = regH(q + vec2(0., e));
  float bump = 1. - smoothstep(80., 2500., camD);
  float E = 4.; float b0 = bigH(q), bx = bigH(q + vec2(E, 0.)), bz = bigH(q + vec2(0., E));
  float bigFade = 1. - smoothstep(4000., 30000., camD);
  vec3 tX = normalize((viewMatrix * vec4(1., 0., 0., 0.)).xyz), tZ = normalize((viewMatrix * vec4(0., 0., 1., 0.)).xyz);
  normal = normalize(normal - (tX * (hx - h0) / e + tZ * (hz - h0) / e) * .9 * bump - (tX * (bx - b0) / E + tZ * (bz - b0) / E) * .7 * bigFade); }`)
  }
  return mat
}

/** Engine-blown regolith: flat ballistic sheets (no air), km units, local frame. */
export class DustSheet {
  constructor(n = 900) {
    this.n = n; this.i = 0
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.life = new Float32Array(n)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3))
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfc6b8, size: 0.0011, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false }))
    this.points.frustumCulled = false
  }
  emit(groundY, strength, dt) {
    const k = Math.floor(strength * 600 * dt)
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
