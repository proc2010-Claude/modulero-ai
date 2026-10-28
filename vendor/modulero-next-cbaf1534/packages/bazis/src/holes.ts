// bytes of a .f3d / .fr3d -> normalized holes (MOD-DEC-275…277).
//
//  - .fr3d (kit): holes come from the kit and are placed with Obj/Trans into product axes;
//    source "kit", complete true (the kit carries its own drilling);
//  - .f3d (single part): the part has no instances, so the definition holes are returned in the
//    definition's local axes; source "part", complete false. The missing holes are added later from
//    the manufacturer's catalogue; a part without a catalogue is flagged "drilling incomplete".
// The article is the literal Header/Article/Code of the model, never the file name.
import { BazisError } from './errors.js';
import { decodeBz85 } from './bz85.js';
import type { RecordNode } from './bz85.js';
import { normalizeHoles } from './normalize.js';
import type { BazisHole, HoleSource } from './normalize.js';
import { holeDefinitions, partHoles, placedHoles } from './placement.js';
import type { RawHole } from './placement.js';
import { sha256Hex } from './sha256.js';

export interface BazisHoles {
  format: 'f3d' | 'fr3d';
  sourceSha256: string;
  sourceBytes: number;
  /** Header/Article/Code, or null when the model has none. */
  article: string | null;
  /** Header/Article/Name, or null. */
  name: string | null;
  source: HoleSource;
  /** false for a single .f3d part: its drilling may lack holes that the kit (.fr3d) carries. */
  complete: boolean;
  /** Number of FurnList definitions in the model. */
  definitions: number;
  /** Holes before merging duplicates. */
  rawHoleCount: number;
  /** FastIDs of definitions that no Obj of the kit refers to (always empty for a part). */
  unplacedDefinitions: number[];
  holes: BazisHole[];
}

/** The last non-empty text property of that name, like the reference decoder's identity lookup. */
function textField(root: RecordNode, name: string): string | null {
  let value: string | null = null;
  for (const c of root.children) {
    if (c.type === 'property' && c.name === name && typeof c.value === 'string' && c.value) value = c.value;
  }
  return value;
}

/**
 * Reads the holes of a hardware file. `extension` ("f3d" or "fr3d", with or without a dot) says whether
 * the bytes are a single part or a kit. Throws BazisError (with offset and offsetSpace) for damaged
 * data, an unknown tag, a hole without numeric fields or anything else it cannot read: nothing is guessed.
 */
export function readHoles(data: Uint8Array, extension: string): BazisHoles {
  if (!(data instanceof Uint8Array)) throw new TypeError('readHoles expects a Uint8Array');
  const ext = extension.toLowerCase().replace(/^\.+/, '');
  if (ext !== 'f3d' && ext !== 'fr3d') throw new BazisError(`holes are read from .f3d and .fr3d, not from '${extension}'`);
  const file = decodeBz85(data);
  const model = file.model.root;
  const articleRecord = file.header.root.children.find((c): c is RecordNode => c.type === 'record' && c.name === 'Article');
  const identity = articleRecord ?? file.header.root;
  const defs = holeDefinitions(model);
  const source: HoleSource = ext === 'fr3d' ? 'kit' : 'part';
  let raw: RawHole[];
  let unplaced: number[] = [];
  if (source === 'kit') {
    const placed = placedHoles(model, defs);
    raw = placed.holes;
    unplaced = placed.unplaced;
  } else {
    raw = partHoles(defs);
  }
  return {
    format: ext, sourceSha256: sha256Hex(data), sourceBytes: data.length,
    article: textField(identity, 'Code'), name: textField(identity, 'Name'),
    source, complete: source === 'kit', definitions: defs.size, rawHoleCount: raw.length,
    unplacedDefinitions: unplaced, holes: normalizeHoles(raw, source),
  };
}
