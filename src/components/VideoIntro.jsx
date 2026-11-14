// Cinematic intro: Blender-rendered clip (public/intro/intro.mp4, 6 s @ 50 fps, by Almansur) —
// the shuttle stack crosses golden-hour clouds and the 3D "MainTech" title emerges from its exhaust.
//
// Transition to the site = "leaving the atmosphere": the camera keeps climbing (clouds drop away and
// blur), darkness descends from the top like the sky turning into space, stars fade in, and the site
// mounts underneath (onReveal) so its hero animates in while the intro dissolves (onDone).
// Falls back to the particle intro if the video can't play (missing file, autoplay blocked, reduced motion).
import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n.js'
import ParticleIntro from '../v2/Intro.jsx'

const ASCEND_AT = 5.05 // s — start climbing out of the atmosphere
const REVEAL_AT = 5.6  // s — mount the site underneath
const END_AT = 6.55    // s — intro fully gone (video is 6.0 s; the last frame holds while we fade)

export default function Intro({ onReveal, onDone }) {
  const t = useT()
  const vid = useRef(null)
  const [mode, setMode] = useState(() =>
    typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'particles' : 'video')
  const [phase, setPhase] = useState('play') // play → ascend → reveal → gone
  const flags = useRef({ reveal: false, done: false })
  const reveal = () => { if (!flags.current.reveal) { flags.current.reveal = true; onReveal?.() } }
  const finish = () => { reveal(); if (!flags.current.done) { flags.current.done = true; onDone() } }

  useEffect(() => {
    if (mode !== 'video') return
    const v = vid.current
    const startGuard = setTimeout(() => { if (!v || v.currentTime < 0.05) setMode('particles') }, 1800)
    const hardStop = setTimeout(finish, (END_AT + 2.5) * 1000) // never hang on stage
    let endTimer = null
    const sync = () => {
      const tt = v?.currentTime ?? 0
      if (tt >= ASCEND_AT) setPhase((p) => (p === 'play' ? 'ascend' : p))
      if (tt >= REVEAL_AT) { setPhase((p) => (p === 'play' || p === 'ascend' ? 'reveal' : p)); reveal() }
    }
    const onEnded = () => {
      setPhase('reveal'); reveal()
      endTimer = setTimeout(() => { setPhase('gone'); setTimeout(finish, 650) }, Math.max(0, (END_AT - 6.0 - 0.65) * 1000))
    }
    const iv = setInterval(sync, 40)
    v?.addEventListener('timeupdate', sync)
    v?.addEventListener('ended', onEnded)
    v?.play?.().catch(() => setMode('particles'))
    return () => { clearInterval(iv); clearTimeout(startGuard); clearTimeout(hardStop); clearTimeout(endTimer); v?.removeEventListener('timeupdate', sync); v?.removeEventListener('ended', onEnded) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  if (mode === 'particles') return <ParticleIntro onReveal={onReveal} onDone={onDone} />

  const skip = () => { setPhase('reveal'); reveal(); setTimeout(() => { setPhase('gone'); setTimeout(finish, 650) }, 450) }
  const climbing = phase !== 'play'
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
      <div className="absolute bottom-6 inset-x-0 text-center mono-sm text-fog/70 transition-opacity duration-300" style={{ opacity: climbing ? 0 : 1 }}>{t('skip')}</div>
    </div>
  )
}
