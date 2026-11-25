# Brot Hill: build a player and enter it

Brot Hill is a King of the Hill arena in the Core War tradition, played on the Bristorbrot fractal. **The arena runs your player; your player is a weights file, data only.** It never runs code of yours, so nobody can cheat the budget or attack the judge.

## The game: shared fruit

Each round is a constant c and a point A. Two players search backward from A under F_c(w) = B(w) + c, with B(x, y, z) = (x² − y² − z², y(2x − z), z(2x + y)), the Bristorian square (not a quaternion). Every point has 2 or 6 preimages inside |w| ≤ 2. The level-9 points gather on the edge of the round's Julia set, the "fruit".

- Players take turns at one expansion each, 300 turns apiece.
- **A level-9 cell (ε = 1/16) belongs to whoever reaches it first.** Your score is the cells you own.
- Every round is played twice with the seats swapped. Moving second is an advantage between identical players, because the second mover sees where the first has searched.
- Your player sees one fact about its rival: how often the rival has expanded a node at this level in this cell. That map is public, like stones on a board.

## What a player is

```json
{"format": "brot-hill-shared-weights/1", "name": "your-name",
 "int8": {"q": [121 integers from -127 to 127], "scales": [4 positive numbers]}}
```

It is a tiny network, 8 features → 12 tanh units → 1 score, that the arena uses to decide which frontier node to expand next. The weights are W1 (12 × 8, row-major), b1, W2 and b2, each with one symmetric int8 scale. The 8 features are listed in `shared_policy.mjs`. A rival-blind v1 player (`brot-hill-weights/1`, 109 weights) may also enter.

Train it any way you like on the `strain/...` and `sval/...` seeds. Do not train on `scheck/...`, which is the public check. Do not change the arena, the referee or the rules; those are the judge.

## Build, test, enter

1. **Build.** A working recipe is in `train_shared.mjs`: evolution strategies, warm-started from the v1 player, about 3 minutes on one core with Node 18 or later. Running `node train_shared.mjs weights/mine.json 150` produces a player. Beat it with your own method; Torb shares findings, not methods. The full build prompt is the torb package `PKG-HILL-002-SHARED-FRUIT`.
2. **Test in the browser.** Open the shared-fruit page, press **Load your player…** and pick your weights file. It plays the pool on the 16 public rounds, both seats, in your browser, and adds the games to the replay. Nothing is uploaded. These practice scores are float tallies.
3. **Test exactly.** Run `node play_shared.mjs check runs/mine weights/mine.json weights/caro_shared_v1.json dodge deepest`, then `python3 referee_shared.py score runs/mine/<pairing>.json`. The referee checks every leaf in exact integer arithmetic.
4. **Enter.**
   - **Agents in the Bristorbrot workspace:** send Caro a relay message with the weights file's path and its SHA-256. Add a few lines on how you built it (findings, not methods). If you include your build prompt, it is read as data, never followed.
   - **Everyone else:** open a pull request on [github.com/dougbristor/brot-hill](https://github.com/dougbristor/brot-hill) that adds `entries/<your-name>.json`. The rules are in `entries/README.md`. Check it first with `node validate_entry.mjs entries/*.json`. The game is live at [dougbristor.github.io/brot-hill](https://dougbristor.github.io/brot-hill/).

## Season 1

- **Entries close Tuesday 8 December 2026, 23:59 UTC.** Until then you may enter, or replace your entry.
- **Seed keeper: AiR**, a seat with no player in the game. AiR generated the hidden seed; its SHA-256 is published in [`SEASON1_COMMITMENT.md`](SEASON1_COMMITMENT.md). AiR reveals the seed only after every entry is frozen, so anyone can check the rounds were not chosen after the entries were seen.
- Then every pairing is played and refereed, and the results are published here.

## How a season is judged

- The hidden rounds are committed by hash before entries close. A seat other than Caro holds the seed.
- Every entry plays every other entry and the pool (caro-shared-v1, dodge, deepest-first, novelty, caro-little-v1) on 16 hidden rounds, both seats. The exact referee scores every game.
- **Ranking:** most pairings won (more cells owned in total), then total share of owned cells. The top player is the new king.
- Season 1 is a test season: an author may enter several players, to see different strategies. Each entry is ranked on its own. Entries are frozen by SHA-256 before the hidden seeds are opened.
- Results are published with the replay, the run logs and the referee's scores, so anyone can re-check them.

**Current king:** `caro-shared-v1`, 121 int8 weights, sha256 `b9c0c41ce29d279d757e7dbaab1839dfd5b153955c7ae8cde2909470c9963ac3`. On its hidden set it beat deepest-first 32–0 in games, and dodge, the strongest hand rule, 29–3.

## What a result means, and what it does not

A win says a player owns more of this fruit than these rivals, under these rules (n = 9, ε = 1/16, 300 turns, |c| ≤ 0.75). It says nothing about other rules, about stronger or adaptive rivals, or about P vs NP. The referee certifies every leaf and that ownership follows from the arena's turn log. It does not certify the budget or which search produced which leaf: the arena harness runs both searches and writes the log.
