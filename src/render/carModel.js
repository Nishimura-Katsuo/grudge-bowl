// A hulking sedan lofted from cross-sections, with an angry face and a body
// shell that actually crumples: impacts displace vertices near the contact.

import * as THREE from 'three';
import { CAR } from '../sim/config.js';
import { createRng, clamp } from '../sim/math.js';

const GROUND_TO_COG = 0.62;

// x, top height above ground, half width at the top, belt height.
const STATIONS = [
  [-2.5, 0.72, 0.6, 0.72],
  [-2.42, 0.86, 0.72, 0.84],
  [-1.9, 0.93, 0.8, 0.9],
  [-1.3, 0.95, 0.8, 0.92],   // base of the rear glass
  [-0.72, 1.36, 0.72, 0.93], // rear of the roof
  [-0.62, 1.37, 0.72, 0.93],
  [0.34, 1.39, 0.72, 0.94],  // front of the roof
  [0.44, 1.38, 0.72, 0.94],
  [1.02, 0.97, 0.8, 0.94],   // base of the windscreen
  [1.7, 0.9, 0.82, 0.9],
  [2.3, 0.82, 0.8, 0.8],
  [2.5, 0.62, 0.72, 0.62],
];

const HALF_WIDTH = 0.98;
const FLOOR = 0.26;

const GLASS_REAR = 3;
const GLASS_FRONT = 7;

function sectionRing(st) {
  const [x, top, topW, belt] = st;
  const y = (v) => v - GROUND_TO_COG;
  return [
    [x, y(FLOOR), 0],
    [x, y(FLOOR), HALF_WIDTH * 0.86],
    [x, y(FLOOR + 0.16), HALF_WIDTH],
    [x, y(belt - 0.1), HALF_WIDTH],
    [x, y(belt), HALF_WIDTH * 0.96],
    [x, y(top - 0.05), topW],
    [x, y(top), topW * 0.72],
    [x, y(top), 0],
  ];
}

function buildShell(carColour, id) {
  const rng = createRng(1009 + id * 31);
  const paint = new THREE.Color(carColour);
  const primer = new THREE.Color(0x7d7f7c);
  const rust = new THREE.Color(0x6b3a1e);
  const glass = new THREE.Color(0x10171d);
  const rocker = new THREE.Color(0x24211f);
  const chrome = new THREE.Color(0xa8a9a6);

  const pos = [];
  const col = [];
  const pushTri = (a, b, c, color) => {
    pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) col.push(color.r, color.g, color.b);
  };
  const quad = (a, b, c, d, color) => {
    pushTri(a, c, b, color);
    pushTri(a, d, c, color);
  };
  const mirror = (p) => [p[0], p[1], -p[2]];

  const sections = STATIONS.map(sectionRing);
  // A large rust or primer patch per car, plus scattered chips.
  const patchX = rng.range(-2, 2), patchR = rng.range(0.5, 1.1), patchSide = rng() < 0.5 ? 1 : -1;

  const colourOf = (s, b, side) => {
    const midX = 0.5 * (STATIONS[s][0] + STATIONS[s + 1][0]);
    if (b <= 1) return rocker;
    if (b === 4 && s >= GLASS_REAR + 1 && s <= GLASS_FRONT - 1 && s !== 5 - 1 && s !== 6) {
      // Side windows; the skipped sections are the pillars.
      return glass;
    }
    if ((b === 5 || b === 6) && (s === GLASS_REAR || s === GLASS_FRONT)) return glass;
    if (b === 2) return midX > 2.2 || midX < -2.3 ? chrome : rocker;
    if (Math.abs(midX - patchX) < patchR && side === patchSide && b <= 4) return rng() < 0.7 ? primer : rust;
    if (rng() < 0.05) return rust;
    return paint;
  };

  for (let s = 0; s < sections.length - 1; s++) {
    const A = sections[s], B = sections[s + 1];
    for (let b = 0; b < A.length - 1; b++) {
      // Right side (+Z): outward-facing winding.
      quad(A[b], A[b + 1], B[b + 1], B[b], colourOf(s, b, 1));
      quad(mirror(A[b]), mirror(B[b]), mirror(B[b + 1]), mirror(A[b + 1]), colourOf(s, b, -1));
    }
  }

  // Caps on the nose and the tail.
  const capColour = new THREE.Color(0x18181a);
  for (const [ring, flip] of [[sections[0], true], [sections[sections.length - 1], false]]) {
    for (let b = 0; b < ring.length - 1; b++) {
      const a = ring[b], c = ring[b + 1];
      const am = mirror(a), cm = mirror(c);
      if (flip) quad(a, cm, am, c, capColour);
      else quad(a, c, am, cm, capColour);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

function numberTexture(n, ink, ground) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.font = "78px 'Bowlby One', Impact, sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function addFace(group) {
  // Headlamp eyes behind slanted steel brows: the car is always frowning.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd76a });
  const browMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.5, metalness: 0.4 });
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.17, 12), eyeMat);
    eye.position.set(2.505, 0.74 - GROUND_TO_COG, side * 0.56);
    eye.rotation.y = Math.PI / 2;
    group.add(eye);
    eyes.push(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.46), browMat);
    brow.position.set(2.515, 0.84 - GROUND_TO_COG, side * 0.56);
    brow.rotation.x = side * -0.36;
    group.add(brow);
  }

  // Grille of bared chrome teeth.
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xcfcfc8, metalness: 0.8, roughness: 0.35 });
  const tooth = new THREE.ConeGeometry(0.06, 0.2, 4);
  for (let i = -4; i <= 4; i++) {
    for (const row of [0, 1]) {
      const t = new THREE.Mesh(tooth, toothMat);
      t.position.set(2.5, (row ? 0.56 : 0.34) - GROUND_TO_COG + (row ? 0 : 0.0), i * 0.11);
      if (row) t.rotation.z = Math.PI;
      group.add(t);
    }
  }

  const bumper = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.16, 2.0),
    new THREE.MeshStandardMaterial({ color: 0xa8a9a6, metalness: 0.85, roughness: 0.4 }),
  );
  bumper.position.set(2.52, 0.3 - GROUND_TO_COG, 0);
  group.add(bumper);
  const rear = bumper.clone();
  rear.position.x = -2.52;
  group.add(rear);
  return { eyes, eyeMat, bumper, rear };
}

function buildWheel() {
  const group = new THREE.Group();
  const tyre = new THREE.Mesh(
    new THREE.CylinderGeometry(CAR.wheelRadius, CAR.wheelRadius, 0.27, 16).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.92 }),
  );
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.29, 6).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x8c8a84, metalness: 0.7, roughness: 0.5 }),
  );
  tyre.castShadow = true;
  group.add(tyre, hub);
  return group;
}

export function createCarVisual(car) {
  const root = new THREE.Group();
  const geometry = buildShell(car.colour, car.id);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
  const shell = new THREE.Mesh(geometry, material);
  shell.castShadow = true;
  shell.receiveShadow = true;
  root.add(shell);

  const face = addFace(root);

  const number = car.id + 1;
  const numTex = numberTexture(number, '#1a1b20', '#f3e2bd');
  const decal = new THREE.MeshBasicMaterial({ map: numTex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), decal);
  roof.rotation.x = -Math.PI / 2;
  roof.rotation.z = -Math.PI / 2;
  roof.position.set(-0.14, 1.4 - GROUND_TO_COG, 0);
  root.add(roof);
  for (const side of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.56), decal);
    door.position.set(0.02, 0.62 - GROUND_TO_COG, side * (HALF_WIDTH + 0.012));
    door.rotation.y = side > 0 ? 0 : Math.PI;
    root.add(door);
  }

  const wheels = car.wheels.map(() => {
    const w = buildWheel();
    root.add(w);
    return w;
  });

  return {
    root,
    shell,
    geometry,
    originalPos: geometry.attributes.position.array.slice(),
    wheels,
    face,
    crumpleBudget: 1,
    rage: 0,
    scorch: 0,
  };
}

const ndir = new THREE.Vector3();
const local = new THREE.Vector3();
const invQuat = new THREE.Quaternion();

// World-space impact point and direction into the car.
export function crumple(visual, worldPoint, worldNormal, strength) {
  const pos = visual.geometry.attributes.position;
  const col = visual.geometry.attributes.color;
  const orig = visual.originalPos;
  invQuat.copy(visual.root.quaternion).invert();
  local.copy(worldPoint).sub(visual.root.position).applyQuaternion(invQuat);
  ndir.copy(worldNormal).applyQuaternion(invQuat).normalize();

  const radius = 0.7 + strength * 1.1;
  const depth = 0.08 + strength * 0.4;
  const a = pos.array;
  const seed = local.x * 7.1 + local.z * 3.3;
  for (let i = 0; i < a.length; i += 3) {
    const dx = a[i] - local.x, dy = a[i + 1] - local.y, dz = a[i + 2] - local.z;
    const d = Math.sqrt(dx * dx + dy * dy * 0.6 + dz * dz);
    if (d > radius) continue;
    const f = 1 - d / radius;
    const falloff = f * f * (3 - 2 * f);
    // Positional noise, so vertices shared by flat faces move together.
    const n = 0.75 + 0.45 * Math.sin(orig[i] * 9.3 + seed) * Math.sin(orig[i + 2] * 8.7 + orig[i + 1] * 5.1);
    const push = depth * falloff * n;
    a[i] += ndir.x * push;
    a[i + 1] += ndir.y * push * 0.5 - falloff * 0.02;
    a[i + 2] += ndir.z * push;

    // Sheet metal folds a long way, but each panel stays on its own side of the car.
    const oz = orig[i + 2], ox = orig[i];
    if (Math.abs(oz) < 0.05) {
      a[i + 2] = clamp(a[i + 2], -0.12, 0.12);
    } else {
      const side = Math.sign(oz);
      const inner = Math.max(0.08, Math.abs(oz) - 0.72);
      const outer = Math.abs(oz) + 0.1;
      a[i + 2] = side * clamp(side * a[i + 2], inner, outer);
    }
    a[i] = clamp(a[i], ox - 0.95, ox + 0.95);

    // Paint scrapes off toward raw metal where the blow landed.
    const c = falloff * strength * 0.9;
    const k = i;
    col.array[k] += (0.42 - col.array[k]) * c;
    col.array[k + 1] += (0.27 - col.array[k + 1]) * c;
    col.array[k + 2] += (0.2 - col.array[k + 2]) * c;
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  visual.geometry.computeVertexNormals();
}

const qSim = new THREE.Quaternion();
const qPrev = new THREE.Quaternion();

export function syncCarVisual(visual, car, alpha, telemetry, time) {
  const p = car.prev;
  visual.root.position.set(
    p.px + (car.px - p.px) * alpha,
    p.py + (car.py - p.py) * alpha,
    p.pz + (car.pz - p.pz) * alpha,
  );
  qPrev.set(p.qx, p.qy, p.qz, p.qw);
  qSim.set(car.qx, car.qy, car.qz, car.qw);
  visual.root.quaternion.copy(qPrev).slerp(qSim, alpha);

  for (let i = 0; i < 4; i++) {
    const w = car.wheels[i];
    const m = visual.wheels[i];
    if (!w.attached) {
      m.visible = false;
      continue;
    }
    const travel = Math.min(w.comp, CAR.suspTravel + 0.04);
    m.position.set(w.x, CAR.hardpointY - (CAR.suspRestLength - travel), w.z);
    m.rotation.order = 'YXZ';
    m.rotation.set(0, w.front ? -car.steerAngle : 0, -w.angle);
    if (w.hp < 0.45) m.rotation.x = 0.12 * Math.sign(w.z);
  }

  const rage = telemetry?.rage ?? 0;
  visual.rage += (rage - visual.rage) * 0.1;
  const lit = car.alive ? 1 : 0;
  const flicker = car.health < 0.35 && Math.sin(time * 23 + car.id) > 0.5 ? 0.25 : 1;
  const eye = visual.face.eyeMat;
  eye.color.setRGB(
    (1.0 + visual.rage * 1.4) * lit * flicker + 0.02,
    (0.8 - visual.rage * 0.62) * lit * flicker + 0.02,
    0.32 * (1 - visual.rage) * lit * flicker + 0.02,
  );
}

export function retireCarVisual(visual) {
  const m = visual.shell.material;
  m.roughness = 0.9;
  m.metalness = 0.05;
  m.color.setRGB(0.38, 0.34, 0.32);
  visual.face.bumper.rotation.z = 0.2;
}
