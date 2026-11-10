// Fragmented MP4 → ordinary MP4 (ADR-0032). Chrome's MediaRecorder writes a fragmented MP4: a moov
// without samples, then moof + mdat pairs, and no length in the header, so players show no length
// and seek poorly. `defragmentMp4` writes the same media as one moov in front, with full sample
// tables, and one mdat; the media data is copied unchanged. It reads what fragmented writers use:
// the trex and tfhd defaults, tfdt, and trun durations, sizes, flags and composition offsets.
import { closeSync, fstatSync, openSync, readSync, writeSync } from 'node:fs';

interface Box {
  type: string;
  start: number;
  /** Start of the payload, after the header. */
  body: number;
  end: number;
}

type Read = (pos: number, len: number) => Buffer;

/** The boxes in [start, end); a box running past `end` (a cut-off recording) is cut there. */
function readBoxes(read: Read, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let pos = start;
  while (pos + 8 <= end) {
    const head = read(pos, Math.min(16, end - pos));
    let size = head.readUInt32BE(0);
    let body = pos + 8;
    if (size === 1) {
      if (head.length < 16) break;
      size = Number(head.readBigUInt64BE(8));
      body = pos + 16;
    } else if (size === 0) size = end - pos;
    if (size < body - pos) break; // not a box: stop here
    boxes.push({ type: head.toString('latin1', 4, 8), start: pos, body, end: Math.min(pos + size, end) });
    pos += size;
  }
  return boxes;
}

const child = (read: Read, box: Box, type: string) => readBoxes(read, box.body, box.end).find((b) => b.type === type);

export interface Sample {
  size: number;
  duration: number;
  sync: boolean;
  /** Composition time offset. */
  cto: number;
}

interface Defaults {
  duration: number;
  size: number;
  flags: number;
}

interface Track {
  id: number;
  samples: Sample[];
  /** One chunk per trun: the file offset of its first sample and its sample count. */
  chunks: { offset: number; count: number }[];
  /** Decode time of the first sample (tfdt), in the track's timescale. */
  firstDts: number | null;
  /** Decode time after the last sample so far. */
  dts: number;
  defaults: Defaults;
}

const NON_SYNC = 0x10000; // sample_is_non_sync_sample in the sample flags

/** Reads one moof: per traf, the samples and where their data is. */
function readMoof(moof: Buffer, moofStart: number, tracks: Map<number, Track>, fileSize: number) {
  for (const traf of readBoxes(bufRead(moof), 8, moof.length).filter((b) => b.type === 'traf')) {
    const kids = readBoxes(bufRead(moof), traf.body, traf.end);
    const tfhd = kids.find((b) => b.type === 'tfhd');
    if (!tfhd) continue;
    const flags = moof.readUIntBE(tfhd.body + 1, 3);
    const track = tracks.get(moof.readUInt32BE(tfhd.body + 4));
    if (!track) continue;
    let p = tfhd.body + 8;
    let base = moofStart; // default-base-is-moof, and the first traf without it
    if (flags & 0x01) {
      base = Number(moof.readBigUInt64BE(p));
      p += 8;
    }
    if (flags & 0x02) p += 4; // sample description index: one description per track
    const d = { ...track.defaults };
    if (flags & 0x08) {
      d.duration = moof.readUInt32BE(p);
      p += 4;
    }
    if (flags & 0x10) {
      d.size = moof.readUInt32BE(p);
      p += 4;
    }
    if (flags & 0x20) d.flags = moof.readUInt32BE(p);

    const tfdt = kids.find((b) => b.type === 'tfdt');
    if (tfdt) {
      const t = moof[tfdt.body] === 1 ? Number(moof.readBigUInt64BE(tfdt.body + 4)) : moof.readUInt32BE(tfdt.body + 4);
      if (track.firstDts === null) track.firstDts = t;
      else if (t !== track.dts && track.samples.length) {
        // A gap or overlap between fragments: the last sample takes it, so later samples keep their times.
        const last = track.samples[track.samples.length - 1]!;
        last.duration = Math.max(1, last.duration + t - track.dts);
      }
      track.dts = t;
    }

    let next = base; // data of a trun without data_offset follows the previous one
    for (const trun of kids.filter((b) => b.type === 'trun')) {
      const version = moof[trun.body]!;
      const f = moof.readUIntBE(trun.body + 1, 3);
      const count = moof.readUInt32BE(trun.body + 4);
      let q = trun.body + 8;
      const field = (signed = false) => {
        const v = signed ? moof.readInt32BE(q) : moof.readUInt32BE(q);
        q += 4;
        return v;
      };
      const offset = f & 0x001 ? base + field(true) : next;
      const first = f & 0x004 ? field() : null;
      let end = offset;
      let taken = 0;
      for (let i = 0; i < count; i++) {
        const duration = f & 0x100 ? field() : d.duration;
        const size = f & 0x200 ? field() : d.size;
        const own = f & 0x400 ? field() : null;
        const cto = f & 0x800 ? field(version !== 0) : 0;
        const sflags = own ?? (i === 0 && first !== null ? first : d.flags);
        if (end + size > fileSize) break; // a cut-off recording: keep what is there
        track.samples.push({ size, duration, sync: (sflags & NON_SYNC) === 0, cto });
        track.dts += duration;
        end += size;
        taken++;
      }
      if (taken) track.chunks.push({ offset, count: taken });
      next = end;
    }
  }
}

function bufRead(buf: Buffer): Read {
  return (pos, len) => buf.subarray(pos, pos + len);
}

// ------------------------------------------------------------------ writing boxes

function u32(...values: number[]): Buffer {
  const b = Buffer.alloc(4 * values.length);
  values.forEach((v, i) => b.writeUInt32BE(v >>> 0, 4 * i));
  return b;
}

function u32a(values: number[]): Buffer {
  const b = Buffer.alloc(4 * values.length);
  for (let i = 0; i < values.length; i++) b.writeUInt32BE(values[i]! >>> 0, 4 * i);
  return b;
}

function u64(value: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(value));
  return b;
}

function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

const fullBox = (type: string, version: number, flags: number, ...parts: Buffer[]) => box(type, u32(((version & 0xff) << 24) | (flags & 0xffffff)), ...parts);

/** [value, run length] pairs. */
function runs(values: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const v of values) {
    const last = out[out.length - 1];
    if (last && last[0] === v) last[1]++;
    else out.push([v, 1]);
  }
  return out;
}

/** stts, ctts, stss, stsc, stsz and co64 for a track, its chunks at `offsets`. */
function sampleTables(track: Track, offsets: number[]): Buffer[] {
  const s = track.samples;
  const stts = runs(s.map((x) => x.duration));
  // Tables of a long recording have 100 000s of entries: built as arrays, never spread as arguments.
  const tables = [fullBox('stts', 0, 0, u32(stts.length), u32a(stts.flatMap(([d, n]) => [n, d])))];
  if (s.some((x) => x.cto !== 0)) {
    const ctts = runs(s.map((x) => x.cto));
    tables.push(fullBox('ctts', s.some((x) => x.cto < 0) ? 1 : 0, 0, u32(ctts.length), u32a(ctts.flatMap(([c, n]) => [n, c]))));
  }
  if (s.some((x) => !x.sync)) {
    const sync = s.flatMap((x, i) => (x.sync ? [i + 1] : []));
    tables.push(fullBox('stss', 0, 0, u32(sync.length), u32a(sync)));
  }
  const stsc: number[] = [];
  track.chunks.forEach((c, i) => {
    if (stsc[stsc.length - 2] !== c.count) stsc.push(i + 1, c.count, 1); // [first chunk, samples per chunk, description]
  });
  tables.push(fullBox('stsc', 0, 0, u32(stsc.length / 3), u32a(stsc)));
  const same = s.every((x) => x.size === s[0]?.size);
  tables.push(fullBox('stsz', 0, 0, same ? u32(s[0]?.size ?? 0, s.length) : Buffer.concat([u32(0, s.length), u32a(s.map((x) => x.size))])));
  tables.push(fullBox('co64', 0, 0, u32(offsets.length), Buffer.concat(offsets.map(u64))));
  return tables;
}

const SAMPLE_TABLES = new Set(['stts', 'ctts', 'stss', 'stsc', 'stsz', 'stz2', 'stco', 'co64', 'sdtp']);

/** Writes `value` into a v0 (32-bit) or v1 (64-bit) field of a full box at body offset `v0At` / `v1At`. */
function patchTime(raw: Buffer, body: number, v0At: number, v1At: number, value: number) {
  const out = Buffer.from(raw);
  if (out[body] === 1) out.writeBigUInt64BE(BigInt(value), body + v1At);
  else if (value <= 0xffffffff) out.writeUInt32BE(value, body + v0At);
  else throw new Error('Recording too long for a version 0 header');
  return out;
}

interface TrackInfo {
  id: number;
  /** The hdlr type: "vide", "soun", … */
  handler: string;
  timescale: number;
  samples: number;
  seconds: number;
}

/**
 * The new moov: the old one without mvex, with durations and the sample tables filled in.
 * `mapOffset` gives a chunk's file position from its position in the joined media.
 */
function buildMoov(read: Read, moov: Box, tracks: Map<number, Track>, mapOffset: (old: number) => number): { moov: Buffer; info: TrackInfo[] } {
  const mvhd = child(read, moov, 'mvhd');
  if (!mvhd) throw new Error('No mvhd in the moov');
  const mvhdRaw = read(mvhd.start, mvhd.end - mvhd.start);
  const at = mvhd.body - mvhd.start;
  const movieScale = mvhdRaw.readUInt32BE(at + (mvhdRaw[at] === 1 ? 20 : 12));
  const info: TrackInfo[] = [];
  let movieDuration = 0;
  const parts: Buffer[] = [];

  for (const b of readBoxes(read, moov.body, moov.end)) {
    if (b.type === 'mvex' || b.type === 'mvhd') continue;
    if (b.type !== 'trak') {
      parts.push(read(b.start, b.end - b.start));
      continue;
    }
    const tkhd = child(read, b, 'tkhd');
    const mdia = child(read, b, 'mdia');
    const mdhd = mdia && child(read, mdia, 'mdhd');
    if (!tkhd || !mdia || !mdhd) throw new Error('A trak without tkhd, mdia or mdhd');
    const tkhdRaw = read(tkhd.start, tkhd.end - tkhd.start);
    const tAt = tkhd.body - tkhd.start;
    const id = tkhdRaw.readUInt32BE(tAt + (tkhdRaw[tAt] === 1 ? 20 : 12));
    const track = tracks.get(id);
    const mdhdRaw = read(mdhd.start, mdhd.end - mdhd.start);
    const mAt = mdhd.body - mdhd.start;
    const timescale = mdhdRaw.readUInt32BE(mAt + (mdhdRaw[mAt] === 1 ? 20 : 12));
    if (!track || !track.samples.length) continue; // a track without samples is dropped
    const media = track.samples.reduce((sum, s) => sum + s.duration, 0);
    const delay = Math.round(((track.firstDts ?? 0) * movieScale) / timescale);
    const total = delay + Math.round((media * movieScale) / timescale);
    movieDuration = Math.max(movieDuration, total);
    const hdlr = child(read, mdia, 'hdlr');
    const handler = hdlr ? read(hdlr.body + 8, 4).toString('latin1') : '';
    info.push({ id, handler, timescale, samples: track.samples.length, seconds: media / timescale });

    const offsets = track.chunks.map((c) => mapOffset(c.offset));
    // A track that starts later than 0 (its first tfdt) is delayed by an empty edit after the tkhd.
    const edts =
      delay > 0 && !child(read, b, 'edts') ? [box('edts', fullBox('elst', 0, 0, u32(2, delay, 0xffffffff, 0x10000, total - delay, 0, 0x10000)))] : [];
    const rebuild = (container: Box): Buffer =>
      box(
        container.type,
        ...readBoxes(read, container.body, container.end).flatMap((k): Buffer[] => {
          if (k.type === 'tkhd') return [patchTime(tkhdRaw, tAt, 20, 28, total), ...edts];
          if (k.type === 'mdhd') return [patchTime(mdhdRaw, mAt, 16, 24, media)];
          if (k.type === 'stbl') {
            const keep = readBoxes(read, k.body, k.end).filter((x) => !SAMPLE_TABLES.has(x.type));
            return [box('stbl', ...keep.map((x) => read(x.start, x.end - x.start)), ...sampleTables(track, offsets))];
          }
          if (k.type === 'mdia' || k.type === 'minf') return [rebuild(k)];
          return [read(k.start, k.end - k.start)];
        }),
      );
    parts.push(rebuild(b));
  }
  return { moov: box('moov', patchTime(mvhdRaw, at, 16, 24, movieDuration), ...parts), info };
}

const FTYP = box('ftyp', Buffer.from('isom', 'latin1'), u32(0x200), Buffer.from('isomiso2avc1mp41', 'latin1'));

export interface DefragmentResult {
  tracks: TrackInfo[];
  /** Media bytes copied. */
  bytes: number;
}

/** One fragmented MP4, read: its moov, its tracks' samples, and its mdat payloads. */
interface Parsed {
  path: string;
  fd: number;
  read: Read;
  moov: Box;
  /** Whether it has any moof. */
  fragmented: boolean;
  tracks: Map<number, Track>;
  /** The mdat payloads in file order. */
  mdats: { from: number; to: number }[];
  /** Per track id: its timescale and its sample description (stsd) bytes. */
  headers: Map<number, { timescale: number; stsd: string }>;
}

function parse(path: string): Parsed {
  const fd = openSync(path, 'r');
  try {
    const fileSize = fstatSync(fd).size;
    const read: Read = (pos, len) => {
      const b = Buffer.alloc(len);
      const n = readSync(fd, b, 0, len, pos);
      return n < len ? b.subarray(0, n) : b;
    };
    const top = readBoxes(read, 0, fileSize);
    const moov = top.find((b) => b.type === 'moov');
    if (!moov) throw new Error(`${path}: no moov`);

    // trex defaults per track.
    const tracks = new Map<number, Track>();
    const mvex = child(read, moov, 'mvex');
    for (const trex of mvex ? readBoxes(read, mvex.body, mvex.end).filter((b) => b.type === 'trex') : []) {
      const t = read(trex.body, 24);
      const id = t.readUInt32BE(4);
      tracks.set(id, { id, samples: [], chunks: [], firstDts: null, dts: 0, defaults: { duration: t.readUInt32BE(12), size: t.readUInt32BE(16), flags: t.readUInt32BE(20) } });
    }
    for (const b of top) if (b.type === 'moof') readMoof(read(b.start, b.end - b.start), b.start, tracks, fileSize);

    const headers = new Map<number, { timescale: number; stsd: string }>();
    for (const trak of readBoxes(read, moov.body, moov.end).filter((b) => b.type === 'trak')) {
      const tkhd = child(read, trak, 'tkhd');
      const mdia = child(read, trak, 'mdia');
      const mdhd = mdia && child(read, mdia, 'mdhd');
      const minf = mdia && child(read, mdia, 'minf');
      const stbl = minf && child(read, minf, 'stbl');
      const stsd = stbl && child(read, stbl, 'stsd');
      if (!tkhd || !mdhd) continue;
      const t = read(tkhd.body, 24);
      const m = read(mdhd.body, 24);
      headers.set(t.readUInt32BE(t[0] === 1 ? 20 : 12), {
        timescale: m.readUInt32BE(m[0] === 1 ? 20 : 12),
        stsd: stsd ? read(stsd.start, stsd.end - stsd.start).toString('hex') : '',
      });
    }
    return {
      path,
      fd,
      read,
      moov,
      fragmented: top.some((b) => b.type === 'moof'),
      tracks,
      mdats: top.filter((b) => b.type === 'mdat').map((b) => ({ from: b.body, to: b.end })),
      headers,
    };
  } catch (e) {
    closeSync(fd);
    throw e;
  }
}

/**
 * Appends the samples of `next` (a later recording of the same tracks) to `into`; chunk offsets
 * are already positions in the joined media. Each recording starts at its own time 0, so the join
 * is at the end of the longest track so far: each track's last sample is stretched to that point,
 * plus the next recording's own delay of that track, and the sound stays with the picture.
 */
function append(into: Map<number, Track>, next: Map<number, Track>, timescales: Map<number, number>) {
  const end = (t: Track) => ((t.firstDts ?? 0) + t.samples.reduce((sum, s) => sum + s.duration, 0)) / timescales.get(t.id)!;
  const join = Math.max(0, ...[...into.values()].filter((t) => t.samples.length).map(end));
  for (const t of next.values()) {
    if (!t.samples.length) continue;
    const target = into.get(t.id);
    if (!target) throw new Error(`Track ${t.id} is not in the first recording`);
    const scale = timescales.get(t.id)!;
    const lead = t.firstDts ?? 0;
    if (!target.samples.length) target.firstDts = Math.round(join * scale) + lead;
    else {
      const last = target.samples[target.samples.length - 1]!;
      last.duration = Math.max(1, last.duration + Math.round((join - end(target)) * scale) + lead);
    }
    for (const x of t.samples) target.samples.push(x);
    for (const c of t.chunks) target.chunks.push(c);
  }
}

/**
 * Writes `outPath`, an ordinary MP4 with the media of the fragmented MP4 at `inPaths`. Several
 * paths are consecutive recordings of one stream (record-video starts a new recorder before
 * Chrome's 4 GiB limit), joined into one file; they must have the same tracks and sample
 * descriptions. Returns null, writing nothing, when a single input has no fragments.
 */
export function defragmentMp4(inPaths: string | string[], outPath: string): DefragmentResult | null {
  const paths = typeof inPaths === 'string' ? [inPaths] : inPaths;
  if (!paths.length) throw new Error('No input');
  const files: Parsed[] = [];
  try {
    for (const p of paths) files.push(parse(p));
    const first = files[0]!;
    if (files.length === 1 && !first.fragmented) return null;
    for (const f of files) {
      if (!f.fragmented) throw new Error(`${f.path}: not a fragmented MP4`);
      if (f === first) continue;
      // A new recorder may number its tracks the other way round: a track is matched to the first
      // file's by its sample description and timescale, and takes that track's id.
      const renumbered = new Map<number, Track>();
      for (const [id, h] of f.headers) {
        const match = [...first.headers].find(([id0, h0]) => h0.timescale === h.timescale && h0.stsd === h.stsd && !renumbered.has(id0));
        if (!match) throw new Error(`${f.path}: track ${id} differs from every track of ${first.path}`);
        const t = f.tracks.get(id);
        if (t) renumbered.set(match[0], { ...t, id: match[0] });
      }
      f.tracks = renumbered;
    }

    // Chunk offsets → positions in the joined media: every mdat payload of every file, end to end.
    let bytes = 0;
    for (const f of files) {
      const segments = f.mdats.map((m) => {
        const s = { ...m, at: bytes };
        bytes += m.to - m.from;
        return s;
      });
      for (const t of f.tracks.values()) {
        for (const c of t.chunks) {
          const s = segments.find((x) => c.offset >= x.from && c.offset < x.to);
          if (!s) throw new Error(`${f.path}: sample data at ${c.offset} is outside every mdat`);
          c.offset = s.at + c.offset - s.from;
        }
      }
    }
    const timescales = new Map([...first.headers].map(([id, h]) => [id, h.timescale]));
    const tracks = first.tracks;
    for (const f of files.slice(1)) append(tracks, f.tracks, timescales);

    // co64 offsets have a fixed size, so the moov's length does not depend on where the mdat starts.
    const probe = buildMoov(first.read, first.moov, tracks, () => 0).moov.length;
    const dataStart = FTYP.length + probe + 16;
    const { moov: newMoov, info } = buildMoov(first.read, first.moov, tracks, (pos) => dataStart + pos);

    const out = openSync(outPath, 'w');
    try {
      const mdatHead = Buffer.alloc(16);
      mdatHead.writeUInt32BE(1);
      mdatHead.write('mdat', 4, 'latin1');
      mdatHead.writeBigUInt64BE(BigInt(16 + bytes), 8);
      for (const b of [FTYP, newMoov, mdatHead]) writeSync(out, b);
      const block = Buffer.alloc(16 << 20);
      for (const f of files) {
        for (const s of f.mdats) {
          for (let pos = s.from; pos < s.to; ) {
            const n = readSync(f.fd, block, 0, Math.min(block.length, s.to - pos), pos);
            if (n <= 0) throw new Error(`${f.path}: read failed at ${pos}`);
            writeSync(out, block, 0, n);
            pos += n;
          }
        }
      }
    } finally {
      closeSync(out);
    }
    return { tracks: info, bytes };
  } finally {
    for (const f of files) closeSync(f.fd);
  }
}
