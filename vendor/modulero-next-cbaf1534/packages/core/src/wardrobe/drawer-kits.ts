// Assembled drawers of the catalogue in the wardrobe (MOD-DEC-544, R2-007; FINDINGS 1856–1860): a drawer type of its
// own (FINDINGS 1877). The kit — runners with metal sides, the holders of the back, the fixings of the front — is
// bought; the maker cuts its bottom and back of board by the deductions of the catalogue. The facade of an external
// drawer is its front, fixed by the kit (no inner front wall, WR-20 is of the own box); a drawer behind a door gets
// an inner front of the drawer board, set in the opening as an inset door (362, (Д)). The holes are the catalogue's:
// the runner in the side panel (or in its spacer, 331/360), the holders in the back, the fixings in the front; what the
// catalogue does not print is not drilled (205), the drawing is «неполная».
import type { DrawerSystemHoles } from '../catalog/hardware/drawer-systems.js';
import { drawerKitBoxes, type DrawerKit } from '../engine/policy/drawer-system-selection.js';
import type { PolicyState, Rec } from '../engine/policy/project-state.js';
import type { Boundary } from './fill.js';
import { addFaceHole, addPart, edges } from './primitives.js';
import { WardrobeStandardPreset } from './standard.js';

const EDGE = WardrobeStandardPreset.visibleEdgeBand;

/** Where a kit drawer stands, in the prototype's axes (x across, y up, z from the front of the carcass). */
export interface KitDrawerPlace {
  drawerId: string;
  moduleId: string;
  sectionId: string;
  kit: DrawerKit;
  /** The opening between the side panels or their spacers (LW). */
  left: number;
  right: number;
  /** Underside of the runner. */
  y0: number;
  /** Height of the place of the drawer. */
  heightMm: number;
  /** The plane of the front: the inner face of the facade or of the inner front. */
  frontZ: number;
  /** Where the runner starts: the front edge of the side panel, or behind the inner front. */
  runnerZ: number;
  /** The facade of an external drawer (already a part), or null — an inner front is built. */
  facade: { id: string; left: number; top: number } | null;
  innerFront: { thicknessMm: number; revealMm: number } | null;
  /** The panels the runners are screwed to: the side or partition, or the spacer on it. */
  panels: { left: KitPanel; right: KitPanel };
}

/** A face the runner is screwed to: the panel, its face, and the world y and z of its local origin. */
export interface KitPanel {
  panel: string;
  face: string;
  baseY: number;
  baseZ: number;
}

export const kitPanelOfBoundary = (b: Boundary): KitPanel => ({ panel: b.panel, face: b.face, baseY: b.baseY, baseZ: 0 });

/** The parts, holes and record of one kit drawer: its part ids and what its drilling lacks. */
export function buildKitDrawer(m: Rec, d: Rec, p: KitDrawerPlace): { partIds: string[]; missing: string[] } {
  const policy = d as PolicyState,
    { drawerId, kit } = p,
    width = p.right - p.left,
    boxes = drawerKitBoxes(kit, width),
    mid = (p.left + p.right) / 2,
    base = { drawerId, moduleId: p.moduleId, sectionId: p.sectionId, drawerKit: { systemId: kit.system.id, article: kit.article.article } },
    frontId = `${drawerId}-FRONT`,
    backId = `${drawerId}-BACK`,
    bottomId = `${drawerId}-BOTTOM`,
    mechanismId = `${drawerId}-C-SLIDE`,
    name = `${kit.system.brand} ${kit.article.article}`,
    partIds: string[] = [];
  if (p.innerFront) {
    const { thicknessMm: t, revealMm: r } = p.innerFront;
    addPart(
      m.parts,
      {
        id: frontId,
        name: `${drawerId} — внутренний фасад сборного ящика`,
        L: width - 2 * r,
        W: p.heightMm,
        T: t,
        q: 1,
        kind: 'drawerFront',
        ...base,
        edges: edges(EDGE, EDGE, EDGE, EDGE),
        worldBox: { x0: p.left + r, x1: p.right - r, y0: p.y0, y1: p.y0 + p.heightMm, z0: p.frontZ - t, z1: p.frontZ },
      },
      policy,
    );
    partIds.push(frontId);
  }
  const board = (id: string, kind: string, label: string, b: typeof boxes.bottom, edge: Record<string, string>) => {
    addPart(
      m.parts,
      {
        id,
        name: `${drawerId} — ${label} сборного ящика ${name}`,
        L: b.lengthMm,
        W: b.heightMm,
        T: b.thicknessMm,
        q: 1,
        kind,
        materialFamily: 'LDSP',
        ...base,
        edges: edge,
        worldBox:
          kind === 'drawerBottom'
            ? { x0: mid - b.lengthMm / 2, x1: mid + b.lengthMm / 2, y0: p.y0 + b.y0, y1: p.y0 + b.y0 + b.thicknessMm, z0: p.frontZ + b.z0, z1: p.frontZ + b.z0 + b.heightMm }
            : { x0: mid - b.lengthMm / 2, x1: mid + b.lengthMm / 2, y0: p.y0 + b.y0, y1: p.y0 + b.y0 + b.heightMm, z0: p.frontZ + b.z0, z1: p.frontZ + b.z0 + b.thicknessMm },
      },
      policy,
    );
    partIds.push(id);
  };
  // The top edge of the back is seen in the open drawer (Д): banded as the top of the own box's front wall.
  board(backId, 'drawerBack', 'задняя стенка', boxes.back, edges(EDGE, '', '', ''));
  board(bottomId, 'drawerBottom', 'дно', boxes.bottom, edges());
  const known = (h: DrawerSystemHoles) => h.diameterMm.value !== null && h.depthMm.value !== null && h.fromEndMm.value !== null && h.heightsMm.value !== null,
    hole = (panel: string, face: string, x: number, y: number, h: { diameter: number; depth: number; ref: unknown }, purpose: string, role: string) =>
      addFaceHole(m.holes, panel, face, x, y, h.diameter, h.depth, `${purpose} ${name}`, `D${h.diameter}/L${h.depth}`, { machiningRole: role, mechanismId, catalogRef: h.ref, hingeStation: x });
  // The runner in the side panel (or its spacer): over the underside of the runner, from the front edge of the panel.
  const f = kit.system.carcassFixing,
    along = kit.length.carcassHolesFromFrontMm.value;
  if (f.diameterMm.value !== null && f.depthMm.value !== null && f.heightMm.value !== null && along)
    for (const side of [p.panels.left, p.panels.right])
      for (const z of along)
        hole(side.panel, side.face, p.y0 + f.heightMm.value - side.baseY, p.runnerZ + z - side.baseZ, { diameter: f.diameterMm.value, depth: f.depthMm.value, ref: f.diameterMm.ref }, 'Направляющая', 'RUNNER_SCREW');
  // The holders in the rear face of the back: from each end, over the underside of the runner (the face counts from the top edge).
  const bh = kit.system.back.holes;
  if (known(bh))
    for (const y of bh.heightsMm.value!)
      for (const x of [bh.fromEndMm.value!, boxes.back.lengthMm - bh.fromEndMm.value!])
        hole(backId, 'inside', x, boxes.back.y0 + boxes.back.heightMm - y, { diameter: bh.diameterMm.value!, depth: bh.depthMm.value!, ref: bh.diameterMm.ref }, 'Держатель задней стенки', 'BACK_HOLDER_SCREW');
  // The fixings of the front in its inner face: from the side of the opening, over the underside of the runner (the face counts from the top edge).
  const fh = kit.system.frontHoles,
    front = p.facade ?? { id: frontId, left: p.left + p.innerFront!.revealMm, top: p.y0 + p.heightMm };
  if (known(fh))
    for (const y of fh.heightsMm.value!)
      for (const x of [p.left + fh.fromEndMm.value!, p.right - fh.fromEndMm.value!])
        hole(front.id, 'inside', x - front.left, front.top - (p.y0 + y), { diameter: fh.diameterMm.value!, depth: fh.depthMm.value!, ref: fh.diameterMm.ref }, 'Крепление фасада', 'FRONT_FIXING');
  return { partIds, missing: boxes.missing };
}
