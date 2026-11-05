// Sound effects are samples rendered in this browser by inverse FFT (see foley.js),
// nothing downloaded. They render in the background from page load, so the title
// screen pays for them, and each one starts working as it arrives. The music is a
// plain audio element, which plays from disk where fetching a file for Web Audio can't.

import { SAMPLE_RATE } from './spectral.js';
import { ENGINE_RPMS, SOUNDS, render } from './foley.js';

const MUSIC_VOLUME = 0.5;
const EFFECTS_VOLUME = 0.85;
const REVERB_SEND = 0.3;
const MAX_VOICES = 28;
const REPEAT_GAP = 0.04; // the same sound twice inside this is one sound

// What each weapon sounds like leaving the car, and how loud.
export const FIRED = {
  barnBurner: ['barnBurner', 0.7],
  grudgeSeeker: ['grudgeSeeker', 0.6],
  welcomeMat: ['welcomeMat', 0.9],
  oilSlick: ['oilSlick', 0.55],
  smokeBomb: ['smokeBomb', 0.55],
  threshingWhirl: ['threshingWhirl', 0.65],
  repoHook: ['repoHook', 0.9],
  bedspring: ['bedspring', 0.85],
  backhander: ['sleeve', 0.7],
  grandPiano: ['grandPiano', 0.4],
  foghorn: ['foghorn', 0.75],
};

// The last thing on the bus. Clean up to the knee, then bends into a ceiling that a
// pile-up of explosions cannot pass, where a compressor would let the first peak through.
const KNEE = 0.77;
const CEILING = 0.97;
export function softLimit(x) {
  const size = Math.abs(x);
  if (size <= KNEE) return x;
  return Math.sign(x) * (KNEE + (CEILING - KNEE) * Math.tanh((size - KNEE) / (CEILING - KNEE)));
}

const LIMITER_RANGE = 2; // a wave shaper only reads -1 to 1, so the bus is halved going in

function limiterCurve() {
  const curve = new Float32Array(8193);
  for (let i = 0; i < curve.length; i++) curve[i] = softLimit((i / 4096 - 1) * LIMITER_RANGE);
  return curve;
}

const CLOSE = { near: 1, pan: 0 };
const nextTask = () => new Promise((resolve) => setTimeout(resolve));

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bank = {};
    this.last = {};
    this.lastPlayed = {};
    this.voices = 0;
    this.music = document.createElement('audio');
    this.music.src = 'music.mp3';
    this.music.loop = true;
    this.music.preload = 'auto';
    this.music.volume = MUSIC_VOLUME;
    this.rendered = this.renderLibrary();
  }

  async renderLibrary() {
    for (const [name, sound] of Object.entries(SOUNDS)) {
      const takes = [];
      for (let take = 0; take < (sound.takes ?? 1); take++) {
        await nextTask();
        const channels = render(name, take);
        const buffer = new AudioBuffer({ length: channels[0].length, numberOfChannels: channels.length, sampleRate: SAMPLE_RATE });
        channels.forEach((c, i) => buffer.copyToChannel(c, i));
        takes.push(buffer);
        this.bank[name] = takes;
      }
      this.connect(name);
    }
  }

  // Puts a finished sound to work, if the graph that needs it exists yet.
  connect(name) {
    if (!this.ctx || !this.bank[name]) return;
    const buffer = this.bank[name][0];
    if (name === 'grandstands') this.reverb.buffer = buffer;
    this.loops[name]?.(buffer);
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
    const ctx = new Ctx({ sampleRate: SAMPLE_RATE });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : EFFECTS_VOLUME;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -9;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    const headroom = ctx.createGain();
    headroom.gain.value = 1 / LIMITER_RANGE;
    const limiter = ctx.createWaveShaper();
    limiter.curve = limiterCurve();
    this.master.connect(comp).connect(headroom).connect(limiter).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.connect(this.master);

    // One engine, the car on camera, from three recordings of it at two loads each.
    // Resampling one loop across the whole rev range would drag its pipe resonances along.
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 18000;
    this.ducked = ctx.createGain();
    this.ducked.connect(this.master);
    this.engineFilter.connect(this.engineGain).connect(this.ducked);
    this.engineVoices = [];
    this.loops = {};
    ENGINE_RPMS.forEach((rpm, band) => {
      const prefix = ['engineLow', 'engineMid', 'engineHigh'][band];
      for (const [load, suffix] of [[0, 'Off'], [1, 'On']]) {
        const voice = { band, load, rpm, gain: ctx.createGain(), source: null };
        voice.gain.gain.value = 0;
        voice.gain.connect(this.engineFilter);
        this.engineVoices.push(voice);
        this.loops[prefix + suffix] = (buffer) => {
          voice.source = this.startLoop(buffer, voice.gain);
        };
      }
    });

    this.scrubGain = this.makeBed('scrub', 0, this.ducked);
    this.squealGain = this.makeBed('squeal', 0, this.ducked);
    this.roadGain = this.makeBed('road', 0, this.ducked);
    this.grindGain = this.makeBed('grind', 0, this.master);
    this.crowdGain = this.makeBed('crowd', 0.055, this.ducked);
    this.cheerGain = this.makeBed('cheer', 0, this.master);

    for (const name of Object.keys(SOUNDS)) this.connect(name);
  }

  makeBed(name, level, destination) {
    const gain = this.ctx.createGain();
    gain.gain.value = level;
    gain.connect(destination);
    this.loops[name] = (buffer) => {
      this[`${name}Source`] = this.startLoop(buffer, gain);
    };
    return gain;
  }

  startLoop(buffer, destination) {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(destination);
    source.start(0, Math.random() * buffer.duration);
    return source;
  }

  setMuted(m) {
    this.muted = m;
    this.music.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : EFFECTS_VOLUME;
  }

  setEngine(rpm, throttle, slide, near, speed = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const position = Math.log2(rpm / ENGINE_RPMS[0]);
    for (const voice of this.engineVoices) {
      const blend = Math.cos(Math.min(1, Math.abs(position - voice.band)) * Math.PI / 2);
      const load = voice.load ? Math.sqrt(throttle) : 0.5 * Math.sqrt(1 - throttle);
      voice.gain.gain.setTargetAtTime(blend * load, t, 0.03);
      voice.source?.playbackRate.setTargetAtTime(rpm / voice.rpm, t, 0.03);
    }
    this.engineFilter.frequency.setTargetAtTime(700 + 17000 * near * near, t, 0.05);
    this.engineGain.gain.setTargetAtTime(0.32 * near, t, 0.05);

    const scrub = Math.min(1, slide * 0.09);
    const squeal = Math.min(1, Math.max(0, (slide - 2.5) * 0.14));
    this.scrubGain.gain.setTargetAtTime(0.26 * scrub * near, t, 0.06);
    this.squealGain.gain.setTargetAtTime(0.26 * squeal * near, t, 0.08);
    this.squealSource?.playbackRate.setTargetAtTime(0.92 + squeal * 0.16, t, 0.1);
    const pace = Math.min(1, speed / 70);
    this.roadGain.gain.setTargetAtTime(0.16 * pace * near, t, 0.1);
    this.roadSource?.playbackRate.setTargetAtTime(0.8 + pace * 0.5, t, 0.1);
  }

  // One take, never the same one twice running, placed in the scene. The echo off
  // the stands falls away slower than the direct sound, so far things sit further
  // back, and air takes the top end off them.
  play(name, level, { near, pan } = CLOSE, rate = 1) {
    const takes = this.bank[name];
    if (!this.ctx || !takes || this.voices >= MAX_VOICES) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (t - (this.lastPlayed[name] ?? -1) < REPEAT_GAP) return;
    this.lastPlayed[name] = t;
    let take = Math.floor(Math.random() * takes.length);
    if (takes.length > 1 && take === this.last[name]) take = (take + 1) % takes.length;
    this.last[name] = take;

    const source = ctx.createBufferSource();
    source.buffer = takes[take];
    source.playbackRate.value = rate * (0.95 + Math.random() * 0.1);
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = 2500 + 17500 * near;
    const gain = ctx.createGain();
    gain.gain.value = level * near;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    const send = ctx.createGain();
    send.gain.value = level * REVERB_SEND * Math.sqrt(near);
    source.connect(air).connect(gain).connect(panner).connect(this.master);
    air.connect(send).connect(this.reverb);
    this.voices++;
    source.onended = () => {
      this.voices--;
      air.disconnect();
      panner.disconnect();
      send.disconnect();
    };
    source.start(t);
  }

  // The engine and tyres step back for a moment, the way a mix makes room for a
  // hit, which lets it land harder than its peak level. Only for hits close by:
  // a crash across the track shouldn't pump the car on camera.
  duck(amount, near) {
    const close = Math.max(0, 2 * near - 1);
    if (close === 0) return;
    amount *= close;
    const t = this.ctx.currentTime;
    const gain = this.ducked.gain;
    gain.cancelScheduledValues(t);
    gain.setTargetAtTime(1 - amount, t, 0.008);
    gain.setTargetAtTime(1, t + 0.09, 0.16);
  }

  crunch(strength, at) {
    if (!this.ctx) return;
    const name = strength < 0.2 ? 'tap' : strength < 0.6 ? 'crunch' : 'smash';
    this.play(name, 0.6 + 0.4 * strength, at, 0.92 - strength * 0.14);
    this.duck(0.3 + 0.4 * strength, at.near);
    if (strength > 0.25) this.cheer(strength, at.near);
  }

  fence(strength, at) {
    if (!this.ctx) return;
    this.play(strength < 0.4 ? 'fenceHit' : 'fenceSmash', 0.9 + 0.1 * strength, at, 0.94 - strength * 0.12);
    this.duck(0.25 + 0.35 * strength, at.near);
  }

  landing(strength, at) {
    if (!this.ctx) return;
    this.play(strength < 0.65 ? 'landing' : 'hardLanding', 0.8 + 0.2 * strength, at, 0.9);
    this.duck(0.2 + 0.3 * strength, at.near);
  }

  // Sent many times a second while a car drags, so it opens and closes a loop
  // rather than stacking up separate sounds.
  scrape(speed, at) {
    if (!this.ctx || at.near < 0.3) return;
    const t = this.ctx.currentTime;
    const gain = this.grindGain.gain;
    gain.cancelScheduledValues(t);
    gain.setTargetAtTime(Math.min(1, 0.35 + speed * 0.04) * at.near * 0.8, t, 0.015);
    gain.setTargetAtTime(0, t + 0.05, 0.1);
  }

  pickup(at) {
    this.play('crate', 0.8, at);
  }

  fired(key, at) {
    const [name, level] = FIRED[key];
    this.play(name, level, at);
  }

  boom(at) {
    this.play('boom', 1, at);
    this.cheer(0.45, at.near);
  }

  ko(at) {
    this.play('boom', 1, at);
    this.play('smash', 0.8, at, 0.8);
    this.cheer(1, at.near);
  }

  hooked(at) {
    this.play('hooked', 0.95, at);
  }

  cut(at) {
    this.play('cut', 0.9, at);
  }

  boing(at) {
    this.play('boing', 1, at);
  }

  slap(final, at) {
    this.play(final ? 'bigSlap' : 'slap', final ? 1 : 0.85, at);
    this.cheer(final ? 0.5 : 0.25, at.near);
  }

  pianoCrash(at) {
    this.play('pianoCrash', 1, at);
    this.cheer(0.45, at.near);
  }

  // The stands answer what they can see, and the camera hears the nearest part of
  // them, so a crash on the far side of the Knot barely lifts them.
  cheer(amount, near = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gain = this.cheerGain.gain;
    const heard = amount * (0.25 + 0.75 * near);
    gain.cancelScheduledValues(t);
    gain.setTargetAtTime(heard * heard * 0.4, t, 0.09);
    gain.setTargetAtTime(0, t + 0.7, 0.9);
  }
}
