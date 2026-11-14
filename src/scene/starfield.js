import * as THREE from 'three';

// Звёздный фон (integration rewrite): ~22 000 звёзд со степенным распределением яркости и цветом по
// температуре (голубые O/B … оранжевые K/M), сгущение к плоскости Галактики и полоса Млечного Пути
// с тёмными пылевыми прожилками. Без атмосферы звёзды не мерцают — поэтому статичны.
// Совместимость: возвращает THREE.Points; material.opacity / transparent / scale работают как раньше.

// north galactic pole in the scene frame (decorative orientation, tilted ~60° to the ecliptic)
const NGP = new THREE.Vector3(0.42, 0.78, -0.46).normalize();

const STAR_VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSize; attribute vec3 aColor;
uniform float uPx, uOpacity;
varying vec3 vC; varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, aSize * uPx);
  vC = aColor; vA = uOpacity * clamp(aSize, 0.35, 1.0);
  #include <logdepthbuf_vertex>
}`;
const STAR_FS = /* glsl */ `
varying vec3 vC; varying float vA;
#include <logdepthbuf_pars_fragment>
void main(){
  #include <logdepthbuf_fragment>
  vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
  float core = exp(-r * r * 9.0), halo = exp(-r * 3.2) * 0.25;
  float a = (core + halo) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vC * a, 1.0);
}`;

const MW_VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
const MW_FS = /* glsl */ `
uniform vec3 uPole; uniform float uOpacity;
varying vec3 vDir;
#include <logdepthbuf_pars_fragment>
float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++){ s += a * n3(p); p *= 2.03; a *= .5; } return s; }
void main(){
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vDir);
  float b = dot(d, uPole);                                   // galactic latitude (sin)
  vec3 gc = normalize(cross(uPole, vec3(0.0, 0.0, 1.0)));   // direction of the galactic centre
  float l = dot(d, gc);                                      // brighter, wider towards the centre
  float width = 0.11 + 0.07 * smoothstep(-0.3, 1.0, l);
  float band = exp(-b * b / (width * width));
  float bulge = exp(-(pow(acos(clamp(l, -1., 1.)), 2.0) / 0.12 + b * b / 0.02)) * 0.9;
  float clouds = fbm(d * 7.0) * 0.8 + fbm(d * 19.0) * 0.4;
  float dust = smoothstep(0.42, 0.72, fbm(d * 11.0 + 3.0)) * exp(-b * b / (width * width * 0.18));
  float I = (band * (0.35 + clouds) + bulge) * (1.0 - 0.85 * dust);
  vec3 col = mix(vec3(0.55, 0.62, 0.82), vec3(1.0, 0.88, 0.72), clamp(bulge * 1.4 + l * 0.25, 0., 1.));
  gl_FragColor = vec4(col * I * 0.2 * uOpacity, 1.0);
}`;

function tempColor(u) {
  // u ∈ [0,1] → stellar colour, weighted towards white / yellow-white like a naked-eye sky
  const stops = [[0, [0.62, 0.72, 1.0]], [0.18, [0.8, 0.86, 1.0]], [0.45, [1.0, 0.98, 0.95]], [0.72, [1.0, 0.9, 0.74]], [1, [1.0, 0.72, 0.5]]];
  for (let i = 1; i < stops.length; i++) if (u <= stops[i][0]) {
    const [a, ca] = stops[i - 1], [b, cb] = stops[i], f = (u - a) / (b - a);
    return ca.map((x, k) => x + (cb[k] - x) * f);
  }
  return stops[stops.length - 1][1];
}

export function createStarfield(count = 22000, radius = 400) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    // 45 % of stars concentrated towards the galactic plane
    v.randomDirection();
    if (Math.random() < 0.45) {
      const b = v.dot(NGP);
      v.addScaledVector(NGP, -b * (1 - Math.random() ** 2 * 0.35) * 0.82).normalize();
    }
    v.multiplyScalar(radius);
    positions.set([v.x, v.y, v.z], i * 3);
    const m = Math.random() ** 5.5;                       // magnitude-like: very many faint, few bright
    const c = tempColor(Math.random() ** 0.9);
    const lum = 0.5 + m * 2.6;
    colors.set([c[0] * lum, c[1] * lum, c[2] * lum], i * 3);
    sizes[i] = 1.0 + m * 4.4;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader: STAR_VS,
    fragmentShader: STAR_FS,
    uniforms: { uPx: { value: 1 }, uOpacity: { value: 1 } },
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(geometry, material);
  stars.name = 'stars';
  stars.renderOrder = -1;
  stars.frustumCulled = false;

  const mw = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.02, 64, 32),
    new THREE.ShaderMaterial({
      vertexShader: MW_VS,
      fragmentShader: MW_FS,
      uniforms: { uPole: { value: NGP.clone() }, uOpacity: { value: 1 } },
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  mw.name = 'milkyway';
  mw.renderOrder = -2;
  mw.frustumCulled = false;
  stars.add(mw);

  // keep the old PointsMaterial-style API: material.opacity drives both layers
  stars.onBeforeRender = (renderer) => {
    material.uniforms.uPx.value = renderer.getPixelRatio();
    material.uniforms.uOpacity.value = material.opacity;
    mw.material.uniforms.uOpacity.value = material.opacity;
  };
  return stars;
}
