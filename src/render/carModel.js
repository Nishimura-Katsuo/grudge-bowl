// A hulking 70s sedan from the car's character sheet, lofted from cross-sections:
// wheel wells, door seams, a face in the windscreen and teeth in the grille. It's all
// plain coloured facets, so each bot wears its own paint, and every part dents together,
// because impacts displace vertices near the contact on all of them at once.

import * as THREE from 'three';
import { CAR } from '../sim/config.js';
import { createRng, clamp } from '../sim/math.js';

const GROUND_TO_COG = 0.62;
const NOSE = 2.5;
const TAIL = -2.5;
const FLOOR = 0.26;
const SILL = 0.3;
const ARCH_RADIUS = 0.47;
const ARCH_CENTRE = 0.37; // height of a wheel's axle at rest
const WELL = 0.6; // how far in the wheel wells reach

// [x, value] pairs along the car, in metres above the ground or out from the middle.
const ROOF_LINE = [[-2.5, 0.92], [-2.44, 0.98], [-1.95, 1.03], [-1.32, 1.05], [-0.72, 1.49], [-0.6, 1.515], [0.34, 1.53], [0.46, 1.515], [1.06, 1.07], [1.75, 1.03], [2.35, 0.98], [2.5, 0.92]];
const BELT_LINE = [[-2.5, 0.85], [-2.44, 0.91], [-1.9, 0.96], [-1.3, 0.99], [1, 1], [1.7, 0.97], [2.35, 0.92], [2.5, 0.86]];
const RAIL_WIDTH = [[-2.5, 0.74], [-2.44, 0.8], [-1.32, 0.84], [-0.72, 0.72], [0.46, 0.72], [1.06, 0.84], [2.4, 0.82], [2.5, 0.76]];
const WIDTH = [[-2.5, 0.95], [-2.3, 0.985], [-1.8, 1], [1.8, 1], [2.3, 0.985], [2.5, 0.96]];

const WINDSCREEN = [0.5, 1.02];
const REAR_SCREEN = [-1.28, -0.76];
const SIDE_GLASS = [-1.16, 0.94];
const FRONT_DOOR = [0.03, 0.86];
const REAR_DOOR = [-0.82, -0.01];
const SEAM = 0.012;

const COLOUR = {
  glass: 0x10171d, rocker: 0x24211f, cap: 0x18181a, seam: 0x121113, trim: 0xd8cdb4, steel: 0xd3cab8,
  rust: 0x8f5226, deepRust: 0x5e3419, primer: 0xc4af88, door: 0xf3e2bd, teeth: 0xe9dfc8, tail: 0xb3241c,
};

function along(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, v0] = table[i - 1], [x1, v1] = table[i];
      return v0 + (v1 - v0) * (x - x0) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

const between = (x, [lo, hi]) => x > lo && x < hi;
const lerp = (a, b, t) => a + (b - a) * t;

// How high the body is cut away here to clear a wheel, or 0 between the wheels.
function archHeight(x) {
  for (const axle of [CAR.wheelFrontX, CAR.wheelRearX]) {
    const d = Math.abs(x - axle);
    if (d < ARCH_RADIUS) return ARCH_CENTRE + Math.sqrt(ARCH_RADIUS * ARCH_RADIUS - d * d);
  }
  return 0;
}

function stationsAlong() {
  const xs = [TAIL, -2.44, -2.3, -2.1, -1.28, -1.16, -0.76, -0.6, -0.34, 0.2, 0.34, 0.46, 0.5, 0.7, 0.94, 1.02, 1.06, 2.06, 2.2, 2.35, NOSE];
  for (const axle of [CAR.wheelFrontX, CAR.wheelRearX]) {
    for (let i = 0; i <= 12; i++) xs.push(axle - ARCH_RADIUS * Math.cos(Math.PI * i / 12));
    xs.push(axle - ARCH_RADIUS - 0.02, axle + ARCH_RADIUS + 0.02);
  }
  for (const edge of [...FRONT_DOOR, ...REAR_DOOR]) xs.push(edge, edge + SEAM);
  // Close together along the sills and the tail, so rust has a torn edge rather than a square one.
  for (let x = -0.8; x < 0.9; x += 0.11) xs.push(x);
  for (let x = -2.4; x < -1.9; x += 0.11) xs.push(x);
  for (let x = 1.95; x < 2.45; x += 0.11) xs.push(x);
  return [...new Set(xs.map((x) => Math.round(x * 1000) / 1000))].sort((a, b) => a - b);
}

// Halfway round the car, from under the middle of the floor to the middle of the roof.
// Bands between neighbouring points: 0 floor, 1 well wall, 2 well roof, 3 to 8 body
// side, 9 window sill, 10 window, 11 window top, 12 roof edge, 13 and 14 the top.
function sectionRing(x) {
  const top = along(ROOF_LINE, x), belt = along(BELT_LINE, x), rail = along(RAIL_WIDTH, x), w = along(WIDTH, x);
  const arch = archHeight(x);
  const sill = Math.max(arch, SILL);
  const h = top - belt;
  const onGlass = rail < 0.8;
  let last = 0;
  const up = (y) => {
    last = Math.max(last, Math.min(y, belt));
    return last;
  };
  up(sill);
  const ring = [
    [x, FLOOR, 0],
    [x, FLOOR, WELL],
    [x, arch ? arch - 0.03 : FLOOR, WELL],
    [x, sill, 0.93 * w],
    [x, up(0.42), 0.972 * w],
    [x, up(0.5), 0.978 * w],
    [x, up(0.6), 0.982 * w],
    [x, up(0.8), 0.985 * w],
    [x, up(belt - 0.07), 0.972 * w],
    [x, belt, 0.94 * w],
    [x, belt + h * 0.07, lerp(0.94 * w, rail, 0.08)],
    [x, belt + h * 0.88, lerp(0.94 * w, rail, 0.9)],
    [x, belt + h * 0.96, rail],
    [x, top - 0.006, onGlass ? rail - 0.1 : rail - 0.014],
    [x, top, 0.3],
    [x, top, 0],
  ];
  // The hood drops to a point in the middle of its front edge: the car's frown.
  const frown = clamp((x - 1.3) / 1.2, 0, 1);
  if (frown > 0) {
    for (let i = 13; i <= 15; i++) ring[i][1] -= 0.13 * frown * frown * (1 - ring[i][2] / rail);
  }
  return ring.map(([px, y, z]) => [px, y - GROUND_TO_COG, z]);
}

const STATIONS = stationsAlong();

// Collects flat coloured triangles. Faces are given with a direction to look out in,
// so the winding can't come out backwards.
class Facets {
  constructor() {
    this.pos = [];
    this.col = [];
  }

  tri(a, b, c, color) {
    if (triangleArea(a, b, c) < 1e-6) return;
    this.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.col.push(color.r, color.g, color.b);
  }

  face(points, outward, color) {
    const [o] = points;
    for (let i = 1; i + 1 < points.length; i++) {
      const a = points[i], b = points[i + 1];
      const nx = (a[1] - o[1]) * (b[2] - o[2]) - (a[2] - o[2]) * (b[1] - o[1]);
      const ny = (a[2] - o[2]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[2] - o[2]);
      const nz = (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      if (nx * outward[0] + ny * outward[1] + nz * outward[2] >= 0) this.tri(o, a, b, color);
      else this.tri(o, b, a, color);
    }
  }

  // Corners in metres above the ground.
  box([x0, y0, z0], [x1, y1, z1], color) {
    const c = (x, y, z) => [x, y - GROUND_TO_COG, z];
    this.face([c(x1, y0, z0), c(x1, y1, z0), c(x1, y1, z1), c(x1, y0, z1)], [1, 0, 0], color);
    this.face([c(x0, y0, z0), c(x0, y1, z0), c(x0, y1, z1), c(x0, y0, z1)], [-1, 0, 0], color);
    this.face([c(x0, y1, z0), c(x1, y1, z0), c(x1, y1, z1), c(x0, y1, z1)], [0, 1, 0], color);
    this.face([c(x0, y0, z0), c(x1, y0, z0), c(x1, y0, z1), c(x0, y0, z1)], [0, -1, 0], color);
    this.face([c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1)], [0, 0, 1], color);
    this.face([c(x0, y0, z0), c(x1, y0, z0), c(x1, y1, z0), c(x0, y1, z0)], [0, 0, -1], color);
  }

  geometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    computeSafeNormals(geo);
    return geo;
  }
}

function triangleArea(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

// The X part of a triangle's facing direction.
function facingX(a, b, c) {
  return (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
}

// A collapsed triangle has no normal. Left at zero, the shader normalises it into
// a NaN pixel, bloom spreads that over the frame, and the canvas goes see-through.
// Crumpling can collapse triangles, so every recompute goes through here.
function computeSafeNormals(geometry) {
  geometry.computeVertexNormals();
  const n = geometry.attributes.normal.array;
  for (let i = 0; i < n.length; i += 3) {
    if (n[i] * n[i] + n[i + 1] * n[i + 1] + n[i + 2] * n[i + 2] < 0.5) {
      n[i] = 0; n[i + 1] = 1; n[i + 2] = 0;
    }
  }
  geometry.attributes.normal.needsUpdate = true;
}

const tinted = (hex) => new THREE.Color(hex);

// The mismatched door is cream unless the car already is, as one came off another wreck.
function doorColour(paint) {
  const cream = tinted(COLOUR.door);
  const dr = paint.r - cream.r, dg = paint.g - cream.g, db = paint.b - cream.b;
  return Math.hypot(dr, dg, db) < 0.3 ? tinted(0x1f6b6b) : cream;
}

export function buildShell(carColour, id) {
  const rng = createRng(1009 + id * 31);
  const paint = tinted(carColour);
  const door = doorColour(paint);
  const palette = {
    glass: tinted(COLOUR.glass), rocker: tinted(COLOUR.rocker), seam: tinted(COLOUR.seam), trim: tinted(COLOUR.trim),
    rust: tinted(COLOUR.rust), deepRust: tinted(COLOUR.deepRust), primer: tinted(COLOUR.primer),
    fold: paint.clone().multiplyScalar(0.55),
  };
  const out = new Facets();
  const phase = [rng.range(0, 6.3), rng.range(0, 6.3), rng.range(0, 6.3), rng.range(0, 6.3)];

  // Sheet metal is never quite true, and the small errors are what make it look faceted.
  const rings = STATIONS.map((x, s) => {
    const ring = sectionRing(x);
    const end = s === 0 || s === STATIONS.length - 1;
    return [1, -1].map((side) => ring.map((p, i) => {
      if (end || i === 0 || i === ring.length - 1) return [p[0], p[1], p[2] * side];
      const y = p[1] + rng.range(-0.006, 0.006);
      return [p[0], y, (p[2] + rng.range(-0.005, 0.005)) * side];
    }));
  });

  // Rust climbs the sills and the arches in a torn edge, a bit differently each side.
  const rustLine = (x, side) => {
    const wave = Math.sin(x * 2.3 + phase[side > 0 ? 0 : 1]) + 0.6 * Math.sin(x * 5.3 + phase[side > 0 ? 2 : 3]);
    const nearWheel = Math.max(0, 1 - Math.min(Math.abs(x - CAR.wheelFrontX), Math.abs(x - CAR.wheelRearX)) / 0.75);
    return 0.5 + 0.06 * wave + 0.17 * nearWheel;
  };

  const seamAt = (x) => [...FRONT_DOOR, ...REAR_DOOR].some((edge) => x > edge && x < edge + SEAM);

  const colourOf = (x, y, b, side) => {
    if (b <= 2) return palette.rocker;
    if (b <= 8) {
      if (seamAt(x)) return palette.seam;
      const over = y - rustLine(x, side) + rng.range(-0.022, 0.022);
      if (over < -0.09) return rng() < 0.35 ? palette.deepRust : palette.rust;
      if (over < -0.015) return palette.rust;
      if (over < 0.012) return palette.primer;
      if (side < 0 && between(x, FRONT_DOOR)) return door;
      return rng() < 0.012 ? palette.rust : paint;
    }
    const greenhouse = x > REAR_SCREEN[0] && x < WINDSCREEN[1];
    if (b === 9) return greenhouse ? palette.trim : paint;
    if (b === 10) {
      const pillar = seamAt(x) || (x > REAR_DOOR[1] - 0.03 && x < FRONT_DOOR[0] + 0.03) || x < -0.86;
      return between(x, SIDE_GLASS) && !pillar ? palette.glass : paint;
    }
    if (b === 11) return greenhouse ? palette.trim : paint;
    if (b === 12) {
      if (between(x, WINDSCREEN) || between(x, REAR_SCREEN)) return palette.trim;
      return greenhouse ? paint : palette.fold;
    }
    if (between(x, WINDSCREEN) || between(x, REAR_SCREEN)) return palette.glass;
    if (x > WINDSCREEN[1] && x < 1.06) return palette.seam;
    if (x > 0.46 && x < WINDSCREEN[0]) return palette.trim;
    if (x > -1.32 && x < REAR_SCREEN[0]) return palette.seam;
    if (x > REAR_SCREEN[1] && x < -0.72) return palette.trim;
    return rng() < 0.03 ? palette.rust : paint;
  };

  const lit = new THREE.Color();
  for (let s = 0; s < rings.length - 1; s++) {
    for (const [index, side] of [[0, 1], [1, -1]]) {
      const A = rings[s][index], B = rings[s + 1][index];
      const x = 0.5 * (STATIONS[s] + STATIONS[s + 1]);
      for (let b = 0; b < A.length - 1; b++) {
        const y = 0.5 * (A[b][1] + A[b + 1][1]) + GROUND_TO_COG;
        // Coloured a triangle at a time: rust edges come out torn, and the slight
        // difference from face to face stops big panels reading as one flat colour.
        const shade = () => lit.copy(colourOf(x, y, b, side)).multiplyScalar(rng.range(0.92, 1.05));
        if (side > 0) {
          out.tri(A[b], B[b + 1], A[b + 1], shade());
          out.tri(A[b], B[b], B[b + 1], shade());
        } else {
          out.tri(A[b], A[b + 1], B[b + 1], shade());
          out.tri(A[b], B[b + 1], B[b], shade());
        }
      }
    }
  }

  // Caps on the nose and the tail: the dark behind the grille, and the back panel.
  for (const [rows, outward, color] of [[rings[0], -1, paint], [rings[rings.length - 1], 1, tinted(COLOUR.cap)]]) {
    const [right, left] = rows;
    const edge = [...right, ...left.slice().reverse()];
    const hub = [right[0][0], right.reduce((sum, p) => sum + p[1], 0) / right.length, 0];
    for (let i = 0; i < edge.length - 1; i++) {
      const a = edge[i], b = edge[i + 1];
      if (facingX(hub, a, b) * outward > 0) out.tri(hub, a, b, color);
      else out.tri(hub, b, a, color);
    }
  }
  return out.geometry();
}

// A heavy bumper seen from above: a straight bar whose ends wrap back round the corners.
function bumperAt(out, end, rng, steel, rust) {
  const plan = [[0.17, 1.0], [0.07, 0.975], [0.02, 0.8], [0, 0.42], [0, 0], [0, -0.42], [0.02, -0.8], [0.07, -0.975], [0.17, -1.0]];
  const front = end > 0 ? NOSE + 0.1 : TAIL - 0.1;
  const ring = ([back, z]) => {
    const x = front - end * back;
    return [
      [x - end * 0.12, 0.5, z], [x, 0.47, z], [x, 0.33, z], [x - end * 0.1, 0.27, z],
    ].map(([px, y, pz]) => [px, y - GROUND_TO_COG, pz]);
  };
  const outward = [[end * 0.35, 1, 0], [end, 0, 0], [end * 0.35, -1, 0]];
  for (let i = 0; i + 1 < plan.length; i++) {
    const A = ring(plan[i]), B = ring(plan[i + 1]);
    for (let b = 0; b < 3; b++) {
      const toSide = Math.sign(plan[i][1] + plan[i + 1][1]) * Math.abs(plan[i + 1][0] - plan[i][0]) * 2;
      const color = rng() < (b === 2 ? 0.45 : 0.14) ? rust : steel;
      out.face([A[b], B[b], B[b + 1], A[b + 1]], [outward[b][0], outward[b][1], toSide], color);
    }
  }
  for (const z of [-0.42, 0.42]) {
    const x0 = end > 0 ? front - 0.02 : front - 0.04;
    out.box([x0, 0.27, z - 0.04], [x0 + 0.05, 0.52, z + 0.04], steel);
  }
  // Closing the ends of the bar.
  for (const row of [ring(plan[0]), ring(plan[plan.length - 1])]) {
    out.face(row, [0, 0, -Math.sign(row[0][2]) * -1], steel);
  }
}

export function buildBumper(id, end = 1) {
  const rng = createRng(2003 + id * 17 + (end > 0 ? 0 : 1));
  const out = new Facets();
  bumperAt(out, end, rng, tinted(COLOUR.steel), tinted(COLOUR.rust));
  return out.geometry();
}

function addGrille(out, paint, steel, teeth) {
  const c = (x, y, z) => [x, y - GROUND_TO_COG, z];
  const face = NOSE + 0.012;
  const [bottom, top, half] = [0.52, 0.8, 0.55];
  // The panels round the mouth, with a brow over it that dips in the middle.
  for (const side of [-1, 1]) {
    out.face([c(face, top, 0), c(face, 0.8, 0), c(face, 0.88, side * 0.74), c(face, 0.84, side * 0.93), c(face, top, side * 0.96)], [1, 0, 0], paint);
    out.face([c(face, 0.26, side * 0.96), c(face, bottom, side * 0.96), c(face, bottom, 0), c(face, 0.26, 0)], [1, 0, 0], paint);
    out.face([c(face, bottom, side * 0.92), c(face, top, side * 0.96), c(face, top, side * (half + 0.03)), c(face, bottom, side * (half + 0.03))], [1, 0, 0], paint);
  }
  const depth = 0.05;
  out.box([NOSE, top - 0.02, -half - 0.03], [NOSE + depth, top + 0.02, half + 0.03], steel);
  out.box([NOSE, bottom - 0.02, -half - 0.03], [NOSE + depth, bottom + 0.02, half + 0.03], steel);
  for (const side of [-1, 1]) {
    const lo = side > 0 ? half : -half - 0.03, hi = lo + 0.03;
    out.box([NOSE, bottom, lo], [NOSE + depth, top, hi], steel);
  }

  // Interlocking rows of teeth, each a little wedge, none quite the same length.
  const count = 9;
  const pitch = 2 * half / count;
  const tooth = (z, baseY, tipY, width) => {
    const a = c(NOSE + 0.016, baseY, z - width), b = c(NOSE + 0.016, baseY, z + width);
    const tip = c(NOSE + 0.042, tipY, z);
    const base = c(NOSE + 0.042, baseY, z);
    out.face([a, base, tip], [0.5, 0, -1], teeth);
    out.face([b, tip, base], [0.5, 0, 1], teeth);
    out.face([a, b, base], [0, Math.sign(baseY - tipY), 0], teeth);
  };
  const mid = 0.5 * (top + bottom);
  for (let i = 0; i < count; i++) tooth(-half + pitch * (i + 0.5), top - 0.02, mid - 0.035, pitch * 0.5);
  for (let i = 0; i < count - 1; i++) tooth(-half + pitch * (i + 1), bottom + 0.02, mid + 0.035, pitch * 0.5);
}

// Everything bolted to the body. Its own geometry, because the shell stops dead at the
// nose and tail planes.
export function buildTrim(carColour) {
  const out = new Facets();
  const paint = tinted(carColour);
  const steel = tinted(COLOUR.steel);
  addGrille(out, paint, steel, tinted(COLOUR.teeth));

  for (const side of [-1, 1]) {
    // Paired headlamp housings either side of the mouth.
    const inner = side * 0.6, outer = side * 0.92;
    out.box([NOSE, 0.54, Math.min(inner, outer)], [NOSE + 0.035, 0.79, Math.max(inner, outer)], steel);

    // Tail lamps in steel frames, and the back panel between them.
    const lo = side > 0 ? 0.48 : -0.9, hi = lo + 0.42;
    out.box([TAIL - 0.02, 0.6, lo], [TAIL, 0.78, hi], steel);
    out.box([TAIL - 0.03, 0.625, lo + 0.03], [TAIL, 0.755, lo + 0.2], tinted(COLOUR.tail));
    out.box([TAIL - 0.03, 0.625, lo + 0.22], [TAIL, 0.755, hi - 0.03], tinted(COLOUR.tail));

    // Door handles.
    for (const x of [0.17, -0.68]) {
      const z = side * 0.975;
      out.box([x - 0.08, 0.84, Math.min(z, z + side * 0.03)], [x + 0.08, 0.87, Math.max(z, z + side * 0.03)], steel);
    }
  }
  bumperAt(out, -1, createRng(11), steel, tinted(COLOUR.rust));
  return out.geometry();
}

// The windscreen, as a surface: z across it, v from the base of the glass to the top.
function onWindscreen(z, v) {
  const [back, front] = [WINDSCREEN[0], WINDSCREEN[1]];
  const x = lerp(front, back, v);
  const lift = 0.016;
  return [x + lift * 0.58, along(ROOF_LINE, x) + lift * 0.82 - GROUND_TO_COG, z];
}

// Two wedges of cream with a hard slanted top, so the glass itself does the scowling.
export function buildEyes() {
  const out = new Facets();
  const white = new THREE.Color(1, 1, 1);
  const outline = [[0.05, 0.3], [0.56, 0.95], [0.62, 0.8], [0.61, 0.5], [0.53, 0.24], [0.37, 0.08], [0.18, 0.1]];
  for (const side of [-1, 1]) {
    const points = outline.map(([z, v]) => onWindscreen(side * z, v));
    out.face(points, [0.58, 0.82, 0], white);
  }
  return out.geometry();
}

export function buildLamps() {
  const out = new Facets();
  const white = new THREE.Color(1, 1, 1);
  for (const side of [-1, 1]) {
    for (const z of [0.68, 0.84]) {
      const inner = side * (z - 0.065), outer = side * (z + 0.065);
      out.box([NOSE + 0.03, 0.57, Math.min(inner, outer)], [NOSE + 0.04, 0.76, Math.max(inner, outer)], white);
    }
  }
  return out.geometry();
}

function numberTexture(n, ink, ground) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.font = "78px 'Bowlby One', Impact, sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A race number, built in the car's own space so it can dent with the door under it.
function numberPlate(size, matrix) {
  return new THREE.PlaneGeometry(size, size, 6, 6).applyMatrix4(matrix);
}

const placed = (x, y, z, euler) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y - GROUND_TO_COG, z), new THREE.Quaternion().setFromEuler(euler), new THREE.Vector3(1, 1, 1),
);

function latheFacets(out, profile, color, sides = 18) {
  const points = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(points, sides).toNonIndexed();
  const p = geo.attributes.position.array;
  for (let i = 0; i < p.length; i += 9) {
    out.tri([p[i], p[i + 1], p[i + 2]], [p[i + 3], p[i + 4], p[i + 5]], [p[i + 6], p[i + 7], p[i + 8]], color);
  }
  geo.dispose();
}

// A chunky tyre on a plain painted steel wheel. Shared by every car: only the pose differs.
export function buildWheelGeometry() {
  const r = CAR.wheelRadius;
  const out = new Facets();
  const rubber = tinted(0x171618), cream = tinted(0xf0e2c6), hub = tinted(0xc9b797);
  latheFacets(out, [[0.215, -0.112], [0.3, -0.122], [r - 0.02, -0.112], [r, -0.09], [r, 0.09], [r - 0.02, 0.112], [0.3, 0.122], [0.215, 0.112]], rubber);
  // A lathe faces left of the way its profile runs, so the rim's outer faces run inwards.
  latheFacets(out, [[0.218, 0.114], [0.205, 0.106], [0.17, 0.086], [0.1, 0.09], [0.075, 0.098], [0.002, 0.096]], cream, 12);
  latheFacets(out, [[0.002, -0.096], [0.075, -0.098], [0.1, -0.09], [0.17, -0.086], [0.205, -0.106], [0.218, -0.114]], cream, 12);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    const [x, z] = [Math.cos(a) * 0.135, Math.sin(a) * 0.135];
    for (const y of [-0.094, 0.094]) {
      const o = 0.016;
      out.face([[x - o, y, z - o], [x + o, y, z - o], [x + o, y, z + o], [x - o, y, z + o]], [0, Math.sign(y), 0], hub);
    }
  }
  const geo = out.geometry();
  geo.rotateX(Math.PI / 2);
  return geo;
}

let wheelGeometry = null;

function buildWheel(material) {
  wheelGeometry ??= buildWheelGeometry();
  const wheel = new THREE.Mesh(wheelGeometry, material);
  wheel.castShadow = true;
  const group = new THREE.Group();
  group.add(wheel);
  return group;
}

export function createCarVisual(car) {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.16 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe9b8 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe3a8 });

  const solid = (geometry, mat = material) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };

  const geometry = buildShell(car.colour, car.id);
  const shell = solid(geometry);
  const trim = buildTrim(car.colour);
  const bumperGeometry = buildBumper(car.id);
  const bumper = solid(bumperGeometry);
  solid(trim);
  const eyes = new THREE.Mesh(buildEyes(), eyeMat);
  const lamps = new THREE.Mesh(buildLamps(), lampMat);
  root.add(eyes, lamps);

  const number = car.id + 1;
  const numTex = numberTexture(number, '#1a1b20', '#f3e2bd');
  const decal = new THREE.MeshBasicMaterial({ map: numTex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
  const plates = [
    numberPlate(0.86, placed(-0.14, 1.544, 0, new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 2))),
    numberPlate(0.52, placed(0.44, 0.7, 0.998, new THREE.Euler(0, 0, 0))),
    numberPlate(0.52, placed(0.44, 0.7, -0.998, new THREE.Euler(0, Math.PI, 0))),
  ];
  for (const plate of plates) root.add(new THREE.Mesh(plate, decal));

  const wheelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 });
  const wheels = car.wheels.map(() => {
    const w = buildWheel(wheelMaterial);
    root.add(w);
    return w;
  });

  const parts = [trim, bumperGeometry, eyes.geometry, lamps.geometry, ...plates]
    .map((part) => ({ geometry: part, originalPos: part.attributes.position.array.slice() }));

  return {
    root,
    shell,
    geometry,
    originalPos: geometry.attributes.position.array.slice(),
    parts,
    wheels,
    face: { eyeMat, lampMat, bumper },
    crumpleBudget: 1,
    rage: 0,
    scorch: 0,
  };
}

const ndir = new THREE.Vector3();
const local = new THREE.Vector3();
const invQuat = new THREE.Quaternion();

function dent(geometry, orig, strength) {
  const pos = geometry.attributes.position;
  const col = geometry.attributes.color;
  const radius = 0.7 + strength * 1.1;
  const depth = 0.08 + strength * 0.4;
  const a = pos.array;
  const seed = local.x * 7.1 + local.z * 3.3;
  for (let i = 0; i < a.length; i += 3) {
    const dx = a[i] - local.x, dy = a[i + 1] - local.y, dz = a[i + 2] - local.z;
    const d = Math.sqrt(dx * dx + dy * dy * 0.6 + dz * dz);
    if (d > radius) continue;
    const f = 1 - d / radius;
    const falloff = f * f * (3 - 2 * f);
    // Positional noise, so vertices shared by flat faces move together.
    const n = 0.75 + 0.45 * Math.sin(orig[i] * 9.3 + seed) * Math.sin(orig[i + 2] * 8.7 + orig[i + 1] * 5.1);
    const push = depth * falloff * n;
    a[i] += ndir.x * push;
    a[i + 1] += ndir.y * push * 0.5 - falloff * 0.02;
    a[i + 2] += ndir.z * push;

    // Sheet metal folds a long way, but each panel stays on its own side of the car.
    const oz = orig[i + 2], ox = orig[i];
    if (Math.abs(oz) < 0.05) {
      a[i + 2] = clamp(a[i + 2], -0.12, 0.12);
    } else {
      const side = Math.sign(oz);
      const inner = Math.max(0.08, Math.abs(oz) - 0.72);
      const outer = Math.abs(oz) + 0.1;
      a[i + 2] = side * clamp(side * a[i + 2], inner, outer);
    }
    a[i] = clamp(a[i], ox - 0.95, ox + 0.95);

    // Paint scrapes off toward raw metal where the blow landed.
    if (col) {
      const c = falloff * strength * 0.9;
      col.array[i] += (0.42 - col.array[i]) * c;
      col.array[i + 1] += (0.27 - col.array[i + 1]) * c;
      col.array[i + 2] += (0.2 - col.array[i + 2]) * c;
    }
  }
  pos.needsUpdate = true;
  if (col) col.needsUpdate = true;
  computeSafeNormals(geometry);
}

// World-space impact point and direction into the car.
export function crumple(visual, worldPoint, worldNormal, strength) {
  invQuat.copy(visual.root.quaternion).invert();
  local.copy(worldPoint).sub(visual.root.position).applyQuaternion(invQuat);
  ndir.copy(worldNormal).applyQuaternion(invQuat).normalize();
  dent(visual.geometry, visual.originalPos, strength);
  for (const part of visual.parts ?? []) dent(part.geometry, part.originalPos, strength);
}

const qSim = new THREE.Quaternion();
const qPrev = new THREE.Quaternion();

export function syncCarVisual(visual, car, alpha, telemetry, time) {
  const p = car.prev;
  visual.root.position.set(
    p.px + (car.px - p.px) * alpha,
    p.py + (car.py - p.py) * alpha,
    p.pz + (car.pz - p.pz) * alpha,
  );
  qPrev.set(p.qx, p.qy, p.qz, p.qw);
  qSim.set(car.qx, car.qy, car.qz, car.qw);
  visual.root.quaternion.copy(qPrev).slerp(qSim, alpha);

  for (let i = 0; i < 4; i++) {
    const w = car.wheels[i];
    const m = visual.wheels[i];
    if (!w.attached) {
      m.visible = false;
      continue;
    }
    const travel = Math.min(w.comp, CAR.suspTravel + 0.04);
    m.position.set(w.x, CAR.hardpointY - (CAR.suspRestLength - travel), w.z);
    m.rotation.order = 'YXZ';
    m.rotation.set(0, w.front ? -car.steerAngle : 0, -w.angle);
    if (w.hp < 0.45) m.rotation.x = 0.12 * Math.sign(w.z);
  }

  const rage = telemetry?.rage ?? 0;
  visual.rage += (rage - visual.rage) * 0.1;
  const lit = car.alive ? 1 : 0;
  const flicker = car.health < 0.35 && Math.sin(time * 23 + car.id) > 0.5 ? 0.25 : 1;
  const eye = visual.face.eyeMat;
  eye.color.setRGB(
    (1.0 + visual.rage * 1.2) * lit * flicker + 0.02,
    (0.91 - visual.rage * 0.7) * lit * flicker + 0.02,
    0.72 * (1 - visual.rage) * lit * flicker + 0.02,
  );
}

export function retireCarVisual(visual) {
  const m = visual.shell.material;
  m.roughness = 0.9;
  m.metalness = 0.05;
  m.color.setRGB(0.38, 0.34, 0.32);
  visual.face.lampMat.color.set(0x14110d);
  // The front bumper lets go at one end and hangs.
  const { geometry } = visual.face.bumper;
  const a = geometry.attributes.position.array;
  for (let i = 0; i < a.length; i += 3) a[i + 1] -= Math.max(0, a[i + 2] + 1) * 0.1;
  geometry.attributes.position.needsUpdate = true;
  computeSafeNormals(geometry);
}
