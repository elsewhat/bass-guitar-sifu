# Tempo over time: the strongest autocorrelation lags of the onset envelope, window by window.
#   tempo.py <wav> [step seconds] [wav2 ...]
import sys
from rwlib import *

step = float(sys.argv[2]) if len(sys.argv) > 2 else 10.0
sr, x = load_mono(sys.argv[1])
env = onset_env(x)
cent, lags, T = tempogram(env, win=12.0, hop=step)
rms_fps = 10
k = sr // rms_fps
rms = np.sqrt((x[:len(x) // k * k].reshape(-1, k) ** 2).mean(axis=1))
print(f'{len(x) / sr:.1f} s')
for c, row in zip(cent, T):
    pk, _ = signal.find_peaks(row, prominence=0.03)
    pk = pk[np.argsort(row[pk])[::-1]][:5]
    a = int((c - 6) * rms_fps)
    level = 20 * np.log10(rms[a:a + 12 * rms_fps].mean() + 1e-9)
    desc = '  '.join(f'{60 / lags[p]:6.1f} ({row[p]:.2f})' for p in pk)
    print(f'{int(c // 60):2d}:{c % 60:04.1f}  {level:6.1f} dB  {desc}')
