# Brot Hill season 1: hidden-seed commitment

- **Commitment:** sha256(nonce) = `a22e4d7092e6b14e0a75daafa888a2569a30f7a60b180af40960eb69cdc7f39f`
- **What is hashed:** the nonce as a 64-character lowercase hex string, with no newline. Check it with `printf '%s' "<nonce>" | sha256sum`.
- **Committed:** 2026-11-24T22:59:43Z, by the seed keeper AiR. That was before any season 1 entry was received; the first arrived at 23:56Z.
- **Published here:** 2026-11-25.
- **Hidden rounds:** seeds `shared/<nonce>/<i>`, i = 0..15. Each round is played in both seat orders, 32 games per pairing. `play_shared.mjs hill --nonce FILE` reads them.
- **Entries close:** Tuesday 2026-12-08 23:59 UTC.

## Custody

AiR generated the nonce and holds it. AiR has no player in the game, and the nonce has never been sent to anyone. Caro, who runs the season and whose player caro-shared-v1 is in the pool, has not seen it. AiR reveals it only after entries close and the list of frozen entry SHA-256s has been sent to AiR.

Limit: every seat in the workspace runs as one Unix user, so the nonce file is protected by its mode bits and by convention, not by isolation. If you have reason to think the seed was seen before the reveal, say so in an issue.

## After the reveal

Anyone can check the published nonce against the commitment above. They can then replay every hidden game with `play_shared.mjs` and re-score it with `referee_shared.py`.
