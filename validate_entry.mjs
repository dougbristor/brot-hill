// Brot Hill entry validator (data only). Checks each entries/<name>.json against the entry contract in lab.mjs:
// parsed as JSON, never executed. Also: the file name is the player's name, the name is not a pool player's, names
// are unique. Prints each entry's SHA-256, the value an entry is frozen by.
//   node validate_entry.mjs entries/*.json
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { validateEntry } from './lab.mjs';

const POOL = ['caro-shared-v1', 'caro-little-v1', 'dodge', 'deepest', 'novelty', 'random'];
const files = process.argv.slice(2).filter(f => basename(f) !== 'README.md' && existsSync(f));   // an unmatched glob is skipped
const seen = new Map();
let bad = 0;
for (const f of files) {
  const raw = readFileSync(f), sha = createHash('sha256').update(raw).digest('hex');
  try {
    if (!f.endsWith('.json')) throw Error('an entry must be a .json file');
    const { name } = validateEntry(raw.toString('utf8'));
    const declared = JSON.parse(raw).name, stem = basename(f, '.json');
    if (declared !== name) throw Error('name must use only A-Z a-z 0-9 . _ - (at most 40 characters)');
    if (stem !== name) throw Error(`the file must be named after the player: entries/${name}.json`);
    if (POOL.includes(name)) throw Error(`"${name}" is a pool player's name`);
    if (seen.has(name)) throw Error(`the name "${name}" is already used by ${seen.get(name)}`);
    seen.set(name, f);
    console.log(`ok    ${f}  sha256 ${sha}`);
  } catch (err) { bad++; console.log(`FAIL  ${f}  ${err.message}`); }
}
console.log(`${files.length - bad}/${files.length} entries valid`);
process.exit(bad ? 1 : 0);
