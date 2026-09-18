import * as THREE from 'three';
import { TRACK } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// A closed circuit built from a Catmull-Rom spline. The same evenly spaced
// sample array drives both the road geometry and the physics queries, so what
// you see is exactly what the car collides with.
export class Track {
  constructor() {
    const pts = TRACK.POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
    this.length = this.curve.getLength();

    const n = TRACK.SAMPLES;
    this.n = n;
    this.points = [];
    this.tangents = [];
    this.sides = [];
    this.dist = [];   // arc length at each sample

    for (let i = 0; i < n; i++) {
      const u = i / n;
      const p = this.curve.getPointAt(u);
      const t = this.curve.getTangentAt(u).setY(0).normalize();
      // right-hand side vector: tangent x up
      const s = new THREE.Vector3().crossVectors(t, UP).normalize();
      this.points.push(p);
      this.tangents.push(t);
      this.sides.push(s);
      this.dist.push(u * this.length);
    }
    this.segLen = this.length / n;
    this.wallLimit = TRACK.HALF_WIDTH + TRACK.WALL_MARGIN;
  }

  at(i) { return this.points[((i % this.n) + this.n) % this.n]; }
  tangentAt(i) { return this.tangents[((i % this.n) + this.n) % this.n]; }
  sideAt(i) { return this.sides[((i % this.n) + this.n) % this.n]; }

  // Nearest point on the centreline. `hint` is the previous index, which turns
  // this into a tiny local search instead of a full scan.
  locate(x, z, hint) {
    const n = this.n;
    let from = 0, to = n - 1;
    if (hint != null) { from = hint - 45; to = hint + 45; }

    let best = Infinity, bestI = 0;
    for (let k = from; k <= to; k++) {
      const i = ((k % n) + n) % n;
      const p = this.points[i];
      const dx = x - p.x, dz = z - p.z;
      const d = dx * dx + dz * dz;
      if (d < best) { best = d; bestI = i; }
    }

    const p = this.points[bestI];
    const t = this.tangents[bestI];
    const s = this.sides[bestI];
    const dx = x - p.x, dz = z - p.z;

    // sub-sample position along the tangent, for smooth lap progress
    const along = THREE.MathUtils.clamp((dx * t.x + dz * t.z) / this.segLen, -0.5, 0.5);
    let u = (bestI + along) / n;
    u -= Math.floor(u);

    return {
      index: bestI,
      u,
      offset: dx * s.x + dz * s.z,   // signed distance from centreline
      tangent: t,
      side: s,
      point: p,
    };
  }

  // World-space frame at a normalised distance around the lap.
  frameAt(u) {
    u -= Math.floor(u);
    const f = u * this.n;
    const i = Math.floor(f) % this.n;
    const j = (i + 1) % this.n;
    const k = f - Math.floor(f);
    const point = _a.copy(this.points[i]).lerp(this.points[j], k).clone();
    const tangent = _b.copy(this.tangents[i]).lerp(this.tangents[j], k).normalize().clone();
    const side = new THREE.Vector3().crossVectors(tangent, UP).normalize();
    return { point, tangent, side, heading: Math.atan2(tangent.x, tangent.z) };
  }

  // Signed shortest difference between two lap progress values, in [-0.5, 0.5).
  static deltaU(a, b) {
    let d = a - b;
    d -= Math.round(d);
    return d;
  }

  build() {
    const group = new THREE.Group();
    group.add(this.#road());
    group.add(this.#kerbs(1));
    group.add(this.#kerbs(-1));
    group.add(this.#barriers());
    group.add(this.#startLine());
    group.add(this.#gantry());
    return group;
  }

  #ribbon(inner, outer, y, colorFn) {
    const n = this.n;
    const pos = new Float32Array((n + 1) * 2 * 3);
    const col = colorFn ? new Float32Array((n + 1) * 2 * 3) : null;
    const uv = new Float32Array((n + 1) * 2 * 2);
    const idx = [];
    const c = new THREE.Color();

    for (let k = 0; k <= n; k++) {
      const i = k % n;
      const p = this.points[i], s = this.sides[i];
      const o = k * 6;
      pos[o + 0] = p.x + s.x * inner; pos[o + 1] = y; pos[o + 2] = p.z + s.z * inner;
      pos[o + 3] = p.x + s.x * outer; pos[o + 4] = y; pos[o + 5] = p.z + s.z * outer;
      const v = (k * this.segLen) / 10;
      uv[k * 4 + 0] = 0; uv[k * 4 + 1] = v;
      uv[k * 4 + 2] = 1; uv[k * 4 + 3] = v;
      if (col) {
        colorFn(i, c);
        col[o + 0] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
        col[o + 3] = c.r; col[o + 4] = c.g; col[o + 5] = c.b;
      }
      if (k < n) {
        const a = k * 2, b = a + 1, a2 = a + 2, b2 = a + 3;
        // inner is the "left" edge when inner < outer, so wind for +Y normals
        if (inner < outer) idx.push(a, b, b2, a, b2, a2);
        else idx.push(a, b2, b, a, a2, b2);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  #road() {
    const hw = TRACK.HALF_WIDTH;
    const g = this.#ribbon(-hw, hw, 0.02);
    const tex = asphaltTexture();
    tex.repeat.set(1, 1);
    const m = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    mesh.name = 'road';
    return mesh;
  }

  #kerbs(dir) {
    const hw = TRACK.HALF_WIDTH;
    const inner = dir * hw;
    const outer = dir * (hw + TRACK.CURB_WIDTH);
    const red = new THREE.Color('#d0402f');
    const white = new THREE.Color('#eceff2');
    const g = this.#ribbon(Math.min(inner, outer), Math.max(inner, outer), 0.05,
      (i, c) => c.copy(Math.floor(i / 4) % 2 === 0 ? red : white));
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    return mesh;
  }

  #barriers() {
    const step = 5;
    const count = Math.floor(this.n / step) * 2;
    const geo = new THREE.BoxGeometry(0.45, 1.15, 5.0);
    // white base: the per-instance colour set below multiplies into it
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = true;
    const off = TRACK.HALF_WIDTH + TRACK.BARRIER_OFFSET;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const red = new THREE.Color('#c8412f');
    const white = new THREE.Color('#e8ebee');
    let n = 0;
    for (let i = 0; i < this.n; i += step) {
      const p = this.points[i], s = this.sides[i], t = this.tangents[i];
      const yaw = Math.atan2(t.x, t.z);
      q.setFromAxisAngle(UP, yaw);
      for (const dir of [1, -1]) {
        m.compose(
          new THREE.Vector3(p.x + s.x * off * dir, 0.58, p.z + s.z * off * dir),
          q, scale,
        );
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, (Math.floor(i / step) + (dir > 0 ? 0 : 1)) % 2 === 0 ? red : white);
        n++;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  #startLine() {
    const hw = TRACK.HALF_WIDTH;
    const geo = new THREE.PlaneGeometry(hw * 2, 3);
    const mat = new THREE.MeshLambertMaterial({ map: checkerTexture() });
    const mesh = new THREE.Mesh(geo, mat);
    const f = this.frameAt(0);
    mesh.position.set(f.point.x, 0.06, f.point.z);
    mesh.rotation.set(-Math.PI / 2, 0, 0);
    mesh.rotateZ(-f.heading);
    return mesh;
  }

  #gantry() {
    const g = new THREE.Group();
    const f = this.frameAt(0);
    const postGeo = new THREE.BoxGeometry(0.7, 7, 0.7);
    const postMat = new THREE.MeshLambertMaterial({ color: '#2f3640' });
    const beamGeo = new THREE.BoxGeometry(TRACK.HALF_WIDTH * 2 + 6, 1.6, 0.8);
    const beamMat = new THREE.MeshLambertMaterial({ color: '#e94f37' });
    const span = TRACK.HALF_WIDTH + 2.5;

    for (const dir of [1, -1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(f.point.x + f.side.x * span * dir, 3.5, f.point.z + f.side.z * span * dir);
      post.castShadow = true;
      g.add(post);
    }
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(f.point.x, 7.2, f.point.z);
    beam.rotation.y = f.heading;
    beam.castShadow = true;
    g.add(beam);
    return g;
  }
}

function asphaltTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#41454b';
  x.fillRect(0, 0, 128, 512);
  // speckle so the surface reads as asphalt rather than flat grey
  for (let i = 0; i < 5000; i++) {
    const g = 40 + Math.random() * 40;
    x.fillStyle = `rgba(${g},${g},${g + 4},${0.15 + Math.random() * 0.3})`;
    x.fillRect(Math.random() * 128, Math.random() * 512, 2, 2);
  }
  x.fillStyle = '#dfe3e6';
  x.fillRect(5, 0, 4, 512);      // edge lines
  x.fillRect(119, 0, 4, 512);
  x.fillStyle = 'rgba(230,235,240,0.75)';
  x.fillRect(62, 40, 4, 180);    // dashed centre line
  x.fillRect(62, 300, 4, 180);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const x = c.getContext('2d');
  const s = 16;
  for (let i = 0; i < 128 / s; i++) {
    for (let j = 0; j < 32 / s; j++) {
      x.fillStyle = (i + j) % 2 ? '#15181c' : '#f2f5f7';
      x.fillRect(i * s, j * s, s, s);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
