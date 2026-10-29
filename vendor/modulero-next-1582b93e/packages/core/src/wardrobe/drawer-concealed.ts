// The drawer of the wardrobe on a concealed runner (MOD-DEC-514 over 466; FINDINGS 1862): the box of the BAZIS kit of
// the runner, as "other furniture" builds it (engine/drawer-runner.ts, FINDINGS 1750) — the sides of the drawer board
// from the plane of the front, the bottom of the board between them raised above their lower edge, the back above the
// bottom; no inner front wall (WR-20 is of the own box): the facade of an external drawer is its front, a drawer
// behind a door gets an inner front of the drawer board set in the opening as an inset door (362, (Д)), as an assembled
// drawer (FINDINGS 1856). The holes of the runner in the side panel (or in its spacer, 331/360) and of the hooks of the
// runner in the back come from the kit (277); the box is joined by confirmats as the own box.
import type { DrawerSlide } from '../catalog/hardware/drawer-slides.js';
import { concealedBoxWalls, type RunnerInfo } from '../engine/drawer-runner.js';
import type { PolicyState, Rec } from '../engine/policy/project-state.js';
import type { KitPanel } from './drawer-kits.js';
import { addConfirmatBlindHole, addConfirmatThroughHole, addDrawerConfirmatJoint, addFaceHole, addPart, edges } from './primitives.js';
import { WardrobeStandardPreset } from './standard.js';

const EDGE = WardrobeStandardPreset.visibleEdgeBand;

/** Where a drawer on a concealed runner stands, in the prototype's axes (x across, y up, z from the front of the carcass). */
export interface ConcealedDrawerPlace {
  drawerId: string;
  moduleId: string;
  sectionId: string;
  slide: DrawerSlide;
  /** The runner and its box (concealedRunner): `n.concealed.frontMm` is the plane of the front, `n.boxY` the underside of the box. */
  n: RunnerInfo;
  /** The opening between the side panels or their spacers (LW). */
  left: number;
  right: number;
  /** Where the runner starts: the plane of the front, not ahead of the front edge of the panel. */
  runnerZ: number;
  /** The facade of an external drawer (already a part), or null — an inner front is built. */
  external: boolean;
  innerFront: { thicknessMm: number; revealMm: number } | null;
  boardMm: number;
  /** The panels the runners are screwed to: the side or partition, or the spacer on it. */
  panels: { left: KitPanel; right: KitPanel };
}

/** The parts and holes of one drawer on a concealed runner; returns its part ids. */
export function buildConcealedDrawer(m: Rec, d: Rec, p: ConcealedDrawerPlace): string[] {
  const policy = d as PolicyState,
    { drawerId, n, boardMm: k } = p,
    c = n.concealed!,
    base = { drawerId, moduleId: p.moduleId, sectionId: p.sectionId },
    name = `${p.slide.brand} ${n.sku}`,
    mechanismId = `${drawerId}-C-SLIDE`,
    frontZ = c.frontMm,
    ids = { left: `${drawerId}-SIDE-L`, right: `${drawerId}-SIDE-R`, front: `${drawerId}-FRONT`, back: `${drawerId}-BACK`, bottom: `${drawerId}-BOTTOM` },
    partIds: string[] = [];
  if (p.innerFront) {
    const { thicknessMm: t, revealMm: r } = p.innerFront;
    addPart(
      m.parts,
      {
        id: ids.front,
        name: `${drawerId} — внутренний фасад ящика`,
        L: p.right - p.left - 2 * r,
        W: n.boxH,
        T: t,
        q: 1,
        kind: 'drawerFront',
        ...base,
        edges: edges(EDGE, EDGE, EDGE, EDGE),
        worldBox: { x0: p.left + r, x1: p.right - r, y0: n.boxY, y1: n.boxTop, z0: frontZ - t, z1: frontZ },
      },
      policy,
    );
    partIds.push(ids.front);
  }
  // The walls of the kit's box (engine/drawer-runner.ts): x across, y in depth from the front edge of the carcass
  // (the plane of the front is `n.concealed.frontMm`), z up.
  const walls = Object.fromEntries(concealedBoxWalls(n, p.left, k).map((w) => [w.key, w])),
    box = (key: string) => {
      const w = walls[key]!;
      return { x0: w.o[0], x1: w.o[0] + w.ext[0], y0: w.o[2], y1: w.o[2] + w.ext[2], z0: w.o[1], z1: w.o[1] + w.ext[1] };
    },
    // The top edges of the sides and the back are seen in the open drawer (Д): banded as the top of the own box's front wall.
    side = (id: string, hand: 'left' | 'right', key: string) =>
      addPart(m.parts, { id, name: `${drawerId} — ${hand === 'left' ? 'левая' : 'правая'} боковина ящика ${name}`, L: n.boxD, W: n.boxH, T: k, q: 1, kind: 'drawerSide', handedness: hand, ...base, edges: edges(EDGE, '', '', ''), worldBox: box(key) }, policy);
  side(ids.left, 'left', 'side-left');
  side(ids.right, 'right', 'side-right');
  const back = walls.back!,
    bottom = walls.bottom!;
  addPart(m.parts, { id: ids.back, name: `${drawerId} — задняя стенка ящика ${name}`, L: back.ext[0], W: back.ext[2], T: k, q: 1, kind: 'drawerBack', ...base, edges: edges(EDGE, '', '', ''), worldBox: box('back') }, policy);
  addPart(
    m.parts,
    { id: ids.bottom, name: `${drawerId} — дно ящика ${name}`, L: bottom.ext[0], W: bottom.ext[1], T: bottom.ext[2], q: 1, kind: 'drawerBottom', materialFamily: 'LDSP', ...base, bottomMode: 'BOARD_ON_RUNNER', edges: edges(), worldBox: box('bottom') },
    policy,
  );
  partIds.push(ids.left, ids.right, ids.back, ids.bottom);
  // The back between the sides on confirmats as the own box: the tops of the back and the sides are level, the face
  // counts from the top edge.
  const joint = (id: string, sideId: string, wallId: string, sideX: number, wallEdge: string, label: string, heightMm: number) =>
    addDrawerConfirmatJoint(m.holes, m.connections, { id: `${drawerId}-${id}`, drawerId, moduleId: p.moduleId, sectionId: p.sectionId, sideId, wallId, sideX, wallEdge, boxHeight: heightMm, joint: label });
  joint('C-L-REAR', ids.left, ids.back, n.boxD - k / 2, 'C', 'left-rear', back.ext[2]);
  joint('C-R-REAR', ids.right, ids.back, n.boxD - k / 2, 'D', 'right-rear', back.ext[2]);
  // The bottom between the sides on two confirmats a side (Д), as far from its front and rear edges as the confirmats
  // of a box joint from the top: symmetric, so the edge of the bottom reads the same from either end.
  const a = WardrobeStandardPreset.drawerJointConfirmatTopOffset,
    stations = [a, bottom.ext[1] - a],
    y = n.boxH - c.bottomRecessMm - bottom.ext[2] / 2;
  for (const [sideId, edge, label] of [[ids.left, 'C', 'left-bottom'], [ids.right, 'D', 'right-bottom']] as const) {
    const id = `${drawerId}-C-${label === 'left-bottom' ? 'L' : 'R'}-BOTTOM`;
    stations.forEach((s, pairIndex) => {
      const meta = { connectionId: id, drawerId, joint: label, pairIndex: pairIndex + 1 };
      addConfirmatThroughHole(m.holes, sideId, 'outside', s, y, 'Короб ящика — конфирмат', meta);
      addConfirmatBlindHole(m.holes, ids.bottom, edge, s, 'Короб ящика — конфирмат', meta);
    });
    m.connections.push({ id, type: 'drawerBox', joint: label, drawerId, a: sideId, b: ids.bottom, fastener: 'Конфирмат 7×50', qty: stations.length, moduleId: p.moduleId, sectionId: p.sectionId, holePairCount: stations.length });
  }
  const hole = (panel: string, face: string, x: number, yy: number, diameter: number, depth: number, purpose: string, role: string) =>
    addFaceHole(m.holes, panel, face, x, yy, diameter, depth, `${purpose} ${name}`, `D${diameter}/L${depth}`, { machiningRole: role, mechanismId, catalogRef: c.holeRef, hingeStation: x });
  // The runner in the side panel (or its spacer): over the underside of the bottom, from the front of the runner.
  const under = n.boxY + c.bottomRecessMm + c.carcassHoleAboveBottomMm;
  for (const panel of [p.panels.left, p.panels.right])
    for (const z of n.cabinetMountZ) hole(panel.panel, panel.face, under - panel.baseY, p.runnerZ + z - panel.baseZ, c.carcassHoleDiameterMm, c.carcassHoleDepthMm, 'Направляющая', 'RUNNER_SCREW');
  // The hooks of the runner in the rear face of the back: from the inner faces of the sides, over the lower edge of the back.
  const h = c.rearHook;
  for (const x of [h.fromSideMm, back.ext[0] - h.fromSideMm]) hole(ids.back, 'inside', x, back.ext[2] - h.aboveBottomMm, h.diameterMm, h.depthMm, 'Крючок направляющей', 'RUNNER_HOOK');
  // The front closes the box on the ends of its sides and bottom, as in the kit; its fixing is not drilled yet.
  const frontPart = p.external ? `${drawerId}-FACADE-STRUCTURAL` : ids.front;
  for (const [key, wall] of [['L', ids.left], ['R', ids.right], ['BOTTOM', ids.bottom]] as const)
    m.connections.push({
      id: `${drawerId}-C-FACADE-${key}`,
      type: 'drawerFacadeFix',
      joint: 'facadeFix',
      drawerId,
      a: frontPart,
      b: wall,
      fastener: `Фасад на торцах боковин и дна короба набора БАЗИС ${p.slide.brand} ${p.slide.series} — крепёж и места не заданы, требуется подтверждение`,
      qty: 0,
      moduleId: p.moduleId,
      sectionId: p.sectionId,
      requiresHardwareConfirmation: true,
    });
  return partIds;
}
