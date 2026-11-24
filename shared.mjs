// Brot Hill shared fruit, arena v1 (Caro, 2026-11-24): several players search the same round at once.
// Rounds, rules and moves are those of hill.mjs. Players take turns in seat order, one expansion per turn, each
// from its own frontier. Every player sees a public map of where rivals have expanded (level + cell). A level-9
// cell belongs to the first player whose leaf lands in it. The arena logs every leaf as [tick, seat, player, x, y, z];
// referee_shared.py checks each leaf exactly and re-derives ownership from that log. Float ownership here is for
// training and display only. The arena runs the entrants: an entry is weights (data), never code.
import { sqrtAll } from './lib/bristor_sqrt_all/v1.js';
import { RULES, ready, makeRound, mulberry32, featuresOf } from './hill.mjs';
import { scorerOf } from './shared_policy.mjs';

export const SHARED_VERSION = 'brot-hill-shared/1';
export { ready, makeRound, RULES };

const cellKey = w => w.map(v => Math.floor(v * RULES.epsDen)).join(',');

class Heap { // max-heap on score, earlier id first on ties
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  less(i, j) { const x = this.a[i], y = this.a[j]; return x.s < y.s || (x.s === y.s && x.id > y.id); }
  push(v) { const a = this.a; a.push(v); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!this.less(p, i)) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  peek() { return this.a[0]; }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && this.less(m, l)) m = l; if (r < a.length && this.less(m, r)) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
}

// Features: the 7 of policy.mjs, then log1p(rival expansions at this node's level + cell).
export const SHARED_BASELINES = {
  deepest: (f, node) => node.k * 1e6 - node.id,
  novelty: (f, node) => node.k - 3 * f[4],
  dodge: (f, node) => node.k - 3 * f[4] - 3 * f[7],          // hand heuristic: go deep, avoid own and rival work
  random: (f, node, ctx) => mulberry32((node.id * 2654435761 + ctx.salt) >>> 0)(),
};

// scorers: per player, a SHARED_BASELINES function or an entry object (v1 or shared weights).
// seats: player indices in turn order. Returns the leaf log and float tallies.
export function runShared(round, scorers, { seats = scorers.map((_, i) => i), salt = 0 } = {}) {
  const P = scorers.length, rescoreCap = 4 * round.budget;
  const players = scorers.map((sc, p) => {
    const fn = typeof sc === 'function' ? sc : scorerOf(sc);
    return { fn, ctx: { round, seen: new Map(), rival: new Map(), used: 0, salt: (salt * 7919 + p * 104729) >>> 0 }, heap: new Heap(), nextId: 0, rescores: 0 };
  });
  const score = (pl, node) => { const f = featuresOf(node, pl.ctx); f.push(Math.log1p(pl.ctx.rival.get(node.k + ':' + node.cell) || 0)); return pl.fn(f, node, pl.ctx); };
  const push = (pl, w, k, parentSurv) => { const node = { w, k, id: pl.nextId++, parentSurv, cell: cellKey(w) }; node.s = score(pl, node); pl.heap.push(node); };
  for (const pl of players) push(pl, round.A, 0, 1);
  const owner = new Map(), events = [], owned = new Array(P).fill(0), reached = players.map(() => new Set());
  for (let t = 0; t < round.budget; t++) {
    for (let s = 0; s < P; s++) {
      const p = seats[s], pl = players[p];
      let node = null;
      while (pl.heap.size) {
        const cand = pl.heap.pop(), fresh = score(pl, cand);   // features change as anyone expands
        if (pl.heap.size && fresh < pl.heap.peek().s && pl.rescores < rescoreCap) { cand.s = fresh; pl.heap.push(cand); pl.rescores++; continue; }
        node = cand; break;
      }
      if (!node) continue;                                     // an exhausted frontier passes
      pl.ctx.used++;
      const key = node.k + ':' + node.cell;
      pl.ctx.seen.set(key, (pl.ctx.seen.get(key) || 0) + 1);
      players.forEach((o, q) => { if (q !== p) o.ctx.rival.set(key, (o.ctx.rival.get(key) || 0) + 1); });
      const w = node.w, r = sqrtAll(w[0] - round.c[0], w[1] - round.c[1], w[2] - round.c[2]);
      const kids = r.roots.filter(v => Math.hypot(...v) <= 2 - RULES.ballMargin);
      for (const v of kids) {
        if (node.k + 1 === round.n) {
          events.push([t, s, p, v[0], v[1], v[2]]);
          const ck = cellKey(v); reached[p].add(ck);
          if (!owner.has(ck)) { owner.set(ck, p); owned[p]++; }
        } else push(pl, v, node.k + 1, kids.length);
      }
    }
  }
  return { events, owned, reached: reached.map(x => x.size), used: players.map(pl => pl.ctx.used), rescores: players.map(pl => pl.rescores) };
}

// A 1v1 pairing on one seed: both seat orders. Returns [game with a first, game with b first].
export function mirror(round, a, b, { salt = 0 } = {}) {
  return [runShared(round, [a, b], { seats: [0, 1], salt }), runShared(round, [a, b], { seats: [1, 0], salt: salt + 1 })];
}
