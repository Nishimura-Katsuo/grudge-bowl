import spec from './weights.js';
import { compileNetwork, createRuntime } from './network.js';
import { slotToCarId } from '../sim/sensors.js';

const net = compileNetwork(spec);
const modeNames = ['hunt', 'race', 'drift', 'unstick'];
export function createBrain(car) {
  const runtime = createRuntime(net);
  const action = new Float32Array(6);
  const ids = Int8Array.from({ length: 11 }, (_, k) => slotToCarId(car.id, k));
  const telemetry = { firing: 0, rage: 0, targetId: -1, mode: 'race', grudge: new Float32Array(12), crossingIntent: 0 };
  return {
    telemetry,
    act(obs) {
      const v = runtime.forward(obs);
      for (let j = 0; j < 6; j++) action[j] = Math.max(j === 0 ? -1 : 0, Math.min(1, v[net.actions[j]]));
      telemetry.firing = v[net.actions[5]];
      telemetry.rage = v[net.rageOutput[0]];
      telemetry.crossingIntent = v[net.crossingOutput[0]];
      telemetry.targetId = -1;
      for (let k = 0; k < 11; k++) {
        telemetry.grudge[ids[k]] = v[net.grudgeOutputs[k]];
        if (v[net.targets[k]] > .5) telemetry.targetId = ids[k];
      }
      let best = 0;
      for (let k = 1; k < 4; k++) if (v[net.modes[k]] > v[net.modes[best]]) best = k;
      telemetry.mode = modeNames[best];
      return action;
    },
  };
}
