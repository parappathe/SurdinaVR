// Sons sintetizados na hora (sem arquivos). Só liga depois de um clique ou da entrada no VR;
// os testes nunca chamam unlock, então nunca tocam nada.
export class Sfx {
  constructor() { this.ctx = null; this.on = true; }

  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.9 : 0;
      this.master.connect(this.ctx.destination);
      this.white = this.makeNoise(3, false);
      this.brown = this.makeNoise(3, true);
      this.startAmbience();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }
  makeNoise(sec, brown) {
    const c = this.ctx;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * sec), c.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { b = 0.98 * b + 0.02 * w; d[i] = b * 7; } else d[i] = w * 0.5;
    }
    return buf;
  }
  loop(buf, type, freq, q) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    return { f, g };
  }
  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0, attack = 0.004 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, { vol = 0.1, freq = 1200, q = 1, at = 0, type = 'bandpass', attack = 0, sweep = 0 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.white;
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t + dur);
    g.gain.setValueAtTime(attack ? 0.0001 : vol, t);
    if (attack) g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 2); src.stop(t + dur + 0.05);
  }

  click() { this.tone(880, 0.05, { vol: 0.07, type: 'square' }); }
  good() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.25, { vol: 0.1, type: 'triangle', at: i * 0.08 })); }
  bad() { this.tone(330, 0.5, { vol: 0.1, type: 'triangle', slide: 0.7 }); this.tone(262, 0.6, { vol: 0.06, type: 'sine', slide: 0.7, at: 0.12 }); }
  fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i === 5 ? 0.7 : 0.18, { vol: 0.12, type: 'triangle', at: i * 0.12 })); }
  star(n) { this.tone(784 * (1 + n * 0.26), 0.35, { vol: 0.12, type: 'triangle' }); }

  // ---- Na Surdina ----
  pick() { this.tone(980, 0.05, { vol: 0.06, type: 'triangle', slide: 1.2 }); }
  deny() { this.tone(180, 0.15, { vol: 0.08, type: 'square' }); }
  // passo na ponta do pé
  step() { this.noise(0.05, { vol: 0.05, freq: 2600, q: 3 }); this.tone(220, 0.06, { vol: 0.03, type: 'sine', at: 0.02 }); }
  wait() { this.tone(660, 0.05, { vol: 0.04, type: 'sine' }); this.tone(660, 0.05, { vol: 0.03, type: 'sine', at: 0.18 }); }
  undo() { this.tone(520, 0.12, { vol: 0.06, type: 'triangle', slide: 0.7 }); }
  coin() { this.tone(1320, 0.08, { vol: 0.08, type: 'square' }); this.tone(1760, 0.2, { vol: 0.07, type: 'square', at: 0.07 }); }
  jewel() { [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.3, { vol: 0.07, type: 'sine', at: i * 0.07 })); }
  // sirene do alarme
  alarm() { for (let k = 0; k < 4; k++) { this.tone(880, 0.25, { vol: 0.1, type: 'sawtooth', at: k * 0.5, slide: 0.75 }); this.tone(660, 0.25, { vol: 0.09, type: 'sawtooth', at: k * 0.5 + 0.25, slide: 1.3 }); } }

  // Museu à noite: zumbido de ar-condicionado e um relógio ao longe
  startAmbience() { this.amb = this.loop(this.brown, 'lowpass', 180, 0.6); this.amb.g.gain.value = 0.04; this.tickT = 1; this.tickN = 0; }
  updateAmbience(dt) {
    if (!this.ctx) return;
    this.tickT -= dt;
    if (this.tickT > 0) return;
    this.tickT = 1;
    this.tone(this.tickN++ % 2 ? 1800 : 1500, 0.03, { vol: 0.012, type: 'square' });
  }
}
