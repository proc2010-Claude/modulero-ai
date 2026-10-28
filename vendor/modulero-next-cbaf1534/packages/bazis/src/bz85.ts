// BZ85 container reader, strictly after FORMAT_SPEC/bz85.md of the decoder hand-off r1.
//
//   "BZ85" 01 00 00 FF <0> header document  01 00 00 FF <1> zlib(model document) [opaque tail]
//
// A document is: u32 string count, strings (u32 length + UTF-8), then a root node. A node is
// u32 name index, u32 child count, u8 tag (+ value). Children keep their order and repeated names.
// Nothing is interpreted beyond that: an unknown tag or damaged data is a refusal with an offset.
import { decodeUtf16leStrict, decodeUtf8Strict, pyRepr, startsWith } from './bytes.js';
import { BazisError } from './errors.js';
import { DEFAULT_MAX_OUTPUT, InflateError, inflateZlib } from './inflate.js';

export const MAGIC = [0x42, 0x5a, 0x38, 0x35]; // "BZ85"
export const BLOCK_MARKER = [0x01, 0x00, 0x00, 0xff];
export const ANONYMOUS_NAME_INDEX = 0xffffffff;
export const MAX_INPUT_BYTES = 512 * 1024 * 1024;
export const MAX_MODEL_BYTES = DEFAULT_MAX_OUTPUT;
const MAX_DEPTH = 512;
const MAX_EMBEDDED_DEPTH = 32;

export interface ZeroValue { readonly kind: 'zero' }
export interface OpaqueValue { readonly kind: 'opaque' }
export interface BinaryValue {
  readonly kind: 'binary' | 'packed-joint-data' | 'raw-scheme-document';
  readonly data: Uint8Array;
}
export type Value = boolean | number | string | ZeroValue | OpaqueValue | BinaryValue;

export interface PropertyNode {
  readonly type: 'property';
  readonly name: string;
  readonly nameIndex: number;
  readonly typeTag: number;
  readonly value: Value;
  readonly offset: number;
}
export interface RecordNode {
  readonly type: 'record';
  readonly name: string;
  readonly nameIndex: number;
  readonly typeTag: number;
  readonly children: readonly (RecordNode | PropertyNode)[];
  readonly offset: number;
}
export type Node = RecordNode | PropertyNode;

export interface BzDocument {
  readonly strings: readonly string[];
  readonly root: RecordNode;
  /** Bytes of the document itself (string table + nodes). */
  readonly encodedLength: number;
}

export interface Bz85File {
  readonly header: BzDocument;
  readonly model: BzDocument;
  readonly compressedModelSize: number;
  readonly uncompressedModelSize: number;
  readonly trailingBytes: Uint8Array;
}

const ZERO: ZeroValue = Object.freeze({ kind: 'zero' });
const OPAQUE: OpaqueValue = Object.freeze({ kind: 'opaque' });

class Reader {
  pos = 0;
  constructor(readonly data: Uint8Array, readonly label: string) {}
  get remaining(): number { return this.data.length - this.pos; }
  require(size: number): void {
    if (size < 0 || this.pos + size > this.data.length) {
      throw new BazisError(`truncated ${this.label}: need ${size} bytes, have ${this.remaining}`, this.pos);
    }
  }
  read(size: number): Uint8Array {
    this.require(size);
    const out = this.data.subarray(this.pos, this.pos + size);
    this.pos += size;
    return out;
  }
  u8(): number { this.require(1); return this.data[this.pos++]; }
  u32(): number {
    this.require(4);
    const d = this.data, p = this.pos;
    this.pos += 4;
    return (d[p] | (d[p + 1] << 8) | (d[p + 2] << 16) | (d[p + 3] << 24)) >>> 0;
  }
  i32(): number { return this.u32() | 0; }
  f64(): number {
    this.require(8);
    const v = new DataView(this.data.buffer, this.data.byteOffset + this.pos, 8).getFloat64(0, true);
    this.pos += 8;
    return v;
  }
}

function tableName(strings: readonly string[], index: number, offset: number): string {
  if (index >= strings.length) {
    throw new BazisError(`string-table index ${index} is outside 0..${strings.length - 1}`, offset);
  }
  return strings[index];
}

function readStringTable(r: Reader): string[] {
  const countOffset = r.pos;
  const count = r.u32();
  if (count > 1_000_000) throw new BazisError(`unreasonable string-table size ${count}`, countOffset);
  const out: string[] = [];
  for (let index = 0; index < count; index++) {
    const lengthOffset = r.pos;
    const length = r.u32();
    if (length > r.remaining) throw new BazisError(`string ${index} length ${length} exceeds remaining payload`, lengthOffset);
    const raw = r.read(length);
    try {
      out.push(decodeUtf8Strict(raw));
    } catch (e) {
      throw new BazisError(`string ${index} is not valid UTF-8: ${(e as Error).message}`, lengthOffset + 4);
    }
  }
  return out;
}

function readValue(r: Reader, tag: number, offset: number, fieldName: string): Value {
  switch (tag) {
    case 0: return ZERO;
    case 1: return false;
    case 2: return true;
    case 3: return r.u8();
    case 4: return r.i32();
    case 5: return r.f64();
    case 6: {
      const countOffset = r.pos;
      const chars = r.u32();
      const bytes = chars * 2;
      if (bytes > r.remaining) throw new BazisError(`UTF-16 value length ${chars} exceeds remaining payload`, countOffset);
      const raw = r.read(bytes);
      // JointData and Scheme keep a nested block in a string slot: every byte is kept, none is text.
      if (fieldName === 'JointData' && startsWith(raw, [...BLOCK_MARKER, 0x01])) return { kind: 'packed-joint-data', data: raw };
      if (fieldName === 'Scheme' && startsWith(raw, [...BLOCK_MARKER, 0x00])) return { kind: 'raw-scheme-document', data: raw };
      try {
        return decodeUtf16leStrict(raw);
      } catch (e) {
        throw new BazisError(`invalid UTF-16 value: ${(e as Error).message}`, countOffset + 4);
      }
    }
    case 7: {
      const lengthOffset = r.pos;
      const length = r.u32();
      if (length > r.remaining) throw new BazisError(`binary value length ${length} exceeds remaining payload`, lengthOffset);
      return { kind: 'binary', data: r.read(length) };
    }
    case 8: return OPAQUE;
    case 9: return r.f64();
    default: throw new BazisError(`unsupported primitive type tag ${tag}`, offset + 8);
  }
}

function readRecord(r: Reader, strings: readonly string[], depth: number, anonymousRoot: boolean): RecordNode {
  if (depth > MAX_DEPTH) throw new BazisError(`record nesting exceeds ${MAX_DEPTH} levels`, r.pos);
  const offset = r.pos;
  const nameIndex = r.u32();
  const childCount = r.u32();
  const typeTag = r.u8();
  const name = (depth > 0 || anonymousRoot) && nameIndex === ANONYMOUS_NAME_INDEX ? '' : tableName(strings, nameIndex, offset);
  if (childCount > 10_000_000) throw new BazisError(`unreasonable child count ${childCount}`, offset + 4);
  if (typeTag !== 0) throw new BazisError(`container ${pyRepr(name)} has unsupported value tag ${typeTag}`, offset + 8);
  const children: (RecordNode | PropertyNode)[] = [];
  for (let i = 0; i < childCount; i++) {
    const childOffset = r.pos;
    const childNameIndex = r.u32();
    const grandCount = r.u32();
    const childTag = r.u8();
    const childName = childNameIndex === ANONYMOUS_NAME_INDEX ? '' : tableName(strings, childNameIndex, childOffset);
    if (grandCount) {
      if (childTag !== 0) throw new BazisError(`container ${pyRepr(childName)} has unsupported value tag ${childTag}`, childOffset + 8);
      r.pos = childOffset; // the recursive call reads the whole node header again
      children.push(readRecord(r, strings, depth + 1, false));
    } else {
      const value = readValue(r, childTag, childOffset, childName);
      children.push({ type: 'property', name: childName, nameIndex: childNameIndex, typeTag: childTag, value, offset: childOffset });
    }
  }
  return { type: 'record', name, nameIndex, typeTag, children, offset };
}

export function decodeDocument(data: Uint8Array, label = 'document', anonymousRoot = false): BzDocument {
  const r = new Reader(data, label);
  try {
    const strings = readStringTable(r);
    const root = readRecord(r, strings, 0, anonymousRoot);
    return { strings, root, encodedLength: r.pos };
  } catch (e) {
    if (e instanceof BazisError) e.region = 'decoded';
    throw e;
  }
}

// ---------------------------------------------------------------- tree walking

/** Visits every node of a document in document order, like the reference `indexed_nodes`. */
export function walkNodes(
  doc: BzDocument,
  space: string,
  visit: (node: Node, locator: () => string) => void,
): void {
  const segments: string[] = [];
  const locator = (): string => `${space}/${segments.join('/')}`;
  const go = (node: Node, index: number): void => {
    segments.push(`${node.name}[${index}]@${node.offset}`);
    visit(node, locator);
    if (node.type === 'record') node.children.forEach((c, i) => go(c, i));
    segments.pop();
  };
  go(doc.root, 0);
}

// ---------------------------------------------------------------- nested documents

function embeddedError(detail: string, offset: number, region: 'stored' | 'decoded' = 'stored'): BazisError {
  const e = new BazisError(detail, offset);
  e.region = region;
  return e;
}

function decodePackedJointData(value: BinaryValue): BzDocument {
  const raw = value.data;
  let result;
  try {
    result = inflateZlib(raw.subarray(5), { maxOutput: MAX_MODEL_BYTES });
  } catch (e) {
    if (!(e instanceof InflateError)) throw e;
    if (e.kind === 'invalid') throw embeddedError(`invalid packed JointData zlib: ${e.message}`, 5);
    if (e.kind === 'limit') throw embeddedError('packed JointData exceeds expansion limit', 5);
    throw embeddedError('truncated packed JointData zlib', 5);
  }
  const unused = raw.length - (5 + result.consumed);
  if (unused > 1) {
    throw embeddedError('packed JointData has excess trailing storage bytes', raw.length - unused);
  }
  const doc = decodeDocument(result.data, 'packed JointData', true);
  if (doc.encodedLength !== result.data.length) {
    throw embeddedError('packed JointData has undecoded document bytes', doc.encodedLength, 'decoded');
  }
  return doc;
}

function decodeRawScheme(value: BinaryValue): BzDocument {
  const raw = value.data;
  const doc = decodeDocument(raw.subarray(5), 'raw Scheme', true);
  if (raw.length - (5 + doc.encodedLength) > 1) {
    throw embeddedError('raw Scheme has excess trailing storage bytes', 5 + doc.encodedLength);
  }
  return doc;
}

/** Decodes every nested JointData/Scheme block, recursively, so damage in them is not silently kept. */
function validateEmbedded(doc: BzDocument, depth: number, space: string): void {
  if (depth > MAX_EMBEDDED_DEPTH) {
    throw new BazisError(`embedded document nesting exceeds ${MAX_EMBEDDED_DEPTH} levels`, null, space);
  }
  walkNodes(doc, space, (node, locator) => {
    if (node.type !== 'property') return;
    const v = node.value;
    if (typeof v !== 'object' || (v.kind !== 'packed-joint-data' && v.kind !== 'raw-scheme-document')) return;
    const where = locator();
    const nestedSpace = `nested:${where}`;
    try {
      const nested = v.kind === 'packed-joint-data' ? decodePackedJointData(v) : decodeRawScheme(v);
      validateEmbedded(nested, depth + 1, nestedSpace);
    } catch (e) {
      if (e instanceof BazisError && !e.attributed) {
        e.offsetSpace = e.region === 'decoded' ? nestedSpace : `stored:${where}`;
        e.attributed = true;
      }
      throw e;
    }
  });
}

// ---------------------------------------------------------------- container

export function decodeBz85(data: Uint8Array, sourceName = '<bytes>'): Bz85File {
  if (data.length > MAX_INPUT_BYTES) throw new BazisError(`input is ${data.length} bytes; safety limit is ${MAX_INPUT_BYTES}`, 0);
  if (!startsWith(data, MAGIC)) throw new BazisError(`'${sourceName}' does not start with BZ85 magic`, 0);
  const r = new Reader(data, sourceName);
  r.read(MAGIC.length);
  let markerOffset = r.pos;
  if (!startsWith(r.read(4), BLOCK_MARKER)) throw new BazisError('unsupported first block marker', markerOffset);
  let compression = r.u8();
  if (compression !== 0) throw new BazisError(`expected raw metadata block, got compression flag ${compression}`, r.pos - 1);

  const headerStart = r.pos;
  let header: BzDocument;
  try {
    header = decodeDocument(data.subarray(headerStart), `${sourceName}:header`);
  } catch (e) {
    if (e instanceof BazisError) throw new BazisError(e.detail, e.offset, 'source_header_payload');
    throw e;
  }
  r.pos = headerStart + header.encodedLength;

  markerOffset = r.pos;
  if (!startsWith(r.read(4), BLOCK_MARKER)) throw new BazisError('unsupported model block marker', markerOffset);
  compression = r.u8();
  if (compression !== 1) throw new BazisError(`expected zlib model block, got compression flag ${compression}`, r.pos - 1);

  const zlibStart = r.pos;
  let modelBytes: Uint8Array;
  let consumed: number;
  try {
    const inflated = inflateZlib(data.subarray(zlibStart), { maxOutput: MAX_MODEL_BYTES });
    modelBytes = inflated.data;
    consumed = inflated.consumed;
  } catch (e) {
    if (!(e instanceof InflateError)) throw e;
    if (e.kind === 'limit') throw new BazisError(`expanded model exceeds safety limit ${MAX_MODEL_BYTES}`, zlibStart);
    if (e.kind === 'truncated') throw new BazisError('truncated zlib model block', zlibStart);
    throw new BazisError(`invalid zlib model block: ${e.message}`, zlibStart);
  }
  let model: BzDocument;
  try {
    model = decodeDocument(modelBytes, `${sourceName}:model`);
  } catch (e) {
    if (e instanceof BazisError) throw new BazisError(e.detail, e.offset, 'decoded_model_payload');
    throw e;
  }
  if (model.encodedLength !== modelBytes.length) {
    throw new BazisError(`model document has ${modelBytes.length - model.encodedLength} undecoded bytes`, model.encodedLength);
  }
  validateEmbedded(header, 0, 'header_source_payload');
  validateEmbedded(model, 0, 'decoded_model_payload');
  return {
    header,
    model,
    compressedModelSize: consumed,
    uncompressedModelSize: modelBytes.length,
    trailingBytes: data.slice(zlibStart + consumed),
  };
}
