// Impulse-based contacts: car against car, car against wall, chassis against
// ground. Each contact pushes on the rigid bodies at the actual contact point,
// so a hit above the centre of gravity rolls a car and an off-centre hit spins it.

import { CAR, CONTACT, DAMAGE } from './config.js';
import { clamp } from './math.js';
import { applyBodyTorque } from './car.js';

const BOX = CAR.box;
const HALF = [BOX.halfLength, BOX.halfHeight, BOX.halfWidth];
const INV_MASS = 1 / CAR.mass;

const LOCAL_POINTS = [];
for (const sy of [-1, 1]) {
  for (const sx of [-1, -0.42, 0.42, 1]) {
    for (const sz of [-1, 1]) {
      LOCAL_POINTS.push([sx * BOX.halfLength, BOX.centreY + sy * BOX.halfHeight, sz * BOX.halfWidth]);
    }
  }
  LOCAL_POINTS.push([BOX.halfLength, BOX.centreY + sy * BOX.halfHeight, 0]);
  LOCAL_POINTS.push([-BOX.halfLength, BOX.centreY + sy * BOX.halfHeight, 0]);
}

const worldA = new Float64Array(LOCAL_POINTS.length * 3);
const worldB = new Float64Array(LOCAL_POINTS.length * 3);
const tmpNormal = [0, 1, 0];
const tmpGrad = [0, 0];
const velScratch = [0, 0, 0];

function transformPoints(car, out) {
  const R = car.R;
  for (let i = 0; i < LOCAL_POINTS.length; i++) {
    const p = LOCAL_POINTS[i];
    out[i * 3] = car.px + R[0] * p[0] + R[1] * p[1] + R[2] * p[2];
    out[i * 3 + 1] = car.py + R[3] * p[0] + R[4] * p[1] + R[5] * p[2];
    out[i * 3 + 2] = car.pz + R[6] * p[0] + R[7] * p[1] + R[8] * p[2];
  }
}

// I^-1 applied to r x n, then crossed with r: the angular part of the
// effective mass along n for a body hit at offset r.
function angularTerm(car, rx, ry, rz, nx, ny, nz) {
  const cx = ry * nz - rz * ny;
  const cy = rz * nx - rx * nz;
  const cz = rx * ny - ry * nx;
  const R = car.R;
  const I = CAR.inertia;
  const bx = (R[0] * cx + R[3] * cy + R[6] * cz) / I.roll;
  const by = (R[1] * cx + R[4] * cy + R[7] * cz) / I.yaw;
  const bz = (R[2] * cx + R[5] * cy + R[8] * cz) / I.pitch;
  const wx = R[0] * bx + R[1] * by + R[2] * bz;
  const wy = R[3] * bx + R[4] * by + R[5] * bz;
  const wz = R[6] * bx + R[7] * by + R[8] * bz;
  return cx * wx + cy * wy + cz * wz;
}

function applyImpulse(car, jx, jy, jz, rx, ry, rz) {
  car.vx += jx * INV_MASS;
  car.vy += jy * INV_MASS;
  car.vz += jz * INV_MASS;
  applyBodyTorque(car, ry * jz - rz * jy, rz * jx - rx * jz, rx * jy - ry * jx);
}

function pointVelocity(car, rx, ry, rz, out) {
  out[0] = car.vx + car.wy * rz - car.wz * ry;
  out[1] = car.vy + car.wz * rx - car.wx * rz;
  out[2] = car.vz + car.wx * ry - car.wy * rx;
}

const vA = [0, 0, 0];
const vB = [0, 0, 0];

// Solves one contact against a moving partner (b) or the static world (b = null).
// The normal points toward car a. Returns the normal impulse magnitude applied.
function solveContact(a, b, px, py, pz, nx, ny, nz, restitution, friction, firstPass, lever = 1) {
  // Against a car or a wall the blow arrives through the sills and bumpers, low on
  // the body, not at a corner of a rigid box, so it barely levers the car over.
  const rax = px - a.px, ray = (py - a.py) * lever, raz = pz - a.pz;
  pointVelocity(a, rax, ray, raz, vA);
  let relX = vA[0], relY = vA[1], relZ = vA[2];
  let rbx = 0, rby = 0, rbz = 0;
  if (b) {
    rbx = px - b.px; rby = (py - b.py) * lever; rbz = pz - b.pz;
    pointVelocity(b, rbx, rby, rbz, vB);
    relX -= vB[0]; relY -= vB[1]; relZ -= vB[2];
  }
  const vn = relX * nx + relY * ny + relZ * nz;
  if (vn >= 0) return 0;

  let k = INV_MASS + angularTerm(a, rax, ray, raz, nx, ny, nz);
  if (b) k += INV_MASS + angularTerm(b, rbx, rby, rbz, nx, ny, nz);
  const bounce = firstPass && vn < -1.5 ? restitution : 0;
  const j = (-(1 + bounce) * vn) / k;

  applyImpulse(a, nx * j, ny * j, nz * j, rax, ray, raz);
  if (b) applyImpulse(b, -nx * j, -ny * j, -nz * j, rbx, rby, rbz);

  // Coulomb friction along the sliding direction.
  let tx = relX - vn * nx, ty = relY - vn * ny, tz = relZ - vn * nz;
  const ts = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (ts > 1e-4) {
    tx /= ts; ty /= ts; tz /= ts;
    let kt = INV_MASS + angularTerm(a, rax, ray, raz, tx, ty, tz);
    if (b) kt += INV_MASS + angularTerm(b, rbx, rby, rbz, tx, ty, tz);
    const jt = Math.min(ts / kt, friction * j);
    applyImpulse(a, -tx * jt, -ty * jt, -tz * jt, rax, ray, raz);
    if (b) applyImpulse(b, tx * jt, ty * jt, tz * jt, rbx, rby, rbz);
  }
  return j;
}

function boxCentre(car, out) {
  out[0] = car.px + car.R[1] * BOX.centreY;
  out[1] = car.py + car.R[4] * BOX.centreY;
  out[2] = car.pz + car.R[7] * BOX.centreY;
}

const cA = [0, 0, 0];
const cB = [0, 0, 0];
const axes = new Float64Array(18);

function loadAxes(a, b) {
  for (let i = 0; i < 3; i++) {
    axes[i * 3] = a.R[i]; axes[i * 3 + 1] = a.R[3 + i]; axes[i * 3 + 2] = a.R[6 + i];
    axes[9 + i * 3] = b.R[i]; axes[9 + i * 3 + 1] = b.R[3 + i]; axes[9 + i * 3 + 2] = b.R[6 + i];
  }
}

function projectedRadius(offset, lx, ly, lz) {
  let r = 0;
  for (let i = 0; i < 3; i++) {
    const o = offset + i * 3;
    r += HALF[i] * Math.abs(axes[o] * lx + axes[o + 1] * ly + axes[o + 2] * lz);
  }
  return r;
}

// Depth of a world point inside a car's box, or -1 when outside.
function depthInside(car, x, y, z) {
  const dx = x - car.px - car.R[1] * BOX.centreY;
  const dy = y - car.py - car.R[4] * BOX.centreY;
  const dz = z - car.pz - car.R[7] * BOX.centreY;
  const R = car.R;
  const lx = Math.abs(R[0] * dx + R[3] * dy + R[6] * dz);
  const ly = Math.abs(R[1] * dx + R[4] * dy + R[7] * dz);
  const lz = Math.abs(R[2] * dx + R[5] * dy + R[8] * dz);
  const d = Math.min(HALF[0] - lx, HALF[1] - ly, HALF[2] - lz);
  return d;
}

const contactPts = new Float64Array(48 * 4);

export function collideCars(a, b, onHit) {
  const dx0 = a.px - b.px, dy0 = a.py - b.py, dz0 = a.pz - b.pz;
  if (dx0 * dx0 + dy0 * dy0 + dz0 * dz0 > 29.2) return;

  boxCentre(a, cA);
  boxCentre(b, cB);
  const dx = cA[0] - cB[0], dy = cA[1] - cB[1], dz = cA[2] - cB[2];
  loadAxes(a, b);

  let bestOverlap = Infinity, bestScore = Infinity, nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < 6; i++) {
    const lx = axes[i * 3], ly = axes[i * 3 + 1], lz = axes[i * 3 + 2];
    const d = dx * lx + dy * ly + dz * lz;
    const overlap = projectedRadius(0, lx, ly, lz) + projectedRadius(9, lx, ly, lz) - Math.abs(d);
    if (overlap <= 0) return;
    // Up axes are penalised so cars grind rather than popping on top of each other.
    const score = i === 1 || i === 4 ? overlap * 2.2 : overlap;
    if (score < bestScore) {
      bestScore = score;
      bestOverlap = overlap;
      const sign = d >= 0 ? 1 : -1;
      nx = lx * sign; ny = ly * sign; nz = lz * sign;
    }
  }

  // Edge-cross-edge axes can prove tilted boxes apart when no face normal does.
  // They only reject: contact normals stay on the faces.
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const ax = axes[i * 3], ay = axes[i * 3 + 1], az = axes[i * 3 + 2];
      const bx = axes[9 + j * 3], by = axes[9 + j * 3 + 1], bz = axes[9 + j * 3 + 2];
      let lx = ay * bz - az * by;
      let ly = az * bx - ax * bz;
      let lz = ax * by - ay * bx;
      const len = Math.sqrt(lx * lx + ly * ly + lz * lz);
      if (len < 1e-3) continue;
      lx /= len; ly /= len; lz /= len;
      const d = Math.abs(dx * lx + dy * ly + dz * lz);
      if (projectedRadius(0, lx, ly, lz) + projectedRadius(9, lx, ly, lz) - d <= 0) return;
    }
  }

  transformPoints(a, worldA);
  transformPoints(b, worldB);
  let count = 0;
  const addPoints = (points, other) => {
    for (let i = 0; i < LOCAL_POINTS.length; i++) {
      const x = points[i * 3], y = points[i * 3 + 1], z = points[i * 3 + 2];
      const d = depthInside(other, x, y, z);
      if (d > -0.02) {
        contactPts[count * 4] = x; contactPts[count * 4 + 1] = y; contactPts[count * 4 + 2] = z;
        contactPts[count * 4 + 3] = d;
        count++;
      }
    }
  };
  addPoints(worldA, b);
  addPoints(worldB, a);
  if (count === 0) {
    const rA = projectedRadius(0, nx, ny, nz);
    contactPts[0] = cA[0] - nx * (rA - bestOverlap * 0.5);
    contactPts[1] = cA[1] - ny * (rA - bestOverlap * 0.5);
    contactPts[2] = cA[2] - nz * (rA - bestOverlap * 0.5);
    count = 1;
  }

  // Centroid of the touching region, for damage zones and effects.
  let mx = 0, my = 0, mz = 0;
  for (let i = 0; i < count; i++) {
    mx += contactPts[i * 4]; my += contactPts[i * 4 + 1]; mz += contactPts[i * 4 + 2];
  }
  mx /= count; my /= count; mz /= count;

  const uA = -(a.vx * nx + a.vy * ny + a.vz * nz);
  const uB = b.vx * nx + b.vy * ny + b.vz * nz;
  const relBefore = uA + uB;

  let jTotal = 0;
  const useEach = Math.max(1, Math.floor(count / 6));
  for (let iter = 0; iter < CONTACT.solverIterations; iter++) {
    for (let i = 0; i < count; i += useEach) {
      jTotal += solveContact(
        a, b,
        contactPts[i * 4], contactPts[i * 4 + 1], contactPts[i * 4 + 2],
        nx, ny, nz, CONTACT.carRestitution, CONTACT.carFriction, iter === 0, CONTACT.carContactLever,
      );
    }
  }

  const push = Math.min(bestOverlap * CONTACT.positionCorrection, CONTACT.maxCorrectionPerStep) * 0.5;
  a.px += nx * push; a.py += ny * push; a.pz += nz * push;
  b.px -= nx * push; b.py -= ny * push; b.pz -= nz * push;

  if (jTotal > 0) onHit(a, b, jTotal, mx, my, mz, nx, ny, nz, uA, uB, relBefore);
}

export function collideWall(car, track, onWall) {
  if (track.sdfAt(car.px, car.pz) > 3.2) return;
  transformPoints(car, worldA);

  let solved = 0, mx = 0, my = 0, mz = 0, jTotal = 0, gx = 0, gz = 0, deepest = 0;
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < LOCAL_POINTS.length; i++) {
      const x = worldA[i * 3], y = worldA[i * 3 + 1], z = worldA[i * 3 + 2];
      const d = track.sdfAt(x, z);
      if (d >= 0) continue;
      track.sdfGradient(x, z, tmpGrad);
      const j = solveContact(car, null, x, y, z, tmpGrad[0], 0, tmpGrad[1],
        CONTACT.wallRestitution, CONTACT.wallFriction, iter === 0, CONTACT.wallContactLever);
      if (j > 0) {
        solved++;
        jTotal += j;
        mx += x; my += y; mz += z;
        gx = tmpGrad[0]; gz = tmpGrad[1];
      }
      if (-d > deepest) {
        deepest = -d;
        gx = tmpGrad[0]; gz = tmpGrad[1];
      }
    }
  }
  if (deepest > 0) {
    const push = Math.min(deepest * 0.5, CONTACT.maxCorrectionPerStep * 2);
    car.px += gx * push;
    car.pz += gz * push;
  }
  if (solved > 0) onWall(car, jTotal, mx / solved, my / solved, mz / solved, gx, gz);
}

export function collideGround(car, track, onScrape) {
  transformPoints(car, worldA);
  let maxDepth = 0, scrape = 0, sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < LOCAL_POINTS.length; i++) {
    const x = worldA[i * 3], y = worldA[i * 3 + 1], z = worldA[i * 3 + 2];
    const h = track.heightAt(x, z);
    if (y >= h) continue;
    const depth = h - y;
    track.normalAt(x, z, tmpNormal);
    const j = solveContact(car, null, x, y, z, tmpNormal[0], tmpNormal[1], tmpNormal[2],
      CONTACT.groundRestitution, CONTACT.groundFriction, true);
    if (depth > maxDepth) maxDepth = depth;
    if (j > 0) {
      pointVelocity(car, x - car.px, y - car.py, z - car.pz, velScratch);
      const sp = Math.hypot(velScratch[0], velScratch[2]);
      if (sp > scrape) { scrape = sp; sx = x; sy = y; sz = z; }
    }
  }
  if (maxDepth > 0) car.py += Math.min(maxDepth * 0.4, CONTACT.maxCorrectionPerStep);
  if (scrape > 3) onScrape(car, scrape, sx, sy, sz);
}

// Turns a normal impulse into the damage one car takes, given the unit normal
// pointing out of that car toward what it hit.
export function damageFromImpulse(car, impulse, outX, outY, outZ, scale, zones) {
  const dv = impulse * INV_MASS;
  if (dv < DAMAGE.deltaVThreshold) return 0;
  const R = car.R;
  const f = R[0] * outX + R[3] * outY + R[6] * outZ;
  const r = R[2] * outX + R[5] * outY + R[8] * outZ;
  let multiplier;
  let zone;
  if (f > 0.7) { multiplier = DAMAGE.zoneMultiplier.front; zone = 'front'; }
  else if (f < -0.7) { multiplier = DAMAGE.zoneMultiplier.rear; zone = 'rear'; }
  else { multiplier = DAMAGE.zoneMultiplier.side; zone = r > 0 ? 'right' : 'left'; }
  const amount = Math.pow(dv - DAMAGE.deltaVThreshold, DAMAGE.exponent) * DAMAGE.scale * multiplier * scale;
  if (zones) zones.zone = zone;
  return clamp(amount, 0, 0.6);
}

export { LOCAL_POINTS };
