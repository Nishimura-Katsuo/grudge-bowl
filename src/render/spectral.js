// Inverse FFT synthesis. A sound is described by its spectrum and the inverse FFT
// turns that into samples. No Web Audio in here, so the sound design runs anywhere.
//
// Spectra fill the positive frequencies only, which makes the transform's output
// analytic: the real part is one channel and the imaginary part is the same sound
// a quarter cycle away at every frequency. Those two are uncorrelated, so one
// transform gives a wide stereo pair that still sums cleanly to mono.

export const SAMPLE_RATE = 48000;

const TAU = Math.PI * 2;
const tables = new Map();

function tableFor(n) {
  let t = tables.get(n);
  if (t) return t;
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2), rev = new Uint32Array(n);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos(TAU * i / n);
    sin[i] = Math.sin(TAU * i / n);
  }
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) rev[i] = (rev[i >> 1] >> 1) | ((i & 1) << (bits - 1));
  t = { cos, sin, rev };
  tables.set(n, t);
  return t;
}

// In place, unscaled, for a power of two length. Swap the arguments for the forward transform.
export function ifft(re, im) {
  const n = re.length;
  const { cos, sin, rev } = tableFor(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j <= i) continue;
    let t = re[i]; re[i] = re[j]; re[j] = t;
    t = im[i]; im[i] = im[j]; im[j] = t;
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2, step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let i = 0, k = 0; i < half; i++, k += step) {
        const a = start + i, b = a + half;
        const wr = cos[k], wi = sin[k];
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}

export const fft = (re, im) => ifft(im, re);

export const fftSize = (samples) => 2 ** Math.ceil(Math.log2(Math.max(2, samples)));
export const samplesFor = (seconds) => Math.round(seconds * SAMPLE_RATE);

const emptySpectrum = (n) => [new Float64Array(n), new Float64Array(n)];

// Softens the ends of a transform's output, whose edges are not silent: a transform
// is circular, so whatever a sound spills past one end comes back in at the other.
function faded(channels, head, tail) {
  for (const c of channels) {
    for (let i = 0; i < head; i++) c[i] *= i / head;
    for (let i = 0; i < tail; i++) c[c.length - 1 - i] *= i / tail;
  }
  return channels;
}
const hz = (k, n) => k * SAMPLE_RATE / n;

// A stationary sound: random phases over the given magnitudes. The inverse FFT of
// a discrete spectrum is periodic, so this loops with no seam and no crossfade.
export function noiseLoop(n, magnitude, rng) {
  const [re, im] = emptySpectrum(n);
  for (let k = 1; k < n / 2; k++) {
    const a = magnitude(hz(k, n)), p = TAU * rng();
    re[k] = a * Math.cos(p);
    im[k] = a * Math.sin(p);
  }
  ifft(re, im);
  return [re, im];
}

// The same from a power spectrum already laid out by bin.
export function noiseFromPower(power, rng) {
  const n = power.length;
  const [re, im] = emptySpectrum(n);
  for (let k = 1; k < n / 2; k++) {
    const a = Math.sqrt(power[k]), p = TAU * rng();
    re[k] = a * Math.cos(p);
    im[k] = a * Math.sin(p);
  }
  ifft(re, im);
  return [re, im];
}

// Lays one soft-edged spectral line into a power spectrum. Width is in Hz.
export function addLine(power, frequency, width, level) {
  const n = power.length;
  const centre = frequency * n / SAMPLE_RATE;
  const sigma = Math.max(1, width * n / SAMPLE_RATE);
  const from = Math.max(1, Math.floor(centre - 3 * sigma));
  const to = Math.min(n / 2 - 1, Math.ceil(centre + 3 * sigma));
  const scale = level * level / sigma;
  for (let k = from; k <= to; k++) {
    const u = (k - centre) / sigma;
    power[k] += scale * Math.exp(-0.5 * u * u);
  }
}

// A sound whose spectrum moves over time: magnitude(t, f) is read once per frame,
// with fresh phases. A sine window at 50% overlap keeps uncorrelated frames at a
// constant power. A short frame follows fast changes and a long one resolves pitch.
export function noiseOverTime(seconds, magnitude, rng, frame = 1024) {
  const length = samplesFor(seconds);
  const left = new Float64Array(length), right = new Float64Array(length);
  const hop = frame / 2;
  const [re, im] = emptySpectrum(frame);
  const window = Float64Array.from({ length: frame }, (_, i) => Math.sin(Math.PI * (i + 0.5) / frame));
  for (let start = -hop; start < length; start += hop) {
    const t = (start + hop) / SAMPLE_RATE;
    re.fill(0);
    im.fill(0);
    for (let k = 1; k < hop; k++) {
      const a = magnitude(t, hz(k, frame)), p = TAU * rng();
      re[k] = a * Math.cos(p);
      im[k] = a * Math.sin(p);
    }
    ifft(re, im);
    for (let i = 0; i < frame; i++) {
      const at = start + i;
      if (at < 0 || at >= length) continue;
      left[at] += re[i] * window[i];
      right[at] += im[i] * window[i];
    }
  }
  return [left, right];
}

// How wide each mode is drawn, as the length of its onset. Past this the modes are
// a smooth rise, which is why the sharp edge of a hit comes from a contact layer.
const ONSET = 240;

// A struck object: a list of { f, t60, a } decaying partials, written straight
// into the spectrum, so a thousand modes cost the same transform as one. Each is
// the exact spectrum of a damped sinusoid, cut to a band around its peak.
export function modes(n, list, rng) {
  const [re, im] = emptySpectrum(n);
  const reach = Math.ceil(n / ONSET);
  const delay = TAU * ONSET / n;
  for (const { f, t60, a } of list) {
    if (f <= 0 || f >= SAMPLE_RATE / 2) continue;
    const r = Math.exp(-6.91 / (t60 * SAMPLE_RATE));
    const theta = TAU * f / SAMPLE_RATE;
    const centre = Math.round(f * n / SAMPLE_RATE);
    const phase = TAU * rng();
    const pr = a * Math.cos(phase), pi = a * Math.sin(phase);
    const from = Math.max(1, centre - reach), to = Math.min(n / 2 - 1, centre + reach);
    for (let k = from; k <= to; k++) {
      const off = (k - centre) / reach;
      const taper = (1 - off * off) ** 2;
      const d = theta - TAU * k / n;
      // 1 / (1 - r e^(id)), the discrete-time damped sinusoid.
      const dr = 1 - r * Math.cos(d), di = -r * Math.sin(d);
      const scale = taper / (dr * dr + di * di);
      const xr = dr * scale, xi = -di * scale;
      // Hold the onset off the start of the buffer, or it would wrap to the end.
      const c = Math.cos(delay * k), s = -Math.sin(delay * k);
      const yr = xr * c - xi * s, yi = xr * s + xi * c;
      re[k] += yr * pr - yi * pi;
      im[k] += yr * pi + yi * pr;
    }
  }
  ifft(re, im);
  // A low mode's band runs into zero Hz and is cut short there, which spills sound
  // before the onset. The transform wraps that round to the end of the buffer, where
  // it swells up like a reversed hit, so the last quarter is faded. Buffers are sized
  // for modes to be gone by then.
  return faded([re, im], 0, n >> 2);
}

// A pulse whose frequencies arrive at different times: group delay is delay(f) in
// seconds. Pushing the bands apart is what a sound does going down a long spring.
export function dispersed(n, magnitude, delay) {
  const [re, im] = emptySpectrum(n);
  let phase = 0;
  const df = SAMPLE_RATE / n;
  for (let k = 1; k < n / 2; k++) {
    const f = k * df;
    phase -= TAU * delay(f) * df;
    const a = magnitude(f);
    re[k] = a * Math.cos(phase);
    im[k] = a * Math.sin(phase);
  }
  ifft(re, im);
  return faded([re, im], 64, 512);
}

// The minimum phase response of a magnitude curve, from the cepstrum. Unlike a
// zero phase filter it rings after a hit and never before it. Returns [re, im] by bin.
function minimumPhase(n, magnitude) {
  const [cr, ci] = emptySpectrum(n);
  const edge = 1e-6;
  for (let k = 0; k <= n / 2; k++) {
    const log = Math.log(Math.max(edge, magnitude(hz(k, n))));
    cr[k] = log;
    if (k > 0 && k < n / 2) cr[n - k] = log;
  }
  ifft(cr, ci);
  for (let i = 0; i < n; i++) {
    cr[i] /= n;
    ci[i] = 0;
  }
  for (let i = 1; i < n / 2; i++) cr[i] *= 2;
  for (let i = n / 2 + 1; i < n; i++) cr[i] = 0;
  fft(cr, ci);
  for (let k = 0; k < n; k++) {
    const g = Math.exp(cr[k]);
    const p = ci[k];
    cr[k] = g * Math.cos(p);
    ci[k] = g * Math.sin(p);
  }
  return [cr, ci];
}

// Circular filtering of one or two channels, so a looping sound stays looped.
export function filtered(channels, magnitude) {
  const n = channels[0].length;
  const re = Float64Array.from(channels[0]);
  const im = channels[1] ? Float64Array.from(channels[1]) : new Float64Array(n);
  const [hr, hi] = minimumPhase(n, magnitude);
  fft(re, im);
  for (let k = 0; k < n; k++) {
    const a = re[k] * hr[k] - im[k] * hi[k];
    im[k] = (re[k] * hi[k] + im[k] * hr[k]) / n;
    re[k] = a / n;
  }
  ifft(re, im);
  return channels[1] ? [re, im] : [re];
}

// One sound played through another, as with a train of knocks through a panel.
export function convolved(a, b) {
  const n = fftSize(a.length + b.length);
  const ar = new Float64Array(n), ai = new Float64Array(n);
  ar.set(a);
  ai.set(b);
  fft(ar, ai);
  // Both signals are real, so one transform carries the two.
  const [yr, yi] = emptySpectrum(n);
  for (let k = 0; k < n; k++) {
    const m = (n - k) % n;
    const xr = (ar[k] + ar[m]) / 2, xi = (ai[k] - ai[m]) / 2;
    const zr = (ai[k] + ai[m]) / 2, zi = (ar[m] - ar[k]) / 2;
    yr[k] = (xr * zr - xi * zi) / n;
    yi[k] = (xr * zi + xi * zr) / n;
  }
  ifft(yr, yi);
  return yr.subarray(0, a.length + b.length - 1);
}

// Spectral curves in plain terms, each a gain to multiply together.
export const highPass = (f, corner, order = 2) => 1 / Math.sqrt(1 + (corner / Math.max(f, 1)) ** (2 * order));
export const lowPass = (f, corner, order = 2) => 1 / Math.sqrt(1 + (f / corner) ** (2 * order));
export const tilt = (f, reference, slope) => (Math.max(f, 1) / reference) ** slope;
export const peak = (f, centre, q) => {
  const u = q * (f / centre - centre / f);
  return 1 / (1 + u * u);
};
export const hump = (f, centre, octaves) => {
  const u = Math.log2(Math.max(f, 1) / centre) / octaves;
  return Math.exp(-0.5 * u * u);
};

export function peakOf(channels) {
  let top = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) top = Math.max(top, Math.abs(c[i]));
  return top;
}

export function normalised(channels, level = 1) {
  const top = peakOf(channels) || 1;
  return channels.map((c) => {
    const out = new Float64Array(c.length);
    for (let i = 0; i < c.length; i++) out[i] = c[i] * level / top;
    return out;
  });
}

// Scales to an RMS level, for sustained sounds that have to match each other.
export function levelled(channels, rms) {
  let sum = 0, count = 0;
  for (const c of channels) {
    for (let i = 0; i < c.length; i++) sum += c[i] * c[i];
    count += c.length;
  }
  const scale = rms / (Math.sqrt(sum / count) || 1);
  return channels.map((c) => c.map((v) => v * scale));
}

// Multiplies by an amplitude curve over time.
export function shaped(channels, envelope) {
  return channels.map((c) => {
    const out = new Float64Array(c.length);
    for (let i = 0; i < c.length; i++) out[i] = c[i] * envelope(i / SAMPLE_RATE);
    return out;
  });
}

// Lays layers over each other: [channels, gain, start in seconds].
export function mixed(seconds, stereo, layers) {
  const length = samplesFor(seconds);
  const out = Array.from({ length: stereo ? 2 : 1 }, () => new Float64Array(length));
  for (const [channels, gain, start = 0] of layers) {
    const at = samplesFor(start);
    out.forEach((c, side) => {
      const source = channels[Math.min(side, channels.length - 1)];
      const end = Math.min(source.length, length - at);
      for (let i = 0; i < end; i++) c[at + i] += source[i] * gain;
    });
  }
  return out;
}

// Pushes a sound into saturation, the way a hit overloads the mic recording it. The
// peaks stay put and everything under them comes up, so it carries further.
export function driven(channels, drive) {
  const top = Math.tanh(drive);
  return channels.map((c) => c.map((v) => Math.tanh(v * drive) / top));
}

// A short fade at the tail, because a trimmed buffer ends wherever it was cut.
export function fadedOut(channels, seconds = 0.03) {
  const fade = samplesFor(seconds);
  for (const c of channels) {
    for (let i = 0; i < fade; i++) c[c.length - 1 - i] *= (i / fade) ** 2;
  }
  return channels;
}
