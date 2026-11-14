// "Four things decide a landing" — centred field of miniature instruments (one mechanism + one caption each).
import { useT } from '../lib/i18n.js'
import { Reveal } from '../lib/ui.jsx'

const S = 'rgba(152,192,239,.55)', S2 = 'rgba(186,207,247,.12)'

function Gauge() { // Sun elevation: the needle never climbs above ~1.5° at the pole
  return (
    <svg viewBox="0 0 240 150" className="w-full h-full">
      <path d="M30 120 A90 90 0 0 1 210 120" fill="none" stroke={S2} strokeWidth="1" />
      {Array.from({ length: 11 }, (_, i) => { const a = Math.PI - (i / 10) * Math.PI * 0.5; return <line key={i} x1={120 + Math.cos(a) * 84} y1={120 - Math.sin(a) * 84} x2={120 + Math.cos(a) * (i % 5 ? 78 : 72)} y2={120 - Math.sin(a) * (i % 5 ? 78 : 72)} stroke={S} /> })}
      <line x1="20" x2="220" y1="120" y2="120" stroke={S} strokeDasharray="2 4" />
      <g style={{ transformOrigin: '120px 120px', animation: 'needle 6s ease-in-out infinite' }}>
        <line x1="120" y1="120" x2="30" y2="114" stroke="#ffab5c" strokeWidth="1.5" />
        <circle cx="34" cy="114.3" r="3" fill="#ffab5c" />
      </g>
      <circle cx="120" cy="120" r="4" fill="#0a0c17" stroke={S} />
    </svg>
  )
}
function Radar() { // Earth link: a slow sweep that finds Earth low on the horizon
  return (
    <svg viewBox="0 0 240 150" className="w-full h-full">
      {[20, 40, 60].map((r) => <circle key={r} cx="120" cy="75" r={r} fill="none" stroke={S2} />)}
      <line x1="60" x2="180" y1="75" y2="75" stroke={S2} /><line x1="120" x2="120" y1="15" y2="135" stroke={S2} />
      <g style={{ transformOrigin: '120px 75px', animation: 'radar 12s linear infinite' }}>
        <path d="M120 75 L180 75 A60 60 0 0 0 162 32 Z" fill="url(#sweep)" />
      </g>
      <defs><radialGradient id="sweep" cx="0" cy="1" r="1"><stop offset="0" stopColor="rgba(143,211,255,.35)" /><stop offset="1" stopColor="rgba(143,211,255,0)" /></radialGradient></defs>
      <circle cx="166" cy="96" r="4" fill="#8fd3ff" style={{ animation: 'blink 3s ease-in-out infinite' }} />
    </svg>
  )
}
function Ridge() { // terrain: a low Sun throws long shadows across the horizon profile
  const pts = '10,110 40,98 62,104 88,70 112,86 136,62 160,92 186,80 212,100 230,96'
  return (
    <svg viewBox="0 0 240 150" className="w-full h-full">
      <polygon points={`10,140 ${pts} 230,140`} fill="rgba(186,207,247,.04)" />
      <polyline points={pts} fill="none" stroke={S} />
      <path d="M136 62 L230 74 L230 96 L160 92 Z" fill="rgba(0,0,0,.45)" />
      <line x1="10" x2="230" y1="56" y2="70" stroke="#ffab5c" strokeOpacity=".5" strokeDasharray="3 5" style={{ animation: 'dash 2.4s linear infinite' }} />
      <rect x="4" y="52" width="7" height="7" fill="#ffab5c" />
    </svg>
  )
}
function Orbit() { // time: one lunar day = 29.5 Earth days
  return (
    <svg viewBox="0 0 240 150" className="w-full h-full">
      <ellipse cx="120" cy="75" rx="90" ry="40" fill="none" stroke={S2} />
      {Array.from({ length: 30 }, (_, i) => { const a = (i / 30) * Math.PI * 2; return <circle key={i} cx={120 + Math.cos(a) * 90} cy={75 + Math.sin(a) * 40} r={i % 7 ? 0.8 : 1.6} fill={S} /> })}
      <circle cx="120" cy="75" r="10" fill="#0a0c17" stroke={S} />
      <g style={{ transformOrigin: '120px 75px', animation: 'radar 18s linear infinite' }}>
        <circle cx="210" cy="75" r="4" fill="#d1e4fa" />
      </g>
    </svg>
  )
}

export default function Columns() {
  const t = useT()
  const items = t('bento.items') // [word, label, stat, statNote, text]
  const inst = [Gauge, Radar, Ridge, Orbit]
  return (
    <section id="columns" className="py-[var(--section-gap)]">
      <div className="wrap">
        <Reveal className="text-center mb-14"><div data-sfx="head" className="flex flex-col items-center gap-4">
          <div className="eyebrow">{t('cols.kicker')}</div>
          <h2 className="h-section max-w-[720px]">{t('bento.title').replace(/\*/g, '')}</h2>
          <p className="lux-body max-w-[460px]">{t('bento.sub')}</p>
        </div></Reveal>
        <div className="mx-auto max-w-[1076px] grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {items.map(([word, , stat, note], i) => {
            const Inst = inst[i]
            return (
              <div key={i} data-sfx="rise" style={{ '--speed': `${180 + i * 70}px` }}><Reveal delay={i * 0.06} className="glass reg-dots h-[300px] flex flex-col overflow-hidden">
                <div className="flex-1 p-4 [mask-image:radial-gradient(80%_80%_at_50%_45%,black,transparent)]"><Inst /></div>
                <div className="px-5 pb-6 text-center">
                  <div className={`font-display text-[30px] font-medium leading-none ${i === 0 ? 'grad-sun' : i === 1 ? 'grad-earth' : 'lux-h'}`}>{stat}</div>
                  <div className="text-[15px] text-[var(--lux-hi)] mt-3">{word}</div>
                  <div className="text-[13px] lux-muted mt-1">{note}</div>
                </div>
              </Reveal></div>
            )
          })}
        </div>
        <Reveal delay={0.15}>
          <p className="text-center lux-promise !text-[clamp(17px,1.6vw,20px)] max-w-[720px] mx-auto mt-16 lux-muted">{t('cols.statement')}</p>
        </Reveal>
      </div>
    </section>
  )
}
