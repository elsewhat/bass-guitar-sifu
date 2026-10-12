# Show the slot grid bar by bar, and how well each bar matches the bar before it when that one is
# shifted by a few slots (a shift that fits better than 0 means the bar lines have slipped there).
#   bars.py <dir> <first slot> <slots per bar> [from_s] [to_s] [group]
# Cells: note name, "." = same pitch going on without a new onset, "-" = no note.
# After the row: the kick (K) and snare (S) strength per slot, 0-9, and the best shift.
import sys
from rwlib import *

d = sys.argv[1]
first, spb = int(sys.argv[2]), int(sys.argv[3])
t0 = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0
t1 = float(sys.argv[5]) if len(sys.argv) > 5 else 1e9
group = int(sys.argv[6]) if len(sys.argv) > 6 else 4
S = np.load(f'{d}/slots.npz')
t, v, raw, on = S['t'], S['v'], S['raw'], S['on']
kick, snare = S['kick'], S['snare']
n = len(raw)
vn = v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)

def sim(a, b, length):
    if a < 0 or b < 0 or a + length > n or b + length > n:
        return -1.0
    return float((vn[a:a + length] * vn[b:b + length]).sum() / length)

bar = 0
for a in range(first, n - spb + 1, spb):
    bar += 1
    if t[a] < t0 or t[a] > t1:
        continue
    cells = []
    for i in range(a, a + spb):
        p = int(raw[i])
        prev = int(raw[i - 1]) if i > 0 else -1
        if p == 0:
            txt = '-'
        elif p == prev and on[i] < 0.35:
            txt = '.'
        else:
            txt = name(p)
        cells.append(f'{txt:4s}')
    grp = '|'.join(''.join(cells[i:i + group]) for i in range(0, spb, group))
    kk = ''.join('%d' % min(9, int(k * 9)) for k in kick[a:a + spb])
    sn = ''.join('%d' % min(9, int(s * 9)) for s in snare[a:a + spb])
    sh = {dl: sim(a, a - spb + dl, spb) for dl in range(-4, 5)}
    best = max(sh, key=sh.get)
    note = '' if best == 0 or sh[best] < sh[0] + 0.08 else f'  shift {best:+d} ({sh[best]:.2f} vs {sh[0]:.2f})'
    print(f'{bar:4d} {int(t[a] // 60)}:{t[a] % 60:05.2f} {grp}  K {kk} S {sn}{note}')
