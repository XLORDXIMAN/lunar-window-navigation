// First screen — pixel-arcade space: a big question, a live answer typed from real data,
// pixel stat cards and the south-pole dot terrain with a low Sun.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store.js'
import { useT, useFmt } from '../lib/i18n.js'
import { bestWindow, windowMetrics, verdict, DAY } from '../lib/ephem.js'
import { siteName } from '../lib/ui.jsx'
import ParticleTerrain from './ParticleTerrain.jsx'
import PixelIcon from './PixelIcon.jsx'

export const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

export function FlagMark({ className = 'w-7 h-5' }) {
  return (
    <svg viewBox="0 0 34 24" className={className} fill="none" aria-hidden="true">
      <path d="M2 23.5 L6 1.5" stroke="#eaf2ff" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6 1.5 C11 -0.5 15 4 21 2.6 C25 1.7 29 0.6 33 0 L30.5 14.5 C27 15.8 24 16.8 20 17.3 C14.5 18 11 14 4.2 15.5 Z" fill="#eaf2ff" />
      <path d="M18.4 5 L19.4 8.3 L22.7 9.3 L19.4 10.3 L18.4 13.6 L17.4 10.3 L14.1 9.3 L17.4 8.3 Z" fill="#05060d" />
    </svg>
  )
}

export function Nav({ active = 'top' }) {
  const t = useT()
  const { lang, setLang } = useStore()
  const items = [['navigator', 'nav.nav'], ['how', 'nav.how'], ['data', 'nav.data'], ['team', 'nav.team']]
  return (
    <nav className="wrap flex items-center gap-8 h-[76px]">
      <button onClick={() => go('top')} className="flex items-center gap-3 shrink-0">
        <FlagMark />
        <span className="font-display text-[20px] font-semibold tracking-[.02em]">Lunar<span className="accent">Window</span></span>
      </button>
      <ul className="hidden lg:flex items-center gap-8 ml-6">
        {items.map(([id, k]) => <li key={id}><button className={`navlink ${active === id ? 'on' : ''}`} onClick={() => go(id)}>{t(k)}</button></li>)}
      </ul>
      <div className="ml-auto flex items-center gap-5">
        <div className="chip !py-1 !px-1 gap-0">
          {['ru', 'en'].map((l) => <button key={l} onClick={() => setLang(l)} className={`px-2.5 py-1 rounded-full transition-colors ${lang === l ? 'bg-ice text-void' : 'text-fog hover:text-ice'}`}>{l}</button>)}
        </div>
        <button className="cta hidden sm:inline-flex !py-2.5" onClick={() => go('navigator')}>{t('hero.cta')} <span aria-hidden>↗</span></button>
      </div>
    </nav>
  )
}

// live answer: cycles through a few sites, typed like a terminal
function Answer() {
  const t = useT(), f = useFmt()
  const { sites, time, lang } = useStore()
  const dayKey = Math.floor(time / DAY)
  const lines = useMemo(() => {
    const ids = ['artemis-malapert-massif', 'artemis-de-gerlache-rim-2', 'cnsa-change-4', 'apollo-11']
    return ids.map((id) => sites.find((s) => s.id === id)).filter(Boolean).map((s) => {
      const b = bestWindow(s, dayKey * DAY, 60, 7)
      const v = verdict(windowMetrics(s, b.start, 14, 1), s)
      return { name: siteName(s, lang).split(' — ')[0], when: `${f.day(b.start)} → ${f.day(b.end)}`, level: v.level, far: s.far_side }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, lang, dayKey])
  const [i, setI] = useState(0), [k, setK] = useState(0)
  const cur = lines[i % Math.max(1, lines.length)]
  const text = cur ? `${cur.name} → ${cur.far ? t('hero3.noEarth') : cur.when}` : ''
  useEffect(() => {
    if (!cur) return
    if (k < text.length) { const id = setTimeout(() => setK(k + 1), 28); return () => clearTimeout(id) }
    const id = setTimeout(() => { setI(i + 1); setK(0) }, 2600); return () => clearTimeout(id)
  }, [k, text, i, cur])
  if (!cur) return null
  const col = { green: 'text-go border-go/50', yellow: 'text-warn border-warn/50', red: 'text-nogo border-nogo/50' }[cur.level]
  return (
    <div className="card p-5 max-w-[620px]" style={{ '--glow': 'rgb(124 255 107 / .18)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="mono-sm text-fog">{t('hero3.answer')}</span>
        <span className="flex gap-1.5"><i className="w-2 h-2 rounded-full bg-nogo/80" /><i className="w-2 h-2 rounded-full bg-warn/80" /><i className="w-2 h-2 rounded-full bg-go/80" /></span>
      </div>
      <div className="font-mono text-[15px] sm:text-[17px] text-ice min-h-[2.6em]">
        <span className="text-go">&gt; </span>{text.slice(0, k)}<span className="caret text-go" />
      </div>
      <div className={`chip mt-3 ${col} ${k >= text.length ? 'opacity-100' : 'opacity-0'} transition-opacity`}>● {t(`v.${cur.level}`)}</div>
    </div>
  )
}

export default function Hero() {
  const t = useT()
  const el = useRef(null), az = useRef(null)
  const onSun = (s) => {
    if (el.current) el.current.textContent = `${s.el >= 0 ? '+' : ''}${s.el.toFixed(2)}°`
    if (az.current) az.current.textContent = `${s.az.toFixed(1)}°`
  }
  const stats = [['sun', '1.5°', 'hero3.s1', 'grad-sun'], ['earth', '0%', 'hero3.s2', 'grad-earth'], ['time', '12', 'hero3.s3', 'text-ice']]

  return (
    <section id="top" className="relative min-h-[100svh] flex flex-col overflow-hidden">
      <div className="absolute inset-x-0 bottom-0 h-[58%] opacity-90"><ParticleTerrain onSun={onSun} /></div>
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-void to-transparent pointer-events-none" />
      <div className="relative z-10"><Nav /></div>

      <div className="relative z-10 wrap flex-1 grid lg:grid-cols-[1.25fr_1fr] gap-10 items-start pt-[clamp(24px,5vh,72px)]">
        <div className="flex flex-col gap-8">
          <span className="chip self-start rise"><PixelIcon name="moon" size={16} /> {t('hero.kicker')}</span>
          <h1 className="h-display">
            {t('hero3.title').split('|').map((line, i) => (
              <span key={i} className="block word" style={{ animationDelay: `${0.1 + i * 0.12}s` }}>
                {line.split('*').map((part, j) => j % 2 ? <span key={j} className="grad-sun glow-sun">{part}</span> : part)}
              </span>
            ))}
          </h1>
          <p className="text-[18px] leading-[1.55] text-ice/75 max-w-[540px] rise" style={{ animationDelay: '.45s' }}>{t('hero3.sub')}</p>
          <div className="rise" style={{ animationDelay: '.6s' }}><Answer /></div>
        </div>

        <div className="hidden lg:flex flex-col gap-4 pt-6">
          {stats.map(([icon, val, k, cls], i) => (
            <div key={icon} className="card p-5 flex items-center gap-5 rise" style={{ animationDelay: `${0.5 + i * 0.12}s`, '--glow': icon === 'sun' ? 'rgb(255 122 26 / .3)' : icon === 'earth' ? 'rgb(71 200 255 / .3)' : 'rgb(139 92 255 / .3)' }}>
              <PixelIcon name={icon} size={64} />
              <div>
                <div className={`font-display text-[44px] leading-none font-semibold ${cls}`}>{val}{icon === 'time' && <span className="text-[20px] text-fog ml-1">{t('hero3.days')}</span>}</div>
                <div className="text-[14px] text-ice/70 mt-1.5 max-w-[300px]">{t(k)}</div>
              </div>
            </div>
          ))}
          <div className="card p-5 rise" style={{ animationDelay: '.9s', '--glow': 'rgb(255 210 63 / .25)' }}>
            <div className="mono-sm text-fog mb-2">{t('hero.readout')}</div>
            <div className="flex gap-8 num">
              <div><div className="mono-sm text-fog">EL</div><div ref={el} className="font-display text-[28px] grad-sun">+0.00°</div></div>
              <div><div className="mono-sm text-fog">AZ</div><div ref={az} className="font-display text-[28px] text-ice">0.0°</div></div>
            </div>
          </div>
        </div>
      </div>

      <button onClick={() => go('columns')} aria-label="scroll" className="relative z-10 mx-auto mb-8 mt-6 chip hover:border-ice/40">
        <span style={{ animation: 'bob 1.6s ease-in-out infinite' }}>↓</span> {t('hero3.scroll')}
      </button>
    </section>
  )
}
