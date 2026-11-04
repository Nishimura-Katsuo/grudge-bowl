// Sparks, dust, tyre smoke, fire, flying metal, skid marks and explosion lights.

import * as THREE from 'three';
import { createRng, clamp } from '../sim/math.js';
import { SURFACE_PROPS } from '../sim/config.js';

const SOFT_VERT = `
  attribute float size;
  attribute vec4 tint;
  varying vec4 vTint;
  uniform float scale;
  uniform float maxSize;
  uniform vec2 lensFade;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float depth = max(-mv.z, 0.1);
    // Size grows as 1/depth, so a sprite beside the lens would cover the screen.
    // Hold it to a share of the frame and let it melt away before it gets there.
    vTint = vec4(tint.rgb, tint.a * smoothstep(lensFade.x, lensFade.y, depth));
    gl_PointSize = min(size * scale / depth, maxSize);
    gl_Position = projectionMatrix * mv;
  }`;

const SOFT_FRAG = `
  varying vec4 vTint;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    float a = smoothstep(1.0, 0.1, d);
    gl_FragColor = vec4(vTint.rgb, vTint.a * a);
    if (gl_FragColor.a < 0.004) discard;
  }`;

class ParticlePool {
  constructor(scene, capacity, additive, look) {
    this.capacity = capacity;
    this.look = look;
    this.cursor = 0;
    this.alive = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.grow = new Float32Array(capacity);
    this.fade = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.baseA = new Float32Array(capacity);
    this.pos = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.tint = new Float32Array(capacity * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('tint', new THREE.BufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.material = new THREE.ShaderMaterial({
      vertexShader: SOFT_VERT,
      fragmentShader: SOFT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        scale: { value: 800 },
        maxSize: { value: 256 },
        lensFade: { value: new THREE.Vector2(look.fadeFrom, look.fadeTo) },
      },
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.geo = geo;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, size, life, r, g, b, a, grow = 0, drag = 0, gravity = 0) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.capacity;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.size[i] = size;
    this.life[i] = life;
    this.alive[i] = life;
    this.grow[i] = grow;
    this.drag[i] = drag;
    this.gravity[i] = gravity;
    this.baseA[i] = a;
    this.tint[i * 4] = r; this.tint[i * 4 + 1] = g; this.tint[i * 4 + 2] = b; this.tint[i * 4 + 3] = a;
  }

  reset() {
    this.alive.fill(0);
    this.size.fill(0);
    this.tint.fill(0);
    this.cursor = 0;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.tint.needsUpdate = true;
  }

  update(dt) {
    const { pos, vel, size, tint, alive, life, grow, drag, gravity, baseA } = this;
    for (let i = 0; i < this.capacity; i++) {
      if (alive[i] <= 0) continue;
      alive[i] -= dt;
      if (alive[i] <= 0) {
        tint[i * 4 + 3] = 0;
        size[i] = 0;
        continue;
      }
      const d = Math.max(0, 1 - drag[i] * dt);
      vel[i * 3] *= d;
      vel[i * 3 + 1] = vel[i * 3 + 1] * d - gravity[i] * dt;
      vel[i * 3 + 2] *= d;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.02 && gravity[i] > 0) {
        pos[i * 3 + 1] = 0.02;
        vel[i * 3 + 1] *= -0.3;
      }
      size[i] += grow[i] * dt;
      const t = alive[i] / life[i];
      tint[i * 4 + 3] = baseA[i] * Math.min(1, t * 2.2);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.tint.needsUpdate = true;
  }
}

class Sparks {
  constructor(scene, capacity) {
    this.capacity = capacity;
    this.cursor = 0;
    this.p = new Float32Array(capacity * 3);
    this.v = new Float32Array(capacity * 3);
    this.t = new Float32Array(capacity);
    this.lines = new Float32Array(capacity * 6);
    this.colours = new Float32Array(capacity * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.lines, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colours, 3).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.LineSegments(geo, mat);
    this.mesh.frustumCulled = false;
    this.geo = geo;
    scene.add(this.mesh);
  }

  spawn(x, y, z, vx, vy, vz, life) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.capacity;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.t[i] = life;
  }

  reset() {
    this.t.fill(0);
    this.lines.fill(0);
    this.colours.fill(0);
    this.cursor = 0;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  update(dt) {
    const { p, v, t, lines, colours } = this;
    for (let i = 0; i < this.capacity; i++) {
      const j = i * 6;
      if (t[i] <= 0) {
        colours[j] = colours[j + 1] = colours[j + 2] = 0;
        colours[j + 3] = colours[j + 4] = colours[j + 5] = 0;
        continue;
      }
      t[i] -= dt;
      v[i * 3 + 1] -= 9.8 * dt;
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < 0.03) {
        p[i * 3 + 1] = 0.03;
        v[i * 3 + 1] *= -0.45;
        v[i * 3] *= 0.7;
        v[i * 3 + 2] *= 0.7;
      }
      const streak = 0.024;
      lines[j] = p[i * 3]; lines[j + 1] = p[i * 3 + 1]; lines[j + 2] = p[i * 3 + 2];
      lines[j + 3] = p[i * 3] - v[i * 3] * streak;
      lines[j + 4] = p[i * 3 + 1] - v[i * 3 + 1] * streak;
      lines[j + 5] = p[i * 3 + 2] - v[i * 3 + 2] * streak;
      const heat = clamp(t[i] * 2.4, 0, 1);
      colours[j] = 3.2 * heat; colours[j + 1] = 1.7 * heat * heat; colours[j + 2] = 0.5 * heat * heat * heat;
      colours[j + 3] = 1.6 * heat; colours[j + 4] = 0.5 * heat; colours[j + 5] = 0.05 * heat;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

class Debris {
  constructor(scene, capacity) {
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.5 }),
      capacity,
    );
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, hidden);
    this.parts = Array.from({ length: capacity }, () => ({
      active: false, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(),
      spin: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), resting: 0,
    }));
    this.cursor = 0;
    this.m = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpE = new THREE.Euler();
    this.colour = new THREE.Color();
    scene.add(this.mesh);
  }

  reset() {
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    this.parts.forEach((part, i) => {
      part.active = false;
      this.mesh.setMatrixAt(i, hidden);
    });
    this.cursor = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  spawn(x, y, z, vx, vy, vz, sx, sy, sz, colour) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.capacity;
    const part = this.parts[i];
    part.active = true;
    part.resting = 0;
    part.p.set(x, y, z);
    part.v.set(vx, vy, vz);
    part.s.set(sx, sy, sz);
    part.q.set(Math.random(), Math.random(), Math.random(), Math.random()).normalize();
    part.spin.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
    this.mesh.setColorAt(i, this.colour.setHex(colour));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt, track) {
    let dirty = false;
    for (let i = 0; i < this.capacity; i++) {
      const part = this.parts[i];
      if (!part.active || part.resting > 0.3) continue;
      dirty = true;
      part.v.y -= 9.81 * dt;
      part.p.addScaledVector(part.v, dt);
      const ground = track.heightAt(part.p.x, part.p.z) + 0.04;
      if (part.p.y < ground) {
        part.p.y = ground;
        part.v.y *= -0.34;
        part.v.x *= 0.62;
        part.v.z *= 0.62;
        part.spin.multiplyScalar(0.55);
        if (part.v.lengthSq() < 0.5) part.resting += dt * 6;
      }
      if (track.sdfAt(part.p.x, part.p.z) < 0.1) {
        part.v.x *= -0.4;
        part.v.z *= -0.4;
      }
      this.tmpE.set(part.spin.x * dt, part.spin.y * dt, part.spin.z * dt);
      part.q.multiply(this.tmpQ.setFromEuler(this.tmpE));
      this.m.compose(part.p, part.q, part.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

class SkidMarks {
  constructor(scene, track, capacity) {
    this.capacity = capacity;
    this.track = track;
    this.cursor = 0;
    this.pos = new Float32Array(capacity * 18);
    this.alpha = new Float32Array(capacity * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexShader: `attribute float alpha; varying float vA;
        void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
      fragmentShader: `varying float vA;
        void main(){ gl_FragColor = vec4(0.05,0.035,0.03, vA); }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.geo = geo;
    scene.add(this.mesh);
    this.last = new Map();
    this.dirty = false;
  }

  // Lay one strip of rubber between the previous contact point and this one.
  mark(key, x, z, nx, nz, strength) {
    const prev = this.last.get(key);
    const halfW = 0.13;
    if (prev) {
      const dx = x - prev.x, dz = z - prev.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.09) return;
      if (d2 < 12) {
        const i = this.cursor;
        this.cursor = (i + 1) % this.capacity;
        const yA = this.track.heightAt(prev.x, prev.z) + 0.05;
        const yB = this.track.heightAt(x, z) + 0.05;
        const p = this.pos, o = i * 18;
        const ax = prev.x + prev.nx * halfW, az = prev.z + prev.nz * halfW;
        const bx = prev.x - prev.nx * halfW, bz = prev.z - prev.nz * halfW;
        const cx = x + nx * halfW, cz = z + nz * halfW;
        const ex = x - nx * halfW, ez = z - nz * halfW;
        p[o] = ax; p[o + 1] = yA; p[o + 2] = az;
        p[o + 3] = cx; p[o + 4] = yB; p[o + 5] = cz;
        p[o + 6] = bx; p[o + 7] = yA; p[o + 8] = bz;
        p[o + 9] = bx; p[o + 10] = yA; p[o + 11] = bz;
        p[o + 12] = cx; p[o + 13] = yB; p[o + 14] = cz;
        p[o + 15] = ex; p[o + 16] = yB; p[o + 17] = ez;
        const a = clamp(strength, 0.1, 0.55);
        this.alpha.fill(a, i * 6, i * 6 + 6);
        this.dirty = true;
      }
    }
    if (prev) { prev.x = x; prev.z = z; prev.nx = nx; prev.nz = nz; }
    else this.last.set(key, { x, z, nx, nz });
  }

  lift(key) {
    this.last.delete(key);
  }

  reset() {
    this.pos.fill(0);
    this.alpha.fill(0);
    this.last.clear();
    this.cursor = 0;
    this.dirty = true;
    this.flush();
  }

  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}

class FlashLights {
  constructor(scene, count) {
    this.lights = Array.from({ length: count }, () => {
      const l = new THREE.PointLight(0xffa050, 0, 42, 1.8);
      scene.add(l);
      return { light: l, t: 0, peak: 0 };
    });
    this.cursor = 0;
  }

  fire(x, y, z, peak, duration, colour = 0xffa050) {
    const f = this.lights[this.cursor];
    this.cursor = (this.cursor + 1) % this.lights.length;
    f.light.position.set(x, y + 1.2, z);
    f.light.color.setHex(colour);
    f.peak = peak;
    f.t = duration;
    f.duration = duration;
  }

  reset() {
    for (const f of this.lights) {
      f.t = 0;
      f.light.intensity = 0;
    }
  }

  update(dt) {
    for (const f of this.lights) {
      if (f.t <= 0) { f.light.intensity = 0; continue; }
      f.t -= dt;
      f.light.intensity = f.peak * Math.max(0, f.t / f.duration);
    }
  }
}

export class Effects {
  constructor(scene, track, renderer) {
    this.track = track;
    this.rng = createRng(0x5eed);
    this.soft = new ParticlePool(scene, 4200, false, { fadeFrom: 0.8, fadeTo: 3.5, maxShare: 0.5 });
    this.glow = new ParticlePool(scene, 1600, true, { fadeFrom: 3, fadeTo: 9, maxShare: 0.22 });
    this.sparks = new Sparks(scene, 1400);
    this.debris = new Debris(scene, 260);
    this.skids = new SkidMarks(scene, track, 7000);
    this.flash = new FlashLights(scene, 3);
    this.renderer = renderer;
    this.emitAccum = new Map();
  }

  // A new race starts on a clean track.
  reset() {
    for (const part of [this.soft, this.glow, this.sparks, this.debris, this.skids, this.flash]) part.reset();
    this.emitAccum.clear();
  }

  setViewport(height, fov) {
    const scale = height / (2 * Math.tan((fov * Math.PI) / 360));
    for (const pool of [this.soft, this.glow]) {
      pool.material.uniforms.scale.value = scale;
      pool.material.uniforms.maxSize.value = height * pool.look.maxShare;
    }
  }

  impact(x, y, z, nx, nz, strength, colourA, colourB) {
    const r = this.rng;
    const n = Math.round(14 + strength * 150);
    for (let i = 0; i < n; i++) {
      const speed = r.range(4, 11 + strength * 20);
      this.sparks.spawn(
        x, y, z,
        nx * speed * 0.6 + r.range(-1, 1) * speed,
        r.range(0.5, 1.1) * speed * 0.7,
        nz * speed * 0.6 + r.range(-1, 1) * speed,
        r.range(0.2, 0.75),
      );
    }
    const puffs = Math.round(4 + strength * 16);
    for (let i = 0; i < puffs; i++) {
      this.soft.spawn(
        x + r.range(-0.6, 0.6), y, z + r.range(-0.6, 0.6),
        r.range(-2.4, 2.4), r.range(0.6, 3), r.range(-2.4, 2.4),
        r.range(1.0, 2.2), r.range(0.8, 1.8), 0.34, 0.3, 0.27, 0.3, 2.2, 1.2,
      );
    }
    this.glow.spawn(x, y, z, 0, 0, 0, 3 + strength * 7, 0.14, 1.6, 0.95, 0.5, 0.9, 16);
    const chunks = Math.round(strength * 9);
    for (let i = 0; i < chunks; i++) {
      const size = r.range(0.08, 0.32);
      this.debris.spawn(
        x, y, z,
        nx * r.range(1, 7) + r.range(-3, 3), r.range(1.5, 7), nz * r.range(1, 7) + r.range(-3, 3),
        size * r.range(1, 2.6), 0.03, size,
        r() < 0.5 ? colourA : colourB,
      );
    }
    if (strength > 0.25) this.flash.fire(x, y, z, 22 * strength, 0.2);
  }

  explosion(x, y, z, colour) {
    const r = this.rng;
    for (let i = 0; i < 46; i++) {
      this.glow.spawn(
        x + r.range(-1, 1), y + r.range(0, 1), z + r.range(-1, 1),
        r.range(-5, 5), r.range(1, 8), r.range(-5, 5),
        r.range(1.6, 3.6), r.range(0.4, 1.0), 1.3, r.range(0.4, 0.7), 0.1, 0.24, 3.2, 2.2,
      );
    }
    for (let i = 0; i < 40; i++) {
      this.soft.spawn(
        x, y + 0.5, z,
        r.range(-4, 4), r.range(1, 7), r.range(-4, 4),
        r.range(2.4, 5), r.range(2, 4.5), 0.09, 0.08, 0.08, 0.72, 2.8, 1,
      );
    }
    for (let i = 0; i < 90; i++) {
      const sp = r.range(6, 28);
      const a = r() * Math.PI * 2;
      this.sparks.spawn(x, y + 0.6, z, Math.cos(a) * sp, r.range(2, 20), Math.sin(a) * sp, r.range(0.4, 1.2));
    }
    for (let i = 0; i < 12; i++) {
      this.debris.spawn(x, y + 0.5, z, r.range(-9, 9), r.range(4, 14), r.range(-9, 9), r.range(0.2, 0.9), 0.05, r.range(0.2, 0.7), colour);
    }
    this.flash.fire(x, y, z, 60, 0.55, 0xff8030);
  }

  // A car coming down: a skirt of dust thrown out flat, more the harder it lands.
  landing(x, y, z, drop) {
    const r = this.rng;
    const count = Math.round(clamp(drop * 4, 4, 30));
    const ground = this.track.heightAt(x, z) + 0.15;
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2, sp = r.range(2, 5 + drop);
      this.soft.spawn(
        x + Math.cos(a), ground, z + Math.sin(a),
        Math.cos(a) * sp, r.range(0.2, 1.4), Math.sin(a) * sp,
        r.range(0.7, 1.6), r.range(0.7, 1.5), 0.62, 0.46, 0.32, 0.34, 2.4, 2,
      );
    }
  }

  // The tractor's been. A last puff where the wreck sat.
  towed(x, y, z) {
    const r = this.rng;
    for (let i = 0; i < 14; i++) {
      this.soft.spawn(
        x + r.range(-1.5, 1.5), y, z + r.range(-1.5, 1.5),
        r.range(-1, 1), r.range(0.4, 1.8), r.range(-1, 1),
        r.range(1.2, 2.2), r.range(1, 1.8), 0.3, 0.27, 0.25, 0.3, 1.6, 1,
      );
    }
  }

  wheelOff(x, y, z, vx, vz) {
    this.debris.spawn(x, y, z, vx * 0.7 + (Math.random() - 0.5) * 6, 3.5, vz * 0.7 + (Math.random() - 0.5) * 6, 0.7, 0.26, 0.7, 0x141416);
  }

  // Per-frame emissions tied to the state of one car.
  carFrame(car, dt) {
    const r = this.rng;
    for (let i = 0; i < 4; i++) {
      const w = car.wheels[i];
      const key = car.id * 4 + i;
      if (!w.attached || !w.onGround || w.slide < 2.6) {
        this.skids.lift(key);
        continue;
      }
      const surface = SURFACE_PROPS[w.surface];
      const sideX = car.R[2], sideZ = car.R[8];
      this.skids.mark(key, w.contactX, w.contactZ, sideX, sideZ, 0.12 + w.slide * 0.03);
      const rate = clamp(w.slide * 1.5, 0, 16) * dt * (surface.dust ? 1.25 : 0.8);
      let acc = (this.emitAccum.get(key) || 0) + rate;
      while (acc >= 1) {
        acc -= 1;
        const dustiness = surface.dust;
        const cr = dustiness ? 0.66 : 0.6, cg = dustiness ? 0.41 : 0.57, cb = dustiness ? 0.26 : 0.56;
        this.soft.spawn(
          w.contactX + r.range(-0.2, 0.2), w.contactY + 0.14, w.contactZ + r.range(-0.2, 0.2),
          car.vx * 0.18 + r.range(-1, 1), r.range(0.3, 1.6), car.vz * 0.18 + r.range(-1, 1),
          r.range(0.9, 1.7), r.range(0.9, 2.1), cr, cg, cb, 0.12, 1.9, 0.9,
        );
      }
      this.emitAccum.set(key, acc);
    }

    const hurt = 1 - car.health;
    if (hurt > 0.45 || !car.alive) {
      const key = -1 - car.id;
      const nose = 1.5;
      const hx = car.px + car.R[0] * nose, hy = car.py + car.R[4] * 0.6 + car.R[3] * nose, hz = car.pz + car.R[6] * nose;
      const rate = (car.alive ? 8 + hurt * 34 : 16) * dt;
      let acc = (this.emitAccum.get(key) || 0) + rate;
      while (acc >= 1) {
        acc -= 1;
        const dark = clamp(0.5 - hurt * 0.44, 0.05, 0.5);
        this.soft.spawn(
          hx + r.range(-0.3, 0.3), hy, hz + r.range(-0.3, 0.3),
          car.vx * 0.3 + r.range(-0.5, 0.5), r.range(1.6, 3.4), car.vz * 0.3 + r.range(-0.5, 0.5),
          r.range(0.8, 1.5), r.range(1.8, 3.6), dark, dark * 0.95, dark * 0.9, 0.58, 2.4, 0.5,
        );
        if (hurt > 0.72 || !car.alive) {
          this.glow.spawn(
            hx + r.range(-0.4, 0.4), hy, hz + r.range(-0.4, 0.4),
            car.vx * 0.25 + r.range(-0.6, 0.6), r.range(1.8, 3.6), car.vz * 0.25 + r.range(-0.6, 0.6),
            r.range(0.7, 1.5), r.range(0.3, 0.6), 1.5, 0.55, 0.12, 0.8, -0.8, 0.6,
          );
        }
      }
      this.emitAccum.set(key, acc);
    }
  }

  update(dt) {
    this.soft.update(dt);
    this.glow.update(dt);
    this.sparks.update(dt);
    this.debris.update(dt, this.track);
    this.skids.flush();
    this.flash.update(dt);
  }
}
