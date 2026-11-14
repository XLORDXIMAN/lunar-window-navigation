// LandingSim — cinematic, physics-driven lunar landing on the team's Blender diorama.
//
//  • assets: /models/diorama/lunar_terrain.glb + lander.glb (Draco), built by scripts/blender/build_diorama.py
//  • light: one sun DirectionalLight, ACES tone mapping, PCF-soft 4096² shadows, NO ambient/hemisphere fill
//    → shadows are pitch black, as in vacuum
//  • sky: Sun + phase-lit Earth placed from (az, el) of the backend (/api/simulate) or the DE440s export,
//    stars, and a 3D horizon silhouette ring built from the 360° horizon profile (LOLA near the pole)
//  • physics (SI, g = 1.62 m/s²):
//      1 BRAKING  — enters at 35° pitch; thrust vector from guidance (null horizontal speed, hold a sink
//                   rate), attitude follows the thrust vector so the craft pitches up to 0°
//      2 TERMINAL — asymptotic sink-rate schedule v(h) = 0.5 + 14.5(1 − e^(−h/28)) m/s, RCS cold-gas
//                   micro-corrections null residual drift
//      3 CONTACT  — engine cut at the contact probe, ballistic drop, spring-damper leg compression,
//                   attitude settles onto the terrain normal
//  • dust: GPU points on ballistic parabolas y = v_y t − ½ g t², no drag, no clouds (vacuum)
//  • camera: critically-damped spring from chase cam to a low angle beside the hero boulder at touchdown
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { createStarfield } from '../scene/starfield.js'
import { createFirePlume, createDustSkirt } from '../scene/firePlume.js'
import { crispLander } from '../scene/landerLook.js'

export const G = 1.62
const D2R = Math.PI / 180
const T_MAX = 5.2 // m/s² — thrust-to-mass limit (LM-class)

/** (az from north clockwise, el above horizon) → unit vector in glTF space (X east, Y up, Z south). */
export function dirFromAzEl(azDeg, elDeg, out = new THREE.Vector3()) {
  const a = azDeg * D2R, e = elDeg * D2R
  return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e))
}

// ---------------------------------------------------------------- shaders
const DUST_VS = `attribute vec3 aOrigin; attribute vec3 aVel; attribute float aT0; attribute float aSize;
uniform float uTime; uniform float uG; varying float vA;
void main(){
  float t = uTime - aT0;
  vec3 p = aOrigin + aVel * t + vec3(0., -0.5 * uG * t * t, 0.);
  float alive = step(0., t) * step(t, 6.) * step(aOrigin.y - 0.05, p.y);   // gone once back on the ground
  vA = alive * (1. - smoothstep(2.5, 6., t));
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_PointSize = alive * aSize * (220. / -mv.z);
  gl_Position = projectionMatrix * mv;
}`
const DUST_FS = `varying float vA; void main(){ vec2 c = gl_PointCoord - .5; float d = dot(c,c); if (d > .25) discard; gl_FragColor = vec4(.74, .71, .66, vA * (1. - d*4.) * .9); }`

// Regolith look on top of the baked Blender maps: neutral grey (the bake is brownish), luminance of the
// bake kept as crater-correlated albedo variation, plus world-space grain, pebbles and micro-relief so the
// ground never reads as a smooth sheet. World units = metres.
const REG_COMMON = `
varying vec3 vWp;
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * vn(p); p *= 2.07; a *= .5; } return s; }
float craters(vec2 p, float sc){ vec2 c = floor(p / sc); float h = 0.;
  for (int dx = -1; dx <= 1; dx++) for (int dy = -1; dy <= 1; dy++){ vec2 cell = c + vec2(dx, dy);
    if (h21(cell + 7.1) < .5) continue;
    vec2 ctr = (cell + vec2(h21(cell), h21(cell + 3.3))) * sc; float r = sc * (.12 + .3 * h21(cell + 9.7));
    float d = length(p - ctr) / r;
    h += d < 1. ? -(1. - d * d) * .35 + .08 * pow(d, 6.) : .08 * exp(-pow(d - 1., 2.) * 14.) * (1. - smoothstep(1.2, 1.4, d)); }
  return h; }
float microH(vec2 p){ return craters(p, 3.) * .25 + craters(p, 11.) * .6 + fbm(p * 1.3) * .12 + fbm(p * 9.) * .025; }
`
function regolith(mat, { bakedLum = true, gain = 1 } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + REG_COMMON)
      .replace('#include <map_fragment>', `#include <map_fragment>
{ float camD = length(vViewPosition);
  ${bakedLum ? 'float lum = dot(diffuseColor.rgb, vec3(.299, .587, .114)); diffuseColor.rgb = vec3(.205, .2, .192) * clamp(lum / .034, .6, 1.5);' : ''}
  float PX = length(fwidth(vWp.xz));
  float near = (1. - smoothstep(25., 260., camD)) * (1. - smoothstep(.03, .09, PX));
  diffuseColor.rgb *= mix(1., mix(.78, 1.18, fbm(vWp.xz * 3.1)) * mix(.92, 1.08, fbm(vWp.xz * .4)), near);
  vec2 pc = floor(vWp.xz * 5.); float pr = h21(pc);
  if (pr > .968) diffuseColor.rgb *= mix(1., pr > .992 ? 1.6 : .6, smoothstep(0., .45, 1. - length(fract(vWp.xz * 5.) - .5) * 2.) * near * (1. - smoothstep(.04, .1, PX)));
  diffuseColor.rgb *= 1. + craters(vWp.xz, 11.) * .22 * (1. - smoothstep(60., 600., camD));
  diffuseColor.rgb *= ${gain.toFixed(2)}; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ float camD = length(vViewPosition);
  float H = microH(vWp.xz) * .75 * (1. - smoothstep(30., 700., camD));
  vec3 sp = -vViewPosition, sx = dFdx(sp), sy = dFdy(sp);
  vec3 R1 = cross(sy, normal), R2 = cross(normal, sx); float det = dot(sx, R1);
  vec3 grad = sign(det) * (dFdx(H) * R1 + dFdy(H) * R2);
  normal = normalize(abs(det) * normal - grad); }`)
  }
  mat.customProgramCacheKey = () => 'regolith' + bakedLum + gain
  return mat
}

/** Seeded value noise in JS for the far-field relief (metres). */
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s) }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v - 0.5
}
function fbmJS(x, y, oct = 5) { let s = 0, a = 1, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); a *= 0.5; f *= 2.03 } return s }
function craterJS(x, y, sc) {
  const cx = Math.floor(x / sc), cy = Math.floor(y / sc); let h = 0
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const i = cx + dx, j = cy + dy
    if (hash2(i + 7.1, j + 7.1) < 0.55) continue
    const ox = (i + hash2(i, j)) * sc, oy = (j + hash2(i + 3.3, j + 3.3)) * sc, r = sc * (0.1 + 0.3 * hash2(i + 9.7, j + 9.7))
    const d = Math.hypot(x - ox, y - oy) / r
    h += d < 1 ? -(1 - d * d) * 0.2 * r : 0.035 * r * Math.exp(-((d - 1) ** 2) * 10)
  }
  return h
}

export class LandingSim {
  constructor(container, { onTelemetry, onPhase, onReady, onError } = {}) {
    this.container = container
    this.cb = { onTelemetry, onPhase, onReady, onError }
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }))
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75))
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.toneMappingExposure = 1.35
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(r.domElement)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x000000) // airless: black sky, no fill light anywhere
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 9000)
    this.camera.position.set(-80, 60, 120)

    const sun = (this.sun = new THREE.DirectionalLight(0xfff6ec, 6.0))
    sun.castShadow = true
    sun.shadow.mapSize.set(4096, 4096)
    const sc = sun.shadow.camera
    sc.left = -140; sc.right = 140; sc.top = 140; sc.bottom = -140; sc.near = 1; sc.far = 1600
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6
    this.scene.add(sun, sun.target)
    // earthshine: the only fill on the Moon — faint, bluish, from the Earth's direction (no shadows)
    this.earthLight = new THREE.DirectionalLight(0x9db8ff, 0.22)
    this.scene.add(this.earthLight)

    this._stars()
    this._sky()
    this.dust = this._dust(6000)
    this.skirt = createDustSkirt(38)
    this.scene.add(this.skirt)
    this.clock = new THREE.Clock()
    this._resize = this._resize.bind(this)
    new ResizeObserver(this._resize).observe(container)
    this._resize()
    this.running = true
    this.renderer.setAnimationLoop(() => this._frame())
    this._load()
  }

  // ------------------------------------------------------------ assets
  async _load() {
    try {
      const draco = new DRACOLoader().setDecoderPath('/draco/')
      const gl = new GLTFLoader().setDRACOLoader(draco)
      const [ter, lan] = await Promise.all([gl.loadAsync('/models/diorama/lunar_terrain.glb'), gl.loadAsync('/models/apollo_lm.glb')])
      this.terrain = ter.scene
      this.terrain.traverse((o) => {
        if (o.isMesh) {
          o.receiveShadow = true; o.castShadow = true
          const m = o.material
          if (m) { m.envMapIntensity = 0; m.metalness = 0; if (m.normalMap) m.normalScale.set(0.55, 0.55) }
          if (o.name === 'lunar_terrain') regolith(m, { gain: 1.3 })
          else if (o.name === 'boulders') { m.flatShading = false; m.normalMap = null; m.map = null; m.color.set(0x8f8b86); m.roughness = 0.95; regolith(m, { bakedLum: false, gain: 1.25 }); m.needsUpdate = true }
        }
      })
      this.scene.add(this.terrain)
      this.groundMesh = this.terrain.getObjectByName('lunar_terrain')
      this.heroBoulder = this.terrain.getObjectByName('hero_boulder')?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3(11, 1.5, 9)
      // official NASA 3D Resources Apollo LM (decimated, 7 m, feet at y = 0); anchors added here
      this.lander = lan.scene
      crispLander(this.lander, this.renderer)
      const anchor = (name, x, y, z, yaw = 0) => { const e = new THREE.Object3D(); e.name = name; e.position.set(x, y, z); e.rotation.y = yaw; this.lander.add(e); return e }
      this.nodes = {
        thruster: this.lander.getObjectByName('thruster_main') ?? anchor('thruster_main', 0, 1.15, 0),
        // RCS quads on the ascent stage, puffs point outward (local +X of each anchor)
        rcs: [0, 1, 2, 3].map((i) => this.lander.getObjectByName(`rcs_${i + 1}`) ?? anchor(`rcs_${i + 1}`, Math.cos(Math.PI / 4 + i * Math.PI / 2) * 2.05, 4.35, Math.sin(Math.PI / 4 + i * Math.PI / 2) * 2.05, -(Math.PI / 4 + i * Math.PI / 2))),
        legs: [1, 2, 3, 4].map((i) => this.lander.getObjectByName(`landing_leg_${i}`)),
      }
      // boulders: displace the smooth icospheres into fractured, faceted blocks
      const rocks = this.terrain.getObjectByName('boulders')
      if (rocks?.geometry) {
        const g = mergeVertices(rocks.geometry.clone().deleteAttribute('normal').deleteAttribute('uv'), 1e-3)
        const p = g.attributes.position, v = new THREE.Vector3()
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i)
          const n = fbmJS(v.x * 0.9 + v.y * 0.3, v.z * 0.9 - v.y * 0.4, 3) * 0.55 + fbmJS(v.x * 3.1, v.z * 3.1 + v.y, 2) * 0.12
          p.setY(i, v.y + n * 0.8)
          p.setX(i, v.x + n * 0.35); p.setZ(i, v.z - n * 0.3)
        }
        g.computeVertexNormals(); rocks.geometry = g
      }
      this.legRest = this.nodes.legs.map((l) => l?.quaternion.clone())
      this.scene.add(this.lander)
      this._plume()
      this._rcsPuffs()
      this._buildLattice()
      this.padY = this.groundAt(0, 0)?.y ?? 0
      this.ready = true
      this.cb.onReady?.()
      if (this._pending) { const p = this._pending; this._pending = null; this.start(p) }
    } catch (e) {
      console.warn('[LandingSim] assets failed', e)
      this.cb.onError?.(e)
    }
  }

  _stars() {
    this.stars = createStarfield(26000, 400)
    this.stars.scale.setScalar(12) // 4.8 km sphere, inside the far plane
    this.scene.add(this.stars)
  }

  _sky() {
    // Sun disk + glow (sprite), Earth (lit by the same sun light → physically correct phase), atmosphere rim
    const c = document.createElement('canvas'); c.width = c.height = 256
    const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.08, 'rgba(255,250,240,1)'); gr.addColorStop(0.2, 'rgba(255,230,200,.35)'); gr.addColorStop(1, 'rgba(255,220,180,0)')
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256)
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.sunSprite.scale.setScalar(520)
    this.scene.add(this.sunSprite)
    const earthTex = new THREE.TextureLoader().load('/textures/earth_2k.jpg'); earthTex.colorSpace = THREE.SRGBColorSpace
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.75, metalness: 0 }))
    this.earthAtmo = new THREE.Mesh(new THREE.SphereGeometry(1.03, 64, 32), new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) } },
      vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix)*normal); vW = (modelMatrix*vec4(position,1.)).xyz; gl_Position = projectionMatrix*viewMatrix*vec4(vW,1.); }',
      fragmentShader: 'uniform vec3 uSun; varying vec3 vN; varying vec3 vW; void main(){ vec3 v = normalize(cameraPosition - vW); float rim = pow(1. - max(dot(vN, v), 0.), 3.); float lit = smoothstep(-.2, .3, dot(vN, uSun)); gl_FragColor = vec4(vec3(.35,.6,1.) * rim * lit * 1.4, rim * lit); }',
    }))
    this.earth.add(this.earthAtmo)
    this.scene.add(this.earth)
    this.horizonRing = null
  }

  /** Far-field relief from the diorama rim (490 m) to 4.5 km: cratered plains continuing the terrain
   *  seamlessly, rising into massifs whose skyline follows the 360° horizon profile (deg, az 0..359). */
  _buildHorizon(profile) {
    if (this.horizonRing) { this.scene.remove(this.horizonRing); this.horizonRing.geometry.dispose() }
    const R0 = 430, R1 = 4500, RINGS = 140, SEG = 720
    // smoothed skyline (±12°) so distant massifs read as one continuous range, not floating slivers
    const prof = profile?.length ? profile.map((_, i) => { let s = 0; for (let k = -12; k <= 12; k++) s += profile[(i + k + profile.length) % profile.length]; return s / 25 }) : null
    const pad = this.padY ?? 0, eye = pad + 2
    const edge = []
    for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * Math.PI * 2
      edge.push(this._h(Math.cos(a) * 494, Math.sin(a) * 494) ?? pad)
    }
    const pos = [], idx = []
    for (let i = 0; i <= RINGS; i++) {
      const r = R0 + (R1 - R0) * Math.pow(i / RINGS, 1.9)
      for (let j = 0; j < SEG; j++) {
        const a = (j / SEG) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r
        // azimuth of this vertex (from north, clockwise) for the profile lookup: X east, Z south
        const az = ((Math.atan2(x, -z) / D2R) + 360) % 360
        const el = prof ? prof[Math.floor(az) % prof.length] : 0
        // gentle far plains: at a +4° Sun distant crater rims would light up as floating crescents
        let far = fbmJS(x * 0.0025, z * 0.0025, 3) * 8 + fbmJS(x * 0.02, z * 0.02, 2) * 1.5 + craterJS(x, z, 160) * 0.35 * (1 - THREE.MathUtils.smoothstep(r, 900, 1600))
        const massif = 0 // distant massifs read as floating slivers at grazing light: plains to the horizon
        const sky = Math.max(0, r * Math.tan(Math.max(-2, el) * D2R) + 30) * (0.8 + 0.4 * (fbmJS(x * 0.0018 + 9, z * 0.0018, 3) + 0.5))
        far = far * (1 - massif * 0.6) + massif * sky
        // under the diorama: hug its relief 0.4 m below; outside: blend from its rim into the far field
        const under = r < 494 ? this._h(x, z) : null
        const w = THREE.MathUtils.smoothstep(r, 494, 1500)
        const y = under != null ? under - 0.4 : (edge[j] - 0.4) * (1 - w) + (pad + far) * w - (r * r) / (2 * 1737400)
        pos.push(x, y, z)
      }
    }
    for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEG; j++) {
      const a = i * SEG + j, b = i * SEG + ((j + 1) % SEG), c = a + SEG, d = b + SEG
      idx.push(a, d, b, a, c, d)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals()
    const m = regolith(new THREE.MeshStandardMaterial({ color: 0x8a8682, roughness: 1, metalness: 0 }), { bakedLum: false, gain: 1.3 })
    this.horizonRing = new THREE.Mesh(g, m)
    this.horizonRing.receiveShadow = true
    this.scene.add(this.horizonRing)
    void eye
  }

  _plume() {
    this.plume = createFirePlume({ length: 9, radius: 1.25, light: false })
    ;(this.nodes.thruster ?? this.lander).add(this.plume)
    this.engineLight = new THREE.PointLight(0xffc896, 0, 32, 2)
    ;(this.nodes.thruster ?? this.lander).add(this.engineLight)
    this.engineLight.position.set(0, -3, 0)
  }

  _rcsPuffs() {
    this.puffs = this.nodes.rcs.map((n) => {
      if (!n) return null
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.1, 12, 1, true).rotateZ(-Math.PI / 2).translate(0.75, 0, 0),
        new THREE.MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
      n.add(s); return s
    })
  }

  _dust(n) {
    const g = new THREE.BufferGeometry()
    const o = new Float32Array(n * 3), v = new Float32Array(n * 3), t0 = new Float32Array(n).fill(-1e4), sz = new Float32Array(n)
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    g.setAttribute('aOrigin', new THREE.BufferAttribute(o, 3)); g.setAttribute('aVel', new THREE.BufferAttribute(v, 3))
    g.setAttribute('aT0', new THREE.BufferAttribute(t0, 1)); g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1))
    const m = new THREE.ShaderMaterial({ vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uG: { value: G } } })
    const pts = new THREE.Points(g, m); pts.frustumCulled = false
    this.scene.add(pts)
    return { pts, g, m, n, i: 0 }
  }

  _emitDust(x, z, groundY, strength, dt, now) {
    const D = this.dust, k = Math.floor(strength * 2600 * dt)
    const o = D.g.attributes.aOrigin, v = D.g.attributes.aVel, t0 = D.g.attributes.aT0, s = D.g.attributes.aSize
    for (let j = 0; j < k; j++) {
      const i = D.i++ % D.n, a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 3
      const sp = (15 + Math.random() * 45) * strength
      o.setXYZ(i, x + Math.cos(a) * r, groundY + 0.08, z + Math.sin(a) * r)
      v.setXYZ(i, Math.cos(a) * sp, sp * (0.03 + Math.random() * 0.12), Math.sin(a) * sp) // low, flat ballistic sheets
      t0.setX(i, now); s.setX(i, 0.08 + Math.random() * 0.25)
    }
    if (k) { o.needsUpdate = v.needsUpdate = t0.needsUpdate = s.needsUpdate = true }
  }

  // ------------------------------------------------------------ helpers
  /** Height lattice from the Blender grid (360² over 1000 m): O(1) lookups instead of raycasting
   *  200k triangles (that cost ~60 ms per call and stalled the load for ~20 s). */
  _buildLattice() {
    const m = this.groundMesh
    m.updateWorldMatrix(true, false)
    const pos = m.geometry.attributes.position, v = new THREE.Vector3()
    const n = 361, R = 500, step = (2 * R) / (n - 1), h = new Float32Array(n * n).fill(NaN)
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
      const ix = Math.round((v.x + R) / step), iz = Math.round((v.z + R) / step)
      if (ix >= 0 && iz >= 0 && ix < n && iz < n) h[iz * n + ix] = v.y
    }
    this.lat = { h, n, R, step }
  }

  _h(x, z) {
    const L = this.lat
    const fx = (x + L.R) / L.step, fz = (z + L.R) / L.step, i = Math.floor(fx), j = Math.floor(fz)
    if (i < 0 || j < 0 || i >= L.n - 1 || j >= L.n - 1) return null
    const u = fx - i, w = fz - j, a = L.h[j * L.n + i], b = L.h[j * L.n + i + 1], c = L.h[(j + 1) * L.n + i], d = L.h[(j + 1) * L.n + i + 1]
    const y = a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w
    return Number.isNaN(y) ? null : y
  }

  groundAt(x, z) {
    if (!this.lat) return null
    const y = this._h(x, z)
    if (y == null) return null
    return { y, normal: this._normalAt(x, z, y) }
  }

  /** Terrain normal from heights 2 m apart. */
  _normalAt(x, z, y0) {
    const h = (px, pz) => this._h(px, pz) ?? y0
    const ax = h(x - 2, z), bx = h(x + 2, z), az = h(x, z - 2), bz = h(x, z + 2)
    return new THREE.Vector3(-(bx - ax) / 4, 1, -(bz - az) / 4).normalize()
  }

  /** env: { sunAz, sunEl, earthAz, earthEl, profile[360], energy (0..1), source } */
  setEnvironment(env) {
    this.env = env
    const sd = dirFromAzEl(env.sunAz, env.sunEl), ed = dirFromAzEl(env.earthAz, env.earthEl)
    // the diorama's big crater rim (local −Z) goes down-Sun of the pad, so the low polar Sun reaches the
    // landing zone instead of the rim's kilometre-long shadow (decorative relief, the pad stays at 0,0)
    const sunH = new THREE.Vector3(sd.x, 0, sd.z).normalize()
    this.terrain.rotation.y = Math.atan2(sunH.x, sunH.z)
    this.terrain.updateMatrixWorld(true)
    this._buildLattice()
    this.padY = this._h(0, 0) ?? this.padY
    this.sun.position.copy(sd).multiplyScalar(700); this.sun.target.position.set(0, this.padY ?? 0, 0)
    this.sunSprite.position.copy(sd).multiplyScalar(3500)
    const dist = 3000, rad = dist * Math.tan(0.95 * D2R)
    this.earth.position.copy(ed).multiplyScalar(dist); this.earth.scale.setScalar(rad)
    this.earthLight.position.copy(ed).multiplyScalar(500)
    this.earthLight.intensity = env.earthEl > -1 ? 0.22 : 0
    this.earthAtmo.material.uniforms.uSun.value.copy(sd)
    this._buildHorizon(env.profile)
  }

  start(env) {
    if (!this.ready) { this._pending = env; return }
    this.setEnvironment(env)
    // approach from the side with the Sun to the left so the lander's long shadow sweeps across the frame
    const sunH = dirFromAzEl(env.sunAz, 0)
    this.approach = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sunH).normalize() // horizontal unit, toward the pad
    this.st = { phase: 'BRAKING', s: 240, h: 210, vs: 24, vh: -9, pitch: 35, lat: 2.5, vlat: 0.6, t: 0, comp: 0, vcomp: 0, landedAt: null, tilt: new THREE.Quaternion(), thr: 1, rcs: [0, 0, 0, 0] }
    this.dust.g.attributes.aT0.array.fill(-1e4); this.dust.g.attributes.aT0.needsUpdate = true
    this.cam = { pos: null, vel: new THREE.Vector3(), look: null, lookVel: new THREE.Vector3() }
    this.legRest.forEach((q, i) => q && this.nodes.legs[i].quaternion.copy(q))
    this._phase('BRAKING')
  }

  _phase(p) { if (this.st) this.st.phase = p; this.cb.onPhase?.(p) }

  // ------------------------------------------------------------ physics
  _step(dt) {
    const S = this.st
    let ax = 0, av = 0, thr = 0, rcs = [0, 0, 0, 0]
    if (S.phase === 'BRAKING') {
      // null horizontal speed by the pad, hold a sink rate that tightens with altitude
      const aH = Math.min(3.4, (S.vs * S.vs) / (2 * Math.max(S.s, 4)) + 0.25 * S.vs * (S.s < 30 ? 1 : 0))
      const vCmd = -Math.min(15, 6 + S.h * 0.045)
      const aV = 1.4 * (vCmd - S.vh)
      let tx = aH, tz = Math.max(0.15, aV + G) // an engine only pushes: to sink faster it throttles down
      const mag = Math.hypot(tx, tz)
      if (mag > T_MAX) { tx *= T_MAX / mag; tz *= T_MAX / mag }
      S.pitch += (Math.min(35, Math.atan2(tx, tz) / D2R) - S.pitch) * Math.min(1, dt * 1.6) // attitude follows the thrust vector
      const a = Math.hypot(tx, tz)
      ax = -a * Math.sin(S.pitch * D2R); av = a * Math.cos(S.pitch * D2R) - G; thr = a / T_MAX
      if ((S.vs < 0.6 && S.s < 6) || S.h < 45) this._phase('TERMINAL')
    } else if (S.phase === 'TERMINAL') {
      const vCmd = -(0.35 + 14.5 * (1 - Math.exp(-S.h / 28)))
      const aV = 2.2 * (vCmd - S.vh)
      const az = Math.min(T_MAX, Math.max(0, aV + G))
      av = az - G; thr = az / T_MAX
      ax = -1.2 * S.vs - 0.25 * S.s // residual along-track drift
      S.pitch += (0 - S.pitch) * Math.min(1, dt * 3)
      // cross-track drift nulled by the RCS quads (cold-gas micro-corrections)
      const alat = -1.6 * S.vlat - 0.5 * S.lat
      S.vlat += alat * dt; S.lat += S.vlat * dt
      if (alat > 0.05) rcs[1] = Math.min(1, alat); if (alat < -0.05) rcs[3] = Math.min(1, -alat)
      if (ax > 0.05) rcs[0] = Math.min(1, ax); if (ax < -0.05) rcs[2] = Math.min(1, -ax)
      if (S.h <= 0.7) { this._phase('CONTACT'); S.vImpact = null }
    } else if (S.phase === 'CONTACT') {
      av = -G; thr = 0 // engine cut at the contact probe: free fall
    }
    if (S.phase !== 'LANDED') {
      S.vs += ax * dt; S.s = Math.max(0, S.s - S.vs * dt)
      S.vh += av * dt; S.h += S.vh * dt
      if (S.h <= 0) {
        S.h = 0; S.vImpact = -S.vh; S.vh = 0; S.vs = 0
        S.vcomp = S.vImpact * 1.0 // impact → leg strokes compress
        S.landedAt = S.t; this._phase('LANDED')
      }
    } else {
      // damped spring (ζ≈0.3) on the leg stroke
      const w = 13, z = 0.3
      const acc = -w * w * S.comp - 2 * z * w * S.vcomp
      S.vcomp += acc * dt; S.comp += S.vcomp * dt
    }
    S.thr = thr; S.rcs = rcs; S.t += dt
  }

  // ------------------------------------------------------------ frame
  _frame() {
    const dt = Math.min(0.05, this.clock.getDelta()), now = this.clock.elapsedTime
    this.dust.m.uniforms.uTime.value = now
    if (this.ready && this.st) {
      const S = this.st
      // cinematic pacing: high braking runs ×2.4, the last metres in real time (physics unchanged)
      const ts = S.phase === 'BRAKING' ? (S.h > 90 ? 2.4 : 1.8) : S.phase === 'TERMINAL' && S.h > 10 ? 1.5 : 1
      this.timeScale = ts
      const sdt = dt * ts, sub = Math.ceil(sdt / (1 / 240))
      for (let i = 0; i < sub; i++) this._step(sdt / sub)
      // pose
      const side = new THREE.Vector3().crossVectors(this.approach, new THREE.Vector3(0, 1, 0)).normalize()
      const x = -this.approach.x * S.s + side.x * S.lat, z = -this.approach.z * S.s + side.z * S.lat
      const gnd = this.groundAt(x, z) ?? { y: this.padY, normal: new THREE.Vector3(0, 1, 0) }
      const groundY = S.phase === 'BRAKING' ? Math.max(gnd.y, this.padY) : this.padY
      const y = groundY + S.h - (S.phase === 'LANDED' ? Math.max(0, S.comp) * 0.35 : 0)
      this.lander.position.set(x, y, z)
      const pitchQ = new THREE.Quaternion().setFromAxisAngle(side, S.pitch * D2R)        // body axis tilts back (−approach): thrust brakes
      const yawQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), this.approach)
      const target = pitchQ.multiply(yawQ)
      if (S.phase === 'LANDED') {
        S.tilt.slerp(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), gnd.normal), Math.min(1, dt * 4))
        target.premultiply(S.tilt)
      }
      this.lander.quaternion.slerp(target, Math.min(1, dt * 8))
      // legs: stroke compression rotates each hinge about its local Z
      this.nodes.legs.forEach((l, i) => { if (l && this.legRest[i]) l.quaternion.copy(this.legRest[i]).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.max(-0.25, Math.min(0.25, S.comp * 0.12)))) })
      // plume, engine glow, RCS
      this.plume.userData.drive(S.phase === 'BRAKING' || S.phase === 'TERMINAL' ? Math.max(0.05, S.thr) : 0, now, S.h)
      this.engineLight.intensity = S.phase === 'BRAKING' || S.phase === 'TERMINAL' ? (25 + 70 * S.thr) * (0.9 + 0.1 * Math.random()) : 0
      this.puffs.forEach((p, i) => { if (p) p.material.opacity = (S.rcs?.[i] ?? 0) > 0 && Math.random() > 0.3 ? 0.55 * S.rcs[i] : 0 })
      // dust below 25 m while firing
      const alt = y - gnd.y
      const firing = S.phase === 'BRAKING' || S.phase === 'TERMINAL'
      this.skirt.position.set(x, gnd.y + 0.5, z)
      this.skirt.userData.drive(firing && alt < 30 ? Math.max(0.2, S.thr) * Math.pow(1 - alt / 30, 1.5) * 1.3 : 0, now)
      if (S.thr > 0.05 && alt < 25) this._emitDust(x, z, gnd.y, S.thr * (1 - alt / 25), dt, now)
      this._camera(dt, gnd)
      // telemetry
      const slope = Math.acos(Math.min(1, gnd.normal.y)) / D2R
      this.cb.onTelemetry?.({
        phase: S.phase, alt: Math.max(0, alt), vv: S.vh, vh: S.vs, pitch: S.pitch, thr: S.thr, slope,
        timeScale: this.timeScale, sunEl: this.env?.sunEl, power: this.env ? this.env.energy * 100 : null, t: S.t, vImpact: S.vImpact ?? null, source: this.env?.source,
      })
    }
    this.renderer.render(this.scene, this.camera)
  }

  _camera(dt, gnd) {
    const S = this.st, L = this.lander.position
    let goal, look
    if (S.phase === 'LANDED' && S.t - S.landedAt > 0.4) {
      // dramatic low angle beside the hero boulder, looking back at the lander
      // low hero shot from the sunward side, 35° off the Sun line: the lander front-lit, its long shadow
      // raking away across the regolith, the far massifs behind
      const sunH = this.sun.position.clone().setY(0).normalize()
      const dir = sunH.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.6)
      goal = L.clone().addScaledVector(dir, 15)
      goal.y = (this._h(goal.x, goal.z) ?? gnd.y) + 1.5
      look = L.clone().add(new THREE.Vector3(0, 2.4, 0))
    } else {
      const k = Math.min(1, S.h / 200)
      const side = new THREE.Vector3().crossVectors(this.approach, new THREE.Vector3(0, 1, 0)).normalize()
      goal = L.clone().addScaledVector(this.approach, -(18 + 55 * k)).addScaledVector(side, 10 + 30 * k).add(new THREE.Vector3(0, 6 + 30 * k, 0))
      look = L.clone().add(new THREE.Vector3(0, 2, 0))
    }
    const c = this.cam
    if (!c.pos) { c.pos = goal.clone(); c.look = look.clone() }
    // critically damped springs (ω = 2.2 / 6)
    const spring = (p, v, g, w) => { const a = g.clone().sub(p).multiplyScalar(w * w).addScaledVector(v, -2 * w); v.addScaledVector(a, dt); p.addScaledVector(v, dt) }
    spring(c.pos, c.vel, goal, 2.2); spring(c.look, c.lookVel, look, 6)
    const g = this.groundAt(c.pos.x, c.pos.z); if (g && c.pos.y < g.y + 0.6) c.pos.y = g.y + 0.6
    this.camera.position.copy(c.pos)
    if (S.thr > 0.3 && S.h < 60) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), 0).multiplyScalar(0.08 * S.thr))
    this.camera.lookAt(c.look)
  }

  _resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix()
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
