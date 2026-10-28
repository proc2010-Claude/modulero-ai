// Primitives of the technical model (tech-r3): the first half of file 05 of the prototype r1
// (r1.html:5714–6061), MIGRATION_PLAN step 3.1. Parts, grooves, face and edge holes, confirmats, wooden dowels
// of the plinth rail, confirmat joints of the drawer box. The second half of file 05 (validators,
// r1.html:6062–) is step 3.2.
//
// As in the prototype, the add* functions append to the arrays the model builder passes in (parts, holes,
// grooves, connections, supportContacts, issues) and return what they created; they read and write nothing
// else. addPlinthRailConnections also marks the dowel holes it finds by connection id in `holes`, including
// earlier holes with the same id, as the prototype does.
// No wrappers in the prototype. addPart applies the edge model and the orientation of file 04
// (engine/policy/edge-model.ts, task W1); what they read from the prototype's state is the parameter `d`.
// Proof: tests/oracle/wardrobe-core.test.mjs (prototype in the browser) and test/wardrobe.core31.test.ts.
import { applyEdgeModelToPart, partOrientation } from '../engine/policy/edge-model.js';
import { jointStations } from '../engine/policy/joint-stations.js';
import { confirmatProfileFor } from '../engine/policy/wardrobe-fasteners.js';
import profilesData from '../catalog/fasteners-r7.data.json' with { type: 'json' };
import type { PolicyState } from '../engine/policy/project-state.js';
import { edgeGeometryForPart } from './edges.js';
import { CURRENT_PRODUCTION_PROFILE, FASTENER_PRESETS, HDF4_BACK_PANEL_INTENT, HDF4_GROOVE_INTENT, WardrobeStandardPreset, r1 } from './standard.js';

/** Thickness of the drawer box boards, mm (r1.html:5714). */
export const DRAWER_T = WardrobeStandardPreset.panelThickness,
  /** Groove under the HDF4 drawer bottom: width, depth and offset of its bottom side, mm (r1.html:5715–5717). */
  GROOVE_W = CURRENT_PRODUCTION_PROFILE.hdf4Groove.resolvedWidthMm,
  GROOVE_D = HDF4_GROOVE_INTENT.workingDepthMm,
  GROOVE_BOTTOM = HDF4_GROOVE_INTENT.workingBottomOffsetMm;

/** A part of the model as the builders create it; the fields depend on the kind. */
export interface Part {
  id?: string;
  kind?: string;
  L?: number;
  W?: number;
  [field: string]: unknown;
}

export type Hole = Record<string, unknown>;
export type Groove = Record<string, unknown>;
export type Connection = Record<string, unknown>;
export interface Issue {
  level: 'err' | 'warn';
  text: string;
}

/** Edge band codes by slot (r1.html:5718). */
export function edges(A = '', B = '', C = '', D = '') {
  return {
    A,
    B,
    C,
    D,
  };
}

/**
 * Completes a part and appends it (r1.html:5726): texture, material family, floor contact edges, edges
 * (applyEdgeModelToPart with the edge overrides and System 32 provenance of `d`), orientation.
 */
export function addPart(parts: Part[], p: Part, d: PolicyState = {}): Part {
  p.texture = 'L';
  p.materialFamily = p.materialFamily || (['back', 'drawerBottom'].includes(p.kind as string) ? 'HDF' : 'LDSP');
  p.floorContactEdges = Array.isArray(p.floorContactEdges) ? [...new Set(p.floorContactEdges)] : [];
  applyEdgeModelToPart(p, d);
  p.orientation = partOrientation(p);
  parts.push(p);
  return p;
}

/** Groove machined per the current production profile (r1.html:5735). */
export function addGroove(
  grooves: Groove[],
  panel: unknown,
  face: unknown,
  orientation: unknown,
  start: number,
  end: number,
  offset: number,
  width: number = GROOVE_W,
  depth: number = GROOVE_D,
  purpose: unknown = 'Паз под дно ХДФ',
  extra: Record<string, unknown> = {},
): Groove {
  const profile = CURRENT_PRODUCTION_PROFILE.hdf4Groove,
    resolvedMachining = {
      profileId: CURRENT_PRODUCTION_PROFILE.id,
      resolvedWidthMm: width,
      resolvedDepthMm: depth,
      resolver: 'CURRENT_PRODUCTION_PROFILE',
      productionConfirmed: profile.productionConfirmed,
      requiresTechnologyConfirmation: profile.requiresTechnologyConfirmation,
    },
    groove = {
      panel,
      face,
      orientation,
      start: r1(start),
      end: r1(end),
      offset: r1(offset),
      width,
      depth,
      purpose,
      semanticType: HDF4_GROOVE_INTENT.semanticType,
      machiningIntent: HDF4_GROOVE_INTENT,
      resolvedMachining,
      ...extra,
    };
  grooves.push(groove);
  return groove;
}

/** Hole into a face of a panel (r1.html:5763). */
export function addFaceHole(holes: Hole[], panel: unknown, face: unknown, x: number, y: number, d: unknown, depth: unknown, purpose: unknown, code: unknown, extra: Record<string, unknown> = {}): Hole {
  const hole = {
    panel,
    mode: 'face',
    face,
    x: r1(x),
    y: r1(y),
    diameter: d,
    depth,
    purpose,
    code,
    ...extra,
  };
  holes.push(hole);
  return hole;
}

/** Hole into an edge of a panel (r1.html:5779). */
export function addEdgeHole(holes: Hole[], panel: unknown, edge: unknown, offset: number, d: unknown, depth: unknown, purpose: unknown, code: unknown, extra: Record<string, unknown> = {}): Hole {
  const hole = {
    panel,
    mode: 'edge',
    edge,
    offset: r1(offset),
    diameter: d,
    depth,
    purpose,
    code,
    ...extra,
  };
  holes.push(hole);
  return hole;
}

/** The confirmat of a carcass joint by the thickness of the part it goes through. */
export interface CarcassConfirmat {
  /** `CONFIRMAT_7X50` (the prototype's preset) or `CONFIRMAT_7X70`. */
  presetId: string;
  /** The line of the connection: `Конфирмат 7×50`, `Конфирмат 7×70`. */
  name: string;
  /** The receiving pilot D5 in the edge. */
  edgeDepthMm: number;
}

/**
 * Confirmat 7×50 through a part of 16 or 19 mm, 7×70 through 22 mm (MOD-DEC-467); another thickness keeps 7×50 as
 * the prototype. 7×50 has the pilot of its preset, 35 mm (§17.1); 7×70 the depth of the MAKMART table, 60 mm (FINDINGS 683).
 */
export function carcassConfirmat(throughThicknessMm = 16): CarcassConfirmat {
  const preset = FASTENER_PRESETS.CONFIRMAT_7X50,
    profile = (profilesData as Record<string, { screw?: string; edgeDepth?: { value: number } }>)[confirmatProfileFor(throughThicknessMm)]!;
  if (profile.screw === '7x50') return { presetId: preset.id, name: 'Конфирмат 7×50', edgeDepthMm: preset.receivingPilot.depthMm };
  return { presetId: `CONFIRMAT_${profile.screw!.toUpperCase()}`, name: `Конфирмат ${profile.screw!.replace('x', '×')}`, edgeDepthMm: profile.edgeDepth!.value };
}

/** Through hole D8 of a confirmat 7×50 (r1.html:5794), 7×70 through 22 mm (MOD-DEC-467). */
export function addConfirmatThroughHole(holes: Hole[], panel: unknown, face: unknown, x: number, y: number, purpose: unknown, extra: Record<string, unknown> = {}, throughThicknessMm = 16): Hole {
  const operation = FASTENER_PRESETS.CONFIRMAT_7X50.throughOperation;
  return addFaceHole(holes, panel, face, x, y, operation.diameterMm, 'through', purpose, `D${operation.diameterMm}/сквозной`, {
    fastenerPresetId: carcassConfirmat(throughThicknessMm).presetId,
    machiningRole: operation.operationType,
    depthMode: operation.depthMode,
    ...extra,
  });
}

/** Pilot hole D5×35 of a confirmat 7×50 in the receiving edge (r1.html:5804); D5×60 of 7×70 through 22 mm (MOD-DEC-467). */
export function addConfirmatBlindHole(holes: Hole[], panel: unknown, edge: unknown, offset: number, purpose: unknown, extra: Record<string, unknown> = {}, throughThicknessMm = 16): Hole {
  const operation = FASTENER_PRESETS.CONFIRMAT_7X50.receivingPilot,
    c = carcassConfirmat(throughThicknessMm);
  return addEdgeHole(holes, panel, edge, offset, operation.diameterMm, c.edgeDepthMm, purpose, `D${operation.diameterMm}/L${c.edgeDepthMm}`, {
    fastenerPresetId: c.presetId,
    machiningRole: operation.operationType,
    ...extra,
  });
}

type ConfirmatPreset = typeof FASTENER_PRESETS.CONFIRMAT_7X50;

/** r1.html:5813. */
export function confirmatSemanticSummary(preset: ConfirmatPreset = FASTENER_PRESETS.CONFIRMAT_7X50): string {
  return `Конфирмат 7×50: плоскость D${preset.throughOperation.diameterMm}/сквозной, ответный торец D${preset.receivingPilot.diameterMm}/L${preset.receivingPilot.depthMm}; axisOffset ${preset.ldsp16.axisOffsetMm} мм для ЛДСП ${preset.ldsp16.panelThicknessMm} мм — координата оси, не диаметр сверления и не отдельная операция.`;
}

/** r1.html:5816. */
export function hdf4SemanticSummary(
  backIntent: typeof HDF4_BACK_PANEL_INTENT = HDF4_BACK_PANEL_INTENT,
  grooveIntent: typeof HDF4_GROOVE_INTENT = HDF4_GROOVE_INTENT,
  profile: typeof CURRENT_PRODUCTION_PROFILE.hdf4Groove = CURRENT_PRODUCTION_PROFILE.hdf4Groove,
): string {
  const profileStatus = profile.productionConfirmed ? 'профиль подтверждён производством' : profile.requiresTechnologyConfirmation ? 'профиль требует технологического подтверждения' : 'профиль не отмечен как подтверждённый';
  return `HDF4: BackPanelIntent=${backIntent.finalInstallationDefaultStatus}; текущая визуализация ${backIntent.currentLegacyMode}, предпочтительный кандидат ${backIntent.preferredCandidate} не выбран как final default. ${grooveIntent.semanticType} разрешается текущим production profile в ${profile.resolvedWidthMm}×${profile.resolvedDepthMm} мм; ${profileStatus}.`;
}

/** Positioning dowels between the plinth rail and the raised bottom: none up to 600 mm, then one per 600 mm, at most 2 (r1.html:5820). */
export function woodenDowelCountForRail(railLength: unknown): number {
  const span = WardrobeStandardPreset.plinthRailDowelMaxPositioningSpan;
  if (Number(railLength) <= span) return 0;
  return Math.min(WardrobeStandardPreset.plinthRailDowelMaxCount, Math.ceil(Number(railLength) / span) - 1);
}

/** Dowels evenly along the rail (r1.html:5825). */
export function woodenDowelPositionsForRail(railLength: unknown): number[] {
  const count = woodenDowelCountForRail(railLength),
    L = Number(railLength);
  return Array.from(
    {
      length: count,
    },
    (_, i) => (L * (i + 1)) / (count + 1),
  );
}

export interface WoodenDowelConnection {
  id: unknown;
  partA: unknown;
  partB: unknown;
  faceA: unknown;
  xA: number;
  yA: number;
  edgeB: unknown;
  offsetB: number;
  moduleId: unknown;
  subtype?: unknown;
  role?: unknown;
  purpose?: unknown;
  /** Size of the dowel and its holes; without it the plinth rail dowel of the prototype, 8×30 drilled 15 mm into both parts. */
  dowel?: { diameter: number; length: number; faceDepth: number; edgeDepth: number };
  /** Extra fields of the connection. */
  extra?: Record<string, unknown>;
}

/** A wooden dowel: face hole in part A, edge hole in part B and the connection (r1.html:5832). */
export function addWoodenDowelConnection(
  holes: Hole[],
  connections: Connection[],
  { id, partA, partB, faceA, xA, yA, edgeB, offsetB, moduleId, subtype = 'woodenDowel', role = 'positioningAndAntiSlip', purpose = 'Деревянный шкант', dowel, extra = {} }: WoodenDowelConnection,
) {
  const diameter = dowel?.diameter ?? WardrobeStandardPreset.plinthRailDowelDiameter,
    length = dowel?.length ?? WardrobeStandardPreset.plinthRailDowelLength,
    depth = WardrobeStandardPreset.plinthRailDowelDrillingDepth,
    faceDepth = dowel?.faceDepth ?? depth,
    edgeDepth = dowel?.edgeDepth ?? depth,
    meta = {
      connectionId: id,
      connectorType: 'woodenDowel',
      dowelDiameter: diameter,
      dowelLength: length,
      requiresTechnologyConfirmation: true,
    };
  addFaceHole(holes, partA, faceA, xA, yA, diameter, faceDepth, purpose, `D${diameter}/L${faceDepth}`, meta);
  addEdgeHole(holes, partB, edgeB, offsetB, diameter, edgeDepth, purpose, `D${diameter}/L${edgeDepth}`, meta);
  const drilling = {
    partA: {
      panel: partA,
      mode: 'face',
      face: faceA,
      x: r1(xA),
      y: r1(yA),
      diameter,
      depth: faceDepth,
    },
    partB: {
      panel: partB,
      mode: 'edge',
      edge: edgeB,
      offset: r1(offsetB),
      diameter,
      depth: edgeDepth,
    },
  };
  const connector = {
    type: 'woodenDowel',
    diameter,
    length,
    connectionId: id,
    partA,
    partB,
    drilling,
    requiresTechnologyConfirmation: true,
  };
  connections.push({
    id,
    type: 'woodenDowel',
    subtype,
    role,
    a: partA,
    b: partB,
    partA,
    partB,
    fastener: `Шкант деревянный ${diameter}×${length} (изготовление требует подтверждения)`,
    qty: 1,
    moduleId,
    holePairCount: 1,
    connector,
    drilling,
    requiresTechnologyConfirmation: true,
    tariffNotFound: false,
    drillingTariff: 'Отверстие Ø5–12',
    ...extra,
  });
  return connector;
}

export interface NarrowJointDowels {
  /** Id of the fastener connection of the joint; the dowel is its own connection `<id>-DOWEL-<n>`. */
  id: string;
  /** Places of the dowels along the joint (narrowJointLayout). */
  dowels: readonly number[];
  /** The part the dowel enters through a face, and the face. */
  through: unknown;
  face: unknown;
  /** The part the dowel enters through an edge, and the edge. */
  receiving: unknown;
  edge: unknown;
  /** The point of a dowel `at` mm along the joint: x, y on the face and the offset on the edge. */
  place: (at: number) => { x: number; y: number; offset: number };
  moduleId: unknown;
  sectionId?: unknown;
  /** Extra fields of the two holes of a dowel `at` mm along the joint. */
  holeExtra?: (at: number) => Record<string, unknown>;
}

/**
 * The wooden dowels of a narrow joint with one fastener (MOD-DEC-364, FINDINGS 380): against turning, at the places
 * the joint layout gives, in the face of one part and the edge of the other like the fastener. Without dowels
 * (a part of 128 mm and wider) nothing is added.
 */
export function addNarrowJointDowels(holes: Hole[], connections: Connection[], { id, dowels, through, face, receiving, edge, place, moduleId, sectionId, holeExtra }: NarrowJointDowels): void {
  dowels.forEach((at, i) => {
    const p = place(at);
    addWoodenDowelConnection(holes, connections, {
      id: `${id}-DOWEL-${i + 1}`,
      partA: through,
      partB: receiving,
      faceA: face,
      xA: p.x,
      yA: p.y,
      edgeB: edge,
      offsetB: p.offset,
      moduleId,
      subtype: 'narrowJointDowel',
      role: 'antiRotation',
      purpose: 'Узкая деталь — деревянный шкант от проворачивания (MOD-DEC-364)',
      dowel: jointStations.constants.dowel.value,
      extra: { fastenerConnectionId: id, ...(sectionId === undefined ? {} : { sectionId }) },
    });
    if (holeExtra) for (const h of holes.slice(-2)) Object.assign(h, holeExtra(at));
  });
}

export interface PlinthRailConnections {
  mod: { id?: unknown };
  rail: { id?: unknown; worldZCenter?: unknown };
  leftId: unknown;
  rightId: unknown;
  bottomId: unknown;
  /**
   * Confirmats and dowels of the rail ends, mm from the floor (MOD-DEC-364, FINDINGS 382); without it the
   * prototype's confirmats at 20 and 50 mm from the floor and no dowel.
   */
  layout?: { stations: readonly number[]; dowels: readonly number[] };
  /** The dowels into the raised bottom (MOD-DEC-455); without it the prototype's 8×30 drilled 15 mm into both parts. */
  bottomDowel?: { diameter: number; length: number; faceDepth: number; edgeDepth: number };
}

/**
 * Plinth rail: confirmats through both sides at 20 and 50 mm from the floor, dowels into the raised bottom and the
 * bearing contact (r1.html:5908). With a `layout` the confirmats of the ends and their dowels are its (MOD-DEC-364). An offset that does not fit the rail height is an error in `issues`; a span
 * longer than 600 mm left after the last dowel is a warning.
 */
export function addPlinthRailConnections(
  parts: Part[],
  holes: Hole[],
  connections: Connection[],
  supportContacts: Record<string, unknown>[],
  issues: Issue[],
  { mod, rail, leftId, rightId, bottomId, layout, bottomDowel }: PlinthRailConnections,
): void {
  const sideOffsets = layout?.stations ?? WardrobeStandardPreset.plinthRailSideFastenerOffsets,
    railPart = parts.find((p) => p.id === rail.id) as Part,
    sideSpec = [
      {
        sideId: leftId,
        physicalEdge: 'left',
        label: 'L',
      },
      {
        sideId: rightId,
        physicalEdge: 'right',
        label: 'R',
      },
    ],
    railYFromFloor = (floorOffset: number) => (railPart.W as number) - floorOffset;
  sideSpec.forEach((spec) =>
    sideOffsets.forEach((floorOffset, index) => {
      if (floorOffset <= 0 || floorOffset >= (railPart.W as number)) {
        issues.push({
          level: 'err',
          text: `${rail.id}: отступ крепления ${floorOffset} мм не помещается по высоте планки ${railPart.W} мм.`,
        });
        return;
      }
      const connectionId = `${rail.id}-C-SIDE-${spec.label}-${index + 1}`,
        meta = {
          connectionId,
          plinthRailId: rail.id,
          floorOffset,
          requiresTechnologyConfirmation: true,
        };
      const sideT = (parts.find((p) => p.id === spec.sideId)?.T as number | undefined) ?? 16,
        confirmat = carcassConfirmat(sideT);
      addConfirmatThroughHole(holes, spec.sideId, 'inside', floorOffset, rail.worldZCenter as number, 'Цокольная планка — конфирмат через боковину', meta, sideT);
      addConfirmatBlindHole(holes, rail.id, edgeGeometryForPart(railPart)[spec.physicalEdge]!.slot, railYFromFloor(floorOffset), 'Цокольная планка — конфирмат в торец', meta, sideT);
      connections.push({
        id: connectionId,
        type: 'confirmat',
        subtype: 'plinthRailSide',
        role: 'positioningAndRacking',
        a: spec.sideId,
        b: rail.id,
        fastener: confirmat.name,
        ...(confirmat.presetId === FASTENER_PRESETS.CONFIRMAT_7X50.id ? {} : { fastenerPresetId: confirmat.presetId }),
        qty: 1,
        moduleId: mod.id,
        requiresTechnologyConfirmation: true,
        holePairCount: 1,
      });
      if (index === sideOffsets.length - 1)
        addNarrowJointDowels(holes, connections, {
          id: connectionId,
          dowels: layout?.dowels ?? [],
          through: spec.sideId,
          face: 'inside',
          receiving: rail.id,
          edge: edgeGeometryForPart(railPart)[spec.physicalEdge]!.slot,
          place: (at) => ({ x: at, y: rail.worldZCenter as number, offset: railYFromFloor(at) }),
          moduleId: mod.id,
          holeExtra: (at) => ({ plinthRailId: rail.id, floorOffset: at }),
        });
    }),
  );
  const positions = woodenDowelPositionsForRail(railPart.L),
    railTopSlot = edgeGeometryForPart(railPart).top!.slot;
  positions.forEach((x, index) => {
    const connectionId = `${rail.id}-C-DOWEL-${index + 1}`;
    addWoodenDowelConnection(holes, connections, {
      id: connectionId,
      partA: bottomId,
      partB: rail.id,
      faceA: 'outside',
      xA: x,
      yA: rail.worldZCenter as number,
      edgeB: railTopSlot,
      offsetB: x,
      moduleId: mod.id,
      subtype: 'plinthRailBottomDowel',
      purpose: 'Цокольная планка ↔ поднятое дно — позиционирующий деревянный шкант',
      dowel: bottomDowel,
    });
    holes
      .filter((h) => h.connectionId === connectionId)
      .forEach((h) => {
        h.plinthRailId = rail.id;
        h.positionAlongRail = r1(x);
      });
  });
  const maxSpan = (railPart.L as number) / (positions.length + 1);
  if (maxSpan > WardrobeStandardPreset.plinthRailDowelMaxPositioningSpan + 0.01)
    issues.push({
      level: 'warn',
      text: `${rail.id}: после максимальных ${positions.length} шкантов остаётся позиционирующий пролёт ${r1(maxSpan)} мм; требуется отдельное конструктивное решение.`,
    });
  supportContacts.push({
    id: `${rail.id}-SUPPORT-CONTACT`,
    type: 'bearingContact',
    from: bottomId,
    to: rail.id,
    toFloor: true,
    moduleId: mod.id,
    loadTransfer: 'vertical bearing contact; wooden dowels only position parts and resist relative slip',
    requiresTechnologyConfirmation: true,
  });
}

/** Confirmat heights in a drawer box joint, 35 mm from the top and from the bottom (r1.html:5996). */
export function drawerJointCoordinates(boxHeight: number): number[] {
  const top = WardrobeStandardPreset.drawerJointConfirmatTopOffset,
    bottom = boxHeight - WardrobeStandardPreset.drawerJointConfirmatBottomOffset;
  return [top, bottom];
}

/** Checks the confirmats of a drawer box joint against the edges and the HDF bottom groove (r1.html:6001). */
export function drawerJointGeometryCheck(boxHeight: number) {
  const coords = drawerJointCoordinates(boxHeight),
    grooveCenter = boxHeight - (GROOVE_BOTTOM + GROOVE_W / 2),
    spacing = coords.length > 1 ? coords[1]! - coords[0]! : 0,
    edgeSafe = coords.every((y) => y >= 4 && y <= boxHeight - 4),
    grooveSafe = coords.every((y) => Math.abs(y - grooveCenter) >= 4 + GROOVE_W / 2 + WardrobeStandardPreset.drawerJointGrooveClearance),
    errors: string[] = [];
  if (coords.length !== WardrobeStandardPreset.drawerJointConfirmatCount) errors.push(`расчёт должен дать ${WardrobeStandardPreset.drawerJointConfirmatCount} точки крепления на стык`);
  if (spacing < WardrobeStandardPreset.drawerJointMinimumSpacing) errors.push(`между конфирматами только ${r1(spacing)} мм; требуется не менее ${WardrobeStandardPreset.drawerJointMinimumSpacing} мм`);
  if (!edgeSafe) errors.push('отверстие конфирмата выходит за безопасную область детали');
  if (!grooveSafe) errors.push('отверстие конфирмата конфликтует с пазом ХДФ');
  return {
    coords,
    grooveCenter,
    spacing,
    edgeSafe,
    grooveSafe,
    ok: errors.length === 0,
    valid: errors.length === 0,
    errors,
  };
}

export interface DrawerConfirmatJoint {
  id: unknown;
  drawerId: unknown;
  moduleId: unknown;
  sectionId: unknown;
  sideId: unknown;
  wallId: unknown;
  sideX: number;
  wallEdge: unknown;
  boxHeight: number;
  joint: unknown;
}

/** Confirmats of one drawer box joint: through the side into the edge of the front or back wall (r1.html:6023). */
export function addDrawerConfirmatJoint(holes: Hole[], connections: Connection[], { id, drawerId, moduleId, sectionId, sideId, wallId, sideX, wallEdge, boxHeight, joint }: DrawerConfirmatJoint) {
  const geometry = drawerJointGeometryCheck(boxHeight);
  geometry.coords.forEach((y, pairIndex) => {
    const meta = {
      connectionId: id,
      drawerId,
      joint,
      pairIndex: pairIndex + 1,
    };
    addConfirmatThroughHole(holes, sideId, 'outside', sideX, y, 'Короб ящика — конфирмат', meta);
    addConfirmatBlindHole(holes, wallId, wallEdge, y, 'Короб ящика — конфирмат', meta);
  });
  connections.push({
    id,
    type: 'drawerBox',
    joint,
    drawerId,
    a: sideId,
    b: wallId,
    fastener: 'Конфирмат 7×50',
    fastenerPresetId: FASTENER_PRESETS.CONFIRMAT_7X50.id,
    qty: geometry.coords.length,
    moduleId,
    sectionId,
    holePairCount: geometry.coords.length,
  });
  return geometry;
}
