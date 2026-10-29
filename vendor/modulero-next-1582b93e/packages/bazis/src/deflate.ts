// zlib / DEFLATE compressor (RFC 1950, RFC 1951) for the BAZIS writer: the model block of a BZ85 file is a zlib
// stream. One block with the fixed Huffman codes and a greedy LZ77 match over a 32 KiB window — any inflater reads
// it (zlib, our inflate.ts); the ratio is not the best, the bytes are the same for the same input.
import { adler32 } from './inflate.js';

const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

const WINDOW = 32768;
const MIN_MATCH = 3;
const MAX_MATCH = 258;
/** Candidates tried per position: enough for the repeated records of a model, cheap enough for a big one. */
const MAX_CHAIN = 48;
const HASH_BITS = 15;

class BitWriter {
  private out: number[] = [];
  private acc = 0;
  private n = 0;
  /** `count` bits of `value`, least significant first (the order of DEFLATE's extra bits and header). */
  bits(value: number, count: number): void {
    this.acc |= value << this.n;
    this.n += count;
    while (this.n >= 8) {
      this.out.push(this.acc & 0xff);
      this.acc >>>= 8;
      this.n -= 8;
    }
  }
  /** A Huffman code: written from its most significant bit. */
  code(value: number, length: number): void {
    let r = 0;
    for (let i = 0; i < length; i++) r = (r << 1) | ((value >> i) & 1);
    this.bits(r, length);
  }
  bytes(): number[] {
    if (this.n > 0) this.out.push(this.acc & 0xff);
    this.acc = 0;
    this.n = 0;
    return this.out;
  }
}

/** The fixed literal/length code of a symbol 0…287 (RFC 1951 §3.2.6). */
function literal(w: BitWriter, sym: number): void {
  if (sym < 144) w.code(0x30 + sym, 8);
  else if (sym < 256) w.code(0x190 + sym - 144, 9);
  else if (sym < 280) w.code(sym - 256, 7);
  else w.code(0xc0 + sym - 280, 8);
}

function lastBelow(table: number[], v: number): number {
  let i = table.length - 1;
  while (table[i] > v) i--;
  return i;
}

function match(w: BitWriter, length: number, distance: number): void {
  const l = lastBelow(LBASE, length);
  literal(w, 257 + l);
  if (LEXT[l]) w.bits(length - LBASE[l], LEXT[l]);
  const d = lastBelow(DBASE, distance);
  w.code(d, 5);
  if (DEXT[d]) w.bits(distance - DBASE[d], DEXT[d]);
}

/** Raw DEFLATE data of `data`: one final block with the fixed codes. */
export function deflateRaw(data: Uint8Array): Uint8Array {
  const w = new BitWriter();
  w.bits(1, 1); // BFINAL
  w.bits(1, 2); // BTYPE 01 — fixed Huffman codes
  const head = new Int32Array(1 << HASH_BITS).fill(-1),
    prev = new Int32Array(WINDOW),
    hash = (i: number) => (((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & ((1 << HASH_BITS) - 1)),
    insert = (i: number) => {
      if (i + MIN_MATCH > data.length) return;
      const h = hash(i);
      prev[i & (WINDOW - 1)] = head[h];
      head[h] = i;
    };
  let i = 0;
  while (i < data.length) {
    let best = 0,
      dist = 0;
    if (i + MIN_MATCH <= data.length) {
      const limit = Math.min(MAX_MATCH, data.length - i);
      let c = head[hash(i)],
        chain = MAX_CHAIN;
      while (c >= 0 && i - c <= WINDOW && chain-- > 0) {
        if (data[c + best] === data[i + best]) {
          let n = 0;
          while (n < limit && data[c + n] === data[i + n]) n++;
          if (n > best) {
            best = n;
            dist = i - c;
            if (n === limit) break;
          }
        }
        const p = prev[c & (WINDOW - 1)];
        if (p >= c) break; // the slot was taken by a newer position
        c = p;
      }
    }
    if (best >= MIN_MATCH) {
      match(w, best, dist);
      for (let k = 0; k < best; k++) insert(i + k);
      i += best;
    } else {
      literal(w, data[i]);
      insert(i);
      i++;
    }
  }
  literal(w, 256);
  return Uint8Array.from(w.bytes());
}

/** A zlib stream (RFC 1950) of `data`: header, raw DEFLATE, Adler-32. */
export function deflateZlib(data: Uint8Array): Uint8Array {
  const body = deflateRaw(data),
    out = new Uint8Array(body.length + 6),
    check = adler32(data);
  out[0] = 0x78; // deflate, 32 KiB window
  out[1] = 0x9c; // default level; (0x78 · 256 + 0x9c) is a multiple of 31
  out.set(body, 2);
  out[out.length - 4] = check >>> 24;
  out[out.length - 3] = (check >>> 16) & 0xff;
  out[out.length - 2] = (check >>> 8) & 0xff;
  out[out.length - 1] = check & 0xff;
  return out;
}
