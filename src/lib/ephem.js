// =====================================================================
//  EPHEMERIS + VISIBILITY LAYER
//  Right now: an analytic MOCK model so the UI works without any data.
//    - Sun: circles the Moon once per synodic month (29.53 d), declination
//      wobbles ±1.54° over a year (lunar axial tilt → polar "seasons").
//    - Earth: sub-Earth point wobbles by libration (±6.7° lat, ±7.9° lon).
//    - Far-side sites therefore never see Earth (physically correct!).
//  LATER: participant 2 drops real JPL Horizons data into /public/data/ephem/
//  and we swap sunPos/earthPos to read from it. The UI only calls the
//  exported functions below, so nothing else needs to change.
// =====================================================================

const DEG = Math.PI / 180
export const HOUR = 3600e3
export const DAY = 24 * HOUR
export const SYNODIC_H = 29.530589 * 24
export const T0 = Date.UTC(2027, 0, 1)
export const SUN_RADIUS = 0.27 // deg, apparent
export const EARTH_MARGIN = 0.5 // deg above terrain needed for a link

const hoursFrom0 = (t) => (t - T0) / HOUR

function altaz(latDeg, decDeg, hDeg) {
  const p = latDeg * DEG, d = decDeg * DEG, h = hDeg * DEG
  const sinEl = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h)
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl))) / DEG
  let az = Math.atan2(
    -Math.sin(h) * Math.cos(d),
    Math.cos(p) * Math.sin(d) - Math.sin(p) * Math.cos(d) * Math.cos(h),
  ) / DEG
  az = (az + 360) % 360
  return { az, el }
}

// Sub-solar / sub-Earth points in selenographic coords (mock model)
export function subSolar(t) {
  const h = hoursFrom0(t)
  return {
    lat: 1.54 * Math.sin((2 * Math.PI * h) / (365.25 * 24)),
    lon: (((180 - (360 * h) / SYNODIC_H) % 360) + 540) % 360 - 180,
  }
}
export function subEarth(t) {
  const h = hoursFrom0(t)
  return {
    lat: 6.7 * Math.sin((2 * Math.PI * h) / (27.212 * 24)),
    lon: 7.9 * Math.sin((2 * Math.PI * h) / (27.555 * 24) + 1.1),
  }
}

export const sunPos = (site, t) => { const s = subSolar(t); return altaz(site.lat, s.lat, site.lon - s.lon) }
export const earthPos = (site, t) => { const e = subEarth(t); return altaz(site.lat, e.lat, site.lon - e.lon) }

// ---------- MOCK terrain horizon (replace with LOLA-derived horizon[360]) ----------
function rng(seedStr) {
  let s = 0
  for (const c of seedStr) s = (s * 31 + c.charCodeAt(0)) | 0
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0
    let x = Math.imul(s ^ (s >>> 15), 1 | s)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}
export function mockHorizon(site) {
  const r = rng(site.id)
  const polar = Math.abs(site.lat) > 80, high = Math.abs(site.lat) > 60
  const amp = { peak: 0.9, rim: 1.4, crater: 3.2, plain: 0.6 }[site.terrain || 'plain'] * (polar ? 1 : high ? 0.7 : 0.35)
  const waves = Array.from({ length: 6 }, (_, i) => ({ k: i + 1 + Math.floor(r() * 3), ph: r() * 6.28, a: r() }))
  const peaks = Array.from({ length: polar ? 4 : 2 }, () => ({ c: r() * 360, w: 6 + r() * 20, a: r() * amp * 1.2 }))
  const out = []
  for (let az = 0; az < 360; az++) {
    let v = 0
    for (const w of waves) v += w.a * Math.sin(w.k * az * DEG + w.ph)
    v = (v / 3 + 1) * 0.5 * amp
    for (const p of peaks) { const d = Math.min(Math.abs(az - p.c), 360 - Math.abs(az - p.c)); v += p.a * Math.exp(-(d * d) / (2 * p.w * p.w)) }
    // Elevated sites see the sphere edge BELOW 0° (horizon dip ≈ sqrt(2h/R)); no atmosphere → no refraction
    const dip = { peak: -2.4, rim: -1.3, crater: 0, plain: -0.15 }[site.terrain || 'plain']
    out.push(+(v + dip).toFixed(3))
  }
  return out
}

export function horizonAt(site, az) {
  const h = site.horizon, i = Math.floor(az) % 360, f = az - Math.floor(az)
  return h[i] * (1 - f) + h[(i + 1) % 360] * f
}

// ---------- Instant state ----------
export function stateAt(site, t) {
  const sun = sunPos(site, t), earth = earthPos(site, t)
  const sunHz = horizonAt(site, sun.az), earthHz = horizonAt(site, earth.az)
  const sunVis = Math.max(0, Math.min(1, (sun.el - sunHz + SUN_RADIUS) / (2 * SUN_RADIUS)))
  const earthVis = earth.el > earthHz + EARTH_MARGIN
  return { sun, earth, sunHz, earthHz, sunVis, earthVis }
}

// Hours until the current condition flips (sunset/sunrise, earthset/earthrise)
export function timeToChange(site, t, which, maxDays = 60) {
  const isOn = (s) => (which === 'sun' ? s.sunVis >= 0.5 : s.earthVis)
  const now = isOn(stateAt(site, t))
  for (let h = 1; h <= maxDays * 24; h++) {
    if (isOn(stateAt(site, t + h * HOUR)) !== now) return { on: now, hours: h }
  }
  return { on: now, hours: null } // no change within window (e.g. far side: never)
}

// ---------- Window metrics (cached) ----------
const cache = new Map()
export function windowMetrics(site, start, days = 14, stepH = 1) {
  const key = `${site.id}|${Math.floor(start / HOUR)}|${days}|${stepH}`
  if (cache.has(key)) return cache.get(key)
  const n = Math.round((days * 24) / stepH)
  const sun = new Float32Array(n), link = new Uint8Array(n), sunEl = new Float32Array(n)
  let sumSun = 0, sumLink = 0, dark = 0, maxDark = 0, nolink = 0, maxNolink = 0, elSum = 0, elN = 0
  for (let i = 0; i < n; i++) {
    const s = stateAt(site, start + i * stepH * HOUR)
    sun[i] = s.sunVis; link[i] = s.earthVis ? 1 : 0; sunEl[i] = s.sun.el
    sumSun += s.sunVis; sumLink += link[i]
    if (s.sunVis < 0.5) { dark += stepH; maxDark = Math.max(maxDark, dark) } else { dark = 0; elSum += s.sun.el; elN++ }
    if (!s.earthVis) { nolink += stepH; maxNolink = Math.max(maxNolink, nolink) } else nolink = 0
  }
  const sunPct = (100 * sumSun) / n, linkPct = (100 * sumLink) / n
  // Power: 10 m² vertical tracking array, 30% eff, 1.361 kW/m² → ~98 kWh/day at full sun
  const powerKwhDay = 1.361 * 10 * 0.3 * 24 * (sumSun / n)
  const m = { sun, link, sunEl, stepH, sunPct, linkPct, longestDarkH: maxDark, longestNoLinkH: maxNolink,
    avgSunEl: elN ? elSum / elN : null, powerKwhDay, batteryKwh: maxDark * 1.0 }
  if (cache.size > 400) cache.clear()
  cache.set(key, m)
  return m
}

// Best 7-day window inside a longer span (for "Jump to best window")
export function bestWindow(site, start, spanDays = 60, winDays = 7) {
  const m = windowMetrics(site, start, spanDays, 6)
  const w = Math.round((winDays * 24) / 6)
  let best = -1, bestI = 0, acc = 0
  const v = (i) => m.sun[i] + m.link[i]
  for (let i = 0; i < m.sun.length; i++) {
    acc += v(i); if (i >= w) acc -= v(i - w)
    if (i >= w - 1 && acc > best) { best = acc; bestI = i - w + 1 }
  }
  const s = start + bestI * 6 * HOUR
  return { start: s, end: s + winDays * DAY, quality: (100 * best) / (2 * w) }
}

// Returns a level + machine-readable reasons; the UI translates them (see lib/i18n.js)
export function verdict(m, site) {
  const r = []
  r.push(m.sunPct >= 70 ? ['r.sun', m.sunPct.toFixed(0)] : ['r.lowSun', m.sunPct.toFixed(0)])
  if (m.linkPct >= 70) r.push(['r.link', m.linkPct.toFixed(0)])
  else if (m.linkPct === 0) r.push(['r.noLink'])
  else r.push(['r.lowLink', m.linkPct.toFixed(0)])
  if (m.longestDarkH > 0) r.push(['r.night', null, m.longestDarkH])
  if (site.slope_deg > 15) r.push(['r.slope', site.slope_deg])
  let level = 'yellow'
  if (m.sunPct >= 70 && m.linkPct >= 70 && m.longestDarkH <= 72 && site.slope_deg <= 15) level = 'green'
  if (m.sunPct < 35 || m.linkPct < 10 || site.slope_deg > 15) level = 'red'
  return { level, reasons: r }
}

export function score(m, site, w) {
  const parts = {
    power: m.sunPct,
    comm: m.linkPct,
    duration: Math.max(0, 100 - (m.longestDarkH / 336) * 100),
    safety: Math.max(0, 100 - (site.slope_deg / 15) * 100),
  }
  const tot = w.power + w.comm + w.duration + w.safety || 1
  return (parts.power * w.power + parts.comm * w.comm + parts.duration * w.duration + parts.safety * w.safety) / tot
}

export function fmtH(h) {
  if (h == null) return '—'
  if (h < 48) return `${Math.round(h)}h`
  const d = Math.floor(h / 24), r = Math.round(h % 24)
  return `${d}d ${String(r).padStart(2, '0')}h`
}
export const fmtDate = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
export const fmtDay = (t) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
