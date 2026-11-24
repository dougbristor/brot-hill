// Train the little policy by evolution strategies (antithetic, rank-shaped), Core War style:
// no labels, only "did it win more cells than deepest-first on this round".
// Seeds: train/<gen>/<j> for fitness, val/<i> for checkpoint choice. Hill seeds are never touched.
// Usage: node train.mjs [out.json] [gens] ; one core, about a minute.
import { writeFileSync } from 'node:fs';
import { ready, makeRound, runRound, BASELINES, RULES } from './hill.mjs';
import { PARAMS, quantize, dequantize, FEATURES, SHAPE } from './policy.mjs';
import { mulberry32 } from './hill.mjs';

const out = process.argv[2] || 'weights/caro_little_v1.json', GENS = +(process.argv[3] || 60);
const POP = 16, ROUNDS = 6, SIGMA = 0.08, LR = 0.05, VAL = 24;
await ready();
const rnd = mulberry32(20261124);
const gauss = () => { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

const baseCache = new Map();
const deepest = (round) => { if (!baseCache.has(round.seed)) baseCache.set(round.seed, runRound(round, BASELINES.deepest).floatCells); return baseCache.get(round.seed); };
const fitness = (theta, rounds) => rounds.reduce((s, r) => s + runRound(r, { float: theta }).floatCells / Math.max(1, deepest(r)), 0) / rounds.length;

const valRounds = Array.from({ length: VAL }, (_, i) => makeRound('val/' + i));
let theta = Array.from({ length: PARAMS }, () => 0.3 * gauss());
let best = { val: -1, theta: theta.slice(), gen: -1 }, log = [];
const m = new Array(PARAMS).fill(0), v = new Array(PARAMS).fill(0);
const t0 = performance.now();
for (let g = 0; g < GENS; g++) {
  const rounds = Array.from({ length: ROUNDS }, (_, j) => makeRound(`train/${g}/${j}`));
  const eps = Array.from({ length: POP }, () => Array.from({ length: PARAMS }, gauss));
  const scores = [];
  for (const e of eps) for (const sign of [1, -1]) scores.push({ e, sign, f: fitness(theta.map((t, i) => t + sign * SIGMA * e[i]), rounds) });
  const ranked = scores.map((s, i) => [s.f, i]).sort((a, b) => a[0] - b[0]);
  const util = new Array(scores.length); ranked.forEach(([, i], r) => { util[i] = r / (scores.length - 1) - 0.5; });
  const grad = new Array(PARAMS).fill(0);
  scores.forEach((s, i) => { for (let k = 0; k < PARAMS; k++) grad[k] += util[i] * s.sign * s.e[k]; });
  for (let k = 0; k < PARAMS; k++) { const gk = grad[k] / (scores.length * SIGMA); m[k] = 0.9 * m[k] + 0.1 * gk; v[k] = 0.999 * v[k] + 0.001 * gk * gk; theta[k] += LR * (m[k] / (1 - 0.9 ** (g + 1))) / (Math.sqrt(v[k] / (1 - 0.999 ** (g + 1))) + 1e-8); }
  if (g % 5 === 4 || g === GENS - 1) {
    const val = fitness(theta, valRounds); log.push({ gen: g, train_mean: +(scores.reduce((s, x) => s + x.f, 0) / scores.length).toFixed(4), val: +val.toFixed(4) });
    if (val > best.val) best = { val, theta: theta.slice(), gen: g };
    console.log(`gen ${g} train ${log.at(-1).train_mean} val ${val.toFixed(4)} best ${best.val.toFixed(4)}@${best.gen} ${((performance.now() - t0) / 1000).toFixed(0)}s`);
  }
}
const int8 = quantize(best.theta), qVal = fitness(dequantize(int8), valRounds);
writeFileSync(out, JSON.stringify({ format: 'brot-hill-weights/1', name: 'caro-little-v1', author: 'caro', rules: RULES.version,
  shape: SHAPE, features: FEATURES, int8,
  training: { method: 'antithetic ES, rank utilities, Adam', gens: GENS, pop: POP * 2, rounds_per_gen: ROUNDS, sigma: SIGMA, lr: LR, seed: 20261124,
    chosen_gen: best.gen, val_ratio_vs_deepest_float: +best.val.toFixed(4), val_ratio_vs_deepest_int8: +qVal.toFixed(4), val_rounds: VAL, log,
    seconds: +((performance.now() - t0) / 1000).toFixed(1), seeds: 'train/<gen>/<j>, val/<i>; hill seeds unseen' } }, null, 1));
console.log('wrote', out, 'chosen gen', best.gen, 'val float', best.val.toFixed(4), 'int8', qVal.toFixed(4));
