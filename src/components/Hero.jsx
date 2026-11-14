// First screen: editorial headline over a particle Moon. All copy via i18n.
import { useStore } from '../store.js'
import { useT } from '../lib/i18n.js'
import ParticleMoon from './ParticleMoon.jsx'
import { Mark } from './Mark.jsx'

const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

export function LangSwitch() {
  const { lang, setLang } = useStore()
  return (
    <div className="flex rounded-[var(--radius-btn)] overflow-hidden border border-[var(--color-line)]">
      {['ru', 'en'].map((l) => (
        <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
          className={`px-2.5 py-1 text-[11px] num tracking-[.1em] transition-colors ${lang === l ? 'bg-cobalt/20 text-white' : 'text-fog hover:text-ice'}`}>{l.toUpperCase()}</button>
      ))}
    </div>
  )
}

export function Brand({ small }) {
  return (
    <a href="#top" className="flex items-center gap-2.5 group" onClick={(e) => { e.preventDefault(); go('top') }}>
      <Mark className={small ? 'w-5 h-5' : 'w-6 h-6'} />
      <span className={`display tracking-[.08em] ${small ? 'text-[13px]' : 'text-[15px]'}`}>LUNARWINDOW</span>
      <span className="hidden sm:inline num text-[10px] tracking-[.16em] text-fog whitespace-nowrap">× MAINTECH</span>
    </a>
  )
}

export default function Hero() {
  const t = useT()
  const words = t('hero.title').split(' ')
  const nav = [['navigator', 'nav.nav'], ['how', 'nav.how'], ['data', 'nav.data'], ['team', 'nav.team']]

  return (
    <section id="top" className="relative min-h-[100svh] flex flex-col overflow-hidden">
      {/* nav */}
      <nav className="relative z-10 w-full max-w-[var(--page-max-width)] mx-auto px-4 md:px-8 py-5 flex items-center gap-4 md:gap-8">
        <Brand />
        <ul className="hidden md:flex items-center gap-8 ml-6">
          {nav.map(([id, k], i) => (
            <li key={id}>
              <button onClick={() => go(id)} className="label !text-[11px] !text-ice hover:!text-signal transition-colors flex items-center gap-2">
                {i === 0 && <span className="w-1 h-1 rounded-full bg-signal" />}{t(k)}
              </button>
            </li>
          ))}
        </ul>
        <div className="ml-auto shrink-0"><LangSwitch /></div>
      </nav>

      {/* body */}
      <div className="relative flex-1 w-full max-w-[var(--page-max-width)] mx-auto px-4 md:px-8 grid lg:grid-cols-[1.15fr_1fr] items-center gap-8">
        <div className="absolute inset-0 lg:hidden opacity-40 pointer-events-none"><ParticleMoon /></div>

        <div className="relative z-10 flex flex-col gap-8 py-10">
          <div className="label flex items-center gap-2 rise" style={{ animationDelay: '.1s' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-signal" />{t('hero.kicker')}
          </div>
          <h1 className="display text-[clamp(38px,5.2vw,80px)] leading-[1] tracking-[-0.03em] text-ice">
            {words.map((w, i) => {
              const accent = w.startsWith('*')
              return (
                <span key={i} className={`word ${accent ? 'text-cobalt' : ''}`} style={{ animationDelay: `${0.25 + i * 0.09}s` }}>
                  {w.replaceAll('*', '')}{i < words.length - 1 ? ' ' : ''}
                </span>
              )
            })}
          </h1>
          <p className="text-[18px] leading-[1.6] text-[#9fb0c4] max-w-[560px] rise" style={{ animationDelay: '.9s' }}>{t('hero.sub')}</p>

          <ul className="grid sm:grid-cols-3 gap-3 rise" style={{ animationDelay: '1.05s' }}>
            {t('hero.facts').map((f, i) => (
              <li key={i} className="num text-[12px] leading-[1.5] tracking-[.02em] text-ice border border-[var(--color-line)] rounded-[var(--radius-tag)] px-3 py-3 relative">
                <span className="absolute top-1 right-1 w-1 h-1 rounded-full bg-cobalt" />{f}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-6 rise" style={{ animationDelay: '1.2s' }}>
            <button className="btn-cta" onClick={() => go('navigator')}>{t('hero.cta')} <span aria-hidden>↗</span></button>
            <span className="label">{t('hero.note')}</span>
          </div>
        </div>

        <div className="relative hidden lg:block h-[min(78vh,720px)]"><ParticleMoon /></div>
      </div>

      {/* scroll indicator */}
      <button onClick={() => go('navigator')} aria-label={t('hero.cta')}
        className="relative z-10 mx-auto mb-8 w-6 h-6 grid place-items-center border border-[var(--color-line-hi)] rounded-[4px] text-ice text-[10px] hover:border-ice transition-colors">
        <span style={{ animation: 'bob 1.6s ease-in-out infinite' }}>↓</span>
      </button>
    </section>
  )
}
