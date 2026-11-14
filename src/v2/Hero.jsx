// First screen — editorial: one statement headline, accent on a single word,
// the dot-terrain as the only texture, live Sun readout in a wireframe frame.
import { useRef } from 'react'
import { useStore } from '../store.js'
import { useT } from '../lib/i18n.js'
import ParticleTerrain from './ParticleTerrain.jsx'

export const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

export function FlagMark({ className = 'w-7 h-5' }) {
  return (
    <svg viewBox="0 0 34 24" className={className} fill="none" aria-hidden="true">
      <path d="M2 23.5 L6 1.5" stroke="#d8eaff" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6 1.5 C11 -0.5 15 4 21 2.6 C25 1.7 29 0.6 33 0 L30.5 14.5 C27 15.8 24 16.8 20 17.3 C14.5 18 11 14 4.2 15.5 Z" fill="#d8eaff" />
      <path d="M18.4 5 L19.4 8.3 L22.7 9.3 L19.4 10.3 L18.4 13.6 L17.4 10.3 L14.1 9.3 L17.4 8.3 Z" fill="#000" />
    </svg>
  )
}

export function Nav({ active = 'top' }) {
  const t = useT()
  const { lang, setLang } = useStore()
  const items = [['navigator', 'nav.nav'], ['how', 'nav.how'], ['data', 'nav.data'], ['team', 'nav.team']]
  return (
    <nav className="wrap flex items-center gap-8 h-[72px]">
      <button onClick={() => go('top')} className="flex items-center gap-3 shrink-0">
        <FlagMark />
        <span className="font-display text-[15px] tracking-[.02em]">LunarWindow</span>
      </button>
      <ul className="hidden lg:flex items-center gap-8 ml-8">
        {items.map(([id, k]) => <li key={id}><button className={`navlink ${active === id ? 'on' : ''}`} onClick={() => go(id)}>{t(k)}</button></li>)}
      </ul>
      <div className="ml-auto flex items-center gap-6">
        <div className="mono flex gap-3">
          {['ru', 'en'].map((l) => <button key={l} onClick={() => setLang(l)} className={lang === l ? 'text-ice' : 'text-fog hover:text-ice'}>{l}</button>)}
        </div>
        <button className="cta hidden sm:inline-flex !py-2.5" onClick={() => go('navigator')}>{t('hero.cta')} <span aria-hidden>↗</span></button>
      </div>
    </nav>
  )
}

export default function Hero() {
  const t = useT()
  const el = useRef(null), az = useRef(null)
  const onSun = (s) => {
    if (el.current) el.current.textContent = `+${s.el.toFixed(2)}°`
    if (az.current) az.current.textContent = `${s.az.toFixed(1)}°`
  }
  const words = t('hero.title').split(' ')

  return (
    <section id="top" className="relative min-h-[100svh] flex flex-col bg-carbon overflow-hidden">
      <div className="absolute inset-x-0 bottom-0 h-[68%]"><ParticleTerrain onSun={onSun} /></div>
      <div className="relative z-10"><Nav /></div>

      <div className="relative z-10 wrap flex-1 flex flex-col justify-start pt-[clamp(32px,7vh,96px)]">
        <div className="mono text-fog mb-8 rise">{t('hero.kicker')}</div>
        <h1 className="h-display max-w-[980px]">
          {words.map((w, i) => (
            <span key={i}>
              <span className={`word ${w.startsWith('*') ? 'accent' : ''}`} style={{ animationDelay: `${0.1 + i * 0.07}s` }}>{w.replaceAll('*', '')}</span>
              {i < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </h1>
      </div>

      {/* bottom band: facts + live readout + scroll cue */}
      <div className="relative z-10 wrap pb-10 grid gap-6 lg:grid-cols-[1fr_auto] items-end">
        <ul className="grid sm:grid-cols-3 gap-x-10 gap-y-4 max-w-[900px]">
          {t('hero.facts').map((f, i) => (
            <li key={i} className="rise" style={{ animationDelay: `${0.7 + i * 0.1}s` }}>
              <div className="mono-sm text-cobalt-lt mb-2">0{i + 1}</div>
              <p className="text-[14px] leading-[1.5] text-ice/90">{f.replace(/^\S+\s/, '')}</p>
            </li>
          ))}
        </ul>
        <div className="frame px-5 py-4 bg-black/60 rise" style={{ animationDelay: '1s' }}>
          <div className="mono-sm text-fog mb-2">{t('hero.readout')}</div>
          <div className="flex gap-8 num">
            <div><div className="mono-sm text-fog">EL</div><div ref={el} className="text-[22px] text-signal">+0.00°</div></div>
            <div><div className="mono-sm text-fog">AZ</div><div ref={az} className="text-[22px] text-ice">0.0°</div></div>
          </div>
        </div>
      </div>
      <button onClick={() => go('columns')} aria-label="scroll"
        className="relative z-10 mx-auto mb-6 w-6 h-6 grid place-items-center border border-ice/50 rounded-[4px] text-[10px] hover:border-ice">
        <span style={{ animation: 'bob 1.6s ease-in-out infinite' }}>↓</span>
      </button>
    </section>
  )
}
