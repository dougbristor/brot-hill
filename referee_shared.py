#!/usr/bin/env python3
"""Brot Hill shared-fruit exact referee (Caro, 2026-11-24). Standard library only; shares no code with the arena.

It reuses referee.py (the v1 exact referee: round regeneration and the dyadic leaf check). A shared run file holds,
per game, the seed, the seat order and the arena's leaf log [tick, seat, player, x, y, z]. For each game the referee
1. regenerates the round from its seed and refuses any spec mismatch;
2. refuses a log that is out of turn order, names a player not sitting in that seat, or has a tick outside the budget;
3. checks every leaf exactly (referee.check_leaf) and gives each exact eps-cell to the first valid leaf in log order;
4. scores each player as (cells it owns) - (its invalid leaves).
It certifies the leaves and that ownership follows from the log. It does not certify the budget or which player's
search produced which leaf: the arena harness runs the search and writes the log.

  python3 referee_shared.py score RUN.json          # per-game and total scores (JSON)
  python3 referee_shared.py selftest RUN.json       # every planted fault must be caught, the clean game must pass
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import referee as R

SHARED_VERSION = 'brot-hill-shared/1'


def score_game(game, nplayers):
    spec = R.make_round(game['seed'])
    given = game.get('round', {})
    for key in ('version', 'n', 'epsDen', 'budget', 'cNum', 'cDen', 'aNum', 'aDen'):
        if given.get(key) != spec[key]:
            return dict(seed=game['seed'], refused='round spec mismatch on ' + key)
    seats = game.get('seats')
    if not isinstance(seats, list) or sorted(seats) != list(range(nplayers)):
        return dict(seed=game['seed'], refused='seats must be a permutation of the players')
    events = game.get('events')
    if not isinstance(events, list):
        return dict(seed=game['seed'], refused='events missing')
    last = (-1, -1)
    per_player = [0] * nplayers
    for ev in events:
        if not isinstance(ev, list) or len(ev) != 6 or not all(isinstance(v, int) and not isinstance(v, bool) for v in ev[:3]):
            return dict(seed=game['seed'], refused='malformed event')
        t, s, p = ev[:3]
        if not (0 <= t < spec['budget']) or not (0 <= s < nplayers) or seats[s] != p:
            return dict(seed=game['seed'], refused='tick out of budget or player not in that seat')
        if (t, s) < last:
            return dict(seed=game['seed'], refused='log out of turn order')
        last = (t, s)
        per_player[p] += 1
        if per_player[p] > 6 * spec['budget']:
            return dict(seed=game['seed'], refused='more than 6 x budget leaves for one player')
    owner, owned, invalid, reached = {}, [0] * nplayers, [0] * nplayers, [set() for _ in range(nplayers)]
    for t, s, p, x, y, z in events:
        ok, cell = R.check_leaf([x, y, z], spec)
        if not ok:
            invalid[p] += 1
            continue
        reached[p].add(cell)
        if cell not in owner:
            owner[cell] = p
            owned[p] += 1
    return dict(seed=game['seed'], seats=seats, leaves=per_player, invalid=invalid, reached=[len(r) for r in reached],
                owned=owned, score=[owned[i] - invalid[i] for i in range(nplayers)])


def score_run(run):
    players = run['players']
    rows = [score_game(g, len(players)) for g in run['games']]
    ok = [r for r in rows if 'refused' not in r]
    total = [sum(r['score'][i] for r in ok) for i in range(len(players))]
    wins = [sum(1 for r in ok if r['score'][i] > max(r['score'][j] for j in range(len(players)) if j != i)) for i in range(len(players))]
    return dict(players=players, games=len(rows), refused=len(rows) - len(ok), total=total, game_wins=wins,
                ties=len(ok) - sum(wins), invalid=[sum(r['invalid'][i] for r in ok) for i in range(len(players))], rows=rows)


def selftest(path):
    run = json.load(open(path))
    n = len(run['players'])
    base = run['games'][0]
    results = []

    def expect(name, ok):
        results.append((name, ok))
        print(('ok  ' if ok else 'FAIL') + ' ' + name)

    def mutate(fn):
        g = json.loads(json.dumps(base))
        fn(g)
        return score_game(g, n)
    clean = score_game(base, n)
    expect('clean game: no invalid leaves, cells owned', 'refused' not in clean and sum(clean['invalid']) == 0 and sum(clean['owned']) > 0)
    first = base['events'][0]
    p0 = first[2]

    def bad_leaf(g):
        g['events'][0][3] += 1e-3
    r = mutate(bad_leaf)
    expect('plant: a moved leaf is invalid and costs its player one', r['invalid'][p0] == 1 and r['score'][p0] <= clean['score'][p0] - 1)

    def swap_order(g):
        i = next(k for k, e in enumerate(g['events']) if (e[0], e[1]) > (g['events'][0][0], g['events'][0][1]))
        g['events'][0], g['events'][i] = g['events'][i], g['events'][0]
    expect('plant: a log out of turn order is refused', 'refused' in mutate(swap_order))

    def wrong_seat(g):
        g['events'][0][2] = (g['events'][0][2] + 1) % n
    expect('plant: a leaf credited to a player not in that seat is refused', 'refused' in mutate(wrong_seat))

    def late(g):
        g['events'][-1][0] = g['round']['budget']
    expect('plant: a tick past the budget is refused', 'refused' in mutate(late))

    def tamper_c(g):
        g['round']['cNum'] = [0, 0, 0]
    expect('plant: tampered c is refused', 'refused' in mutate(tamper_c))

    def bad_seats(g):
        g['seats'] = [0] * n
    expect('plant: seats that are not a permutation are refused', 'refused' in mutate(bad_seats))

    # A later copy of an owned cell gives its player nothing: append the first leaf again for another player at the end.
    q = (p0 + 1) % n

    def steal(g):
        i = next(k for k, e in enumerate(g['events']) if k > 0 and e[2] == q)
        e = g['events'][i]
        g['events'].insert(i + 1, [e[0], e[1], q, first[3], first[4], first[5]])
    r = mutate(steal)
    expect('a later claim on an owned cell scores nothing for the claimant',
           'refused' not in r and r['owned'] == clean['owned'] and sum(r['leaves']) == sum(clean['leaves']) + 1)

    def flood(g):
        g['events'] = [[0, g['seats'].index(p0), p0, first[3], first[4], first[5]]] * (6 * g['round']['budget'] + 1)
    expect('plant: more than 6 x budget leaves for one player is refused', 'refused' in mutate(flood))
    bad = sum(1 for _, ok in results if not ok)
    print(f'selftest: {len(results) - bad}/{len(results)} passed')
    return bad == 0


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('score', 'selftest'):
        sys.exit(__doc__)
    if sys.argv[1] == 'selftest':
        sys.exit(0 if selftest(sys.argv[2]) else 1)
    print(json.dumps(score_run(json.load(open(sys.argv[2])))))
