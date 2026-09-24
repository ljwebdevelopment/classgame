import * as THREE from 'three';
import { TRACK } from './config.js';
import { TRACKS, trackById } from './tracks.js';
import { Track } from './track.js';
import { Car } from './car.js';
import { buildWorld, SkidMarks } from './scenery.js';
import { buildProps } from './props.js';
import { Effects } from './particles.js';
import { GhostRecorder, GhostPlayer } from './ghost.js';
import { Race } from './race.js';
import { Input } from './input.js';
import { Engine } from './audio.js';
import { Hud, formatTime } from './hud.js';
import { Menu } from './menu.js';
import { runStages } from './loader.js';
import * as Stats from './stats.js';
import * as Settings from './settings.js';

const STEP = 1 / 120;          // fixed physics step, so lap times are honest
const GRID_U = 0.985;          // time-trial spawn, just before the line
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
const hemi = new THREE.HemisphereLight('#cfe6f5', '#4a6b32', 0.85);
scene.add(hemi);

const input = new Input();
const hud = new Hud(ui);
const engine = new Engine();
const recorder = new GhostRecorder();

// everything below is rebuilt whenever a circuit is loaded
let def = TRACKS[0];
let track = null;
let worldGroup = null;
let trackGroup = null;
let propsGroup = null;
let skids = null;
let effects = null;
let car = null;
let ghostCar = null;
let ghost = new GhostPlayer(null);
let race = null;

const state = {
  phase: 'loading',      // loading | menu | countdown | racing | paused | result
  mode: 'trial',
  resumePhase: 'racing',
  countdown: 0,
  cdIdx: -1,
  lapTime: 0,
  laps: 0,
  best: null,
  delta: null,
  prevU: GRID_U,
  nextCp: 0,
  started: false,
  lapTopSpeed: 0,
};

const IDLE = { steer: 0, throttle: 0, drift: false, stop: false };
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _p = new THREE.Vector3();
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const shake = { amount: 0 };

const menu = new Menu({
  onStart: (mode, trackId) => startSession(mode, trackId),
  parLapFor: (d) => Stats.parLap({ length: planLength(d) }),
});

boot();

// ---------------------------------------------------------------- startup

function boot() {
  applyQuality();
  syncMenu();
  state.phase = 'menu';
  el('hud').classList.add('off');
  el('loading').classList.add('hidden');
  menu.show();
  requestAnimationFrame(frame);
}

function fatal(msg) {
  el('loading').classList.add('hidden');
  el('fatal').classList.remove('hidden');
  if (msg) el('fatal-msg').textContent = msg;
}

// A rough plan length for a circuit, so the menu can quote a par lap before
// the circuit itself has ever been built.
function planLength(d) {
  let len = 0;
  for (let i = 0; i < d.points.length; i++) {
    const a = d.points[i], b = d.points[(i + 1) % d.points.length];
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return len * 1.06;   // the spline bows out slightly past the control polygon
}

async function startSession(mode, trackId) {
  state.mode = mode;
  def = trackById(trackId);
  menu.hide();
  el('result-screen').classList.add('hidden');
  el('loading').classList.remove('hidden');
  state.phase = 'loading';

  try {
    await loadTrack(def, mode);
  } catch (err) {
    fatal(err?.message);
    throw err;
  }

  el('loading').classList.add('hidden');
  el('hud').classList.remove('off');
  beginCountdown();
}

async function loadTrack(nextDef, mode) {
  const fieldSize = mode === 'race' ? 6 : 0;

  await runStages([
    {
      label: 'clearing the paddock', weight: 1,
      run: () => {
        race?.dispose();
        race = null;
        for (const g of [worldGroup, trackGroup, propsGroup]) if (g) disposeGroup(g);
        if (car) scene.remove(car.mesh);
        if (ghostCar) scene.remove(ghostCar.mesh);
        if (skids) scene.remove(skids.mesh);
        if (effects) { scene.remove(effects.puffs.mesh); scene.remove(effects.sparks.mesh); }
        worldGroup = trackGroup = propsGroup = null;
      },
    },
    {
      label: `surveying ${nextDef.name.toLowerCase()}`, weight: 2,
      run: () => {
        track = new Track(nextDef);
        sun.color.set(nextDef.theme.sun);
        hemi.groundColor.set(nextDef.theme.grass);
      },
    },
    { label: 'laying asphalt', weight: 2, run: () => { trackGroup = track.build(); scene.add(trackGroup); } },
    { label: 'raising the landscape', weight: 3, run: () => { worldGroup = buildWorld(scene, track, tier); } },
    { label: 'dressing the circuit', weight: 2, run: () => { propsGroup = buildProps(track, tier); scene.add(propsGroup); } },
    {
      label: fieldSize ? 'warming up the field' : 'rolling out the car', weight: 2,
      run: () => {
        skids = new SkidMarks(scene, tier.skids);
        effects = new Effects(scene, tier);
        car = new Car('#ff5a3c');
        ghostCar = new Car('#57e0ff', true);
        ghostCar.mesh.visible = false;
        scene.add(car.mesh, ghostCar.mesh);
        race = new Race(scene, track, nextDef, fieldSize);

        const rec = Stats.trackRecord(nextDef.id);
        state.best = rec.best;
        ghost = new GhostPlayer(mode === 'trial' ? rec.ghost : null);
        resetToGrid();
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

  hud.ghostState(state.mode === 'race'
    ? `${race.fieldSize} cars · ${def.laps} laps`
    : (state.best != null ? `ghost ${formatTime(state.best)}` : 'no ghost yet — set a lap'));
  el('standings').classList.toggle('hidden', state.mode !== 'race');
}

function disposeGroup(group) {
  scene.remove(group);
  group.traverse((o) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) { m.map?.dispose?.(); m.dispose?.(); }
  });
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
  if (state.mode === 'race') {
    race.grid(car);
    state.prevU = car.lapU ?? 0.98;
  } else {
    car.placeAt(track, GRID_U);
    state.prevU = GRID_U;
  }
  state.lapTime = 0;
  state.laps = 0;
  state.delta = null;
  state.nextCp = 0;
  state.started = false;
  state.lapTopSpeed = 0;
  recorder.reset();
  ghost.rewind();
  ghostCar.mesh.visible = false;
  skids.clear();
  effects?.clear();
  shake.amount = 0;
  camSnap();
}

function beginCountdown() {
  resetToGrid();
  state.phase = 'countdown';
  state.countdown = 0;
  state.cdIdx = -1;
  engine.resume();
}

function rescue() {
  car.placeAt(track, car.lapU ?? state.prevU);
  hud.toast('rescued', '', 1.4);
}

function restartLap() {
  if (state.phase === 'menu' || state.phase === 'loading') return;
  el('pause-screen').classList.add('hidden');
  el('result-screen').classList.add('hidden');
  beginCountdown();
  hud.toast(state.mode === 'race' ? 'race restarted' : 'lap restarted', '', 1.4);
}

function setPaused(on) {
  if (!['racing', 'countdown', 'paused'].includes(state.phase)) return;
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

function toMenu() {
  state.phase = 'menu';
  el('hud').classList.add('off');
  el('pause-screen').classList.add('hidden');
  el('result-screen').classList.add('hidden');
  el('standings').classList.add('hidden');
  menu.show();
}

function onLapLine() {
  if (!state.started) {
    state.started = true;          // first crossing arms the clock
    state.lapTime = 0;
    state.nextCp = 1;
    state.lapTopSpeed = 0;
    recorder.reset();
    ghost.rewind();
    ghostCar.mesh.visible = ghost.frames > 0;
    if (state.mode === 'trial') hud.toast('lap started', '', 1.2);
    return;
  }

  const t = state.lapTime;
  const valid = state.nextCp >= TRACK.CHECKPOINTS;
  if (valid) {
    state.laps++;
    Stats.addLap(track.length, state.lapTopSpeed);
    const data = recorder.finish(t, car);
    if (state.best == null || t < state.best) {
      state.best = t;
      Stats.recordLap(def.id, t, data);
      if (state.mode === 'trial') {
        ghost = new GhostPlayer(data);
        hud.ghostState(`ghost ${formatTime(t)}`);
      }
      hud.toast(`NEW BEST ${formatTime(t)}`, 'best', 3.5);
    } else if (state.mode === 'trial') {
      hud.toast(`lap ${formatTime(t)}  (+${(t - state.best).toFixed(2)})`, '', 3);
    }
  } else {
    hud.toast('lap invalid — cut the course', 'warn', 2.4);
  }

  if (state.mode === 'race' && state.laps >= def.laps) { finishRace(); return; }

  state.lapTime = 0;
  state.nextCp = 1;
  state.delta = null;
  state.lapTopSpeed = 0;
  recorder.reset();
  ghost.rewind();
  ghostCar.mesh.visible = ghost.frames > 0;
}

function finishRace() {
  race.playerFinished = true;
  race.playerFinishTime = race.time;
  const order = race.order(playerProgress());
  const pos = order.find((r) => r.you).pos;
  Stats.addRace(pos);
  state.phase = 'result';

  el('result-kicker').textContent = `${def.name} · ${def.laps} laps`;
  el('result-place').textContent = pos === 1 ? 'WINNER' : `P${pos}`;
  const body = el('result-rows');
  body.textContent = '';
  for (const r of order) {
    const tr = document.createElement('tr');
    if (r.you) tr.className = 'you';
    const p = document.createElement('td');
    p.textContent = r.pos;
    const n = document.createElement('td');
    n.textContent = r.name;
    const t = document.createElement('td');
    t.textContent = r.finished && r.finishTime != null ? formatTime(r.finishTime) : '—';
    tr.append(p, n, t);
    body.appendChild(tr);
  }
  el('result-screen').classList.remove('hidden');
}

function step(dt) {
  if (state.phase === 'countdown') {
    state.countdown += dt;
    const idx = Math.min(COUNTDOWN.length - 1, Math.floor(state.countdown));
    if (idx !== state.cdIdx) { state.cdIdx = idx; hud.countdown(COUNTDOWN[idx]); }
    if (state.countdown >= 3) { state.phase = 'racing'; state.cdIdx = -1; hud.countdown(''); }
    car.update(dt, IDLE, track);
    if (state.mode === 'race') race.time = 0;
    return;
  }
  if (state.phase !== 'racing') { car.update(dt, IDLE, track); return; }

  car.update(dt, input, track);
  if (state.mode === 'race') race.update(dt, car);

  const u = car.lapU;
  // sectors must be taken in order, so corner-cutting cannot shorten a lap
  if (state.started) {
    const sector = Math.floor(u * TRACK.CHECKPOINTS);
    if (sector === state.nextCp) state.nextCp++;
    state.lapTime += dt;
    state.lapTopSpeed = Math.max(state.lapTopSpeed, car.speed);
    if (state.mode === 'trial') recorder.sample(dt, state.lapTime, car);
  }

  if (state.prevU > 0.75 && u < 0.25) onLapLine();
  state.prevU = u;

  if (state.mode === 'trial' && state.started && ghost.frames) {
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
  if (state.mode !== 'trial' || !state.started || !ghost.frames) {
    ghostCar.mesh.visible = false;
    return;
  }
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

// Distance covered on the same scale the AI reports, so the grid does not
// read as the player being a lap up on the entire field.
function playerProgress() {
  return (state.started ? state.laps + 1 : 0) + (car.lapU ?? 0) - 1;
}

function updateStandings() {
  if (state.mode !== 'race' || !race) return;
  const order = race.order(playerProgress());
  const me = order.find((r) => r.you);
  el('race-pos').textContent = `${me.pos}/${order.length}`;
  el('race-lap').textContent = `${Math.min(def.laps, state.laps + 1)}/${def.laps}`;
  const list = el('order-list');
  list.textContent = '';
  for (const r of order.slice(0, 7)) {
    const li = document.createElement('li');
    if (r.you) li.className = 'you';
    const p = document.createElement('span');
    p.className = 'p';
    p.textContent = r.pos;
    const n = document.createElement('span');
    n.textContent = r.name;
    li.append(p, n);
    list.appendChild(li);
  }
}

// ---------------------------------------------------------------- main loop

let acc = 0;
let last = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
let autoChecked = false;
let standingsAcc = 0;
const vignette = el('speed-vignette');
let vignetteShown = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;          // tab was hidden: do not simulate the gap

  const live = track && car && !['paused', 'menu', 'loading'].includes(state.phase);
  if (live) {
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard++ < 240) { step(STEP); acc -= STEP; }
    updateGhostCar();
    updateCamera(dt);
    effects.update(dt, camera.quaternion);
    engine.update(car.speed, input.throttle, car.drifting ? Math.abs(car.lateral) : 0);

    standingsAcc += dt;
    if (standingsAcc > 0.25) { standingsAcc = 0; updateStandings(); }

    hud.update(dt, {
      speed: car.speed,
      lapTime: state.started ? state.lapTime : 0,
      best: state.best,
      delta: state.delta,
      laps: state.laps,
    });

    // the vignette tightens with speed
    if (!reduced && vignette) {
      const want = Math.min(0.85, Math.max(0, (car.speed - 26) / 34));
      if (Math.abs(want - vignetteShown) > 0.08) {
        vignetteShown = want;
        vignette.style.opacity = want.toFixed(2);
      }
    }
  } else {
    acc = 0;
  }

  if (track) renderer.render(scene, camera);
  if (live) watchFrameRate(dt);
}

// If the first few seconds of real driving cannot hold a reasonable frame
// rate, step down once and say so rather than letting it stutter forever.
function watchFrameRate(dt) {
  if (autoChecked || settings.quality === 'low' || state.phase !== 'racing') return;
  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc < 4) return;
  autoChecked = true;
  if (fpsFrames / fpsAcc < 32) {
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
  if (state.phase === 'loading' || state.phase === 'menu') return;
  if (k === 'escape' || k === 'p') { setPaused(state.phase !== 'paused'); return; }
  if (state.phase === 'paused' || state.phase === 'result') return;
  if (k === 'r') rescue();
  if (k === 'enter') restartLap();
  if (k === 'm') { engine.toggleMute(); syncMenu(); hud.toast(engine.muted ? 'sound off' : 'sound on', '', 1.5); }
  if (k === 'c') clearGhost();
};

function clearGhost() {
  Stats.clearTrack(def.id);
  state.best = null;
  ghost = new GhostPlayer(null);
  ghostCar.mesh.visible = false;
  hud.ghostState('no ghost yet — set a lap');
  hud.toast('best lap cleared', 'warn', 2);
}

el('resume-btn').addEventListener('click', () => setPaused(false));
el('pause-restart').addEventListener('click', restartLap);
el('pause-clear').addEventListener('click', clearGhost);
el('pause-menu').addEventListener('click', toMenu);
el('pause-quality').addEventListener('click',
  () => setQuality(settings.quality === 'high' ? 'low' : 'high'));
el('pause-sound').addEventListener('click', () => { engine.toggleMute(); syncMenu(); });
el('result-again').addEventListener('click', restartLap);
el('result-home').addEventListener('click', toMenu);

// losing focus mid-race should pause, not silently keep the clock running
addEventListener('visibilitychange', () => {
  if (document.hidden && state.phase === 'racing') setPaused(true);
});

// handy for debugging and for the smoke tests
window.__apex = {
  get ready() { return state.phase !== 'loading'; },
  get car() { return car; },
  get track() { return track; },
  get race() { return race; },
  state, input, settings, menu,
  start: (mode, id) => startSession(mode, id),
  get ghostFrames() { return ghost.frames; },
};
