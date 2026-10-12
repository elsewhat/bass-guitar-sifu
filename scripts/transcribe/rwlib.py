# Shared pieces of the Roadwork transcription scripts: onset envelopes, tempo, beat grids.
import json
import numpy as np
from scipy.io import wavfile
from scipy import signal
from scipy.ndimage import gaussian_filter1d, maximum_filter1d

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def name(p):
    p = int(p)
    return f"{NOTE_NAMES[p % 12]}{p // 12 - 1}"


def midi_hz(p):
    return 440.0 * 2 ** ((np.asarray(p, dtype=float) - 69) / 12)


def load_mono(path, target=22050):
    sr, x = wavfile.read(path)
    x = x.astype(np.float32) / 32768.0
    if x.ndim > 1:
        x = x.mean(axis=1)
    if sr != target:
        assert sr % target == 0, (sr, target)
        x = signal.resample_poly(x, 1, sr // target).astype(np.float32)
    return target, x


ENV_HOP = 110  # samples at 22050 Hz: 5 ms
ENV_FPS = 22050 / ENV_HOP


def onset_env(x, sr=22050, lo=30, hi=11000, n_fft=512, hop=ENV_HOP, smooth=0.010, norm_sec=2.0):
    """Onset strength: log-compressed spectral flux, divided by its local RMS, smoothed."""
    f, t, Z = signal.stft(x, fs=sr, window='hann', nperseg=n_fft, noverlap=n_fft - hop, boundary='zeros', padded=True)
    m = np.log1p(100 * np.abs(Z[(f >= lo) & (f <= hi)]))
    d = np.maximum(np.diff(m, axis=1, prepend=m[:, :1]), 0).sum(axis=0)
    fps = sr / hop
    k = int(norm_sec * fps)
    loc = np.sqrt(np.convolve(d ** 2, np.ones(k) / k, mode='same')) + 1e-3 * d.std() + 1e-9
    e = gaussian_filter1d(d / loc, smooth * fps)
    return (e / (e.std() + 1e-9)).astype(np.float32)


def tempogram(env, fps=ENV_FPS, win=12.0, hop=2.0, lag_lo=0.2, lag_hi=2.0):
    """Autocorrelation of the onset envelope in windows. Returns window centres, lags (s) and the matrix."""
    w = int(win * fps)
    h = int(hop * fps)
    l0, l1 = int(lag_lo * fps), int(lag_hi * fps)
    lags = np.arange(l0, l1 + 1)
    rows, centres = [], []
    hann = np.hanning(w)
    for a in range(0, len(env) - w, h):
        seg = env[a:a + w] - env[a:a + w].mean()
        seg = seg * hann
        ac = signal.fftconvolve(seg, seg[::-1], mode='full')[w - 1:]
        ac = ac / (ac[0] + 1e-9)
        rows.append(ac[l0:l1 + 1])
        centres.append((a + w / 2) / fps)
    return np.array(centres), lags / fps, np.array(rows)


def track_beats(env, period_s, fps=ENV_FPS, tight=300.0):
    """Dynamic-programming beat tracker (Ellis 2007). period_s: the period in seconds for every frame."""
    N = len(env)
    tau_f = np.asarray(period_s) * fps
    C = env.astype(np.float64).copy()
    back = -np.ones(N, dtype=np.int64)
    for i in range(N):
        tau = tau_f[i]
        lo, hi = int(i - 2 * tau), int(i - tau / 2)
        if hi <= 0:
            continue
        lo = max(lo, 0)
        prev = np.arange(lo, hi)
        sc = C[prev] - tight * np.log((i - prev) / tau) ** 2
        j = int(sc.argmax())
        C[i] = env[i] + sc[j]
        back[i] = prev[j]
    end0 = int(N - 2 * tau_f[-1])
    i = end0 + int(C[end0:].argmax())
    beats = []
    while i >= 0:
        beats.append(i)
        i = back[i]
    return np.array(beats[::-1]) / fps


def smooth_grid(t, half=4):
    """Local linear fit over 2*half+1 grid points: removes the tracker's frame jitter."""
    t = np.asarray(t, dtype=float)
    out = t.copy()
    n = len(t)
    for i in range(n):
        a, b = max(0, i - half), min(n, i + half + 1)
        k = np.arange(a, b)
        p = np.polyfit(k, t[a:b], 1)
        out[i] = np.polyval(p, i)
    return out


def dump(path, obj):
    json.dump(obj, open(path, 'w'))


def read(path):
    return json.load(open(path, encoding='utf8'))
