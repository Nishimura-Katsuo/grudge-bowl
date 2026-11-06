// A course is one closed road tied through itself. Everything downstream (walls,
// crossings, racing line, pace notes) is derived from its control points, so each
// layout lives in one table in courses.js.
//
// World axes: X and Z span the ground, Y is up. A heading (fx, fz) has its
// right-hand side at (-fz, fx).

import { clamp, smoothstep } from './math.js';
import { GRAVITY, GRID_LINE_S, SURFACE, SURFACE_PROPS, TRACK } from './config.js';
import { COURSES } from './courses.js';

const SAMPLE_STEP = 1;
const CELL = 1;
const HEIGHT_RES = 0.5;
const MARGIN = 34;
const STAMP_REACH = 16; // metres of sdf kept outside the road
const FINISH_BEHIND_GRID = 122; // the line is behind the grid, so the first lap is short

function catmullRom(points) {
  const n = points.length;
  const raw = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i + n - 1) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    const t1 = Math.sqrt(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]));
    const t2 = t1 + Math.sqrt(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]));
    const t3 = t2 + Math.sqrt(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]));
    const mix = (a, b, ta, tb, t) => [
      (a[0] * (tb - t) + b[0] * (t - ta)) / (tb - ta),
      (a[1] * (tb - t) + b[1] * (t - ta)) / (tb - ta),
    ];
    for (let u = 0; u < 60; u++) {
      const t = t1 + ((t2 - t1) * u) / 60;
      const a1 = mix(p0, p1, 0, t1, t), a2 = mix(p1, p2, t1, t2, t), a3 = mix(p2, p3, t2, t3, t);
      raw.push(mix(mix(a1, a2, 0, t2, t), mix(a2, a3, t1, t3, t), t1, t2, t));
    }
  }
  return raw;
}

function smoothLoop(values, passes) {
  const n = values.length;
  let a = Float64Array.from(values), b = new Float64Array(n);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) b[i] = (a[(i + n - 1) % n] + 2 * a[i] + a[(i + 1) % n]) / 4;
    [a, b] = [b, a];
  }
  return a;
}

// Tangents and signed curvature of a closed polyline. Positive curves right.
function differentiate(px, pz, step) {
  const n = px.length;
  const tx = new Float64Array(n), tz = new Float64Array(n), curv = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const dx = px[(i + 1) % n] - px[(i + n - 1) % n];
    const dz = pz[(i + 1) % n] - pz[(i + n - 1) % n];
    const l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l;
  }
  const w = 4;
  for (let i = 0; i < n; i++) {
    const a = (i + n - w) % n, b = (i + w) % n;
    curv[i] = (tx[a] * tz[b] - tz[a] * tx[b]) / (2 * w * step);
  }
  return { tx, tz, curv };
}

function buildCentreline(control) {
  const raw = catmullRom(control);
  const cum = new Float64Array(raw.length + 1);
  for (let i = 1; i <= raw.length; i++) {
    const a = raw[i - 1], b = raw[i % raw.length];
    cum[i] = cum[i - 1] + Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  const rawLength = cum[raw.length];
  const n = Math.round(rawLength / SAMPLE_STEP);
  let px = new Float64Array(n), pz = new Float64Array(n);
  for (let i = 0, j = 0; i < n; i++) {
    const s = (i / n) * rawLength;
    while (cum[j + 1] < s) j++;
    const u = (s - cum[j]) / (cum[j + 1] - cum[j]);
    const a = raw[j], b = raw[(j + 1) % raw.length];
    px[i] = a[0] + (b[0] - a[0]) * u;
    pz[i] = a[1] + (b[1] - a[1]) * u;
  }
  px = smoothLoop(px, 30);
  pz = smoothLoop(pz, 30);
  let length = 0;
  for (let i = 0; i < n; i++) length += Math.hypot(px[(i + 1) % n] - px[i], pz[(i + 1) % n] - pz[i]);
  const step = length / n;
  // Where each control point fell, so a feature can be placed by the corner it belongs to.
  const anchors = control.map((_, i) => (cum[i * 60] / rawLength) * length);
  return { n, step, length, anchors, px, pz, ...differentiate(px, pz, step) };
}

// Every place the road crosses itself, found from the geometry.
function findCrossings(c) {
  const { n, px, pz, step } = c;
  const found = [];
  const minApart = Math.ceil(30 / step);
  for (let i = 0; i < n; i++) {
    const ax = px[i], az = pz[i], bx = px[(i + 1) % n], bz = pz[(i + 1) % n];
    for (let j = i + minApart; j < n; j++) {
      if (i + n - j < minApart) continue;
      const ex = px[j], ez = pz[j], fx = px[(j + 1) % n], fz = pz[(j + 1) % n];
      const d = (bx - ax) * (fz - ez) - (bz - az) * (fx - ex);
      if (Math.abs(d) < 1e-9) continue;
      const u = ((ex - ax) * (fz - ez) - (ez - az) * (fx - ex)) / d;
      const v = ((ex - ax) * (bz - az) - (ez - az) * (bx - ax)) / d;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      found.push({
        id: found.length,
        x: ax + (bx - ax) * u,
        z: az + (bz - az) * u,
        sA: (i + u) * step,
        sB: (j + v) * step,
        angle: Math.acos(Math.min(1, Math.abs(c.tx[i] * c.tx[j] + c.tz[i] * c.tz[j]))),
      });
    }
  }
  return found;
}

const routeTo = (from, to, length) => ((to - from) % length + length) % length;

// Hills. The road takes the ground's height, eased so a crest doesn't throw cars and
// so both strands of a crossroads meet at one level.
function elevationProfile(c, passes, course, jumps) {
  const { n, step, px, pz, length, anchors } = c;
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = course.ground(px[i], pz[i]);
  if (course.climb) {
    anchors.forEach((from, k) => {
      const next = (k + 1) % anchors.length;
      const span = routeTo(from, anchors[next], length);
      for (let d = 0; d < span; d += step) {
        const i = Math.round((from + d) / step) % n;
        raw[i] = course.climb[k] + (course.climb[next] - course.climb[k]) * (d / span);
      }
    });
  }
  const eased = smoothLoop(raw, 500);
  const meet = TRACK.flatAroundCrossing;
  for (const p of passes) {
    const shared = (eased[Math.round(p.s / step) % n] + eased[Math.round(p.other / step) % n]) / 2;
    for (let i = 0; i < n; i++) {
      const d = Math.min(routeTo(p.s, i * step, length), routeTo(i * step, p.s, length));
      if (d < meet) eased[i] += (shared - eased[i]) * (1 - smoothstep(meet * 0.4, meet, d));
    }
  }
  // A kicker needs a steady run-up and a landing, so the road is level from ramp to touchdown.
  for (const j of jumps) {
    const reach = routeTo(j.startS, j.landS, length);
    const flat = eased[Math.round(j.lipS / step) % n];
    for (let i = 0; i < n; i++) {
      const s = i * step;
      const d = routeTo(j.startS, s, length) <= reach ? 0 : Math.min(routeTo(s, j.startS, length), routeTo(j.landS, s, length));
      if (d < 30) eased[i] += (flat - eased[i]) * (1 - smoothstep(0, 30, d));
    }
  }
  return smoothLoop(eased, 60);
}

function halfWidthProfile(c, zones, base) {
  const hw = new Float64Array(c.n);
  for (let i = 0; i < c.n; i++) {
    let w = base;
    const s = i * c.step;
    for (const z of zones) {
      const d = Math.min(routeTo(z.s, s, c.length), routeTo(s, z.s, c.length));
      w += (z.halfWidth - base) * (1 - smoothstep(z.span * 0.6, z.span, d));
    }
    hw[i] = w;
  }
  return hw;
}

// A kicker: curves up, then holds a steady slope to the lip so the springs have
// settled by take-off. Compressed rear springs at the lip pitch a car onto its nose.
function hump(jump, s, length) {
  const ramp = jump.lipS - jump.startS;
  const before = routeTo(s, jump.lipS, length);
  if (before <= ramp) {
    const x = ramp - before;
    const blend = ramp * TRACK.rampCurveShare;
    const slope = jump.height / (ramp - blend / 2);
    return x < blend ? (slope * x * x) / (2 * blend) : slope * (x - blend / 2);
  }
  const after = routeTo(jump.lipS, s, length);
  const fall = jump.endS - jump.lipS;
  return after <= fall ? jump.height * (1 - smoothstep(0, 1, after / fall)) : 0;
}

// Bends the road's centre into the gentlest curve that fits between the walls:
// wide on entry, tight at the apex, wide on exit.
function racingLine(c, hw) {
  const { n, px, pz, tx, tz, step } = c;
  const off = new Float64Array(n);
  const lx = new Float64Array(n), lz = new Float64Array(n);
  const reach = TRACK.lineMargin;
  for (const [span, passes] of [[22, 1600], [11, 900], [6, 500]]) {
    for (let p = 0; p < passes; p++) {
      for (let i = 0; i < n; i++) {
        lx[i] = px[i] - tz[i] * off[i];
        lz[i] = pz[i] + tx[i] * off[i];
      }
      for (let i = 0; i < n; i++) {
        const a2 = (i + n - 2 * span) % n, a1 = (i + n - span) % n, b1 = (i + span) % n, b2 = (i + 2 * span) % n;
        const mx = -(lx[a2] - 4 * lx[a1] + 6 * lx[i] - 4 * lx[b1] + lx[b2]);
        const mz = -(lz[a2] - 4 * lz[a1] + 6 * lz[i] - 4 * lz[b1] + lz[b2]);
        off[i] = clamp(off[i] + 0.05 * (mx * -tz[i] + mz * tx[i]), -(hw[i] - reach), hw[i] - reach);
      }
    }
  }
  const smooth = smoothLoop(off, 40);
  const ox = new Float64Array(n), oz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    ox[i] = px[i] - tz[i] * smooth[i];
    oz[i] = pz[i] + tx[i] * smooth[i];
  }
  const d = differentiate(ox, oz, step);
  return { offset: smooth, px: ox, pz: oz, tx: d.tx, tz: d.tz, curv: smoothLoop(d.curv, 12) };
}

// The speed that gets a car round everything ahead of it, held below the grip
// limit by a backward pass. Nothing brakes in the air.
function paceNotes(c, line, surfaceGrip, jumps, gravity, elevation) {
  const { n, step } = c;
  const pace = new Float64Array(n);
  const noBrake = new Uint8Array(n);
  for (const j of jumps) {
    const from = Math.round(j.lipS / step), count = Math.round(j.airLength / step);
    for (let k = 0; k < count; k++) noBrake[(from + k) % n] = 1;
  }
  for (let i = 0; i < n; i++) {
    const mu = TRACK.paceGrip * surfaceGrip[i];
    pace[i] = Math.min(TRACK.topSpeed, Math.sqrt((mu * gravity) / Math.max(1e-4, Math.abs(line.curv[i]))));
  }
  // Over a crest the road falls away, and a car that leaves it can't steer or brake.
  if (elevation) {
    const reach = Math.round(8 / step);
    for (let i = 0; i < n; i++) {
      const dip = (2 * elevation[i] - elevation[(i + reach) % n] - elevation[(i + n - reach) % n]) / (reach * step) ** 2;
      if (dip > 0) pace[i] = Math.min(pace[i], Math.sqrt((TRACK.crestGrip * gravity) / dip));
    }
  }
  // The speed a jump is built for holds from the lip until the wheels are back down.
  for (const j of jumps) {
    const lip = Math.round(j.lipS / step);
    for (let k = 0; k < j.airLength / step; k++) pace[(lip + k) % n] = Math.min(pace[(lip + k) % n], j.maxSpeed);
  }
  for (let k = 2 * n; k > 0; k--) {
    const i = k % n, prev = (k - 1) % n;
    if (noBrake[prev]) { pace[prev] = Math.min(pace[prev], pace[i]); continue; }
    const mu = TRACK.paceGrip * surfaceGrip[prev];
    const cornering = (pace[i] * pace[i] * Math.abs(line.curv[prev])) / (mu * gravity);
    const left = Math.sqrt(Math.max(0.05, 1 - cornering * cornering));
    pace[prev] = Math.min(pace[prev], Math.sqrt(pace[i] * pace[i] + 2 * TRACK.paceBrake * mu * gravity * left * step));
  }
  return smoothLoop(pace, 3);
}

// Walks the sdf = 0 contour into closed loops, for the barrier meshes.
function traceWalls(sdf, nx, nz, minX, minZ, cell) {
  const next = new Map();
  const pointOf = new Map();
  const edgePoint = (ix, iz, horizontal) => {
    const key = (iz * nx + ix) * 2 + (horizontal ? 0 : 1);
    if (!pointOf.has(key)) {
      const a = sdf[iz * nx + ix];
      const b = horizontal ? sdf[iz * nx + ix + 1] : sdf[(iz + 1) * nx + ix];
      const t = a / (a - b);
      pointOf.set(key, horizontal
        ? [minX + (ix + t) * cell, minZ + iz * cell]
        : [minX + ix * cell, minZ + (iz + t) * cell]);
    }
    return key;
  };
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = sdf[iz * nx + ix] > 0, b = sdf[iz * nx + ix + 1] > 0;
      const c = sdf[(iz + 1) * nx + ix + 1] > 0, d = sdf[(iz + 1) * nx + ix] > 0;
      const hits = [];
      if (a !== b) hits.push(edgePoint(ix, iz, true));
      if (b !== c) hits.push(edgePoint(ix + 1, iz, false));
      if (d !== c) hits.push(edgePoint(ix, iz + 1, true));
      if (a !== d) hits.push(edgePoint(ix, iz, false));
      for (let k = 0; k + 1 < hits.length; k += 2) {
        const p = hits[k], q = hits[k + 1];
        if (!next.has(p)) next.set(p, []);
        if (!next.has(q)) next.set(q, []);
        next.get(p).push(q);
        next.get(q).push(p);
      }
    }
  }
  const polys = [];
  const seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let at = start;
    while (at !== undefined && !seen.has(at)) {
      seen.add(at);
      loop.push(pointOf.get(at));
      at = next.get(at).find((k) => !seen.has(k));
    }
    if (loop.length < 24) continue;
    const thinned = [];
    let last = null;
    for (const p of loop) {
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= 1.5) { thinned.push(p); last = p; }
    }
    polys.push(thinned);
  }
  return polys;
}

function buildTrack(course) {
  const gravity = course.gravity ?? GRAVITY;
  const centre = buildCentreline(course.control);
  const { n, px, pz, tx, tz, curv, step, length } = centre;
  const crossings = findCrossings(centre);
  const passes = crossings
    .flatMap((x) => [{ s: x.sA, other: x.sB, crossing: x.id }, { s: x.sB, other: x.sA, crossing: x.id }])
    .sort((a, b) => a.s - b.s);

  // Features are placed relative to a crossroads or a corner, so they move with the layout.
  const place = (f) => (f.corner === undefined
    ? passes[f.pass].s + f.offset
    : routeTo(0, centre.anchors[f.corner] + f.offset, length));
  const jumps = course.jumps.map((j, id) => {
    const lipS = place(j);
    return {
      id, name: j.name, height: j.height, airLength: j.airLength, maxSpeed: j.maxSpeed,
      startS: lipS - j.ramp, lipS, endS: lipS + j.fall, landS: lipS + j.airLength,
    };
  });
  const widthZones = course.widthZones.map((z) => ({ ...z, s: place(z) }));
  const hw = halfWidthProfile(centre, widthZones, course.halfWidth ?? TRACK.halfWidth);
  const covers = (course.covers ?? []).map((v) => {
    const from = place(v.from);
    return { ...v, from, length: routeTo(from, place(v.to), length) };
  });
  const elevation = course.ground ? elevationProfile(centre, passes, course, jumps) : null;

  const minX = Math.floor(Math.min(...px)) - MARGIN, maxX = Math.ceil(Math.max(...px)) + MARGIN;
  const minZ = Math.floor(Math.min(...pz)) - MARGIN, maxZ = Math.ceil(Math.max(...pz)) + MARGIN;
  const gridNx = Math.round((maxX - minX) / CELL) + 1;
  const gridNz = Math.round((maxZ - minZ) / CELL) + 1;
  const hNx = Math.round(((gridNx - 1) * CELL) / HEIGHT_RES) + 1;
  const hNz = Math.round(((gridNz - 1) * CELL) / HEIGHT_RES) + 1;

  // Stamp the road into the fine grid: nearest sample, and clearance from the wall.
  const fineSdf = new Float32Array(hNx * hNz).fill(-STAMP_REACH);
  const nearest = new Int32Array(hNx * hNz).fill(-1);
  const bestDist = new Float32Array(hNx * hNz).fill(Infinity);
  for (let i = 0; i < n; i++) {
    const reach = hw[i] + STAMP_REACH;
    const cells = Math.ceil(reach / HEIGHT_RES);
    const cx = Math.round((px[i] - minX) / HEIGHT_RES), cz = Math.round((pz[i] - minZ) / HEIGHT_RES);
    for (let dz = -cells; dz <= cells; dz++) {
      const iz = cz + dz;
      if (iz < 0 || iz >= hNz) continue;
      for (let dx = -cells; dx <= cells; dx++) {
        const ix = cx + dx;
        if (ix < 0 || ix >= hNx) continue;
        const d = Math.hypot(minX + ix * HEIGHT_RES - px[i], minZ + iz * HEIGHT_RES - pz[i]);
        const k = iz * hNx + ix;
        const clearance = hw[i] - d;
        if (clearance > fineSdf[k]) fineSdf[k] = clearance;
        if (d < bestDist[k]) { bestDist[k] = d; nearest[k] = i; }
      }
    }
  }

  // Corners bank toward their outside, everywhere except where two roads share a patch.
  const bank = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = i * step;
    let fade = 1;
    for (const p of passes) {
      const d = Math.min(routeTo(p.s, s, length), routeTo(s, p.s, length));
      fade = Math.min(fade, smoothstep(TRACK.flatAroundCrossing * 0.6, TRACK.flatAroundCrossing, d));
    }
    for (const j of jumps) {
      const span = routeTo(j.startS, j.endS, length);
      if (routeTo(j.startS, s, length) <= span) fade = 0;
      else fade = Math.min(fade, smoothstep(4, 16, Math.min(routeTo(s, j.startS, length), routeTo(j.endS, s, length))));
    }
    bank[i] = clamp(curv[i] * TRACK.bankPerCurvature, -TRACK.maxBank, TRACK.maxBank) * fade;
  }
  const bankSmooth = smoothLoop(bank, 60);

  // Tarmac on the straights and across the crossroads, clay through the corners.
  const tarmac = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = i * step;
    let nearCrossing = false;
    for (const p of passes) {
      if (Math.min(routeTo(p.s, s, length), routeTo(s, p.s, length)) < 26) nearCrossing = true;
    }
    tarmac[i] = nearCrossing || Math.abs(curv[i]) < TRACK.tarmacCurvature ? 1 : 0;
  }
  const tarmacSmooth = smoothLoop(tarmac, 40);
  const fast = SURFACE[course.straights ?? 'ASPHALT'], slow = SURFACE[course.corners ?? 'CLAY'];
  const surfaceId = Uint8Array.from(tarmacSmooth, (v) => (v > 0.5 ? fast : slow));

  const mud = course.mud.map((m) => {
    const i = Math.round(place(m) / step) % n;
    return { x: px[i] - tz[i] * m.side, z: pz[i] + tx[i] * m.side, r: m.r };
  });

  // Hills come down to nothing at the map's edge, to meet the apron.
  const groundAt = (x, z) => {
    if (!course.ground) return 0;
    const edge = Math.min(x - minX, maxX - x, z - minZ, maxZ - z);
    return course.ground(x, z) * smoothstep(0, 18, edge);
  };
  const heights = new Float32Array(hNx * hNz);
  for (let iz = 0; iz < hNz; iz++) {
    const z = minZ + iz * HEIGHT_RES;
    for (let ix = 0; ix < hNx; ix++) {
      const x = minX + ix * HEIGHT_RES;
      const k = iz * hNx + ix;
      const i = nearest[k];
      const ruts =
        0.04 * Math.sin(x * 0.31 + 1.7 * Math.sin(z * 0.13)) * Math.sin(z * 0.37 + 0.6) +
        0.022 * Math.sin(x * 0.83 - z * 0.71);
      if (i < 0) { heights[k] = groundAt(x, z) + ruts; continue; }
      const right = (x - px[i]) * -tz[i] + (z - pz[i]) * tx[i];
      const outside = Math.max(0, Math.abs(right) - hw[i]);
      const shoulder = 1 - smoothstep(0, STAMP_REACH - 2, outside);
      const b = bankSmooth[i];
      const across = clamp(right * -Math.sign(b), -hw[i], hw[i]);
      let h = Math.abs(b) * (hw[i] + across) * shoulder;
      for (const j of jumps) h += hump(j, i * step, length) * shoulder;
      if (elevation) {
        const land = groundAt(x, z);
        h += land + (elevation[i] - land) * shoulder;
      }
      heights[k] = h + ruts;
    }
  }

  const sdf = new Float32Array(gridNx * gridNz);
  for (let iz = 0; iz < gridNz; iz++) {
    for (let ix = 0; ix < gridNx; ix++) sdf[iz * gridNx + ix] = fineSdf[iz * 2 * hNx + ix * 2];
  }

  const surface = new Uint8Array(gridNx * gridNz);
  for (let iz = 0; iz < gridNz; iz++) {
    const z = minZ + iz * CELL;
    for (let ix = 0; ix < gridNx; ix++) {
      const x = minX + ix * CELL;
      const i = nearest[iz * 2 * hNx + ix * 2];
      let id = i >= 0 ? surfaceId[i] : slow;
      for (const m of mud) if (Math.hypot(x - m.x, z - m.z) < m.r) id = SURFACE.MUD;
      surface[iz * gridNx + ix] = id;
    }
  }

  // Three prize crates across the road at each spot.
  const crateSpots = course.crates.map((c) => {
    const s = routeTo(0, place(c), length);
    const i = Math.round(s / step) % n;
    const crates = [-0.6, 0, 0.6].map((share) => ({
      x: px[i] - tz[i] * hw[i] * share,
      z: pz[i] + tx[i] * hw[i] * share,
    }));
    return { s, crates };
  });

  const line = racingLine(centre, hw);
  // Grip as the tyres will meet it on the line, mud included.
  const surfaceGrip = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ix = clamp(Math.round((line.px[i] - minX) / CELL), 0, gridNx - 1);
    const iz = clamp(Math.round((line.pz[i] - minZ) / CELL), 0, gridNz - 1);
    surfaceGrip[i] = SURFACE_PROPS[surface[iz * gridNx + ix]].grip;
  }
  const pace = paceNotes(centre, line, surfaceGrip, jumps, gravity, elevation);
  const polys = traceWalls(sdf, gridNx, gridNz, minX, minZ, CELL);

  return new Track({
    centre, polys, sdf, heights, surface, crossings, passes, jumps, mud, line, pace, hw, crateSpots, covers, course, gravity,
    finishS: course.finishS ?? length - FINISH_BEHIND_GRID,
    gridS: GRID_LINE_S,
    grid: { minX, minZ, maxX, maxZ, gridNx, gridNz, hNx, hNz },
  });
}

export class Track {
  constructor({ centre, polys, sdf, heights, surface, crossings, passes, jumps, mud, line, pace, hw, crateSpots, covers, course, gravity, finishS, gridS, grid }) {
    this.course = course;
    this.gravity = gravity;
    this.airGravity = course.airGravity ?? gravity;
    this.finishS = finishS;
    this.gridS = gridS;
    this.covers = covers;
    this.centre = centre;
    this.length = centre.length;
    this.polys = polys;
    this.sdf = sdf;
    this.heights = heights;
    this.surface = surface;
    this.crossings = crossings;
    this.passes = passes;
    this.jumps = jumps;
    this.mud = mud;
    this.line = line;
    this.pace = pace;
    this.hw = hw;
    this.crateSpots = crateSpots;
    this.grid = grid;
    this.bounds = { minX: grid.minX, minZ: grid.minZ, maxX: grid.maxX, maxZ: grid.maxZ };
  }

  heightAt(x, z) {
    const g = this.grid;
    const fx = clamp((x - g.minX) / HEIGHT_RES, 0, g.hNx - 1.001);
    const fz = clamp((z - g.minZ) / HEIGHT_RES, 0, g.hNz - 1.001);
    const ix = fx | 0, iz = fz | 0;
    const tx = fx - ix, tz = fz - iz;
    const h = this.heights;
    const i = iz * g.hNx + ix;
    const a = h[i] + (h[i + 1] - h[i]) * tx;
    const b = h[i + g.hNx] + (h[i + g.hNx + 1] - h[i + g.hNx]) * tx;
    return a + (b - a) * tz;
  }

  // Writes the unit ground normal into out[0..2].
  normalAt(x, z, out) {
    const e = 0.5;
    const nx = this.heightAt(x - e, z) - this.heightAt(x + e, z);
    const nz = this.heightAt(x, z - e) - this.heightAt(x, z + e);
    const ny = 2 * e;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    out[0] = nx / len;
    out[1] = ny / len;
    out[2] = nz / len;
  }

  sdfAt(x, z) {
    const g = this.grid;
    const fx = clamp((x - g.minX) / CELL, 0, g.gridNx - 1.001);
    const fz = clamp((z - g.minZ) / CELL, 0, g.gridNz - 1.001);
    const ix = fx | 0, iz = fz | 0;
    const tx = fx - ix, tz = fz - iz;
    const s = this.sdf;
    const i = iz * g.gridNx + ix;
    const a = s[i] + (s[i + 1] - s[i]) * tx;
    const b = s[i + g.gridNx] + (s[i + g.gridNx + 1] - s[i + g.gridNx]) * tx;
    return a + (b - a) * tz;
  }

  // Unit vector pointing away from the nearest wall, into out[0..1].
  sdfGradient(x, z, out) {
    const e = 0.75;
    const gx = this.sdfAt(x + e, z) - this.sdfAt(x - e, z);
    const gz = this.sdfAt(x, z + e) - this.sdfAt(x, z - e);
    const len = Math.sqrt(gx * gx + gz * gz) || 1;
    out[0] = gx / len;
    out[1] = gz / len;
  }

  surfaceAt(x, z) {
    const g = this.grid;
    const ix = clamp(Math.round((x - g.minX) / CELL), 0, g.gridNx - 1);
    const iz = clamp(Math.round((z - g.minZ) / CELL), 0, g.gridNz - 1);
    return this.surface[iz * g.gridNx + ix];
  }

  // Distance along a horizontal unit direction until the nearest wall.
  raycast(x, z, dx, dz, maxDist) {
    let t = 0;
    while (t < maxDist) {
      const d = this.sdfAt(x + dx * t, z + dz * t);
      if (d < 0.05) return t;
      t += d * 0.95; // d >= 0.05 here, so a grazing ray still gets to the end
    }
    return maxDist;
  }

  // Centreline sample index, wrapped.
  indexAt(s) {
    const c = this.centre;
    const f = s / c.step;
    return ((Math.round(f) % c.n) + c.n) % c.n;
  }

  // Nearest centreline distance. With a hint the search stays on the same strand
  // through a crossroads; without one it scans the whole loop.
  project(x, z, hintS) {
    const c = this.centre;
    let best = -1, bestD = Infinity;
    const scan = (from, count) => {
      for (let k = 0; k < count; k++) {
        const i = ((from + k) % c.n + c.n) % c.n;
        const dx = c.px[i] - x, dz = c.pz[i] - z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    };
    if (hintS !== undefined) {
      const i0 = this.indexAt(hintS);
      const window = Math.round(30 / c.step);
      scan(i0 - window, window * 2 + 1);
      if (bestD > 18 * 18) { bestD = Infinity; scan(0, c.n); }
    } else {
      scan(0, c.n);
    }
    // Slide along the nearest sample's tangent, so close finishes aren't decided
    // by which metre of road two cars happen to share.
    const along = (x - c.px[best]) * c.tx[best] + (z - c.pz[best]) * c.tz[best];
    const s = best * c.step + clamp(along, -c.step, c.step);
    return ((s % c.length) + c.length) % c.length;
  }

  // Writes {x, z, tx, tz, curvature} for a centreline distance.
  sample(s, out) {
    const c = this.centre;
    const i = this.indexAt(s);
    out.x = c.px[i];
    out.z = c.pz[i];
    out.tx = c.tx[i];
    out.tz = c.tz[i];
    out.curvature = c.curv[i];
    return out;
  }

  // Writes {x, z, tx, tz, curvature} for the racing line at a route distance.
  sampleLine(s, out) {
    const l = this.line;
    const i = this.indexAt(s);
    out.x = l.px[i];
    out.z = l.pz[i];
    out.tx = l.tx[i];
    out.tz = l.tz[i];
    out.curvature = l.curv[i];
    return out;
  }

  paceAt(s) { return this.pace[this.indexAt(s)]; }

  halfWidthAt(s) { return this.hw[this.indexAt(s)]; }

  lineOffsetAt(s) { return this.line.offset[this.indexAt(s)]; }

  // The next crossroads pass ahead of s, and how far along the route it is.
  nextPass(s) {
    const L = this.length;
    let best = null, bestD = Infinity;
    for (const p of this.passes) {
      const d = routeTo(s, p.s, L);
      if (d < bestD) { bestD = d; best = p; }
    }
    return { pass: best, distance: bestD };
  }

  // Under a roof: a tunnel, a tent, a ship's hull. Cameras outside can't see in.
  coveredAt(s) {
    for (const v of this.covers) if (!v.clear && routeTo(v.from, s, this.length) <= v.length) return true;
    return false;
  }

  toNextLip(s) {
    let best = Infinity;
    for (const j of this.jumps) best = Math.min(best, routeTo(s, j.lipS, this.length));
    return best;
  }

  route(from, to) { return routeTo(from, to, this.length); }
}

const built = new Map();
export function getTrack(id = 'knot') {
  if (!built.has(id)) built.set(id, buildTrack(COURSES[id]));
  return built.get(id);
}

// A track as plain data, for the worker to send over. A course's functions can't cross
// a thread, so it goes by name.
export function packTrack(track) {
  const { course, ...data } = track;
  return { ...data, courseId: course.id };
}

// Takes a track built elsewhere, unless the race got there first and built its own.
export function adoptTrack(packed) {
  const { courseId, ...data } = packed;
  if (!built.has(courseId)) built.set(courseId, Object.assign(Object.create(Track.prototype), data, { course: COURSES[courseId] }));
  return built.get(courseId);
}
