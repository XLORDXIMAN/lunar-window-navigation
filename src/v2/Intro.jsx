// Intro (~4 s): a cobalt dust cloud assembles into the MainTech flag + wordmark,
// the dot-flag ripples while a light band sweeps across it (the shimmer), then the
// dots fall away like regolith under lunar gravity and reveal the first screen.
import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n.js'

const TOTAL = 4.1
const FLAG = 'M6 1.5 C11 -0.5 15 4 21 2.6 C25 1.7 29 0.6 33 0 L30.5 14.5 C27 15.8 24 16.8 20 17.3 C14.5 18 11 14 4.2 15.5 Z'
const STAR = 'M18.4 5 L19.4 8.3 L22.7 9.3 L19.4 10.3 L18.4 13.6 L17.4 10.3 L14.1 9.3 L17.4 8.3 Z'
const ease3 = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)

export default function Intro({ onDone }) {
  const t = useT()
  const ref = useRef(null)
  const [tag, setTag] = useState(false)
  const [out, setOut] = useState(false)
  const done = useRef(false)
  const finish = () => { if (!done.current) { done.current = true; onDone() } }

  useEffect(() => {
    const c = ref.current, ctx = c.getContext('2d')
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0, parts = [], w = 0, h = 0, dpr = 1, cancelled = false
    const guard = setTimeout(finish, (TOTAL + 1.5) * 1000)

    async function build() {
      try { await document.fonts.load('400 120px Onest') } catch { /* fallback font is fine */ }
      if (cancelled) return
      dpr = Math.min(2, devicePixelRatio || 1)
      w = c.width = Math.round(innerWidth * dpr); h = c.height = Math.round(innerHeight * dpr)
      if (w < 8 || h < 8) { finish(); return }
      // offscreen: flag + divider + wordmark
      const F = Math.min(w * 0.105, 150 * dpr)
      const o = document.createElement('canvas'); o.width = w; o.height = h
      const g = o.getContext('2d')
      g.font = `400 ${F}px Onest, "Inter Tight", sans-serif`
      const mainW = g.measureText('Main').width, techW = g.measureText('Tech').width
      const flagH = F * 0.78, flagW = flagH * (34 / 18), gap = F * 0.42
      const total = flagW + gap * 2 + mainW + techW
      const x0 = (w - total) / 2, cy = h * 0.47
      // flag (cloth, minus star) — mark pixels with colour channels as layer ids
      g.save(); g.translate(x0, cy - flagH * 0.55); g.scale(flagH / 18, flagH / 18)
      g.fillStyle = '#ff0000'; g.fill(new Path2D(FLAG))
      g.globalCompositeOperation = 'destination-out'; g.fill(new Path2D(STAR)); g.restore()
      g.globalCompositeOperation = 'source-over'
      // pole
      g.strokeStyle = '#ff0000'; g.lineWidth = F * 0.035; g.beginPath()
      g.moveTo(x0 + flagH / 18 * 6, cy - flagH * 0.55 + flagH / 18 * 1.5); g.lineTo(x0 + flagH / 18 * 2, cy + flagH * 0.75); g.stroke()
      // divider
      const dx = x0 + flagW + gap; g.fillStyle = '#00ff00'; g.fillRect(dx - dpr, cy - F * 0.62, 2 * dpr, F * 1.1)
      // wordmark
      g.textBaseline = 'middle'
      g.fillStyle = '#0000ff'; g.fillText('Main', dx + gap, cy)
      g.fillStyle = '#ffff00'; g.fillText('Tech', dx + gap + mainW, cy)
      const data = g.getImageData(0, 0, w, h).data
      const step = Math.max(3, Math.round(3.2 * dpr))
      const flagL = x0, flagR = x0 + flagW
      for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
        const k = (y * w + x) * 4
        if (data[k + 3] < 128) continue
        const r = data[k], gg = data[k + 1], b = data[k + 2]
        const layer = r > 200 && gg < 80 ? 'flag' : gg > 200 && r < 80 ? 'div' : b > 200 && r < 80 ? 'main' : 'tech'
        const a = Math.random() * Math.PI * 2, rad = (0.35 + Math.random() * 0.8) * Math.max(w, h)
        parts.push({
          tx: x, ty: y, layer, u: layer === 'flag' ? (x - flagL) / (flagR - flagL) : 0,
          sx: w / 2 + Math.cos(a) * rad, sy: h / 2 + Math.sin(a) * rad * 0.6,
          d: (x - x0) / total * 0.55 + Math.random() * 0.25, vy: 0, fx: 0,
        })
      }
      raf = requestAnimationFrame(frame)
    }

    const t0 = performance.now()
    let tagShown = false, outShown = false
    function frame(now) {
      const s = reduce ? 2.2 : (now - t0) / 1000
      if (s > 1.7 && !tagShown) { tagShown = true; setTag(true) }
      if (s > TOTAL - 0.45 && !outShown) { outShown = true; setOut(true) }
      if (s >= TOTAL) { finish(); return }
      ctx.clearRect(0, 0, w, h)
      const sweep = ((s - 1.6) / 1.4) * 1.6 - 0.3 // light band position 0..1 across the mark
      const fall = Math.max(0, s - 3.25)        // regolith fall
      for (const p of parts) {
        const k = ease3((s - 0.15 - p.d) / 1.15)
        let x = p.sx + (p.tx - p.sx) * k, y = p.sy + (p.ty - p.sy) * k
        if (p.layer === 'flag' && k > 0.98) {
          y += Math.sin(p.u * 7 - s * 5.2) * 5 * dpr * p.u
          x -= Math.cos(p.u * 7 - s * 5.2) * 1.2 * dpr * p.u
        }
        if (fall > 0) { const tt = Math.max(0, fall - p.d * 0.3); y += 0.5 * 1.62 * 260 * dpr * tt * tt; x += (p.tx - w / 2) * 0.04 * tt }
        // brightness: base + sweeping light band
        const rel = p.layer === 'flag' ? p.u * 0.33 : 0.33 + (p.tx / w - 0.3) * 1.1
        const band = Math.exp(-Math.pow((rel - sweep) / 0.07, 2))
        const alpha = Math.min(1, (0.25 + 0.75 * k) * (fall > 0 ? Math.max(0, 1 - fall * 1.2) : 1))
        let col
        if (p.layer === 'tech') col = band > 0.3 ? `rgba(191,234,255,${alpha})` : `rgba(61,123,255,${alpha})`
        else if (k < 0.9) col = `rgba(61,123,255,${alpha * 0.9})`
        else col = band > 0.3 ? `rgba(255,255,255,${alpha})` : `rgba(234,242,255,${alpha * (0.78 + 0.22 * band)})`
        ctx.fillStyle = col
        const sz = (p.layer === 'div' ? 1.4 : 1.8) * dpr * (1 + band * 0.5)
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz)
      }
      raf = requestAnimationFrame(frame)
    }
    build().catch(() => finish())
    return () => { cancelled = true; cancelAnimationFrame(raf); clearTimeout(guard) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div onClick={finish} role="presentation" className="fixed inset-0 z-50 bg-black cursor-pointer transition-opacity duration-500" style={{ opacity: out ? 0 : 1 }}>
      <canvas ref={ref} className="absolute inset-0 w-full h-full" />
      <div className={`absolute inset-x-0 top-[calc(47%+clamp(70px,9vw,140px))] text-center mono text-fog transition-all duration-700 ${tag ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
        {t('intro.tag')}
      </div>
      <div className="absolute bottom-6 inset-x-0 text-center mono-sm text-fog/60">{t('skip')}</div>
    </div>
  )
}
