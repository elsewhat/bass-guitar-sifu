# Beat grid of a recording from its stems.
#   grid.py <dir> <bpm_lo> <bpm_hi> [tight] [segments.json]
# 1. Onset strength of the drum stem, the bass stem and the mix (5 ms steps).
# 2. The beat period over time: the autocorrelation peak inside [bpm_lo, bpm_hi] per 8 s window,
#    made continuous with a Viterbi pass.
# 3. Beats by dynamic programming (Ellis 2007) with that period.
# Writes <dir>/beats.json: { beats: [s], period: [s per beat] } and prints a summary per 20 s.
# segments.json (optional): [[from_s, to_s, bpm_lo, bpm_hi], ...] overrides the range in parts of the track.
import sys
from rwlib import *

d = sys.argv[1]
lo_bpm, hi_bpm = float(sys.argv[2]), float(sys.argv[3])
tight = float(sys.argv[4]) if len(sys.argv) > 4 else 200.0
segs = read(sys.argv[5]) if len(sys.argv) > 5 else []

sr, drums = load_mono(f'{d}/drums.wav')
_, bass = load_mono(f'{d}/bass.wav')
_, mix = load_mono(f'{d}/mix.wav')
n = min(len(drums), len(bass), len(mix))
e_d = onset_env(drums[:n])
e_b = onset_env(bass[:n], hi=4000)
e_m = onset_env(mix[:n])
# The drum stem only counts where the drums play.
k = int(2.0 * ENV_FPS)
frame_rms = lambda x: np.sqrt(np.convolve(np.square(signal.resample_poly(x, 1, ENV_HOP)), np.ones(k) / k, mode='same'))
w_d = frame_rms(drums[:n])
w_d = np.clip(w_d / (np.percentile(w_d, 90) + 1e-9), 0, 1)[:len(e_d)]
w_d = np.pad(w_d, (0, max(0, len(e_d) - len(w_d))), mode='edge')
env = (0.6 * w_d * e_d + 0.25 * e_b + 0.15 * e_m + 0.45 * (1 - w_d) * e_m).astype(np.float32)
env = env / env.std()
N = len(env)

HOP_S = 1.0
cent, lags, T = tempogram(env, win=8.0, hop=HOP_S, lag_lo=60 / 520, lag_hi=60 / 30)
# Viterbi over windows: states are lags inside the allowed range.
score = np.full(T.shape, -1e9)
for i, c in enumerate(cent):
    a, b = lo_bpm, hi_bpm
    for s in segs:
        if s[0] <= c < s[1]:
            a, b = s[2], s[3]
    ok = (lags >= 60 / b) & (lags <= 60 / a)
    score[i, ok] = T[i, ok]
loglag = np.log(lags)
PEN = 40.0  # per (log period change)^2 per window step
D = score[0].copy()
bp = np.zeros(T.shape, dtype=np.int32)
# transition restricted to +-6 % per step for speed
for i in range(1, len(cent)):
    best = np.full(len(lags), -1e18)
    arg = np.zeros(len(lags), dtype=np.int32)
    for j in range(len(lags)):
        if score[i, j] < -1e8:
            continue
        a = np.searchsorted(lags, lags[j] * 0.94)
        b = np.searchsorted(lags, lags[j] * 1.06)
        cand = D[a:b] - PEN * (loglag[a:b] - loglag[j]) ** 2 * 100
        if len(cand) == 0:
            continue
        q = int(cand.argmax())
        best[j] = cand[q] + score[i, j]
        arg[j] = a + q
    # allow a free jump when the allowed range moves away (segment change)
    if best.max() < -1e17:
        best = score[i] + D.max()
        arg[:] = int(D.argmax())
    D = best
    bp[i] = arg
j = int(D.argmax())
path = np.zeros(len(cent), dtype=np.int32)
for i in range(len(cent) - 1, -1, -1):
    path[i] = j
    j = bp[i, j]
period_w = lags[path]
period = np.interp(np.arange(N) / ENV_FPS, cent, period_w)

beats = track_beats(env, period, tight=tight)
beats_s = smooth_grid(beats, 2)
per = np.gradient(beats_s)
dump(f'{d}/beats.json', {'beats': [round(float(b), 4) for b in beats_s], 'raw': [round(float(b), 4) for b in beats]})
np.save(f'{d}/env.npy', env)

print(f'{len(beats)} beats, {beats[0]:.2f} .. {beats[-1]:.2f} s, median {60 / np.median(np.diff(beats)):.1f} BPM')
# Contrast: envelope at the beats against the envelope between them, and at the 16ths.
def at(times):
    idx = np.clip(np.round(np.asarray(times) * ENV_FPS).astype(int), 0, N - 1)
    # the maximum within +-20 ms
    w = int(0.02 * ENV_FPS)
    m = maximum_filter1d(env, 2 * w + 1)
    return m[idx]
mid = (beats_s[:-1] + beats_s[1:]) / 2
q1 = beats_s[:-1] + np.diff(beats_s) / 4
q3 = beats_s[:-1] + 3 * np.diff(beats_s) / 4
t3a = beats_s[:-1] + np.diff(beats_s) / 3
t3b = beats_s[:-1] + 2 * np.diff(beats_s) / 3
ev = {'beat': at(beats_s[:-1]), 'and': at(mid), 'e': at(q1), 'a': at(q3), 'tr1': at(t3a), 'tr2': at(t3b)}
STEP = 20.0
print(' time    BPM   beat  and    e     a    tr1   tr2   (onset strength at the beat and inside it)')
for a in np.arange(0, beats_s[-1], STEP):
    sel = (beats_s[:-1] >= a) & (beats_s[:-1] < a + STEP)
    if sel.sum() < 2:
        continue
    bpm = 60 / np.median(per[:-1][sel])
    print(f'{int(a // 60):2d}:{a % 60:04.1f} {bpm:6.1f}  ' + ' '.join(f'{ev[key][sel].mean():5.2f}' for key in ('beat', 'and', 'e', 'a', 'tr1', 'tr2')))
