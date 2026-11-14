// Tiny scroll-motion engine. Every element with [data-sfx] gets a smoothed CSS variable --p:
// 0 when its top enters from the bottom of the viewport, 1 when its bottom leaves at the top.
// CSS presets in index.css turn --p into parallax, tilt, scale and fade. One rAF loop, lerped
// values (buttery even with wheel steps), paused for prefers-reduced-motion.
import { useEffect } from 'react'

export function useScrollFX() {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const cur = new WeakMap()
    let raf = 0, lastY = -1, still = 0
    const bar = document.getElementById('sfx-progress')
    let barP = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (scrollY === lastY) { if (++still > 90) return } else { still = 0; lastY = scrollY } // sleep ~1.5 s after scrolling stops
      const vh = innerHeight
      for (const el of document.querySelectorAll('[data-sfx]')) {
        const r = el.getBoundingClientRect()
        if (r.bottom < -vh || r.top > vh * 2) continue
        const target = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)))
        const prev = cur.get(el) ?? target
        const next = prev + (target - prev) * 0.12
        if (Math.abs(next - prev) > 0.0004 || !el.style.getPropertyValue('--p')) { el.style.setProperty('--p', next.toFixed(4)); cur.set(el, next) }
      }
      const doc = document.documentElement
      const tp = doc.scrollHeight > vh ? scrollY / (doc.scrollHeight - vh) : 0
      barP += (tp - barP) * 0.15
      if (bar) bar.style.transform = `scaleX(${barP.toFixed(4)})`
    }
    raf = requestAnimationFrame(tick)
    // cursor light on glass panels
    const onMove = (e) => {
      const el = e.target.closest?.('.glass, .lux-glass')
      if (!el) return
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${e.clientX - r.left}px`); el.style.setProperty('--my', `${e.clientY - r.top}px`)
    }
    addEventListener('pointermove', onMove, { passive: true })
    return () => { cancelAnimationFrame(raf); removeEventListener('pointermove', onMove) }
  }, [])
}
