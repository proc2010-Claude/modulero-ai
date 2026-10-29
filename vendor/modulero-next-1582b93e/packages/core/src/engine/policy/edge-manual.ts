// Manual edge banding of a part (MOD-DEC-319, limits MOD-DEC-325), task W1. The prototype stores
// manual banding per physical edge in state.edgeOverrides ({ partId: { edge: profile | 'AUTO' } }) and applies it in
// applyEdgeModelToPart, but its editor is not shown (FINDINGS 63): there is no golden reference, the tests follow the rule.
//
// The rule (edgeManualEdit): banding is automatic by default; in the «продвинутый» mode or for the roles мебельщик and
// дизайнер a side of a chipboard part (facades of chipboard included) can be set to a profile of the catalogue
// (0.4 / 0.8–1.0 / 2.0 mm), to no band, or back to AUTO. MDF facades and HDF parts are not banded and not edited.
// No band is allowed everywhere, also on a visible or floor edge: a non-blocking warning, never a refusal.
// The finished size with the band stays (MOD-DEC-169: the designer works with the finished part); the blank, the
// banding operations and their cost are computed again from the new effective intents. Drilling is based on the
// finished part (169), so it does not move.
import { EDGE_OVERRIDE_OPTIONS, edgeGeometryForPart } from '../../wardrobe/edges.js';
import { deBlank } from './depth.js';
import { EdgeOperation, applyEdgeModelToPart, edgeManualEdit, edgePriceResolve, physicalEdgeLabelRu } from './edge-model.js';
import type { PolicyState, Rec } from './project-state.js';
import { floorContactEdgeValidator } from './validators.js';

/** Who edits: the workspace mode and the role of the user (MOD-DEC-319). */
export interface EdgeEditAccess {
  mode?: string;
  role?: string;
}

/** Manual banding is open in the «продвинутый» mode and for the roles мебельщик and дизайнер (MOD-DEC-319). */
export function canEditEdges(access: EdgeEditAccess): boolean {
  const c = edgeManualEdit.constants;
  return c.modes.value.includes(access.mode as never) || c.roles.value.includes(access.role as never);
}

export type EdgeEditRefusal = 'NO_ACCESS' | 'NOT_EDITABLE_PART' | 'UNKNOWN_EDGE' | 'UNKNOWN_PROFILE';

/** Board family of a part as addPart gives it (r1.html:5726): its own, else HDF for a back panel or drawer bottom, else ЛДСП. */
export function partBoardFamily(part: Rec): string {
  return part.materialFamily || (['back', 'drawerBottom'].includes(part.kind) ? 'HDF' : 'LDSP');
}

/** The part can be banded by hand: chipboard only, facades of chipboard included (edgeManualEdit.editableParts). */
export function canEditPartEdges(part: Rec): boolean {
  return edgeManualEdit.constants.editableParts.value.includes(partBoardFamily(part) as never);
}

export type EdgeEditResult = { ok: true; edgeOverrides: Rec } | { ok: false; refusal: EdgeEditRefusal; text: string };

/**
 * Sets the band of one physical edge of a part to `choice` (a profile of EDGE_OVERRIDE_OPTIONS or 'AUTO').
 * Returns new overrides; the given ones are not changed. 'AUTO' removes the manual value, and a part without
 * manual values leaves the map.
 */
export function setEdgeOverride(edgeOverrides: Rec | null | undefined, part: Rec, physicalEdge: string, choice: string, access: EdgeEditAccess): EdgeEditResult {
  if (!canEditEdges(access)) return { ok: false, refusal: 'NO_ACCESS', text: 'Ручная кромка доступна в режиме «Продвинутый» и для мебельщика и дизайнера.' };
  if (!canEditPartEdges(part)) return { ok: false, refusal: 'NOT_EDITABLE_PART', text: `Деталь ${part.id} не из ЛДСП: фасады из МДФ и детали из ХДФ не кромятся.` };
  if (!Object.prototype.hasOwnProperty.call(edgeGeometryForPart(part), physicalEdge)) return { ok: false, refusal: 'UNKNOWN_EDGE', text: `У детали ${part.id} нет торца «${physicalEdge}».` };
  if (!EDGE_OVERRIDE_OPTIONS.includes(choice) || (choice !== edgeManualEdit.constants.defaultMode.value && !edgeManualEdit.constants.editableThicknesses.value.includes(choice as never)))
    return { ok: false, refusal: 'UNKNOWN_PROFILE', text: `Профиля кромки «${choice}» нет в каталоге.` };
  const all: Rec = { ...(edgeOverrides || {}) },
    own: Rec = { ...(all[part.id] || {}) };
  if (choice === edgeManualEdit.constants.defaultMode.value) delete own[physicalEdge];
  else own[physicalEdge] = choice;
  if (Object.keys(own).length) all[part.id] = own;
  else delete all[part.id];
  return { ok: true, edgeOverrides: all };
}

/** Banding operations of a part, as the wardrobe model counts them for the price (r1.html:12761). */
export function edgeOperationsOfPart(p: Rec) {
  return p.physicalEdges.map((edge: string) => {
    const profile = p.effectiveEdges[edge] || 'NONE',
      tariff = edgePriceResolve(p.T, profile, p.edgeApplicationType || 'straight', p.edgeGlueTechnology || 'PUR', p.panelServiceCategory || 'STANDARD');
    return EdgeOperation(p, edge, profile, tariff);
  });
}

/** One part under the given banding: its edge fields, sawn blank and banding operations (the input part is not changed). */
export function bandedPart(part: Rec, d: PolicyState) {
  const p = applyEdgeModelToPart(structuredClone(part), d);
  return { part: p, blank: deBlank(p), operations: edgeOperationsOfPart(p) };
}

/**
 * What a change of the manual banding does to a part: the finished size stays, the blank and the banding
 * operations follow the new effective intents. `before` and `after` are the edge overrides of the project.
 */
export function edgeEditEffect(part: Rec, before: Rec | null | undefined, after: Rec | null | undefined, d: PolicyState = {}) {
  const was = bandedPart(part, { ...d, edgeOverrides: before }),
    now = bandedPart(part, { ...d, edgeOverrides: after }),
    changedEdges = was.part.physicalEdges.filter((e: string) => was.part.effectiveEdgeIntents[e] !== now.part.effectiveEdgeIntents[e] || was.part.effectiveEdges[e] !== now.part.effectiveEdges[e]);
  return {
    partId: part.id,
    finished: { L: part.L, W: part.W, T: part.T },
    changedEdges,
    before: was,
    after: now,
    /** Non-blocking: edges left without a band by hand, floor edges without protection. */
    warnings: [...manualEdgeWarnings(now.part), ...floorContactEdgeValidator([now.part]).issues],
  };
}

/**
 * Warnings of manual banding, never refusals (MOD-DEC-319): an edge the automatic rule bands (visible) left without a
 * band by hand. A floor edge without a band is warned by floorContactEdgeValidator. Reads the edge fields of a banded part.
 */
export function manualEdgeWarnings(p: Rec): Rec[] {
  return (p.physicalEdges || [])
    .filter((edge: string) => p.edgeOverrides?.[edge] === 'NONE' && p.automaticEdgeIntents?.[edge] && p.automaticEdgeIntents[edge] !== 'NONE')
    .map((edge: string) => ({
      level: edgeManualEdit.constants.noBandWarning.value,
      code: 'MANUAL_EDGE_WITHOUT_BAND',
      partId: p.id,
      physicalEdge: edge,
      text: `${p.id}: торец «${physicalEdgeLabelRu(edge)}» оставлен без кромки вручную; автоматически здесь ставится кромка.`,
    }));
}
