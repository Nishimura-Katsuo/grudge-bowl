import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildBumper, buildEyes, buildLamps, buildShell, buildTrim, crumple } from '../src/render/carModel.js';
import { CAR } from '../src/sim/config.js';
import { createRng } from '../src/sim/math.js';

function triangles(geometry) {
  const p = geometry.attributes.position.array;
  const out = [];
  for (let i = 0; i < p.length; i += 9) {
    const a = new THREE.Vector3(p[i], p[i + 1], p[i + 2]);
    const b = new THREE.Vector3(p[i + 3], p[i + 4], p[i + 5]);
    const c = new THREE.Vector3(p[i + 6], p[i + 7], p[i + 8]);
    out.push({ a, b, c, cross: b.clone().sub(a).cross(c.clone().sub(a)) });
  }
  return out;
}

// Anything short of unit length here renders as a NaN pixel on some GPUs, and
// bloom turns one of those into a whole see-through frame.
function assertUnitNormals(geometry, label) {
  const n = geometry.attributes.normal.array;
  for (let i = 0; i < n.length; i += 3) {
    const len = Math.hypot(n[i], n[i + 1], n[i + 2]);
    assert.ok(Math.abs(len - 1) < 1e-3, `${label}: normal ${i / 3} has length ${len}`);
  }
}

test('a new car has no zero-area triangles and no zero normals', () => {
  for (let id = 0; id < 12; id++) {
    const geometry = buildShell(0xc8321f, id);
    for (const t of triangles(geometry)) assert.ok(t.cross.length() > 1e-6, `car ${id} has a collapsed triangle`);
    assertUnitNormals(geometry, `car ${id}`);
  }
});

test('nose and tail caps are closed and face outward', () => {
  const tris = triangles(buildShell(0xc8321f, 0));
  const xs = tris.flatMap((t) => [t.a.x, t.b.x, t.c.x]);
  const front = Math.max(...xs), rear = Math.min(...xs);
  const cap = (x) => tris.filter((t) => [t.a, t.b, t.c].every((v) => Math.abs(v.x - x) < 1e-6));
  const area = (list) => list.reduce((sum, t) => sum + t.cross.length() / 2, 0);
  for (const [x, outward] of [[front, 1], [rear, -1]]) {
    const faces = cap(x);
    assert.ok(faces.length > 8, `cap at ${x} has ${faces.length} triangles`);
    for (const t of faces) assert.ok(t.cross.x * outward > 0, `cap at ${x} has an inward face`);
    assert.ok(area(faces) > 0.6, `cap at ${x} covers only ${area(faces)} square metres`);
  }
});

test('crumpling a car over and over never leaves a bad normal', () => {
  const rng = createRng(21);
  const geometry = buildShell(0xc8321f, 3);
  const visual = {
    geometry,
    originalPos: geometry.attributes.position.array.slice(),
    root: new THREE.Group(),
  };
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let hit = 0; hit < 400; hit++) {
    point.set(rng.range(-2.6, 2.6), rng.range(-0.4, 0.8), rng.range(-1.1, 1.1));
    normal.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
    crumple(visual, point, normal, 1);
    assertUnitNormals(geometry, `after hit ${hit}`);
  }
  for (const v of geometry.attributes.position.array) assert.ok(Number.isFinite(v));
});

const GROUND_TO_COG = 0.62;

function vertices(geometry) {
  const p = geometry.attributes.position.array;
  const out = [];
  for (let i = 0; i < p.length; i += 3) out.push([p[i], p[i + 1] + GROUND_TO_COG, p[i + 2], i]);
  return out;
}

test('the wheels sit in open wells, with no bodywork over them at rest', () => {
  const body = vertices(buildShell(0xc8321f, 2));
  for (const axle of [CAR.wheelFrontX, CAR.wheelRearX]) {
    for (const [x, y, z] of body) {
      if (Math.abs(z) < 0.72) continue;
      const clear = Math.hypot(x - axle, y - 0.37);
      assert.ok(clear > CAR.wheelRadius + 0.03, `bodywork ${clear} from the axle at ${x}, ${y}, ${z}`);
    }
  }
});

test('one front door is a different colour, on the left, as on the character sheet', () => {
  const geometry = buildShell(0xc8321f, 2);
  const col = geometry.attributes.color.array;
  let left = 0, right = 0;
  for (const [x, y, z, i] of vertices(geometry)) {
    if (x < 0.1 || x > 0.8 || y < 0.68 || y > 0.96 || Math.abs(z) < 0.9) continue;
    const creamy = col[i + 2] > 0.5;
    if (z < 0 && creamy) left++;
    if (z > 0 && creamy) right++;
  }
  assert.ok(left > 30, `only ${left} cream vertices on the left door`);
  assert.equal(right, 0);
});

test('a cream car gets a door that still stands out', () => {
  const geometry = buildShell(0xe8d6a8, 0);
  const col = geometry.attributes.color.array;
  let contrast = 0;
  for (const [x, y, z, i] of vertices(geometry)) {
    if (x > 0.1 && x < 0.8 && y > 0.68 && y < 0.96 && z < -0.9 && col[i] < 0.2) contrast++;
  }
  assert.ok(contrast > 30);
});

test('the face is on the windscreen, the teeth on the nose, and everything looks outward', () => {
  const eyes = vertices(buildEyes());
  for (const [x, y] of eyes) {
    assert.ok(x > 0.45 && x < 1.1 && y > 1, `an eye vertex at ${x}, ${y}`);
  }
  const lamps = vertices(buildLamps());
  for (const [x] of lamps) assert.ok(x > 2.5);
  for (const geometry of [buildEyes(), buildLamps(), buildTrim(0xc8321f), buildBumper(1)]) {
    assertUnitNormals(geometry, 'car part');
    for (const t of triangles(geometry)) assert.ok(t.cross.length() > 1e-6);
  }
  for (const t of triangles(buildEyes())) assert.ok(t.cross.y > 0, 'an eye faces into the car');
});

test('every part of a car dents with the body, so nothing is left floating', () => {
  const make = (geometry) => ({ geometry, originalPos: geometry.attributes.position.array.slice() });
  const body = make(buildShell(0xc8321f, 3));
  const parts = [make(buildTrim(0xc8321f)), make(buildBumper(3)), make(buildEyes()), make(buildLamps())];
  const visual = { ...body, parts, root: new THREE.Group() };
  const rng = createRng(5);
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  crumple(visual, point.set(2.5, 0, 0.3), normal.set(-1, 0, 0), 1);
  crumple(visual, point.set(0.8, 0.6, 0), normal.set(0, -1, 0), 1);
  const moved = (part) => {
    const a = part.geometry.attributes.position.array;
    return a.some((v, i) => Math.abs(v - part.originalPos[i]) > 0.02);
  };
  assert.ok(moved(body));
  for (const part of parts) assert.ok(moved(part), 'a part stayed put');
  for (let hit = 0; hit < 120; hit++) {
    point.set(rng.range(-2.6, 2.6), rng.range(-0.4, 0.9), rng.range(-1.1, 1.1));
    normal.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
    crumple(visual, point, normal, 1);
  }
  for (const part of parts) {
    assertUnitNormals(part.geometry, 'after a hard life');
    for (const v of part.geometry.attributes.position.array) assert.ok(Number.isFinite(v));
  }
});
