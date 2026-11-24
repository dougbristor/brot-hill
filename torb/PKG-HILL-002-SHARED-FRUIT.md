# Build prompt for a shared-fruit Brot Hill policy

**Package** `PKG-HILL-002-SHARED-FRUIT` · **Version** `1.0.0` · **Status** Built once (Caro, 2026-11-24) · Torb PKG format

## Task

Build a tiny learned policy that plays the Brot Hill **shared fruit** and owns more of the contested edge than each opponent in a fixed pool, on rounds it has never seen. The entry is a **weights file**, data only. The arena (`caro/web/brot_hill/shared.mjs`) runs every player's search; an entrant only scores its own frontier nodes. Do not change the arena, the referee or the rules to make an entry win. Those are the judge.

The game: the v1 rounds and moves (`PKG-HILL-001`). From a point A, search backward under F_c(w) = B(w) + c, with B(x, y, z) = (x² − y² − z², y(2x − z), z(2x + y)), the Bristorian B2 square (not a quaternion; slot order (zx, zy, zz) = (real, j, i)). Each expansion yields a node's 2 or 6 real preimages inside |w| ≤ 2, and level-9 points are leaves.

What changes: two (or more) players search the **same** round, taking turns at one expansion each, 300 turns apiece. **A level-9 ε = 1/16 cell belongs to the first player whose valid leaf lands in it.** A player's score is the cells it owns minus its invalid leaves. Every pairing plays each round twice with the seats swapped, so moving first is no advantage overall.

## Entry contract

`{"format": "brot-hill-shared-weights/1", "name": "...", "int8": {"q": [121 integers in -127..127], "scales": [4 positive floats]}}`

- Network: 8 features → 12 tanh units → 1 score. The features are the 7 of `policy.mjs` plus `log1p(rival expansions at level+cell)`: how often any rival has already expanded a node at this level in this cell. That is public, as on a board, and it is the only thing a player sees of its rivals. The arena re-scores a node when it pops, because the features change as anyone moves.
- 121 parameters in the order W1 (12 × 8, row-major), b1, W2, b2, with one symmetric int8 scale per tensor. About 0.6 KB; it runs unchanged in a browser.
- v1 entries (`brot-hill-weights/1`) also play, blind to rivals.
- Train any way you like on `strain/...` and `sval/...` seeds. Never use `scheck/...` for training, and never read the hidden nonce.

## How this build did it (one method among many; Torb shares findings, not methods)

Warm start from caro-little-v1, widened with a zero rival column, so it starts by playing exactly like v1 (validation share 0.5015). Then antithetic evolution strategies with rank utilities and Adam (`train_shared.mjs`): 150 generations, population 32, 4 rounds per generation, each played in both seat orders against an opponent cycled from the pool (deepest-first, novelty, dodge, caro-little-v1). Fitness is the owned share, mine / (mine + theirs). The checkpoint is chosen on 12 validation rounds × 4 opponents × 2 seat orders, and the int8 export is checked against float. Training takes about 3 minutes on one core.

## Acceptance and receipt

From `caro/web/brot_hill/`:

```sh
bash ../../torb/PKG-HILL-002-SHARED-FRUIT/tests/check_shared.sh weights/<entry>.json
```

It plays the entry on the 16 public `scheck/` rounds, in both seat orders, against deepest-first, novelty, dodge (a hand rule that avoids its own and rival work), caro-little-v1 and a fixed shuffle of its own weights. It runs the shared referee's selftest (9 plants) and scores every pairing exactly. To pass, the entry must, in every pairing:
- own more cells in total than its opponent;
- have 0 invalid leaves and 0 refused games.

This rule was fixed in `SHARED_COMMITMENT.md` before training.

**Planted fault:** run the same check on `shuffle:<entry>`. It must FAIL. Record both results.

After acceptance, freeze the entry by its SHA-256. Only then is the hidden set played (`node play_shared.mjs hill … --nonce <private file>`), and the custodian reveals the nonce. Record in `PACKAGE.receipt`:
- the SHA-256 of this prompt, the check script, the arena, the policies, the referees, the trainer and the entry;
- the check results with the planted-fault failure;
- the hidden results.

## Limits (say them where the result is used)

- The policy is not a language model. It is a 121-weight scorer that sees one public fact about its rivals.
- The referee certifies every leaf and that ownership follows from the arena's turn log. It does not certify the budget or which search produced a leaf; the arena harness writes the log, and the entrant does not control it.
- The pool is fixed and small. Beating it says nothing about stronger or adaptive opponents, other rules, or more than two players (the arena supports N; this package tests 1v1).
- The same seat trained the entry and kept the nonce: procedural custody. A nonce held by another seat is the stronger test.

## Sources

- Arena, policies, trainer, referees, pages: `caro/web/brot_hill/` (README.md)
- v1 package: `caro/torb/PKG-HILL-001-LITTLE-POLICY/`
- Commitment and acceptance rule: `caro/web/brot_hill/SHARED_COMMITMENT.md`
- Why a shared fruit: Doug, 2026-11-24 ("go straight to the shared fruit"); the Core War shared core
