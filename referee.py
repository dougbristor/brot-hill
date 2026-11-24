#!/usr/bin/env python3
"""Brot Hill v1 exact referee (Caro, 2026-11-24). Standard library only; shares no code with hill.mjs.

A run file holds, per round, the seed and the leaves the arena harness produced. The referee
1. regenerates each round from its seed (FNV-1a + mulberry32, reimplemented here) and refuses any spec mismatch;
2. reads every leaf coordinate as the exact dyadic rational its float64 value denotes;
3. checks, in integer arithmetic, that the leaf lies in the ball |w| <= 2, that each of its n forward images under
   F_c(w) = B(w) + c with B(x,y,z) = (x^2-y^2-z^2, y(2x-z), z(2x+y)) stays in the ball for levels n-1..1, and that the
   n-th image lies in the half-open eps-cell of A;
4. scores the round as (distinct eps-cells of valid leaves) - (invalid leaves).
It does not certify the search budget: the arena harness, not the entrant, runs the search.

  python3 referee.py score RUN.json          # per-round and total score (JSON on stdout)
  python3 referee.py selftest FIXTURE.json   # every planted fault must be caught, the clean run must pass
"""
import json, math, sys

VERSION = 'brot-hill/1'
RULES = dict(n=9, epsDen=16, budget=300, cRadius=0.75, cDen=256, aRadius=1.0)


def fnv1a(s):
    h = 0x811c9dc5
    for ch in s.encode('utf-8'):
        h ^= ch
        h = (h * 0x01000193) & 0xffffffff
    return h


def imul(a, b):
    return (a * b) & 0xffffffff


def mulberry32(a):
    state = [a & 0xffffffff]

    def nxt():
        state[0] = (state[0] + 0x6D2B79F5) & 0xffffffff
        t = state[0]
        t = imul(t ^ (t >> 15), t | 1)
        t ^= (t + imul(t ^ (t >> 7), t | 61)) & 0xffffffff
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296
    return nxt


def js_round(x):  # Math.round: floor(x + 0.5)
    return math.floor(x + 0.5)


def make_round(seed):
    rnd = mulberry32(fnv1a(seed))

    def pick(radius, den):
        while True:
            v = [js_round((rnd() * 2 - 1) * radius * den) for _ in range(3)]
            if math.sqrt(sum(t * t for t in v)) <= radius * den:  # same float test as Math.hypot for these small ints
                return v
    ci = pick(RULES['cRadius'], RULES['cDen'])
    ai = pick(RULES['aRadius'], RULES['epsDen'])
    return dict(seed=seed, version=VERSION, n=RULES['n'], epsDen=RULES['epsDen'], budget=RULES['budget'],
                cNum=ci, cDen=RULES['cDen'], aNum=[2 * v + 1 for v in ai], aDen=2 * RULES['epsDen'])


def dyadic(v):
    """Exact (numerator, exponent) with value numerator / 2**exponent, or None."""
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        return None
    num, den = float(v).as_integer_ratio()
    e = den.bit_length() - 1
    assert den == 1 << e
    return num, e


def check_leaf(leaf, spec):
    """True if leaf is a valid level-n point; False otherwise. Returns (ok, cell)."""
    if not isinstance(leaf, list) or len(leaf) != 3:
        return False, None
    parts = [dyadic(v) for v in leaf]
    if any(p is None for p in parts):
        return False, None
    e = max(p[1] for p in parts)
    X, Y, Z = (p[0] << (e - p[1]) for p in parts)
    eps = spec['epsDen']
    cell = tuple((t * eps) >> e for t in (X, Y, Z))          # floor(w * epsDen), exact
    inball = lambda X, Y, Z, e: X * X + Y * Y + Z * Z <= 4 << (2 * e)
    if not inball(X, Y, Z, e):
        return False, cell
    cexp = RULES['cDen'].bit_length() - 1                     # cDen = 2**8
    cN = spec['cNum']
    for step in range(1, spec['n'] + 1):
        X, Y, Z = X * X - Y * Y - Z * Z, Y * (2 * X - Z), Z * (2 * X + Y)
        e2 = 2 * e
        if e2 < cexp:
            X, Y, Z, e2 = X << (cexp - e2), Y << (cexp - e2), Z << (cexp - e2), cexp
        sh = e2 - cexp
        X, Y, Z, e = X + (cN[0] << sh), Y + (cN[1] << sh), Z + (cN[2] << sh), e2
        if step < spec['n'] and not inball(X, Y, Z, e):
            return False, cell
    target = [(a - 1) // 2 for a in spec['aNum']]               # A = (ai + 1/2)/epsDen sits in cell ai
    if [(t * eps) >> e for t in (X, Y, Z)] != target:
        return False, cell
    return True, cell


def score_round(rnd):
    spec = make_round(rnd['seed'])
    given = rnd.get('round', {})
    for key in ('version', 'n', 'epsDen', 'budget', 'cNum', 'cDen', 'aNum', 'aDen'):
        if given.get(key) != spec[key]:
            return dict(seed=rnd['seed'], refused='round spec mismatch on ' + key)
    leaves = rnd.get('leaves')
    if not isinstance(leaves, list) or len(leaves) > 6 * spec['budget']:
        return dict(seed=rnd['seed'], refused='leaves missing or above 6 x budget')
    cells, invalid = set(), 0
    for leaf in leaves:
        ok, cell = check_leaf(leaf, spec)
        if ok:
            cells.add(cell)
        else:
            invalid += 1
    return dict(seed=rnd['seed'], leaves=len(leaves), valid=len(leaves) - invalid, invalid=invalid,
                cells=len(cells), score=len(cells) - invalid)


def score_run(run):
    rows = [score_round(r) for r in run['rounds']]
    refused = [r for r in rows if 'refused' in r]
    return dict(entrant=run.get('entrant'), rounds=len(rows), refused=len(refused),
                total=sum(r.get('score', 0) for r in rows), invalid=sum(r.get('invalid', 0) for r in rows), rows=rows)


def selftest(path):
    run = json.load(open(path))
    base = run['rounds'][0]
    clean = score_round(base)
    results = []

    def expect(name, ok):
        results.append((name, ok))
        print(('ok  ' if ok else 'FAIL') + ' ' + name)
    expect('clean round: every leaf valid', clean.get('invalid') == 0 and clean.get('valid', 0) > 0)
    leaf = base['leaves'][0]

    def one(mut_leaf=None, mut_round=None):
        r = json.loads(json.dumps(base))
        if mut_leaf is not None:
            r['leaves'] = [mut_leaf]
        if mut_round:
            mut_round(r)
        return score_round(r)
    expect('plant: leaf moved 1e-3 is rejected', one([leaf[0] + 1e-3, leaf[1], leaf[2]]).get('invalid') == 1)
    expect('plant: leaf outside the ball is rejected', one([2.5, 0.0, 0.0]).get('invalid') == 1)
    sp = make_round(base['seed'])
    c = [v / sp['cDen'] for v in sp['cNum']]
    x, y, z = leaf
    up = [x * x - y * y - z * z + c[0], y * (2 * x - z) + c[1], z * (2 * x + y) + c[2]]
    expect('plant: a level n-1 point (one step short) is rejected', one(up).get('invalid') == 1)
    expect('plant: NaN, string and short leaves are rejected',
           all(one(b).get('invalid') == 1 for b in ([float('nan'), 0.0, 0.0], ['0.1', 0, 0], [0.1, 0.2])))
    expect('plant: tampered c is refused', 'refused' in one(mut_round=lambda r: r['round'].__setitem__('cNum', [0, 0, 0])))
    expect('plant: tampered n is refused', 'refused' in one(mut_round=lambda r: r['round'].__setitem__('n', 8)))
    dup = one(mut_round=lambda r: r.__setitem__('leaves', [leaf, leaf, leaf]))
    expect('duplicate leaves count one cell', dup.get('cells') == 1 and dup.get('invalid') == 0)
    expect('plant: oversize leaf list is refused', 'refused' in one(mut_round=lambda r: r.__setitem__('leaves', [leaf] * 1801)))
    bad = sum(1 for _, ok in results if not ok)
    print(f'selftest: {len(results) - bad}/{len(results)} passed')
    return bad == 0


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('score', 'selftest'):
        sys.exit(__doc__)
    if sys.argv[1] == 'selftest':
        sys.exit(0 if selftest(sys.argv[2]) else 1)
    res = score_run(json.load(open(sys.argv[2])))
    print(json.dumps({k: v for k, v in res.items() if k != 'rows'} | {'rows': res['rows']}))
