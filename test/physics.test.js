import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDamage, createWorld, raceOrder, stepWorld } from '../src/sim/world.js';
import { getTrack } from '../src/sim/track.js';
import { CAR, PHYSICS_HZ, RULES, FINISH_LINE_S, SURFACE, SURFACE_PROPS } from '../src/sim/config.js';
import { integratePosition, stepCarForces } from '../src/sim/car.js';
import { collideCars } from '../src/sim/collision.js';
import { createRng, quatToMatrix } from '../src/sim/math.js';
import { fillObservation, OBS } from '../src/sim/sensors.js';
import { testDriver } from './helpers/testDriver.js';

const seconds = (world, s, each) => {
  const n = Math.round(s * PHYSICS_HZ);
  for (let i = 0; i < n; i++) {
    stepWorld(world);
    if (each) each(world);
  }
};

// Main straight, and a long run of it for anything that needs room.
const STRAIGHT_S = 18;

const on = (fn) => ({ act: fn });
const fixed = (steer, throttle, brake = 0, handbrake = 0, reverse = 0) => on(() => [steer, throttle, brake, handbrake, reverse]);

const worldMomentum = (car) => {
  const R = car.R, I = CAR.inertia;
  const b = [
    (R[0] * car.wx + R[3] * car.wy + R[6] * car.wz) * I.roll,
    (R[1] * car.wx + R[4] * car.wy + R[7] * car.wz) * I.yaw,
    (R[2] * car.wx + R[5] * car.wy + R[8] * car.wz) * I.pitch,
  ];
  return [
    R[0] * b[0] + R[1] * b[1] + R[2] * b[2],
    R[3] * b[0] + R[4] * b[1] + R[5] * b[2],
    R[6] * b[0] + R[7] * b[1] + R[8] * b[2],
  ];
};

const rotationalEnergy = (car) => {
  const R = car.R, I = CAR.inertia;
  const bx = R[0] * car.wx + R[3] * car.wy + R[6] * car.wz;
  const by = R[1] * car.wx + R[4] * car.wy + R[7] * car.wz;
  const bz = R[2] * car.wx + R[5] * car.wy + R[8] * car.wz;
  return 0.5 * (I.roll * bx * bx + I.yaw * by * by + I.pitch * bz * bz);
};

// Level, stationary, at static ride height over a flat plane at y = 0.
const sitOnFlatGround = (car) => {
  car.qw = 1; car.qx = 0; car.qy = 0; car.qz = 0;
  quatToMatrix(1, 0, 0, 0, car.R);
  car.vx = car.vy = car.vz = car.wx = car.wy = car.wz = 0;
  car.py = CAR.wheelRadius + CAR.suspRestLength - 0.12 - CAR.hardpointY;
};

const flatTrack = (track) => ({
  heightAt: () => 0,
  normalAt: (x, z, out) => { out[0] = 0; out[1] = 1; out[2] = 0; },
  surfaceAt: (x, z) => track.surfaceAt(x, z),
});

// Independent SAT over the box half-extents, used to find poses for the
// narrow-phase test.
function separatedOnlyByEdgeAxis(a, b) {
  const H = [CAR.box.halfLength, CAR.box.halfHeight, CAR.box.halfWidth];
  const col = (car, i) => [car.R[i], car.R[3 + i], car.R[6 + i]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const A = [0, 1, 2].map((i) => col(a, i)), B = [0, 1, 2].map((i) => col(b, i));
  const ca = [a.px + a.R[1] * CAR.box.centreY, a.py + a.R[4] * CAR.box.centreY, a.pz + a.R[7] * CAR.box.centreY];
  const cb = [b.px + b.R[1] * CAR.box.centreY, b.py + b.R[4] * CAR.box.centreY, b.pz + b.R[7] * CAR.box.centreY];
  const d = [ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]];
  const gap = (L) => Math.abs(dot(d, L)) - [0, 1, 2].reduce((s, i) => s + H[i] * Math.abs(dot(A[i], L)) + H[i] * Math.abs(dot(B[i], L)), 0);
  if ([...A, ...B].some((L) => gap(L) > 0)) return false;
  for (const u of A) {
    for (const v of B) {
      const L = cross(u, v);
      const len = Math.hypot(...L);
      if (len > 1e-3 && gap(L.map((x) => x / len)) > 0.01) return true;
    }
  }
  return false;
}

const speedOf = (car) => Math.hypot(car.vx, car.vy, car.vz);
const yawOf = (car) => Math.atan2(-car.R[6], car.R[0]);

function solo(brain, spawn) {
  const track = getTrack();
  const s = spawn ?? 150;
  const pt = track.sample(s, { x: 0, z: 0, tx: 0, tz: 0, curvature: 0 });
  return createWorld({
    carCount: 1,
    brainFactory: () => brain,
    spawnOverride: () => ({ x: pt.x, z: pt.z, tx: pt.tx, tz: pt.tz, s }),
  });
}

test('the Knot closes on itself and crosses itself three times', () => {
  const t = getTrack();
  const c = t.centre;
  const gap = Math.hypot(c.px[0] - c.px[c.n - 1], c.pz[0] - c.pz[c.n - 1]);
  assert.ok(gap < 2 * c.step, `loop gap ${gap}`);
  for (let i = 0; i < c.n; i++) {
    const j = (i + 1) % c.n;
    const step = Math.hypot(c.px[j] - c.px[i], c.pz[j] - c.pz[i]);
    assert.ok(step < 1.5 * c.step, `jump at ${i}: ${step}`);
    assert.ok(t.sdfAt(c.px[i], c.pz[i]) > t.hw[i] - 0.7, `centreline near wall at ${i}`);
  }
  assert.equal(t.crossings.length, 3);
  assert.equal(t.passes.length, 6);
  for (const x of t.crossings) {
    assert.ok(Math.abs(x.angle - Math.PI / 3) < 0.08, `crossing angle ${x.angle}`);
    assert.ok(t.heightAt(x.x, x.z) < 0.12, `crossroads must be level, got ${t.heightAt(x.x, x.z)}`);
    for (const s of [x.sA, x.sB]) {
      const p = t.sample(s, { x: 0, z: 0, tx: 0, tz: 0, curvature: 0 });
      assert.ok(Math.hypot(p.x - x.x, p.z - x.z) < 2, 'both passes reach the crossing point');
    }
  }
});

test('nearest-strand tracking stays on its own road through a crossroads', () => {
  const t = getTrack();
  for (const x of t.crossings) {
    for (const s of [x.sA, x.sB]) {
      let at = s - 12;
      for (let d = -12; d <= 12; d += 1) {
        const p = t.sample(s + d, { x: 0, z: 0, tx: 0, tz: 0, curvature: 0 });
        at = t.project(p.x, p.z, at);
        assert.ok(t.route(s - 13, at) < 27, `left the strand near ${s}: ${at}`);
      }
    }
  }
});

test('walls: road is positive, infields and outside are negative, loops are closed', () => {
  const t = getTrack();
  for (const x of t.crossings) assert.ok(t.sdfAt(x.x, x.z) > 8);
  assert.ok(t.sdfAt(0, -7) < 0, 'the triangle between the crossroads is an island');
  assert.ok(t.sdfAt(-10, -80) < -5, 'north infield');
  assert.ok(t.sdfAt(60, 50) < -5, 'east infield');
  assert.ok(t.sdfAt(t.bounds.maxX - 1, 0) < -5, 'outside');
  assert.ok(t.polys.length >= 5);
  for (const poly of t.polys) {
    const [a, b] = [poly[0], poly[poly.length - 1]];
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 3, 'wall loop closes');
    for (const p of poly) assert.ok(Math.abs(t.sdfAt(p[0], p[1])) < 0.6, 'wall loop follows the contour');
  }
});

test('the racing line stays on the road and the pace notes respect the real surface', () => {
  const t = getTrack();
  const c = t.centre;
  let onMud = 0;
  for (let i = 0; i < c.n; i++) {
    assert.ok(Math.abs(t.line.offset[i]) <= t.hw[i] - 2, `line off the road at ${i}`);
    const surface = t.surfaceAt(t.line.px[i], t.line.pz[i]);
    if (surface === SURFACE.MUD) onMud++;
    const limit = Math.sqrt((SURFACE_PROPS[surface].grip * 1.02 * 9.81) / Math.max(1e-4, Math.abs(t.line.curv[i])));
    assert.ok(t.pace[i] <= limit * 1.08, `pace ${t.pace[i]} above limit ${limit} at ${i}`);
    assert.ok(t.pace[i] > 8 && t.pace[i] < 60);
  }
  assert.ok(onMud > 0, 'the line must cross some mud for this to mean anything');
});

test('raycast reaches the end of a clear line that grazes a wall', () => {
  const t = getTrack();
  const [x, z, a] = [9.603, -112.8355, 0.576569];
  const dx = Math.cos(a), dz = Math.sin(a);
  let clearance = Infinity;
  for (let d = 0; d < 45; d += 0.01) clearance = Math.min(clearance, t.sdfAt(x + dx * d, z + dz * d));
  const got = t.raycast(x, z, dx, dz, 45);
  if (clearance > 0.05) assert.equal(got, 45);
  else assert.ok(t.sdfAt(x + dx * got, z + dz * got) < 0.06);
});

test('raycast does not step across a wall corner', () => {
  const t = getTrack();
  const got = t.raycast(-19.366932121645608, -5.227182130128659, 0.9057104456448964, 0.4238969080445422, 45);
  assert.ok(Math.abs(got - 21.3) < 0.2, `hit at ${got}`);
});

test('project is continuous along the road, also across the seam at s = 0', () => {
  const t = getTrack();
  const c = t.centre;
  for (const s of [20.1, 20.4, 20.45, 400.7]) {
    const i = Math.floor(s / c.step);
    const u = s / c.step - i;
    const x = c.px[i] + (c.px[i + 1] - c.px[i]) * u, z = c.pz[i] + (c.pz[i + 1] - c.pz[i]) * u;
    assert.ok(Math.abs(t.project(x, z, s) - s) < 0.02, `${s} -> ${t.project(x, z, s)}`);
  }
  const edge = t.project(c.px[0] - c.tx[0] * 0.3, c.pz[0] - c.tz[0] * 0.3, 0.2);
  assert.ok(edge > t.length - 0.5 && edge < t.length, `wraps to ${edge}`);
});

test('pace notes never ask a car to brake in the air', () => {
  const t = getTrack();
  for (const j of t.jumps) {
    const lip = t.paceAt(j.lipS);
    assert.ok(lip <= j.maxSpeed + 0.5, `lip pace ${lip}`);
    for (let d = 0; d < j.airLength - 1; d += 1) {
      assert.ok(t.paceAt(j.lipS) <= t.paceAt(j.lipS + d) + 1, `${j.name} needs braking at +${d}`);
    }
  }
});

function launch(jump, speed) {
  const s = jump.startS - 10; // close in, so no earlier jump gets in the way
  const world = createWorld({
    carCount: 1,
    spawnOverride: (i, t) => ({ ...t.sampleLine(s, {}), s }),
    brainFactory: () => testDriver({ targetSpeed: speed, paceShare: 3 }),
  });
  world.phase = 'racing';
  world.time = RULES.countdown;
  const car = world.cars[0];
  car.vx = car.R[0] * speed;
  car.vz = car.R[6] * speed;
  for (const w of car.wheels) w.omega = speed / CAR.wheelRadius;
  let landing = null, landedAt = 0, minUp = 1;
  for (let i = 0; i < 240 * 5 && !landing; i++) {
    stepWorld(world);
    minUp = Math.min(minUp, car.R[4]);
    landing = world.events.find((e) => e.type === 'landing') ?? null;
    world.events.length = 0;
    landedAt = car.trackS;
  }
  return { world, car, landing, landedAt, minUp };
}

test('every jump flies and lands on the wheels at any sensible speed', () => {
  const t = getTrack();
  for (const jump of t.jumps) {
    // Up to the speed each jump is built for, which the pace notes hold cars to. A clean car
    // does flip the Hump from about 24 m/s, but traffic tops out near 18 there, 30 m out of
    // a hairpin.
    assert.ok(t.paceAt(jump.lipS) <= jump.maxSpeed + 0.5, `${jump.name} pace ${t.paceAt(jump.lipS)}`);
    for (const speed of [16, 20, jump.maxSpeed]) {
      const { landing, minUp, car } = launch(jump, speed);
      assert.ok(landing, `${jump.name} at ${speed}: never flew`);
      assert.ok(landing.air > 0.3 && landing.air < 1.3, `${jump.name} at ${speed}: ${landing.air}s`);
      assert.ok(minUp > 0.85, `${jump.name} at ${speed}: tipped to ${minUp}`);
      assert.ok(car.alive);
    }
  }
});

test('flight distance grows with speed, and Dropkick lands on a crossroads', () => {
  const t = getTrack();
  const dropkick = t.jumps.find((j) => j.name === 'Dropkick');
  const slow = t.route(dropkick.lipS, launch(dropkick, 20).landedAt);
  const fast = t.route(dropkick.lipS, launch(dropkick, 36).landedAt);
  assert.ok(fast > slow + 12, `slow ${slow} fast ${fast}`);
  const mid = launch(dropkick, 27);
  const crossing = t.crossings.find((x) => t.route(dropkick.lipS, x.sA) < 40 || t.route(dropkick.lipS, x.sB) < 40);
  assert.ok(Math.hypot(mid.car.px - crossing.x, mid.car.pz - crossing.z) < 16, 'lands in the box');
});

test('a slow car rolls off the back of a jump without beaching', () => {
  const t = getTrack();
  for (const jump of t.jumps) {
    const s = jump.lipS - 1;
    const world = createWorld({
      carCount: 1,
      spawnOverride: (i, tr) => ({ ...tr.sample(s, {}), s }),
      brainFactory: () => fixed(0, 0.5),
    });
    world.phase = 'racing';
    world.time = RULES.countdown;
    const car = world.cars[0];
    // Worst case: both fronts flat, so the nose and the tail sit low.
    car.wheels[0].hp = 0.1; car.wheels[1].hp = 0.1;
    seconds(world, 5);
    assert.ok(t.route(s, car.trackS) > 14, `${jump.name}: only ${t.route(s, car.trackS)} m`);
  }
});

test('a car on four flat tyres still drives', () => {
  const world = solo(fixed(0, 0.6), STRAIGHT_S);
  world.time = RULES.countdown;
  const car = world.cars[0];
  for (const w of car.wheels) w.hp = 0.1;
  seconds(world, 3);
  assert.ok(speedOf(car) > 5, `speed ${speedOf(car)}`);
});

test('a car falling on another is a real collision', () => {
  const world = createWorld({
    carCount: 2,
    spawnOverride: (i, t) => ({ ...t.sample(100, {}), s: 100 }),
    brainFactory: () => fixed(0, 0),
  });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const [lower, upper] = world.cars;
  seconds(world, 0.5);
  world.events.length = 0;
  upper.px = lower.px; upper.pz = lower.pz;
  upper.py = lower.py + 3.2;
  upper.vy = -7;
  let hit = null;
  for (let i = 0; i < 120 && !hit; i++) {
    stepWorld(world);
    hit = world.events.find((e) => e.type === 'hit');
  }
  assert.ok(hit, 'no hit event');
  assert.ok(Math.abs(hit.ny) > 0.7, `contact normal ${hit.ny}`);
  assert.equal(hit.upper, upper.id);
  assert.ok(lower.health < 1);
});

test('a parked car settles on its suspension without drifting or sinking', () => {
  const world = solo(fixed(0, 0, 1));
  world.phase = 'countdown';
  world.time = -100;
  seconds(world, 3);
  const car = world.cars[0];
  assert.ok(speedOf(car) < 0.05, `speed ${speedOf(car)}`);
  const h = world.track.heightAt(car.px, car.pz);
  assert.ok(car.py - h > 0.45 && car.py - h < 0.75, `ride height ${car.py - h}`);
  for (const w of car.wheels) {
    assert.ok(w.onGround);
    assert.ok(w.load > 2500 && w.load < 5500, `load ${w.load}`);
  }
});

test('acceleration: 0-100 km/h in the time of a very fast race car', () => {
  const world = solo(fixed(0, 1), STRAIGHT_S);
  const car = world.cars[0];
  let t = 0;
  world.time = RULES.countdown;
  stepWorld(world);
  while (speedOf(car) < 27.8 && t < 15) {
    stepWorld(world);
    t += 1 / PHYSICS_HZ;
  }
  assert.ok(t > 1.5 && t < 4, `0-100 took ${t}`);
});

test('braking from speed: dives onto the front axle and stops', () => {
  const world = solo(fixed(0, 1), STRAIGHT_S);
  world.time = RULES.countdown;
  const car = world.cars[0];
  seconds(world, 3.5);
  const v0 = speedOf(car);
  world.brains[0] = fixed(0, 0, 1);
  seconds(world, 0.4);
  const frontLoad = car.wheels[0].load + car.wheels[1].load;
  const rearLoad = car.wheels[2].load + car.wheels[3].load;
  assert.ok(frontLoad > rearLoad * 1.4, `front ${frontLoad} rear ${rearLoad}`);
  seconds(world, 5);
  assert.ok(v0 > 15 && speedOf(car) < 0.5, `from ${v0} to ${speedOf(car)}`);
});

test('steady cornering transfers load to the outside wheels', () => {
  const world = solo(fixed(0.22, 0.3), STRAIGHT_S);
  world.time = RULES.countdown;
  const car = world.cars[0];
  // Drive into a right-hander. The tyre lever keeps load transfer mild, by design.
  let most = 0;
  seconds(world, 3, () => {
    most = Math.max(most, (car.wheels[0].load + car.wheels[2].load) / Math.max(1, car.wheels[1].load + car.wheels[3].load));
  });
  assert.ok(most > 1.08, `best left/right load ratio ${most}`);
});

test('handbrake turn: locked rears break traction and the car oversteers past its velocity', () => {
  const world = solo(fixed(0, 1), STRAIGHT_S);
  world.time = RULES.countdown;
  const car = world.cars[0];
  seconds(world, 3.2);
  world.brains[0] = fixed(0.8, 0, 0, 1);
  let maxSlip = 0;
  seconds(world, 1.2, () => {
    const vf = car.vx * car.R[0] + car.vz * car.R[6];
    const vr = car.vx * car.R[2] + car.vz * car.R[8];
    if (Math.hypot(vf, vr) > 3) maxSlip = Math.max(maxSlip, Math.abs(Math.atan2(vr, Math.abs(vf))));
  });
  assert.ok(maxSlip > 0.5, `max slip angle ${maxSlip}`);
});

test('power oversteer: full throttle in low gear spins the rears and yaws the car', () => {
  const world = solo(fixed(0.5, 0.35), STRAIGHT_S);
  world.time = RULES.countdown;
  const car = world.cars[0];
  seconds(world, 2.5);
  world.brains[0] = fixed(0.5, 1);
  let maxRearSlide = 0;
  const yaw0 = yawOf(car);
  seconds(world, 1.0, () => {
    maxRearSlide = Math.max(maxRearSlide, car.wheels[2].slide);
  });
  assert.ok(maxRearSlide > 2, `rear slide ${maxRearSlide}`);
  assert.notEqual(yaw0, yawOf(car));
});

test('reverse gear moves the car backwards', () => {
  const world = solo(fixed(0, 0.6, 0, 0, 1), STRAIGHT_S + 60);
  world.time = RULES.countdown;
  const car = world.cars[0];
  seconds(world, 2);
  const vf = car.vx * car.R[0] + car.vz * car.R[6];
  assert.ok(vf < -2, `forward speed ${vf}`);
});

test('a test driver can lap the Knot quickly without leaving the road', () => {
  const world = createWorld({
    carCount: 1,
    laps: 3,
    // This driver has no recovery, so keep it below the pace that loses it at the Pancake funnel.
    brainFactory: () => testDriver({ paceShare: 0.74 }),
  });
  let minClearance = Infinity;
  const car = world.cars[0];
  const clock = [];
  let seen = 0;
  while (world.phase !== 'finished' && world.time < 200) {
    stepWorld(world);
    minClearance = Math.min(minClearance, world.track.sdfAt(car.px, car.pz));
    if (car.laps > seen) { seen = car.laps; clock.push(world.raceTime); }
  }
  assert.equal(world.phase, 'finished');
  assert.equal(world.winner, car.id);
  assert.ok(minClearance > 0.5, `closest approach to a wall ${minClearance}`);
  assert.ok(clock[2] - clock[1] < 41, `lap ${clock[2] - clock[1]}`);
  // This plain driver brushes the barrier at speed, and scrapes cost more than they did.
  assert.ok(car.health > 0.5, `health ${car.health}`);
});

test('T-bone: the struck car takes more damage and gets knocked sideways', () => {
  const track = getTrack();
  const x = track.crossings[2];
  const line = track.sample(x.sA - 15, { x: 0, z: 0, tx: 0, tz: 0, curvature: 0 });
  const other = track.sample(x.sB, { x: 0, z: 0, tx: 0, tz: 0, curvature: 0 });
  const world = createWorld({
    carCount: 2,
    spawnOverride: (i) => i === 0
      ? { x: x.x, z: x.z, tx: other.tx, tz: other.tz, s: x.sB }
      : { x: line.x, z: line.z, tx: line.tx, tz: line.tz, s: x.sA - 15 },
    brainFactory: () => fixed(0, 0),
  });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const [victim, attacker] = world.cars;
  attacker.vx = line.tx * 24;
  attacker.vz = line.tz * 24;
  seconds(world, 1);
  assert.ok(victim.health < attacker.health, `victim ${victim.health} attacker ${attacker.health}`);
  assert.ok(victim.vx * line.tx + victim.vz * line.tz > 3, 'victim shoved along the attacker');
  assert.equal(victim.lastHitter, attacker.id);
  assert.ok(attacker.damageDealt > 0);
});

test('hitting a wall stops the car, keeps it inside and hurts', () => {
  const track = getTrack();
  const p = track.sample(100, { x: 0, z: 0, tx: 0, tz: 0, curvature: 0 });
  const world = createWorld({
    carCount: 1,
    spawnOverride: () => ({ x: p.x, z: p.z, tx: -p.tz, tz: p.tx, s: 100 }),
    brainFactory: () => fixed(0, 0),
  });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const car = world.cars[0];
  car.vx = -p.tz * 30;
  car.vz = p.tx * 30;
  seconds(world, 2);
  assert.ok(world.track.sdfAt(car.px, car.pz) > -0.5, `sdf ${world.track.sdfAt(car.px, car.pz)}`);
  assert.ok(car.health < 1);
});

test('a fast glancing wall hit does not roll the car', () => {
  const track = getTrack();
  const p = track.sample(100, { x: 0, z: 0, tx: 0, tz: 0, curvature: 0 });
  const nose = [p.tx * 0.94 - p.tz * 0.34, p.tz * 0.94 + p.tx * 0.34]; // 20 degrees toward the wall
  const world = createWorld({
    carCount: 1,
    spawnOverride: () => ({ x: p.x, z: p.z, tx: nose[0], tz: nose[1], s: 100 }),
    brainFactory: () => fixed(0, 0),
  });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const car = world.cars[0];
  car.vx = nose[0] * 50;
  car.vz = nose[1] * 50;
  for (const w of car.wheels) w.omega = 50 / CAR.wheelRadius;
  let lowest = 1;
  seconds(world, 2, () => { lowest = Math.min(lowest, car.R[4]); });
  assert.ok(lowest > 0.25, `tipped to ${lowest}`);
});

test('a flipped car rests on its roof and is eventually ruled out', () => {
  const world = solo(fixed(0, 0));
  world.time = RULES.countdown;
  const car = world.cars[0];
  car.qw = 0; car.qx = 1; car.qy = 0; car.qz = 0;
  car.py += 1;
  seconds(world, 7);
  assert.ok(Math.abs(speedOf(car)) < 1, `speed ${speedOf(car)}`);
  assert.equal(car.koReason, 'turtled');
});

test('the simulation is deterministic for a seed', () => {
  const run = () => {
    const world = createWorld({ seed: 42, brainFactory: () => testDriver({ targetSpeed: 26 }) });
    seconds(world, 20);
    return world.cars.map((c) => [c.px, c.pz, c.health]).flat();
  };
  assert.deepEqual(run(), run());
});

test('a full grid stays finite through 30 seconds of chaos', () => {
  const world = createWorld({ seed: 7, brainFactory: () => testDriver({ targetSpeed: 30 }) });
  seconds(world, 30);
  for (const c of world.cars) {
    for (const v of [c.px, c.py, c.pz, c.vx, c.vy, c.vz, c.wx, c.wy, c.wz, c.qw]) {
      assert.ok(Number.isFinite(v));
    }
    assert.ok(world.track.sdfAt(c.px, c.pz) > -2, `${c.name} escaped`);
  }
});

test('observation fields carry the values and signs their names claim', () => {
  const world = createWorld({
    carCount: 2,
    spawnOverride: (i) => i === 0
      ? { x: -70, z: -22, tx: 1, tz: 0, s: 34 }
      : { x: -40, z: -16, tx: 0, tz: 1, s: 64 },
    brainFactory: () => fixed(0, 0),
  });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const [me, rival] = world.cars;
  me.vx = 20;
  me.vz = 4;
  rival.health = 0.4;
  me.health = 0.7;
  me.wy = -1.5; // negative yaw about +Y turns right
  stepWorld(world);
  const obs = world.obs[0];
  const I = OBS.index;
  const near = (name, want, tol) => assert.ok(Math.abs(obs[I[name]] - want) < tol, `${name}: ${obs[I[name]]} vs ${want}`);
  near('ego.speedFwd', 20 / 40, 0.03);
  near('ego.speedRight', 4 / 40, 0.03);
  near('ego.yawRate', 0.5, 0.05);
  near('ego.health', 0.7, 1e-6);
  near('ego.temperVengeance', me.temper.vengeance, 1e-6);
  near('opp0.alive', 1, 1e-6);
  near('opp0.fwd', 0.3, 0.01);
  near('opp0.right', 0.06, 0.01);
  near('opp0.solid', 1, 1e-6);
  near('opp0.raceGap', 30 / world.track.length, 0.005);
  near('ego.racePosition', 1, 1e-6);
  near('opp0.health', 0.4, 1e-6);
  near('opp0.headingSin', 1, 0.05);
  near('opp0.los', 1, 1e-6);
});

test('route sensors read the next crossroads and the next lip', () => {
  const world = createWorld({ carCount: 2, brainFactory: () => fixed(0, 0) });
  const [car, rival] = world.cars;
  const t = world.track;
  const obs = new Float32Array(OBS.size);
  const [pass] = t.passes;
  car.trackS = pass.s - 60;
  rival.trackS = pass.other - 30;
  fillObservation(world, car, obs);
  assert.ok(Math.abs(obs[OBS.index['ego.toCrossing']] - 0.5) < 1e-3);
  assert.ok(Math.abs(obs[OBS.index['opp0.toMyCrossing']] - 0.25) < 1e-3, 'rival arrives along the other strand');
  car.trackS = t.jumps[0].lipS - 30;
  fillObservation(world, car, obs);
  assert.ok(Math.abs(obs[OBS.index['ego.toJump']] - 0.25) < 1e-3);
  assert.ok(Math.abs(obs[OBS.index['ego.pace']] * 40 - t.paceAt(car.trackS)) < 1e-3);
});

test('free tumbling conserves angular momentum', () => {
  const world = solo(fixed(0, 0));
  const car = world.cars[0];
  car.qw = 1; car.qx = 0; car.qy = 0; car.qz = 0;
  quatToMatrix(1, 0, 0, 0, car.R);
  car.wx = 1; car.wy = 1; car.wz = 0;
  const L0 = worldMomentum(car);
  for (let i = 0; i < 240; i++) integratePosition(car, 1 / 240);
  const L1 = worldMomentum(car);
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(L0[k] - L1[k]) < 1e-6, `L${k} ${L0[k]} -> ${L1[k]}`);
});

test('a spinning tyre adds no energy to a stationary car', () => {
  const world = solo(fixed(0, 0, 0));
  const car = world.cars[0];
  car.engineOn = false;
  sitOnFlatGround(car);
  for (const w of car.wheels) w.omega = 0.1;
  const flat = flatTrack(world.track);
  const energy = () =>
    0.5 * CAR.mass * (car.vx ** 2 + car.vz ** 2) +
    rotationalEnergy(car) +
    car.wheels.reduce((e, w) => e + 0.5 * CAR.wheelInertia * w.omega ** 2, 0);
  const before = energy();
  stepCarForces(car, flat, 1 / 240);
  assert.ok(car.wheels.every((w) => w.load > 0), 'all four tyres must be on the ground');
  assert.ok(energy() <= before, `${before} -> ${energy()}`);
});

test('a torque-free tumble keeps its rotational energy', () => {
  const world = solo(fixed(0, 0));
  const car = world.cars[0];
  car.qw = 1; car.qx = 0; car.qy = 0; car.qz = 0;
  quatToMatrix(1, 0, 0, 0, car.R);
  car.wx = 10; car.wy = 10; car.wz = 0;
  const before = rotationalEnergy(car);
  for (let i = 0; i < 240; i++) integratePosition(car, 1 / 240);
  const after = rotationalEnergy(car);
  assert.ok(Math.abs(after / before - 1) < 0.01, `${before} -> ${after}`);
});

test('full brakes hold a parked car on the banking', () => {
  const banked = getTrack();
  const slopeAt = (x, z) => Math.hypot(banked.heightAt(x + 1, z) - banked.heightAt(x - 1, z),
    banked.heightAt(x, z + 1) - banked.heightAt(x, z - 1)) / 2;
  let s = 0, steepest = 0;
  for (let i = 0; i < banked.centre.n; i += 2) {
    const inJump = banked.jumps.some((j) => banked.route(j.startS - 5, i) < j.endS - j.startS + 10);
    const slope = slopeAt(banked.centre.px[i], banked.centre.pz[i]);
    if (!inJump && slope > steepest) { steepest = slope; s = i * banked.centre.step; }
  }
  const world = solo(fixed(0, 0, 1), s);
  const car = world.cars[0];
  assert.ok(slopeAt(car.px, car.pz) > 0.05, `not on a bank: ${slopeAt(car.px, car.pz)}`);
  car.engineOn = false;
  world.time = -100; // stays in the countdown, so the brakes stay on
  seconds(world, 6);
  const x0 = car.px, z0 = car.pz;
  seconds(world, 60);
  const moved = Math.hypot(car.px - x0, car.pz - z0);
  assert.ok(moved < 0.05, `crept ${moved} m`);
  assert.ok(speedOf(car) < 0.01, `still moving at ${speedOf(car)}`);
});

test('a freed wreck still rolls: light brakes do not hold it', () => {
  const world = solo(fixed(0, 0), 604);
  const car = world.cars[0];
  world.time = RULES.countdown + 1;
  world.phase = 'racing';
  car.engineOn = false;
  car.input.brake = 0.06;
  const speed = 3;
  car.vx = car.R[0] * speed; car.vz = car.R[6] * speed;
  for (const w of car.wheels) w.omega = speed / CAR.wheelRadius;
  world.brains[0] = null;
  seconds(world, 0.5);
  assert.ok(speedOf(car) > 1, `slowed to ${speedOf(car)}`);
});

test('a level symmetric car loads both sides of each axle equally', () => {
  const world = solo(fixed(0, 0));
  const car = world.cars[0];
  sitOnFlatGround(car);
  stepCarForces(car, flatTrack(world.track), 1 / 240);
  assert.ok(car.wheels.every((w) => w.load > 0), 'all four tyres must be on the ground');
  assert.ok(Math.abs(car.wheels[0].load - car.wheels[1].load) < 1e-6);
  assert.ok(Math.abs(car.wheels[2].load - car.wheels[3].load) < 1e-6);
});

test('closed-throttle engine braking slows a car rolling backwards in drive', () => {
  const world = solo(fixed(0, 0), 604);
  world.time = RULES.countdown;
  const car = world.cars[0];
  stepWorld(world);
  const set = -8;
  car.vx = car.R[0] * set; car.vz = car.R[6] * set;
  for (const w of car.wheels) w.omega = set / 0.36;
  seconds(world, 1);
  const v = car.vx * car.R[0] + car.vz * car.R[6];
  assert.ok(v > set, `moved from ${set} to ${v}`);
});

test('brakes stop an airborne wheel', () => {
  const world = solo(fixed(0, 0, 1));
  const car = world.cars[0];
  world.time = -100;
  car.py += 3;
  car.input.brake = 1;
  car.wheels[0].omega = 20;
  for (let i = 0; i < 20; i++) stepCarForces(car, world.track, 1 / 240);
  assert.equal(car.wheels[0].omega, 0);
});

test('wrecks score nothing, block the road, and are towed', () => {
  const world = createWorld({
    carCount: 3,
    spawnOverride: (i) => [
      { x: -70, z: -30, tx: 0, tz: 1, s: 34 },
      { x: -70, z: -22, tx: 1, tz: 0, s: 34 },
      { x: -30, z: -22, tx: 1, tz: 0, s: 74 },
    ][i],
    brainFactory: () => fixed(0, 0),
  });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const [attacker, wreck] = world.cars;
  wreck.alive = false;
  wreck.health = 0;
  wreck.koTime = world.time;
  attacker.vz = 14;
  seconds(world, 1);
  assert.equal(attacker.score, 0);
  assert.ok(Math.hypot(wreck.vx, wreck.vz) > 0.5, 'a wreck is still solid');

  seconds(world, RULES.wreckTowSeconds - 1 + 0.1);
  assert.equal(wreck.towed, true);
  assert.ok(world.events.some((e) => e.type === 'towed' && e.car === wreck.id));

  const obs = new Float32Array(OBS.size).fill(9);
  fillObservation(world, attacker, obs);
  const base = OBS.index['opp0.alive'];
  for (let f = 0; f < 17; f++) assert.equal(obs[base + f], 0, 'a towed slot reads all zeros');

  const before = [wreck.px, wreck.py, wreck.pz];
  attacker.px = wreck.px; attacker.pz = wreck.pz;
  seconds(world, 0.2);
  assert.deepEqual([wreck.px, wreck.py, wreck.pz], before, 'towed cars take no part');
});

test('a car that stops gaining route is waved off', () => {
  const world = solo(fixed(0, 0, 1), STRAIGHT_S);
  world.time = RULES.countdown;
  const car = world.cars[0];
  seconds(world, RULES.stalledKoSeconds - 1);
  assert.equal(car.alive, true);
  seconds(world, 2);
  assert.equal(car.alive, false);
  assert.equal(car.koReason, 'stalled out');
});

test('moving forward resets the stall clock, reversing does not', () => {
  const world = solo(fixed(0, 0, 1), STRAIGHT_S);
  world.time = RULES.countdown;
  const car = world.cars[0];
  seconds(world, 6);
  assert.ok(car.stallTime > 5);
  car.progress += 5;
  seconds(world, 0.1);
  assert.ok(car.stallTime < 1, `${car.stallTime}`);
  car.progress -= 3;
  seconds(world, 1);
  assert.ok(car.stallTime > 0.9);
});

function placeOnRoad(world, car, s) {
  const p = world.track.sample(s, { x: 0, z: 0, tx: 0, tz: 0, curvature: 0 });
  car.px = p.x; car.pz = p.z;
  car.vx = p.tx * 30; car.vz = p.tz * 30;
  return p;
}

test('a car has to drive over the painted line to win, and the leader on the road wins', () => {
  const world = createWorld({
    carCount: 2,
    laps: 1,
    spawnOverride: (i, t) => ({ ...t.sample(FINISH_LINE_S - 0.4, {}), s: FINISH_LINE_S - 0.4 }),
    brainFactory: () => fixed(0, 1),
  });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const [behind, ahead] = world.cars;
  const L = world.track.length;
  behind.progress = L - 0.4;
  ahead.progress = L - 0.35;
  behind.stallMark = behind.progress; ahead.stallMark = ahead.progress;
  const { tx, tz } = world.track.sample(FINISH_LINE_S, {});
  behind.px -= tz * 3; behind.pz += tx * 3;
  ahead.px += tz * 3 + tx * 0.05; ahead.pz += -tx * 3 + tz * 0.05;
  behind.trackS = world.track.project(behind.px, behind.pz, behind.trackS);
  ahead.trackS = world.track.project(ahead.px, ahead.pz, ahead.trackS);
  behind.vx = ahead.vx = tx * 30;
  behind.vz = ahead.vz = tz * 30;
  for (const c of world.cars) for (const w of c.wheels) w.omega = 30 / CAR.wheelRadius;
  let guard = 0;
  while (world.phase === 'racing' && guard++ < 240) stepWorld(world);
  assert.equal(world.phase, 'finished');
  assert.equal(world.winner, ahead.id, '5 cm ahead on the road is ahead');
  const gone = Math.abs((((ahead.trackS - FINISH_LINE_S + L / 2) % L) + L) % L - L / 2);
  assert.ok(gone < 1, `finished ${gone} m from the line`);
});

test('being knocked onto the other strand neither gains ground nor moves the line', () => {
  const world = createWorld({ carCount: 1, brainFactory: () => fixed(0, 0) });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const car = world.cars[0];
  const L = world.track.length;
  const pass = world.track.passes[2];
  const aligned = () => {
    const diff = (((car.progress - (car.trackS - FINISH_LINE_S)) % L) + L) % L;
    return Math.min(diff, L - diff);
  };
  placeOnRoad(world, car, pass.s - 2);
  car.trackS = pass.s - 2;
  car.progress = pass.s - 2 - FINISH_LINE_S;
  const before = car.progress;
  // Forward switch: from the strand at 466 onto the one at 850, past the crossing.
  placeOnRoad(world, car, pass.other + 30);
  stepWorld(world);
  assert.ok(car.trackS > pass.other, `on the other strand: ${car.trackS}`);
  assert.ok(car.progress < before, `a shortcut must not gain: ${before} -> ${car.progress}`);
  assert.ok(aligned() < 1, `line moved by ${aligned()}`);
  assert.ok(Math.abs(car.progressRate) < 60, `rate ${car.progressRate}`);
  assert.ok(car.stallTime < 0.01, 'the stall clock restarts');
  // And a backward switch simply loses the difference.
  const held = car.progress;
  placeOnRoad(world, car, pass.s + 30);
  stepWorld(world);
  assert.ok(car.progress < held, `${held} -> ${car.progress}`);
  assert.ok(aligned() < 1, `line moved by ${aligned()}`);
});

test('board, sensors and results share one running order, wrecks by distance', () => {
  const world = createWorld({ carCount: 4, laps: 1, seed: 2, brainFactory: () => fixed(0, 0, 1) });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const L = world.track.length;
  const [a, b, c, d] = world.cars;
  a.progress = L * 0.5; b.progress = L * 0.9; c.progress = L * 0.7; d.progress = L * 0.8;
  d.health = 0;
  stepWorld(world);
  a.health = 0; // knocked out later, and shorter on distance, than d
  stepWorld(world);
  assert.equal(world.phase, 'racing');
  b.progress = L + 0.5;
  stepWorld(world);
  assert.equal(world.phase, 'finished');
  assert.equal(world.winner, b.id);
  assert.deepEqual(world.finishOrder, [b.id, c.id, d.id, a.id]);
  assert.deepEqual(world.finishOrder, raceOrder(world.cars).map((car) => car.id));
  assert.deepEqual([b.racePos, c.racePos, d.racePos, a.racePos], [0, 1, 2, 3]);
  assert.equal(new Set(world.finishOrder).size, 4);
});

test('a car destroyed on the line does not end the race for someone who has not finished', () => {
  const world = createWorld({ carCount: 3, laps: 1, seed: 2, brainFactory: () => fixed(0, 0, 1) });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const L = world.track.length;
  const [a, b, c] = world.cars;
  a.progress = L + 0.1; a.health = 0;
  b.progress = L * 0.8; c.progress = L * 0.7;
  stepWorld(world);
  assert.equal(a.alive, false);
  assert.equal(world.phase, 'racing', 'the race goes on');
  assert.equal(world.leaderLaps, 0);
});

test('two cars crossing in one step are placed by who crossed first, not who is further on', () => {
  const world = createWorld({ carCount: 2, laps: 1, seed: 2, brainFactory: () => fixed(0, 0, 1) });
  const [slow, quick] = world.cars;
  const L = world.track.length;
  slow.progress = L + 0.02; slow.finishFraction = 0.47;
  quick.progress = L + 0.05; quick.finishFraction = 0.64;
  assert.deepEqual(raceOrder(world.cars).map((c) => c.id), [slow.id, quick.id]);
});

test('wrecks are ranked by distance even if they crossed the line as they died', () => {
  const world = createWorld({ carCount: 2, laps: 1, seed: 2, brainFactory: () => fixed(0, 0, 1) });
  const [a, b] = world.cars;
  const L = world.track.length;
  a.alive = false; a.progress = L + 0.03; a.finishFraction = 0.4;
  b.alive = false; b.progress = L + 0.065; b.finishFraction = 0.48;
  assert.deepEqual(raceOrder(world.cars).map((c) => c.id), [b.id, a.id]);
});

test('finish fraction is measured from the step that crossed the line', () => {
  const world = createWorld({
    carCount: 1,
    laps: 1,
    spawnOverride: (i, t) => ({ ...t.sample(FINISH_LINE_S - 0.03, {}), s: FINISH_LINE_S - 0.03 }),
    brainFactory: () => fixed(0, 1),
  });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const car = world.cars[0];
  car.progress = world.track.length - 0.03;
  car.stallMark = car.progress;
  car.vx = 12;
  while (world.phase === 'racing') stepWorld(world);
  assert.ok(car.finishFraction > 0 && car.finishFraction <= 1, `${car.finishFraction}`);
});

test('a strand penalty takes the lap back from the counters too', () => {
  const world = createWorld({ carCount: 1, brainFactory: () => fixed(0, 0) });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const car = world.cars[0];
  const L = world.track.length;
  const pass = world.track.passes[0];
  placeOnRoad(world, car, pass.s - 2);
  car.trackS = pass.s - 2;
  car.progress = L + (((pass.s - 2 - FINISH_LINE_S) % L) + L) % L;
  car.stallMark = car.progress;
  stepWorld(world);
  assert.equal(car.laps, 1);
  assert.equal(world.leaderLaps, 1);
  placeOnRoad(world, car, pass.other + 30);
  stepWorld(world);
  assert.ok(car.progress < L, `${car.progress}`);
  assert.equal(car.laps, 0);
  assert.equal(world.leaderLaps, 0);
  assert.equal(world.events.filter((e) => e.type === 'lap').length, 1, 'no second announcement of the same lap');
});

test('a rising car rear-ending another is not a landing', () => {
  const world = createWorld({
    carCount: 2,
    spawnOverride: (i, t) => ({ ...t.sample(100 + i * 5.1, {}), s: 100 + i * 5.1 }),
    brainFactory: () => fixed(0, 0),
  });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const [upper, lower] = world.cars;
  seconds(world, 0.2);
  world.events.length = 0;
  upper.py = lower.py + 0.5;
  upper.airTime = 0.2;
  upper.vx = 20; upper.vy = 3;
  upper.prevVy = 3;
  let hit = null;
  for (let i = 0; i < 60 && !hit; i++) {
    stepWorld(world);
    hit = world.events.find((e) => e.type === 'hit');
    upper.airTime = 0.2;
  }
  assert.ok(hit, 'no hit event');
  assert.equal(hit.upper, -1);
});

test('after the flag the winner burns out and everyone else stops', () => {
  const world = createWorld({ carCount: 3, laps: 1, seed: 2, brainFactory: () => fixed(0, 1) });
  world.time = RULES.countdown;
  world.phase = 'racing';
  seconds(world, 2);
  const [a, b] = world.cars;
  a.progress = world.track.length + 1;
  stepWorld(world);
  assert.equal(world.phase, 'finished');
  assert.equal(world.winner, a.id);
  const score = a.score;
  seconds(world, 8);
  assert.equal(a.burningOut, true);
  assert.equal(b.burningOut, false);
  assert.ok(speedOf(b) < 0.1, `a loser still rolling at ${speedOf(b)}`);
  assert.ok(Math.abs(a.input.steer) > 0.5, 'the winner is on lock');
  assert.ok(a.input.throttle > 0.5);
  assert.equal(a.score, score);
});

test('a winner boxed in by a wall backs out and keeps going', () => {
  const world = createWorld({
    carCount: 2,
    spawnOverride: (i) => (i === 0 ? { x: -70, z: -28.5, tx: 0, tz: -1, s: 34 } : { x: 60, z: -22, tx: 1, tz: 0, s: 134 }),
    brainFactory: () => fixed(0, 0),
  });
  world.phase = 'finished';
  world.winner = 0;
  world.flagTime = -10;
  world.time = RULES.countdown;
  const car = world.cars[0];
  let backed = false, drove = false;
  seconds(world, 6, () => {
    backed = backed || car.input.reverse > 0.5;
    drove = drove || (backed && car.gear >= 0 && car.input.throttle > 0.5);
  });
  assert.equal(backed, true);
  assert.equal(drove, true, 'back in drive and on the throttle');
  assert.ok(car.vx * car.R[0] + car.vz * car.R[6] > -3, 'not running away backwards');
});

test('last car running wins even if a wreck went further', () => {
  const world = createWorld({ carCount: 2, brainFactory: () => fixed(0, 0, 1) });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const [a, b] = world.cars;
  a.progress = 50; b.progress = 500;
  b.health = 0;
  stepWorld(world);
  assert.equal(world.phase, 'finished');
  assert.equal(world.winner, a.id);
});

test('a wreck left at the flag is still towed afterwards', () => {
  const world = createWorld({ carCount: 3, laps: 1, brainFactory: () => fixed(0, 0, 1) });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const [a, b] = world.cars;
  b.health = 0;
  stepWorld(world);
  a.progress = world.track.length + 1;
  stepWorld(world);
  assert.equal(world.phase, 'finished');
  assert.equal(b.towed, false);
  seconds(world, RULES.wreckTowSeconds + 0.5);
  assert.equal(b.towed, true);
});

test('running order follows race distance', () => {
  const world = createWorld({ carCount: 3, brainFactory: () => fixed(0, 0, 1) });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const [a, b, c] = world.cars;
  a.progress = 10; b.progress = 30; c.progress = 20;
  world.step = 0;
  stepWorld(world);
  assert.deepEqual([b.racePos, c.racePos, a.racePos], [0, 1, 2]);
});

test('nothing scores or breaks after the flag', () => {
  const world = createWorld({
    carCount: 2,
    spawnOverride: (i) => (i === 0 ? { x: -70, z: -30, tx: 0, tz: 1, s: 34 } : { x: -70, z: -22, tx: 1, tz: 0, s: 34 }),
    brainFactory: () => fixed(0, 0),
  });
  world.phase = 'finished';
  world.time = RULES.countdown + 1;
  const [a, b] = world.cars;
  a.vz = 20;
  seconds(world, 1);
  assert.equal(a.score, 0);
  assert.equal(b.health, 1);
});

test('losing a second wheel is survivable, losing a third is not', () => {
  const world = createWorld({
    carCount: 2,
    spawnOverride: (i) => ({ x: i * 40, z: 0, tx: 1, tz: 0, s: 0 }),
    brainFactory: () => fixed(0, 0),
  });
  world.phase = 'racing';
  world.time = RULES.countdown + 1;
  const car = world.cars[0];
  car.wheels[2].attached = false;
  car.wheels[3].attached = false;
  car.wheels[0].hp = 0.001;
  stepWorld(world);
  assert.ok(car.alive, 'two wheels lost, still running');
  applyDamage(world, car, 0.2, 'front', car.px + car.R[0] * 1.45 - car.R[2] * 0.86, car.pz + car.R[6] * 1.45 - car.R[8] * 0.86);
  assert.equal(car.wheels.filter((w) => w.attached).length, 1);
  assert.equal(car.alive, false);
});

test('every grid slot crosses the same line to complete a lap', () => {
  const world = createWorld({ seed: 5 });
  const L = world.track.length;
  for (const car of world.cars) {
    const toLine = (((FINISH_LINE_S - car.trackS) % L) + L) % L;
    assert.ok(Math.abs(car.progress + toLine - L) < 1e-6, `${car.name} ${car.progress} ${toLine}`);
    assert.ok(car.progress > 0 && car.laps === 0, 'the grid sits past the line, with no lap credited');
  }
});

test('boxes separated only by an edge axis do not collide', () => {
  const world = createWorld({ carCount: 2, spawnOverride: (i) => ({ x: 0, z: i * 10, tx: 1, tz: 0, s: 0 }) });
  const [a, b] = world.cars;
  const set = (car, q, x, y, z) => {
    const n = Math.hypot(...q);
    [car.qw, car.qx, car.qy, car.qz] = q.map((v) => v / n);
    Object.assign(car, { px: x, py: y, pz: z, vx: 0, vy: 0, vz: 0 });
    quatToMatrix(car.qw, car.qx, car.qy, car.qz, car.R);
  };
  // Scan for a pose where every face axis overlaps but a cross axis separates,
  // then require the narrow phase to report no contact for it.
  let tested = 0;
  const rng = createRng(11);
  for (let i = 0; i < 4000 && tested < 25; i++) {
    set(a, [rng() - 0.5, rng() - 0.5, rng() - 0.5, rng() - 0.5], 0, 5, 0);
    set(b, [rng() - 0.5, rng() - 0.5, rng() - 0.5, rng() - 0.5], rng.range(-3, 3), 5 + rng.range(-2, 2), rng.range(-3, 3));
    if (!separatedOnlyByEdgeAxis(a, b)) continue;
    tested++;
    const before = [a.px, a.py, a.pz, b.px, b.py, b.pz];
    let hit = false;
    collideCars(a, b, () => { hit = true; });
    assert.equal(hit, false);
    assert.deepEqual([a.px, a.py, a.pz, b.px, b.py, b.pz], before, 'separated boxes must not be pushed');
  }
  assert.ok(tested >= 5, `found only ${tested} qualifying poses`);
});

test('observation vector has a stable layout and only finite, clamped values', () => {
  const world = createWorld({ seed: 3, brainFactory: () => testDriver() });
  seconds(world, 8);
  for (const obs of world.obs) {
    assert.equal(obs.length, OBS.size);
    for (const v of obs) assert.ok(Number.isFinite(v) && Math.abs(v) <= 1.5);
  }
});
