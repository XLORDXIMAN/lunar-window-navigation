import { create } from 'zustand'
import { MOCK_SITES } from './data/sites.js'
import { mockHorizon, setEphemeris, T0, DAY } from './lib/ephem.js'

// Try real data from participant 2 (/public/data/sites.json); fall back to mocks.
export async function loadSites() {
  try {
    const [rs, re] = await Promise.all([fetch('/data/sites.json'), fetch('/data/ephem.json')])
    if (rs.ok && re.ok) {
      const [real, eph] = await Promise.all([rs.json(), re.json()])
      setEphemeris(eph)
      return {
        sites: real.map((s) => ({ ...s, horizonMock: !(s.horizon?.length === 360), horizon: s.horizon?.length === 360 ? s.horizon : mockHorizon(s) })),
        mock: false,
      }
    }
  } catch { /* no real data yet — keep the analytic demo model */ }
  return { sites: MOCK_SITES.map((s) => ({ ...s, horizon: mockHorizon(s) })), mock: true }
}

export const useStore = create((set, get) => ({
  sites: [],
  mockData: true,
  selectedId: 'malapert',
  compareIds: ['malapert', 'mons_mouton', 'haworth', 'change4'],
  time: T0 + 10 * DAY,
  rangeStart: T0,
  rangeDays: 365,
  playing: false,
  speedH: 2, // simulated hours per tick
  scenarioB: null, // { siteId, time }
  weights: { power: 3, comm: 3, duration: 2, safety: 2 },
  kids: false,
  catFilter: 'all',
  lang: 'ru',

  setSites: (sites, mockData) => set((s) => {
    // keep the selection valid when the catalog ids change (mock → real data)
    const has = (id) => sites.some((x) => x.id === id)
    const pick = (...ids) => ids.find(has) ?? sites[0]?.id
    const selectedId = has(s.selectedId) ? s.selectedId : pick('artemis-malapert-massif', 'malapert')
    let compareIds = s.compareIds.filter(has)
    if (compareIds.length === 0) compareIds = ['artemis-malapert-massif', 'artemis-mons-mouton', 'artemis-de-gerlache-rim-2', 'cnsa-change-4'].filter(has)
    return { sites, mockData, selectedId, compareIds }
  }),
  select: (id) => set({ selectedId: id }),
  toggleCompare: (id) => set((s) => ({ compareIds: s.compareIds.includes(id) ? s.compareIds.filter((x) => x !== id) : [...s.compareIds, id].slice(-6) })),
  setTime: (t) => set({ time: Math.max(get().rangeStart, Math.min(get().rangeStart + get().rangeDays * DAY, t)) }),
  shiftTime: (dt) => get().setTime(get().time + dt),
  setPlaying: (p) => set({ playing: p }),
  setSpeed: (h) => set({ speedH: h }),
  setScenarioB: (b) => set({ scenarioB: b }),
  setWeight: (k, v) => set((s) => ({ weights: { ...s.weights, [k]: v } })),
  setKids: (k) => set({ kids: k }),
  setLang: (l) => set({ lang: l }),
  setCatFilter: (c) => set({ catFilter: c }),
  addCustomSite: (lat, lon) => {
    const id = `custom_${lat.toFixed(2)}_${lon.toFixed(2)}`
    const site = { id, name: `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`, category: 'custom', lat, lon, slope_deg: 5, terrain: Math.abs(lat) > 80 ? 'rim' : 'plain' }
    site.horizon = mockHorizon(site)
    set((s) => ({ sites: [...s.sites.filter((x) => x.id !== id), site], selectedId: id }))
  },
}))

export const useSite = (id) => useStore((s) => s.sites.find((x) => x.id === (id ?? s.selectedId)))
