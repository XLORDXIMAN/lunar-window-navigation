import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store.js'

// Smoothly animated number (ease-out), used for all telemetry readouts
export function useAnim(target, ms = 600) {
  const safe = Number.isFinite(target) ? target : 0
  const [v, setV] = useState(safe)
  const cur = useRef(safe)
  useEffect(() => {
    const from = cur.current, start = performance.now()
    let raf
    const step = (now) => {
      const k = Math.min(1, (now - start) / ms), e = 1 - Math.pow(1 - k, 3)
      cur.current = from + (safe - from) * e
      setV(cur.current)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [safe, ms])
  return v
}

export function AnimNum({ value, digits = 0, prefix = '', suffix = '', signed = false }) {
  const v = useAnim(value)
  const s = v.toFixed(digits)
  return <>{prefix}{signed && v >= 0 ? '+' : ''}{s}{suffix}</>
}

export const siteName = (s, lang) => (lang === 'ru' && s.nameRu ? s.nameRu : s.name)
export const useSiteName = () => { const lang = useStore((s) => s.lang); return (s) => siteName(s, lang) }
