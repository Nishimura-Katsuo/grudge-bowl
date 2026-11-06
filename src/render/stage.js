// The ground under a race: terrain painted from the sim's surface map, barriers built
// from the sim's wall polylines, then whatever the course's world puts around them.
// The Knot's county fair lives here. The other worlds are in worlds.js.

import * as THREE from 'three';
import { createRng } from '../sim/math.js';
import {
  assemble, broadleafTree, buildCrowd, crushedCar, fencePost, ferrisWheel, floodlamp, instanced, lightTower, makeSign,
  marshalTower, painted, pineTree, solid, stackedTyre, strut, waterTower, wheelBulbs,
} from './props.js';
import { WORLDS } from './worlds.js';
import { GROUNDS, glowSize, groundSize, paintGlow, paintGround } from './groundPaint.js';

const FENCE_FOOT = 1.1; // top of the barrier
const FENCE_TOP = 4.6;
const FENCE_MESH = 0.9; // metres per diamond

// Runs of stands as [crossroads pass, metres past it], outside the three loops.
const FENCE_POST_GAP = 6;

const STAND_SPANS = [
  [[1, 30], [1, 190]],
  [[3, 72], [3, 230]],
  [[5, 170], [5, 300]],
];

// Every sponsor anywhere in the game is invented.
const KNOT_LOOK = {
  exposure: 0.95,
  fog: [0xd9925a, 0.0015],
  sunDir: [-0.62, 0.3, 0.72],
  sun: [0xffb36b, 2.9],
  hemi: [0xffd9b0, 0x8a5a3a, 1.9],
  sky: {
    horizon: [1, 0.56, 0.27], mid: [0.86, 0.32, 0.3], zenith: [0.17, 0.2, 0.42],
    glow: [1, 0.72, 0.42], disc: [1, 0.9, 0.7], bands: 1, stars: 0,
  },
  hills: [{ r: 560, h: 46, color: 0x6e3a3a }, { r: 430, h: 28, color: 0x4d2a2c }],
  apron: 0x6c5a33,
  panels: [
    ['#c8321f', '#f3e2bd', "BIG DON'S TOWING"],
    ['#e8b023', '#1a1b20', 'HOT LARD DONUTS'],
    ['#1f6b6b', '#f3e2bd', 'TRI-COUNTY SCRAP'],
    ['#f3e2bd', '#c8321f', 'NO REFUNDS'],
    ['#2a2c35', '#e8b023', 'LOU\'S RADIATORS'],
    ['#c8321f', '#f3e2bd', 'DENTS WHILE U WAIT'],
    ['#1f6b6b', '#e8b023', 'FAIRVIEW CHIROPRACTIC'],
    ['#e8b023', '#c8321f', 'GRUDGE BOWL'],
  ],
  build(root, track, rng) {
    const spans = STAND_SPANS.map(([from, to]) => ({ from: track.passes[from[0]].s + from[1], to: track.passes[to[0]].s + to[1] }));
    root.add(buildGrandstands(track, rng, spans));
    root.add(buildInfield(track, rng));
    root.add(buildLightTowers(track));
    root.add(buildScenery(track, rng));
  },
};

export function buildStage(scene, track) {
  const rng = createRng(0xb0a1);
  const look = WORLDS[track.course.id] ?? KNOT_LOOK;
  const root = new THREE.Group();
  const sunDir = new THREE.Vector3(...look.sunDir).normalize();
  scene.add(root);

  scene.background = null;
  scene.fog = new THREE.FogExp2(...look.fog);
  root.add(buildSky(look.sky, sunDir));
  root.add(buildDistantHills(rng, look.hills));
  root.add(buildTerrain(track, look));
  root.add(buildBarriers(track, look.panels));
  root.add(buildCatchFence(track));
  root.add(buildFencePosts(track));
  root.add(buildJumpGantries(track));
  const animate = look.build(root, track, rng) ?? null;

  const hemi = new THREE.HemisphereLight(...look.hemi);
  root.add(hemi);

  const sun = new THREE.DirectionalLight(...look.sun);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -62; s.right = 62; s.top = 62; s.bottom = -62; s.near = 10; s.far = 460;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.4;
  root.add(sun);
  root.add(sun.target);

  return {
    sun,
    exposure: look.exposure,
    update(focus, time, dt) {
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(sunDir, 220);
      sun.target.updateMatrixWorld();
      animate?.(time, dt);
    },
    // A stage is rebuilt for every course, so nothing of the last one may stay on the GPU.
    dispose() {
      scene.remove(root);
      const owned = new Set();
      root.traverse((o) => {
        if (o.geometry) owned.add(o.geometry);
        for (const m of [o.material].flat()) {
          if (!m) continue;
          owned.add(m);
          for (const value of Object.values(m)) if (value?.isTexture) owned.add(value);
        }
        if (o.isInstancedMesh) owned.add(o);
      });
      sun.shadow.map?.dispose();
      for (const item of owned) item.dispose();
    },
  };
}

function buildSky(sky, sunDir) {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      sunDir: { value: sunDir },
      horizon: { value: new THREE.Vector3(...sky.horizon) },
      mid: { value: new THREE.Vector3(...sky.mid) },
      zenith: { value: new THREE.Vector3(...sky.zenith) },
      glow: { value: new THREE.Vector3(...sky.glow) },
      disc: { value: new THREE.Vector3(...sky.disc) },
      bandShare: { value: sky.bands },
      stars: { value: sky.stars },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 sunDir, horizon, mid, zenith, glow, disc;
      uniform float bandShare, stars;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        c = mix(c, zenith, smoothstep(0.16, 0.7, h));
        float d = max(dot(normalize(vDir), sunDir), 0.0);
        c += glow * pow(d, 12.0) * 0.55;
        c += disc * smoothstep(0.9994, 0.9998, d) * 3.0;
        float bands = sin(vDir.y * 34.0 + vDir.x * 5.0) * 0.5 + 0.5;
        c += vec3(0.5, 0.2, 0.12) * smoothstep(0.55, 0.95, bands) * smoothstep(0.02, 0.1, h) * (1.0 - smoothstep(0.1, 0.3, h)) * 0.25 * bandShare;
        if (stars > 0.0) {
          vec3 cell = floor(normalize(vDir) * 150.0);
          float twinkle = step(0.9975, hash(cell));
          c += vec3(0.85, 0.9, 1.0) * twinkle * stars * smoothstep(0.02, 0.2, vDir.y);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

function buildDistantHills(rng, layers) {
  const group = new THREE.Group();
  for (const l of layers) {
    const n = 180;
    const pos = [];
    const phase = rng() * 10;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const y = l.h * (0.55 + 0.3 * Math.sin(a * 5 + phase) + 0.15 * Math.sin(a * 13 + phase * 2) + 0.1 * Math.sin(a * 31));
      const x = Math.cos(a) * l.r, z = Math.sin(a) * l.r;
      pos.push(x, -6, z, x, y, z);
    }
    const idx = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    group.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: l.color, side: THREE.DoubleSide, fog: false })));
  }
  return group;
}

// Ground maps outlive the stage that showed them. The worker fills this in the background.
const paintedGrounds = new Map();

export function adoptGround(id, maps) {
  if (!paintedGrounds.has(id)) paintedGrounds.set(id, maps);
}

// Without the worker, paint here. It's slow, but it only happens once for a course.
function groundMaps(track) {
  const id = track.course.id;
  if (!paintedGrounds.has(id)) {
    const canvasFor = (size) => Object.assign(document.createElement('canvas'), size);
    const map = canvasFor(groundSize(track));
    paintGround(track, map);
    let glow = null;
    if (GROUNDS[id].glow) {
      glow = canvasFor(glowSize(track));
      paintGlow(track, glow);
    }
    paintedGrounds.set(id, { map, glow });
  }
  return paintedGrounds.get(id);
}

// A worker hands over an ImageBitmap, and those always upload the right way up.
function textureOf(source) {
  const tex = source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(source) : new THREE.Texture(source);
  tex.flipY = source instanceof HTMLCanvasElement;
  tex.needsUpdate = true;
  return tex;
}

function buildTerrain(track, look) {
  const maps = groundMaps(track);
  const map = textureOf(maps.map);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const b = track.bounds;
  const nx = b.maxX - b.minX + 1, nz = b.maxZ - b.minZ + 1;
  const pos = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = b.minX + ((b.maxX - b.minX) * ix) / (nx - 1);
      const z = b.minZ + ((b.maxZ - b.minZ) * iz) / (nz - 1);
      const i = iz * nx + ix;
      pos[i * 3] = x;
      pos[i * 3 + 1] = track.heightAt(x, z);
      pos[i * 3 + 2] = z;
      uv[i * 2] = ix / (nx - 1);
      uv[i * 2 + 1] = map.flipY ? 1 - iz / (nz - 1) : iz / (nz - 1);
    }
  }
  const idx = [];
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix, c = a + nx;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
  if (maps.glow) {
    mat.emissive = new THREE.Color(look.glowColor);
    mat.emissiveIntensity = look.glowPower;
    mat.emissiveMap = textureOf(maps.glow);
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(mesh);
  const apron = new THREE.Mesh(
    new THREE.CircleGeometry(860, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: look.apron, roughness: 1 }),
  );
  apron.position.y = -0.6;
  group.add(apron);
  return group;
}

// Sign-painted hoardings along the barrier.
function paintHoardings(panels) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const w = canvas.width / panels.length;
  panels.forEach(([bg, fg, text], i) => {
    ctx.fillStyle = bg;
    ctx.fillRect(i * w, 0, w, 128);
    ctx.fillStyle = fg;
    ctx.font = "bold 40px 'Bowlby One', Impact, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 40;
    while (ctx.measureText(text).width > w - 22 && size > 16) {
      size -= 2;
      ctx.font = `bold ${size}px 'Bowlby One', Impact, sans-serif`;
    }
    ctx.fillText(text, i * w + w / 2, 66);
    ctx.fillStyle = 'rgba(20,10,5,0.35)';
    ctx.fillRect(i * w, 0, 3, 128);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function buildBarriers(track, panels) {
  const positions = [], uvs = [], indices = [];
  const profile = [[0.32, -0.3], [0.32, 0.25], [0.12, 1.15], [-0.12, 1.15], [-0.32, 0.25], [-0.32, -0.3]];
  const vProfile = [0, 0.1, 1, 0.02, 0.02, 0.02];

  for (const poly of track.polys) {
    let length = 0;
    const n = poly.length;
    const start = positions.length / 3;
    // Paint faces the track, reading left to right from the driver's side.
    const [ax, az] = poly[0];
    const [bx, bz] = poly[1];
    const seg = Math.hypot(bx - ax, bz - az) || 1;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const probeX = -(bz - az) / seg, probeZ = (bx - ax) / seg;
    const facing = track.sdfAt(mx + probeX * 2, mz + probeZ * 2) > track.sdfAt(mx - probeX * 2, mz - probeZ * 2) ? 1 : -1;
    for (let i = 0; i <= n; i++) {
      const p = poly[i % n];
      const prev = poly[(i + n - 1) % n], next = poly[(i + 1) % n];
      let tx = next[0] - prev[0], tz = next[1] - prev[1];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      const nx = -tz, nz = tx;
      if (i > 0) length += Math.hypot(p[0] - poly[i - 1][0], p[1] - poly[(i - 1)][1]);
      const h = track.heightAt(p[0], p[1]);
      for (let k = 0; k < profile.length; k++) {
        const [o, y] = profile[k];
        positions.push(p[0] + nx * o * facing, h + y, p[1] + nz * o * facing);
        uvs.push((facing * length) / 96, vProfile[k]);
      }
    }
    const m = profile.length;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < m - 1; k++) {
        const a = start + i * m + k, b = a + m;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: paintHoardings(panels), roughness: 0.85, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Stands follow the road, on the outside of the long corners. Each tier is a
// strip offset from the centreline, stopping wherever it would reach another road.
// Wire lattice for the catch fence, one diamond per tile.
function paintFence() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#d8d2c2';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(128, 128);
  ctx.moveTo(128, 0); ctx.lineTo(0, 128);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// The sim's walls have no top: a car in the air still stops at the barrier line.
// This fence is what it hits, so that isn't an invisible wall.
function buildCatchFence(track) {
  const positions = [], uvs = [], indices = [];
  for (const poly of track.polys) {
    const start = positions.length / 3;
    let length = 0;
    const n = poly.length;
    for (let i = 0; i <= n; i++) {
      const p = poly[i % n];
      if (i > 0) length += Math.hypot(p[0] - poly[i - 1][0], p[1] - poly[i - 1][1]);
      const h = track.heightAt(p[0], p[1]);
      positions.push(p[0], h + FENCE_FOOT, p[1], p[0], h + FENCE_TOP, p[1]);
      uvs.push(length / FENCE_MESH, 0, length / FENCE_MESH, (FENCE_TOP - FENCE_FOOT) / FENCE_MESH);
    }
    for (let i = 0; i < n; i++) {
      const a = start + i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  const mat = new THREE.MeshBasicMaterial({
    map: paintFence(), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.02,
  });
  return new THREE.Mesh(geo, mat);
}

function buildFencePosts(track) {
  const spots = [];
  for (const poly of track.polys) {
    let carried = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let at = FENCE_POST_GAP - carried;
      while (at < length) {
        const t = at / length;
        spots.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        at += FENCE_POST_GAP;
      }
      carried = length - (at - FENCE_POST_GAP);
    }
  }
  return instanced(fencePost(FENCE_TOP), painted(), spots.length, (dummy, tint, i) => {
    const [x, z] = spots[i];
    dummy.position.set(x, track.heightAt(x, z), z);
  });
}

const track_at = (track, s) => {
  const i = track.indexAt(s);
  return [track.centre.px[i], track.centre.pz[i]];
};

export function buildGrandstands(track, rng, spans, crowd) {
  const group = new THREE.Group();
  const tiers = 8;
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 0.95, side: THREE.DoubleSide });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8c6a42, roughness: 0.85, side: THREE.DoubleSide });
  const steel = [];
  const positions = [];
  const benches = [];
  const c = track.centre;
  const clear = (x, z) => track.sdfAt(x, z) < -2.5;
  const quad = (list, a, b, d, e) => list.push(...a, ...b, ...d, ...a, ...d, ...e);

  spans.forEach(({ from, to, side = 1 }) => {
    const seats = [];
    const floor = track.course.ground ? track.heightAt(...track_at(track, (from + to) / 2)) : 0;
    for (let t = 0; t < tiers; t++) {
      const y = floor + 2.3 + t * 0.95;
      const near = 5.5 + t * 1.5;
      const riser = t === 0 ? y : 0.97;
      let last = null;
      const wall = (p) => quad(positions, [p.x0, y, p.z0], [p.x1, y, p.z1], [p.x1, floor, p.z1], [p.x0, floor, p.z0]);
      for (let s = from; s <= to + 3; s += 3) {
        const i = track.indexAt(s);
        // On the Knot every corner is a right-hander, so the outside is on the left.
        const nx = c.tz[i] * side, nz = -c.tx[i] * side;
        const r = track.hw[i] + near;
        const x0 = c.px[i] + nx * r, z0 = c.pz[i] + nz * r;
        const x1 = x0 + nx * 1.6, z1 = z0 + nz * 1.6;
        const here = s <= to && clear(x0, z0) && clear(x1, z1) ? { x0, z0, x1, z1, nx, nz, i } : null;
        // A stand stops in a stepped end wall, not an open edge.
        if (here && !last) wall(here);
        if (!here && last) wall(last);
        if (here && last) {
          quad(positions, [last.x0, y, last.z0], [here.x0, y, here.z0], [here.x1, y, here.z1], [last.x1, y, last.z1]);
          quad(positions, [last.x0, y - riser, last.z0], [here.x0, y - riser, here.z0], [here.x0, y, here.z0], [last.x0, y, last.z0]);
          if (t === tiers - 1) {
            quad(positions, [last.x1, y + 1.4, last.z1], [here.x1, y + 1.4, here.z1], [here.x1, floor, here.z1], [last.x1, floor, last.z1]);
          }
          const bench = (p, out) => [p.x0 + p.nx * out, y + 0.45, p.z0 + p.nz * out];
          const low = (p, out) => [p.x0 + p.nx * out, y, p.z0 + p.nz * out];
          quad(benches, bench(last, 0.72), bench(here, 0.72), bench(here, 1.14), bench(last, 1.14));
          quad(benches, low(last, 0.72), low(here, 0.72), bench(here, 0.72), bench(last, 0.72));
        }
        // Every tenth bay is an aisle, with nobody in it.
        const bay = Math.round((s - from) / 3);
        if (here && bay % 10 !== 0) {
          for (let k = 0; k < 4; k++) {
            if (rng() < 0.22) continue;
            const u = 0.38 + k * 0.75 + rng() * 0.06, v = 0.95 + rng() * 0.05;
            seats.push({
              x: x0 + c.tx[i] * u + nx * v, y, z: z0 + c.tz[i] * u + nz * v,
              yaw: Math.atan2(-nx, -nz) + (rng() - 0.5) * 0.7,
              size: 0.94 + rng() * 0.14,
              cheering: rng() < 0.14,
              hat: rng() < 0.42,
            });
          }
          // Handrail along the front of the lowest tier.
          if (t === 0 && last) steel.push(strut([x0 - nx * 0.15, y, z0 - nz * 0.15], [x0 - nx * 0.15, y + 1, z0 - nz * 0.15], 0.035, 0x4b4640, 4));
          if (t === 0 && last) steel.push(strut([last.x0 - last.nx * 0.15, y + 1, last.z0 - last.nz * 0.15], [x0 - nx * 0.15, y + 1, z0 - nz * 0.15], 0.04, 0x4b4640, 4));
        }
        last = here;
      }
    }
    group.add(buildCrowd(seats, rng, crowd));
  });

  const sheet = (list, material) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  sheet(positions, concrete);
  sheet(benches, wood);
  group.add(solid(assemble(steel)));
  return group;
}

function loopCentre(poly) {
  let x = 0, z = 0;
  for (const p of poly) { x += p[0]; z += p[1]; }
  x /= poly.length; z /= poly.length;
  let reach = 0;
  for (const p of poly) reach = Math.max(reach, Math.hypot(p[0] - x, p[1] - z));
  return { x, z, reach };
}

function buildInfield(track, rng) {
  const group = new THREE.Group();
  const scrapColours = [0x8a5a3c, 0x6a6d72, 0x96392a, 0x4f7560, 0xa8974a, 0x3f5e8c, 0x6b3a2a];

  // The longest wall loop runs round the outside. The rest enclose infields.
  const loops = track.polys.map(loopCentre).sort((a, b) => b.reach - a.reach).slice(1);
  const lobes = loops.filter((l) => l.reach > 30);

  // Stacks of past contestants in each loop, crushed and left in piles.
  const wrecks = [[], [], []];
  for (const lobe of lobes) {
    for (let k = 0; k < 14; k++) {
      const a = rng() * Math.PI * 2;
      const r = 4 + rng() * lobe.reach * 0.75;
      const baseX = lobe.x + Math.cos(a) * r;
      const baseZ = lobe.z + Math.sin(a) * r;
      if (track.sdfAt(baseX, baseZ) > -5) continue;
      const layers = 1 + Math.floor(rng() * 4);
      const yaw = rng() * Math.PI;
      for (let l = 0; l < layers; l++) {
        wrecks[Math.floor(rng() * wrecks.length)].push({
          x: baseX + (rng() - 0.5) * 0.5, y: 0.45 + l * 0.86, z: baseZ + (rng() - 0.5) * 0.5,
          pitch: (rng() - 0.5) * 0.08, yaw: yaw + (rng() - 0.5) * 0.3 + (rng() < 0.5 ? Math.PI : 0), roll: (rng() - 0.5) * 0.08,
          paint: scrapColours[Math.floor(rng() * scrapColours.length)],
        });
      }
    }
  }
  const scrapMaterial = painted(0.8);
  wrecks.forEach((pile, variant) => {
    if (pile.length === 0) return;
    const mesh = instanced(crushedCar(31 + variant * 7), scrapMaterial, pile.length, (dummy, tint, i) => {
      const w = pile[i];
      dummy.position.set(w.x, w.y, w.z);
      dummy.rotation.set(w.pitch, w.yaw, w.roll);
      tint.setHex(w.paint);
    });
    mesh.castShadow = true;
    group.add(mesh);
  });

  // Water towers with the only signs anyone reads.
  lobes.forEach((lobe, i) => {
    const warm = i % 2 === 0;
    const tower = solid(waterTower(warm ? 0xe8b023 : 0xc8321f), painted(0.7));
    tower.position.set(lobe.x, 0, lobe.z);
    tower.name = 'waterTower';
    group.add(tower);
    for (const face of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const sign3d = makeSign('GRUDGE BOWL', 8.2, 3.4, warm ? '#e8b023' : '#c8321f', warm ? '#c8321f' : '#f3e2bd');
      sign3d.position.set(lobe.x + Math.sin(face) * 6.05, 21, lobe.z + Math.cos(face) * 6.05);
      sign3d.rotation.y = face;
      group.add(sign3d);
    }
  });

  // Tyre stacks on every barrier point at a crossroads. Decorative: the barrier does the stopping.
  const stacks = [];
  for (const point of goreNoses(track)) {
    const outX = point.x - point.cx, outZ = point.z - point.cz;
    const l = Math.hypot(outX, outZ) || 1;
    const ux = outX / l, uz = outZ / l;
    for (let k = 0; k < 7; k++) {
      for (let h = 0; h < 3; h++) {
        const along = (k - 3) * 1.05, back = 0.8 + Math.abs(k - 3) * 0.5;
        stacks.push({ x: point.x + ux * back - uz * along, y: 0.18 + h * 0.33, z: point.z + uz * back + ux * along, paint: h === 2 ? (k % 2 ? 0xc8321f : 0xe6dfd0) : 0x17181b });
      }
    }
  }
  const tyres = instanced(stackedTyre(), painted(0.9), stacks.length, (dummy, tint, i) => {
    const t = stacks[i];
    dummy.position.set(t.x, t.y, t.z);
    dummy.rotation.y = i * 1.7;
    tint.setHex(t.paint);
  });
  tyres.castShadow = true;
  group.add(tyres);

  // The marshal's tower stands on the triangle in the middle of the three crossroads.
  const heart = centreOfCrossroads(track);
  const marshal = solid(marshalTower(), painted(0.7));
  marshal.position.set(heart.x, 0, heart.z);
  marshal.name = 'marshalTower';
  group.add(marshal);
  return group;
}

// Where the barrier comes to a point at each crossroads.
export function goreNoses(track) {
  const noses = [];
  for (const x of track.crossings) {
    const a = track.indexAt(x.sA), b = track.indexAt(x.sB);
    const c = track.centre;
    const reach = track.halfWidthAt(x.sA);
    for (const sideA of [1, -1]) {
      for (const sideB of [1, -1]) {
        const ax = c.tx[a] * sideA + c.tx[b] * sideB, az = c.tz[a] * sideA + c.tz[b] * sideB;
        const l = Math.hypot(ax, az) || 1;
        const half = Math.acos(Math.max(-1, Math.min(1, (c.tx[a] * sideA * c.tx[b] * sideB + c.tz[a] * sideA * c.tz[b] * sideB)))) / 2;
        const d = reach / Math.sin(half);
        noses.push({ x: x.x + (ax / l) * d, z: x.z + (az / l) * d, cx: x.x, cz: x.z });
      }
    }
  }
  return noses;
}

export function centreOfCrossroads(track) {
  let x = 0, z = 0;
  for (const c of track.crossings) { x += c.x; z += c.z; }
  return { x: x / track.crossings.length, z: z / track.crossings.length };
}

function buildJumpGantries(track) {
  const group = new THREE.Group();
  const steel = painted(0.7);
  const c = track.centre;
  for (const j of track.jumps) {
    const i = track.indexAt(j.lipS - 20);
    const hw = track.hw[i];
    const nx = -c.tz[i], nz = c.tx[i];
    const base = track.heightAt(c.px[i], c.pz[i]);
    const yaw = Math.atan2(c.tx[i], c.tz[i]);
    const frame = [];
    for (const side of [1, -1]) {
      const px = c.px[i] + nx * side * (hw + 0.8), pz = c.pz[i] + nz * side * (hw + 0.8);
      frame.push(strut([px, base, pz], [px, base + 8, pz], 0.2, 0x2f2c2c, 6));
      frame.push(strut([px - c.tx[i] * 1.8, base, pz - c.tz[i] * 1.8], [px, base + 3.8, pz], 0.09, 0x2f2c2c));
      frame.push(strut([px + c.tx[i] * 1.8, base, pz + c.tz[i] * 1.8], [px, base + 3.8, pz], 0.09, 0x2f2c2c));
    }
    const across = (side, y) => [c.px[i] + nx * side * (hw + 0.8), base + y, c.pz[i] + nz * side * (hw + 0.8)];
    frame.push(strut(across(1, 7.85), across(-1, 7.85), 0.09, 0x2f2c2c));
    frame.push(strut(across(1, 5.95), across(-1, 5.95), 0.09, 0x2f2c2c));
    group.add(solid(assemble(frame), steel));
    // One panel per face, so the name reads from both directions.
    for (const face of [0, 1]) {
      const panel = makeSign(j.name.toUpperCase(), hw * 2 + 1.4, 1.7, '#c8321f', '#f3e2bd');
      const back = face ? 0.04 : -0.04;
      panel.position.set(c.px[i] + c.tx[i] * back, base + 6.9, c.pz[i] + c.tz[i] * back);
      panel.rotation.y = yaw + (face ? 0 : Math.PI);
      group.add(panel);
    }
  }
  return group;
}

function buildLightTowers(track) {
  const group = new THREE.Group();
  // Eight poles round the outside, walked in from far out until the fence is close.
  const offsets = [];
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) / 8) * Math.PI * 2;
    let r = 230;
    while (r > 20 && track.sdfAt(Math.cos(a) * r, Math.sin(a) * r) < -9) r -= 2;
    offsets.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const towers = instanced(lightTower(), painted(0.7), offsets.length, (dummy, tint, i) => {
    dummy.position.set(offsets[i][0], 0, offsets[i][1]);
    dummy.rotation.y = Math.atan2(-offsets[i][0], -offsets[i][1]);
  });
  towers.castShadow = true;
  towers.name = 'lightTowers';
  group.add(towers);

  const lamps = [];
  for (const [x, z] of offsets) {
    const yaw = Math.atan2(-x, -z);
    for (let i = -2; i <= 2; i++) {
      for (let j = 0; j < 2; j++) {
        const lx = i * 1.05, ly = 29.45 + j * 1.1;
        lamps.push({ x: x + Math.cos(yaw) * lx + Math.sin(yaw) * 0.26, y: ly, z: z - Math.sin(yaw) * lx + Math.cos(yaw) * 0.26, yaw });
      }
    }
  }
  group.add(instanced(floodlamp(), new THREE.MeshBasicMaterial({ color: 0xfff0c8 }), lamps.length, (dummy, tint, i) => {
    const l = lamps[i];
    dummy.position.set(l.x, l.y, l.z);
    dummy.rotation.y = l.yaw;
  }));
  return group;
}

function isInside(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function buildScenery(track, rng) {
  const group = new THREE.Group();

  // Ferris wheel out past the stands, turned against the sunset.
  const wheel = new THREE.Group();
  const hubHeight = 32;
  const frame = solid(ferrisWheel(-hubHeight), painted(0.7), false);
  frame.name = 'ferrisWheel';
  wheel.add(frame);
  wheel.add(new THREE.Mesh(wheelBulbs(), new THREE.MeshBasicMaterial({ color: 0xffe2a0, vertexColors: true })));
  wheel.position.set(-210, hubHeight, -120);
  wheel.rotation.y = 0.6;
  group.add(wheel);

  // Woods round the fairground, outside the outer wall so nothing stands between a
  // camera and the road: pines at the back, broadleaves turning for autumn in front.
  const outer = track.polys.reduce((a, b) => (loopCentre(a).reach > loopCentre(b).reach ? a : b));
  const fromWall = (x, z) => {
    let nearest = Infinity;
    for (let i = 0; i < outer.length; i += 6) nearest = Math.min(nearest, Math.hypot(outer[i][0] - x, outer[i][1] - z));
    return nearest;
  };
  const stands = [];
  for (let tries = 0; tries < 4000 && stands.length < 170; tries++) {
    const a = rng() * Math.PI * 2, r = 170 + rng() * 230;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    // The sim's distance field stops at the edge of its grid, so this measures for itself.
    if (isInside(outer, x, z) || fromWall(x, z) < 34) continue;
    if (Math.hypot(x + 210, z + 120) < 44) continue;
    stands.push({ x, z, yaw: rng() * Math.PI * 2, size: 0.8 + rng() * 0.9, pine: r > 245 ? rng() < 0.8 : rng() < 0.35, shade: rng() });
  }
  const leaves = [0x5d6b35, 0x7a7a35, 0xa87a2e, 0xb55a2a, 0x6e5a2f, 0x4f6438];
  const needles = [0x3b5236, 0x2f4733, 0x46583a];
  const woodland = painted(0.95);
  const kinds = [
    [true, pineTree(3)], [true, pineTree(19)], [false, broadleafTree(5)], [false, broadleafTree(23)],
  ];
  kinds.forEach(([pine, geometry], kind) => {
    const some = stands.filter((t, i) => t.pine === pine && i % 2 === kind % 2);
    if (some.length === 0) return;
    const trees = instanced(geometry, woodland, some.length, (dummy, tint, i) => {
      const t = some[i];
      dummy.position.set(t.x, 0, t.z);
      dummy.rotation.y = t.yaw;
      dummy.scale.setScalar(t.size);
      const list = pine ? needles : leaves;
      tint.setHex(list[Math.floor(t.shade * list.length)]);
    });
    trees.name = 'trees';
    group.add(trees);
  });
  return group;
}
