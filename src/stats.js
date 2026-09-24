// Everything persistent: per-circuit best laps and ghosts, career totals, and
// the rival board. Rivals are generated in-game, not real players - the UI
// says so, and the times are derived from each circuit's own length so a hard
// track reads as a hard track.
const KEY = 'apex-drift.save.v3';

const EMPTY = {
  tracks: {},       // id -> { best, ghost, raceBest }
  career: { races: 0, wins: 0, podiums: 0, laps: 0, distance: 0, topSpeed: 0 },
};

let save = read();

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      tracks: raw.tracks ?? {},
      career: { ...EMPTY.career, ...(raw.career ?? {}) },
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

function flush() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode: the run still counts for this session */
  }
}

export function trackRecord(id) {
  return save.tracks[id] ?? { best: null, ghost: null, raceBest: null };
}

export function recordLap(id, time, ghost) {
  const rec = trackRecord(id);
  save.tracks[id] = { ...rec, best: time, ghost };
  flush();
}

export function career() { return { ...save.career }; }

export function addLap(distance, topSpeed) {
  save.career.laps++;
  save.career.distance += distance;
  save.career.topSpeed = Math.max(save.career.topSpeed, topSpeed);
  flush();
}

export function addRace(position) {
  save.career.races++;
  if (position === 1) save.career.wins++;
  if (position <= 3) save.career.podiums++;
  flush();
}

export function clearTrack(id) {
  delete save.tracks[id];
  flush();
}

export function clearAll() {
  save = structuredClone(EMPTY);
  flush();
}

// ------------------------------------------------------------- rival board

const RIVAL_NAMES = [
  'V. Kasten', 'R. Okonkwo', 'M. Delacroix', 'T. Halvorsen', 'S. Nakamura',
  'A. Petrov', 'J. Marchetti', 'L. Ferreira', 'D. Brannigan', 'N. Aldridge',
  'C. Vandermeer', 'E. Solberg', 'B. Whitlock', 'K. Rasmussen', 'P. Oyelaran',
];

function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// A par lap for a circuit, from its measured length. Roughly what a clean,
// unhurried lap comes out at, which anchors every generated time to it.
export function parLap(track) { return track.length / 17.2; }

export function rivalBoard(track, def) {
  const rand = seeded(def.id);
  const par = parLap(track);
  const names = [...RIVAL_NAMES];
  const rows = [];
  for (let i = 0; i < 10; i++) {
    const pick = Math.floor(rand() * names.length);
    const name = names.splice(pick, 1)[0];
    // fastest sits a little under par, the tail drifts out behind it
    const spread = 0.9 + (i / 9) * 0.22 + (rand() - 0.5) * 0.02;
    rows.push({ name, time: par * spread });
  }
  return rows.sort((a, b) => a.time - b.time);
}

// Slot the player's best into the generated board and report where it landed.
export function standingWith(board, best) {
  if (best == null) return { rows: board.map((r, i) => ({ ...r, pos: i + 1 })), rank: null };
  const rows = [...board, { name: 'YOU', time: best, you: true }]
    .sort((a, b) => a.time - b.time)
    .map((r, i) => ({ ...r, pos: i + 1 }));
  return { rows, rank: rows.find((r) => r.you).pos };
}
