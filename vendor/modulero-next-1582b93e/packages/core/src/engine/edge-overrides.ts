// Manual edge banding of the products whose model counts the band of each edge in millimetres — the kitchen and other
// furniture (MOD-DEC-743 on MOD-DEC-319, 325; task MOD-AI-26). The project keeps the choices as the wardrobe does —
// edgeOverrides { partId: { edge: profile } } — where `edge` is the key of the edge in the part of the product's model
// (edge_mm). A manual profile puts the thickness of its intent on the edge (0,4 / 1,0 / 2,0 mm, «0,8–1,0» — 1,0, as the
// automatic band of that class of the kitchen and of other furniture); the finished size stays, the blank follows.
// Who may edit, which board and which profile — the rule edge-manual.ts decides, as for the wardrobe.
import type { EdgeSlot, Graph, Part, Unresolved } from './contract.js';
import { canEditPartEdges, setEdgeOverride, type EdgeEditAccess } from './policy/edge-manual.js';
import { physicalEdgeLabelRu } from './policy/edge-model.js';
import { edgeIntentForProfileCode, edgeIntentThicknessMm, resolveEdgeIntentToProfileCode } from '../wardrobe/edges.js';
import type { EdgeChoice, EdgePartSummary } from '../wardrobe/edge-edit.js';

/** The manual bands of a project: { partId: { edge of the part's model: profile } }. */
export type EdgeOverrides = { [partId: string]: { [edge: string]: string } };

/** The thickness a profile puts on an edge, mm: the thickness of its intent (NONE — 0). */
export const profileThicknessMm = (profile: string): number => edgeIntentThicknessMm(edgeIntentForProfileCode(profile));

/** The intent of a band of `mm` millimetres, as the generators name it: EDGE_1_0; 0 — NONE. */
export const intentOfThicknessMm = (mm: number): string => (mm ? 'EDGE_' + mm.toFixed(1).replace('.', '_') : 'NONE');

/**
 * The edges of a part of the model with its manual bands: each chosen edge gets the thickness of its profile; AUTO keeps
 * the automatic one. «Без кромки» is 0 when the model keeps every edge (`keepZero`, the kitchen), else the edge leaves
 * the map (other furniture lists only the banded edges). The given map is not changed.
 */
export function withManualBands(edge: Readonly<Record<string, number>>, own: Readonly<Record<string, string>> | undefined, keepZero: boolean): Record<string, number> {
  const out = { ...edge };
  for (const [key, choice] of Object.entries(own ?? {})) {
    if (choice === 'AUTO') continue;
    const mm = profileThicknessMm(choice);
    if (mm || keepZero) out[key] = mm;
    else delete out[key];
  }
  return out;
}

/** How a product names the edges of a part of its graph: the key of the edge in its model, by the slot. */
export type EdgeKeyOf = (part: Part, slot: EdgeSlot) => string;

const SLOTS = ['A', 'B', 'C', 'D'] as const;

/**
 * Every part of the graph with its edges and current banding — the edge dialog and the project summary (MOD-DEC-743).
 * `editable` adds the product's own limits to the rule's board (a part with a contour is banded by its segments).
 */
export function graphPartEdges(g: Graph, overrides: EdgeOverrides | null | undefined, keyOf: EdgeKeyOf, editable: (p: Part) => boolean = () => true): EdgePartSummary[] {
  return g.parts.map((p) => {
    const own = overrides?.[p.id] ?? {};
    return {
      id: p.id,
      name: p.name,
      materialFamily: p.material.family,
      editable: p.supply === 'MANUFACTURED' && canEditPartEdges({ materialFamily: p.material.family }) && editable(p),
      edges: SLOTS.map((slot) => {
        const e = p.edges[slot],
          key = keyOf(p, slot);
        return {
          edge: key,
          label: String(physicalEdgeLabelRu(e.physicalEdge.toLowerCase())),
          lengthMm: e.edgeLengthMm,
          profile: own[key] && own[key] !== 'AUTO' ? own[key]! : resolveEdgeIntentToProfileCode(e.intent),
          automatic: resolveEdgeIntentToProfileCode(e.automaticIntent),
          override: own[key] ?? 'AUTO',
        };
      }),
    };
  });
}

export type BandEditResult = { ok: true; edgeOverrides: EdgeOverrides; parts: string[] } | { ok: false; problem: string };

/**
 * Sets the band of one edge (`edge`) or of every edge (`edge` null) of a part (`partId`) or of every part (`partId`
 * null). The rule edge-manual.ts says who may edit, which board is banded and which profile is in the catalogue; for
 * the whole product the parts that are not banded are left as they are. `parts` — the parts changed.
 */
export function setBand(overrides: EdgeOverrides | null | undefined, parts: EdgePartSummary[], partId: string | null, edge: string | null, choice: EdgeChoice, access: EdgeEditAccess): BandEditResult {
  const chosen = partId === null ? parts.filter((p) => p.editable) : parts.filter((p) => p.id === partId);
  if (partId !== null && !chosen.length) return { ok: false, problem: `В изделии нет детали ${partId}` };
  const all: EdgeOverrides = JSON.parse(JSON.stringify(overrides ?? {}));
  for (const p of chosen.length ? chosen : [null]) {
    // The rule checks the access, the board and the profile on a part of its own kind with the board of this one.
    const r = setEdgeOverride(null, { id: p?.id ?? '', kind: 'back', materialFamily: !p || p.editable ? 'LDSP' : 'HDF' }, 'left', choice, access);
    if (!r.ok) return { ok: false, problem: r.refusal === 'NOT_EDITABLE_PART' ? `Деталь ${p!.name} не из ЛДСП: фасады из МДФ, детали из ХДФ и с фигурным контуром не кромятся вручную.` : r.text };
    if (!p) continue;
    const keys = edge === null ? p.edges.map((e) => e.edge) : [edge];
    if (edge !== null && !p.edges.some((e) => e.edge === edge)) return { ok: false, problem: `У детали ${p.name} нет торца «${edge}».` };
    const own = { ...(all[p.id] ?? {}) };
    for (const k of keys) {
      if (choice === 'AUTO') delete own[k];
      else own[k] = choice;
    }
    if (Object.keys(own).length) all[p.id] = own;
    else delete all[p.id];
  }
  return { ok: true, edgeOverrides: all, parts: chosen.map((p) => p.id) };
}

/** Three of a list and how many more: the notice stays short on a whole product (all of it is in the bell). */
export const fewOf = (xs: readonly string[]): string => (xs.length > 3 ? `${xs.slice(0, 3).join('; ')} и ещё ${xs.length - 3}` : xs.join('; '));

/** The notice of an edit: the parts left as they are, the edges left without a band where the automatic one bands (325). */
export function bandNotice(parts: EdgePartSummary[], changed: readonly string[], skipped: boolean): string | undefined {
  const ids = new Set(changed),
    bare = parts.filter((p) => ids.has(p.id)).flatMap((p) => p.edges.filter((e) => e.override === 'NONE' && e.automatic !== 'NONE').map((e) => `${p.name} — ${e.label.toLowerCase()}`)),
    rest = skipped ? [...new Set(parts.filter((p) => !p.editable).map((p) => p.name))] : [],
    out = [
      rest.length ? `Не кромятся и остались как были: ${rest.join(', ')} (не ЛДСП или фигурный контур).` : null,
      bare.length ? `Без кромки на торце, где она ставится автоматически: ${fewOf(bare)}. Замечание — в колокольчике.` : null,
    ].filter(Boolean);
  return out.length ? out.join(' ') : undefined;
}

/**
 * The bell of manual banding (MOD-DEC-325, 743): an edge the automatic rule bands left without a band by hand, and a
 * manual band of a part the product has no more (it changed or went), which is not applied (Д).
 */
export function manualBandIssues(g: Pick<Graph, 'parts'>, overrides: EdgeOverrides | null | undefined): Unresolved[] {
  const issue = (code: string, text: string, partIds: string[]): Unresolved => ({ code, level: 'WARNING', partIds, jointIds: [], operationIds: [], mechanismIds: [], text, ruleId: 'MOD-DEC-325', blocksProductionReadiness: false }),
    ids = new Set(g.parts.map((p) => p.id));
  return [
    ...g.parts.flatMap((p) =>
      SLOTS.filter((s) => p.edges[s].override === 'NONE' && p.edges[s].automaticIntent !== 'NONE').map((s) =>
        issue('MANUAL_EDGE_WITHOUT_BAND', `${p.name}: торец «${physicalEdgeLabelRu(p.edges[s].physicalEdge.toLowerCase())}» оставлен без кромки вручную; автоматически здесь ставится кромка.`, [p.id]),
      ),
    ),
    ...Object.keys(overrides ?? {})
      .filter((id) => !ids.has(id))
      .map((id) => issue('MANUAL_EDGE_PART_GONE', `Ручная кромка детали ${id} не применена: такой детали в изделии больше нет. Задайте кромку заново.`, [])),
  ];
}
