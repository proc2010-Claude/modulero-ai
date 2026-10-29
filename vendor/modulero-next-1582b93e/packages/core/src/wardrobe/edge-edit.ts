// Manual edge banding in the editor of the swing and the sliding wardrobe (MOD-DEC-319, limits 325, any furniture 743;
// task MOD-AI-26). The rule is engine/policy/edge-manual.ts (W1) and does not change here: the edits below call it on
// the parts the carcass builds and keep its result in state.edgeOverrides ({ partId: { edge: profile } }), which the
// carcass already reads (applyEdgeModelToPart). The finished size stays, the blank, the banding and the price follow.
// «Без кромки» is never refused: the bell says it (MOD-DEC-325). Each edit takes a WardrobeInput and returns a new one.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { canEditEdges, canEditPartEdges, partBoardFamily, setEdgeOverride, type EdgeEditAccess } from '../engine/policy/edge-manual.js';
import { fewOf } from '../engine/edge-overrides.js';
import { edgeManualEdit, physicalEdgeLabelRu } from '../engine/policy/edge-model.js';
import { carcassModel } from './carcass.js';
import { EDGE_OVERRIDE_OPTIONS, EDGE_PROFILES, edgeGeometryForPart } from './edges.js';
import type { JsonValue, WardrobeInput } from './input.js';

type EditResult = { ok: true; input: WardrobeInput; notice?: string } | { ok: false; problem: string };
type Rec = Record<string, any>;

export type { EdgeEditAccess };

/** A choice of the manual band: a profile of the catalogue, «Без кромки» or back to automatic (MOD-DEC-325). */
export type EdgeChoice = 'AUTO' | 'NONE' | 'PVC_ABS_0_4' | 'PVC_ABS_0_8_1_0' | 'PVC_ABS_2_0';

/** The choices in the order of the edge dialog, with their Russian names. */
export const EDGE_CHOICES: readonly { id: EdgeChoice; title: string }[] = EDGE_OVERRIDE_OPTIONS.map((id) => ({
  id: id as EdgeChoice,
  title: id === edgeManualEdit.constants.defaultMode.value ? 'Авто' : EDGE_PROFILES[id]!.title,
}));

/** One edge of a part as the edge dialog and the project summary show it. */
export interface PartEdgeSummary {
  /** The physical edge of the part: front, rear, top, bottom, left, right — the name the edits take. */
  edge: string;
  /** «Передний», «Задний»… */
  label: string;
  lengthMm: number;
  /** The band the part gets: the manual one, else the automatic one. */
  profile: string;
  /** The band of the automatic rule on this edge. */
  automatic: string;
  /** The manual choice or AUTO. */
  override: string;
}

/** A part with its edges and current banding (MOD-DEC-743: the parts with edges in the project summary). */
export interface EdgePartSummary {
  id: string;
  name: string;
  /** Board family: LDSP, HDF, MDF… */
  materialFamily: string;
  /** A chipboard part, facades of chipboard included: its edges can be set by hand (MOD-DEC-325). */
  editable: boolean;
  edges: PartEdgeSummary[];
}

const clone = (i: WardrobeInput): WardrobeInput => JSON.parse(JSON.stringify(i)) as WardrobeInput;

/** Every part of the wardrobe with its edges and the band of each, in the order of the carcass. */
export function partEdges(i: WardrobeInput, hw: HardwareCatalogs): EdgePartSummary[] {
  return (carcassModel(i, hw).parts as Rec[]).map((p) => {
    const geometry = edgeGeometryForPart(p);
    return {
      id: String(p.id),
      name: String(p.name ?? p.id),
      materialFamily: partBoardFamily(p),
      editable: canEditPartEdges(p),
      edges: Object.values(geometry).map((g) => ({
        edge: g.physicalEdge,
        label: String(physicalEdgeLabelRu(g.physicalEdge)),
        lengthMm: g.lengthMm,
        profile: String(p.effectiveEdges?.[g.physicalEdge] ?? 'NONE'),
        automatic: String(p.automaticEdges?.[g.physicalEdge] ?? 'NONE'),
        override: String(p.edgeOverrides?.[g.physicalEdge] ?? 'AUTO'),
      })),
    };
  });
}

function partOf(i: WardrobeInput, hw: HardwareCatalogs, partId: string): Rec | null {
  return (carcassModel(i, hw).parts as Rec[]).find((p) => p.id === partId) ?? null;
}

function withOverrides(i: WardrobeInput, overrides: Rec): WardrobeInput {
  const o = clone(i);
  o.state.edgeOverrides = overrides as { [part: string]: JsonValue };
  return o;
}

/** What the edit leaves without a band where the automatic rule bands: said, not refused (MOD-DEC-325). */
function noBandNotice(i: WardrobeInput, hw: HardwareCatalogs, ids: ReadonlySet<string>): string | undefined {
  const bare = partEdges(i, hw)
    .filter((p) => ids.has(p.id))
    .flatMap((p) => p.edges.filter((e) => e.override === 'NONE' && e.automatic !== 'NONE').map((e) => `${p.name} — ${e.label.toLowerCase()}`));
  return bare.length ? `Без кромки на торце, где она ставится автоматически: ${fewOf(bare)}. Замечание — в колокольчике.` : undefined;
}

/**
 * «Кромка торца»: the band of one edge of a part — a profile of the catalogue, «Без кромки» (NONE) or AUTO (MOD-DEC-319,
 * 325, 743). `access` — the «продвинутый» mode or the role of the user. The refusals are the rule's: no access, a part
 * not of chipboard, an edge the part has not, a profile not in the catalogue.
 */
export function setPartEdge(i: WardrobeInput, hw: HardwareCatalogs, partId: string, edge: string, choice: EdgeChoice, access: EdgeEditAccess): EditResult {
  const part = partOf(i, hw, partId);
  if (!part) return { ok: false, problem: `В шкафу нет детали ${partId}` };
  const r = setEdgeOverride(i.state.edgeOverrides as Rec, part, edge, choice, access);
  if (!r.ok) return { ok: false, problem: r.text };
  const o = withOverrides(i, r.edgeOverrides),
    notice = noBandNotice(o, hw, new Set([partId]));
  return notice ? { ok: true, input: o, notice } : { ok: true, input: o };
}

/**
 * «Кромка на всех торцах»: one band on every edge of a part (`partId`) or of the whole wardrobe (`partId` null), for
 * example a wardrobe for a bathroom (MOD-DEC-743). For the whole wardrobe the parts that are not banded (HDF, MDF
 * facades) are left as they are and named in the notice; AUTO gives every part its automatic banding back.
 */
export function setAllEdges(i: WardrobeInput, hw: HardwareCatalogs, partId: string | null, choice: EdgeChoice, access: EdgeEditAccess): EditResult {
  if (!canEditEdges(access)) {
    // The rule says why: its refusal of access comes before it looks at the part.
    const r = setEdgeOverride(null, {}, '', choice, access);
    return { ok: false, problem: r.ok ? '' : r.text };
  }
  const parts = carcassModel(i, hw).parts as Rec[],
    chosen = partId === null ? parts : parts.filter((p) => p.id === partId);
  if (!chosen.length) return { ok: false, problem: `В шкафу нет детали ${partId}` };
  let overrides = (i.state.edgeOverrides ?? {}) as Rec;
  const skipped: string[] = [];
  for (const p of chosen) {
    if (partId === null && !canEditPartEdges(p)) {
      skipped.push(String(p.name ?? p.id));
      continue;
    }
    for (const edge of Object.keys(edgeGeometryForPart(p))) {
      const r = setEdgeOverride(overrides, p, edge, choice, access);
      if (!r.ok) return { ok: false, problem: r.text };
      overrides = r.edgeOverrides;
    }
  }
  const o = withOverrides(i, overrides),
    notices = [
      skipped.length ? `Не кромятся и остались как были: ${[...new Set(skipped)].join(', ')} (не ЛДСП).` : null,
      noBandNotice(o, hw, new Set(chosen.map((p) => String(p.id)))) ?? null,
    ].filter(Boolean);
  return notices.length ? { ok: true, input: o, notice: notices.join(' ') } : { ok: true, input: o };
}
