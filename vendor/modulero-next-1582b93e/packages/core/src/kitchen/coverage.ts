// The coverage of the kitchen calculation (task K3, MIGRATION_PLAN step 4.3): for every module whether its geometry
// is complete, what is left unknown and which parts it owns. The prototype's kflowGeometryCoverage layered over eight
// wrappers (r1.html:69900–78091, outermost the release presentation r1.html:70153 installed last) as one call path:
//   release (part checks, unknown fields, shared parts) → kap → kcr → kre → kpm → kn → ki → kp → base.
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
import type { Rec } from '../engine/policy/project-state.js';
import { bodyEdge, confirmedGeometryType, diagonalCalculated, isAppliance, isConstruction, isFiller, isPlace, knAffected, part, railsOnTop, supported } from './carcass.js';
import { allParts, derived } from './derived.js';
import { levelRunner } from './drawer-runner.js';
import { isAccessL, isDiagonal, isFree, type KitchenScene } from './room.js';
import { KITCHEN_STANDARD } from './standard.js';

/**
 * Parts of a module known without a position (kflowPendingParts r1.html:69874 with kn 72857 and kcr 75316): the lower
 * shelf of the combined cabinet and the diagonal polygons; both belong to constructions, whose parts are all placed.
 */
export function pendingParts(s: KitchenScene): Rec[] {
  const base = s.modules
    .filter((m) => m.moduleTypeId === 'KB_COMBINED')
    .flatMap((m) => {
      const card = KITCHEN_STANDARD.cards.find((c) => c.moduleTypeId === m.moduleTypeId),
        t = m.panelThickness ?? 16,
        b = m.backThickness ?? KITCHEN_STANDARD.defaults.back_thickness_mm!.value,
        n = m.fill?.lowerShelf ?? card?.owner_options?.lower_shelves,
        W = m.width - 2 * t,
        D = m.depth - b,
        edge = bodyEdge(m);
      if (!Number.isInteger(n) || n < 0 || ![W, D, t, edge].every(Number.isFinite) || Math.min(W, D, t) <= 0 || D - edge <= 0) return [];
      return Array.from({ length: n }, (_, i) => ({
        ...part(s, m, 'Полка нижней зоны', 'lower-zone:shelf:' + (i + 1), [W, D, t], null, 'CORPUS', { left: 0, right: 0, top: 0, bottom: edge }),
        status: 'NEED_POSITION',
        positionStatus: 'NEED_POSITION',
        exportPosition: null,
        note: 'Выберите разделение ящика и двери, высоту нижней зоны и положение полки. В 3D деталь не размещена.',
      }));
    });
  return [...base, ...s.modules.filter(isDiagonal).flatMap((m) => diagonalCalculated(s, m).polygonPending)].filter((p) => !isConstruction(s.modules.find((m) => m.id === p.moduleId)));
}

/** A placed part with positive dimensions, a valid box and contour (kflowCoveragePartValid, r1.html:70106). */
function partValid(p: Rec): boolean {
  const dims = (a: unknown) => Array.isArray(a) && a.length === 3 && a.every((v) => Number.isFinite(v) && v > 0),
    polygon = (a: any) =>
      a === undefined ||
      a === null ||
      (Array.isArray(a) &&
        a.length >= 3 &&
        a.every((v) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite)) &&
        Math.abs(
          a.reduce((sum: number, v: number[], i: number) => {
            const n = a[(i + 1) % a.length];
            return sum + v[0]! * n[1] - n[0] * v[1]!;
          }, 0),
        ) > 1e-6);
  return (
    !!p &&
    typeof p.partId === 'string' &&
    !!p.partId &&
    dims(p.finished_mm) &&
    dims(p.blank_mm) &&
    Array.isArray(p.box) &&
    p.box.length === 6 &&
    p.box.every(Number.isFinite) &&
    [0, 2, 4].every((i) => p.box[i + 1] > p.box[i]) &&
    polygon(p.finished_polygon_mm) &&
    polygon(p.blank_polygon_mm) &&
    p.status === 'GEOMETRY_DRAFT' &&
    (!p.positionStatus || p.positionStatus === 'PLACED')
  );
}

/** The layers kp … kap of one coverage row (r1.html:72501, 72599, 72892, 73098, 74042, 75320, 78091). */
function layeredRow(m: Rec, pending: Rec[], d: (m: Rec) => Rec): Rec {
  const dm = d(m),
    isSupported = supported(m) || isFiller(m) || isPlace(m),
    placed = isSupported ? dm.parts || [] : [],
    nominal = isSupported ? [] : (dm.parts || []).filter((p: Rec) => Array.isArray(p.finished_mm) && p.finished_mm.every((x: number) => Number.isFinite(x) && x > 0)),
    completeGeometry = (confirmedGeometryType(m) || isFiller(m) || isPlace(m)) && dm.status === 'GEOMETRY_DRAFT';
  let c: Rec = {
    moduleId: m.id,
    moduleTypeId: m.moduleTypeId,
    name: m.name,
    status: completeGeometry ? dm.status : dm.status === 'FAIL' ? 'FAIL' : 'NEED_DATA',
    placedPartCount: placed.length,
    exportPartCount: placed.length,
    nominalPartsOutsideExport: nominal.map((p: Rec) => ({ name: p.name, count: p.count, finished_mm: p.finished_mm, blank_mm: p.blank_mm, status: 'NEED_POSITION' })),
    pendingParts: pending.filter((p) => p.moduleId === m.id),
    unknownFields: dm.localOpenFields || [],
    completeGeometry,
    manufacturingQualified: false,
  };
  // kp: the accessible L corner keeps its polygon parts outside the rectangular export
  if (isAccessL(m)) {
    const poly = dm.parts.filter((p: Rec) => p.rectangularExportEligible === false);
    c = {
      ...c,
      exportPartCount: dm.parts.length - poly.length,
      polygonPartsOutsideRectExport: poly.map((p: Rec) => ({ partId: p.partId, name: p.name, finished_polygon_mm: p.finished_polygon_mm, area_mm2: p.finished_area_mm2, blankStatus: 'UNKNOWN', edgeStatus: 'UNKNOWN' })),
      geometryBasis: dm.geometryBasis,
      actualCornerAngleStatus: dm.actualCornerAngleStatus,
    };
  }
  // ki: an island by its saved plan
  if (isFree(m))
    c = { ...c, placementBasis: dm.placementBasis, effective_depth_mm: dm.effective_depth_mm, islandUnknownFields: dm.islandUnknownFields, pendingOuterDrawerCount: m.catalogId === 'island-drawers' ? (m.fill?.drawers ?? null) : null };
  // kn: a partial nominal geometry
  if (knAffected(m))
    c = {
      ...c,
      status: dm.status === 'FAIL' ? 'FAIL' : 'NEED_DATA',
      completeGeometry: false,
      manufacturingQualified: false,
      nominalUnknownFields: dm.nominalUnknownFields || [],
      rendererPendingPartCount: dm.polygonPending?.length || 0,
      nominalGeometricPartCount: dm.nominalGeometricPartCount ?? dm.parts.length,
      geometryBasis: dm.geometryBasis,
      actualCornerAngleStatus: dm.actualCornerAngleStatus,
    };
  // kpm: the diagonal polygons outside the rectangular export
  if (isDiagonal(m)) {
    const polygons = dm.parts.filter((p: Rec) => p.diagonalPolygon);
    c = {
      ...c,
      rendererPendingPartCount: 0,
      exportPartCount: dm.parts.filter((p: Rec) => p.rectangularExportEligible !== false).length,
      polygonPartsOutsideRectExport: polygons.map((p: Rec) => ({ partId: p.partId, name: p.name, shapeKind: 'DIAGONAL', finished_polygon_mm: p.finished_polygon_mm, area_mm2: p.finished_area_mm2, blankStatus: 'UNKNOWN', edgeStatus: 'UNKNOWN' })),
    };
  }
  // kre: the TANDEM drawers complete the drawer cabinet; the box of the kit of the runner of the level has no front wall
  // (MOD-DEC-514, FINDINGS 1863): four parts and the facade a drawer.
  if (m.drawerProfile === 'BLUM-TANDEM560H5000B-WOOD16') {
    const complete =
      dm.status === 'GEOMETRY_DRAFT' &&
      dm.parts.filter((p: Rec) => p.drawerId).length === (levelRunner(m) ? 20 : 24) &&
      // MOD-DEC-566 п. 1 (FINDINGS 1263): a new floor carcass is closed by its two rails instead of the top.
      ['side:L', 'side:R', ...(railsOnTop(m) ? ['rail:front', 'rail:rear'] : ['top']), 'bottom', 'back'].every((id) => dm.parts.some((p: Rec) => p.partId === m.id + ':' + id)) &&
      dm.parts.every((p: Rec) => p.box?.length === 6 && p.finished_mm?.every((x: number) => Number.isFinite(x) && x > 0));
    c = {
      ...c,
      status: complete ? 'GEOMETRY_DRAFT' : c.status,
      completeGeometry: complete,
      unknownFields: dm.localOpenFields || [],
      manufacturingQualified: false,
      installationPlanningQualified: complete,
      qualificationScope: 'Runner planning dimensions and complete project wooden box geometry; template pilots, wood strength and site remain separately qualified',
    };
  }
  // kcr: a construction or an island is complete with all its parts placed
  if (isConstruction(m) || isFree(m)) {
    const complete = dm.status === 'GEOMETRY_DRAFT' && dm.parts?.length > 0 && dm.parts.every((p: Rec) => p.box?.length === 6 && p.finished_mm?.every((v: number) => Number.isFinite(v) && v > 0));
    c = {
      ...c,
      status: complete ? 'GEOMETRY_DRAFT' : dm.status,
      completeGeometry: complete,
      placedPartCount: dm.parts?.length || 0,
      exportPartCount: dm.parts?.length || 0,
      pendingParts: [],
      nominalPartsOutsideExport: [],
      nominalUnknownFields: [],
      unknownFields: dm.localOpenFields || [],
      islandUnknownFields: [],
      rendererPendingPartCount: 0,
      polygonPartsOutsideRectExport: [],
      manufacturingQualified: false,
      installationPlanningQualified: complete,
      qualificationScope: 'Complete furniture geometry and selected component installation planning; actual material/tool/site qualification separate',
    };
  }
  // kap: an appliance cabinet by its selected appliances
  if (isAppliance(m))
    c = {
      ...c,
      status: dm.status,
      completeGeometry: dm.status === 'GEOMETRY_DRAFT',
      manufacturingQualified: false,
      nominalUnknownFields: dm.nominalUnknownFields,
      placedPartCount: dm.parts.length,
      exportPartCount: dm.parts.length,
      unknownFields: dm.releaseOpenFields,
      appliances: dm.applianceSelections.map((a: Rec) => ({ model: a.model, mode: a.mode })),
      applianceEnvelopeCount: dm.applianceEnvelopes.length,
    };
  return c;
}

/**
 * The geometry is complete except the heat resistance of the chosen materials (kflowCoverageMaterialOnly, r1.html:70135):
 * the text of the coverage names it apart, and the price of the rate card counts such a module (MOD-DEC-741, cost.ts).
 */
export function materialOnly(r: Rec): boolean {
  const required = (r.unknownFields || []).filter((f: Rec) => f?.mandatoryForSelectedVariant && f.status === 'UNKNOWN' && /^Термостойкость корпуса для /.test(f.field || '')),
    nominal = r.nominalUnknownFields || [];
  return (
    !r.completeGeometry &&
    r.status === 'NEED_DATA' &&
    !r.geometryNote &&
    required.length > 0 &&
    nominal.length === required.length &&
    nominal.every((f: unknown) => required.some((x: Rec) => x.field === f)) &&
    !(r.unknownFields || []).some((f: Rec) => f?.status === 'UNKNOWN' && !required.includes(f)) &&
    (r.physicalPartIds || []).length === r.exportPartCount &&
    r.exportPartCount > 0 &&
    !(r.coverageIssues || []).length &&
    !(r.pendingParts || []).length &&
    !(r.nominalPartsOutsideExport || []).length &&
    !(r.islandUnknownFields || []).length &&
    !(r.rendererPendingPartCount || 0)
  );
}

/** The coverage of every module (kflowGeometryCoverage, outermost: the release presentation r1.html:70153). */
export function kitchenCoverage(s: KitchenScene): Rec[] {
  const cache = new Map<string, Rec>(),
    d = (m: Rec) => {
      if (!cache.has(m.id)) cache.set(m.id, derived(s, m));
      return cache.get(m.id)!;
    },
    pending = pendingParts(s),
    source = s.modules.map((m) => layeredRow(m, pending, d)),
    parts = allParts(s);
  if (parts.some((p) => !p || !s.modules.some((m) => m.id === p.moduleId)) || source.some((r) => !r || !s.modules.some((m) => m.id === r.moduleId))) throw Error('В составе есть запись без существующего модуля.');
  const counts = new Map<string, number>();
  for (const p of parts) counts.set(p.partId, (counts.get(p.partId) || 0) + 1);
  return s.modules.map((m) => {
    const matches = source.filter((r) => r.moduleId === m.id),
      row = matches.length === 1 ? matches[0]! : { moduleId: m.id, moduleTypeId: m.moduleTypeId, name: m.name, status: 'NEED_DATA', completeGeometry: false, manufacturingQualified: false },
      dm = d(m),
      owned = parts.filter((p) => p.moduleId === m.id),
      shared = parts.filter((p) => p.moduleId !== m.id && p.supportingModuleIds?.includes(m.id)),
      relevant = [...owned, ...shared],
      modulePending = pending.filter((p) => p.moduleId === m.id),
      issues: string[] = [];
    for (const p of row.pendingParts || []) if (!modulePending.some((x) => x.partId === p.partId)) modulePending.push(p);
    if (matches.length !== 1) issues.push('Не получен единственный результат проверки этого модуля.');
    // A place for a free-standing appliance has no parts of its own (MOD-DEC-752).
    if (!relevant.length && !isPlace(m)) issues.push('Размещённые детали этого модуля не определены.');
    for (const p of relevant) {
      if (!partValid(p)) issues.push(p.partId + ': размеры, контур или положение детали требуют исправления.');
      if (counts.get(p.partId) !== 1) issues.push(p.partId + ': номер детали повторяется в итоговом составе.');
    }
    const unknown: Rec[] = [];
    for (const f of [...(row.unknownFields || []), ...(dm.localOpenFields || []), ...(dm.releaseOpenFields || [])]) if (!unknown.some((x) => JSON.stringify(x) === JSON.stringify(f))) unknown.push(f);
    const unresolved =
      modulePending.length > 0 ||
      (row.rendererPendingPartCount || 0) > 0 ||
      (row.nominalPartsOutsideExport || []).length > 0 ||
      (row.nominalUnknownFields || []).length > 0 ||
      (row.islandUnknownFields || []).length > 0 ||
      unknown.some((f) => f?.field === 'box parts / bottom / runner / assembly' && f.status === 'UNKNOWN');
    const complete = row.completeGeometry === true && dm.status === 'GEOMETRY_DRAFT' && !issues.length && !unresolved,
      status = dm.status === 'FAIL' || issues.length ? 'FAIL' : complete ? 'GEOMETRY_DRAFT' : row.status === 'GEOMETRY_DRAFT' ? 'NEED_DATA' : row.status;
    return {
      ...row,
      status,
      completeGeometry: complete,
      ...(Number.isInteger(row.pendingOuterDrawerCount) ? { pendingOuterDrawerCount: complete ? 0 : row.pendingOuterDrawerCount } : {}),
      placedPartCount: owned.length,
      exportPartCount: owned.length,
      physicalPartIds: owned.map((p) => p.partId),
      sharedPartRefs: shared.map((p) => ({ partId: p.partId, ownerModuleId: p.moduleId })),
      pendingParts: modulePending,
      unknownFields: unknown,
      coverageIssues: issues,
      geometryNote: ['FAIL', 'NEED_DATA', 'GEOMETRY_PARTIAL'].includes(dm.status) ? dm.note : null,
      hasUnqualifiedDrilling: relevant.some((p) => p.drillingStatus !== 'QUALIFIED' || p.operations?.some((o: Rec) => o.production !== true)),
      hasSupportQualification: relevant.some((p) => p.structural || p.requiredSupports?.length || p.supportingModuleIds?.length),
    };
  });
}
