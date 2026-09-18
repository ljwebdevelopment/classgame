export function formatTime(t) {
  if (t == null || !isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

export function formatDelta(d) {
  if (d == null || !isFinite(d)) return '';
  return `${d >= 0 ? '+' : '-'}${Math.abs(d).toFixed(2)}`;
}

export class Hud {
  constructor(root) {
    this.el = {};
    for (const id of ['speed', 'lap-time', 'best-time', 'delta', 'lap-count',
      'toast', 'countdown', 'ghost-state']) {
      this.el[id] = root.querySelector('#' + id);
    }
    this.toastTimer = 0;
  }

  update(dt, state) {
    this.el.speed.textContent = Math.round(state.speed * 3.6);
    this.el['lap-time'].textContent = formatTime(state.lapTime);
    this.el['best-time'].textContent = formatTime(state.best);
    this.el['lap-count'].textContent = state.laps;

    const d = this.el.delta;
    if (state.delta == null) {
      d.textContent = '';
      d.className = 'delta';
    } else {
      d.textContent = formatDelta(state.delta);
      d.className = 'delta ' + (state.delta <= 0 ? 'ahead' : 'behind');
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove('show');
    }
  }

  toast(text, kind = '', seconds = 3) {
    this.el.toast.textContent = text;
    this.el.toast.className = 'toast show ' + kind;
    this.toastTimer = seconds;
  }

  countdown(text) {
    const el = this.el.countdown;
    if (!text) { el.classList.remove('show'); return; }
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;   // restart the pop animation
    el.classList.add('show');
  }

  ghostState(text) { this.el['ghost-state'].textContent = text; }
}
