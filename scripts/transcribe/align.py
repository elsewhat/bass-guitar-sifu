# Propose bar lines that keep repeated material on the same place in the bar.
#   align.py <dir> <first slot of bar 1> <slots per bar> [penalty] [max shift] [end slot] [pickup slots]
# With pickup slots, bar 1 is a short bar of that length and the regular bars start after it.
# Bar by bar: the next bar may start up to <max shift> slots early or late. For each choice, how well
# does that bar match the best-matching bar already placed? A shifted start must beat the regular
# one by the penalty. A shift makes the bar before it shorter or longer.
# Prints the bars of another length, as the "odd" entry for the config.
import sys
from rwlib import *

d = sys.argv[1]
start, spb = int(sys.argv[2]), int(sys.argv[3])
pen = float(sys.argv[4]) if len(sys.argv) > 4 else 0.10
max_shift = int(sys.argv[5]) if len(sys.argv) > 5 else spb // 2
S = np.load(f'{d}/slots.npz')
t, v = S['t'], S['v'].astype(np.float64)
n = len(v)
end = min(n, int(sys.argv[6])) if len(sys.argv) > 6 else n
vn = v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)

pickup = int(sys.argv[7]) if len(sys.argv) > 7 else 0
starts = [start + pickup]
flat = [vn[start + pickup:start + pickup + spb].reshape(-1)]
notes = []
shift_no = 1 if pickup else 0
while True:
    regular = starts[-1] + spb
    if regular + spb > end:
        break
    M = np.array(flat[-64:])
    best = {}
    for dl in range(-max_shift, max_shift + 1):
        a = regular + dl
        if a + 2 * spb > end or a <= starts[-1] + 3:
            continue
        # the bar at this start and the one after it, each against its best match so far
        m0 = float((M @ vn[a:a + spb].reshape(-1)).max() / spb)
        m1 = float((M @ vn[a + spb:a + 2 * spb].reshape(-1)).max() / spb)
        best[dl] = (m0 + m1) / 2
    if not best:
        break
    reg = best.get(0, -1)
    top = max(best, key=lambda k: best[k] - (pen * 1.5 if abs(k) * 2 == spb else pen if k else 0))
    choice = top if top and best[top] - (pen * 1.5 if abs(top) * 2 == spb else pen) >= reg else 0
    if choice:
        notes.append((len(starts) + shift_no, spb + choice, best[top], reg))
    starts.append(regular + choice)
    flat.append(vn[regular + choice:regular + choice + spb].reshape(-1))
print(f'{len(starts) + shift_no} bars; bars of another length:')
for bar, length, s_new, s_reg in notes:
    a = starts[bar - 1 - shift_no]
    print(f'  bar {bar:4d} at {int(t[a] // 60)}:{t[a] % 60:05.2f}: {length} slots  (match {s_new:.2f} against {s_reg:.2f} without)')
if pickup:
    notes.insert(0, (1, pickup, 0, 0))
print('"odd": {' + ', '.join(f'"{bar}": {length}' for bar, length, _, _ in notes) + '}')
