// Keyboard plus on-screen touch controls, flattened into throttle/steer/drift.
export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false, drift: false };
    this.onAction = null;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (HANDLED.has(k) || HANDLED.has(e.code)) e.preventDefault();
      this.keys.add(k);
      if (this.onAction) this.onAction(k);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }

  bindTouch(root) {
    const map = {
      'btn-left': 'left', 'btn-right': 'right',
      'btn-gas': 'gas', 'btn-brake': 'brake', 'btn-drift': 'drift',
    };
    for (const [id, name] of Object.entries(map)) {
      const el = root.querySelector('#' + id);
      if (!el) continue;
      const set = (v) => (e) => { e.preventDefault(); this.touch[name] = v; };
      el.addEventListener('pointerdown', set(true));
      el.addEventListener('pointerup', set(false));
      el.addEventListener('pointercancel', set(false));
      el.addEventListener('pointerleave', set(false));
    }
  }

  has(...names) { return names.some((n) => this.keys.has(n)); }

  get steer() {
    let s = 0;
    if (this.has('arrowleft', 'a') || this.touch.left) s -= 1;
    if (this.has('arrowright', 'd') || this.touch.right) s += 1;
    return s;
  }

  get throttle() {
    let t = 0;
    if (this.has('arrowup', 'w') || this.touch.gas) t += 1;
    if (this.has('arrowdown', 's') || this.touch.brake) t -= 1;
    return t;
  }

  get drift() { return this.has(' ', 'shift') || this.touch.drift; }
}

const HANDLED = new Set([
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'Space',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);
