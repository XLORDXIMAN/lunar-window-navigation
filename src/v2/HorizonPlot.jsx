// 360° horizon at the selected site, drawn in the wireframe language:
// terrain = hairline ridge over a carbon fill, Sun = signal-orange square, Earth = cobalt
// circle, link = dashed cobalt line to the lander. No glows, no gradients.
import { useStore, useSite } from '../store.js'
import { stateAt, sunPos, HOUR } from '../lib/ephem.js'
import { useT } from '../lib/i18n.js'

const W = 1000, H = 260, PL = 44, PR = 16, PT = 18, PB = 30

export default function HorizonPlot() {
  const t = useT()
  const site = useSite()
  const time = useStore((s) => s.time)
  const mock = useStore((s) => s.mockData)
  if (!site) return null
  const polar = Math.abs(site.lat) > 60
  const st = stateAt(site, time)
  const sunOn = st.sunVis >= 0.5
  const yMin = polar ? -4 : -15, yMax = polar ? 10 : 90
  const x = (az) => PL + (az / 360) * (W - PL - PR)
  const y = (el) => H - PB - ((Math.max(yMin, Math.min(yMax, el)) - yMin) / (yMax - yMin)) * (H - PT - PB)
  const ridge = site.horizon.map((h, az) => `${x(az).toFixed(1)},${y(h).toFixed(1)}`).join(' ')
  const ground = `${x(0)},${H - PB} ${ridge} ${x(359)},${H - PB}`
  const trail = Array.from({ length: 49 }, (_, i) => sunPos(site, time + (i - 24) * HOUR))
  const ticks = polar ? [-4, -2, 0, 2, 4, 6, 8, 10] : [-15, 0, 30, 60, 90]
  const sx = x(st.sun.az), sy = y(st.sun.el), ex = x(st.earth.az), ey = y(st.earth.el)
  const lx = x(180), ly = H - PB - 6
  const sunLabel = st.sunVis >= 0.99 ? t('sunVisible') : st.sunVis > 0.01 ? t('sunPartial', { p: (st.sunVis * 100).toFixed(0) }) : t('sunBlocked')

  return (
    <div className="frame p-4 bg-black">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3">
        <span className="mono-sm text-fog">{t('horizon')} · 360°</span>
        <span className={`mono-sm ${sunOn ? 'text-signal' : 'text-fog'}`}>■ {sunLabel}</span>
        <span className={`mono-sm ${st.earthVis ? 'text-cobalt-lt' : 'text-nogo'}`}>● {st.earthVis ? t('linkOn') : t('linkOff')}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block">
        <defs><clipPath id="hp"><rect x={PL} y={PT - 12} width={W - PL - PR} height={H - PT - PB + 12} /></clipPath></defs>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={PL} x2={W - PR} y1={y(tk)} y2={y(tk)} stroke="#eaf2ff" strokeOpacity={tk === 0 ? 0.45 : 0.1} strokeDasharray={tk === 0 ? '' : '2 6'} />
            <text x={PL - 8} y={y(tk) + 3} fontSize="10" fill="#6c757f" textAnchor="end" fontFamily="IBM Plex Mono, monospace">{tk}°</text>
          </g>
        ))}
        {[['N', 0], ['E', 90], ['S', 180], ['W', 270], ['N', 360]].map(([l, az]) => (
          <text key={az} x={x(az)} y={H - 8} fontSize="10" fill="#6c757f" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" letterSpacing="1.6">{l}</text>
        ))}
        <g clipPath="url(#hp)">
          <polyline points={trail.map((p) => `${x(p.az).toFixed(1)},${y(p.el).toFixed(1)}`).join(' ')} fill="none" stroke="#ff7a1a" strokeOpacity=".5" strokeWidth="1" strokeDasharray="1 5" />
          {st.earthVis && <line x1={ex} y1={ey} x2={lx} y2={ly - 12} stroke="#47c8ff" strokeWidth="1" className="beam" />}
          <g className="smooth" style={{ transform: `translate(${sx}px, ${sy}px)` }}>
            <rect x="-6" y="-6" width="12" height="12" fill={sunOn ? '#ff7a1a' : 'none'} stroke="#ff7a1a" strokeWidth="1.2" />
            <rect x="-12" y="-12" width="24" height="24" fill="none" stroke="#ff7a1a" strokeOpacity=".35" />
          </g>
          <g className="smooth" style={{ transform: `translate(${ex}px, ${ey}px)` }}>
            <circle r="7" fill={st.earthVis ? '#3d7bff' : 'none'} stroke="#47c8ff" strokeWidth="1.2" />
          </g>
          <polygon points={ground} fill="#0d0d0f" />
          <polyline points={ridge} fill="none" stroke="#eaf2ff" strokeWidth="1" strokeOpacity=".85" />
        </g>
        <g transform={`translate(${lx},${ly})`} stroke="#eaf2ff" strokeWidth="1" fill="none">
          <path d="M-8 6 L-4 -2 H4 L8 6 M-4 -2 V-8 H4 V-2 M0 -8 V-14" />
          <circle cy="-15" r="1.8" fill={st.earthVis ? '#47c8ff' : '#ff4d6d'} stroke="none" />
        </g>
        <g className="smooth" style={{ transform: `translate(${sx}px, ${sy}px)` }}>
          <text x="16" y="-10" fontSize="11" fill="#ffb020" fontFamily="IBM Plex Mono, monospace">{t('sun')} {st.sun.el >= 0 ? '+' : ''}{st.sun.el.toFixed(2)}°</text>
        </g>
        <g className="smooth" style={{ transform: `translate(${ex}px, ${ey}px)` }}>
          <text x="14" y="16" fontSize="11" fill="#7fd8ff" fontFamily="IBM Plex Mono, monospace">{t('earth')} {st.earth.el.toFixed(2)}°{st.earth.el < yMin ? ' ↓' : ''}</text>
        </g>
      </svg>
      <div className="mono-sm text-fog mt-2 normal-case tracking-[.04em]">{t('hzNote')}</div>
      {!mock && <div className={`mono-sm mt-1 normal-case tracking-[.04em] ${site.horizonMock ? 'text-warn' : 'text-go'}`}>● {site.horizonMock ? t('hzSynthetic') : t('hzReal')}</div>}
    </div>
  )
}
