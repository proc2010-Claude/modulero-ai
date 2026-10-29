// Push latches of the doors opened by pressing (MOD-DEC-483, FINDINGS 1063–1065): one BOYARD AMF14 per door near its
// free edge, in the front edge of the horizontal carcass panel behind the door — the roof for a door up to the roof,
// a fixed shelf or the bottom for a door of a row. The hole is the manufacturer's (277): Ø10 × 70 in the middle of the
// panel thickness, from the kit .fr3d and the catalogue page (BOYARD 2024, p. 103); the door stands 2 mm in front of
// the edge — the depth gap of the wardrobe (162). Where the latch stands along the edge is the executor's (Д).
import type { FittingsCatalog } from '../catalog/hardware/fittings.js';
import { latchFor, latchPlacement, type FittingsChoice } from '../engine/policy/fittings-selection.js';
import type { Rec } from '../engine/policy/project-state.js';
import { carcassBoxes } from './fasteners-r7.js';
import { addEdgeHole } from './primitives.js';

/** The latch of one door. */
export interface PushLatchFitting {
  /** `<door>-LATCH`: the PUSH_LATCH mechanism keeps it. */
  id: string;
  doorId: string;
  sectionId: string;
  latchId: string;
  brand: string;
  article: string;
  name: string;
  /** The panel it is set in, by its front edge. */
  panelId: string;
  /** The axis of the latch: across the width (X) and its height (the middle of the panel thickness), product axes. */
  xMm: number;
  elevationMm: number;
  priceRub: number | null;
}

export interface PushLatchBuild {
  latches: PushLatchFitting[];
  /** Doors that get no latch, with the reason (Russian, for the editor and the bell). */
  notes: { doorId: string; text: string }[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;
/** A front edge flush with the carcass front: the door works across the gap of 162, as the catalogue draws. */
const FLUSH_MM = 0.5;

/**
 * The latches of the doors of a model (`m` with modules, parts, sectionsData, moduleBreaks and t): the holes go into
 * `holes`, owned by the latch as the hinge holes by their hinge. No latch without push to open, for a lift front or
 * for a door without a flush horizontal panel behind it.
 */
export function pushLatches(m: Rec, choice: FittingsChoice | null, catalog: FittingsCatalog, holes: Rec[]): PushLatchBuild {
  const out: PushLatchBuild = { latches: [], notes: [] };
  if (!choice?.pushToOpen) return out;
  const latch = latchFor(catalog),
    hole = latch?.hole.value ?? null,
    boxes = carcassBoxes(m).filter((b) => ['top', 'bottom', 'fixedShelf'].includes(b.part.kind) && Math.abs(b.z0) <= FLUSH_MM);
  for (const s of m.sectionsData as Rec[])
    for (const f of s.facades as Rec[]) {
      const door = (m.parts as Rec[]).find((p) => p.id === f.id);
      if (!door?.facadeBox || f.liftFront || door.kind !== 'facade') continue;
      if (!latch || !hole) {
        out.notes.push({ doorId: door.id, text: `${door.id}: в каталоге нет толкателя с отверстием — открывание нажатием без толкателя` });
        continue;
      }
      const b = door.facadeBox;
      // An inset door stands in the opening: no front edge of the carcass is behind it (FINDINGS 1064).
      if (b.z0 >= -FLUSH_MM) {
        out.notes.push({ doorId: door.id, text: `${door.id}: вкладная дверь — за ней нет кромки корпуса, толкатель AMF14 некуда поставить` });
        continue;
      }
      const at = latchPlacement(b, door.handedness ?? f.hingeSide, boxes, hole.diameterMm);
      if (!at) {
        out.notes.push({ doorId: door.id, text: `${door.id}: за дверью у свободного края нет крыши, дна или неподвижной полки вровень с корпусом — толкатель некуда поставить` });
        continue;
      }
      const { panel: behind, xMm: x } = at,
        id = `${door.id}-LATCH`;
      addEdgeHole(holes, behind.id, 'A', x - behind.x0, hole.diameterMm, hole.depthMm, `Толкатель ${latch.brand} ${latch.article} двери ${door.id}`, `D${hole.diameterMm}/L${hole.depthMm}`, {
        machiningRole: 'PUSH_LATCH',
        mechanismId: id,
        holeSource: 'MANUFACTURER_CATALOG',
        holeSourceRef: `${latch.hole.ref!.doc} sha256:${latch.hole.ref!.sha256} · ${latch.hole.ref!.page}`,
        completeness: 'COMPLETE',
      });
      out.latches.push({
        id,
        doorId: door.id,
        sectionId: s.id,
        latchId: latch.id,
        brand: latch.brand,
        article: latch.article,
        name: latch.name,
        panelId: behind.id,
        xMm: r1(x),
        elevationMm: r1((behind.y0 + behind.y1) / 2),
        priceRub: latch.price?.rub ?? null,
      });
    }
  return out;
}
