// Run entrants through the arena on a seed set and write one run file per entrant for referee.py.
//   node play.mjs check OUTDIR entrant...           public seeds check/0..15
//   node play.mjs hill  OUTDIR --nonce FILE entrant... hidden seeds hill/<nonce>/0..31 (after weights are frozen)
// An entrant is a baseline name (breadth, deepest, random, novelty), a weights file, or shuffle:<weights file>
// (the planted fault: the same int8 values in a fixed permutation; it must lose to the trained entry).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { ready, makeRound, runRound, BASELINES, mulberry32 } from './hill.mjs';

const [set, outdir, ...rest] = process.argv.slice(2);
let seeds;
if (set === 'check') seeds = Array.from({ length: 16 }, (_, i) => `check/${i}`);
else if (set === 'hill') {
  const at = rest.indexOf('--nonce'); if (at < 0) throw Error('hill needs --nonce FILE');
  const nonce = readFileSync(rest[at + 1], 'utf8').match(/nonce: ([0-9a-f]{64})/)[1]; rest.splice(at, 2);
  seeds = Array.from({ length: 32 }, (_, i) => `hill/${nonce}/${i}`);
} else throw Error('set must be check or hill');

function entrantOf(spec) {
  if (BASELINES[spec]) return { name: spec, scorer: BASELINES[spec], sha: null };
  const shuffle = spec.startsWith('shuffle:'), path = shuffle ? spec.slice(8) : spec, raw = readFileSync(path);
  const entry = JSON.parse(raw), sha = createHash('sha256').update(raw).digest('hex');
  if (entry.format !== 'brot-hill-weights/1') throw Error(path + ': not a brot-hill-weights/1 entry');
  if (!shuffle) return { name: entry.name || basename(path), scorer: { int8: entry.int8 }, sha };
  const q = entry.int8.q.slice(), r = mulberry32(777);
  for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
  return { name: 'shuffled-' + (entry.name || basename(path)), scorer: { int8: { q, scales: entry.int8.scales } }, sha };
}

await ready();
mkdirSync(outdir, { recursive: true });
const summary = [];
for (const spec of rest) {
  const e = entrantOf(spec), rounds = [];
  let floatTotal = 0;
  seeds.forEach((seed, i) => {
    const round = makeRound(seed), res = runRound(round, e.scorer, { salt: i });
    floatTotal += res.floatCells;
    const { c, A, ...spec } = round;
    rounds.push({ seed, round: spec, used: res.used, leaves: res.leaves });
  });
  const file = `${outdir}/${e.name}.json`;
  writeFileSync(file, JSON.stringify({ format: 'brot-hill-run/1', set, entrant: e.name, weights_sha256: e.sha, rounds }));
  summary.push({ entrant: e.name, float_cells: floatTotal, file });
  console.log(`${e.name.padEnd(28)} float cells ${floatTotal}  -> ${file}`);
}
writeFileSync(`${outdir}/play-summary.json`, JSON.stringify({ set, seeds: seeds.length, summary }, null, 1));
