# Separate a recording into drums, bass, other and vocals with Demucs (htdemucs), and write each
# stem as a mono 22.05 kHz WAV next to the mix (bass also as 44.1 kHz stereo for checks).
#   sep.py <dir with mix.wav> [shifts]
import sys
import numpy as np
import torch
from scipy.io import wavfile
from scipy import signal
from demucs.pretrained import get_model
from demucs.apply import apply_model

d = sys.argv[1]
shifts = int(sys.argv[2]) if len(sys.argv) > 2 else 1
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
model = get_model('htdemucs')
model.eval()
sr, x = wavfile.read(f'{d}/mix.wav')
assert sr == model.samplerate, (sr, model.samplerate)
wav = torch.from_numpy(x.T.astype(np.float32) / 32768.0)
ref = wav.mean(0)
mean, std = ref.mean(), ref.std()
wav = (wav - mean) / std
# In pieces of five minutes with half a minute of overlap, so a long track fits in memory.
PIECE, LAP = 300 * sr, 30 * sr
n = wav.shape[1]
out = np.zeros((len(model.sources), 2, n), dtype=np.float32)
pos = 0
while pos < n:
    a, b = max(0, pos - LAP), min(n, pos + PIECE + LAP)
    with torch.no_grad():
        src = apply_model(model, wav[None, :, a:b], device=dev, split=True, overlap=0.25, shifts=shifts, progress=False)[0]
    src = (src * std + mean).cpu().numpy()
    lo, hi = pos, min(n, pos + PIECE)
    out[:, :, lo:hi] = src[:, :, lo - a:hi - a]
    pos += PIECE
    print(f'{d}: {min(pos, n) / sr:7.1f} s of {n / sr:.1f}', flush=True)
for name, s in zip(model.sources, out):
    mono = s.mean(axis=0)
    y = signal.resample_poly(mono, 1, 2).astype(np.float32)
    wavfile.write(f'{d}/{name}.wav', sr // 2, (np.clip(y, -1, 1) * 32767).astype(np.int16))
    print(name, 'rms', float(np.sqrt((mono ** 2).mean())))
