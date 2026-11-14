// ⭐ "Schedule slip" scenario comparison — the core use case from the challenge background:
// hardware/launch delays force planners to re-evaluate dates and nearby sites quickly.
import { useStore, useSite } from '../store.js'
import { stateAt, windowMetrics, verdict, DAY, HOUR } from '../lib/ephem.js'
import { useT, useFmt } from '../lib/i18n.js'
import { useSiteName } from '../lib/ui.jsx'

const evalScenario = (site, time) => {
  const m = windowMetrics(site, Math.floor(time / HOUR) * HOUR, 14, 1)
  return { site, time, m, st: stateAt(site, time), v: verdict(m, site) }
}
const LVL = { green: 'text-go', yellow: 'text-warn', red: 'text-nogo' }

export default function ScenarioCompare() {
  const t = useT(), f = useFmt(), nm = useSiteName()
  const { sites, time, scenarioB, setScenarioB } = useStore()
  const siteA = useSite()
  if (!siteA) return null
  const b = scenarioB ?? { siteId: siteA.id, time: time + 12 * DAY }
  const siteB = sites.find((s) => s.id === b.siteId) ?? siteA
  const A = evalScenario(siteA, time), B = evalScenario(siteB, b.time)

  const ROWS = [
    ['row.sunEl', (e) => e.st.sun.el, (x) => `${x.toFixed(2)}°`, 1],
    ['row.sun', (e) => e.m.sunPct, (x) => `${x.toFixed(0)}%`, 1],
    ['row.link', (e) => e.m.linkPct, (x) => `${x.toFixed(0)}%`, 1],
    ['row.dark', (e) => e.m.longestDarkH, (x) => f.h(x), -1],
    ['row.blackout', (e) => e.m.longestNoLinkH, (x) => f.h(x), -1],
    ['row.power', (e) => e.m.powerKwhDay, (x) => `${x.toFixed(1)} ${t('kwhDay')}`, 1],
    ['row.battery', (e) => e.m.batteryKwh, (x) => `${x.toFixed(0)} ${t('kwh')}`, -1],
  ]
  const worse = ROWS.filter(([, g, , d]) => (g(B) - g(A)) * d < -1e-6).map(([k]) => t(k))

  const Head = ({ e, label, editable, accent }) => (
    <div className={`flex flex-col gap-1 rounded-[var(--radius-btn)] p-3 border ${accent}`}>
      <div className="label">{label}</div>
      {editable ? (
        <div className="flex flex-wrap gap-1 items-center">
          <select className="field !py-0.5 text-xs max-w-[220px]" value={siteB.id} onChange={(ev) => setScenarioB({ siteId: ev.target.value, time: b.time })}>
            {sites.map((s) => <option key={s.id} value={s.id}>{nm(s)}</option>)}
          </select>
          {[[-1, 'm1d'], [1, 'p1d'], [7, 'p1w']].map(([d, k]) => <button key={k} className="btn !text-[10px] !px-1.5" onClick={() => setScenarioB({ siteId: siteB.id, time: b.time + d * DAY })}>{t(k)}</button>)}
        </div>
      ) : <div className="display text-[15px]">{nm(e.site)}</div>}
      <div className="num text-xs text-slate-400">{f.day(e.time)}</div>
      <div className={`num text-[11px] tracking-[.06em] ${LVL[e.v.level]}`}>{t(`v.${e.v.level}`)}</div>
    </div>
  )

  return (
    <section id="scenario" className="panel p-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="label">⚖ {t('scenario')}</div>
        <button className="btn !text-[10px] ml-auto" onClick={() => setScenarioB({ siteId: siteA.id, time: time + 12 * DAY })}>{t('reset')}</button>
      </div>
      <div className="grid grid-cols-[1.1fr_1fr_1fr_.8fr] gap-x-4 gap-y-0 text-sm items-stretch">
        <div />
        <Head e={A} label={t('scenA')} accent="border-cobalt-lt/50" />
        <Head e={B} label={t('scenB')} editable accent="border-signal/60" />
        <div className="label self-end pb-2">{t('delta')}</div>
        {ROWS.map(([k, g, fmt, dir], i) => {
          const d = g(B) - g(A), good = d * dir > 1e-6, bad = d * dir < -1e-6
          const cell = 'border-t border-[var(--color-line)] py-1.5'
          return [
            <div key={k + 'l'} className={`${cell} text-slate-300`} style={{ animation: `rise .35s ${i * 0.04}s both` }}>{t(k)}</div>,
            <div key={k + 'a'} className={`${cell} num px-2`}>{fmt(g(A))}</div>,
            <div key={k + 'b'} className={`${cell} num px-2`}>{fmt(g(B))}</div>,
            <div key={k + 'd'} className={`${cell} num ${good ? 'text-go' : bad ? 'text-nogo' : 'text-fog'}`}>{good ? '▲ ' : bad ? '▼ ' : '= '}{fmt(Math.abs(d))}</div>,
          ]
        })}
      </div>
      <div className={`mt-3 text-sm rounded-[var(--radius-btn)] px-3 py-2 border ${worse.length === 0 ? 'border-go/50 text-go' : 'border-nogo/50 text-red-300'}`}>
        {worse.length === 0 ? t('allBetter') : t('worseOn', { v: worse.join(', ') })}
      </div>
    </section>
  )
}
