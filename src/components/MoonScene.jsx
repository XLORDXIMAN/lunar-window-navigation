// 2D orthographic Moon — PLACEHOLDER for participant 1's Three.js scene
// (and our fallback if 3D isn't ready). Shows the real day/night terminator
// for the selected date, clickable site markers, auto-rotation.
import { useEffect, useState } from 'react'
import { useStore } from '../store.js'
import { CATEGORIES } from '../data/sites.js'
import { subSolar, subEarth } from '../lib/ephem.js'
import { useT } from '../lib/i18n.js'
import { useSiteName } from '../lib/ui.jsx'

const DEG = Math.PI / 180
const VIEWS = { pole: [-90, 0], near: [0, 0], far: [0, 180] }

function project(lat, lon, lat0, lon0, R) {
  const p = lat * DEG, l = lon * DEG, p0 = lat0 * DEG, l0 = lon0 * DEG
  const z = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l - l0)
  return { x: R * Math.cos(p) * Math.sin(l - l0), y: -R * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l - l0)), z, vis: z > 0 }
}

// Night-side polygon in orthographic projection (terminator = great circle ⟂ Sun)
function nightPath(ss, lat0, lon0, R) {
  const s = project(ss.lat, ss.lon, lat0, lon0, 1)
  const th = Math.atan2(s.y, s.x), sz = s.z
  const up = [-Math.sin(th), Math.cos(th)], us = [Math.cos(th), Math.sin(th)]
  const pts = []
  for (let a = 90; a <= 270; a += 4) pts.push([R * Math.cos(th + a * DEG), R * Math.sin(th + a * DEG)])
  for (let a = 180; a >= 0; a -= 4) { const c = Math.cos(a * DEG), sn = Math.sin(a * DEG); pts.push([R * (c * up[0] - sn * sz * us[0]), R * (c * up[1] - sn * sz * us[1])]) }
  return pts.map((p) => p.join(',')).join(' ')
}

export default function MoonScene() {
  const t = useT(), nm = useSiteName()
  const { sites, selectedId, time, select } = useStore()
  const [view, setView] = useState('pole')
  const [zoom, setZoom] = useState(true)
  const [rot, setRot] = useState(0)
  const [spin, setSpin] = useState(true)

  useEffect(() => {
    if (view === 'pole' || !spin) return
    let raf, last = performance.now()
    const tick = (now) => { setRot((r) => (r + (now - last) * 0.006) % 360); last = now; raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [view, spin])

  const [lat0, baseLon] = VIEWS[view]
  const lon0 = view === 'pole' ? 0 : baseLon + Math.sin(rot * DEG) * 35
  const R = view === 'pole' && zoom ? 1100 : 165
  const ss = subSolar(time), se = subEarth(time)

  const grid = []
  const pushLine = (pts) => pts.length > 1 && grid.push(pts.join(' '))
  for (let la = -80; la <= 80; la += 10) {
    let pts = []
    for (let lo = -180; lo <= 180; lo += 3) { const q = project(la, lo, lat0, lon0, R); if (q.vis) pts.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`); else { pushLine(pts); pts = [] } }
    pushLine(pts)
  }
  for (let lo = -180; lo < 180; lo += 30) {
    let pts = []
    for (let la = -90; la <= 90; la += 2) { const q = project(la, lo, lat0, lon0, R); if (q.vis) pts.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`); else { pushLine(pts); pts = [] } }
    pushLine(pts)
  }
  // procedural craters (deterministic)
  const craters = Array.from({ length: 70 }, (_, i) => ({ la: ((i * 137.5) % 180) - 90, lo: ((i * 97.3) % 360) - 180, r: 1.5 + ((i * 7) % 9) }))
  const sunScreen = project(ss.lat, ss.lon, lat0, lon0, 1)

  return (
    <section className="panel relative overflow-hidden h-[360px]">
      <div className="absolute top-2 left-3 z-10 flex flex-wrap gap-1">
        {Object.keys(VIEWS).map((v) => <button key={v} className={`btn !text-[10px] ${view === v ? 'btn-on' : ''}`} onClick={() => setView(v)}>{t(`view.${v}`)}</button>)}
        {view === 'pole'
          ? <button className="btn !text-[10px]" onClick={() => setZoom(!zoom)}>{zoom ? t('zoomOut') : t('zoomIn')}</button>
          : <button className={`btn !text-[10px] ${spin ? 'btn-on' : ''}`} onClick={() => setSpin(!spin)}>⟳</button>}
      </div>
      <div className="absolute top-2 right-3 z-10 label">{t('scene3d')}</div>
      <svg viewBox="-200 -170 400 340" className="w-full h-full">
        <defs>
          <radialGradient id="moonbase" cx="40%" cy="38%" r="70%">
            <stop offset="0%" stopColor="#e7e5e0" /><stop offset="60%" stopColor="#8a8780" /><stop offset="100%" stopColor="#3a3935" />
          </radialGradient>
          <radialGradient id="halo"><stop offset="70%" stopColor="#22d3ee" stopOpacity="0" /><stop offset="85%" stopColor="#22d3ee" stopOpacity=".18" /><stop offset="100%" stopColor="#22d3ee" stopOpacity="0" /></radialGradient>
          <filter id="soft"><feGaussianBlur stdDeviation={R > 500 ? 18 : 4} /></filter>
          <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <clipPath id="disk"><circle r={R} /></clipPath>
        </defs>
        {R < 500 && <circle r={R * 1.25} fill="url(#halo)" />}
        {R < 500 && (
          <g style={{ transformOrigin: '0 0', animation: 'spin 40s linear infinite' }}>
            <ellipse rx={R * 1.18} ry={R * 0.32} fill="none" stroke="#22d3ee" strokeOpacity=".25" strokeDasharray="2 6" transform="rotate(-18)" />
            <circle cx={R * 1.18} cy="0" r="2.5" fill="#22d3ee" filter="url(#glow)" transform="rotate(-18)" />
          </g>
        )}
        <circle r={R} fill="url(#moonbase)" />
        <g clipPath="url(#disk)">
          {craters.map((c, i) => { const q = project(c.la, c.lo, lat0, lon0, R); return q.vis && <circle key={i} cx={q.x} cy={q.y} r={c.r * (R / 165) * Math.max(q.z, 0.25)} fill="#00000022" stroke="#ffffff10" /> })}
          {grid.map((g, i) => <polyline key={i} points={g} fill="none" stroke="#ffffff" strokeOpacity=".08" strokeWidth=".6" />)}
          <polygon points={nightPath(ss, lat0, lon0, R)} fill="#02040a" fillOpacity=".82" filter="url(#soft)" />
        </g>
        {R < 500 && sunScreen.z > -0.95 && (
          <g transform={`translate(${sunScreen.x * 190},${sunScreen.y * 160})`} opacity=".9">
            <circle r="7" fill="#fbbf24" filter="url(#glow)" /><text y="18" fontSize="7" fill="#fbbf24" textAnchor="middle">☀ {t('sun')}</text>
          </g>
        )}
        {sites.map((s) => {
          const q = project(s.lat, s.lon, lat0, lon0, R)
          if (!q.vis || Math.abs(q.x) > 200 || Math.abs(q.y) > 170) return null
          const sel = s.id === selectedId, col = CATEGORIES[s.category].color
          return (
            <g key={s.id} transform={`translate(${q.x},${q.y})`} className="cursor-pointer" onClick={() => select(s.id)}>
              <circle r="10" fill="transparent" />
              {sel && <>
                <circle r="6" fill="none" stroke="#22d3ee" strokeWidth="1.2"><animate attributeName="r" values="5;16;5" dur="1.8s" repeatCount="indefinite" /><animate attributeName="opacity" values="1;0;1" dur="1.8s" repeatCount="indefinite" /></circle>
                <line x1="0" y1="0" x2="0" y2="-22" stroke="#22d3ee" strokeWidth=".8" />
              </>}
              <circle r={sel ? 4.5 : 3} fill={col} stroke="#000" strokeWidth=".8" filter="url(#glow)" />
              {(sel || R > 500) && <text x={sel ? 4 : 6} y={sel ? -25 : 3} fontSize={sel ? 9 : 7.5} fill="#fff" fontWeight={sel ? 700 : 400} style={{ paintOrder: 'stroke', stroke: '#000', strokeWidth: 2.5 }}>{nm(s).split(' — ')[0]}</text>}
            </g>
          )
        })}
      </svg>
      <div className="absolute bottom-2 left-3 num text-[10px] text-slate-400 flex gap-4">
        <span>☀ {t('subSolar')} {ss.lat.toFixed(2)}°, {ss.lon.toFixed(1)}°</span>
        <span>🌍 {t('subEarth')} {se.lat.toFixed(2)}°, {se.lon.toFixed(2)}°</span>
      </div>
    </section>
  )
}
