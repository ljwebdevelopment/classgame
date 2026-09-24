import * as THREE from 'three';

// One CPU-driven pool per blend mode: soft puffs for tyre smoke and dirt,
// additive specks for barrier sparks. Both are instanced, so the whole
// effects layer costs two draw calls.
class Pool {
  constructor(scene, max, material, geometry) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, max));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);

    this.pos = [];
    this.vel = [];
    this.life = new Float32Array(max);
    this.max_life = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.colors = [];
    for (let i = 0; i < max; i++) {
      this.pos.push(new THREE.Vector3());
      this.vel.push(new THREE.Vector3());
      this.colors.push(new THREE.Color());
    }
    this.live = 0;
    this._m = new THREE.Matrix4();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  emit(p, v, { life, size, grow, color, drag = 0.6 }) {
    if (this.live >= this.max) return;
    const i = this.live++;
    this.pos[i].copy(p);
    this.vel[i].copy(v);
    this.life[i] = life;
    this.max_life[i] = life;
    this.size0[i] = size;
    this.size1[i] = size * grow;
    this.colors[i].set(color);
    this.drag[i] = drag;
  }

  update(dt, quat, gravity) {
    for (let i = 0; i < this.live; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap the dead particle with the last live one
        const j = --this.live;
        if (i !== j) {
          this.pos[i].copy(this.pos[j]);
          this.vel[i].copy(this.vel[j]);
          this.life[i] = this.life[j];
          this.max_life[i] = this.max_life[j];
          this.size0[i] = this.size0[j];
          this.size1[i] = this.size1[j];
          this.drag[i] = this.drag[j];
          this.colors[i].copy(this.colors[j]);
        }
        i--;
        continue;
      }
      this.vel[i].y -= gravity * dt;
      this.vel[i].multiplyScalar(1 - Math.min(1, this.drag[i] * dt));
      this.pos[i].addScaledVector(this.vel[i], dt);
    }

    for (let i = 0; i < this.live; i++) {
      const k = 1 - this.life[i] / this.max_life[i];      // 0 new, 1 dying
      const s = this.size0[i] + (this.size1[i] - this.size0[i]) * k;
      this._s.set(s, s, s);
      this._m.compose(this.pos[i], quat, this._s);
      this.mesh.setMatrixAt(i, this._m);
      // fade by darkening toward the additive/alpha floor
      this._c.copy(this.colors[i]).multiplyScalar(1 - k * k);
      this.mesh.setColorAt(i, this._c);
    }
    this.mesh.count = this.live;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.live = 0; this.mesh.count = 0; }
}

export class Effects {
  constructor(scene, tier, theme = {}) {
    this.dust = theme.dust ?? '#8a7a52';
    const quad = new THREE.PlaneGeometry(1, 1);
    this.puffs = new Pool(scene, tier.puffs, new THREE.MeshBasicMaterial({
      map: softTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      opacity: 0.42,
    }), quad);
    this.sparks = new Pool(scene, tier.sparks, new THREE.MeshBasicMaterial({
      map: softTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }), quad);
    this._v = new THREE.Vector3();
  }

  // white tyre smoke, thrown backwards from a sliding wheel
  smoke(p, heading, amount) {
    this._v.set(
      (Math.random() - 0.5) * 2.4 - Math.sin(heading) * amount * 0.1,
      1.1 + Math.random() * 1.4,
      (Math.random() - 0.5) * 2.4 - Math.cos(heading) * amount * 0.1,
    );
    this.puffs.emit(p, this._v, {
      life: 0.6 + Math.random() * 0.4,
      size: 0.9, grow: 2.7, color: '#e8e4de', drag: 1.2,
    });
  }

  // darker, heavier spray off the grass
  dirt(p, amount) {
    this._v.set(
      (Math.random() - 0.5) * 3.5,
      1.6 + Math.random() * 2.2,
      (Math.random() - 0.5) * 3.5,
    );
    this.puffs.emit(p, this._v, {
      life: 0.5 + Math.random() * 0.4,
      size: 0.7, grow: 2.6, color: this.dust, drag: 1.6,
    });
  }

  // hot specks where the bodywork scrapes a barrier
  spark(p, normal) {
    for (let i = 0; i < 3; i++) {
      this._v.copy(normal).multiplyScalar(2 + Math.random() * 5);
      this._v.x += (Math.random() - 0.5) * 6;
      this._v.y += 2 + Math.random() * 5;
      this._v.z += (Math.random() - 0.5) * 6;
      this.sparks.emit(p, this._v, {
        life: 0.22 + Math.random() * 0.2,
        size: 0.34, grow: 0.3,
        color: Math.random() < 0.5 ? '#ffd27a' : '#ff9240',
        drag: 0.3,
      });
    }
  }

  // dust ring thrown out on touchdown
  landing(p, force) {
    const n = Math.min(10, 3 + Math.round(force * 0.5));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this._v.set(Math.cos(a) * 5, 0.8 + Math.random(), Math.sin(a) * 5);
      this.puffs.emit(p, this._v, {
        life: 0.5 + Math.random() * 0.3,
        size: 0.9, grow: 3, color: this.dust, drag: 2.2,
      });
    }
  }

  update(dt, quat) {
    this.puffs.update(dt, quat, 1.2);
    this.sparks.update(dt, quat, 14);
  }

  clear() { this.puffs.clear(); this.sparks.clear(); }
}

function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
