// bytes -> JSON, the TypeScript counterpart of decode() in handoff_api.py (modulero.bazis.handoff/1).
//
// Ported: container and tree, identity (article, name, version), hole definitions, literal fields,
// opaque binary payloads, refusals. NOT ported: scene, geometry, boundingBox and materials (mesh and
// profile reconstruction), the XML branch, encode_tree and the b3d exporter.
// Like the reference, nothing is claimed beyond the bytes: units are null, nothing is production
// qualified, hole definitions stay "ГИПОТЕЗА" until they are placed (see placement.ts).
import { startsWith, toBase64 } from './bytes.js';
import { BazisError } from './errors.js';
import { decodeBz85, MAX_INPUT_BYTES, walkNodes } from './bz85.js';
import type { Bz85File, PropertyNode, RecordNode } from './bz85.js';
import { sha256Hex } from './sha256.js';
import { bz85ToJson, setOwn, valueToJson } from './tree-json.js';
import type { Json, JsonObject } from './tree-json.js';

export const HANDOFF_SCHEMA = 'modulero.bazis.handoff/1';
/** The handoff API refuses larger inputs without copying them (same limit as the reference). */
export const HANDOFF_INPUT_LIMIT = 32 * 1024 * 1024;

const LITERAL_FIELD_NAMES = ['HardwareKey', 'Article', 'Code', 'Mat', 'Material', 'Name', 'DrillMode', 'Type', 'ParamType'];

export interface BazisDecoded extends JsonObject {
  schema: typeof HANDOFF_SCHEMA;
  format: string;
  status: 'PARTIAL' | 'REJECTED';
}

function rawBlob(data: Uint8Array, path: string, reason: string): JsonObject {
  return { path, encoding: 'base64', bytes: toBase64(data), sha256: sha256Hex(data), status: 'НЕИЗВЕСТНО', reason };
}

function scalars(record: RecordNode): JsonObject {
  const out: JsonObject = {};
  for (const c of record.children) if (c.type === 'property') setOwn(out, c.name, valueToJson(c.value, true));
  return out;
}

function truthy(v: Json | undefined): boolean {
  return !(v === undefined || v === null || v === false || v === 0 || v === '');
}

function isNumber(v: Json | undefined): v is number {
  return typeof v === 'number';
}

function lstripAscii(data: Uint8Array): Uint8Array {
  let i = 0;
  while (i < data.length && (data[i] === 0x20 || (data[i] >= 0x09 && data[i] <= 0x0d))) i++;
  return data.subarray(i);
}

/**
 * Decodes a BAZIS BZ85 file (.f3d, .fr3d, .b3d). `extension` is only a hint: the signature does not
 * tell the three apart. Never throws for bad data: a refusal comes back as status "REJECTED" with
 * `error` {code, message, offset, offsetSpace} and the untouched source in `rawSource`/`unparsed`.
 */
export function decodeBazis(data: Uint8Array, extension?: string | null): BazisDecoded {
  if (!(data instanceof Uint8Array)) throw new TypeError('decodeBazis expects a Uint8Array');
  const ext = typeof extension === 'string' ? extension.toLowerCase().replace(/^\.+/, '') : null;
  const result: JsonObject = {
    schema: HANDOFF_SCHEMA, format: ext || 'unknown', formatVersion: null, article: null, name: null, units: null,
    holes: [], hardwareKey: null, engineeringComplete: false, productionQualified: false, cncRelease: false,
    sourceSha256: sha256Hex(data), sourceBytes: data.length, unparsed: [], warnings: [], status: 'PARTIAL',
  };
  const unparsed = result.unparsed as Json[];
  const warnings = result.warnings as Json[];
  if (data.length > HANDOFF_INPUT_LIMIT) {
    result.status = 'REJECTED';
    result.error = { code: 'INPUT_LIMIT', message: 'Handoff API limit: 32 MiB; retain caller input' };
    return result as BazisDecoded;
  }
  result.rawSource = rawBlob(data, '/', 'Exact original; structural recovery is not engineering interpretation');
  const head = lstripAscii(data);
  if (ext === 'xml' || startsWith(head, [0x3c, 0x3f, 0x78, 0x6d, 0x6c]) || startsWith(head, Array.from('<Materials', (c) => c.charCodeAt(0)))) {
    result.status = 'REJECTED';
    result.error = { code: 'XML_NOT_SUPPORTED', message: 'XML is outside the TypeScript reader (only BZ85 .f3d/.fr3d/.b3d are read)' };
    unparsed.push(rawBlob(data, '/', 'XML is not read by the TypeScript reader'));
    return result as BazisDecoded;
  }
  if (!startsWith(data, [0x42, 0x5a, 0x38, 0x35])) {
    result.status = 'REJECTED';
    result.error = { code: 'UNSUPPORTED_FORMAT', message: 'Expected BZ85 or XML; extension does not prove format' };
    unparsed.push(rawBlob(data, '/', 'Unknown format'));
    return result as BazisDecoded;
  }
  result.format = ext === 'f3d' || ext === 'fr3d' || ext === 'b3d' ? ext : 'bz85';
  let file: Bz85File;
  try {
    file = decodeBz85(data);
  } catch (e) {
    if (!(e instanceof BazisError)) throw e;
    result.status = 'REJECTED';
    result.error = { code: 'INVALID_OR_UNSUPPORTED_BZ85', message: e.message, offset: e.offset, offsetSpace: e.offsetSpace };
    unparsed.push(rawBlob(data, '/', 'Cannot safely skip unsupported field: raw source preserved'));
    return result as BazisDecoded;
  }
  result.tree = bz85ToJson(file, result.sourceSha256 as string, true);

  const header = scalars(file.header.root);
  const articleNode = file.header.root.children.find((c): c is RecordNode => c.type === 'record' && c.name === 'Article');
  const identity = articleNode ? scalars(articleNode) : header;
  const model = scalars(file.model.root);
  const version: JsonObject = {};
  for (const [k, v] of Object.entries(model)) if (k.toLowerCase().startsWith('version')) setOwn(version, k, v);
  result.formatVersion = version;
  result.article = truthy(identity.Code) ? (identity.Code as Json) : null;
  result.name = truthy(identity.Name) ? (identity.Name as Json) : null;
  result.identityEvidence = {
    status: 'ПРОВЕРЕНО', scope: 'literal Header/Article fields; no filename inference', fields: identity,
  };
  const holes = result.holes as Json[];
  const fields: JsonObject[] = [];
  for (const [space, doc] of [['header', file.header], ['model', file.model]] as const) {
    walkNodes(doc, space, (node, locator) => {
      if (node.type === 'record') {
        if (node.name !== 'Hole') return;
        const v = scalars(node);
        const pos = [v.X, v.Y, v.Z];
        const dir = [v.DirX, v.DirY, v.DirZ];
        const radius = v.Radius;
        let diameter: Json = null;
        if (isNumber(radius) && Number.isFinite(radius)) {
          diameter = 2 * radius;
          if (!Number.isFinite(diameter)) diameter = diameter > 0 ? 'inf' : '-inf';
        }
        holes.push({
          path: locator(),
          position: pos.every(isNumber) ? (pos as number[]) : null,
          direction: dir.every(isNumber) ? (dir as number[]) : null,
          diameter, depth: v.Depth ?? null, drillMode: v.DrillMode ?? null,
          status: 'ГИПОТЕЗА', literalFieldsStatus: 'ПРОВЕРЕНО', coordinateSpace: 'definition_local_unqualified',
          qualification: 'No placement, target panel assignment or manufacturer drawing validation', rawFields: v,
        });
        return;
      }
      const prop: PropertyNode = node;
      if (LITERAL_FIELD_NAMES.includes(prop.name)) {
        fields.push({ path: locator(), name: prop.name, value: valueToJson(prop.value, true) });
      }
      const value = prop.value;
      if (typeof value === 'object' && 'data' in value) {
        unparsed.push(rawBlob(value.data, locator(), 'Raw binary retained, including partially decoded geometric payloads'));
      }
    });
  }
  result.literalFields = fields;
  const keys = fields.filter((f) => f.name === 'HardwareKey');
  result.hardwareKeys = keys;
  if (keys.length === 1) result.hardwareKey = keys[0].value;
  if (file.trailingBytes.length) unparsed.push(rawBlob(file.trailingBytes, 'trailing', 'Opaque bytes after zlib stream'));
  warnings.push('Structural parse does not qualify drilling, materials, physical units, animation or native completeness');
  return result as BazisDecoded;
}

export { MAX_INPUT_BYTES };
