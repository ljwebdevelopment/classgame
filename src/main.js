import * as THREE from 'three';
import { TRACK } from './config.js';
import { Track } from './track.js';
import { Car } from './car.js';
import { buildWorld, SkidMarks } from './scenery.js';
import { GhostRecorder, GhostPlayer, loadBest, saveBest, clearBest } from './ghost.js';
import { Input } from './input.js';
import { Engine } from './audio.js';
import { Hud, formatTime } from './hud.js';

const STEP = 1 / 120;          // fixed physics step, so lap times are honest
const GRID_U = 0.985;          // spawn just before the line
const COUNTDOWN = [[0, '3'], [1, '2'], [2, '1'], [3, 'GO!']];

const canvas = document.getElementById('scene');
const ui = document.getElementById('ui');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 2000);

const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -46;
sun.shadow.camera.right = 46;
sun.shadow.camera.top = 46;
sun.shadow.camera.bottom = -46;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 240;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.03;
sun.shadow.camera.updateProjectionMatrix();   // required after resizing the frustum
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight('#cfe6f5', '#4a6b32', 0.85));

const track = new Track();
buildWorld(scene, track);
scene.add(track.build());

const skids = new SkidMarks(scene);
const car = new Car('#ff5a3c');
scene.add(car.mesh);

const ghostCar = new Car('#57e0ff', true);
ghostCar.mesh.visible = false;
scene.add(ghostCar.mesh);

const input = new Input();
const hud = new Hud(ui);
const engine = new Engine();
const recorder = new GhostRecorder();

const stored = loadBest();
let ghost = new GhostPlayer(stored?.ghost ?? null);

const state = {
  phase: 'title',        // title | countdown | racing
  countdown: 0,
  lapTime: 0,
  laps: 0,
  best: stored?.time ?? null,
  delta: null,
  prevU: GRID_U,
  nextCp: 0,
  started: false,        // timing begins on the first line crossing
  cdIdx: -1,
};

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();

resetToGrid();
camSnap();
hud.ghostState(state.best != null ? `ghost ${formatTime(state.best)}` : 'no ghost yet — set a lap');

function resetToGrid() {
  car.placeAt(track, GRID_U);
  state.lapTime = 0;
  state.delta = null;
  state.prevU = GRID_U;
  state.nextCp = 0;
  state.started = false;
  recorder.reset();
  ghost.rewind();
  ghostCar.mesh.visible = false;
  skids.clear();
}

function beginCountdown() {
  resetToGrid();
  state.phase = 'countdown';
  state.countdown = 0;
  engine.resume();
  document.getElementById('title-screen').classList.add('hidden');
}

function rescue() {
  // put the car back on the racing line where it went off, pointing forwards
  const u = car.lapU ?? state.prevU;
  car.placeAt(track, u);
  hud.toast('rescued', '', 1.4);
}

function restartLap() {
  if (state.phase === 'title') return;
  resetToGrid();
  state.phase = 'countdown';
  state.countdown = 0;
  hud.toast('lap restarted', '', 1.4);
}

function onLapLine() {
  if (!state.started) {
    // first crossing arms the clock
    state.started = true;
    state.lapTime = 0;
    state.nextCp = 1;
    recorder.reset();
    ghost.rewind();
    ghostCar.mesh.visible = ghost.frames > 0;
    hud.toast('lap started', '', 1.2);
    return;
  }

  if (state.nextCp < TRACK.CHECKPOINTS) {
    hud.toast('lap invalid — cut the course', 'warn', 2.4);
  } else {
    const t = state.lapTime;
    state.laps++;
    const data = recorder.finish(t, car);
    if (state.best == null || t < state.best) {
      state.best = t;
      saveBest(t, data);
      ghost = new GhostPlayer(data);
      hud.toast(`NEW BEST ${formatTime(t)}`, 'best', 3.5);
      hud.ghostState(`ghost ${formatTime(t)}`);
    } else {
      hud.toast(`lap ${formatTime(t)}  (+${(t - state.best).toFixed(2)})`, '', 3);
    }
  }

  state.lapTime = 0;
  state.nextCp = 1;
  state.delta = null;
  recorder.reset();
  ghost.rewind();
  ghostCar.mesh.visible = ghost.frames > 0;
}

function step(dt) {
  if (state.phase === 'countdown') {
    state.countdown += dt;
    const idx = Math.min(COUNTDOWN.length - 1, Math.floor(state.countdown));
    if (idx !== state.cdIdx) {
      state.cdIdx = idx;
      hud.countdown(COUNTDOWN[idx][1]);
    }
    if (state.countdown >= 3) {
      state.phase = 'racing';
      state.cdIdx = -1;
      hud.countdown('');
    }
    car.update(dt, IDLE, track);
    return;
  }

  if (state.phase !== 'racing') { car.update(dt, IDLE, track); return; }

  car.update(dt, input, track);

  const u = car.lapU;
  // sectors must be taken in order, so corner-cutting cannot shorten a lap
  if (state.started) {
    const sector = Math.floor(u * TRACK.CHECKPOINTS);
    if (sector === state.nextCp) state.nextCp++;
    state.lapTime += dt;
    recorder.sample(dt, state.lapTime, car);
  }

  if (state.prevU > 0.75 && u < 0.25) onLapLine();
  state.prevU = u;

  if (state.started && ghost.frames) {
    const gt = ghost.timeAtProgress(u);
    state.delta = gt == null ? null : state.lapTime - gt;
  } else {
    state.delta = null;
  }

  // lay rubber when the tyres are sliding
  if (Math.abs(car.lateral) > 4.5 && car.speed > 6 && !car.offRoad) {
    car.rearWheels(_a, _b);
    skids.drop(_a, car.heading);
    skids.drop(_b, car.heading);
  }
}

const IDLE = { steer: 0, throttle: 0, drift: false };

function updateGhostCar() {
  if (!state.started || !ghost.frames) { ghostCar.mesh.visible = false; return; }
  const g = ghost.at(state.lapTime);
  if (!g) { ghostCar.mesh.visible = false; return; }
  ghostCar.mesh.visible = true;
  ghostCar.mesh.position.set(g.x, 0, g.z);
  ghostCar.mesh.rotation.y = g.heading;
}

function camSnap() {
  const f = car.forward(_a);
  camPos.set(car.pos.x, 0, car.pos.z).addScaledVector(f, -11).setY(4.8);
  camLook.set(car.pos.x, 1.2, car.pos.z).addScaledVector(f, 7);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

function updateCamera(dt) {
  const f = car.forward(_a);
  const speedK = Math.min(1, car.speed / 57);
  _b.set(car.pos.x, 0, car.pos.z).addScaledVector(f, -11 - speedK * 2.2).setY(4.8);
  const k = 1 - Math.exp(-7 * dt);
  camPos.lerp(_b, k);
  camera.position.copy(camPos);

  _b.set(car.pos.x, 1.2, car.pos.z).addScaledVector(f, 7);
  camLook.lerp(_b, 1 - Math.exp(-11 * dt));
  camera.lookAt(camLook);

  const fov = 62 + speedK * 9;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-4 * dt));
    camera.updateProjectionMatrix();
  }

  sun.position.set(car.pos.x + 78, 74, car.pos.z + 50);
  sun.target.position.set(car.pos.x, 0, car.pos.z);
  sun.target.updateMatrixWorld();
}

let acc = 0;
let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;          // tab was hidden: do not simulate the gap
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard++ < 240) { step(STEP); acc -= STEP; }

  updateGhostCar();
  updateCamera(dt);
  engine.update(car.speed, input.throttle, car.drifting ? Math.abs(car.lateral) : 0);
  hud.update(dt, {
    speed: car.speed,
    lapTime: state.started ? state.lapTime : 0,
    best: state.best,
    delta: state.delta,
    laps: state.laps,
  });
  renderer.render(scene, camera);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

input.bindTouch(document);
input.onAction = (k) => {
  if (state.phase === 'title') {
    if (k === 'enter' || k === ' ') beginCountdown();
    return;
  }
  if (k === 'r') rescue();
  if (k === 'enter') restartLap();
  if (k === 'm') hud.toast(engine.toggleMute() ? 'sound off' : 'sound on', '', 1.5);
  if (k === 'c') {
    clearBest();
    state.best = null;
    ghost = new GhostPlayer(null);
    ghostCar.mesh.visible = false;
    hud.ghostState('no ghost yet — set a lap');
    hud.toast('best lap cleared', 'warn', 2);
  }
};

document.getElementById('start-btn').addEventListener('click', beginCountdown);
document.getElementById('loading').classList.add('hidden');

requestAnimationFrame(frame);

// handy for debugging and for the smoke test
window.__apex = { car, track, state, input, get ghostFrames() { return ghost.frames; } };
