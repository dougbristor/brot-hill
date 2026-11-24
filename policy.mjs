// Brot Hill little policy: a 7 -> 12 (tanh) -> 1 MLP that scores a frontier node. No dependencies;
// runs unchanged in a browser. Weights are stored as int8 with one symmetric scale per tensor.
export const FEATURES = ['level/n', '|w|/2', '|w-c|/4', 't_hat_x', 'log1p(seen at level+cell)', 'parent survivors/6', 'budget used'];
export const SHAPE = { inputs: 7, hidden: 12 };
export const PARAMS = SHAPE.inputs * SHAPE.hidden + SHAPE.hidden + SHAPE.hidden + 1;   // 109

// Float weights: flat array [W1 (hidden x inputs, row-major), b1, W2, b2].
export function unpack(theta) {
  const { inputs: I, hidden: H } = SHAPE; let o = 0;
  const W1 = theta.slice(o, o += I * H), b1 = theta.slice(o, o += H), W2 = theta.slice(o, o += H), b2 = theta[o];
  return { W1, b1, W2, b2 };
}

export function forward(theta, f) {
  const { inputs: I, hidden: H } = SHAPE, { W1, b1, W2, b2 } = unpack(theta);
  let out = b2;
  for (let h = 0; h < H; h++) { let s = b1[h]; for (let i = 0; i < I; i++) s += W1[h * I + i] * f[i]; out += W2[h] * Math.tanh(s); }
  return out;
}

// An entry is {format:'brot-hill-weights/1', int8:{q:[...], scales:[4]}} or {float:[...]} for training.
const TENSORS = () => { const { inputs: I, hidden: H } = SHAPE; return [I * H, H, H, 1]; };
export function quantize(theta) {
  const q = [], scales = []; let o = 0;
  for (const len of TENSORS()) {
    const part = theta.slice(o, o + len); o += len;
    const m = Math.max(...part.map(Math.abs)) || 1, s = m / 127; scales.push(s);
    for (const v of part) q.push(Math.max(-127, Math.min(127, Math.round(v / s))));
  }
  return { q, scales };
}
export function dequantize({ q, scales }) {
  const theta = []; let o = 0, t = 0;
  for (const len of TENSORS()) { for (let i = 0; i < len; i++) theta.push(q[o + i] * scales[t]); o += len; t++; }
  return theta;
}

export function thetaOf(entry) {
  if (entry.int8) {
    const { q, scales } = entry.int8;
    if (q.length !== PARAMS || scales.length !== 4 || !q.every(v => Number.isInteger(v) && v >= -127 && v <= 127) || !scales.every(s => Number.isFinite(s) && s > 0)) throw Error('Invalid int8 entry');
    return dequantize(entry.int8);
  }
  if (entry.float && entry.float.length === PARAMS && entry.float.every(Number.isFinite)) return entry.float;
  throw Error('Entry needs int8 {q, scales} or float weights of length ' + PARAMS);
}

const cache = new WeakMap();
export function scoreNode(entry, f) {
  let theta = cache.get(entry); if (!theta) { theta = thetaOf(entry); cache.set(entry, theta); }
  return forward(theta, f);
}
