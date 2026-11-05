// The sound library. Nothing is recorded: every effect is designed as spectra and
// rendered through the inverse FFT in spectral.js, in layers, the way a foley
// artist builds one: what hits, what rings, what falls off afterwards.

import { createRng } from '../sim/math.js';
import {
  SAMPLE_RATE, addLine, convolved, dispersed, driven, fadedOut, fftSize, filtered, highPass, hump, levelled,
  lowPass, mixed, modes, noiseFromPower, noiseLoop, noiseOverTime, normalised, peak, samplesFor, shaped, tilt,
} from './spectral.js';

const TAU = Math.PI * 2;
const between = (rng, lo, hi) => lo + (hi - lo) * rng();
const oneOf = (rng, list) => list[Math.floor(rng() * list.length)];
const silence = (seconds) => new Float64Array(samplesFor(seconds));

// ---- Building blocks ------------------------------------------------------

// The instant of contact: a few milliseconds of noise with the character of what touched.
function contact(seconds, decay, magnitude, rng) {
  const n = fftSize(samplesFor(seconds) * 2);
  const x = new Float64Array(n);
  const length = samplesFor(seconds);
  for (let i = 0; i < length; i++) x[i] = (rng() * 2 - 1) * Math.exp(-i / (decay * SAMPLE_RATE));
  return filtered([x], magnitude);
}

// Sheet steel: plate modes sit at an even density, and the highest die first.
function panelModes(rng, count, lo, hi, ring, darkness, choke = 0.55) {
  return Array.from({ length: count }, () => {
    const f = lo * (hi / lo) ** (rng() ** 1.3);
    return { f, t60: ring * (lo / f) ** choke * between(rng, 0.6, 1.4), a: between(rng, 0.3, 1.2) * (lo / f) ** darkness };
  });
}

// The body of a crash: steel tearing and folding is a dense rush of noise, not a
// few clean knocks, and this is the part with the energy to carry across a track.
function crumple(seconds, rng, heavy = false) {
  const chatter = billow(rng, 0.8, 70);
  const lows = heavy ? 380 : 850, highs = heavy ? 1000 : 2300, top = heavy ? 3200 : 6000;
  const [noise] = noiseOverTime(seconds, (t, f) => (1 - Math.exp(-t / 0.002)) * Math.exp(-t / (seconds * 0.26))
    * highPass(f, heavy ? 90 : 170, 2) * lowPass(f, top, 2.5) * (0.6 + hump(f, lows, 1) + 0.8 * hump(f, highs, 0.9)), rng, 256);
  return shaped([noise], chatter);
}

// Takes a decay all the way to nothing, or a layer stops dead where its buffer ends.
const dyingAway = (t, seconds) => Math.max(0, 1 - t / seconds) ** 2;

// What says a ton and a half just moved: the whole chassis shaking, well below the
// metal, and still going after the crash has finished. Size lives down here.
function rumble(seconds, rng) {
  const shudder = billow(rng, 0.55, 22);
  const [noise] = noiseOverTime(seconds, (t, f) => (1 - Math.exp(-t / 0.006)) * Math.exp(-t / (seconds * 0.34)) * dyingAway(t, seconds)
    * highPass(f, 36, 2) * lowPass(f, 340, 3) * (1 + 1.3 * hump(f, 85, 0.9)), rng, 1024);
  return shaped([noise], shudder);
}

// Steel dragging on steel as the cars slide apart, sinking as they lose speed.
// Skipping and chattering, with no pitch to it, which is what keeps it from ringing.
function drag(seconds, rng) {
  const chatter = billow(rng, 0.85, 46);
  const [noise] = noiseOverTime(seconds, (t, f) => {
    const slowing = 1 / (1 + 1.4 * t / seconds);
    return (1 - Math.exp(-t / 0.01)) * Math.exp(-t / (seconds * 0.36)) * dyingAway(t, seconds) * highPass(f, 130, 2)
      * lowPass(f, 700 + 2300 * slowing, 3) * (0.7 + hump(f, 420 * slowing, 0.9) + 0.7 * hump(f, 1100 * slowing, 0.8));
  }, rng, 512);
  return shaped([noise], chatter);
}

// A panel buckling is not one hit but a run of them as the folds give way.
function knocks(seconds, count, spread, rng) {
  const x = silence(seconds);
  for (let i = 0; i < count; i++) {
    const t = spread * rng() ** 2.2;
    x[samplesFor(t)] += (rng() < 0.5 ? -1 : 1) * between(rng, 0.25, 1) * Math.exp(-t / (spread * 0.5));
  }
  return x;
}

// Something small hitting the ground, again and again, sooner each time.
function bounces(seconds, x, start, gap, rng) {
  let t = start, level = between(rng, 0.5, 1), wait = gap;
  while (wait > 0.012 && t < seconds - 0.01) {
    x[samplesFor(t)] += level * (rng() < 0.5 ? -1 : 1);
    t += wait * between(rng, 0.8, 1.2);
    wait *= between(rng, 0.6, 0.78);
    level *= 0.8;
  }
}

// Each object has to ring its own way. Run a lot of hits through one set of modes
// and they fuse into a steady buzz at those pitches.
function eachItsOwn(tracks, makeModes, rng) {
  const out = new Float64Array(tracks[0].length + (1 << 13));
  for (const x of tracks) {
    const [ring] = modes(1 << 13, makeModes(), rng);
    for (let at = 0; at < x.length; at++) {
      if (x[at] === 0) continue;
      for (let i = 0; i < ring.length; i++) out[at + i] += x[at] * ring[i];
    }
  }
  return [out];
}

// Glass, bolts and trim coming down after the hit, one piece at a time.
function debris(seconds, pieces, rng) {
  const tracks = Array.from({ length: pieces }, () => {
    const x = silence(seconds);
    bounces(seconds, x, seconds * 0.5 * rng() ** 1.4, between(rng, 0.06, 0.2), rng);
    return x;
  });
  return eachItsOwn(tracks, () => {
    const lo = 700 * 5 ** rng();
    return panelModes(rng, 5, lo, lo * 3.2, between(rng, 0.03, 0.08), 0.2);
  }, rng);
}

// Slow heaving for anything turbulent, so a roar does not sit at one level.
function billow(rng, depth, rate) {
  const parts = Array.from({ length: 5 }, () => [between(rng, 0.4, 1) * rate, TAU * rng()]);
  return (t) => 1 + depth * parts.reduce((sum, [f, p]) => sum + Math.sin(TAU * f * t + p), 0) / 2.5;
}

// ---- Cars -----------------------------------------------------------------

// A cross-plane V8, firing 1-8-4-3-6-5-7-2. Each bank feeds its own pipe, and the
// bank's uneven gaps are the burble, so each pipe gets a side of the stereo image.
const FIRING = [[0, 0], [1, 90], [1, 180], [0, 270], [1, 360], [0, 450], [0, 540], [1, 630]];

// The loop holds a whole number of engine cycles and the rpm follows from that.
export const ENGINE_RPMS = [1406.25, 2812.5, 5625];
const ENGINE_CYCLE_SAMPLES = [4096, 2048, 1024];

function engine(gear, load, rng) {
  const n = 1 << 16;
  const cycle = ENGINE_CYCLE_SAMPLES[gear];
  const pulses = [new Float64Array(n), new Float64Array(n)];
  const gas = [new Float64Array(n), new Float64Array(n)];
  const pulseLength = samplesFor(load ? 0.0035 : 0.006);
  const strength = FIRING.map(() => between(rng, 0.68, 1.32)); // no two cylinders are alike
  for (let c = 0; c < n / cycle; c++) {
    FIRING.forEach(([bank, angle], i) => {
      const misfire = !load && rng() < 0.05;
      const a = misfire ? 0.1 : strength[i] * between(rng, 0.9, 1.1);
      const at = Math.round((c + (angle + between(rng, -0.8, 0.8)) / 720) * cycle + n) % n;
      pulses[bank][at] += a;
      for (let j = 0; j < pulseLength; j++) {
        gas[bank][(at + j) % n] += a * (rng() * 2 - 1) * Math.exp(-j / (pulseLength * 0.35));
      }
    });
  }
  const pipe = (f) => highPass(f, 32, 2) * lowPass(f, load ? 1700 : 800, 3) * (0.2
    + 1.5 * lowPass(f, 230, 2) + 1.2 * peak(f, 105, 2) + 0.55 * peak(f, 280, 3.5) + 0.4 * peak(f, 560, 4) + 0.25 * peak(f, 1040, 4.5));
  const rush = (f) => highPass(f, 500, 2) * lowPass(f, load ? 3800 : 1800, 3) * hump(f, 1400, 1.5);
  const bark = levelled(filtered(pulses, pipe), 1);
  const air = levelled(filtered(gas, rush), load ? 0.32 : 0.14);
  return levelled([0, 1].map((side) => bark[side].map((v, i) => v + air[side][i])), 0.2);
}

const tyreScrub = (rng) => levelled(noiseLoop(1 << 16, (f) => highPass(f, 260, 2) * lowPass(f, 5200, 1.5)
  * (hump(f, 950, 1.4) + 0.35 * hump(f, 3100, 0.9)), rng), 0.2);

// Rubber letting go is close to a pitch, but narrow noise rather than a tone, so
// it wanders and beats by itself, which is the sound of stick and slip.
function tyreSqueal(rng) {
  const power = new Float64Array(1 << 17);
  for (const [f, level] of [[820, 1], [1645, 0.55], [2470, 0.3], [1090, 0.35], [3300, 0.12]]) {
    addLine(power, f, f * 0.016, level);
  }
  return levelled(noiseFromPower(power, rng), 0.2);
}

// Steel dragged along the road: a hard bright hiss chattering as it skips.
function bodyGrind(rng) {
  const n = 1 << 16;
  const steel = noiseLoop(n, (f) => highPass(f, 900, 2) * lowPass(f, 9500, 2)
    * (0.5 + hump(f, 2300, 0.5) + 0.8 * hump(f, 4300, 0.4) + 0.45 * hump(f, 7000, 0.35)), rng);
  const seconds = n / SAMPLE_RATE;
  const skips = Array.from({ length: 7 }, (_, i) => [Math.round(between(rng, 20 + i * 8, 34 + i * 8) * seconds) / seconds, TAU * rng()]);
  return levelled(shaped(steel, (t) => 0.55 + 0.45 * skips.reduce((sum, [f, p]) => sum + Math.sin(TAU * f * t + p), 0) / 3), 0.2);
}

const roadRoar = (rng) => levelled(noiseLoop(1 << 16, (f) => highPass(f, 58, 3) * tilt(f, 80, -0.85)
  * (1 + 1.4 * hump(f, 120, 1) + 0.3 * hump(f, 1900, 1.2)) * lowPass(f, 7000, 1), rng), 0.2);

// ---- The grandstands -------------------------------------------------------

const VOWELS = [[730, 1090, 2440], [530, 1840, 2480], [570, 840, 2410], [660, 1720, 2410], [300, 870, 2240]];

// A crowd is a choir nobody rehearsed: hundreds of voices at their own pitch, each
// smeared by drift, drawn as wide lines through vowel formants.
function crowd(rng, voices, spread, brightness) {
  const n = 1 << 18;
  const power = new Float64Array(n);
  for (let v = 0; v < voices; v++) {
    const f0 = rng() < 0.6 ? between(rng, 105, 190) : between(rng, 190, 340);
    const vowel = oneOf(rng, VOWELS);
    const level = between(rng, 0.4, 1);
    for (let h = 1; h * f0 < 4800; h++) {
      const f = h * f0;
      const voice = 0.12 + hump(f, vowel[0], 0.55) + 0.7 * hump(f, vowel[1], 0.45) + brightness * hump(f, vowel[2], 0.4);
      addLine(power, f, f * spread, level * voice / h ** 1.15);
    }
  }
  for (let k = 1; k < n / 2; k++) {
    const f = k * SAMPLE_RATE / n;
    power[k] = power[k] * highPass(f, 150, 2) ** 2 + 2e-5 * hump(f, 1400, 1.5) ** 2;
  }
  const seconds = n / SAMPLE_RATE;
  // The swells have to fit a whole number of times, or the loop would jump.
  const swells = Array.from({ length: 6 }, (_, i) => [(i + 2) / seconds, TAU * rng()]);
  const swell = (t) => 1 + 0.16 * swells.reduce((sum, [f, p]) => sum + Math.sin(TAU * f * t + p), 0) / 2;
  return levelled(shaped(noiseFromPower(power, rng), swell), 0.2);
}

// What every sound in the race plays in: a slap back off the stands, then air.
function grandstands(rng) {
  const tail = noiseOverTime(2.2, (t, f) => Math.exp(-t * (3 + f / 1300)) * (1 - Math.exp(-t / 0.05))
    * lowPass(f, 7500, 1) * highPass(f, 130, 1), rng, 512);
  const wall = (f) => lowPass(f, 3400, 1) * highPass(f, 180, 1);
  const layers = [[normalised(tail), 0.75]];
  for (const [at, gain] of [[0.074, 0.8], [0.118, 0.6], [0.171, 0.5], [0.246, 0.42], [0.33, 0.28]]) {
    const echo = normalised(contact(0.03, 0.006, wall, rng));
    layers.push([[echo[0]], gain, at * between(rng, 0.95, 1.05)]);
    layers.push([[new Float64Array(0), echo[0]], gain * between(rng, 0.6, 0.9), at * between(rng, 0.85, 1.15)]);
  }
  return fadedOut(normalised(mixed(2.2, true, layers)));
}

// ---- Hits -------------------------------------------------------------------

const TIERS = [
  { seconds: 0.8, panels: 34, lo: 90, hi: 2600, ring: 0.17, dark: 0.75, hits: 3, spread: 0.04, weight: 0.85, edge: 0.45, shake: 0.65, grind: 0.55, bits: 0 },
  { seconds: 1.4, panels: 72, lo: 72, hi: 3400, ring: 0.25, dark: 0.65, hits: 12, spread: 0.16, weight: 0.9, edge: 0.45, shake: 0.85, grind: 0.9, bits: 4 },
  { seconds: 2.2, panels: 130, lo: 55, hi: 4200, ring: 0.36, dark: 0.55, hits: 36, spread: 0.38, weight: 1, edge: 0.45, shake: 1, grind: 1, bits: 9 },
];

function impact(tier, rng) {
  const t = TIERS[tier];
  // A car's weight chokes its panels, so the high modes die at once and only the low ones ring.
  const panel = modes(1 << 16, panelModes(rng, t.panels, t.lo, t.hi, t.ring, t.dark, 0.95), rng);
  const metal = [convolved(knocks(t.seconds, t.hits, t.spread, rng), panel[0])];
  const body = between(rng, 0.85, 1.15);
  const thump = modes(1 << 16, [
    { f: 44 * body, t60: 0.34, a: 1 }, { f: 71 * body, t60: 0.26, a: 0.8 }, { f: 113 * body, t60: 0.2, a: 0.5 },
  ], rng);
  const edge = contact(0.03, 0.0035, (f) => highPass(f, 350, 1) * lowPass(f, 7500, 2) * (1 + 1.5 * hump(f, 1800, 1)), rng);
  const layers = [
    [normalised(thump), t.weight, 0], [normalised(metal), 0.7, 0], [normalised(edge), t.edge, 0.004],
    [normalised(crumple(t.seconds * 0.3, rng, true)), 0.9, 0.002],
    [normalised(rumble(t.seconds, rng)), t.shake, 0.004], [normalised(drag(t.seconds * 0.85, rng)), t.grind, 0.02],
  ];
  if (t.bits) layers.push([normalised(debris(t.seconds * 0.7, t.bits, rng)), 0.34, 0.05]);
  return fadedOut(normalised(driven(normalised(mixed(t.seconds, false, layers)), 2.6), 0.95));
}

// Four tyres taking the weight at once: a bark of rubber, sagging as it grips.
function tyreBark(seconds, rng) {
  const pitch = between(rng, 620, 820);
  return noiseOverTime(seconds, (t, f) => {
    const sag = 1 - 0.3 * Math.min(1, t / seconds);
    return (1 - Math.exp(-t / 0.004)) * Math.exp(-t / (seconds * 0.3))
      * (peak(f, pitch * sag, 4) + 0.5 * peak(f, pitch * 2 * sag, 4) + 0.2 * hump(f, 1100, 1.1));
  }, rng, 256);
}

// A landing, heard from the top down: the tyres bark, the bump stops knock twice
// as the car compresses and rebounds, and the weight of it arrives underneath.
function landing(hard, rng) {
  const seconds = hard ? 1.2 : 0.75;
  const thud = modes(1 << 15, [
    { f: 42, t60: 0.22, a: 1 }, { f: 66, t60: 0.2, a: 0.9 }, { f: 98, t60: 0.16, a: 0.6 }, { f: 148, t60: 0.1, a: 0.3 },
  ], rng);
  const stops = modes(1 << 15, panelModes(rng, 30, 100, 1800, hard ? 0.24 : 0.17, 0.7, 0.95), rng);
  const knock = silence(0.2);
  knock[0] = 1;
  knock[samplesFor(between(rng, 0.05, 0.075))] = -0.55;
  const clunk = [convolved(knock, stops[0])];
  const tread = contact(0.05, 0.012, (f) => highPass(f, 260, 1) * lowPass(f, 3200, 2), rng);
  const layers = [
    [normalised(thud), hard ? 0.9 : 0.55, 0], [normalised(clunk), 0.8, 0], [normalised(tread), 0.7, 0.002],
    [normalised(tyreBark(hard ? 0.24 : 0.17, rng)), 0.42, 0.003], [normalised(crumple(hard ? 0.24 : 0.18, rng, true)), 0.9, 0.002],
    [normalised(rumble(seconds, rng)), hard ? 0.95 : 0.6, 0.004],
  ];
  if (hard) {
    // The floor pan meets the road, and whatever was loose jumps.
    layers.push([normalised(drag(seconds * 0.7, rng)), 0.9, 0.012], [normalised(debris(0.8, 2, rng)), 0.14, 0.05]);
  }
  return fadedOut(normalised(driven(normalised(mixed(seconds, false, layers)), 2.4), 0.95));
}

// A county fair fence: steel rails on posts, so the hit runs off along the rail
// and rattles the fixings, with the post giving a dull knock underneath.
function fence(tier, rng) {
  const seconds = tier ? 1.5 : 0.9;
  const rail = modes(1 << 16, panelModes(rng, tier ? 70 : 44, 120, 2800, tier ? 0.34 : 0.24, 0.65, 0.9), rng);
  const post = modes(1 << 15, [
    { f: 52, t60: 0.3, a: 1 }, { f: 84, t60: 0.24, a: 0.9 }, { f: 138, t60: 0.17, a: 0.7 }, { f: 230, t60: 0.1, a: 0.4 },
  ], rng);
  const edge = contact(0.03, 0.004, (f) => highPass(f, 300, 1) * lowPass(f, 4200, 2) * (1 + hump(f, 900, 1)), rng);
  const hits = [convolved(knocks(seconds, tier ? 5 : 2, tier ? 0.06 : 0.02, rng), rail[0])];
  const rattle = silence(seconds);
  for (let i = 0; i < 3 + tier * 3; i++) bounces(seconds, rattle, 0.02 + 0.08 * rng(), between(rng, 0.03, 0.07), rng);
  const fixings = eachItsOwn([rattle], () => panelModes(rng, 6, 500, 2600, 0.04, 0.4), rng);
  return fadedOut(normalised(driven(normalised(mixed(seconds, false, [
    [normalised(hits), 0.65, 0], [normalised(post), 0.95, 0], [normalised(edge), 0.5, 0.003], [normalised(fixings), 0.16, 0.012],
    [normalised(crumple(seconds * 0.26, rng, true)), 0.8, 0.002], [normalised(rumble(seconds, rng)), 0.8, 0.004],
    [normalised(drag(seconds * 0.8, rng)), tier ? 0.95 : 0.7, 0.015],
  ])), 2.6), 0.95));
}

// A shock front, a fireball losing its top end as it cools, a sub drop that keeps
// going after the flash, and then the bits landing.
function explosion(rng) {
  const seconds = 2.8;
  const heave = billow(rng, 0.45, 9);
  const fire = shaped(noiseOverTime(seconds, (t, f) => {
    const level = (1 - Math.exp(-t / 0.01)) * (Math.exp(-t / 0.42) + 0.1 * Math.exp(-t / 1.2));
    const cut = 170 + 7600 * Math.exp(-t / 0.13);
    return level * lowPass(f, cut, 1.5) * highPass(f, 26, 2) * tilt(f, 100, -0.35) * (1 + 0.9 * hump(f, 80, 1));
  }, rng), heave);
  const sub = modes(1 << 17, [{ f: 33, t60: 1.5, a: 1 }, { f: 49, t60: 1.15, a: 0.8 }, { f: 74, t60: 0.8, a: 0.5 }], rng);
  const crack = contact(0.04, 0.003, (f) => highPass(f, 160, 1) * lowPass(f, 9000, 1), rng);
  const bits = debris(seconds, 16, rng);
  return fadedOut(normalised(driven(normalised(mixed(seconds, true, [
    [normalised(fire), 1, 0], [normalised(sub), 0.42, 0], [normalised(crack), 0.8, 0], [normalised(bits), 0.13, 0.32],
  ])), 2.8), 0.95), 0.15);
}

// A hand on a car roof. The crack is the air caught under the palm, the wet part
// underneath is the meat of the hand, and the roof rings a beat after.
function slap(big, rng) {
  const crack = contact(0.05, big ? 0.008 : 0.006, (f) => highPass(f, 500, 2) * lowPass(f, 9500, 2)
    * (0.5 + 1.6 * peak(f, 1500, 2.2) + 1.4 * peak(f, 3100, 2.4)), rng);
  const meat = contact(0.14, big ? 0.03 : 0.022, (f) => highPass(f, 70, 2) * lowPass(f, 1300, 2) * (1 + 1.3 * peak(f, 240, 2)), rng);
  const palm = modes(1 << 14, [
    { f: 170, t60: 0.14, a: 1 }, { f: 265, t60: 0.1, a: 0.8 }, { f: 410, t60: 0.07, a: 0.5 },
  ], rng);
  const roof = modes(1 << 15, panelModes(rng, 50, big ? 150 : 210, 3400, big ? 0.34 : 0.22, 0.7), rng);
  const stands = big ? 0.6 : 0.42;
  return fadedOut(normalised(driven(normalised(mixed(big ? 0.8 : 0.55, false, [
    [normalised(crack), 1, 0], [normalised(meat), 0.85, 0], [normalised(palm), 0.5, 0], [normalised(roof), stands, 0.006],
    [normalised(crumple(big ? 0.2 : 0.13, rng)), 0.8, 0.001],
  ])), 3.2), 0.95));
}

// Cloth and air: a band climbing as the arm comes up, cut off dead at the top.
function sleeve(rng) {
  const seconds = 0.5;
  const flap = billow(rng, 0.5, 34);
  const air = shaped(noiseOverTime(seconds, (t, f) => {
    const u = Math.min(1, t / seconds);
    return u ** 2 * (u < 0.92 ? 1 : (1 - u) / 0.08) * hump(f, 280 * 4.5 ** u, 0.75) + 0.05 * u * hump(f, 3200, 1);
  }, rng, 512), flap);
  return fadedOut(normalised(air, 0.9));
}

// ---- Arsenal ----------------------------------------------------------------

// A rocket motor: a kick, then a roar that falls in pitch as it leaves.
function rocket(rng, seconds, seed) {
  const motor = noiseOverTime(seconds, (t, f) => {
    const leaving = 1 / (1 + t * seed.fall);
    const level = (1 - Math.exp(-t / 0.018)) * Math.exp(-t / seed.tail);
    return level * (hump(f, seed.body * leaving, 1.2) + 0.55 * hump(f, seed.hiss * leaving, 0.8));
  }, rng, 512);
  const kick = modes(1 << 14, [{ f: 92, t60: 0.2, a: 1 }, { f: 148, t60: 0.14, a: 0.6 }], rng);
  const pop = contact(0.02, 0.004, (f) => highPass(f, 500, 1) * lowPass(f, 8000, 1), rng);
  return [normalised(motor), normalised(kick), normalised(pop)];
}

function barnBurner(rng) {
  const [motor, kick, pop] = rocket(rng, 1.3, { fall: 0.9, tail: 0.42, body: 620, hiss: 4200 });
  return fadedOut(normalised(mixed(1.3, true, [[motor, 1, 0.005], [kick, 0.75, 0], [pop, 0.5, 0]]), 0.95));
}

// A thinner motor with a seeker head screaming on top of it.
function grudgeSeeker(rng) {
  const seconds = 1.6;
  const [motor, kick, pop] = rocket(rng, seconds, { fall: 0.35, tail: 0.6, body: 1100, hiss: 5200 });
  const whine = dispersed(1 << 17, (f) => hump(f, 2100, 0.4), (f) => 0.15 + 1.2 * Math.abs((f - 1500) / 1200) ** 1.5);
  const held = shaped(normalised(whine), (t) => Math.exp(-t / 0.7));
  return fadedOut(normalised(mixed(seconds, true, [[motor, 1, 0], [kick, 0.5, 0], [pop, 0.4, 0], [held, 0.3, 0]]), 0.95));
}

function chainTrack(seconds, links, gap, rng) {
  const x = silence(seconds);
  let t = 0;
  for (let i = 0; i < links; i++) {
    x[samplesFor(t)] += between(rng, 0.4, 1) * (rng() < 0.5 ? -1 : 1);
    t += gap * between(rng, 0.6, 1.3);
  }
  return x;
}

// Links are the same size but no two strike alike, so a chain is split across a few.
function chainRun(seconds, links, gap, rng) {
  const tracks = [chainTrack(seconds, links, gap, rng), chainTrack(seconds, links >> 1, gap * 2, rng), chainTrack(seconds, links >> 1, gap * 2, rng)];
  return eachItsOwn(tracks, () => {
    const lo = between(rng, 1300, 2600);
    return [...panelModes(rng, 7, lo, lo * 3.4, 0.05, 0.3), ...panelModes(rng, 3, 420, 1200, 0.04, 0.3)];
  }, rng);
}

// Compressed air behind a harpoon, with the chain paying out after it.
function repoHook(rng) {
  const shove = noiseOverTime(0.35, (t, f) => (1 - Math.exp(-t / 0.003)) * Math.exp(-t / 0.07)
    * highPass(f, 300, 1) * lowPass(f, 5000, 1), rng, 256);
  const body = modes(1 << 14, [{ f: 130, t60: 0.12, a: 1 }, { f: 420, t60: 0.1, a: 0.5 }], rng);
  return fadedOut(normalised(driven(normalised(mixed(0.75, true, [
    [normalised(shove), 0.9, 0], [normalised(body), 0.6, 0], [normalised(chainRun(0.7, 16, 0.033, rng)), 0.55, 0.03],
  ])), 2.4), 0.95));
}

function hooked(rng) {
  const plate = modes(1 << 15, panelModes(rng, 40, 300, 5200, 0.3, 0.4), rng);
  const bite = contact(0.02, 0.003, (f) => highPass(f, 900, 1) * lowPass(f, 9000, 1), rng);
  return fadedOut(normalised(driven(normalised(mixed(0.6, false, [
    [normalised(plate), 0.9, 0], [normalised(bite), 0.7, 0.004], [normalised(chainRun(0.5, 7, 0.024, rng)), 0.5, 0.05],
  ])), 3), 0.95));
}

// A heavy steel plate dropped flat, and the click as it arms.
function welcomeMat(rng) {
  const plate = modes(1 << 15, panelModes(rng, 44, 120, 2600, 0.42, 0.75), rng);
  const thud = modes(1 << 14, [{ f: 72, t60: 0.14, a: 1 }, { f: 118, t60: 0.1, a: 0.5 }], rng);
  const click = modes(1 << 12, panelModes(rng, 8, 2600, 7800, 0.025, 0.2), rng);
  return fadedOut(normalised(driven(normalised(mixed(0.9, false, [
    [normalised(plate), 1, 0], [normalised(thud), 0.4, 0], [normalised(click), 0.22, 0.7],
  ])), 3), 0.95));
}

// One bubble rings at a pitch set by its size and sharpens as it reaches the top.
function bubble(rng) {
  const low = between(rng, 190, 420);
  const rise = between(rng, 1.3, 1.9);
  const sweep = between(rng, 0.04, 0.09);
  return dispersed(1 << 14, (f) => hump(f, low * 1.25, 0.32), (f) => 0.01 + sweep * Math.max(0, Math.log2(f / low) / Math.log2(rise)));
}

function oilSlick(rng) {
  const seconds = 1;
  const layers = [];
  for (let i = 0; i < 11; i++) layers.push([normalised(bubble(rng)), between(rng, 0.4, 1), 0.72 * rng() ** 1.3]);
  const splat = noiseOverTime(0.5, (t, f) => Math.exp(-t / 0.09) * (1 - Math.exp(-t / 0.004))
    * highPass(f, 180, 1) * lowPass(f, 1500, 2), rng, 256);
  layers.push([normalised(splat), 0.7, 0]);
  return fadedOut(normalised(mixed(seconds, false, layers), 0.95));
}

// A can punctures and pours out everything it has.
function smokeBomb(rng) {
  const seconds = 1.8;
  const gush = noiseOverTime(seconds, (t, f) => (1 - Math.exp(-t / 0.03)) * Math.exp(-t / 0.65)
    * (hump(f, 3800 / (1 + t * 0.4), 1.1) + 0.3 * hump(f, 400, 1.2)), rng, 512);
  const pop = modes(1 << 13, [{ f: 240, t60: 0.05, a: 1 }, { f: 610, t60: 0.04, a: 0.6 }, { f: 1250, t60: 0.03, a: 0.3 }], rng);
  return fadedOut(normalised(mixed(seconds, true, [[normalised(gush), 0.9, 0.01], [normalised(pop), 0.7, 0]]), 0.95), 0.2);
}

// Blades coming up to speed: a chopped rush of air with a saw's whine on top.
function threshingWhirl(rng) {
  const seconds = 1.45;
  const speed = (t) => Math.sin(Math.PI * Math.min(1, t / seconds)) ** 0.6;
  const turn = (t) => {
    const u = t / seconds;
    return 34 * (u - Math.sin(TAU * u) / TAU * 0.6);
  };
  const chop = (t) => 0.35 + 0.65 * Math.max(0, Math.sin(TAU * turn(t))) ** 2;
  const rush = shaped(noiseOverTime(seconds, (t, f) => speed(t) * hump(f, 700 + 1500 * speed(t), 1.1), rng, 256), chop);
  const saw = noiseOverTime(seconds, (t, f) => {
    const pitch = 200 + 300 * speed(t);
    let sum = 0;
    for (let h = 1; h <= 7; h++) sum += peak(f, pitch * h * 1.03 ** h, 45) / h;
    return speed(t) * sum;
  }, rng, 2048);
  return fadedOut(normalised(mixed(seconds, true, [[normalised(rush), 0.9, 0], [normalised(saw), 0.55, 0]]), 0.95), 0.1);
}

// Metal biting metal: a bright ring over a short grind.
function bladeCut(rng) {
  const ring = modes(1 << 14, panelModes(rng, 44, 2300, 10500, 0.26, 0.08), rng);
  const grind = noiseOverTime(0.2, (t, f) => Math.exp(-t / 0.04) * highPass(f, 1500, 2) * lowPass(f, 10000, 1), rng, 128);
  return fadedOut(normalised(driven(normalised(mixed(0.4, false, [
    [normalised(ring), 0.8, 0], [normalised(grind), 0.9, 0], [normalised(crumple(0.12, rng)), 0.7, 0.001],
  ])), 3), 0.95));
}

// A bed frame hitting the road, loose coils rattling in it.
function springDrop(rng) {
  const frame = modes(1 << 15, panelModes(rng, 30, 320, 4600, 0.3, 0.5), rng);
  return fadedOut(normalised(driven(normalised(mixed(0.8, false, [
    [normalised(frame), 0.9, 0], [normalised(chainRun(0.6, 11, 0.04, rng)), 0.55, 0.05],
  ])), 2.6), 0.95));
}

// The coil's fundamental is a close pair of modes that beat against each other,
// which is the wobble in a boing. The real spring adds a run of chirps, because
// its high frequencies travel faster than its low ones.
function boing(rng) {
  const seconds = 1.5;
  const f = between(rng, 118, 134);
  const twang = modes(1 << 17, [
    { f, t60: 1.2, a: 1 }, { f: f + 11, t60: 1, a: 0.9 },
    { f: f * 2.03, t60: 0.8, a: 0.6 }, { f: f * 2.03 + 17, t60: 0.7, a: 0.5 },
    { f: f * 3.1, t60: 0.5, a: 0.35 }, { f: f * 4.3, t60: 0.34, a: 0.2 },
  ], rng);
  const rise = dispersed(1 << 15, (x) => hump(x, 420, 1.3), (x) => 0.02 + 0.13 * Math.min(1, Math.max(0, (x - 120) / 900)) ** 0.7);
  const layers = [[normalised(twang), 0.9, 0], [normalised(rise), 0.7, 0]];
  for (let trip = 0; trip < 6; trip++) {
    const coil = dispersed(1 << 16, (x) => highPass(x, 700, 2) * lowPass(x, 5200, 2), (x) => (2 * trip + 1) * 0.1 * Math.max(0.14, 1 - 0.86 * Math.sqrt(x / 6000)));
    layers.push([normalised(coil), 0.4 * 0.62 ** trip, 0]);
  }
  return fadedOut(normalised(driven(normalised(mixed(seconds, false, layers)), 2), 0.95), 0.15);
}

// Two brass reeds. The fundamentals come first, and the upper harmonics arrive as
// the pressure builds, so it groans into pitch instead of switching on.
function foghorn(rng) {
  const seconds = 1.9;
  const reeds = (from, to) => {
    const power = new Float64Array(1 << 17);
    for (const pitch of [111, 139.5]) {
      for (let h = from; h <= to; h++) {
        const f = pitch * h;
        addLine(power, f, f * 0.0035, hump(f, 360, 1.2) + 0.25 * hump(f, 1700, 0.8));
      }
    }
    return noiseFromPower(power, rng);
  };
  const hold = (t) => Math.min(1, (seconds - 0.07 - t) / 0.28);
  const low = shaped(reeds(1, 5), (t) => (1 - Math.exp(-t / 0.05)) * Math.max(0, hold(t)));
  const high = shaped(reeds(6, 34), (t) => (1 - Math.exp(-t / 0.22)) ** 2 * Math.max(0, hold(t)));
  const chest = modes(1 << 15, [{ f: 55.5, t60: 0.5, a: 1 }], rng);
  return fadedOut(normalised(mixed(seconds, true, [[normalised(low), 1, 0], [normalised(high), 0.85, 0], [normalised(chest), 0.3, 0]]), 0.95));
}

// Something very heavy coming down from very high up, timed to the 1.7 s fall.
function fallingWhistle(rng) {
  const seconds = 1.7;
  const octaves = Math.log2(1900 / 430);
  const along = (f) => Math.log2(f / 430) / octaves;
  const held = (f) => {
    const u = along(f);
    return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u) ** 0.5;
  };
  const delay = (f) => 0.03 + seconds * 0.92 * (1 - Math.min(1, Math.max(0, along(f)))) ** 1.3;
  const whistle = dispersed(1 << 17, held, delay);
  const breath = noiseOverTime(seconds, (t, f) => {
    const u = 1 - Math.min(1, t / (seconds * 0.95)) ** (1 / 1.3);
    return hump(f, 430 * 2 ** (u * octaves), 0.12) * (0.2 + 0.8 * t / seconds);
  }, rng, 1024);
  return fadedOut(normalised(mixed(seconds, true, [[normalised(whistle), 0.8, 0], [normalised(breath), 0.3, 0]]), 0.8), 0.04);
}

// A piano's strings are stiff, so its partials run sharp of true harmonics, and
// each note has two or three strings a hair apart. All of them go at once.
function pianoString(midi, level, list, rng) {
  const f0 = 440 * 2 ** ((midi - 69) / 12);
  const stiffness = 0.00035 * 1.03 ** (midi - 40);
  const strings = midi < 40 ? 2 : 3;
  for (let s = 0; s < strings; s++) {
    const detune = 1 + between(rng, -0.0012, 0.0012);
    for (let h = 1; h <= 14 && h * f0 < 12000; h++) {
      const f = h * f0 * Math.sqrt(1 + stiffness * h * h) * detune;
      list.push({ f, t60: between(rng, 2.6, 4.8) * (110 / Math.max(110, f)) ** 0.35, a: level * between(rng, 0.5, 1) / h ** 1.1 });
    }
  }
}

function pianoCrash(rng) {
  const seconds = 3.4;
  const list = [];
  for (let i = 0; i < 46; i++) pianoString(Math.floor(between(rng, 21, 96)), between(rng, 0.3, 1), list, rng);
  const strings = modes(1 << 18, list, rng);
  const case_ = modes(1 << 16, Array.from({ length: 60 }, () => {
    const f = 70 * 30 ** rng();
    return { f, t60: 0.28 * (70 / f) ** 0.3, a: between(rng, 0.3, 1) * (70 / f) ** 0.6 };
  }), rng);
  const iron = modes(1 << 17, [...panelModes(rng, 24, 90, 1400, 1.5, 0.5), { f: 41, t60: 0.7, a: 3 }, { f: 63, t60: 0.5, a: 2 }], rng);
  const splinters = Array.from({ length: 12 }, () => {
    const x = silence(0.8);
    for (let i = 0; i < 5; i++) x[samplesFor(0.55 * rng() ** 1.8)] += between(rng, -1, 1);
    return x;
  });
  const wood = eachItsOwn(splinters, () => {
    const lo = between(rng, 400, 2200);
    return Array.from({ length: 6 }, () => ({ f: lo * between(rng, 1, 3.5), t60: 0.035, a: between(rng, 0.3, 1) }));
  }, rng);
  const edge = contact(0.05, 0.008, (f) => highPass(f, 120, 1) * lowPass(f, 6000, 1), rng);
  return fadedOut(normalised(mixed(seconds, true, [
    [normalised(strings), 1, 0.01], [normalised(case_), 0.6, 0], [normalised(iron), 0.5, 0],
    [normalised(wood), 0.3, 0.015], [normalised(edge), 0.6, 0],
  ]), 0.95), 0.4);
}

// A prize crate: pine giving way, and a bright little bell so it reads as a prize.
function crate(rng) {
  const pine = modes(1 << 13, Array.from({ length: 16 }, () => {
    const f = 240 * 8 ** rng();
    return { f, t60: 0.07 * (240 / f) ** 0.3, a: between(rng, 0.4, 1) };
  }), rng);
  const snap = contact(0.02, 0.003, (f) => highPass(f, 700, 1) * lowPass(f, 7000, 1), rng);
  const bell = (root) => modes(1 << 15, [1, 2.76, 5.4, 8.93].map((r, i) => ({ f: root * r, t60: 0.5 / (1 + i * 0.6), a: 1 / (1 + i) })), rng);
  return fadedOut(normalised(driven(normalised(mixed(0.75, false, [
    [normalised(pine), 0.9, 0], [normalised(snap), 0.8, 0], [normalised(bell(988)), 0.35, 0.02], [normalised(bell(1480)), 0.35, 0.1],
  ])), 2.6), 0.95));
}

// ---- The library -----------------------------------------------------------

// takes: how many versions to render, so a repeat never sounds like a repeat.
export const SOUNDS = {
  grandstands: { take: grandstands },
  engineLowOff: { loop: true, take: (rng) => engine(0, 0, rng) },
  engineLowOn: { loop: true, take: (rng) => engine(0, 1, rng) },
  engineMidOff: { loop: true, take: (rng) => engine(1, 0, rng) },
  engineMidOn: { loop: true, take: (rng) => engine(1, 1, rng) },
  engineHighOff: { loop: true, take: (rng) => engine(2, 0, rng) },
  engineHighOn: { loop: true, take: (rng) => engine(2, 1, rng) },
  road: { loop: true, take: roadRoar },
  scrub: { loop: true, take: tyreScrub },
  squeal: { loop: true, take: tyreSqueal },
  grind: { loop: true, take: bodyGrind },
  crowd: { loop: true, take: (rng) => crowd(rng, 90, 0.06, 0.45) },
  cheer: { loop: true, take: (rng) => crowd(rng, 130, 0.035, 1) },
  tap: { takes: 4, take: (rng) => impact(0, rng) },
  crunch: { takes: 4, take: (rng) => impact(1, rng) },
  smash: { takes: 3, take: (rng) => impact(2, rng) },
  fenceHit: { takes: 3, take: (rng) => fence(0, rng) },
  fenceSmash: { takes: 3, take: (rng) => fence(1, rng) },
  landing: { takes: 3, take: (rng) => landing(false, rng) },
  hardLanding: { takes: 3, take: (rng) => landing(true, rng) },
  boom: { takes: 3, take: explosion },
  slap: { takes: 3, take: (rng) => slap(false, rng) },
  bigSlap: { takes: 2, take: (rng) => slap(true, rng) },
  sleeve: { takes: 2, take: sleeve },
  barnBurner: { takes: 2, take: barnBurner },
  grudgeSeeker: { takes: 2, take: grudgeSeeker },
  welcomeMat: { take: welcomeMat },
  oilSlick: { takes: 2, take: oilSlick },
  smokeBomb: { take: smokeBomb },
  threshingWhirl: { take: threshingWhirl },
  repoHook: { take: repoHook },
  hooked: { takes: 2, take: hooked },
  bedspring: { take: springDrop },
  grandPiano: { take: fallingWhistle },
  foghorn: { take: foghorn },
  cut: { takes: 3, take: bladeCut },
  boing: { takes: 2, take: boing },
  pianoCrash: { take: pianoCrash },
  crate: { takes: 2, take: crate },
};

function seedOf(name, take) {
  let h = 2166136261;
  for (const c of `${name}/${take}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// Channels of one take as Float32Arrays, the same on every machine and every load.
export function render(name, take = 0) {
  const channels = SOUNDS[name].take(createRng(seedOf(name, take)));
  return channels.map((c) => Float32Array.from(c));
}
