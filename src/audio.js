// Tiny synthesised engine: one detuned sawtooth pair through a lowpass, plus a
// noise bed for tyre scrub. No audio files, so nothing extra to download.
export class Engine {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('apex-drift.muted') === '1';
  }

  start() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 900;
    this.filter.Q.value = 3;
    this.filter.connect(this.master);

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineGain.connect(this.filter);

    this.oscA = ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscB = ctx.createOscillator();
    this.oscB.type = 'square';
    this.oscA.connect(this.engineGain);
    this.oscB.connect(this.engineGain);
    this.oscA.start();
    this.oscB.start();

    // skid: white noise through a bandpass
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf;
    this.noise.loop = true;
    this.skidBand = ctx.createBiquadFilter();
    this.skidBand.type = 'bandpass';
    this.skidBand.frequency.value = 2200;
    this.skidBand.Q.value = 1.2;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    this.noise.connect(this.skidBand);
    this.skidBand.connect(this.skidGain);
    this.skidGain.connect(this.master);
    this.noise.start();
  }

  resume() {
    this.start();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  update(speed, throttle, slip) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const norm = Math.min(1, speed / 57);
    // fake gears so the pitch sweeps instead of rising in one long ramp
    const gear = Math.floor(norm * 4.999);
    const within = norm * 5 - gear;
    const freq = 58 + within * 95 + gear * 9;

    this.oscA.frequency.setTargetAtTime(freq, t, 0.06);
    this.oscB.frequency.setTargetAtTime(freq * 0.5, t, 0.06);
    this.filter.frequency.setTargetAtTime(500 + norm * 1800, t, 0.1);
    this.engineGain.gain.setTargetAtTime(
      0.05 + norm * 0.09 + (throttle > 0 ? 0.045 : 0), t, 0.08);
    this.skidGain.gain.setTargetAtTime(Math.min(0.14, slip * 0.014), t, 0.05);
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('apex-drift.muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }
}
