import { useEffect, useState } from 'react'
import { useStore } from '../store.js'
import { useT, useFmt } from '../lib/i18n.js'
import { Brand, LangSwitch } from './Hero.jsx'

export default function TopBar() {
  const t = useT(), f = useFmt()
  const { time, kids, mockData, setTime, setKids } = useStore()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])

  return (
    <header className="panel flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
      <div className="flex flex-col gap-1">
        <Brand small />
        <div className="label !text-[9px]">{t('subtitle')}</div>
      </div>

      {mockData && <span className="num text-[10px] tracking-[.16em] px-2 py-0.5 rounded-[var(--radius-tag)] border border-warn/60 text-warn">{t('demo')}</span>}

      <div className="hidden lg:flex items-center gap-2 num text-[11px] text-fog">
        <span className="w-1.5 h-1.5 rounded-full bg-go blink" />
        <span>MCC · {new Date(now).toISOString().slice(11, 19)} UTC</span>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-3">
        <span className="label">{t('landingDate')}</span>
        <input type="datetime-local" className="field text-[13px]" value={new Date(time).toISOString().slice(0, 16)}
          onChange={(e) => e.target.value && setTime(Date.parse(e.target.value + ':00Z'))} />
        <span className="num text-cobalt-lt text-[13px] hidden md:inline">{f.dt(time)}</span>
        <button className={`btn ${kids ? 'btn-on' : ''}`} onClick={() => setKids(!kids)}>{t('explain')}</button>
        <LangSwitch />
      </div>
    </header>
  )
}
