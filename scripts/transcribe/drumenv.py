# Kick, snare and cymbal onset strength from the drum stem, at 5 ms steps.
#   drumenv.py <dir>
# kick: rise of the 40-110 Hz band. snare: rise of the 150-400 Hz band where the 2-8 kHz band rises
# too and the low band does not dominate. hat: rise of the 6-10 kHz band.
import sys
from rwlib import *

d = sys.argv[1]
sr, x = load_mono(f'{d}/drums.wav')
f, t, Z = signal.stft(x, fs=sr, window='hann', nperseg=512, noverlap=512 - ENV_HOP, boundary='zeros', padded=True)
mag = np.abs(Z)

def rise(lo, hi):
    e = np.sqrt((mag[(f >= lo) & (f <= hi)] ** 2).sum(axis=0))
    de = np.maximum(e[2:] - e[:-2], 0)
    de = np.concatenate([[0, 0], de])
    return gaussian_filter1d(de, 1.0)

low, mid, high, top = rise(40, 110), rise(150, 400), rise(2000, 8000), rise(6000, 10000)
norm = lambda v: v / (np.percentile(v, 99.5) + 1e-9)
low, mid, high, top = norm(low), norm(mid), norm(high), norm(top)
snare = np.sqrt(mid * high) * np.clip(1.2 - low / (mid + 1e-3), 0, 1)
np.savez_compressed(f'{d}/drumenv.npz', kick=low.astype(np.float32), snare=norm(snare).astype(np.float32), hat=top.astype(np.float32))
print(d, len(low), 'frames')
