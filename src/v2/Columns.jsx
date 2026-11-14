// "Four things decide a landing" — bento grid of animated pixel cards with one big fact each.
import { useT } from '../lib/i18n.js'
import { Reveal } from '../lib/ui.jsx'
import PixelIcon from './PixelIcon.jsx'

const follow = (e) => {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

export default function Columns() {
  const t = useT()
  const items = t('bento.items') // [word, label, stat, statNote, text]
  const look = [
    { icon: 'sun', glow: 'rgb(255 122 26 / .35)', stat: 'grad-sun glow-sun', span: 'lg:col-span-2 lg:row-span-2', big: true },
    { icon: 'earth', glow: 'rgb(71 200 255 / .32)', stat: 'grad-earth glow-earth', span: 'lg:col-span-2' },
    { icon: 'terrain', glow: 'rgb(139 92 255 / .32)', stat: 'text-ice', span: 'lg:col-span-1' },
    { icon: 'time', glow: 'rgb(255 210 63 / .28)', stat: 'text-ice', span: 'lg:col-span-1' },
  ]
  return (
    <section id="columns" className="py-[var(--section-gap)]">
      <div className="wrap">
        <Reveal className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <h2 className="h-section max-w-[900px]">{t('bento.title').split('*').map((p, i) => i % 2 ? <span key={i} className="accent">{p}</span> : p)}</h2>
          <span className="chip">{t('cols.kicker')}</span>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-[minmax(230px,auto)]">
          {items.map(([word, label, stat, note, text], i) => {
            const L = look[i]
            return (
              <Reveal key={i} delay={i * 0.08} className={`card p-7 flex flex-col ${L.span}`} style={{ '--glow': L.glow }} onMouseMove={follow}>
                <div className="flex items-start justify-between gap-4">
                  <span className="chip">0{i + 1} · {label}</span>
                  <PixelIcon name={L.icon} size={L.big ? 120 : 64} speed={L.icon === 'earth' ? 220 : 450} />
                </div>
                <div className="mt-auto pt-8">
                  <div className={`font-display font-semibold leading-none ${L.big ? 'text-[clamp(72px,9vw,140px)]' : 'text-[56px]'} ${L.stat}`}>{stat}</div>
                  <div className="mono-sm text-fog mt-2">{note}</div>
                  <h3 className={`font-display font-semibold uppercase mt-6 ${L.big ? 'text-[40px]' : 'text-[26px]'}`}>{word}</h3>
                  <p className={`text-ice/70 leading-[1.6] mt-2 ${L.big ? 'text-[17px] max-w-[460px]' : 'text-[14px]'}`}>{text}</p>
                </div>
              </Reveal>
            )
          })}
        </div>
        <Reveal delay={0.2} className="card mt-4 p-8 md:p-12 grid md:grid-cols-[auto_1fr] gap-8 items-center" style={{ '--glow': 'rgb(124 255 107 / .2)' }} onMouseMove={follow}>
          <div className="font-display font-semibold text-[clamp(56px,7vw,96px)] leading-none text-go" style={{ textShadow: '0 0 30px rgb(124 255 107 / .35)' }}>10 {t('bento.sec')}</div>
          <p className="text-[clamp(17px,1.6vw,22px)] leading-[1.55] text-ice/80">{t('cols.statement')}</p>
        </Reveal>
      </div>
    </section>
  )
}
