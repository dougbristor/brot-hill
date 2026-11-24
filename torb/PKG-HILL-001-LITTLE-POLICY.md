# Build prompt for a little Brot Hill policy

**Package** `PKG-HILL-001-LITTLE-POLICY` · **Version** `1.0.0` · **Status** Built once (Caro, 2026-11-24) · Torb PKG format

## Task

Build a tiny learned policy that plays the Brot Hill and beats the arena's strongest simple baseline on rounds it has never seen. The entry is a **weights file**, data only. The arena (`caro/web/brot_hill/hill.mjs`) runs the search; the entrant only scores frontier nodes. Do not change the arena, the referee or the rules to make an entry win. Those are the judge.

The game: from a point A, search backward under F_c(w) = B(w) + c, with B(x, y, z) = (x² − y² − z², y(2x − z), z(2x + y)), the Bristorian B2 square (not a quaternion; slot order (zx, zy, zz) = (real, j, i)). Each expansion of a frontier node costs one unit of a 300-unit budget and yields its 2 or 6 real preimages inside the ball |w| ≤ 2. Level-9 points are leaves. A round's score is the number of distinct ε = 1/16 cells the leaves occupy, minus one for every leaf the exact referee rejects. Rounds (c, A) come from seed strings, and hill seeds stay hidden until the entry is frozen.

## Entry contract

`{"format": "brot-hill-weights/1", "name": "...", "int8": {"q": [109 integers in -127..127], "scales": [4 positive floats]}}`

- Network: the 7 features of `policy.mjs` (`FEATURES`) → 12 tanh units → 1 score. The arena expands the highest score and re-scores a node at pop time, because the "seen at level + cell" feature changes.
- 109 parameters in the order W1 (12 × 7, row-major), b1, W2, b2, with one symmetric int8 scale per tensor. About 0.5 KB as JSON, and it runs unchanged in a browser.
- Train any way you like on `train/...` and `val/...` seeds. Never use `check/...` for training, and never read the hill nonce.

## How this build did it (one method among many; Torb shares findings, not methods)

Antithetic evolution strategies with rank-shaped utilities and Adam (`train.mjs`): 60 generations, a population of 32, and 6 training rounds per generation. Fitness is cells divided by deepest-first's cells on the same round, so hard rounds don't dominate. The checkpoint is chosen on 24 validation rounds, and the int8 export is checked against float on those same rounds. Training takes 30 s on one core.

## Acceptance and receipt

From `caro/web/brot_hill/`:

```sh
bash ../../torb/PKG-HILL-001-LITTLE-POLICY/tests/check_hill.sh weights/<entry>.json
```

The check runs:
1. the referee selftest, where every planted bad leaf or tampered round must be caught;
2. the entry and the baselines on the 16 public `check/` seeds, scored by the exact referee.

To pass, the entry must:
- have 0 invalid leaves and 0 refused rounds;
- score at least **1.02 ×** deepest-first's exact total, and beat the novelty heuristic;
- beat a fixed permutation of its own weights by at least 1.2 ×.

**Planted fault:** run the same check on `shuffle:<entry>`. It must FAIL at "entry beats deepest-first". Record both results.

After acceptance, freeze the entry by its SHA-256. Only then is the hill run on the hidden seeds (`node play.mjs hill … --nonce <private file>`), and the custodian reveals the nonce. Record in `PACKAGE.receipt`:
- the SHA-256 of this prompt, the check script, the arena, the policy, the referee, the trainer and the entry;
- the check results with the planted-fault failure;
- the hill results.

## Limits (say them where the result is used)

- The policy is not a language model. It is a 109-weight scorer, the smallest learned thing that can play.
- The referee certifies the leaves, not the budget; the budget is enforced by the arena harness, which the entrant does not control.
- A gain over deepest-first on these rules (n = 9, ε = 1/16, budget 300, |c| ≤ 0.75) says nothing about other rules or about the real P vs NP question.
- When the same seat trains and keeps the nonce, that is procedural custody. A nonce held by another seat is the stronger test.

## Sources

- Arena, policy, trainer, referee: `caro/web/brot_hill/` (README.md)
- Square roots: `lib/bristor_sqrt_all/v1.js`, pinned from insights' brot-pnp-open (git ce3b334), with hashes in `lib/PINNED.sha256`
- Hill seed commitment: `caro/web/brot_hill/HILL_COMMITMENT.md`
- Why the arena runs the entrant: TC `bfe3e6c9fc` / `fa32d2af94` (Redcode King of the Hill; pnp-open's immune system)
