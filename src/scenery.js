import * as THREE from 'three';
import { TRACK } from './config.js';

// Deterministic RNG so the trees land in the same place every session.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildWorld(scene, track, tier) {
  const theme = track.theme;
  scene.fog = new THREE.Fog(theme.fog, 260, 900);
  const group = new THREE.Group();
  group.add(sky(theme));
  group.add(ground(theme));
  group.add(foliage(track, tier, theme));
  group.add(hills(theme));
  scene.add(group);
  return group;
}

function sky(theme) {
  const geo = new THREE.SphereGeometry(1400, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(theme.skyTop) },
      bottom: { value: new THREE.Color(theme.skyBottom) },
    },
    vertexShader: `
      varying float vH;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vH = normalize(wp.xyz).y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; varying float vH;
      void main() {
        gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.55, vH)), 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}

export function grassTexture(repeat = 1, base = '#5f8f41') {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, 256, 256);
  // Speckle in lighter and darker shades OF THE BASE, not a fixed green -
  // a green fleck over snow just reads as moss.
  const n = parseInt(base.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  for (let i = 0; i < 9000; i++) {
    const k = 0.72 + Math.random() * 0.5;
    const px = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    x.fillStyle = `rgba(${px(r)},${px(g)},${px(b)},${0.25 + Math.random() * 0.4})`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function ground(theme) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshLambertMaterial({ map: grassTexture(90, theme.grass) }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.02;
  mesh.receiveShadow = true;
  return mesh;
}

// Trackside planting. The shapes themselves change with the theme, so a
// desert reads as a desert rather than as a green circuit with sand on it.
function FLORA(kind, theme) {
  switch (kind) {
    case 'palm':
      return {
        trunk: new THREE.CylinderGeometry(0.22, 0.34, 7, 6),
        trunkY: 3.5,
        canopy: new THREE.ConeGeometry(3.2, 1.6, 7),
        canopyY: 7.4,
        cap: null,
      };
    case 'cactus':
      return {
        trunk: new THREE.CylinderGeometry(0.62, 0.72, 4.4, 7),
        trunkY: 2.2,
        canopy: new THREE.CylinderGeometry(0.42, 0.42, 2.0, 6),
        canopyY: 3.4,
        cap: null,
        canopyOffset: 0.95,          // an arm off the side, not a crown on top
      };
    case 'snowpine':
      return {
        trunk: new THREE.CylinderGeometry(0.3, 0.44, 2.6, 6),
        trunkY: 1.3,
        canopy: new THREE.ConeGeometry(2.4, 6.4, 7),
        canopyY: 5.8,
        cap: new THREE.ConeGeometry(1.5, 2.6, 7),
        capY: 8.2,
      };
    default:
      return {
        trunk: new THREE.CylinderGeometry(0.35, 0.5, 3, 6),
        trunkY: 1.5,
        canopy: new THREE.ConeGeometry(2.6, 7, 7),
        canopyY: 6.5,
        cap: null,
      };
  }
}

function foliage(track, tier, theme) {
  const group = new THREE.Group();
  const rand = rng(20260918);
  const clearance = track.shoulder + 3;
  const kind = theme.flora ?? 'pine';
  const shape = FLORA(kind, theme);

  const maxTrees = Math.round(tier.trees * (theme.density ?? 1));
  const maxRocks = tier.rocks;
  const maxBushes = Math.round(maxTrees * 0.5);

  const trunkMat = new THREE.MeshLambertMaterial({
    color: kind === 'cactus' ? theme.trees : (kind === 'palm' ? '#8a6a44' : '#6b4a2f'),
    flatShading: true,
  });
  const leafMat = new THREE.MeshLambertMaterial({ color: theme.trees, flatShading: true });
  const capMat = new THREE.MeshLambertMaterial({ color: '#f2f7fb', flatShading: true });
  const bushMat = new THREE.MeshLambertMaterial({ color: theme.bush, flatShading: true });
  const rockMat = new THREE.MeshLambertMaterial({ color: theme.rock, flatShading: true });

  const trunks = new THREE.InstancedMesh(shape.trunk, trunkMat, Math.max(1, maxTrees));
  const leaves = new THREE.InstancedMesh(shape.canopy, leafMat, Math.max(1, maxTrees));
  const caps = shape.cap
    ? new THREE.InstancedMesh(shape.cap, capMat, Math.max(1, maxTrees)) : null;
  const bushes = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1.5, 0), bushMat, Math.max(1, maxBushes));
  const rocks = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1.1, 0), rockMat, Math.max(1, maxRocks));
  leaves.castShadow = true;
  bushes.castShadow = true;
  rocks.castShadow = true;
  if (caps) caps.castShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  let trees = 0, stones = 0, shrubs = 0, tries = 0;
  while ((trees < maxTrees || stones < maxRocks || shrubs < maxBushes) && tries < 40000) {
    tries++;
    const x = (rand() - 0.5) * 760;
    const z = (rand() - 0.5) * 820;
    const loc = track.locate(x, z, null);
    if (Math.abs(loc.offset) < clearance) continue;
    const y = track.heightForOffset(loc.u, loc.offset);

    if (trees < maxTrees && rand() < 0.62) {
      const s = 0.7 + rand() * 0.8;
      const spin = rand() * Math.PI * 2;
      q.setFromAxisAngle(up, spin);
      scl.set(s, s, s);
      m.compose(pos.set(x, y + shape.trunkY * s, z), q, scl);
      trunks.setMatrixAt(trees, m);
      const off = shape.canopyOffset ?? 0;
      m.compose(pos.set(
        x + Math.cos(spin) * off * s, y + shape.canopyY * s, z + Math.sin(spin) * off * s,
      ), q, scl);
      leaves.setMatrixAt(trees, m);
      if (caps) {
        m.compose(pos.set(x, y + shape.capY * s, z), q, scl);
        caps.setMatrixAt(trees, m);
      }
      trees++;
    } else if (shrubs < maxBushes && rand() < 0.55) {
      const s = 0.6 + rand() * 0.9;
      q.setFromAxisAngle(up, rand() * Math.PI * 2);
      m.compose(pos.set(x, y + 0.9 * s, z), q, scl.set(s, s * 0.75, s));
      bushes.setMatrixAt(shrubs, m);
      shrubs++;
    } else if (stones < maxRocks) {
      const s = 0.6 + rand() * 1.4;
      q.setFromAxisAngle(up, rand() * Math.PI * 2);
      m.compose(pos.set(x, y + 0.5 * s, z), q, scl.set(s, s * 0.7, s));
      rocks.setMatrixAt(stones, m);
      stones++;
    }
  }
  trunks.count = trees;
  leaves.count = trees;
  bushes.count = shrubs;
  rocks.count = stones;
  if (caps) caps.count = trees;
  for (const im of [trunks, leaves, bushes, rocks, caps]) {
    if (im) im.instanceMatrix.needsUpdate = true;
  }
  group.add(trunks, leaves, bushes, rocks);
  if (caps) group.add(caps);
  return group;
}

function hills(theme) {
  const group = new THREE.Group();
  const rand = rng(77);
  const mat = new THREE.MeshLambertMaterial({ color: theme.hills, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rand() * 0.3;
    const r = 700 + rand() * 260;
    const h = 60 + rand() * 90;
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(h * 1.6, h, 5), mat);
    mesh.position.set(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r);
    mesh.rotation.y = rand() * Math.PI;
    group.add(mesh);
  }
  return group;
}

// A recycled pool of dark quads dropped under the rear wheels while sliding.
export class SkidMarks {
  constructor(scene, max = 600) {
    const geo = new THREE.PlaneGeometry(0.5, 0.9);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: '#15161a', transparent: true, opacity: 0.4, depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.max = max;
    this.i = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.scale = new THREE.Vector3(1, 1, 1);
    this.hidden = new THREE.Vector3(0, -500, 0);
    scene.add(this.mesh);
  }

  drop(point, heading) {
    this.q.setFromAxisAngle(this.up, heading);
    point.y += 0.07;
    this.m.compose(point, this.q, this.scale);
    this.mesh.setMatrixAt(this.i, this.m);
    this.i = (this.i + 1) % this.max;
    this.mesh.count = Math.min(this.max, this.mesh.count + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.mesh.count = 0;
    this.i = 0;
  }
}
