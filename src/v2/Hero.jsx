// First screen — "spotlit opening": construction lattice, the product name as a luminous monument,
// a two-line promise, and a fan of three live product panels under soft overhead spotlights.
import { useMemo } from 'react'
import { useStore } from '../store.js'
import { useT, useFmt } from '../lib/i18n.js'
import { stateAt, windowMetrics, verdict, DAY } from '../lib/ephem.js'
import { siteName } from '../lib/ui.jsx'

export const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

export function FlagMark({ className = 'w-7 h-5' }) {
  return (
    <svg viewBox="0 0 34 24" className={className} fill="none" aria-hidden="true">
      <path d="M2 23.5 L6 1.5" stroke="#d1e4fa" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6 1.5 C11 -0.5 15 4 21 2.6 C25 1.7 29 0.6 33 0 L30.5 14.5 C27 15.8 24 16.8 20 17.3 C14.5 18 11 14 4.2 15.5 Z" fill="#d1e4fa" />
      <path d="M18.4 5 L19.4 8.3 L22.7 9.3 L19.4 10.3 L18.4 13.6 L17.4 10.3 L14.1 9.3 L17.4 8.3 Z" fill="#05060f" />
    </svg>
  )
}

export function Nav() {
  const t = useT()
  const { lang, setLang } = useStore()
  return (
    <nav className="wrap grid grid-cols-[1fr_auto_1fr] items-center h-[96px]">
      <button onClick={() => go('top')} className="justify-self-start text-[14px] text-[var(--lux-muted)] hover:text-[var(--lux-ink)] transition-colors">MainTech</button>
      <button onClick={() => go('top')} aria-label="LunarWindow" className="justify-self-center"><FlagMark className="w-8 h-6" /></button>
      <div className="justify-self-end flex items-center gap-2">
        <div className="seg hidden sm:inline-flex">{['ru', 'en'].map((l) => <button key={l} onClick={() => setLang(l)} className={lang === l ? 'on' : ''}>{l.toUpperCase()}</button>)}</div>
        <button className="capsule" onClick={() => go('navigator')}>{t('hero.cta')}</button>
      </div>
    </nav>
  )
}

// faint construction lattice with registration dots, fading into the canvas
function Lattice() {
  const dots = [[372, 168], [1068, 168], [372, 412], [1068, 412]]
  return (
    <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMin slice" className="absolute inset-0 w-full h-full pointer-events-none [mask-image:radial-gradient(60%_60%_at_50%_35%,black,transparent)]" aria-hidden="true">
      <g stroke="rgba(186,207,247,.08)" strokeWidth="1">
        {[96, 168, 412, 520].map((y) => <line key={y} x1="0" x2="1440" y1={y} y2={y} />)}
        {[372, 1068, 720].map((x) => <line key={x} x1={x} x2={x} y1="0" y2="900" />)}
        <path d="M372 168 H1068 V412 H372 Z" fill="none" stroke="rgba(186,207,247,.14)" />
      </g>
      {dots.map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.5" fill="#c2ccff" opacity=".7" />)}
    </svg>
  )
}

function Spotlights() {
  const beams = [{ l: '18%', w: 300, d: '0s', dur: '6s' }, { l: '50%', w: 474, d: '1.2s', dur: '8.5s' }, { l: '82%', w: 260, d: '.6s', dur: '7s' }]
  return (
    <div className="absolute inset-x-0 -top-24 h-[760px] pointer-events-none [mask-image:linear-gradient(to_bottom,black_40%,transparent)]" aria-hidden="true">
      {beams.map((b, i) => (
        <div key={i} className="absolute top-0 -translate-x-1/2 h-full origin-top" style={{
          left: b.l, width: b.w, filter: 'blur(15px)', animation: `spot ${b.dur} ease-in-out ${b.d} infinite`,
          background: 'conic-gradient(from 180deg at 50% 0%, transparent 45%, rgba(124,145,182,.3) 49%, rgba(124,145,182,.5) 50%, rgba(124,145,182,.3) 51%, transparent 55%)',
        }} />
      ))}
    </div>
  )
}

const VTXT = { green: 'text-go', yellow: 'text-warn', red: 'text-nogo' }
const CELL = { both: '#7cff6b', sun: '#ffab5c', link: '#8fd3ff', none: 'rgba(186,207,247,.07)' }

function PanelShell({ title, children, className = '', style }) {
  return (
    <div className={`rounded-[16px] bg-[#0a0c17]/90 border border-[rgba(186,207,247,.12)] shadow-[inset_0_1px_1px_rgba(216,236,248,.18),0_40px_80px_-30px_rgba(0,0,0,.9)] overflow-hidden ${className}`} style={style}>
      <div className="flex items-center gap-2 px-4 h-9 border-b border-[rgba(186,207,247,.08)] bg-[rgba(186,207,247,.02)]">
        <i className="w-1.5 h-1.5 rounded-full bg-white/15" /><i className="w-1.5 h-1.5 rounded-full bg-white/15" /><i className="w-1.5 h-1.5 rounded-full bg-white/15" />
        <span className="ml-2 text-[12px] text-[var(--lux-muted)] truncate">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function ProductFan() {
  const t = useT(), f = useFmt()
  const { sites, time, lang } = useStore()
  const site = sites.find((s) => s.id === 'artemis-malapert-massif') ?? sites[0]
  const day = Math.floor(time / DAY)
  const data = useMemo(() => {
    if (!site) return null
    const m = windowMetrics(site, day * DAY, 14, 1)
    const heat = ['artemis-malapert-massif', 'artemis-mons-mouton', 'artemis-de-gerlache-rim-2', 'cnsa-change-4']
      .map((id) => sites.find((s) => s.id === id)).filter(Boolean)
      .map((s) => { const w = windowMetrics(s, day * DAY, 30, 12); return { s, cells: Array.from(w.sun, (v, i) => (v >= 0.5 && w.link[i] ? 'both' : v >= 0.5 ? 'sun' : w.link[i] ? 'link' : 'none')) } })
    return { m, v: verdict(m, site), heat }
  }, [site, sites, day])
  if (!site || !data) return null
  const st = stateAt(site, time)
  const W = 360, H = 120, x = (az) => (az / 360) * W, y = (el) => H - ((Math.max(-4, Math.min(8, el)) + 4) / 12) * H
  const ridge = site.horizon.map((h, az) => `${x(az).toFixed(1)},${y(h).toFixed(1)}`).join(' ')

  return (
    <div className="relative mx-auto w-full max-w-[1100px] h-[clamp(300px,34vw,400px)] [perspective:1400px]">
      {/* left — verdict */}
      <PanelShell title={t('fan.verdict')} className="hidden md:block absolute left-0 top-[12%] w-[34%]" style={{ transform: 'rotateY(10deg) translateZ(-60px)', transformOrigin: 'right center', opacity: .82 }}>
        <div className="text-[15px] text-[var(--lux-hi)] font-medium truncate">{siteName(site, lang)}</div>
        <div className={`text-[13px] mt-1 ${VTXT[data.v.level]}`}>● {t(`v.${data.v.level}`)}</div>
        <div className="grid grid-cols-3 gap-3 mt-5">
          {[[t('fan.sun'), `${data.m.sunPct.toFixed(0)}%`, 'grad-sun'], [t('fan.link'), `${data.m.linkPct.toFixed(0)}%`, 'grad-earth'], [t('fan.dark'), f.h(data.m.longestDarkH), 'text-[var(--lux-hi)]']].map(([l, v, c]) => (
            <div key={l}><div className="text-[11px] text-[var(--lux-muted)]">{l}</div><div className={`font-display text-[22px] font-medium mt-1 ${c}`}>{v}</div></div>
          ))}
        </div>
      </PanelShell>
      {/* right — 30-day windows */}
      <PanelShell title={t('fan.windows')} className="hidden md:block absolute right-0 top-[12%] w-[34%]" style={{ transform: 'rotateY(-10deg) translateZ(-60px)', transformOrigin: 'left center', opacity: .82 }}>
        {data.heat.map(({ s, cells }) => (
          <div key={s.id} className="flex items-center gap-3 py-1.5">
            <span className="w-[86px] text-[12px] text-[var(--lux-body)] truncate">{siteName(s, lang).split(' — ')[0]}</span>
            <div className="flex-1 grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}>
              {cells.map((k, i) => <i key={i} className="h-3 rounded-[2px]" style={{ background: CELL[k] }} />)}
            </div>
          </div>
        ))}
      </PanelShell>
      {/* centre — live horizon */}
      <PanelShell title={`${t('tabs.horizon')} · ${siteName(site, lang)}`} className="absolute left-1/2 -translate-x-1/2 top-0 w-[92%] md:w-[44%] z-10">
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="text-[11px] text-[var(--lux-muted)]">{t('sunEl')}</div>
            <div className="font-display text-[40px] leading-none font-medium grad-sun mt-1">{st.sun.el >= 0 ? '+' : ''}{st.sun.el.toFixed(2)}°</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-[var(--lux-muted)]">{t('earthEl')}</div>
            <div className="font-display text-[22px] leading-none font-medium grad-earth mt-1">{st.earth.el.toFixed(2)}°</div>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" aria-hidden="true">
          <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="rgba(186,207,247,.18)" strokeDasharray="2 4" />
          <polygon points={`0,${H} ${ridge} ${W},${H}`} fill="rgba(186,207,247,.05)" />
          <polyline points={ridge} fill="none" stroke="rgba(209,228,250,.75)" strokeWidth="1" />
          <rect x={x(st.sun.az) - 4} y={y(st.sun.el) - 4} width="8" height="8" fill="#ffab5c" />
          <circle cx={x(st.earth.az)} cy={y(st.earth.el)} r="4.5" fill="none" stroke="#8fd3ff" strokeWidth="1.2" />
        </svg>
        <div className="text-[12px] text-[var(--lux-muted)] mt-2">{f.dt(time)}</div>
      </PanelShell>
    </div>
  )
}

export default function Hero() {
  const t = useT()
  const caps = t('hero5.caps')
  return (
    <section id="top" data-sfx="hero" className="relative overflow-hidden">
      <Lattice />
      <div className="relative z-10"><Nav /></div>

      <div className="sfx-title relative z-10 wrap flex flex-col items-center text-center pt-[clamp(32px,8vh,96px)]">
        <div className="eyebrow lux-in" style={{ animationDelay: '.1s' }}>{t('hero5.eyebrow')}</div>
        <h1 className="h-display mt-8 lux-in" style={{ animationDelay: '.2s' }}>LunarWindow</h1>
        <p className="lux-promise mt-7 max-w-[640px] lux-in" style={{ animationDelay: '.45s' }}>
          {t('hero5.promise1')}<br /><span className="lux-muted">{t('hero5.promise2')}</span>
        </p>
      </div>

      <div className="relative mt-16">
        <Spotlights />
        <div className="relative z-10 wrap lux-in" style={{ animationDelay: '.7s' }}><div data-sfx="tilt"><ProductFan /></div></div>
      </div>

      <div className="relative z-10 wrap mt-6 pb-[var(--section-gap)]">
        <ul className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-[14px] text-[var(--lux-muted)]">
          {caps.map((c) => <li key={c} className="flex items-center gap-2"><i className="w-1 h-1 rounded-full bg-[var(--lux-glint)]" />{c}</li>)}
        </ul>
      </div>
    </section>
  )
}
