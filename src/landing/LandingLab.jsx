// Full-screen "Landing diorama": Blender assets + physics descent, environment from the team backend.
// Data path: FastAPI /api/simulate (sun/earth az-el, energy coefficient with the horizon profile)
//            → falls back to the DE440s export (same ephemerides) when the API isn't reachable.
import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n.js'
import { sunPos, earthPos } from '../lib/ephem.js'
import { LandingSim } from './LandingSim.js'

const API = import.meta.env.VITE_API_URL || `${location.protocol}//${location.hostname}:8000`

function resample(profile) {
  // [{az, el}] (any step) or number[] → 360 numbers, az 0..359
  if (!profile?.length) return null
  if (typeof profile[0] === 'number') return profile.length === 360 ? profile : Array.from({ length: 360 }, (_, i) => profile[Math.floor((i / 360) * profile.length)])
  const sorted = [...profile].sort((a, b) => a.az - b.az)
  return Array.from({ length: 360 }, (_, az) => {
    let j = sorted.findIndex((p) => p.az >= az); if (j < 0) j = 0
    const b = sorted[j], a = sorted[(j - 1 + sorted.length) % sorted.length]
    const span = ((b.az - a.az + 360) % 360) || 1, f = ((az - a.az + 360) % 360) / span
    return a.el + (b.el - a.el) * Math.min(1, Math.max(0, f))
  })
}
function diskFraction(sunAz, sunEl, prof) {
  const hz = prof ? prof[Math.round(((sunAz % 360) + 360) % 360) % 360] : 0
  return Math.min(1, Math.max(0, (sunEl - hz + 0.27) / 0.54))
}

async function environment(site, time, profile) {
  const prof = resample(profile) ?? site.horizon ?? null
  try {
    const q = new URLSearchParams({ lat: site.lat, lon: site.lon, start_date: new Date(time).toISOString(), duration_days: '0.04', step_hours: '1', lookahead_days: '0' })
    if (prof) q.set('horizon_profile', prof.map((v) => v.toFixed(3)).join(','))
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 2500)
    const r = await fetch(`${API}/api/simulate?${q}`, { signal: ctl.signal }); clearTimeout(to)
    if (!r.ok) throw new Error(r.status)
    const s = (await r.json()).series?.[0]
    if (!s) throw new Error('empty')
    return { sunAz: s.sun_az, sunEl: s.sun_el, earthAz: s.earth_az, earthEl: s.earth_el, energy: s.energy_coefficient, profile: prof, source: 'FastAPI /api/simulate · DE440s' }
  } catch {
    const sp = sunPos(site, time), ep = earthPos(site, time)
    return { sunAz: sp.az, sunEl: sp.el, earthAz: ep.az, earthEl: ep.el, energy: diskFraction(sp.az, sp.el, prof), profile: prof, source: 'DE440s export (API offline)' }
  }
}

const PH = ['BRAKING', 'TERMINAL', 'CONTACT', 'LANDED']

export default function LandingLab({ site, time, profile, siteLabel, onClose }) {
  const t = useT()
  const box = useRef(null), sim = useRef(null), envRef = useRef(null)
  const [tel, setTel] = useState(null)
  const [phase, setPhase] = useState(null)
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState(null)
  const [note, setNote] = useState(null)

  useEffect(() => {
    let last = 0
    const s = new LandingSim(box.current, {
      onTelemetry: (d) => { const n = performance.now(); if (n - last > 90) { last = n; setTel(d) } },
      onPhase: setPhase, onReady: () => setReady(true), onError: (e) => setErr(String(e)),
    })
    sim.current = s
    // a night landing is invisible (no air → no skylight): move to local morning, like the main landing
    ;(async () => {
      let env = await environment(site, time, profile), when = time, moved = false
      if (env.sunEl < 1 || env.energy < 0.05) {
        for (let h = 1; h <= 24 * 30; h++) {
          const sp = sunPos(site, time + h * 3600e3)
          const ok = Math.abs(site.lat) > 60 ? diskFraction(sp.az, sp.el, env.profile) > 0.9 && sp.el > 0.5 : sp.el > 9
          if (ok) { when = time + h * 3600e3 + 2 * 3600e3; moved = true; break }
        }
        if (moved) env = await environment(site, when, profile)
      }
      env.moved = moved ? new Date(when).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : null
      envRef.current = env; setNote(env.moved); s.start(env)
    })()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', onKey)
    return () => { removeEventListener('keydown', onKey); s.dispose() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const restart = () => envRef.current && sim.current?.start(envRef.current)
  const cur = PH.indexOf(phase)
  const soft = tel?.vImpact != null ? (tel.vImpact < 1 ? 'soft' : tel.vImpact < 2 ? 'ok' : 'hard') : null
  const cells = tel ? [
    [t('lab.alt'), `${tel.alt.toFixed(tel.alt < 100 ? 1 : 0)}`, 'm'],
    [t('lab.vv'), `${tel.vv.toFixed(1)}`, 'm/s'],
    [t('lab.sun'), `${tel.sunEl >= 0 ? '+' : ''}${tel.sunEl?.toFixed(2)}`, '°'],
    [t('lab.power'), `${Math.round(tel.power ?? 0)}`, '%'],
    [t('lab.slope'), `${tel.slope.toFixed(1)}`, '°'],
  ] : []

  return (
    <div className="fixed inset-0 z-[70] bg-black">
      <div ref={box} className="absolute inset-0" />
      {!ready && !err && <div className="absolute inset-0 grid place-items-center text-[14px] lux-muted">{t('lab.loading')}</div>}
      {err && <div className="absolute inset-0 grid place-items-center text-[14px] text-nogo">{t('lab.error')}</div>}

      <div className="absolute top-5 inset-x-5 flex flex-wrap items-center gap-3">
        <div className="glass !rounded-full px-4 py-2 text-[13px] text-[var(--lux-hi)]">{t('lab.title')} · {siteLabel}</div>
        <div className="flex gap-2 flex-wrap">
          {PH.map((p, i) => <span key={p} className={`chip !text-[12px] ${i === cur ? '!text-[var(--lux-hi)] !border-white/30 bg-white/10' : i < cur ? 'text-go' : 'lux-muted'}`}>{i < cur ? '✓' : `0${i + 1}`} · {t(`lab.${p}`)}</span>)}
        </div>
        <div className="ml-auto flex gap-2">
          <button className="capsule" onClick={restart}>↻ {t('lab.again')}</button>
          <button className="capsule capsule-primary" onClick={onClose}>✕ {t('lab.close')}</button>
        </div>
      </div>

      {tel && (
        <div className="absolute left-5 right-5 bottom-5 flex flex-wrap items-end gap-3">
          <div className="glass p-4 grid grid-cols-5 gap-5 min-w-[min(100%,640px)]">
            {cells.map(([l, v, u]) => (
              <div key={l}>
                <div className="text-[11px] lux-muted uppercase tracking-[.08em]">{l}</div>
                <div className="font-display text-[26px] leading-none text-[var(--lux-hi)] mt-1.5 tabular-nums">{v}<span className="text-[13px] lux-muted ml-1">{u}</span></div>
              </div>
            ))}
          </div>
          <div className="glass px-4 py-3 text-[12px] lux-muted">
            <div>{t('lab.thrust')} <span className="text-[var(--lux-hi)] tabular-nums">{Math.round(tel.thr * 100)}%</span> · {t('lab.pitch')} <span className="text-[var(--lux-hi)] tabular-nums">{tel.pitch.toFixed(1)}°</span> · g = 1.62 m/s²</div>
            <div className="mt-1">{tel.source}</div>
            {note && <div className="mt-1 text-warn">☀ {t('lab.moved', { d: note })}</div>}
          </div>
          {phase === 'LANDED' && tel.vImpact != null && (
            <div className="glass px-5 py-3 ml-auto">
              <div className="text-[11px] lux-muted uppercase tracking-[.08em]">{t('lab.touchdown')}</div>
              <div className={`font-display text-[26px] ${soft === 'hard' ? 'text-nogo' : soft === 'ok' ? 'text-warn' : 'text-go'}`}>{tel.vImpact.toFixed(2)} m/s</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
