// Orientation of parts and the edge model: file 04 of the prototype r1 (r1.html:5229–5713), task W1
// (MIGRATION_PLAN 3.3). Physical faces and edges of a part, its projection on a drawing, automatic edge banding
// by part kind, manual overrides (MOD-DEC-319), titles, price lookup and operation ids.
//
// Collapsed: applyEdgeModelToPart and the depth layer over it (r1.html:57389, unknown override codes become
// UNKNOWN) are one function. What the prototype read from its global state (state.edgeOverrides,
// state.system32Policy) is the parameter `d`. The orientation cache of frozen parts (WeakMap, r1.html:5304) is
// dropped: the core keeps no module state; the values are the same, only the identity of a repeated answer is
// not (FINDINGS 80).
// Proof: reference/wardrobe-core/w1 (calls with the prototype's answers), packages/core/test/wardrobe.policyW1.test.ts
// and tests/oracle/wardrobe-policy-w1.test.mjs (the core next to the prototype on every real call).
import {
  EDGE_GEOMETRY_BY_KIND,
  EDGE_OVERRIDE_OPTIONS,
  EDGE_PRICE_CATALOG,
  EDGE_PROFILES,
  edgeGeometryForPart,
  edgeIntentForProfileCode,
  edgeIntentThicknessMm,
  edgeIntentTitle,
  normalizeEdgeIntentCode,
  normalizeEdgeProfileCode,
  resolveEdgeIntent,
  resolveEdgeIntentToProfileCode,
} from '../../wardrobe/edges.js';
import type { PolicyState, Rec } from './project-state.js';
import { constant, decision, prototype, standard, unknownSource, type PolicyModule } from './types.js';

/** Orientation family of each part kind (r1.html:5229); unknown kinds are 'uprightPanel'. */
export const PART_ORIENTATION_FAMILY = Object.freeze({
  sideLeft: 'verticalDepth',
  sideRight: 'verticalDepth',
  divider: 'verticalDepth',
  facade: 'uprightWidth',
  drawerFacadeStructural: 'uprightWidth',
  back: 'uprightWidth',
  top: 'horizontalPlan',
  bottom: 'horizontalPlan',
  adjustableShelf: 'horizontalPlan',
  fixedShelf: 'horizontalPlan',
  drawerCoverShelf: 'horizontalPlan',
  drawerSide: 'drawerSide',
  drawerFront: 'uprightPanel',
  drawerBack: 'uprightPanel',
  plinthFront: 'uprightPanel',
  plinthRear: 'uprightPanel',
  drawerBottom: 'horizontalPlan',
}) as Readonly<Record<string, string>>;

/**
 * Automatic edge intents by part kind (edgeRuleEngine, r1.html:5559): [intent, physical edges] in the order the
 * prototype sets them; an edge the part does not have is skipped. `adjustableShelf` depends on the System 32
 * provenance of the project: a new project bands it on four sides (193), an older one only at the front.
 */
export const EDGE_RULES = Object.freeze({
  facade: [['EDGE_2_0', ['top', 'right', 'bottom', 'left']]],
  drawerFacadeStructural: [['EDGE_2_0', ['top', 'right', 'bottom', 'left']]],
  sideLeft: [['EDGE_1_0', ['front']], ['EDGE_0_4', ['top']]],
  sideRight: [['EDGE_1_0', ['front']], ['EDGE_0_4', ['top']]],
  divider: [['EDGE_1_0', ['front']]],
  bottom: [['EDGE_1_0', ['front']]],
  adjustableShelf: [['EDGE_0_4', ['front']]],
  top: [['EDGE_0_4', ['front']]],
  fixedShelf: [['EDGE_0_4', ['front']]],
  drawerCoverShelf: [['EDGE_0_4', ['front']]],
  drawerSide: [['EDGE_2_0', ['top']], ['EDGE_0_4', ['bottom', 'front', 'rear']]],
  drawerFront: [['EDGE_2_0', ['top']], ['EDGE_0_4', ['bottom']]],
  drawerBack: [['EDGE_2_0', ['top']], ['EDGE_0_4', ['bottom']]],
}) as Readonly<Record<string, readonly (readonly [string, readonly string[]])[]>>;

/** The adjustable shelf of a new project (system32Policy.provenance = NEW_PROJECT): 0.4 mm on four sides. */
export const ADJUSTABLE_SHELF_NEW_PROJECT_RULE = Object.freeze([['EDGE_0_4', ['front', 'rear', 'left', 'right']]]) as readonly (readonly [string, readonly string[]])[];

/**
 * Policy of the edge model (MOD-DEC-054: every number and rule with its source). The floor protection threshold is
 * `edges.floorMinThickness` of the E1 policy (ES v1.2 FE-EDGE-002), read through edgeIntentThicknessMm('EDGE_0_4').
 */
export const edgeModel = {
  id: 'edge-model',
  version: '1',
  constants: {
    rules: constant(EDGE_RULES, 'intent', standard('ES v1.2 §18 (MOD-DEC-055)'), 'Автоматическая кромка по виду детали: фасад 2,0 по кругу, передний торец корпуса 1,0, полки 0,4, короб ящика 2,0 сверху'),
    shelfEdge: constant('EDGE_0_4', 'intent', decision('MOD-DEC-193'), 'Кромка полки 0,4 мм; у фиксированной — только видимый торец'),
    adjustableShelfNewProject: constant(ADJUSTABLE_SHELF_NEW_PROJECT_RULE, 'intent', decision('MOD-DEC-193'), 'Съёмная полка нового проекта — 0,4 мм по четырём торцам'),
    adjustableShelfOlderProject: constant(
      EDGE_RULES.adjustableShelf!,
      'intent',
      prototype('r1.html:5579 edgeRuleEngine', 'FINDINGS 80'),
      'Съёмная полка проекта без provenance NEW_PROJECT — только передний торец, как в прототипе',
    ),
    floorContactIntent: constant('EDGE_0_4', 'intent', standard('ES v1.2 FE-EDGE-002'), 'Торец на полу у ЛДСП — кромка не тоньше 0,4 мм; тоньше — поднимается до EDGE_0_4'),
    orientationFamilies: constant(PART_ORIENTATION_FAMILY, 'family', prototype('r1.html:5229 PART_ORIENTATION_FAMILY', 'FINDINGS 80'), 'Семейство ориентации детали по виду'),
    pageRotationRatio: constant(1.35, 'ratio', prototype('r1.html:5495 drawingPageLayoutForPart', 'FINDINGS 80'), 'Лист детали поворачивается, если высота проекции больше ширины в 1,35 раза'),
  },
} as const satisfies PolicyModule;

/**
 * Manual edge banding (MOD-DEC-319, limits MOD-DEC-325): automatic by default; manual editing of the sides of a part in the «продвинутый»
 * mode or for the roles мебельщик and дизайнер. Only parts of chipboard (ЛДСП), facades of chipboard included; MDF
 * facades and every HDF part are not banded and not edited. Choices: the profiles of the prototype catalogue
 * (0.4 / 0.8–1.0 / 2.0 mm) or no band; no band is allowed everywhere, with a non-blocking warning. Band types: PVC
 * 0.4, 0.8, 2.0 mm, ABS only 1.0 mm; the prototype has no ABS profile of its own, so its data are UNKNOWN (FINDINGS 87).
 */
export const edgeManualEdit = {
  id: 'edge-manual-edit',
  version: '3',
  constants: {
    defaultMode: constant('AUTO', 'override', decision('MOD-DEC-319'), 'По умолчанию кромка автоматическая (эталон — прототип)'),
    modes: constant(Object.freeze(['advanced']), 'mode', decision('MOD-DEC-325'), 'Ручная правка доступна в режиме «продвинутый» (переключатель режимов)…'),
    roles: constant(Object.freeze(['furnitureMaker', 'designer']), 'role', decision('MOD-DEC-325'), '…или ролям мебельщик и дизайнер'),
    choices: constant(EDGE_OVERRIDE_OPTIONS, 'profile', prototype('r1.html:5009 EDGE_OVERRIDE_OPTIONS', 'FINDINGS 81'), 'Выбор ручной кромки — профили каталога прототипа и AUTO'),
    editableParts: constant(Object.freeze(['LDSP']), 'materialFamily', decision('MOD-DEC-325'), 'Правка — у деталей из ЛДСП, включая фасады из ЛДСП; фасады из МДФ и детали из ХДФ не кромятся и не правятся'),
    editableThicknesses: constant(Object.freeze(['NONE', 'PVC_ABS_0_4', 'PVC_ABS_0_8_1_0', 'PVC_ABS_2_0']), 'profile', decision('MOD-DEC-325'), 'Толщины 0,4 / 0,8–1,0 / 2,0 мм или без кромки — профили каталога'),
    noBandWarning: constant('warn', 'level', decision('MOD-DEC-325'), '«Без кромки» разрешено везде, в том числе на видимом торце и на полу: неблокирующее предупреждение'),
    bandTypes: constant(Object.freeze({ PVC: Object.freeze([0.4, 0.8, 2]), ABS: Object.freeze([1]) }), 'mm', decision('MOD-DEC-325'), 'Тип кромки — признак профиля: ПВХ 0,4 / 0,8 / 2,0 мм, АБС только 1,0 мм'),
    absCatalogue: constant(null, 'profile', unknownSource('В каталоге прототипа нет профиля АБС 1,0 мм (PVC_ABS_0_8_1_0 — общий ПВХ/АБС 0,8–1,0); данные АБС — до каталога'), 'Профиль АБС 1,0: декоры, цена, номинальная толщина — неизвестны (FINDINGS 87)'),
  },
} as const satisfies PolicyModule;

/** Band types (PVC, ABS) a profile of the catalogue can be, by its thickness range (edgeManualEdit.bandTypes). */
export function edgeBandTypesOfProfile(code: unknown): string[] {
  const p = Object.prototype.hasOwnProperty.call(EDGE_PROFILES, code as string) ? EDGE_PROFILES[code as string]! : null;
  if (!p || p.code === 'NONE') return [];
  return Object.entries(edgeManualEdit.constants.bandTypes.value)
    .filter(([, mm]) => mm.some((t) => t >= p.thicknessMin && t <= p.thicknessMax))
    .map(([type]) => type);
}

export type FaceNormals = Record<string, string>;

/** Normals of the physical faces of a part in product axes (r1.html:5248). */
export function installationFaceNormals(part: Rec): FaceNormals {
  switch (part.kind) {
    case 'sideLeft':
      return { inside: '+X', outside: '-X' };
    case 'sideRight':
      return { inside: '-X', outside: '+X' };
    case 'divider':
      return { left: '-X', right: '+X' };
    case 'facade':
    case 'drawerFacadeStructural':
      return { inside: '+Z', outside: '-Z' };
    case 'back':
      return { inside: '-Z', outside: '+Z' };
    case 'drawerSide':
      return part.handedness === 'right' ? { inside: '-X', outside: '+X' } : { inside: '+X', outside: '-X' };
    case 'top':
      return { inside: '-Y', outside: '+Y' };
    case 'bottom':
    case 'fixedShelf':
    case 'adjustableShelf':
    case 'drawerCoverShelf':
      return { inside: '+Y', outside: '-Y' };
    default:
      return { inside: '+Z', outside: '-Z' };
  }
}

/** Orientation of a part (partOrientationUncached, r1.html:5316): family, handedness, edges, faces, dimensions. */
export function partOrientation(part: Rec) {
  const orientationFamily: string = part.orientationFamily || PART_ORIENTATION_FAMILY[part.kind] || 'uprightPanel',
    handedness: string = part.handedness || 'none',
    edgeGeometry = edgeGeometryForPart(part),
    physicalFaces = Object.keys(installationFaceNormals(part));
  return {
    orientationFamily,
    handedness,
    physicalEdges: Object.fromEntries(
      Object.entries(edgeGeometry).map(([k, v]) => [
        k,
        {
          slot: v.slot,
          lengthMm: v.lengthMm,
          labelRu: v.labelRu,
        },
      ]),
    ),
    physicalFaces,
    installationFaceNormals: installationFaceNormals(part),
    domainDimensions: {
      L: Number(part.L) || 0,
      W: Number(part.W) || 0,
      T: Number(part.T) || 0,
    },
  };
}

/** Physical edge in a slot A–D, or null (r1.html:5338). */
export function physicalEdgeForSlot(part: Rec, slot: unknown): string | null {
  return Object.values(edgeGeometryForPart(part)).find((g) => g.slot === slot)?.physicalEdge || null;
}

export interface DomainPoint {
  x: number;
  y: number;
}

/** Point on a physical edge in part coordinates (x along L, y along W), `offset` along the edge (r1.html:5341). */
export function domainPointForPhysicalEdge(part: Rec, physicalEdge: unknown, offset: unknown = 0): DomainPoint {
  const family = partOrientation(part).orientationFamily,
    L = Number(part.L) || 0,
    W = Number(part.W) || 0,
    o = Math.max(0, Number(offset) || 0);
  if (family === 'verticalDepth') return physicalEdge === 'front' ? { x: o, y: 0 } : physicalEdge === 'rear' ? { x: o, y: W } : physicalEdge === 'top' ? { x: L, y: o } : { x: 0, y: o };
  if (family === 'horizontalPlan') return physicalEdge === 'front' ? { x: o, y: 0 } : physicalEdge === 'rear' ? { x: o, y: W } : physicalEdge === 'left' ? { x: 0, y: o } : { x: L, y: o };
  if (family === 'uprightWidth') return physicalEdge === 'left' ? { x: o, y: 0 } : physicalEdge === 'right' ? { x: o, y: W } : physicalEdge === 'top' ? { x: L, y: o } : { x: 0, y: o };
  if (family === 'drawerSide') return physicalEdge === 'front' ? { x: 0, y: o } : physicalEdge === 'rear' ? { x: L, y: o } : physicalEdge === 'top' ? { x: o, y: 0 } : { x: o, y: W };
  return physicalEdge === 'left' ? { x: 0, y: o } : physicalEdge === 'right' ? { x: L, y: o } : physicalEdge === 'top' ? { x: o, y: 0 } : { x: o, y: W };
}

/** Projection of a part on its drawing seen from `face` (r1.html:5412): axes swap, mirroring, screen sides of the edges. */
export function drawingProjectionForPart(part: Rec, face: unknown = 'inside') {
  const orientation = partOrientation(part),
    family = orientation.orientationFamily,
    L = Number(part.L) || 0,
    W = Number(part.W) || 0,
    swap = family === 'verticalDepth' || family === 'uprightWidth',
    screenWidth = swap ? W : L,
    screenHeight = swap ? L : W;
  let mirrorX = false;
  const mirrorY = false;
  if (family === 'verticalDepth') {
    if (part.kind === 'sideLeft') mirrorX = face === 'outside';
    else if (part.kind === 'sideRight') mirrorX = face === 'inside';
    else mirrorX = face === 'left';
  } else if (family === 'uprightWidth') mirrorX = face === 'inside';
  else if (family === 'drawerSide') mirrorX = (part.handedness === 'right') !== (face === 'inside');
  else if (family === 'horizontalPlan') mirrorX = face === 'outside';
  const rawPoint = (x: number, y: number) => (swap ? { u: y, v: L - x } : { u: x, v: y }),
    projectPoint = (x: unknown, y: unknown) => {
      const raw = rawPoint(Number(x) || 0, Number(y) || 0);
      return {
        u: mirrorX ? screenWidth - raw.u : raw.u,
        v: mirrorY ? screenHeight - raw.v : raw.v,
      };
    },
    inversePoint = (u: unknown, v: unknown) => {
      const ru = mirrorX ? screenWidth - Number(u) : Number(u),
        rv = mirrorY ? screenHeight - Number(v) : Number(v);
      return swap ? { x: L - rv, y: ru } : { x: ru, y: rv };
    },
    screenSideForPhysicalEdge = (physicalEdge: string) => {
      const g = edgeGeometryForPart(part)[physicalEdge],
        domain = domainPointForPhysicalEdge(part, physicalEdge, (g?.lengthMm || 0) / 2),
        pt = projectPoint(domain.x, domain.y),
        d = {
          left: Math.abs(pt.u),
          right: Math.abs(screenWidth - pt.u),
          top: Math.abs(pt.v),
          bottom: Math.abs(screenHeight - pt.v),
        };
      return Object.entries(d).sort((a, b) => a[1] - b[1])[0]![0];
    },
    slotToScreenSide = (slot: unknown) => {
      const physical = physicalEdgeForSlot(part, slot);
      return physical ? screenSideForPhysicalEdge(physical) : null;
    };
  return {
    orientation,
    face,
    swapAxes: swap,
    mirrorX,
    mirrorY,
    screenWidth,
    screenHeight,
    projectPoint,
    inversePoint,
    screenSideForPhysicalEdge,
    slotToScreenSide,
  };
}

/** The drawing projection with the production axes X, Y (r1.html:5480). */
export function productionCoordinateSystemForPart(part: Rec, face: unknown = 'inside') {
  const base = drawingProjectionForPart(part, face);
  return {
    ...base,
    axisX: 'X',
    axisY: 'Y',
    coordinatePoint: (x: unknown, y: unknown) => base.projectPoint(x, y),
    domainPoint: (X: unknown, Y: unknown) => ({
      x: Number(X) || 0,
      y: Number(Y) || 0,
    }),
  };
}

/** Page of a part drawing (r1.html:5493): turned by a quarter when the projection is tall (pageRotationRatio). */
export function drawingPageLayoutForPart(part: Rec, face: unknown = 'inside') {
  const production = productionCoordinateSystemForPart(part, face),
    rotated = production.screenHeight > production.screenWidth * edgeModel.constants.pageRotationRatio.value,
    pageWidth = rotated ? production.screenHeight : production.screenWidth,
    pageHeight = rotated ? production.screenWidth : production.screenHeight,
    productionToPage = (u: unknown, v: unknown) => (rotated ? { u: production.screenHeight - Number(v), v: Number(u) } : { u: Number(u), v: Number(v) }),
    domainToPage = (x: unknown, y: unknown) => {
      const q = production.coordinatePoint(x, y);
      return productionToPage(q.u, q.v);
    },
    pageSideForPhysicalEdge = (physicalEdge: string) => {
      const g = edgeGeometryForPart(part)[physicalEdge],
        domain = domainPointForPhysicalEdge(part, physicalEdge, (g?.lengthMm || 0) / 2),
        pt = domainToPage(domain.x, domain.y),
        d = {
          left: Math.abs(pt.u),
          right: Math.abs(pageWidth - pt.u),
          top: Math.abs(pt.v),
          bottom: Math.abs(pageHeight - pt.v),
        };
      return Object.entries(d).sort((a, b) => a[1] - b[1])[0]![0];
    };
  return {
    production,
    rotated,
    pageWidth,
    pageHeight,
    productionToPage,
    domainToPage,
    pageSideForPhysicalEdge,
  };
}

/** A face hole drilled through (r1.html:5531). */
export function isThroughFaceHole(h: Rec | null | undefined): boolean {
  return h?.mode === 'face' && String(h.depth).toLowerCase() === 'through';
}

/** Operations of a part seen from a face (r1.html:5534); the edge-hole view and '—' have no face. */
export function productionOperationsForView(m: Rec, p: Rec, face: unknown) {
  const realFace = face === 'торцевые отверстия' || face === '—' ? null : face,
    faceHs = realFace ? m.holes.filter((h: Rec) => h.panel === p.id && h.mode === 'face' && (h.face === realFace || isThroughFaceHole(h))) : [],
    edgeHs = m.holes.filter((h: Rec) => h.panel === p.id && h.mode === 'edge'),
    gs = realFace ? (m.grooves || []).filter((g: Rec) => g.panel === p.id && g.face === realFace) : [];
  return {
    faceHs,
    edgeHs,
    gs,
    realFace,
  };
}

/** Physical edges of a kind in their order (r1.html:5546). */
export function physicalEdgeOrder(kind: unknown): string[] {
  return Object.keys(EDGE_GEOMETRY_BY_KIND[kind as string] || EDGE_GEOMETRY_BY_KIND.back!);
}

/** Russian label of a physical edge (r1.html:5549). Like the prototype, the lookup goes through a plain object (FINDINGS 41). */
export function physicalEdgeLabelRu(edge: unknown): unknown {
  return (
    (
      {
        front: 'Передний',
        rear: 'Задний',
        top: 'Верхний',
        bottom: 'Нижний',
        left: 'Левый',
        right: 'Правый',
      } as Record<string, unknown>
    )[edge as string] || edge
  );
}

/** Automatic edge intents of a part by its kind (r1.html:5559); reads d.system32Policy.provenance. */
export function edgeRuleEngine(part: Rec, d: PolicyState = {}): Record<string, string> {
  const out: Record<string, string> = {};
  Object.keys(edgeGeometryForPart(part)).forEach((e) => (out[e] = 'NONE'));
  const set = (intent: string, ...es: readonly string[]) =>
    es.forEach((e) => {
      if (out[e] !== undefined) out[e] = intent;
    });
  const rules =
    part.kind === 'adjustableShelf' && d.system32Policy?.provenance === 'NEW_PROJECT'
      ? edgeModel.constants.adjustableShelfNewProject.value
      : Object.prototype.hasOwnProperty.call(EDGE_RULES, part.kind)
        ? EDGE_RULES[part.kind]!
        : [];
  for (const [intent, es] of rules) set(intent, ...es);
  (part.materialFamily === 'LDSP' && Array.isArray(part.floorContactEdges) ? part.floorContactEdges : []).forEach((edge: string) => {
    if (out[edge] !== undefined && edgeIntentThicknessMm(out[edge]) < edgeIntentThicknessMm(edgeModel.constants.floorContactIntent.value)) out[edge] = edgeModel.constants.floorContactIntent.value;
  });
  return out;
}

/** The prototype's second name of edgeRuleEngine (r1.html:5602). */
export const EdgeRuleEngine = edgeRuleEngine;

/** Values by physical edge → values by slot A–D (r1.html:5603). */
export function mapPhysicalEdgesToABCD(part: Rec, edgesMap: Rec): Record<'A' | 'B' | 'C' | 'D', string> {
  const geometry = edgeGeometryForPart(part),
    out: Record<string, string> = {
      A: 'NONE',
      B: 'NONE',
      C: 'NONE',
      D: 'NONE',
    };
  Object.entries(geometry).forEach(([physical, g]) => {
    out[g.slot] = edgesMap[physical] || 'NONE';
  });
  return out as Record<'A' | 'B' | 'C' | 'D', string>;
}

/**
 * Sets the edge fields of a part (applyEdgeModelToPart r1.html:5616 with its depth layer r1.html:57390):
 * automatic intents, manual overrides of d.edgeOverrides[part.id], effective edges and the service profiles.
 * An override with a code that is not a known profile (and not 'V2') leaves the edge UNKNOWN.
 */
export function applyEdgeModelToPart(p: Rec, d: PolicyState = {}): Rec {
  const automaticEdgeIntents = edgeRuleEngine(p, d),
    automaticEdges = Object.fromEntries(Object.entries(automaticEdgeIntents).map(([edge, intent]) => [edge, resolveEdgeIntentToProfileCode(intent)])),
    overrides: Rec = (d.edgeOverrides && d.edgeOverrides[p.id]) || {},
    effectiveEdgeIntents: Record<string, string> = {},
    effectiveEdges: Record<string, string> = {};
  Object.keys(automaticEdgeIntents).forEach((edge) => {
    const override = overrides[edge],
      auto = override === undefined || override === 'AUTO';
    effectiveEdges[edge] = auto ? automaticEdges[edge]! : normalizeEdgeProfileCode(override);
    effectiveEdgeIntents[edge] = auto ? automaticEdgeIntents[edge]! : edgeIntentForProfileCode(effectiveEdges[edge]);
  });
  p.edgeGeometry = edgeGeometryForPart(p);
  p.physicalEdges = Object.keys(p.edgeGeometry);
  p.automaticEdgeIntents = automaticEdgeIntents;
  p.automaticEdges = automaticEdges;
  p.edgeOverrides = Object.fromEntries(p.physicalEdges.map((e: string) => [e, overrides[e] || 'AUTO']));
  p.effectiveEdgeIntents = effectiveEdgeIntents;
  p.effectiveEdges = effectiveEdges;
  p.edgeIntents = mapPhysicalEdgesToABCD(p, effectiveEdgeIntents);
  p.edges = mapPhysicalEdgesToABCD(p, effectiveEdges);
  p.edgeServiceResolution = Object.fromEntries(p.physicalEdges.map((edge: string) => [edge, resolveEdgeIntent(effectiveEdgeIntents[edge])]));
  for (const [edge, code] of Object.entries((d.edgeOverrides?.[p.id] || {}) as Rec))
    if (code !== 'AUTO' && !Object.prototype.hasOwnProperty.call(EDGE_PROFILES, code) && code !== 'V2') {
      p.effectiveEdgeIntents[edge] = 'UNKNOWN';
      p.edgeServiceResolution[edge] = {
        intentCode: 'UNKNOWN',
        intentThicknessMm: null,
        status: 'UNKNOWN',
        source: code,
      };
    }
  return p;
}

/** Title of a service profile (r1.html:5640). */
export function edgeProfileTitle(code: unknown): unknown {
  return EDGE_PROFILES[normalizeEdgeProfileCode(code)]?.title || code || 'Без кромки';
}

/** Title of the edge of a part, effective or automatic (r1.html:5643). */
export function edgeDisplayTitle(part: Rec, physicalEdge: string, mode: unknown = 'effective'): unknown {
  const intents = mode === 'automatic' ? part.automaticEdgeIntents : part.effectiveEdgeIntents,
    profiles = mode === 'automatic' ? part.automaticEdges : part.effectiveEdges,
    intentCode = intents?.[physicalEdge] || edgeIntentForProfileCode(profiles?.[physicalEdge]),
    profileCode = profiles?.[physicalEdge] || resolveEdgeIntentToProfileCode(intentCode);
  if (normalizeEdgeIntentCode(intentCode) === 'NONE') return 'Без кромки';
  const intent = edgeIntentTitle(intentCode),
    profile = edgeProfileTitle(profileCode);
  return normalizeEdgeIntentCode(intentCode) === 'EDGE_1_0' ? `${intent} (сервис ${profile})` : profile;
}

/** r1.html:5653. */
export function edgeDisplayTitleForSlot(part: Rec, slot: unknown, mode: unknown = 'effective'): unknown {
  const physical = physicalEdgeForSlot(part, slot);
  return physical ? edgeDisplayTitle(part, physical, mode) : 'Без кромки';
}

/** A profile code that means a band (r1.html:5657). */
export function edgeProfileApplied(code: unknown): boolean {
  return Boolean(code && normalizeEdgeProfileCode(code) !== 'NONE');
}

/** Price of banding a metre of edge by panel thickness and profile (r1.html:5660). */
export function edgePriceResolve(panelThickness: number, profileCode: unknown, applicationType: unknown = 'straight', glueTechnology: unknown = 'PUR', panelServiceCategory: unknown = 'STANDARD'): Rec {
  const code = normalizeEdgeProfileCode(profileCode);
  if (code === 'NONE')
    return {
      pricePerM: 0,
      tariffNotFound: false,
      profileCode: code,
    };
  const row = EDGE_PRICE_CATALOG.services.find(
    (x) =>
      x.profileCode === code &&
      x.applicationType === applicationType &&
      x.glueTechnology === glueTechnology &&
      x.panelServiceCategory === panelServiceCategory &&
      panelThickness >= x.panelThicknessMin &&
      panelThickness <= x.panelThicknessMax,
  );
  return row
    ? {
        ...row,
        tariffNotFound: false,
      }
    : {
        profileCode: code,
        pricePerM: 0,
        tariffNotFound: true,
        reason: 'Тариф для комбинации панели и профиля не найден',
      };
}

/** r1.html:5678. */
export function physicalEdgeLength(part: Rec, edge: string): number {
  return edgeGeometryForPart(part)[edge]?.lengthMm || 0;
}

/** One banding operation of an edge for the cost and the cut list (r1.html:5681). */
export function EdgeOperation(part: Rec, physicalEdge: string, profileCode: unknown, tariff: unknown) {
  const lengthMm = physicalEdgeLength(part, physicalEdge),
    intentCode = part.effectiveEdgeIntents?.[physicalEdge] || edgeIntentForProfileCode(profileCode);
  return {
    partId: part.id,
    physicalEdge,
    intentCode,
    intentThicknessMm: edgeIntentThicknessMm(intentCode),
    profileCode,
    lengthMm,
    meters: (lengthMm * part.q) / 1000,
    tariff,
  };
}

/** The hinge plate text of the old H0910 holes (r1.html:5695). */
export const HINGE_PLATE_PURPOSE = 'Ответная монтажная планка петли BOYARD H0910 — крепление к боковине/перегородке';

/** Renames the purpose of the H0910 plate holes, in place (r1.html:5695). */
export function normalizeHolePurposes(holes: Rec[]): Rec[] {
  holes.forEach((h) => {
    if (String(h.purpose || '').includes('H0910')) h.purpose = HINGE_PLATE_PURPOSE;
  });
  return holes;
}

/** Operation ids per part: face holes H1…, edge holes E1…, grooves G1… (r1.html:5701). Holes of unknown parts get none. */
export function assignProductionOperationIds(parts: Rec[], holes: Rec[], grooves: Rec[]): void {
  const ids = new Set(parts.map((p) => p.id)),
    counts = new Map<string, number>();
  function set(h: Rec, prefix: string | null) {
    if (!prefix || !ids.has(h.panel)) return;
    const key = h.panel + '|' + prefix,
      n = (counts.get(key) || 0) + 1;
    counts.set(key, n);
    h.operationId = prefix + n;
  }
  for (const h of holes) set(h, h.mode === 'face' ? 'H' : h.mode === 'edge' ? 'E' : null);
  for (const g of grooves) set(g, 'G');
}
