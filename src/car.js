import * as THREE from 'three';
import { CAR, TRACK } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

// Arcade kart physics. The car carries a world-space velocity that is split
// into forward/lateral components each step; steering rotates the chassis and
// grip decides how much of the old velocity survives, which is what makes the
// back end step out when you pull the handbrake.
export class Car {
  constructor(color = '#ff5a3c', ghost = false) {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.steer = 0;
    this.hint = null;
    this.drifting = false;
    this.offRoad = false;
    this.hitWall = false;
    this.lateral = 0;
    this.accel = 0;
    this.wheelSpin = 0;

    this.mesh = buildCarMesh(color, ghost);
    this.tilt = this.mesh.getObjectByName('tilt');
    this.frontWheels = this.mesh.getObjectByName('frontWheels');
    this.wheels = this.mesh.userData.wheels;
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  right(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
  }

  placeAt(track, u) {
    const f = track.frameAt(u);
    this.pos.set(f.point.x, 0, f.point.z);
    this.heading = f.heading;
    this.vel.set(0, 0, 0);
    this.steer = 0;
    this.hint = null;
    this.sync();
  }

  update(dt, input, track) {
    const fwd = this.forward();
    const rgt = this.right();

    // ease the wheels towards the input so keyboard steering is not binary
    const target = clamp(input.steer, -1, 1);
    const closing = target !== 0 && Math.sign(target) === Math.sign(this.steer || target);
    const rate = closing ? CAR.STEER_RATE : CAR.STEER_RETURN;
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);

    let vf = this.vel.dot(fwd);
    let vl = this.vel.dot(rgt);
    const speed = this.speed;
    const prevVf = vf;

    const loc = track.locate(this.pos.x, this.pos.z, this.hint);
    this.hint = loc.index;
    this.lapU = loc.u;
    this.offset = loc.offset;
    this.offRoad = Math.abs(loc.offset) > TRACK.HALF_WIDTH + TRACK.CURB_WIDTH;

    // engine / brakes
    const power = this.offRoad ? CAR.OFF_ENGINE_SCALE : 1;
    if (input.throttle > 0) {
      vf += CAR.ENGINE * power * input.throttle * dt;
    } else if (input.throttle < 0) {
      if (vf > 0.5) vf -= CAR.BRAKE * dt;
      else vf = Math.max(vf - CAR.REVERSE * power * dt, -CAR.MAX_REVERSE);
    }

    // drag: quadratic keeps the top speed sane, linear settles it at a stop
    let drag = CAR.DRAG_QUAD * Math.abs(vf) * vf + CAR.DRAG_LIN * vf;
    if (this.offRoad) drag += CAR.OFF_DRAG * vf;
    vf -= drag * dt;

    // steering authority ramps in with speed, then tapers off at the top end
    const sf = Math.min(1, speed / CAR.YAW_SPEED_REF)
      * (1 - 0.32 * clamp((speed - 28) / 34, 0, 1));
    const dir = vf >= 0 ? 1 : -1;
    let yaw = this.steer * CAR.MAX_YAW * sf * dir;

    this.drifting = input.drift && speed > CAR.DRIFT_MIN_SPEED;
    if (this.drifting) {
      yaw += this.steer * CAR.DRIFT_YAW * Math.min(1, speed / 25);
      vf -= CAR.DRIFT_SCRUB * vf * dt;
    }
    this.heading += yaw * dt;

    // lateral grip: how much sideways velocity is scrubbed off per second
    let grip = this.drifting ? CAR.GRIP_DRIFT : CAR.GRIP;
    if (this.offRoad) grip = Math.min(grip, CAR.OFF_GRIP);
    vl *= Math.exp(-grip * dt);

    // rebuild world velocity around the new heading
    this.forward(fwd);
    this.right(rgt);
    this.vel.copy(fwd).multiplyScalar(vf).addScaledVector(rgt, vl);
    this.pos.addScaledVector(this.vel, dt);

    this.#wall(track, dt);

    this.lateral = vl;
    this.accel = dt > 0 ? (vf - prevVf) / dt : 0;
    this.wheelSpin += (vf / CAR.WHEEL_RADIUS) * dt;
    this.sync();
  }

  #wall(track, dt) {
    const loc = track.locate(this.pos.x, this.pos.z, this.hint);
    this.hint = loc.index;
    const lim = track.wallLimit;
    const dist = Math.abs(loc.offset);
    this.hitWall = false;
    if (dist <= lim) return;

    const sign = Math.sign(loc.offset);
    const over = dist - lim;
    // push back inside and kill the velocity heading into the barrier
    this.pos.addScaledVector(loc.side, -sign * over);
    const outward = loc.side.dot(this.vel) * sign;
    if (outward > 0) this.vel.addScaledVector(loc.side, -sign * outward * CAR.WALL_BOUNCE);
    // scrape along the barrier rather than stopping dead
    this.vel.multiplyScalar(Math.exp(-CAR.WALL_SCRUB * dt));
    this.hitWall = true;
  }

  sync() {
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.heading;
    if (this.tilt) {
      // lean into the corner and squat under acceleration
      const roll = clamp(-this.lateral * 0.012, -0.12, 0.12);
      const pitch = clamp(-this.accel * 0.004, -0.06, 0.06);
      this.tilt.rotation.z += (roll - this.tilt.rotation.z) * 0.2;
      this.tilt.rotation.x += (pitch - this.tilt.rotation.x) * 0.2;
    }
    if (this.frontWheels) this.frontWheels.rotation.y = this.steer * 0.5;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
  }

  // World positions of the two rear contact patches, for skid marks.
  rearWheels(outA, outB) {
    const r = this.right();
    const f = this.forward();
    const back = -1.25, side = 0.95;
    outA.set(this.pos.x, 0, this.pos.z).addScaledVector(f, back).addScaledVector(r, side);
    outB.set(this.pos.x, 0, this.pos.z).addScaledVector(f, back).addScaledVector(r, -side);
  }
}

function buildCarMesh(color, ghost) {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.name = 'tilt';
  root.add(tilt);

  const opts = ghost
    ? { transparent: true, opacity: 0.38, depthWrite: false }
    : {};
  const body = new THREE.MeshLambertMaterial({ color, ...opts });
  const dark = new THREE.MeshLambertMaterial({ color: ghost ? color : '#23262b', ...opts });
  const glass = new THREE.MeshLambertMaterial({ color: ghost ? color : '#8fd3e8', ...opts });

  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = !ghost;
    tilt.add(m);
    return m;
  };

  add(new THREE.BoxGeometry(CAR.WIDTH, 0.55, CAR.LENGTH), body, 0, 0.6, 0);
  add(new THREE.BoxGeometry(CAR.WIDTH - 0.3, 0.5, 1.5), glass, 0, 1.08, -0.15);
  add(new THREE.BoxGeometry(CAR.WIDTH - 0.15, 0.22, 0.7), body, 0, 0.45, 1.75);   // nose
  add(new THREE.BoxGeometry(CAR.WIDTH - 0.1, 0.12, 0.45), dark, 0, 1.0, -1.85);   // wing
  add(new THREE.BoxGeometry(0.16, 0.36, 0.45), dark, -0.7, 0.85, -1.85);
  add(new THREE.BoxGeometry(0.16, 0.36, 0.45), dark, 0.7, 0.85, -1.85);

  const wheelGeo = new THREE.CylinderGeometry(
    CAR.WHEEL_RADIUS, CAR.WHEEL_RADIUS, 0.38, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const tyre = new THREE.MeshLambertMaterial({ color: ghost ? color : '#1b1e22', ...opts });

  const wheels = [];
  const frontWheels = new THREE.Group();
  frontWheels.name = 'frontWheels';
  frontWheels.position.set(0, CAR.WHEEL_RADIUS, 1.25);
  tilt.add(frontWheels);

  for (const x of [-1.0, 1.0]) {
    const w = new THREE.Mesh(wheelGeo, tyre);
    w.position.set(x, 0, 0);
    w.castShadow = !ghost;
    frontWheels.add(w);
    wheels.push(w);

    const r = new THREE.Mesh(wheelGeo, tyre);
    r.position.set(x, CAR.WHEEL_RADIUS, -1.25);
    r.castShadow = !ghost;
    tilt.add(r);
    wheels.push(r);
  }

  root.userData.wheels = wheels;
  return root;
}
