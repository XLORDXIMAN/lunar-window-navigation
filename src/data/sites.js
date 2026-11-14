// Site catalog. Coordinates are APPROXIMATE placeholders — participant 2 must
// verify against NASA sources (Artemis III regions, CLPS mission pages, Moon Trek).
// `horizon` (360 values, degrees, azimuth 0..359) is generated as MOCK terrain
// in lib/ephem.js unless real data from /public/data/sites.json is provided.

// labels are translated via i18n keys 'cat.<id>'
export const CATEGORIES = {
  // ice / cobalt from the visual system; sand + lilac are muted additions (added for LunarWindow)
  apollo: { color: '#d8eaff' },
  artemis: { color: '#5b8cff' },
  clps: { color: '#c8a96e' },
  intl: { color: '#a58fd6' },
  custom: { color: '#ff7a45' },
}

// terrain: 'peak' | 'rim' | 'crater' | 'plain' — only used to shape MOCK horizons
export const MOCK_SITES = [
  { id: 'apollo11', name: 'Apollo 11 — Tranquility Base', nameRu: 'Apollo 11 — База Спокойствия', category: 'apollo', lat: 0.674, lon: 23.473, slope_deg: 2, terrain: 'plain' },
  { id: 'apollo15', name: 'Apollo 15 — Hadley-Apennine', nameRu: 'Apollo 15 — Хэдли-Апеннины', category: 'apollo', lat: 26.132, lon: 3.634, slope_deg: 4, terrain: 'plain' },
  { id: 'apollo17', name: 'Apollo 17 — Taurus-Littrow', nameRu: 'Apollo 17 — Тавр-Литтров', category: 'apollo', lat: 20.191, lon: 30.772, slope_deg: 4, terrain: 'plain' },

  { id: 'shackleton', name: 'Shackleton Rim', nameRu: 'Край кратера Шеклтон', category: 'artemis', lat: -89.7, lon: 130, slope_deg: 6, terrain: 'rim' },
  { id: 'malapert', name: 'Malapert Massif', nameRu: 'Массив Малаперт', category: 'artemis', lat: -86.0, lon: 0.0, slope_deg: 7, terrain: 'peak' },
  { id: 'haworth', name: 'Haworth', nameRu: 'Кратер Хоуорт', category: 'artemis', lat: -87.4, lon: -5.0, slope_deg: 9, terrain: 'crater' },
  { id: 'mons_mouton', name: 'Mons Mouton Plateau', nameRu: 'Плато Монс-Мутон', category: 'artemis', lat: -84.6, lon: 31.0, slope_deg: 5, terrain: 'peak' },
  { id: 'nobile_rim1', name: 'Nobile Rim 1', nameRu: 'Край Нобиле 1', category: 'artemis', lat: -85.4, lon: 40.0, slope_deg: 8, terrain: 'rim' },
  { id: 'de_gerlache2', name: 'de Gerlache Rim 2', nameRu: 'Край де Жерлаш 2', category: 'artemis', lat: -88.6, lon: -70.0, slope_deg: 8, terrain: 'rim' },

  { id: 'im2', name: 'IM-2 Athena (2025)', nameRu: 'IM-2 Athena (2025)', category: 'clps', lat: -84.8, lon: 29.2, slope_deg: 6, terrain: 'plain' },
  { id: 'blueghost', name: 'Blue Ghost M1 — Mare Crisium (2025)', nameRu: 'Blue Ghost M1 — Море Кризисов (2025)', category: 'clps', lat: 18.56, lon: 61.81, slope_deg: 2, terrain: 'plain' },

  { id: 'chandrayaan3', name: 'Chandrayaan-3 (India)', nameRu: 'Чандраян-3 (Индия)', category: 'intl', lat: -69.37, lon: 32.32, slope_deg: 5, terrain: 'plain' },
  { id: 'slim', name: 'SLIM (Japan)', nameRu: 'SLIM (Япония)', category: 'intl', lat: -13.32, lon: 25.25, slope_deg: 10, terrain: 'plain' },
  { id: 'change4', name: "Chang'e 4 — Far Side (China)", nameRu: 'Чанъэ-4 — обратная сторона (Китай)', category: 'intl', lat: -45.46, lon: 177.6, slope_deg: 4, terrain: 'plain' },
  { id: 'change6', name: "Chang'e 6 — Far Side (China)", nameRu: 'Чанъэ-6 — обратная сторона (Китай)', category: 'intl', lat: -41.64, lon: -153.99, slope_deg: 4, terrain: 'plain' },
]
