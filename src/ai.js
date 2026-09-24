import * as THREE from 'three';

// An opponent driver. It reads the same track the player drives and feeds a
// Car the same input shape the keyboard does, so the AI is subject to exactly
// the same physics - no rubber-banding, no cheating on grip.
export class Driver {
  constructor(car, name, skill) {
    this.car = car;
    this.name = name;
    this.skill = skill;            // 0..1, scales pace and tidiness
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

  // How sharply the track turns over the next stretch, used to pick a speed.
  #bendAhead(track, u, span) {
    const a = track.frameAt(u).tangent;
    const b = track.frameAt(u + span).tangent;
    return Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
  }

  update(dt, track, cars, time) {
    const car = this.car;
    const loc = track.locate(car.pos.x, car.pos.z, car.hint);
    const speed = car.speed;

    // aim further down the road the faster we are going
    const look = 0.006 + Math.min(0.015, speed / 3400);
    const frame = track.frameAt(loc.u + look);

    // drift the racing line around slowly so the field does not run in a
    // single file, and swing wide-in-tight through corners
    this.wobble += dt * 0.7;
    const bend = this.#bendAhead(track, loc.u, 0.03);
    const apex = Math.min(1, bend * 2.2) * 3.2;
    this.targetLane = THREE.MathUtils.clamp(
      this.baseLane + Math.sin(this.wobble) * 1.2 - apex * Math.sign(this.baseLane || 1),
      -5, 5,
    );
    this.lane += (this.targetLane - this.lane) * Math.min(1, dt * 1.5);

    this._aim.copy(frame.point).addScaledVector(frame.side, this.lane);
    let err = Math.atan2(this._aim.x - car.pos.x, this._aim.z - car.pos.z) - car.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;

    // steering right lowers the heading, so a positive error steers left
    const gain = 2.2 + this.skill;
    this.input.steer = THREE.MathUtils.clamp(-err * gain, -1, 1);

    // pick a speed for the corner that is coming, not the one under the wheels
    const hard = this.#bendAhead(track, loc.u, 0.055);
    const ceiling = (34 + this.skill * 22) * (1 - Math.min(0.72, hard * 0.85));
    const target = Math.max(15, ceiling);
    this.input.throttle = speed < target ? 1 : (speed > target + 4 ? -1 : 0);
    this.input.drift = false;

    // do not drive through the car in front
    const ahead = this.#carAhead(cars, track, loc);
    if (ahead) {
      this.input.throttle = Math.min(this.input.throttle, ahead.gap < 9 ? -1 : 0);
      this.targetLane += ahead.side * 3;
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
      if (!best || d < best.gap) best = { gap: d, side };
    }
    return best;
  }

  #lapCount(u, time) {
    if (this.prevU > 0.75 && u < 0.25) {
      this.lap++;
      if (this.lap === 1) this.startedAt = time;
    }
    this.prevU = u;
    this.progress = this.lap + u;
  }
}

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _s = new THREE.Vector3();

export const FIELD = [
  { name: 'V. Kasten',    color: '#4fc3f7', skill: 0.95 },
  { name: 'R. Okonkwo',   color: '#ffd166', skill: 0.88 },
  { name: 'M. Delacroix', color: '#a78bfa', skill: 0.82 },
  { name: 'T. Halvorsen', color: '#4ade80', skill: 0.76 },
  { name: 'S. Nakamura',  color: '#fb7185', skill: 0.70 },
  { name: 'A. Petrov',    color: '#f0f4f8', skill: 0.64 },
];
