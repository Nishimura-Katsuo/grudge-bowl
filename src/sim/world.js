// Fixed-step simulation and race rules. No DOM, no renderer: runs identically
// in Node and in the browser, and replays exactly from its seed.

import { CAR_COUNT, DAMAGE, PHYSICS_DT, RULES, STEPS_PER_DECISION, CAR, ENGINE } from './config.js';
import { clamp, createRng } from './math.js';
import { createCar, integratePosition, stepCarForces, storePrev } from './car.js';
import { collideCars, collideGround, collideWall, damageFromImpulse } from './collision.js';
import { fillObservation, OBS } from './sensors.js';
import { collectCrates, createArsenal, fireWeapon, standDown, stepArsenal } from './arsenal.js';
import { getTrack } from './track.js';
import { ROSTER } from './roster.js';

const SPAWN_LAST_ROW_S = -32;
const ROW_GAP = 14;
const COLUMN_OFFSET = 4.2;
const STALL_RESET_METRES = 4; // route to gain before the stall clock starts again
const MIN_FLIGHT_SECONDS = 0.28;
const VICTORY_RUN_SECONDS = 2;
const VICTORY_ENTRY_SPEED = 11;
const VICTORY_THROTTLE = 1;
const VICTORY_BOXED_SECONDS = 0.8;
const VICTORY_BACK_SECONDS = 1.1;
const LANDING_AIR_SECONDS = 0.12;
const LANDING_HEIGHT = 0.25;
const LANDING_DROP_SPEED = 1; // m/s closing downward, measured before the contact
const STRAND_SWITCH_METRES = 40; // no car covers this much route in one physics step

export function createWorld(options = {}) {
  const {
    seed = 1,
    carCount = CAR_COUNT,
    course = 'knot',
    laps = getTrack(course).course.laps ?? RULES.laps,
    timeLimit = RULES.timeLimit,
    brainFactory = null,
    spawnOverride = null,
    lineup = ROSTER,
  } = options;

  const track = getTrack(course);
  const rng = createRng(seed);
  const order = shuffled(carCount, rng);
  const cars = [];
  for (let i = 0; i < carCount; i++) {
    const gridSlot = order[i];
    const row = gridSlot >> 1;
    const side = gridSlot & 1 ? 1 : -1;
    const s = SPAWN_LAST_ROW_S + (carCount / 2 - row) * ROW_GAP;
    const spawn = spawnOverride ? spawnOverride(i, track) : gridSpawn(track, s, side);
    cars.push(createCar(i, lineup[i % lineup.length], spawn, track));
  }

  const world = {
    track,
    cars,
    rng,
    seed,
    laps,
    timeLimit,
    time: 0,
    raceTime: 0,
    step: 0,
    phase: 'countdown',
    events: [],
    winner: -1,
    finishOrder: [],
    brains: [],
    obs: cars.map(() => new Float32Array(OBS.size)),
    leaderLaps: 0,
    arsenal: createArsenal(track),
  };
  world.brains = brainFactory ? cars.map((car) => brainFactory(car)) : cars.map(() => null);
  return world;
}

function shuffled(n, rng) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const sp = { x: 0, z: 0, tx: 0, tz: 0, curvature: 0 };

function gridSpawn(track, s, side) {
  track.sample(s, sp);
  return {
    x: sp.x - sp.tz * side * COLUMN_OFFSET,
    z: sp.z + sp.tx * side * COLUMN_OFFSET,
    tx: sp.tx,
    tz: sp.tz,
    s: ((s % track.length) + track.length) % track.length,
  };
}

export function emit(world, event) {
  event.time = world.time;
  world.events.push(event);
}

export function applyDamage(world, car, amount, zone, px, pz) {
  if (amount <= 0) return;
  car.health = clamp(car.health - amount, 0, 1);
  car.zones[zone] += amount;
  if (zone === 'front') {
    car.engineHealth = clamp(car.engineHealth - amount * 1.3, 0, 1);
    car.alignment += (world.rng() - 0.5) * amount * 0.35;
    car.alignment = clamp(car.alignment, -0.09, 0.09);
  } else {
    car.engineHealth = clamp(car.engineHealth - amount * 0.35, 0, 1);
  }

  // The wheel nearest the impact takes a share of the punishment.
  let nearest = null, nearestD = Infinity;
  for (const w of car.wheels) {
    if (!w.attached) continue;
    const wx = car.px + car.R[0] * w.x + car.R[2] * w.z;
    const wz = car.pz + car.R[6] * w.x + car.R[8] * w.z;
    const d = (wx - px) ** 2 + (wz - pz) ** 2;
    if (d < nearestD) { nearestD = d; nearest = w; }
  }
  if (nearest && nearestD < 4) {
    nearest.hp -= amount * DAMAGE.wheelHitScale;
    if (nearest.hp <= 0) {
      nearest.attached = false;
      emit(world, { type: 'wheelOff', car: car.id, wheel: car.wheels.indexOf(nearest), x: px, y: car.py, z: pz });
    }
  }
  if (car.wheels.filter((w) => w.attached).length <= 1 && car.alive) {
    knockOut(world, car, 'lost its wheels');
  }
}

function knockOut(world, car, reason) {
  if (!car.alive) return;
  car.alive = false;
  car.engineOn = false;
  car.koReason = reason;
  car.koTime = world.time;
  // Dead cars roll free, so a wreck on the racing line can be shoved out of it.
  car.input.throttle = 0;
  car.input.brake = 0.06;
  car.input.handbrake = 0;
  car.input.reverse = 0;
  car.input.steer = 0;
  car.stallTime = 0;

  let killer = -1;
  if (car.lastHitter >= 0 && world.time - car.lastHitterTime < DAMAGE.lastHitterWindow) {
    killer = car.lastHitter;
    const k = world.cars[killer];
    k.knockouts++;
    k.score += RULES.points.knockout;
  }
  emit(world, { type: 'ko', car: car.id, killer, reason, x: car.px, y: car.py, z: car.pz });
}

function creditHit(world, attacker, victim, damage, strength) {
  // Health can reach zero a moment before the knockout: a later hit stole nothing.
  if (!attacker.alive || !victim.alive || victim.health <= 0) return;
  attacker.damageDealt += damage;
  attacker.score += damage * RULES.points.damagePerUnit;
  victim.lastHitter = attacker.id;
  victim.lastHitterTime = world.time;
  attacker.hitTo[victim.id] = Math.max(attacker.hitTo[victim.id], strength);
  victim.hitFrom[attacker.id] = Math.max(victim.hitFrom[attacker.id], strength);
}

// A weapon's damage: credited like a hit, and it can finish a car off.
export function weaponHit(world, attacker, victim, amount, x, z, strength) {
  if (world.phase !== 'racing' || !victim.alive) return;
  const dealt = Math.min(amount, victim.health);
  if (attacker && attacker !== victim) creditHit(world, attacker, victim, dealt, strength);
  victim.hitAny = Math.max(victim.hitAny, strength);
  applyDamage(world, victim, amount, 'right', x, z);
}

const zoneOut = { zone: 'front' };

// One car dropping onto another, rather than two cars meeting on the road.
function comingDown(upper, lower, ny) {
  if (upper.py <= lower.py || upper.prevVy - lower.prevVy > -LANDING_DROP_SPEED) return false;
  return Math.abs(ny) > 0.55 || (upper.airTime > LANDING_AIR_SECONDS && upper.py - lower.py > LANDING_HEIGHT);
}

function onCarHit(world, a, b, impulse, mx, my, mz, nx, ny, nz, uA, uB, relBefore) {
  if (world.phase !== 'racing') return;

  const dmgA = damageFromImpulse(a, impulse, -nx, -ny, -nz, 1, zoneOut);
  const zoneA = zoneOut.zone;
  const dmgB = damageFromImpulse(b, impulse, nx, ny, nz, 1, zoneOut);
  const zoneB = zoneOut.zone;

  if (dmgA > 0 || dmgB > 0) {
    const strength = clamp((impulse / CAR.mass) / 12, 0, 1);
    a.hitAny = Math.max(a.hitAny, strength);
    b.hitAny = Math.max(b.hitAny, strength);
    const total = Math.max(1e-3, Math.max(uA, 0) + Math.max(uB, 0));
    const shareA = Math.max(uA, 0) / total;
    const shareB = Math.max(uB, 0) / total;
    if (shareA >= DAMAGE.attackerShare) creditHit(world, a, b, Math.min(dmgB, b.health), strength);
    if (shareB >= DAMAGE.attackerShare) creditHit(world, b, a, Math.min(dmgA, a.health), strength);
    applyDamage(world, a, dmgA, zoneA, mx, mz);
    applyDamage(world, b, dmgB, zoneB, mx, mz);
    emit(world, {
      type: 'hit', a: a.id, b: b.id, x: mx, y: my, z: mz,
      nx, ny, nz,
      strength, closing: relBefore, zoneA, zoneB, dmgA, dmgB,
      upper: comingDown(a, b, ny) ? a.id : comingDown(b, a, ny) ? b.id : -1,
    });
  }
}

function onWallHit(world, car, impulse, mx, my, mz, gx, gz) {
  if (world.phase !== 'racing') return;
  const dmg = damageFromImpulse(car, impulse, -gx, 0, -gz, DAMAGE.wallMultiplier, zoneOut);
  if (dmg > 0) {
    const strength = clamp((impulse / CAR.mass) / 12, 0, 1);
    car.hitAny = Math.max(car.hitAny, strength);
    applyDamage(world, car, dmg, zoneOut.zone, mx, mz);
    emit(world, { type: 'wall', car: car.id, x: mx, y: my, z: mz, strength, nx: gx, ny: 0, nz: gz });
  }
}

// The one running order: cars still going ahead of wrecks, then distance covered.
export function raceOrder(cars) {
  // Who crossed first only separates cars still running. Wrecks go by distance.
  const flag = (a, b) => {
    if (!a.alive || !b.alive || a.finishFraction === b.finishFraction) return 0;
    return a.finishFraction < b.finishFraction ? -1 : 1;
  };
  return [...cars].sort((a, b) => Number(b.alive) - Number(a.alive) || flag(a, b) || b.progress - a.progress || a.id - b.id);
}

function rankCars(world) {
  const order = raceOrder(world.cars);
  order.forEach((car, i) => { car.racePos = i; });
  return order;
}

function runBrains(world) {
  rankCars(world);
  for (const car of world.cars) {
    const brain = world.brains[car.id];
    const obs = world.obs[car.id];
    if (!car.alive || !brain) continue;
    fillObservation(world, car, obs);
    const action = brain.act(obs);
    const inp = car.input;
    inp.steer = clamp(action[0] || 0, -1, 1);
    inp.throttle = clamp(action[1] || 0, 0, 1);
    inp.brake = clamp(action[2] || 0, 0, 1);
    inp.handbrake = clamp(action[3] || 0, 0, 1);
    inp.reverse = clamp(action[4] || 0, 0, 1);
    if (world.phase === 'racing') {
      collectCrates(world, car);
      if (action[5] > 0.5) fireWeapon(world, car);
    }
    if (world.phase === 'finished' && car.id === world.winner) {
      celebrate(world, car, inp);
    } else if (world.phase !== 'racing') {
      inp.throttle = 0;
      inp.brake = 1;
      inp.handbrake = 0;
      inp.reverse = 0;
    }
  }
}

// The winner's reward. The brain keeps driving long enough to clear the pack as
// it stops, then the car burns a circle into the track on tired rear tyres.
function celebrate(world, car, inp) {
  if (world.time - world.flagTime < VICTORY_RUN_SECONDS) return;
  inp.reverse = 0;
  inp.handbrake = 0;
  if (!car.burningOut && Math.hypot(car.vx, car.vz) > VICTORY_ENTRY_SPEED) {
    inp.steer = 0;
    inp.throttle = 0;
    inp.brake = 0.8;
    return;
  }
  car.burningOut = true;
  inp.brake = 0;
  // Boxed in by a wall or a parked rival: back out, then go round again.
  if (world.time < car.backingUntil) {
    inp.reverse = 1;
    inp.steer = -1;
    inp.throttle = VICTORY_THROTTLE * 0.7;
    return;
  }
  // Still in reverse from backing out: stop first, or drive never engages.
  if (car.gear < 0) {
    inp.throttle = 0;
    inp.brake = 1;
    return;
  }
  const dt = STEPS_PER_DECISION * PHYSICS_DT;
  car.boxedTime = Math.hypot(car.vx, car.vz) < 1 ? car.boxedTime + dt : 0;
  if (car.boxedTime > VICTORY_BOXED_SECONDS) {
    car.boxedTime = 0;
    car.backingUntil = world.time + VICTORY_BACK_SECONDS;
  }
  inp.steer = 1;
  inp.throttle = VICTORY_THROTTLE;
}

function updateProgress(world, car, dt) {
  const track = world.track;
  const previous = car.trackS;
  const s = track.project(car.px, car.pz, previous);
  let delta = s - previous;
  if (delta > track.length / 2) delta -= track.length;
  else if (delta < -track.length / 2) delta += track.length;
  car.trackS = s;
  const before = car.progress;
  if (Math.abs(delta) < STRAND_SWITCH_METRES) {
    car.progress += delta;
    car.progressRate += (delta / dt - car.progressRate) * Math.min(1, dt * 6);
  } else {
    // Knocked onto the other strand of a crossroads. Whichever way that moved the
    // car along the route, it still owes the road it missed, so a shortcut counts
    // as going backwards. Keeping the whole-lap offset keeps progress on the line.
    car.progress += ((s - previous) % track.length + track.length) % track.length - track.length;
    car.stallMark = car.progress;
    car.stallTime = 0;
  }

  // Laps follow credited distance, so a strand penalty takes the lap back too.
  car.laps = Math.max(0, Math.floor(car.progress / track.length));
  if (car.laps > car.lapsAnnounced) {
    car.lapsAnnounced = car.laps;
    if (car.laps > world.leaderLaps) world.leaderLaps = car.laps;
    emit(world, { type: 'lap', car: car.id, lap: car.laps });
  }

  // How far through this physics step the car crossed the flag.
  const distance = world.laps * track.length;
  if (before < distance && car.progress >= distance) {
    car.finishFraction = (distance - before) / (car.progress - before);
  } else if (car.progress < distance) {
    car.finishFraction = Infinity;
  }
}

// Runs after the flag too: the tractor doesn't stop for the result.
function towWrecks(world) {
  for (const car of world.cars) {
    if (!car.alive && !car.towed && world.time - car.koTime >= RULES.wreckTowSeconds) {
      car.towed = true;
      car.vx = car.vy = car.vz = car.wx = car.wy = car.wz = 0;
      emit(world, { type: 'towed', car: car.id, x: car.px, y: car.py, z: car.pz });
    }
  }
}

function updateRules(world, dt) {
  if (world.phase === 'countdown') {
    if (world.time >= RULES.countdown) {
      world.phase = 'racing';
      emit(world, { type: 'go' });
    }
    return;
  }
  towWrecks(world);
  if (world.phase !== 'racing') return;
  world.raceTime += dt;

  for (const car of world.cars) {
    if (!car.alive) continue;
    updateProgress(world, car, dt);
    if (car.progress > car.stallMark + STALL_RESET_METRES) {
      car.stallMark = car.progress;
      car.stallTime = 0;
    } else {
      car.stallTime += dt;
      if (car.stallTime >= RULES.stalledKoSeconds) {
        knockOut(world, car, 'stalled out');
        continue;
      }
    }
    if (car.health <= 0) {
      knockOut(world, car, 'destroyed');
      continue;
    }
    if (car.R[4] < 0.25) {
      car.flippedTime += dt;
      if (car.flippedTime > RULES.flippedKoSeconds) knockOut(world, car, 'turtled');
    } else {
      car.flippedTime = 0;
    }
  }

  const running = world.cars.filter((c) => c.alive);
  const lastCarStanding = world.cars.length > 1 && running.length <= 1;
  // Only a car still running can take the flag: one destroyed on the line doesn't count.
  const distance = world.laps * world.track.length;
  const flagged = running.some((c) => c.progress >= distance);
  world.leaderLaps = running.reduce((most, c) => Math.max(most, c.laps), 0);
  if (lastCarStanding || flagged || world.raceTime >= world.timeLimit) {
    finishRace(world, running);
  }
}

function finishRace(world, running) {
  world.phase = 'finished';
  world.flagTime = world.time;
  standDown(world);
  const order = rankCars(world);
  world.finishOrder = order.map((c) => c.id);
  order.forEach((c, i) => { c.finishPos = i + 1; });
  world.winner = running.length ? order[0].id : -1;
  emit(world, { type: 'finish', winner: world.winner });
}

// Announces take-offs and landings, so the camera and the crowd can react.
function trackFlight(world, car, dt) {
  if (car.wheels.some((w) => w.onGround)) {
    if (car.airborne) {
      emit(world, { type: 'landing', car: car.id, air: car.airTime, drop: Math.max(0, -car.prevVy), x: car.px, y: car.py, z: car.pz });
    }
    car.airborne = false;
    car.airTime = 0;
  } else {
    car.airTime += dt;
    if (!car.airborne && car.airTime >= MIN_FLIGHT_SECONDS && car.alive) {
      car.airborne = true;
      emit(world, { type: 'jump', car: car.id, x: car.px, y: car.py, z: car.pz });
    }
  }
  car.prevVy = car.vy;
}

export function stepWorld(world) {
  const dt = PHYSICS_DT;
  const cars = world.cars;

  if (world.step % STEPS_PER_DECISION === 0) runBrains(world);
  stepArsenal(world, dt);

  for (let i = 0; i < cars.length; i++) {
    storePrev(cars[i]);
    if (!cars[i].towed) stepCarForces(cars[i], world.track, dt);
  }

  for (let i = 0; i < cars.length; i++) {
    if (cars[i].towed) continue;
    for (let j = i + 1; j < cars.length; j++) {
      if (cars[j].towed) continue;
      collideCars(cars[i], cars[j], (a, b, imp, mx, my, mz, nx, ny, nz, uA, uB, rel) =>
        onCarHit(world, a, b, imp, mx, my, mz, nx, ny, nz, uA, uB, rel));
    }
    collideWall(cars[i], world.track, (car, imp, mx, my, mz, gx, gz) =>
      onWallHit(world, car, imp, mx, my, mz, gx, gz));
    collideGround(cars[i], world.track, (car, speed, x, y, z) => {
      if (world.step % 8 === 0) emit(world, { type: 'scrape', car: car.id, speed, x, y, z });
    });
  }

  for (let i = 0; i < cars.length; i++) {
    if (cars[i].towed) continue;
    integratePosition(cars[i], dt);
    trackFlight(world, cars[i], dt);
  }

  world.time += dt;
  world.step++;
  updateRules(world, dt);
}

export const ENGINE_LIMIT_RPM = ENGINE.limitRpm;
