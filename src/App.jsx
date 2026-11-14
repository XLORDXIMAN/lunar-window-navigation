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
import { HOUR } from './lib/ephem.js'

const delay = (s) => ({ animationDelay: `${s}s` })

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
      {!ready ? <div className="h-full grid place-items-center label">{t('loading')}</div> : !boot && (
        <div className="min-h-full flex flex-col gap-3 p-3 max-w-[1800px] mx-auto">
          <div className="rise" style={delay(0)}><TopBar /></div>
          <div className="grid gap-3 grid-cols-1 xl:grid-cols-[290px_1fr_350px]">
            <div className="rise" style={delay(0.1)}><SiteCatalog /></div>
            <div className="flex flex-col gap-3 min-w-0">
              <div className="rise" style={delay(0.2)}><MoonScene /></div>
              <div className="rise" style={delay(0.3)}><HorizonView /></div>
            </div>
            <div className="rise" style={delay(0.15)}><SiteCard /></div>
          </div>
          <div className="rise" style={delay(0.4)}><Timeline /></div>
          <div className="rise" style={delay(0.5)}><WindowBars /></div>
          <div className="rise" style={delay(0.6)}><ScenarioCompare /></div>
          <footer className="label text-center py-3 opacity-70">{t('footer')}</footer>
        </div>
      )}
    </>
  )
}
