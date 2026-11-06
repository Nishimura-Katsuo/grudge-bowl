// The Knot at last light: terrain painted from the sim's surface map, barriers
// built from the sim's wall polylines, and the county-fair clutter around them.

import * as THREE from 'three';
import { FINISH_LINE_S, GRID_LINE_S, SURFACE } from '../sim/config.js';
import { createRng } from '../sim/math.js';
import {
  assemble, broadleafTree, crushedCar, fencePost, ferrisWheel, floodlamp, lightTower, marshalTower, pineTree,
  spectatorBody, spectatorHat, spectatorHead, stackedTyre, strut, waterTower, wheelBulbs,
} from './props.js';

const SUN_DIR = new THREE.Vector3(-0.62, 0.3, 0.72).normalize();
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

export function buildStage(scene, track) {
  const rng = createRng(0xb0a1);

  scene.background = null;
  scene.fog = new THREE.FogExp2(0xd9925a, 0.0015);
  scene.add(buildSky());
  scene.add(buildDistantHills(rng));
  scene.add(buildTerrain(track));
  scene.add(buildBarriers(track));
  scene.add(buildCatchFence(track));
  scene.add(buildFencePosts(track));
  scene.add(buildGrandstands(track, rng));
  scene.add(buildInfield(track, rng));
  scene.add(buildJumpGantries(track));
  const towers = buildLightTowers(track);
  scene.add(towers);
  scene.add(buildScenery(track, rng));

  const hemi = new THREE.HemisphereLight(0xffd9b0, 0x8a5a3a, 1.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffb36b, 2.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -62; s.right = 62; s.top = 62; s.bottom = -62; s.near = 10; s.far = 460;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.4;
  scene.add(sun);
  scene.add(sun.target);

  return {
    sun,
    update(focus) {
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(SUN_DIR, 220);
      sun.target.updateMatrixWorld();
    },
  };
}

function buildSky() {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sunDir: { value: SUN_DIR } },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 horizon = vec3(1.0, 0.56, 0.27);
        vec3 mid = vec3(0.86, 0.32, 0.30);
        vec3 zenith = vec3(0.17, 0.2, 0.42);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        c = mix(c, zenith, smoothstep(0.16, 0.7, h));
        float d = max(dot(normalize(vDir), sunDir), 0.0);
        c += vec3(1.0, 0.72, 0.42) * pow(d, 12.0) * 0.55;
        c += vec3(1.0, 0.9, 0.7) * smoothstep(0.9994, 0.9998, d) * 3.0;
        float bands = sin(vDir.y * 34.0 + vDir.x * 5.0) * 0.5 + 0.5;
        c += vec3(0.5, 0.2, 0.12) * smoothstep(0.55, 0.95, bands) * smoothstep(0.02, 0.1, h) * (1.0 - smoothstep(0.1, 0.3, h)) * 0.25;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

function buildDistantHills(rng) {
  const group = new THREE.Group();
  const layers = [
    { r: 560, h: 46, color: 0x6e3a3a },
    { r: 430, h: 28, color: 0x4d2a2c },
  ];
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

function paintGround(track) {
  const b = track.bounds;
  const spanX = b.maxX - b.minX, spanZ = b.maxZ - b.minZ;
  const W = 2300, H = Math.round((W * spanZ) / spanX);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const rng = createRng(77);

  const clay = [158, 92, 54], clay2 = [132, 72, 44];
  const asphalt = [118, 98, 84], asphalt2 = [96, 84, 76];
  const mud = [58, 40, 28], mud2 = [44, 30, 22];
  const grass = [96, 92, 44], grass2 = [120, 104, 50];

  const fbm = (x, z) =>
    0.5 * Math.sin(x * 0.11 + 2 * Math.sin(z * 0.07)) +
    0.3 * Math.sin(z * 0.23 + 1.7 * Math.sin(x * 0.19)) +
    0.2 * Math.sin((x + z) * 0.53);

  for (let py = 0; py < H; py++) {
    const z = b.minZ + (py / (H - 1)) * spanZ;
    for (let px = 0; px < W; px++) {
      const x = b.minX + (px / (W - 1)) * spanX;
      const inside = track.sdfAt(x, z) > 0;
      const n = fbm(x, z) * 0.5 + 0.5 + (rng() - 0.5) * 0.3;
      let A, B;
      if (!inside) { A = grass; B = grass2; }
      else {
        // Jittered lookup, so clay spills across the tarmac instead of stopping on a line.
        const s = track.surfaceAt(x + (rng() - 0.5) * 7 + fbm(z, x) * 3, z + (rng() - 0.5) * 7);
        if (s === SURFACE.ASPHALT) { A = asphalt; B = asphalt2; }
        else if (s === SURFACE.MUD) { A = mud; B = mud2; }
        else { A = clay; B = clay2; }
      }
      const i = (py * W + px) * 4;
      img.data[i] = A[0] + (B[0] - A[0]) * n;
      img.data[i + 1] = A[1] + (B[1] - A[1]) * n;
      img.data[i + 2] = A[2] + (B[2] - A[2]) * n;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const toPx = (x, z) => [((x - b.minX) / spanX) * W, ((z - b.minZ) / spanZ) * H];
  const scale = W / spanX;

  // Grooves worn along the line everybody actually drives.
  const c = track.centre;
  const line = track.line;
  for (const [offset, alpha, width] of [[-2.2, 0.08, 2], [0, 0.2, 3.4], [2.4, 0.09, 2.2]]) {
    ctx.strokeStyle = `rgba(30,18,12,${alpha})`;
    ctx.lineWidth = width * scale;
    ctx.beginPath();
    for (let i = 0; i <= c.n; i++) {
      const k = i % c.n;
      const wob = Math.sin(i * 0.05) * 0.5;
      const [x, y] = toPx(line.px[k] - line.tz[k] * (offset + wob), line.pz[k] + line.tx[k] * (offset + wob));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Hazard stripes on every crossroads, clipped to the patch both roads share.
  for (const x of track.crossings) {
    const [ox, oy] = toPx(x.x, x.z);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.arc(0, 0, 10.5, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = '#e8b023';
    ctx.rotate(Math.PI / 4);
    for (let i = -6; i <= 6; i++) ctx.fillRect(i * 3.6 - 0.8, -12, 1.6, 24);
    ctx.restore();
  }

  // Chevrons up each kicker and a bar across the lip, so a jump reads from the air.
  for (const j of track.jumps) {
    const lip = track.indexAt(j.lipS);
    const hw = track.hw[lip];
    for (let d = 2; d < j.lipS - j.startS; d += 3.4) {
      const i = track.indexAt(j.lipS - d);
      const [px, py] = toPx(c.px[i], c.pz[i]);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(c.tz[i], c.tx[i]));
      ctx.scale(scale, scale);
      ctx.fillStyle = '#c8321f';
      ctx.globalAlpha = 0.8;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-2.4, side * hw);
        ctx.lineTo(-3.6, side * hw);
        ctx.lineTo(-1.2, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    const [lx, ly] = toPx(c.px[lip], c.pz[lip]);
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(Math.atan2(c.tz[lip], c.tx[lip]));
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ece3cd';
    ctx.fillRect(-0.7, -hw, 1.4, hw * 2);
    ctx.restore();
  }

  // Finish line across the back straight.
  const startLine = track.indexAt(FINISH_LINE_S);
  const [sx, sy] = toPx(c.px[startLine], c.pz[startLine]);
  const startWidth = track.hw[startLine];
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(Math.atan2(c.tz[startLine], c.tx[startLine]));
  ctx.scale(scale, scale);
  const tiles = Math.round((startWidth * 2) / 1.5);
  for (let i = 0; i < tiles; i++) {
    for (let j = 0; j < 3; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#ece3cd' : '#1a1b20';
      ctx.fillRect(j * 1.5 - 2.2, i * 1.5 - startWidth, 1.5, 1.5);
    }
  }
  ctx.restore();

  // Plain start line in front of the grid.
  const gridLine = track.indexAt(GRID_LINE_S);
  const [gx, gy] = toPx(c.px[gridLine], c.pz[gridLine]);
  ctx.save();
  ctx.translate(gx, gy);
  ctx.rotate(Math.atan2(c.tz[gridLine], c.tx[gridLine]));
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ece3cd';
  ctx.fillRect(1.6, -track.hw[gridLine], 1.1, track.hw[gridLine] * 2);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  return tex;
}

function buildTerrain(track) {
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
      uv[i * 2 + 1] = 1 - iz / (nz - 1);
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
  const mat = new THREE.MeshStandardMaterial({ map: paintGround(track), roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(mesh);
  const apron = new THREE.Mesh(
    new THREE.CircleGeometry(860, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x6c5a33, roughness: 1 }),
  );
  apron.position.y = -0.6;
  group.add(apron);
  return group;
}

// Sign-painted hoardings along the barrier. Every sponsor here is invented.
function paintHoardings() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const panels = [
    ['#c8321f', '#f3e2bd', "BIG DON'S TOWING"],
    ['#e8b023', '#1a1b20', 'HOT LARD DONUTS'],
    ['#1f6b6b', '#f3e2bd', 'TRI-COUNTY SCRAP'],
    ['#f3e2bd', '#c8321f', 'NO REFUNDS'],
    ['#2a2c35', '#e8b023', 'LOU\'S RADIATORS'],
    ['#c8321f', '#f3e2bd', 'DENTS WHILE U WAIT'],
    ['#1f6b6b', '#e8b023', 'FAIRVIEW CHIROPRACTIC'],
    ['#e8b023', '#c8321f', 'GRUDGE BOWL'],
  ];
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

function buildBarriers(track) {
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
  const mat = new THREE.MeshStandardMaterial({ map: paintHoardings(), roughness: 0.85, side: THREE.DoubleSide });
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

// One material that takes its colour from the shape, and an instance tint if it has one.
const painted = (roughness = 0.85) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness });

function solid(geometry, material = painted(), shadow = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  return mesh;
}

// The same shape, many times. `place` poses `dummy` and sets `tint` for each one.
function instanced(geometry, material, count, place) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color(1, 1, 1);
  for (let i = 0; i < count; i++) {
    place(dummy, tint, i);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, tint);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
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

const SHIRTS = [0xc8321f, 0xe8b023, 0x1f6b6b, 0xf3e2bd, 0x34404f, 0x8a5a33, 0x9aa8b6, 0xc77a36, 0x3f5e8c, 0xe9e4d8, 0x7a2d3a];
const SKIN = [0xf0c9a4, 0xd9a77e, 0xb57f55, 0x8a5a3a, 0x5e3c28, 0xe8bd96];
const HATS = [0xdcc48a, 0xc8321f, 0x2a2c35, 0x1f6b6b, 0xe9e4d8];

// A crowd of one span, in three instanced meshes so a stand off camera costs nothing.
function buildCrowd(seats, rng) {
  const group = new THREE.Group();
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const pose = (dummy, seat) => {
    dummy.position.set(seat.x, seat.y, seat.z);
    dummy.rotation.set(0, seat.yaw, 0);
    dummy.scale.setScalar(seat.size);
  };
  const shared = { seated: painted(0.9), head: painted(0.8) };
  for (const cheering of [false, true]) {
    const some = seats.filter((seat) => seat.cheering === cheering);
    if (some.length === 0) continue;
    group.add(instanced(spectatorBody(cheering), shared.seated, some.length, (dummy, tint, i) => {
      pose(dummy, some[i]);
      tint.setHex(pick(SHIRTS));
    }));
  }
  group.add(instanced(spectatorHead(), shared.head, seats.length, (dummy, tint, i) => {
    pose(dummy, seats[i]);
    tint.setHex(pick(SKIN));
  }));
  const hatted = seats.filter((seat) => seat.hat);
  group.add(instanced(spectatorHat(), shared.head, hatted.length, (dummy, tint, i) => {
    pose(dummy, hatted[i]);
    tint.setHex(pick(HATS));
  }));
  return group;
}

function buildGrandstands(track, rng) {
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

  STAND_SPANS.map((span) => span.map((v) => track.passes[v[0]].s + v[1])).forEach(([from, to]) => {
    const seats = [];
    for (let t = 0; t < tiers; t++) {
      const y = 2.3 + t * 0.95;
      const near = 5.5 + t * 1.5;
      const riser = t === 0 ? y : 0.97;
      let last = null;
      const wall = (p) => quad(positions, [p.x0, y, p.z0], [p.x1, y, p.z1], [p.x1, 0, p.z1], [p.x0, 0, p.z0]);
      for (let s = from; s <= to + 3; s += 3) {
        const i = track.indexAt(s);
        // Every corner here is a right-hander, so the outside is on the left.
        const nx = c.tz[i], nz = -c.tx[i];
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
            quad(positions, [last.x1, y + 1.4, last.z1], [here.x1, y + 1.4, here.z1], [here.x1, 0, here.z1], [last.x1, 0, last.z1]);
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
    group.add(buildCrowd(seats, rng));
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

function makeSign(text, width, height, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round((1024 * height) / width);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = canvas.height * 0.72;
  ctx.font = `${size}px 'Bowlby One', Impact, sans-serif`;
  while (ctx.measureText(text).width > canvas.width * 0.92) {
    size -= 4;
    ctx.font = `${size}px 'Bowlby One', Impact, sans-serif`;
  }
  ctx.fillText(text, canvas.width / 2, canvas.height * 0.54);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }),
  );
}

// Middle of a wall loop, and how far around it the loop reaches.
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
