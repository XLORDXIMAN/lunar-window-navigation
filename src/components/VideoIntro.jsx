// Cinematic intro: Blender-rendered clip (public/intro/intro.mp4, 5 s) with the
// MainTech logo assembling on top in the last seconds. Falls back to the SVG intro
// if the video can't play (missing file, autoplay blocked, reduced motion).
import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n.js'
import { SvgIntro } from './Intro.jsx'

const LOGO_AT = 3.2   // s — logo starts assembling
const FADE_AT = 4.75  // s — whole intro fades out
const END_AT = 5.35   // s — hand over to the site

function FlagMark() {
  return (
    <svg viewBox="0 0 120 90" className="w-[clamp(64px,9vw,128px)] h-auto overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="lwSheen" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="#c9d4e4" />
          <stop offset="0.42" stopColor="#f4f8ff" />
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="0.58" stopColor="#f4f8ff" />
          <stop offset="1" stopColor="#b9c6d8" />
          <animateTransform attributeName="gradientTransform" type="translate" from="-1 0" to="1 0" dur="1.8s" repeatCount="indefinite" />
        </linearGradient>
      </defs>
      <path d="M8 88 L22 8" stroke="#e8eef8" strokeWidth="3" strokeLinecap="round" />
      <path className="lw-flag" d="M22 8 C40 0 54 16 74 10 C86 6 98 2 112 0 L102 52 C90 56 80 60 66 62 C46 65 34 50 14 56 Z" fill="url(#lwSheen)" />
      <path d="M62 18 L66 30 L78 34 L66 38 L62 50 L58 38 L46 34 L58 30 Z" fill="#0b0f18" />
    </svg>
  )
}

function LogoOverlay() {
  const t = useT()
  return (
    <div className="absolute inset-0 grid place-items-center pointer-events-none">
      {/* orbit + travelling star */}
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <g transform="rotate(-11 800 430)">
          <ellipse cx="800" cy="430" rx="620" ry="175" fill="none" stroke="#b9ccff" strokeOpacity=".6" strokeWidth="1.2"
            pathLength="1" strokeDasharray="1" className="lw-orbit" />
          <g className="lw-spark">
            <circle r="18" fill="#8aaaff" opacity=".35" />
            <path d="M0 -16 L2 -2 L16 0 L2 2 L0 16 L-2 2 L-16 0 L-2 -2 Z" fill="#fff" />
            <animateMotion dur="1.4s" fill="freeze" keyPoints="0.62;0.93" keyTimes="0;1" calcMode="spline" keySplines="0.2 0.8 0.2 1"
              path="M1420,430 A620,175 0 1,1 180,430 A620,175 0 1,1 1420,430" />
          </g>
        </g>
      </svg>
      <div className="relative flex items-center gap-[clamp(16px,3vw,48px)]">
        <div className="lw-in" style={{ animationDelay: '0s' }}><FlagMark /></div>
        <span className="lw-divider block w-px h-[clamp(56px,8vw,120px)] bg-ice/80" />
        <div className="display text-[clamp(44px,8.4vw,128px)] leading-none tracking-[-0.02em] font-light">
          {'MainTech'.split('').map((c, i) => (
            <span key={i} className="lw-letter inline-block" style={{ animationDelay: `${0.25 + i * 0.06}s`, color: i < 4 ? '#eef3fb' : '#5b8cff' }}>{c}</span>
          ))}
        </div>
      </div>
      <div className="absolute left-0 right-0 text-center num text-[clamp(10px,1vw,14px)] tracking-[.32em] text-slate-400 lw-in"
        style={{ top: 'calc(50% + clamp(60px,8vw,120px))', animationDelay: '0.75s' }}>{t('intro.tag')}</div>
    </div>
  )
}

export default function Intro({ onDone }) {
  const t = useT()
  const vid = useRef(null)
  const [mode, setMode] = useState(() =>
    typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'svg' : 'video')
  const [logo, setLogo] = useState(false)
  const [fading, setFading] = useState(false)
  const done = useRef(false)
  const finish = () => { if (!done.current) { done.current = true; onDone() } }

  useEffect(() => {
    if (mode !== 'video') return
    const v = vid.current
    // if playback hasn't started shortly, fall back to the SVG intro
    const startGuard = setTimeout(() => { if (!v || v.currentTime < 0.05) setMode('svg') }, 1500)
    const hardStop = setTimeout(finish, (END_AT + 2) * 1000) // never hang
    // sync on video time; interval + timeupdate keep working even when rAF is throttled
    const sync = () => {
      const tt = v?.currentTime ?? 0
      if (tt >= LOGO_AT) setLogo(true)
      if (tt >= FADE_AT) setFading(true)
    }
    const iv = setInterval(sync, 50)
    const onEnded = () => { setLogo(true); setFading(true); setTimeout(finish, 500) }
    v?.addEventListener('timeupdate', sync)
    v?.addEventListener('ended', onEnded)
    v?.play?.().catch(() => setMode('svg'))
    return () => { clearInterval(iv); clearTimeout(startGuard); clearTimeout(hardStop); v?.removeEventListener('timeupdate', sync); v?.removeEventListener('ended', onEnded) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  if (mode === 'svg') return <SvgIntro onDone={onDone} />

  const skip = () => { setFading(true); setTimeout(finish, 350) }
  return (
    <div onClick={skip} role="presentation"
      className="fixed inset-0 z-50 bg-black cursor-pointer overflow-hidden transition-opacity duration-500"
      style={{ opacity: fading ? 0 : 1 }}>
      <video ref={vid} src="/intro/intro.mp4" muted playsInline autoPlay preload="auto"
        onError={() => setMode('svg')}
        className="absolute inset-0 w-full h-full object-cover" />
      {/* darken the sky behind the logo for legibility */}
      <div className="absolute inset-0 transition-opacity duration-700" style={{ opacity: logo ? 1 : 0, background: 'radial-gradient(60% 45% at 50% 48%, rgba(0,0,0,.55), transparent 75%)' }} />
      {logo && <LogoOverlay />}
      <div className="absolute bottom-6 inset-x-0 text-center label !text-[9px] opacity-60">{t('skip')}</div>
    </div>
  )
}
