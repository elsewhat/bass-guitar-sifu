# Notes of the lowest voice on the bar grid, from the slot features.
#   transcribe.py <dir> <config.json> [print from_bar to_bar]
# config.json:
#   { "title", "artist", "album", "trackName", "tuning": [low..high MIDI],
#     "spq": slots per quarter note (4 = sixteenths, 3 = eighth triplets),
#     "start": first slot of bar 1, "bar": slots in a normal bar,
#     "odd": { "<bar number>": slots },          bars of another length
#     "end": slot after the last bar (default: as many normal bars as fit), "end_s": the same as a time,
#     "lowest": lowest MIDI note the bass can play (default: the lowest string),
#     "rest_db": a slot this far below the loud level is silence (default 26),
#     "on": onset strength that splits a held pitch into two notes (default 0.55),
#     "fold": [[from_bar, to_bar, "A2", "A1"], ...]   in these bars read the first pitch as the second,
#     "tacet": [[from_bar, to_bar], ...]              bars written as rests whatever the tracker says,
#     "whole": [[from_bar, to_bar], ...]              one note per bar: the bar's main pitch, held,
#     "pedal": [[from_bar, to_bar, unit], ...]        the main pitch of every <unit> slots, struck on every slot,
#     "place": [[from_bar, to_bar, "D2", string, fret], ...]   in these bars write the pitch there (string 1 = lowest) }
# The main pitch of a stretch is the reading with the most support; a reading an octave, an octave and
# a fifth or two octaves above a pitch (its partials 2, 3 and 4) counts as support for that pitch.
# Steps: bars that sound alike vote together on every slot (salience and onset strength are summed
# over the most similar bars of the same length), then pitch, rests and note starts are read per slot.
# One-slot misreadings (an octave or a semitone off the note next to them) are folded into that note,
# and bars that agree in most slots are made equal where the bar's own sound allows it.
# A bar with an odd number of slots is written with an even number: its last slot is stretched over
# two grid slots, or squeezed with the one before, and gets an anchor of its own.
# Writes <dir>/notes.json (for write-score.ts), <dir>/anchors.json and prints the bars.
import sys
from rwlib import *

d = sys.argv[1]
cfg = read(sys.argv[2])
show = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else None
S = np.load(f'{d}/slots.npz')
t, v, on, lvl, p_lo, loud = S['t'], S['v'].astype(np.float64), S['on'].astype(np.float64), S['lvl'], int(S['p_lo']), float(S['loud'])
fu = S['f'].astype(np.float64)
n_slots = len(on)
pitches = p_lo + np.arange(v.shape[1])
spq = cfg.get('spq', 4)
tuning = cfg['tuning']
lowest = cfg.get('lowest', tuning[0])
REST_DB = cfg.get('rest_db', 26)
ON = cfg.get('on', 0.55)

# Bars
odd = {int(k): int(x) for k, x in cfg.get('odd', {}).items()}
end = cfg.get('end', n_slots)
if 'end_s' in cfg:   # no bars after this time
    end = min(end, int(np.searchsorted(t, cfg['end_s'])))
bars = []  # (start slot, slots)
pos = cfg['start']
while True:
    length = odd.get(len(bars) + 1, cfg['bar'])
    if pos + length > end:
        break
    bars.append((pos, length))
    pos += length
n_bars = len(bars)

# Similar bars vote together.
vn = v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)
by_len = {}
for i, (a, L) in enumerate(bars):
    by_len.setdefault(L, []).append(i)
V = np.zeros_like(v)
F = np.zeros_like(v)
O = np.zeros_like(on)
friends = [[] for _ in bars]
K, MIN_SIM = cfg.get('k', 10), cfg.get('min_sim', 0.6)
for L, idx in by_len.items():
    M = np.array([vn[bars[i][0]:bars[i][0] + L].reshape(-1) for i in idx])
    sim = M @ M.T / L
    for r, i in enumerate(idx):
        order = np.argsort(sim[r])[::-1]
        a = bars[i][0]
        w_sum = 0.0
        for q in order[:K + 1]:
            j = idx[q]
            w = 1.5 if j == i else (sim[r, q] if sim[r, q] >= MIN_SIM else 0.0)
            if w == 0.0:
                continue
            b = bars[j][0]
            V[a:a + L] += w * v[b:b + L]
            F[a:a + L] += w * fu[b:b + L]
            O[a:a + L] += w * on[b:b + L]
            w_sum += w
            if j != i:
                friends[i].append(j)
        V[a:a + L] /= w_sum
        O[a:a + L] /= w_sum

allowed = pitches >= lowest
score = V + 0.006 * (pitches.max() - pitches)[None, :] * (V > 0.3)
score[:, ~allowed] = -1
best = score.argmax(axis=1)
pitch = pitches[best].astype(int)
strength = V[np.arange(n_slots), best]
# The octave: a note whose lower octave is a spectral peak of its own (more than OCT of the note's
# own fundamental) is that lower note with a weak fundamental. Measured on real notes, a true
# fundamental has less than a tenth of its strength an octave below it.
OCT = cfg.get('octave', 0.12)
dropped = 0
for i in range(n_slots):
    p = pitch[i]
    while p - 12 >= lowest and F[i, p - 12 - p_lo] > OCT * F[i, p - p_lo]:
        p -= 12
        dropped += 1
    pitch[i] = p
silent = lvl < loud - REST_DB
unclear = (strength < cfg.get('min_sal', 0.4)) & ~silent
pitch[silent | unclear] = 0
# A loud slot without a clear pitch between notes is a note whose reading a drum hit has spoilt:
# the note before going on, or the next note starting, whichever the slot's sound fits better.
filled = 0
for i in range(n_slots):
    if not unclear[i]:
        continue
    before = pitch[i - 1] if i > 0 else 0
    j = i + 1
    while j < n_slots and unclear[j] and j - i < 2:
        j += 1
    after = pitch[j] if j < n_slots and not unclear[j] else 0
    if not before and not after:
        continue
    if before and after:
        choice = after if V[i, after - p_lo] > 1.2 * V[i, before - p_lo] else before
    else:
        choice = before or after
    pitch[i] = choice
    filled += 1
fold = [(a, b, NOTE_NAMES.index(x[:-1]) + 12 * (int(x[-1]) + 1), NOTE_NAMES.index(y[:-1]) + 12 * (int(y[-1]) + 1)) for a, b, x, y in cfg.get('fold', [])]
tacet = cfg.get('tacet', [])

# Hold: a slot whose winner barely beats the pitch of the slot before keeps that pitch.
for i in range(1, n_slots):
    p, q = pitch[i], pitch[i - 1]
    if p and q and p != q and O[i] < ON:
        if V[i, q - p_lo] >= 0.85 * V[i, p - p_lo]:
            pitch[i] = q

# Rows: the pitch of every written slot of every bar. A bar with an odd number of grid slots is
# written with one slot more or less (towards the normal length).
def written(L):
    if L % 2 == 0 or spq != 4:
        return L   # eighth-note and triplet grids are written as they are
    return L + 1 if L < cfg['bar'] else L - 1

rows, orows, raw_of = [], [], []   # per bar: pitches, onset strengths, grid slot of every written slot
for bi, (a, L) in enumerate(bars):
    W = written(L)
    if W == L:
        idx = list(range(a, a + L))
    elif W < L:    # the last written slot covers two grid slots
        idx = list(range(a, a + W))
    else:          # the last grid slot is written as two slots
        idx = list(range(a, a + L)) + [a + L - 1]
    row = pitch[idx].copy()
    if W < L and row[-1] == 0:
        row[-1] = pitch[a + L - 1]
    orow = O[idx].copy()
    if W > L:
        orow[-1] = 0.0
    number = bi + 1
    for (f0, f1, x, y) in fold:
        if f0 <= number <= f1:
            row[row == x] = y
    if any(f0 <= number <= f1 for f0, f1 in tacet):
        row[:] = 0
    rows.append(row)
    orows.append(orow)
    raw_of.append(idx)

def sal_at(bi, s, p):
    return V[raw_of[bi][s], p - p_lo] if p else 0.0

# One-slot misreadings, first kind: the octave of the note next to it.
def neighbours(bi, sl):
    row = rows[bi]
    left = int(row[sl - 1]) if sl > 0 else (int(rows[bi - 1][-1]) if bi > 0 else 0)
    right = int(row[sl + 1]) if sl + 1 < len(row) else (int(rows[bi + 1][0]) if bi + 1 < n_bars else 0)
    return left, right

for bi, row in enumerate(rows):
    for sl in range(len(row)):
        p = int(row[sl])
        if not p:
            continue
        left, right = neighbours(bi, sl)
        if left == p or right == p:
            continue
        for q in (left, right):
            if q and abs(p - q) == 12 and sal_at(bi, sl, q) >= 0.3 * sal_at(bi, sl, p):
                row[sl] = q
                break

# Bars that agree in most slots become equal where the bar's own sound allows it.
SNAP = cfg.get('snap', 0.7)
groups = {}
for bi, row in enumerate(rows):
    groups.setdefault(len(row), []).append(bi)
snapped = 0
stable = [np.zeros(len(r), dtype=bool) for r in rows]   # slots where the similar bars agree
for L, idx in groups.items():
    R = np.array([rows[i] for i in idx])
    OR = np.array([orows[i] for i in idx])
    agree = (R[:, None, :] == R[None, :, :]).mean(axis=2)
    newR, newO = R.copy(), OR.copy()
    for r, bi in enumerate(idx):
        if (R[r] == 0).all():
            continue
        g = np.where(agree[r] >= SNAP)[0]
        if len(g) < 3:
            continue
        newO[r] = OR[g].mean(axis=0)
        for sl in range(L):
            vals, counts = np.unique(R[g, sl], return_counts=True)
            k = int(counts.argmax())
            m = int(vals[k])
            if counts[k] * 2 <= len(g):
                continue
            stable[bi][sl] = True
            if m == R[r, sl]:
                continue
            own = int(R[r, sl])
            if m == 0:
                continue
            if own == 0 or sal_at(bi, sl, m) >= 0.4 * sal_at(bi, sl, own):
                newR[r, sl] = m
                snapped += 1
    for r, bi in enumerate(idx):
        rows[bi] = newR[r]
        orows[bi] = newO[r]

# One-slot misreadings, second kind: a slot that the similar bars do not agree on, within a whole tone
# of the next note (a slide into it, or its attack misread) or of the two equal notes around it.
merged_slots = 0
for bi, row in enumerate(rows):
    for sl in range(len(row)):
        p = int(row[sl])
        if not p or stable[bi][sl]:
            continue
        left, right = neighbours(bi, sl)
        if left == p or right == p:
            continue
        lone = not stable[bi].any()          # a bar without similar bars: only clear cases
        reach, need = (1, 0.8) if lone else (2, 0.5)
        if right and abs(p - right) <= reach and sal_at(bi, sl, right) >= need * sal_at(bi, sl, p):
            row[sl] = right
            merged_slots += 1
        elif left and left == right and abs(p - left) <= reach and sal_at(bi, sl, left) >= need * sal_at(bi, sl, p):
            row[sl] = left
            merged_slots += 1

def main_pitch(values):
    vals = [int(x) for x in values if x]
    if len(vals) * 2 < len(values):
        return 0
    best, best_support = 0, -1
    for p in sorted(set(vals)):
        support = sum(1 for x in vals if x - p in (0, 12, 19, 24))
        if support > best_support:
            best, best_support = p, support
    return best

forced_on = [np.zeros(len(r), dtype=bool) for r in rows]   # slots that start a note whatever the onsets say
held = [np.zeros(len(r), dtype=bool) for r in rows]        # slots that never start a note
for f0, f1 in cfg.get('whole', []):
    for bi in range(f0 - 1, min(f1, n_bars)):
        p = main_pitch(rows[bi])
        rows[bi][:] = p
        held[bi][1:] = True
        forced_on[bi][0] = True
for f0, f1, unit in cfg.get('pedal', []):
    for bi in range(f0 - 1, min(f1, n_bars)):
        for a0 in range(0, len(rows[bi]), unit):
            rows[bi][a0:a0 + unit] = main_pitch(rows[bi][a0:a0 + unit])
        forced_on[bi][:] = True

# Notes per bar: [slot in bar, slots, midi, tie]
notes_by_bar = []
prev_pitch = 0
for bi, row in enumerate(rows):
    out = []
    for sl in range(len(row)):
        p = int(row[sl])
        if p == 0:
            prev_pitch = 0
            continue
        new = (p != prev_pitch or orows[bi][sl] >= ON or forced_on[bi][sl]) and not (held[bi][sl] and p == prev_pitch)
        if not new and out and out[-1][0] + out[-1][1] == sl:
            out[-1][1] += 1
        elif not new and sl == 0:
            out.append([0, 1, p, True])   # goes on over the bar line
        else:
            out.append([sl, 1, p, False])
        prev_pitch = p
    notes_by_bar.append(out)

# String and fret: a path through the positions with the least hand movement.
def positions(p):
    return [(si + 1, p - open_) for si, open_ in enumerate(tuning) if 0 <= p - open_ <= 15]

# The analyst's choice of string for a pitch, where the easiest path is not how the part is played.
place = [(a, b, NOTE_NAMES.index(x[:-1]) + 12 * (int(x[-1]) + 1), string, fret) for a, b, x, string, fret in cfg.get('place', [])]
for a, b, p, string, fret in place:
    if not 1 <= string <= len(tuning) or tuning[string - 1] + fret != p:
        raise SystemExit(f'place: {name(p)} is not fret {fret} of string {string}')

def placed(bi, p):
    return [(string, fret) for a, b, q, string, fret in place if a <= bi + 1 <= b and q == p][:1]

flat = [(bi, k) for bi, out in enumerate(notes_by_bar) for k in range(len(out))]
cost_prev, back = None, []
opts_all = []
for (bi, k) in flat:
    p = notes_by_bar[bi][k][2]
    opts = placed(bi, p) or positions(p) or [(1, max(0, p - tuning[0]))]
    opts_all.append(opts)
    base = np.array([0.15 * f + (0.0 if f else 0.3) for (_, f) in opts])
    if cost_prev is None:
        cost_prev = base
        back.append(np.zeros(len(opts), dtype=int))
        continue
    prev_opts = opts_all[-2]
    c = np.zeros((len(prev_opts), len(opts)))
    for x, (s0, f0) in enumerate(prev_opts):
        for y, (s1, f1) in enumerate(opts):
            move = 0.0 if f0 == 0 or f1 == 0 else abs(f1 - f0)
            c[x, y] = cost_prev[x] + move + 0.2 * abs(s1 - s0)
    back.append(c.argmin(axis=0))
    cost_prev = c.min(axis=0) + base
choice = []
if flat:
    j = int(cost_prev.argmin())
    for i in range(len(flat) - 1, -1, -1):
        choice.append(opts_all[i][j])
        j = int(back[i][j])
    choice.reverse()
for (bi, k), (string, fret) in zip(flat, choice):
    notes_by_bar[bi][k] += [string, fret]

# Tempo: the bar's own tempo, written when it leaves the current marking by more than 4 %.
bar_t = np.array([t[a] for a, L in bars] + [t[min(bars[-1][0] + bars[-1][1], n_slots)]])
quarters = np.array([len(r) / spq for r in rows])
bpm_bar = 60 * quarters / np.diff(bar_t)
med = np.array([np.median(bpm_bar[max(0, i - 3):i + 4]) for i in range(n_bars)])
cur = round(float(np.median(med[:8])))
marks = [cur]
for i in range(1, n_bars):
    if abs(med[i] - cur) / cur > 0.04:
        cur = round(float(med[i]))
    marks.append(cur)

def ts_of(L):
    if spq == 4:
        for den, unit in ((4, 4), (8, 2), (16, 1)):
            if L % unit == 0:
                return [L // unit, den]
    if spq == 2:
        return [L // 2, 4] if L % 2 == 0 else [L, 8]
    if spq == 3:
        if L % 3 == 0:
            return [L // 3, 4]
    raise SystemExit(f'A bar of {L} slots has no time signature at {spq} slots per quarter')

SCALE = 2 if spq == 2 else 1   # eighth-note slots are written on the sixteenth grid
OUT_DIV = 4 if spq == 2 else spq
out_bars = []
sections = {int(k): x for k, x in cfg.get('sections', {}).items()}
for bi, (a, L) in enumerate(bars):
    entry = {'ts': ts_of(len(rows[bi])), 'div': OUT_DIV, 'bpm': marks[bi], 'notes': [{'s': s * SCALE, 'd': dur * SCALE, 'string': string, 'fret': fret, **({'tie': True} if tie else {})} for s, dur, p, tie, string, fret in notes_by_bar[bi]]}
    if bi + 1 in sections:
        entry['section'] = sections[bi + 1]
    out_bars.append(entry)
dump(f'{d}/notes.json', {'title': cfg['title'], 'artist': cfg['artist'], 'album': cfg.get('album', ''), 'notices': cfg.get('notices', ''), 'trackName': cfg['trackName'], 'tuning': tuning, 'bpm': marks[0], 'bars': out_bars})
TICKS = {4: 240, 2: 480, 3: 320}[spq]
anchors = []
for i, (a, L) in enumerate(bars):
    anchors.append({'bar': i + 1, 'ms': int(round(bar_t[i] * 1000))})
    W = len(rows[i])
    if W != L:
        k = min(W, L) - 1   # the slot that is stretched or squeezed
        anchors.append({'bar': i + 1, 'tick': k * TICKS, 'ms': int(round(float(t[a + k]) * 1000))})
dump(f'{d}/anchors.json', {'anchors': anchors})
n_notes = sum(1 for out in notes_by_bar for x in out if not x[3])
print(f'{n_bars} bars, {n_notes} notes, {dropped} slots an octave down, {filled} unclear slots filled, {snapped} slots snapped, {merged_slots} merged, {bar_t[0]:.2f}-{bar_t[-1]:.2f} s, tempo {min(marks)}-{max(marks)} BPM ({len(set(marks))} markings), bars with friends {sum(1 for f in friends if f)}')

if show:
    for bi in range(show[0] - 1, min(show[1], n_bars)):
        a, L = bars[bi]
        W = len(rows[bi])
        cells = ['-'] * W
        for sl, dur, p, tie, string, fret in notes_by_bar[bi]:
            cells[sl] = ('~' if tie else '') + name(p)
            for x in range(sl + 1, sl + dur):
                cells[x] = '.'
        grp = '|'.join(''.join(f'{c:5s}' for c in cells[i:i + spq]) for i in range(0, W, spq))
        print(f'{bi + 1:4d} {int(t[a] // 60)}:{t[a] % 60:05.2f} {marks[bi]:3d} {grp}  f{len(friends[bi])}' + ('' if W == L else f'  ({L} grid slots)'))
