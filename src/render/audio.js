// Sound effects are synthesised, no samples: one engine voice follows the camera's
// subject, with impacts, tyre scrub and a crowd bed on top. The music is a plain
// audio element, which plays from disk where fetching a file for Web Audio can't.

const MUSIC_VOLUME = 0.5;

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.music = document.createElement('audio');
    this.music.src = 'music.mp3';
    this.music.loop = true;
    this.music.preload = 'auto';
    this.music.volume = MUSIC_VOLUME;
  }

  playMusic() {
    this.music.play().catch(() => {
      // Blocked until a gesture counts, or the file is missing. The race runs regardless.
    });
  }

  start() {
    this.playMusic();
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Lumpy V8: two detuned saws through a low filter with a growl LFO.
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 500;
    this.engineFilter.Q.value = 3;
    this.oscA = ctx.createOscillator();
    this.oscB = ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscB.type = 'square';
    this.oscA.connect(this.engineFilter);
    const bGain = ctx.createGain();
    bGain.gain.value = 0.45;
    this.oscB.connect(bGain).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.oscA.start();
    this.oscB.start();

    this.scrubGain = ctx.createGain();
    this.scrubGain.gain.value = 0;
    const scrubSrc = ctx.createBufferSource();
    scrubSrc.buffer = this.noiseBuffer;
    scrubSrc.loop = true;
    const scrubFilter = ctx.createBiquadFilter();
    scrubFilter.type = 'bandpass';
    scrubFilter.frequency.value = 950;
    scrubFilter.Q.value = 1.4;
    scrubSrc.connect(scrubFilter).connect(this.scrubGain).connect(this.master);
    scrubSrc.start();

    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.07;
    const crowdSrc = ctx.createBufferSource();
    crowdSrc.buffer = this.noiseBuffer;
    crowdSrc.loop = true;
    const crowdFilter = ctx.createBiquadFilter();
    crowdFilter.type = 'bandpass';
    crowdFilter.frequency.value = 620;
    crowdFilter.Q.value = 0.5;
    crowdSrc.connect(crowdFilter).connect(this.crowdGain).connect(this.master);
    crowdSrc.start();
  }

  setMuted(m) {
    this.muted = m;
    this.music.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  setEngine(rpm, throttle, slide, near) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = (rpm / 60) * 2; // firing frequency of half the cylinders of a V8
    this.oscA.frequency.setTargetAtTime(f, t, 0.03);
    this.oscB.frequency.setTargetAtTime(f * 0.502, t, 0.03);
    this.engineFilter.frequency.setTargetAtTime(280 + rpm * 0.2 + throttle * 500, t, 0.05);
    this.engineGain.gain.setTargetAtTime((0.09 + throttle * 0.14) * near, t, 0.05);
    this.scrubGain.gain.setTargetAtTime(Math.min(0.2, slide * 0.018) * near, t, 0.06);
  }

  crunch(strength, near) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.45 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500 + strength * 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7 * strength * near + 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3 + strength * 0.5);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 1);

    const thud = ctx.createOscillator();
    thud.frequency.setValueAtTime(120, t);
    thud.frequency.exponentialRampToValueAtTime(34, t + 0.22);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.8 * strength * near, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    thud.connect(tg).connect(this.master);
    thud.start(t);
    thud.stop(t + 0.32);

    if (strength > 0.25) this.cheer(strength);
  }

  // One pitched sweep, the building block of most of the arsenal.
  tone(from, to, seconds, type, level, near = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level * near, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  hiss(frequency, seconds, level, near = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = frequency;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level * near, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + seconds + 0.02);
  }

  pickup(near) {
    this.tone(520, 1040, 0.12, 'square', 0.1, near);
    setTimeout(() => this.tone(780, 1560, 0.14, 'square', 0.08, near), 80);
  }

  launch(near) {
    this.hiss(1400, 0.5, 0.35, near);
    this.tone(180, 620, 0.35, 'sawtooth', 0.12, near);
  }

  boom(near) {
    this.tone(150, 26, 0.7, 'sine', 1, near);
    this.hiss(320, 0.8, 0.8, near);
    this.cheer(0.45);
  }

  foghorn(near) {
    this.tone(118, 104, 1.1, 'sawtooth', 0.5, near);
    this.tone(148, 130, 1.1, 'square', 0.22, near);
  }

  boing(near) {
    this.tone(120, 820, 0.45, 'triangle', 0.55, near);
  }

  moo(near) {
    this.tone(150, 92, 0.9, 'sawtooth', 0.32, near);
  }

  whirr(near) {
    this.tone(300, 900, 1.2, 'sawtooth', 0.14, near);
  }

  clank(near) {
    this.tone(1900, 700, 0.12, 'square', 0.2, near);
  }

  // Every note on the keyboard at once, then the frame hits the floor.
  pianoCrash(near) {
    for (const note of [65, 82, 110, 139, 233, 311, 466, 622, 932]) {
      this.tone(note, note * 0.985, 1.4, 'triangle', 0.16, near);
    }
    this.boom(near);
  }

  cheer(amount) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.cancelScheduledValues(t);
    this.crowdGain.gain.setTargetAtTime(0.07 + amount * 0.24, t, 0.08);
    this.crowdGain.gain.setTargetAtTime(0.07, t + 0.6, 0.9);
  }
}
