import { useStore, useSite } from '../store.js'
import { CATEGORIES } from '../data/sites.js'
import { stateAt, timeToChange, windowMetrics, verdict, bestWindow, DAY, SYNODIC_H, HOUR } from '../lib/ephem.js'
import { useT, useFmt } from '../lib/i18n.js'
import { AnimNum, useSiteName } from '../lib/ui.jsx'

const LEVEL = {
  green: 'border-go/70 text-go glow-green',
  yellow: 'border-warn/70 text-warn glow-yellow',
  red: 'border-nogo/70 text-nogo glow-red',
}
const ICON = { green: '●', yellow: '●', red: '●' }

function Bar({ pct, from, to }) {
  return (
    <div className="h-1 bg-white/[.06] overflow-hidden">
      <div className="relative h-full bar-fill overflow-hidden" style={{ width: `${pct}%`, background: to ?? from }}>
        <div className="absolute inset-0 shimmer" />
      </div>
    </div>
  )
}

export function useReasons() {
  const t = useT(), f = useFmt()
  return (v) => v.reasons.map(([k, a, h]) => t(k, { v: h != null ? f.h(h) : a })).join(' · ')
}

export default function SiteCard() {
  const t = useT(), f = useFmt(), nm = useSiteName(), reasons = useReasons()
  const site = useSite()
  const { time, kids, shiftTime, setTime, toggleCompare, compareIds, setScenarioB } = useStore()
  if (!site) return null

  const st = stateAt(site, time)
  const sunT = timeToChange(site, time, 'sun')
  const earthT = timeToChange(site, time, 'earth')
  const m = windowMetrics(site, Math.floor(time / HOUR) * HOUR, 14, 1)
  const v = verdict(m, site)
  const best = bestWindow(site, Math.floor(time / DAY) * DAY, 60, 7)
  const cat = CATEGORIES[site.category]

  const countdown = (o, onKey, offKey, noneOn, noneOff, warnOff) => (
    <>
      <span className="text-slate-300 text-xs">{o.on ? t(onKey) : t(offKey)}</span>
      <span className={`text-right font-medium ${(o.on && o.hours != null && o.hours < 24) || (warnOff && !o.on) ? 'text-red-400' : 'text-white'}`}>
        {o.hours == null ? (o.on ? t(noneOn) : t(noneOff)) : `T−${f.h(o.hours)}`}
      </span>
    </>
  )

  return (
    <aside key={site.id} className="panel p-4 flex flex-col gap-3 rise">
      <div>
        <div className="flex items-start gap-2">
          <h2 className="display text-[22px] leading-[1.15] tracking-[-0.01em] flex-1">{nm(site)}</h2>
          <span className="text-[10px] px-2 py-0.5 rounded-[var(--radius-tag)] num tracking-[.12em] whitespace-nowrap" style={{ color: cat.color, border: `1px solid ${cat.color}66` }}>
            {t(`cat.${site.category}`).toUpperCase()}
          </span>
        </div>
        <div className="num text-xs text-slate-400 mt-1">
          {Math.abs(site.lat).toFixed(2)}°{site.lat < 0 ? 'S' : 'N'} · {Math.abs(site.lon).toFixed(2)}°{site.lon < 0 ? 'W' : 'E'} · ∠ {site.slope_deg}°
        </div>
      </div>

      <div className={`border rounded-[var(--radius-btn)] px-3 py-2.5 transition-colors duration-500 ${LEVEL[v.level]}`}>
        <div className="num text-[13px] tracking-[.06em]">{ICON[v.level]} {t(`v.${v.level}`)}</div>
        <div className="text-xs text-slate-300 mt-1.5">{reasons(v)}</div>
        <div className="label !text-[9px] mt-1.5">{t('mission14')}</div>
      </div>

      <div className="rounded-[var(--radius-btn)] border border-[var(--color-line)] p-3">
        <div className="flex items-end justify-between">
          <span className="label !text-amber-300">☀ {t('sunEl')}</span>
          <span className="num text-amber-300 text-[34px] leading-none"><AnimNum value={st.sun.el} digits={2} signed suffix="°" /></span>
        </div>
        <div className="num grid grid-cols-[1fr_auto] gap-y-1.5 text-sm mt-2">
          {countdown(sunT, 'sunsetIn', 'sunriseIn', 'noSunset', 'none60')}
          {countdown(earthT, 'earthsetIn', 'earthriseIn', 'always', 'never', true)}
          <span className="text-slate-300 text-xs">🌍 {t('earthEl')}</span><span className="text-right text-cyan-300"><AnimNum value={st.earth.el} digits={2} suffix="°" /></span>
        </div>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between"><span>☀ {t('sunlight')}</span><span className="num text-amber-300 font-medium"><AnimNum value={m.sunPct} suffix="%" /></span></div>
        <Bar pct={m.sunPct} from="#ff4105" />
        <div className="flex justify-between"><span>📡 {t('dte')}</span><span className="num text-cyan-300 font-medium"><AnimNum value={m.linkPct} suffix="%" /></span></div>
        <Bar pct={m.linkPct} from="#5b8cff" />
        <div className="num grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs text-slate-300 mt-1">
          <span>{t('longestDark')}</span><span className="text-right">{f.h(m.longestDarkH)}</span>
          <span>{t('longestBlackout')}</span><span className="text-right">{f.h(m.longestNoLinkH)}</span>
          <span>{t('avgEl')}</span><span className="text-right">{m.avgSunEl == null ? '—' : m.avgSunEl.toFixed(2) + '°'}</span>
          <span>{t('power')}</span><span className="text-right text-amber-300"><AnimNum value={m.powerKwhDay} digits={1} /> {t('kwhDay')}</span>
          <span>{t('battery')}</span><span className="text-right"><AnimNum value={m.batteryKwh} /> {t('kwh')}</span>
        </div>
      </div>

      <div className="rounded-[var(--radius-btn)] border border-go/40 p-2.5">
        <div className="label">{t('best')}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="num text-sm text-go flex-1">{f.day(best.start)} → {f.day(best.end)}</span>
          <button className="btn" onClick={() => setTime(best.start)}>{t('jump')}</button>
        </div>
      </div>

      <div>
        <div className="label mb-1.5">{t('slip')}</div>
        <div className="flex flex-wrap gap-1">
          <button className="btn" onClick={() => shiftTime(-DAY)}>{t('m1d')}</button>
          <button className="btn" onClick={() => shiftTime(DAY)}>{t('p1d')}</button>
          <button className="btn" onClick={() => shiftTime(7 * DAY)}>{t('p1w')}</button>
          <button className="btn" onClick={() => shiftTime(SYNODIC_H * HOUR)}>{t('nextLunar')}</button>
        </div>
        <div className="flex gap-1 mt-2">
          <button className="btn flex-1 !border-signal !text-signal hover:!bg-signal/10" onClick={() => { setScenarioB({ siteId: site.id, time: time + 12 * DAY }); document.getElementById('scenario')?.scrollIntoView({ behavior: 'smooth' }) }}>{t('compareSlip')}</button>
          <button className={`btn ${compareIds.includes(site.id) ? 'btn-on' : ''}`} onClick={() => toggleCompare(site.id)}>{t('addBars')}</button>
        </div>
      </div>

      <div className="text-[10px] text-slate-500">{t('batteryNote')}</div>
      {kids && <div className="kids">{t('kids.card')}</div>}
    </aside>
  )
}
