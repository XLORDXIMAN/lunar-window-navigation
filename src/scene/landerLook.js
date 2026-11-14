import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// creased normals: smooth across a panel, sharp at real edges (>32°) — neither smeared nor cardboard
const CREASED = new WeakMap();
function creased(geo) {
  if (!CREASED.has(geo)) CREASED.set(geo, toCreasedNormals(geo, THREE.MathUtils.degToRad(32)));
  return CREASED.get(geo);
}

// Lander "hero" materials (integration). The official NASA LM is decimated and untextured: smooth
// normals smear into blotches, flat normals look like cardboard. Fix: faceted base + a procedural
// crinkled-foil normal map (gold/black Kapton read as MLI blankets), mild metalness, and a small PMREM
// reflection environment applied ONLY to the lander (the regolith stays lit by the Sun alone).

let FOIL = null;
function foilNormal() {
  if (FOIL) return FOIL;
  const n = 256, h = new Float32Array(n * n);
  // crumpled sheet: sum of random ridges (sharp creases) + fine noise
  for (let k = 0; k < 90; k++) {
    const a = Math.random() * Math.PI, c = Math.cos(a), s = Math.sin(a), o = Math.random() * n, w = 2 + Math.random() * 10, amp = 0.4 + Math.random();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const d = ((x * c + y * s - o) % n + n) % n;
      h[y * n + x] += amp * Math.max(0, 1 - Math.abs(d - n / 2) / w);
    }
  }
  for (let i = 0; i < h.length; i++) h[i] += Math.random() * 0.25;
  const img = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const H = (xx, yy) => h[((yy + n) % n) * n + ((xx + n) % n)];
    const dx = (H(x + 1, y) - H(x - 1, y)) * 0.9, dy = (H(x, y + 1) - H(x, y - 1)) * 0.9;
    const l = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
    img[i] = (-dx / l * 0.5 + 0.5) * 255; img[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img[i + 2] = (1 / l * 0.5 + 0.5) * 255; img[i + 3] = 255;
  }
  FOIL = new THREE.DataTexture(img, n, n);
  FOIL.wrapS = FOIL.wrapT = THREE.RepeatWrapping;
  FOIL.repeat.set(3, 3);
  FOIL.generateMipmaps = true; FOIL.minFilter = THREE.LinearMipmapLinearFilter; FOIL.magFilter = THREE.LinearFilter;
  FOIL.needsUpdate = true;
  return FOIL;
}

const ENV = new WeakMap();
function envFor(renderer) {
  if (!renderer) return null;
  if (!ENV.has(renderer)) {
    const pm = new THREE.PMREMGenerator(renderer);
    ENV.set(renderer, pm.fromScene(new RoomEnvironment(), 0.04).texture);
    pm.dispose();
  }
  return ENV.get(renderer);
}

export function crispLander(object, renderer) {
  const env = envFor(renderer);
  object.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    if (!o.userData.creased && o.geometry?.attributes.position) { o.geometry = creased(o.geometry); o.userData.creased = true; }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m, idx) => {
      if (!m || m.userData.crisp) return;
      if (!m.isMeshStandardMaterial) return;
      const c = m.color, hsl = {}; c.getHSL(hsl);
      const gold = hsl.s > 0.35 && hsl.h > 0.06 && hsl.h < 0.17;
      const dark = hsl.l < 0.18;
      const mm = m.clone();
      mm.userData.crisp = true;
      mm.flatShading = false;
      if (mm.map) mm.map.anisotropy = 8;
      if (env) { mm.envMap = env; mm.envMapIntensity = gold ? 0.6 : 0.15; }
      if (gold || dark) {
        mm.normalMap = foilNormal(); mm.normalScale = gold ? new THREE.Vector2(0.95, 0.95) : new THREE.Vector2(0.3, 0.3);
        mm.metalness = gold ? 0.85 : 0.35; mm.roughness = gold ? 0.36 : 0.45;
        if (gold) mm.color.multiplyScalar(0.78).lerp(new THREE.Color(0.55, 0.36, 0.1), 0.25); // amber Kapton, not yellow paint
      } else {
        // aluminium / white thermal panels: faint quilting so flat facets read as material, not cardboard
        mm.normalMap = foilNormal(); mm.normalScale = new THREE.Vector2(0.18, 0.18);
        mm.metalness = 0.25; mm.roughness = 0.5;
        if (hsl.l > 0.7) mm.color.multiplyScalar(0.6);   // keep a shading gradient instead of clipping to white
      }
      if (Array.isArray(o.material)) o.material[idx] = mm; else o.material = mm;
    });
  });
}
