// Site-wide living sky: three depth layers of twinkling stars with scroll parallax,
// a few tinted stars (ice / cyan / gold) and an occasional shooting star.
import { useEffect, useRef } from 'react'

const LAYERS = [
  { density: 1 / 2600, size: [0.5, 1.0], speed: 0.04, alpha: 0.55 }, // far
  { density: 1 / 7000, size: [0.9, 1.6], speed: 0.10, alpha: 0.8 },  // mid
  { density: 1 / 26000, size: [1.4, 2.4], speed: 0.22, alpha: 1 },   // near
]
const TINTS = ['234,242,255', '234,242,255', '234,242,255', '191,234,255', '255,226,150']

export default function StarSky() {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current, ctx = c.getContext('2d')
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0, dpr = 1, raf = 0, stars = [], shoot = null, last = performance.now()
    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1)
      w = c.width = innerWidth * dpr; h = c.height = innerHeight * dpr
      stars = []
      LAYERS.forEach((L, li) => {
        const n = Math.round(innerWidth * innerHeight * L.density)
        for (let i = 0; i < n; i++) stars.push({
          x: Math.random() * w, y: Math.random() * h * 1.6, l: li,
          r: (L.size[0] + Math.random() * (L.size[1] - L.size[0])) * dpr,
          p: Math.random() * Math.PI * 2, s: 0.6 + Math.random() * 1.8,
          tint: TINTS[Math.floor(Math.random() * TINTS.length)],
        })
      })
    }
    resize(); addEventListener('resize', resize)

    const draw = (now) => {
      const dt = Math.min(50, now - last); last = now
      const sy = scrollY * dpr
      ctx.clearRect(0, 0, w, h)
      for (const s of stars) {
        const L = LAYERS[s.l]
        const y = ((s.y - sy * L.speed) % (h * 1.6) + h * 1.6) % (h * 1.6)
        if (y > h + 4) continue
        const tw = reduce ? 0.8 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(now / 1000 * s.s + s.p))
        const a = L.alpha * tw
        ctx.fillStyle = `rgba(${s.tint},${a})`
        if (s.l === 2) {
          // near stars get a soft cross glint
          ctx.fillRect(s.x - s.r * 1.8, y - s.r * 0.18, s.r * 3.6, s.r * 0.36)
          ctx.fillRect(s.x - s.r * 0.18, y - s.r * 1.8, s.r * 0.36, s.r * 3.6)
          ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(s.x, y, s.r * 1.6, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1
        }
        ctx.beginPath(); ctx.arc(s.x, y, s.r * 0.6, 0, 6.283); ctx.fill()
      }
      if (!reduce) {
        if (!shoot && Math.random() < 0.0035) {
          const ang = (20 + Math.random() * 25) * Math.PI / 180
          shoot = { x: Math.random() * w * 0.8, y: Math.random() * h * 0.45, vx: Math.cos(ang), vy: Math.sin(ang), v: (0.9 + Math.random() * 0.7) * dpr, life: 1 }
        }
        if (shoot) {
          const len = 140 * dpr * shoot.life
          const g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * len, shoot.y - shoot.vy * len)
          g.addColorStop(0, `rgba(255,255,255,${0.95 * shoot.life})`); g.addColorStop(0.3, `rgba(191,234,255,${0.5 * shoot.life})`); g.addColorStop(1, 'rgba(191,234,255,0)')
          ctx.strokeStyle = g; ctx.lineWidth = 1.6 * dpr; ctx.lineCap = 'round'
          ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - shoot.vx * len, shoot.y - shoot.vy * len); ctx.stroke()
          shoot.x += shoot.vx * shoot.v * dt; shoot.y += shoot.vy * shoot.v * dt; shoot.life -= dt / 1100
          if (shoot.life <= 0) shoot = null
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={ref} className="fixed inset-0 w-full h-full pointer-events-none -z-10 opacity-50" aria-hidden="true" />
}
