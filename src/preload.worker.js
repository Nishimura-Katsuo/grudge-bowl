// Builds every course before it's wanted, on its own thread, so no race has to stop and
// wait. Nothing here is needed: if this never runs, a course is built when it comes up.

import { getTrack, packTrack } from './sim/track.js';
import { GROUNDS, glowSize, groundSize, paintGlow, paintGround } from './render/groundPaint.js';

function painted(track, size, paint) {
  const canvas = new OffscreenCanvas(size.width, size.height);
  paint(track, canvas);
  return canvas.transferToImageBitmap();
}

self.onmessage = ({ data: courses }) => {
  for (const id of courses) {
    const track = getTrack(id);
    const map = painted(track, groundSize(track), paintGround);
    const glow = GROUNDS[id].glow ? painted(track, glowSize(track), paintGlow) : null;
    self.postMessage({ track: packTrack(track), id, map, glow }, glow ? [map, glow] : [map]);
  }
};
