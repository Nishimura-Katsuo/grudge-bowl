import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildShell, crumple } from '../src/render/carModel.js';
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
