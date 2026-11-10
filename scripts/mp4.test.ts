import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { defragmentMp4 } from './lib/mp4';

// Hand-built fragmented MP4s in the layout Chrome's MediaRecorder writes (trex and tfhd defaults,
// default-base-is-moof, trun with data offsets), flattened and read back.

const u32 = (...values: number[]) => {
  const b = Buffer.alloc(4 * values.length);
  values.forEach((v, i) => b.writeUInt32BE(v >>> 0, 4 * i));
  return b;
};
const box = (type: string, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(8 + body.length), Buffer.from(type, 'latin1'), body]);
};
const full = (type: string, version: number, flags: number, ...parts: Buffer[]) => box(type, u32((version << 24) | flags), ...parts);

const SYNC = 0x02000000;
const NON_SYNC = 0x01010000;

function trak(id: number, timescale: number, handler: string) {
  const emptyTables = [full('stts', 0, 0, u32(0)), full('stsc', 0, 0, u32(0)), full('stsz', 0, 0, u32(0, 0)), full('stco', 0, 0, u32(0))];
  return box(
    'trak',
    full('tkhd', 0, 3, u32(0, 0, id, 0, 0), Buffer.alloc(60)),
    box(
      'mdia',
      full('mdhd', 0, 0, u32(0, 0, timescale, 0, 0)),
      full('hdlr', 0, 0, u32(0), Buffer.from(handler, 'latin1'), Buffer.alloc(13)),
      box('minf', box('stbl', full('stsd', 0, 0, u32(1), box('test', Buffer.alloc(8))), ...emptyTables)),
    ),
  );
}

/** ftyp and moov: track 1 "soun" (timescale 1000, trex: 20 per sample, sync), track 2 "vide" (timescale 600). */
const head = Buffer.concat([
  box('ftyp', Buffer.from('isom', 'latin1'), u32(0), Buffer.from('iso6mp41', 'latin1')),
  box(
    'moov',
    full('mvhd', 0, 0, u32(0, 0, 1000, 0), Buffer.alloc(80)),
    trak(1, 1000, 'soun'),
    trak(2, 600, 'vide'),
    box('mvex', full('trex', 0, 0, u32(1, 1, 20, 0, SYNC)), full('trex', 0, 0, u32(2, 1, 0, 0, 0))),
  ),
]);

interface Run {
  track: number;
  tfdt: number;
  /** Sizes, with durations for the video track. */
  sizes: number[];
  durations?: number[];
}

/** A sample's bytes: its track and its number in the track, repeated. */
const payload = (track: number, n: number, size: number) => Buffer.alloc(size, track * 64 + n);

/**
 * A moof with one traf per run and its mdat. Track 1 takes durations from trex; track 2 has
 * per-sample durations, non-sync default flags in tfhd and a sync first sample.
 */
function fragment(seq: number, runs: Run[], counters: Record<number, number>) {
  const build = (offsets: number[]) =>
    box(
      'moof',
      full('mfhd', 0, 0, u32(seq)),
      ...runs.map((r, i) =>
        box(
          'traf',
          r.track === 2 ? full('tfhd', 0, 0x20020, u32(2, NON_SYNC)) : full('tfhd', 0, 0x20000, u32(1)),
          full('tfdt', 1, 0, u32(0, r.tfdt)),
          r.track === 2
            ? full('trun', 1, 0x305, u32(r.sizes.length, offsets[i]!, SYNC), ...r.sizes.map((s, j) => u32(r.durations![j]!, s)))
            : full('trun', 1, 0x201, u32(r.sizes.length, offsets[i]!), ...r.sizes.map((s) => u32(s))),
        ),
      ),
    );
  const moofLength = build(runs.map(() => 0)).length;
  const offsets: number[] = [];
  let at = moofLength + 8;
  for (const r of runs) {
    offsets.push(at);
    at += r.sizes.reduce((a, b) => a + b, 0);
  }
  const data = runs.flatMap((r) => r.sizes.map((s) => payload(r.track, counters[r.track] = (counters[r.track] ?? 0) + 1, s)));
  return Buffer.concat([build(offsets), box('mdat', ...data)]);
}

// ------------------------------------------------------------------ reading the result

interface Node {
  type: string;
  body: Buffer;
  start: number;
}

function children(buf: Buffer, start = 0, end = buf.length): Node[] {
  const out: Node[] = [];
  for (let p = start; p + 8 <= end; ) {
    let size = buf.readUInt32BE(p);
    let h = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(p + 8));
      h = 16;
    }
    out.push({ type: buf.toString('latin1', p + 4, p + 8), body: buf.subarray(p + h, p + size), start: p });
    p += size;
  }
  return out;
}
const kid = (n: Node, type: string) => children(n.body).find((k) => k.type === type)!;
const path = (n: Node, ...types: string[]) => types.reduce(kid, n);
const words = (n: Node, from: number) => Array.from({ length: (n.body.length - from) / 4 }, (_, i) => n.body.readUInt32BE(from + 4 * i));

interface ReadTrack {
  handler: string;
  tkhdDuration: number;
  mdhdDuration: number;
  stts: number[];
  stss: number[] | null;
  edits: number[] | null;
  samples: Buffer[];
}

function readTrack(file: Buffer, trak: Node): ReadTrack {
  const stbl = path(trak, 'mdia', 'minf', 'stbl');
  const stsz = kid(stbl, 'stsz');
  const fixed = stsz.body.readUInt32BE(4); // one size for every sample, or 0 and a table
  const sizes = fixed ? Array<number>(stsz.body.readUInt32BE(8)).fill(fixed) : words(stsz, 12);
  const stsc = words(kid(stbl, 'stsc'), 8);
  const co64 = kid(stbl, 'co64');
  const chunks = Array.from({ length: co64.body.readUInt32BE(4) }, (_, i) => Number(co64.body.readBigUInt64BE(8 + 8 * i)));
  const samples: Buffer[] = [];
  let n = 0;
  chunks.forEach((offset, c) => {
    let perChunk = 0;
    for (let e = 0; e < stsc.length; e += 3) if (stsc[e]! <= c + 1) perChunk = stsc[e + 1]!;
    for (let i = 0; i < perChunk; i++) {
      samples.push(file.subarray(offset, offset + sizes[n]!));
      offset += sizes[n++]!;
    }
  });
  const stss = children(stbl.body).find((k) => k.type === 'stss');
  const edts = children(trak.body).find((k) => k.type === 'edts');
  return {
    handler: path(trak, 'mdia', 'hdlr').body.toString('latin1', 8, 12),
    tkhdDuration: kid(trak, 'tkhd').body.readUInt32BE(20),
    mdhdDuration: path(trak, 'mdia', 'mdhd').body.readUInt32BE(16),
    stts: words(kid(stbl, 'stts'), 8),
    stss: stss ? words(stss, 8) : null,
    edits: edts ? words(kid(edts, 'elst'), 4) : null, // the entry count, then the entries
    samples,
  };
}

const dir = mkdtempSync(join(tmpdir(), 'mp4-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function flatten(...inputs: Buffer[]) {
  const from = inputs.map((input, i) => {
    const p = join(dir, `in${i}.mp4`);
    writeFileSync(p, input);
    return p;
  });
  const to = join(dir, 'out.mp4');
  const result = defragmentMp4(from.length === 1 ? from[0]! : from, to);
  if (!result) return { result, top: [], tracks: [], mvhd: 0 };
  const file = readFileSync(to);
  const top = children(file);
  const moov = top.find((b) => b.type === 'moov')!;
  const tracks = children(moov.body)
    .filter((b) => b.type === 'trak')
    .map((t) => readTrack(file, t));
  return { result, top: top.map((b) => b.type), tracks, mvhd: kid(moov, 'mvhd').body.readUInt32BE(16), moov: children(moov.body).map((b) => b.type) };
}

describe('defragmentMp4', () => {
  it('writes one moov with sample tables and one mdat, the samples where the tables say', () => {
    const counters = {};
    const input = Buffer.concat([
      head,
      fragment(1, [{ track: 1, tfdt: 0, sizes: [5, 6, 7] }, { track: 2, tfdt: 0, sizes: [30, 8, 9], durations: [20, 20, 20] }], counters),
      fragment(2, [{ track: 1, tfdt: 60, sizes: [5, 5] }, { track: 2, tfdt: 60, sizes: [31, 10], durations: [20, 20] }], counters),
    ]);
    const { result, top, moov, tracks, mvhd } = flatten(input);
    expect(top).toEqual(['ftyp', 'moov', 'mdat']);
    expect(moov).toEqual(['mvhd', 'trak', 'trak']); // mvex is gone
    expect(result!.tracks.map((t) => [t.handler, t.samples, t.seconds])).toEqual([
      ['soun', 5, 0.1],
      ['vide', 5, 100 / 600],
    ]);
    const [audio, video] = tracks;
    // Every sample's bytes are its own, in order.
    expect(audio!.samples.map((s) => [s.length, s[0]])).toEqual([[5, 65], [6, 66], [7, 67], [5, 68], [5, 69]]);
    expect(video!.samples.map((s) => [s.length, s[0]])).toEqual([[30, 129], [8, 130], [9, 131], [31, 132], [10, 133]]);
    expect(audio!.samples.every((s) => s.every((x) => x === s[0]))).toBe(true);
    // Durations: trex default for audio, per sample for video; sync samples from the first-sample flags.
    expect(audio!.stts).toEqual([5, 20]);
    expect(video!.stts).toEqual([5, 20]);
    expect(audio!.stss).toBeNull();
    expect(video!.stss).toEqual([1, 4]);
    expect([audio!.mdhdDuration, video!.mdhdDuration]).toEqual([100, 100]);
    expect([audio!.tkhdDuration, video!.tkhdDuration, mvhd]).toEqual([100, 167, 167]);
    expect(audio!.edits).toBeNull();
  });

  it('gives a gap between fragments to the sample before it, so later samples keep their times', () => {
    const counters = {};
    const input = Buffer.concat([
      head,
      fragment(1, [{ track: 2, tfdt: 0, sizes: [4, 4], durations: [10, 10] }], counters),
      fragment(2, [{ track: 2, tfdt: 35, sizes: [4, 4], durations: [10, 10] }], counters), // 15 late
    ]);
    const video = flatten(input).tracks[0]!;
    expect(video.handler).toBe('vide');
    expect(video.stts).toEqual([1, 10, 1, 25, 2, 10]);
    expect(video.mdhdDuration).toBe(55);
  });

  it('delays a track that starts after 0 with an empty edit', () => {
    const counters = {};
    const input = Buffer.concat([
      head,
      fragment(1, [{ track: 1, tfdt: 0, sizes: [3, 3, 3] }, { track: 2, tfdt: 120, sizes: [4, 4], durations: [60, 60] }], counters),
    ]);
    const [audio, video] = flatten(input).tracks;
    expect(audio!.edits).toBeNull();
    // 120 / 600 s = 200 ms empty, then 120 / 600 s = 200 ms of media from its start, at rate 1.
    expect(video!.edits).toEqual([2, 200, 0xffffffff, 0x10000, 200, 0, 0x10000]);
    expect(video!.tkhdDuration).toBe(400);
  });

  it('keeps the samples that are there when the recording was cut off', () => {
    const counters = {};
    const whole = Buffer.concat([
      head,
      fragment(1, [{ track: 2, tfdt: 0, sizes: [4, 4], durations: [10, 10] }], counters),
      fragment(2, [{ track: 2, tfdt: 20, sizes: [4, 4, 4], durations: [10, 10, 10] }], counters),
    ]);
    const video = flatten(whole.subarray(0, whole.length - 6)).tracks[0]!; // the last sample and a half are missing
    expect(video.samples.map((s) => s[0])).toEqual([129, 130, 131]);
  });

  it('joins consecutive recordings at the end of the longest track, sound and picture together', () => {
    const counters = {};
    // First: audio 3 × 20 ms = 60 ms, video 2 × 60 / 600 = 200 ms. Second: both start again at 0,
    // the video 6 / 600 = 10 ms late.
    const first = Buffer.concat([head, fragment(1, [{ track: 1, tfdt: 0, sizes: [3, 3, 3] }, { track: 2, tfdt: 0, sizes: [4, 4], durations: [60, 60] }], counters)]);
    const second = Buffer.concat([head, fragment(1, [{ track: 1, tfdt: 0, sizes: [3, 3] }, { track: 2, tfdt: 6, sizes: [4, 4], durations: [60, 60] }], counters)]);
    const { result, top, tracks } = flatten(first, second);
    expect(top).toEqual(['ftyp', 'moov', 'mdat']);
    const [audio, video] = tracks;
    expect(audio!.samples.map((s) => s[0])).toEqual([65, 66, 67, 68, 69]);
    expect(video!.samples.map((s) => s[0])).toEqual([129, 130, 131, 132]);
    // The audio's last first-part sample runs to 200 ms; the video's takes the 10 ms lead.
    expect(audio!.stts).toEqual([2, 20, 1, 160, 2, 20]);
    expect(video!.stts).toEqual([1, 60, 1, 66, 2, 60]);
    expect(video!.stss).toEqual([1, 3]);
    expect(result!.bytes).toBe(9 + 8 + 6 + 8);
  });

  it('joins recordings whose tracks are numbered the other way round', () => {
    // The second recording has the video as track 1 (timescale 600) and the sound as track 2.
    const swapped = Buffer.concat([
      box('ftyp', Buffer.from('isom', 'latin1'), u32(0), Buffer.from('iso6mp41', 'latin1')),
      box(
        'moov',
        full('mvhd', 0, 0, u32(0, 0, 1000, 0), Buffer.alloc(80)),
        trak(1, 600, 'vide'),
        trak(2, 1000, 'soun'),
        box('mvex', full('trex', 0, 0, u32(1, 1, 20, 0, SYNC)), full('trex', 0, 0, u32(2, 1, 0, 0, 0))),
      ),
    ]);
    const first = Buffer.concat([head, fragment(1, [{ track: 1, tfdt: 0, sizes: [3, 3, 3] }, { track: 2, tfdt: 0, sizes: [4, 4], durations: [60, 60] }], {})]);
    const second = Buffer.concat([swapped, fragment(1, [{ track: 1, tfdt: 0, sizes: [5, 5] }, { track: 2, tfdt: 0, sizes: [6, 6], durations: [20, 20] }], {})]);
    const [audio, video] = flatten(first, second).tracks;
    expect(audio!.handler).toBe('soun');
    expect(audio!.samples.map((s) => [s.length, s[0]])).toEqual([[3, 65], [3, 66], [3, 67], [6, 129], [6, 130]]);
    expect(video!.samples.map((s) => [s.length, s[0]])).toEqual([[4, 129], [4, 130], [5, 65], [5, 66]]);
  });

  it('refuses to join recordings whose sample descriptions differ', () => {
    const counters = {};
    const other = Buffer.from(head);
    other.write('tesu', other.indexOf('test'), 'latin1');
    const first = Buffer.concat([head, fragment(1, [{ track: 1, tfdt: 0, sizes: [3] }], counters)]);
    const second = Buffer.concat([other, fragment(1, [{ track: 1, tfdt: 0, sizes: [3] }], counters)]);
    expect(() => flatten(first, second)).toThrow(/differs/);
  });

  it('leaves an ordinary MP4 alone', () => {
    expect(flatten(Buffer.concat([box('ftyp', Buffer.from('isom', 'latin1'), u32(0)), box('moov', full('mvhd', 0, 0, u32(0, 0, 1000, 0), Buffer.alloc(80))), box('mdat', Buffer.alloc(4))])).result).toBeNull();
  });
});
