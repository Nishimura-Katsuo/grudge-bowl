// The spectator camera. A TV director with no attention span: it scores every
// car for how watchable it is, predicts collisions a couple of seconds out,
// and cuts between shot types to catch them.

import * as THREE from 'three';
import { clamp, lerp } from '../sim/math.js';
import { centreOfCrossroads, goreNoses } from './stage.js';
import { WEAPON } from '../sim/arsenal.js';

const SHOTS = ['chase', 'bumper', 'trackside', 'drone', 'tower', 'heli', 'wreck', 'victory'];

const PIANO = WEAPON.grandPiano;
const ORBIT_ROAD_CLEARANCE = 1.6;
const ORBIT_SWINGS = [0];
for (let k = 1; k <= 9; k++) ORBIT_SWINGS.push(k * 0.35, -k * 0.35);

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();

const gradient = [0, 0];

const speedOf = (c) => Math.hypot(c.vx, c.vz);

// Seconds until two cars are closest, and how close, assuming straight lines.
function closestApproach(a, b) {
  const dx = b.px - a.px, dz = b.pz - a.pz;
  const rvx = b.vx - a.vx, rvz = b.vz - a.vz;
  const rv2 = rvx * rvx + rvz * rvz;
  if (rv2 < 1) return { t: Infinity, miss: Infinity, closing: 0 };
  const t = -(dx * rvx + dz * rvz) / rv2;
  const mx = dx + rvx * t, mz = dz + rvz * t;
  return { t, miss: Math.hypot(mx, mz), closing: Math.sqrt(rv2) };
}

const SIGHT_STEP = 3; // metres between checks along a line of sight
const SIGHT_GRACE = 4; // the road's own shoulder right beside the car doesn't count
const TOWER_DECK = 19;
const HELI_HEIGHT = 104;
const HELI_CEILING = 220;

export class Director {
  constructor(camera, track) {
    this.camera = camera;
    this.track = track;
    this.auto = true;
    this.shot = 'heli';
    this.manualShot = null;
    this.subject = 0;
    this.partner = -1;
    this.shotAge = 0;
    this.shotMin = 3;
    this.scanTimer = 0;
    this.interest = new Float32Array(16);
    this.shakeAmp = 0;
    this.lookAt = new THREE.Vector3(0, 1, 0);
    this.camPos = new THREE.Vector3(0, 60, 120);
    this.targetFov = 50;
    this.fov = 50;
    this.side = 1;
    this.orbit = 0;
    this.userYaw = 0;
    this.userPitch = 0;
    this.time = 0;
    this.lastHotHit = null;
    this.victor = -1;
    this.heldShot = null;
    this.wreckSite = new THREE.Vector3();
    this.setTrack(track);
  }

  setTrack(track) {
    this.track = track;
    this.post = null;
    const towers = track.course.towers;
    this.heart = towers ? { x: towers[0][0], y: towers[0][1], z: towers[0][2] } : centreOfCrossroads(track);
    if (!towers) this.heart.y = track.heightAt(this.heart.x, this.heart.z);
    this.towers = towers ? towers.map(([x, y, z]) => ({ x, y, z })) : [this.heart];
    this.tower = this.towers[0];
    this.heliTurn = 0;
    this.posts = this.buildPosts();
    this.landingPosts = track.jumps.map((j) => this.landingPost(j));
  }

  buildPosts() {
    const t = this.track;
    const posts = [];
    const c = t.centre;
    const step = Math.floor(c.n / 16);
    for (let i = 0; i < c.n; i += step) {
      const sign = i % (step * 2) === 0 ? 1 : -1;
      // Camera stands just outside the barrier on the lane edge. Where that is
      // another road, it takes the other side.
      for (const side of [sign, -sign]) {
        const off = (t.hw[i] + 1.8) * side;
        const x = c.px[i] - c.tz[i] * off;
        const z = c.pz[i] + c.tx[i] * off;
        if (t.sdfAt(x, z) > -1) continue;
        posts.push(new THREE.Vector3(x, t.heightAt(x, z) + 4.4, z));
        break;
      }
    }
    // Every crossroads gets a camera on each barrier point.
    for (const nose of goreNoses(t)) {
      posts.push(new THREE.Vector3(nose.x, t.heightAt(nose.x, nose.z) + 3.6, nose.z));
    }
    return posts;
  }

  // Low and past the landing, looking back up the kicker at whatever comes over it.
  landingPost(jump) {
    const t = this.track;
    const c = t.centre;
    const i = t.indexAt(jump.lipS + jump.airLength + 10);
    const off = t.hw[i] + 1.2;
    const x = c.px[i] + c.tz[i] * off, z = c.pz[i] - c.tx[i] * off;
    return new THREE.Vector3(x, t.heightAt(x, z) + 1.5, z);
  }

  // The race is over: everything points at the winner, whatever the camera was doing.
  feature(id) {
    this.victor = id;
    this.heldShot = this.manualShot;
    this.manualShot = null;
    this.auto = true;
    this.followHold = 0;
    if (id >= 0) this.cut('victory', id, -1);
  }

  endFeature() {
    if (this.victor < 0 && !this.heldShot) return;
    this.victor = -1;
    if (this.heldShot) {
      this.manualShot = this.heldShot;
      this.auto = false;
    }
    this.heldShot = null;
  }

  setManual(shot) {
    this.heldShot = null;
    this.manualShot = shot;
    this.auto = !shot;
    if (shot) this.cut(shot, this.subject, this.partner);
  }

  follow(id) {
    this.subject = id;
    this.partner = -1;
    this.shotAge = 0;
    if (this.auto) this.followHold = 7;
  }

  shake(amount) {
    this.shakeAmp = Math.min(1.4, this.shakeAmp + amount);
  }

  cut(shot, subject, partner) {
    this.shot = shot;
    this.subject = subject;
    this.partner = partner;
    this.shotAge = 0;
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.orbit = Math.random() * Math.PI * 2;
    this.snap = true;
    this.post = null;
    this.shotMin = shot === 'heli' ? 4.5 : shot === 'wreck' ? 3.2 : 3;
  }

  onEvent(e, world) {
    if (e.type === 'hit' && (e.a === this.subject || e.b === this.subject || e.a === this.partner || e.b === this.partner)) {
      this.shake(0.15 + e.strength * 0.9);
    }
    if (e.type === 'ko' && this.auto && (!(this.followHold > 0) || e.car === this.subject)) {
      const car = world.cars[e.car];
      this.wreckSite.set(car.px, car.py, car.pz);
      this.cut('wreck', e.car, e.killer);
    }
    if (e.type === 'landing' && e.car === this.subject) this.shake(0.12 + e.drop * 0.05);
    if (e.type === 'blast' && world.phase === 'racing') {
      const d = Math.hypot(e.x - this.camPos.x, e.z - this.camPos.z);
      if (d < 40) this.shake(0.5 * (1 - d / 40));
    }
    // A falling piano is worth a cut: stay on the car it's falling on.
    if (e.type === 'fired' && e.target >= 0 && this.auto && !(this.followHold > 0) && e.weapon === PIANO && world.phase === 'racing') {
      this.cut('drone', e.target, -1);
    }
  }

  // The angle nearest the wanted one that keeps the camera on the road with a
  // clear view of the subject. The road is narrower than the orbit is wide.
  clearOrbitAngle(subj, wanted, r) {
    const t = this.track;
    for (const swing of ORBIT_SWINGS) {
      const a = wanted + swing;
      const x = subj.x + Math.cos(a) * r, z = subj.z + Math.sin(a) * r;
      if (t.sdfAt(x, z) < ORBIT_ROAD_CLEARANCE) continue;
      let clear = true;
      for (let k = 0.25; k < 1 && clear; k += 0.25) {
        clear = t.sdfAt(subj.x + (x - subj.x) * k, subj.z + (z - subj.z) * k) > 0.2;
      }
      if (clear) return a;
    }
    return wanted;
  }

  // Two or more cars about to go over the same lip is worth a cut on its own.
  findJumpShot(cars) {
    const t = this.track;
    for (const jump of t.jumps) {
      let first = -1, second = -1, bestLead = Infinity;
      for (const car of cars) {
        if (!car.alive) continue;
        const speed = speedOf(car);
        const eta = t.route(car.trackS, jump.lipS) / Math.max(speed, 8);
        if (eta > 2.2 || speed < 14) continue;
        if (eta < bestLead) { bestLead = eta; second = first; first = car.id; }
        else if (second < 0) second = car.id;
      }
      if (first >= 0 && second >= 0) return { jump, first, second };
    }
    return null;
  }

  // Watchability of each car, refreshed a few times a second.
  scan(world, telemetryOf) {
    const cars = world.cars;
    let bestPair = null;
    let bestPairScore = 0;
    const hunters = new Int32Array(cars.length);
    for (const car of cars) {
      const tele = telemetryOf(car.id);
      if (car.alive && tele && tele.targetId >= 0) hunters[tele.targetId]++;
    }

    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c.alive) { this.interest[i] *= 0.6; continue; }
      const tele = telemetryOf(i);
      let s = 0.4;
      s += speedOf(c) / 28;
      s += (tele?.rage ?? 0) * 1.1;
      s += (1 - c.health) * 0.8;
      s += hunters[i] * 0.45;
      if (c.racePos < 3) s += 0.5 - c.racePos * 0.15;
      if (c.airborne) s += 0.8;
      if (c.whirl) s += 1.6;
      if (c.gripScale < 0.5) s += 0.5;
      const r = c.wheels[2];
      s += clamp(r.slide / 10, 0, 1.3);
      for (let j = i + 1; j < cars.length; j++) {
        const o = cars[j];
        const d2 = (o.px - c.px) ** 2 + (o.pz - c.pz) ** 2;
        if (d2 < 900) s += 0.2;
        if (!o.alive) continue;
        const { t, miss, closing } = closestApproach(c, o);
        if (t > 0.35 && t < 2.8 && miss < 4 && closing > 8) {
          const pairScore = closing * (3 - t) * (miss < 2 ? 1.3 : 1);
          if (pairScore > bestPairScore) {
            bestPairScore = pairScore;
            bestPair = { a: i, b: j, t, closing };
          }
        }
      }
      this.interest[i] = this.interest[i] * 0.6 + s * 0.4;
    }

    if (this.followHold > 0) return;

    // Nothing outside can see under a roof, so ride in with the car.
    const roofed = this.shot === 'drone' || this.shot === 'tower' || this.shot === 'heli' || this.shot === 'trackside';
    if (roofed && !this.manualShot && this.track.coveredAt(cars[this.subject].trackS)) {
      this.cut('chase', this.subject, -1);
      return;
    }

    const jumpShot = this.shotAge > 1.8 && this.shot !== 'wreck' ? this.findJumpShot(cars) : null;
    if (jumpShot) {
      this.cut('trackside', jumpShot.first, jumpShot.second);
      this.post = this.landingPosts[jumpShot.jump.id];
      return;
    }

    const shotExpired = this.shotAge > this.shotMin;
    const wreckHold = this.shot === 'wreck' && this.shotAge < 3.2;
    if (bestPair && bestPairScore > 30 && this.shotAge > 1.4 && !wreckHold) {
      const bigHit = bestPairScore > 60;
      const isSame = this.subject === bestPair.a || this.subject === bestPair.b;
      if (!isSame || this.shot === 'heli') {
        const shot = bigHit ? 'trackside' : Math.random() < 0.6 ? 'chase' : 'trackside';
        this.cut(shot, bestPair.a, bestPair.b);
      }
      return;
    }

    if (shotExpired || !cars[this.subject].alive) {
      if (this.shot === 'wreck' && this.shotAge < 3.2) return;
      const long = this.shotAge > 8;
      if (!long && cars[this.subject].alive && Math.random() < 0.3) return;
      let best = -1, score = -1;
      for (let i = 0; i < cars.length; i++) {
        if (!cars[i].alive) continue;
        const s = this.interest[i] * (i === this.subject ? 0.75 : 1);
        if (s > score) { score = s; best = i; }
      }
      if (best < 0) return;
      const pool = ['chase', 'chase', 'trackside', 'drone', 'tower', 'bumper'];
      if (Math.random() < 0.1) pool.push('heli');
      let shot = pool[Math.floor(Math.random() * pool.length)];
      if (shot === this.shot) shot = shot === 'chase' ? 'drone' : 'chase';
      const tele = telemetryOf(best);
      const partner = tele && tele.targetId >= 0 && cars[tele.targetId]?.alive ? tele.targetId : -1;
      this.cut(shot, best, partner);
    }
  }

  // Can a lens at a see a point at b, or does the ground get in the way?
  sees(ax, ay, az, bx, by, bz) {
    const t = this.track;
    const reach = Math.hypot(bx - ax, bz - az);
    for (let d = SIGHT_STEP; d < reach - SIGHT_GRACE; d += SIGHT_STEP) {
      const u = d / reach;
      if (ay + (by - ay) * u < t.heightAt(ax + (bx - ax) * u, az + (bz - az) * u)) return false;
    }
    return true;
  }

  // High enough to look down over a near rim into a crater.
  heliHeight(a, subj) {
    let y = HELI_HEIGHT;
    while (y < HELI_CEILING && !this.sees(Math.cos(a) * 205, y, Math.sin(a) * 205, subj.x, subj.y + 0.6, subj.z)) y += 8;
    return y;
  }

  // Stay on the tower in use while it can see. When a hill gets in the way, move to the
  // nearest one that can.
  pickTower(subj) {
    const sight = (w) => this.sees(w.x, w.y + TOWER_DECK, w.z, subj.x, subj.y + 0.6, subj.z);
    if (sight(this.tower)) return false;
    let best = null, bestD = Infinity;
    for (const w of this.towers) {
      const d = Math.hypot(w.x - subj.x, w.z - subj.z);
      if (d < bestD && sight(w)) { bestD = d; best = w; }
    }
    if (!best) return false;
    this.tower = best;
    return true;
  }

  // Keeps roving cameras on the driveable side of the barrier and above its top
  // whenever the sightline would otherwise run through it.
  keepLensClear(pos, look, shot) {
    const t = this.track;
    const roving = shot === 'chase' || shot === 'bumper' || shot === 'wreck' || shot === 'grid' || shot === 'victory';
    if (roving) {
      const margin = 0.9;
      const sdf = t.sdfAt(pos.x, pos.z);
      if (sdf < margin) {
        t.sdfGradient(pos.x, pos.z, gradient);
        pos.x += gradient[0] * (margin - sdf);
        pos.z += gradient[1] * (margin - sdf);
      }
      let need = 0;
      for (let i = 1; i < 10; i++) {
        const k = i / 10;
        const x = pos.x + (look.x - pos.x) * k;
        const z = pos.z + (look.z - pos.z) * k;
        if (t.sdfAt(x, z) > 0.5) continue;
        const top = t.heightAt(x, z) + 1.45;
        const y = pos.y + (look.y - pos.y) * k;
        if (y < top) need = Math.max(need, (top - look.y * k) / (1 - k));
      }
      if (need > pos.y) pos.y = need;
    }
    const floor = t.heightAt(pos.x, pos.z) + 0.3;
    if (pos.y < floor) pos.y = floor;
  }

  update(dt, world, visuals, telemetryOf) {
    this.time += dt;
    this.shotAge += dt;
    this.followHold = Math.max(0, (this.followHold || 0) - dt);
    this.scanTimer -= dt;
    if (this.auto && this.scanTimer <= 0 && world.phase === 'racing') {
      this.scanTimer = 0.25;
      this.scan(world, telemetryOf);
    }
    if (this.auto && this.victor >= 0 && this.shot !== 'victory') this.cut('victory', this.victor, -1);

    if (world.cars[this.subject].towed) {
      const next = world.cars.find((c) => c.alive);
      if (next) { this.subject = next.id; this.partner = -1; this.post = null; }
    }
    if (this.partner >= 0 && world.cars[this.partner].towed) this.partner = -1;
    const car = world.cars[this.subject];
    const vis = visuals[this.subject];
    const subj = v1.copy(vis.root.position);
    const partner = this.partner >= 0 ? visuals[this.partner].root.position : null;

    const shot = world.phase === 'countdown' && this.auto ? 'grid' : this.shot;
    const desiredPos = v2;
    const desiredLook = v3.copy(subj).setY(subj.y + 0.5);
    let snapNow = this.snap;
    let posRate = 6, lookRate = 8;
    this.targetFov = 50;

    const hx = car.R[0], hz = car.R[6];
    const hl = Math.hypot(hx, hz) || 1;
    const fx = hx / hl, fz = hz / hl;
    const speed = Math.hypot(car.vx, car.vz);
    let vdx = fx, vdz = fz;
    if (speed > 4) {
      vdx = car.vx / speed;
      vdz = car.vz / speed;
    }

    switch (shot) {
      case 'grid': {
        const t = world.time;
        const a = -0.6 + t * 0.26;
        const mid = world.cars[Math.floor(world.cars.length / 2)];
        const floor = this.track.heightAt(mid.px, mid.pz);
        desiredPos.set(mid.px + Math.cos(a) * 15, floor + 2.8, mid.pz + Math.sin(a) * 15);
        desiredLook.set(mid.px + fx * 6, floor + 1.1, mid.pz + fz * 6);
        snapNow = this.shotAge < 0.1;
        this.targetFov = 44;
        posRate = 30;
        break;
      }
      case 'chase': {
        // Swing out toward the velocity, so a drift shows the car's flank.
        const dist = 8.2 + speed * 0.06;
        const bx = vdx * 0.65 + fx * 0.35, bz = vdz * 0.65 + fz * 0.35;
        desiredPos.set(subj.x - bx * dist, subj.y + 2.6, subj.z - bz * dist);
        if (partner) {
          desiredLook.lerp(partner, clamp(0.34 - subj.distanceTo(partner) * 0.004, 0.05, 0.34));
        } else {
          desiredLook.set(subj.x + vdx * 5, subj.y + 0.8, subj.z + vdz * 5);
        }
        this.targetFov = 58 + speed * 0.22;
        posRate = 7.5;
        break;
      }
      case 'bumper': {
        // Backing away from the grille, staring into the car's angry face.
        const dist = 6.6;
        desiredPos.set(subj.x + vdx * dist - fz * 0.7 * this.side, subj.y + 0.2, subj.z + vdz * dist + fx * 0.7 * this.side);
        desiredLook.set(subj.x + fx, subj.y + 0.15, subj.z + fz);
        this.targetFov = 56;
        posRate = 60;
        lookRate = 26;
        break;
      }
      case 'trackside': {
        // Nearest fixed post down the road from the subject; long lens tracking.
        let best = this.posts[0], d = Infinity;
        const ahead = 34;
        const ax = subj.x + vdx * ahead, az = subj.z + vdz * ahead;
        for (const p of this.posts) {
          const dd = (p.x - ax) ** 2 + (p.z - az) ** 2;
          if (dd < d) { d = dd; best = p; }
        }
        if (this.post && this.post.distanceTo(subj) > 78) this.post = null;
        if (!this.post) {
          this.post = best;
          snapNow = true;
        }
        desiredPos.copy(this.post);
        if (partner) desiredLook.lerp(partner, 0.5);
        const range = desiredPos.distanceTo(desiredLook);
        this.targetFov = clamp(1500 / Math.max(range, 12), 11, 62);
        posRate = 80;
        lookRate = 9;
        break;
      }
      case 'drone': {
        const a = this.orbit + this.time * 0.34 + this.userYaw;
        const r = 16 + Math.sin(this.time * 0.3) * 4;
        desiredPos.set(subj.x + Math.cos(a) * r, subj.y + 7.5 + this.userPitch * 10, subj.z + Math.sin(a) * r);
        if (partner) desiredLook.lerp(partner, 0.32);
        this.targetFov = 52;
        posRate = 3.5;
        break;
      }
      case 'tower': {
        // The rail of the marshal's deck, on whichever side faces the subject.
        if (this.pickTower(subj)) snapNow = true;
        const deck = this.tower;
        const out = Math.atan2(subj.z - deck.z, subj.x - deck.x);
        desiredPos.set(deck.x + Math.cos(out) * 4.4, deck.y + TOWER_DECK, deck.z + Math.sin(out) * 4.4);
        if (partner) desiredLook.lerp(partner, 0.5);
        const range = desiredPos.distanceTo(desiredLook);
        this.targetFov = clamp(2400 / Math.max(range, 20), 12, 60);
        posRate = 5;
        lookRate = 7;
        break;
      }
      case 'heli': {
        const circling = 0.9 + this.time * 0.05;
        let a = circling + this.heliTurn;
        // A far rim hides more than height can fix, so swing round to the subject's side.
        if (!this.sees(Math.cos(a) * 205, 104, Math.sin(a) * 205, subj.x, subj.y + 0.6, subj.z)) {
          a = Math.atan2(subj.z - this.heart.z, subj.x - this.heart.x);
          this.heliTurn = a - circling;
        }
        desiredPos.set(Math.cos(a) * 205, this.heliHeight(a, subj), Math.sin(a) * 205);
        desiredLook.set(this.heart.x, this.heart.y, this.heart.z);
        // On a mountain the middle of the map is rock, so frame the road as well.
        if (this.towers.length > 1) desiredLook.lerp(subj, 0.65);
        this.targetFov = 42;
        posRate = 2.5;
        lookRate = 2.5;
        break;
      }
      case 'victory': {
        // A slow low orbit, aimed below the car so it sits high in the frame, in the
        // gap between the winner's name and the results.
        const r = 8 + Math.sin(this.shotAge * 0.31) * 1.2;
        const a = this.clearOrbitAngle(subj, this.orbit + this.shotAge * 0.26 + this.userYaw, r);
        const cx = Math.cos(a), cz = Math.sin(a);
        desiredPos.set(subj.x + cx * r, subj.y + 2.1 + this.userPitch * 8, subj.z + cz * r);
        const aside = this.camera.aspect > 1.2 ? 0.7 : 0;
        desiredLook.set(subj.x + cz * aside, subj.y - 1, subj.z - cx * aside);
        this.targetFov = 42;
        posRate = 4;
        lookRate = 5;
        break;
      }
      case 'wreck': {
        const a = this.orbit + this.shotAge * 0.42;
        const r = Math.max(5.5, 11 - this.shotAge * 0.6);
        desiredPos.set(subj.x + Math.cos(a) * r, subj.y + 2.1, subj.z + Math.sin(a) * r);
        this.targetFov = 46;
        posRate = 10;
        break;
      }
      default:
        break;
    }

    this.keepLensClear(desiredPos, desiredLook, shot);

    if (snapNow) {
      this.camPos.copy(desiredPos);
      this.lookAt.copy(desiredLook);
      this.fov = this.targetFov;
      this.snap = false;
    } else {
      this.camPos.lerp(desiredPos, 1 - Math.exp(-posRate * dt));
      this.lookAt.lerp(desiredLook, 1 - Math.exp(-lookRate * dt));
      this.fov = lerp(this.fov, this.targetFov, 1 - Math.exp(-4 * dt));
      // Easing between clear positions can still cut across a barrier.
      this.keepLensClear(this.camPos, this.lookAt, shot);
    }
    // Hills can come up through any shot, however it was framed.
    this.camPos.y = Math.max(this.camPos.y, this.track.heightAt(this.camPos.x, this.camPos.z) + 1);

    this.shakeAmp *= Math.exp(-5.5 * dt);
    const t = this.time * 41;
    const sx = (Math.sin(t) + Math.sin(t * 1.7)) * 0.11 * this.shakeAmp;
    const sy = (Math.sin(t * 1.3 + 1) + Math.sin(t * 2.1)) * 0.11 * this.shakeAmp;

    const cam = this.camera;
    cam.position.copy(this.camPos);
    cam.position.x += sx;
    cam.position.y += sy;
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
    cam.lookAt(this.lookAt);
    return cam.position;
  }
}

export { SHOTS };
