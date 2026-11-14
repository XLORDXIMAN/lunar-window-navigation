// Background spacecraft flown by scroll, using the team's real NASA models (public/models):
//   LRO (NASA 3D Resources) drifts across during the first half of the page,
//   SLS climbs diagonally with an engine glow and exhaust trail during the second half.
// One transparent three.js canvas behind the content; position = smoothed page scroll progress.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const clamp = (x) => Math.min(1, Math.max(0, x))
const ease = (x) => x * x * (3 - 2 * x)
const seg = (p, a, b) => clamp((p - a) / (b - a))

function fit(obj, size) {
  const box = new THREE.Box3().setFromObject(obj), s = new THREE.Vector3(), c = new THREE.Vector3()
  box.getSize(s); box.getCenter(c)
  obj.position.sub(c)
  const pivot = new THREE.Group(); pivot.add(obj)
  pivot.scale.setScalar(size / Math.max(s.x, s.y, s.z))
  return pivot
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,214,150,.9)'); gr.addColorStop(0.5, 'rgba(255,140,60,.35)'); gr.addColorStop(1, 'rgba(255,90,20,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}

export default function SpaceTraffic() {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let renderer
    try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' }) } catch { return }
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200); camera.position.set(0, 0, 14)
    scene.add(new THREE.AmbientLight(0x6a7cff, 0.25))
    const sun = new THREE.DirectionalLight(0xfff1dc, 3.2); sun.position.set(6, 5, 8); scene.add(sun)
    const rim = new THREE.DirectionalLight(0x8fd3ff, 1.4); rim.position.set(-8, -2, -6); scene.add(rim)

    const resize = () => { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
    resize(); addEventListener('resize', resize)

    const loader = new GLTFLoader()
    let lro = null, sls = null, flame = null
    const trail = { geo: new THREE.BufferGeometry(), pts: [], max: 90 }
    trail.geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(trail.max * 3), 3))
    const trailMat = new THREE.PointsMaterial({ color: 0xffc58a, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })
    const trailPts = new THREE.Points(trail.geo, trailMat); scene.add(trailPts)

    loader.load('/models/lro.glb', (g) => { lro = fit(g.scene, 2.6); lro.visible = false; scene.add(lro) }, undefined, () => {})
    loader.load('/models/sls.glb', (g) => {
      sls = new THREE.Group(); sls.add(fit(g.scene, 4.2)); sls.visible = false
      flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
      flame.scale.set(1.6, 1.6, 1); flame.position.set(0, -2.25, 0); sls.add(flame)
      scene.add(sls)
    }, undefined, () => {})

    let p = 0, raf = 0, t0 = performance.now()
    const tick = (now) => {
      const doc = document.documentElement
      const target = doc.scrollHeight > innerHeight ? scrollY / (doc.scrollHeight - innerHeight) : 0
      p += (target - p) * 0.07
      const t = (now - t0) / 1000
      // LRO: drifts right → left across the upper half while the visitor reads the first chapters
      if (lro) {
        const k = seg(p, 0.06, 0.5)
        lro.visible = k > 0 && k < 1
        const e = ease(k)
        lro.position.set(9 - e * 18, 2.6 - e * 2.2 + Math.sin(t * 0.6) * 0.08, -4)
        lro.rotation.set(0.35 + Math.sin(t * 0.3) * 0.1, t * 0.25 + k * 2.4, 0.2)
      }
      // SLS: climbs from bottom-left to top-right, nose along the path, flame flickers
      if (sls) {
        const k = seg(p, 0.46, 0.94)
        sls.visible = k > 0 && k < 1
        const e = ease(k)
        const x = -10 + e * 20, y = -6.5 + e * 13
        sls.position.set(x, y, -6)
        sls.rotation.set(0, Math.sin(t * 0.4) * 0.15, -Math.atan2(20, 13)) // nose (+Y) along the climb path
        sls.updateMatrixWorld()
        if (flame) { const f = 1.4 + Math.sin(t * 40) * 0.15 + Math.random() * 0.1; flame.scale.set(f, f * 1.6, 1) }
        // exhaust trail in world space
        if (sls.visible) {
          const tail = new THREE.Vector3(0, -2.4, 0).applyMatrix4(sls.matrixWorld)
          trail.pts.unshift(tail.add(new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, 0)))
        }
        if (trail.pts.length > trail.max || (!sls.visible && trail.pts.length)) trail.pts.pop()
        const arr = trail.geo.attributes.position.array
        arr.fill(0)
        trail.pts.forEach((v, i) => { arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z })
        trail.geo.attributes.position.needsUpdate = true; trail.geo.setDrawRange(0, trail.pts.length)
      }
      if ((lro?.visible || sls?.visible || trail.pts.length) && !document.hidden) renderer.render(scene, camera)
      else renderer.clear()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); renderer.dispose() }
  }, [])
  return <canvas ref={ref} className="fixed inset-0 w-full h-full pointer-events-none -z-[5]" aria-hidden="true" />
}
