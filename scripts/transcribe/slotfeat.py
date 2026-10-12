# Features per grid slot (a slot is 1/div of a tracked pulse).
#   slotfeat.py <dir> <div per pulse>
# Writes <dir>/slots.npz: t (slot start, one more than slots), v (slots x semitones: mean salience of
# the slot's steady part), f (the same for the strength of the fundamental alone), raw (MIDI, 0 = none), on (onset strength of the low band at the slot start),
# lvl (dB), kick, snare, hat (drum stem at the slot start), p_lo, div.
import sys
from rwlib import *

d, div = sys.argv[1], int(sys.argv[2])
beats = np.array(read(f'{d}/beats.json')['beats'])
P = np.load(f'{d}/pitch.npz')
times, sal, fund, flux, level, p_lo = P['times'], P['sal'], P['fund'], P['flux'], P['level'], int(P['p_lo'])
D = np.load(f'{d}/drumenv.npz')

t = []
for b in range(len(beats) - 1):
    for s in range(div):
        t.append(beats[b] + (beats[b + 1] - beats[b]) * s / div)
t.append(beats[-1])
t = np.array(t)
n = len(t) - 1
v = np.zeros((n, sal.shape[1]), dtype=np.float32)
f = np.zeros((n, sal.shape[1]), dtype=np.float32)
on = np.zeros(n, dtype=np.float32)
lvl = np.zeros(n, dtype=np.float32)
drum = {k: np.zeros(n, dtype=np.float32) for k in ('kick', 'snare', 'hat')}
for i in range(n):
    a, e = t[i], t[i + 1]
    ia, ie = int(np.searchsorted(times, a + 0.2 * (e - a))), int(np.searchsorted(times, e - 0.1 * (e - a)))
    ie = max(ie, ia + 1)
    v[i] = sal[ia:ie].mean(axis=0)
    f[i] = fund[ia:ie].mean(axis=0)
    lvl[i] = level[ia:ie].mean()
    io = int(np.searchsorted(times, a))
    on[i] = flux[max(0, io - 3):io + 4].max()
    j = int(round(a * ENV_FPS))
    for k in drum:
        drum[k][i] = D[k][max(0, j - 6):j + 7].max()
loud = np.percentile(lvl, 95)
pitches = p_lo + np.arange(sal.shape[1])
score = v + 0.006 * (pitches.max() - pitches)[None, :] * (v > 0.3)
raw = pitches[score.argmax(axis=1)]
raw[(v.max(axis=1) < 0.45) | (lvl < loud - 30)] = 0
np.savez_compressed(f'{d}/slots.npz', t=t, v=v, f=f, raw=raw.astype(np.int16), on=on, lvl=lvl, p_lo=p_lo, div=div, loud=loud, **drum)
print(f'{d}: {n} slots, {100 * (raw > 0).mean():.0f} % with a note')
