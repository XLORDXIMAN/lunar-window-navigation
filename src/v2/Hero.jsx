// First screen — pixel-arcade space: a big question, a live answer typed from real data,
// pixel stat cards and the south-pole dot terrain with a low Sun.
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store.js'
import { useT, useFmt } from '../lib/i18n.js'
import { bestWindow, windowMetrics, verdict, DAY } from '../lib/ephem.js'
import { siteName } from '../lib/ui.jsx'
import ParticleTerrain from './ParticleTerrain.jsx'

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

export function Nav() {
  const t = useT()
  const { lang, setLang } = useStore()
  const items = [['navigator', 'nav.nav'], ['windows', 'nav.data'], ['scenario', 'nav.team'], ['how', 'nav.how']]
  return (
    <div className="wrap pt-4">
      <nav className="glass !rounded-full flex items-center gap-6 h-[60px] pl-5 pr-2">
        <button onClick={() => go('top')} className="flex items-center gap-2.5 shrink-0">
          <FlagMark className="w-6 h-[18px]" />
          <span className="font-display text-[17px] font-semibold">LunarWindow</span>
        </button>
        <ul className="hidden lg:flex items-center gap-7 mx-auto">
          {items.map(([id, k]) => <li key={id}><button className="text-[14px] text-ice/70 hover:text-ice transition-colors" onClick={() => go(id)}>{t(k)}</button></li>)}
        </ul>
        <div className="ml-auto lg:ml-0 flex items-center gap-2">
          <div className="seg">{['ru', 'en'].map((l) => <button key={l} onClick={() => setLang(l)} className={lang === l ? 'on' : ''}>{l.toUpperCase()}</button>)}</div>
          <button className="cta hidden sm:inline-flex !py-2.5 !px-5 !text-[14px]" onClick={() => go('navigator')}>{t('hero.cta')}</button>
        </div>
      </nav>
    </div>
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
    <div className="glass px-6 py-5 w-full max-w-[640px] text-left">
      <div className="text-[13px] text-fog mb-2">{t('hero3.answer')}</div>
      <div className="flex items-center gap-4">
        <div className="flex-1 font-mono text-[15px] sm:text-[16px] text-ice min-h-[1.6em]">{text.slice(0, k)}<span className="caret text-ice/70" /></div>
        <span className={`text-[13px] font-medium whitespace-nowrap transition-opacity ${col.split(' ')[0]} ${k >= text.length ? 'opacity-100' : 'opacity-0'}`}>● {t(`v.${cur.level}`).split(' — ')[0]}</span>
      </div>
    </div>
  )
}

export default function Hero() {
  const t = useT()
  return (
    <section id="top" className="relative min-h-[100svh] flex flex-col overflow-hidden">
      <div className="absolute inset-x-0 bottom-0 h-[55%] opacity-80 [mask-image:linear-gradient(to_bottom,transparent,black_25%,black_70%,transparent)]"><ParticleTerrain /></div>
      <div className="relative z-10"><Nav /></div>

      <div className="relative z-10 wrap flex-1 flex flex-col items-center text-center pt-[clamp(48px,12vh,140px)] gap-7">
        <span className="text-[14px] text-fog rise">{t('hero3.kicker')}</span>
        <h1 className="h-display">
          {t('hero3.title').split('|').map((line, i) => (
            <span key={i} className="block">
              <span className="word" style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
                {line.split('*').map((part, j) => j % 2 ? <span key={j} className="grad-sun">{part}</span> : part)}
              </span>
            </span>
          ))}
        </h1>
        <p className="text-[19px] leading-[1.5] text-ice/70 max-w-[620px] rise" style={{ animationDelay: '.35s' }}>{t('hero3.sub')}</p>
        <div className="flex flex-wrap justify-center gap-3 rise" style={{ animationDelay: '.45s' }}>
          <button className="cta" onClick={() => go('navigator')}>{t('hero.cta')}</button>
          <button className="btn-ghost" onClick={() => go('how')}>{t('nav.how')}</button>
        </div>
        <div className="w-full flex justify-center mt-6 rise" style={{ animationDelay: '.6s' }}><Answer /></div>
      </div>
    </section>
  )
}
