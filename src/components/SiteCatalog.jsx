import { useMemo, useState } from 'react'
import { useStore } from '../store.js'
import { CATEGORIES } from '../data/sites.js'
import { windowMetrics, verdict, score } from '../lib/ephem.js'
import { useT } from '../lib/i18n.js'
import { useSiteName, AnimNum } from '../lib/ui.jsx'

const DOT = { green: 'bg-go', yellow: 'bg-warn', red: 'bg-nogo' }

export default function SiteCatalog() {
  const t = useT(), nm = useSiteName()
  const { sites, selectedId, compareIds, time, weights, catFilter, kids } = useStore()
  const { select, toggleCompare, setCatFilter, setWeight, addCustomSite } = useStore()
  const [q, setQ] = useState('')
  const [lat, setLat] = useState('-85.5')
  const [lon, setLon] = useState('20')

  const day = Math.floor(time / 3600e3 / 6) // recompute every 6 simulated hours
  const rows = useMemo(() => sites.map((s) => {
    const m = windowMetrics(s, day * 6 * 3600e3, 14, 2)
    return { s, v: verdict(m, s), sc: score(m, s, weights) }
  }), [sites, day, weights])

  const top3 = [...rows].sort((a, b) => b.sc - a.sc).slice(0, 3)
  const list = rows.filter(({ s }) => (catFilter === 'all' || s.category === catFilter) && (s.name + (s.nameRu || '')).toLowerCase().includes(q.toLowerCase()))

  return (
    <aside className="panel p-3 flex flex-col gap-3 xl:max-h-[calc(100vh-110px)] overflow-auto">
      <div className="label">{t('sites')} <span className="text-cobalt-lt">· {sites.length}</span></div>
      <input className="field text-sm" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex flex-wrap gap-1">
        {['all', ...Object.keys(CATEGORIES)].map((c) => (
          <button key={c} className={`btn !text-[10px] !px-2 flex items-center gap-1 ${catFilter === c ? 'btn-on' : ''}`} onClick={() => setCatFilter(c)}>
            {c !== 'all' && <span className="w-1.5 h-1.5 rounded-full" style={{ background: CATEGORIES[c].color }} />}
            {c === 'all' ? t('all') : t(`cat.${c}`)}
          </button>
        ))}
      </div>

      <ul className="flex flex-col gap-0.5">
        {list.map(({ s, v }, i) => (
          <li key={s.id} style={{ animation: `rise .4s ${i * 0.03}s both` }}
            className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-all duration-200 ${s.id === selectedId ? 'bg-cobalt/15 ring-1 ring-cobalt-lt/70 translate-x-1' : 'hover:bg-white/[.04] hover:translate-x-0.5'}`}
            onClick={() => select(s.id)}>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 transition-colors ${DOT[v.level]}`} />
            <span className={`flex-1 truncate ${s.id === selectedId ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>{nm(s)}</span>
            <span className="w-1 h-4 rounded" style={{ background: CATEGORIES[s.category].color }} />
            <input type="checkbox" checked={compareIds.includes(s.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleCompare(s.id)} />
          </li>
        ))}
      </ul>

      <div className="border-t border-[var(--color-line)] pt-3 flex flex-col gap-2">
        <div className="label">{t('custom')}</div>
        <div className="flex gap-2">
          <input className="field w-full num text-sm" value={lat} onChange={(e) => setLat(e.target.value)} placeholder={t('lat')} />
          <input className="field w-full num text-sm" value={lon} onChange={(e) => setLon(e.target.value)} placeholder={t('lon')} />
        </div>
        <button className="btn" onClick={() => { const a = +lat, o = +lon; if (Math.abs(a) <= 90 && Math.abs(o) <= 180) addCustomSite(a, o) }}>◎ {t('evaluate')}</button>
      </div>

      <div className="border-t border-[var(--color-line)] pt-3 flex flex-col gap-2">
        <div className="label">{t('priorities')}</div>
        {['power', 'comm', 'duration', 'safety'].map((k) => (
          <label key={k} className="flex items-center gap-2 text-xs">
            <span className="w-28 text-slate-300">{t(`w.${k}`)}</span>
            <input type="range" min="0" max="5" value={weights[k]} onChange={(e) => setWeight(k, +e.target.value)} className="flex-1" />
            <span className="num w-3 text-cobalt-lt">{weights[k]}</span>
          </label>
        ))}
        <div className="label mt-2">{t('top3')}</div>
        {top3.map(({ s, sc }, i) => (
          <button key={s.id} className="flex items-center gap-2 text-sm text-left rounded-[var(--radius-tag)] px-2 py-1.5 border border-[var(--color-line)] hover:border-[var(--color-line-hi)] transition-all"
            style={{ animation: `rise .35s ${i * 0.08}s both` }} onClick={() => select(s.id)}>
            <span className="num text-[11px] text-fog w-5">0{i + 1}</span>
            <span className="flex-1 truncate">{nm(s)}</span>
            <span className="num text-ice"><AnimNum value={sc} /></span>
          </button>
        ))}
        {kids && <div className="kids">{t('kids.priorities')}</div>}
      </div>
    </aside>
  )
}
