# One line per 8 bars: the main pitch of every bar (the reading with the most support among its slots,
# counting readings at its partials 2, 3 and 4), "-" for a bar that is mostly without a note, and
# the level of the low band.
#   roots.py <dir> <first slot> <slots per bar> [bars per line] [lowest midi]
import sys
from rwlib import *
d = sys.argv[1]
first, spb = int(sys.argv[2]), int(sys.argv[3])
per = int(sys.argv[4]) if len(sys.argv) > 4 else 8
lowest = int(sys.argv[5]) if len(sys.argv) > 5 else 24
S = np.load(f'{d}/slots.npz')
t, raw, lvl, f, p_lo, loud = S['t'], S['raw'].astype(int), S['lvl'], S['f'], int(S['p_lo']), float(S['loud'])
kick, snare = S['kick'], S['snare']
# the octave rule of transcribe.py
for i in range(len(raw)):
    p = raw[i]
    while p and p - 12 >= lowest and f[i, p - 12 - p_lo] > 0.12 * f[i, p - p_lo]:
        p -= 12
    raw[i] = p
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
line = []
n = len(raw)
bar = 0
for a in range(first, n - spb + 1, spb):
    bar += 1
    p = main_pitch(raw[a:a + spb])
    drums = 'd' if kick[a:a + spb].mean() + snare[a:a + spb].mean() > 0.35 else ' '
    line.append(f'{name(p) if p else "-":4s}{drums}')
    if len(line) == per:
        a0 = a - (per - 1) * spb
        print(f'{bar - per + 1:4d} {int(t[a0] // 60):2d}:{t[a0] % 60:04.1f} {lvl[a0:a + spb].mean() - loud:5.0f} dB  ' + ' '.join(line))
        line = []
