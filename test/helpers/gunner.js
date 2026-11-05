// A plain firing rule wrapped round any brain, so the weapons can be exercised
// before and without the network. It is not part of the game.

import { OBS } from '../../src/sim/sensors.js';

const I = OBS.index;
const is = (obs, key) => obs[I[`arms.${key}`]] > 0.5;

export function shouldFire(obs) {
  if (obs[I['arms.ready']] < 0.5) return false;
  const ahead = obs[I['arms.aheadRange']];
  const behind = obs[I['arms.behindRange']];
  const close = obs[I['arms.closeRivals']];
  if (is(obs, 'barnBurner')) return ahead < 0.45;
  if (is(obs, 'repoHook')) return ahead < 0.6 && ahead > 0.08;
  if (is(obs, 'grudgeSeeker') || is(obs, 'prizeBull') || is(obs, 'grandPiano')) return true;
  if (is(obs, 'threshingWhirl')) return close > 0.2;
  if (is(obs, 'foghorn')) return close > 0.2 || obs[I['arms.incoming']] > 0.5;
  return behind < 0.75; // everything dropped behind the car
}

export function gunner(brain) {
  const out = new Float32Array(6);
  return {
    ...brain,
    telemetry: brain.telemetry,
    act(obs) {
      const a = brain.act(obs);
      for (let i = 0; i < 5; i++) out[i] = a[i];
      out[5] = shouldFire(obs) ? 1 : 0;
      return out;
    },
  };
}
