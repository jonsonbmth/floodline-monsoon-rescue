// Every sound is synthesized live with WebAudio — no audio files, no network.
// Rain is filtered noise, the engine is a detuned saw pair, and the rest are
// short envelopes over oscillators and noise bursts.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.rainGain = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.padOsc = null;
    this.padGain = null;
    this.padTimer = 0;
    this.padStep = 0;
  }

  // Must be called from a user gesture at least once.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.startRain();
    this.startEngine();
    this.startPad();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
  }

  makeNoiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  startRain() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.makeNoiseBuffer(2);
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.4;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0.045;
    src.connect(filter).connect(this.rainGain).connect(this.master);
    src.start();
  }

  setRainLevel(level) {
    if (this.rainGain && this.ctx) {
      this.rainGain.gain.setTargetAtTime(0.02 + level * 0.06, this.ctx.currentTime, 0.5);
    }
  }

  startEngine() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 52;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 220;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  // speed01 0..1, throttle true while the player steers.
  setEngine(speed01, throttle, boosting) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const target = throttle ? 0.05 + speed01 * 0.05 : 0.015;
    this.engineGain.gain.setTargetAtTime(target, t, 0.1);
    const freq = 48 + speed01 * 46 + (boosting ? 18 : 0);
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(freq * 1.06, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(180 + speed01 * 500, t, 0.1);
  }

  // A slow, low ambient pad that drifts through a minor chord cycle.
  startPad() {
    this.padOsc = this.ctx.createOscillator();
    this.padOsc.type = 'triangle';
    this.padOsc.frequency.value = 110;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 164.8;
    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    this.padOsc.connect(filter);
    osc2.connect(filter);
    filter.connect(this.padGain).connect(this.master);
    this.padOsc.start();
    osc2.start();
    this.padOsc2 = osc2;
  }

  updatePad(dt, playing) {
    if (!this.ctx || !this.padGain) return;
    const t = this.ctx.currentTime;
    this.padGain.gain.setTargetAtTime(playing ? 0.028 : 0.012, t, 1);
    this.padTimer += dt;
    if (this.padTimer > 9) {
      this.padTimer = 0;
      this.padStep = (this.padStep + 1) % 4;
      // A minor drift: A2, F2, C3, G2 roots with a fifth above.
      const roots = [110, 87.3, 130.8, 98];
      const f = roots[this.padStep];
      this.padOsc.frequency.setTargetAtTime(f, t, 2);
      this.padOsc2.frequency.setTargetAtTime(f * 1.5, t, 2);
    }
  }

  tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noiseBurst(dur, vol, filterFreq, when = 0, type = 'lowpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.makeNoiseBuffer(Math.max(dur, 0.1));
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  click() { this.tone(880, 0.07, 'sine', 0.12); }
  rescue() {
    this.tone(660, 0.12, 'sine', 0.16);
    this.tone(990, 0.18, 'sine', 0.16, 0.09);
  }
  deliver(combo) {
    const base = 523 * (1 + Math.min(combo, 5) * 0.06);
    this.tone(base, 0.12, 'triangle', 0.18);
    this.tone(base * 1.25, 0.12, 'triangle', 0.18, 0.1);
    this.tone(base * 1.5, 0.24, 'triangle', 0.2, 0.2);
  }
  crash() {
    this.tone(70, 0.25, 'sine', 0.5, 0, 38);
    this.noiseBurst(0.2, 0.3, 400);
  }
  thunder() {
    this.noiseBurst(1.6, 0.5, 110);
    this.noiseBurst(2.4, 0.25, 70, 0.25);
  }
  siren() {
    this.tone(740, 0.5, 'sine', 0.1, 0, 980);
    this.tone(980, 0.5, 'sine', 0.1, 0.5, 740);
  }
  upgrade() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.14, i * 0.08));
  }
  victory() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.16, i * 0.13));
  }
  gameover() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.16, i * 0.22));
  }
  horn() {
    this.tone(220, 0.35, 'sawtooth', 0.08);
    this.tone(277, 0.35, 'sawtooth', 0.06);
  }
}
