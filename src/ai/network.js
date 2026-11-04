// Generic sparse affine layers with skip connections. No game semantics here.
export function compileNetwork(spec) {
  return { ...spec, columns: Uint32Array.from(spec.columns), offsets: Uint32Array.from(spec.offsets),
    weights: Float64Array.from(spec.weights), biases: Float64Array.from(spec.biases), activations: Uint8Array.from(spec.activations) };
}
export function createRuntime(net) {
  const values = new Float64Array(net.names.length);
  const state = new Float64Array(net.stateOutputs?.length ?? 0);
  const observationCount = net.inputCount - state.length;
  return {
    values, state,
    forward(obs) {
      values.set(obs, 0); values.set(state, observationCount);
      for (let l = 0; l < net.layers.length - 1; l++) {
        for (let id = net.layers[l]; id < net.layers[l + 1]; id++) {
          const row = id - net.inputCount;
          let z = net.biases[row];
          for (let e = net.offsets[row]; e < net.offsets[row + 1]; e++) z += net.weights[e] * values[net.columns[e]];
          switch (net.activations[row]) {
            case 1: z = Math.max(0, z); break;
            case 2: z = z >= 0 ? 1 : 0; break;
            case 3: z *= z; break;
            case 4: z = Math.atan(z); break;
            case 5: z = 1 / z; break;
          }
          values[id] = z;
        }
      }
      for (let i = 0; i < state.length; i++) state[i] = values[net.stateOutputs[i]];
      return values;
    },
  };
}
