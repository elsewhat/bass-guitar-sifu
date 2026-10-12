# How strongly does the lowest voice (and the drum pattern) repeat after n slots, in a stretch of the recording?
#   period.py <dir> <from_s> <to_s> [max lag]
import sys
from rwlib import *
d, t0, t1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
mx = int(sys.argv[4]) if len(sys.argv) > 4 else 40
S = np.load(f'{d}/slots.npz')
t, v, kick, snare = S['t'], S['v'].astype(np.float64), S['kick'], S['snare']
vn = v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)
a, b = int(np.searchsorted(t, t0)), int(np.searchsorted(t, t1))
dr = np.stack([kick, snare], axis=1).astype(np.float64)
dr = dr - dr[a:b].mean(axis=0)
out = []
for lag in range(1, mx + 1):
    s = float((vn[a:b - lag] * vn[a + lag:b]).sum(axis=1).mean())
    c = float((dr[a:b - lag] * dr[a + lag:b]).sum() / ((dr[a:b] ** 2).sum() + 1e-9))
    out.append((lag, s, c))
print('lag: pitch similarity / drum similarity')
print('  '.join(f'{lag}:{s:.2f}/{c:+.2f}' for lag, s, c in out))
best = sorted(out, key=lambda x: -x[1])[:6]
print('best pitch lags:', [(l, round(s, 2)) for l, s, c in best], ' best drum lags:', [(l, round(c, 2)) for l, s, c in sorted(out, key=lambda x: -x[2])[:6]])
