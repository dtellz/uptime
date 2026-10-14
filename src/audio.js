const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** All music and effects are synthesized locally; no media downloads or services. */
export class Soundscape {
  constructor({ enabled = true, volume = 0.65 } = {}) {
    this.enabled = enabled;
    this.volume = volume;
    this.context = null;
    this.last = {};
    this.nextBeat = 0;
    this.beat = 0;
  }

  async unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.enabled ? this.volume * 0.4 : 0;
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.ratio.value = 5;
      this.master.connect(compressor);
      compressor.connect(this.context.destination);
      this.reverb = this.context.createConvolver();
      const len = this.context.sampleRate * 1.5;
      const impulse = this.context.createBuffer(2, len, this.context.sampleRate);
      let state = 617;
      for (let c = 0; c < 2; c++) {
        const data = impulse.getChannelData(c);
        for (let i = 0; i < len; i++) {
          state = (state * 16807) % 2147483647;
          data[i] = (state / 1073741824 - 1) * Math.pow(1 - i / len, 3);
        }
      }
      this.reverb.buffer = impulse;
      const wet = this.context.createGain(); wet.gain.value = 0.24;
      this.reverb.connect(wet); wet.connect(this.master);
      this.nextBeat = this.context.currentTime;
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.context) this.master.gain.setTargetAtTime(enabled ? this.volume * 0.4 : 0, this.context.currentTime, 0.08);
  }
  setVolume(volume) {
    this.volume = clamp(volume, 0, 1);
    this.setEnabled(this.enabled);
  }

  tone(freq, duration, type = 'sine', gain = 0.15, endFreq = freq, delay = 0, pan = 0) {
    if (!this.context || !this.enabled || this.context.state !== 'running') return;
    const t = this.context.currentTime + delay;
    const osc = this.context.createOscillator();
    const amp = this.context.createGain();
    const stereo = this.context.createStereoPanner();
    stereo.pan.value = clamp(pan, -1, 1);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(15, endFreq), t + duration);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(gain, t + Math.min(0.012, duration / 3));
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp); amp.connect(stereo); stereo.connect(this.master);
    if (duration > 0.2) amp.connect(this.reverb);
    osc.start(t); osc.stop(t + duration + 0.02);
    osc.onended = () => { osc.disconnect(); amp.disconnect(); stereo.disconnect(); };
  }

  noise(duration, volume = 0.1, cutoff = 1000) {
    if (!this.context || !this.enabled) return;
    const t = this.context.currentTime;
    const buffer = this.context.createBuffer(1, this.context.sampleRate * duration, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = this.context.createBufferSource(); source.buffer = buffer;
    const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = cutoff;
    const amp = this.context.createGain(); amp.gain.setValueAtTime(volume, t); amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter); filter.connect(amp); amp.connect(this.master);
    source.start(); source.onended = () => { source.disconnect(); filter.disconnect(); amp.disconnect(); };
  }

  play(name) {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    const gap = { fire: 0.1, pickup: 0.07, kill: 0.065, impact: 0.1 }[name] || 0;
    if (now - (this.last[name] ?? -100) < gap) return;
    this.last[name] = now;
    switch (name) {
      case 'ui': this.tone(650, 0.08, 'sine', 0.1, 850); break;
      case 'start': [146.83, 220, 293.66, 440].forEach((f, i) => this.tone(f, 0.7, 'sine', 0.25, f, i * 0.08)); break;
      case 'fire': this.tone(1050, 0.065, 'sine', 0.045, 300); break;
      case 'kill': this.tone(160, 0.1, 'triangle', 0.07, 45); break;
      case 'pickup': this.tone(800 + this.beat % 5 * 80, 0.07, 'sine', 0.045, 1300); break;
      case 'dash': this.noise(0.24, 0.2, 2600); this.tone(160, 0.2, 'sine', 0.2, 700); break;
      case 'nova': this.noise(0.8, 0.4, 1700); this.tone(180, 0.8, 'sine', 0.6, 25); this.tone(600, 0.5, 'sine', 0.2, 140); break;
      case 'error': this.tone(110, 0.3, 'sawtooth', 0.16, 40); this.noise(0.15, 0.2, 900); break;
      case 'level': [293.66, 440, 587.33, 880].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.18, f, i * 0.07)); break;
      case 'upgrade': this.tone(440, 0.2, 'sine', 0.12, 880); this.tone(110, 0.4, 'sine', 0.25); break;
      case 'wave': case 'boss': this.tone(73.42, 1.2, 'sawtooth', 0.12, 55); this.tone(147.3, 1, 'sine', 0.13, 110); break;
      case 'repair': this.tone(392, 0.4, 'sine', 0.15, 783); break;
      case 'death': this.noise(1.6, 0.4, 1600); this.tone(146.83, 2.6, 'sawtooth', 0.2, 19); break;
      case 'victory': [146.83, 220, 293.66, 369.99, 440, 587.33].forEach((f, i) => this.tone(f, 1.8, 'sine', 0.18, f, i * 0.12)); break;
    }
  }

  update(sim) {
    if (!this.context || !this.enabled || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    if (sim.mode !== 'running') { this.nextBeat = now; return; }
    if (this.nextBeat < now - 0.3) this.nextBeat = now;
    if (now < this.nextBeat) return;
    const interval = 60 / (105 + Math.min(sim.time / 12, 25)) / 2;
    this.nextBeat = now + interval;
    const step = this.beat++ % 16;
    const notes = [146.83, 220, 293.66, 220, 174.61, 220, 349.23, 220, 130.81, 196, 261.63, 196, 130.81, 196, 293.66, 220];
    this.tone(notes[step] * 2, interval * 1.7, 'sine', 0.037, notes[step] * 2, 0, Math.sin(this.beat) * 0.4);
    if (step % 4 === 0) { this.tone(step < 8 ? 73.42 : 65.41, 0.8, 'triangle', 0.12); this.tone(100, 0.18, 'sine', 0.25, 32); }
    if (step % 4 === 2 && sim.time > 25) this.noise(0.09, 0.035, 3800);
    if (sim.time > 90 && step % 2) this.noise(0.025, 0.019, 6500);
  }

  async suspend() { if (this.context?.state === 'running') await this.context.suspend(); }
}
