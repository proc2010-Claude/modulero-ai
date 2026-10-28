// Facades of the swing wardrobe and the hinges of its doors (task W4, MIGRATION_PLAN step 3.5): the part of the
// prototype's model() that builds the doors (v16FacadeProfile r1.html:3818, facadeRegions 4488, the door branch of
// the section loop and makeDoor r1.html:12541–12643, f13FacadeGeometry 22201), the P2 front grid with its chain and
// mappings (p2FrontGridFromSections r1.html:15451 and the wrapper of model() 15651) and the facade overlays (84923).
//
// The sizes and places of the doors are the prototype's. The hinge is not: the prototype screws the BOYARD H301A02
// with the H0910 plate into every door and places the plate by a guess of its own (WR-01, WR-06). Here each door
// gets one mechanism chosen by the manufacturer's table for its real overlay (MOD-DEC-286, 329, 073): накладная at
// the carcass edge, полунакладная on a partition; the cup in the door and the plate on the panel come from the
// same pair and the same station, so they cannot drift apart (INV-M03). The holes are the kit's (.fr3d) or the
// catalogue's (MOD-DEC-277); the number of hinges follows the chart of the hinge with rule 190 (WR-03); the doors
// of rows are drilled too (WR-04). The stations are the prototype's: 96 mm from the ends, the rest even, moved by
// 32 mm off a busy plate line (MOD-DEC-159) — by the door's own height (the prototype took the height of the whole
// facade field for a row). Each departure has its FINDINGS item (260–269). The prototype had no inset doors (317):
// an inset door stands in the opening of its section with the gap of MOD-DEC-362 on all four sides, flush with the
// carcass front edge, on a вкладная петля of the same table (FINDINGS 400–404).
import { hingeChartFor, type HingeCatalog } from '../catalog/hardware/hinges.js';
import { catalogSource } from '../catalog/hardware/types.js';
import { minimalHingeCount } from '../engine/invariants/checks.js';
import { exactAdd, exactDivideInteger, exactSub, exactSum, exactToNumber, facadeRegions, normalizeExactMm, parseExactMm, exactCompare, type ExactMm } from '../engine/policy/front-grid.js';
import { ckBodyWidthExact } from '../engine/policy/carcass.js';
import { hingeDrillingScheme, hingeSelection, selectHinge, type HingeDemand, type HingeEdgePosition, type SchemeHole } from '../engine/policy/hinge-selection.js';
import { checkAgainstDrawing, frontGrid as frontGridPolicy } from '../engine/policy/index.js';
import { facadePurchased, facadeThickness } from '../engine/policy/facade-materials.js';
import { dpOwnOperations } from '../engine/policy/optional-parts.js';
import type { PolicyState, Rec } from '../engine/policy/project-state.js';
import { wardrobeFacades } from '../engine/policy/wardrobe-facades.js';
import { drawerCountOf, type DrawerSpacer, type DrawerUnit } from './drawer-boxes.js';
import { fe04, fe04Hit, type Fe04Box } from '../engine/policy/fe04.js';
import { wardrobeDrawers } from '../engine/policy/wardrobe-drawers.js';
import { carcassBoxes, type WorldBox } from './fasteners-r7.js';
import { addFaceHole, addPart, edges } from './primitives.js';
import { WardrobeStandardPreset } from './standard.js';
import { storagePullOutIn, type StorageUnit } from './storage.js';

const pad2 = (n: number) => String(n).padStart(2, '0');
const C = wardrobeFacades.constants;

/** Id of the standard facade gap profile of the prototype (V16_STANDARD_PROFILE r1.html:3809). */
export const STANDARD_FACADE_PROFILE_ID = 'MOD-FACADE-SEAM-3-V1';

/**
 * The facade gap profile (v16FacadeProfile r1.html:3818): the standard one — seam 3 (185), side offsets 1,5 (124), top
 * and bottom 2 mm (prototype, FINDINGS 55) — with the values the project saved, or the legacy one from the form gap.
 * With `settings` it adds the bottom of the facade field over the base of those settings: the door clearance over
 * a plinth, the leg height and the gap on legs, the gap without a base, plus the bottom offset.
 */
export function facadeGapProfile(d: Rec, gap: number, settings: Rec | null): Rec {
  const saved = d.facadeGapProfile,
    modern = saved?.profileId === STANDARD_FACADE_PROFILE_ID,
    g = frontGridPolicy.constants,
    standard = {
      profileId: STANDARD_FACADE_PROFILE_ID,
      seamX: g.seam.value,
      seamY: g.seam.value,
      insetLeft: g.outerOffsetHorizontal.value,
      insetRight: g.outerOffsetHorizontal.value,
      topInset: g.outerOffsetTop.value,
      bottomInset: g.bottomOffset.value,
    },
    baseBottom = settings ? (settings.baseSystem === 'plinth' ? settings.doorBottomClearance : settings.baseSystem === 'fixedLegs' || settings.baseSystem === 'legsPlinth' ? settings.fixedLegHeight + gap : gap) : null;
  return {
    ...(modern ? { ...standard, ...saved } : { profileId: 'LEGACY-FACADE-GAP-V1', seamX: gap, seamY: gap, insetLeft: gap / 2, insetRight: gap / 2 }),
    insetTop: saved?.insetTop ?? saved?.topInset ?? gap,
    insetBottom: settings ? (saved?.insetBottom ?? baseBottom + (saved?.bottomInset ?? 0)) : null,
    topBottomRule: 'RETAINED_BASE_SYSTEM_V1',
    hingeCompatibility: 'UNKNOWN',
    productionStatus: 'HOLD',
  };
}

/** Exact height of a row as the project saved it (f13ExactHeight r1.html:22198). */
export function rowExactHeight(row: Rec): ExactMm {
  return row.heightExactMm && exactToNumber(row.heightExactMm) === Number(row.height) ? normalizeExactMm(row.heightExactMm) : parseExactMm(String(row.height));
}

/**
 * Rows of facades of a section over the height `total` of its facade field from `bottom` (f13FacadeGeometry
 * r1.html:22201): equal exact shares, the last takes the rest, or the heights the user set (MANUAL); a seam `gap`
 * between the rows.
 */
export function facadeRows(cfg: Rec, total: number, gap: number, bottom: number): Rec[] {
  const rows: Rec[] = cfg.facadeRows || [],
    n = rows.length;
  if (!n) return [];
  if (n > C.maxFacadeRows.value) throw Error(`Секция: допустимы 1–${C.maxFacadeRows.value} ряда фасадов.`);
  const available = exactSub(parseExactMm(String(total)), parseExactMm(String(gap * (n - 1))));
  let remaining = available,
    y = bottom;
  const heights = rows.map((r, i) => (cfg.facadeHeightMode === 'MANUAL' ? rowExactHeight(r) : i === n - 1 ? remaining : exactDivideInteger(available, n)));
  if (cfg.facadeHeightMode !== 'MANUAL') for (let i = 0; i < n - 1; i++) remaining = exactSub(remaining, heights[i]);
  if (cfg.facadeHeightMode !== 'MANUAL') heights[n - 1] = remaining;
  if (exactCompare(exactSum(heights), available) !== 0) throw Error('Сумма высот рядов и зазоров не совпадает с высотой фасадного поля.');
  return rows.map((r, i) => {
    const height = exactToNumber(heights[i]);
    if (!Number.isFinite(height) || height <= 0 || !C.rowLeaves.value.includes(r.leaves)) throw Error(`Ряд ${i + 1}: недопустимые высота или число дверей.`);
    const item = { ...r, index: i, height, heightExactMm: heights[i], bottom: y };
    y += height + gap;
    return item;
  });
}

/** Where the hinges of a door are screwed: the panel, its face, the elevation of its local x = 0 and its length. */
export interface HingePanel {
  panel: string;
  face: string;
  bottomY: number;
  length: number;
  position: HingeEdgePosition;
}

/** One door before it is built: its section, place and size. */
export interface DoorPlan {
  index: number;
  id: string;
  name: string;
  left: number;
  width: number;
  height: number;
  bottom: number;
  hingeSide: 'left' | 'right';
  rowId: string | null;
  /** MOD-DEC-317, 362: the door stands in the opening (вкладная), not in front of the carcass. */
  inset: boolean;
}

export interface FacadeBuild {
  /** The gap profile of the product (the base of the product settings). */
  profile: Rec;
  /** Height of the facade field of the product (m.facadeH). */
  facadeH: number;
  /** The hinge of each door: the pair, the count, the stations, the drilling (the graph's HINGE mechanisms). */
  hingeMechanisms: Rec[];
  /** What the facades could not build: { code, text, sectionId } in plain Russian. */
  issues: Rec[];
  /** The facade field of each section: the elevations of its bottom and top (the doors fill it). */
  fields: { bottom: number; top: number }[];
}

export interface FacadeContext {
  d: Rec;
  policy: PolicyState;
  gap: number;
  t: number;
  installedHeight: number;
  grid: Rec;
  sectionMeta: Rec[];
  sectionsData: Rec[];
  parts: Rec[];
  holes: Rec[];
  connections: Rec[];
  /** The hinge catalogue of the release the wardrobe is built with (an argument of the generator, CAT-1). */
  catalog: HingeCatalog;
  /** Room walls at the outer sides of the product (MOD-DEC-331): a door hinged there cannot open fully. */
  walls: { left: boolean; right: boolean; width: number };
  /** The drawers built in the sections (W7): FE-04 keeps the hinges off them. */
  drawerUnits: DrawerUnit[];
  /** The baskets and trouser racks of the sections (MOD-DEC-484): FE-04 keeps the hinges off them as off a drawer. */
  storageUnits?: StorageUnit[];
}

/** The doors of the product before they are built: the gap profile, the regions, the plans, what could not be planned. */
export interface FacadePlan {
  profile: Rec;
  regions: Rec[];
  facadeH: number;
  plans: DoorPlan[];
  issues: Rec[];
  fields: FacadeBuild['fields'];
}

/** The section builds no door: external drawers or no facade. */
const doorless = (cfg: Rec) => !!((cfg.drawersEnabled ?? cfg.content === 'drawers') && (cfg.drawerMode ?? 'internal') === 'external');

/** The doors of the section are inset (MOD-DEC-317): they stand in its opening with the gap of MOD-DEC-362. */
export const insetRequested = (cfg: Rec) => cfg.facadeMounting === 'INSET';

/** An inner drawer stands in the section (MOD-DEC-288): a drawer of the section whose execution is internal. */
export const innerDrawerIn = (cfg: Rec): boolean => drawerExecutions(cfg).includes('internal');

/** The door of the section `i` opens in front of a pull-out: an inner drawer (288), a basket or a trouser rack (484). */
const pullOutBehind = (d: Rec, sectionsData: Rec[], i: number): boolean => innerDrawerIn(d.sections[i]) || storagePullOutIn(d.fittings, sectionsData[i]!.id);

/** Execution of each drawer of a section (r1.html:12118): its own in the filling, else that of the section. */
export function drawerExecutions(cfg: Rec): string[] {
  if (!(cfg.drawersEnabled ?? cfg.content === 'drawers')) return [];
  return Array.from({ length: drawerCountOf(cfg) }, (_, k) => cfg.filling?.drawer?.[k]?.execution ?? cfg.drawerMode ?? 'internal');
}

/** An external drawer stands in the section: its facade takes the place of a door (WR-30). */
export const externalDrawerIn = (cfg: Rec): boolean => drawerExecutions(cfg).includes('external');

/**
 * The opening an inset door fills (MOD-DEC-362): the clear opening of the section between its panels and between
 * the bottom and the top of its body, less the gap on all four sides. Its doors are laid out in it as the overlay
 * ones in their region: one door, two with the seam of the profile (185) or rows (TERM-016: «в пределах проёма
 * между ограничивающими панелями»).
 */
export function insetOpening(section: Rec, geometry: Rec): { left: number; width: number; bottom: number; height: number } {
  const r = C.insetRevealMm.value;
  return { left: section.clearStart + r, width: section.clearEnd - section.clearStart - 2 * r, bottom: geometry.interiorBottomY + r, height: geometry.interiorTopY - geometry.interiorBottomY - 2 * r };
}

/**
 * WR-30: a door would be built over an external drawer of the section — the drawer of the filling is external while
 * the section keeps its doors (doorless reads only the mode of the section). The facade of the drawer and the door
 * would take one volume; the input is refused with the reason (wardrobeInputProblems).
 */
export const doorOverExternalDrawer = (cfg: Rec): boolean => externalDrawerIn(cfg) && !doorless(cfg) && !!cfg.facade && cfg.facade !== 'none';

/**
 * Facade regions of the sections (facadeRegions), row by row: the sections of the bodies on the floor are one row, the
 * sections of each upper body (mezzanine, MOD-DEC-200) another over its own width. The prototype shared the whole list
 * as one row, so under EQUAL_ROW the doors of a mezzanine took a share of the product width (FINDINGS 534); without an
 * upper body the regions are the prototype's.
 */
function rowRegions(d: Rec, sections: readonly Rec[], insets: { insetLeft: number; insetRight: number }): Rec[] {
  const upper = new Map<string, string>((d.bodies as Rec[]).filter((b) => b.parent).map((b) => [b.id, b.id])),
    rows = new Map<string, number[]>();
  sections.forEach((s, i) => {
    const key = upper.get(s.bodyId) ?? '';
    rows.set(key, [...(rows.get(key) ?? []), i]);
  });
  const out: Rec[] = [];
  for (const [key, idx] of rows) {
    const x0 = key ? sections[idx[0]!]!.nominalStart : 0,
      shifted = idx.map((i) => ({ nominalStart: sections[i]!.nominalStart - x0, nominalEnd: sections[i]!.nominalEnd - x0 }));
    facadeRegions(shifted, insets, d.facadeWidthPolicy).forEach((r, k) => {
      const i = idx[k]!;
      out[i] = { ...r, id: `FG-F${pad2(i + 1)}`, index: i, left: r.left + x0, right: r.right + x0, nominalStart: r.nominalStart + x0, nominalEnd: r.nominalEnd + x0, spans: [i] };
    });
  }
  return out;
}

/** The doors of every section as planned (before the fill and the drawers): their place, size and hinge side. */
export function planFacades(ctx: Pick<FacadeContext, 'd' | 'gap' | 'grid' | 'sectionMeta' | 'installedHeight'>): FacadePlan {
  const { d, gap, grid, sectionMeta } = ctx,
    // WR-12: the facade field of the product over the base of its first body, as its elevations (FINDINGS 265);
    // the prototype read the form field. Each door stands over the base of its own body.
    profile = facadeGapProfile(d, gap, grid.modules[0].geometry.settings),
    regions = rowRegions(d, grid.sections, { insetLeft: profile.insetLeft, insetRight: profile.insetRight }),
    facadeH = ctx.installedHeight - profile.insetTop - profile.insetBottom,
    plans: DoorPlan[] = [],
    issues: Rec[] = [],
    fields: FacadeBuild['fields'] = [];
  d.sections.forEach((cfg: Rec, i: number) => {
    const bodyGeo = sectionMeta[i]!.module.geometry,
      inset = insetRequested(cfg),
      opening = inset ? insetOpening(grid.sections[i], bodyGeo) : null,
      floor = opening ? opening.bottom : bodyGeo.floorY + facadeGapProfile(d, gap, bodyGeo.settings).insetBottom,
      height = opening ? opening.height : bodyGeo.sideTopY - floor - profile.insetTop,
      sid = sectionMeta[i]!.sectionId,
      region = opening ?? regions[i]!,
      seamX = profile.seamX;
    fields[i] = { bottom: floor, top: floor + height };
    if (doorless(cfg) || cfg.facade === 'none' || !cfg.facade) return;
    const door = (id: string, name: string, left: number, width: number, hingeSide: 'left' | 'right', h = height, bottom = floor, rowId: string | null = null) =>
      plans.push({ index: i, id, name, left, width, height: h, bottom, hingeSide, rowId, inset });
    if (cfg.facadeRows?.length)
      for (const row of facadeRows(cfg, height, profile.seamY, floor)) {
        // MOD-DEC-561: a row without a door is an open opening of the section.
        if (!row.leaves) continue;
        const fw = (region.width - (row.leaves - 1) * seamX) / row.leaves;
        for (let leaf = 0; leaf < row.leaves; leaf++)
          door(`${sid}-${row.id}-${leaf ? 'B' : 'A'}`, `${sid} — ряд ${row.index + 1}, дверь ${leaf + 1}`, region.left + leaf * (fw + seamX), fw, row.leaves === 2 ? (leaf ? 'right' : 'left') : row.hingeSide, row.height, row.bottom, row.id);
      }
    else if (cfg.facade === 'one') door(`${sid}-DOOR-A`, `${sid} — фасад`, region.left, region.width, cfg.hingeSide || 'left');
    else if (cfg.facade === 'two') {
      const fw = (region.width - seamX) / 2;
      door(`${sid}-DOOR-A`, `${sid} — фасад 1`, region.left, fw, 'left');
      door(`${sid}-DOOR-B`, `${sid} — фасад 2`, region.left + fw + seamX, fw, 'right');
    }
  });
  return { profile, regions, facadeH, plans, issues, fields };
}

/**
 * The doors of every section with their hinges, appended to the parts, holes and connections of the context; the
 * facade records of the sections (data.facades, interiorElements) are filled as the prototype fills them.
 */
export function buildFacades(ctx: FacadeContext, plan: FacadePlan = planFacades(ctx)): FacadeBuild {
  const hingeMechanisms = plan.plans.map((p) => makeDoor(ctx, p, plan.plans));
  return { profile: plan.profile, facadeH: plan.facadeH, hingeMechanisms, issues: plan.issues, fields: plan.fields };
}

/** The panel at a side of section `i` (panelByBoundary r1.html:11931–11969): the outer side or the partition. */
export function hingePanel(ctx: Pick<FacadeContext, 'd' | 'sectionMeta' | 'parts'>, i: number, side: 'left' | 'right'): HingePanel {
  const meta = ctx.sectionMeta[i]!,
    mod = meta.module,
    g = mod.geometry,
    last = meta.localIndex === mod.sectionIndexes.length - 1,
    divider = (sectionId: string) => ctx.parts.find((p) => p.id === `${sectionId}-DIVIDER01`),
    partitionHeight = (k: number) => ctx.d.sections[k]?.partitionHeight ?? g.innerH;
  if (side === 'left' && meta.localIndex > 0) return { panel: divider(meta.sectionId)!.id, face: 'right', bottomY: g.interiorBottomY, length: partitionHeight(i), position: 'PARTITION' };
  if (side === 'right' && !last) return { panel: divider(ctx.sectionMeta[i + 1]!.sectionId)!.id, face: 'left', bottomY: g.interiorBottomY, length: partitionHeight(i + 1), position: 'PARTITION' };
  return { panel: side === 'left' ? mod.panelIds.left : mod.panelIds.right, face: 'inside', bottomY: g.sideBottomY, length: g.sideTopY - g.sideBottomY, position: 'CARCASS_EDGE' };
}

/**
 * Gap from the hinge edge of a door to the nearest other door beside it at the same height; null — none. An inset
 * door passes the panel of its hinges, not a door: its gap is the gap to the opening (362, FINDINGS 402); an overlay
 * door does not meet an inset one, that stands behind the front edge.
 */
function neighbourGap(p: DoorPlan, plans: DoorPlan[]): number | null {
  if (p.inset) return C.insetRevealMm.value;
  const edge = p.hingeSide === 'left' ? p.left : p.left + p.width,
    gaps = plans
      .filter((o) => o !== p && !o.inset && o.bottom < p.bottom + p.height && p.bottom < o.bottom + o.height)
      .map((o) => (p.hingeSide === 'left' ? edge - (o.left + o.width) : o.left - edge))
      .filter((x) => x >= 0);
  return gaps.length ? Math.min(...gaps) : null;
}

/**
 * Stations of the hinges along a door of height `h` (makeDoor r1.html:12570): the first and last 96 mm from the
 * ends, the rest even between them; a station whose plate would come closer than 22 mm to a hole already on the
 * plate line of the panel moves by ±32, ±64, ±96 mm (MOD-DEC-159), staying 80 mm from the ends. `plateAt` gives the
 * local x of the plate on the panel for a station; `occupied` — the x of the holes already on the plate line.
 * FE-04 (MOD-DEC-050, task W7): `blocked` says a station whose closed hinge meets an inner drawer, its runner or its
 * spacer; such a station moves on the same ladder to the nearest free one, the count and the end distance kept. When
 * no station of the ladder is free the prototype's choice stays and the conflict is the caller's to declare.
 */
export function hingeStations(h: number, count: number, plateAlong: readonly number[], plateAt: (station: number) => number, occupied: number[], blocked: (station: number) => boolean = () => false): number[] {
  const end = C.hingeEndStation.value,
    margin = C.hingeStationMargin.value,
    clearance = C.plateHoleClearance.value,
    out: number[] = [];
  for (let k = 0; k < count; k++) {
    const pref = Math.round(end + k * ((h - 2 * end) / (count - 1 || 1))),
      candidates = C.hingeStationShifts.value.map((s) => pref + s).filter((c) => c >= margin && c <= h - margin),
      clear = (c: number) => plateAlong.every((a) => occupied.every((o) => Math.abs(plateAt(c) + a - o) >= clearance)),
      chosen = candidates.find((c) => clear(c) && !blocked(c)) ?? candidates.find(clear) ?? pref;
    out.push(chosen);
    for (const a of plateAlong) occupied.push(plateAt(chosen) + a);
  }
  return out;
}

/**
 * MOD-DEC-275, 327: the holes of the kit against the drawing of the catalogue — the cup by place, diameter and
 * depth; the cup fixing (48 / 6 mm, 329) and the plate by place only: the catalogue prints no diameter of the fixing
 * holes, and it draws the plate for a euro screw ø5 while the kit drills the ø2,5 pilot of a wood screw (FINDINGS 260).
 * A role the catalogue does not draw is UNKNOWN: there is nothing to compare, the kit stays the source (277).
 */
function kitAgainstDrawing(kit: readonly SchemeHole[], printed: readonly SchemeHole[]): 'PASS' | 'FAIL' | 'UNKNOWN' {
  const statuses: string[] = [];
  for (const role of ['CUP', 'CUP_FIXING', 'PLATE'] as const) {
    const a = kit.filter((h) => h.machiningRole === role),
      b = printed.filter((h) => h.machiningRole === role);
    if (!a.length) continue;
    if (a.length !== b.length) statuses.push('UNKNOWN');
    else
      a.forEach((h, i) => {
        const c = checkAgainstDrawing(h, b[i]!);
        statuses.push(role === 'CUP' ? c.status : c.failed.includes('POSITION') ? 'FAIL' : 'PASS');
      });
  }
  return statuses.includes('FAIL') ? 'FAIL' : statuses.includes('UNKNOWN') || !statuses.length ? 'UNKNOWN' : 'PASS';
}

const refText = (r: { doc: string; sha256: string; page: string }) => (catalogSource(r) as { ref: string }).ref;
/** A number in Russian text: up to three decimals, a comma. */
export const fmt = (x: number) => String(Math.round(x * 1000) / 1000).replace('.', ',');

/** A door of the plan: its part, its hinge mechanism, the cups in the door and the plates on the panel. */
function makeDoor(ctx: FacadeContext, p: DoorPlan, plans: DoorPlan[]): Rec {
  const { d, policy, t, holes, connections, sectionMeta, sectionsData } = ctx,
    catalog = ctx.catalog,
    meta = sectionMeta[p.index]!,
    data = sectionsData[p.index]!,
    cfg: Rec = d.sections[p.index],
    geometry = meta.module.geometry,
    frontGap: number = geometry.settings.dimensions?.Gfront ?? frontGridPolicy.constants.depthGap.value,
    dpStart = holes.length,
    // MOD-DEC-317 aside, a door is made from the corpus board unless a ready-made facade is chosen (MOD-DEC-347, FINDINGS 266).
    purchased = facadePurchased(policy),
    // MOD-DEC-573: the thickness of the door is of the execution of its material, otherwise of the corpus board.
    ft = facadeThickness(policy, t),
    V2 = WardrobeStandardPreset.visibleEdgeBand;
  const part = addPart(
    ctx.parts,
    {
      id: p.id,
      name: p.name,
      L: p.height,
      W: p.width,
      T: ft,
      q: 1,
      kind: 'facade',
      handedness: p.hingeSide,
      role: 'door',
      moduleId: meta.moduleId,
      sectionId: meta.sectionId,
      doorBottomClearance: p.bottom,
      facadeRowId: p.rowId,
      edges: edges(V2, V2, V2, V2),
    },
    policy,
  );
  if (!purchased) part.supplyMode = 'MANUFACTURE';
  if (p.inset) part.facadeMounting = 'INSET';
  // The door in front of the carcass, behind it the depth gap (162), or an inset one in the opening, set back from the
  // front edge by its setback (362, FINDINGS 401): its place, kept apart from worldBox so that the r7 fasteners see
  // the carcass the prototype saw.
  const setback = C.insetSetbackMm.value,
    z0 = p.inset ? setback : -(frontGap + ft),
    doorBack = z0 + ft;
  part.facadeBox = { x0: p.left, x1: p.left + p.width, y0: p.bottom, y1: p.bottom + p.height, z0, z1: doorBack };

  const panel = hingePanel(ctx, p.index, p.hingeSide),
    opening = [data.clearStart, data.clearEnd],
    overlayMm = p.hingeSide === 'left' ? opening[0]! - p.left : p.left + p.width - opening[1]!,
    route = hingeRoute(ctx, p, plans, pullOutBehind(ctx.d, ctx.sectionsData, p.index)),
    { demand, selection } = route,
    chosen = selection.chosen,
    hinge = catalog.hinges.find((h) => h.id === (chosen?.hingeId ?? hingeSelection.constants.preferredHinges.value[0]))!,
    chart = hingeChartFor(hinge),
    // MOD-DEC-329: the chart holds under the conditions of its source — the facade width printed with it (377: in the catalogue).
    chartMaxWidth = chart?.maxWidthMm ?? null,
    massInput = Number(cfg.doorMassKg),
    massKg = massInput > 0 ? massInput : (p.height * p.width * ft * C.boardDensity.value) / 1e9, // mm³ → m³
    byRule = chart ? minimalHingeCount(p.height, massKg, chart.rows) : null,
    count = byRule ?? Math.max(...(chart?.rows ?? [{ n: 2 }]).map((r) => r.n)),
    scheme = chosen ? hingeDrillingScheme(chosen, catalog, demand) : null,
    facadeHoles = scheme?.holes.filter((h) => h.part === 'FACADE') ?? [],
    plateHoles = scheme?.holes.filter((h) => h.part === 'PANEL') ?? [],
    plateAcross = plateHoles[0]?.acrossMm ?? null,
    plateAlong = plateHoles.length ? [...new Set(plateHoles.map((h) => h.alongMm))] : [0],
    plateAt = (s: number) => p.bottom + s - panel.bottomY,
    occupied =
      plateAcross === null ? [] : holes.filter((h) => h.mode === 'face' && h.panel === panel.panel && h.face === panel.face && Math.abs(h.y - plateAcross) < 1).map((h) => h.x as number),
    envelopeAt = (st: number) => (plateAcross === null || !chosen ? null : hingeEnvelope(p, chosen.cupCentreFromEdgeMm, overlayMm, facadeHoles, plateHoles, [st], doorBack, opening)[0]!),
    // FE-04 (050): what the closed hinge at a station meets — an inner drawer of the section, its runner, its spacer.
    obstacles = fe04Obstacles(ctx, meta.sectionId),
    hits = (st: number) => {
      const e = envelopeAt(st);
      return e ? obstacles.filter((o) => fe04Hit(e as Fe04Box, o.box)) : [];
    },
    preferred = hingeStations(p.height, count, plateAlong, plateAt, [...occupied]),
    stations = hingeStations(p.height, count, plateAlong, plateAt, occupied, (st) => hits(st).length > 0),
    // R2-032 (FINDINGS 1767, Д): on a door too short for the stations of 378 the holes of its hinges leave the door or its
    // cups meet; such a door gets no hinge holes, its drilling is incomplete and says why. The lowest door on two hinges
    // is 2 × 96 + the cup diameter of the catalogue (227 mm for a cup ø35), said in the remark.
    cupD = Math.max(0, ...facadeHoles.filter((h) => h.machiningRole === 'CUP').map((h) => h.diameterMm ?? 0)),
    tooShort = stations.some(
      (s, k) => facadeHoles.some((h) => s + h.alongMm - (h.diameterMm ?? 0) / 2 < 0 || s + h.alongMm + (h.diameterMm ?? 0) / 2 > p.height) || stations.some((o, j) => j < k && Math.abs(s - o) < cupD),
    ),
    id = `${p.id}-C-HINGE`,
    source = (h: SchemeHole) => (h.origin === 'KIT' ? 'KIT_FR3D' : 'MANUFACTURER_CATALOG'),
    missing = [...(scheme?.missing ?? [])],
    drawingCheck = scheme?.source === 'KIT' ? kitAgainstDrawing(scheme.holes, hingeDrillingScheme(chosen!, { ...catalog, kits: [] }, demand).holes) : null,
    hingeName = chosen ? `${hinge.brand} ${hinge.article} + ${catalog.plates.find((x) => x.id === chosen.plateId)!.article}` : `${hinge.brand} ${hinge.article} — пара не подобрана`;
  for (const s of tooShort ? [] : stations) {
    if (!purchased)
      for (const h of facadeHoles)
        addFaceHole(holes, p.id, 'inside', s + h.alongMm, p.hingeSide === 'left' ? h.acrossMm : p.width - h.acrossMm, h.diameterMm, h.depthMm, `${h.machiningRole === 'CUP' ? 'Чашка петли' : 'Крепление чашки петли'} ${hinge.brand} ${hinge.article}`, `D${h.diameterMm}/L${h.depthMm}`, {
          machiningRole: h.machiningRole,
          hingeStation: s,
          mechanismId: id,
          holeSource: source(h),
          holeSourceRef: refText(h.ref),
          completeness: scheme!.completeness,
        });
    for (const h of plateHoles)
      addFaceHole(holes, panel.panel, panel.face, plateAt(s) + h.alongMm, h.acrossMm, h.diameterMm, h.depthMm, `Монтажная планка ${catalog.plates.find((x) => x.id === chosen!.plateId)!.article} петли ${hinge.article}`, `D${h.diameterMm}/L${h.depthMm}`, {
        machiningRole: h.machiningRole,
        hingeStation: s,
        mechanismId: id,
        holeSource: source(h),
        holeSourceRef: refText(h.ref),
        completeness: scheme!.completeness,
      });
  }
  const offPanel = !tooShort && plateHoles.length && stations.some((s) => plateAt(s) < 0 || plateAt(s) > panel.length);
  connections.push({
    id,
    type: 'hinge',
    a: p.id,
    b: panel.panel,
    fastener: hingeName,
    qty: count,
    moduleId: meta.moduleId,
    sectionId: meta.sectionId,
    requiresHardwareConfirmation: true,
  });
  dpOwnOperations(holes, dpStart, [p.id, panel.panel], id);
  data.facades.push({
    id: p.id,
    rowId: p.rowId,
    left: p.left,
    width: p.width,
    height: p.height,
    hinges: count,
    hingeSide: p.hingeSide,
    hingeCenters: stations,
    productionProfile: p.rowId ? 'VERTICAL_ROWS_PROFILE_REQUIRED' : null,
    doorBottomClearance: p.bottom,
    hingeModel: chosen?.hingeId ?? null,
    requiresHardwareConfirmation: true,
  });
  data.interiorElements.push({ id: p.id, type: 'door', moduleId: meta.moduleId, sectionId: meta.sectionId, hingeModel: chosen?.hingeId ?? null, requiresHardwareConfirmation: true });
  if (offPanel) missing.push(`${panel.panel}: планка выходит за деталь (перегородка короче двери)`);
  if (tooShort)
    missing.push(`${p.id}: дверь высотой ${fmt(p.height)} мм ниже, чем нужно ${count} петлям: крайние петли стоят в ${C.hingeEndStation.value} мм от торцов (MOD-DEC-378), их отверстия вышли бы за дверь или чашки сошлись бы; дверь на двух петлях этой серии — не ниже ${fmt(2 * C.hingeEndStation.value + cupD)} мм; присадка петель этой двери не выдана — увеличьте высоту ряда`);
  return {
    id,
    doorId: p.id,
    doorWidthMm: p.width,
    panelId: panel.panel,
    panelFace: panel.face,
    moduleId: meta.moduleId,
    sectionId: meta.sectionId,
    hingeSide: p.hingeSide,
    position: demand.position,
    demand,
    hingeId: chosen?.hingeId ?? null,
    plateId: chosen?.plateId ?? null,
    mounting: chosen?.mounting ?? null,
    status: chosen?.status ?? 'NOT_SELECTED',
    cupEdgeDistanceMm: chosen?.cupEdgeDistanceMm ?? null,
    cupCentreFromEdgeMm: chosen?.cupCentreFromEdgeMm ?? null,
    basis: chosen?.basis ?? null,
    checks: chosen?.checks ?? [],
    notCovered: selection.notCovered,
    chart: chart ? { hingeId: hinge.id, basis: chart.basis, mark: chart.mark, ref: refText(chart.ref), rows: chart.rows, maxWidthMm: chartMaxWidth } : null,
    chartWidthCovered: chartMaxWidth === null || p.width <= chartMaxWidth,
    massKg,
    massSource: massInput > 0 ? 'INPUT' : 'BOARD_DENSITY',
    count,
    countBasis: byRule === null ? 'CHART_EXCEEDED' : 'MOD-DEC-190',
    stationsMm: stations,
    drilling: scheme ? { source: scheme.source, completeness: offPanel || tooShort ? 'INCOMPLETE' : scheme.completeness, missing } : { source: null, completeness: 'INCOMPLETE', missing: ['пара петля + планка не подобрана'] },
    drawingCheck,
    purchasedFacade: purchased,
    envelope: plateAcross === null || !chosen || tooShort ? null : hingeEnvelope(p, chosen.cupCentreFromEdgeMm, overlayMm, facadeHoles, plateHoles, stations, doorBack, opening),
    // MOD-DEC-288, 311, 360: Zero protrusion behind an inner drawer; the ordinary hinge of its kind with a spacer
    // where no Zero protrusion hinge of that kind exists; ORDINARY without an inner drawer.
    zeroProtrusionRoute: route.kind,
    openAngleDeg: wardrobeDrawers.constants.doorOpenAngleDeg.value,
    fe04: fe04Record(ctx, p, preferred, stations, hits),
    text:
      chosen === null
        ? `${p.id}: петля не подобрана — ${selection.notCovered.map((x) => `${x.hingeId} + ${x.plateId}: ${x.reason}`).join('; ') || 'нет кандидатов'}`
        : `${p.id}: ${hingeName}, наложение ${fmt(overlayMm)} мм, K ${fmt(chosen.cupEdgeDistanceMm)} мм`,
  };
}

/**
 * FE-04 of a door (MOD-DEC-050, 053): the stations without it, whether the hinge moved, what its closed hinges still
 * meet. A conflict left is the CRITICAL WARNING of 053; its text names the branch — the user's stored place of the
 * drawers (the manual branch, IR6-06 #3) or no safe place found for the hinge and the drawer.
 */
function fe04Record(ctx: FacadeContext, p: DoorPlan, preferred: number[], stations: number[], hits: (station: number) => { drawerIds: string[]; partIds: string[] }[]): Rec {
  const conflicts = stations
      .map((st) => ({ stationMm: st, with: hits(st) }))
      .filter((c) => c.with.length)
      .map((c) => ({ stationMm: c.stationMm, drawerIds: [...new Set(c.with.flatMap((o) => o.drawerIds))], partIds: [...new Set(c.with.flatMap((o) => o.partIds))] })),
    drawerIds = [...new Set(conflicts.flatMap((c) => c.drawerIds))],
    stored = ctx.drawerUnits.filter((u) => drawerIds.includes(u.id)).every((u) => u.placement === 'STORED'),
    moved = stations.some((x, k) => x !== preferred[k]);
  return {
    policy: `${fe04.id}@${fe04.version}`,
    preferredStationsMm: preferred,
    moved,
    conflicts,
    branch: !conflicts.length ? null : stored ? 'MANUAL_POSITION_RETAINED' : 'NO_SAFE_POSITION',
    text: !conflicts.length
      ? moved
        ? `${p.id}: петли перенесены с ${preferred.map(fmt).join(', ')} на ${stations.map(fmt).join(', ')} мм по лестнице станций (MOD-DEC-159), чтобы закрытая петля не задевала внутренний ящик (FE-04, MOD-DEC-050)`
        : null
      : `CRITICAL WARNING — INNER DRAWER / HINGE CONFLICT: ${p.id} — закрытая петля на ${conflicts.map((c) => fmt(c.stationMm)).join(', ')} мм задевает ${drawerIds.join(', ')} (${[...new Set(conflicts.flatMap((c) => c.partIds))].join(', ')}). ${
          stored
            ? 'Положение ящиков задано пользователем и сохранено (ручная ветвь FE-04): безопасной высоты петли на её лестнице (±32, ±64, ±96 мм, MOD-DEC-159) нет'
            : 'Ни петля по лестнице станций (MOD-DEC-159), ни ящик по шагу сетки безопасного положения не дали'
        }. Автоматическая совместимость петли и ящика не подтверждена — нужна проверка мебельщиком; правка, расчёт и сохранение доступны (MOD-DEC-050, 053)`,
  };
}

/** Which hinge a door takes (MOD-DEC-286, 288, 311, 360): its demand, the selection and the route. */
export interface HingeRoute {
  demand: HingeDemand;
  selection: ReturnType<typeof selectHinge>;
  /** ORDINARY — no inner drawer behind (311); ZERO_PROTRUSION — 288; ORDINARY_WITH_SPACER — none of that kind (360). */
  kind: 'ORDINARY' | 'ZERO_PROTRUSION' | 'ORDINARY_WITH_SPACER';
}

/**
 * The hinge of a door: by its overlay (286); behind an inner drawer only a documented Zero protrusion hinge (288);
 * when the place needs a half-overlay or inset hinge and no Zero protrusion one of that kind is in the catalogue, the
 * ordinary hinge of its kind stays and a spacer goes on the panel of the hinges (360, FINDINGS 253, 393).
 */
export function hingeRoute(ctx: Pick<FacadeContext, 'd' | 'sectionMeta' | 'sectionsData' | 'parts' | 't' | 'catalog'>, p: DoorPlan, plans: DoorPlan[], innerDrawer: boolean): HingeRoute {
  const data = ctx.sectionsData[p.index]!,
    geometry = ctx.sectionMeta[p.index]!.module.geometry,
    panel = hingePanel(ctx, p.index, p.hingeSide),
    overlayMm = p.hingeSide === 'left' ? data.clearStart - p.left : p.left + p.width - data.clearEnd,
    // MOD-DEC-286: вкладная петля for an inset door, on a side panel or a partition alike; 162 is not its gap.
    demand: HingeDemand = {
      position: p.inset ? 'INSET' : panel.position,
      overlayMm,
      facadeThicknessMm: facadeThickness(ctx.d, ctx.t),
      panelThicknessMm: ctx.t,
      neighbourGapMm: neighbourGap(p, plans),
      depthGapMm: p.inset ? null : (geometry.settings.dimensions?.Gfront ?? frontGridPolicy.constants.depthGap.value),
      innerDrawerBehind: innerDrawer,
      // MOD-DEC-331: at a room wall the angle the door reaches is not known — the spacer is given by the plan of the
      // drawers, the selection keeps Zero protrusion.
      openingLimitDeg: null,
      ...(p.inset ? { insetDepthMm: C.insetSetbackMm.value } : {}),
      // MOD-DEC-483: opening by pressing — the hinges without a spring only.
      ...(ctx.d.fittings?.pushToOpen ? { pushToOpen: true } : {}),
    },
    selection = selectHinge(demand, ctx.catalog);
  if (!innerDrawer) return { demand, selection, kind: 'ORDINARY' };
  // No hinge without a spring has a documented Zero protrusion: a door opened by pressing behind an inner drawer is
  // the case of 360 at the carcass edge too — its own hinge and a spacer (FINDINGS 1065).
  if (selection.chosen || (demand.position === 'CARCASS_EDGE' && !demand.pushToOpen)) return { demand, selection, kind: 'ZERO_PROTRUSION' };
  const ordinary = { ...demand, innerDrawerBehind: false };
  return { demand: ordinary, selection: selectHinge(ordinary, ctx.catalog), kind: 'ORDINARY_WITH_SPACER' };
}

/** The panel a door at side `side` of section `i` is hinged on stands at a room wall (MOD-DEC-331). */
function atRoomWall(ctx: Pick<FacadeContext, 'sectionMeta' | 'walls'>, i: number, side: 'left' | 'right', panel: HingePanel): boolean {
  if (panel.position !== 'CARCASS_EDGE') return false;
  const mod = ctx.sectionMeta[i]!.module;
  return side === 'left' ? ctx.walls.left && mod.start === 0 : ctx.walls.right && mod.end === ctx.walls.width;
}

/**
 * The spacers of the sections (MOD-DEC-331, 360), decided from the planned doors before the drawers are built: on
 * the panel of the hinges of a door behind which an inner drawer stands, when the door is hinged at a room wall
 * (Zero protrusion stays, the door cannot open fully — 331) or no Zero protrusion hinge of its kind exists (360).
 * The thickness is the door's protrusion into the opening at the real angle; the catalogue does not give it for these
 * hinges at an unknown angle, so it is the 16 mm of 331 and UNKNOWN (FINDINGS 393).
 */
export function drawerSpacerPlan(ctx: Pick<FacadeContext, 'd' | 'sectionMeta' | 'sectionsData' | 'parts' | 't' | 'catalog' | 'walls'>, plan: FacadePlan): DrawerSpacer[][] {
  const out: DrawerSpacer[][] = ctx.d.sections.map(() => []),
    thickness = hingeSelection.constants.spacerOptions.value[0]!.thicknessMm;
  for (const p of plan.plans) {
    if (!pullOutBehind(ctx.d, ctx.sectionsData, p.index) || out[p.index]!.some((s) => s.side === p.hingeSide)) continue;
    const panel = hingePanel(ctx, p.index, p.hingeSide),
      route = hingeRoute(ctx, p, plan.plans, true),
      wall = route.kind === 'ZERO_PROTRUSION' && !!route.selection.chosen && atRoomWall(ctx, p.index, p.hingeSide, panel);
    if (route.kind !== 'ORDINARY_WITH_SPACER' && !wall) continue;
    const known = route.selection.chosen?.spacer?.protrusionMm !== null && route.selection.chosen?.spacer !== null && route.selection.chosen?.spacer !== undefined;
    out[p.index]!.push({
      side: p.hingeSide,
      panel: panel.panel,
      thicknessMm: known ? route.selection.chosen!.spacer!.thicknessMm : thickness,
      status: known ? 'KNOWN' : 'UNKNOWN',
      decision: wall ? 'MOD-DEC-331' : 'MOD-DEC-360',
      reason: wall
        ? `${p.id}: петля у стены — дверь не открывается полностью, Zero protrusion не действует; проставка ${fmt(thickness)} мм по умолчанию, точная толщина — по вылету двери при реальном угле у стены, данных нет (MOD-DEC-331)`
        : route.demand.pushToOpen
          ? `${p.id}: у петель без пружины для открывания нажатием нет Zero protrusion — петля ЭVO H901 и проставка ${fmt(thickness)} мм на ${panel.panel}, вылет двери в проём по каталогу не известен (MOD-DEC-483, 485, 360, 331)`
          : `${p.id}: петли Zero protrusion вида «${route.demand.position === 'PARTITION' ? 'полунакладная' : 'вкладная'}» в каталоге нет — обычная петля и проставка ${fmt(thickness)} мм на ${panel.panel}, вылет двери в проём по каталогу не известен (MOD-DEC-360, 331)`,
    });
  }
  return out;
}

/** What a closed hinge of a section must not meet (FE-04): each drawer with its runners, each spacer of the section. */
export function fe04Obstacles(ctx: Pick<FacadeContext, 'drawerUnits' | 'parts' | 'storageUnits'>, sectionId: string): { box: Fe04Box; drawerIds: string[]; partIds: string[] }[] {
  const units = ctx.drawerUnits.filter((u) => u.sectionId === sectionId && u.mode === 'internal');
  return [
    ...units.map((u) => ({ box: u.box, drawerIds: [u.id], partIds: [...u.partIds] })),
    // MOD-DEC-484: a basket or a trouser rack is met as an inner drawer; it stays where the user put it (053).
    ...(ctx.storageUnits ?? []).filter((u) => u.sectionId === sectionId && u.runnerZone && u.itemId).map((u) => ({ box: { ...u.box, ...u.runnerZone! }, drawerIds: [u.id], partIds: [] })),
    ...ctx.parts.filter((x) => x.kind === 'drawerSpacer' && x.sectionId === sectionId).map((x) => ({ box: x.worldBox as Fe04Box, drawerIds: units.map((u) => u.id), partIds: [x.id as string] })),
  ];
}

/**
 * Occupied volume of the closed hinges of a door in the prototype's axes (x across, y up, z from the front): from the
 * back face of the door `doorBack` (−162 in front of the carcass, the thickness of an inset door behind its front
 * edge) to the plate line, across the opening as far as the cup reaches past the panel face, along the door around
 * each station by the farthest hole. The catalogue gives no body of the hinge; this is the box of its drilling
 * (FINDINGS 263).
 */
function hingeEnvelope(p: DoorPlan, cupCentre: number, overlay: number, facadeHoles: Rec[], plateHoles: Rec[], stations: number[], doorBack: number, opening: number[]): Rec[] {
  const reachInto = Math.max(...facadeHoles.map((h) => h.acrossMm - cupCentre + h.diameterMm / 2)) + cupCentre - overlay,
    depth = Math.max(...plateHoles.map((h) => h.acrossMm + h.diameterMm / 2)),
    along = Math.max(...[...facadeHoles, ...plateHoles].map((h) => Math.abs(h.alongMm) + h.diameterMm / 2)),
    x0 = p.hingeSide === 'left' ? opening[0]! : opening[1]! - reachInto,
    x1 = p.hingeSide === 'left' ? opening[0]! + reachInto : opening[1]!;
  return stations.map((s) => ({ x0, x1, y0: p.bottom + s - along, y1: p.bottom + s + along, z0: doorBack, z1: depth }));
}

/** The P2 gap profile (p2GapProfile r1.html:15403): the seam and the outer offset of the chain. */
function p2GapProfile(d: Rec, profile: Rec, gapSource: string): Rec {
  if (d.facadeGapProfile?.profileId === STANDARD_FACADE_PROFILE_ID) {
    // FINDINGS 264: the chain takes the seam and the outer offset of the profile the doors are built by; the
    // prototype fixed them at 3 and 1,5 while a saved profile moved the doors.
    const joint = parseExactMm(String(profile.seamX)),
      outer = parseExactMm(String(profile.insetLeft));
    return {
      id: STANDARD_FACADE_PROFILE_ID,
      jointGapExactMm: joint,
      outerGapExactMm: outer,
      jointGapMm: exactToNumber(joint),
      outerGapMm: exactToNumber(outer),
      status: 'SUPPORTED',
      blocking: false,
      fallbackApplied: false,
      standardJointGapExactMm: parseExactMm(String(frontGridPolicy.constants.seam.value)),
      standardOuterGapExactMm: parseExactMm(String(frontGridPolicy.constants.outerOffsetHorizontal.value)),
      hingeCompatibility: 'UNKNOWN',
    };
  }
  const jointGapExactMm = parseExactMm(gapSource),
    standardJoint = parseExactMm(String(C.legacyStandardGap.value)),
    supported = exactCompare(jointGapExactMm, standardJoint) === 0;
  return {
    id: 'P2_GAP_PROFILE_1_2_REPEAT_2_1',
    jointGapExactMm,
    outerGapExactMm: exactDivideInteger(jointGapExactMm, 2),
    jointGapMm: exactToNumber(jointGapExactMm),
    outerGapMm: exactToNumber(exactDivideInteger(jointGapExactMm, 2)),
    status: supported ? 'SUPPORTED' : 'UNSUPPORTED_PROFILE_REQUIRED',
    blocking: !supported,
    fallbackApplied: false,
    standardJointGapExactMm: standardJoint,
    standardOuterGapExactMm: exactDivideInteger(standardJoint, 2),
  };
}

/** Start of a section in the front grid (ckNominalStart r1.html:11353): preceding root bodies and sections of its body. */
function nominalStart(d: Rec, index: number): ExactMm {
  const cfg = d.sections[index],
    body = d.bodies.find((b: Rec) => b.id === cfg.bodyId),
    roots = d.bodies.filter((b: Rec) => !b.parent),
    root = body.parent ? d.bodies.find((b: Rec) => b.id === body.parent) : body;
  return exactAdd(exactSum(roots.slice(0, roots.indexOf(root)).map(ckBodyWidthExact)), exactSum(d.sections.slice(0, index).filter((s: Rec) => s.bodyId === body.id).map((s: Rec) => s.nominalMm)));
}

/**
 * The P2 front grid of the model (p2FrontGridFromSections r1.html:15451 and the wrapper of model() 15651): a column
 * per section, a chain item per column, the mapping to the physical door; a column is supported when its section has
 * exactly one door and no drawer facade. The chain metadata goes into the door parts and facade records; the
 * overlays of every door over its opening (r1.html:84923).
 */
export function attachFrontGrid(m: Rec, d: Rec, gapInput: string, widthInput: string): void {
  const gapProfile = p2GapProfile(d, m.facadeGapProfile, gapInput),
    columns: Rec[] = [],
    facades: Rec[] = [],
    mappings: Rec[] = [];
  m.sectionsData.forEach((section: Rec, index: number) => {
    const cfg = d.sections[index] || {},
      exactNominalWidth = normalizeExactMm(cfg.nominalMm),
      exactNominalStart = nominalStart(d, index),
      exactNominalEnd = exactAdd(exactNominalStart, exactNominalWidth),
      columnId = `FG-C${pad2(index + 1)}`,
      facadeId = `FG-F${pad2(index + 1)}`,
      doorIds = section.facades.map((f: Rec) => f.id),
      drawerFacadeIds = m.parts.filter((p: Rec) => p.sectionId === section.id && p.kind === 'drawerFacadeStructural').map((p: Rec) => p.id),
      physicalOk = cfg.facade === 'one' && !doorless(cfg) && doorIds.length === 1 && drawerFacadeIds.length === 0,
      physicalStatus = physicalOk ? 'SUPPORTED' : 'UNSUPPORTED_PROFILE_REQUIRED',
      status = gapProfile.blocking || !physicalOk ? 'UNSUPPORTED_PROFILE_REQUIRED' : 'SUPPORTED',
      exactLeft = exactAdd(exactNominalStart, gapProfile.outerGapExactMm),
      exactRight = exactSub(exactNominalEnd, gapProfile.outerGapExactMm),
      exactWidth = exactSub(exactNominalWidth, gapProfile.jointGapExactMm),
      mappingId = `FG-MAP-${pad2(index + 1)}`,
      physicalFacadeId = physicalOk ? doorIds[0] : null,
      physicalFacadeIds = [...doorIds, ...drawerFacadeIds];
    columns.push({ id: columnId, index, nominalStart: exactToNumber(exactNominalStart), nominalEnd: exactToNumber(exactNominalEnd), nominalWidth: exactToNumber(exactNominalWidth), exactNominalStart, exactNominalEnd, exactNominalWidth, facadeChainItemId: facadeId, physicalFacadeId, status });
    facades.push({
      id: facadeId,
      index,
      columnId,
      mappingId,
      physicalFacadeId,
      physicalFacadeIds,
      left: exactToNumber(exactLeft),
      right: exactToNumber(exactRight),
      width: exactToNumber(exactWidth),
      exactLeft,
      exactRight,
      exactWidth,
      spans: [index],
      status,
      physicalProfileStatus: physicalStatus,
      gapProfileStatus: gapProfile.status,
      blocking: status !== 'SUPPORTED',
      fallbackApplied: false,
      policy: d.facadeWidthPolicy,
    });
    mappings.push({ id: mappingId, columnId, facadeChainItemId: facadeId, physicalFacadeId, physicalFacadeIds, cardinality: physicalFacadeIds.length, status, physicalProfileStatus: physicalStatus, gapProfileStatus: gapProfile.status, blocking: status !== 'SUPPORTED', fallbackApplied: false });
  });
  const blocking = mappings.some((x) => x.blocking);
  m.frontGrid = {
    type: 'FrontGrid',
    mode: d.frontGridMode,
    facadeWidthPolicy: d.facadeWidthPolicy,
    columns,
    facades,
    mappings,
    gapProfile,
    totalNominalWidth: Number(widthInput) || 0,
    exactTotalNominalWidth: parseExactMm(widthInput),
    status: blocking ? 'UNSUPPORTED_PROFILE_REQUIRED' : 'SUPPORTED',
    blocking,
    fallbackApplied: false,
  };
  m.facadeChain = facades;
  m.facadeMappings = mappings;
  for (const mapping of mappings.filter((x) => x.physicalFacadeId)) {
    const metadata = { frontGridMappingId: mapping.id, frontGridColumnId: mapping.columnId, facadeChainItemId: mapping.facadeChainItemId },
      physical = m.sectionsData.flatMap((s: Rec) => s.facades).find((f: Rec) => f.id === mapping.physicalFacadeId),
      part = m.parts.find((p: Rec) => p.id === mapping.physicalFacadeId);
    if (physical) Object.assign(physical, metadata);
    if (part) Object.assign(part, metadata);
  }
  m.facadeOverlays = m.sectionsData.flatMap((section: Rec) =>
    section.facades.map((face: Rec) => {
      const bounds = [section.clearStart, section.clearEnd],
        left = bounds[0] - face.left,
        right = face.left + face.width - bounds[1];
      return { partId: face.id, openingMm: bounds, facadeMm: [face.left, face.left + face.width], leftMm: left, rightMm: right, hingeSide: face.hingeSide, hingeOverlayMm: face.hingeSide === 'left' ? left : right, hingeFit: 'UNVERIFIED_HARDWARE_PROFILE' };
    }),
  );
}

/** Boxes of all parts of a model: the carcass as the r7 fasteners see it (carcassBoxes) and the doors in front of it. */
export function wardrobePartBoxes(m: Rec): WorldBox[] {
  return [...carcassBoxes(m), ...m.parts.filter((p: Rec) => p.facadeBox).map((p: Rec) => ({ id: p.id, part: p, ...p.facadeBox }))];
}
