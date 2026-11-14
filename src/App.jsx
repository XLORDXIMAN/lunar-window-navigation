import { useCallback, useEffect, useState } from 'react'
import { useStore, loadSites } from './store.js'
import { useT } from './lib/i18n.js'
import Starfield from './components/Starfield.jsx'
import BootScreen from './components/BootScreen.jsx'
import TopBar from './components/TopBar.jsx'
import SiteCatalog from './components/SiteCatalog.jsx'
import MoonScene from './components/MoonScene.jsx'
import HorizonView from './components/HorizonView.jsx'
import SiteCard from './components/SiteCard.jsx'
import Timeline from './components/Timeline.jsx'
import WindowBars from './components/WindowBars.jsx'
import ScenarioCompare from './components/ScenarioCompare.jsx'
import Hero from './components/Hero.jsx'
import About from './components/About.jsx'
import { Reveal } from './lib/ui.jsx'
import { HOUR } from './lib/ephem.js'

export default function App() {
  const t = useT()
  const ready = useStore((s) => s.sites.length > 0)
  const playing = useStore((s) => s.playing)
  const [boot, setBoot] = useState(true)
  const done = useCallback(() => setBoot(false), [])

  useEffect(() => { loadSites().then(({ sites, mock }) => useStore.getState().setSites(sites, mock)) }, [])

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => { const s = useStore.getState(); s.shiftTime(s.speedH * HOUR) }, 80)
    return () => clearInterval(id)
  }, [playing])

  // keyboard: space = play/pause, ←/→ = ±1 day
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      const s = useStore.getState()
      if (e.code === 'Space') { e.preventDefault(); s.setPlaying(!s.playing) }
      if (e.code === 'ArrowRight') s.shiftTime(24 * HOUR)
      if (e.code === 'ArrowLeft') s.shiftTime(-24 * HOUR)
    }
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <Starfield />
      {boot && <BootScreen onDone={done} />}
      {!ready ? <div className="min-h-screen grid place-items-center label">{t('loading')}</div> : !boot && (
        <>
          <Hero />
          <main id="navigator" className="scroll-mt-2 w-full max-w-[1760px] mx-auto px-3 md:px-4 flex flex-col gap-3">
            <Reveal><TopBar /></Reveal>
            <div className="grid gap-3 grid-cols-1 xl:grid-cols-[290px_1fr_350px]">
              <Reveal delay={0.05}><SiteCatalog /></Reveal>
              <div className="flex flex-col gap-3 min-w-0">
                <Reveal delay={0.1}><MoonScene /></Reveal>
                <Reveal delay={0.15}><HorizonView /></Reveal>
              </div>
              <Reveal delay={0.1}><SiteCard /></Reveal>
            </div>
            <Reveal><Timeline /></Reveal>
            <Reveal><WindowBars /></Reveal>
            <Reveal><ScenarioCompare /></Reveal>
          </main>
          <div className="w-full max-w-[var(--page-max-width)] mx-auto px-4 md:px-8"><About /></div>
          <footer className="border-t border-[var(--color-line)]">
            <div className="max-w-[var(--page-max-width)] mx-auto px-4 md:px-8 py-8 label text-center">{t('footer')}</div>
          </footer>
        </>
      )}
    </>
  )
}
