// Lower spreads: 30-day window heatmap, mission slip (A VS B), four steps, footer.
import { useState } from 'react'
import { useStore, useSite } from '../store.js'
import { stateAt, windowMetrics, verdict, DAY, HOUR } from '../lib/ephem.js'
import { useT, useFmt } from '../lib/i18n.js'
import { useSiteName, Reveal } from '../lib/ui.jsx'
import { SectionHead } from './Navigator.jsx'
import { FlagMark } from './Hero.jsx'
import PixelIcon from './PixelIcon.jsx'

const follow = (e) => {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}
const CELL = { both: '#7cff6b', sun: '#ff7a1a', link: '#47c8ff', none: 'rgba(234,242,255,.07)' }

/* ---------------- 30-day windows: pixel heatmap (one cell = 6 h) ---------------- */
export function Windows() {
  const t = useT(), f = useFmt(), nm = useSiteName()
  const { sites, compareIds, time, select, setTime, selectedId, kids } = useStore()
  const [tip, setTip] = useState(null)
  const DAYS = 30, STEP = 6, N = (DAYS * 24) / STEP
  const start = Math.floor(time / DAY) * DAY
  const ids = [...new Set([selectedId, ...compareIds])]
  const rows = ids.map((id) => sites.find((s) => s.id === id)).filter(Boolean)
  const nowI = Math.floor((time - start) / (STEP * HOUR))

  return (
    <section id="windows" className="py-[var(--section-gap)]">
      <div className="wrap">
        <Reveal><SectionHead kicker={t('windows', { n: DAYS })} title={t('win2.title')} sub={t('win5.sub')} right={
          <div className="flex flex-wrap gap-2">
            {[['both', t('lBoth')], ['sun', t('lSun')], ['link', t('lLink')], ['none', t('win3.none')]].map(([k, l]) => (
              <span key={k} className="flex items-center gap-2 text-[13px] text-ice/70 mr-4"><i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: CELL[k] }} />{l}</span>
            ))}
          </div>} /></Reveal>

        <Reveal className="glass p-6 md:p-9">
          <div className="hidden md:grid grid-cols-[230px_1fr_90px] gap-x-5 mb-3">
            <span />
            <div className="relative h-4">
              {[0, 7, 14, 21, 28].map((d) => <span key={d} className="absolute mono-sm text-fog -translate-x-1/2 whitespace-nowrap" style={{ left: `${(d / DAYS) * 100}%` }}>{f.day(start + d * DAY).replace(/\s*г\.$/, '')}</span>)}
            </div>
            <span />
          </div>
          {rows.map((s) => {
            const m = windowMetrics(s, start, DAYS, STEP)
            const on = s.id === selectedId
            return (
              <div key={s.id} className="grid grid-cols-1 md:grid-cols-[230px_1fr_90px] items-center gap-x-5 gap-y-2 py-2.5">
                <button onClick={() => select(s.id)} className={`text-left text-[15px] truncate font-display font-semibold ${on ? 'text-ice' : 'text-ice/55 hover:text-ice'}`}>
                  {on && <span className="text-go mr-2">▶</span>}{nm(s).split(' — ')[0]}
                </button>
                <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }} onMouseLeave={() => setTip(null)}>
                  {Array.from({ length: N }, (_, i) => {
                    const sun = m.sun[i] >= 0.5, link = m.link[i] === 1
                    const k = sun && link ? 'both' : sun ? 'sun' : link ? 'link' : 'none'
                    const ti = start + i * STEP * HOUR
                    return (
                      <button key={i} aria-label={f.dt(ti)}
                        onMouseEnter={() => setTip(`${nm(s).split(' — ')[0]} · ${f.dt(ti)} · ${k === 'both' ? t('lBoth') : k === 'sun' ? t('lSun') : k === 'link' ? t('lLink') : t('win3.none')}`)}
                        onClick={() => { select(s.id); setTime(ti) }}
                        className={`h-5 rounded-[3px] transition-transform hover:scale-y-125 ${i === nowI ? 'ring-1 ring-ice' : ''}`}
                        style={{ background: CELL[k] }} />
                    )
                  })}
                </div>
                <div className="font-display text-[15px] font-semibold text-right"><span className="grad-sun">{m.sunPct.toFixed(0)}%</span> <span className="text-fog">/</span> <span className="grad-earth">{m.linkPct.toFixed(0)}%</span></div>
              </div>
            )
          })}
          <div className="mono-sm text-fog mt-4 min-h-[1.2em] normal-case tracking-[.04em]">{tip ?? t('win3.hint')}</div>
        </Reveal>
        {kids && <p className="kids mt-6">{t('kids.windows')}</p>}
      </div>
    </section>
  )
}

/* ---------------- mission slip: A VS B ---------------- */
const evalS = (site, time) => { const m = windowMetrics(site, Math.floor(time / HOUR) * HOUR, 14, 1); return { site, time, m, st: stateAt(site, time), v: verdict(m, site) } }
const VCOL = { green: 'text-go', yellow: 'text-warn', red: 'text-nogo' }
const VGLOW = { green: 'rgb(124 255 107 / .28)', yellow: 'rgb(255 216 77 / .28)', red: 'rgb(255 77 109 / .32)' }

export function Scenario() {
  const t = useT(), f = useFmt(), nm = useSiteName()
  const { sites, time, scenarioB, setScenarioB } = useStore()
  const siteA = useSite()
  if (!siteA) return null
  const b = scenarioB ?? { siteId: siteA.id, time: time + 12 * DAY }
  const siteB = sites.find((s) => s.id === b.siteId) ?? siteA
  const A = evalS(siteA, time), B = evalS(siteB, b.time)
  const ROWS = [
    ['row.sunEl', (e) => e.st.sun.el, (x) => `${x.toFixed(2)}°`, 1],
    ['row.sun', (e) => e.m.sunPct, (x) => `${x.toFixed(0)}%`, 1],
    ['row.link', (e) => e.m.linkPct, (x) => `${x.toFixed(0)}%`, 1],
    ['row.dark', (e) => e.m.longestDarkH, (x) => f.h(x), -1],
    ['row.blackout', (e) => e.m.longestNoLinkH, (x) => f.h(x), -1],
    ['row.power', (e) => e.m.powerKwhDay, (x) => `${x.toFixed(1)} ${t('kwhDay')}`, 1],
    ['row.battery', (e) => e.m.batteryKwh, (x) => `${x.toFixed(0)} ${t('kwh')}`, -1],
  ]
  const worse = ROWS.filter(([k, g, , d]) => ['row.sun', 'row.link', 'row.dark', 'row.power'].includes(k) && (g(B) - g(A)) * d < -1e-6).map(([k]) => t(k).replace(/\s*\(.*\)/, '').toLowerCase()).slice(0, 3)
  const days = Math.round((b.time - time) / DAY)

  const side = (e, label, editable) => (
    <div className="p-7 md:p-9 h-full">
      <div className="flex items-center justify-between mb-5 gap-3">
        <span className="text-[13px] text-fog">{label}</span>
        <span className={`font-display font-bold text-[22px] ${VCOL[e.v.level]}`}>● {t(`v.${e.v.level}`).split(' — ')[0]}</span>
      </div>
      {editable ? (
        <select className="w-full bg-transparent border-b border-ice/25 py-1 font-display text-[24px] font-bold outline-none mb-2" value={siteB.id} onChange={(ev) => setScenarioB({ siteId: ev.target.value, time: b.time })}>
          {sites.map((s) => <option key={s.id} value={s.id} className="bg-void text-[15px]">{nm(s)}</option>)}
        </select>
      ) : <div className="font-display text-[24px] font-bold py-1 mb-2 truncate">{nm(e.site)}</div>}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="chip">{f.day(e.time)}</span>
        {editable && [[-1, 'm1d'], [1, 'p1d'], [7, 'p1w']].map(([d, k]) => <button key={k} className="chip hover:border-ice/40 hover:text-ice text-fog" onClick={() => setScenarioB({ siteId: siteB.id, time: b.time + d * DAY })}>{t(k)}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><div className="mono-sm text-fog">{t('row.sun')}</div><div className="font-display text-[40px] font-bold grad-sun leading-none mt-1">{e.m.sunPct.toFixed(0)}%</div></div>
        <div><div className="mono-sm text-fog">{t('row.link')}</div><div className="font-display text-[40px] font-bold grad-earth leading-none mt-1">{e.m.linkPct.toFixed(0)}%</div></div>
      </div>
    </div>
  )

  return (
    <section id="scenario" className="py-[var(--section-gap)]">
      <div className="wrap">
        <Reveal><SectionHead kicker={t('slip')} title={t('scen2.title', { d: days })} sub={t('scen5.sub')} right={
          <button className="capsule" onClick={() => setScenarioB({ siteId: siteA.id, time: time + 12 * DAY })}>↺ {t('reset')}</button>} /></Reveal>

        <Reveal className="glass overflow-hidden">
        <div className="grid md:grid-cols-[1fr_auto_1fr] items-stretch border-b border-white/10">
          {side(A, t('scenA'), false)}
          <div className="hidden md:grid place-items-center px-2">
            <span className="text-[13px] text-fog w-11 h-11 grid place-items-center rounded-full border border-white/15 bg-white/5">vs</span>
          </div>
          {side(B, t('scenB'), true)}
        </div>
        <div className="p-6 md:p-9">
          <div className="grid lg:grid-cols-2 gap-x-14">
            {ROWS.map(([k, g, fmt, dir]) => {
              const va = g(A), vb = g(B), d = vb - va, good = d * dir > 1e-6, bad = d * dir < -1e-6
              const span = k === 'row.sunEl' ? [Math.min(va, vb, -5), Math.max(va, vb, 5)] : [0, Math.max(Math.abs(va), Math.abs(vb), 1e-6) * 1.08]
              const pct = (v) => `${Math.max(1.5, ((v - span[0]) / (span[1] - span[0])) * 100)}%`
              return (
                <div key={k} className="py-4 border-b border-ice/10">
                  <div className="flex items-baseline justify-between gap-4 mb-2.5">
                    <span className="text-[15px] text-ice/85">{t(k)}</span>
                    <span className={`chip !py-1 ${good ? 'text-go border-go/40' : bad ? 'text-nogo border-nogo/40' : 'text-fog'}`}>{good ? '▲' : bad ? '▼' : '='} {fmt(Math.abs(d))}</span>
                  </div>
                  {[['A', va, 'linear-gradient(90deg,#eaf2ff80,#eaf2ffcc)'], ['B', vb, bad ? 'linear-gradient(90deg,#ff4d6d,#ff7a1a)' : good ? 'linear-gradient(90deg,#47c8ff,#7cff6b)' : 'linear-gradient(90deg,#eaf2ff80,#eaf2ffcc)']].map(([lab, v, bg]) => (
                    <div key={lab} className="grid grid-cols-[18px_1fr_110px] items-center gap-3 mt-1.5">
                      <span className="mono-sm text-fog">{lab}</span>
                      <div className="h-[8px] rounded-full bg-ice/[.06] relative overflow-hidden">
                        <div className="absolute inset-y-0 left-0 rounded-full bar-fill" style={{ width: pct(v), background: bg }} />
                      </div>
                      <span className="num text-[13px] text-right text-ice/90">{fmt(v)}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          <p className={`font-display font-bold text-[clamp(20px,2.2vw,28px)] leading-[1.3] mt-8 ${worse.length ? 'text-ice' : 'text-go'}`}>
            {worse.length ? <>⚠ {t('scen2.worse', { v: worse.join(', ') })}</> : <>✓ {t('allBetter').replace(/^\S+\s/, '')}</>}
          </p>
        </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------------- four steps, closing choice, footer ---------------- */
function Emblem({ kind }) {
  return (
    <svg viewBox="0 0 300 160" className="w-full max-w-[320px] flex-1 [mask-image:radial-gradient(70%_80%_at_50%_45%,black,transparent)]" aria-hidden="true">
      <g stroke="rgba(186,207,247,.1)" fill="none">
        <path d="M0 80 H90 l10 -10 H120" /><path d="M300 80 H210 l-10 10 H180" /><path d="M150 0 V40" /><path d="M150 160 V120" />
      </g>
      {kind === 'nav' ? (
        <g>
          <rect x="100" y="40" width="100" height="80" rx="18" fill="#0a0c17" stroke="rgba(216,236,248,.22)" />
          <path d="M118 96 L140 70 L156 84 L170 66 L184 96 Z" fill="none" stroke="rgba(152,192,239,.7)" />
          <rect x="166" y="54" width="7" height="7" fill="#ffab5c" />
        </g>
      ) : (
        <g>
          <circle cx="150" cy="80" r="42" fill="#0a0c17" stroke="rgba(216,236,248,.22)" />
          <path d="M126 80 h48 M162 68 l12 12 -12 12" fill="none" stroke="rgba(152,192,239,.75)" />
        </g>
      )}
      {[[90, 80], [210, 80], [150, 40], [150, 120]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2" fill="#c2ccff" opacity=".7" />)}
    </svg>
  )
}
export function Info() {
  const t = useT()
  const icons = ['moon', 'time', 'sun', 'earth']
  return (
    <>
      <section id="how" className="py-[var(--section-gap)]">
        <div className="wrap">
          <Reveal><SectionHead kicker={t('nav.how')} title={t('how2.title')} sub={t('how5.sub')} /></Reveal>
          <Reveal className="mx-auto max-w-[1076px] grid sm:grid-cols-2 xl:grid-cols-4 border-y border-[rgba(186,207,247,.1)]">
            {t('how.steps').map(([h, p], i) => (
              <div key={i} className={`px-8 py-12 flex flex-col gap-3 border-[rgba(186,207,247,.1)] ${i > 0 ? 'xl:border-l' : ''} ${i % 2 ? 'sm:border-l' : ''} ${i > 1 ? 'sm:border-t xl:border-t-0' : ''} ${i > 0 ? 'border-t sm:border-t-0' : ''}`}>
                <span className="text-[13px] lux-muted">0{i + 1}</span>
                <h3 className="lux-h-card !text-[22px] !leading-[28px]">{h}</h3>
                <p className="lux-body !text-[15px]">{p}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section id="go" className="pt-[180px] pb-[120px]">
        <div className="wrap">
          <Reveal className="text-center mb-14"><h2 className="h-section !font-normal">{t('close.title')}</h2></Reveal>
          <div className="mx-auto max-w-[940px] grid md:grid-cols-2 gap-6">
            {[['navigator', t('close.a1'), t('close.a2'), 'nav'], ['scenario', t('close.b1'), t('close.b2'), 'slip']].map(([id, h, p, kind]) => (
              <button key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })} className="lux-glass reg-dots h-[332px] flex flex-col justify-end items-center text-center p-8 overflow-hidden">
                <Emblem kind={kind} />
                <div className="lux-h-card mt-6">{h}</div>
                <div className="text-[15px] lux-muted mt-2">{p}</div>
              </button>
            ))}
          </div>
          <div className="flex justify-center mt-24"><button className="capsule" onClick={() => document.getElementById('top')?.scrollIntoView({ behavior: 'smooth' })}>↑ {t('close.top')}</button></div>
        </div>
      </section>

      <footer className="border-t border-ice/10">
        <div className="wrap py-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          <FlagMark /><span className="font-display text-[18px] font-bold">Lunar<span className="accent">Window</span></span>
          <span className="mono-sm text-fog ml-auto normal-case tracking-[.04em]">{t('footer')}</span>
        </div>
      </footer>
    </>
  )
}
