// Editorial scaffolding: four oversized words — the four things that decide a landing.
import { useT } from '../lib/i18n.js'
import { Reveal } from '../lib/ui.jsx'

export default function Columns() {
  const t = useT()
  const cols = t('cols.items')
  return (
    <section id="columns" className="bg-black py-[var(--section-gap)]">
      <div className="wrap">
        <Reveal><div className="mono text-fog mb-12">{t('cols.kicker')}</div></Reveal>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 border-t border-ice/20">
          {cols.map(([word, label, text], i) => (
            <Reveal key={i} delay={i * 0.08} className={`pt-8 pb-10 pr-8 ${i > 0 ? 'xl:border-l xl:pl-8' : ''} border-ice/20`}>
              <div className="mono-sm text-fog mb-6">0{i + 1} · {label}</div>
              <div className={`h-section mb-6 ${i === 0 ? 'text-signal' : i === 1 ? 'accent' : ''}`}>{word}</div>
              <p className="text-[15px] leading-[1.6] text-fog max-w-[300px]">{text}</p>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.2}>
          <p className="statement max-w-[640px] mx-auto text-center mt-[var(--section-gap)]">{t('cols.statement')}</p>
        </Reveal>
      </div>
    </section>
  )
}
