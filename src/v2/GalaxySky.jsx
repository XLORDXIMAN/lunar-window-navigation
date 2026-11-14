// Site-wide galaxy: a procedurally rendered Milky Way band (dense star cloud, warm core,
// blue arms, dark dust lanes, faint nebulae) baked once to an offscreen canvas, then drawn
// every frame with a slow rotation + scroll parallax. Three layers of foreground stars
// drift, twinkle and move at different depths; an occasional shooting star crosses.
import { useEffect, useRef } from 'react'

function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s) }
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
const fbm = (x, y) => noise(x, y) * 0.5 + noise(x * 2.03, y * 2.03) * 0.25 + noise(x * 4.1, y * 4.1) * 0.15 + noise(x * 8.3, y * 8.3) * 0.1
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }

function bakeGalaxy(size) {
  const W = size, H = Math.round(size * 0.62)
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')
  const cy = H / 2, band = H * 0.16
  // 1) soft glow of unresolved stars along the band
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * W, y = cy + gauss() * band * 0.55
    const core = Math.exp(-Math.pow((x - W * 0.68) / (W * 0.16), 2))
    const r = band * (0.6 + Math.random() * 1.4)
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    const col = core > 0.4 ? `255,214,170` : Math.random() < 0.5 ? `150,170,255` : `190,160,255`
    grad.addColorStop(0, `rgba(${col},${0.04 + core * 0.035})`); grad.addColorStop(1, `rgba(${col},0)`)
    g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // 2) the star cloud itself (density ~ band profile × noise)
  const N = Math.round(W * H / 22)
  for (let i = 0; i < N; i++) {
    const x = Math.random() * W, y = cy + gauss() * band * (0.7 + 0.6 * noise(x / 300, 3))
    const n = fbm(x / 260, y / 260)
    if (Math.random() > 0.25 + n * 0.9) continue
    const core = Math.exp(-Math.pow((x - W * 0.68) / (W * 0.14), 2) - Math.pow((y - cy) / (band * 0.9), 2))
    const a = 0.25 + Math.random() * 0.6
    const r = Math.random() < 0.985 ? 0.5 + Math.random() * 0.6 : 1 + Math.random() * 1.2
    g.fillStyle = core > 0.3 ? `rgba(255,${222 + Math.random() * 30 | 0},${185 + Math.random() * 40 | 0},${a})` : Math.random() < 0.2 ? `rgba(180,200,255,${a})` : `rgba(235,240,255,${a})`
    g.fillRect(x, y, r, r)
  }
  // 3) dark dust lanes (cut light out along a wavy filament)
  g.globalCompositeOperation = 'destination-out'
  for (let x = 0; x < W; x += 3) {
    for (let k = 0; k < 2; k++) {
      const yy = cy + (k ? -0.12 : 0.05) * band * 3 + Math.sin(x / 420 + k * 2) * band * 0.35 + (fbm(x / 180, k * 9) - 0.5) * band * 0.9
      const w = band * (0.18 + fbm(x / 140, 7 + k) * 0.35)
      const grad = g.createLinearGradient(0, yy - w, 0, yy + w)
      grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.5, `rgba(0,0,0,${0.35 + fbm(x / 90, k) * 0.4})`); grad.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grad; g.fillRect(x, yy - w, 3, w * 2)
    }
  }
  g.globalCompositeOperation = 'source-over'
  // 4) a few coloured nebulae
  for (const [fx, fy, col, rr] of [[0.22, 0.42, '120,90,255', 0.22], [0.78, 0.55, '255,90,150', 0.16], [0.42, 0.6, '80,160,255', 0.2]]) {
    const x = W * fx, y = H * fy, r = H * rr
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, `rgba(${col},.10)`); grad.addColorStop(1, `rgba(${col},0)`)
    g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  return c
}

const LAYERS = [
  { density: 1 / 3200, size: [0.4, 0.9], par: 0.04, drift: 0.004, alpha: 0.6 },
  { density: 1 / 9000, size: [0.8, 1.5], par: 0.12, drift: 0.009, alpha: 0.8 },
  { density: 1 / 30000, size: [1.3, 2.3], par: 0.26, drift: 0.018, alpha: 1 },
]

export default function GalaxySky() {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current, ctx = c.getContext('2d')
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0, dpr = 1, raf = 0, stars = [], shoot = null, last = performance.now(), sy = scrollY, galaxy = null
    const t0 = performance.now()
    let bakedFor = 0
    const resize = () => {
      dpr = 1 // soft background: native-resolution pixels are wasted here
      w = c.width = innerWidth * dpr; h = c.height = innerHeight * dpr
      const want = Math.round(Math.hypot(innerWidth, innerHeight) * 1.15)
      if (!galaxy || Math.abs(want - bakedFor) / bakedFor > 0.15) { galaxy = bakeGalaxy(want); bakedFor = want }
      stars = []
      LAYERS.forEach((L, li) => {
        const n = Math.round(innerWidth * innerHeight * L.density)
        for (let i = 0; i < n; i++) stars.push({ x: Math.random() * w, y: Math.random() * h * 1.5, l: li,
          r: (L.size[0] + Math.random() * (L.size[1] - L.size[0])) * dpr, p: Math.random() * 6.283, s: 0.5 + Math.random() * 1.6,
          tint: Math.random() < 0.15 ? '191,214,255' : Math.random() < 0.08 ? '255,226,170' : '236,242,255' })
      })
    }
    resize()
    let rt = 0; const onResize = () => { clearTimeout(rt); rt = setTimeout(resize, 200) }
    addEventListener('resize', onResize)

    let lastDraw = 0
    const moonCovers = () => { const m = document.getElementById('moon'); if (!m) return false; const r = m.getBoundingClientRect(); return r.top <= 1 && r.bottom >= innerHeight - 1 }
    const draw = (now) => {
      raf = requestAnimationFrame(draw)
      if (now - lastDraw < 33 || document.hidden || moonCovers()) return // ~30 fps, and idle behind the full-screen Moon
      lastDraw = now
      const dt = Math.min(66, now - last); last = now
      sy += (scrollY - sy) * 0.08 // smoothed scroll for buttery parallax
      const t = (now - t0) / 1000, S = sy * dpr
      ctx.clearRect(0, 0, w, h)
      // galaxy band: slow rotation + scroll parallax
      if (galaxy) {
        ctx.save()
        ctx.translate(w * 0.5, h * 0.62 - S * 0.06)
        ctx.rotate(-0.42 + (reduce ? 0 : t * 0.0022) + S * 0.00008)
        ctx.scale(dpr, dpr)
        ctx.globalAlpha = 0.58
        ctx.drawImage(galaxy, -galaxy.width / 2, -galaxy.height / 2)
        ctx.restore(); ctx.globalAlpha = 1
      }
      for (const s of stars) {
        const L = LAYERS[s.l], H15 = h * 1.5
        const x = ((s.x + (reduce ? 0 : t * L.drift * 60 * dpr)) % w + w) % w
        const y = ((s.y - S * L.par) % H15 + H15) % H15
        if (y > h + 4) continue
        const tw = reduce ? 0.85 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.s + s.p))
        ctx.fillStyle = `rgba(${s.tint},${L.alpha * tw})`
        if (s.l === 2) {
          ctx.fillRect(x - s.r * 1.8, y - s.r * 0.16, s.r * 3.6, s.r * 0.32)
          ctx.fillRect(x - s.r * 0.16, y - s.r * 1.8, s.r * 0.32, s.r * 3.6)
        }
        const d = s.r * 1.1; ctx.fillRect(x - d / 2, y - d / 2, d, d)
      }
      if (!reduce) {
        if (!shoot && Math.random() < 0.003) {
          const ang = (18 + Math.random() * 26) * Math.PI / 180
          shoot = { x: Math.random() * w * 0.8, y: Math.random() * h * 0.45, vx: Math.cos(ang), vy: Math.sin(ang), v: (0.9 + Math.random() * 0.7) * dpr, life: 1 }
        }
        if (shoot) {
          const len = 150 * dpr * shoot.life
          const gr = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * len, shoot.y - shoot.vy * len)
          gr.addColorStop(0, `rgba(255,255,255,${0.95 * shoot.life})`); gr.addColorStop(1, 'rgba(191,214,255,0)')
          ctx.strokeStyle = gr; ctx.lineWidth = 1.5 * dpr; ctx.lineCap = 'round'
          ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - shoot.vx * len, shoot.y - shoot.vy * len); ctx.stroke()
          shoot.x += shoot.vx * shoot.v * dt; shoot.y += shoot.vy * shoot.v * dt; shoot.life -= dt / 1100
          if (shoot.life <= 0) shoot = null
        }
      }
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); clearTimeout(rt); removeEventListener('resize', onResize) }
  }, [])
  return <canvas ref={ref} className="fixed inset-0 w-full h-full pointer-events-none -z-10" aria-hidden="true" />
}
