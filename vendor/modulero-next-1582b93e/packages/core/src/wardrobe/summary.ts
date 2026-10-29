// Summary fields of the wardrobe model (task W5): the counts and quantities the prototype's model() writes after
// the parts and the operations (r1.html:12750–12812 and its return 13253–13286), and their correction by the r7
// fasteners (r1.html:88220–88262). They are projections of the graph: holes and grooves of its operations, edge
// lengths of its parts, confirmats of its joints, doors, hinges and rods of its parts and mechanisms. Rates are not
// read here: the price multiplies these quantities by the rates of the price snapshot (price.ts, one function, WR-11).
//
// `m.priceQuantities` is the one thing the prototype did not keep in the model: the quantities its hardware cost was
// multiplied from (r1.html:12784). With it the price does not need the prototype's intermediate `costs` of the model
// (WR-11). The fasteners are not among them: the price counts them on the joints of the graph (engine/fasteners.ts,
// MOD-DEC-507, FINDINGS 810); the confirmats of the summary stay fields of the prototype's model.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { edgePriceResolve, EdgeOperation } from '../engine/policy/edge-model.js';
import { isConfirmatProfile } from '../engine/policy/wardrobe-fasteners.js';
import type { Rec } from '../engine/policy/project-state.js';
import { EDGE_INTENTS, EDGE_PRICE_CATALOG, EDGE_PROFILES } from './edges.js';
import { FASTENER_PRESETS, WardrobeStandardPreset } from './standard.js';

/** Quantities of the hardware cost of the prototype (r1.html:12784) but the fasteners (jointFasteners). */
export interface PriceQuantities {
  /** Hinges of the sections without a hinge kit of their own (t3 kits are priced as missing, r1.html:85535). */
  hinges: number;
  /** Handles: doors and external drawers. */
  handles: number;
  rods: number;
  /** Drawer runner kits of the sections without a drawer interface. */
  drawerKits: number;
  shelfPins: number;
}

/** A priced position of the hardware by the article of its mechanism (MOD-DEC-509, FINDINGS 830). */
export interface HardwareArticle {
  /** hinge, its mounting plate, the runner kit of a drawer, a clothes rod, a handle (FIT, 480). */
  kind: 'hinge' | 'plate' | 'runner' | 'drawerKit' | 'rod' | 'handle';
  /** The row of the hardware catalogue; null — the mechanism names none (the rod of the prototype). */
  catalogId: string | null;
  brand: string | null;
  /** The manufacturer's article; a runner — the article of its length. */
  article: string | null;
  /** A plate: the catalogue row of its hinge (the rate of the form is for a hinge with its plate). */
  hingeId: string | null;
  qty: number;
}

/**
 * The hardware of the model by article (MOD-DEC-509): every hinge mechanism gives its hinge and its plate, every
 * drawer the runner kit of its length, the rods a rod without an article (the prototype's rod has none); the same
 * article is one position. Read back from the graph the hinges and the runners are those of its HINGE and
 * DRAWER_RUNNER mechanisms (graph-projection.ts), so the price follows the article of the graph mechanism.
 */
export function wardrobeHardwareArticles(m: Rec, hw: HardwareCatalogs): HardwareArticle[] {
  const out = new Map<string, HardwareArticle>(),
    add = (a: Omit<HardwareArticle, 'qty'>, qty: number) => {
      const key = [a.kind, a.catalogId, a.article, a.hingeId].join('|'),
        x = out.get(key);
      if (!qty) return;
      if (x) x.qty += qty;
      else out.set(key, { ...a, qty });
    };
  for (const x of (m.hingeMechanisms ?? []) as Rec[]) {
    const h = hw.hinges.hinges.find((r) => r.id === x.hingeId),
      p = hw.hinges.plates.find((r) => r.id === x.plateId);
    add({ kind: 'hinge', catalogId: h?.id ?? null, brand: h?.brand ?? null, article: h?.article ?? null, hingeId: null }, x.count);
    if (x.plateId) add({ kind: 'plate', catalogId: p?.id ?? null, brand: p?.brand ?? null, article: p?.article ?? null, hingeId: h?.id ?? null }, x.count);
  }
  for (const u of (m.drawerUnits ?? []) as Rec[]) {
    // MOD-DEC-544 (R2-007): an assembled drawer is one kit of the catalogue by the article of its length and colour.
    if (u.kit) {
      add({ kind: 'drawerKit', catalogId: u.kit.systemId, brand: u.kit.brand, article: u.kit.article, hingeId: null }, 1);
      continue;
    }
    const s = hw.drawerSlides.slides.find((r) => r.id === u.slideId),
      l = s?.lengths.find((r) => r.nominalMm === u.slideLengthMm);
    add({ kind: 'runner', catalogId: s?.id ?? null, brand: s?.brand ?? null, article: l?.article ?? s?.article ?? null, hingeId: null }, 1);
  }
  add({ kind: 'rod', catalogId: null, brand: null, article: null, hingeId: null }, m.totalRods ?? 0);
  return [...out.values()];
}

/** The totals of the banding operations (r1.html:12761): metres, cost of the service, metres by profile. */
export function edgeTotals(ops: Rec[]): { edgeM: number; edgeServiceCost: number; edgeMetersByProfile: Rec } {
  return {
    edgeM: ops.reduce((s, o) => s + (o.profileCode === 'NONE' ? 0 : o.meters), 0),
    edgeServiceCost: ops.reduce((s, o) => s + (o.profileCode === 'NONE' || (o.tariff as Rec).tariffNotFound ? 0 : o.meters * (o.tariff as Rec).pricePerM), 0),
    edgeMetersByProfile: ops.reduce((a: Rec, o) => ((a[o.profileCode as string] = (a[o.profileCode as string] || 0) + o.meters), a), {}),
  };
}

/** The summary of the model before the r7 fasteners (base model(), r1.html:12750–12812). */
export function wardrobeBaseSummary(m: Rec, d: Rec): void {
  const parts: Rec[] = m.parts,
    holes: Rec[] = m.holes,
    grooves: Rec[] = m.grooves || [],
    connections: Rec[] = m.connections,
    sectionsData: Rec[] = m.sectionsData,
    priceParts = new Map<string, Rec>();
  for (const p of parts) if (!priceParts.has(p.id)) priceParts.set(p.id, p);
  const holeQty = (h: Rec) => priceParts.get(h.panel)?.q || 1,
    standardHoles = holes.filter((h) => h.diameter !== 35).reduce((s, h) => s + holeQty(h), 0),
    cupHoles = holes.filter((h) => h.diameter === 35).reduce((s, h) => s + holeQty(h), 0),
    edgeOperations = parts.flatMap((p) =>
      p.physicalEdges.map((edge: string) => {
        const profile = p.effectiveEdges[edge] || 'NONE',
          tariff = edgePriceResolve(p.T, profile, p.edgeApplicationType || 'straight', p.edgeGlueTechnology || 'PUR', p.panelServiceCategory || 'STANDARD');
        return EdgeOperation(p, edge, profile, tariff);
      }),
    ),
    { edgeM, edgeServiceCost, edgeMetersByProfile } = edgeTotals(edgeOperations),
    grooveM = grooves.reduce((s, g) => {
      const p = priceParts.get(g.panel);
      return s + (Math.max(0, g.end - g.start) * (p ? p.q : 1)) / 1000;
    }, 0),
    boardArea = parts.filter((p) => p.T !== 4).reduce((s, p) => s + (p.L * p.W * p.q) / 1e6, 0),
    hdfArea = parts.filter((p) => p.T === 4).reduce((s, p) => s + (p.L * p.W * p.q) / 1e6, 0),
    confirmats = connections.filter((c) => c.type === 'confirmat').reduce((s, c) => s + c.qty, 0),
    drawerConfirmats = connections.filter((c) => c.type === 'drawerBox').reduce((s, c) => s + c.qty, 0),
    externalDrawerHandles = sectionsData.reduce((sum, s) => sum + s.drawers.filter((x: Rec) => x.mode === 'external' && !x.dpExcluded).length, 0),
    totalDoors = sectionsData.reduce((n, s) => n + s.facades.length, 0),
    totalHinges = sectionsData.reduce((n, s) => n + s.facades.reduce((a: number, f: Rec) => a + f.hinges, 0), 0),
    totalDrawers = sectionsData.reduce((n, s) => n + s.drawers.filter((x: Rec) => !x.dpExcluded).length, 0),
    totalRods: number = m.totalRods ?? 0,
    totalShelfPins = holes.filter((h) => h.purpose === 'Полкодержатель').length,
    plinthConfirmats = connections.filter((c) => c.subtype === 'plinthRailSide').reduce((s, c) => s + c.qty, 0),
    plinthDowels = connections.filter((c) => c.type === 'woodenDowel' && c.subtype === 'plinthRailBottomDowel').reduce((s, c) => s + c.qty, 0),
    narrowDowels = connections.filter((c) => c.type === 'woodenDowel' && c.subtype === 'narrowJointDowel'),
    hardwareItems: Rec[] = [
      { id: 'HW-DRAWER-CONFIRMAT', type: 'confirmat', name: 'Конфирмат соединений деревянных ящиков', fastenerPresetId: FASTENER_PRESETS.CONFIRMAT_7X50.id, qty: drawerConfirmats, sourceConnectionType: 'drawerBox' },
      {
        id: 'HW-PLINTH-CONFIRMAT',
        type: 'confirmat',
        name: 'Конфирмат соединений цокольных планок с боковинами',
        // MOD-DEC-467: 7×70 through a 22 mm side.
        fastenerPresetId: connections.find((c) => c.subtype === 'plinthRailSide')?.fastenerPresetId ?? FASTENER_PRESETS.CONFIRMAT_7X50.id,
        qty: plinthConfirmats,
        sourceConnectionSubtypes: ['plinthRailSide'],
        requiresTechnologyConfirmation: true,
      },
      {
        id: 'HW-PLINTH-WOODEN-DOWEL',
        type: 'woodenDowel',
        name: `Шкант деревянный ${WardrobeStandardPreset.plinthRailDowelDiameter}×${WardrobeStandardPreset.plinthRailDowelLength}`,
        qty: plinthDowels,
        sourceConnectionSubtypes: ['plinthRailBottomDowel'],
        requiresTechnologyConfirmation: true,
        provisionalMvpRule: true,
        hardwarePriceTariffNotFound: true,
        drillingTariffNotFound: false,
        drillingTariff: 'Отверстие Ø5–12',
      },
      // MOD-DEC-364 (FINDINGS 380): the dowels against turning of the narrow joints; the prototype had none.
      ...(narrowDowels.length
        ? [
            {
              id: 'HW-NARROW-JOINT-DOWEL',
              type: 'woodenDowel',
              name: `Шкант деревянный ${narrowDowels[0]!.connector.diameter}×${narrowDowels[0]!.connector.length} узких деталей`,
              qty: narrowDowels.reduce((s, c) => s + c.qty, 0),
              sourceConnectionSubtypes: ['narrowJointDowel'],
              requiresTechnologyConfirmation: true,
              hardwarePriceTariffNotFound: true,
              drillingTariffNotFound: false,
              drillingTariff: 'Отверстие Ø5–12',
            },
          ]
        : []),
      {
        id: 'HW-DRAWER-SLIDE',
        type: 'drawerSlide',
        name: 'BOYARD DB4501',
        standardStatus: 'HOLD',
        legacyCandidate: true,
        qty: totalDrawers,
        selection: 'auto',
        models: [...new Set(sectionsData.filter((s) => s.drawerSystem).map((s) => s.drawerSystem.model))],
      },
    ],
    sections: Rec[] = d.sections || [],
    priceQuantities: PriceQuantities = {
      hinges: sectionsData.reduce((n, s, i) => n + (sections[i]?.hingeKit ? 0 : s.facades.reduce((a: number, f: Rec) => a + f.hinges, 0)), 0),
      handles: totalDoors + externalDrawerHandles,
      rods: totalRods,
      drawerKits: sectionsData.reduce((n, s, i) => n + (sections[i]?.drawerInterface ? 0 : s.drawers.length), 0),
      shelfPins: totalShelfPins,
    };
  Object.assign(m, {
    hardwareItems,
    confirmats,
    drawerConfirmats,
    plinthConfirmats,
    plinthDowels,
    totalDoors,
    totalHinges,
    totalRods,
    totalDrawers,
    externalDrawerHandles,
    standardHoles,
    cupHoles,
    boardArea,
    hdfArea,
    edgeIntents: EDGE_INTENTS,
    edgeProfiles: EDGE_PROFILES,
    edgePriceCatalog: EDGE_PRICE_CATALOG,
    edgeM,
    edgeMetersByProfile,
    edgeOperations,
    edgeServiceCost,
    grooveM,
    priceQuantities,
  });
}

/**
 * The summary after the r7 fasteners took joints over (r1.html:88220–88262): the confirmats they replaced leave the
 * counts, the holes are counted again, the kits and the wooden dowels of the plan join the hardware list.
 * `successful` — the joints the plan drilled; `joints` — its joints.
 */
export function wardrobeFastenerSummary(m: Rec, successful: ReadonlySet<unknown>, result: Rec): void {
  if (!m.priceQuantities) return;
  const removedCarcass = m.connections
      .filter((c: Rec) => successful.has(c.id) && c.legacyType === 'confirmat' && c.jointType === 'FASTENERS_R7' && !isConfirmatProfile(c.fastener))
      .reduce((s: number, c: Rec) => s + c.qty, 0),
    removedDrawer = result.joints.filter((j: Rec) => successful.has(j.id) && j.role === 'drawer_front_side').reduce((s: number, j: Rec) => s + j.stations.length, 0);
  m.confirmats = Math.max(0, m.confirmats - removedCarcass);
  m.drawerConfirmats = Math.max(0, m.drawerConfirmats - removedDrawer);
  for (const item of m.hardwareItems) if (item.id === 'HW-DRAWER-CONFIRMAT') item.qty = Math.max(0, item.qty - removedDrawer);
  m.standardHoles = m.holes.filter((h: Rec) => h.diameter !== 35).length;
  m.cupHoles = m.holes.filter((h: Rec) => h.diameter === 35).length;
  m.hardwareItems.push(
    ...result.kits.map((k: Rec) => ({ id: k.physicalId, type: 'eccentricKit', name: k.profileId, qty: k.qty, unit: 'kit', rateRub: k.rateRub, amountRub: k.rateRub, components: k.components, productionReady: false })),
    ...result.woodItems.map((w: Rec) => ({ id: w.physicalId, type: 'woodenDowel', sku: w.sku, name: 'Шкант 8×35', qty: 1, rateRub: null, amountRub: null, productionReady: false })),
  );
}
