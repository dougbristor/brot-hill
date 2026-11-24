// Train a shared-fruit policy by evolution strategies against a fixed pool, Core War style: no labels, only
// "what share of the contested cells did it own". Warm start: caro-little-v1 widened with a zero rival column.
// Seeds: strain/<gen>/<j> for fitness, sval/<i> for checkpoint choice. Check (scheck/) and hidden seeds are never touched.
// Usage: node train_shared.mjs [out.json] [gens]
import { readFileSync, writeFileSync } from 'node:fs';
import { ready, makeRound, mirror, SHARED_BASELINES as B, SHARED_VERSION, RULES } from './shared.mjs';
import { PARAMS2, SHAPE2, FEATURES2, quantize2, dequantize2, widenV1 } from './shared_policy.mjs';
import { dequantize } from './policy.mjs';
import { mulberry32 } from './hill.mjs';

const out = process.argv[2] || 'weights/caro_shared_v1.json', GENS = +(process.argv[3] || 60);
const POP = 16, ROUNDS = 4, SIGMA = 0.06, LR = 0.04, VAL = 12;
await ready();
const v1 = JSON.parse(readFileSync('weights/caro_little_v1.json'));
const POOL = [['deepest', B.deepest], ['novelty', B.novelty], ['dodge', B.dodge], ['caro-little-v1', v1]];
const rnd = mulberry32(20261125);
const gauss = () => { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// Share of owned cells, both seat orders, averaged over (round, opponent) pairs.
function fitness(theta, games) {
  const me = { float: theta }; let s = 0;
  for (const [round, opp, salt] of games) for (const g of mirror(round, me, opp, { salt })) s += g.owned[0] / Math.max(1, g.owned[0] + g.owned[1]);
  return s / (2 * games.length);
}
const valGames = [];
for (let i = 0; i < VAL; i++) for (const [, opp] of POOL) valGames.push([makeRound('sval/' + i), opp, 1000 + i * 2]);

let theta = widenV1(dequantize(v1.int8));
const start = fitness(theta, valGames);
let best = { val: start, theta: theta.slice(), gen: -1 }, log = [{ gen: -1, val: +start.toFixed(4) }];
console.log(`warm start (v1, rival-blind) val share ${start.toFixed(4)}`);
const m = new Array(PARAMS2).fill(0), v = new Array(PARAMS2).fill(0);
const t0 = performance.now();
for (let g = 0; g < GENS; g++) {
  const games = Array.from({ length: ROUNDS }, (_, j) => [makeRound(`strain/${g}/${j}`), POOL[(g + j) % POOL.length][1], g * 16 + j * 2]);
  const eps = Array.from({ length: POP }, () => Array.from({ length: PARAMS2 }, gauss));
  const scores = [];
  for (const e of eps) for (const sign of [1, -1]) scores.push({ e, sign, f: fitness(theta.map((t, i) => t + sign * SIGMA * e[i]), games) });
  const ranked = scores.map((s, i) => [s.f, i]).sort((a, b) => a[0] - b[0]);
  const util = new Array(scores.length); ranked.forEach(([, i], r) => { util[i] = r / (scores.length - 1) - 0.5; });
  const grad = new Array(PARAMS2).fill(0);
  scores.forEach((s, i) => { for (let k = 0; k < PARAMS2; k++) grad[k] += util[i] * s.sign * s.e[k]; });
  for (let k = 0; k < PARAMS2; k++) { const gk = grad[k] / (scores.length * SIGMA); m[k] = 0.9 * m[k] + 0.1 * gk; v[k] = 0.999 * v[k] + 0.001 * gk * gk; theta[k] += LR * (m[k] / (1 - 0.9 ** (g + 1))) / (Math.sqrt(v[k] / (1 - 0.999 ** (g + 1))) + 1e-8); }
  if (g % 5 === 4 || g === GENS - 1) {
    const val = fitness(theta, valGames); log.push({ gen: g, train_mean: +(scores.reduce((s, x) => s + x.f, 0) / scores.length).toFixed(4), val: +val.toFixed(4) });
    if (val > best.val) best = { val, theta: theta.slice(), gen: g };
    console.log(`gen ${g} train ${log.at(-1).train_mean} val ${val.toFixed(4)} best ${best.val.toFixed(4)}@${best.gen} ${((performance.now() - t0) / 1000).toFixed(0)}s`);
  }
}
const int8 = quantize2(best.theta), qVal = fitness(dequantize2(int8), valGames);
writeFileSync(out, JSON.stringify({ format: 'brot-hill-shared-weights/1', name: 'caro-shared-v1', author: 'caro', rules: SHARED_VERSION, base_rules: RULES.version,
  shape: SHAPE2, features: FEATURES2, int8,
  training: { method: 'antithetic ES, rank utilities, Adam; warm start from caro-little-v1 with a zero rival column', pool: POOL.map(p => p[0]),
    fitness: 'owned share, both seat orders', gens: GENS, pop: POP * 2, rounds_per_gen: ROUNDS, sigma: SIGMA, lr: LR, seed: 20261125,
    chosen_gen: best.gen, val_share_float: +best.val.toFixed(4), val_share_int8: +qVal.toFixed(4), warm_start_val_share: +start.toFixed(4), val_rounds: VAL, log,
    seconds: +((performance.now() - t0) / 1000).toFixed(1), seeds: 'strain/<gen>/<j>, sval/<i>; scheck and hidden seeds unseen' } }, null, 1));
console.log('wrote', out, 'chosen gen', best.gen, 'val float', best.val.toFixed(4), 'int8', qVal.toFixed(4));
