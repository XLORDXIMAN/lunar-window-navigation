// Hero visual: the Moon as a point cloud (~4000 points on a Fibonacci sphere).
// Points assemble from a scattered cloud in ~2 s, then the sphere slowly rotates.
// Darker regions are the real near-side lunar maria (approximate centres/radii),
// lit side = ice white, night side = faint cobalt "earthshine".
import { useEffect, useRef } from 'react'

const N = 6000
const DEG = Math.PI / 180
// [lat, lon, radius°] — approximate positions of major maria
const MARIA = [
  [33, -16, 17], [28, 17, 9], [8.5, 31, 10], [17, 59, 7.5], [-7.8, 51.3, 9], [-21, -16.6, 10],
  [18, -57, 24], [5, -35, 14], [-15, 35, 5], [-24, -39, 6], [13, 3.6, 5], [-10, -23, 6], [56, 1, 7], [44, 26, 5],
]
const BRIGHT = [[-43.3, -11.2, 4]] // Tycho

const angDist = (lat, lon, la, lo) =>
  Math.acos(Math.min(1, Math.sin(lat) * Math.sin(la * DEG) + Math.cos(lat) * Math.cos(la * DEG) * Math.cos(lon - lo * DEG))) / DEG

function build() {
  const pts = []
  const ga = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2
    // jitter breaks the Fibonacci moiré
    const lat = Math.asin(Math.max(-1, Math.min(1, y + (Math.random() - 0.5) * 0.012))), lon = ((i * ga) % (2 * Math.PI)) - Math.PI + (Math.random() - 0.5) * 0.04
    let alb = 1
    for (const [la, lo, r] of MARIA) { const d = angDist(lat, lon, la, lo); if (d < r) alb = Math.min(alb, 0.16 + 0.84 * Math.pow(d / r, 2.2)) }
    for (const [la, lo, r] of BRIGHT) if (angDist(lat, lon, la, lo) < r) alb = 1.25
    const a = Math.random() * 2 * Math.PI, rr = 1.3 + Math.random() * 1.6
    pts.push({ lat, lon, alb: alb * (0.85 + Math.random() * 0.3), sx: Math.cos(a) * rr, sy: Math.sin(a) * rr, delay: Math.random() * 0.35 })
  }
  return pts
}

export default function ParticleMoon({ className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current, ctx = c.getContext('2d')
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const pts = build()
    const tilt = 6.68 * DEG // view tilt (≈ lunar axis tilt to its orbit)
    const L = (() => { const v = [0.62, 0.28, 0.73]; const n = Math.hypot(...v); return v.map((x) => x / n) })()
    let w = 0, h = 0, dpr = 1, raf = 0, visible = true
    const t0 = performance.now()

    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1)
      const r = c.getBoundingClientRect()
      w = c.width = Math.max(1, r.width * dpr); h = c.height = Math.max(1, r.height * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(c)
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(draw) })
    io.observe(c)

    function draw(now) {
      raf = 0
      const el = (now - t0) / 1000
      const R = Math.min(w, h) * 0.38, cx = w * 0.5, cy = h * 0.5
      const rot = reduce ? 0.35 : 0.35 + el * 0.045
      ctx.clearRect(0, 0, w, h)

      ctx.strokeStyle = 'rgba(216,234,255,0.08)'; ctx.lineWidth = dpr
      ctx.beginPath(); ctx.ellipse(cx, cy, R * 1.55, R * 0.42, -0.25, 0, Math.PI * 2); ctx.stroke()

      const s = Math.sin(tilt), co = Math.cos(tilt)
      for (const p of pts) {
        const lo = p.lon - rot
        let x = Math.cos(p.lat) * Math.sin(lo), y = Math.sin(p.lat), z = Math.cos(p.lat) * Math.cos(lo)
        const y2 = y * co - z * s, z2 = y * s + z * co; y = y2; z = z2
        if (z < 0) continue
        const k = reduce ? 1 : Math.min(1, Math.max(0, (el - p.delay) / 1.8))
        const e = 1 - Math.pow(1 - k, 3)
        const px = cx + (p.sx * (1 - e) + x * e) * R, py = cy - (p.sy * (1 - e) + y * e) * R
        const lit = Math.max(0, x * L[0] + y * L[1] + z * L[2])
        const b = Math.min(1, p.alb * Math.pow(lit, 0.7))
        const size = (1.1 + z * 0.9) * dpr
        ctx.fillStyle = b > 0.04
          ? `rgba(216,234,255,${(0.18 + 0.82 * b) * (0.35 + 0.65 * e)})`
          : `rgba(31,88,242,${0.22 * z * (0.35 + 0.65 * e)})`
        ctx.fillRect(px - size / 2, py - size / 2, size, size)
      }

      // Earth on a schematic orbit — hidden when behind the Moon
      const ea = reduce ? 0.6 : el * 0.25 + 0.6
      const ex = Math.cos(ea) * R * 1.55, ey = Math.sin(ea) * R * 0.42, ez = Math.sin(ea)
      const rx = ex * Math.cos(-0.25) - ey * Math.sin(-0.25), ry = ex * Math.sin(-0.25) + ey * Math.cos(-0.25)
      if (!(ez < 0 && Math.hypot(rx, ry) < R)) {
        ctx.fillStyle = '#1f58f2'; ctx.beginPath(); ctx.arc(cx + rx, cy + ry, 4.5 * dpr, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = 'rgba(91,140,255,0.5)'; ctx.beginPath(); ctx.arc(cx + rx, cy + ry, 9 * dpr, 0, Math.PI * 2); ctx.stroke()
      }
      // Sun direction marker
      const sx = cx + L[0] * R * 2.1, sy = cy - L[1] * R * 2.1
      ctx.fillStyle = '#ff4105'; ctx.fillRect(sx - 2.5 * dpr, sy - 2.5 * dpr, 5 * dpr, 5 * dpr)
      ctx.strokeStyle = 'rgba(255,65,5,0.35)'; ctx.setLineDash([2 * dpr, 6 * dpr])
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(cx + L[0] * R * 1.08, cy - L[1] * R * 1.08); ctx.stroke(); ctx.setLineDash([])

      if (!reduce && visible) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect() }
  }, [])
  return <canvas ref={ref} className={`block w-full h-full ${className}`} aria-hidden="true" />
}
