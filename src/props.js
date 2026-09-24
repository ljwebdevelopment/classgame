import * as THREE from 'three';
import { TRACK } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);

// Trackside furniture. Everything here is instanced or a handful of meshes, so
// the whole dressing layer costs about a dozen draw calls.
export function buildProps(track, tier) {
  const group = new THREE.Group();
  const corners = findCorners(track);
  group.add(tyreStacks(track, corners));
  group.add(brakingBoards(track, corners));
  if (tier.banners) group.add(banners(track));
  if (tier.fence) group.add(catchFence(track));
  group.add(startComplex(track));
  group.add(clouds(tier.clouds));
  return group;
}

// Where the track actually bends, measured off the sampled tangents, so the
// dressing lands on real corners instead of arbitrary distances.
function findCorners(track) {
  const n = track.n;
  const win = Math.round(n / 60);
  const bend = [];
  for (let i = 0; i < n; i++) {
    const a = track.tangents[i];
    const b = track.tangents[(i + win) % n];
    const dot = Math.max(-1, Math.min(1, a.dot(b)));
    // sign tells us which way it turns, so kit goes on the outside
    const cross = a.x * b.z - a.z * b.x;
    bend.push({ i, angle: Math.acos(dot), dir: cross > 0 ? -1 : 1 });
  }
  const peaks = [];
  for (let i = 0; i < n; i++) {
    const b = bend[i];
    if (b.angle < 0.28) continue;                       // ~16 deg, a real corner
    let isPeak = true;
    for (let k = -20; k <= 20; k++) {
      if (bend[((i + k) % n + n) % n].angle > b.angle) { isPeak = false; break; }
    }
    if (isPeak && !peaks.some((p) => Math.abs(p.i - i) < 30)) peaks.push(b);
  }
  return peaks;
}

function tyreStacks(track, corners) {
  const geo = new THREE.CylinderGeometry(0.62, 0.62, 0.42, 10);
  const mat = new THREE.MeshLambertMaterial({ color: '#1c1e22' });
  const perStack = 3;
  const stacksPerCorner = 7;
  const mesh = new THREE.InstancedMesh(
    geo, mat, Math.max(1, corners.length * stacksPerCorner * perStack));
  mesh.castShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const off = TRACK.HALF_WIDTH + TRACK.BARRIER_OFFSET - 1.6;
  let n = 0;

  for (const c of corners) {
    for (let s = 0; s < stacksPerCorner; s++) {
      const i = (c.i + (s - 3) * 7 + track.n) % track.n;
      const p = track.points[i], side = track.sides[i];
      const base = track.heights[i];
      for (let k = 0; k < perStack; k++) {
        m.compose(new THREE.Vector3(
          p.x + side.x * off * c.dir,
          base + 0.21 + k * 0.42,
          p.z + side.z * off * c.dir,
        ), q, one);
        mesh.setMatrixAt(n++, m);
      }
    }
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

// 100 / 50 boards on the approach to each corner
function brakingBoards(track, corners) {
  const group = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(0.16, 1.5, 0.16);
  const postMat = new THREE.MeshLambertMaterial({ color: '#33383f' });
  const boardGeo = new THREE.PlaneGeometry(1.7, 1.2);
  const off = TRACK.HALF_WIDTH + TRACK.BARRIER_OFFSET - 3.4;

  for (const c of corners) {
    for (const [back, label] of [[62, '100'], [32, '50']]) {
      const i = ((c.i - back) % track.n + track.n) % track.n;
      const p = track.points[i], side = track.sides[i], t = track.tangents[i];
      const y = track.heights[i];
      const x = p.x + side.x * off * c.dir;
      const z = p.z + side.z * off * c.dir;

      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, y + 0.75, z);
      group.add(post);

      const board = new THREE.Mesh(
        boardGeo,
        new THREE.MeshLambertMaterial({ map: boardTexture(label), side: THREE.DoubleSide }),
      );
      board.position.set(x, y + 2.05, z);
      board.rotation.y = Math.atan2(t.x, t.z) + Math.PI / 2;
      board.castShadow = true;
      group.add(board);
    }
  }
  return group;
}

function banners(track) {
  const geo = new THREE.BoxGeometry(9, 1.5, 0.25);
  const names = ['APEX', 'VOLTAGE', 'DRIFT CO', 'TORQUE', 'NITRO'];
  const group = new THREE.Group();
  const off = TRACK.HALF_WIDTH + TRACK.BARRIER_OFFSET + 1.4;
  const mats = names.map((s, i) => new THREE.MeshLambertMaterial({
    map: bannerTexture(s, BANNER_COLORS[i % BANNER_COLORS.length]),
  }));

  let slot = 0;
  for (let i = 30; i < track.n; i += 62) {
    for (const dir of [1, -1]) {
      const p = track.points[i], side = track.sides[i], t = track.tangents[i];
      const mesh = new THREE.Mesh(geo, mats[slot % mats.length]);
      mesh.position.set(
        p.x + side.x * off * dir,
        track.heights[i] + 1.5,
        p.z + side.z * off * dir,
      );
      mesh.rotation.y = Math.atan2(t.x, t.z);
      mesh.castShadow = true;
      group.add(mesh);
      slot++;
    }
  }
  return group;
}

// A translucent mesh screen standing behind the barriers.
function catchFence(track) {
  const n = track.n;
  const height = 3.2;
  const off = TRACK.HALF_WIDTH + TRACK.BARRIER_OFFSET + 2.2;
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: meshTexture(),
    transparent: true,
    opacity: 0.26,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  for (const dir of [1, -1]) {
    const pos = new Float32Array((n + 1) * 2 * 3);
    const uv = new Float32Array((n + 1) * 2 * 2);
    const idx = [];
    for (let k = 0; k <= n; k++) {
      const i = k % n;
      const p = track.points[i], s = track.sides[i];
      const o = k * 6;
      const x = p.x + s.x * off * dir, z = p.z + s.z * off * dir;
      pos[o] = x; pos[o + 1] = track.heights[i]; pos[o + 2] = z;
      pos[o + 3] = x; pos[o + 4] = track.heights[i] + height; pos[o + 5] = z;
      const u = (k * track.segLen) / 4;
      uv[k * 4] = u; uv[k * 4 + 1] = 0;
      uv[k * 4 + 2] = u; uv[k * 4 + 3] = 1;
      if (k < n) {
        const a = k * 2;
        idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, mat));
  }
  return group;
}

// Grandstand and timing tower beside the start/finish straight.
function startComplex(track) {
  const group = new THREE.Group();
  const f = track.frameAt(0.006);
  const side = f.side, p = f.point, y = f.height;
  const dirOut = -1;                                    // stand on the left
  const base = TRACK.HALF_WIDTH + TRACK.BARRIER_OFFSET + 5;

  const concrete = new THREE.MeshLambertMaterial({ color: '#9aa1a8' });
  const dark = new THREE.MeshLambertMaterial({ color: '#2f343b' });
  const seat = new THREE.MeshLambertMaterial({ color: '#3f6fa8' });

  // tiered seating: each row steps back and up
  for (let row = 0; row < 6; row++) {
    const w = 42;
    const step = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, 2.2), row % 2 ? seat : concrete);
    const outward = base + 2 + row * 2.1;
    step.position.set(
      p.x + side.x * outward * dirOut,
      y + 0.55 + row * 1.0,
      p.z + side.z * outward * dirOut,
    );
    step.rotation.y = f.heading;
    step.castShadow = true;
    step.receiveShadow = true;
    group.add(step);
  }
  // roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(46, 0.5, 16), dark);
  const roofOut = base + 9;
  roof.position.set(
    p.x + side.x * roofOut * dirOut, y + 9.5, p.z + side.z * roofOut * dirOut);
  roof.rotation.y = f.heading;
  roof.castShadow = true;
  group.add(roof);
  for (const d of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9.5, 0.8), concrete);
    const along = d * 21;
    col.position.set(
      p.x + side.x * (base + 15) * dirOut + f.tangent.x * along,
      y + 4.75,
      p.z + side.z * (base + 15) * dirOut + f.tangent.z * along,
    );
    group.add(col);
  }

  // timing tower on the opposite side
  const tower = new THREE.Mesh(new THREE.BoxGeometry(5, 14, 4), concrete);
  const tOut = TRACK.HALF_WIDTH + TRACK.BARRIER_OFFSET + 5;
  tower.position.set(p.x + side.x * tOut, y + 7, p.z + side.z * tOut);
  tower.rotation.y = f.heading;
  tower.castShadow = true;
  group.add(tower);

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 3, 4.2),
    new THREE.MeshLambertMaterial({ color: '#2b3a4a' }),
  );
  glass.position.set(p.x + side.x * tOut, y + 12, p.z + side.z * tOut);
  glass.rotation.y = f.heading;
  group.add(glass);

  return group;
}

function clouds(count) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: cloudTexture(), transparent: true, opacity: 0.85, depthWrite: false,
  });
  let seed = 4242;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand();
    const r = 400 + rand() * 500;
    const s = 160 + rand() * 220;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 0.45), mat);
    m.position.set(Math.cos(a) * r, 150 + rand() * 90, Math.sin(a) * r);
    m.rotation.y = -a + Math.PI / 2;
    m.renderOrder = -1;
    group.add(m);
  }
  return group;
}

const BANNER_COLORS = ['#c8412f', '#2f6fb0', '#e0a32c', '#3c8a5a', '#7a4fa8'];

function boardTexture(label) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#f2f4f6';
  x.fillRect(0, 0, 128, 96);
  x.strokeStyle = '#1c1f24';
  x.lineWidth = 7;
  x.strokeRect(4, 4, 120, 88);
  x.fillStyle = '#1c1f24';
  x.font = 'bold 54px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(label, 64, 52);
  return canvasTex(c);
}

function bannerTexture(label, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.fillRect(0, 0, 512, 96);
  x.fillStyle = 'rgba(255,255,255,0.16)';
  x.fillRect(0, 70, 512, 26);
  x.fillStyle = '#ffffff';
  x.font = 'bold 50px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.letterSpacing = '6px';
  x.fillText(label, 256, 40);
  return canvasTex(c);
}

function meshTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 32, 32);
  x.strokeStyle = 'rgba(210,218,226,0.85)';
  x.lineWidth = 2;
  for (let i = 0; i <= 32; i += 8) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 32); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(32, i); x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const cx = 40 + Math.random() * 176;
    const cy = 60 + Math.random() * 34;
    const r = 18 + Math.random() * 34;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  }
  return canvasTex(c);
}

function canvasTex(c) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
