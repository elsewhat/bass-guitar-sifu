# Pitch track of the lowest voice of a recording.
#   pitch.py <dir> [lowest MIDI note, default 28 = E1]
# Signal: the Demucs stems "bass" + "other" (drums and vocals removed; Demucs files a distorted bass
# under either). Per 10 ms frame, a 109 ms window:
#   - the spectrum on a 10-cent grid, 25-1400 Hz;
#   - for every semitone from the lowest note up to C4: the harmonic sum of its first six partials,
#     each counted by how near the spectral peak lies to where the partial should be,
#     kept only where the fundamental itself is a spectral peak (a note an octave below a root-fifth
#     pair has no fundamental; a bass note under a guitar an octave up has one);
#   - a Viterbi pass over pitch and "no note".
# Writes <dir>/pitch.npz: times, midi (0 = no note), sal (frames x semitones), level (dB of the
# 30-330 Hz band), flux (onset strength of that band), p_lo.
import sys
from rwlib import *

d = sys.argv[1]
P_LO = int(sys.argv[2]) if len(sys.argv) > 2 else 28
P_HI = 60
sr0, xb = load_mono(f'{d}/bass.wav')
_, xo = load_mono(f'{d}/other.wav')
n = min(len(xb), len(xo))
SR = 5512.5
x = signal.resample_poly(xb[:n] + xo[:n], 1, 4).astype(np.float32)
L, HOP, NFFT = 600, 55, 16384
n_frames = (len(x) - L) // HOP
times = (np.arange(n_frames) * HOP + L / 2) / SR
pitches = np.arange(P_LO, P_HI + 1)
win = np.hanning(L)
freqs = np.fft.rfftfreq(NFFT, 1 / SR)
DF = freqs[1]

# 10-cent grid from 25 Hz
CENT0 = 1200 * np.log2(25.0 / 440.0)
N_LOG = int((1200 * np.log2(1400.0 / 440.0) - CENT0) / 10) + 1
grid_hz = 440.0 * 2 ** ((CENT0 + 10 * np.arange(N_LOG)) / 1200)
edges = 440.0 * 2 ** ((CENT0 + 10 * (np.arange(N_LOG + 1) - 0.5)) / 1200)
bin_lo = np.searchsorted(freqs, edges[:-1])
bin_hi = np.maximum(np.searchsorted(freqs, edges[1:]), bin_lo + 1)


def to_log(mag):
    """Magnitude spectra (frames x bins) on the 10-cent grid: the largest bin in each cell."""
    out = np.zeros((mag.shape[0], N_LOG), dtype=np.float32)
    for i in range(N_LOG):
        out[:, i] = mag[:, bin_lo[i]:bin_hi[i]].max(axis=1)
    return out


def cell(hz):
    return int(round((1200 * np.log2(hz / 440.0) - CENT0) / 10))


W_H = np.array([1.0, 0.9, 0.7, 0.5, 0.35, 0.25])
HALF = 4  # +-40 cents around each partial, for its strength
SEARCH = 7  # +-70 cents: where to look for the partial's peak
NEAR = np.exp(-0.5 * (np.arange(-SEARCH, SEARCH + 1) / 3.0) ** 2)  # a peak 30 cents off counts 0.6
sal = np.zeros((n_frames, len(pitches)), dtype=np.float32)
fund = np.zeros((n_frames, len(pitches)), dtype=np.float32)
level = np.zeros(n_frames, dtype=np.float32)
flux = np.zeros(n_frames, dtype=np.float32)
band = (freqs >= 30) & (freqs <= 330)
prev_log = None
CH = 2048
for a in range(0, n_frames, CH):
    b = min(n_frames, a + CH)
    idx = (np.arange(a, b) * HOP)[:, None] + np.arange(L)[None, :]
    fr = x[idx] * win[None, :]
    mag = np.abs(np.fft.rfft(fr, NFFT, axis=1)).astype(np.float32)
    level[a:b] = 10 * np.log10((mag[:, band] ** 2).sum(axis=1) + 1e-9)
    lg = to_log(mag)
    # onset strength of the low band: rise of the compressed spectrum, 30-330 Hz
    comp = np.log1p(30 * lg[:, cell(30):cell(330)] / (np.percentile(lg, 99) + 1e-9))
    full = comp if prev_log is None else np.concatenate([prev_log, comp])
    df = np.maximum(full[2:] - full[:-2], 0).sum(axis=1) if len(full) > 2 else np.zeros(0)
    if prev_log is None:
        flux[a + 2:b] = df
    else:
        flux[a:b] = df[:b - a]
    prev_log = comp[-2:]
    norm = lg[:, cell(30):cell(700)].max(axis=1) + 1e-9
    # Peaks only: a cell that is the largest within 30 cents to either side. The window's main lobe
    # is 18 Hz wide to either side, several semitones in this register, so the height of the
    # spectrum near a partial says little about the semitone; the place of the peak does.
    pk = lg.copy()
    for k in (1, 2, 3):
        pk[:, k:][lg[:, k:] < lg[:, :-k]] = 0
        pk[:, :-k][lg[:, :-k] < lg[:, k:]] = 0
    for i, p in enumerate(pitches):
        f0 = midi_hz(p)
        amps, sharp = [], []
        for h in range(1, 7):
            c = cell(f0 * h)
            if c + SEARCH >= N_LOG:
                amps.append(np.zeros(b - a, dtype=np.float32))
                sharp.append(np.zeros(b - a, dtype=np.float32))
                continue
            amps.append(lg[:, c - HALF:c + HALF + 1].max(axis=1) / norm)
            sharp.append((pk[:, c - SEARCH:c + SEARCH + 1] * NEAR[None, :]).max(axis=1) / norm)
        amps, sharp = np.array(amps), np.array(sharp)  # 6 x frames
        # Is the fundamental a peak of its own? Compare with the spectrum 20 Hz below and above.
        k_lo, k_hi = int(round((f0 - 20) / DF)), int(round((f0 + 20) / DF))
        side = mag[:, k_hi - 2:k_hi + 3].max(axis=1)
        if f0 - 20 > 27:
            side = np.maximum(side, mag[:, k_lo - 2:k_lo + 3].max(axis=1))
        side = side / norm
        a1 = amps[0]
        peak = np.clip((a1 - side) / (a1 + 1e-9) * 2.5, 0, 1)          # 1 when the sides are 40 % lower
        rel = np.clip((a1 / (np.maximum(amps[1], amps[2]) + 1e-9) - 0.07) / 0.08, 0, 1)  # fundamental against partials 2 and 3
        g = peak * rel
        sal[a:b, i] = g * (W_H[:, None] * sharp).sum(axis=0)
        fund[a:b, i] = a1

loud = np.percentile(level, 95)
print(f'frames {n_frames}, loud level {loud:.1f} dB')
# Viterbi: states = pitches + "no note".
emit = sal.astype(np.float64).copy()
emit += 0.006 * (P_HI - pitches)[None, :] * (sal > 0.3)   # of two readings, the lower voice
emit[level < loud - 35] *= 0.3
REST = 0.9
obs = np.concatenate([emit, np.full((n_frames, 1), REST)], axis=1)
n_s = obs.shape[1]
dp = np.abs(pitches[:, None] - pitches[None, :]).astype(np.float64)
T = np.full((n_s, n_s), -0.6)
T[:-1, :-1] = -(0.6 + 0.03 * np.minimum(dp, 12))
np.fill_diagonal(T, 0.0)
D = obs[0].copy()
bp = np.zeros((n_frames, n_s), dtype=np.int16)
for t in range(1, n_frames):
    m = D[:, None] + T
    bp[t] = m.argmax(axis=0)
    D = m.max(axis=0) + obs[t]
j = int(D.argmax())
path = np.zeros(n_frames, dtype=np.int16)
for t in range(n_frames - 1, -1, -1):
    path[t] = j
    j = bp[t, j]
midi = np.where(path < len(pitches), pitches[np.minimum(path, len(pitches) - 1)], 0).astype(np.int16)
flux = flux / (np.percentile(flux, 99) + 1e-9)
np.savez_compressed(f'{d}/pitch.npz', times=times.astype(np.float32), midi=midi, sal=sal, fund=fund, level=level, flux=flux, p_lo=P_LO)
voiced = midi > 0
print(f'voiced {voiced.mean() * 100:.0f} % of frames')
vals, counts = np.unique(midi[voiced], return_counts=True)
print('pitch histogram (frames): ' + '  '.join(f'{name(v)}:{c}' for v, c in zip(vals, counts) if c > voiced.sum() * 0.004))
