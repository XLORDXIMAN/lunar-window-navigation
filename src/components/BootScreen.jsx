// Intro "mission control boot" sequence — great opening for the live pitch demo
import { useEffect, useState } from 'react'
import { useT } from '../lib/i18n.js'

export default function BootScreen({ onDone }) {
  const t = useT()
  const lines = t('boot')
  const [n, setN] = useState(0)
  const [out, setOut] = useState(false)

  useEffect(() => {
    if (n < lines.length) { const id = setTimeout(() => setN(n + 1), n === 0 ? 500 : 380); return () => clearTimeout(id) }
    const a = setTimeout(() => setOut(true), 600), b = setTimeout(onDone, 1300)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [n, lines.length, onDone])

  return (
    <div onClick={onDone} className="fixed inset-0 z-50 grid place-items-center bg-[#02040a] cursor-pointer transition-opacity duration-700" style={{ opacity: out ? 0 : 1 }}>
      <div className="flex flex-col items-center gap-8">
        <div className="relative w-40 h-40">
          <div className="absolute inset-0 rounded-full border border-cyan-400/30" style={{ animation: 'spin 8s linear infinite' }}>
            <div className="absolute -top-1 left-1/2 w-2 h-2 -ml-1 rounded-full bg-cyan-300 shadow-[0_0_12px_#22d3ee]" />
          </div>
          <div className="absolute inset-5 rounded-full border border-indigo-400/20" style={{ animation: 'spin 5s linear infinite reverse' }}>
            <div className="absolute top-1/2 -right-1 w-1.5 h-1.5 -mt-1 rounded-full bg-amber-300 shadow-[0_0_10px_#fbbf24]" />
          </div>
          <div className="absolute inset-10 rounded-full bg-[radial-gradient(circle_at_35%_35%,#e5e7eb,#6b7280_55%,#111827)] shadow-[0_0_60px_-10px_#22d3ee]" />
        </div>
        <div className="num text-sm flex flex-col gap-1.5 min-w-[340px]">
          {lines.slice(0, n).map((l, i) => (
            <div key={i} className={i === 0 ? 'text-cyan-300 text-lg font-bold tracking-[.25em] text-center mb-3' : i === lines.length - 1 ? 'text-green-400 font-bold mt-2' : 'text-slate-400'}
              style={{ animation: 'typing .45s steps(30) both' }}>
              {i > 0 && i < lines.length - 1 && <span className="text-green-500 mr-2">[ OK ]</span>}{l}
            </div>
          ))}
          {n < lines.length && <span className="blink text-cyan-300">▌</span>}
        </div>
        <div className="label !text-[9px] opacity-60">{t('skip')}</div>
      </div>
    </div>
  )
}
