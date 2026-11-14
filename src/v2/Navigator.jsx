// The tool itself, set as an editorial spread:
// left — sites as ruled rows; right — the answer for the selected site in big type,
// the 360° horizon, the 3D Moon slot (participant 1), timeline and metric grid.
import { useMemo, useState } from 'react'
import { useStore, useSite } from '../store.js'
import { CATEGORIES } from '../data/sites.js'
import { stateAt, timeToChange, windowMetrics, verdict, bestWindow, score, earthPos, DAY, HOUR, SYNODIC_H } from '../lib/ephem.js'
import { useT, useFmt } from '../lib/i18n.js'
import { AnimNum, useSiteName, Reveal } from '../lib/ui.jsx'
import HorizonPlot from './HorizonPlot.jsx'
import DotMoon from './DotMoon.jsx'
import SkyDial from './SkyDial.jsx'

const VCOL = { green: 'text-go border-go/60', yellow: 'text-warn border-warn/60', red: 'text-nogo border-nogo/60' }
const VDOT = { green: 'bg-go', yellow: 'bg-warn', red: 'bg-nogo' }

export function SectionHead({ kicker, title, sub, right }) {
  return (
    <div data-sfx="head" className="flex flex-col items-center text-center gap-4 mb-14">
      <div className="eyebrow">{kicker}</div>
      <h2 className="h-section max-w-[900px] [text-wrap:balance]">{title.split('*').map((p, i) => <span key={i}>{p}</span>)}</h2>
      {sub && <p className="lux-body max-w-[460px]">{sub}</p>}
      {right && <div className="mt-2 flex flex-wrap justify-center items-center gap-3">{right}</div>}
    </div>
  )
}

function SiteList() {
  const t = useT(), nm = useSiteName()
  const { sites, selectedId, compareIds, time, weights, catFilter, select, toggleCompare, setCatFilter, addCustomSite } = useStore()
  const [q, setQ] = useState('')
  const [lat, setLat] = useState('-85.5'), [lon, setLon] = useState('20')
  const day = Math.floor(time / 3600e3 / 6)
  const rows = useMemo(() => sites.map((s) => {
    const m = windowMetrics(s, day * 6 * 3600e3, 14, 2)
    return { s, v: verdict(m, s), sc: score(m, s, weights) }
  }), [sites, day, weights])
  const list = rows.filter(({ s }) => (catFilter === 'all' || s.category === catFilter) && (s.name + (s.nameRu || '')).toLowerCase().includes(q.toLowerCase()))

  return (
    <div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 mb-5">
        {['all', ...Object.keys(CATEGORIES)].map((c) => (
          <button key={c} onClick={() => setCatFilter(c)} className={`navlink !text-[10px] ${catFilter === c ? 'on' : ''}`}>{c === 'all' ? t('all') : t(`cat.${c}`)}</button>
        ))}
      </div>
      <input className="w-full bg-transparent border-b border-ice/20 focus:border-cobalt-lt outline-none py-2 mb-2 text-[15px] placeholder:text-fog" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul>
        {list.map(({ s, v }, i) => {
          const on = s.id === selectedId
          return (
            <li key={s.id} className={`group grid grid-cols-[24px_1fr_auto_auto] items-center gap-3 py-3 border-b border-ice/10 cursor-pointer transition-colors ${on ? 'text-ice' : 'text-ice/70 hover:text-ice'}`} onClick={() => select(s.id)}>
              <span className={`mono-sm ${on ? 'text-cobalt-lt' : 'text-fog'}`}>{String(i + 1).padStart(2, '0')}</span>
              <span className={`text-[15px] truncate ${on ? 'translate-x-1' : ''} transition-transform`}>{nm(s)}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${VDOT[v.level]}`} title={t(`v.${v.level}`)} />
              <input type="checkbox" aria-label={t('addBars')} checked={compareIds.includes(s.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleCompare(s.id)} />
            </li>
          )
        })}
      </ul>
      <div className="mt-8">
        <div className="mono-sm text-fog mb-3">{t('custom')}</div>
        <div className="flex gap-3 items-center">
          <input className="w-full bg-transparent border-b border-ice/20 focus:border-cobalt-lt outline-none py-1.5 num text-[14px]" value={lat} onChange={(e) => setLat(e.target.value)} placeholder={t('lat')} />
          <input className="w-full bg-transparent border-b border-ice/20 focus:border-cobalt-lt outline-none py-1.5 num text-[14px]" value={lon} onChange={(e) => setLon(e.target.value)} placeholder={t('lon')} />
          <button className="mono-sm text-ice border border-ice/30 hover:border-ice rounded-[var(--radius-btn)] px-3 py-2 shrink-0" onClick={() => { const a = +lat, o = +lon; if (Math.abs(a) <= 90 && Math.abs(o) <= 180) addCustomSite(a, o) }}>{t('evaluate')}</button>
        </div>
      </div>
    </div>
  )
}

function Readout() {
  const t = useT(), f = useFmt(), nm = useSiteName()
  const site = useSite()
  const { time, setTime, shiftTime, setScenarioB, kids } = useStore()
  if (!site) return null
  const st = stateAt(site, time)
  const sunT = timeToChange(site, time, 'sun'), earthT = timeToChange(site, time, 'earth')
  const m = windowMetrics(site, Math.floor(time / HOUR) * HOUR, 14, 1)
  const v = verdict(m, site)
  const best = bestWindow(site, Math.floor(time / DAY) * DAY, 60, 7)
  const reasons = v.reasons.map(([k, a, h]) => t(k, { v: h != null ? f.h(h) : a })).join(' · ')
  const cd = (o, onK, offK, noneOn, noneOff, warnOff) => {
    const warn = (o.on && o.hours != null && o.hours < 24) || (warnOff && !o.on)
    return { label: o.on ? t(onK) : t(offK), value: o.hours == null ? (o.on ? t(noneOn) : t(noneOff)) : `T−${f.h(o.hours)}`, warn }
  }
  const a = cd(sunT, 'sunsetIn', 'sunriseIn', 'noSunset', 'none60'), b = cd(earthT, 'earthsetIn', 'earthriseIn', 'always', 'never', true)

  return (
    <div key={site.id} className="rise">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 mb-2">
        <h3 className="font-display text-[clamp(28px,3.2vw,44px)] leading-[1.06] tracking-[-0.01em]">{nm(site)}</h3>
        <span className="mono-sm" style={{ color: CATEGORIES[site.category].color }}>{t(`cat.${site.category}`)}</span>
      </div>
      <div className="mono-sm text-fog mb-6">
        {Math.abs(site.lat).toFixed(2)}°{site.lat < 0 ? 'S' : 'N'} · {Math.abs(site.lon).toFixed(2)}°{site.lon < 0 ? 'W' : 'E'} · ∠ {site.slope_deg}°
      </div>

      <div className={`inline-flex items-center gap-3 border rounded-[var(--radius-btn)] px-4 py-2.5 mb-8 ${VCOL[v.level]}`}>
        <span className={`w-2 h-2 rounded-full ${VDOT[v.level]}`} />
        <span className="mono !text-[12px]">{t(`v.${v.level}`)}</span>
      </div>
      <p className="text-[15px] text-fog -mt-5 mb-8">{reasons} · {t('mission14')}</p>

      <div className="grid sm:grid-cols-[auto_1fr] gap-x-12 gap-y-6 items-end border-t border-ice/20 pt-6">
        <div>
          <div className="mono-sm text-fog mb-2">{t('sunEl')}</div>
          <div className="font-display text-[clamp(72px,9vw,128px)] leading-[0.9] font-semibold grad-sun glow-sun num-tab"><AnimNum value={st.sun.el} digits={2} signed suffix="°" /></div>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
          {[a, b].map((r, i) => (
            <div key={i}>
              <dt className="mono-sm text-fog mb-1">{r.label}</dt>
              <dd className={`font-display text-[28px] leading-none tracking-[-0.01em] num-tab ${r.warn ? 'text-nogo' : 'text-ice'}`}>{r.value}</dd>
            </div>
          ))}
          <div>
            <dt className="mono-sm text-fog mb-1">{t('earthEl')}</dt>
            <dd className="font-display text-[28px] leading-none num-tab text-cobalt-lt"><AnimNum value={st.earth.el} digits={2} suffix="°" /></dd>
          </div>
          <div>
            <dt className="mono-sm text-fog mb-1">{t('best')}</dt>
            <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[15px] text-go whitespace-nowrap">{f.day(best.start)} → {f.day(best.end)}</span>
              <button className="mono-sm text-ice hover:text-signal" onClick={() => setTime(best.start)}>{t('jump')}</button>
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-8">
        <span className="mono-sm text-fog">{t('slip')}</span>
        {[[-DAY, 'm1d'], [DAY, 'p1d'], [7 * DAY, 'p1w'], [SYNODIC_H * HOUR, 'nextLunar']].map(([d, k]) => (
          <button key={k} className="navlink !text-[10px]" onClick={() => shiftTime(d)}>{t(k)}</button>
        ))}
        <button className="capsule capsule-primary ml-auto" onClick={() => { setScenarioB({ siteId: site.id, time: time + 12 * DAY }); document.getElementById('scenario')?.scrollIntoView({ behavior: 'smooth' }) }}>{t('compareSlip')}</button>
      </div>
      {kids && <p className="kids mt-6">{t('kids.card')}</p>}
    </div>
  )
}

// 14-day elevation trace: lit/visible segments in colour, the rest dim; dashed line = 0°
function Spark({ values, on, color }) {
  const n = values.length, lo = Math.min(-2, ...values), hi = Math.max(2, ...values)
  const W = 200, H = 40, x = (i) => (i / (n - 1)) * W, y = (v) => H - ((v - lo) / (hi - lo)) * H
  let d = '', dOn = ''
  values.forEach((v, i) => { const c = `${x(i).toFixed(1)},${y(v).toFixed(1)}`; d += (i ? 'L' : 'M') + c; dOn += (on[i] ? (i && on[i - 1] ? 'L' : 'M') : '') + (on[i] ? c : '') })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-10 mt-3 block">
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="#eaf2ff" strokeOpacity=".2" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke="#eaf2ff" strokeOpacity=".22" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={dOn} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Metrics() {
  const t = useT(), f = useFmt()
  const site = useSite(); const time = useStore((s) => s.time)
  if (!site) return null
  const t0 = Math.floor(time / HOUR) * HOUR
  const m = windowMetrics(site, t0, 14, 1)
  const earthEl = Array.from({ length: m.link.length }, (_, i) => earthPos(site, t0 + i * HOUR).el)
  const sparks = [<Spark key="s" values={Array.from(m.sunEl)} on={Array.from(m.sun, (v) => v >= 0.5)} color="#ff7a1a" />,
    <Spark key="e" values={earthEl} on={Array.from(m.link, (v) => v === 1)} color="#47c8ff" />]
  const cells = [
    [t('sunlight'), <><AnimNum value={m.sunPct} />%</>, 'text-signal', m.sunPct],
    [t('dte'), <><AnimNum value={m.linkPct} />%</>, 'text-cobalt-lt', m.linkPct],
    [t('longestDark'), f.h(m.longestDarkH), 'text-ice'],
    [t('longestBlackout'), f.h(m.longestNoLinkH), 'text-ice'],
    [t('power'), <><AnimNum value={m.powerKwhDay} digits={1} /> <span className="text-[14px] text-fog">{t('kwhDay')}</span></>, 'text-ice'],
    [t('battery'), <><AnimNum value={m.batteryKwh} /> <span className="text-[14px] text-fog">{t('kwh')}</span></>, 'text-ice'],
  ]
  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 border-t border-l border-ice/15">
        {cells.map(([label, val, col, pct], i) => (
          <div key={i} className="border-r border-b border-ice/15 p-5 min-h-[132px] flex flex-col justify-between">
            <div className="mono-sm text-fog leading-[1.5]">{label}</div>
            <div>
              <div className={`font-display text-[32px] leading-none tracking-[-0.02em] ${col}`}>{val}</div>
              {pct != null && sparks[i]}
            </div>
          </div>
        ))}
      </div>
      <p className="mono-sm text-fog mt-3 normal-case tracking-[.04em]">{t('batteryNote')}</p>
    </div>
  )
}

function Timeline() {
  const t = useT(), f = useFmt()
  const { time, rangeStart, rangeDays, playing, speedH, setTime, setPlaying, setSpeed } = useStore()
  const end = rangeStart + rangeDays * DAY
  const pct = ((time - rangeStart) / (end - rangeStart)) * 100
  const lunarDays = Math.floor(rangeDays / (SYNODIC_H / 24))
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4 py-6 border-y border-ice/20">
      <button onClick={() => setPlaying(!playing)} aria-label={playing ? 'pause' : 'play'}
        className={`w-12 h-12 rounded-full border border-signal text-signal grid place-items-center transition-colors ${playing ? 'bg-signal text-black' : 'hover:bg-signal/10'}`}>
        {playing ? <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="3.5" height="10" fill="currentColor" /><rect x="7.5" y="1" width="3.5" height="10" fill="currentColor" /></svg>
          : <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 1 L11 6 L2 11 Z" fill="currentColor" /></svg>}
      </button>
      <div className="flex gap-5">
        {[[1, 'h1'], [6, 'h6'], [24, 'd1']].map(([h, k]) => (
          <button key={h} className={`navlink !text-[10px] ${speedH === h ? 'on' : ''}`} onClick={() => setSpeed(h)}>{t(k)}{t('perTick')}</button>
        ))}
      </div>
      <span className="mono-sm text-fog hidden md:inline">{f.day(rangeStart)}</span>
      <div className="relative flex-1 min-w-[220px] h-8">
        <div className="absolute inset-x-0 top-1/2 h-px bg-ice/25" />
        {Array.from({ length: lunarDays + 1 }, (_, i) => (
          <span key={i} className="absolute top-1/2 -translate-y-1/2 h-3 w-px bg-ice/30" style={{ left: `${((i * SYNODIC_H * HOUR) / (end - rangeStart)) * 100}%` }} />
        ))}
        <span className="absolute top-0 bottom-0 w-px bg-signal" style={{ left: `${pct}%` }} />
        <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-signal" style={{ left: `${pct}%` }} />
        <input type="range" aria-label={t('landingDate')} className="absolute inset-0 w-full opacity-0 cursor-pointer" min={rangeStart} max={end} step={HOUR} value={time} onChange={(e) => setTime(+e.target.value)} />
      </div>
      <span className="mono-sm text-fog hidden md:inline">{f.day(end)}</span>
      <span className="num text-[15px] text-ice whitespace-nowrap text-right">{f.dt(time)}</span>
    </div>
  )
}

function Priorities() {
  const t = useT(), nm = useSiteName()
  const { sites, time, weights, setWeight, select, kids } = useStore()
  const day = Math.floor(time / 3600e3 / 6)
  const top3 = useMemo(() => sites.map((s) => ({ s, sc: score(windowMetrics(s, day * 6 * 3600e3, 14, 2), s, weights) })).sort((a, b) => b.sc - a.sc).slice(0, 3), [sites, day, weights])
  return (
    <div className="grid lg:grid-cols-2 gap-12">
      <div>
        <div className="mono-sm text-fog mb-5">{t('priorities')}</div>
        {['power', 'comm', 'duration', 'safety'].map((k) => (
          <label key={k} className="grid grid-cols-[150px_1fr_20px] items-center gap-4 py-2.5 border-b border-ice/10">
            <span className="text-[14px] text-ice/80">{t(`w.${k}`).replace(/^\S+\s/, '')}</span>
            <input type="range" min="0" max="5" value={weights[k]} onChange={(e) => setWeight(k, +e.target.value)} />
            <span className="num text-[13px] text-cobalt-lt text-right">{weights[k]}</span>
          </label>
        ))}
        {kids && <p className="kids mt-4">{t('kids.priorities')}</p>}
      </div>
      <div>
        <div className="mono-sm text-fog mb-5">{t('top3')}</div>
        {top3.map(({ s, sc }, i) => (
          <button key={s.id} onClick={() => select(s.id)} className="w-full grid grid-cols-[48px_1fr_auto] items-baseline gap-4 py-3 border-b border-ice/10 text-left hover:text-signal transition-colors">
            <span className="font-display text-[28px] leading-none text-fog">0{i + 1}</span>
            <span className="text-[17px] truncate">{nm(s)}</span>
            <span className="num text-[15px]"><AnimNum value={sc} /></span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Steps() {
  const t = useT(), f = useFmt(), nm = useSiteName()
  const site = useSite(); const time = useStore((s) => s.time)
  if (!site) return null
  const v = verdict(windowMetrics(site, Math.floor(time / HOUR) * HOUR, 14, 1), site)
  const col = { green: 'text-go', yellow: 'text-warn', red: 'text-nogo' }[v.level]
  const steps = [[t('step.site'), nm(site).split(' — ')[0], 'text-ice'], [t('step.date'), f.day(time), 'text-ice'], [t('step.answer'), t(`v.${v.level}`).split(' — ')[0], col]]
  return (
    <div className="grid md:grid-cols-3 gap-3">
      {steps.map(([label, val, cls], i) => (
        <div key={i} className="card px-5 py-4 flex items-center gap-4" style={{ '--glow': i === 2 ? 'rgb(124 255 107 / .2)' : 'rgb(61 123 255 / .2)' }}>
          <span className="pixel text-[14px] w-10 h-10 grid place-items-center rounded-[10px] bg-ice/10 text-ice shrink-0">{i + 1}</span>
          <div className="min-w-0">
            <div className="mono-sm text-fog">{label}</div>
            <div className={`font-display text-[22px] font-semibold truncate ${cls}`}>{val}</div>
          </div>
          {i < 2 && <span className="ml-auto text-fog hidden md:inline pixel text-[12px]">→</span>}
        </div>
      ))}
    </div>
  )
}

function SkyTabs() {
  const t = useT()
  const [tab, setTab] = useState('horizon')
  return (
    <div>
      <div className="seg mb-3">
        <button className={tab === 'horizon' ? 'on' : ''} onClick={() => setTab('horizon')}>{t('tabs.horizon')}</button>
        <button className={tab === 'sky' ? 'on' : ''} onClick={() => setTab('sky')}>{t('tabs.sky')}</button>
      </div>
      {tab === 'horizon' ? <HorizonPlot /> : <div className="max-w-[560px]"><SkyDial /></div>}
    </div>
  )
}

function ReadoutCard() {
  const site = useSite(); const time = useStore((s) => s.time)
  if (!site) return null
  const v = verdict(windowMetrics(site, Math.floor(time / HOUR) * HOUR, 14, 1), site)
  const glow = { green: 'rgb(124 255 107 / .22)', yellow: 'rgb(255 216 77 / .22)', red: 'rgb(255 77 109 / .25)' }[v.level]
  return <div className="glass p-7"><Readout /></div>
}

export default function Navigator() {
  const t = useT(), f = useFmt()
  const { time, setTime, kids, setKids, mockData } = useStore()
  return (
    <section id="navigator" className="py-[var(--section-gap)] scroll-mt-2">
      <div className="wrap">
        <Reveal>
          <SectionHead kicker={t('nav.nav')} title={t('nav2.title')} sub={t('nav5.sub')} right={
            <div className="flex flex-wrap items-center gap-5">
              {mockData && <span className="mono-sm text-warn border border-warn/50 rounded-[var(--radius-tag)] px-2 py-1">{t('demo')}</span>}
              <label className="flex items-center gap-3">
                <span className="mono-sm text-fog">{t('landingDate')}</span>
                <input type="datetime-local" className="bg-transparent border-b border-ice/30 focus:border-cobalt-lt outline-none py-1 num text-[14px]" value={new Date(time).toISOString().slice(0, 16)}
                  onChange={(e) => e.target.value && setTime(Date.parse(e.target.value + ':00Z'))} />
              </label>
              <button className={`navlink ${kids ? 'on' : ''}`} onClick={() => setKids(!kids)}>{t('explain').replace(/^\S+\s/, '')}</button>
            </div>
          } />
        </Reveal>

        <div className="grid xl:grid-cols-[minmax(300px,4fr)_8fr] gap-x-6 gap-y-6">
          <Reveal className="glass p-6 self-start"><SiteList /></Reveal>
          <div className="flex flex-col gap-8 min-w-0">
            <ReadoutCard />
            <SkyTabs />
            {kids && <p className="kids -mt-6">{t('kids.horizon')}</p>}
          </div>
        </div>

        <div className="mt-14"><Timeline /></div>
        <div className="mt-10"><Metrics /></div>

        <div className="grid xl:grid-cols-[4fr_8fr] gap-x-16 gap-y-10 mt-[var(--section-gap)]">
          <div>
            <div className="mono text-fog mb-5">{t('moon.kicker')}</div>
            <h3 className="h-sm mb-4">{t('moon.title')}</h3>
            <p className="text-[15px] leading-[1.6] text-fog">{t('moon.text')}</p>
            <p className="mono-sm text-fog mt-6">{f.dt(time)}</p>
          </div>
          <div className="moon-slot"><DotMoon /></div>
        </div>

        <div className="mt-[var(--section-gap)]"><Priorities /></div>
      </div>
    </section>
  )
}
