// Construction-time compiler. No environment feedback or parameter fitting.
export const ACTIVATIONS = ['linear', 'relu', 'step', 'square', 'atan', 'reciprocal', 'sqrt'];
export class Circuit {
  constructor(inputs) { this.inputs = inputs; this.nodes = []; this.names = new Map(inputs.map((n, i) => [n, i])); }
  unit(name, terms = [], bias = 0, activation = 'linear') {
    const id = this.inputs.length + this.nodes.length;
    const depth = 1 + Math.max(0, ...terms.map(([i]) => this.nodes[i - this.inputs.length]?.depth ?? 0));
    this.nodes.push({ name, terms, bias, activation, depth }); this.names.set(name, id); return id;
  }
  affine(n, terms, b = 0) { return this.unit(n, terms, b); }
  relu(n, terms, b = 0) { return this.unit(n, terms, b, 'relu'); }
  step(n, terms, b = 0) { return this.unit(n, terms, b, 'step'); }
  abs(n, x) { return this.affine(n, [[this.relu(n + '+', [[x, 1]]), 1], [this.relu(n + '-', [[x, -1]]), 1]]); }
  clip(n, terms, b = 0, lo = 0, hi = 1) {
    return this.affine(n, [[this.relu(n + '.lo', terms, b - lo), 1], [this.relu(n + '.hi', terms, b - hi), -1]], lo);
  }
  mul(n, x, y) {
    const p = this.unit(n + '.sum2', [[x, 1], [y, 1]], 0, 'square');
    const m = this.unit(n + '.diff2', [[x, 1], [y, -1]], 0, 'square');
    return this.affine(n, [[p, .25], [m, -.25]]);
  }
  gate(n, x, g, M) {
    const p = this.relu(n + '.p', [[x, 1], [g, M]], -M);
    const m = this.relu(n + '.m', [[x, -1], [g, M]], -M);
    return this.affine(n, [[p, 1], [m, -1]]);
  }
  mux(n, g, x, y, M) {
    const ng = this.affine(n + '.not', [[g, -1]], 1);
    return this.affine(n, [[this.gate(n + '.yes', x, g, M), 1], [this.gate(n + '.no', y, ng, M), 1]]);
  }
  and(n, bits) { return this.step(n, bits.map(x => [x, 1]), .5 - bits.length); }
  max(n, a, b) { return this.affine(n, [[b, 1], [this.relu(n + '.delta', [[a, 1], [b, -1]]), 1]]); }
  wta(n, scores) {
    // Lower slot wins exact ties. Each pair contributes complementary bits.
    const wins = scores.map(() => []);
    for (let i = 0; i < scores.length; i++) for (let j = i + 1; j < scores.length; j++) {
      const bit = this.step(`${n}.${i}>=${j}`, [[scores[i], 1], [scores[j], -1]]);
      wins[i].push(bit); wins[j].push(this.affine(`${n}.${j}>${i}`, [[bit, -1]], 1));
    }
    return wins.map((bits, i) => this.and(`${n}.${i}`, bits));
  }
  bearing(n, x, y) {
    // atan(y/max(|x|,.04)), then quadrant correction, all inside the graph.
    const ax = this.abs(n + '.absX', x);
    const den = this.affine(n + '.den', [[this.relu(n + '.floor', [[ax, 1]], -.04), 1]], .04);
    const inv = this.unit(n + '.inv', [[den, 1]], 0, 'reciprocal');
    const ratio = this.mul(n + '.ratio', y, inv);
    const a = this.unit(n + '.atan', [[ratio, 1]], 0, 'atan');
    const back = this.step(n + '.back', [[x, -1]], -1e-12);
    const sign = this.affine(n + '.sign', [[this.step(n + '.right', [[y, 1]]), 2]], -1);
    const correction = this.affine(n + '.correction', [[sign, Math.PI], [a, -2]]);
    return this.affine(n, [[a, 1], [this.gate(n + '.quadrant', correction, back, 2 * Math.PI), 1]]);
  }
  compile(meta = {}) {
    const order = this.nodes.map((n, i) => i).sort((a, b) => this.nodes[a].depth - this.nodes[b].depth || a - b);
    const remap = Array.from({ length: this.inputs.length + this.nodes.length }, (_, i) => i);
    order.forEach((old, i) => { remap[old + this.inputs.length] = i + this.inputs.length; });
    const columns = [], weights = [], offsets = [0], biases = [], activations = [], names = [...this.inputs], layers = [];
    let depth = 0;
    for (const old of order) {
      const n = this.nodes[old];
      if (n.depth !== depth) { layers.push(names.length); depth = n.depth; }
      for (const [i, w] of n.terms) { if (w !== 0) { columns.push(remap[i]); weights.push(w); } }
      offsets.push(weights.length); biases.push(n.bias); activations.push(ACTIVATIONS.indexOf(n.activation)); names.push(n.name);
    }
    layers.push(names.length);
    return { version: 1, inputCount: this.inputs.length, names, layers, columns, weights, offsets, biases, activations,
      ...Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, Array.isArray(v) ? v.map(i => remap[i]) : v])) };
  }
}
