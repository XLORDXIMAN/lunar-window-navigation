import { useStore } from '../store.js'
import { DAY, HOUR, SYNODIC_H } from '../lib/ephem.js'
import { useT, useFmt } from '../lib/i18n.js'

export default function Timeline() {
  const t = useT(), f = useFmt()
  const { time, rangeStart, rangeDays, playing, speedH, setTime, setPlaying, setSpeed } = useStore()
  const end = rangeStart + rangeDays * DAY
  const pct = ((time - rangeStart) / (end - rangeStart)) * 100
  const lunarDays = Math.floor(rangeDays / (SYNODIC_H / 24))

  return (
    <section className="panel px-4 py-3 flex flex-wrap items-center gap-4">
      <button onClick={() => setPlaying(!playing)}
        className={`relative w-11 h-11 rounded-full grid place-items-center text-lg border border-signal text-signal transition-colors ${playing ? 'bg-signal/15' : 'hover:bg-signal/10'}`}>
        {playing && <span className="absolute inset-0 rounded-full border border-signal/70" style={{ animation: 'spin 2s linear infinite', borderTopColor: 'transparent' }} />}
        {playing ? '⏸' : '▶'}
      </button>
      <div className="flex gap-1">
        {[[1, 'h1'], [6, 'h6'], [24, 'd1']].map(([h, k]) => (
          <button key={h} className={`btn !text-[10px] ${speedH === h ? 'btn-on' : ''}`} onClick={() => setSpeed(h)}>{t(k)}{t('perTick')}</button>
        ))}
      </div>
      <span className="num text-xs text-slate-400">{f.day(rangeStart)}</span>
      <div className="relative flex-1 min-w-[220px]">
        {/* lunar-day ticks */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-4 pointer-events-none">
          {Array.from({ length: lunarDays + 1 }, (_, i) => (
            <span key={i} className="absolute top-0 h-4 w-px bg-white/15" style={{ left: `${((i * SYNODIC_H * HOUR) / (end - rangeStart)) * 100}%` }} />
          ))}
          <span className="absolute -top-2 h-8 w-px bg-cobalt-lt" style={{ left: `${pct}%` }} />
        </div>
        <input type="range" className="w-full relative" min={rangeStart} max={end} step={HOUR} value={time} onChange={(e) => setTime(+e.target.value)} />
      </div>
      <span className="num text-xs text-slate-400">{f.day(end)}</span>
      <span className="num text-cobalt-lt text-[13px] w-[175px] text-right">{f.dt(time)}</span>
      <span className="hidden 2xl:inline label !text-[9px]">space ▶ · ← → ±1d</span>
    </section>
  )
}
