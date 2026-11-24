// Brot Hill arena harness v1 (Caro, 2026-11-24).
// The arena runs the entrant: an entry is a weights file (data), never code. The harness performs a
// budgeted best-first backward search from A under F_c(w) = B(w) + c, with B the Bristorian B2 square
// (x²−y²−z², y(2x−z), z(2x+y)) in slot order (zx, zy, zz) = (real, j, i). The entrant only scores
// frontier nodes. Leaves are level-n points; the score is the number of distinct ε-cells they occupy,
// counted by the independent exact referee (referee.py). Float cell counts here are for training only.
import { loadTable, sqrtAll } from './lib/bristor_sqrt_all/v1.js';
import { scoreNode, FEATURES } from './policy.mjs';

export const RULES = Object.freeze({ version: 'brot-hill/1', n: 9, epsDen: 16, budget: 300, ballMargin: 1e-9,
  cRadius: 0.75, cDen: 256, aRadius: 1.0 });

// Deterministic round generator: FNV-1a over the seed string, then mulberry32. referee.py reimplements it.
function fnv1a(s) { let h = 0x811c9dc5; for (const ch of new TextEncoder().encode(s)) { h ^= ch; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
export function mulberry32(a) { return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function makeRound(seed, rules = RULES) {
  const rnd = mulberry32(fnv1a(seed));
  const pick = (radius, den) => { for (;;) { const v = [0, 1, 2].map(() => Math.round((rnd() * 2 - 1) * radius * den)); if (Math.hypot(...v) <= radius * den) return v; } };
  const ci = pick(rules.cRadius, rules.cDen);                       // c = ci / cDen (dyadic)
  const ai = pick(rules.aRadius, rules.epsDen);                     // A = (ai + 1/2) / epsDen: an ε-cell centre
  return { seed, version: rules.version, n: rules.n, epsDen: rules.epsDen, budget: rules.budget,
    cNum: ci, cDen: rules.cDen, aNum: ai.map(v => 2 * v + 1), aDen: 2 * rules.epsDen,
    c: ci.map(v => v / rules.cDen), A: ai.map(v => (v + 0.5) / rules.epsDen) };
}

const cellOf = (w, epsDen) => w.map(v => Math.floor(v * epsDen));

class Heap { // max-heap on [score, -id]
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  less(i, j) { const x = this.a[i], y = this.a[j]; return x.s < y.s || (x.s === y.s && x.id > y.id); }
  push(v) { const a = this.a; a.push(v); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!this.less(p, i)) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  peek() { return this.a[0]; }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && this.less(m, l)) m = l; if (r < a.length && this.less(m, r)) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
}

// Baseline and learned scorers share one signature: (features, node, ctx) -> number.
export const BASELINES = {
  breadth: (f, node) => -node.id,
  deepest: (f, node) => node.k * 1e6 - node.id,
  random: (f, node, ctx) => mulberry32((node.id * 2654435761 + ctx.salt) >>> 0)(),
  novelty: (f, node) => node.k - 3 * f[4],   // hand heuristic: go deep, avoid cells already expanded at that level
};

export function featuresOf(node, ctx) {
  const { round, seen, used } = ctx, w = node.w, c = round.c;
  const t = [w[0] - c[0], w[1] - c[1], w[2] - c[2]], tn = Math.hypot(...t) || 1e-300;
  return [node.k / round.n, Math.hypot(...w) / 2, Math.min(tn / 4, 1), t[0] / tn,
    Math.log1p(seen.get(node.k + ':' + node.cell) || 0), node.parentSurv / 6, used / round.budget];
}

export async function ready() { await loadTable(); }

// Run one round. scorer: a BASELINES function or {weights} for the learned policy.
export function runRound(round, scorer, { salt = 0 } = {}) {
  const score = typeof scorer === 'function' ? scorer : (f) => scoreNode(scorer, f);
  const ctx = { round, seen: new Map(), used: 0, salt };
  const heap = new Heap(), leaves = [];
  let nextId = 0;
  const push = (w, k, parentSurv) => {
    const node = { w, k, id: nextId++, parentSurv, cell: cellOf(w, round.epsDen).join(',') };
    node.s = score(featuresOf(node, ctx), node, ctx);
    heap.push(node);
  };
  push(round.A, 0, 1);
  let rescores = 0;
  while (ctx.used < round.budget && heap.size) {
    const node = heap.pop();
    const fresh = score(featuresOf(node, ctx), node, ctx);     // features can change after other expansions
    if (heap.size && fresh < heap.peek().s && rescores < 4 * round.budget) { node.s = fresh; heap.push(node); rescores++; continue; }
    ctx.used++;
    const key = node.k + ':' + node.cell; ctx.seen.set(key, (ctx.seen.get(key) || 0) + 1);
    const w = node.w, r = sqrtAll(w[0] - round.c[0], w[1] - round.c[1], w[2] - round.c[2]);
    const kids = r.roots.filter(p => Math.hypot(...p) <= 2 - RULES.ballMargin);
    for (const p of kids) {
      if (node.k + 1 === round.n) leaves.push(p);
      else push(p, node.k + 1, kids.length);
    }
  }
  const cells = new Set(leaves.map(p => cellOf(p, round.epsDen).join(',')));
  return { leaves, floatCells: cells.size, used: ctx.used, rescores };
}

export { FEATURES };
