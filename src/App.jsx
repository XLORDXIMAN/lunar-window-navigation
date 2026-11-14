import { useCallback, useEffect, useState } from 'react'
import { useStore, loadSites } from './store.js'
import { useT } from './lib/i18n.js'
import { HOUR } from './lib/ephem.js'
import Intro from './components/VideoIntro.jsx'
import GalaxySky from './v2/GalaxySky.jsx'
import { useScrollFX } from './v2/scrollfx.js'
import MoonMount from './v2/MoonMount.jsx'

import Hero from './v2/Hero.jsx'
import Columns from './v2/Columns.jsx'
import Navigator from './v2/Navigator.jsx'
import { Windows, Scenario, Info } from './v2/Sections.jsx'

export default function App() {
  const t = useT()
  const ready = useStore((s) => s.sites.length > 0)
  const playing = useStore((s) => s.playing)
  const [boot, setBoot] = useState(true)   // intro on stage
  const [site, setSite] = useState(false)  // site mounted (during the intro's exit transition)
  const reveal = useCallback(() => setSite(true), [])
  const done = useCallback(() => { setSite(true); setBoot(false) }, [])
  useScrollFX()

  useEffect(() => { loadSites().then(({ sites, mock }) => useStore.getState().setSites(sites, mock)) }, [])

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => { const s = useStore.getState(); s.shiftTime(s.speedH * HOUR) }, 80)
    return () => clearInterval(id)
  }, [playing])

  // keyboard: space = play/pause, ←/→ = ±1 day
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
      const s = useStore.getState()
      if (e.code === 'Space') { e.preventDefault(); s.setPlaying(!s.playing) }
      if (e.code === 'ArrowRight') s.shiftTime(24 * HOUR)
      if (e.code === 'ArrowLeft') s.shiftTime(-24 * HOUR)
    }
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <GalaxySky />
      <div id="sfx-progress" aria-hidden="true" />
      {boot && <Intro onReveal={reveal} onDone={done} />}
      {!site ? null : !ready ? <div className="min-h-screen grid place-items-center mono text-fog">{t('loading')}</div> : (
        <main>
          <Hero />
          <Columns />
          <MoonMount />
          <Navigator />
          <Windows />
          <Scenario />
          <Info />
        </main>
      )}
    </>
  )
}
