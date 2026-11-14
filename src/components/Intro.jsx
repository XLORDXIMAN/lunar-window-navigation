// ~5 s cinematic intro.
// Act 1 (0–2.7 s): lunar horizon rises, lander + Earth in the sky, the MainTech flag
//   drops and is planted — regolith flies in clean parabolas (no air), the flag unfurls
//   and shimmers.
// Act 2 (2.7–5 s): the surface sinks away, Earth's limb rises, the flag becomes the
//   MainTech logo: divider, wordmark, orbit with a travelling star. Fade out.
// Click anywhere to skip. prefers-reduced-motion → static final frame.
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../lib/i18n.js'

const TOTAL = 5.1
const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const seg = (t, a, b) => clamp((t - a) / (b - a))
const out3 = (x) => 1 - Math.pow(1 - x, 3)
const in2 = (x) => x * x
const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const mix = (a, b, k) => a + (b - a) * k

// ---- layout (viewBox 1600×900, content may overflow on wide screens) ----
const FX = 360, FY = 338, FW = 224, FH = 138 // flag
const GROUND = 660
const DIV_X = 640, TEXT_X = 690, TEXT_Y = 446
const ORBIT = { cx: 815, cy: 408, rx: 610, ry: 172, rot: -11 }

// 4-point star path centred at 0,0
const star4 = (r, k = 0.28) => {
  const i = r * k
  return `M0 ${-r} L${i} ${-i} L${r} 0 L${i} ${i} L0 ${r} L${-i} ${i} L${-r} 0 L${-i} ${-i} Z`
}

// Waving flag: N vertical strips, each shaded by the wave phase + a moving sheen
function Flag({ t, unfurl, ripple }) {
  const S = 30
  const P = (u, v) => {
    const ph = 2 * Math.PI * u * 1.15 - t * 3.0
    const amp = ripple * Math.pow(u, 0.85)
    const y = FY + v * FH * (1 - 0.14 * u) - 26 * u + amp * Math.sin(ph) + 0.5 * v * amp * Math.sin(ph + 0.6)
    const x = FX + u * FW * unfurl - Math.abs(amp) * 0.05 * Math.cos(ph) * u
    return [x, y, ph]
  }
  const sheen = ((t * 0.42) % 1.9) - 0.45
  const strips = []
  for (let i = 0; i < S; i++) {
    const u0 = i / S, u1 = (i + 1) / S
    const a = P(u0, 0), b = P(u1, 0), c = P(u1, 1), d = P(u0, 1)
    const um = (u0 + u1) / 2
    let s = 0.78 + 0.18 * Math.cos(2 * Math.PI * um * 1.15 - t * 3.0 + 0.9) * (ripple / 14)
    s += 0.32 * Math.exp(-Math.pow((um - sheen) / 0.09, 2))
    s = Math.min(1.08, s)
    const r = Math.round(mix(118, 246, clamp(s))), g = Math.round(mix(132, 249, clamp(s))), bl = Math.round(mix(156, 255, clamp(s)))
    const fill = `rgb(${r},${g},${bl})`
    strips.push(<polygon key={i} points={`${a[0]},${a[1]} ${b[0]},${b[1]} ${c[0]},${c[1]} ${d[0]},${d[1]}`} fill={fill} stroke={fill} strokeWidth="0.7" />)
  }
  const [sx, sy] = P(0.5, 0.5)
  const [x2, y2] = P(0.56, 0.5)
  const ang = (Math.atan2(y2 - sy, x2 - sx) * 180) / Math.PI
  return (
    <g>
      {strips}
      <g transform={`translate(${sx},${sy}) rotate(${ang}) scale(${0.35 + 0.65 * unfurl},1)`} opacity={clamp(unfurl * 1.6 - 0.4)}>
        <path d={star4(25)} fill="#0b0f18" />
      </g>
    </g>
  )
}

const Stars = memo(function Stars() {
  const stars = useMemo(() => Array.from({ length: 240 }, (_, i) => {
    const r1 = Math.sin(i * 12.9898) * 43758.5453, r2 = Math.sin(i * 78.233) * 12345.6789, r3 = Math.sin(i * 39.425) * 9876.54
    const fr = (x) => x - Math.floor(x)
    return { x: -700 + fr(r1) * 3000, y: -300 + fr(r2) * 1100, r: fr(r3) < 0.08 ? 1.6 : 0.5 + fr(r3) * 0.8, d: 1.5 + fr(r1 * 3) * 3, o: 0.25 + fr(r2 * 7) * 0.65 }
  }), [])
  return (
    <g>
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={i % 11 === 0 ? '#8aaaff' : '#d8eaff'} opacity={s.o}
          style={{ animation: `blink ${s.d}s ease-in-out ${-s.d * (i % 7) / 7}s infinite` }} />
      ))}
    </g>
  )
})

function Dust({ t }) {
  const parts = useMemo(() => Array.from({ length: 34 }, (_, i) => {
    const a = (-90 + (i % 2 ? 1 : -1) * (12 + ((i * 37) % 62))) * (Math.PI / 180)
    const v = 170 + ((i * 53) % 230)
    return { vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1 + (i % 3) * 0.7 }
  }), [])
  const dt = t - 1.62
  if (dt < 0 || dt > 1.6) return null
  const g = 520 // px/s² — clean ballistic arcs: no air on the Moon
  return (
    <g>
      {parts.map((p, i) => {
        const x = FX - 2 + p.vx * dt, y = GROUND + p.vy * dt + 0.5 * g * dt * dt
        if (y > GROUND + 2) return null
        return <circle key={i} cx={x} cy={y} r={p.r} fill="#c9d3df" opacity={0.85 * (1 - dt / 1.6)} />
      })}
      <ellipse cx={FX - 2} cy={GROUND + 2} rx={20 + dt * 90} ry={3 + dt * 8} fill="none" stroke="#d8eaff" strokeOpacity={0.35 * (1 - dt / 0.8)} />
    </g>
  )
}

function Lander() {
  const edge = { stroke: '#d8eaff', strokeOpacity: 0.32, strokeWidth: 1 }
  return (
    <g>
      <path d="M1112 600 L1060 652 M1238 600 L1290 652 M1140 604 L1122 652 M1210 604 L1228 652" stroke="#6c757f" strokeWidth="3" />
      <path d="M1046 652 h30 M1276 652 h30 M1110 652 h24 M1216 652 h24" stroke="#8a99ab" strokeWidth="3" strokeLinecap="round" />
      <rect x="1095" y="478" width="160" height="128" rx="10" fill="url(#landerBody)" {...edge} />
      <rect x="1083" y="468" width="184" height="12" rx="6" fill="#2b2f33" {...edge} />
      <rect x="1118" y="398" width="114" height="72" rx="30" fill="url(#landerBody)" {...edge} />
      <path d="M1192 418 h14 l-3 10 h-11 Z M1210 418 h12 l-2 10 h-10 Z" fill="#0b0f18" />
      <line x1="1176" y1="398" x2="1176" y2="350" stroke="#8a99ab" strokeWidth="1.5" />
      <path d="M1146 330 a30 14 0 0 0 60 0 Z" fill="#b8c6d9" opacity=".75" transform="rotate(-14 1176 336)" />
      <path d="M1100 500 v100" stroke="#d8eaff" strokeOpacity=".22" strokeWidth="6" />
    </g>
  )
}

export default function Intro({ onDone }) {
  const t_ = useT()
  const [t, setT] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const doneRef = useRef(false)
  const finish = () => { if (!doneRef.current) { doneRef.current = true; onDone() } }

  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const freeze = new URLSearchParams(location.search).get('introT') // debug: ?introT=2.0 freezes a frame
    if (freeze != null) { setT(+freeze); return }
    if (reduce) { setT(4.2); const id = setTimeout(finish, 1600); return () => clearTimeout(id) }
    let raf; const t0 = performance.now()
    const tick = (now) => {
      const s = (now - t0) / 1000
      setT(s)
      if (s >= TOTAL) finish(); else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    // safety net: never hang on the intro (e.g. rAF paused in a background tab)
    const guard = setTimeout(finish, (TOTAL + 0.2) * 1000)
    return () => { cancelAnimationFrame(raf); clearTimeout(guard) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const skip = () => { setLeaving(true); setTimeout(finish, 350) }

  // ---- timeline ----
  const starsIn = out3(seg(t, 0, 0.8))
  const groundIn = out3(seg(t, 0.15, 1.2))
  const earthIn = out3(seg(t, 0.4, 1.5))
  const landerIn = out3(seg(t, 0.7, 1.4))
  const drop = in2(seg(t, 1.12, 1.62)) // flag falls, accelerating
  const unfurl = 0.06 + 0.94 * out3(seg(t, 1.66, 2.5))
  const ripple = t < 1.62 ? 3 : 4 + 12 * Math.exp(-(t - 1.62) * 1.6)
  const shake = t > 1.62 && t < 1.95 ? (1 - (t - 1.62) / 0.33) * 5 : 0
  const act2 = inOut(seg(t, 2.65, 3.55))
  const divider = out3(seg(t, 2.85, 3.25))
  const orbit = inOut(seg(t, 3.0, 4.1))
  const tag = out3(seg(t, 3.55, 4.0))
  const fade = leaving ? 0 : 1 - seg(t, 4.55, TOTAL)

  const flagY = mix(-720, 0, drop)
  const poleBottom = mix(GROUND, FY + FH + 46, act2)
  const word = 'MainTech'

  // sparkle travelling along the orbit ellipse
  const oa = mix(-2.6, -0.62, orbit) // radians, parametric
  const rr = (ORBIT.rot * Math.PI) / 180
  const ox0 = ORBIT.rx * Math.cos(oa), oy0 = ORBIT.ry * Math.sin(oa)
  const spx = ORBIT.cx + ox0 * Math.cos(rr) - oy0 * Math.sin(rr)
  const spy = ORBIT.cy + ox0 * Math.sin(rr) + oy0 * Math.cos(rr)

  return (
    <div onClick={skip} className="fixed inset-0 z-50 bg-black cursor-pointer overflow-hidden"
      style={{ opacity: fade, transition: leaving ? 'opacity .35s ease' : 'none' }} role="presentation">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id="limb" cx="50%" cy="50%" r="50%">
            <stop offset="0.9" stopColor="#05070c" /><stop offset="0.985" stopColor="#0d1a33" /><stop offset="1" stopColor="#3f73ff" />
          </radialGradient>
          <filter id="blur18" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18" /></filter>
          <filter id="blur4"><feGaussianBlur stdDeviation="4" /></filter>
          <linearGradient id="groundG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a3f46" /><stop offset=".12" stopColor="#23262b" /><stop offset="1" stopColor="#050607" />
          </linearGradient>
          <linearGradient id="landerBody" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8a929c" /><stop offset=".45" stopColor="#4a5059" /><stop offset="1" stopColor="#1c1f24" />
          </linearGradient>
          <radialGradient id="earthSmall" cx="35%" cy="35%">
            <stop offset="0" stopColor="#b9ccff" /><stop offset=".5" stopColor="#1f58f2" /><stop offset="1" stopColor="#0b1a4a" />
          </radialGradient>
          <linearGradient id="moonRim" x1="0" y1="0" x2="1" y2="1">
            <stop offset=".55" stopColor="#5b8cff" stopOpacity="0" /><stop offset="1" stopColor="#5b8cff" stopOpacity=".55" />
          </linearGradient>
          <linearGradient id="wordTech" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#4f7ff0" /><stop offset="1" stopColor="#6f9bff" />
          </linearGradient>
        </defs>

        <g opacity={starsIn}><Stars /></g>

        {/* Act 2 backdrop: Moon crescent (top-left) + Earth limb (bottom-right) */}
        <g opacity={act2}>
          <g transform={`translate(${mix(-60, 0, act2)},${mix(-60, 0, act2)})`}>
            <circle cx="120" cy="40" r="300" fill="#06080c" />
            <circle cx="120" cy="40" r="300" fill="none" stroke="url(#moonRim)" strokeWidth="2" />
          </g>
          <g transform={`translate(0,${mix(320, 0, act2)})`}>
            <circle cx="1560" cy="2020" r="1420" fill="#3f73ff" opacity=".55" filter="url(#blur18)" />
            <circle cx="1560" cy="2020" r="1420" fill="url(#limb)" />
            <circle cx="1560" cy="2020" r="1419" fill="none" stroke="#a9c2ff" strokeOpacity=".8" strokeWidth="1.5" />
            {[[860, 820], [905, 800], [990, 835], [1120, 790], [1180, 812], [1300, 770]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i % 2 ? 1.6 : 2.4} fill="#ffcf8a" opacity=".85" filter="url(#blur4)" />
            ))}
          </g>
        </g>

        {/* Act 1 surface */}
        <g transform={`translate(${shake * Math.sin(t * 90)},${mix(260, 0, groundIn) + 300 * act2})`} opacity={(1 - act2) * groundIn}>
          <g opacity={earthIn} transform={`translate(0,${mix(40, 0, earthIn)})`}>
            <circle cx="1380" cy="236" r="58" fill="#1f58f2" opacity=".25" filter="url(#blur18)" />
            <circle cx="1380" cy="236" r="40" fill="url(#earthSmall)" />
            <path d="M1352 226 q10 -12 22 -4 q8 6 18 0 q6 8 -4 14 q-14 2 -20 10 q-12 -6 -16 -20 Z" fill="#e8f0ff" opacity=".35" />
          </g>
          <g opacity={landerIn}><Lander /></g>
          <path d={`M-900 ${GROUND + 6} L-200 ${GROUND - 4} C 100 ${GROUND - 26}, 300 ${GROUND - 2}, 520 ${GROUND - 8} S 900 ${GROUND - 30}, 1200 ${GROUND - 10} S 1700 ${GROUND - 34}, 2500 ${GROUND - 6} L2500 1400 L-900 1400 Z`}
            fill="url(#groundG)" stroke="#d8eaff" strokeOpacity=".35" strokeWidth="1" />
          <ellipse cx="760" cy={GROUND + 70} rx="120" ry="14" fill="#000" opacity=".45" />
          <ellipse cx="260" cy={GROUND + 120} rx="180" ry="20" fill="#000" opacity=".4" />
          <ellipse cx="1340" cy={GROUND + 150} rx="160" ry="18" fill="#000" opacity=".4" />
          <Dust t={t} />
        </g>

        {/* Orbit + travelling star */}
        <g opacity={orbit > 0 ? 1 : 0}>
          <ellipse cx={ORBIT.cx} cy={ORBIT.cy} rx={ORBIT.rx} ry={ORBIT.ry} transform={`rotate(${ORBIT.rot} ${ORBIT.cx} ${ORBIT.cy})`}
            fill="none" stroke="#b9ccff" strokeOpacity=".55" strokeWidth="1" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - orbit} />
          <g transform={`translate(${spx},${spy}) scale(${0.7 + 0.3 * Math.sin(t * 6)})`}>
            <circle r="16" fill="#8aaaff" opacity=".35" filter="url(#blur4)" />
            <path d={star4(15, 0.12)} fill="#ffffff" />
          </g>
        </g>

        {/* Flag + pole — the hero of both acts */}
        <g transform={`translate(${shake * Math.sin(t * 90)},${flagY})`}>
          <line x1={FX - 3} y1={FY - 16} x2={FX - 3 - 34 * act2 * 0} y2={poleBottom} stroke="#e8eef8" strokeWidth="4" strokeLinecap="round" />
          <circle cx={FX - 3} cy={FY - 18} r="4.5" fill="#e8eef8" />
          <Flag t={t} unfurl={unfurl} ripple={mix(ripple, 5, act2)} />
        </g>

        {/* Logo: divider + wordmark */}
        <line x1={DIV_X} x2={DIV_X} y1={mix(410, 330, divider)} y2={mix(410, 490, divider)} stroke="#d8eaff" strokeOpacity=".8" strokeWidth="2" />
        <text x={TEXT_X} y={TEXT_Y} fontFamily="Unbounded, 'Inter Tight', sans-serif" fontWeight="300" fontSize="104" letterSpacing="-1">
          {word.split('').map((ch, i) => {
            const k = out3(seg(t, 2.95 + i * 0.065, 3.4 + i * 0.065))
            return <tspan key={i} fill={i < 4 ? '#eef3fb' : 'url(#wordTech)'} opacity={k}>{ch}</tspan>
          })}
        </text>
        <text x={ORBIT.cx} y="590" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize="15" letterSpacing="5" fill="#8a99ab" opacity={tag}>
          {t_('intro.tag')}
        </text>
      </svg>
      <div className="absolute bottom-6 inset-x-0 text-center label !text-[9px] opacity-60">{t_('skip')}</div>
    </div>
  )
}
