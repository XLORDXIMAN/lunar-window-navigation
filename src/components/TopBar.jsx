import { useEffect, useState } from 'react'
import { useStore } from '../store.js'
import { useT, useFmt } from '../lib/i18n.js'

export default function TopBar() {
  const t = useT(), f = useFmt()
  const { time, kids, mockData, lang, setTime, setKids, setLang } = useStore()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])

  return (
    <header className="panel overflow-hidden flex flex-wrap items-center gap-4 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border border-cyan-400/40" style={{ animation: 'spin 6s linear infinite' }}>
            <div className="absolute -top-[3px] left-1/2 -ml-[3px] w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#22d3ee]" />
          </div>
          <div className="absolute inset-2 rounded-full bg-[radial-gradient(circle_at_35%_35%,#f1f5f9,#64748b_60%,#0f172a)] shadow-[0_0_18px_-2px_#22d3ee]" />
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-extrabold tracking-[.22em] text-sm bg-gradient-to-r from-white via-cyan-200 to-cyan-400 bg-clip-text text-transparent">{t('brand')}</span>
            <span className="text-[10px] font-bold tracking-[.2em] text-indigo-300">× MAINTECH</span>
          </div>
          <div className="label !text-[9px]">{t('subtitle')}</div>
        </div>
      </div>

      {mockData && <span className="text-[10px] px-2 py-0.5 rounded border border-yellow-600/70 text-yellow-400 num blink">{t('demo')}</span>}

      <div className="hidden lg:flex items-center gap-2 num text-[11px] text-slate-400">
        <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_#22c55e]" />
        <span>MCC · {new Date(now).toISOString().slice(11, 19)} UTC</span>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-3">
        <span className="label">{t('landingDate')}</span>
        <input type="datetime-local" className="field num text-sm" value={new Date(time).toISOString().slice(0, 16)}
          onChange={(e) => e.target.value && setTime(Date.parse(e.target.value + ':00Z'))} />
        <span className="num text-cyan-300 text-sm hidden md:inline drop-shadow-[0_0_6px_#22d3ee]">{f.dt(time)}</span>
        <button className={`btn ${kids ? 'btn-on' : ''}`} onClick={() => setKids(!kids)}>{t('explain')}</button>
        <div className="flex rounded-md overflow-hidden border border-[var(--color-line)]">
          {['ru', 'en'].map((l) => (
            <button key={l} onClick={() => setLang(l)} className={`px-2 py-1 text-[11px] font-bold num transition ${lang === l ? 'bg-cyan-400/15 text-cyan-300' : 'text-slate-500 hover:text-white'}`}>{l.toUpperCase()}</button>
          ))}
        </div>
      </div>
    </header>
  )
}
