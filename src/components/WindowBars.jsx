// Gantt-style operational windows: sunlight (amber) + direct-to-Earth link (cyan)
// for every compared site across the next 30 days. Click to jump the timeline.
import { useStore } from '../store.js'
import { windowMetrics, DAY } from '../lib/ephem.js'
import { useT, useFmt } from '../lib/i18n.js'
import { useSiteName } from '../lib/ui.jsx'

const DAYS = 30, STEP = 2

export default function WindowBars() {
  const t = useT(), f = useFmt(), nm = useSiteName()
  const { sites, compareIds, time, select, setTime, selectedId, kids } = useStore()
  const start = Math.floor(time / DAY) * DAY
  const ids = [...new Set([selectedId, ...compareIds])]
  const rows = ids.map((id) => sites.find((s) => s.id === id)).filter(Boolean)
  const n = (DAYS * 24) / STEP
  const nowX = ((time - start) / (DAYS * DAY)) * 100

  const strip = (arr, cls, thr) => {
    const segs = []; let s = -1
    for (let i = 0; i <= n; i++) {
      const on = i < n && arr[i] >= thr
      if (on && s < 0) s = i
      if (!on && s >= 0) { segs.push([s, i]); s = -1 }
    }
    return segs.map(([a, b]) => <div key={a} className={`absolute top-0 bottom-0 rounded-sm ${cls}`} style={{ left: `${(a / n) * 100}%`, width: `${((b - a) / n) * 100}%`, transition: 'left .3s, width .3s' }} />)
  }

  return (
    <section className="panel p-3">
      <div className="flex flex-wrap items-center gap-4 mb-2">
        <div className="label">{t('windows', { n: DAYS })}</div>
        <span className="text-xs flex items-center gap-1"><i className="w-3 h-2 rounded-sm bg-amber-400 inline-block" /> {t('lSun')}</span>
        <span className="text-xs flex items-center gap-1"><i className="w-3 h-2 rounded-sm bg-cyan-400 inline-block" /> {t('lLink')}</span>
        <span className="text-xs flex items-center gap-1"><i className="w-3 h-2 rounded-sm bg-green-500 inline-block shadow-[0_0_6px_#22c55e]" /> {t('lBoth')}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((s, idx) => {
          const m = windowMetrics(s, start, DAYS, STEP)
          const both = Array.from(m.sun, (v, i) => (v >= 0.5 && m.link[i] ? 1 : 0))
          return (
            <div key={s.id} className="flex items-center gap-2" style={{ animation: `rise .4s ${idx * 0.05}s both` }}>
              <button className={`w-52 text-left text-xs truncate transition-colors ${s.id === selectedId ? 'text-cyan-300 font-semibold' : 'text-slate-300 hover:text-white'}`} onClick={() => select(s.id)}>{nm(s)}</button>
              <div className={`relative flex-1 h-8 rounded-md cursor-crosshair bg-white/[.03] ring-1 transition ${s.id === selectedId ? 'ring-cyan-400/40' : 'ring-transparent hover:ring-white/10'}`}
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); select(s.id); setTime(start + ((e.clientX - r.left) / r.width) * DAYS * DAY) }}>
                <div className="absolute inset-x-0 top-0.5 h-[32%]">{strip(m.sun, 'bg-gradient-to-b from-amber-300 to-amber-500', 0.5)}</div>
                <div className="absolute inset-x-0 top-[37%] h-[26%]">{strip(both, 'bg-green-500 shadow-[0_0_8px_#22c55e]', 1)}</div>
                <div className="absolute inset-x-0 bottom-0.5 h-[32%]">{strip(m.link, 'bg-gradient-to-b from-cyan-300 to-cyan-600', 1)}</div>
                {[...Array(DAYS)].map((_, d) => d % 7 === 0 && <span key={d} className="absolute top-0 bottom-0 w-px bg-white/10" style={{ left: `${(d / DAYS) * 100}%` }} />)}
                <div className="absolute -top-1 -bottom-1 w-0.5 bg-white shadow-[0_0_8px_#fff]" style={{ left: `${nowX}%` }} />
              </div>
              <span className="num text-[10px] w-20 text-right"><span className="text-amber-300">{m.sunPct.toFixed(0)}%</span> / <span className="text-cyan-300">{m.linkPct.toFixed(0)}%</span></span>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between num text-[10px] text-slate-500 mt-1 pl-[216px] pr-[88px]">
        <span>{f.day(start)}</span><span>{f.day(start + 15 * DAY)}</span><span>{f.day(start + DAYS * DAY)}</span>
      </div>
      {kids && <div className="kids mt-2">{t('kids.windows')}</div>}
    </section>
  )
}
