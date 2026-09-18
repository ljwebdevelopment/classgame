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

export function buildWorld(scene, track) {
  scene.fog = new THREE.Fog('#a9cbe6', 260, 900);
  scene.add(sky());
  scene.add(ground());
  scene.add(foliage(track));
  scene.add(hills());
  return scene;
}

function sky() {
  const geo = new THREE.SphereGeometry(1400, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color('#3f86c9') },
      bottom: { value: new THREE.Color('#cfe3f2') },
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

function ground() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#5f8f41';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const g = 60 + Math.random() * 60;
    x.fillStyle = `rgba(${g * 0.7},${g},${g * 0.45},${0.2 + Math.random() * 0.35})`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(90, 90);
  tex.colorSpace = THREE.SRGBColorSpace;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshLambertMaterial({ map: tex }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.02;
  mesh.receiveShadow = true;
  return mesh;
}

function foliage(track) {
  const group = new THREE.Group();
  const rand = rng(20260918);
  const clearance = TRACK.HALF_WIDTH + TRACK.BARRIER_OFFSET + 6;

  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 6);
  const leafGeo = new THREE.ConeGeometry(2.6, 7, 7);
  const rockGeo = new THREE.IcosahedronGeometry(1.1, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#6b4a2f', flatShading: true });
  const leafMat = new THREE.MeshLambertMaterial({ color: '#2f7a42', flatShading: true });
  const rockMat = new THREE.MeshLambertMaterial({ color: '#8a8f96', flatShading: true });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, 300);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, 300);
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 90);
  leaves.castShadow = true;
  rocks.castShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  let trees = 0, stones = 0, tries = 0;
  while ((trees < 300 || stones < 90) && tries < 20000) {
    tries++;
    const x = (rand() - 0.5) * 760;
    const z = (rand() - 0.5) * 820;
    const loc = track.locate(x, z, null);
    const clear = Math.abs(loc.offset);
    if (clear < clearance) continue;

    if (trees < 300 && rand() < 0.78) {
      const s = 0.7 + rand() * 0.8;
      q.setFromAxisAngle(up, rand() * Math.PI * 2);
      scl.set(s, s, s);
      m.compose(pos.set(x, 1.5 * s, z), q, scl);
      trunks.setMatrixAt(trees, m);
      m.compose(pos.set(x, (3 + 3.5) * s, z), q, scl);
      leaves.setMatrixAt(trees, m);
      trees++;
    } else if (stones < 90) {
      const s = 0.6 + rand() * 1.4;
      q.setFromAxisAngle(up, rand() * Math.PI * 2);
      m.compose(pos.set(x, 0.5 * s, z), q, scl.set(s, s * 0.7, s));
      rocks.setMatrixAt(stones, m);
      stones++;
    }
  }
  trunks.count = trees;
  leaves.count = trees;
  rocks.count = stones;
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  rocks.instanceMatrix.needsUpdate = true;
  group.add(trunks, leaves, rocks);
  return group;
}

function hills() {
  const group = new THREE.Group();
  const rand = rng(77);
  const mat = new THREE.MeshLambertMaterial({ color: '#6f94a8', flatShading: true });
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
    point.y = 0.07;
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
