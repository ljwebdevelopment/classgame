import * as THREE from 'three';
import { Car } from './car.js';
import { Driver, FIELD } from './ai.js';

// A race session: the opposing field, the grid, lap counting for everyone, and
// the running order. Time trial uses the same object with an empty field.
export class Race {
  constructor(scene, track, def, fieldSize) {
    this.scene = scene;
    this.track = track;
    this.def = def;
    this.totalLaps = def.laps;
    this.drivers = [];
    this.finishers = [];
    this.time = 0;
    this.playerLap = 0;
    this.playerFinished = false;
    this.playerPosition = 1;

    for (let i = 0; i < fieldSize; i++) {
      const spec = FIELD[i % FIELD.length];
      const car = new Car(spec.color);
      scene.add(car.mesh);
      this.drivers.push(new Driver(car, spec.name, spec.skill));
    }
  }

  get fieldSize() { return this.drivers.length + 1; }

  // Grid slots run back down the track in staggered pairs; the player starts
  // last, so a race is always something to come through.
  grid(playerCar) {
    const rows = this.drivers.length + 1;
    const placed = [];
    for (let i = 0; i < rows; i++) {
      const back = 0.004 + i * 0.0055;
      placed.push({ u: 1 - back, lane: (i % 2 === 0 ? -2.6 : 2.6) });
    }
    this.drivers.forEach((d, i) => d.reset(this.track, placed[i].u, placed[i].lane));

    const mine = placed[placed.length - 1];
    playerCar.placeAt(this.track, mine.u);
    const f = this.track.frameAt(mine.u);
    playerCar.pos.addScaledVector(f.side, mine.lane);
    playerCar.sync();

    this.time = 0;
    this.playerLap = 0;
    this.playerFinished = false;
    this.playerFinishTime = null;
    this.finishers = [];
    return mine.u;          // the caller seeds its crossing detector with this
  }

  update(dt, playerCar) {
    this.time += dt;
    const cars = [playerCar, ...this.drivers.map((d) => d.car)];
    for (const d of this.drivers) {
      if (d.finished) { d.car.update(dt, IDLE, this.track); continue; }
      d.update(dt, this.track, cars, this.time);
      if (d.lap > this.totalLaps && !d.finished) {
        d.finished = true;
        d.finishTime = this.time;
        this.finishers.push(d);
      }
    }
    separate(cars);
  }

  // Everyone ordered by distance covered, player included.
  order(playerProgress) {
    const rows = this.drivers.map((d) => ({
      name: d.name, progress: d.progress, finished: d.finished,
      finishTime: d.finishTime, you: false,
    }));
    rows.push({ name: 'YOU', progress: playerProgress, finished: this.playerFinished,
      finishTime: this.playerFinishTime ?? null, you: true });
    rows.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    return rows.map((r, i) => ({ ...r, pos: i + 1 }));
  }

  dispose() {
    for (const d of this.drivers) this.scene.remove(d.car.mesh);
    this.drivers = [];
  }
}

const IDLE = { steer: 0, throttle: 0, drift: false, stop: false };
const _d = new THREE.Vector3();

// Cheap equal-mass separation so cars bump and slide rather than overlap.
function separate(cars) {
  const R = 2.6;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      _d.subVectors(b.pos, a.pos);
      _d.y = 0;
      const d = _d.length();
      if (d > R * 2 || d < 1e-4) continue;
      const push = (R * 2 - d) / 2;
      _d.multiplyScalar(1 / d);
      a.pos.addScaledVector(_d, -push);
      b.pos.addScaledVector(_d, push);
      // trade a little speed along the contact normal
      const va = a.vel.dot(_d), vb = b.vel.dot(_d);
      if (va - vb > 0) {
        const swap = (va - vb) * 0.5;
        a.vel.addScaledVector(_d, -swap);
        b.vel.addScaledVector(_d, swap);
      }
      a.sync();
      b.sync();
    }
  }
}
