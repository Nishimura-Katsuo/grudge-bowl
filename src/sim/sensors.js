// What a bot can perceive. All values are in the bot's own frame, normalised to
// roughly [-1, 1], and clamped to [-1.5, 1.5]. "right" is positive throughout,
// matching the steering sign: steer > 0 turns right.
//
// The layout is the input contract of the neural network. Fixed opponent slots
// are stable for the entire race: slot k always refers to the same rival.

import { CAR_COUNT, RULES, SURFACE_PROPS } from './config.js';
import { clamp } from './math.js';

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
  'surfaceGrip',     // grip multiplier under the car
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

function buildLayout() {
  const index = {};
  const names = [];
  const add = (name) => { index[name] = names.length; names.push(name); };
  EGO_FIELDS.forEach((f) => add(`ego.${f}`));
  LOOKAHEADS.forEach((d, k) => LOOKAHEAD_FIELDS.forEach((f) => add(`look${k}.${f}`)));
  RAY_ANGLES_DEG.forEach((_, k) => add(`ray${k}`));
  for (let s = 0; s < OPPONENT_SLOTS; s++) OPPONENT_FIELDS.forEach((f) => add(`opp${s}.${f}`));
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
  out[i++] = SURFACE_PROPS[track.surfaceAt(car.px, car.pz)].grip;
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

  for (let slot = 0; slot < OPPONENT_SLOTS; slot++) {
    const id = slotToCarId(car.id, slot);
    const o = world.cars[id];
    if (!o || o.towed) {
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

  for (let k = 0; k < OBS.size; k++) out[k] = clamp(out[k], -1.5, 1.5);
  car.hitFrom.fill(0);
  car.hitTo.fill(0);
  car.hitAny = 0;
}
