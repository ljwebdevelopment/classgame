// Quality tiers and persisted preferences. Everything that costs frames is
// keyed off a tier so a weak machine can still hold 60fps.
const KEY = 'apex-drift.settings.v1';

export const TIERS = {
  high: {
    label: 'high',
    shadows: true,
    shadowMap: 2048,
    pixelRatio: 2,
    trees: 300,
    rocks: 90,
    puffs: 260,
    sparks: 120,
    skids: 600,
    banners: true,
    fence: true,
    clouds: 14,
  },
  low: {
    label: 'low',
    shadows: false,
    shadowMap: 1024,
    pixelRatio: 1,
    trees: 120,
    rocks: 40,
    puffs: 90,
    sparks: 40,
    skids: 220,
    banners: true,
    fence: false,
    clouds: 6,
  },
};

const DEFAULTS = { quality: null, muted: false };

export function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function save(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* private mode: the session still works, it just will not persist */
  }
}

// First run has no stored preference, so guess from what the device reports
// and let the frame-rate watcher correct it later.
export function guessQuality() {
  const cores = navigator.hardwareConcurrency || 4;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const smallScreen = Math.min(innerWidth, innerHeight) < 500;
  if (coarse && smallScreen) return 'low';
  return cores >= 4 ? 'high' : 'low';
}

export function tier(name) { return TIERS[name] ?? TIERS.high; }

export const reducedMotion = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches;
