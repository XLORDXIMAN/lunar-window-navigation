// Lower spreads: 30-day operating windows, the mission-slip comparison,
// How it works / NASA data / Team, footer.
import { useStore, useSite } from '../store.js'
import { stateAt, windowMetrics, verdict, DAY, HOUR } from '../lib/ephem.js'
import { useT, useFmt } from '../lib/i18n.js'
import { useSiteName, Reveal } from '../lib/ui.jsx'
import { SectionHead } from './Navigator.jsx'
import { FlagMark } from './Hero.jsx'

/* ---------------- 30-day windows ---------------- */
export function Windows() {
  const t = useT(), f = useFmt(), nm = useSiteName()
  const { sites, compareIds, time, select, setTime, selectedId, kids } = useStore()
  const DAYS = 30, STEP = 2
  const start = Math.floor(time / DAY) * DAY
  const ids = [...new Set([selectedId, ...compareIds])]
  const rows = ids.map((id) => sites.find((s) => s.id === id)).filter(Boolean)
  const n = (DAYS * 24) / STEP
  const nowX = ((time - start) / (DAYS * DAY)) * 100
  const segs = (arr, thr) => { const out = []; let s = -1; for (let i = 0; i <= n; i++) { const on = i < n && arr[i] >= thr; if (on && s < 0) s = i; if (!on && s >= 0) { out.push([s, i]); s = -1 } } return out }
  const bar = (arr, thr, cls, top) => segs(arr, thr).map(([a, b]) => (
    <span key={a} className={`absolute ${cls}`} style={{ left: `${(a / n) * 100}%`, width: `${((b - a) / n) * 100}%`, top }} />
  ))
  return (
    <section id="windows" className="bg-carbon py-[var(--section-gap)]">
      <div className="wrap">
        <Reveal><SectionHead n="03" kicker={t('windows', { n: DAYS })} title={t('win2.title')} right={
          <div className="flex gap-6 mono-sm">
            <span className="flex items-center gap-2 text-signal"><i className="w-5 h-[3px] bg-signal" />{t('lSun')}</span>
            <span className="flex items-center gap-2 text-cobalt-lt"><i className="w-5 h-[3px] bg-cobalt-lt" />{t('lLink')}</span>
            <span className="flex items-center gap-2 text-go"><i className="w-5 h-[3px] bg-go" />{t('lBoth')}</span>
          </div>} /></Reveal>
        <div className="border-t border-ice/20">
          {rows.map((s) => {
            const m = windowMetrics(s, start, DAYS, STEP)
            const both = Array.from(m.sun, (v, i) => (v >= 0.5 && m.link[i] ? 1 : 0))
            const on = s.id === selectedId
            return (
              <div key={s.id} className="grid grid-cols-1 md:grid-cols-[260px_1fr_110px] items-center gap-x-6 gap-y-2 py-5 border-b border-ice/15">
                <button onClick={() => select(s.id)} className={`text-left text-[15px] truncate ${on ? 'text-ice' : 'text-ice/60 hover:text-ice'}`}>{on && <span className="text-cobalt-lt mr-2">●</span>}{nm(s)}</button>
                <div className="relative h-10 cursor-crosshair" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); select(s.id); setTime(start + ((e.clientX - r.left) / r.width) * DAYS * DAY) }}>
                  {[...Array(DAYS + 1)].map((_, d) => d % 7 === 0 && <span key={d} className="absolute top-0 bottom-0 w-px bg-ice/10" style={{ left: `${(d / DAYS) * 100}%` }} />)}
                  {bar(m.sun, 0.5, 'h-[3px] bg-signal', '8px')}
                  {bar(both, 1, 'h-[3px] bg-go', '18px')}
                  {bar(m.link, 1, 'h-[3px] bg-cobalt-lt', '28px')}
                  <span className="absolute -top-1 -bottom-1 w-px bg-ice" style={{ left: `${nowX}%` }} />
                </div>
                <div className="num text-[13px] text-right"><span className="text-signal">{m.sunPct.toFixed(0)}%</span> <span className="text-fog">/</span> <span className="text-cobalt-lt">{m.linkPct.toFixed(0)}%</span></div>
              </div>
            )
          })}
        </div>
        <div className="hidden md:grid grid-cols-[260px_1fr_110px] gap-x-6 mt-3">
          <span /><div className="flex justify-between mono-sm text-fog"><span>{f.day(start)}</span><span>{f.day(start + 15 * DAY)}</span><span>{f.day(start + DAYS * DAY)}</span></div><span />
        </div>
        {kids && <p className="kids mt-6">{t('kids.windows')}</p>}
      </div>
    </section>
  )
}

/* ---------------- mission slip A vs B ---------------- */
const evalS = (site, time) => { const m = windowMetrics(site, Math.floor(time / HOUR) * HOUR, 14, 1); return { site, time, m, st: stateAt(site, time), v: verdict(m, site) } }
const LVL = { green: 'text-go', yellow: 'text-warn', red: 'text-nogo' }

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
  // the three numbers that matter most for the verdict
  const worse = ROWS.filter(([k, g, , d]) => ['row.sun', 'row.link', 'row.dark', 'row.power'].includes(k) && (g(B) - g(A)) * d < -1e-6).map(([k]) => t(k).replace(/\s*\(.*\)/, '').toLowerCase()).slice(0, 3)
  const days = Math.round((b.time - time) / DAY)

  const Col = ({ e, label, editable }) => (
    <div className={`p-6 ${editable ? 'frame' : 'border border-ice/20 rounded-[var(--radius-btn)]'}`}>
      <div className="mono-sm text-fog mb-4">{label}</div>
      {editable ? (
        <select className="w-full bg-transparent border-b border-ice/30 py-1 text-[17px] outline-none mb-2" value={siteB.id} onChange={(ev) => setScenarioB({ siteId: ev.target.value, time: b.time })}>
          {sites.map((s) => <option key={s.id} value={s.id} className="bg-black">{nm(s)}</option>)}
        </select>
      ) : <div className="text-[17px] mb-2 py-1">{nm(e.site)}</div>}
      <div className="flex items-center gap-4 mb-4">
        <span className="num text-[14px] text-ice/80">{f.day(e.time)}</span>
        {editable && [[-1, 'm1d'], [1, 'p1d'], [7, 'p1w']].map(([d, k]) => <button key={k} className="navlink !text-[10px]" onClick={() => setScenarioB({ siteId: siteB.id, time: b.time + d * DAY })}>{t(k)}</button>)}
      </div>
      <div className={`mono !text-[11px] ${LVL[e.v.level]}`}>● {t(`v.${e.v.level}`)}</div>
    </div>
  )

  return (
    <section id="scenario" className="bg-black py-[var(--section-gap)]">
      <div className="wrap">
        <Reveal><SectionHead n="04" kicker={t('slip')} title={t('scen2.title', { d: days })} right={
          <button className="navlink" onClick={() => setScenarioB({ siteId: siteA.id, time: time + 12 * DAY })}>{t('reset')}</button>} /></Reveal>
        <div className="grid md:grid-cols-2 gap-4 mb-10">
          <Col e={A} label={t('scenA')} />
          <Col e={B} label={t('scenB')} editable />
        </div>
        <div className="border-t border-ice/20">
          {ROWS.map(([k, g, fmt, dir]) => {
            const d = g(B) - g(A), good = d * dir > 1e-6, bad = d * dir < -1e-6
            return (
              <div key={k} className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-4 py-4 border-b border-ice/10 items-baseline">
                <span className="text-[15px] text-ice/80">{t(k)}</span>
                <span className="num text-[15px]">{fmt(g(A))}</span>
                <span className="num text-[15px]">{fmt(g(B))}</span>
                <span className={`num text-[15px] text-right ${good ? 'text-go' : bad ? 'text-nogo' : 'text-fog'}`}>{good ? '▲' : bad ? '▼' : '='} {fmt(Math.abs(d))}</span>
              </div>
            )
          })}
        </div>
        <p className={`font-display text-[clamp(20px,2.2vw,28px)] leading-[1.3] mt-10 max-w-[900px] ${worse.length ? 'text-ice' : 'text-go'}`}>
          {worse.length ? t('scen2.worse', { v: worse.join(', ') }) : t('allBetter').replace(/^\S+\s/, '')}
        </p>
      </div>
    </section>
  )
}

/* ---------------- how / data / team / footer ---------------- */
export function Info() {
  const t = useT()
  const mock = useStore((s) => s.mockData)
  return (
    <>
      <section id="how" className="bg-carbon py-[var(--section-gap)]">
        <div className="wrap">
          <Reveal><SectionHead n="05" kicker={t('nav.how')} title={t('how2.title')} /></Reveal>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 border-t border-ice/20">
            {t('how.steps').map(([h, p], i) => (
              <Reveal key={i} delay={i * 0.06} className={`pt-8 pb-10 pr-8 ${i > 0 ? 'xl:border-l xl:pl-8' : ''} border-ice/20`}>
                <div className="font-display text-[56px] leading-none text-fog/60 mb-6">0{i + 1}</div>
                <h3 className="h-sm mb-3">{h}</h3>
                <p className="text-[15px] leading-[1.6] text-fog">{p}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="data" className="bg-black py-[var(--section-gap)]">
        <div className="wrap">
          <Reveal><SectionHead n="06" kicker={t('nav.data')} title={t('data2.title')} /></Reveal>
          <div className="border-t border-ice/20">
            {t('data.items').map(([h, p], i) => (
              <Reveal key={i} delay={i * 0.05} className="grid md:grid-cols-[320px_1fr] gap-x-10 gap-y-2 py-6 border-b border-ice/15">
                <span className="mono text-ice">{h}</span>
                <span className="text-[16px] leading-[1.6] text-fog">{p}</span>
              </Reveal>
            ))}
          </div>
          <p className={`mono-sm mt-6 normal-case tracking-[.04em] ${mock ? 'text-warn' : 'text-go'}`}>● {mock ? t('data.demo') : t('data.real')}</p>
        </div>
      </section>

      <section id="team" className="bg-carbon py-[var(--section-gap)]">
        <div className="wrap">
          <Reveal><SectionHead n="07" kicker={t('nav.team')} title={t('team2.title')} /></Reveal>
          <div className="grid md:grid-cols-3 border-t border-ice/20">
            {t('team.roles').map(([who, role], i) => (
              <Reveal key={i} delay={i * 0.06} className={`pt-8 pb-10 pr-8 ${i > 0 ? 'md:border-l md:pl-8' : ''} border-ice/20`}>
                <div className="mono-sm text-fog mb-6">{who}</div>
                <p className="h-sm">{role}</p>
              </Reveal>
            ))}
          </div>
          <p className="mono text-fog mt-10">{t('team.place')}</p>
        </div>
      </section>

      <footer className="bg-black border-t border-ice/15">
        <div className="wrap py-10 flex flex-wrap items-center gap-6">
          <FlagMark /><span className="font-display text-[15px]">MainTech</span>
          <span className="mono-sm text-fog ml-auto normal-case tracking-[.04em]">{t('footer')}</span>
        </div>
      </footer>
    </>
  )
}
