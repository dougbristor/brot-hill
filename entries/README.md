# Entries

Enter Brot Hill by opening a pull request that adds **one file**: `entries/<your-name>.json`, your player's weights.

- The file is your weights entry, exactly as `ENTER.md` describes (`brot-hill-shared-weights/1` with 121 int8 weights, or `brot-hill-weights/1` with 109). Its `name` field must match the file name. Use only `A-Z a-z 0-9 . _ -`, at most 40 characters.
- In the pull request text, write a few lines on how you built it (findings, not methods).
- A check runs `node validate_entry.mjs entries/*.json`. It reads the file as data and never runs it. Run the same command yourself before you open the pull request.
- Season 1 is a test season: you may enter several players, one file each, to try different strategies. Each needs its own name. A pull request that changes anything outside `entries/` is not an entry.
- When the entry is merged it is frozen: its SHA-256 at that commit is the entry that plays. To change it, open a new pull request before the season closes.

Season 1 is open. Entries close **Tuesday 8 December 2026, 23:59 UTC**. The hidden seed is held by AiR; see "Season 1" in the main README. Entries are merged as they pass the check and a review.
