// Editorial sections below the navigator: How it works · NASA data · Team.
import { useStore } from '../store.js'
import { useT } from '../lib/i18n.js'
import { Reveal } from '../lib/ui.jsx'
import { Mark } from './Mark.jsx'

function Head({ n, title }) {
  return (
    <div className="flex items-center gap-4 mb-8">
      <Mark className="w-8 h-8" />
      <span className="label">{n}</span>
      <h2 className="display text-[clamp(28px,3.4vw,48px)] leading-[1.06] tracking-[-0.01em]">{title}</h2>
    </div>
  )
}

export default function About() {
  const t = useT()
  const mock = useStore((s) => s.mockData)
  const card = 'panel p-6 flex flex-col gap-3'

  return (
    <div className="flex flex-col gap-[var(--section-gap)] py-[var(--section-gap)]">
      <section id="how" className="scroll-mt-6">
        <Reveal><Head n="01" title={t('how.title')} /></Reveal>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {t('how.steps').map(([h, p], i) => (
            <Reveal key={i} delay={i * 0.08} className={card}>
              <span className="num text-[12px] text-cobalt-lt">0{i + 1}</span>
              <h3 className="display text-[20px] leading-[1.24]">{h}</h3>
              <p className="text-fog leading-[1.6]">{p}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="data" className="scroll-mt-6">
        <Reveal><Head n="02" title={t('data.title')} /></Reveal>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {t('data.items').map(([h, p], i) => (
            <Reveal key={i} delay={i * 0.08} className={card}>
              <span className="label !text-ice">{h}</span>
              <p className="text-fog leading-[1.6]">{p}</p>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.2} className="mt-4">
          <p className={`num text-[12px] inline-flex items-center gap-2 border rounded-[var(--radius-tag)] px-3 py-2 ${mock ? 'border-warn/50 text-warn' : 'border-go/50 text-go'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${mock ? 'bg-warn' : 'bg-go'}`} />{mock ? t('data.demo') : t('data.real')}
          </p>
        </Reveal>
      </section>

      <section id="team" className="scroll-mt-6">
        <Reveal><Head n="03" title={t('team.title')} /></Reveal>
        <div className="grid sm:grid-cols-3 gap-4">
          {t('team.roles').map(([who, role], i) => (
            <Reveal key={i} delay={i * 0.08} className={card}>
              <span className="label">{who}</span>
              <p className="display text-[18px] leading-[1.3]">{role}</p>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.2}><p className="label mt-6">{t('team.place')}</p></Reveal>
      </section>
    </div>
  )
}
