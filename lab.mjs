// Brot Hill practice lab: load a player's weights file in the browser and play it against the pool on the public
// scheck/ rounds, both seat orders. The file is treated as data only: parsed as JSON, checked against the entry
// contract, never executed. Practice scores are float tallies from the arena; official scores come from the exact
// referee (referee_shared.py) after submission.
import { ready, makeRound, runShared, SHARED_BASELINES } from './shared.mjs';
import { PARAMS2 } from './shared_policy.mjs';

export const MAX_BYTES = 64 * 1024;
const FORMATS = { 'brot-hill-shared-weights/1': PARAMS2, 'brot-hill-weights/1': 109 };

// Returns { entry, name } or throws an Error whose message is safe to show.
export function validateEntry(text) {
  if (typeof text !== 'string' || text.length > MAX_BYTES) throw Error(`The file must be JSON under ${MAX_BYTES / 1024} KB.`);
  let e; try { e = JSON.parse(text); } catch { throw Error('The file is not valid JSON.'); }
  if (!e || typeof e !== 'object' || Array.isArray(e)) throw Error('The file must hold one JSON object.');
  const n = FORMATS[e.format];
  if (!n) throw Error('format must be "brot-hill-shared-weights/1" (or "brot-hill-weights/1" for a rival-blind v1 player).');
  const q = e.int8?.q, s = e.int8?.scales;
  if (!Array.isArray(q) || q.length !== n) throw Error(`int8.q must be an array of ${n} integers.`);
  if (!q.every(v => Number.isInteger(v) && v >= -127 && v <= 127)) throw Error('Every int8.q value must be an integer from -127 to 127.');
  if (!Array.isArray(s) || s.length !== 4 || !s.every(v => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e6)) throw Error('int8.scales must be 4 positive numbers.');
  const name = (typeof e.name === 'string' ? e.name : 'your-player').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40) || 'your-player';
  return { entry: { format: e.format, int8: { q: q.slice(), scales: s.slice() } }, name };
}

let pool = null;
export async function loadPool(base = './') {
  await ready();
  if (pool) return pool;
  const get = async f => { const r = await fetch(base + f); if (!r.ok) throw Error(f + ': ' + r.status); return r.json(); };
  const [king, little] = await Promise.all([get('weights/caro_shared_v1.json'), get('weights/caro_little_v1.json')]);
  pool = [['caro-shared-v1', king], ['dodge', SHARED_BASELINES.dodge], ['deepest', SHARED_BASELINES.deepest], ['novelty', SHARED_BASELINES.novelty], ['caro-little-v1', little]];
  return pool;
}

const yieldUI = () => new Promise(r => setTimeout(r, 0));

// Play `entry` against every pool player. Returns pairings in the page's data shape (players[0] is the entry).
export async function practice(entry, name, { onProgress = () => {}, base = './' } = {}) {
  const opps = await loadPool(base), seeds = Array.from({ length: 16 }, (_, i) => `scheck/${i}`), out = [];
  for (const [oname, opp] of opps) {
    const games = [];
    for (let i = 0; i < seeds.length; i++) {
      const round = makeRound(seeds[i]);
      for (const [k, seats] of [[0, [0, 1]], [1, [1, 0]]]) {
        const g = runShared(round, [entry, opp], { seats, salt: i * 2 + k });
        const owner = new Map(), wasted = [0, 0], owned = [0, 0], claims = [], leaves = [0, 0];
        for (const [t, , p, x, y, z] of g.events) {
          leaves[p]++;
          const cell = [x, y, z].map(v => Math.floor(v * 16)), key = cell.join(',');
          if (owner.has(key)) { wasted[p]++; continue; }
          owner.set(key, p); owned[p]++; claims.push([t, p, ...cell]);
        }
        games.push({ seed: seeds[i], c: round.c, A: round.A, seats, score: owned, owned, leaves, wasted, claims });
      }
      onProgress(oname, i + 1, seeds.length);
      await yieldUI();
    }
    const total = [0, 1].map(p => games.reduce((s, g) => s + g.owned[p], 0));
    const wins = [0, 1].map(p => games.filter(g => g.owned[p] > g.owned[1 - p]).length);
    out.push({ players: [name, oname], set: 'practice', total, game_wins: wins, ties: games.length - wins[0] - wins[1], invalid: [0, 0], refused: 0, games, practice: true });
  }
  return out;
}
