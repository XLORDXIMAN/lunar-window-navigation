// The system's single texture — a cloud of cobalt dots — arranged as a lunar
// south-pole heightfield in perspective. The Sun sits a few degrees above the
// horizon (as it does at the pole) and slowly circles; terrain shadows are cast
// per row by a horizon sweep, so craters fall into darkness and ridges catch light.
import { useEffect, useRef } from 'react'

const COLS = 190, ROWS = 96

// deterministic value noise
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s) }
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
const fbm = (x, y) => noise(x, y) * 0.55 + noise(x * 2.1, y * 2.1) * 0.28 + noise(x * 4.3, y * 4.3) * 0.17

// bowl-shaped crater with a raised rim
function crater(dx, dz, r, depth) {
  const d = Math.hypot(dx, dz) / r
  if (d > 1.6) return 0
  if (d < 1) return -depth * (1 - d * d) + depth * 0.25 * d ** 6
  return depth * 0.25 * Math.exp(-((d - 1) ** 2) * 18)
}
const CRATERS = [[0.15, 0.55, 0.32, 0.22], [-0.62, 0.32, 0.18, 0.12], [0.78, 0.25, 0.14, 0.08], [-0.2, 0.18, 0.09, 0.05], [0.5, 0.9, 0.22, 0.12], [-0.85, 0.8, 0.26, 0.15], [-0.45, 0.62, 0.08, 0.05]]

function height(x, z) {
  let h = (fbm(x * 2.2 + 3, z * 2.2) - 0.5) * 0.22 + Math.max(0, 0.9 - z) * 0.0
  for (const [cx, cz, r, dep] of CRATERS) h += crater(x - cx, z - cz, r, dep)
  // distant massif on the horizon
  h += Math.max(0, z - 0.75) * 0.9 * (fbm(x * 1.4 + 9, 4.2) - 0.25)
  return h
}

export default function ParticleTerrain({ className = '', onSun }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current, ctx = c.getContext('2d')
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    // precompute heights on a grid (x ∈ [-1.2, 1.2], z ∈ [0, 1])
    const H = new Float32Array(COLS * ROWS)
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) H[j * COLS + i] = height(-1.2 + (2.4 * i) / (COLS - 1), j / (ROWS - 1))
    const lit = new Float32Array(COLS * ROWS)
    let w = 0, h = 0, dpr = 1, raf = 0, visible = true, last = -1
    const t0 = performance.now()
    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1)
      const r = c.getBoundingClientRect(); w = c.width = Math.max(1, r.width * dpr); h = c.height = Math.max(1, r.height * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(c)
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(draw) }); io.observe(c)

    function shade(sunEl, fromRight) {
      // horizon sweep along each row: a point is lit if it rises above the running shadow line
      const tanE = Math.tan(sunEl), dx = 2.4 / (COLS - 1)
      for (let j = 0; j < ROWS; j++) {
        let line = -1e9
        for (let k = 0; k < COLS; k++) {
          const i = fromRight ? COLS - 1 - k : k, idx = j * COLS + i
          const hh = H[idx]
          line -= tanE * dx
          if (hh >= line) {
            // lit — brightness from slope facing the sun
            const n = fromRight ? (i > 0 ? H[idx] - H[idx - 1] : 0) : (i < COLS - 1 ? H[idx] - H[idx + 1] : 0)
            lit[idx] = Math.min(1, Math.max(0.15, 0.45 + n * 55 + sunEl * 3))
            line = hh
          } else lit[idx] = 0
        }
      }
    }

    function draw(now) {
      raf = 0
      const t = (now - t0) / 1000
      // Sun: 0.5°…5° above the horizon, azimuth swinging — like a polar day
      const sunEl = (2.6 + 2.2 * Math.sin(t * 0.18)) * Math.PI / 180
      const sunX = 0.5 + 0.38 * Math.cos(t * 0.05)
      const step = Math.floor(t * 12)
      if (step !== last || reduce) { shade(sunEl, sunX > 0.5); last = step }
      onSun?.({ el: sunEl * 180 / Math.PI, az: 90 + (sunX - 0.5) * 120 })

      ctx.clearRect(0, 0, w, h)
      const horizon = h * 0.30, f = w * 0.62, camY = 0.5, drift = reduce ? 0 : t * 0.006
      for (let j = ROWS - 1; j >= 0; j--) {
        const z = j / (ROWS - 1), depth = 0.18 + z * 2.4
        const fade = 1 - z * 0.55
        for (let i = 0; i < COLS; i++) {
          const x = -1.2 + (2.4 * i) / (COLS - 1) + Math.sin(z * 3 + drift) * 0.01
          const idx = j * COLS + i, hh = H[idx]
          const sx = w / 2 + (x / depth) * f, sy = horizon + ((camY - hh) / depth) * f * 0.42
          if (sx < -4 || sx > w + 4 || sy < 0 || sy > h + 4) continue
          const L = lit[idx]
          const s = Math.max(1.2, (2.4 - z * 1.4) * dpr)
          if (L > 0) {
            ctx.fillStyle = L > 0.7 ? `rgba(216,234,255,${0.6 * fade + 0.35})` : `rgba(64,120,255,${(0.55 + 0.45 * L) * fade + 0.1})`
          } else ctx.fillStyle = `rgba(31,88,242,${0.16 * fade + 0.04})`
          ctx.fillRect(sx - s / 2, sy - s / 2, s, s)
        }
      }
      // the Sun — a single warm point just above the far horizon
      const farY = horizon + (camY / 2.58) * f * 0.42
      const sunScreenX = w * sunX, sunScreenY = farY - h * 0.05 - (sunEl * 180 / Math.PI) * h * 0.012
      ctx.fillStyle = '#ff4105'; ctx.fillRect(sunScreenX - 3 * dpr, sunScreenY - 3 * dpr, 6 * dpr, 6 * dpr)
      ctx.strokeStyle = 'rgba(255,65,5,.35)'; ctx.lineWidth = dpr; ctx.strokeRect(sunScreenX - 9 * dpr, sunScreenY - 9 * dpr, 18 * dpr, 18 * dpr)
      if (!reduce && visible) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <canvas ref={ref} className={`block w-full h-full ${className}`} aria-hidden="true" />
}
