import { GHOST_HZ, STORAGE_KEY } from './config.js';

const STRIDE = 5;   // t, x, z, heading, lap progress

// Records the current lap at a fixed rate and replays the best one. Samples are
// a flat number array so they round-trip through localStorage cheaply.
export class GhostRecorder {
  constructor() { this.reset(); }

  reset() {
    this.data = [];
    this.acc = 1 / GHOST_HZ;   // force a sample on the first frame
  }

  sample(dt, t, car) {
    this.acc += dt;
    if (this.acc < 1 / GHOST_HZ) return;
    this.acc = 0;
    this.data.push(
      round(t, 3), round(car.pos.x, 2), round(car.pos.z, 2),
      round(car.heading, 4), round(car.lapU ?? 0, 5),
    );
  }

  finish(t, car) {
    this.data.push(
      round(t, 3), round(car.pos.x, 2), round(car.pos.z, 2),
      round(car.heading, 4), 1,
    );
    return this.data;
  }
}

export class GhostPlayer {
  constructor(data) {
    this.data = data || null;
    this.i = 0;
  }

  get frames() { return this.data ? this.data.length / STRIDE : 0; }
  get duration() { return this.frames ? this.data[(this.frames - 1) * STRIDE] : 0; }

  rewind() { this.i = 0; }

  // Position/heading at lap time `t`, or null when there is no ghost yet.
  at(t) {
    const n = this.frames;
    if (!n) return null;
    while (this.i < n - 2 && this.data[(this.i + 1) * STRIDE] < t) this.i++;
    while (this.i > 0 && this.data[this.i * STRIDE] > t) this.i--;

    const a = this.i * STRIDE;
    const b = Math.min(this.i + 1, n - 1) * STRIDE;
    const t0 = this.data[a], t1 = this.data[b];
    const k = t1 > t0 ? Math.min(1, (t - t0) / (t1 - t0)) : 0;

    return {
      x: lerp(this.data[a + 1], this.data[b + 1], k),
      z: lerp(this.data[a + 2], this.data[b + 2], k),
      heading: lerpAngle(this.data[a + 3], this.data[b + 3], k),
      done: t > this.duration,
    };
  }

  // When did the ghost reach this point of the lap? Drives the live delta.
  timeAtProgress(u) {
    const n = this.frames;
    if (!n) return null;
    let lo = 0, hi = n - 1;
    if (u <= this.data[4]) return this.data[0];
    if (u >= this.data[(n - 1) * STRIDE + 4]) return this.data[(n - 1) * STRIDE];
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.data[mid * STRIDE + 4] <= u) lo = mid; else hi = mid;
    }
    const u0 = this.data[lo * STRIDE + 4], u1 = this.data[hi * STRIDE + 4];
    const k = u1 > u0 ? (u - u0) / (u1 - u0) : 0;
    return lerp(this.data[lo * STRIDE], this.data[hi * STRIDE], k);
  }
}

export function loadBest() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.time !== 'number' || !Array.isArray(parsed.ghost)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveBest(time, ghost) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ time, ghost }));
  } catch {
    /* private mode / quota: the run still counts, it just will not persist */
  }
}

export function clearBest() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

const round = (v, d) => Number(v.toFixed(d));
const lerp = (a, b, k) => a + (b - a) * k;

function lerpAngle(a, b, k) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
