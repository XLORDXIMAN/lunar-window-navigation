// Animated pixel-art icons (SVG rects), drawn procedurally so they stay crisp at any size.
import { useEffect, useState } from 'react'

function useTick(ms) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setN((x) => x + 1), ms); return () => clearInterval(id)
  }, [ms])
  return n
}
const hash = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s) }

function grid(size, fn) {
  const out = []
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const c = fn(x, y); if (c) out.push(<rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={c} />) }
  return out
}

const ICONS = {
  sun: (n) => grid(16, (x, y) => {
    const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy)
    if (d < 4.2) return d < 2.2 ? '#fff4c2' : d < 3.3 ? '#ffd23f' : '#ffb020'
    const a = Math.atan2(dy, dx), k = Math.round(a / (Math.PI / 4))
    const onRay = Math.abs(a - k * Math.PI / 4) < 0.16 && d > 5.2 && d < (n % 2 ? 7.6 : 6.6)
    return onRay ? (k % 2 ? '#ff7a1a' : '#ffd23f') : null
  }),
  earth: (n) => grid(16, (x, y) => {
    const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy)
    if (d > 6.6) return d < 7.4 ? 'rgba(71,200,255,.35)' : null
    const u = (x + n) % 24, land = hash(Math.floor(u / 3), Math.floor(y / 3)) > 0.55
    const cloud = hash(Math.floor((x + n * 2) / 2), Math.floor(y / 2) + 9) > 0.86
    const shade = dx > 2.5 ? 0.55 : 1
    if (cloud) return `rgba(255,255,255,${0.9 * shade})`
    return land ? (shade < 1 ? '#2a6b3a' : '#58c26a') : (shade < 1 ? '#1d3f9a' : '#3d7bff')
  }),
  terrain: (n) => grid(16, (x, y) => {
    const peak1 = 14 - Math.max(0, 7 - Math.abs(x - 5) * 1.3), peak2 = 14 - Math.max(0, 5 - Math.abs(x - 11) * 1.1)
    const top = Math.min(peak1, peak2)
    const sunX = 1 + (n % 15)
    if (y === 2 && x === sunX) return '#ffd23f'
    if (y < top) return null
    if (y < top + 1.2 && y < 9) return '#eaf2ff'
    const lit = x < sunX ? 0.55 : 1
    return y > 13 ? '#2b2f45' : lit < 1 ? '#3a4061' : '#6b7299'
  }),
  time: (n) => grid(16, (x, y) => {
    const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy)
    if (d > 7.2) return null
    if (d > 6.1) return '#eaf2ff'
    const a = (n % 12) * Math.PI / 6 - Math.PI / 2
    for (let r = 0; r < 5; r += 0.5) if (Math.round(7.5 + Math.cos(a) * r) === x && Math.round(7.5 + Math.sin(a) * r) === y) return '#ffd23f'
    for (let r = 0; r < 3.5; r += 0.5) if (x === 7 + Math.round(r * 0) && Math.round(7.5 - r) === y) return '#47c8ff'
    return (dx > 0 ? d < 5.8 : false) && hash(x, y) > 0.92 ? 'rgba(234,242,255,.25)' : null
  }),
  // astronaut helmet; visor colour picked by variant
  astro: (n, v = 0) => grid(16, (x, y) => {
    const visor = ['#47c8ff', '#ffd23f', '#8b5cff'][v % 3]
    const dx = x - 7.5, dy = y - 6.5, d = Math.hypot(dx, dy * 1.05)
    if (y >= 12 && y <= 15 && x >= 2 && x <= 13) return y === 12 ? '#c9d1ee' : x === 7 || x === 8 ? (n % 2 ? '#ff4d6d' : '#7cff6b') : '#eaf2ff' // suit + chest light
    if (d > 6.2) return null
    if (d > 5.1) return '#eaf2ff'
    if (Math.abs(dx) < 4.2 && dy > -3.2 && dy < 2.4) return (x === 5 && y === 4) || (x === 6 && y === 4) ? '#ffffff' : visor
    return '#c9d1ee'
  }),
  data: (n) => grid(16, (x, y) => {
    const bars = [5, 9, 7, 12, 10, 14]
    const i = Math.floor((x - 1) / 2.5)
    if (x < 1 || x > 15 || (x - 1) % 2.5 > 1.6 || i > 5) return null
    const hgt = Math.max(2, bars[(i + n) % 6])
    return y >= 15 - hgt ? (y === 15 - hgt ? '#ffd23f' : i % 2 ? '#3d7bff' : '#47c8ff') : null
  }),
  moon: () => grid(16, (x, y) => {
    const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy)
    if (d > 7) return null
    const crater = hash(Math.floor(x / 2), Math.floor(y / 2)) > 0.78
    const night = dx + dy * 0.2 > 2.6
    return night ? (crater ? '#1a1d33' : '#262a45') : crater ? '#9aa3c7' : '#d9def5'
  }),
}

export default function PixelIcon({ name, size = 64, speed = 450, variant = 0, className = '' }) {
  const n = useTick(speed)
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} shapeRendering="crispEdges" aria-hidden="true">
      {ICONS[name](n, variant)}
    </svg>
  )
}
