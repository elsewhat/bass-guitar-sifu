# For every pitch the tracker reads in a recording: when the slot is read as that pitch, how strong is the
# spectral peak an octave below its fundamental, against the fundamental itself? Near 0 means the note
# really is at that octave; a steady 0.1 or more means a note an octave lower with a weak fundamental.
#   octave.py <dir>
import sys
from rwlib import *
d = sys.argv[1]
S = np.load(f'{d}/slots.npz'); P = np.load(f'{d}/pitch.npz')
t, raw, p_lo = S['t'], S['raw'], int(S['p_lo'])
times, fund = P['times'], P['fund']
print('pitch   slots   lower-octave peak / own peak: 10 %, median, 90 %      share above 0.12')
for p in sorted(set(int(x) for x in raw if x)):
    if p - 12 < p_lo:
        continue
    idx = np.where(raw == p)[0]
    if len(idx) < 15:
        continue
    r = []
    for i in idx:
        ia, ie = int(np.searchsorted(times, t[i] + 0.2 * (t[i + 1] - t[i]))), int(np.searchsorted(times, t[i + 1] - 0.1 * (t[i + 1] - t[i])))
        ie = max(ie, ia + 1)
        own = fund[ia:ie, p - p_lo].mean(); low = fund[ia:ie, p - 12 - p_lo].mean()
        r.append(low / (own + 1e-9))
    r = np.array(r)
    print(f'{name(p):5s} {len(idx):6d}   {np.percentile(r, 10):.2f}  {np.median(r):.2f}  {np.percentile(r, 90):.2f}      {100 * (r > 0.12).mean():.0f} %')
