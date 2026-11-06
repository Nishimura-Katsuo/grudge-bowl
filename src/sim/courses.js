// Every road in the game. Each course is a closed loop of control points, plus the
// features hung on it. A feature is placed either from a crossroads pass, numbered
// in route order from the start of the lap ({ pass, offset }), or from one of the
// control points ({ corner, offset }), so it stays put if the layout changes.
//
// The first control point sits in the middle of a straight: that's the grid. Every
// course needs a crossroads, because the race is built on them.

import { FINISH_LINE_S, GRAVITY } from './config.js';
import { smoothstep } from './math.js';

const knot = {
  id: 'knot',
  name: 'The Knot',
  place: 'County fairground, last light',
  blurb: 'One road tied through itself. Mind the crossroads.',
  finishS: FINISH_LINE_S,
  control: [
    [-104, -22], [-72, -22], [-25, -22], [25, -22], [72, -22], [96, -11], [104, 16], [104, 50],
    [99, 86], [86, 110], [63, 114], [45, 99], [25, 65], [0, 22], [-25, -22], [-44, -55],
    [-58, -88], [-41, -114], [-4, -122], [33, -108], [52, -78], [42, -52], [25, -22], [0, 22],
    [-25, 65], [-46, 102], [-68, 118], [-92, 106], [-106, 76], [-122, 38], [-134, 4], [-126, -15],
  ],
  jumps: [
    // Out of the Scrapyard hairpin, where exit speeds differ most: the quick car
    // flies further and comes down on the slow one.
    { name: 'Hump', pass: 1, offset: 272, ramp: 18, fall: 11, height: 1.75, airLength: 20, maxSpeed: 27 },
    // Comes down on the third crossroads, into whoever is crossing it.
    { name: 'Dropkick', pass: 2, offset: -25, ramp: 18, fall: 11, height: 1.75, airLength: 28, maxSpeed: 31 },
    // Comes down braking for the hairpin, so the next car lands on the last one.
    { name: 'Pancake', pass: 5, offset: 40, ramp: 18, fall: 11, height: 1.75, airLength: 46, maxSpeed: 42 },
  ],
  crates: [
    { pass: 1, offset: 20 },
    { pass: 1, offset: 130 },
    { pass: 3, offset: 30 },
    { pass: 3, offset: 165 },
    { pass: 4, offset: -30 },
    { pass: 5, offset: 190 },
  ],
  widthZones: [
    { pass: 5, offset: 42, halfWidth: 6.4, span: 34 }, // funnels traffic into one lane over the Pancake
    { pass: 5, offset: 118, halfWidth: 7.4, span: 42 }, // the Pancake hairpin
    { pass: 1, offset: 212, halfWidth: 7.8, span: 34 }, // Scrapyard hairpin
    { pass: 3, offset: 130, halfWidth: 7.6, span: 26 }, // the Neck, over the top
  ],
  mud: [
    { pass: 1, offset: 236, side: -5, r: 8 },
    { pass: 3, offset: 128, side: 4, r: 7 },
    { pass: 5, offset: 150, side: 5, r: 8 },
  ],
};

// Three crossroads on the midway, the road through the big top, and the coaster overhead.
const park = {
  id: 'park',
  name: 'Gutbuster Park',
  place: 'Closed for safety reasons',
  blurb: 'The rides are still running. Nobody remembers why.',
  towers: [[-6, 26, 62]], // where the high cameras hang: x, height, z
  laps: 4,
  finishS: 550,
  control: [
    [-30, -118], [20, -118], [70, -118], [118, -106], [146, -66], [140, -20], [100, 6], [52, 6],
    [8, 14], [-26, 44], [-42, 84], [-22, 122], [24, 132], [62, 112], [66, 72], [36, 40],
    [-2, 8], [-44, -14], [-92, -18], [-136, 6], [-152, 52], [-136, 98], [-96, 112], [-74, 76],
    [-78, 28], [-84, -24], [-106, -72], [-92, -112],
  ],
  jumps: [
    { name: 'Log Flume', corner: 6, offset: 14, ramp: 18, fall: 11, height: 1.6, airLength: 26, maxSpeed: 32 },
    { name: 'The Pratfall', corner: 22, offset: 44, ramp: 18, fall: 11, height: 1.6, airLength: 22, maxSpeed: 29 },
  ],
  crates: [
    { corner: 2, offset: 0 },
    { corner: 7, offset: 20 },
    { corner: 11, offset: 0 },
    { corner: 15, offset: 0 },
    { corner: 19, offset: 0 },
    { corner: 25, offset: 0 },
  ],
  widthZones: [
    { corner: 12, offset: 0, halfWidth: 7.8, span: 40 },
    { corner: 22, offset: 0, halfWidth: 7.8, span: 34 },
  ],
  mud: [],
  covers: [
    { name: 'Big Top', from: { corner: 19, offset: 6 }, to: { corner: 21, offset: 0 }, height: 11 },
  ],
};

// Up the outside of the cone, through a notch in the rim, round the lava lake, and
// down the tube into the climbing traffic.
const CONE_FLOOR = 28, CONE_PEAK = 62;
const RIM_NOTCH = 1.01; // radians round the cone, where the road gets in

const bearing = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export function volcanoGround(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  const flank = CONE_PEAK * (1 - smoothstep(98, 196, r)) ** 3;
  const crater = CONE_FLOOR + (CONE_PEAK - CONE_FLOOR) * smoothstep(78, 98, r);
  let h = r < 98 ? crater : flank;
  // The road gets through the rim by a notch.
  const open = (1 - smoothstep(0.2, 0.5, bearing(a, RIM_NOTCH))) * (1 - smoothstep(112, 150, r));
  h += (Math.min(h, CONE_FLOOR + 3) - h) * open;
  // Old flows ripple the flanks.
  h += 2.2 * smoothstep(98, 120, r) * (1 - smoothstep(170, 196, r)) * Math.sin(a * 7) * Math.sin(r * 0.05);
  // The lake sits in a dish in the crater floor.
  return h - 7 * (1 - smoothstep(24, 38, r));
}

const volcano = {
  id: 'volcano',
  name: 'Mount Cinder',
  place: 'Still erupting, sadly',
  blurb: 'All the way up, round the lake, and out through the throat.',
  // One over the lake for the crater, and a ring outside, because no tower sees past the cone.
  towers: [[0, 60, 0], [205, 40, -30], [110, 40, 180], [-120, 40, 180], [-215, 40, -40], [-110, 40, -215], [110, 40, -205]],
  laps: 4,
  finishS: 1400,
  ground: volcanoGround,
  corners: 'ASPHALT',
  control: [
    [-30, -186], [20, -186], [70, -174], [118, -140], [154, -84], [168, -14], [152, 62], [100, 126],
    [24, 156], [-56, 150], [-118, 110], [-150, 42], [-146, -34], [-106, -92], [-38, -130], [36, -126],
    [92, -80], [116, -2], [96, 58], [52, 84], [8, 62], [-44, 52], [-60, 14], [-52, -30],
    [-68, -66], [-112, -122], [-164, -146], [-146, -188], [-92, -196],
  ],
  // The road's own height at each control point. The cone is too steep to follow.
  climb: [0, 0, 0, 0, 1, 3, 5, 7, 8, 9, 11, 12, 15, 19, 20, 22, 24, 28, 31, 31, 29, 28, 28, 28, 23, 17, 11, 5, 2],
  jumps: [
    { name: 'The Fissure', corner: 3, offset: 30, ramp: 18, fall: 11, height: 1.7, airLength: 26, maxSpeed: 32 },
    { name: 'Slag Heap', corner: 28, offset: 22, ramp: 18, fall: 11, height: 1.5, airLength: 22, maxSpeed: 30 },
  ],
  crates: [
    { corner: 2, offset: 0 },
    { corner: 6, offset: 0 },
    { corner: 11, offset: 0 },
    { corner: 16, offset: 0 },
    { corner: 21, offset: 0 },
    { corner: 26, offset: 10 },
  ],
  widthZones: [
    { corner: 19, offset: 0, halfWidth: 8, span: 40 },
  ],
  mud: [],
  covers: [
    { name: 'The Throat', from: { corner: 23, offset: 8 }, to: { corner: 24, offset: 26 }, height: 9 },
  ],
  hazard: { kind: 'lavaBomb', every: 2.6, spread: 7 },
};

// A trench to jump, dunes to roll over, and a shipwreck to drive through.
export function seabedGround(x, z) {
  const dunes = 2.4 * Math.sin(x * 0.021 + 1.2 * Math.sin(z * 0.012)) * Math.sin(z * 0.017 + 0.7)
    + 1.2 * Math.sin(x * 0.043 - z * 0.031);
  const trench = -14 * (1 - smoothstep(8, 26, Math.abs(x + 56 + 0.2 * (z + 68)))) * (1 - smoothstep(34, 90, Math.abs(z + 92)));
  return dunes + 8 + trench;
}

const seabed = {
  id: 'seabed',
  name: "Davy's Driveway",
  place: 'Four hundred fathoms, no parking',
  blurb: 'Keep your windows up.',
  towers: [[0, 26, 50]],
  laps: 4,
  finishS: 630,
  ground: seabedGround,
  control: [
    [40, 138], [84, 136], [124, 120], [152, 88], [156, 42], [124, 20], [70, 24], [20, 36],
    [-30, 54], [-78, 78], [-126, 66], [-150, 18], [-136, -36], [-92, -66], [-34, -70], [12, -96],
    [62, -128], [116, -122], [140, -80], [108, -48], [54, -44], [0, -20], [-30, 26], [-32, 84],
    [-26, 118], [-2, 136],
  ],
  jumps: [
    { name: 'The Trench', corner: 13, offset: 14, ramp: 18, fall: 11, height: 1.75, airLength: 32, maxSpeed: 36 },
    { name: 'Whale Fall', corner: 6, offset: 0, ramp: 18, fall: 11, height: 1.6, airLength: 26, maxSpeed: 32 },
  ],
  crates: [
    { corner: 2, offset: 0 },
    { corner: 5, offset: 0 },
    { corner: 10, offset: 0 },
    { corner: 15, offset: 0 },
    { corner: 18, offset: 0 },
    { corner: 23, offset: 0 },
  ],
  widthZones: [],
  mud: [
    { corner: 11, offset: 0, side: 4, r: 8 },
    { corner: 17, offset: 0, side: 4, r: 8 },
  ],
  covers: [
    { name: 'The Long Tube', from: { corner: 1, offset: 10 }, to: { corner: 3, offset: 30 }, height: 8, clear: true },
    { name: 'The Wreck', from: { corner: 11, offset: 30 }, to: { corner: 12, offset: 40 }, height: 9 },
    { name: 'The Short Tube', from: { corner: 19, offset: 0 }, to: { corner: 20, offset: 40 }, height: 8, clear: true },
  ],
};

// Long sweepers on the near side of the Moon. Jumps last for ages.
export function moonGround(x, z) {
  let h = 2.2 * Math.sin(x * 0.015 + 2) * Math.sin(z * 0.018 + 1) + 7;
  for (const [cx, cz, r, d] of MOON_CRATERS) {
    const q = Math.hypot(x - cx, z - cz) / r;
    h += d * (0.5 * (1 - smoothstep(0.8, 1.5, q)) - 1.6 * (1 - smoothstep(0.1, 0.95, q)));
  }
  return h;
}
export const MOON_CRATERS = [
  [-95, -40, 40, 9], [95, -40, 40, 9], [0, 118, 30, 7], [-190, 60, 30, 7], [190, 60, 30, 7], [0, -205, 26, 6],
];

const moon = {
  id: 'moon',
  name: 'Lower Tranquillity',
  place: 'The Moon. Yes, that one.',
  blurb: 'Less gravity. Same grudges.',
  towers: [[0, 22, -30]],
  laps: 4,
  finishS: 1120,
  // Tyres on the ground drive normally. The moment they leave it, a car floats.
  airGravity: GRAVITY * 0.3,
  ground: moonGround,
  corners: 'ASPHALT',
  control: [
    [-10, -172], [44, -170], [102, -154], [150, -100], [160, -30], [120, 28], [66, 62], [0, 70],
    [-66, 62], [-122, 28], [-160, -30], [-158, -92], [-136, -116], [-100, -92], [-64, -70], [-30, -34],
    [0, 8], [40, 50], [58, 104], [52, 150], [0, 168], [-52, 150], [-58, 104], [-40, 50],
    [0, 8], [30, -34], [58, -70], [48, -104], [0, -114], [-44, -122], [-98, -130], [-118, -158], [-76, -182],
  ],
  jumps: [
    { name: 'Small Step', corner: 2, offset: -10, ramp: 22, fall: 14, height: 1, airLength: 60, maxSpeed: 32 },
    { name: 'Giant Leap', corner: 14, offset: -6, ramp: 22, fall: 14, height: 1, airLength: 80, maxSpeed: 34 },
  ],
  crates: [
    { corner: 3, offset: 0 },
    { corner: 6, offset: 0 },
    { corner: 10, offset: 0 },
    { corner: 19, offset: 0 },
    { corner: 22, offset: 0 },
    { corner: 29, offset: 0 },
  ],
  widthZones: [],
  mud: [],
};

export const COURSES = { knot, park, volcano, seabed, moon };

// Deals courses like a shuffled deck: every one before any comes round again, and
// never the same one twice running. Takes its own randomness, so it can't touch a race.
export function courseDealer(random) {
  let hand = [];
  let last = null;
  return () => {
    if (hand.length === 0) {
      hand = Object.keys(COURSES);
      for (let i = hand.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [hand[i], hand[j]] = [hand[j], hand[i]];
      }
      if (hand[0] === last) hand.push(hand.shift());
    }
    last = hand.shift();
    return last;
  };
}
