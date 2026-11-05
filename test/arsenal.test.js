import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, weaponHit } from '../src/sim/world.js';
import { collectCrates, fireWeapon, WEAPON, WEAPONS } from '../src/sim/arsenal.js';
import { ARSENAL, CAR, PHYSICS_HZ, RULES } from '../src/sim/config.js';
import { fillObservation, OBS } from '../src/sim/sensors.js';
import { createBrain } from '../src/ai/index.js';
import { gunner } from './helpers/gunner.js';

const STRAIGHT = 40; // well clear of everything on the main straight
const still = () => ({ act: () => [0, 0, 1, 0, 0, 0] });

// Cars placed on the road by route metres and lateral offset, parked and racing.
function arena(spots, brain = still) {
  const world = createWorld({
    carCount: spots.length,
    spawnOverride: (i, track) => {
      const [s, side = 0] = spots[i];
      const p = track.sample(s, { x: 0, z: 0, tx: 0, tz: 0, curvature: 0 });
      return { x: p.x - p.tz * side, z: p.z + p.tx * side, tx: p.tx, tz: p.tz, s };
    },
    brainFactory: brain,
  });
  world.time = RULES.countdown;
  world.phase = 'racing';
  for (const crate of world.arsenal.crates) crate.respawn = 999;
  return world;
}

const seconds = (world, s, each) => {
  for (let i = 0, n = Math.round(s * PHYSICS_HZ); i < n; i++) {
    stepWorld(world);
    if (each) each(world);
  }
};

function arm(world, car, key) {
  car.weapon = WEAPON[key];
  car.fireLock = 0;
  return fireWeapon(world, car);
}

const speed = (c) => Math.hypot(c.vx, c.vz);
const events = (world, type) => world.events.filter((e) => e.type === type);

test('crates hand over one weapon, go away, and come back', () => {
  const world = createWorld({ carCount: 1, spawnOverride: (i, t) => {
    const c = t.crateSpots[0].crates[1];
    const p = t.sample(t.crateSpots[0].s, { x: 0, z: 0, tx: 0, tz: 0, curvature: 0 });
    return { x: c.x, z: c.z, tx: p.tx, tz: p.tz, s: t.crateSpots[0].s };
  }, brainFactory: still });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const car = world.cars[0];
  const crate = world.arsenal.crates.find((c) => Math.hypot(c.x - car.px, c.z - car.pz) < 1);
  collectCrates(world, car);
  assert.ok(car.weapon > 0);
  assert.ok(crate.respawn > 0);
  const held = car.weapon;
  crate.respawn = 0;
  collectCrates(world, car);
  assert.equal(car.weapon, held, 'one weapon at a time');
  assert.equal(crate.respawn, 0, 'a full car leaves the crate alone');
  world.arsenal.crates[0].respawn = 0.01;
  seconds(world, 0.1);
  assert.ok(world.arsenal.crates[0].respawn <= 0);
});

test('catch-up weapons never turn up in the front half', () => {
  const world = createWorld({ carCount: 12, seed: 4, brainFactory: still });
  world.time = RULES.countdown;
  world.phase = 'racing';
  const car = world.cars[0];
  const crate = world.arsenal.crates[0];
  const draw = (pos) => {
    const seen = new Set();
    car.racePos = pos;
    for (let i = 0; i < 1500; i++) {
      car.px = crate.x; car.pz = crate.z; car.weapon = 0; crate.respawn = 0;
      collectCrates(world, car);
      seen.add(WEAPONS[car.weapon].key);
    }
    return seen;
  };
  for (const pos of [0, 1, 3, 5]) {
    const seen = draw(pos);
    assert.ok(!seen.has('backhander') && !seen.has('repoHook'), `P${pos + 1} drew a catch-up weapon`);
  }
  const last = draw(11);
  assert.ok(last.has('backhander') && last.has('repoHook'));
});

test('a blast on the ground leaves a car high overhead alone', () => {
  const world = arena([[STRAIGHT], [STRAIGHT + 30]]);
  const [me, them] = world.cars;
  me.progress = 0; them.progress = 30;
  them.py += 9;
  world.arsenal.drops.push({ id: 5, owner: me.id, weapon: WEAPON.grandPiano, target: them.id, x: them.px, z: them.pz, y: world.track.heightAt(them.px, them.pz), t: 0.01, fall: 1.7 });
  seconds(world, 0.05);
  assert.equal(them.health, 1);
});

test('a car knocked out mid-whirl stops cutting', () => {
  const world = arena([[STRAIGHT], [STRAIGHT + 3, 2]]);
  const [me, them] = world.cars;
  arm(world, me, 'threshingWhirl');
  seconds(world, 0.1);
  const health = them.health;
  me.health = 0;
  seconds(world, 0.05);
  assert.equal(me.alive, false);
  assert.equal(me.whirl, null);
  seconds(world, 0.6);
  assert.equal(them.health, health);
});

test('oil still reads as oil during a whirl', () => {
  const world = arena([[STRAIGHT]]);
  const car = world.cars[0];
  world.arsenal.hazards.push({ id: 1, kind: 'oil', x: car.px, z: car.pz, y: 0, radius: 9, life: 9, maxLife: 9, arm: 0, owner: 0, weapon: WEAPON.oilSlick });
  arm(world, car, 'threshingWhirl');
  stepWorld(world);
  const obs = new Float32Array(OBS.size);
  fillObservation(world, car, obs);
  assert.equal(obs[OBS.index['arms.oiled']], 1);
  assert.equal(obs[OBS.index['arms.whirling']], 1);
});

test('Bedsprings do not stack into orbit', () => {
  const world = arena([[STRAIGHT]]);
  const car = world.cars[0];
  for (let i = 0; i < 6; i++) {
    world.arsenal.hazards.push({ id: i + 1, kind: 'spring', x: car.px, z: car.pz, y: car.py - 0.6, radius: 3, life: 9, maxLife: 9, arm: 0, owner: 0, weapon: WEAPON.bedspring });
  }
  seconds(world, 0.1);
  assert.ok(car.vy <= ARSENAL.spring.launch + 0.5, `vy ${car.vy}`);
});

test('Grand Piano follows the road round a corner', () => {
  const world = arena([[150], [172]]);
  const [me, them] = world.cars;
  me.progress = 0; them.progress = 22;
  them.vx = them.R[0] * 22; them.vz = them.R[6] * 22;
  arm(world, me, 'grandPiano');
  const [drop] = world.arsenal.drops;
  assert.ok(world.track.sdfAt(drop.x, drop.z) > 2, 'the aim point is on the road, past the bend');
  assert.ok(Math.hypot(drop.x - them.px, drop.z - them.pz) > 15);
});

test('a fresh pickup cannot be fired instantly', () => {
  const world = arena([[STRAIGHT]]);
  const car = world.cars[0];
  car.weapon = WEAPON.barnBurner;
  car.fireLock = ARSENAL.fireLock;
  assert.equal(fireWeapon(world, car), false);
  assert.equal(car.weapon, WEAPON.barnBurner);
});

test('the leader never finds the race-winning weapons in a crate', () => {
  const world = arena([[STRAIGHT], [STRAIGHT - 30]]);
  const car = world.cars[0];
  car.racePos = 0;
  const seen = new Set();
  const crate = world.arsenal.crates[0];
  for (let i = 0; i < 400; i++) {
    car.px = crate.x; car.pz = crate.z; car.weapon = 0; crate.respawn = 0;
    collectCrates(world, car);
    seen.add(WEAPONS[car.weapon].key);
  }
  for (const key of ['backhander', 'repoHook']) assert.ok(!seen.has(key), `leader got ${key}`);
  assert.ok(seen.size >= 8, `only ${seen.size} kinds`);
});

test('Barn Burner flies straight, blows up on a car, and shoves it', () => {
  const world = arena([[STRAIGHT], [STRAIGHT + 30]]);
  const [me, them] = world.cars;
  arm(world, me, 'barnBurner');
  assert.equal(me.weapon, 0);
  let shoved = 0;
  seconds(world, 1, () => { shoved = Math.max(shoved, speed(them)); });
  assert.equal(events(world, 'blast').length, 1);
  assert.ok(them.health < 1);
  assert.ok(shoved > 2, `speed ${shoved}`);
  assert.equal(me.health, 1, 'too far away to hurt its owner');
  assert.equal(world.arsenal.shots.length, 0);
});

test('Barn Burner blows up on a wall rather than leaving the track', () => {
  const world = arena([[STRAIGHT]]);
  arm(world, world.cars[0], 'barnBurner');
  const shot = world.arsenal.shots[0];
  shot.vx = 0; shot.vz = 60;
  seconds(world, 1);
  assert.equal(world.arsenal.shots.length, 0);
  assert.ok(world.track.sdfAt(shot.x, shot.z) < 1);
});

test('Grudge Seeker goes after whoever hit you last, not the nearest car', () => {
  const world = arena([[STRAIGHT], [STRAIGHT + 12], [STRAIGHT + 60, 4]]);
  const [me, near, grudge] = world.cars;
  me.lastHitter = grudge.id;
  arm(world, me, 'grudgeSeeker');
  assert.equal(world.arsenal.shots[0].target, grudge.id);
  seconds(world, 3.5);
  assert.ok(grudge.health < 1);
  assert.equal(near.health, 1);
});

test('Grudge Seeker turns to chase a car it was not pointing at', () => {
  const world = arena([[STRAIGHT + 70], [STRAIGHT + 20, 6]]);
  const [me, them] = world.cars;
  me.lastHitter = them.id;
  arm(world, me, 'grudgeSeeker'); // the target is behind it
  seconds(world, 4.5);
  assert.ok(them.health < 1, 'it should come round and hit');
});

test('Welcome Mat waits, arms, and launches whoever drives over it', () => {
  const world = arena([[STRAIGHT + 30], [STRAIGHT]]);
  const [me, them] = world.cars;
  arm(world, me, 'welcomeMat');
  const [mine] = world.arsenal.hazards;
  assert.equal(mine.kind, 'mine');
  them.px = mine.x; them.pz = mine.z;
  seconds(world, 0.2);
  assert.equal(world.arsenal.hazards.length, 1, 'not armed yet');
  seconds(world, ARSENAL.mine.arm);
  assert.equal(world.arsenal.hazards.length, 0);
  assert.ok(them.health < 1);
  assert.ok(them.vy > 3 || them.py > 1.5, 'launched');
});

test('Oil Slick takes the grip away and a car slides straight on', () => {
  const world = arena([[STRAIGHT]], () => ({ act: () => [1, 0, 0, 0, 0, 0] }));
  const car = world.cars[0];
  car.vx = car.R[0] * 20; car.vz = car.R[6] * 20;
  world.arsenal.hazards.push({ id: 1, kind: 'oil', x: car.px + 10, z: car.pz, y: 0, radius: 40, life: 9, maxLife: 9, arm: 0, owner: 0, weapon: WEAPON.oilSlick });
  stepWorld(world);
  assert.equal(car.gripScale, ARSENAL.oil.grip);
  const dry = arena([[STRAIGHT]], () => ({ act: () => [1, 0, 0, 0, 0, 0] }));
  const other = dry.cars[0];
  other.vx = other.R[0] * 20; other.vz = other.R[6] * 20;
  seconds(world, 0.5);
  seconds(dry, 0.5);
  assert.ok(Math.abs(car.vz) < Math.abs(other.vz) * 0.6, `oiled ${car.vz}, dry ${other.vz}`);
});

test('smoke hides rivals from the bots, from inside and through the cloud', () => {
  const world = arena([[STRAIGHT], [STRAIGHT + 40]]);
  const [me, them] = world.cars;
  const obs = new Float32Array(OBS.size);
  fillObservation(world, me, obs);
  assert.equal(obs[OBS.index['opp0.solid']], 1);
  world.arsenal.hazards.push({ id: 1, kind: 'smoke', x: (me.px + them.px) / 2, z: (me.pz + them.pz) / 2, y: 0, radius: 8, life: 9, maxLife: 9, arm: 0, owner: 1, weapon: WEAPON.smokeBomb });
  fillObservation(world, me, obs);
  assert.equal(obs[OBS.index['opp0.solid']], 0, 'hidden through the cloud');
  assert.equal(obs[OBS.index['arms.aheadRange']], 1);
  assert.equal(obs[OBS.index['arms.blinded']], 0);
  world.arsenal.hazards[0].x = me.px; world.arsenal.hazards[0].z = me.pz;
  fillObservation(world, me, obs);
  assert.equal(obs[OBS.index['arms.blinded']], 1);
});

test('Threshing Whirl spins exactly back round, keeps going, and cuts what is close', () => {
  const world = arena([[STRAIGHT], [STRAIGHT + 3.2, 3]], () => ({ act: () => [0, 0, 0, 0, 0, 0] }));
  const [me, them] = world.cars;
  me.vx = me.R[0] * 22; me.vz = me.R[6] * 22;
  for (const w of me.wheels) w.omega = 22 / CAR.wheelRadius;
  const nose = [me.R[0], me.R[6]];
  arm(world, me, 'threshingWhirl');
  let spun = 0;
  seconds(world, ARSENAL.whirl.seconds + 0.02, () => { spun += me.wy / PHYSICS_HZ; });
  assert.ok(Math.abs(Math.abs(spun) - ARSENAL.whirl.turns * 2 * Math.PI) < 0.2, `spun ${spun}`);
  assert.equal(me.whirl, null);
  assert.ok(nose[0] * me.R[0] + nose[1] * me.R[6] > 0.95, 'facing the way it started');
  assert.ok(speed(me) > 10, `carried on at ${speed(me)}`);
  assert.ok(them.health < 1);
});

test('Repo Hook catches a car ahead and reels the two together', () => {
  const world = arena([[STRAIGHT], [STRAIGHT + 36]], () => ({ act: () => [0, 0, 0, 0, 0, 0] }));
  const [me, them] = world.cars;
  const gap = () => Math.hypot(them.px - me.px, them.pz - me.pz);
  const before = gap();
  arm(world, me, 'repoHook');
  seconds(world, 1.1);
  assert.equal(events(world, 'hooked').length, 1);
  assert.ok(gap() < before - 8, `gap ${before} -> ${gap()}`);
  seconds(world, 2);
  assert.equal(world.arsenal.tethers.length, 0, 'the line lets go');
});

test('Repo Hook misses cleanly when nobody is there', () => {
  const world = arena([[STRAIGHT]]);
  arm(world, world.cars[0], 'repoHook');
  seconds(world, 1.2);
  assert.equal(world.arsenal.shots.length, 0);
  assert.equal(world.arsenal.tethers.length, 0);
});

test('Bedspring fires the next car into the sky without hurting it', () => {
  const world = arena([[STRAIGHT + 30], [STRAIGHT]]);
  const [me, them] = world.cars;
  arm(world, me, 'bedspring');
  const [pad] = world.arsenal.hazards;
  seconds(world, ARSENAL.spring.arm + 0.05);
  them.px = pad.x; them.pz = pad.z;
  let peak = 0;
  seconds(world, 2, () => { peak = Math.max(peak, them.py); });
  assert.ok(peak > 5, `peak ${peak}`);
  assert.equal(them.health, 1);
  assert.equal(world.arsenal.hazards.length, 0, 'one use');
});

test('the Backhander runs the road, slaps what it touches, and finishes on the leader', () => {
  const world = arena([[STRAIGHT], [STRAIGHT + 40], [STRAIGHT + 150]]);
  const [me, between, leader] = world.cars;
  me.progress = 0; between.progress = 40; leader.progress = 150;
  arm(world, me, 'backhander');
  assert.equal(world.arsenal.shots[0].target, leader.id);
  seconds(world, 5);
  assert.equal(world.arsenal.shots.length, 0, 'spent on the leader');
  assert.deepEqual(events(world, 'slapped').map((e) => [e.victim, e.final]), [[between.id, false], [leader.id, true]]);
  assert.ok(between.health < 1);
  assert.ok(leader.health < between.health, 'the last one is the big one');
});

test('a slap lands after the windup and sends the car down the road', () => {
  const world = arena([[STRAIGHT], [STRAIGHT + 20, 3]], () => ({ act: () => [0, 0, 0, 0, 0, 0] }));
  const [me, them] = world.cars;
  me.progress = 0; them.progress = 20;
  arm(world, me, 'backhander');
  const swing = () => world.arsenal.shots[0]?.swing ?? -1;
  while (swing() < 0) stepWorld(world);
  assert.equal(them.health, 1, 'nothing yet: the hand is only drawing back');
  const before = speed(them);
  while (them.health === 1 && swing() < ARSENAL.hand.windup + 0.02) stepWorld(world);
  assert.ok(swing() >= ARSENAL.hand.windup, 'palm lands at the end of the windup');
  assert.ok(them.health < 1);
  assert.ok(speed(them) > before + ARSENAL.hand.drive * 0.7, `shoved to ${speed(them)}`);
});

test('one swing slaps every car under the palm', () => {
  const world = arena([[STRAIGHT], [STRAIGHT + 20, 1.6], [STRAIGHT + 21, -1.6], [STRAIGHT + 300]]);
  const [me, a, b] = world.cars;
  me.progress = 0; a.progress = 20; b.progress = 21; world.cars[3].progress = 300;
  arm(world, me, 'backhander');
  seconds(world, 1.2);
  const hits = new Set(events(world, 'slapped').map((e) => e.victim));
  assert.ok(hits.has(a.id) && hits.has(b.id), [...hits].join());
});

test('a Backhander whose target is gone keeps slapping until it runs out', () => {
  const world = arena([[STRAIGHT], [STRAIGHT + 20], [STRAIGHT + 150]]);
  const [me, between, leader] = world.cars;
  me.progress = 0; between.progress = 20; leader.progress = 150;
  arm(world, me, 'backhander');
  leader.alive = false;
  leader.towed = true;
  seconds(world, 2);
  assert.deepEqual(events(world, 'slapped').map((e) => e.victim), [between.id]);
  assert.equal(world.arsenal.shots.length, 1, 'still going');
  seconds(world, ARSENAL.hand.life);
  assert.equal(world.arsenal.shots.length, 0);
});

test('Grand Piano warns first, then lands where the target is going', () => {
  const world = arena([[STRAIGHT], [STRAIGHT + 40]], () => ({ act: () => [0, 0, 0, 0, 0, 0] }));
  const [me, them] = world.cars;
  me.progress = 0; them.progress = 40;
  them.vx = them.R[0] * 15; them.vz = them.R[6] * 15;
  arm(world, me, 'grandPiano');
  const [drop] = world.arsenal.drops;
  assert.ok(Math.hypot(drop.x - them.px, drop.z - them.pz) > 10, 'aimed ahead of a moving target');
  seconds(world, ARSENAL.piano.fall * 0.5);
  assert.equal(them.health, 1, 'still falling');
  seconds(world, ARSENAL.piano.fall * 0.6);
  assert.equal(events(world, 'pianoLands').length, 1);
  assert.ok(them.health < 1 - ARSENAL.piano.damage * 0.3, `health ${them.health}`);
});

test('Foghorn scatters everyone, swats rockets, and leaves its owner alone', () => {
  const world = arena([[STRAIGHT], [STRAIGHT + 8, 3]]);
  const [me, them] = world.cars;
  world.arsenal.shots.push({ kind: 'rocket', id: 9, owner: them.id, weapon: 1, x: me.px + 8, y: 1, z: me.pz, vx: -60, vz: 0, life: 2 });
  stepWorld(world);
  const vy = me.vy, vx = me.vx;
  arm(world, me, 'foghorn');
  assert.equal(world.arsenal.shots.length, 0, 'the rocket is gone');
  assert.ok(speed(them) > 5, `speed ${speed(them)}`);
  assert.equal(them.health, 1);
  assert.ok(Math.abs(me.vx - vx) < 0.01 && Math.abs(me.vy - vy) < 0.01, 'no push on the owner');
});

test('nothing in flight survives the flag, and weapons do no harm after it', () => {
  const world = arena([[STRAIGHT], [STRAIGHT + 200]]);
  const [me, them] = world.cars;
  world.laps = 1;
  arm(world, me, 'barnBurner');
  arm(world, me, 'grudgeSeeker');
  me.weapon = WEAPON.grandPiano; me.fireLock = 0;
  fireWeapon(world, me);
  me.progress = world.track.length + 1;
  stepWorld(world);
  assert.equal(world.phase, 'finished');
  assert.equal(world.arsenal.shots.length + world.arsenal.drops.length, 0);
  const health = them.health;
  seconds(world, 3);
  assert.equal(them.health, health);
});

test('a race full of weapons stays finite and repeats exactly from its seed', () => {
  const run = () => {
    const world = createWorld({ seed: 11, brainFactory: (c) => gunner(createBrain(c)) });
    seconds(world, 40);
    return world;
  };
  const a = run(), b = run();
  for (const c of a.cars) {
    for (const v of [c.px, c.py, c.pz, c.vx, c.vy, c.vz, c.wx, c.wy, c.wz, c.qw]) assert.ok(Number.isFinite(v));
    assert.ok(a.track.sdfAt(c.px, c.pz) > -2, `${c.name} left the track`);
  }
  assert.deepEqual(a.cars.map((c) => [c.px, c.pz, c.health, c.weapon]), b.cars.map((c) => [c.px, c.pz, c.health, c.weapon]));
  for (const o of a.obs) for (const v of o) assert.ok(Number.isFinite(v) && Math.abs(v) <= 1.5);
});

test('Grudge Seeker comes about for a target dead astern', () => {
  const world = arena([[110], [60]]);
  const [me, them] = world.cars;
  me.lastHitter = them.id;
  me.lastHitterTime = world.time;
  const p = world.track.sample(110, { x: 0, z: 0, tx: 0, tz: 0, curvature: 0 });
  Object.assign(them, { px: p.x - p.tx * 50, pz: p.z - p.tz * 50 });
  arm(world, me, 'grudgeSeeker');
  seconds(world, ARSENAL.seeker.life);
  assert.ok(them.health < 1, `health ${them.health}`);
});

test('the first of two blows in one step keeps the knockout', () => {
  const world = arena([[STRAIGHT], [STRAIGHT + 20], [STRAIGHT + 40]]);
  const [first, second, victim] = world.cars;
  victim.health = 0.05;
  weaponHit(world, first, victim, 0.24, victim.px, victim.pz, 0.5);
  weaponHit(world, second, victim, 0.24, victim.px, victim.pz, 0.5);
  stepWorld(world);
  assert.equal(victim.alive, false);
  assert.equal(events(world, 'ko')[0].killer, first.id);
  assert.equal(second.damageDealt, 0);
});

test('a whirl does not reach a car in the air overhead', () => {
  const world = arena([[STRAIGHT], [STRAIGHT]]);
  const [me, them] = world.cars;
  them.py += 9;
  arm(world, me, 'threshingWhirl');
  seconds(world, 0.3);
  assert.equal(them.health, 1);
});

test('the hand passes under a car high in the air', () => {
  const world = arena([[STRAIGHT], [STRAIGHT + 16]]);
  const [me, them] = world.cars;
  const ground = them.py;
  arm(world, me, 'backhander');
  seconds(world, 1, () => {
    them.py = ground + ARSENAL.hand.height + 3;
    them.vy = 0;
  });
  assert.equal(them.health, 1);
  assert.equal(events(world, 'slapped').length, 0);
});

test('a crate is out of reach from high above it', () => {
  const world = arena([[STRAIGHT]]);
  const car = world.cars[0];
  const crate = world.arsenal.crates[0];
  crate.respawn = 0;
  Object.assign(car, { px: crate.x, pz: crate.z, py: crate.y + 20 });
  collectCrates(world, car);
  assert.equal(car.weapon, 0);
  assert.equal(crate.respawn, 0);
  car.py = crate.y;
  collectCrates(world, car);
  assert.notEqual(car.weapon, 0);
});
