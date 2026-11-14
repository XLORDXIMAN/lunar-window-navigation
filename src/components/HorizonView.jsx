// ⭐ The key visualization of the challenge:
// Sun and Earth positions relative to the LOCAL TERRAIN horizon at the selected site.
import { useStore, useSite } from '../store.js'
import { stateAt, sunPos, HOUR } from '../lib/ephem.js'
import { useT } from '../lib/i18n.js'
import { useSiteName } from '../lib/ui.jsx'

const W = 1000, H = 250, PAD = 30
const STARS = Array.from({ length: 70 }, (_, i) => ({ x: (i * 137) % 1000, y: (i * 61) % 200, r: i % 9 === 0 ? 1.3 : 0.6, d: (i % 5) * 0.7 }))

export default function HorizonView() {
  const t = useT(), nm = useSiteName()
  const site = useSite()
  const time = useStore((s) => s.time)
  const kids = useStore((s) => s.kids)
  if (!site) return null

  const polar = Math.abs(site.lat) > 60
  const st = stateAt(site, time)
  const sunOn = st.sunVis >= 0.5
  const yMin = polar ? -4 : -15, yMax = polar ? 10 : 90
  const x = (az) => PAD + (az / 360) * (W - 2 * PAD)
  const y = (el) => H - PAD - ((Math.max(yMin, Math.min(yMax, el)) - yMin) / (yMax - yMin)) * (H - 2 * PAD)

  const ridge = site.horizon.map((h, az) => `${x(az).toFixed(1)},${y(h).toFixed(1)}`).join(' ')
  const ground = `${x(0)},${H - PAD} ${ridge} ${x(359)},${H - PAD}`
  const trail = Array.from({ length: 49 }, (_, i) => sunPos(site, time + (i - 24) * HOUR))
  const ticks = polar ? [-4, -2, 0, 2, 4, 6, 8, 10] : [-15, 0, 30, 60, 90]
  const sx = x(st.sun.az), sy = y(st.sun.el), ex = x(st.earth.az), ey = y(st.earth.el)
  const lx = W / 2, ly = H - PAD - 10 // lander antenna
  const sunLabel = st.sunVis >= 0.99 ? t('sunVisible') : st.sunVis > 0.01 ? t('sunPartial', { p: (st.sunVis * 100).toFixed(0) }) : t('sunBlocked')

  return (
    <section className="panel p-3 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <div className="label">{t('horizon')} · <span className="text-ice">{nm(site)}</span></div>
        <div className="ml-auto flex gap-2 num text-[11px]">
          <span className={`px-2 py-0.5 rounded-[var(--radius-tag)] border tracking-[.08em] transition-all duration-500 ${sunOn ? 'border-signal text-amber-300' : 'border-slate-600 text-slate-400'}`}>☀ {sunLabel}</span>
          <span className={`px-2 py-0.5 rounded-[var(--radius-tag)] border tracking-[.08em] transition-all duration-500 ${st.earthVis ? 'border-cobalt-lt text-cobalt-lt' : 'border-nogo/60 text-nogo'}`}>📡 {st.earthVis ? t('linkOn') : t('linkOff')}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#000" /><stop offset="1" stopColor="#0d0d0f" /></linearGradient>
          <linearGradient id="rock" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={sunOn ? '#41464c' : '#232529'} style={{ transition: 'stop-color 1s' }} />
            <stop offset="1" stopColor="#000000" />
          </linearGradient>
          <radialGradient id="sunGlow"><stop offset="0" stopColor="#fff1e8" /><stop offset=".25" stopColor="#ff4105" /><stop offset="1" stopColor="#ff4105" stopOpacity="0" /></radialGradient>
          <radialGradient id="earthG" cx="35%" cy="35%"><stop offset="0" stopColor="#b9ccff" /><stop offset=".5" stopColor="#1f58f2" /><stop offset=".8" stopColor="#153896" /><stop offset="1" stopColor="#0b2a7a" /></radialGradient>
          <radialGradient id="earthGlow"><stop offset=".4" stopColor="#5b8cff" stopOpacity=".35" /><stop offset="1" stopColor="#5b8cff" stopOpacity="0" /></radialGradient>
          <linearGradient id="litEdge" x1="0" y1="0" x2="1" y2="0">
            <stop offset={Math.max(0, st.sun.az / 360 - 0.15)} stopColor="#ff4105" stopOpacity="0" />
            <stop offset={st.sun.az / 360} stopColor="#ff9a6b" stopOpacity={sunOn ? 0.9 : 0.15} />
            <stop offset={Math.min(1, st.sun.az / 360 + 0.15)} stopColor="#ff4105" stopOpacity="0" />
          </linearGradient>
          <filter id="g2"><feGaussianBlur stdDeviation="2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <clipPath id="plot"><rect x={PAD} y={PAD - 20} width={W - 2 * PAD} height={H - 2 * PAD + 20} /></clipPath>
        </defs>

        <rect x={PAD} y={PAD - 20} width={W - 2 * PAD} height={H - 2 * PAD + 20} fill="url(#sky)" rx="6" />
        {STARS.map((s, i) => <circle key={i} cx={PAD + s.x * 0.94} cy={PAD - 15 + s.y * 0.8} r={s.r} fill="#d8eaff"><animate attributeName="opacity" values=".2;.9;.2" dur={`${2 + s.d}s`} repeatCount="indefinite" /></circle>)}

        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={PAD} x2={W - PAD} y1={y(tk)} y2={y(tk)} stroke={tk === 0 ? '#565e66' : '#232529'} strokeDasharray={tk === 0 ? '' : '3 5'} />
            <text x={PAD - 6} y={y(tk) + 4} fontSize="10" fill="#6c757f" textAnchor="end" className="num">{tk}°</text>
          </g>
        ))}
        {[['N', 0], ['E', 90], ['S', 180], ['W', 270], ['N', 360]].map(([l, az]) => (
          <text key={az} x={x(az)} y={H - 9} fontSize="11" fill="#8a99ab" textAnchor="middle" className="num" fontWeight="600">{l}</text>
        ))}

        <g clipPath="url(#plot)">
          <polyline points={trail.map((p) => `${x(p.az).toFixed(1)},${y(p.el).toFixed(1)}`).join(' ')} fill="none" stroke="#ff4105" strokeOpacity=".45" strokeWidth="1.5" strokeDasharray="2 5" />

          {/* Sun */}
          <g className="smooth" style={{ transform: `translate(${sx}px, ${sy}px)` }} opacity={sunOn ? 1 : 0.35}>
            <circle r="34" fill="url(#sunGlow)" opacity={sunOn ? 0.9 : 0.2} />
            <g style={{ animation: 'spin 12s linear infinite' }} opacity={sunOn ? 0.8 : 0}>
              {Array.from({ length: 12 }, (_, i) => <line key={i} x1="0" y1="-14" x2="0" y2="-22" stroke="#ff9a6b" strokeWidth="1.5" strokeLinecap="round" transform={`rotate(${i * 30})`} />)}
            </g>
            <circle r="9" fill={sunOn ? '#ffd2bd' : '#41464c'} stroke="#ff4105" strokeWidth="1.5" />
          </g>

          {/* Earth + link beam */}
          {st.earthVis && <line x1={ex} y1={ey} x2={lx} y2={ly} stroke="#5b8cff" strokeWidth="1.5" className="beam" opacity=".8" />}
          <g className="smooth" style={{ transform: `translate(${ex}px, ${ey}px)` }} opacity={st.earthVis ? 1 : 0.4}>
            {st.earthVis && <circle r="22" fill="url(#earthGlow)"><animate attributeName="r" values="16;26;16" dur="2.4s" repeatCount="indefinite" /></circle>}
            <circle r="9" fill="url(#earthG)" stroke="#8aaaff" strokeWidth="1" />
          </g>

          {/* Terrain */}
          <polygon points={ground} fill="url(#rock)" />
          <polyline points={ridge} fill="none" stroke="url(#litEdge)" strokeWidth="2.5" />
          <polyline points={ridge} fill="none" stroke="#d8eaff" strokeOpacity=".55" strokeWidth=".8" />
        </g>

        {/* Lander */}
        <g transform={`translate(${lx},${ly})`}>
          <path d="M-9 8 L-5 0 L5 0 L9 8 M-6 0 L-4 -6 L4 -6 L6 0 Z" fill="#d8eaff" stroke="#000000" strokeWidth=".8" />
          <line x1="0" y1="-6" x2="0" y2="-13" stroke="#d8eaff" /><circle cy="-14" r="2" fill={st.earthVis ? '#5b8cff' : '#ff5a4f'}><animate attributeName="opacity" values="1;.3;1" dur="1s" repeatCount="indefinite" /></circle>
          <text y="20" fontSize="9" fill="#6c757f" textAnchor="middle">{t('lander')}</text>
        </g>

        {/* Labels on top */}
        <g className="smooth num" style={{ transform: `translate(${sx}px, ${sy}px)` }}>
          <text x="14" y="-12" fontSize="12" fill="#ff4105" fontWeight="700" style={{ paintOrder: 'stroke', stroke: '#000', strokeWidth: 3 }}>{t('sun')} {st.sun.el >= 0 ? '+' : ''}{st.sun.el.toFixed(2)}°</text>
        </g>
        <g className="smooth num" style={{ transform: `translate(${ex}px, ${ey}px)` }}>
          <text x="14" y="18" fontSize="12" fill="#8aaaff" fontWeight="700" style={{ paintOrder: 'stroke', stroke: '#000', strokeWidth: 3 }}>{t('earth')} {st.earth.el.toFixed(2)}°{st.earth.el < yMin ? ' ↓' : ''}</text>
        </g>
        <text x={W - PAD - 6} y={PAD - 6} fontSize="10" fill="#6c757f" textAnchor="end">{t('hzNote')}</text>
      </svg>
      {kids && <div className="kids mt-2">{t('kids.horizon')}</div>}
    </section>
  )
}
