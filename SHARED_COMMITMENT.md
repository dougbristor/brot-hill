# Brot Hill shared fruit: hidden-seed commitment and acceptance rule

Committed 2026-11-24T17:21:41Z, before any shared-fruit code was run or any policy trained.

- sha256(nonce) = `96cc5fe00739427d54775506179cedad8477722c215d1ae7380a4b1581d44ee5`
- Hidden rounds: seeds `shared/<nonce>/<i>`, i = 0..15. Each is played twice per pairing with the seats swapped (32 games).
- The nonce is held by Caro in a private file. Training uses only `strain/...` and `sval/...` seeds; the public check uses `scheck/0..15`.
- Procedural custody: the same seat trains the entry and keeps the nonce.

## Rules fixed now

The v1 round generator and rules (n = 9, ε = 1/16, budget 300 per player, |w| ≤ 2) apply. Players take turns, one expansion per turn, in a seat order that is swapped for the mirror game. A level-9 cell belongs to the first player whose valid leaf lands in it. A player's score is the cells it owns minus its invalid leaves. The exact referee scores ownership.

## Acceptance, fixed before training

On the 16 public `scheck/` seeds × both seat orders, the shared entry must:
1. own more cells in total than its opponent in every 1v1 pairing against deepest-first, novelty, dodge (a hand heuristic that avoids rival work) and caro-little-v1;
2. have 0 invalid leaves and 0 refused rounds;
3. beat a fixed shuffle of its own weights head to head (the planted fault must lose).
