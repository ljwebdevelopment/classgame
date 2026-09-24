import * as THREE from 'three';

// An opponent driver. It reads the same track the player drives and feeds a
// Car the same input shape the keyboard does, so the AI is subject to exactly
// the same physics - no rubber-banding, no cheating on grip.
export class Driver {
  constructor(car, name, skill, early = 0) {
    this.car = car;
    this.name = name;
    this.skill = skill;            // 0..1, scales pace and tidiness
    this.early = early;            // extra pace early on, which fades
    this.lane = 0;                 // lateral offset from the centreline
    this.baseLane = 0;
    this.targetLane = 0;
    this.input = { steer: 0, throttle: 0, drift: false, stop: false };
    this.lap = 0;
    this.prevU = 0;
    this.progress = 0;
    this.finished = false;
    this.finishTime = null;
    this.wobble = Math.random() * Math.PI * 2;
    this._aim = new THREE.Vector3();
  }

  reset(track, u, lane) {
    this.car.placeAt(track, u);
    // shuffle sideways onto a grid slot
    const f = track.frameAt(u);
    this.car.pos.addScaledVector(f.side, lane);
    this.car.sync();
    this.lane = lane;
    this.baseLane = lane;
    this.targetLane = lane;
    this.lap = 0;
    this.prevU = u;
    this.progress = u - 1;         // behind the line until the first crossing
    this.finished = false;
    this.finishTime = null;
  }

  // How sharply the track turns over the next stretch. The sign says which
  // way, so the line can run wide on entry and tighten to the apex.
  #bend(track, u, span) {
    const a = track.frameAt(u).tangent;
    const b = track.frameAt(u + span).tangent;
    const dot = Math.max(-1, Math.min(1, a.dot(b)));
    const cross = a.x * b.z - a.z * b.x;
    return { angle: Math.acos(dot), dir: cross > 0 ? -1 : 1 };
  }

  // Fastest this driver will take a corner of the given bend. Derived from
  // the radius the bend implies and how much lateral grip they will lean on,
  // rather than a flat percentage off the top speed.
  #cornerSpeed(track, bend, commit) {
    const arc = track.length * BEND_SPAN;
    const radius = arc / Math.max(0.03, bend);
    return Math.sqrt(LATERAL_GRIP * commit * radius);
  }

  // Look far enough down the road to stop for what is coming, and hold the
  // highest speed from which every corner in that window is still makeable.
  // This is what separates a driver who brakes for a corner from one who
  // notices it while already in it.
  #speedLimit(track, u, speed, commit, top) {
    const scan = 18 + speed * 1.7;
    let limit = top;
    for (let i = 1; i <= 5; i++) {
      const dist = (scan * i) / 5;
      const at = u + dist / track.length;
      const corner = this.#cornerSpeed(track, this.#bend(track, at, BEND_SPAN).angle, commit);
      if (corner >= top) continue;
      // v^2 = u^2 + 2ad, solved for the speed we may still be carrying now
      limit = Math.min(limit, Math.sqrt(corner * corner + 2 * BRAKE_DECEL * dist));
    }
    return limit;
  }

  update(dt, track, cars, time, raceFraction = 0) {
    const car = this.car;
    const loc = track.locate(car.pos.x, car.pos.z, car.hint);
    const speed = car.speed;

    // Early pace that bleeds away, so a charger can genuinely lead the
    // opening laps and come back to the field later.
    const surge = 1 + this.early * Math.exp(-raceFraction * 2.6);
    const commit = (0.58 + this.skill * 0.46) * surge;
    const top = (26 + this.skill * 32) * surge;

    // aim further down the road the faster we are going
    const look = 0.005 + Math.min(0.014, speed / 3600);
    const frame = track.frameAt(loc.u + look);

    // Wide on the way in, tight at the apex: bias the line away from the
    // corner early and towards its inside as it arrives.
    this.wobble += dt * 0.6;
    const near = this.#bend(track, loc.u, BEND_SPAN);
    const soon = this.#bend(track, loc.u + 0.02, BEND_SPAN);
    const apexPull = Math.min(1, near.angle * 3) * 4.2 * near.dir;
    const entryPush = Math.min(1, soon.angle * 3) * 2.6 * -soon.dir;
    this.targetLane = THREE.MathUtils.clamp(
      this.baseLane * 0.35 + apexPull + entryPush + Math.sin(this.wobble) * 0.7,
      -4.6, 4.6,
    );
    this.lane += (this.targetLane - this.lane) * Math.min(1, dt * 2.2);

    this._aim.copy(frame.point).addScaledVector(frame.side, this.lane);
    let err = Math.atan2(this._aim.x - car.pos.x, this._aim.z - car.pos.z) - car.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;

    // steering right lowers the heading, so a positive error steers left
    const gain = 2.4 + this.skill * 1.2;
    this.input.steer = THREE.MathUtils.clamp(-err * gain, -1, 1);

    const target = Math.max(12, this.#speedLimit(track, loc.u, speed, commit, top));
    this.input.throttle = speed < target ? 1 : (speed > target + 2.5 ? -1 : 0);
    this.input.drift = false;

    // a car that has ended up on the grass gets itself back rather than
    // ploughing on at a speed it can no longer hold
    if (car.offRoad && Math.abs(loc.offset) > 9) this.input.throttle = 1;

    // Do not drive through the car in front - but only react to one we are
    // actually catching. Reacting to mere proximity deadlocks a standing grid.
    const ahead = this.#carAhead(cars, track, loc);
    if (ahead) {
      const closing = speed - ahead.speed;
      if (ahead.gap < 7 && closing > 0.5) this.input.throttle = -1;
      else if (ahead.gap < 13 && closing > 3) this.input.throttle = Math.min(this.input.throttle, 0);
      if (ahead.gap < 13) this.targetLane += ahead.side * 3;
    }

    car.update(dt, this.input, track);
    this.#lapCount(loc.u, time);
  }

  #carAhead(cars, track, loc) {
    let best = null;
    for (const other of cars) {
      if (other === this.car) continue;
      const d = other.pos.distanceTo(this.car.pos);
      if (d > 16) continue;
      const fwd = this.car.forward(_f);
      const rel = _r.subVectors(other.pos, this.car.pos);
      if (rel.dot(fwd) < 2) continue;                // not actually ahead
      const side = rel.dot(this.car.right(_s)) > 0 ? -1 : 1;
      if (!best || d < best.gap) best = { gap: d, side, speed: other.speed };
    }
    return best;
  }

  #lapCount(u, time) {
    if (this.prevU > 0.75 && u < 0.25) {
      this.lap++;
      if (this.lap === 1) this.startedAt = time;
    }
    this.prevU = u;
    this.progress = this.lap + u - 1;
  }
}

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _s = new THREE.Vector3();

const BEND_SPAN = 0.02;      // fraction of a lap used to measure a corner
const LATERAL_GRIP = 15;     // how hard a fully committed driver corners
const BRAKE_DECEL = 26;      // what they can scrub off per second of braking

// A field with real spread, and different shapes of race. `early` is pace
// that fades: a charger can lead the opening laps outright and still be
// caught, which makes the first two laps worth watching.
export const FIELD = [
  { name: 'V. Kasten',    color: '#4fc3f7', skill: 0.97, early: 0.02 },
  { name: 'R. Okonkwo',   color: '#ffd166', skill: 0.74, early: 0.20 },
  { name: 'M. Delacroix', color: '#a78bfa', skill: 0.88, early: 0.04 },
  { name: 'T. Halvorsen', color: '#4ade80', skill: 0.66, early: 0.17 },
  { name: 'S. Nakamura',  color: '#fb7185', skill: 0.80, early: 0.00 },
  { name: 'A. Petrov',    color: '#f0f4f8', skill: 0.58, early: 0.09 },
];
