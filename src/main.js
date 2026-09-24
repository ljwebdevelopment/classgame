import * as THREE from 'three';
import { TRACK } from './config.js';
import { Track } from './track.js';
import { Car } from './car.js';
import { buildWorld, SkidMarks } from './scenery.js';
import { buildProps } from './props.js';
import { Effects } from './particles.js';
import { GhostRecorder, GhostPlayer, loadBest, saveBest, clearBest } from './ghost.js';
import { Input } from './input.js';
import { Engine } from './audio.js';
import { Hud, formatTime } from './hud.js';
import { runStages } from './loader.js';
import * as Settings from './settings.js';

const STEP = 1 / 120;          // fixed physics step, so lap times are honest
const GRID_U = 0.985;          // spawn just before the line
const COUNTDOWN = ['3', '2', '1', 'GO!'];

const canvas = document.getElementById('scene');
const ui = document.getElementById('ui');
const el = (id) => document.getElementById(id);

const settings = Settings.load();
if (!settings.quality) settings.quality = Settings.guessQuality();
let tier = Settings.tier(settings.quality);
const reduced = Settings.reducedMotion();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: 'high-performance',
  });
} catch (err) {
  fatal(err?.message);
  throw err;
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 2000);
const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight('#cfe6f5', '#4a6b32', 0.85));

let track, skids, effects, car, ghostCar;
const input = new Input();
const hud = new Hud(ui);
const engine = new Engine();
const recorder = new GhostRecorder();

const stored = loadBest();
let ghost = new GhostPlayer(stored?.ghost ?? null);

const state = {
  phase: 'loading',      // loading | title | countdown | racing | paused
  resumePhase: 'racing',
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

const IDLE = { steer: 0, throttle: 0, drift: false, stop: false };
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _p = new THREE.Vector3();
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const shake = { amount: 0 };

boot();

// ---------------------------------------------------------------- startup

async function boot() {
  applyQuality();
  try {
    await runStages([
      {
        label: 'surveying the circuit', weight: 2,
        run: () => { track = new Track(); },
      },
      {
        label: 'laying asphalt', weight: 2,
        run: () => { scene.add(track.build()); },
      },
      {
        label: 'raising the landscape', weight: 3,
        run: () => { buildWorld(scene, track, tier); },
      },
      {
        label: 'dressing the circuit', weight: 2,
        run: () => { scene.add(buildProps(track, tier)); },
      },
      {
        label: 'rolling out the cars', weight: 1,
        run: () => {
          skids = new SkidMarks(scene, tier.skids);
          effects = new Effects(scene, tier);
          car = new Car('#ff5a3c');
          ghostCar = new Car('#57e0ff', true);
          ghostCar.mesh.visible = false;
          scene.add(car.mesh, ghostCar.mesh);
          resetToGrid();
          camSnap();
        },
      },
      {
        label: 'compiling shaders', weight: 3,
        run: () => {
          // do this now, not on the first frame, or the opening second stutters
          renderer.compile(scene, camera);
          renderer.render(scene, camera);
        },
      },
    ], (fraction, label) => {
      el('load-bar').style.width = `${Math.round(fraction * 100)}%`;
      el('load-label').textContent = `${label}  ${Math.round(fraction * 100)}%`;
    });
  } catch (err) {
    fatal(err?.message);
    throw err;
  }

  hud.ghostState(state.best != null
    ? `ghost ${formatTime(state.best)}`
    : 'no ghost yet — set a lap');
  syncMenu();
  state.phase = 'title';
  el('loading').classList.add('hidden');
  el('title-screen').classList.remove('hidden');
  requestAnimationFrame(frame);
}

function fatal(msg) {
  el('loading').classList.add('hidden');
  el('fatal').classList.remove('hidden');
  if (msg) el('fatal-msg').textContent = msg;
}

function applyQuality() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, tier.pixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = tier.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  sun.castShadow = tier.shadows;
  sun.shadow.mapSize.set(tier.shadowMap, tier.shadowMap);
  sun.shadow.camera.left = -46;
  sun.shadow.camera.right = 46;
  sun.shadow.camera.top = 46;
  sun.shadow.camera.bottom = -46;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 240;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  sun.shadow.camera.updateProjectionMatrix();   // required after resizing
  resize();
}

// ---------------------------------------------------------------- race flow

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
  effects?.clear();
  shake.amount = 0;
}

function beginCountdown() {
  if (state.phase !== 'title') return;
  resetToGrid();
  state.phase = 'countdown';
  state.countdown = 0;
  state.cdIdx = -1;
  engine.resume();
  el('title-screen').classList.add('hidden');
}

function rescue() {
  car.placeAt(track, car.lapU ?? state.prevU);
  hud.toast('rescued', '', 1.4);
}

function restartLap() {
  if (state.phase === 'title' || state.phase === 'loading') return;
  resetToGrid();
  state.phase = 'countdown';
  state.countdown = 0;
  state.cdIdx = -1;
  el('pause-screen').classList.add('hidden');
  hud.toast('lap restarted', '', 1.4);
}

function setPaused(on) {
  if (state.phase === 'title' || state.phase === 'loading') return;
  if (on && state.phase !== 'paused') {
    state.resumePhase = state.phase;
    state.phase = 'paused';
    el('pause-screen').classList.remove('hidden');
  } else if (!on && state.phase === 'paused') {
    state.phase = state.resumePhase;
    el('pause-screen').classList.add('hidden');
    last = performance.now();
  }
}

function onLapLine() {
  if (!state.started) {
    state.started = true;          // first crossing arms the clock
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
      hud.countdown(COUNTDOWN[idx]);
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

  spawnEffects(dt);
}

// ---------------------------------------------------------------- effects

function spawnEffects(dt) {
  const slipping = Math.abs(car.lateral) > 4.5;
  const sliding = (slipping || car.drifting) && car.speed > 7 && !car.airborne;

  if (car.landed > 0) {
    const force = Math.min(12, car.speed * 0.3 + car.landed * 8);
    if (car.landed > 0.28) {
      effects.landing(_p.copy(car.pos), force);
      if (!reduced) shake.amount = Math.min(1, shake.amount + car.landed * 0.7);
    }
    if (car.landed > 0.75) hud.toast(`big air  ${car.landed.toFixed(1)}s`, 'best', 2);
    car.landed = 0;
  }

  if (sliding && !car.offRoad) {
    car.rearWheels(_a, _b);
    skids.drop(_a.clone(), car.heading);
    skids.drop(_b.clone(), car.heading);
    // more smoke the harder the back end is actually sliding
    const rate = car.drifting ? 80 : 55;
    if (Math.random() < dt * rate) {
      effects.smoke(_p.copy(Math.random() < 0.5 ? _a : _b), car.heading, car.speed);
    }
  }

  if (car.offRoad && car.speed > 9 && Math.random() < dt * 70) {
    car.rearWheels(_a, _b);
    effects.dirt(_p.copy(Math.random() < 0.5 ? _a : _b), car.speed);
  }

  if (car.hitWall && car.speed > 7) {
    if (Math.random() < dt * 120) {
      _p.copy(car.pos).addScaledVector(car.right(_a), Math.sign(car.offset) * 1.1);
      _p.y += 0.5;
      effects.spark(_p, _a.multiplyScalar(Math.sign(car.offset)));
    }
    if (!reduced) shake.amount = Math.min(0.6, shake.amount + dt * car.speed * 0.05);
  }
}

function updateGhostCar() {
  if (!state.started || !ghost.frames) { ghostCar.mesh.visible = false; return; }
  const g = ghost.at(state.lapTime);
  if (!g) { ghostCar.mesh.visible = false; return; }
  ghostCar.mesh.visible = true;
  ghostCar.mesh.position.set(g.x, g.y, g.z);
  ghostCar.mesh.rotation.y = g.heading;
}

function camSnap() {
  const f = car.forward(_a);
  camPos.copy(car.pos).addScaledVector(f, -11).setY(car.pos.y + 4.8);
  camLook.set(car.pos.x, car.pos.y + 1.2, car.pos.z).addScaledVector(f, 7);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

function updateCamera(dt) {
  const f = car.forward(_a);
  const speedK = Math.min(1, car.speed / 57);
  _b.copy(car.pos).addScaledVector(f, -11 - speedK * 2.2).setY(car.pos.y + 4.8);
  camPos.lerp(_b, 1 - Math.exp(-7 * dt));
  camera.position.copy(camPos);

  if (shake.amount > 0.001) {
    const s = shake.amount;
    camera.position.x += (Math.random() - 0.5) * s * 0.9;
    camera.position.y += (Math.random() - 0.5) * s * 0.7;
    camera.position.z += (Math.random() - 0.5) * s * 0.9;
    shake.amount *= Math.exp(-6 * dt);
  }

  _b.set(car.pos.x, car.pos.y + 1.2, car.pos.z).addScaledVector(f, 7);
  camLook.lerp(_b, 1 - Math.exp(-11 * dt));
  camera.lookAt(camLook);

  const fov = 62 + speedK * 9;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-4 * dt));
    camera.updateProjectionMatrix();
  }

  sun.position.set(car.pos.x + 78, car.pos.y + 74, car.pos.z + 50);
  sun.target.position.copy(car.pos);
  sun.target.updateMatrixWorld();
}

// ---------------------------------------------------------------- main loop

let acc = 0;
let last = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
let autoChecked = false;
const vignette = el('speed-vignette');
let vignetteShown = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;          // tab was hidden: do not simulate the gap

  if (state.phase !== 'paused') {
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard++ < 240) { step(STEP); acc -= STEP; }
    updateGhostCar();
    updateCamera(dt);
    effects.update(dt, camera.quaternion);
    engine.update(car.speed, input.throttle, car.drifting ? Math.abs(car.lateral) : 0);
  } else {
    acc = 0;
  }

  hud.update(dt, {
    speed: car.speed,
    lapTime: state.started ? state.lapTime : 0,
    best: state.best,
    delta: state.delta,
    laps: state.laps,
  });

  // the vignette tightens with speed; transition on a class, not every frame
  if (!reduced) {
    const want = Math.min(0.85, Math.max(0, (car.speed - 26) / 34));
    if (Math.abs(want - vignetteShown) > 0.08) {
      vignetteShown = want;
      vignette.style.opacity = want.toFixed(2);
    }
  }

  renderer.render(scene, camera);
  watchFrameRate(dt);
}

// If the first few seconds of real driving cannot hold a reasonable frame
// rate, step down once and say so rather than letting it stutter forever.
function watchFrameRate(dt) {
  if (autoChecked || settings.quality === 'low' || state.phase !== 'racing') return;
  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc < 4) return;
  autoChecked = true;
  const fps = fpsFrames / fpsAcc;
  if (fps < 32) {
    setQuality('low');
    hud.toast('quality lowered for a smoother frame rate', 'warn', 3.5);
  }
}

function setQuality(name) {
  settings.quality = name;
  tier = Settings.tier(name);
  Settings.save(settings);
  applyQuality();
  syncMenu();
}

function syncMenu() {
  el('pause-quality').textContent = `Quality: ${settings.quality}`;
  el('pause-sound').textContent = `Sound: ${engine.muted ? 'off' : 'on'}`;
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- input

input.bindTouch(document);
input.onAction = (k) => {
  if (state.phase === 'loading') return;
  if (state.phase === 'title') {
    if (k === 'enter' || k === ' ') beginCountdown();
    return;
  }
  if (k === 'escape' || k === 'p') { setPaused(state.phase !== 'paused'); return; }
  if (state.phase === 'paused') return;
  if (k === 'r') rescue();
  if (k === 'enter') restartLap();
  if (k === 'm') { engine.toggleMute(); syncMenu(); hud.toast(engine.muted ? 'sound off' : 'sound on', '', 1.5); }
  if (k === 'c') clearGhost();
};

function clearGhost() {
  clearBest();
  state.best = null;
  ghost = new GhostPlayer(null);
  ghostCar.mesh.visible = false;
  hud.ghostState('no ghost yet — set a lap');
  hud.toast('best lap cleared', 'warn', 2);
}

el('start-btn').addEventListener('click', beginCountdown);
el('resume-btn').addEventListener('click', () => setPaused(false));
el('pause-restart').addEventListener('click', restartLap);
el('pause-clear').addEventListener('click', clearGhost);
el('pause-quality').addEventListener('click',
  () => setQuality(settings.quality === 'high' ? 'low' : 'high'));
el('pause-sound').addEventListener('click', () => { engine.toggleMute(); syncMenu(); });

// losing focus mid-race should pause, not silently keep the clock running
addEventListener('visibilitychange', () => {
  if (document.hidden && state.phase === 'racing') setPaused(true);
});

// handy for debugging and for the smoke tests
window.__apex = {
  get ready() { return state.phase !== 'loading'; },
  get car() { return car; },
  get track() { return track; },
  state, input, settings,
  get ghostFrames() { return ghost.frames; },
};
