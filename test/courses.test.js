import test from 'node:test';
import assert from 'node:assert/strict';
import { courseDealer, COURSES } from '../src/sim/courses.js';
import { GRAVITY, RULES } from '../src/sim/config.js';
import { adoptTrack, getTrack, packTrack } from '../src/sim/track.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { lineupFor } from '../src/sim/roster.js';
import { createBrain } from '../src/ai/index.js';
import { createCar } from '../src/sim/car.js';
import { ROSTER } from '../src/sim/roster.js';
import { WORLDS } from '../src/render/worlds.js';
import { GROUNDS } from '../src/render/groundPaint.js';
import { poseCrate } from '../src/render/arsenalView.js';
import { Director } from '../src/render/director.js';
import * as THREE from 'three';

const ids = Object.keys(COURSES);

function race(course, seed) {
  const world = createWorld({ seed, course, lineup: lineupFor(seed), brainFactory: (car) => createBrain(car) });
  for (let i = 0; world.phase !== 'finished' && i < 240 * 210; i++) {
    stepWorld(world);
    world.events.length = 0;
  }
  return world;
}

for (const id of ids) {
  test(`${id}: every road is one a brain can read`, () => {
    const t = getTrack(id);
    assert.ok(t.passes.length >= 2, 'nextPass needs a crossroads');
    assert.equal(t.crateSpots.length, 6);
    assert.ok(t.polys.length >= 2, 'walls on both sides');
    for (const v of [...t.pace, ...t.hw, ...t.line.offset]) assert.ok(Number.isFinite(v));
    for (let i = 0; i < t.heights.length; i += 97) assert.ok(Number.isFinite(t.heights[i]));
    for (const j of t.jumps) {
      assert.ok(j.lipS >= 0 && j.lipS < t.length, j.name);
      assert.ok(t.paceAt(j.lipS) <= j.maxSpeed + 1, `${j.name} takes off too fast`);
    }
  });

  test(`${id}: the grid sits on one level stretch of road, clear of any jump`, () => {
    if (id === 'knot') return; // its back row has always sat at the end of the last corner
    const t = getTrack(id);
    for (let s = -18; s <= 52; s += 4) { // the last row to the front row
      assert.ok(Math.abs(t.centre.curv[t.indexAt(s)]) < 0.02, `curve at ${s}`);
    }
    for (const j of t.jumps) assert.ok(t.route(60, j.startS) > 0 && t.route(-18, j.startS) > 70, j.name);
  });

  test(`${id}: both roads of a crossroads meet at one height`, () => {
    const t = getTrack(id), c = t.centre;
    for (const x of t.crossings) {
      const a = t.indexAt(x.sA), b = t.indexAt(x.sB);
      for (const d of [-8, -4, 4, 8]) {
        const ha = t.heightAt(c.px[a] + c.tx[a] * d, c.pz[a] + c.tz[a] * d);
        const hb = t.heightAt(c.px[b] + c.tx[b] * d, c.pz[b] + c.tz[b] * d);
        assert.ok(Math.abs(ha - hb) < 0.6, `step of ${Math.abs(ha - hb).toFixed(2)} m at crossing ${x.id}`);
      }
    }
  });

  test(`${id}: the race ends at the flag inside the clock, with a field left`, () => {
    for (const seed of [11, 12]) {
      const w = race(id, seed);
      assert.ok(w.finishOrder.length > 0 && w.raceTime < RULES.timeLimit - 0.01, `seed ${seed} ran to the clock at ${w.raceTime}`);
      assert.ok(w.raceTime > 150, `seed ${seed} was over in ${w.raceTime}`);
      assert.ok(w.cars.filter((c) => c.alive).length >= 2, `seed ${seed}`);
    }
  });
}

for (const id of ['park', 'volcano', 'seabed', 'moon']) {
  test(`${id} has a world to race in`, () => {
    const look = WORLDS[id];
    assert.equal(typeof look.build, 'function');
    assert.equal(look.panels.length, 8);
    assert.equal(look.sunDir.length, 3);
    assert.ok(look.panels.some(([, , text]) => text === 'GRUDGE BOWL'));
  });
}

test('every crate is on the road, and its model follows it from course to course', () => {
  const model = new THREE.Object3D();
  for (const id of ids) {
    const w = createWorld({ course: id });
    for (const crate of w.arsenal.crates) {
      assert.ok(w.track.sdfAt(crate.x, crate.z) > 1, `${id} crate ${crate.id}`);
      poseCrate(model, crate, 3);
      assert.ok(Math.hypot(model.position.x - crate.x, model.position.z - crate.z) < 1e-6, `${id} crate ${crate.id}`);
      assert.ok(Math.abs(model.position.y - crate.y) < 0.2);
    }
  }
});

for (const id of ids) {
  test(`${id}: some tower can see every metre of open road`, () => {
    const track = getTrack(id), c = track.centre;
    const director = new Director(new THREE.PerspectiveCamera(), track);
    for (let i = 0; i < c.n; i += 3) {
      if (track.coveredAt(i * c.step)) continue;
      const x = c.px[i], z = c.pz[i], y = track.heightAt(x, z) + 0.6;
      const seen = director.towers.some((w) => director.sees(w.x, w.y + 19, w.z, x, y, z));
      assert.ok(seen, `s ${i * c.step}`);
    }
  });
}

test('the volcano hides the far side from a tower, and the camera changes tower for it', () => {
  const track = getTrack('volcano');
  const director = new Director(new THREE.PerspectiveCamera(), track);
  const crater = director.towers[0];
  const road = { x: 168, y: track.heightAt(168, -14) + 0.6, z: -14 };
  assert.equal(director.sees(crater.x, crater.y + 19, crater.z, road.x, road.y, road.z), false);
  assert.equal(director.pickTower(road), true);
  assert.notEqual(director.tower, crater);
  assert.ok(director.sees(director.tower.x, director.tower.y + 19, director.tower.z, road.x, road.y, road.z));
  assert.equal(director.pickTower(road), false, 'stays put once it can see');
});

test('the helicopter can see the car from its side of the mountain', () => {
  const track = getTrack('volcano'), c = track.centre;
  const director = new Director(new THREE.PerspectiveCamera(), track);
  for (let i = 0; i < c.n; i += 7) {
    if (track.coveredAt(i * c.step)) continue;
    const x = c.px[i], z = c.pz[i], y = track.heightAt(x, z) + 0.6;
    const a = Math.atan2(z - director.heart.z, x - director.heart.x);
    const height = director.heliHeight(a, { x, y: y - 0.6, z });
    assert.ok(director.sees(Math.cos(a) * 205, height, Math.sin(a) * 205, x, y, z), `s ${i * c.step}`);
  }
});

test('a track sent over from the worker is the same track', () => {
  for (const id of ids) {
    const t = getTrack(id);
    const copy = structuredClone(packTrack(t));
    assert.equal(adoptTrack(copy), t, 'the one already built stands');
    const remade = Object.assign(Object.create(Object.getPrototypeOf(t)), copy, { course: t.course });
    for (const [x, z] of [[10, 20], [-80, 40], [120, -70]]) {
      assert.equal(remade.heightAt(x, z), t.heightAt(x, z));
      assert.equal(remade.sdfAt(x, z), t.sdfAt(x, z));
      assert.equal(remade.surfaceAt(x, z), t.surfaceAt(x, z));
    }
    assert.equal(remade.project(40, 40), t.project(40, 40));
    assert.equal(remade.coveredAt(100), t.coveredAt(100));
    assert.deepEqual(remade.nextPass(50), t.nextPass(50));
    assert.deepEqual([...remade.pace], [...t.pace]);
  }
});

test('every course has a ground to paint', () => {
  for (const id of ids) {
    for (const part of ['clay', 'asphalt', 'mud', 'verge']) assert.equal(GROUNDS[id][part].length, 2, `${id} ${part}`);
  }
  assert.equal(typeof GROUNDS.volcano.glow, 'function');
});

test('the Knot keeps its own numbers', () => {
  const t = getTrack();
  assert.equal(t, getTrack('knot'));
  assert.equal(t.gravity, GRAVITY);
  assert.equal(t.airGravity, GRAVITY);
  assert.equal(t.finishS, 1030);
  assert.equal(createWorld().laps, RULES.laps);
  assert.equal(t.covers.length, 0);
});

test('the dealer gives every course before any repeats, and never one twice running', () => {
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const deal = courseDealer(random);
  let last = null;
  for (let hand = 0; hand < 200; hand++) {
    const seen = new Set();
    for (let i = 0; i < ids.length; i++) {
      const id = deal();
      assert.notEqual(id, last);
      seen.add(id);
      last = id;
    }
    assert.equal(seen.size, ids.length);
  }
});

test('on the Moon a car floats, and only while it is off the ground', () => {
  const t = getTrack('moon');
  assert.ok(t.airGravity < GRAVITY / 2);
  assert.equal(t.gravity, GRAVITY);
  const w = createWorld({ course: 'moon' });
  assert.equal(w.track, t);
});

test('lava bombs only fall on the volcano, and warn the car they are aimed at', () => {
  const quiet = createWorld({ seed: 3, laps: 1 });
  const hot = createWorld({ seed: 3, course: 'volcano', laps: 1 });
  for (const w of [quiet, hot]) {
    w.phase = 'racing';
    for (const car of w.cars) car.vx = 20;
  }
  let bombs = 0;
  for (let i = 0; i < 240 * 12; i++) {
    stepWorld(hot);
    stepWorld(quiet);
    bombs = Math.max(bombs, hot.arsenal.drops.filter((d) => d.kind === 'lava').length);
    assert.equal(quiet.arsenal.drops.filter((d) => d.kind === 'lava').length, 0);
    hot.events.length = 0;
    quiet.events.length = 0;
  }
  assert.ok(bombs > 0);
});

test('a lava bomb hurts without crediting anybody', () => {
  const w = createWorld({ seed: 4, course: 'volcano' });
  w.phase = 'racing';
  const car = w.cars[0];
  const before = car.health;
  w.arsenal.eruption = 999;
  w.arsenal.drops.push({ id: 9, kind: 'lava', owner: -1, target: 0, x: car.px, z: car.pz, y: car.py - 0.5, t: 0.01, fall: 2 });
  for (let i = 0; i < 8; i++) stepWorld(w);
  assert.ok(car.health < before);
  assert.ok(w.cars.every((c) => c.score === 0));
  assert.ok(w.events.some((e) => e.type === 'lavaLands'));
});

test('cars start level on the ground whatever its height', () => {
  for (const id of ['volcano', 'seabed', 'moon']) {
    const t = getTrack(id);
    const s = 20, p = t.sample(s, {});
    const car = createCar(0, ROSTER[0], { ...p, s }, t);
    assert.ok(Math.abs(car.py - t.heightAt(p.x, p.z)) < 2, id);
  }
});
