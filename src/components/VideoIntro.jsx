// Cinematic intro: Blender-rendered clip by Almansur (public/intro/intro.mp4, first 2.7 s) — the shuttle
// stack crosses golden-hour clouds; the "MainTech" title is then drawn in HTML over the held last frame.
//
// Transition to the site = "leaving the atmosphere": the camera keeps climbing (clouds drop away and
// blur), darkness descends from the top like the sky turning into space, stars fade in, and the site
// mounts underneath (onReveal) so its hero animates in while the intro dissolves (onDone).
// Falls back to the particle intro if the video can't play (missing file, autoplay blocked, reduced motion).
import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n.js'
import ParticleIntro from '../v2/Intro.jsx'

// The clip (2.7 s, shuttle through the clouds) ends before any logo; the title is drawn here in HTML
// over the held last frame, so no third-party insignia appears anywhere in the intro.
const TITLE_HOLD = 1.9  // s after the clip ends — title on screen before climbing
const END_AT = 6.55     // s — budget for the hard stop

export default function Intro({ onReveal, onDone }) {
  const t = useT()
  const vid = useRef(null)
  const [mode, setMode] = useState(() =>
    typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'particles' : 'video')
  const [phase, setPhase] = useState('play') // play → title → ascend → reveal → gone
  const flags = useRef({ reveal: false, done: false })
  const reveal = () => { if (!flags.current.reveal) { flags.current.reveal = true; onReveal?.() } }
  const finish = () => { reveal(); if (!flags.current.done) { flags.current.done = true; onDone() } }

  useEffect(() => {
    if (mode !== 'video') return
    const v = vid.current
    // a slow first visit must not swap in the old particle intro: wait for the clip (faststart MP4 starts
    // playing after a few hundred KB); fall back only if it truly can't start within 7 s
    let started = false
    const onPlaying = () => { started = true }
    v?.addEventListener('playing', onPlaying)
    const startGuard = setTimeout(() => { if (!started && (!v || v.currentTime < 0.05)) setMode('particles') }, 7000)
    let hardStop = null
    const armStop = () => { clearTimeout(hardStop); hardStop = setTimeout(finish, (END_AT + 2.5) * 1000) } // never hang on stage
    v?.addEventListener('playing', armStop, { once: true })
    const lateStop = setTimeout(finish, (7 + END_AT + 2.5) * 1000)
    let endTimer = null
    const sync = () => {}
    const timers = []
    const onEnded = () => {
      setPhase('title')
      timers.push(setTimeout(() => setPhase((p) => (p === 'title' ? 'ascend' : p)), TITLE_HOLD * 1000))
      timers.push(setTimeout(() => { setPhase((p) => (p === 'title' || p === 'ascend' ? 'reveal' : p)); reveal() }, (TITLE_HOLD + 0.55) * 1000))
      endTimer = setTimeout(() => { setPhase('gone'); setTimeout(finish, 650) }, (TITLE_HOLD + 1.2) * 1000)
    }
    const iv = setInterval(sync, 40)
    v?.addEventListener('timeupdate', sync)
    v?.addEventListener('ended', onEnded)
    // only a real autoplay refusal falls back; an aborted play() during buffering is retried by autoPlay
    v?.play?.().catch((e) => { if (e?.name === 'NotAllowedError') setMode('particles') })
    return () => { clearInterval(iv); clearTimeout(startGuard); clearTimeout(hardStop); clearTimeout(lateStop); timers.forEach(clearTimeout); v?.removeEventListener('playing', onPlaying); clearTimeout(endTimer); v?.removeEventListener('timeupdate', sync); v?.removeEventListener('ended', onEnded) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  if (mode === 'particles') return <ParticleIntro onReveal={onReveal} onDone={onDone} />

  const skip = () => { setPhase('reveal'); reveal(); setTimeout(() => { setPhase('gone'); setTimeout(finish, 650) }, 450) }
  const climbing = phase === 'ascend' || phase === 'reveal' || phase === 'gone'
  const titleOn = phase === 'title' || phase === 'ascend'
  const ease = 'cubic-bezier(.55,0,.2,1)'

  return (
    <div onClick={skip} role="presentation"
      className="fixed inset-0 z-50 cursor-pointer overflow-hidden"
      style={{ opacity: phase === 'gone' ? 0 : 1, transition: `opacity .65s ${ease}`, background: climbing ? 'transparent' : '#000' }}>
      {/* the clip — keeps "climbing": clouds drop away, blur and dim */}
      <video ref={vid} src="/intro/intro.mp4" muted playsInline autoPlay preload="auto"
        onError={() => setMode('particles')}
        className="absolute inset-0 w-full h-full object-cover portrait:object-contain portrait:bg-black"
        style={{
          transform: climbing ? 'translateY(22%) scale(1.12)' : 'none',
          filter: climbing ? 'blur(5px) brightness(.45) saturate(.7)' : 'none',
          opacity: phase === 'reveal' || phase === 'gone' ? 0 : 1,
          transition: `transform 1.5s ${ease}, filter 1.2s ${ease}, opacity .9s ${ease} .2s`,
        }} />
      {/* space descends from the top: golden sky → black */}
      <div className="absolute inset-x-0 top-0 h-[170%] pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, #05060d 0%, #05060d 52%, rgba(5,6,13,.85) 64%, rgba(5,6,13,0) 100%)',
          transform: climbing ? 'translateY(-10%)' : 'translateY(-100%)',
          opacity: phase === 'reveal' || phase === 'gone' ? 0 : 1,
          transition: `transform 1.4s ${ease}, opacity .8s ${ease} .35s`,
        }} />
      {/* title (HTML, no logos): metallic copper "Main" + steel-blue "Tech", resolves out of a blur */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 55% 35% at 50% 50%, rgba(10,12,24,.42), rgba(10,12,24,0) 70%)', opacity: titleOn ? 1 : 0, transition: `opacity 1s ${ease}` }} />
      <div className="absolute inset-0 grid place-items-center pointer-events-none px-6">
        <div className="text-center" style={{
          opacity: titleOn ? 1 : 0,
          transform: titleOn ? (phase === 'ascend' ? 'translateY(-6vh) scale(.96)' : 'none') : 'scale(1.18)',
          filter: titleOn ? 'blur(0)' : 'blur(14px)',
          transition: `opacity .9s ${ease}, transform 1.2s ${ease}, filter 1s ${ease}`,
        }}>
          <div className="font-display leading-none tracking-[-0.02em] text-[clamp(56px,11vw,180px)]" style={{ filter: 'drop-shadow(0 6px 30px rgba(0,0,0,.45))' }}>
            <span style={{ background: 'linear-gradient(180deg,#fff2df 0%,#e7b98c 38%,#9a6440 62%,#f2c9a0 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Main</span>
            <span style={{ background: 'linear-gradient(180deg,#eef4ff 0%,#8fb0ec 38%,#2f4f8f 62%,#a9c3f3 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Tech</span>
          </div>
          <div className="mt-5 text-[clamp(10px,1.1vw,15px)] tracking-[.32em] uppercase text-white/85" style={{ textShadow: '0 2px 12px rgba(0,0,0,.6)' }}>
            LunarWindow · Lunar Landing Site Navigator · Space Apps 2026
          </div>
        </div>
      </div>
      <div className="absolute bottom-6 inset-x-0 text-center mono-sm text-fog/70 transition-opacity duration-300" style={{ opacity: climbing ? 0 : 1 }}>{t('skip')}</div>
    </div>
  )
}
