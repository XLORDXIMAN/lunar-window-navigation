// Sky dial — the view straight up from the lander. Azimuth around the circle, elevation radial.
// Polar sites use a zoomed scale (−4°…+12°) because everything happens on the horizon there.
// Terrain fills the rim; the Sun's track for the next lunar day is the orange trail, Earth's
// libration wobble the cobalt one.
import { useMemo } from 'react'
import { useStore, useSite } from '../store.js'
import { stateAt, sunPos, earthPos, HOUR, SYNODIC_H } from '../lib/ephem.js'
import { useT } from '../lib/i18n.js'

const S = 420, C = S / 2, RMAX = 188

export default function SkyDial() {
  const t = useT()
  const site = useSite()
  const time = useStore((s) => s.time)
  const hour = Math.floor(time / (6 * HOUR))
  const tracks = useMemo(() => {
    if (!site) return null
    const t0 = hour * 6 * HOUR
    const sun = [], earth = []
    for (let h = 0; h <= SYNODIC_H; h += 4) { sun.push(sunPos(site, t0 + h * HOUR)); earth.push(earthPos(site, t0 + h * HOUR)) }
    return { sun, earth }
  }, [site, hour])
  if (!site || !tracks) return null

  const polar = Math.abs(site.lat) > 60
  const lo = polar ? -4 : -10, hi = polar ? 12 : 90
  const r = (el) => RMAX * (1 - (Math.max(lo, Math.min(hi, el)) - lo) / (hi - lo))
  const pt = (az, el) => { const a = (az - 90) * Math.PI / 180, rr = r(el); return [C + rr * Math.cos(a), C + rr * Math.sin(a)] }
  const st = stateAt(site, time)
  const terrain = site.horizon.map((h, az) => pt(az, h).map((v) => v.toFixed(1)).join(',')).join(' ')
  const rings = polar ? [0, 4, 8, 12] : [0, 30, 60, 90]
  const [sx, sy] = pt(st.sun.az, st.sun.el), [ex, ey] = pt(st.earth.az, st.earth.el)

  return (
    <div className="frame bg-black p-4 flex flex-col">
      <div className="flex justify-between mono-sm text-fog mb-2"><span>{t('sky.title')}</span><span>{polar ? '−4°…+12°' : '−10°…+90°'}</span></div>
      <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-[420px] mx-auto block">
        <defs><clipPath id="skyc"><circle cx={C} cy={C} r={RMAX} /></clipPath></defs>
        <circle cx={C} cy={C} r={RMAX} fill="#000" stroke="#eaf2ff" strokeOpacity=".25" />
        {/* terrain = everything between the outer rim and the horizon profile */}
        <g clipPath="url(#skyc)">
          <path d={`M${C - RMAX - 2},${C} a${RMAX + 2},${RMAX + 2} 0 1,0 ${2 * RMAX + 4},0 a${RMAX + 2},${RMAX + 2} 0 1,0 ${-2 * RMAX - 4},0 Z M${terrain.split(' ')[0]} L${terrain} Z`} fill="#0d0d0f" fillRule="evenodd" />
          <polygon points={terrain} fill="none" stroke="#eaf2ff" strokeOpacity=".75" strokeWidth="1" />
        </g>
        {rings.map((el) => (
          <g key={el}>
            <circle cx={C} cy={C} r={r(el)} fill="none" stroke="#eaf2ff" strokeOpacity={el === 0 ? 0.35 : 0.1} strokeDasharray={el === 0 ? '' : '2 5'} />
            <text x={C + 4} y={C - r(el) + 12} fontSize="9" fill="#6c757f" fontFamily="IBM Plex Mono, monospace">{el}°</text>
          </g>
        ))}
        {[['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([l, az]) => { const [x, y] = pt(az, lo - 1.4 * (hi - lo) / 16); return <text key={l} x={x} y={y + 3} fontSize="10" fill="#8a99ab" textAnchor="middle" fontFamily="IBM Plex Mono, monospace">{l}</text> })}
        {tracks.earth.map((p, i) => { const [x, y] = pt(p.az, p.el); return <circle key={'e' + i} cx={x} cy={y} r="1.3" fill="#47c8ff" opacity={0.25 + 0.5 * (1 - i / tracks.earth.length)} /> })}
        {tracks.sun.map((p, i) => { const [x, y] = pt(p.az, p.el); return <rect key={'s' + i} x={x - 1.2} y={y - 1.2} width="2.4" height="2.4" fill="#ff7a1a" opacity={0.2 + 0.6 * (1 - i / tracks.sun.length)} /> })}
        <circle cx={ex} cy={ey} r="7" fill={st.earthVis ? '#3d7bff' : 'none'} stroke="#47c8ff" strokeWidth="1.2" />
        <rect x={sx - 6} y={sy - 6} width="12" height="12" fill={st.sunVis >= 0.5 ? '#ff7a1a' : 'none'} stroke="#ff7a1a" strokeWidth="1.2" />
        {/* lander at the zenith point */}
        <path d={`M${C - 6},${C + 5} L${C},${C - 6} L${C + 6},${C + 5} Z`} fill="none" stroke="#eaf2ff" />
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mono-sm text-fog mt-2 justify-center">
        <span><span className="text-signal">■</span> {t('sky.sun')}</span>
        <span><span className="text-cobalt-lt">●</span> {t('sky.earth')}</span>
        <span><span className="text-ice">▲</span> {t('lander')}</span>
      </div>
    </div>
  )
}
