# Practice chunks for a transcribed song, as lines for song.yaml.
#   chunks.py <dir with notes.json> <config.json>      writes <dir>/chunks.yaml
# config.json may have "chunk_bars" (bars per chunk, default 4) and "sections_chunks": [[from_bar, to_bar, "name"], ...]; chunks never cross a section edge
# and take the section's name. Elsewhere a chunk is named after the roots of its bars.
# Rules (preprocess-song skill): playable bars only, about four bars per chunk, the first time a
# phrase is played is a chunk of its own, and its immediate repeats are one chunk "name xN" of up
# to 16 bars.
import sys
from rwlib import *

d = sys.argv[1]
cfg = read(sys.argv[2])
song = read(f'{d}/notes.json')
tuning = song['tuning']
bars = song['bars']
n = len(bars)
FLAT = {'C#': 'C♯', 'D#': 'E♭', 'F#': 'F♯', 'G#': 'A♭', 'A#': 'B♭'}

def pitch(note):
    return tuning[note['string'] - 1] + note['fret']

sig = [tuple((x['s'], x['d'], pitch(x), bool(x.get('tie'))) for x in b['notes']) + (tuple(b['ts']),) for b in bars]
empty = [len(b['notes']) == 0 for b in bars]

def root_of(i):
    counts = {}
    for x in bars[i]['notes']:
        counts[pitch(x) % 12] = counts.get(pitch(x) % 12, 0) + x['d']
    if not counts:
        return None
    pc = max(counts, key=counts.get)
    nm = NOTE_NAMES[pc]
    return FLAT.get(nm, nm)

sections = [(a, b, nm) for a, b, nm in cfg.get('sections_chunks', [])]
def section_of(bar):
    for a, b, nm in sections:
        if a <= bar <= b:
            return (a, b, nm)
    return None

# Playable runs: a single empty bar inside a run stays in it.
runs = []
i = 0
while i < n:
    if empty[i]:
        i += 1
        continue
    j = i
    while j + 1 < n and (not empty[j + 1] or (j + 2 < n and not empty[j + 2])):
        j += 1
    runs.append((i, j))
    i = j + 1

pieces = []  # (first, last, section name or None), 0-based
for a, b in runs:
    start = a
    for k in range(a, b + 1):
        if k == b or section_of(k + 1) != section_of(k + 2):
            pieces.append((start, k, (section_of(start + 1) or (0, 0, None))[2]))
            start = k + 1

GROUP = cfg.get('chunk_bars', 4)
chunks = []  # (first bar, last bar, base name, kind)
for a, b, label in pieces:
    length = b - a + 1
    groups = []
    k = a
    while k <= b:
        left = b - k + 1
        size = left if left <= GROUP + GROUP // 4 else GROUP
        groups.append((k, k + size - 1))
        k += size
    out = []
    for g in groups:
        gsig = tuple(sig[g[0]:g[1] + 1])
        if out and out[-1]['sig'] == gsig and out[-1]['count'] < 16 // GROUP and out[-1]['repeat']:
            out[-1]['last'] = g[1]
            out[-1]['count'] += 1
        elif out and out[-1]['sig'] == gsig:
            out.append({'first': g[0], 'last': g[1], 'sig': gsig, 'count': 1, 'repeat': True})
        else:
            out.append({'first': g[0], 'last': g[1], 'sig': gsig, 'count': 1, 'repeat': False})
    for c in out:
        roots = []
        for k in range(c['first'], c['last'] + 1):
            r = root_of(k)
            if r and (not roots or roots[-1] != r):
                roots.append(r)
        if label:
            base = label
        elif len(roots) == 1:
            base = f'{roots[0]} riff'
        elif 2 <= len(roots) <= 4:
            base = '–'.join(roots)
        else:
            base = f'{roots[0]} line' if roots else 'Line'
        chunks.append([c['first'] + 1, c['last'] + 1, base, c['repeat'], c['count'], c['sig']])

# Names: a repeat of the chunk before it is "x N" or "repeat". Other chunks with the same base name
# get letters when their notes differ; a name with more than four variants gets running numbers.
variants = {}
for first, last, base, repeat, count, gsig in chunks:
    if not repeat and gsig not in variants.setdefault(base, []):
        variants[base].append(gsig)
running = {}
final = []
n_chunks = covered = 0
for first, last, base, repeat, count, gsig in chunks:
    if repeat:
        name_ = f'{base} ×{count}' if count > 1 else f'{base} repeat'
    elif len(variants[base]) == 1:
        name_ = base
    elif len(variants[base]) <= 4:
        name_ = f'{base} {chr(ord("a") + variants[base].index(gsig))}'
    else:
        running[base] = running.get(base, 0) + 1
        name_ = f'{base} {running[base]}'
    quoted = f'"{name_}"' if any(ch in name_ for ch in ':#') else name_
    final.append(f'  - {{ name: {quoted}, bars: [{first}, {last}] }}')
    n_chunks += 1
    covered += last - first + 1
NL = chr(10)
open(f'{d}/chunks.yaml', 'w', encoding='utf8', newline=NL).write(NL.join(final) + NL)
print(f'{d}: {n_chunks} chunks, {covered} of {n} bars, {sum(empty)} empty bars')
