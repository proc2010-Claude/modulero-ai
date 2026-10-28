// BZ85 tree -> JSON, following FORMAT_SPEC/json_contract.md of the decoder hand-off r1:
// order and repeated names are kept, binary payloads are kept (base64), non-finite numbers are
// written as the strings "nan", "inf", "-inf" (the raw bytes stay in rawSource), nothing is defaulted.
import { toBase64 } from './bytes.js';
import type { Bz85File, Node, RecordNode, Value } from './bz85.js';
import { sha256Hex } from './sha256.js';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Object with own keys only: a property called "__proto__" must stay data. */
export function setOwn(target: JsonObject, key: string, value: Json): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

export function valueToJson(value: Value, includeBinary: boolean): Json {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'nan';
    if (value === Infinity) return 'inf';
    if (value === -Infinity) return '-inf';
    return value;
  }
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  switch (value.kind) {
    case 'zero':
      return { kind: 'zero-child-tag-0', typeTag: 0, semantics: 'AMBIGUOUS_EMPTY_CONTAINER_OR_NULL' };
    case 'opaque':
      return { kind: 'opaque-marker', typeTag: 8, payloadBytes: 0, semantics: 'UNINTERPRETED' };
    case 'raw-scheme-document':
    case 'packed-joint-data':
      return {
        kind: value.kind, storageTypeTag: 6, codeUnits: value.data.length >> 1, length: value.data.length,
        sha256: sha256Hex(value.data), base64: toBase64(value.data),
        semantics: value.kind === 'packed-joint-data' ? 'UNINTERPRETED_JOINT_DATA' : 'UNINTERPRETED_SCHEME',
      };
    default: {
      const d = value.data;
      const isPng = d.length >= 8 && PNG_SIGNATURE.every((b, i) => d[i] === b);
      const out: JsonObject = { kind: isPng ? 'png' : 'binary', length: d.length, sha256: sha256Hex(d) };
      if (isPng && d.length >= 24) {
        const dv = new DataView(d.buffer, d.byteOffset, d.length);
        out.width = dv.getUint32(16, false);
        out.height = dv.getUint32(20, false);
      }
      if (includeBinary) out.base64 = toBase64(d);
      return out;
    }
  }
}

export function recordToJson(record: RecordNode, includeBinary: boolean): JsonObject {
  const children: Json[] = record.children.map((child: Node): JsonObject =>
    child.type === 'record'
      ? { record: recordToJson(child, includeBinary) }
      : {
          property: {
            name: child.name, nameIndex: child.nameIndex, typeTag: child.typeTag,
            value: valueToJson(child.value, includeBinary), offset: child.offset,
          },
        });
  return { name: record.name, nameIndex: record.nameIndex, typeTag: record.typeTag, offset: record.offset, children };
}

export function bz85ToJson(file: Bz85File, sourceSha256: string, includeBinary = true): JsonObject {
  const trailing: JsonObject = { length: file.trailingBytes.length };
  if (file.trailingBytes.length) {
    trailing.sha256 = sha256Hex(file.trailingBytes);
    if (includeBinary) trailing.base64 = toBase64(file.trailingBytes);
  }
  return {
    format: 'BAZIS BZ85',
    source: '<bytes>',
    sourceSha256,
    header: { strings: [...file.header.strings], root: recordToJson(file.header.root, includeBinary) },
    model: {
      strings: [...file.model.strings],
      root: recordToJson(file.model.root, includeBinary),
      compressedBytes: file.compressedModelSize,
      uncompressedBytes: file.uncompressedModelSize,
    },
    trailingBytes: trailing,
  };
}
