// What the arsenal looks like. The sim owns every position; this only draws them,
// matching meshes to sim objects by id each frame.

import * as THREE from 'three';
import { ARSENAL } from '../sim/config.js';

const BRONZE = new THREE.MeshStandardMaterial({ color: 0xb06a2c, metalness: 0.75, roughness: 0.35 });
const STEEL = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.85, roughness: 0.3 });
const SOOT = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.7 });
const RED = new THREE.MeshStandardMaterial({ color: 0xc8321f, roughness: 0.5 });
const MUSTARD = new THREE.MeshStandardMaterial({ color: 0xe8b023, roughness: 0.5 });
const HOT = new THREE.MeshBasicMaterial({ color: 0xffb060 });
const CREAM = new THREE.MeshStandardMaterial({ color: 0xf3e2bd, roughness: 0.6 });
const LACQUER = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, metalness: 0.2, roughness: 0.18 });

const SHARED_MATERIALS = new Set([BRONZE, STEEL, SOOT, RED, MUSTARD, HOT, CREAM, LACQUER]);

const UP = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3();
const w = new THREE.Vector3();

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function crateMaterial() {
  const map = canvasTexture(128, (ctx, s) => {
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#e8b023' : '#c8321f';
      ctx.fillRect((i * s) / 6, 0, s / 6, s);
    }
    ctx.fillStyle = '#f3e2bd';
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1b20';
    ctx.font = `${s * 0.5}px 'Bowlby One', Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', s / 2, s * 0.54);
  });
  return new THREE.MeshStandardMaterial({ map, roughness: 0.6, emissive: 0x402008, emissiveIntensity: 0.6 });
}

function matMaterial() {
  const map = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#7a5a32';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#1a1b20';
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, s - 24, s - 24);
    ctx.fillStyle = '#1a1b20';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${s * 0.2}px 'Bowlby One', Impact, sans-serif`;
    ctx.fillText('WEL', s / 2, s * 0.36);
    ctx.fillText('COME', s / 2, s * 0.62);
  });
  return new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
}

function buildRocket() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.5, 10).rotateZ(-Math.PI / 2), RED);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 10).rotateZ(-Math.PI / 2).translate(1.02, 0, 0), MUSTARD);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1, 8).rotateZ(Math.PI / 2).translate(-1.2, 0, 0), HOT);
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.05), SOOT);
    fin.position.set(-0.6, Math.sin(a) * 0.3, Math.cos(a) * 0.3);
    fin.rotation.x = a;
    g.add(fin);
  }
  g.add(body, nose, flame);
  return g;
}

function buildSeeker() {
  const g = buildRocket();
  g.scale.setScalar(0.72);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2410 }));
  eye.position.x = 1.25;
  g.add(eye);
  return g;
}

function buildHook() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 6).rotateZ(-Math.PI / 2), STEEL));
  for (const side of [-1, 1]) {
    const barb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.1), STEEL);
    barb.position.set(-0.25, 0, side * 0.26);
    barb.rotation.y = side * -0.7;
    g.add(barb);
  }
  return g;
}

function buildBull() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.5, 1.5), BRONZE);
  body.position.y = 1.5;
  const hump = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.6, 1.3), BRONZE);
  hump.position.set(0.7, 2.4, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1, 1), BRONZE);
  head.position.set(2, 1.8, 0);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.8), BRONZE);
  nose.position.set(2.7, 1.55, 0);
  g.add(body, hump, head, nose);
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1, 8).rotateX((side * Math.PI) / 2).rotateY(0.4 * side), CREAM);
    horn.position.set(2.1, 2.35, side * 0.8);
    g.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2410 }));
    eye.position.set(2.56, 2, side * 0.4);
    g.add(eye);
  }
  const legs = [[1.1, 0.5], [1.1, -0.5], [-1.1, 0.5], [-1.1, -0.5]].map(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.4).translate(0, -0.5, 0), BRONZE);
    leg.position.set(x, 1, z);
    g.add(leg);
    return leg;
  });
  g.userData.legs = legs;
  return g;
}

function buildSpring() {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.1, 18), SOOT);
  plate.position.y = 0.65;
  g.add(plate);
  for (let i = 0; i < 4; i++) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 20).rotateX(Math.PI / 2), STEEL);
    coil.position.y = 0.1 + i * 0.16;
    g.add(coil);
  }
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.04, 18), RED);
  top.position.y = 0.72;
  g.add(top);
  return g;
}

function buildPiano() {
  const g = new THREE.Group();
  const case_ = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.7, 1.7), LACQUER);
  case_.position.y = 1.1;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.06, 1.6), LACQUER);
  lid.position.set(-0.5, 1.95, 0);
  lid.rotation.z = 0.52;
  const keys = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 1.6), CREAM);
  keys.position.set(1.55, 1.2, 0);
  g.add(case_, lid, keys);
  for (let i = 0; i < 8; i++) {
    const black = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.1), SOOT);
    black.position.set(1.6, 1.27, -0.68 + i * 0.2);
    g.add(black);
  }
  for (const [x, z] of [[-1.1, 0.6], [-1.1, -0.6], [1.1, 0]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.8, 8), LACQUER);
    leg.position.set(x, 0.4, z);
    g.add(leg);
  }
  return g;
}

function buildBlades() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i * Math.PI) / 2;
    const spar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.14), SOOT);
    spar.position.x = 2;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.42), STEEL);
    blade.position.set(3, 0, 0.14);
    arm.add(spar, blade);
    g.add(arm);
  }
  g.position.y = 0.1;
  return g;
}

export class ArsenalView {
  constructor(scene, track, effects) {
    this.scene = scene;
    this.track = track;
    this.effects = effects;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.crateGeo = new THREE.BoxGeometry(2.1, 2.1, 2.1);
    this.crateMat = crateMaterial();
    this.crates = new Map();
    this.things = new Map();
    this.rings = [];
    this.blades = new Map();
    this.matGeo = new THREE.BoxGeometry(2.6, 0.08, 1.8);
    this.matMat = matMaterial();
    this.oilMat = new THREE.MeshStandardMaterial({ color: 0x07070b, metalness: 0.9, roughness: 0.16, transparent: true, polygonOffset: true, polygonOffsetFactor: -3 });
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffe0a8, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    this.tetherGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6);
    this.sharedGeometry = new Set([this.matGeo, this.tetherGeo]);
    this.smokeAccum = 0;
  }

  reset() {
    for (const m of this.things.values()) this.discard(m);
    this.things.clear();
    for (const r of this.rings) this.discard(r.mesh);
    this.rings = [];
    for (const g of this.blades.values()) this.discard(g);
    this.blades.clear();
  }

  // Takes a mesh off the scene and frees what only it was using.
  discard(object) {
    object.removeFromParent();
    object.traverse((o) => {
      if (!o.isMesh) return;
      if (!this.sharedGeometry.has(o.geometry)) o.geometry.dispose();
      if (!SHARED_MATERIALS.has(o.material) && o.material !== this.matMat) o.material.dispose();
    });
  }

  // Oil follows the road's shape, banking and all.
  oilMesh(h) {
    const ring = new THREE.RingGeometry(0.01, h.radius, 28, 5).rotateX(-Math.PI / 2);
    const p = ring.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const wobble = 1 + 0.16 * Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 5 + h.id);
      const x = p.getX(i) * wobble, z = p.getZ(i) * wobble;
      p.setXYZ(i, x, this.track.heightAt(h.x + x, h.z + z) + 0.05, z);
    }
    ring.computeVertexNormals();
    const mat = this.oilMat.clone();
    const mesh = new THREE.Mesh(ring, mat);
    mesh.position.set(h.x, 0, h.z);
    mesh.receiveShadow = true;
    return mesh;
  }

  makeThing(item, type) {
    let mesh;
    if (type === 'rocket') mesh = buildRocket();
    else if (type === 'seeker') mesh = buildSeeker();
    else if (type === 'hook') mesh = buildHook();
    else if (type === 'bull') mesh = buildBull();
    else if (type === 'mine') mesh = new THREE.Mesh(this.matGeo, this.matMat);
    else if (type === 'spring') mesh = buildSpring();
    else if (type === 'oil') mesh = this.oilMesh(item);
    else if (type === 'piano') {
      mesh = new THREE.Group();
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), this.shadowMat.clone());
      shadow.position.set(0, 0.1, 0);
      const piano = buildPiano();
      mesh.add(shadow, piano);
      mesh.userData = { shadow, piano };
    } else if (type === 'tether') {
      mesh = new THREE.Mesh(this.tetherGeo, STEEL);
    } else {
      mesh = new THREE.Group();
    }
    mesh.traverse?.((o) => { if (o.isMesh) o.castShadow = type !== 'oil' && o.material !== this.shadowMat; });
    this.root.add(mesh);
    return mesh;
  }

  // Finds or makes the mesh for this sim object, and marks it as alive this frame.
  thing(item, type) {
    let mesh = this.things.get(item.id);
    if (!mesh) {
      mesh = this.makeThing(item, type);
      this.things.set(item.id, mesh);
    }
    mesh.userData.frame = this.frame;
    return mesh;
  }

  horn(x, y, z) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2), this.ringMat.clone());
    mesh.position.set(x, y + 0.5, z);
    this.root.add(mesh);
    this.rings.push({ mesh, t: 0 });
  }

  bladesFor(car, visual) {
    let g = this.blades.get(car.id);
    if (!g) {
      g = buildBlades();
      visual.root.add(g);
      this.blades.set(car.id, g);
    }
    return g;
  }

  sync(world, visuals, dt, time) {
    this.frame = (this.frame ?? 0) + 1;
    const a = world.arsenal;
    const fx = this.effects;

    for (const crate of a.crates) {
      let mesh = this.crates.get(crate.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.crateGeo, this.crateMat);
        mesh.castShadow = true;
        mesh.position.set(crate.x, crate.y, crate.z);
        this.root.add(mesh);
        this.crates.set(crate.id, mesh);
      }
      mesh.visible = crate.respawn <= 0;
      if (!mesh.visible) continue;
      mesh.rotation.y = time * 1.3 + crate.id;
      mesh.rotation.x = 0.35;
      mesh.position.y = crate.y + Math.sin(time * 2.2 + crate.id) * 0.18;
    }

    for (const s of a.shots) {
      const mesh = this.thing(s, s.kind);
      mesh.position.set(s.x, s.y, s.z);
      if (s.kind === 'rocket' || s.kind === 'hook') {
        mesh.rotation.set(0, Math.atan2(-s.vz, s.vx), 0);
        if (s.kind === 'rocket') fx.exhaust(s.x, s.y, s.z, dt, 1);
      } else if (s.kind === 'seeker') {
        mesh.rotation.set(0, Math.atan2(-s.dz, s.dx), 0);
        fx.exhaust(s.x, s.y, s.z, dt, 0.7);
      } else if (s.kind === 'bull') {
        mesh.rotation.set(0, Math.atan2(-s.dz, s.dx), 0);
        mesh.userData.legs.forEach((leg, i) => { leg.rotation.z = Math.sin(time * 22 + (i % 3) * 2.1) * 0.7; });
        fx.hoofDust(s.x, s.y, s.z, dt);
      }
      if (s.kind === 'hook') {
        const owner = visuals[s.owner];
        if (owner) this.rope(`hook${s.id}`, owner.root.position, mesh.position);
      }
    }

    for (const h of a.hazards) {
      if (h.kind === 'smoke') {
        fx.smokeCloud(h.x, h.y, h.z, h.radius, dt, h.life / h.maxLife);
        continue;
      }
      const mesh = this.thing(h, h.kind);
      if (h.kind === 'oil') {
        mesh.material.opacity = Math.min(0.92, h.life * 0.6);
      } else {
        mesh.position.set(h.x, h.y + (h.kind === 'mine' ? 0.1 : 0.02), h.z);
        if (h.kind === 'mine') mesh.rotation.y = h.id;
      }
    }

    for (const d of a.drops) {
      const mesh = this.thing(d, 'piano');
      mesh.position.set(d.x, d.y, d.z);
      const k = d.t / d.fall;
      mesh.userData.piano.position.y = k * k * ARSENAL.piano.fall * ARSENAL.piano.fall * 0.5 * 28;
      mesh.userData.piano.rotation.set(k * 2, k * 3, k * 1.4);
      mesh.userData.shadow.scale.setScalar(1.4 + (1 - k) * 2.6);
      mesh.userData.shadow.material.opacity = 0.25 + (1 - k) * 0.5;
    }

    for (const t of a.tethers) {
      const from = visuals[t.a]?.root.position, to = visuals[t.b]?.root.position;
      if (from && to) this.rope(`tether${t.id}`, from, to);
    }

    for (const [id, mesh] of this.things) {
      if (mesh.userData.frame === this.frame) continue;
      this.discard(mesh);
      this.things.delete(id);
    }

    for (const car of world.cars) {
      const visual = visuals[car.id];
      if (!visual) continue;
      const blades = this.blades.get(car.id);
      if (car.whirl) {
        const g = this.bladesFor(car, visual);
        g.visible = true;
        g.rotation.y += dt * 22;
        fx.bladeSparks(car, dt);
      } else if (blades) {
        blades.visible = false;
      }
    }

    this.rings = this.rings.filter((r) => {
      r.t += dt;
      const k = r.t / 0.5;
      r.mesh.scale.setScalar(1 + k * ARSENAL.horn.radius);
      r.mesh.material.opacity = Math.max(0, 0.75 * (1 - k));
      if (k < 1) return true;
      this.discard(r.mesh);
      return false;
    });
  }

  rope(key, from, to) {
    const mesh = this.thing({ id: key }, 'tether');
    v.copy(to).sub(from);
    const length = v.length();
    w.copy(from).addScaledVector(v, 0.5);
    mesh.position.copy(w);
    mesh.position.y += 0.4;
    mesh.scale.set(1, length, 1);
    mesh.quaternion.setFromUnitVectors(UP, v.normalize());
  }
}
