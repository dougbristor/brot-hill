// Play 1v1 shared-fruit pairings and write one run file per pairing for referee_shared.py.
//   node play_shared.mjs check OUTDIR ENTRY OPP...               public seeds scheck/0..15, both seat orders
//   node play_shared.mjs hill  OUTDIR --nonce FILE ENTRY OPP...  hidden seeds shared/<nonce>/0..15 (after the entry is frozen)
// A player is a baseline (deepest, novelty, dodge, random), a weights file (v1 or shared), or shuffle:<weights file>
// (the planted fault: the same int8 values in a fixed permutation).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { ready, makeRound, runShared, SHARED_BASELINES, SHARED_VERSION } from './shared.mjs';
import { mulberry32 } from './hill.mjs';

const [set, outdir, ...rest] = process.argv.slice(2);
let seeds;
if (set === 'check') seeds = Array.from({ length: 16 }, (_, i) => `scheck/${i}`);
else if (set === 'hill') {
  const at = rest.indexOf('--nonce'); if (at < 0) throw Error('hill needs --nonce FILE');
  const nonce = readFileSync(rest[at + 1], 'utf8').match(/nonce: ([0-9a-f]{64})/)[1]; rest.splice(at, 2);
  seeds = Array.from({ length: 16 }, (_, i) => `shared/${nonce}/${i}`);
} else throw Error('set must be check or hill');

function playerOf(spec) {
  if (SHARED_BASELINES[spec]) return { name: spec, scorer: SHARED_BASELINES[spec], sha: null };
  const shuffle = spec.startsWith('shuffle:'), path = shuffle ? spec.slice(8) : spec, raw = readFileSync(path);
  const entry = JSON.parse(raw), sha = createHash('sha256').update(raw).digest('hex');
  if (!['brot-hill-weights/1', 'brot-hill-shared-weights/1'].includes(entry.format)) throw Error(path + ': not a Brot Hill weights entry');
  const name = entry.name || basename(path);
  if (!shuffle) return { name, scorer: entry, sha };
  const q = entry.int8.q.slice(), r = mulberry32(777);
  for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
  return { name: 'shuffled-' + name, scorer: { format: entry.format, int8: { q, scales: entry.int8.scales } }, sha };
}

await ready();
mkdirSync(outdir, { recursive: true });
const [entrySpec, ...opps] = rest, A = playerOf(entrySpec), summary = [];
for (const spec of opps) {
  const B = playerOf(spec), games = [], tally = [0, 0];
  seeds.forEach((seed, i) => {
    const round = makeRound(seed), { c, A: a, ...rspec } = round;
    for (const [k, seats] of [[0, [0, 1]], [1, [1, 0]]]) {
      const g = runShared(round, [A.scorer, B.scorer], { seats, salt: i * 2 + k });
      tally[0] += g.owned[0]; tally[1] += g.owned[1];
      games.push({ seed, round: rspec, seats, used: g.used, events: g.events });
    }
  });
  const file = `${outdir}/${A.name}__vs__${B.name}.json`;
  writeFileSync(file, JSON.stringify({ format: 'brot-hill-shared-run/1', rules: SHARED_VERSION, set, players: [A.name, B.name], weights_sha256: [A.sha, B.sha], games }));
  summary.push({ players: [A.name, B.name], float_owned: tally, file });
  console.log(`${A.name} vs ${B.name}`.padEnd(46), `float owned ${tally[0]} : ${tally[1]}  -> ${file}`);
}
writeFileSync(`${outdir}/play-summary.json`, JSON.stringify({ set, seeds: seeds.length, games_per_pairing: seeds.length * 2, summary }, null, 1));
