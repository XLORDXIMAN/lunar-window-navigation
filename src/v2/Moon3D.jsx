// Member 01's three.js MoonScene (src/scene/MoonScene.js) wired into the app, both ways:
//   app → scene: sites, selected site (fly-to), time (date-driven shadows), A/B slip date, views, layers
//   scene → app: clicking a site selects it, clicking terrain adds a custom site, the lunar-day
//                time-lapse drives the app timeline, view/mode changes update the controls.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store.js'
import { useT } from '../lib/i18n.js'
import { siteName } from '../lib/ui.jsx'
import { MoonScene } from '../scene/MoonScene.js'

const CAT = { intl: 'international' } // app category → scene category

export default function Moon3D() {
  const t = useT()
  const box = useRef(null)
  const moon = useRef(null)
  const ready = useRef(false)
  const lapse = useRef(false)
  const [view, setView] = useState('globe')
  const [layer, setLayer] = useState('relief')
  const [compare, setCompare] = useState(false)
  const [busy, setBusy] = useState(false)
  const { sites, selectedId, time, lang, scenarioB } = useStore()

  // create once
  useEffect(() => {
    const m = new MoonScene(box.current, { hud: true })
    moon.current = m
    const offs = [
      m.on('siteclick', ({ id }) => { if (id) useStore.getState().select(id) }),
      m.on('surfaceclick', ({ lat, lon }) => useStore.getState().addCustomSite(lat, lon)),
      m.on('viewchange', ({ mode }) => setView(mode)),
      m.on('datechange', (s) => { if (lapse.current && s?.date) useStore.getState().setTime(+s.date) }),
      m.on('timelapse', ({ playing }) => { lapse.current = playing }),
    ]
    fetch('/data/ephem_subpoints.json').then((r) => (r.ok ? r.json() : null)).then((e) => { if (e?.rows?.length) m.setEphemeris(e.rows) }).catch(() => {})
    ready.current = true
    return () => { offs.forEach((off) => typeof off === 'function' && off()); m.dispose(); moon.current = null; ready.current = false }
  }, [])

  // sites (names follow the UI language)
  useEffect(() => {
    moon.current?.setSites(sites.map((s) => ({ ...s, name: siteName(s, lang), category: CAT[s.category] ?? s.category })))
    moon.current?.select(useStore.getState().selectedId)
  }, [sites, lang])

  // selection → highlight + fly there
  const first = useRef(true)
  useEffect(() => {
    const m = moon.current; if (!m || !selectedId) return
    m.select(selectedId)
    if (first.current) { first.current = false; return }
    if (m.getView() !== 'surface') m.flyTo(selectedId)
  }, [selectedId])

  // time → date-driven lighting and shadows (coalesced to one update per frame)
  useEffect(() => {
    const m = moon.current; if (!m || lapse.current) return
    const id = requestAnimationFrame(() => m.setDate(new Date(time)))
    return () => cancelAnimationFrame(id)
  }, [time])

  // A/B split follows the mission-slip scenario
  useEffect(() => {
    const m = moon.current; if (!m) return
    const b = scenarioB?.time ?? time + 12 * 864e5
    m.setCompareDate(compare ? new Date(b) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compare, scenarioB?.time])

  const site = sites.find((s) => s.id === selectedId)
  const go = async (mode) => {
    const m = moon.current; if (!m) return
    setBusy(true)
    try {
      if (mode === 'surface') await m.enterSurfaceView(selectedId)
      else if (mode === 'polar') await m.setView('polar', site && site.lat < -80 ? { lat: site.lat, lon: site.lon, altitude: 120 } : undefined)
      else { if (m.getView() === 'surface') m.exitSurfaceView(); await m.setView('globe') }
    } finally { setBusy(false) }
  }
  const land = () => { moon.current?.flyTo(selectedId, { landing: true }) }
  const timelapse = () => {
    const m = moon.current; if (!m) return
    if (lapse.current) { m.stopTimelapse(); return }
    m.setDate(new Date(time))
    m.playTimelapse({ spanDays: 29.53, durationSec: 20 })
  }
  const pickLayer = (l) => { setLayer(l); moon.current?.setLayer(l) }

  return (
    <div className="glass !p-0">
      <div ref={box} className="relative w-full h-[clamp(420px,62vh,720px)] bg-black" />
      <div className="flex flex-wrap items-center gap-3 p-4 border-t border-white/10">
        <div className="seg">
          {[['globe', t('m3.globe')], ['polar', t('m3.polar')], ['surface', t('m3.surface')]].map(([k, l]) => (
            <button key={k} disabled={busy} className={view === k ? 'on' : ''} onClick={() => go(k)}>{l}</button>
          ))}
        </div>
        <div className="seg">
          {[['relief', t('m3.relief')], ['slope', t('m3.slope')], ['illumination', t('m3.sun')], ['comms', t('m3.link')]].map(([k, l]) => (
            <button key={k} className={layer === k ? 'on' : ''} onClick={() => pickLayer(k)}>{l}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 ml-auto">
          <button className={`capsule ${compare ? 'capsule-primary' : ''}`} onClick={() => setCompare(!compare)}>{compare ? t('m3.abOff') : t('m3.ab')}</button>
          <button className="capsule" onClick={timelapse}>{t('m3.lapse')}</button>
          <button className="capsule capsule-primary" onClick={land}>{t('m3.land')}</button>
        </div>
      </div>
    </div>
  )
}
