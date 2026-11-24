// Shared-fruit policy: the v1 little policy plus one input, 'log1p(rival expansions at level+cell)'.
// 8 -> 12 (tanh) -> 1, 121 int8 weights, one symmetric scale per tensor. No dependencies beyond policy.mjs.
// v1 entries (brot-hill-weights/1) still play the shared fruit: they see the first 7 features and are blind to rivals.
import { FEATURES, scoreNode as scoreV1 } from './policy.mjs';

export const FEATURES2 = [...FEATURES, 'log1p(rival expansions at level+cell)'];
export const SHAPE2 = { inputs: 8, hidden: 12 };
export const PARAMS2 = SHAPE2.inputs * SHAPE2.hidden + SHAPE2.hidden + SHAPE2.hidden + 1;   // 121
const TENSORS = [SHAPE2.inputs * SHAPE2.hidden, SHAPE2.hidden, SHAPE2.hidden, 1];

export function forward2(theta, f) {
  const { inputs: I, hidden: H } = SHAPE2, b1 = I * H, w2 = b1 + H, b2 = w2 + H;
  let out = theta[b2];
  for (let h = 0; h < H; h++) { let s = theta[b1 + h]; for (let i = 0; i < I; i++) s += theta[h * I + i] * f[i]; out += theta[w2 + h] * Math.tanh(s); }
  return out;
}

export function quantize2(theta) {
  const q = [], scales = []; let o = 0;
  for (const len of TENSORS) {
    const part = theta.slice(o, o + len); o += len;
    const s = (Math.max(...part.map(Math.abs)) || 1) / 127; scales.push(s);
    for (const v of part) q.push(Math.max(-127, Math.min(127, Math.round(v / s))));
  }
  return { q, scales };
}
export function dequantize2({ q, scales }) {
  const theta = []; let o = 0;
  TENSORS.forEach((len, t) => { for (let i = 0; i < len; i++) theta.push(q[o + i] * scales[t]); o += len; });
  return theta;
}

// Widen v1 float weights (7 inputs) to 8 inputs with a zero rival column: the same play, a warm start.
export function widenV1(theta1) {
  const I1 = 7, { inputs: I, hidden: H } = SHAPE2, out = [];
  for (let h = 0; h < H; h++) { for (let i = 0; i < I1; i++) out.push(theta1[h * I1 + i]); out.push(0); }
  return out.concat(theta1.slice(I1 * H));
}

// Returns f -> score for an entry object. Shared entries: {format:'brot-hill-shared-weights/1', int8} or {float}.
export function scorerOf(entry) {
  if (entry.format === 'brot-hill-weights/1' || (entry.int8 && entry.int8.q.length === 109)) {
    const v1 = { int8: entry.int8 };
    return f => scoreV1(v1, f.slice(0, 7));
  }
  let theta;
  if (entry.int8) {
    const { q, scales } = entry.int8;
    if (q.length !== PARAMS2 || scales.length !== 4 || !q.every(v => Number.isInteger(v) && v >= -127 && v <= 127) || !scales.every(s => Number.isFinite(s) && s > 0)) throw Error('Invalid shared int8 entry');
    theta = dequantize2(entry.int8);
  } else if (entry.float && entry.float.length === PARAMS2 && entry.float.every(Number.isFinite)) theta = entry.float;
  else throw Error('Shared entry needs int8 {q, scales} of ' + PARAMS2 + ' or float weights');
  return f => forward2(theta, f);
}
