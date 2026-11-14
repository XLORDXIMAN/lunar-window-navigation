// Full-screen Moon chapter: member 01's three.js MoonScene edge-to-edge with glass UI floating on top.
// Synced both ways with the app (sites, selection, time, A/B slip, time-lapse). Interaction is gated:
// the page keeps scrolling until the visitor clicks "Control the Moon" (or goes full screen).
// Landing gets a cinematic HUD (letterbox, altitude/speeds/throttle, P64 → P66 → contact, result card).
import { useEffect, useRef, useState } from 'react'
import { useStore, useSite } from '../store.js'
import { useT, useFmt } from '../lib/i18n.js'
import { siteName } from '../lib/ui.jsx'
import { stateAt, timeToChange, windowMetrics, verdict, DAY, HOUR } from '../lib/ephem.js'
import { MoonScene } from '../scene/MoonScene.js'

const CAT = { intl: 'international' }
const VTXT = { green: 'text-go', yellow: 'text-warn', red: 'text-nogo' }
const PHASES = ['APPROACH', 'VERTICAL', 'CONTACT', 'LANDED']

function Bar({ v, max, color }) {
  return <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${Math.min(100, (Math.abs(v) / max) * 100)}%`, background: color }} /></div>
}

export default function MoonSection() {
  const t = useT(), f = useFmt()
  const sec = useRef(null), box = useRef(null), moon = useRef(null), lapse = useRef(false)
  const [active, setActive] = useState(false)
  const [full, setFull] = useState(false)
  const [view, setView] = useState('globe')
  const [layer, setLayer] = useState('relief')
  const [compare, setCompare] = useState(false)
  const [busy, setBusy] = useState(false)
  const [landing, setLanding] = useState(null)   // live telemetry while descending
  const [result, setResult] = useState(null)     // touchdown summary
  const { sites, selectedId, time, lang, scenarioB, playing, select, setPlaying, shiftTime } = useStore()
  const site = useSite()

  // ---- scene lifecycle + events ----
  useEffect(() => {
    const m = new MoonScene(box.current, { hud: true })
    moon.current = m
    m.setMaxPixelRatio?.(1.5)
    m.setDate(new Date(useStore.getState().time)) // start on the app's date, not 'now'
    // render only while the Moon chapter is on screen (big GPU saving everywhere else)
    const vis = new IntersectionObserver(([e]) => { if (e.isIntersecting || document.fullscreenElement) m.resume?.(); else m.pause?.() }, { threshold: 0.02 })
    vis.observe(sec.current)
    const gate = () => { const on = sec.current?.dataset.active === '1'; m.controls && (m.controls.enableZoom = on); if (m.polarView) m.polarView.controls.enableZoom = on }
    const offs = [
      m.on('siteclick', ({ id }) => { if (id) useStore.getState().select(id) }),
      m.on('surfaceclick', ({ lat, lon }) => useStore.getState().addCustomSite(lat, lon)),
      m.on('viewchange', ({ mode }) => setView(mode)),
      m.on('polarready', gate),
      m.on('datechange', (s) => { if (lapse.current && s?.date) useStore.getState().setTime(+s.date) }),
      m.on('timelapse', ({ playing: p }) => { lapse.current = p }),
      m.on('landingstart', () => { setResult(null); setLanding({ phase: 'APPROACH', alt: 0, vs: 0, hs: 0, throttle: 0, scale: 4, t: 0 }) }),
      m.on('landingtelemetry', (s) => setLanding(s)),
      m.on('landingend', (r) => { setLanding(null); setResult(r) }),
    ]
    fetch('/data/ephem_subpoints.json').then((r) => (r.ok ? r.json() : null)).then((e) => { if (e?.rows?.length) m.setEphemeris(e.rows) }).catch(() => {})
    gate()
    return () => { vis.disconnect(); offs.forEach((off) => typeof off === 'function' && off()); m.dispose(); moon.current = null }
  }, [])

  // ---- app → scene ----
  useEffect(() => {
    moon.current?.setSites(sites.map((s) => ({ ...s, name: siteName(s, lang), category: CAT[s.category] ?? s.category })))
    moon.current?.select(useStore.getState().selectedId)
  }, [sites, lang])
  const first = useRef(true)
  useEffect(() => {
    const m = moon.current; if (!m || !selectedId) return
    m.select(selectedId)
    if (first.current) { first.current = false; return }
    if (m.getView() !== 'surface' && !landing) m.flyTo(selectedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])
  // time → scene: immediate first update, then at most ~8 updates/s while ▶ plays (keeps layers cheap)
  const dateTimer = useRef(null), lastSet = useRef(0)
  useEffect(() => {
    const m = moon.current; if (!m || lapse.current) return
    const apply = () => { lastSet.current = performance.now(); dateTimer.current = null; moon.current?.setDate(new Date(useStore.getState().time)) }
    const since = performance.now() - lastSet.current
    if (since > 120) apply()
    else if (!dateTimer.current) dateTimer.current = setTimeout(apply, 120 - since)
  }, [time])
  useEffect(() => () => clearTimeout(dateTimer.current), [])
  useEffect(() => {
    moon.current?.setCompareDate(compare ? new Date(scenarioB?.time ?? time + 12 * DAY) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compare, scenarioB?.time])

  // ---- interaction gate: page scroll is never hijacked until the visitor opts in ----
  useEffect(() => {
    const m = moon.current
    if (sec.current) sec.current.dataset.active = active ? '1' : '0'
    if (m?.controls) m.controls.enableZoom = active
    if (m?.polarView) m.polarView.controls.enableZoom = active
  }, [active])
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.intersectionRatio < 0.35 && !document.fullscreenElement) setActive(false) }, { threshold: [0, 0.35, 1] })
    io.observe(sec.current)
    const onKey = (e) => { if (e.key === 'Escape' && !document.fullscreenElement) setActive(false) }
    const onFs = () => { const fs = document.fullscreenElement === sec.current; setFull(fs); if (fs) setActive(true) }
    addEventListener('keydown', onKey); document.addEventListener('fullscreenchange', onFs)
    return () => { io.disconnect(); removeEventListener('keydown', onKey); document.removeEventListener('fullscreenchange', onFs) }
  }, [])

  // ---- actions ----
  const go = async (mode) => {
    const m = moon.current; if (!m) return
    setBusy(true)
    try {
      if (mode === 'surface') await m.enterSurfaceView(selectedId)
      else if (mode === 'polar') await m.setView('polar', site && site.lat < -80 ? { lat: site.lat, lon: site.lon, altitude: 120 } : undefined)
      else await m.setView('globe') // setView leaves the surface view itself (no racing exit)
    } finally { setBusy(false) }
  }
  const [toast, setToast] = useState(null)
  // landing at night shows nothing but earthshine: move the landing to the next local morning (like Apollo 11, Sun ≈ 10°)
  const land = () => {
    setActive(true); setResult(null)
    const s = useStore.getState(), sv = s.sites.find((x) => x.id === s.selectedId)
    let when = s.time
    if (sv && stateAt(sv, when).sunVis < 0.5) {
      const tt = timeToChange(sv, when, 'sun')
      if (!tt.on && tt.hours != null) {
        when = when + (tt.hours + (Math.abs(sv.lat) > 60 ? 6 : 18)) * HOUR
        s.setTime(when)
        const el = stateAt(sv, when).sun.el
        setToast(t('land.dawn', { d: f.dt(when), el: `${el >= 0 ? '+' : ''}${el.toFixed(1)}°` }))
        setTimeout(() => setToast(null), 6500)
      }
    }
    moon.current?.setDate(new Date(when))
    moon.current?.flyTo(s.selectedId, { landing: true })
  }
  const timelapse = () => { const m = moon.current; if (!m) return; if (lapse.current) { m.stopTimelapse(); return } m.setDate(new Date(time)); m.playTimelapse({ spanDays: 29.53, durationSec: 20 }) }
  const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen(); else sec.current?.requestFullscreen?.() }

  // ---- readout for the selected site ----
  const st = site ? stateAt(site, time) : null
  const v = site ? verdict(windowMetrics(site, Math.floor(time / HOUR) * HOUR, 14, 1), site) : null
  const sunT = site ? timeToChange(site, time, 'sun') : null
  const earthT = site ? timeToChange(site, time, 'earth') : null
  const cine = !!landing
  const soft = result?.touchdownSpeed != null ? (result.touchdownSpeed < 2 ? 'soft' : result.touchdownSpeed < 3 ? 'ok' : 'hard') : null

  return (
    <section id="moon" ref={sec} data-active="0" className={`relative h-[100svh] min-h-[620px] overflow-hidden bg-black ${cine ? 'is-landing' : ''}`}>
      <div ref={box} className={`absolute inset-0 ${active || cine ? '' : 'pointer-events-none'}`} />
      {/* legibility gradients */}
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/80 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />

      {/* cinematic letterbox during landing */}
      <div className="absolute inset-x-0 top-0 bg-black pointer-events-none transition-[height] duration-700 z-20" style={{ height: cine ? '9vh' : 0 }} />
      <div className="absolute inset-x-0 bottom-0 bg-black pointer-events-none transition-[height] duration-700 z-20" style={{ height: cine ? '9vh' : 0 }} />

      {/* top bar */}
      <div className={`absolute top-0 inset-x-0 z-30 wrap pt-8 flex flex-wrap items-start gap-4 transition-opacity duration-500 ${cine ? 'opacity-0 pointer-events-none' : ''}`}>
        <div>
          <div className="eyebrow !justify-start before:!hidden">{t('moon5.eyebrow')}</div>
          <h2 className="h-section !text-[clamp(22px,3vw,40px)] mt-2">{t('moon5.title')}</h2>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="capsule !pr-3 cursor-pointer max-w-[280px]">
            <select aria-label={t('sites')} value={selectedId} onChange={(e) => select(e.target.value)} className="appearance-none bg-transparent outline-none cursor-pointer truncate max-w-[230px] text-[var(--lux-ink)]">
              {sites.map((s) => <option key={s.id} value={s.id} className="bg-[#0a0c17]">{siteName(s, lang)}</option>)}
            </select>
            <span aria-hidden className="text-[10px] lux-muted">▼</span>
          </label>
          <button className="capsule" onClick={toggleFull}>{full ? t('moon5.exitFull') : t('moon5.full')}</button>
        </div>
      </div>

      {/* readout card */}
      {site && st && (
        <div className={`absolute z-30 right-4 md:right-8 top-[120px] w-[280px] hidden md:block transition-opacity duration-500 ${cine ? 'opacity-0 pointer-events-none' : ''}`}><div className="glass p-5">
          <div className="text-[15px] text-[var(--lux-hi)] truncate">{siteName(site, lang)}</div>
          <div className={`text-[13px] mt-1 ${VTXT[v.level]}`}>● {t(`v.${v.level}`).split(' — ')[0]}</div>
          <div className="mt-4 text-[12px] lux-muted">{t('sunEl')}</div>
          <div className="font-display text-[40px] leading-none grad-sun mt-1">{st.sun.el >= 0 ? '+' : ''}{st.sun.el.toFixed(2)}°</div>
          <div className="grid grid-cols-2 gap-3 mt-4 text-[12px]">
            <div><div className="lux-muted">{t('earthEl')}</div><div className="font-display text-[18px] grad-earth mt-0.5">{st.earth.el.toFixed(2)}°</div></div>
            <div><div className="lux-muted">{sunT.on ? t('sunsetIn') : t('sunriseIn')}</div><div className="font-display text-[18px] text-[var(--lux-hi)] mt-0.5">{sunT.hours == null ? '—' : f.h(sunT.hours)}</div></div>
            <div><div className="lux-muted">{earthT.on ? t('earthsetIn') : t('earthriseIn')}</div><div className="font-display text-[18px] text-[var(--lux-hi)] mt-0.5">{earthT.hours == null ? (earthT.on ? '∞' : t('never')) : f.h(earthT.hours)}</div></div>
            <div><div className="lux-muted">{t('landingDate')}</div><div className="text-[13px] text-[var(--lux-hi)] mt-1">{f.day(time)}</div></div>
          </div>
        </div></div>
      )}

      {/* activation gate */}
      {!active && !cine && (
        <button onClick={() => setActive(true)} className="absolute z-30 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 capsule capsule-primary !h-12 !px-6 !text-[15px]">
          {t('moon5.control')}
        </button>
      )}

      {/* bottom control bar */}
      <div className={`absolute z-30 bottom-6 inset-x-0 px-4 flex justify-center transition-opacity duration-500 ${cine ? 'opacity-0 pointer-events-none' : ''}`}>
        <div className="glass !rounded-[22px] p-2.5 flex flex-nowrap md:flex-wrap items-center md:justify-center gap-2 max-w-[1200px] overflow-x-auto [scrollbar-width:none] [&>*]:shrink-0">
          <button onClick={() => setPlaying(!playing)} className="capsule !w-9 !px-0" aria-label="play">{playing ? '❚❚' : '▶'}</button>
          <button className="capsule !px-3" onClick={() => shiftTime(-DAY)}>−1 {t('d')}</button>
          <span className="text-[13px] text-[var(--lux-ink)] px-1 whitespace-nowrap">{f.dt(time)}</span>
          <button className="capsule !px-3" onClick={() => shiftTime(DAY)}>+1 {t('d')}</button>
          <span className="w-px h-6 bg-white/10 mx-1" />
          <div className="seg">{[['globe', t('m3.globe')], ['polar', t('m3.polar')], ['surface', t('m3.surface')]].map(([k, l]) => <button key={k} disabled={busy} className={view === k ? 'on' : ''} onClick={() => { setActive(true); go(k) }}>{l}</button>)}</div>
          <div className="seg">{[['relief', t('m3.relief')], ['slope', t('m3.slope')], ['illumination', t('m3.sun')], ['comms', t('m3.link')]].map(([k, l]) => <button key={k} className={layer === k ? 'on' : ''} onClick={() => { setLayer(k); moon.current?.setLayer(k) }}>{l}</button>)}</div>
          <button className={`capsule ${compare ? 'capsule-primary' : ''}`} onClick={() => setCompare(!compare)}>{compare ? t('m3.abOff') : t('m3.ab')}</button>
          <button className="capsule" onClick={timelapse}>{t('m3.lapse')}</button>
          <button className="capsule capsule-primary" onClick={land}>🚀 {t('m3.land')}</button>
        </div>
      </div>

      {toast && <div className="absolute z-40 top-[15vh] left-1/2 -translate-x-1/2 w-[min(92vw,560px)]"><div className="glass px-5 py-3 text-center text-[14px] text-[var(--lux-hi)]">☀ {toast}</div></div>}

      {/* landing HUD */}
      {cine && (
        <div className="absolute inset-0 z-30 pointer-events-none">
          <div className="absolute top-[11vh] inset-x-0 flex justify-center gap-2 px-4">
            {PHASES.map((p, i) => {
              const cur = PHASES.indexOf(landing.phase)
              return <span key={p} className={`chip !text-[12px] ${i === cur ? '!text-[var(--lux-hi)] !border-white/30 bg-white/10' : i < cur ? 'text-go' : 'lux-muted'}`}>{i < cur ? '✓' : `0${i + 1}`} · {t(`land.${p}`)}</span>
            })}
          </div>
          <div className="absolute left-4 md:left-10 bottom-[12vh] w-[260px]"><div className="glass p-5">
            <div className="text-[12px] lux-muted">{t('land.alt')}</div>
            <div className="font-display text-[56px] leading-none text-[var(--lux-hi)] mt-1 tabular-nums">{Math.max(0, landing.alt).toFixed(landing.alt < 100 ? 1 : 0)}<span className="text-[18px] lux-muted ml-1">m</span></div>
            <div className="grid gap-3 mt-5 text-[12px]">
              <div><div className="flex justify-between"><span className="lux-muted">{t('land.vs')}</span><span className="tabular-nums text-[var(--lux-hi)]">{landing.vs.toFixed(1)} m/s</span></div><Bar v={landing.vs} max={40} color="linear-gradient(90deg,#8fd3ff,#3d7bff)" /></div>
              <div><div className="flex justify-between"><span className="lux-muted">{t('land.hs')}</span><span className="tabular-nums text-[var(--lux-hi)]">{landing.hs.toFixed(1)} m/s</span></div><Bar v={landing.hs} max={60} color="linear-gradient(90deg,#c2ccff,#8b5cff)" /></div>
              <div><div className="flex justify-between"><span className="lux-muted">{t('land.thr')}</span><span className="tabular-nums text-[var(--lux-hi)]">{Math.round(landing.throttle * 100)}%</span></div><Bar v={landing.throttle} max={1} color="linear-gradient(90deg,#ffe7b0,#ff7a1a)" /></div>
            </div>
          </div></div>
          <div className="absolute right-4 md:right-10 bottom-[12vh]"><div className="glass px-4 py-3 text-right">
            <div className="text-[12px] lux-muted">{t('land.g')}</div>
            <div className="font-display text-[22px] text-[var(--lux-hi)]">1.62 m/s²</div>
            <div className="text-[12px] lux-muted mt-1">T+{landing.t.toFixed(0)} s · ×{landing.scale}</div>
          </div></div>
        </div>
      )}

      {/* touchdown result */}
      {result && !cine && (
        <div className="absolute z-40 left-1/2 top-[22%] -translate-x-1/2 w-[min(92vw,420px)]"><div className="lux-glass reg-dots p-7 text-center">
          <div className="eyebrow">{t('land.done')}</div>
          <div className={`font-display text-[44px] mt-3 ${soft === 'hard' ? 'text-nogo' : soft === 'ok' ? 'text-warn' : 'text-go'}`}>{result.touchdownSpeed != null ? `${result.touchdownSpeed.toFixed(2)} m/s` : '✓'}</div>
          <div className="text-[15px] text-[var(--lux-hi)] mt-1">{soft ? t(`land.${soft}`) : ''}</div>
          <div className="text-[13px] lux-muted mt-2">{site ? siteName(site, lang) : ''}{result.durationSec ? ` · ${Math.round(result.durationSec)} s` : ''}</div>
          <div className="flex justify-center gap-2 mt-6">
            <button className="capsule" onClick={() => setResult(null)}>{t('land.look')}</button>
            <button className="capsule" onClick={() => { setResult(null); go('globe') }}>{t('land.orbit')}</button>
            <button className="capsule capsule-primary" onClick={land}>{t('land.again')}</button>
          </div>
        </div></div>
      )}
    </section>
  )
}
