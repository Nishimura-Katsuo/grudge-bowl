// The fairground's small things, as low-poly shapes: enough to read as a person or a
// tree from the track, no more. Each is one geometry of flat coloured faces. Those meant
// to come in many tints are left pale, because instance colours multiply the vertex colours.

import * as THREE from 'three';
import { createRng } from '../sim/math.js';

const WHITE = 0xffffff;
const up = new THREE.Vector3(0, 1, 0);

// A part is [geometry, colour, optional { at, turn, size }].
export function assemble(parts) {
  const pos = [], col = [];
  const colour = new THREE.Color();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const [source, hex, { at = [0, 0, 0], turn = [0, 0, 0], size = [1, 1, 1] } = {}] of parts) {
    const flat = source.index ? source.toNonIndexed() : source.clone();
    m.compose(new THREE.Vector3(...at), q.setFromEuler(e.set(...turn)), new THREE.Vector3(...size));
    flat.applyMatrix4(m);
    const p = flat.attributes.position.array;
    colour.set(hex);
    for (let i = 0; i < p.length; i += 9) {
      const ax = p[i], ay = p[i + 1], az = p[i + 2], ux = p[i + 3] - ax, uy = p[i + 4] - ay, uz = p[i + 5] - az;
      const vx = p[i + 6] - ax, vy = p[i + 7] - ay, vz = p[i + 8] - az;
      // Collapsed faces have no normal, and a NaN pixel here takes the whole frame with it.
      if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-7) continue;
      for (let k = 0; k < 9; k++) pos.push(p[i + k]);
      for (let k = 0; k < 3; k++) col.push(colour.r, colour.g, colour.b);
    }
    flat.dispose();
    if (flat !== source) source.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cone = (r, h, sides) => new THREE.ConeGeometry(r, h, sides);
const tube = (top, bottom, h, sides) => new THREE.CylinderGeometry(top, bottom, h, sides);

// A round bar between two points.
export function strut(a, b, radius, colour, sides = 4) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
  const length = from.distanceTo(to);
  const middle = from.clone().add(to).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(up, to.clone().sub(from).normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  return [tube(radius, radius, length, sides), colour, { at: middle.toArray(), turn: [e.x, e.y, e.z] }];
}

// Nudges each corner a little, so a tree isn't a perfect cone. Corners shared by
// faces have to move together, so the offset comes from where the corner is.
function roughened(geometry, amount, seed) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = flat.attributes.position.array;
  const noise = (x, y, z) => Math.sin(x * 12.9 + y * 78.2 + z * 37.7 + seed) * 43758.5453 % 1;
  for (let i = 0; i < p.length; i += 3) {
    const [x, y, z] = [p[i], p[i + 1], p[i + 2]];
    p[i] += noise(x, y, z) * amount;
    p[i + 1] += noise(y, z, x) * amount * 0.6;
    p[i + 2] += noise(z, x, y) * amount;
  }
  return flat;
}

// One material that takes its colour from the shape, and an instance tint if it has one.
export const painted = (roughness = 0.85) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness });

export function solid(geometry, material = painted(), shadow = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  return mesh;
}

// The same shape, many times. `place` poses `dummy` and sets `tint` for each one.
export function instanced(geometry, material, count, place) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color(1, 1, 1);
  for (let i = 0; i < count; i++) {
    place(dummy, tint, i);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, tint);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

export function makeSign(text, width, height, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round((1024 * height) / width);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = canvas.height * 0.72;
  ctx.font = `${size}px 'Bowlby One', Impact, sans-serif`;
  while (ctx.measureText(text).width > canvas.width * 0.92) {
    size -= 4;
    ctx.font = `${size}px 'Bowlby One', Impact, sans-serif`;
  }
  ctx.fillText(text, canvas.width / 2, canvas.height * 0.54);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }),
  );
}

// Middle of a wall loop, and how far around it the loop reaches.

// ---- People ---------------------------------------------------------------

// Sitting on a bench 0.45 up, facing +z, feet on the step. White shirt for the tint.
export function spectatorBody(cheering) {
  const trousers = 0x38404f;
  const arm = cheering
    ? (side) => [box(0.1, 0.5, 0.1), WHITE, { at: [side * 0.26, 1.2, 0.04], turn: [0.15, 0, side * -0.25] }]
    : (side) => [box(0.1, 0.46, 0.11), WHITE, { at: [side * 0.25, 0.74, 0.06], turn: [-0.2, 0, side * 0.12] }];
  return assemble([
    [new THREE.CylinderGeometry(0.15, 0.2, 0.54, 6, 1, true), WHITE, { at: [0, 0.74, 0] }],
    [box(0.36, 0.14, 0.44), trousers, { at: [0, 0.48, 0.17] }],
    [box(0.32, 0.46, 0.14), trousers, { at: [0, 0.23, 0.36] }],
    arm(-1), arm(1),
  ]);
}

// Pale skin for the tint, with hair that the tint only darkens.
export function spectatorHead() {
  return assemble([
    [new THREE.IcosahedronGeometry(0.15, 0), WHITE, { at: [0, 1.14, 0.01], size: [1, 1.12, 1] }],
    [new THREE.SphereGeometry(0.16, 6, 2, 0, Math.PI * 2, 0, Math.PI * 0.5), 0x4a4640, { at: [0, 1.16, -0.015] }],
  ]);
}

// A straw hat or a feed cap: a brim, and a crown to go on the head.
export function spectatorHat() {
  return assemble([
    [tube(0.25, 0.25, 0.02, 7), WHITE, { at: [0, 1.22, 0.02] }],
    [cone(0.15, 0.16, 6), WHITE, { at: [0, 1.3, 0.01] }],
  ]);
}

const SHIRTS = [0xc8321f, 0xe8b023, 0x1f6b6b, 0xf3e2bd, 0x34404f, 0x8a5a33, 0x9aa8b6, 0xc77a36, 0x3f5e8c, 0xe9e4d8, 0x7a2d3a];
const SKIN = [0xf0c9a4, 0xd9a77e, 0xb57f55, 0x8a5a3a, 0x5e3c28, 0xe8bd96];
const HATS = [0xdcc48a, 0xc8321f, 0x2a2c35, 0x1f6b6b, 0xe9e4d8];

// A crowd of one span, in three instanced meshes so a stand off camera costs nothing.
export function buildCrowd(seats, rng, { shirts = SHIRTS, skin = SKIN, hats = HATS } = {}) {
  const group = new THREE.Group();
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const pose = (dummy, seat) => {
    dummy.position.set(seat.x, seat.y, seat.z);
    dummy.rotation.set(0, seat.yaw, 0);
    dummy.scale.setScalar(seat.size);
  };
  const shared = { seated: painted(0.9), head: painted(0.8) };
  for (const cheering of [false, true]) {
    const some = seats.filter((seat) => seat.cheering === cheering);
    if (some.length === 0) continue;
    group.add(instanced(spectatorBody(cheering), shared.seated, some.length, (dummy, tint, i) => {
      pose(dummy, some[i]);
      tint.setHex(pick(shirts));
    }));
  }
  group.add(instanced(spectatorHead(), shared.head, seats.length, (dummy, tint, i) => {
    pose(dummy, seats[i]);
    tint.setHex(pick(skin));
  }));
  const hatted = seats.filter((seat) => seat.hat);
  group.add(instanced(spectatorHat(), shared.head, hatted.length, (dummy, tint, i) => {
    pose(dummy, hatted[i]);
    tint.setHex(pick(hats));
  }));
  return group;
}


// ---- Trees ----------------------------------------------------------------

// Fourteen metres of pine in tiers that droop a bit, each with a ragged skirt.
export function pineTree(seed) {
  const green = WHITE;
  const parts = [[tube(0.22, 0.42, 3.4, 5), 0x56402f, { at: [0, 1.7, 0] }]];
  const tiers = [[3.3, 5.4, 4.6], [2.6, 4.6, 7.2], [1.9, 3.8, 9.6], [1.1, 3, 12]];
  tiers.forEach(([radius, height, y], i) => {
    parts.push([roughened(cone(radius, height, 7), 0.4, seed + i), green, { at: [0, y, 0], turn: [0, i * 0.7, 0] }]);
  });
  return assemble(parts);
}

// A rounded broadleaf: a forked trunk under a heap of lumpy crowns.
export function broadleafTree(seed) {
  const rng = createRng(seed);
  const bark = 0x5c4633;
  const parts = [
    [tube(0.38, 0.62, 4.6, 6), bark, { at: [0, 2.3, 0] }],
    strut([0, 3.8, 0], [1.6, 6.2, 0.5], 0.2, bark),
    strut([0, 3.8, 0], [-1.3, 6, -0.7], 0.2, bark),
  ];
  const crowns = [[0, 7.4, 0, 3.4], [2.2, 6.6, 0.9, 2.5], [-2.1, 6.7, -0.8, 2.6], [0.4, 9.2, -0.5, 2.5], [-0.4, 6.4, 2, 2.1]];
  crowns.forEach(([x, y, z, r], i) => {
    const lump = roughened(new THREE.IcosahedronGeometry(r, 0), r * 0.16, seed + i * 3);
    parts.push([lump, WHITE, { at: [x, y, z], turn: [rng(), rng() * 3, rng()], size: [1, 0.86, 1] }]);
  });
  return assemble(parts);
}

// ---- Scrap ----------------------------------------------------------------

// A car that has been through the crusher: the sedan's side, squashed to 0.85 m, with
// the roof pressed into the body. Long along x. Pale for a tint of old paint.
export function crushedCar(seed) {
  const rng = createRng(seed);
  const n = () => rng() * 0.09 - 0.045;
  const outline = new THREE.Shape();
  const points = [
    [-2.3, 0.02 + n()], [2.3, 0.04 + n()], [2.3, 0.3 + n()], [1.2, 0.46 + n()], [0.62, 0.8 + n()],
    [-0.5, 0.84 + n()], [-1, 0.5 + n()], [-2.3, 0.4 + n()],
  ];
  points.forEach(([x, y], i) => (i ? outline.lineTo(x, y) : outline.moveTo(x, y)));
  outline.closePath();
  const body = new THREE.ExtrudeGeometry(outline, { depth: 1.86, bevelEnabled: false });
  body.translate(0, -0.42, -0.93);
  const glass = 0x20262c;
  const parts = [[body, WHITE]];
  for (const side of [-1, 1]) {
    parts.push([box(0.62, 0.2, 0.02), glass, { at: [0.25, 0.22, side * 0.94], turn: [0, 0, -0.03] }]);
    parts.push([box(0.44, 0.17, 0.02), glass, { at: [-0.42, 0.21, side * 0.94], turn: [0, 0, 0.1] }]);
    for (const x of [1.4, -1.4]) {
      parts.push([tube(0.3, 0.3, 0.2, 8), 0x1a1a1c, { at: [x, -0.27, side * 0.82], turn: [Math.PI / 2, 0, 0], size: [1, 1, 1] }]);
    }
  }
  parts.push([box(0.08, 0.14, 1.7), 0x8d8676, { at: [2.33, -0.2, 0], turn: [0, 0, 0.1] }]);
  parts.push([box(0.08, 0.13, 1.7), 0x8d8676, { at: [-2.33, -0.2, 0], turn: [0, 0, -0.1] }]);
  return assemble(parts);
}

// Lying flat, with a hole through it. Same size as the old solid drum.
export function stackedTyre() {
  return assemble([[new THREE.TorusGeometry(0.4, 0.165, 5, 10), WHITE, { turn: [Math.PI / 2, 0, 0] }]]);
}

// ---- Built things ---------------------------------------------------------

// Fencepost, footing and all, up from the ground at the origin.
export function fencePost(height) {
  return assemble([
    [tube(0.07, 0.08, height, 5), 0x8d8a82, { at: [0, height / 2, 0] }],
    [tube(0.1, 0.1, 0.07, 5), 0x8d8a82, { at: [0, height, 0] }],
  ]);
}

// A lamp, facing +z, with its hood. These are drawn bright.
export function floodlamp() {
  return assemble([[tube(0.34, 0.38, 0.14, 8), WHITE, { turn: [Math.PI / 2, 0, 0] }]]);
}

// A lattice leg of a water tower or wheel: paired bars with rungs between.
function ladderBetween(parts, a, b, colour, width = 0.26, rungs = 14) {
  const [x0, y0, z0] = a, [x1, y1, z1] = b;
  const dx = z1 - z0, dz = x0 - x1;
  const l = Math.hypot(dx, dz) || 1;
  const ox = (Math.abs(dx) + Math.abs(dz) > 0.01 ? dx / l : 1) * width, oz = (Math.abs(dx) + Math.abs(dz) > 0.01 ? dz / l : 0) * width;
  parts.push(strut([x0 + ox, y0, z0 + oz], [x1 + ox, y1, z1 + oz], 0.025, colour, 3));
  parts.push(strut([x0 - ox, y0, z0 - oz], [x1 - ox, y1, z1 - oz], 0.025, colour, 3));
  for (let i = 1; i < rungs; i++) {
    const t = i / rungs;
    const [x, y, z] = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t];
    parts.push(strut([x + ox, y, z + oz], [x - ox, y, z - oz], 0.02, colour, 3));
  }
}

// Sits at ground level on the origin. Tank centred at y = 21, as the signs expect.
export function waterTower(paint) {
  const steel = 0x3a3028;
  const parts = [];
  const legsAt = (y) => {
    const splay = 3 + (18 - y) * 0.12;
    return [[-splay, y, -splay], [splay, y, -splay], [splay, y, splay], [-splay, y, splay]];
  };
  const bottom = legsAt(0), top = legsAt(18);
  bottom.forEach((foot, i) => {
    parts.push(strut(foot, top[i], 0.24, steel, 6));
    parts.push([box(1.1, 0.5, 1.1), 0x6c6052, { at: [foot[0], 0.25, foot[2]] }]);
  });
  for (const [lo, hi] of [[1.5, 7], [7, 12.5], [12.5, 17.6]]) {
    const low = legsAt(lo), high = legsAt(hi);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      parts.push(strut(low[i], high[j], 0.07, steel));
      parts.push(strut(low[j], high[i], 0.07, steel));
      parts.push(strut(high[i], high[j], 0.09, steel));
    }
  }
  parts.push(strut([0, 0, 0], [0, 15, 0], 0.5, 0x4a4238, 8));
  parts.push([cone(6, 2.4, 14), paint, { at: [0, 16.3, 0], turn: [Math.PI, 0, 0] }]);
  parts.push([tube(6, 6, 7, 14), paint, { at: [0, 21, 0] }]);
  parts.push([tube(6.15, 6.15, 0.26, 14), steel, { at: [0, 24.4, 0] }]);
  parts.push([tube(6.15, 6.15, 0.2, 14), steel, { at: [0, 17.7, 0] }]);
  parts.push([cone(6.5, 2.6, 14), steel, { at: [0, 25.8, 0] }]);
  parts.push([new THREE.IcosahedronGeometry(0.34, 0), paint, { at: [0, 27.2, 0] }]);
  // The walkway round the bowl of the tank, with a rail.
  parts.push([tube(7.1, 7.1, 0.12, 14), steel, { at: [0, 17.6, 0] }]);
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2, b = (i + 1) / 14 * Math.PI * 2;
    const p = (angle, y) => [Math.cos(angle) * 7.05, y, Math.sin(angle) * 7.05];
    parts.push(strut(p(a, 17.6), p(a, 18.7), 0.04, steel, 3));
    parts.push(strut(p(a, 18.7), p(b, 18.7), 0.04, steel, 3));
  }
  ladderBetween(parts, [3, 0.6, 3], [3.6, 17.6, 3.6], steel, 0.26, 26);
  return assemble(parts);
}

// The marshal's hut on stilts: the deck stood at 16.2, and it still does.
export function marshalTower() {
  const steel = 0x2f2c2c, red = 0xc8321f, cream = 0xe6d8bb, glass = 0x1e2a30;
  const parts = [];
  const feet = [[-3, -3], [3, -3], [3, 3], [-3, 3]], heads = [[-2.1, -2.1], [2.1, -2.1], [2.1, 2.1], [-2.1, 2.1]];
  feet.forEach(([x, z], i) => {
    parts.push(strut([x, 0, z], [heads[i][0], 16, heads[i][1]], 0.17, steel, 6));
    parts.push([box(0.8, 0.4, 0.8), 0x6c6052, { at: [x, 0.2, z] }]);
  });
  const leg = (i, t) => [feet[i][0] + (heads[i][0] - feet[i][0]) * t, 16 * t, feet[i][1] + (heads[i][1] - feet[i][1]) * t];
  for (const [t0, t1] of [[0.08, 0.36], [0.36, 0.66], [0.66, 0.96]]) {
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      parts.push(strut(leg(i, t0), leg(j, t1), 0.05, steel));
      parts.push(strut(leg(j, t0), leg(i, t1), 0.05, steel));
      parts.push(strut(leg(i, t1), leg(j, t1), 0.06, steel));
    }
  }
  ladderBetween(parts, [3.2, 0.3, 0], [3.2, 16.2, 0], cream, 0.24, 24);
  parts.push([box(7, 0.4, 7), steel, { at: [0, 16.2, 0] }]);
  for (const [x, z, lx, lz] of [[-3.4, -3.4, 6.8, 0], [-3.4, 3.4, 6.8, 0], [-3.4, -3.4, 0, 6.8], [3.4, -3.4, 0, 6.8]]) {
    parts.push(strut([x, 17.4, z], [x + lx, 17.4, z + lz], 0.05, cream));
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      parts.push(strut([x + lx * t, 16.4, z + lz * t], [x + lx * t, 17.4, z + lz * t], 0.035, cream, 3));
    }
  }
  parts.push([box(5, 1.1, 5), red, { at: [0, 16.95, 0] }]);
  parts.push([box(5.02, 0.85, 5.02), glass, { at: [0, 17.9, 0] }]);
  for (const [x, z] of [[-2.4, -2.4], [2.4, -2.4], [2.4, 2.4], [-2.4, 2.4], [0, -2.5], [0, 2.5], [-2.5, 0], [2.5, 0]]) {
    parts.push([box(0.2, 0.86, 0.2), cream, { at: [x, 17.9, z] }]);
  }
  parts.push([box(5.2, 0.28, 5.2), red, { at: [0, 18.45, 0] }]);
  parts.push([cone(4.6, 1.6, 4), 0x3a3028, { at: [0, 19.35, 0], turn: [0, Math.PI / 4, 0] }]);
  parts.push(strut([0, 20, 0], [0, 23.4, 0], 0.05, cream, 4));
  parts.push([box(1.5, 0.85, 0.03), 0xe8b023, { at: [0.78, 22.9, 0] }]);
  return assemble(parts);
}

// Thirty metres of lighting mast with its ladder and a frame for the lamps, at the
// origin and facing +z. The lamps themselves are drawn separately.
export function lightTower() {
  const steel = 0x2f2c2c;
  const parts = [
    [tube(0.26, 0.5, 30, 8), steel, { at: [0, 15, 0] }],
    [box(1.5, 0.9, 1.5), 0x6c6052, { at: [0, 0.45, 0] }],
    [box(5.6, 0.14, 0.14), steel, { at: [0, 31.4, 0.2] }],
    [box(5.6, 0.14, 0.14), steel, { at: [0, 28.7, 0.2] }],
  ];
  for (let i = -3; i <= 3; i += 2) parts.push([box(0.12, 2.8, 0.12), steel, { at: [i * 0.93, 30, 0.2] }]);
  parts.push([box(5.6, 2.6, 0.22), 0x252225, { at: [0, 30, 0.08] }]);
  parts.push([box(5.8, 0.1, 1), steel, { at: [0, 28.5, 0.3] }]);
  ladderBetween(parts, [0, 0.9, -0.62], [0, 28.4, -0.34], 0x57524a, 0.2, 40);
  return assemble(parts);
}

// A gondola that hangs level: tub, posts, and a canopy with a point on it.
function gondola(parts, x, y, z, paint) {
  const cream = 0xe6d8bb;
  const seat = y - 2.1;
  parts.push([tube(1.25, 1, 0.8, 8), paint, { at: [x, seat, z] }]);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const [px, pz] = [x + Math.cos(a) * 0.86, z + Math.sin(a) * 0.86];
    parts.push(strut([px, seat + 0.3, pz], [px, y - 0.4, pz], 0.05, 0x2a2228, 3));
  }
  parts.push([cone(1.6, 0.8, 8), cream, { at: [x, y, z] }]);
  parts.push(strut([x, y + 0.3, z], [x, y + 0.75, z], 0.08, 0x2a2228, 3));
}

// Hub at the origin, wheel in the x-y plane, reaching 26 out. Legs run down to `foot`.
export function ferrisWheel(foot) {
  const steel = 0x2a2228;
  const width = 1.3;
  const parts = [];
  const spokes = 16;
  for (const side of [-1, 1]) {
    const z = side * width;
    parts.push([new THREE.TorusGeometry(26, 0.34, 5, 40), steel, { at: [0, 0, z] }]);
    parts.push([new THREE.TorusGeometry(19, 0.16, 4, 32), steel, { at: [0, 0, z] }]);
    for (let i = 0; i < spokes; i++) {
      const a = i / spokes * Math.PI * 2, b = (i + 1) / spokes * Math.PI * 2;
      const rim = (angle, r) => [Math.cos(angle) * r, Math.sin(angle) * r, z];
      parts.push(strut([0, 0, z * 0.6], rim(a, 26), 0.11, steel));
      parts.push(strut(rim(a, 19), rim(b, 26), 0.06, steel, 3));
    }
    // An A-frame each side, braced, standing on a footing.
    const leg = side * (width + 2.2);
    for (const across of [-1, 1]) {
      const toe = [across * 17, foot, leg + side * 2.4];
      parts.push(strut([0, 0, leg], toe, 0.44, steel, 6));
      parts.push([box(3, 0.6, 3), 0x6c6052, { at: [toe[0], foot + 0.3, toe[2]] }]);
    }
    parts.push(strut([-11.6, foot * 0.68, leg + side * 1.63], [11.6, foot * 0.68, leg + side * 1.63], 0.2, steel, 4));
    parts.push(strut([-5.8, foot * 0.34, leg + side * 0.82], [5.8, foot * 0.34, leg + side * 0.82], 0.16, steel, 4));
  }
  parts.push(strut([0, 0, -width - 2.6], [0, 0, width + 2.6], 0.6, steel, 8));
  parts.push(strut([0, 0, -width - 0.2], [0, 0, width + 0.2], 2.1, 0xc8321f, 10));
  for (let i = 0; i < spokes; i++) {
    const a = i / spokes * Math.PI * 2;
    const [x, y] = [Math.cos(a) * 26, Math.sin(a) * 26];
    parts.push(strut([x, y, -width], [x, y, width], 0.13, steel));
    gondola(parts, x, y, 0, i % 2 ? 0xc8321f : 0xe8b023);
  }
  return assemble(parts);
}

// Bulbs strung round a wheel, to show up against the sunset.
export function wheelBulbs() {
  const parts = [];
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2;
    for (const z of [-1.3, 1.3]) {
      parts.push([new THREE.OctahedronGeometry(0.26), WHITE, { at: [Math.cos(a) * 26.5, Math.sin(a) * 26.5, z] }]);
    }
  }
  return assemble(parts);
}
