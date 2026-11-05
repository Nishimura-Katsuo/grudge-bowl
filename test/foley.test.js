import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/sim/math.js';
import { WEAPONS } from '../src/sim/arsenal.js';
import { FIRED, softLimit } from '../src/render/audio.js';
import { ENGINE_RPMS, SOUNDS, render } from '../src/render/foley.js';
import {
  SAMPLE_RATE, addLine, convolved, dispersed, driven, fft, filtered, ifft, lowPass, modes, noiseFromPower, noiseLoop, noiseOverTime, samplesFor,
} from '../src/render/spectral.js';

const takesOf = (name) => Array.from({ length: SOUNDS[name].takes ?? 1 }, (_, take) => take);
const rms = (x) => Math.sqrt(x.reduce((sum, v) => sum + v * v, 0) / x.length);

test('the inverse FFT matches the definition, and undoes the forward transform', () => {
  const rng = createRng(1);
  const n = 16;
  const re = Float64Array.from({ length: n }, () => rng() - 0.5);
  const im = Float64Array.from({ length: n }, () => rng() - 0.5);
  const xr = Float64Array.from(re), xi = Float64Array.from(im);
  ifft(xr, xi);
  for (let t = 0; t < n; t++) {
    let sr = 0, si = 0;
    for (let k = 0; k < n; k++) {
      const w = 2 * Math.PI * k * t / n;
      sr += re[k] * Math.cos(w) - im[k] * Math.sin(w);
      si += re[k] * Math.sin(w) + im[k] * Math.cos(w);
    }
    assert.ok(Math.abs(xr[t] - sr) < 1e-9 && Math.abs(xi[t] - si) < 1e-9);
  }
  fft(xr, xi);
  for (let i = 0; i < n; i++) assert.ok(Math.abs(xr[i] / n - re[i]) < 1e-9);
});

test('a mode decays at its stated rate and rings at its stated pitch', () => {
  const n = 1 << 16;
  const [x] = modes(n, [{ f: 440, t60: 0.6, a: 1 }], createRng(2));
  const at = (t) => rms(x.subarray(Math.round(t * SAMPLE_RATE), Math.round((t + 0.05) * SAMPLE_RATE)));
  const drop = 20 * Math.log10(at(0.1) / at(0.4));
  assert.ok(Math.abs(drop - 30) < 1.5, `dropped ${drop} dB in 0.3 s`);
  let crossings = 0;
  const from = Math.round(0.1 * SAMPLE_RATE), to = Math.round(0.3 * SAMPLE_RATE);
  for (let i = from; i < to; i++) if (x[i] <= 0 && x[i + 1] > 0) crossings++;
  assert.ok(Math.abs(crossings / 0.2 - 440) < 8, `${crossings / 0.2} Hz`);
});

test('a thousand modes rise cleanly and nothing wraps round the buffer', () => {
  const rng = createRng(3);
  const list = Array.from({ length: 1000 }, () => ({ f: 200 + 8000 * rng(), t60: 0.2, a: 1 }));
  const [x] = modes(1 << 15, list, rng);
  const onset = rms(x.subarray(0, 60));
  assert.ok(onset < rms(x.subarray(300, 700)) / 20, 'the onset is not smooth');
  assert.ok(rms(x.subarray(x.length - 2000)) < rms(x.subarray(300, 700)) / 1000, 'sound wrapping at the end');
});

test('filtering is causal, so a hit never pre-rings', () => {
  const x = new Float64Array(1 << 14);
  x[8192] = 1;
  const [y] = filtered([x], (f) => lowPass(f, 900, 3));
  const before = rms(y.subarray(0, 8192)), after = rms(y.subarray(8192, 8692));
  assert.ok(before < after / 500, `${before} before against ${after} after`);
});

test('fast convolution matches the slow kind', () => {
  const rng = createRng(4);
  const a = Float64Array.from({ length: 40 }, () => rng() - 0.5);
  const b = Float64Array.from({ length: 25 }, () => rng() - 0.5);
  const y = convolved(a, b);
  assert.equal(y.length, 64);
  for (let i = 0; i < y.length; i++) {
    let sum = 0;
    for (let j = 0; j < a.length; j++) if (i - j >= 0 && i - j < b.length) sum += a[j] * b[i - j];
    assert.ok(Math.abs(y[i] - sum) < 1e-9);
  }
});

test('analytic output gives a stereo pair that is uncorrelated', () => {
  const [l, r] = noiseLoop(1 << 14, () => 1, createRng(5));
  let cross = 0;
  for (let i = 0; i < l.length; i++) cross += l[i] * r[i];
  assert.ok(Math.abs(cross / l.length) < rms(l) * rms(r) * 0.1);
});

test('dispersion moves bands to the times it was told to', () => {
  const [x] = dispersed(1 << 15, (f) => (f > 500 && f < 2000 ? 1 : 0), (f) => 0.05 + (f - 500) / 1500 * 0.4);
  const early = rms(x.subarray(Math.round(0.05 * SAMPLE_RATE), Math.round(0.1 * SAMPLE_RATE)));
  const crossingsOf = (from, to) => {
    let c = 0;
    for (let i = Math.round(from * SAMPLE_RATE); i < to * SAMPLE_RATE; i++) if (x[i] <= 0 && x[i + 1] > 0) c++;
    return c / (to - from);
  };
  assert.ok(early > 0);
  assert.ok(crossingsOf(0.38, 0.43) > crossingsOf(0.07, 0.12) * 2, 'the sweep did not rise');
});

test('a spectral line sits where it was put', () => {
  const power = new Float64Array(1 << 15);
  addLine(power, 1000, 4, 1);
  const [x] = noiseFromPower(power, createRng(6));
  let crossings = 0;
  for (let i = 0; i + 1 < x.length; i++) if (x[i] <= 0 && x[i + 1] > 0) crossings++;
  assert.ok(Math.abs(crossings / (x.length / SAMPLE_RATE) - 1000) < 10);
});

test('sound over time follows its spectrum', () => {
  const [x] = noiseOverTime(1, (t, f) => (t < 0.5 ? 1 : 0) * (f < 4000 ? 1 : 0), createRng(7));
  assert.ok(rms(x.subarray(48000 * 0.7)) < rms(x.subarray(0, 48000 * 0.4)) / 1000);
});

test('every take renders finite, audible and repeatable', () => {
  for (const name of Object.keys(SOUNDS)) {
    for (const take of takesOf(name)) {
      const channels = render(name, take);
      let top = 0;
      for (const c of channels) {
        assert.equal(c.length, channels[0].length);
        for (const v of c) {
          assert.ok(Number.isFinite(v), `${name}/${take} has a bad sample`);
          top = Math.max(top, Math.abs(v));
        }
        assert.ok(Math.abs(c.reduce((s, v) => s + v, 0) / c.length) < 0.02, `${name}/${take} has a DC offset`);
      }
      assert.ok(top > 0.1, `${name}/${take} is silent`);
      if (!SOUNDS[name].loop) assert.ok(top <= 1, `${name}/${take} peaks at ${top}`);
    }
  }
  assert.deepEqual(render('crate', 1), render('crate', 1));
  assert.notDeepEqual(render('crate', 0), render('crate', 1));
});

test('loops have no seam: the wrap is no bigger than any other step', () => {
  for (const name of Object.keys(SOUNDS).filter((n) => SOUNDS[n].loop)) {
    for (const c of render(name)) {
      let biggest = 0;
      for (let i = 1; i < c.length; i++) biggest = Math.max(biggest, Math.abs(c[i] - c[i - 1]));
      assert.ok(Math.abs(c[0] - c[c.length - 1]) <= biggest, `${name} jumps at the loop point`);
    }
  }
});

test('one-shots end in silence, because a cut tail is a click', () => {
  for (const name of Object.keys(SOUNDS).filter((n) => !SOUNDS[n].loop)) {
    for (const c of render(name)) assert.ok(Math.abs(c[c.length - 1]) < 1e-3, `${name} ends on ${c[c.length - 1]}`);
  }
});

test('the engine loops hold whole cycles at the rpm they claim', () => {
  const length = render('engineMidOn')[0].length;
  ENGINE_RPMS.forEach((rpm) => {
    const cycles = (length / SAMPLE_RATE) * (rpm / 120);
    assert.ok(Math.abs(cycles - Math.round(cycles)) < 1e-9, `${cycles} cycles at ${rpm}`);
  });
});

test('every weapon has a sound of its own in the library', () => {
  for (const weapon of WEAPONS.filter(Boolean)) {
    const [name] = FIRED[weapon.key];
    assert.ok(SOUNDS[name], `${weapon.key} has no sound`);
  }
});

test('the limiter leaves the mix alone until the knee and never passes the ceiling', () => {
  for (let x = 0; x <= 0.77; x += 0.01) assert.equal(softLimit(x), x);
  let last = 0;
  for (let x = 0; x <= 20; x += 0.01) {
    const y = softLimit(x);
    assert.ok(y >= last && y <= 0.97, `${x} became ${y}`);
    assert.equal(softLimit(-x), -y);
    last = y;
  }
});

test('saturation keeps the peak and brings up everything under it', () => {
  const quiet = [Float64Array.from([0, 0.1, -0.2, 1, -1])];
  const [y] = driven(quiet, 3);
  assert.ok(Math.abs(y[3] - 1) < 1e-12 && Math.abs(y[4] + 1) < 1e-12);
  assert.ok(Math.abs(y[1]) > 0.28 && y[0] === 0);
});

test('hits and landings are heavy, and fade out instead of stopping', () => {
  for (const name of ['tap', 'crunch', 'smash', 'fenceHit', 'fenceSmash', 'landing', 'hardLanding']) {
    for (const take of takesOf(name)) {
      const [x] = render(name, take);
      const n = 1 << 13;
      const re = Float64Array.from(x.subarray(0, n)), im = new Float64Array(n);
      fft(re, im);
      let all = 0, low = 0;
      for (let k = 1; k < n / 2; k++) {
        const p = re[k] ** 2 + im[k] ** 2;
        all += p;
        if (k * SAMPLE_RATE / n < 400) low += p;
      }
      assert.ok(low / all > 0.4, `${name}/${take} has only ${(100 * low / all).toFixed(0)}% of its energy under 400 Hz`);
      assert.ok(x.length / SAMPLE_RATE >= 0.7, `${name} is too short to have any weight`);
      const window = samplesFor(0.1);
      const tail = rms(x.subarray(x.length - window));
      const before = rms(x.subarray(x.length - 2 * window, x.length - window));
      assert.ok(tail < before * 1.2, `${name}/${take} does not fade out`);
    }
  }
});

test('a low mode dies away and never swells back at the end of its buffer', () => {
  const n = 1 << 16;
  const [x] = modes(n, [{ f: 44, t60: 0.34, a: 1 }, { f: 71, t60: 0.26, a: 0.8 }], createRng(8));
  const start = rms(x.subarray(240, 4800));
  for (let at = n >> 1; at + 2400 <= n; at += 2400) {
    assert.ok(rms(x.subarray(at, at + 2400)) < start / 100, `${at} is ${20 * Math.log10(rms(x.subarray(at, at + 2400)) / start)} dB`);
  }
});
