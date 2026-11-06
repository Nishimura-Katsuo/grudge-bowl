// The four places that aren't the county fair. Each is a look (sky, light, ground, the
// sponsors on the barrier) and a build(), which puts the world around the road and may
// return a function to keep it moving. Only the render side lives here: nothing in
// this file can change a race, and none of it touches the world's rng.

import * as THREE from 'three';
import { smoothstep } from '../sim/math.js';
import { assemble, buildCrowd, instanced, makeSign, painted, pineTree, solid, strut } from './props.js';
import { buildGrandstands } from './stage.js';

const WHITE = 0xffffff;
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cone = (r, h, sides) => new THREE.ConeGeometry(r, h, sides);
const tube = (top, bottom, h, sides, open = false) => new THREE.CylinderGeometry(top, bottom, h, sides, 1, open);
const ball = (r, detail = 1) => new THREE.IcosahedronGeometry(r, detail);
const lump = (r, w, h) => new THREE.SphereGeometry(r, w, h);
const glowing = (hex, power = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(power), toneMapped: true });

// ---- Shared ground rules ----------------------------------------------------------------

const roadAt = (track, s) => {
  const i = track.indexAt(s), c = track.centre;
  return { x: c.px[i], z: c.pz[i], tx: c.tx[i], tz: c.tz[i], hw: track.hw[i], y: track.heightAt(c.px[i], c.pz[i]) };
};

const cornerAt = (track, corner, offset = 0) => track.centre.anchors[corner] + offset;

// Somewhere clear of the road. sdfAt stops at -16, so a clearance has to be less than that.
function clearSpots(track, rng, count, clearance, { from = 0, to = 1 } = {}) {
  const b = track.bounds, found = [];
  for (let tries = 0; tries < count * 60 && found.length < count; tries++) {
    const x = b.minX + (b.maxX - b.minX) * (from + (to - from) * rng());
    const z = b.minZ + (b.maxZ - b.minZ) * (from + (to - from) * rng());
    if (track.sdfAt(x, z) < -clearance) found.push([x, z, track.heightAt(x, z)]);
  }
  return found;
}

// Past the map, on the apron, in a ring all round.
function ringSpots(rng, count, inner, outer) {
  return Array.from({ length: count }, () => {
    const a = rng() * Math.PI * 2, r = inner + rng() * (outer - inner);
    return [Math.cos(a) * r, Math.sin(a) * r, -0.6];
  });
}

// Is this spot free of road for something this wide?
const freeOf = (track, x, z, reach) => {
  for (let a = 0; a < 6.28; a += 0.785) {
    if (track.sdfAt(x + Math.cos(a) * reach, z + Math.sin(a) * reach) > -1.5) return false;
  }
  return track.sdfAt(x, z) < -1.5;
};

// A roof over a stretch of road. `colour(rib, k)` paints each panel, `rough` knocks the
// arch about for rock. Purely a picture: the sim's walls are the barrier either side.
function roofOver(track, cover, { colour, rough = 0, step = 3, sides = 10, widen = 1.6 }) {
  const rings = [];
  const count = Math.round(cover.length / step);
  for (let r = 0; r <= count; r++) {
    const p = roadAt(track, cover.from + (r / count) * cover.length);
    const nx = -p.tz, nz = p.tx, wide = p.hw + widen;
    const ring = [];
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI;
      const bump = rough * (Math.sin(r * 2.3 + k * 1.7) * 0.5 + Math.sin(r * 0.9 - k * 2.9) * 0.5);
      const out = Math.cos(a) * (wide + bump), up = Math.sin(a) * (cover.height + bump);
      ring.push([p.x + nx * out, p.y - 0.5 + up, p.z + nz * out]);
    }
    rings.push(ring);
  }
  const pos = [], col = [];
  const paint = new THREE.Color();
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < sides; k++) {
      const a = rings[r][k], b = rings[r + 1][k], d = rings[r + 1][k + 1], e = rings[r][k + 1];
      pos.push(...a, ...b, ...d, ...a, ...d, ...e);
      paint.set(colour(r, k));
      for (let v = 0; v < 6; v++) col.push(paint.r, paint.g, paint.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

// A roof is seen from underneath as often as from above, so it paints both faces.
const roofing = (roughness) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness, side: THREE.DoubleSide });

// Lamps down the ridge of a roof, so the inside of it reads at speed.
function ridgeLamps(root, track, cover, hex, gap = 8) {
  const count = Math.floor(cover.length / gap);
  root.add(instanced(lump(0.34, 6, 4), glowing(hex, 3), count, (dummy, tint, i) => {
    const p = roadAt(track, cover.from + (i + 0.5) * gap);
    dummy.position.set(p.x, p.y + cover.height - 1, p.z);
  }));
}

// People packed along a stretch of barrier, watching the road.
function fansAlong(track, rng, from, to, side, opts) {
  const seats = [];
  for (let s = from; s < to; s += 1.3) {
    const p = roadAt(track, s);
    const nx = -p.tz * side, nz = p.tx * side;
    for (let row = 0; row < 3; row++) {
      const r = p.hw + 2.2 + row * 1.4 + rng() * 0.5;
      const x = p.x + nx * r + p.tx * rng(), z = p.z + nz * r + p.tz * rng();
      if (track.sdfAt(x, z) > -0.8) continue;
      seats.push({
        x, z, y: track.heightAt(x, z) + 0.05 + row * 0.25,
        yaw: Math.atan2(-nx, -nz) + (rng() - 0.5) * 0.8,
        size: 0.94 + rng() * 0.14,
        cheering: rng() < 0.3,
        hat: rng() < 0.3,
      });
    }
  }
  return buildCrowd(seats, rng, opts);
}

// Things that drift on a circle, as one instanced mesh that's rewritten each frame.
function drifters(mesh, list, place) {
  const dummy = new THREE.Object3D();
  return (time) => {
    for (let i = 0; i < list.length; i++) {
      place(dummy, list[i], time);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
}

// ---- Gutbuster Park ---------------------------------------------------------------------

function coaster(root, track, points) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), true, 'centripetal');
  const SAMPLES = 640;
  const frames = curve.computeFrenetFrames(SAMPLES, true);
  const spots = curve.getSpacedPoints(SAMPLES);
  const parts = [];
  const rail = 0xff2f6d, tie = 0xd9d4c8, leg = 0xe8e4da;
  for (let i = 0; i < SAMPLES; i += 2) {
    const a = spots[i], b = spots[(i + 2) % SAMPLES];
    const bi = frames.binormals[i], bj = frames.binormals[(i + 2) % SAMPLES];
    for (const side of [-1, 1]) {
      parts.push(strut(a.clone().addScaledVector(bi, side * 0.8).toArray(), b.clone().addScaledVector(bj, side * 0.8).toArray(), 0.14, rail, 4));
    }
    if (i % 4 === 0) parts.push(strut(a.clone().addScaledVector(bi, -0.8).toArray(), a.clone().addScaledVector(bi, 0.8).toArray(), 0.09, tie, 3));
    if (i % 20 === 0 && a.y > 3 && track.sdfAt(a.x, a.z) < -2.5) {
      const floor = track.heightAt(a.x, a.z);
      parts.push(strut([a.x, floor, a.z], [a.x, a.y - 0.4, a.z], 0.28, leg, 5));
      parts.push(strut([a.x - 2, floor, a.z + 1], [a.x, Math.min(a.y - 0.4, floor + 8), a.z], 0.12, leg, 3));
      parts.push(strut([a.x + 2, floor, a.z - 1], [a.x, Math.min(a.y - 0.4, floor + 8), a.z], 0.12, leg, 3));
    }
  }
  root.add(solid(assemble(parts), painted(0.5)));

  const car = assemble([
    [box(1.7, 0.9, 2.6), 0xffc21f, { at: [0, 0.75, 0] }],
    [box(1.5, 0.5, 1.3), 0x1a1b20, { at: [0, 1.2, -0.3] }],
    [cone(0.85, 1.2, 4), 0xff2f6d, { at: [0, 0.8, 1.7], turn: [Math.PI / 2, Math.PI / 4, 0] }],
    [lump(0.26, 6, 4), 0xf0c9a4, { at: [-0.4, 1.6, -0.3] }],
    [lump(0.26, 6, 4), 0xd9a77e, { at: [0.4, 1.6, -0.3] }],
  ]);
  const TRAIN = 5;
  const train = new THREE.InstancedMesh(car, painted(0.5), TRAIN);
  train.frustumCulled = false;
  root.add(train);
  const m = new THREE.Matrix4(), look = new THREE.Vector3(), here = new THREE.Vector3();
  let u = 0;
  const up = new THREE.Vector3(0, 1, 0);
  return (time, dt) => {
    // Slow to the top, quick to the bottom, like everything with a chain lift.
    curve.getPointAt(u, here);
    const speed = 16 + Math.max(0, 42 - here.y) * 1.1;
    u = (u + (speed * dt) / curve.getLength()) % 1;
    for (let i = 0; i < TRAIN; i++) {
      const at = (u - i * 0.0052 + 1) % 1;
      curve.getPointAt(at, here);
      curve.getTangentAt(at, look);
      m.lookAt(look, new THREE.Vector3(), up);
      m.setPosition(here);
      train.setMatrixAt(i, m);
    }
    train.instanceMatrix.needsUpdate = true;
  };
}

function carousel(root, x, y, z) {
  const base = new THREE.Group();
  base.position.set(x, y, z);
  const still = [
    [tube(10.5, 11, 0.8, 16), 0x7a2d3a, { at: [0, 0.4, 0] }],
    [tube(0.7, 0.9, 7, 8), 0xf3d27a, { at: [0, 4, 0] }],
  ];
  base.add(solid(assemble(still), painted(0.6)));
  const turning = new THREE.Group();
  const horse = [];
  const stripes = [0xff2f6d, 0xfff2d6];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    horse.push([box(4.4, 0.12, 2.4), stripes[i % 2], { at: [Math.cos(a) * 9, 7.2 + 0.0, Math.sin(a) * 9], turn: [0, -a, 0] }]);
    if (i % 2) continue;
    const r = i % 4 ? 8.6 : 6.6, hx = Math.cos(a) * r, hz = Math.sin(a) * r, heading = -a;
    horse.push(strut([hx, 0.8, hz], [hx, 7, hz], 0.07, 0xf3d27a, 4));
    const paint = [0xfff2d6, 0x3a2a24, 0xc8321f, 0x3f7ec7][(i / 2) % 4];
    horse.push([box(0.5, 0.7, 1.6), paint, { at: [hx, 3, hz], turn: [0, heading, 0] }]);
    horse.push([box(0.32, 0.8, 0.45), paint, { at: [hx + Math.sin(a) * 0.9, 3.55, hz + Math.cos(a) * -0.9], turn: [0.4, heading, 0] }]);
  }
  horse.push([cone(11.4, 3.6, 16), 0xff2f6d, { at: [0, 9.2, 0] }]);
  horse.push([tube(0.05, 0.05, 2, 4), 0xf3d27a, { at: [0, 11.8, 0] }]);
  turning.add(solid(assemble(horse), painted(0.5)));
  const bulbs = new THREE.InstancedMesh(lump(0.17, 5, 3), glowing(0xffe9a8, 2.6), 32);
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    bulbs.setMatrixAt(i, new THREE.Matrix4().setPosition(Math.cos(a) * 11.3, 7.5, Math.sin(a) * 11.3));
  }
  turning.add(bulbs);
  base.add(turning);
  root.add(base);
  return (time) => { turning.rotation.y = time * 0.55; };
}

function bigWheel(root, x, y, z, yaw) {
  const HUB = 34, R = 30, CARS = 14;
  const site = new THREE.Group();
  site.position.set(x, y, z);
  site.rotation.y = yaw;
  const legs = [];
  for (const side of [-1, 1]) {
    for (const foot of [-1, 1]) legs.push(strut([foot * 14, 0, side * 5], [0, HUB, side * 2.4], 0.6, 0x2b2740, 6));
  }
  legs.push(strut([0, HUB, -3.4], [0, HUB, 3.4], 0.7, 0x4a4470, 8));
  site.add(solid(assemble(legs), painted(0.6)));
  const wheel = new THREE.Group();
  wheel.position.y = HUB;
  const frame = [];
  for (let i = 0; i < CARS; i++) {
    const a = (i / CARS) * Math.PI * 2, b = ((i + 1) / CARS) * Math.PI * 2;
    const p = [Math.cos(a) * R, Math.sin(a) * R], q = [Math.cos(b) * R, Math.sin(b) * R];
    for (const side of [-1.6, 1.6]) {
      frame.push(strut([p[0], p[1], side], [q[0], q[1], side], 0.22, 0x4a4470, 4));
      frame.push(strut([0, 0, side], [p[0], p[1], side], 0.13, 0x4a4470, 3));
    }
    frame.push(strut([p[0], p[1], -1.6], [p[0], p[1], 1.6], 0.09, 0x8c86b0, 3));
  }
  wheel.add(solid(assemble(frame), painted(0.6), false));
  const cab = assemble([[box(2.4, 2, 2.4), WHITE, { at: [0, -1.5, 0] }], [cone(1.9, 0.9, 4), WHITE, { at: [0, 0, 0], turn: [0, Math.PI / 4, 0] }]]);
  const cabs = instanced(cab, painted(0.6), CARS, (dummy, tint, i) => {
    tint.setHSL(i / CARS, 0.8, 0.6);
  });
  wheel.add(cabs);
  const rimLights = instanced(lump(0.3, 5, 3), glowing(0xffffff, 2.8), 56, (dummy, tint, i) => {
    const a = (i / 56) * Math.PI * 2;
    dummy.position.set(Math.cos(a) * R, Math.sin(a) * R, i % 2 ? 1.7 : -1.7);
    tint.setHSL((i % 7) / 7, 0.9, 0.62);
  });
  wheel.add(rimLights);
  site.add(wheel);
  root.add(site);
  const move = drifters(cabs, Array.from({ length: CARS }, (_, i) => i), (dummy, i, time) => {
    const a = (i / CARS) * Math.PI * 2 + time * 0.14;
    dummy.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
  });
  return (time) => {
    move(time);
    rimLights.rotation.z = time * 0.14;
  };
}

function dropTower(root, x, y, z) {
  const site = new THREE.Group();
  site.position.set(x, y, z);
  const mast = [
    [tube(1.4, 2.2, 66, 8), 0x3a3560, { at: [0, 33, 0] }],
    [tube(3.4, 1.6, 2.4, 8), 0xff2f6d, { at: [0, 66, 0] }],
  ];
  for (let h = 6; h < 62; h += 7) mast.push([tube(2.5, 2.5, 0.2, 8), 0xfff2d6, { at: [0, h, 0] }]);
  site.add(solid(assemble(mast), painted(0.5)));
  const ring = new THREE.Group();
  const seats = [[tube(4.6, 4.6, 1.2, 10), 0xffc21f, {}]];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    seats.push([lump(0.34, 6, 4), 0xf0c9a4, { at: [Math.cos(a) * 4.8, 0.2, Math.sin(a) * 4.8] }]);
  }
  ring.add(solid(assemble(seats), painted(0.5), false));
  site.add(ring);
  const beacon = new THREE.Mesh(lump(0.8, 6, 4), glowing(0xff2f6d, 3));
  beacon.position.y = 68;
  site.add(beacon);
  root.add(site);
  return (time) => {
    // Twelve seconds up, a long moment at the top, and then not.
    const t = time % 16;
    const k = t < 10 ? smoothstep(0, 10, t) : t < 13 ? 1 : 1 - ((t - 13) / 1.1) ** 2;
    ring.position.y = 3 + 58 * Math.max(0, k);
  };
}

function swingRide(root, x, y, z) {
  const site = new THREE.Group();
  site.position.set(x, y, z);
  site.add(solid(assemble([[tube(1.3, 2.4, 13, 8), 0x2b2740, { at: [0, 6.5, 0] }]]), painted(0.5)));
  const top = new THREE.Group();
  top.position.y = 13;
  const parts = [[cone(7.2, 2.6, 12), 0x3fc7c0, { at: [0, 1.3, 0] }]];
  const CHAINS = 12;
  for (let i = 0; i < CHAINS; i++) {
    const a = (i / CHAINS) * Math.PI * 2;
    const hx = Math.cos(a) * 7, hz = Math.sin(a) * 7, sx = Math.cos(a) * 12.5, sz = Math.sin(a) * 12.5;
    parts.push(strut([hx, 0, hz], [sx, -6.6, sz], 0.05, 0xd9d4c8, 3));
    parts.push([box(1, 0.2, 1), 0xffc21f, { at: [sx, -6.7, sz], turn: [0, -a, 0] }]);
    parts.push([lump(0.28, 6, 4), 0xd9a77e, { at: [sx, -6.2, sz] }]);
  }
  top.add(solid(assemble(parts), painted(0.5), false));
  site.add(top);
  root.add(site);
  return (time) => {
    top.rotation.y = time * 1.5;
    top.rotation.x = Math.sin(time * 0.7) * 0.06;
  };
}

// The park's mascot, looking over the midway with an unkind expression.
function mrGutbuster(root, x, y, z, yaw) {
  const parts = [
    [tube(6, 8, 13, 8), 0xff2f6d, { at: [0, 6.5, 0] }],
    [lump(8.4, 10, 7), 0xf6ead8, { at: [0, 20, 0], size: [1, 1.08, 1] }],
    [lump(2.2, 8, 6), 0xff2f2f, { at: [0, 20, 8.2] }],
    [cone(8.6, 12, 8), 0x3fc7c0, { at: [0, 33, 0], turn: [0.14, 0, 0.08] }],
    [lump(1.8, 6, 5), 0xffc21f, { at: [-1.2, 39, 1] }],
    [lump(3.6, 8, 6), 0xff7a1f, { at: [-9, 22, 0] }],
    [lump(3.6, 8, 6), 0xff7a1f, { at: [9, 22, 0] }],
    [lump(1.4, 8, 6), 0x101014, { at: [-3.3, 23, 7.2] }],
    [lump(1.4, 8, 6), 0x101014, { at: [3.3, 23, 7.2] }],
    [tube(6.2, 6.2, 1.6, 12, true), 0xc8121f, { at: [0, 14.8, 3.2], turn: [Math.PI / 2 - 0.3, 0, 0], size: [1, 1, 0.5] }],
  ];
  for (let i = -3; i <= 3; i++) parts.push([box(1, 1.6, 0.5), 0xfffbe9, { at: [i * 1.3, 15.6 - Math.abs(i) * -0.22, 8.2 - Math.abs(i) * 0.5] }]);
  const mesh = solid(assemble(parts), painted(0.5));
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  root.add(mesh);
}

function stalls(root, track, rng) {
  const spots = clearSpots(track, rng, 46, 5).filter(([x, z]) => freeOf(track, x, z, 4));
  const stall = assemble([
    [box(4.4, 2.6, 3), WHITE, { at: [0, 1.3, 0] }],
    [box(3.6, 1.2, 0.1), 0x181420, { at: [0, 1.75, 1.52] }],
    [cone(3.6, 1.8, 4), 0xfff2d6, { at: [0, 3.5, 0], turn: [0, Math.PI / 4, 0], size: [1, 1, 0.82] }],
  ]);
  root.add(instanced(stall, painted(0.6), spots.length, (dummy, tint, i) => {
    const [x, z, y] = spots[i];
    dummy.position.set(x, y, z);
    dummy.rotation.y = rng() * 6.28;
    tint.setHSL(rng(), 0.75, 0.55);
  }));
}

// Bulbs strung on poles beside the road, everywhere the road goes.
function stringLights(root, track, rng) {
  const c = track.centre;
  const bulbs = [], poles = [];
  const palette = [0xffe9a8, 0xff5a8a, 0x5ff0e6, 0xffc21f];
  for (let s = 0; s < track.length; s += 24) {
    const i = track.indexAt(s), j = track.indexAt(s + 24);
    for (const side of [1, -1]) {
      const off = track.hw[i] + 1.9;
      const ax = c.px[i] - c.tz[i] * side * off, az = c.pz[i] + c.tx[i] * side * off;
      const bx = c.px[j] - c.tz[j] * side * (track.hw[j] + 1.9), bz = c.pz[j] + c.tx[j] * side * (track.hw[j] + 1.9);
      if (track.sdfAt(ax, az) > -0.6 || track.sdfAt(bx, bz) > -0.6) continue;
      const ay = track.heightAt(ax, az);
      poles.push([ax, ay, az]);
      for (let k = 0; k < 8; k++) {
        const t = k / 8;
        bulbs.push({ x: ax + (bx - ax) * t, y: ay + 7.4 - Math.sin(t * Math.PI) * 1.5, z: az + (bz - az) * t, hex: palette[k % 4] });
      }
    }
  }
  root.add(instanced(tube(0.09, 0.12, 7.6, 4), painted(0.7), poles.length, (dummy, tint, i) => {
    dummy.position.set(poles[i][0], poles[i][1] + 3.8, poles[i][2]);
    tint.setHex(0x3a3550);
  }));
  root.add(instanced(lump(0.2, 5, 3), glowing(0xffffff, 2.6), bulbs.length, (dummy, tint, i) => {
    dummy.position.set(bulbs[i].x, bulbs[i].y, bulbs[i].z);
    tint.setHex(bulbs[i].hex);
  }));
}

const park = {
  exposure: 1.15,
  fog: [0x1e1636, 0.0026],
  sunDir: [0.4, 0.75, -0.5],
  sun: [0x9fb0ff, 1.7],
  hemi: [0x8f7fd0, 0x5a3f80, 2.5],
  sky: {
    horizon: [0.62, 0.2, 0.46], mid: [0.2, 0.12, 0.36], zenith: [0.03, 0.03, 0.11],
    glow: [0.4, 0.45, 0.8], disc: [0.9, 0.92, 1], bands: 0, stars: 0.9,
  },
  hills: [{ r: 560, h: 34, color: 0x120e24 }, { r: 430, h: 18, color: 0x191330 }],
  apron: 0x2a2440,
  panels: [
    ['#ff2f6d', '#fff2d6', 'GUTBUSTER PARK'],
    ['#ffc21f', '#181420', 'NO RE-ENTRY'],
    ['#3fc7c0', '#181420', 'MYSTERY CHURROS'],
    ['#fff2d6', '#ff2f6d', 'RIDE AT OWN RISK'],
    ['#181420', '#ffc21f', 'LOST CHILDREN SOLD HERE'],
    ['#ff2f6d', '#ffc21f', 'FUN IS MANDATORY'],
    ['#3fc7c0', '#fff2d6', 'SMILE, MR GUTBUSTER WATCHES'],
    ['#ffc21f', '#ff2f6d', 'GRUDGE BOWL'],
  ],
  build(root, track, rng) {
    const movers = [];
    root.add(buildGrandstands(track, rng, [{ from: cornerAt(track, 0), to: cornerAt(track, 3, -6), side: 1 }]));
    root.add(fansAlong(track, rng, cornerAt(track, 7, -30), cornerAt(track, 8, 10), -1));
    root.add(fansAlong(track, rng, cornerAt(track, 12, -10), cornerAt(track, 14, 0), 1));

    for (const cover of track.covers) {
      const tent = solid(roofOver(track, cover, {
        sides: 12,
        colour: (r, k) => (((r + k) >> 1) % 2 ? 0xfff2d6 : 0xd81e3c),
      }), roofing(0.7));
      root.add(tent);
      ridgeLamps(root, track, cover, 0xffe9a8, 6);
      const mid = roadAt(track, cover.from + cover.length / 2);
      const peak = assemble([
        [cone(30, 15, 16), 0xd81e3c, { at: [0, 22, 0] }],
        [cone(1.6, 2.6, 4), 0xffc21f, { at: [0, 31, 0] }],
      ]);
      const top = solid(peak, painted(0.7));
      const nx = -mid.tz, nz = mid.tx;
      top.position.set(mid.x + nx * 3, mid.y, mid.z + nz * 3);
      root.add(top);
    }

    movers.push(coaster(root, track, [
      [-180, 10, -174], [-120, 8, -160], [-60, 14, -156], [0, 44, -156], [60, 18, -160], [110, 12, -150],
      [172, 38, -130], [188, 20, -60], [176, 12, -10], [150, 30, 30], [120, 12, 60], [120, 42, 90], [100, 16, 130],
      [130, 34, 168], [60, 14, 172], [-20, 32, 176], [-100, 12, 160], [-186, 40, 140], [-192, 14, 60], [-190, 34, -60],
    ]));
    const free = (x, z, reach) => freeOf(track, x, z, reach);
    const spot = (x, z, reach) => {
      for (let tries = 0; tries < 40; tries++) {
        const a = tries * 2.4, r = tries * 2.2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (free(px, pz, reach)) return [px, track.heightAt(px, pz), pz];
      }
      return [x, 0, z];
    };
    movers.push(carousel(root, ...spot(92, 62, 12)));
    movers.push(bigWheel(root, ...spot(2, -60, 16), 0.5));
    movers.push(dropTower(root, ...spot(-112, 58, 6)));
    movers.push(swingRide(root, ...spot(10, 96, 14)));
    mrGutbuster(root, ...spot(100, -52, 9), 2.7);
    stalls(root, track, rng);
    stringLights(root, track, rng);

    const arch = makeSign('GUTBUSTER PARK', 21, 3, '#ff2f6d', '#fff2d6');
    const gate = roadAt(track, track.gridS + 14);
    arch.position.set(gate.x, gate.y + 9.4, gate.z);
    arch.rotation.y = Math.atan2(gate.tx, gate.tz) + Math.PI;
    root.add(arch);
    const across = [];
    for (const side of [-1, 1]) {
      const px = gate.x - gate.tz * side * (gate.hw + 1.2), pz = gate.z + gate.tx * side * (gate.hw + 1.2);
      across.push(strut([px, gate.y, pz], [px, gate.y + 11, pz], 0.3, 0xffc21f, 6));
    }
    root.add(solid(assemble(across), painted(0.5)));
    return (time, dt) => { for (const move of movers) move(time, dt); };
  },
};

// ---- Mount Cinder -----------------------------------------------------------------------

function lavaSurface(radius) {
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec2 vP;
      void main() {
        vP = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float time;
      varying vec2 vP;
      float wave(vec2 p) {
        return sin(p.x * 0.31 + sin(p.y * 0.23 + time * 0.3) * 2.0)
          + sin(p.y * 0.37 - time * 0.22 + sin(p.x * 0.17) * 2.6)
          + 0.5 * sin((p.x + p.y) * 0.61 + time * 0.4);
      }
      void main() {
        float crust = smoothstep(0.1, 1.1, abs(wave(vP)));
        vec3 hot = mix(vec3(1.9, 0.8, 0.14), vec3(1.5, 0.26, 0.03), crust);
        vec3 c = mix(hot, vec3(0.06, 0.02, 0.02), smoothstep(0.55, 1.0, crust));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 48).rotateX(-Math.PI / 2), mat);
  return { mesh, mat };
}

function smokeColumn(root, x, y, z, rng) {
  const PUFFS = 46;
  const list = Array.from({ length: PUFFS }, (_, i) => ({
    phase: i / PUFFS, a: rng() * 6.28, spread: 0.5 + rng(), size: 0.7 + rng() * 0.7, spin: rng() * 6,
  }));
  const mesh = instanced(ball(1, 1), new THREE.MeshStandardMaterial({ color: 0x4a4240, roughness: 1, flatShading: true }), PUFFS, () => {});
  mesh.frustumCulled = false;
  root.add(mesh);
  const move = drifters(mesh, list, (dummy, p, time) => {
    // Clear of the rim before it thickens, so the lake stays in view from the road.
    const k = (p.phase + time * 0.018) % 1;
    const r = 6 + k * 70 * p.spread;
    dummy.position.set(x + Math.cos(p.a) * r + k * 90, y + 66 + k * 320, z + Math.sin(p.a) * r - k * 40);
    dummy.rotation.set(p.spin, k * 2, 0);
    dummy.scale.setScalar((7 + k * 64) * p.size);
  });
  return move;
}

// Bombs thrown for show, high over the crater. The ones that matter are in the sim.
function fountain(root, x, y, z, rng) {
  const ROCKS = 44;
  const list = Array.from({ length: ROCKS }, () => ({
    phase: rng(), a: rng() * 6.28, reach: 20 + rng() * 80, rate: 0.16 + rng() * 0.12, size: 0.6 + rng() * 1.2, lift: 70 + rng() * 60,
  }));
  const mesh = instanced(ball(1, 0), glowing(0xff6a1e, 3.4), ROCKS, () => {});
  mesh.frustumCulled = false;
  root.add(mesh);
  return drifters(mesh, list, (dummy, p, time) => {
    const k = (p.phase + time * p.rate) % 1;
    dummy.position.set(x + Math.cos(p.a) * p.reach * k, y + 4 * p.lift * k * (1 - k), z + Math.sin(p.a) * p.reach * k);
    dummy.scale.setScalar(p.size * (1.2 - k * 0.5));
    dummy.rotation.set(k * 9, k * 7, 0);
  });
}

// The lake's own fountain, rising and falling.
function geyser(root, x, y, z) {
  const jet = new THREE.Mesh(cone(4.4, 1, 8).translate(0, 0.5, 0), glowing(0xff7a22, 1.6));
  jet.position.set(x, y, z);
  root.add(jet);
  return (time) => {
    const surge = 0.5 + 0.5 * Math.sin(time * 0.8) * Math.sin(time * 0.31);
    jet.scale.set(0.7 + surge * 0.5, 8 + surge * 44, 0.7 + surge * 0.5);
  };
}

function spires(root, track, rng) {
  const rock = assemble([
    [cone(2.4, 9, 5), 0x2a2224, { at: [0, 4.5, 0] }],
    [cone(1.4, 5, 5), 0x352a2a, { at: [1.8, 2.5, 0.6], turn: [0.1, 0, -0.14] }],
    [cone(1.1, 3.6, 4), 0x201a1c, { at: [-1.5, 1.8, -0.5], turn: [-0.1, 0, 0.2] }],
  ]);
  const offLake = ([x, z]) => Math.hypot(x, z) > LAKE_RADIUS + 6;
  const places = clearSpots(track, rng, 150, 3.5).filter(offLake);
  root.add(instanced(rock, painted(0.95), places.length, (dummy, tint, i) => {
    const [x, z, y] = places[i];
    dummy.position.set(x, y - 0.3, z);
    dummy.rotation.y = rng() * 6.28;
    dummy.scale.set(0.7 + rng() * 0.9, 0.6 + rng() * 1.3, 0.7 + rng() * 0.9);
  }));
  const dead = pineTree(3);
  const burnt = clearSpots(track, rng, 70, 4, { from: 0.03, to: 0.97 }).filter(offLake);
  root.add(instanced(dead, painted(0.95), burnt.length, (dummy, tint, i) => {
    const [x, z, y] = burnt[i];
    dummy.position.set(x, y, z);
    dummy.scale.setScalar(0.7 + rng() * 0.6);
    tint.setHex(0x1a1414);
  }));
  const shard = assemble([[new THREE.OctahedronGeometry(1.6, 0), 0xff5a1e, { size: [0.5, 1.6, 0.5] }]]);
  const glints = clearSpots(track, rng, 24, 3).filter(offLake);
  root.add(instanced(shard, glowing(0xff7a2a, 1.3), glints.length, (dummy, tint, i) => {
    const [x, z, y] = glints[i];
    dummy.position.set(x, y + 0.9, z);
    dummy.rotation.set(rng() - 0.5, rng() * 6.28, rng() - 0.5);
  }));
}

function observatory(root, track, rng) {
  const [x, z, y] = clearSpots(track, rng, 40, 8).filter(([px, pz]) => freeOf(track, px, pz, 9))[0] ?? [150, 150, 0];
  const mesh = solid(assemble([
    [tube(7, 8, 6, 10), 0x8b8680, { at: [0, 3, 0] }],
    [new THREE.SphereGeometry(7, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xb9b4ad, { at: [0, 6, 0], turn: [0.3, 0, 0.2] }],
    [tube(0.6, 1, 8, 6), 0x3a3634, { at: [3, 11, 2], turn: [0.7, 0, -0.5] }],
  ]), painted(0.8));
  mesh.position.set(x, y, z);
  root.add(mesh);
}

const SILVER = [0xc8ccd2, 0xe3a23a, 0xb9bec6];
const LAKE_RADIUS = 45;

const volcano = {
  exposure: 1.05,
  fog: [0x2b1014, 0.0024],
  sunDir: [0.5, 0.42, 0.6],
  sun: [0xffa060, 3.2],
  hemi: [0xd08870, 0xe05a28, 2.8],
  sky: {
    horizon: [0.75, 0.2, 0.06], mid: [0.25, 0.07, 0.07], zenith: [0.05, 0.03, 0.05],
    glow: [1, 0.3, 0.1], disc: [1, 0.5, 0.2], bands: 0.6, stars: 0.12,
  },
  hills: [{ r: 560, h: 70, color: 0x1d0a0c }, { r: 430, h: 40, color: 0x2a0d0e }],
  apron: 0x1c1416,
  glowColor: 0xff5a14,
  glowPower: 2.4,
  panels: [
    ['#ff5a14', '#1a1416', 'CINDER SPRINGS SPA'],
    ['#1a1416', '#ffb21e', 'LAVA INSURANCE LTD'],
    ['#ffb21e', '#1a1416', 'PUMICE WORLD'],
    ['#efe6d6', '#c8321f', 'EVACUATION OPTIONAL'],
    ['#c8321f', '#efe6d6', 'ASH CASH'],
    ['#1a1416', '#ff5a14', 'HOT ROCK SALES'],
    ['#ffb21e', '#c8321f', 'NOT OUR FAULT'],
    ['#ff5a14', '#efe6d6', 'GRUDGE BOWL'],
  ],
  build(root, track, rng) {
    const lake = lavaSurface(LAKE_RADIUS);
    lake.mesh.position.y = 23.6;
    root.add(lake.mesh);
    for (const cover of track.covers) {
      root.add(solid(roofOver(track, cover, {
        rough: 1.1,
        colour: (r, k) => (r % 7 === 3 && k % 3 === 1 ? 0xff5a14 : (r + k) % 2 ? 0x54443e : 0x655248),
      }), roofing(0.95)));
      ridgeLamps(root, track, cover, 0xff7a22, 7);
    }
    root.add(buildGrandstands(track, rng, [{ from: cornerAt(track, 0, -50), to: cornerAt(track, 2, -10), side: 1 }], { shirts: SILVER, skin: [0x30343a], hats: SILVER }));
    root.add(fansAlong(track, rng, cornerAt(track, 22, -10), cornerAt(track, 23, 6), 1, { shirts: SILVER, skin: [0x30343a], hats: SILVER }));
    spires(root, track, rng);
    observatory(root, track, rng);
    const movers = [smokeColumn(root, 0, 24, 0, rng), fountain(root, 0, 24, 0, rng), geyser(root, 0, 23, 0)];
    return (time, dt) => {
      lake.mat.uniforms.time.value = time;
      for (const move of movers) move(time, dt);
    };
  },
};

// ---- Davy's Driveway --------------------------------------------------------------------

function glassTube(root, track, cover) {
  root.add(new THREE.Mesh(
    roofOver(track, cover, { colour: () => 0xbfeaf2, widen: 1.8, sides: 14 }),
    new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, opacity: 0.16, roughness: 0.08, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false,
    }),
  ));
  const ribs = [];
  for (let d = 0; d <= cover.length; d += 9) {
    const p = roadAt(track, cover.from + d);
    const nx = -p.tz, nz = p.tx, wide = p.hw + 1.8;
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI, b = ((k + 1) / 14) * Math.PI;
      ribs.push(strut(
        [p.x + nx * Math.cos(a) * wide, p.y - 0.5 + Math.sin(a) * cover.height, p.z + nz * Math.cos(a) * wide],
        [p.x + nx * Math.cos(b) * wide, p.y - 0.5 + Math.sin(b) * cover.height, p.z + nz * Math.cos(b) * wide],
        0.2, 0x8ea2a8, 4,
      ));
    }
  }
  root.add(solid(assemble(ribs), painted(0.4), false));
}

function shipwreck(root, track, cover) {
  const planks = [0x8a6240, 0x74523a, 0x9c7450, 0x634630];
  root.add(solid(roofOver(track, cover, { rough: 0.6, sides: 12, widen: 3, step: 2.4, colour: (r, k) => planks[(k + (r >> 2)) % 4] }), roofing(0.9)));
  ridgeLamps(root, track, cover, 0xffd28a, 9);
  const mid = roadAt(track, cover.from + cover.length / 2);
  const bow = roadAt(track, cover.from + cover.length);
  const stern = roadAt(track, cover.from);
  const heading = Math.atan2(bow.x - stern.x, bow.z - stern.z);
  const parts = [
    [tube(0.7, 0.9, 42, 7), 0x6a4c34, { at: [0, 30, -6], turn: [0.16, 0, 0.1] }],
    [tube(0.5, 0.7, 30, 7), 0x6a4c34, { at: [0, 26, 18], turn: [-0.1, 0, 0.26] }],
    [box(20, 0.7, 0.7), 0x634630, { at: [0, 42, -8], turn: [0.1, 0.2, 0.1] }],
    [box(16, 0.6, 0.6), 0x634630, { at: [3, 33, 18], turn: [0, -0.3, 0.26] }],
    [box(15, 11, 0.1), 0xa8a48c, { at: [0, 36, -7.4], turn: [0.1, 0.2, 0.1] }],
    [box(9, 8, 0.1), 0x8d8a76, { at: [3, 28, 18.4], turn: [0, -0.3, 0.26] }],
    [box(26, 1, 7), 0x74523a, { at: [0, 9.8, 0], turn: [0, Math.PI / 2, 0] }],
  ];
  const ship = solid(assemble(parts), painted(0.9));
  ship.position.set(mid.x, mid.y, mid.z);
  ship.rotation.y = heading;
  root.add(ship);
}

function whale(root) {
  const body = new THREE.Group();
  const hide = painted(0.7);
  const trunk = solid(assemble([
    [lump(9, 14, 9), 0x4f7894, { size: [1, 0.92, 3.3] }],
    [lump(8.7, 14, 9), 0xe6eef0, { at: [0, -3, 2], size: [0.84, 0.66, 2.9] }],
    ...[-5, -3, -1, 1, 3, 5].map((x) => [box(0.34, 0.5, 26), 0x9eb4bf, { at: [x, -9.3, 9], turn: [0.08, 0, 0] }]),
    [lump(1, 6, 4), 0x0d1218, { at: [-7.3, 1, 15] }],
    [lump(1, 6, 4), 0x0d1218, { at: [7.3, 1, 15] }],
    [box(24, 0.9, 7), 0x3b6078, { at: [-17, -5, 7], turn: [0, 0.45, 0.42] }],
    [box(24, 0.9, 7), 0x3b6078, { at: [17, -5, 7], turn: [0, -0.45, -0.42] }],
  ]), hide);
  body.add(trunk);
  const tail = new THREE.Group();
  tail.position.z = -24;
  tail.add(solid(assemble([
    [cone(5.4, 24, 10), 0x4f7894, { at: [0, 0, -11], turn: [-Math.PI / 2, 0, 0] }],
    [box(20, 0.8, 8), 0x3b6078, { at: [-10, 0, -24], turn: [0, 0.5, 0] }],
    [box(20, 0.8, 8), 0x3b6078, { at: [10, 0, -24], turn: [0, -0.5, 0] }],
  ]), hide));
  body.add(tail);
  root.add(body);
  return (time) => {
    const a = time * 0.05;
    body.position.set(Math.cos(a) * 150, 64 + Math.sin(time * 0.13) * 8, Math.sin(a) * 120);
    body.rotation.y = Math.atan2(-Math.sin(a) * 150, Math.cos(a) * 120);
    body.rotation.z = -0.1;
    tail.rotation.x = Math.sin(time * 0.9) * 0.3;
  };
}

function shoal(root, rng, count, opts) {
  const fish = assemble([
    [cone(0.5, 1.8, 4), WHITE, { turn: [Math.PI / 2, 0, 0], size: [0.5, 1, 1] }],
    [cone(0.5, 0.7, 3), WHITE, { at: [0, 0, -1.1], turn: [-Math.PI / 2, 0, 0], size: [0.2, 1, 1] }],
  ]);
  const list = Array.from({ length: count }, () => ({
    a: rng() * 6.28, r: opts.r * (0.8 + rng() * 0.4), y: opts.y + (rng() - 0.5) * opts.spread, rate: opts.rate * (0.8 + rng() * 0.3), off: (rng() - 0.5) * 14,
  }));
  const mesh = instanced(fish, painted(0.4), count, (dummy, tint, i) => {
    tint.setHex(opts.colours[i % opts.colours.length]);
  });
  mesh.frustumCulled = false;
  root.add(mesh);
  return drifters(mesh, list, (dummy, p, time) => {
    const a = p.a * 0.15 + time * p.rate;
    dummy.position.set(opts.x + Math.cos(a) * (p.r + p.off), p.y + Math.sin(a * 3 + p.a) * 1.2, opts.z + Math.sin(a) * (p.r + p.off));
    dummy.rotation.y = -a;
    dummy.scale.setScalar(opts.size);
  });
}

function kelpForest(root, track, rng) {
  const places = clearSpots(track, rng, 230, 2.5);
  const frond = assemble([
    [tube(0.12, 0.2, 14, 4), 0x2c6a3a, { at: [0, 7, 0] }],
    ...[2, 4.5, 7, 9.5, 12].flatMap((h, i) => [[box(2.2, 0.08, 0.9), 0x3f8f49, { at: [i % 2 ? 1 : -1, h, 0], turn: [0, i, i % 2 ? 0.5 : -0.5] }]]),
  ]);
  const list = places.map(([x, z, y]) => ({ x, z, y, h: 0.7 + rng() * 1.1, phase: rng() * 6.28, yaw: rng() * 6.28 }));
  const mesh = instanced(frond, painted(0.8), list.length, () => {});
  mesh.frustumCulled = false;
  root.add(mesh);
  return drifters(mesh, list, (dummy, p, time) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(Math.sin(time * 0.6 + p.phase) * 0.12, p.yaw, Math.cos(time * 0.5 + p.phase) * 0.12);
    dummy.scale.set(1, p.h, 1);
  });
}

function coral(root, track, rng) {
  // Staghorn: a fistful of tapering branches, each forking once.
  const branch = (a, lean, length, r) => {
    const bend = (v) => [Math.cos(a) * lean * v, length * v, Math.sin(a) * lean * v];
    const fork = bend(0.6);
    return [
      strut([0, 0, 0], fork, r, WHITE, 5),
      strut(fork, bend(1), r * 0.65, WHITE, 4),
      strut(fork, [fork[0] + Math.cos(a + 1.1) * lean * 0.5, length * 0.95, fork[2] + Math.sin(a + 1.1) * lean * 0.5], r * 0.55, WHITE, 4),
    ];
  };
  const staghorn = assemble([0, 1.2, 2.4, 3.6, 4.8, 5.7].flatMap((a, i) => branch(a, 1 + (i % 3) * 0.5, 2.2 + (i % 2) * 0.9, 0.2)));
  // Brain coral: a low dome, ridged by its own facets.
  const brain = assemble([
    [lump(1.8, 9, 5), WHITE, { at: [0, 0.5, 0], size: [1, 0.72, 1] }],
    [lump(1, 7, 4), WHITE, { at: [1.5, 0.3, 0.7], size: [1, 0.7, 1] }],
  ]);
  const paints = [0xff6b6b, 0xffb347, 0xf56fa1, 0xb18cff, 0x4fd1c5];
  const reef = clearSpots(track, rng, 200, 2);
  [staghorn, brain].forEach((shape, kind) => {
    const places = reef.filter((_, i) => i % 2 === kind);
    root.add(instanced(shape, painted(0.8), places.length, (dummy, tint, i) => {
      const [x, z, y] = places[i];
      dummy.position.set(x, y, z);
      dummy.rotation.y = rng() * 6.28;
      dummy.scale.setScalar(0.9 + rng() * 1.5);
      tint.setHex(paints[Math.floor(rng() * paints.length)]);
    }));
  });
}

function jellies(root, track, rng) {
  const places = clearSpots(track, rng, 34, 0.5);
  const list = places.map(([x, z, y]) => ({ x, z, y: y + 12 + rng() * 26, phase: rng() * 6.28 }));
  const bell = assemble([
    [new THREE.SphereGeometry(1.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), WHITE, {}],
    ...[0, 1, 2, 3, 4, 5].map((i) => [box(0.06, 2.6, 0.06), WHITE, { at: [Math.cos(i) * 0.9, -1.3, Math.sin(i) * 0.9] }]),
  ]);
  const mesh = instanced(bell, glowing(0xffffff, 1.8), list.length, (dummy, tint, i) => {
    tint.setHSL(0.75 + (i % 5) * 0.06, 0.8, 0.65);
  });
  mesh.frustumCulled = false;
  root.add(mesh);
  return drifters(mesh, list, (dummy, p, time) => {
    const pulse = Math.sin(time * 1.3 + p.phase);
    dummy.position.set(p.x, p.y + Math.sin(time * 0.3 + p.phase) * 3, p.z);
    dummy.scale.set(1 + pulse * 0.12, 1 - pulse * 0.16, 1 + pulse * 0.12);
  });
}

// Something very large has hold of the trench.
function tentacles(root, track) {
  const movers = [];
  const SITES = [[-62, -112, 0.4], [-40, -40, 2.8], [-78, -30, 4.6]];
  for (const [x, z, yaw] of SITES) {
    const y = track.heightAt(x, z) - 1;
    const segments = [];
    let parent = root;
    for (let i = 0; i < 9; i++) {
      const r = 3 - i * 0.28;
      const seg = new THREE.Group();
      if (i === 0) seg.position.set(x, y, z);
      else seg.position.y = 6;
      if (i === 0) seg.rotation.y = yaw;
      seg.add(solid(assemble([
        [tube(r - 0.28, r, 6.3, 7), 0x7a2f55, { at: [0, 3, 0] }],
        [lump(r * 0.34, 5, 3), 0xe8a7c5, { at: [0, 3, r * 0.92] }],
      ]), painted(0.6), false));
      parent.add(seg);
      parent = seg;
      segments.push(seg);
    }
    movers.push((time) => {
      segments.forEach((seg, i) => {
        if (i === 0) return;
        seg.rotation.x = 0.2 + Math.sin(time * 0.7 + i * 0.6 + yaw) * 0.16;
        seg.rotation.z = Math.cos(time * 0.5 + i * 0.5 + yaw) * 0.12;
      });
    });
  }
  return (time) => { for (const move of movers) move(time); };
}

function sunbeams(root, rng) {
  const BEAMS = 16;
  const beam = new THREE.CylinderGeometry(6, 22, 240, 6, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x9fe6e0, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  root.add(instanced(beam, mat, BEAMS, (dummy) => {
    dummy.position.set((rng() - 0.5) * 420, 118, (rng() - 0.5) * 420);
    dummy.rotation.set((rng() - 0.5) * 0.3, rng() * 6.28, (rng() - 0.5) * 0.3);
  }));
}

function bubbles(root, track, rng) {
  const COUNT = 120;
  const list = clearSpots(track, rng, COUNT, 0.6).map(([x, z, y]) => ({ x, z, y, rate: 0.05 + rng() * 0.08, phase: rng(), size: 0.15 + rng() * 0.35 }));
  const mesh = instanced(lump(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xcff6f6, transparent: true, opacity: 0.4 }), list.length, () => {});
  mesh.frustumCulled = false;
  root.add(mesh);
  return drifters(mesh, list, (dummy, p, time) => {
    const k = (p.phase + time * p.rate) % 1;
    dummy.position.set(p.x + Math.sin(k * 20) * 0.6, p.y + k * 44, p.z);
    dummy.scale.setScalar(p.size);
  });
}

function divingBell(root, track, rng, x, z) {
  const y = track.heightAt(x, z);
  const frame = solid(assemble([
    [tube(13, 14, 1.2, 14), 0x7d8a8e, { at: [0, 0.6, 0] }],
    [tube(0.5, 0.5, 34, 6), 0x8ea2a8, { at: [0, 26, 0] }],
  ]), painted(0.5));
  frame.position.set(x, y, z);
  root.add(frame);
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xbfeaf2, transparent: true, opacity: 0.15, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }),
  );
  glass.position.set(x, y + 1.2, z);
  root.add(glass);
  const seats = [];
  for (let i = 0; i < 90; i++) {
    const a = rng() * 6.28, r = 3 + rng() * 8.5;
    seats.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, y: y + 1.2, yaw: a + Math.PI, size: 1, cheering: rng() < 0.4, hat: rng() < 0.3 });
  }
  root.add(buildCrowd(seats, rng));
}

function columns(root, track, rng) {
  const places = clearSpots(track, rng, 34, 3.5).filter(([x, z]) => freeOf(track, x, z, 2.5));
  const shaft = assemble([
    [tube(1.2, 1.5, 11, 9), 0xc2bfaf, { at: [0, 5.5, 0] }],
    [box(3.6, 1, 3.6), 0xb1ae9e, { at: [0, 11.4, 0] }],
    [box(3.6, 1, 3.6), 0xb1ae9e, { at: [0, 0.4, 0] }],
  ]);
  root.add(instanced(shaft, painted(0.85), places.length, (dummy, tint, i) => {
    const [x, z, y] = places[i];
    dummy.position.set(x, y - 0.4, z);
    dummy.rotation.set((rng() - 0.5) * 0.3, rng() * 6.28, (rng() - 0.5) * 0.3);
    dummy.scale.setScalar(0.6 + rng() * 0.6);
  }));
}

const seabed = {
  exposure: 1,
  fog: [0x0a3f52, 0.0052],
  sunDir: [0.22, 0.92, 0.3],
  sun: [0xbdeeea, 2.4],
  hemi: [0x74c4d0, 0x6a6a4a, 1.7],
  sky: {
    horizon: [0.03, 0.26, 0.33], mid: [0.05, 0.4, 0.46], zenith: [0.22, 0.72, 0.74],
    glow: [0.6, 0.95, 0.9], disc: [0.8, 1, 0.95], bands: 0, stars: 0,
  },
  hills: [{ r: 560, h: 64, color: 0x0a3a48 }, { r: 430, h: 34, color: 0x0c4252 }],
  apron: 0x2a6068,
  panels: [
    ['#1fa6a6', '#f5efd8', "DAVY'S DRIVEWAY"],
    ['#f2b632', '#0d2a33', 'SNORKEL RENTALS'],
    ['#f5efd8', '#1a7a8a', 'DRY CLEANING'],
    ['#0d2a33', '#f2b632', 'NO SWIMMING AFTER RACING'],
    ['#e8645a', '#f5efd8', 'BARNACLE REMOVAL'],
    ['#1a7a8a', '#f5efd8', 'SALT: TRY IT'],
    ['#f2b632', '#e8645a', 'KRAKEN FREE SINCE TUESDAY'],
    ['#1fa6a6', '#f2b632', 'GRUDGE BOWL'],
  ],
  build(root, track, rng) {
    for (const cover of track.covers) {
      if (cover.clear) glassTube(root, track, cover);
      else shipwreck(root, track, cover);
    }
    root.add(buildGrandstands(track, rng, [{ from: cornerAt(track, 0, -40), to: cornerAt(track, 1, 8), side: -1 }]));
    sunbeams(root, rng);
    coral(root, track, rng);
    columns(root, track, rng);
    divingBell(root, track, rng, 72, -86);
    const movers = [
      whale(root), kelpForest(root, track, rng), jellies(root, track, rng), bubbles(root, track, rng), tentacles(root, track),
      shoal(root, rng, 120, { x: 40, z: 60, r: 70, y: 22, spread: 12, rate: 0.16, size: 0.9, colours: [0xffd34d, 0xff8f4d, 0xf2f2f2] }),
      shoal(root, rng, 90, { x: -90, z: -10, r: 60, y: 30, spread: 16, rate: -0.2, size: 0.8, colours: [0x7ae6ff, 0xc7f5ff] }),
      shoal(root, rng, 6, { x: 0, z: 0, r: 130, y: 26, spread: 10, rate: 0.09, size: 5, colours: [0x54636e] }),
    ];
    return (time, dt) => { for (const move of movers) move(time, dt); };
  },
};

// ---- Lower Tranquillity -----------------------------------------------------------------

function earth(root) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1f5fbf';
  ctx.fillRect(0, 0, 512, 256);
  const blob = (x, y, r, fill) => {
    ctx.fillStyle = fill;
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4, d = (r * i) / 26;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, r * 0.42, 0, 6.3);
      ctx.fill();
    }
  };
  for (const [x, y, r] of [[120, 90, 46], [170, 170, 32], [300, 80, 60], [330, 160, 36], [440, 100, 40], [40, 60, 20]]) blob(x, y, r, '#4f8a43');
  for (const [x, y, r] of [[80, 40, 24], [220, 120, 26], [370, 44, 30], [480, 180, 24], [260, 210, 30], [130, 216, 18]]) blob(x, y, r, 'rgba(255,255,255,.85)');
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const planet = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 20), new THREE.MeshBasicMaterial({ map, fog: false }));
  planet.position.set(-420, 300, 560);
  root.add(planet);
  return (time) => { planet.rotation.y = time * 0.01; };
}

function dome(root, track, rng, x, z, radius, tint) {
  const y = track.heightAt(x, z);
  const base = solid(assemble([
    [tube(radius + 0.6, radius + 1.4, 1.6, 18), 0xb7b9bd, { at: [0, 0.8, 0] }],
    [box(3.4, 3, 7), 0xd6d7da, { at: [radius, 1.8, 0] }],
  ]), painted(0.6));
  root.add(base);
  base.position.set(x, y, z);
  base.rotation.y = rng() * 6.28;
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: tint, transparent: true, opacity: 0.12, roughness: 0.5, metalness: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  shell.position.set(x, y + 1.6, z);
  root.add(shell);
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(radius - 0.5, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5f9a58, roughness: 0.9 }));
  lawn.position.set(x, y + 1.64, z);
  root.add(lawn);
  const parts = [];
  // A geodesic look: ribs up the dome and two rings round it.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * 6.28;
    for (let k = 0; k < 5; k++) {
      const p = (k / 5) * 1.57, q = ((k + 1) / 5) * 1.57;
      parts.push(strut(
        [Math.cos(a) * Math.cos(p) * radius, Math.sin(p) * radius, Math.sin(a) * Math.cos(p) * radius],
        [Math.cos(a) * Math.cos(q) * radius, Math.sin(q) * radius, Math.sin(a) * Math.cos(q) * radius],
        0.13, 0xcfd2d6, 3,
      ));
    }
  }
  for (const p of [0.5, 1]) {
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * 6.28, b = ((i + 1) / 20) * 6.28, r = Math.cos(p) * radius, h = Math.sin(p) * radius;
      parts.push(strut([Math.cos(a) * r, h, Math.sin(a) * r], [Math.cos(b) * r, h, Math.sin(b) * r], 0.1, 0xcfd2d6, 3));
    }
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28, r = radius * 0.55;
    parts.push([box(3, 2.4 + (i % 3), 3), [0xf0efe9, 0xd8c7a0, 0x9fc0a0][i % 3], { at: [Math.cos(a) * r, 2.6, Math.sin(a) * r] }]);
    parts.push([cone(2.4, 3.6, 7), 0x4f8a43, { at: [Math.cos(a + 0.5) * r * 0.4, 3.4, Math.sin(a + 0.5) * r * 0.4] }]);
  }
  const town = solid(assemble(parts), painted(0.6), false);
  town.position.set(x, y + 1.6, z);
  root.add(town);
}

function rocket(root, x, y, z) {
  const hull = solid(assemble([
    [tube(6, 8, 7, 12), 0x6a6d72, { at: [0, 3.5, 0] }],
    [tube(3.2, 3.2, 26, 12), 0xeeece6, { at: [0, 20, 0] }],
    [tube(2.4, 3.2, 12, 12), 0xeeece6, { at: [0, 39, 0] }],
    [cone(2.4, 8, 12), 0xc8321f, { at: [0, 49, 0] }],
    ...[0, 1, 2, 3].map((i) => [box(0.5, 9, 4.6), 0xc8321f, { at: [Math.cos(i * 1.57) * 4.8, 11, Math.sin(i * 1.57) * 4.8], turn: [0, -i * 1.57, 0] }]),
    [box(1.5, 44, 1.5), 0x8a2a1f, { at: [12, 22, 0] }],
    [box(9, 0.7, 0.7), 0x8a2a1f, { at: [8, 30, 0] }],
    [box(9, 0.7, 0.7), 0x8a2a1f, { at: [8, 16, 0] }],
  ]), painted(0.6));
  hull.position.set(x, y, z);
  root.add(hull);
}

function radarDish(root, x, y, z) {
  const site = new THREE.Group();
  site.position.set(x, y, z);
  site.add(solid(assemble([
    [tube(0.8, 2, 11, 8), 0xb7b9bd, { at: [0, 5.5, 0] }],
    [box(8, 1, 8), 0x8a8d92, { at: [0, 0.5, 0] }],
  ]), painted(0.6)));
  const head = new THREE.Group();
  head.position.y = 11.5;
  head.add(solid(assemble([
    [new THREE.SphereGeometry(10, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0xe8e8e6, { at: [0, 6, 0], turn: [Math.PI, 0, 0] }],
    [tube(0.12, 0.3, 8, 4), 0x8a8d92, { at: [0, 2, 0] }],
  ]), painted(0.5), false));
  head.rotation.x = 0.7;
  const pan = new THREE.Group();
  pan.position.y = 0;
  pan.add(head);
  site.add(pan);
  root.add(site);
  return (time) => { pan.rotation.y = time * 0.12; };
}

function lander(root, x, y, z) {
  const parts = [
    [box(5, 3, 5), 0xd9b552, { at: [0, 4.5, 0] }],
    [new THREE.OctahedronGeometry(3, 0), 0xcfd2d6, { at: [0, 8, 0] }],
    [tube(1, 1.8, 1.8, 8), 0x45474c, { at: [0, 2.2, 0] }],
  ];
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    parts.push(strut([dx * 2.4, 4, dz * 2.4], [dx * 5.4, 0, dz * 5.4], 0.14, 0xd9b552, 4));
    parts.push([tube(0.9, 1, 0.2, 8), 0xd9b552, { at: [dx * 5.4, 0.1, dz * 5.4] }]);
  }
  const mesh = solid(assemble(parts), painted(0.5));
  mesh.position.set(x, y, z);
  root.add(mesh);
}

function solarFarm(root, track, rng) {
  const places = clearSpots(track, rng, 70, 5).filter(([x, z]) => freeOf(track, x, z, 4));
  const panel = assemble([
    [tube(0.1, 0.14, 3, 4), 0x9a9da3, { at: [0, 1.5, 0] }],
    [box(6, 0.1, 3), 0x16284f, { at: [0, 3.1, 0], turn: [0.5, 0, 0] }],
    [box(6.2, 0.06, 0.1), 0xb7b9bd, { at: [0, 3.2, 0], turn: [0.5, 0, 0] }],
  ]);
  root.add(instanced(panel, painted(0.3), places.length, (dummy, tint, i) => {
    const [x, z, y] = places[i];
    dummy.position.set(x, y, z);
    dummy.rotation.y = 0.5 + (rng() - 0.5) * 0.1;
  }));
}

function moonRocks(root, track, rng) {
  const places = clearSpots(track, rng, 240, 2);
  root.add(instanced(assemble([[ball(1, 0), WHITE, {}]]), painted(0.95), places.length, (dummy, tint, i) => {
    const [x, z, y] = places[i];
    dummy.position.set(x, y, z);
    dummy.rotation.set(rng() * 6, rng() * 6, rng() * 6);
    dummy.scale.set(0.4 + rng() * 1.5, 0.3 + rng() * 0.9, 0.4 + rng() * 1.5);
    tint.setRGB(0.5, 0.5, 0.52);
  }));
}

// Blue studs down each side of the road, for a course with no street lights.
function laneLights(root, track) {
  const c = track.centre;
  const studs = [];
  for (let s = 0; s < track.length; s += 7) {
    const i = track.indexAt(s);
    for (const side of [1, -1]) {
      const off = track.hw[i] - 0.5;
      const x = c.px[i] - c.tz[i] * side * off, z = c.pz[i] + c.tx[i] * side * off;
      studs.push([x, track.heightAt(x, z) + 0.06, z]);
    }
  }
  root.add(instanced(box(0.36, 0.1, 0.6), glowing(0x48b6ff, 3), studs.length, (dummy, tint, i) => {
    dummy.position.set(...studs[i]);
  }));
}

const SUITS = [0xf0efe9, 0xe4e3dc, 0xd9b552];

const moon = {
  exposure: 0.95,
  fog: [0x05060c, 0.0004],
  sunDir: [-0.5, 0.5, -0.7],
  sun: [0xffffff, 2.9],
  hemi: [0x6a7a9a, 0x5a5a60, 1.5],
  sky: {
    horizon: [0.02, 0.025, 0.05], mid: [0.01, 0.012, 0.03], zenith: [0, 0, 0.01],
    glow: [0.5, 0.5, 0.55], disc: [1, 1, 1], bands: 0, stars: 1.4,
  },
  hills: [{ r: 640, h: 80, color: 0x34353a }, { r: 480, h: 44, color: 0x4a4b50 }],
  apron: 0x6a6b70,
  panels: [
    ['#d9b552', '#14161c', 'LOWER TRANQUILLITY'],
    ['#14161c', '#d9b552', 'AIR: 3 CREDITS'],
    ['#f0efe9', '#2f5fbf', 'NO SHOUTING, NO ATMOSPHERE'],
    ['#2f5fbf', '#f0efe9', 'REGOLITH REMOVALS'],
    ['#c8321f', '#f0efe9', 'EARTH: WISH YOU WERE HERE'],
    ['#14161c', '#c8321f', 'ONE SMALL STEP TO THE BAR'],
    ['#d9b552', '#c8321f', 'HELMETS MANDATORY'],
    ['#f0efe9', '#c8321f', 'GRUDGE BOWL'],
  ],
  build(root, track, rng) {
    root.add(buildGrandstands(track, rng, [
      { from: cornerAt(track, 0, -40), to: cornerAt(track, 1, 40), side: 1 },
      { from: cornerAt(track, 6, -30), to: cornerAt(track, 8, 20), side: 1 },
    ], { shirts: SUITS, skin: [0xd9a93a, 0xc8982f], hats: SUITS }));
    dome(root, track, rng, -95, -40, 26, 0x9fd0ff);
    dome(root, track, rng, 95, -40, 22, 0xffd9a0);
    dome(root, track, rng, 0, 118, 20, 0xb5ffcf);
    const pad = track.heightAt(-186, 110);
    rocket(root, -186, pad, 110);
    lander(root, 186, track.heightAt(186, 96), 96);
    lander(root, 76, track.heightAt(76, -112), -112);
    solarFarm(root, track, rng);
    moonRocks(root, track, rng);
    laneLights(root, track);
    const movers = [earth(root), radarDish(root, 100, track.heightAt(100, 112), 112), radarDish(root, -120, track.heightAt(-120, 104), 104)];
    return (time, dt) => { for (const move of movers) move(time, dt); };
  },
};

export const WORLDS = { park, volcano, seabed, moon };
