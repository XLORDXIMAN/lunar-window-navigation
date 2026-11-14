// Animated twinkling starfield with occasional shooting stars (fixed background)
import { useEffect, useRef } from 'react'

export default function Starfield() {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current, ctx = c.getContext('2d')
    let w, h, raf, stars = [], shoot = null
    const resize = () => {
      w = c.width = innerWidth * devicePixelRatio; h = c.height = innerHeight * devicePixelRatio
      stars = Array.from({ length: Math.round((innerWidth * innerHeight) / 4500) }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: (Math.random() * 1.2 + 0.2) * devicePixelRatio,
        p: Math.random() * 6.28, s: 0.5 + Math.random() * 1.5, hue: Math.random() < 0.15 ? 200 : Math.random() < 0.1 ? 40 : 0,
      }))
    }
    resize(); addEventListener('resize', resize)
    const draw = (t) => {
      ctx.clearRect(0, 0, w, h)
      for (const s of stars) {
        const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t / 1000 * s.s + s.p))
        ctx.fillStyle = s.hue === 200 ? `rgba(91,140,255,${a})` : `rgba(216,234,255,${a * 0.85})`
        ctx.beginPath(); ctx.arc(s.x, s.y + Math.sin(t / 20000 + s.p) * 2, s.r, 0, 6.28); ctx.fill()
      }
      if (!shoot && Math.random() < 0.004) shoot = { x: Math.random() * w, y: Math.random() * h * 0.5, vx: (6 + Math.random() * 6) * devicePixelRatio, vy: (2 + Math.random() * 3) * devicePixelRatio, life: 1 }
      if (shoot) {
        const g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * 14, shoot.y - shoot.vy * 14)
        g.addColorStop(0, `rgba(216,234,255,${shoot.life})`); g.addColorStop(1, 'rgba(216,234,255,0)')
        ctx.strokeStyle = g; ctx.lineWidth = 1.5 * devicePixelRatio
        ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - shoot.vx * 14, shoot.y - shoot.vy * 14); ctx.stroke()
        shoot.x += shoot.vx; shoot.y += shoot.vy; shoot.life -= 0.015
        if (shoot.life <= 0) shoot = null
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={ref} className="fixed inset-0 w-full h-full pointer-events-none -z-10" />
}
