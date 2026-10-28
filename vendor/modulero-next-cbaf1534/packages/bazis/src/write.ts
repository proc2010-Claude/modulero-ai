// BZ85 container writer: the inverse of bz85.ts, strictly the same layout.
//
//   "BZ85" 01 00 00 FF 00 header document  01 00 00 FF 01 zlib(model document)
//
// A document is a string table (u32 count, then u32 byte length + UTF-8 per string) and a root record; a node is
// u32 name index, u32 child count, u8 tag (+ value). A record has children and tag 0; a property has none and its
// value after the tag. The writer knows only the container: what the nodes mean is the caller's (MOD-DEC-250 — the
// files are made by the engine of Modulero, BAZIS only reads them).
import { ANONYMOUS_NAME_INDEX, BLOCK_MARKER, MAGIC } from './bz85.js';
import { deflateZlib } from './deflate.js';

/** The value of a property with its type tag, as the reader decodes it (bz85.ts `readValue`). */
export type WriteValue =
  | { tag: 0 }
  | { tag: 1 }
  | { tag: 2 }
  | { tag: 3; value: number }
  | { tag: 4; value: number }
  | { tag: 5; value: number }
  | { tag: 9; value: number }
  | { tag: 6; value: string }
  /** A nested block kept in a string slot (JointData, Scheme): the bytes as they are, an even count. */
  | { tag: 6; raw: Uint8Array }
  | { tag: 7; data: Uint8Array }
  | { tag: 8 };

export interface WriteProperty {
  /** null — an anonymous node (name index FFFFFFFF). */
  name: string | null;
  value: WriteValue;
}
export interface WriteRecord {
  name: string | null;
  children: WriteNode[];
}
export type WriteNode = WriteProperty | WriteRecord;

const isRecord = (n: WriteNode): n is WriteRecord => 'children' in n;

// ---------------------------------------------------------------- shorthands for the caller

export const record = (name: string | null, children: WriteNode[]): WriteRecord => ({ name, children });
export const flag = (name: string, v: boolean): WriteProperty => ({ name, value: v ? { tag: 2 } : { tag: 1 } });
export const u8 = (name: string, v: number): WriteProperty => ({ name, value: { tag: 3, value: v } });
export const i32 = (name: string, v: number): WriteProperty => ({ name, value: { tag: 4, value: v } });
/** An integer as BAZIS saves it: one byte when it fits, otherwise four. */
export const int = (name: string, v: number): WriteProperty => (v >= 0 && v <= 255 ? u8(name, v) : i32(name, v));
export const f64 = (name: string, v: number): WriteProperty => ({ name, value: { tag: 5, value: v } });
export const text = (name: string, v: string): WriteProperty => ({ name, value: { tag: 6, value: v } });
export const bytes = (name: string, v: Uint8Array): WriteProperty => ({ name, value: { tag: 7, data: v } });
export const zero = (name: string): WriteProperty => ({ name, value: { tag: 0 } });

// ---------------------------------------------------------------- encoding

class Out {
  private chunks: Uint8Array[] = [];
  private cur = new Uint8Array(1 << 16);
  private n = 0;
  length = 0;
  private room(k: number): void {
    if (this.n + k <= this.cur.length) return;
    this.chunks.push(this.cur.subarray(0, this.n));
    this.cur = new Uint8Array(Math.max(1 << 16, k));
    this.n = 0;
  }
  u8(v: number): void {
    this.room(1);
    this.cur[this.n++] = v & 0xff;
    this.length++;
  }
  u32(v: number): void {
    this.room(4);
    const x = v >>> 0;
    this.cur[this.n++] = x & 0xff;
    this.cur[this.n++] = (x >>> 8) & 0xff;
    this.cur[this.n++] = (x >>> 16) & 0xff;
    this.cur[this.n++] = x >>> 24;
    this.length += 4;
  }
  f64(v: number): void {
    this.room(8);
    new DataView(this.cur.buffer, this.cur.byteOffset + this.n, 8).setFloat64(0, v, true);
    this.n += 8;
    this.length += 8;
  }
  raw(b: Uint8Array): void {
    this.room(b.length);
    this.cur.set(b, this.n);
    this.n += b.length;
    this.length += b.length;
  }
  bytes(): Uint8Array {
    const all = new Uint8Array(this.length);
    let at = 0;
    for (const c of [...this.chunks, this.cur.subarray(0, this.n)]) {
      all.set(c, at);
      at += c.length;
    }
    return all;
  }
}

/** UTF-8 of a string; a lone surrogate is refused, as the reader refuses it. */
export function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) c = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00);
    else if (c >= 0xd800 && c <= 0xdfff) throw new RangeError(`lone surrogate at ${i}`);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

function utf16le(s: string): Uint8Array {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) i++;
    else if (c >= 0xd800 && c <= 0xdfff) throw new RangeError(`lone surrogate at ${i}`);
  }
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    out[2 * i] = s.charCodeAt(i) & 0xff;
    out[2 * i + 1] = s.charCodeAt(i) >> 8;
  }
  return out;
}

function writeValue(o: Out, v: WriteValue): void {
  switch (v.tag) {
    case 0:
    case 1:
    case 2:
    case 8:
      return;
    case 3:
      if (!Number.isInteger(v.value) || v.value < 0 || v.value > 255) throw new RangeError(`u8 value ${v.value}`);
      return o.u8(v.value);
    case 4:
      if (!Number.isInteger(v.value) || v.value < -0x80000000 || v.value > 0xffffffff) throw new RangeError(`i32 value ${v.value}`);
      return o.u32(v.value);
    case 5:
    case 9:
      return o.f64(v.value);
    case 6: {
      const b = 'raw' in v ? v.raw : utf16le(v.value);
      if (b.length % 2) throw new RangeError('a string slot holds an even number of bytes');
      o.u32(b.length / 2);
      return o.raw(b);
    }
    case 7:
      o.u32(v.data.length);
      return o.raw(v.data);
  }
}

/** A document: the string table of the names in their first use and the root record. */
export function encodeDocument(root: WriteRecord): Uint8Array {
  const index = new Map<string, number>(),
    strings: string[] = [];
  const collect = (n: WriteNode) => {
    if (n.name !== null && !index.has(n.name)) {
      index.set(n.name, strings.length);
      strings.push(n.name);
    }
    if (isRecord(n)) n.children.forEach(collect);
  };
  collect(root);
  const o = new Out();
  o.u32(strings.length);
  for (const s of strings) {
    const b = utf8(s);
    o.u32(b.length);
    o.raw(b);
  }
  const node = (n: WriteNode) => {
    o.u32(n.name === null ? ANONYMOUS_NAME_INDEX : index.get(n.name)!);
    if (isRecord(n)) {
      // A record without children would be read back as a property with the value 0.
      if (!n.children.length) throw new RangeError(`record ${n.name} has no children`);
      o.u32(n.children.length);
      o.u8(0);
      n.children.forEach(node);
    } else {
      o.u32(0);
      o.u8(n.value.tag);
      writeValue(o, n.value);
    }
  };
  node(root);
  return o.bytes();
}

/** A BZ85 file: the header document as is, the model document compressed with zlib. */
export function encodeBz85(header: WriteRecord, model: WriteRecord): Uint8Array {
  const h = encodeDocument(header),
    m = deflateZlib(encodeDocument(model)),
    out = new Uint8Array(MAGIC.length + 5 + h.length + 5 + m.length);
  let at = 0;
  const put = (b: ArrayLike<number>) => {
    out.set(b, at);
    at += b.length;
  };
  put(MAGIC);
  put([...BLOCK_MARKER, 0]);
  put(h);
  put([...BLOCK_MARKER, 1]);
  put(m);
  return out;
}
