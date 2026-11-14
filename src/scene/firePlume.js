import * as THREE from 'three';

// Animated descent-engine flame (integration). Local units: metres, exhaust along −Y from the nozzle.
// Two nested open cones with a scrolling-turbulence shader (white-hot core → yellow → orange → red tail,
// soft volumetric edges from the view angle), a glow sprite at the nozzle exit and an orange point light
// that washes the ground as the lander gets low. drive(throttle, timeSec, altitudeM) animates it.

const VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uTime, uThr, uWobble;
varying vec2 vUv; varying vec3 vN, vV;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vUv = uv;
  vec3 p = position;
  float t = 1.0 - uv.y;                                       // 0 at nozzle → 1 at tail
  float wob = sin(uv.x * 18.85 + uTime * 31.0) * 0.5 + sin(uv.x * 12.57 - uTime * 23.0 + t * 9.0) * 0.5;
  p.xz *= 1.0 + uWobble * t * (0.08 * wob + 0.12 * (h(vec2(floor(uTime * 40.0), uv.x)) - 0.5));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;

const FS = /* glsl */ `
uniform float uTime, uThr, uCore;
varying vec2 vUv; varying vec3 vN, vV;
#include <logdepthbuf_pars_fragment>
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++){ s += a * n2(p); p *= 2.1; a *= .5; } return s; }
void main(){
  #include <logdepthbuf_fragment>
  float t = 1.0 - vUv.y;
  float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.6);       // soft volumetric falloff (no hard silhouette)
  vec2 q = vec2(vUv.x * 6.0, t * 5.0 - uTime * 9.0);
  float turb = fbm(q) * 0.65 + fbm(q * 2.3 + 7.0) * 0.35;
  float diamonds = 0.5 + 0.5 * cos(t * 34.0 - uTime * 2.0);              // faint shock diamonds near the exit
  float body = smoothstep(1.0, 0.15, t) * smoothstep(0.0, 0.035, t);
  float a = body * edge * (0.55 + 0.75 * turb) * (1.0 + 0.25 * diamonds * (1.0 - t)) * uThr;
  vec3 white = vec3(1.0, 0.97, 0.9), yellow = vec3(1.0, 0.78, 0.36), orange = vec3(1.0, 0.42, 0.1), red = vec3(0.55, 0.1, 0.04);
  float k = clamp(t * 1.25 - turb * 0.25 + uCore * -0.45, 0.0, 1.0);
  vec3 col = k < 0.25 ? mix(white, yellow, k / 0.25) : k < 0.6 ? mix(yellow, orange, (k - 0.25) / 0.35) : mix(orange, red, (k - 0.6) / 0.4);
  gl_FragColor = vec4(col * a * (1.6 + uCore * 1.4), 1.0);
}`;

let GLOW_TEX = null;
function glowTexture() {
  if (GLOW_TEX) return GLOW_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,250,235,1)');
  gr.addColorStop(0.18, 'rgba(255,214,140,.85)');
  gr.addColorStop(0.45, 'rgba(255,120,40,.28)');
  gr.addColorStop(1, 'rgba(255,60,10,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  GLOW_TEX = new THREE.CanvasTexture(c);
  GLOW_TEX.colorSpace = THREE.SRGBColorSpace;
  return GLOW_TEX;
}

function flame(rTop, rBottom, len, core) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, len, 40, 24, true).translate(0, -len / 2, 0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    uniforms: { uTime: { value: 0 }, uThr: { value: 0 }, uCore: { value: core ? 1 : 0 }, uWobble: { value: core ? 0.4 : 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 5;
  return m;
}

export function createFirePlume({ length = 8, radius = 1.1, light = true } = {}) {
  const g = new THREE.Group();
  g.name = 'FirePlume';
  const outer = flame(radius * 0.55, radius * 2.0, length, false);
  const inner = flame(radius * 0.35, radius * 0.75, length * 0.55, true);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(radius * 5);
  glow.position.y = -radius * 0.5;
  glow.renderOrder = 6;
  g.add(outer, inner, glow);
  let lamp = null;
  if (light) {
    // decay 1 keeps the wash readable from 50 m down to contact without blowing out (units: scene km)
    lamp = new THREE.PointLight(0xff9a4a, 0, 0.09, 1);
    lamp.position.y = -length * 0.45;
    g.add(lamp);
  }
  g.userData.drive = (thr, t, alt = 1e9) => {
    const on = thr > 0.01;
    g.visible = on;
    if (!on) { if (lamp) lamp.intensity = 0; return; }
    const flick = 0.9 + 0.1 * Math.sin(t * 47) * Math.sin(t * 13.7) + 0.05 * (Math.random() - 0.5);
    for (const m of [outer, inner]) {
      m.material.uniforms.uTime.value = t;
      m.material.uniforms.uThr.value = Math.min(1, 0.35 + 0.75 * thr) * flick;
    }
    // close to the ground the jet spreads sideways instead of lengthening
    const near = THREE.MathUtils.clamp(alt / 10, 0.35, 1);
    outer.scale.set(1 + (1 - near) * 0.9, (0.7 + 0.6 * thr) * near, 1 + (1 - near) * 0.9);
    inner.scale.set(1, (0.75 + 0.5 * thr) * near, 1);
    glow.material.opacity = (0.55 + 0.45 * thr) * flick;
    glow.scale.setScalar(radius * (4 + 2.5 * thr) * flick);
    if (lamp) lamp.intensity = 0.022 * thr * flick * THREE.MathUtils.clamp(1.4 - alt / 90, 0, 1.4);
  };
  g.userData.dispose = () => g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
  return g;
}

// Ground-hugging regolith blow-out (integration): a flat disc with radial streaks scrolling outward.
// In vacuum the grains fly on flat ballistic paths — a thin sheet with streaks, no billowing cloud.
const SKIRT_VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vP;
void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
const SKIRT_FS = /* glsl */ `
uniform float uTime, uStr, uR;
varying vec2 vP;
#include <logdepthbuf_pars_fragment>
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main(){
  #include <logdepthbuf_fragment>
  float r = length(vP) / uR, a = atan(vP.y, vP.x);
  if (r > 1.) discard;
  // soft sheet: broad noise lobes, faint streaking only in the outer part, haze under the nozzle
  float lobes = n2(vec2(a * 9.0, r * 2.0 - uTime * 1.6)) * 0.6 + n2(vec2(a * 23.0 + 5.0, r * 4.0 - uTime * 2.4)) * 0.4;
  float streak = n2(vec2(a * 60.0, r * 1.5 - uTime * 3.0));
  float sheet = smoothstep(0.25, 0.85, lobes) * (1.0 - smoothstep(0.3, 1.0, r)) * (0.75 + 0.25 * mix(1.0, streak, smoothstep(0.5, 0.8, r)));
  float core = exp(-r * 6.0);
  float alpha = (core * 0.7 + sheet * 0.55) * uStr;
  gl_FragColor = vec4(vec3(0.86, 0.83, 0.77), clamp(alpha, 0.0, 0.9));
}`;

export function createDustSkirt(radius) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 96).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      vertexShader: SKIRT_VS.replace('vP = position.xy', 'vP = position.xz'),
      fragmentShader: SKIRT_FS,
      uniforms: { uTime: { value: 0 }, uStr: { value: 0 }, uR: { value: radius } },
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
    }),
  );
  m.renderOrder = 4;
  m.frustumCulled = false;
  m.visible = false;
  m.userData.drive = (strength, t) => {
    m.visible = strength > 0.01;
    m.material.uniforms.uStr.value = Math.min(1, strength);
    m.material.uniforms.uTime.value = t;
  };
  return m;
}
