// Paints what's under the cars: the ground map and, where the ground glows, a second map
// of what shines. This is the slowest thing a course needs, so it's kept free of the
// renderer, and the background worker can do it for the whole game before it's wanted.

import { SURFACE } from '../sim/config.js';
import { createRng } from '../sim/math.js';

const volcanoCracks = (x, z) => {
  const a = Math.sin(x * 0.041 + 1.6 * Math.sin(z * 0.033)) + Math.sin(z * 0.052 + 1.3 * Math.sin(x * 0.027 + 1));
  const b = Math.sin((x - z) * 0.09 + Math.sin(x * 0.07) * 1.4);
  return Math.max(0, 1 - Math.abs(a) * 15) * (0.5 + 0.5 * Math.max(0, b));
};

export const GROUNDS = {
  knot: {
    clay: [[158, 92, 54], [132, 72, 44]],
    asphalt: [[118, 98, 84], [96, 84, 76]],
    mud: [[58, 40, 28], [44, 30, 22]],
    verge: [[96, 92, 44], [120, 104, 50]],
  },
  park: {
    clay: [[134, 118, 150], [114, 100, 132]],
    asphalt: [[116, 110, 138], [98, 92, 122]],
    mud: [[40, 34, 56], [32, 28, 46]],
    verge: [[64, 96, 74], [52, 82, 64]],
  },
  volcano: {
    clay: [[124, 110, 104], [104, 92, 90]],
    asphalt: [[116, 104, 100], [96, 86, 84]],
    mud: [[62, 50, 48], [50, 40, 40]],
    verge: [[84, 66, 60], [62, 50, 48]],
    glow: volcanoCracks,
  },
  seabed: {
    clay: [[96, 104, 104], [82, 90, 92]],
    asphalt: [[84, 94, 100], [70, 80, 88]],
    mud: [[66, 62, 52], [54, 50, 44]],
    verge: [[226, 200, 136], [196, 170, 110]],
  },
  moon: {
    clay: [[132, 132, 136], [112, 112, 116]],
    asphalt: [[96, 98, 104], [78, 80, 86]],
    mud: [[70, 70, 74], [60, 60, 64]],
    verge: [[150, 150, 154], [120, 120, 124]],
  },
};

export function groundSize(track) {
  const b = track.bounds;
  return { width: GROUND_WIDTH, height: Math.round((GROUND_WIDTH * (b.maxZ - b.minZ)) / (b.maxX - b.minX)) };
}

export function glowSize(track) {
  const b = track.bounds;
  return { width: GLOW_WIDTH, height: Math.round((GLOW_WIDTH * (b.maxZ - b.minZ)) / (b.maxX - b.minX)) };
}

const GROUND_WIDTH = 2300;
const GLOW_WIDTH = 1024;

export function paintGround(track, canvas) {
  const b = track.bounds;
  const palette = GROUNDS[track.course.id];
  const spanX = b.maxX - b.minX, spanZ = b.maxZ - b.minZ;
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const rng = createRng(77);

  const [clay, clay2] = palette.clay;
  const [asphalt, asphalt2] = palette.asphalt;
  const [mud, mud2] = palette.mud;
  const [grass, grass2] = palette.verge;

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
  const startLine = track.indexAt(track.finishS);
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
  const gridLine = track.indexAt(track.gridS);
  const [gx, gy] = toPx(c.px[gridLine], c.pz[gridLine]);
  ctx.save();
  ctx.translate(gx, gy);
  ctx.rotate(Math.atan2(c.tz[gridLine], c.tx[gridLine]));
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ece3cd';
  ctx.fillRect(1.6, -track.hw[gridLine], 1.1, track.hw[gridLine] * 2);
  ctx.restore();
}

// Lava and the like: a second map that shines by itself.
export function paintGlow(track, canvas) {
  const glow = GROUNDS[track.course.id].glow;
  const b = track.bounds;
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let py = 0; py < H; py++) {
    const z = b.minZ + (py / (H - 1)) * (b.maxZ - b.minZ);
    for (let px = 0; px < W; px++) {
      const x = b.minX + (px / (W - 1)) * (b.maxX - b.minX);
      const v = track.sdfAt(x, z) > -2 ? 0 : glow(x, z) * 255;
      const i = (py * W + px) * 4;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
