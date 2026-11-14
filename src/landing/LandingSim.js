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

export const G = 1.62
const D2R = Math.PI / 180
const T_MAX = 5.2 // m/s² — thrust-to-mass limit (LM-class)

/** (az from north clockwise, el above horizon) → unit vector in glTF space (X east, Y up, Z south). */
export function dirFromAzEl(azDeg, elDeg, out = new THREE.Vector3()) {
  const a = azDeg * D2R, e = elDeg * D2R
  return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e))
}

// ---------------------------------------------------------------- shaders
const PLUME_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`
const PLUME_FS = `uniform float uT; uniform float uThr; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  float along = 1. - vUv.y;                         // 0 at nozzle → 1 at tail
  float rim = pow(1. - abs(dot(vN, vV)), 1.6);       // brighter at grazing angles: volumetric look
  float n = h(vec2(floor(vUv.x*24.), floor((vUv.y + uT*6.)*18.)));
  float core = exp(-along*3.2) * (0.75 + 0.25*n);
  vec3 col = mix(vec3(1., .97, .92), vec3(.55, .7, 1.), smoothstep(0., .7, along));
  float a = (core*0.9 + rim*0.35*(1.-along)) * uThr;
  gl_FragColor = vec4(col * a * 1.6, a);
}`
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

export class LandingSim {
  constructor(container, { onTelemetry, onPhase, onReady, onError } = {}) {
    this.container = container
    this.cb = { onTelemetry, onPhase, onReady, onError }
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }))
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75))
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.toneMappingExposure = 1.5
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(r.domElement)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x000000) // airless: black sky, no fill light anywhere
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 9000)
    this.camera.position.set(-80, 60, 120)

    const sun = (this.sun = new THREE.DirectionalLight(0xfff4e6, 5.2))
    sun.castShadow = true
    sun.shadow.mapSize.set(4096, 4096)
    const sc = sun.shadow.camera
    sc.left = -140; sc.right = 140; sc.top = 140; sc.bottom = -140; sc.near = 1; sc.far = 1600
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6
    this.scene.add(sun, sun.target)

    this._stars()
    this._sky()
    this.dust = this._dust(6000)
    this.clock = new THREE.Clock()
    this.ray = new THREE.Raycaster()
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
      const [ter, lan] = await Promise.all([gl.loadAsync('/models/diorama/lunar_terrain.glb'), gl.loadAsync('/models/diorama/lander.glb')])
      this.terrain = ter.scene
      this.terrain.traverse((o) => {
        if (o.isMesh) {
          o.receiveShadow = true; o.castShadow = true
          const m = o.material
          if (m) { m.envMapIntensity = 0; m.metalness = 0; if (m.normalMap) m.normalScale.set(1.1, 1.1) }
        }
      })
      this.scene.add(this.terrain)
      this.groundMesh = this.terrain.getObjectByName('lunar_terrain')
      this.heroBoulder = this.terrain.getObjectByName('hero_boulder')?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3(11, 1.5, 9)
      this.lander = lan.scene
      this.lander.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
      this.nodes = {
        thruster: this.lander.getObjectByName('thruster_main'),
        rcs: [1, 2, 3, 4].map((i) => this.lander.getObjectByName(`rcs_${i}`)),
        legs: [1, 2, 3, 4].map((i) => this.lander.getObjectByName(`landing_leg_${i}`)),
      }
      this.legRest = this.nodes.legs.map((l) => l?.quaternion.clone())
      this.scene.add(this.lander)
      this._plume()
      this._rcsPuffs()
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
    const n = 5000, p = new Float32Array(n * 3), c = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u)
      p.set([s * Math.cos(a) * 4000, Math.abs(u) * 4000 - 200, s * Math.sin(a) * 4000], i * 3)
      const b = 0.4 + Math.random() ** 3 * 0.9
      c.set([b, b, b * (0.9 + Math.random() * 0.2)], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false }))
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

  /** 3D horizon silhouette at 900 m from the pad, heights from the 360° elevation profile (deg, az 0..359). */
  _buildHorizon(profile) {
    if (this.horizonRing) { this.scene.remove(this.horizonRing); this.horizonRing.geometry.dispose() }
    if (!profile?.length) return
    // 4 samples per degree with a fractal ridge so it reads as mountains, not a wall
    const R = 900, N = profile.length * 4, pos = [], idx = []
    const ridge = (i) => { let v = 0, a = 1, f = 1; for (let k = 0; k < 5; k++) { v += a * Math.sin(i * 0.11 * f + k * 1.7) * Math.sin(i * 0.037 * f + k); a *= 0.5; f *= 2.1 } return v }
    const eye = (this.padY ?? 0) + 2
    for (let i = 0; i <= N; i++) {
      const az = (i % N) * (360 / N), el = profile[Math.floor(i / 4) % profile.length]
      const d = dirFromAzEl(az, 0)
      const top = eye + R * Math.tan(Math.max(-3, el) * D2R) + 6 + ridge(i) * 9
      pos.push(d.x * R, (this.padY ?? 0) - 60, d.z * R, d.x * R, top, d.z * R)
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals()
    this.horizonRing = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x141415, roughness: 1, metalness: 0, side: THREE.DoubleSide }))
    this.horizonRing.receiveShadow = false
    this.scene.add(this.horizonRing)
    if (!this.apron) {
      // ground from the diorama edge out to the horizon ring, so there is no 'table edge'
      const ap = new THREE.RingGeometry(470, 1000, 128, 4).rotateX(-Math.PI / 2)
      this.apron = new THREE.Mesh(ap, new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 1, metalness: 0 }))
      this.apron.receiveShadow = true
      this.scene.add(this.apron)
    }
    this.apron.position.y = (this.padY ?? 0) - 4
  }

  _plume() {
    const geo = new THREE.CylinderGeometry(0.35, 2.6, 9, 32, 1, true).translate(0, -4.5, 0)
    this.plumeMat = new THREE.ShaderMaterial({ vertexShader: PLUME_VS, fragmentShader: PLUME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uT: { value: 0 }, uThr: { value: 0 } } })
    this.plume = new THREE.Mesh(geo, this.plumeMat)
    ;(this.nodes.thruster ?? this.lander).add(this.plume)
    this.engineLight = new THREE.PointLight(0xbfd2ff, 0, 40, 2)
    ;(this.nodes.thruster ?? this.lander).add(this.engineLight)
    this.engineLight.position.set(0, -2, 0)
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
  groundAt(x, z) {
    if (!this.groundMesh) return null
    this.ray.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0))
    const hit = this.ray.intersectObject(this.groundMesh, true)[0]
    if (!hit) return null
    return { y: hit.point.y, normal: this._normalAt(x, z, hit.point.y) }
  }

  /** Terrain normal from heights 1 m apart (robust to Draco-quantised face normals). */
  _normalAt(x, z, y0) {
    const h = (px, pz) => { this.ray.set(new THREE.Vector3(px, 500, pz), new THREE.Vector3(0, -1, 0)); return this.ray.intersectObject(this.groundMesh, true)[0]?.point.y ?? y0 }
    const ax = h(x - 2, z), bx = h(x + 2, z), az = h(x, z - 2), bz = h(x, z + 2)
    return new THREE.Vector3(-(bx - ax) / 4, 1, -(bz - az) / 4).normalize()
  }

  /** env: { sunAz, sunEl, earthAz, earthEl, profile[360], energy (0..1), source } */
  setEnvironment(env) {
    this.env = env
    const sd = dirFromAzEl(env.sunAz, env.sunEl), ed = dirFromAzEl(env.earthAz, env.earthEl)
    this.sun.position.copy(sd).multiplyScalar(700); this.sun.target.position.set(0, this.padY ?? 0, 0)
    this.sunSprite.position.copy(sd).multiplyScalar(3500)
    const dist = 3000, rad = dist * Math.tan(0.95 * D2R)
    this.earth.position.copy(ed).multiplyScalar(dist); this.earth.scale.setScalar(rad)
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
      let tx = aH, tz = aV + G
      const mag = Math.hypot(tx, tz)
      if (mag > T_MAX) { tx *= T_MAX / mag; tz *= T_MAX / mag }
      S.pitch += (Math.min(35, Math.atan2(tx, tz) / D2R) - S.pitch) * Math.min(1, dt * 1.6) // attitude follows the thrust vector
      const a = Math.hypot(tx, tz)
      ax = -a * Math.sin(S.pitch * D2R); av = a * Math.cos(S.pitch * D2R) - G; thr = a / T_MAX
      if ((S.vs < 0.6 && S.s < 6) || S.h < 45) this._phase('TERMINAL')
    } else if (S.phase === 'TERMINAL') {
      const vCmd = -(0.5 + 14.5 * (1 - Math.exp(-S.h / 28)))
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
      if (S.h <= 1.5) { this._phase('CONTACT'); S.vImpact = null }
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
      const sub = Math.ceil(dt / (1 / 240))
      for (let i = 0; i < sub; i++) this._step(dt / sub)
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
      this.plumeMat.uniforms.uT.value = now; this.plumeMat.uniforms.uThr.value = S.thr * (0.92 + Math.random() * 0.08)
      this.plume.scale.set(1, 0.5 + S.thr * 0.9, 1)
      this.engineLight.intensity = S.thr * 60
      this.puffs.forEach((p, i) => { if (p) p.material.opacity = (S.rcs?.[i] ?? 0) > 0 && Math.random() > 0.3 ? 0.55 * S.rcs[i] : 0 })
      // dust below 25 m while firing
      const alt = y - gnd.y
      if (S.thr > 0.05 && alt < 25) this._emitDust(x, z, gnd.y, S.thr * (1 - alt / 25), dt, now)
      this._camera(dt, gnd)
      // telemetry
      const slope = Math.acos(Math.min(1, gnd.normal.y)) / D2R
      this.cb.onTelemetry?.({
        phase: S.phase, alt: Math.max(0, alt), vv: S.vh, vh: S.vs, pitch: S.pitch, thr: S.thr, slope,
        sunEl: this.env?.sunEl, power: this.env ? this.env.energy * 100 : null, t: S.t, vImpact: S.vImpact ?? null, source: this.env?.source,
      })
    }
    this.renderer.render(this.scene, this.camera)
  }

  _camera(dt, gnd) {
    const S = this.st, L = this.lander.position
    let goal, look
    if (S.phase === 'LANDED' && S.t - S.landedAt > 0.4) {
      // dramatic low angle beside the hero boulder, looking back at the lander
      const b = this.heroBoulder.clone()
      const away = b.clone().sub(L).setY(0).normalize()
      goal = b.clone().addScaledVector(away, 3.5).add(new THREE.Vector3(0, 0.9 - (b.y - gnd.y) * 0.5, 0))
      look = L.clone().add(new THREE.Vector3(0, 2.2, 0))
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
