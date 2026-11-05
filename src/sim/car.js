// Full 6-DOF rigid body on four raycast suspension struts, with a combined-slip
// tyre model, wheel rotation dynamics and a torque-converter automatic. Body
// roll, dive, squat and load transfer are not scripted: they emerge from the
// strut forces acting at the contact patches.
//
// Body frame: +X forward, +Y up, +Z right.

import { CAR, DAMAGE, TIRE, ENGINE, GRAVITY, FINISH_LINE_S, SURFACE_PROPS } from './config.js';
import { clamp, quatToMatrix } from './math.js';

const WHEEL_LAYOUT = [
  { x: CAR.wheelFrontX, z: -CAR.wheelZ, front: true, name: 'FL', mate: 1 },
  { x: CAR.wheelFrontX, z: CAR.wheelZ, front: true, name: 'FR', mate: 0 },
  { x: CAR.wheelRearX, z: -CAR.wheelZ, front: false, name: 'RL', mate: 3 },
  { x: CAR.wheelRearX, z: CAR.wheelZ, front: false, name: 'RR', mate: 2 },
];

const groundN = [0, 1, 0];
const midpointR = new Float64Array(9);
const omegaOut = [0, 0, 0];

// Below this contact speed a tyre behaves as a bristle anchored to the ground, so
// it holds a position up to the friction limit instead of creeping downhill.
const STICK_BAND = 0.4;
const BURNOUT_REAR_GRIP = 0.82;
const BRISTLE_STIFFNESS = 60000;
const BRISTLE_DAMPING = 6000;
const BRISTLE_RELAXATION = 0.3; // metres of rolling to forget a lateral wind-up

function bristleForce(deflection, speed, limit) {
  return clamp(-BRISTLE_STIFFNESS * deflection - BRISTLE_DAMPING * speed, -limit, limit);
}

const signedLap = (d, L) => ((((d + L / 2) % L) + L) % L) - L / 2;

export function createCar(id, roster, spawn, track) {
  const yaw = Math.atan2(-spawn.tz, spawn.tx);
  const car = {
    id,
    name: roster.name,
    colour: roster.colour,
    temper: roster.temper,

    px: spawn.x, py: 0, pz: spawn.z,
    qw: Math.cos(yaw / 2), qx: 0, qy: Math.sin(yaw / 2), qz: 0,
    vx: 0, vy: 0, vz: 0,
    wx: 0, wy: 0, wz: 0,
    R: new Float64Array(9),
    prev: { px: spawn.x, py: 0, pz: spawn.z, qw: 1, qx: 0, qy: 0, qz: 0 },

    fx: 0, fy: 0, fz: 0,
    tx: 0, ty: 0, tz: 0,

    input: { steer: 0, throttle: 0, brake: 0, handbrake: 0, reverse: 0 },
    steerAngle: 0,
    gear: 0,
    rpm: ENGINE.idleRpm,
    shiftTimer: 0,
    engineOn: true,

    wheels: WHEEL_LAYOUT.map((w) => ({
      ...w,
      omega: 0,
      angle: 0,
      comp: 0.1,
      load: 0,
      onGround: false,
      attached: true,
      hp: 1,
      slipRatio: 0,
      slipAngle: 0,
      slide: 0,
      bristleLat: 0,
      bristleLong: 0,
      contactX: 0, contactY: 0, contactZ: 0,
      surface: 0,
    })),

    alive: true,
    health: 1,
    engineHealth: 1,
    alignment: 0,
    zones: { front: 0, rear: 0, left: 0, right: 0 },

    score: 0,
    damageDealt: 0,
    knockouts: 0,
    laps: 0,
    lapsAnnounced: 0,
    finishFraction: Infinity,
    trackS: spawn.s,
    progress: signedLap(spawn.s - FINISH_LINE_S, track.length),
    lastProgressS: spawn.s,
    finishPos: 0,
    koReason: null,
    koTime: 0,

    lastHitter: -1,
    lastHitterTime: -999,
    flippedTime: 0,
    stallMark: signedLap(spawn.s - FINISH_LINE_S, track.length),
    stallTime: 0,
    airTime: 0,
    prevVy: 0,
    burningOut: false,
    weapon: 0,
    fireLock: 0,
    whirl: null,
    gripScale: 1,
    onOil: false,
    boxedTime: 0,
    backingUntil: 0,
    airborne: false,
    towed: false,
    racePos: 0,

    hitFrom: new Float32Array(16),
    hitTo: new Float32Array(16),
    hitAny: 0,
    progressRate: 0,
    groundContact: 0,
  };

  const groundY = track.heightAt(spawn.x, spawn.z);
  const rideHeight = CAR.wheelRadius + CAR.suspRestLength - 0.12 - CAR.hardpointY;
  car.py = groundY + rideHeight;
  quatToMatrix(car.qw, car.qx, car.qy, car.qz, car.R);
  storePrev(car);
  return car;
}

export function storePrev(car) {
  const p = car.prev;
  p.px = car.px; p.py = car.py; p.pz = car.pz;
  p.qw = car.qw; p.qx = car.qx; p.qy = car.qy; p.qz = car.qz;
}

function engineTorqueCurve(rpm) {
  // Fat, lazy V8: torque comes in early and fades past 4500.
  const x = rpm / 3400;
  const shape = 1 - 0.55 * (x - 1) * (x - 1);
  return ENGINE.peakTorque * clamp(shape, 0.35, 1);
}

function updateDrivetrain(car, dt) {
  const inp = car.input;
  const rl = car.wheels[2], rr = car.wheels[3];
  const axleOmega = 0.5 * (rl.omega + rr.omega);
  const forwardSpeed = car.vx * car.R[0] + car.vy * car.R[3] + car.vz * car.R[6];

  if (inp.reverse > 0.5 && forwardSpeed < 2 && car.gear >= 0) {
    car.gear = -1;
    car.shiftTimer = ENGINE.shiftTime;
  } else if (inp.reverse <= 0.5 && car.gear < 0 && forwardSpeed > -2) {
    car.gear = 0;
    car.shiftTimer = ENGINE.shiftTime;
  }

  const ratio = (car.gear < 0 ? ENGINE.reverseGear : ENGINE.gears[car.gear]) * ENGINE.finalDrive;
  const wheelRpm = Math.abs(axleOmega) * ratio * 9.5493;
  const converterRpm = ENGINE.stallRpm + inp.throttle * 1500;
  const slipping = wheelRpm < converterRpm && inp.throttle > 0.05;
  let rpm = Math.max(wheelRpm, ENGINE.idleRpm);
  if (slipping) rpm = Math.max(rpm, converterRpm);
  car.rpm += (rpm - car.rpm) * Math.min(1, dt * 18);

  // Shift on road speed, so a burnout doesn't run the box up through the gears.
  const roadRpm = (Math.abs(forwardSpeed) / CAR.wheelRadius) * ratio * 9.5493;
  const shiftRpm = Math.min(wheelRpm, roadRpm * 1.12);
  car.shiftTimer = Math.max(0, car.shiftTimer - dt);
  if (car.gear >= 0 && car.shiftTimer === 0) {
    if (shiftRpm > ENGINE.upshiftRpm && car.gear < ENGINE.gears.length - 1) {
      car.gear++;
      car.shiftTimer = ENGINE.shiftTime;
    } else if (shiftRpm < ENGINE.downshiftRpm && car.gear > 0) {
      car.gear--;
      car.shiftTimer = ENGINE.shiftTime * 0.6;
    }
  }

  let axleTorque = 0;
  if (car.engineOn && car.shiftTimer === 0 && inp.handbrake < 0.5) {
    if (inp.throttle > 0.01) {
      const limiter = car.rpm > ENGINE.limitRpm ? 0 : 1;
      const boost = slipping ? ENGINE.converterBoost : 1;
      const power = 0.3 + 0.7 * car.engineHealth;
      axleTorque = engineTorqueCurve(car.rpm) * inp.throttle * ratio * boost * power * limiter;
      if (car.gear < 0) axleTorque = -axleTorque;
    } else if (wheelRpm > ENGINE.idleRpm) {
      // Closed-throttle drag always opposes the way the axle is turning.
      axleTorque = -Math.sign(axleOmega) * (18 + car.rpm * 0.012) * ratio;
    }
  }

  const lock = clamp(ENGINE.lsdLock * (rl.omega - rr.omega), -ENGINE.lsdMaxTorque, ENGINE.lsdMaxTorque);
  rl.driveTorque = 0.5 * axleTorque - lock;
  rr.driveTorque = 0.5 * axleTorque + lock;
}

function tireShape(s) {
  return Math.sin(TIRE.shapeC * Math.atan(TIRE.shapeB * s));
}

export function stepCarForces(car, track, dt) {
  const R = car.R;
  const fwdX = R[0], fwdY = R[3], fwdZ = R[6];
  const upX = R[1], upY = R[4], upZ = R[7];
  const rgtX = R[2], rgtY = R[5], rgtZ = R[8];
  const inp = car.input;

  // Steering actuator. Bent tie-rods pull the wheels off-centre.
  const steerLimit = CAR.maxSteer * (0.65 + 0.35 * (1 - clamp(car.zones.front, 0, 1)));
  const target = clamp(inp.steer, -1, 1) * steerLimit + car.alignment;
  const maxDelta = CAR.steerRate * dt;
  car.steerAngle += clamp(target - car.steerAngle, -maxDelta, maxDelta);

  updateDrivetrain(car, dt);

  let fx = 0, fy = -CAR.mass * GRAVITY, fz = 0;
  let tx = 0, ty = 0, tz = 0;
  const cosD = Math.cos(car.steerAngle), sinD = Math.sin(car.steerAngle);
  let contacts = 0;

  // Every strut's compression first, so anti-roll forces don't depend on wheel order.
  for (let i = 0; i < 4; i++) {
    const w = car.wheels[i];
    w.onGround = false;
    w.load = 0;
    w.slide = 0;
    if (!w.attached) { w.comp = 0; continue; }
    w.hx = car.px + R[0] * w.x + R[1] * CAR.hardpointY + R[2] * w.z;
    w.hy = car.py + R[3] * w.x + R[4] * CAR.hardpointY + R[5] * w.z;
    w.hz = car.pz + R[6] * w.x + R[7] * CAR.hardpointY + R[8] * w.z;
    w.radius = w.hp < DAMAGE.flatTireAt ? CAR.wheelRadius * 0.82 : CAR.wheelRadius;
    let reach = Infinity;
    if (upY > 0.25) {
      reach = (w.hy - track.heightAt(w.hx, w.hz)) / upY;
      reach = (w.hy - track.heightAt(w.hx - upX * reach, w.hz - upZ * reach)) / upY;
    }
    w.reach = reach;
    w.comp = Math.max(0, CAR.suspRestLength + w.radius - reach);
  }

  for (let i = 0; i < 4; i++) {
    const w = car.wheels[i];
    if (!w.attached) continue;
    const { hx, hy, hz, radius, reach, comp } = w;
    const flat = w.hp < DAMAGE.flatTireAt;
    const brakeTorque =
      inp.brake * (w.front ? CAR.brakeTorqueFront : CAR.brakeTorqueRear) +
      (!w.front ? inp.handbrake * CAR.handbrakeTorque : 0);

    if (!(comp > 0)) {
      const inertia = CAR.wheelInertia * 4;
      let omega = w.omega * (1 - Math.min(1, dt * 1.5));
      if (!w.front) omega += ((w.driveTorque || 0) / inertia) * dt;
      const delta = (dt * brakeTorque) / inertia;
      w.omega = Math.abs(omega) <= delta ? 0 : omega - Math.sign(omega) * delta;
      w.angle += w.omega * dt;
      continue;
    }

    const cx = hx - upX * reach, cz = hz - upZ * reach, cy = hy - upY * reach;
    const rx = cx - car.px, ry = cy - car.py, rz = cz - car.pz;
    track.normalAt(cx, cz, groundN);
    const nx = groundN[0], ny = groundN[1], nz = groundN[2];

    const pvx = car.vx + car.wy * rz - car.wz * ry;
    const pvy = car.vy + car.wz * rx - car.wx * rz;
    const pvz = car.vz + car.wx * ry - car.wy * rx;

    const rate = -(pvx * nx + pvy * ny + pvz * nz);
    const damper = rate > 0 ? CAR.suspDampCompress : CAR.suspDampRebound;
    const mate = car.wheels[w.mate];
    const antiRoll = (w.front ? CAR.antiRollFront : CAR.antiRollRear) * (comp - mate.comp);
    let load = CAR.suspStiffness * comp + damper * rate + antiRoll;
    if (comp > CAR.suspTravel) load += CAR.bumpStopStiffness * (comp - CAR.suspTravel);
    load = clamp(load, 0, 45000);
    w.load = load;
    w.onGround = true;
    w.contactX = cx; w.contactY = cy; w.contactZ = cz;
    contacts++;

    // Tyre axes, tangent to the ground.
    const delta = w.front ? 1 : 0;
    const sD = sinD * delta, cD = delta ? cosD : 1;
    let wfx = fwdX * cD + rgtX * sD;
    let wfy = fwdY * cD + rgtY * sD;
    let wfz = fwdZ * cD + rgtZ * sD;
    const dn = wfx * nx + wfy * ny + wfz * nz;
    wfx -= nx * dn; wfy -= ny * dn; wfz -= nz * dn;
    const wl = Math.sqrt(wfx * wfx + wfy * wfy + wfz * wfz) || 1;
    wfx /= wl; wfy /= wl; wfz /= wl;
    const wrx = wfy * nz - wfz * ny;
    const wry = wfz * nx - wfx * nz;
    const wrz = wfx * ny - wfy * nx;

    const vLong = pvx * wfx + pvy * wfy + pvz * wfz;
    const vLat = pvx * wrx + pvy * wry + pvz * wrz;
    const denom = Math.max(Math.abs(vLong), TIRE.lowSpeedFloor);

    const surfaceId = track.surfaceAt(cx, cz);
    const surface = SURFACE_PROPS[surfaceId];
    w.surface = surfaceId;
    const relLoad = load / TIRE.loadReference;
    const loadGrip = 1 - TIRE.loadSensitivity * (relLoad - 1);
    const axleGrip = w.front ? TIRE.frontGrip : TIRE.rearGrip;
    const burnout = car.burningOut && !w.front ? BURNOUT_REAR_GRIP : 1;
    const mu = surface.grip * axleGrip * clamp(loadGrip, 0.6, 1.15) * (flat ? 0.5 : 1) * burnout * car.gripScale;

    const slipRatio = (w.omega * radius - vLong) / denom;
    const slipTan = vLat / denom;
    const sx = slipRatio / TIRE.peakSlipRatio;
    const sy = slipTan / TIRE.peakSlipTan;
    const s = Math.sqrt(sx * sx + sy * sy) + 1e-6;
    const fMag = mu * load * tireShape(s);
    const steadyLongF = (fMag * sx) / s;
    let latF = (-fMag * sy) / s;
    const latSpeed = Math.abs(vLat);
    if (latSpeed < STICK_BAND) {
      const reach = (mu * load) / BRISTLE_STIFFNESS;
      w.bristleLat = clamp((w.bristleLat + vLat * dt) * Math.exp((-Math.abs(vLong) * dt) / BRISTLE_RELAXATION), -reach, reach);
      latF += (bristleForce(w.bristleLat, vLat, mu * load) - latF) * (1 - latSpeed / STICK_BAND);
    } else {
      w.bristleLat = 0;
    }

    // Linearly implicit wheel spin: the secant slope of the tyre curve keeps
    // this stable at any speed, including the instant before lock-up.
    const secant = ((fMag / s) * radius) / (denom * TIRE.peakSlipRatio);
    const inertia = CAR.wheelInertia + dt * radius * secant;
    const driven = w.front ? 0 : w.driveTorque || 0;
    let omega = w.omega + (dt * (driven - radius * steadyLongF)) / inertia;
    const brakeDelta = (dt * brakeTorque) / inertia;
    omega = Math.abs(omega) <= brakeDelta ? 0 : omega - Math.sign(omega) * brakeDelta;
    // The chassis feels the same implicit force the wheel just reacted against.
    let longF = clamp(steadyLongF + secant * (omega - w.omega), -mu * load, mu * load);
    const longSpeed = Math.abs(vLong);
    if (omega === 0 && longSpeed < STICK_BAND) {
      const limit = Math.min(brakeTorque / radius, mu * load);
      w.bristleLong = clamp(w.bristleLong + vLong * dt, -limit / BRISTLE_STIFFNESS, limit / BRISTLE_STIFFNESS);
      longF += (bristleForce(w.bristleLong, vLong, limit) - longF) * (1 - longSpeed / STICK_BAND);
    } else {
      w.bristleLong = 0;
    }
    w.omega = omega;
    w.angle += omega * dt;

    w.slipRatio = slipRatio;
    w.slipAngle = Math.atan2(vLat, Math.abs(vLong) + 0.5);
    w.slide = Math.hypot(omega * radius - vLong, vLat);

    const rollDir = clamp(vLong, -1, 1);
    const roll = -(CAR.rollingResistance + surface.drag) * load * rollDir;

    const Fx = nx * load + wfx * (longF + roll) + wrx * latF;
    const Fy = ny * load + wfy * (longF + roll) + wry * latF;
    const Fz = nz * load + wfz * (longF + roll) + wrz * latF;
    fx += Fx; fy += Fy; fz += Fz;
    const lever = ry * TIRE.forceLever;
    tx += lever * Fz - rz * Fy;
    ty += rz * Fx - rx * Fz;
    tz += rx * Fy - lever * Fx;
  }

  const speed = Math.sqrt(car.vx * car.vx + car.vy * car.vy + car.vz * car.vz);
  fx -= CAR.dragArea * speed * car.vx;
  fy -= CAR.dragArea * speed * car.vy;
  fz -= CAR.dragArea * speed * car.vz;

  car.groundContact = contacts;

  // Semi-implicit Euler: velocities now, positions after the contact solve.
  const im = dt / CAR.mass;
  car.vx += fx * im;
  car.vy += fy * im;
  car.vz += fz * im;
  applyBodyTorque(car, tx * dt, ty * dt, tz * dt);

  const angDamp = 1 - 0.25 * dt;
  car.wx *= angDamp; car.wy *= angDamp; car.wz *= angDamp;
}

// Adds I^-1 * (tx, ty, tz) to the angular velocity.
export function applyBodyTorque(car, tx, ty, tz) {
  const R = car.R;
  const I = CAR.inertia;
  const bx = (R[0] * tx + R[3] * ty + R[6] * tz) / I.roll;
  const by = (R[1] * tx + R[4] * ty + R[7] * tz) / I.yaw;
  const bz = (R[2] * tx + R[5] * ty + R[8] * tz) / I.pitch;
  car.wx += R[0] * bx + R[1] * by + R[2] * bz;
  car.wy += R[3] * bx + R[4] * by + R[5] * bz;
  car.wz += R[6] * bx + R[7] * by + R[8] * bz;
}

export function integratePosition(car, dt) {
  car.px += car.vx * dt;
  car.py += car.vy * dt;
  car.pz += car.vz * dt;
  const w = Math.sqrt(car.wx * car.wx + car.wy * car.wy + car.wz * car.wz);
  if (w > 22) {
    const k = 22 / w;
    car.wx *= k; car.wy *= k; car.wz *= k;
  }
  // Free tumbling conserves angular momentum, not angular velocity: carry L in
  // world space across the rotation and recover the new velocity from it.
  const I = CAR.inertia;
  const R = car.R;
  const lbx = (R[0] * car.wx + R[3] * car.wy + R[6] * car.wz) * I.roll;
  const lby = (R[1] * car.wx + R[4] * car.wy + R[7] * car.wz) * I.yaw;
  const lbz = (R[2] * car.wx + R[5] * car.wy + R[8] * car.wz) * I.pitch;
  const lx = R[0] * lbx + R[1] * lby + R[2] * lbz;
  const ly = R[3] * lbx + R[4] * lby + R[5] * lbz;
  const lz = R[6] * lbx + R[7] * lby + R[8] * lbz;

  // Midpoint step: rotating with the start-of-step velocity would heat a tumble.
  const qw = car.qw, qx = car.qx, qy = car.qy, qz = car.qz;
  const hw = 0.25 * dt;
  let mw = qw + hw * (-car.wx * qx - car.wy * qy - car.wz * qz);
  let mx = qx + hw * (car.wx * qw + car.wy * qz - car.wz * qy);
  let my = qy + hw * (car.wy * qw + car.wz * qx - car.wx * qz);
  let mz = qz + hw * (car.wz * qw + car.wx * qy - car.wy * qx);
  const nm = 1 / Math.sqrt(mw * mw + mx * mx + my * my + mz * mz);
  mw *= nm; mx *= nm; my *= nm; mz *= nm;
  quatToMatrix(mw, mx, my, mz, midpointR);
  omegaFromMomentum(midpointR, lx, ly, lz, omegaOut);
  const ox = omegaOut[0], oy = omegaOut[1], oz = omegaOut[2];

  const fw = 0.5 * dt;
  car.qw = qw + fw * (-ox * mx - oy * my - oz * mz);
  car.qx = qx + fw * (ox * mw + oy * mz - oz * my);
  car.qy = qy + fw * (oy * mw + oz * mx - ox * mz);
  car.qz = qz + fw * (oz * mw + ox * my - oy * mx);
  const n = 1 / Math.sqrt(car.qw * car.qw + car.qx * car.qx + car.qy * car.qy + car.qz * car.qz);
  car.qw *= n; car.qx *= n; car.qy *= n; car.qz *= n;
  quatToMatrix(car.qw, car.qx, car.qy, car.qz, R);

  omegaFromMomentum(R, lx, ly, lz, omegaOut);
  car.wx = omegaOut[0];
  car.wy = omegaOut[1];
  car.wz = omegaOut[2];
}

function omegaFromMomentum(R, lx, ly, lz, out) {
  const I = CAR.inertia;
  const bx = (R[0] * lx + R[3] * ly + R[6] * lz) / I.roll;
  const by = (R[1] * lx + R[4] * ly + R[7] * lz) / I.yaw;
  const bz = (R[2] * lx + R[5] * ly + R[8] * lz) / I.pitch;
  out[0] = R[0] * bx + R[1] * by + R[2] * bz;
  out[1] = R[3] * bx + R[4] * by + R[5] * bz;
  out[2] = R[6] * bx + R[7] * by + R[8] * bz;
}
