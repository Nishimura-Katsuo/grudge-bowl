// A plain proportional driver used only to exercise the physics in tests and
// visual checks. It is not part of the game and never ships in the bundle.

import { OBS } from '../../src/sim/sensors.js';

const I = OBS.index;

// Follows the racing line. With no targetSpeed it holds a share of the pace notes.
export function testDriver(options = {}) {
  const { targetSpeed = 0, paceShare = 0.95 } = options;
  const action = new Float32Array(5);
  return {
    act(obs) {
      const speed = obs[I['ego.speedFwd']] * 40;
      const k = speed > 34 ? 4 : speed > 24 ? 3 : speed > 14 ? 2 : 1;
      const fwd = obs[I[`look${k}.fwd`]];
      const right = obs[I[`look${k}.right`]];
      // Pure pursuit: the wheel angle that arcs through the look point.
      const bearing = Math.atan2(right, Math.max(fwd, 0.01));
      const dist = Math.max(4, Math.hypot(fwd, right) * 70);
      const wheel = Math.atan((2 * 2.85 * Math.sin(bearing)) / dist) / 0.6;
      const slip = obs[I['ego.slipAngle']];
      action[0] = wheel * 1.25 + slip * 0.9;
      const pace = obs[I['ego.pace']] * 40 * paceShare;
      const want = targetSpeed ? Math.min(targetSpeed, pace) : pace;
      const err = want - speed;
      const grip = 1 - Math.min(1, Math.max(0, Math.abs(slip) - 0.08) * 6) ;
      const spin = 1 - Math.min(1, Math.max(0, obs[I['ego.rearSlip']] - 0.12) * 5);
      action[1] = Math.max(0, Math.min(1, err * 0.5)) * grip * spin;
      action[2] = Math.max(0, Math.min(1, -err * 0.35));
      action[3] = 0;
      action[4] = 0;
      return action;
    },
  };
}
