// Everything the County Fair Safety Board banned. Crates sit on the road; a car
// holds one weapon at a time and the brain decides when to use it.
//
// Nothing here steers a car directly: weapons push, launch, oil and blind, and
// the physics does the rest. All randomness comes from the world's seeded rng.

import { ARSENAL as A } from './config.js';
import { clamp } from './math.js';
import { emit, weaponHit } from './world.js';

// In the order the sensors report them. `front` and `back` weight how likely a
// crate is to hold it for the leader and for last place. `backHalf` weapons are
// catch-up tools, and cars in the front half never find them.
export const WEAPONS = [
  null,
  { key: 'barnBurner', name: 'Barn Burner', front: 3, back: 3 },
  { key: 'grudgeSeeker', name: 'Grudge Seeker', front: 2, back: 4 },
  { key: 'welcomeMat', name: 'Welcome Mat', front: 5, back: 1 },
  { key: 'oilSlick', name: 'Oil Slick', front: 5, back: 1 },
  { key: 'smokeBomb', name: 'Smoke Bomb', front: 4, back: 2 },
  { key: 'threshingWhirl', name: 'Threshing Whirl', front: 2, back: 3 },
  { key: 'repoHook', name: 'Repo Hook', front: 2, back: 4, backHalf: true },
  { key: 'bedspring', name: 'Bedspring', front: 4, back: 1 },
  { key: 'backhander', name: 'Backhander', front: 2, back: 4, backHalf: true },
  { key: 'grandPiano', name: 'Grand Piano', front: 1, back: 4 },
  { key: 'foghorn', name: 'Foghorn', front: 3, back: 2 },
];

export const WEAPON = Object.fromEntries(WEAPONS.flatMap((w, id) => (w ? [[w.key, id]] : [])));

export function createArsenal(track) {
  let id = 0;
  const crates = track.crateSpots.flatMap((spot) => spot.crates.map((c) => ({
    id: id++, x: c.x, z: c.z, y: track.heightAt(c.x, c.z) + 1.4, s: spot.s, respawn: 0,
  })));
  return { crates, shots: [], hazards: [], drops: [], tethers: [], nextId: 1 };
}

const heading = (car) => {
  const l = Math.hypot(car.R[0], car.R[6]) || 1;
  return [car.R[0] / l, car.R[6] / l];
};

const running = (world) => world.cars.filter((c) => c.alive);

// Nearest living rival within a forward cone, or null.
function rivalAhead(world, car, range, coneCos) {
  const [fx, fz] = heading(car);
  let best = null, bestD = range;
  for (const o of running(world)) {
    if (o === car) continue;
    const dx = o.px - car.px, dz = o.pz - car.pz, d = Math.hypot(dx, dz) || 1;
    if (d < bestD && (dx * fx + dz * fz) / d > coneCos) { best = o; bestD = d; }
  }
  return best;
}

// Whoever hit you last, if they're still running. Failing that, the car in front.
function grudgeTarget(world, car) {
  const held = world.cars[car.lastHitter];
  if (held && held.alive && held !== car) return held;
  return rivalAhead(world, car, A.seeker.reach, -0.2) ?? nextInRace(world, car);
}

function nextInRace(world, car) {
  let best = null, bestGap = Infinity;
  for (const o of running(world)) {
    const gap = o.progress - car.progress;
    if (o !== car && gap > 0 && gap < bestGap) { best = o; bestGap = gap; }
  }
  return best ?? running(world).find((o) => o !== car) ?? null;
}

function raceLeader(world, except) {
  let best = null;
  for (const o of running(world)) if (o !== except && (!best || o.progress > best.progress)) best = o;
  return best;
}

export function shove(car, dvx, dvy, dvz) {
  car.vx += dvx;
  car.vy += dvy;
  car.vz += dvz;
}

// A blast: everything near it is pushed away and lifted, closer means harder.
function blast(world, x, y, z, spec, owner, weapon) {
  for (const car of world.cars) {
    if (car.towed) continue;
    const dx = car.px - x, dz = car.pz - z;
    const flat = Math.hypot(dx, dz);
    const d = Math.hypot(flat, car.py - y);
    if (d > spec.radius) continue;
    const f = 1 - d / spec.radius;
    const nx = flat > 0.01 ? dx / flat : 0, nz = flat > 0.01 ? dz / flat : 0;
    shove(car, nx * spec.push * f, spec.lift * f, nz * spec.push * f);
    car.wy += (world.rng() - 0.5) * spec.spin * f;
    if (spec.damage) weaponHit(world, world.cars[owner], car, spec.damage * f * (car.id === owner ? 0.4 : 1), x, z, f);
  }
  emit(world, { type: 'blast', weapon, owner, x, y, z, radius: spec.radius });
}

function pickWeapon(world, car) {
  const back = world.cars.length > 1 ? car.racePos / (world.cars.length - 1) : 0.5;
  let total = 0;
  const weights = WEAPONS.map((w) => {
    const weight = !w || (w.backHalf && back < 0.5) ? 0 : w.front + (w.back - w.front) * back;
    total += weight;
    return weight;
  });
  let roll = world.rng() * total;
  for (let i = 1; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return WEAPON.barnBurner;
}

export function collectCrates(world, car) {
  if (car.weapon || !car.alive) return;
  for (const crate of world.arsenal.crates) {
    if (crate.respawn > 0) continue;
    if ((crate.x - car.px) ** 2 + (crate.z - car.pz) ** 2 > A.crateReach ** 2) continue;
    if (Math.abs(crate.y - car.py) > A.crateHeight) continue; // Sailing over it doesn't count.
    crate.respawn = A.crateRespawn;
    car.weapon = pickWeapon(world, car);
    car.fireLock = A.fireLock;
    emit(world, { type: 'pickup', car: car.id, weapon: car.weapon, crate: crate.id, x: crate.x, y: crate.y, z: crate.z });
    return;
  }
}

const dropBehind = (car, reach) => {
  const [fx, fz] = heading(car);
  return [car.px - fx * reach, car.pz - fz * reach];
};

function addHazard(world, kind, x, z, spec, owner, weapon) {
  const a = world.arsenal;
  a.hazards.push({
    id: a.nextId++, kind, x, z, y: world.track.heightAt(x, z), radius: spec.radius,
    life: spec.life, maxLife: spec.life, arm: spec.arm ?? 0, owner, weapon,
  });
}

function addShot(world, shot) {
  shot.id = world.arsenal.nextId++;
  world.arsenal.shots.push(shot);
  return shot;
}

export function fireWeapon(world, car) {
  const weapon = car.weapon;
  if (!weapon || !car.alive || car.fireLock > 0 || car.whirl) return false;
  const a = world.arsenal, track = world.track;
  const [fx, fz] = heading(car);
  const nose = 3.4;
  const startX = car.px + fx * nose, startZ = car.pz + fz * nose;
  const startY = car.py + 0.5;
  let target = null;
  switch (weapon) {
    case WEAPON.barnBurner:
      addShot(world, {
        kind: 'rocket', owner: car.id, weapon, x: startX, y: startY, z: startZ,
        vx: fx * A.rocket.speed + car.vx, vz: fz * A.rocket.speed + car.vz, life: A.rocket.life,
      });
      break;
    case WEAPON.grudgeSeeker:
      target = grudgeTarget(world, car);
      addShot(world, {
        kind: 'seeker', owner: car.id, weapon, target: target?.id ?? -1, x: startX, y: startY, z: startZ,
        dx: fx, dz: fz, speed: A.seeker.speed, age: 0, life: A.seeker.life,
      });
      break;
    case WEAPON.welcomeMat: {
      const [x, z] = dropBehind(car, 4.5);
      addHazard(world, 'mine', x, z, A.mine, car.id, weapon);
      break;
    }
    case WEAPON.oilSlick: {
      const [x, z] = dropBehind(car, 5);
      addHazard(world, 'oil', x, z, A.oil, car.id, weapon);
      break;
    }
    case WEAPON.smokeBomb: {
      const [x, z] = dropBehind(car, 2);
      addHazard(world, 'smoke', x, z, A.smoke, car.id, weapon);
      break;
    }
    case WEAPON.threshingWhirl:
      car.whirl = { t: 0, dir: world.rng() < 0.5 ? -1 : 1, nextCut: 0, cut: new Map() };
      break;
    case WEAPON.repoHook: {
      target = rivalAhead(world, car, A.hook.reach, 0.8);
      const aimX = target ? target.px + target.vx * 0.3 - startX : fx;
      const aimZ = target ? target.pz + target.vz * 0.3 - startZ : fz;
      const l = Math.hypot(aimX, aimZ) || 1;
      addShot(world, {
        kind: 'hook', owner: car.id, weapon, x: startX, y: startY, z: startZ,
        vx: (aimX / l) * A.hook.speed + car.vx, vz: (aimZ / l) * A.hook.speed + car.vz, life: A.hook.life,
      });
      break;
    }
    case WEAPON.bedspring: {
      const [x, z] = dropBehind(car, 4.5);
      addHazard(world, 'spring', x, z, A.spring, car.id, weapon);
      break;
    }
    case WEAPON.backhander:
      target = raceLeader(world, car);
      addShot(world, {
        kind: 'hand', owner: car.id, weapon, target: target?.id ?? -1, s: track.route(0, car.trackS + nose),
        offset: 0, x: startX, y: startY, z: startZ, dx: fx, dz: fz, life: A.hand.life, cut: new Map(),
        swing: -1, victim: -1, pace: 0, side: 1, spent: false,
      });
      break;
    case WEAPON.grandPiano: {
      target = nextInRace(world, car);
      if (target) {
        // Where the target will be, measured along the road so it works round corners.
        const here = track.sample(target.trackS, PT);
        const side = (target.px - here.x) * -here.tz + (target.pz - here.z) * here.tx;
        const ahead = track.sample(target.trackS + Math.hypot(target.vx, target.vz) * A.piano.fall * 0.92, PT);
        const x = ahead.x - ahead.tz * side, z = ahead.z + ahead.tx * side;
        a.drops.push({
          id: a.nextId++, owner: car.id, weapon, target: target.id, x, z,
          y: track.heightAt(x, z), t: A.piano.fall, fall: A.piano.fall,
        });
      }
      break;
    }
    case WEAPON.foghorn:
      a.shots = a.shots.filter((s) => s.owner === car.id || s.kind === 'hand'
        || Math.hypot(s.x - car.px, s.z - car.pz) > A.horn.radius);
      {
        // The horn stands at the centre of its own blast, so it lifts its owner
        // straight up and nowhere else. Cancel that.
        blast(world, car.px, car.py, car.pz, { ...A.horn, spin: 0, damage: 0 }, car.id, weapon);
        car.vy -= A.horn.lift;
      }
      break;
    default:
      break;
  }
  car.weapon = 0;
  emit(world, { type: 'fired', car: car.id, weapon, target: target?.id ?? -1, x: car.px, y: car.py, z: car.pz });
  return true;
}

function stepWhirl(world, car, dt) {
  const w = car.whirl;
  w.t += dt;
  // Negative yaw about +Y turns right.
  car.wy = -w.dir * (A.whirl.turns * 2 * Math.PI) / A.whirl.seconds;
  car.wx *= 0.9;
  car.wz *= 0.9;
  w.nextCut -= dt;
  if (w.nextCut <= 0) {
    w.nextCut = A.whirl.cutEvery;
    for (const o of world.cars) {
      if (o === car || o.towed || !o.alive) continue;
      const dx = o.px - car.px, dz = o.pz - car.pz, d = Math.hypot(dx, dz);
      if (d > A.whirl.reach || Math.abs(o.py - car.py) > A.whirl.height) continue;
      if ((w.cut.get(o.id) ?? -9) > world.time - A.whirl.rehit) continue;
      w.cut.set(o.id, world.time);
      const nx = dx / (d || 1), nz = dz / (d || 1);
      shove(o, nx * A.whirl.push, A.whirl.lift, nz * A.whirl.push);
      weaponHit(world, car, o, A.whirl.damage, o.px, o.pz, 0.6);
      emit(world, { type: 'cut', car: car.id, victim: o.id, x: o.px, y: o.py + 0.4, z: o.pz });
    }
  }
  if (w.t >= A.whirl.seconds) {
    car.whirl = null;
    car.wy = 0;
  }
}

function hitCar(world, shot, reach) {
  for (const car of world.cars) {
    if (car.towed || car.id === shot.owner) continue;
    if ((car.px - shot.x) ** 2 + (car.pz - shot.z) ** 2 < reach * reach && Math.abs(car.py - shot.y) < 2.6) return car;
  }
  return null;
}

// Returns false when the shot is spent.
function stepShot(world, shot, dt) {
  const track = world.track;
  shot.life -= dt;
  if (shot.kind === 'rocket') {
    shot.x += shot.vx * dt;
    shot.z += shot.vz * dt;
    shot.y = track.heightAt(shot.x, shot.z) + 1;
    if (hitCar(world, shot, A.rocket.hitReach) || track.sdfAt(shot.x, shot.z) < 0.2 || shot.life <= 0) {
      blast(world, shot.x, shot.y, shot.z, A.rocket, shot.owner, shot.weapon);
      return false;
    }
    return true;
  }
  if (shot.kind === 'seeker') {
    shot.age += dt;
    const target = world.cars[shot.target];
    if (target && !target.towed) {
      const wantX = target.px - shot.x, wantZ = target.pz - shot.z;
      const l = Math.hypot(wantX, wantZ) || 1;
      // Turn at a fixed rate. A target dead astern has no side to turn to, so pick one.
      const off = Math.atan2(shot.dx * wantZ - shot.dz * wantX, shot.dx * wantX + shot.dz * wantZ);
      const step = clamp(off, -A.seeker.turn * dt, A.seeker.turn * dt);
      const cos = Math.cos(step), sin = Math.sin(step), dx = shot.dx;
      shot.dx = dx * cos - shot.dz * sin;
      shot.dz = dx * sin + shot.dz * cos;
      // Up over the fences, then down on the target.
      const ground = track.heightAt(shot.x, shot.z);
      const wantY = l > A.seeker.dive ? ground + A.seeker.cruise : target.py + (l / A.seeker.dive) * A.seeker.cruise * 0.5;
      shot.y += (wantY - shot.y) * Math.min(1, dt * 9);
    }
    shot.x += shot.dx * shot.speed * dt;
    shot.z += shot.dz * shot.speed * dt;
    // It only has eyes for its target, and flies straight over anyone else.
    const hit = target && !target.towed
      ? (target.px - shot.x) ** 2 + (target.pz - shot.z) ** 2 < A.seeker.hitReach ** 2
      : hitCar(world, shot, A.seeker.hitReach);
    if (hit || shot.life <= 0 || shot.y < track.heightAt(shot.x, shot.z) + 0.2) {
      blast(world, shot.x, shot.y, shot.z, A.seeker, shot.owner, shot.weapon);
      return false;
    }
    return true;
  }
  if (shot.kind === 'hook') {
    shot.x += shot.vx * dt;
    shot.z += shot.vz * dt;
    shot.y = track.heightAt(shot.x, shot.z) + 1.1;
    const hit = hitCar(world, shot, A.hook.hitReach);
    if (hit && hit.alive) {
      world.arsenal.tethers.push({ id: world.arsenal.nextId++, a: shot.owner, b: hit.id, life: A.hook.reel });
      weaponHit(world, world.cars[shot.owner], hit, A.hook.damage, hit.px, hit.pz, 0.5);
      emit(world, { type: 'hooked', car: shot.owner, victim: hit.id, x: hit.px, y: hit.py, z: hit.pz });
      return false;
    }
    return shot.life > 0 && track.sdfAt(shot.x, shot.z) > 0.2;
  }
  if (shot.kind === 'hand') return stepHand(world, shot, dt);
  return false;
}

const PT = { x: 0, z: 0, tx: 0, tz: 0, curvature: 0 };

// A car's distance across the road, along the same axis as shot.offset.
function roadSide(track, car) {
  const p = track.sample(car.trackS, PT);
  return (car.px - p.x) * -p.tz + (car.pz - p.z) * p.tx;
}

function canSlap(world, shot, car, reach) {
  if (!car.alive || car.towed || car.id === shot.owner) return false;
  if ((shot.cut.get(car.id) ?? -9) > world.time - A.hand.rehit) return false;
  return (car.px - shot.x) ** 2 + (car.pz - shot.z) ** 2 <= reach ** 2 && Math.abs(car.py - shot.y) <= A.hand.height;
}

function slap(world, shot, car) {
  const final = car.id === shot.target;
  const push = final ? A.hand.finalPush : A.hand.push;
  shot.cut.set(car.id, world.time);
  shove(car, -shot.dz * shot.side * push + shot.dx * A.hand.drive, A.hand.lift, shot.dx * shot.side * push + shot.dz * A.hand.drive);
  weaponHit(world, world.cars[shot.owner], car, final ? A.hand.finalDamage : A.hand.damage, car.px, car.pz, 0.5);
  emit(world, { type: 'slapped', owner: shot.owner, victim: car.id, final, x: car.px, y: car.py, z: car.pz });
  return final;
}

// The Backhander runs the road at the leader. Reaching any car stops it for one
// swing: it falls in beside the car, draws back, and the palm lands on whatever
// is under it. The slap sends a car down the road and in towards the middle, with
// no spin: sideways or spinning, it cost the race ten seconds and the flag. A swing
// that lands on the leader is its last.
function stepHand(world, shot, dt) {
  const track = world.track;
  const victim = shot.swing >= 0 ? world.cars[shot.victim] : null;
  const followed = victim ?? world.cars[shot.target];
  if (victim && shot.swing < A.hand.windup) {
    const ahead = track.route(shot.s, victim.trackS);
    const gap = ahead > track.length / 2 ? ahead - track.length : ahead;
    const left = Math.max(A.hand.windup - shot.swing, dt);
    shot.s = track.route(0, shot.s + (shot.pace + (Math.abs(gap) < A.hand.reach * 2 ? gap / left : 0)) * dt);
    shot.offset += (roadSide(track, victim) - shot.offset) * Math.min(1, dt / left);
  } else {
    shot.s = track.route(0, shot.s + (shot.swing >= 0 ? shot.pace : A.hand.speed) * dt);
    if (followed?.alive && track.route(shot.s, followed.trackS) < 90) {
      shot.offset += (roadSide(track, followed) - shot.offset) * Math.min(1, dt * 3);
    }
  }
  const p = track.sample(shot.s, PT);
  shot.dx = p.tx;
  shot.dz = p.tz;
  shot.x = p.x - p.tz * shot.offset;
  shot.z = p.z + p.tx * shot.offset;
  shot.y = track.heightAt(shot.x, shot.z);

  if (shot.swing < 0) {
    const car = world.cars.find((c) => canSlap(world, shot, c, A.hand.reach));
    if (!car) return shot.life > 0;
    const across = roadSide(track, car);
    shot.swing = 0;
    shot.victim = car.id;
    shot.pace = Math.hypot(car.vx, car.vz);
    shot.side = Math.abs(across) > 1 ? -Math.sign(across) : world.rng() < 0.5 ? -1 : 1;
    return true;
  }
  const before = shot.swing;
  shot.swing += dt;
  if (before < A.hand.windup && shot.swing >= A.hand.windup) {
    for (const car of world.cars) {
      if (canSlap(world, shot, car, A.hand.palm) && slap(world, shot, car)) shot.spent = true;
    }
  }
  if (shot.swing < A.hand.windup + A.hand.follow) return true;
  shot.cut.set(shot.victim, world.time); // a clean miss doesn't get another go at once
  shot.swing = -1;
  shot.victim = -1;
  return !shot.spent && shot.life > 0;
}

function stepHazard(world, h, dt) {
  h.life -= dt;
  h.arm -= dt;
  if (h.life <= 0) return false;
  if (h.kind !== 'mine' && h.kind !== 'spring') return true;
  if (h.arm > 0) return true;
  for (const car of world.cars) {
    if (car.towed) continue;
    if ((car.px - h.x) ** 2 + (car.pz - h.z) ** 2 > h.radius ** 2) continue;
    if (car.py - h.y > 2.2) continue;
    if (h.kind === 'mine') {
      blast(world, h.x, h.y + 0.3, h.z, A.mine, h.owner, h.weapon);
    } else {
      car.vy = Math.max(car.vy, A.spring.launch);
      car.wx += (world.rng() - 0.5) * 0.8;
      car.wz += (world.rng() - 0.5) * 0.8;
      emit(world, { type: 'sprung', car: car.id, owner: h.owner, x: h.x, y: h.y, z: h.z });
    }
    return false;
  }
  return true;
}

// The mountain joins in: a bomb comes down on the road just ahead of somebody at random.
function stepEruption(world, dt) {
  const a = world.arsenal;
  const hazard = world.track.course.hazard;
  a.eruption = (a.eruption ?? hazard.every) - dt;
  if (a.eruption > 0) return;
  a.eruption += hazard.every * (0.6 + 0.8 * world.rng());
  const cars = running(world);
  if (!cars.length) return;
  const target = cars[Math.floor(world.rng() * cars.length)];
  const lands = target.trackS + Math.hypot(target.vx, target.vz) * A.lava.fall * 0.9;
  if (world.track.coveredAt(world.track.route(0, lands))) return; // the tube keeps it off
  const here = world.track.sample(lands, PT);
  const side = (world.rng() - 0.5) * 2 * hazard.spread;
  const x = here.x - here.tz * side, z = here.z + here.tx * side;
  a.drops.push({
    id: a.nextId++, kind: 'lava', owner: -1, target: target.id, x, z,
    y: world.track.heightAt(x, z), t: A.lava.fall, fall: A.lava.fall,
  });
}

function stepDrop(world, drop, dt) {
  drop.t -= dt;
  if (drop.t > 0) return true;
  if (drop.kind === 'lava') {
    blast(world, drop.x, drop.y + 0.5, drop.z, A.lava, -1, 0);
    emit(world, { type: 'lavaLands', x: drop.x, y: drop.y, z: drop.z });
    return false;
  }
  blast(world, drop.x, drop.y + 0.5, drop.z, A.piano, drop.owner, drop.weapon);
  emit(world, { type: 'pianoLands', owner: drop.owner, target: drop.target, x: drop.x, y: drop.y, z: drop.z });
  return false;
}

function stepTether(world, t, dt) {
  t.life -= dt;
  const a = world.cars[t.a], b = world.cars[t.b];
  if (t.life <= 0 || !a.alive || !b.alive) return false;
  const dx = b.px - a.px, dz = b.pz - a.pz, d = Math.hypot(dx, dz);
  if (d < A.hook.snug || d > A.hook.snap) return d >= A.hook.snug ? false : t.life > 0;
  const nx = dx / d, nz = dz / d;
  shove(a, nx * A.hook.pullOwner * dt, 0, nz * A.hook.pullOwner * dt);
  shove(b, -nx * A.hook.pullVictim * dt, 0, -nz * A.hook.pullVictim * dt);
  return true;
}

function keep(list, step, world, dt) {
  let n = 0;
  for (let i = 0; i < list.length; i++) if (step(world, list[i], dt)) list[n++] = list[i];
  list.length = n;
}

// Called once a physics step, before the car forces.
export function stepArsenal(world, dt) {
  const a = world.arsenal;
  const racing = world.phase === 'racing';
  if (racing && world.track.course.hazard) stepEruption(world, dt);
  for (const crate of a.crates) if (crate.respawn > 0) crate.respawn -= dt;

  for (const car of world.cars) {
    car.gripScale = 1;
    car.onOil = false;
    car.fireLock = Math.max(0, car.fireLock - dt);
    if (car.whirl && racing && car.alive) {
      car.gripScale = A.whirl.grip;
      stepWhirl(world, car, dt);
    } else {
      car.whirl = null;
    }
  }

  if (!racing) {
    for (const h of a.hazards) h.life -= dt;
    a.hazards = a.hazards.filter((h) => h.life > 0);
    return;
  }

  keep(a.shots, stepShot, world, dt);
  keep(a.hazards, stepHazard, world, dt);
  keep(a.drops, stepDrop, world, dt);
  keep(a.tethers, stepTether, world, dt);

  for (const h of a.hazards) {
    if (h.kind !== 'oil') continue;
    for (const car of world.cars) {
      if ((car.px - h.x) ** 2 + (car.pz - h.z) ** 2 >= h.radius ** 2) continue;
      car.onOil = true;
      car.gripScale = Math.min(car.gripScale, A.oil.grip);
    }
  }
}

// The race is over: nothing in flight survives the flag.
export function standDown(world) {
  const a = world.arsenal;
  a.shots.length = 0;
  a.drops.length = 0;
  a.tethers.length = 0;
}

export function insideSmoke(world, x, z) {
  for (const h of world.arsenal.hazards) {
    if (h.kind === 'smoke' && (h.x - x) ** 2 + (h.z - z) ** 2 < h.radius ** 2) return true;
  }
  return false;
}

// True when a straight line between two points passes through a smoke cloud.
export function smokeBetween(world, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
  for (const h of world.arsenal.hazards) {
    if (h.kind !== 'smoke') continue;
    const t = clamp(((h.x - ax) * dx + (h.z - az) * dz) / len2, 0, 1);
    if ((ax + dx * t - h.x) ** 2 + (az + dz * t - h.z) ** 2 < h.radius ** 2) return true;
  }
  return false;
}
