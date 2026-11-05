// What a bot can perceive. All values are in the bot's own frame, normalised to
// roughly [-1, 1], and clamped to [-1.5, 1.5]. "right" is positive throughout,
// matching the steering sign: steer > 0 turns right.
//
// The layout is the input contract of the neural network. Fixed opponent slots
// are stable for the entire race: slot k always refers to the same rival.

import { CAR_COUNT, RULES, SURFACE_PROPS } from './config.js';
import { clamp } from './math.js';
import { insideSmoke, smokeBetween, WEAPONS } from './arsenal.js';

export const LOOKAHEADS = [8, 16, 28, 45, 65];
export const RAY_ANGLES_DEG = [0, 15, -15, 32, -32, 55, -55, 80, -80, 115, -115, 150, -150, 180];
export const RAY_MAX = 45;
export const OPPONENT_SLOTS = CAR_COUNT - 1;
export const ROUTE_RANGE = 120; // metres: route distances read 1 at or beyond this
export const CURVATURE_SCALE = 46; // curvature * this: 1 is a 46 m radius

const EGO_FIELDS = [
  'speedFwd',        // m/s / 40
  'speedRight',      // m/s / 40, lateral sliding velocity
  'yawRate',         // rad/s / 3, positive turning right
  'slipAngle',       // rad, velocity direction relative to the nose; > 0 means sliding toward the right
  'rearSlip',        // mean rear slip ratio clamped to [-1, 1]; > 0 wheelspin, < 0 locked
  'frontSlip',       // mean front tyre slip angle, rad
  'steerActual',     // current road-wheel angle / maxSteer
  'rpm',             // rpm / limit
  'inReverse',       // 1 when reverse is engaged
  'health',          // 0..1
  'engineHealth',    // 0..1
  'alignment',       // bent steering bias in rad * 5
  'upright',         // world-up component of body up, 1 flat, 0 on its side, -1 roof
  'wheelsDown',      // fraction of wheels on the ground
  'surfaceGrip',     // grip of the surface under the car / 2: mud 0.885, clay 1.15, asphalt 1.3
  'raceActive',      // 0 during the countdown, 1 while racing
  'stallTimer',      // seconds without gaining route / stall limit. Reaching 1 is a knockout.
  'hitTaken',        // strongest hit taken this decision tick, 0..1
  'progressRate',    // speed along the track direction, m/s / 40. Negative is going backwards.
  'trackOffset',     // lateral offset from the road's centre / local half width, positive right
  'headingSin',      // sin of (track direction relative to the nose), positive means track direction is to the right
  'headingCos',      // cos of the same angle
  'temperAggression',// 0..1 fixed per bot
  'temperNerve',     // 0..1 fixed per bot
  'temperVengeance', // 0..1 fixed per bot
  'toCrossing',      // route metres to my next crossroads pass / ROUTE_RANGE, 0..1
  'toJump',          // route metres to the next jump's lip / ROUTE_RANGE, 0..1
  'pace',            // pace-note speed here, m/s / 40. Holding it gets you round everything ahead.
  'lineOffset',      // metres I am right of the racing line / local half width
  'halfWidth',       // local half width of the road, m / 10
  'racePosition',    // 0 leading .. 1 last, among all cars
  'raceDone',        // share of the race distance covered, 0..1
];

// Points on the racing line. fwd/right in m / 70; curvature * CURVATURE_SCALE,
// positive right-hander; pace is the pace-note speed there, m/s / 40.
const LOOKAHEAD_FIELDS = ['fwd', 'right', 'curvature', 'pace'];

const OPPONENT_FIELDS = [
  'alive',      // 1 while running
  'solid',      // 1 while on the road, running or wrecked. 0 once towed: every other field reads 0.
  'fwd',        // m / 100 ahead of me
  'right',      // m / 100 to my right
  'dist',       // m / 100
  'relVelFwd',  // their velocity minus mine, my frame, m/s / 40
  'relVelRight',
  'headingSin', // their nose direction in my frame: sin > 0 points right of my nose
  'headingCos',
  'speed',      // their speed m/s / 40
  'health',     // 0..1
  'hitMe',      // strength of a hit they landed on me this decision tick, 0..1
  'iHit',       // strength of a hit I landed on them this decision tick, 0..1
  'los',        // 1 when the straight line between us is clear of walls, else 0
  'trackGap',   // shortest signed route distance to them / half a lap, -1..1; > 0 means they are ahead of me on the route
  'toMyCrossing', // route metres until they reach my next crossroads from the other strand / ROUTE_RANGE, 0..1
  'raceGap',    // their race distance minus mine / lap length. > 0 means they are ahead in the race.
];

// Appended after the rivals, so everything above keeps its index. One `arms.<key>`
// per weapon reads 1 while holding it; the rest are described in BOT_CONTRACT.md.
const ARMS_FIELDS = [
  ...['barnBurner', 'grudgeSeeker', 'welcomeMat', 'oilSlick', 'smokeBomb', 'threshingWhirl', 'repoHook', 'bedspring', 'backhander', 'grandPiano', 'foghorn'],
  'ready',        // 1 while holding a weapon that can be used now
  'whirling',     // 1 during my own Threshing Whirl
  'blinded',      // 1 inside a smoke cloud
  'oiled',        // 1 while my tyres are on oil
  'incoming',     // 1 when a shot aimed at me is close, 0 at 60 m or more
  'toCrate',      // route metres to the next spot with a live crate / ROUTE_RANGE, 0..1
  'crateRight',   // nearest live crate there, metres right of me / local half width
  'toHazard',     // metres ahead to the nearest mine, oil or spring in my road / 60; 1 when clear
  'hazardRight',  // that hazard, metres right of me / 10
  'aheadRange',   // nearest visible rival within 20 degrees of my nose / 100; 1 when none
  'aheadBearing', // its bearing from my nose, rad, right positive
  'behindRange',  // nearest visible rival within 35 degrees of my tail / 40; 1 when none
  'closeRivals',  // living rivals within 7 m / 4
];

function buildLayout() {
  const index = {};
  const names = [];
  const add = (name) => { index[name] = names.length; names.push(name); };
  EGO_FIELDS.forEach((f) => add(`ego.${f}`));
  LOOKAHEADS.forEach((d, k) => LOOKAHEAD_FIELDS.forEach((f) => add(`look${k}.${f}`)));
  RAY_ANGLES_DEG.forEach((_, k) => add(`ray${k}`));
  for (let s = 0; s < OPPONENT_SLOTS; s++) OPPONENT_FIELDS.forEach((f) => add(`opp${s}.${f}`));
  ARMS_FIELDS.forEach((f) => add(`arms.${f}`));
  return { index, names, size: names.length };
}

export const OBS = buildLayout();
export const OBS_EGO_START = 0;
export const OBS_EGO_COUNT = EGO_FIELDS.length;
export const OBS_LOOK_START = OBS.index['look0.fwd'];
export const OBS_LOOK_FIELDS = LOOKAHEAD_FIELDS.length;
export const OBS_RAY_START = OBS.index.ray0;
export const OBS_OPP_START = OBS.index['opp0.alive'];
export const OBS_OPP_FIELDS = OPPONENT_FIELDS.length;

// The car a slot refers to, for an observer with the given id.
export const slotToCarId = (observerId, slot) => (slot < observerId ? slot : slot + 1);
export const carIdToSlot = (observerId, carId) => (carId < observerId ? carId : carId - 1);

const rayDirs = RAY_ANGLES_DEG.map((deg) => {
  const a = (deg * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
});

const pt = { x: 0, z: 0, tx: 0, tz: 0, curvature: 0 };

// A rival behind a smoke cloud, or any rival at all from inside one, can't be seen.
function hiddenBySmoke(world, car, o, blinded) {
  return blinded || insideSmoke(world, o.px, o.pz) || smokeBetween(world, car.px, car.pz, o.px, o.pz);
}

function fillArms(world, car, out, start, hx, hz, rx, rz, blinded) {
  const track = world.track;
  const a = world.arsenal;
  let i = start;
  for (let w = 1; w < WEAPONS.length; w++) out[i++] = car.weapon === w ? 1 : 0;
  out[i++] = car.weapon && car.fireLock <= 0 && !car.whirl ? 1 : 0;
  out[i++] = car.whirl ? 1 : 0;
  out[i++] = blinded ? 1 : 0;
  out[i++] = car.onOil ? 1 : 0;

  let threat = 60;
  for (const s of a.shots) {
    const aimed = s.target === car.id || (s.kind === 'rocket' && s.owner !== car.id) || (s.kind === 'hook' && s.owner !== car.id);
    if (aimed) threat = Math.min(threat, Math.hypot(s.x - car.px, s.z - car.pz));
  }
  for (const d of a.drops) if (d.target === car.id) threat = Math.min(threat, 30);
  out[i++] = 1 - threat / 60;

  let toCrate = ROUTE_RANGE, crateRight = 0;
  const halfWidth = track.halfWidthAt(car.trackS);
  for (const crate of a.crates) {
    if (crate.respawn > 0) continue;
    const d = track.route(car.trackS, crate.s);
    const right = (crate.x - car.px) * rx + (crate.z - car.pz) * rz;
    if (d < toCrate - 2 || (Math.abs(d - toCrate) <= 2 && Math.abs(right) < Math.abs(crateRight * halfWidth))) {
      toCrate = d;
      crateRight = right / halfWidth;
    }
  }
  out[i++] = Math.min(1, toCrate / ROUTE_RANGE);
  out[i++] = crateRight;

  let hazardAhead = 60, hazardRight = 0;
  for (const h of a.hazards) {
    if (h.kind === 'smoke' || h.arm > 0) continue;
    const dx = h.x - car.px, dz = h.z - car.pz;
    const ahead = dx * hx + dz * hz, right = dx * rx + dz * rz;
    if (ahead > 0 && ahead < hazardAhead && Math.abs(right) < 12) { hazardAhead = ahead; hazardRight = right; }
  }
  out[i++] = hazardAhead / 60;
  out[i++] = hazardRight / 10;

  let aheadRange = 100, aheadBearing = 0, behindRange = 40, close = 0;
  for (const o of world.cars) {
    if (o === car || !o.alive) continue;
    const dx = o.px - car.px, dz = o.pz - car.pz, d = Math.hypot(dx, dz) || 1;
    if (d < 7) close++;
    if (hiddenBySmoke(world, car, o, blinded)) continue;
    const ahead = dx * hx + dz * hz, right = dx * rx + dz * rz;
    const bearing = Math.atan2(right, ahead);
    if (Math.abs(bearing) < 0.35 && d < aheadRange) { aheadRange = d; aheadBearing = bearing; }
    if (Math.abs(bearing) > Math.PI - 0.6 && d < behindRange) behindRange = d;
  }
  out[i++] = aheadRange / 100;
  out[i++] = aheadBearing;
  out[i++] = behindRange / 40;
  out[i++] = close / 4;
  return i;
}

export function fillObservation(world, car, out) {
  const track = world.track;
  const R = car.R;
  let hx = R[0], hz = R[6];
  const hl = Math.hypot(hx, hz) || 1;
  hx /= hl; hz /= hl;
  const rx = -hz, rz = hx;

  const vf = car.vx * hx + car.vz * hz;
  const vr = car.vx * rx + car.vz * rz;
  const speed = Math.hypot(vf, vr);

  const wheels = car.wheels;
  const down = wheels.reduce((n, w) => n + (w.onGround ? 1 : 0), 0);
  const rearSlip = clamp(0.5 * (wheels[2].slipRatio + wheels[3].slipRatio), -1, 1);

  let i = 0;
  out[i++] = vf / 40;
  out[i++] = vr / 40;
  out[i++] = -car.wy / 3;
  out[i++] = speed > 1 ? Math.atan2(vr, Math.abs(vf)) : 0;
  out[i++] = rearSlip;
  out[i++] = 0.5 * (wheels[0].slipAngle + wheels[1].slipAngle);
  out[i++] = car.steerAngle / 0.6;
  out[i++] = car.rpm / 6100;
  out[i++] = car.gear < 0 ? 1 : 0;
  out[i++] = car.health;
  out[i++] = car.engineHealth;
  out[i++] = car.alignment * 5;
  out[i++] = R[4];
  out[i++] = down / 4;
  out[i++] = SURFACE_PROPS[track.surfaceAt(car.px, car.pz)].grip / 2;
  out[i++] = world.phase === 'racing' ? 1 : 0;
  out[i++] = car.stallTime / RULES.stalledKoSeconds;
  out[i++] = car.hitAny;
  out[i++] = car.progressRate / 40;

  track.sample(car.trackS, pt);
  const ox = car.px - pt.x, oz = car.pz - pt.z;
  const tRx = -pt.tz, tRz = pt.tx;
  const halfWidth = track.halfWidthAt(car.trackS);
  const offset = ox * tRx + oz * tRz;
  out[i++] = offset / halfWidth;
  // Angle from the nose to the track direction, right-positive.
  const tFwd = pt.tx * hx + pt.tz * hz;
  const tRgt = pt.tx * rx + pt.tz * rz;
  out[i++] = tRgt;
  out[i++] = tFwd;
  out[i++] = car.temper.aggression;
  out[i++] = car.temper.nerve;
  out[i++] = car.temper.vengeance;
  const next = track.nextPass(car.trackS);
  out[i++] = Math.min(1, next.distance / ROUTE_RANGE);
  out[i++] = Math.min(1, track.toNextLip(car.trackS) / ROUTE_RANGE);
  out[i++] = track.paceAt(car.trackS) / 40;
  out[i++] = (offset - track.lineOffsetAt(car.trackS)) / halfWidth;
  out[i++] = halfWidth / 10;
  out[i++] = world.cars.length > 1 ? car.racePos / (world.cars.length - 1) : 0;
  out[i++] = clamp(car.progress / (world.laps * track.length), 0, 1);

  for (let k = 0; k < LOOKAHEADS.length; k++) {
    const s = car.trackS + LOOKAHEADS[k];
    track.sampleLine(s, pt);
    const dx = pt.x - car.px, dz = pt.z - car.pz;
    out[i++] = (dx * hx + dz * hz) / 70;
    out[i++] = (dx * rx + dz * rz) / 70;
    out[i++] = pt.curvature * CURVATURE_SCALE;
    out[i++] = track.paceAt(s) / 40;
  }

  for (let k = 0; k < rayDirs.length; k++) {
    const c = rayDirs[k][0], s = rayDirs[k][1];
    const wx = hx * c + rx * s, wz = hz * c + rz * s;
    out[i++] = track.raycast(car.px, car.pz, wx, wz, RAY_MAX) / RAY_MAX;
  }

  const blinded = insideSmoke(world, car.px, car.pz);
  for (let slot = 0; slot < OPPONENT_SLOTS; slot++) {
    const id = slotToCarId(car.id, slot);
    const o = world.cars[id];
    if (!o || o.towed || hiddenBySmoke(world, car, o, blinded)) {
      for (let f = 0; f < OBS_OPP_FIELDS; f++) out[i + f] = 0;
      i += OBS_OPP_FIELDS;
      continue;
    }
    const dx = o.px - car.px, dz = o.pz - car.pz;
    const rvx = o.vx - car.vx, rvz = o.vz - car.vz;
    let ohx = o.R[0], ohz = o.R[6];
    const ol = Math.hypot(ohx, ohz) || 1;
    ohx /= ol; ohz /= ol;
    out[i++] = o.alive ? 1 : 0;
    out[i++] = 1;
    out[i++] = (dx * hx + dz * hz) / 100;
    out[i++] = (dx * rx + dz * rz) / 100;
    out[i++] = Math.hypot(dx, dz) / 100;
    out[i++] = (rvx * hx + rvz * hz) / 40;
    out[i++] = (rvx * rx + rvz * rz) / 40;
    out[i++] = ohx * rx + ohz * rz;
    out[i++] = ohx * hx + ohz * hz;
    out[i++] = Math.hypot(o.vx, o.vz) / 40;
    out[i++] = o.health;
    out[i++] = Math.min(1, car.hitFrom[id]);
    out[i++] = Math.min(1, car.hitTo[id]);
    const dist = Math.hypot(dx, dz);
    const clear = dist < 1 || track.raycast(car.px, car.pz, dx / dist, dz / dist, dist) >= dist - 1;
    out[i++] = clear ? 1 : 0;
    const L = track.length;
    let gap = (o.trackS - car.trackS) % L;
    if (gap > L / 2) gap -= L;
    else if (gap < -L / 2) gap += L;
    out[i++] = gap / (L / 2);
    out[i++] = Math.min(1, track.route(o.trackS, next.pass.other) / ROUTE_RANGE);
    out[i++] = (o.progress - car.progress) / L;
  }

  fillArms(world, car, out, i, hx, hz, rx, rz, blinded);

  for (let k = 0; k < OBS.size; k++) out[k] = clamp(out[k], -1.5, 1.5);
  car.hitFrom.fill(0);
  car.hitTo.fill(0);
  car.hitAny = 0;
}
