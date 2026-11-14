// Moon globe drawn in the system's dot language (placeholder for member 01's 3D scene).
// Lighting: real sub-solar point from the DE440s export → hard terminator (no atmosphere).
// Albedo: approximate near-side maria. Drag to rotate, click a site to select it.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store.js'
import { subSolarAt, subEarthAt, windowMetrics, verdict } from '../lib/ephem.js'
import { useT } from '../lib/i18n.js'
import { siteName } from '../lib/ui.jsx'

const DEG = Math.PI / 180
const N = 9000
const MARIA = [[33, -16, 17], [28, 17, 9], [8.5, 31, 10], [17, 59, 7.5], [-7.8, 51.3, 9], [-21, -16.6, 10], [18, -57, 24], [5, -35, 14], [-15, 35, 5], [-24, -39, 6], [13, 3.6, 5], [-10, -23, 6], [56, 1, 7], [44, 26, 5], [-57, 160, 12]]
const VIEWS = { pole: { lat: -90, lon: 0, zoom: 1.45 }, near: { lat: 0, lon: 0, zoom: 1 }, far: { lat: 0, lon: 180, zoom: 1 } }
const VCOL = { green: '#7cff6b', yellow: '#ffd84d', red: '#ff4d6d' }

function buildPoints() {
  const ga = Math.PI * (3 - Math.sqrt(5)), pts = new Float32Array(N * 4)
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2 + (Math.random() - 0.5) * 0.004
    const lat = Math.asin(Math.max(-1, Math.min(1, y))), lon = ((i * ga) % (2 * Math.PI)) - Math.PI + (Math.random() - 0.5) * 0.03
    let alb = 1
    for (const [la, lo, r] of MARIA) {
      const d = Math.acos(Math.min(1, Math.sin(lat) * Math.sin(la * DEG) + Math.cos(lat) * Math.cos(la * DEG) * Math.cos(lon - lo * DEG))) / DEG
      if (d < r) alb = Math.min(alb, 0.35 + 0.65 * Math.pow(d / r, 2.2))
    }
    pts.set([lat, lon, alb * (0.85 + Math.random() * 0.3), 0], i * 4)
  }
  return pts
}
const toVec = (lat, lon) => [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]

export default function DotMoon() {
  const t = useT()
  const ref = useRef(null), wrap = useRef(null)
  const [view, setView] = useState('pole')
  const target = useRef(VIEWS.pole)
  const sitesRef = useRef([])
  const hover = useRef(null)

  useEffect(() => { target.current = VIEWS[view] }, [view])

  useEffect(() => {
    const c = ref.current, ctx = c.getContext('2d')
    const pts = buildPoints()
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0, dpr = 1, raf = 0, visible = true
    const cur = { lat: -90, lon: 0, zoom: 1.45 }
    let drag = null
    const resize = () => { dpr = Math.min(2, devicePixelRatio || 1); const r = c.getBoundingClientRect(); w = c.width = Math.max(1, r.width * dpr); h = c.height = Math.max(1, r.height * dpr) }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(c)
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(draw) }); io.observe(c)

    // view rotation: body vector → view (x right, y up, z toward viewer)
    const basis = () => {
      const la = cur.lat * DEG, lo = cur.lon * DEG
      const f = toVec(la, lo)                       // toward viewer
      const e = [-Math.sin(lo), Math.cos(lo), 0]   // screen right
      const n = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)] // screen up
      return { f, e, n }
    }
    const proj = (v, B, R, cx, cy) => {
      const x = v[0] * B.e[0] + v[1] * B.e[1] + v[2] * B.e[2]
      const y = v[0] * B.n[0] + v[1] * B.n[1] + v[2] * B.n[2]
      const z = v[0] * B.f[0] + v[1] * B.f[1] + v[2] * B.f[2]
      return [cx + x * R, cy - y * R, z]
    }

    function draw() {
      raf = 0
      const st = useStore.getState()
      // ease toward the target view (unless the user is dragging)
      if (!drag) {
        const tg = target.current
        let dl = tg.lon - cur.lon; dl = ((dl + 540) % 360) - 180
        cur.lat += (tg.lat - cur.lat) * 0.08; cur.lon += dl * 0.08; cur.zoom += (tg.zoom - cur.zoom) * 0.08
      }
      const R = Math.min(w, h) * 0.42 * cur.zoom, cx = w / 2, cy = h / 2
      const B = basis()
      const ss = subSolarAt(st.time), sv = toVec(ss.lat * DEG, ss.lon * DEG)
      ctx.clearRect(0, 0, w, h)
      // limb
      ctx.strokeStyle = 'rgba(234,242,255,.18)'; ctx.lineWidth = dpr
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke()
      for (let i = 0; i < N; i++) {
        const lat = pts[i * 4], lon = pts[i * 4 + 1], alb = pts[i * 4 + 2]
        const v = toVec(lat, lon)
        const [px, py, z] = proj(v, B, R, cx, cy)
        if (z <= 0 || px < -2 || py < -2 || px > w + 2 || py > h + 2) continue
        const mu = v[0] * sv[0] + v[1] * sv[1] + v[2] * sv[2] // cos(solar zenith)
        const s = (0.9 + z * 1.1) * dpr * Math.min(1.6, cur.zoom * 0.75)
        if (mu > 0) {
          const b = Math.min(1, alb * (0.25 + 0.75 * Math.pow(mu, 0.6)))
          ctx.fillStyle = mu < 0.009 ? `rgba(255,190,60,${0.55 + 0.45 * b})` : `rgba(234,242,255,${0.3 + 0.7 * b})`
        } else ctx.fillStyle = `rgba(61,123,255,${0.18 + 0.1 * z})`
        ctx.fillRect(px - s / 2, py - s / 2, s, s)
      }
      // graticule rings for the pole view: 80°, 85° S
      if (cur.zoom > 1.2) {
        for (const ring of [-80, -85]) {
          ctx.strokeStyle = 'rgba(234,242,255,.12)'; ctx.setLineDash([2 * dpr, 6 * dpr]); ctx.beginPath()
          for (let k = 0; k <= 72; k++) { const p = proj(toVec(ring * DEG, k * 5 * DEG), B, R, cx, cy); k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]) }
          ctx.stroke(); ctx.setLineDash([])
        }
      }
      // sites
      const hit = []
      const day = Math.floor(st.time / 3600e3 / 6)
      for (const s of st.sites) {
        const [px, py, z] = proj(toVec(s.lat * DEG, s.lon * DEG), B, R, cx, cy)
        if (z <= 0.02) continue
        const v = verdict(windowMetrics(s, day * 6 * 3600e3, 14, 2), s)
        const sel = s.id === st.selectedId, hov = hover.current === s.id
        ctx.fillStyle = VCOL[v.level]; ctx.fillRect(px - 3 * dpr, py - 3 * dpr, 6 * dpr, 6 * dpr)
        if (sel || hov) {
          ctx.strokeStyle = sel ? '#47c8ff' : '#eaf2ff'; ctx.lineWidth = dpr
          ctx.strokeRect(px - 8 * dpr, py - 8 * dpr, 16 * dpr, 16 * dpr)
          ctx.font = `${11 * dpr}px "IBM Plex Mono", monospace`; ctx.fillStyle = '#eaf2ff'
          ctx.fillText(siteName(s, st.lang).split(' — ')[0].toUpperCase(), px + 13 * dpr, py + 4 * dpr)
        }
        hit.push({ id: s.id, x: px / dpr, y: py / dpr })
      }
      sitesRef.current = hit
      // Sun & Earth direction markers on the limb
      const se = subEarthAt(st.time)
      for (const [sub, col, lab] of [[ss, '#ff7a1a', t('sun')], [se, '#47c8ff', t('earth')]]) {
        const [px, py] = proj(toVec(sub.lat * DEG, sub.lon * DEG), B, 1, 0, 0)
        const len = Math.hypot(px, py) || 1, ux = px / len, uy = py / len
        const rr = Math.min(R + 26 * dpr, Math.min(w, h) / 2 - 14 * dpr)
        const mx = cx + ux * rr, my = cy + uy * rr
        ctx.fillStyle = col
        if (col === '#ff7a1a') ctx.fillRect(mx - 4 * dpr, my - 4 * dpr, 8 * dpr, 8 * dpr); else { ctx.beginPath(); ctx.arc(mx, my, 4.5 * dpr, 0, Math.PI * 2); ctx.fill() }
        ctx.font = `${10 * dpr}px "IBM Plex Mono", monospace`; ctx.fillText(lab.toUpperCase(), mx + 9 * dpr, my + 3 * dpr)
      }
      if (visible && !reduce) raf = requestAnimationFrame(draw)
      else if (reduce) setTimeout(() => { if (!raf) raf = requestAnimationFrame(draw) }, 250)
    }
    raf = requestAnimationFrame(draw)

    const pick = (e) => {
      const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top
      let best = null, bd = 14
      for (const s of sitesRef.current) { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = s.id } }
      return best
    }
    const onDown = (e) => { drag = { x: e.clientX, y: e.clientY, lat: cur.lat, lon: cur.lon, moved: false }; c.setPointerCapture(e.pointerId) }
    const onMove = (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
        cur.lon = drag.lon - dx * 0.4 / cur.zoom; cur.lat = Math.max(-90, Math.min(90, drag.lat + dy * 0.4 / cur.zoom))
        target.current = { ...target.current, lat: cur.lat, lon: cur.lon }
      } else {
        const id = pick(e); if (id !== hover.current) { hover.current = id; c.style.cursor = id ? 'pointer' : 'grab' }
      }
    }
    const onUp = (e) => { if (drag && !drag.moved) { const id = pick(e); if (id) useStore.getState().select(id) } drag = null }
    c.addEventListener('pointerdown', onDown); c.addEventListener('pointermove', onMove); c.addEventListener('pointerup', onUp)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); c.removeEventListener('pointerdown', onDown); c.removeEventListener('pointermove', onMove); c.removeEventListener('pointerup', onUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={wrap} className="frame bg-black relative h-[clamp(380px,48vw,560px)] overflow-hidden">
      <canvas ref={ref} className="absolute inset-0 w-full h-full cursor-grab touch-none" aria-label={t('moon.title')} />
      <div className="absolute top-4 left-4 flex gap-5">
        {Object.keys(VIEWS).map((v) => <button key={v} className={`navlink !text-[10px] ${view === v ? 'on' : ''}`} onClick={() => setView(v)}>{t(`view.${v}`)}</button>)}
      </div>
      <div className="absolute bottom-4 left-4 right-4 flex flex-wrap justify-between gap-2 mono-sm text-fog">
        <span><span className="text-signal">■</span> {t('moon.lit')}</span>
        <span className="normal-case tracking-[.04em]">{t('moon.drag')}</span>
      </div>
    </div>
  )
}
