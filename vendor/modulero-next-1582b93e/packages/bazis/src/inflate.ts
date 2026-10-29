// zlib / DEFLATE decompressor (RFC 1950, RFC 1951), written for the BAZIS reader.
//
// Why our own and not a library: the container needs three things that the small pure-JS inflaters
// (fflate, pako, tiny-inflate) do not give together: (1) the exact number of input bytes the zlib
// stream used, because a BZ85 file may carry opaque bytes after the stream; (2) the Adler-32 check,
// which the format spec says must reject damaged files; (3) a hard output limit and a distinction
// between "damaged" and "truncated" with the same outcome as Python's zlib.decompressobj, which the
// reference decoder uses. The algorithm follows zlib's own reference decoder "puff" (Mark Adler).

export type InflateFailure = 'invalid' | 'truncated' | 'limit';

export class InflateError extends Error {
  readonly kind: InflateFailure;
  constructor(kind: InflateFailure, message: string) {
    super(message);
    this.name = 'InflateError';
    this.kind = kind;
  }
}

export interface InflateResult {
  data: Uint8Array;
  /** Input bytes used by the stream, including the zlib header and the Adler-32. */
  consumed: number;
}

export interface InflateOptions {
  /** Output larger than this is refused (default 512 MiB, as in the reference decoder). */
  maxOutput?: number;
}

export const DEFAULT_MAX_OUTPUT = 512 * 1024 * 1024;

const MAXBITS = 15;
const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface Huffman { count: Uint16Array; symbol: Uint16Array }

function construct(lengths: ArrayLike<number>, offset: number, n: number): { h: Huffman; left: number } {
  const count = new Uint16Array(MAXBITS + 1);
  const symbol = new Uint16Array(n);
  for (let s = 0; s < n; s++) count[lengths[offset + s]]++;
  const h = { count, symbol };
  if (count[0] === n) return { h, left: 0 };
  let left = 1;
  for (let len = 1; len <= MAXBITS; len++) {
    left <<= 1;
    left -= count[len];
    if (left < 0) return { h, left };
  }
  const offs = new Uint16Array(MAXBITS + 2);
  for (let len = 1; len < MAXBITS; len++) offs[len + 1] = offs[len] + count[len];
  for (let s = 0; s < n; s++) {
    const l = lengths[offset + s];
    if (l !== 0) symbol[offs[l]++] = s;
  }
  return { h, left };
}

let fixedTables: { lit: Huffman; dist: Huffman } | null = null;
function fixed(): { lit: Huffman; dist: Huffman } {
  if (!fixedTables) {
    const l = new Uint8Array(288);
    for (let s = 0; s < 144; s++) l[s] = 8;
    for (let s = 144; s < 256; s++) l[s] = 9;
    for (let s = 256; s < 280; s++) l[s] = 7;
    for (let s = 280; s < 288; s++) l[s] = 8;
    const d = new Uint8Array(30).fill(5);
    fixedTables = { lit: construct(l, 0, 288).h, dist: construct(d, 0, 30).h };
  }
  return fixedTables;
}

class Stream {
  pos: number;
  private bitBuf = 0;
  private bitCnt = 0;
  out: Uint8Array;
  outPos = 0;
  constructor(readonly input: Uint8Array, start: number, private readonly maxOutput: number) {
    this.pos = start;
    this.out = new Uint8Array(Math.min(Math.max(1024, input.length * 3), Math.max(1024, maxOutput)));
  }

  bits(need: number): number {
    let val = this.bitBuf;
    while (this.bitCnt < need) {
      if (this.pos >= this.input.length) throw new InflateError('truncated', 'unexpected end of the compressed data');
      val |= this.input[this.pos++] << this.bitCnt;
      this.bitCnt += 8;
    }
    this.bitBuf = val >>> need;
    this.bitCnt -= need;
    return val & ((1 << need) - 1);
  }

  alignToByte(): void { this.bitBuf = 0; this.bitCnt = 0; }

  private grow(extra: number): void {
    const needed = this.outPos + extra;
    if (needed > this.maxOutput) throw new InflateError('limit', `expanded data exceeds the limit of ${this.maxOutput} bytes`);
    if (needed <= this.out.length) return;
    let size = this.out.length;
    while (size < needed) size = Math.min(size * 2, Math.max(this.maxOutput, needed));
    const next = new Uint8Array(size);
    next.set(this.out.subarray(0, this.outPos));
    this.out = next;
  }

  put(byte: number): void {
    if (this.outPos >= this.out.length) this.grow(1);
    else if (this.outPos >= this.maxOutput) this.grow(1);
    this.out[this.outPos++] = byte;
  }

  copy(dist: number, len: number): void {
    this.grow(len);
    const o = this.out;
    for (let i = 0; i < len; i++) { o[this.outPos] = o[this.outPos - dist]; this.outPos++; }
  }

  decode(h: Huffman): number {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len <= MAXBITS; len++) {
      code |= this.bits(1);
      const count = h.count[len];
      if (code - count < first) return h.symbol[index + (code - first)];
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw new InflateError('invalid', 'invalid Huffman code');
  }
}

function codes(s: Stream, lit: Huffman, dist: Huffman): void {
  for (;;) {
    let sym = s.decode(lit);
    if (sym < 256) { s.put(sym); continue; }
    if (sym === 256) return;
    sym -= 257;
    if (sym >= 29) throw new InflateError('invalid', 'invalid literal/length code');
    const len = LBASE[sym] + s.bits(LEXT[sym]);
    const ds = s.decode(dist);
    if (ds >= 30) throw new InflateError('invalid', 'invalid distance code');
    const d = DBASE[ds] + s.bits(DEXT[ds]);
    if (d > s.outPos) throw new InflateError('invalid', 'invalid distance too far back');
    s.copy(d, len);
  }
}

function stored(s: Stream): void {
  s.alignToByte();
  const input = s.input;
  if (s.pos + 4 > input.length) throw new InflateError('truncated', 'unexpected end of the compressed data');
  const len = input[s.pos] | (input[s.pos + 1] << 8);
  const nlen = input[s.pos + 2] | (input[s.pos + 3] << 8);
  if (len !== (~nlen & 0xffff)) throw new InflateError('invalid', 'invalid stored block lengths');
  s.pos += 4;
  if (s.pos + len > input.length) throw new InflateError('truncated', 'unexpected end of the compressed data');
  for (let i = 0; i < len; i++) s.put(input[s.pos + i]);
  s.pos += len;
}

function dynamic(s: Stream): void {
  const nlen = s.bits(5) + 257;
  const ndist = s.bits(5) + 1;
  const ncode = s.bits(4) + 4;
  if (nlen > 286 || ndist > 30) throw new InflateError('invalid', 'too many length or distance symbols');
  const lengths = new Uint8Array(320);
  for (let i = 0; i < ncode; i++) lengths[CLORDER[i]] = s.bits(3);
  const cl = construct(lengths, 0, 19);
  if (cl.left !== 0) throw new InflateError('invalid', 'incomplete or over-subscribed code length code');
  const lens = new Uint8Array(320);
  let index = 0;
  while (index < nlen + ndist) {
    const sym = s.decode(cl.h);
    if (sym < 16) { lens[index++] = sym; continue; }
    let len = 0, rep: number;
    if (sym === 16) {
      if (index === 0) throw new InflateError('invalid', 'repeat with no previous length');
      len = lens[index - 1];
      rep = 3 + s.bits(2);
    } else if (sym === 17) rep = 3 + s.bits(3);
    else rep = 11 + s.bits(7);
    if (index + rep > nlen + ndist) throw new InflateError('invalid', 'too many lengths');
    while (rep--) lens[index++] = len;
  }
  if (lens[256] === 0) throw new InflateError('invalid', 'no end-of-block code');
  const lit = construct(lens, 0, nlen);
  // An incomplete code is accepted only when it is a single code of length 1 (as zlib does).
  if (lit.left < 0 || (lit.left > 0 && nlen !== lit.h.count[0] + lit.h.count[1])) throw new InflateError('invalid', 'invalid literal/length code lengths');
  const dist = construct(lens, nlen, ndist);
  if (dist.left < 0 || (dist.left > 0 && ndist !== dist.h.count[0] + dist.h.count[1])) throw new InflateError('invalid', 'invalid distance code lengths');
  codes(s, lit.h, dist.h);
}

function inflateBlocks(s: Stream): void {
  let last: number;
  do {
    last = s.bits(1);
    const type = s.bits(2);
    if (type === 0) stored(s);
    else if (type === 1) { const f = fixed(); codes(s, f.lit, f.dist); }
    else if (type === 2) dynamic(s);
    else throw new InflateError('invalid', 'invalid block type');
  } while (!last);
  s.alignToByte();
}

export function adler32(data: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < data.length; ) {
    const end = Math.min(i + 5552, data.length);
    for (; i < end; i++) { a += data[i]; b += a; }
    a %= 65521; b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Raw DEFLATE data starting at `start`; `consumed` counts bytes from `start`. */
export function inflateRaw(input: Uint8Array, start = 0, options: InflateOptions = {}): InflateResult {
  const s = new Stream(input, start, options.maxOutput ?? DEFAULT_MAX_OUTPUT);
  inflateBlocks(s);
  return { data: s.out.slice(0, s.outPos), consumed: s.pos - start };
}

/**
 * zlib stream (header, DEFLATE, Adler-32) at the start of `input`. Bytes after the stream are not
 * touched; `consumed` says where they begin. Throws InflateError: 'truncated' when the data ends
 * before the stream does, 'invalid' when it is damaged, 'limit' when the output would be too large.
 */
export function inflateZlib(input: Uint8Array, options: InflateOptions = {}): InflateResult {
  if (input.length < 2) throw new InflateError('truncated', 'unexpected end of the compressed data');
  const cmf = input[0], flg = input[1];
  if (((cmf << 8) | flg) % 31 !== 0) throw new InflateError('invalid', 'incorrect header check');
  if ((cmf & 0x0f) !== 8) throw new InflateError('invalid', 'unknown compression method');
  if ((cmf >> 4) > 7) throw new InflateError('invalid', 'invalid window size');
  if (flg & 0x20) throw new InflateError('invalid', 'a preset dictionary is required');
  const s = new Stream(input, 2, options.maxOutput ?? DEFAULT_MAX_OUTPUT);
  inflateBlocks(s);
  if (s.pos + 4 > input.length) throw new InflateError('truncated', 'unexpected end of the compressed data');
  const data = s.out.subarray(0, s.outPos);
  const expected = ((input[s.pos] << 24) | (input[s.pos + 1] << 16) | (input[s.pos + 2] << 8) | input[s.pos + 3]) >>> 0;
  if (adler32(data) !== expected) throw new InflateError('invalid', 'incorrect data check');
  return { data: data.slice(), consumed: s.pos + 4 };
}
