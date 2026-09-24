import * as THREE from 'three';
import { TRACK } from './config.js';
import { elevationAt } from './tracks.js';
import { grassTexture } from './scenery.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// A closed circuit built from a Catmull-Rom spline on the XZ plane, with a
// separate height profile laid over it. The same evenly spaced sample array
// drives the road geometry and the physics queries, so what you see is exactly
// what the car drives on.
export class Track {
  constructor(def) {
    this.def = def;
    this.theme = def.theme;
    const pts = def.points.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
    this.length = this.curve.getLength();

    const n = TRACK.SAMPLES;
    this.n = n;
    this.points = [];
    this.tangents = [];
    this.sides = [];
    this.heights = [];

    for (let i = 0; i < n; i++) {
      const u = i / n;
      const p = this.curve.getPointAt(u);
      const t = this.curve.getTangentAt(u).setY(0).normalize();
      // cross(tangent, up) is the right-hand side when viewed from behind
      const s = new THREE.Vector3().crossVectors(t, UP).normalize();
      this.points.push(p);
      this.tangents.push(t);
      this.sides.push(s);
      this.heights.push(elevationAt(def, u));
    }
    this.segLen = this.length / n;

    // rise per unit of distance along the track, for the gravity pull on hills
    this.slopes = this.heights.map((_, i) => {
      const a = this.heights[(i - 1 + n) % n];
      const b = this.heights[(i + 1) % n];
      return (b - a) / (2 * this.segLen);
    });

    this.wallLimit = TRACK.HALF_WIDTH + TRACK.WALL_MARGIN;
    this.kerbEdge = TRACK.HALF_WIDTH + TRACK.CURB_WIDTH;
    this.shoulder = this.wallLimit + 2;                    // flat ground ends
    this.foot = this.shoulder + TRACK.EMBANKMENT;          // embankment meets 0
  }

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
      offset: dx * s.x + dz * s.z,   // signed distance from the centreline
      height: elevationAt(this.def, u),
      slope: this.slopes[bestI],
      tangent: t,
      side: s,
      point: p,
    };
  }

  // Ground height anywhere in the world: flat across the roadbed, then an
  // embankment carrying it down to the surrounding ground.
  heightForOffset(u, offset) {
    const h = elevationAt(this.def, u);
    const d = Math.abs(offset);
    if (d <= this.shoulder) return h;
    if (d >= this.foot) return 0;
    const t = (d - this.shoulder) / (this.foot - this.shoulder);
    return h * (1 - t * t * (3 - 2 * t));
  }

  surfaceHeight(x, z, hint) {
    const loc = this.locate(x, z, hint);
    return this.heightForOffset(loc.u, loc.offset);
  }

  // World-space frame at a normalised distance around the lap.
  frameAt(u) {
    u -= Math.floor(u);
    const f = u * this.n;
    const i = Math.floor(f) % this.n;
    const j = (i + 1) % this.n;
    const k = f - Math.floor(f);
    const point = _a.copy(this.points[i]).lerp(this.points[j], k).clone();
    point.y = elevationAt(this.def, u);
    const tangent = _b.copy(this.tangents[i]).lerp(this.tangents[j], k).normalize().clone();
    const side = new THREE.Vector3().crossVectors(tangent, UP).normalize();
    return { point, tangent, side, height: point.y, heading: Math.atan2(tangent.x, tangent.z) };
  }

  build() {
    const group = new THREE.Group();
    group.add(this.#verges());
    group.add(this.#road());
    group.add(this.#kerbs(1));
    group.add(this.#kerbs(-1));
    group.add(this.#barriers());
    group.add(this.#startLine());
    group.add(this.#gantry());
    return group;
  }

  // Ribbon between two lateral offsets. `heightFn(i, edge)` gives the y of the
  // inner (0) and outer (1) edge at sample i, so a strip can slope sideways.
  #ribbon(inner, outer, heightFn, colorFn, uScale = 1) {
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
      pos[o + 0] = p.x + s.x * inner;
      pos[o + 1] = heightFn(i, 0);
      pos[o + 2] = p.z + s.z * inner;
      pos[o + 3] = p.x + s.x * outer;
      pos[o + 4] = heightFn(i, 1);
      pos[o + 5] = p.z + s.z * outer;

      const v = (k * this.segLen) / 10;
      uv[k * 4 + 0] = 0; uv[k * 4 + 1] = v;
      uv[k * 4 + 2] = uScale; uv[k * 4 + 3] = v;

      if (col) {
        colorFn(i, c);
        col[o + 0] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
        col[o + 3] = c.r; col[o + 4] = c.g; col[o + 5] = c.b;
      }
      if (k < n) {
        const a = k * 2, b = a + 1, a2 = a + 2, b2 = a + 3;
        // wind for upward normals, whichever side of the track this is
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
    const g = this.#ribbon(-hw, hw, (i) => this.heights[i] + 0.02);
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: asphaltTexture() }));
    mesh.receiveShadow = true;
    mesh.name = 'road';
    return mesh;
  }

  #kerbs(dir) {
    const hw = TRACK.HALF_WIDTH;
    const red = new THREE.Color('#d0402f');
    const white = new THREE.Color('#eceff2');
    const g = this.#ribbon(dir * hw, dir * this.kerbEdge, (i) => this.heights[i] + 0.05,
      (i, c) => c.copy(Math.floor(i / 4) % 2 === 0 ? red : white));
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    return mesh;
  }

  // Flat grass beside the road, then the embankment down to ground level.
  #verges() {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: grassTexture(1, this.theme.grass) });
    for (const dir of [1, -1]) {
      const flat = new THREE.Mesh(
        this.#ribbon(dir * this.kerbEdge, dir * this.shoulder,
          (i) => this.heights[i], null, (this.shoulder - this.kerbEdge) / 10),
        mat,
      );
      flat.receiveShadow = true;
      group.add(flat);

      const slope = new THREE.Mesh(
        this.#ribbon(dir * this.shoulder, dir * this.foot,
          (i, edge) => (edge === 0 ? this.heights[i] : 0), null, TRACK.EMBANKMENT / 10),
        mat,
      );
      slope.receiveShadow = true;
      group.add(slope);
    }
    return group;
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
      q.setFromAxisAngle(UP, Math.atan2(t.x, t.z));
      for (const dir of [1, -1]) {
        m.compose(
          new THREE.Vector3(
            p.x + s.x * off * dir,
            this.heights[i] + 0.58,
            p.z + s.z * off * dir,
          ),
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
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(hw * 2, 3),
      new THREE.MeshLambertMaterial({ map: checkerTexture() }),
    );
    const f = this.frameAt(0);
    mesh.position.set(f.point.x, f.height + 0.06, f.point.z);
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
      post.position.set(
        f.point.x + f.side.x * span * dir,
        f.height + 3.5,
        f.point.z + f.side.z * span * dir,
      );
      post.castShadow = true;
      g.add(post);
    }
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(f.point.x, f.height + 7.2, f.point.z);
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
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
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
