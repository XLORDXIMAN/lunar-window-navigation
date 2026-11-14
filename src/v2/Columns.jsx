// "Four things decide a landing" — four calm glass tiles: icon, one number, one line.
import { useT } from '../lib/i18n.js'
import { Reveal } from '../lib/ui.jsx'
import PixelIcon from './PixelIcon.jsx'

export default function Columns() {
  const t = useT()
  const items = t('bento.items') // [word, label, stat, statNote, text]
  const icons = ['sun', 'earth', 'terrain', 'time']
  const statCls = ['grad-sun', 'grad-earth', 'text-ice', 'text-ice']
  return (
    <section id="columns" className="py-[var(--section-gap)]">
      <div className="wrap">
        <Reveal className="text-center mb-14">
          <h2 className="h-section">{t('bento.title').split('*').map((p, i) => i % 2 ? <span key={i} className="accent">{p}</span> : p)}</h2>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map(([word, , stat, note, text], i) => (
            <Reveal key={i} delay={i * 0.06} className="glass p-7 flex flex-col">
              <PixelIcon name={icons[i]} size={44} speed={icons[i] === 'earth' ? 220 : 450} />
              <div className={`font-display font-bold text-[52px] leading-none mt-8 ${statCls[i]}`}>{stat}</div>
              <div className="text-[13px] text-fog mt-2">{note}</div>
              <h3 className="font-display font-semibold text-[22px] mt-6">{word}</h3>
              <p className="text-[15px] leading-[1.55] text-ice/65 mt-2">{text}</p>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.15}>
          <p className="text-center text-[clamp(18px,1.7vw,22px)] leading-[1.6] text-ice/70 max-w-[760px] mx-auto mt-16">{t('cols.statement')}</p>
        </Reveal>
      </div>
    </section>
  )
}
