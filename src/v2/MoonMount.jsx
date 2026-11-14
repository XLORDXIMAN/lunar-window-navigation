// Lazy mount for the full-screen Moon: the three.js chapter loads when it nears the viewport
// (or shortly after the page settles), with a same-size placeholder so the layout never jumps.
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n.js'
const MoonSection = lazy(() => import('./MoonSection.jsx'))

function Placeholder() {
  const t = useT()
  return (
    <section id="moon" className="relative h-[100svh] min-h-[620px] grid place-items-center bg-black">
      <div className="flex flex-col items-center gap-4">
        <span className="w-10 h-10 rounded-full border-2 border-white/15 border-t-[var(--lux-blue)]" style={{ animation: 'spin 1s linear infinite' }} />
        <span className="text-[14px] lux-muted">{t('moon5.loading')}</span>
      </div>
    </section>
  )
}

export default function MoonMount() {
  const ref = useRef(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect() } }, { rootMargin: '900px 0px' })
    if (ref.current) io.observe(ref.current)
    const idle = setTimeout(() => setOn(true), 2500)
    return () => { io.disconnect(); clearTimeout(idle) }
  }, [])
  return <div ref={ref}>{on ? <Suspense fallback={<Placeholder />}><MoonSection /></Suspense> : <Placeholder />}</div>
}
