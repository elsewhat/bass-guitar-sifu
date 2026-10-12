# Fold the slot grid over a cycle: mean kick, snare and bass onset strength, and the commonest pitches per position.
#   sfold.py <dir> <first slot> <cycle slots> <from_s> <to_s>
import sys
from rwlib import *
d = sys.argv[1]
first, cyc, t0, t1 = int(sys.argv[2]), int(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
S = np.load(f'{d}/slots.npz')
t, raw, on, kick, snare, hat = S['t'], S['raw'].astype(int), S['on'], S['kick'], S['snare'], S['hat']
rows = [a for a in range(first, len(raw) - cyc, cyc) if t0 <= t[a] < t1]
print(f'{len(rows)} cycles of {cyc} slots')
print('        ' + ''.join(f'{i + 1:>6}' for i in range(cyc)))
for label, arr in (('kick', kick), ('snare', snare), ('cymbal', hat), ('bass on', on)):
    print(f'{label:8s}' + ''.join(f'{np.mean([arr[a + i] for a in rows]):6.2f}' for i in range(cyc)))
for rank in range(2):
    line = []
    for i in range(cyc):
        vals, counts = np.unique([raw[a + i] for a in rows], return_counts=True)
        order = np.argsort(counts)[::-1]
        if rank < len(order):
            v, c = vals[order[rank]], counts[order[rank]]
            line.append(f'{(name(v) if v else "-") + ":" + str(int(100 * c / len(rows))):>6}')
        else:
            line.append(f'{"":>6}')
    print(f'pitch {rank + 1} ' + ''.join(line))
