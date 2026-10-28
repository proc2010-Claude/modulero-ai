// Fittings of the wardrobe model (task FIT, MOD-DEC-480): the clothes rods with their holders, the legs of the bodies
// on legs and the handles of the fronts, chosen from catalogs/hardware/fittings.json by engine/policy/fittings-selection.
// Until FIT the rod was a placeholder without a model (233), the legs a placeholder (171) and the handles only a count
// of the price; the model and the rules of the prototype stay as they were — this is a layer over the built model,
// read by the generator (mechanisms and their 3D models, MOD-DEC-432) and by the price. Axes of the result: the
// product's (X right, Y back from the front plane, Z up), millimetres, as the graph.
import type { FittingFinish, FittingsCatalog, Handle, Leg, PowerSupply, RodSeries, StorageColour, StorageKind } from '../catalog/hardware/fittings.js';
import type { HardwareModel, HardwareVisual, Vec3 } from '../engine/contract.js';
import { fittingsSelection, handleFor, legFor, legStations, lightFor, onLegs, powerSupplyFor, rodSeriesFor, rodStockFor, sectionLit, type FittingsChoice } from '../engine/policy/fittings-selection.js';
import type { Rec } from '../engine/policy/project-state.js';
import { wardrobePartBoxes } from './facades.js';
import type { PushLatchBuild, PushLatchFitting } from './push-latches.js';
import { pantographPivotZ, type StorageUnit } from './storage.js';
import type { HardwareArticle } from './summary.js';

/** A clothes rod: the series, the stock length it is cut from, its holders and where it hangs. */
export interface RodFitting {
  /** The id of the rod of the section (`…-ROD01`): the CLOTHES_ROD mechanism keeps it. */
  id: string;
  sectionId: string;
  seriesId: string;
  brand: string;
  article: string;
  stockLengthMm: number;
  cutLengthMm: number;
  priceRub: number | null;
  holderBrand: string;
  holderArticle: string;
  holders: number;
  holderPriceRub: number | null;
  /** The cut is longer than the longest stock: why (the longest is taken), else null. */
  temporary: string | null;
  sectionHeightMm: number;
  visuals: HardwareVisual[];
}

/** The legs of one body on legs: the leg, its height and where each stands. */
export interface LegFitting {
  /** The id of the leg placeholder of the body (`…-HW-FIXED-LEGS`): the SUPPORT_LEG mechanism keeps it. */
  id: string;
  moduleId: string;
  legId: string;
  brand: string;
  article: string;
  name: string;
  heightMm: number;
  quantity: number;
  /** Centres of the legs in plan, product axes. */
  stationsMm: [number, number][];
  priceRub: number | null;
  temporary: string | null;
  visuals: HardwareVisual[];
  /** Behind a decorative plinth (MOD-DEC-483): the clips that hold it, on the legs of the front row; else null. */
  clips: { clipId: string; brand: string; article: string; quantity: number } | null;
}

/** The handle of one front. */
export interface HandleFitting {
  id: string;
  partId: string;
  sectionId: string | null;
  handleId: string;
  brand: string;
  article: string;
  name: string;
  /** VERTICAL — along the height of a door; HORIZONTAL — along the width of a drawer or lift front. */
  orientation: 'VERTICAL' | 'HORIZONTAL';
  centreMm: Vec3;
  priceRub: number | null;
  visuals: HardwareVisual[];
}

/** The light of one section (MOD-DEC-483): under the roof or under the top shelf, the longest that fits. */
export interface LightFitting {
  /** `<section>-LIGHT`: the LIGHT mechanism keeps it. */
  id: string;
  sectionId: string;
  lightId: string;
  brand: string;
  article: string;
  name: string;
  lengthMm: number;
  powerW: number;
  /** The panel it is screwed under: the roof of the body or the top shelf of the section. */
  mountPartId: string;
  /** The lower face of that panel, mm from the floor. */
  mountElevationMm: number;
  priceRub: number | null;
  visuals: HardwareVisual[];
}

/** The power supply of the lights (MOD-DEC-483): one per wardrobe, by the sum of the powers. */
export interface PowerSupplyFitting {
  id: string;
  supplyId: string;
  brand: string;
  article: string;
  name: string;
  quantity: number;
  /** The sum of the powers of the lights it feeds, W. */
  loadW: number;
  priceRub: number | null;
}

/** A basket, a trouser rack or a pantograph of a section (MOD-DEC-484), from the model (storage.ts) with its 3D model. */
export interface StorageFitting {
  /** `<section>-STORAGE01`: the BASKET, TROUSER_RACK or PANTOGRAPH mechanism keeps it. */
  id: string;
  sectionId: string;
  kind: StorageKind;
  itemId: string;
  brand: string;
  article: string;
  name: string;
  colour: StorageColour;
  priceRub: number | null;
  /** The panels (or spacers) it is screwed to. */
  mountPartIds: string[];
  /** The bottom of the frame and the axis of the runners (the pivot of a pantograph), mm from the floor. */
  bottomElevationMm: number;
  axisElevationMm: number;
  heightMm: number;
  widthMm: number;
  depthMm: number;
  loadKg: number | null;
  /** Its screws by the marking of the kit (Ø3 × 1): the panel and the point in product axes. */
  marksMm: { partId: string; at: Vec3 }[];
  /** What it meets in the section, or why its colour is not the project's; null — none. */
  problem: string | null;
  visuals: HardwareVisual[];
  /** Its model of the catalogue (MOD-DEC-536, FINDINGS 1085); null — the record has none, the visuals are the picture. */
  model: HardwareModel | null;
}

export interface WardrobeFittings {
  rods: RodFitting[];
  legs: LegFitting[];
  handles: HandleFitting[];
  /** The project chose «без ручек». */
  noHandles: boolean;
  lights: LightFitting[];
  powerSupply: PowerSupplyFitting | null;
  /** Sections the project lights that get no light, with the reason (Russian, for the editor). */
  lightNotes: string[];
  /** The latches of the doors opened by pressing (MOD-DEC-485), placed with their holes by the carcass. */
  pushLatches: PushLatchFitting[];
  /** Doors opened by pressing that get no latch, with the reason. */
  latchNotes: string[];
  /** The baskets, trouser racks and pantographs of the sections (MOD-DEC-484) that have an item of the catalogue. */
  storage: StorageFitting[];
  /** Items of the project with no item that fits, and colours the item has not (Russian, for the editor and the bell). */
  storageNotes: string[];
}

/** The id of the power supply of the lights of the wardrobe (MOD-DEC-483). */
export const LIGHT_POWER_SUPPLY_ID = 'WARDROBE-HW-LIGHT-PSU';

const C = fittingsSelection.constants;
const X: Vec3 = [1, 0, 0],
  Y: Vec3 = [0, 1, 0],
  Z: Vec3 = [0, 0, 1],
  NEG_Y: Vec3 = [0, -1, 0],
  NEG_Z: Vec3 = [0, 0, -1];
/** The source and page of a price of the catalogue, as the price line names it. */
const r1 = (x: number) => Math.round(x * 10) / 10;
const pt = (a: number, b: number, c: number): Vec3 => [r1(a), r1(b), r1(c)];

/** A polygon of a circle or an ellipse inscribed in the rectangle L × W (the 3D of a round body; 16 sides). */
function ellipse(L: number, W: number, sides = 16): [number, number][] {
  return Array.from({ length: sides }, (_, i) => {
    const a = (2 * Math.PI * i) / sides;
    return [r1(L / 2 + (L / 2) * Math.cos(a)), r1(W / 2 + (W / 2) * Math.sin(a))] as [number, number];
  });
}

/** The side view of a bar handle (скоба): two posts of the thickness at the ends and the grip across them. */
function staple(L: number, H: number, t: number): [number, number][] {
  return [
    [0, 0],
    [t, 0],
    [t, H - t],
    [L - t, H - t],
    [L - t, 0],
    [L, 0],
    [L, H],
    [0, H],
  ];
}

const visual = (id: string, hostPartId: string | null, originMm: Vec3, uAxis: Vec3, vAxis: Vec3, nAxis: Vec3, sizeMm: Vec3, contourMm: [number, number][] | null, finish: FittingFinish): HardwareVisual => ({
  id,
  hostPartId,
  originMm,
  uAxis,
  vAxis,
  nAxis,
  sizeMm: sizeMm.map(r1) as Vec3,
  contourMm,
  finish,
});

/** The rods of the sections: every rod of `interiorElements`, its series by its row, the project or the default. */
function rods(m: Rec, d: Rec, catalog: FittingsCatalog, choice: FittingsChoice | null): RodFitting[] {
  const out: RodFitting[] = [];
  for (const s of m.sectionsData as Rec[]) {
    const mod = m.modules.find((x: Rec) => x.id === s.moduleId),
      rows: Rec[] = d.sections[s.index]?.filling?.rod ?? [];
    for (const e of (s.interiorElements as Rec[]).filter((e) => e.type === 'rod')) {
      const row = rows[s.rodYs.indexOf(e.y)],
        series: RodSeries = rodSeriesFor(catalog, row?.system, choice?.rodSeriesId),
        h = series.holder,
        cut = s.clearOpeningWidth - 2 * h.endGapMm,
        stock = rodStockFor(series, cut),
        axisZ = mod.geometry.interiorBottomY + e.y,
        axisY = row?.depthAxis ?? mod.geometry.depth / 2,
        { widthMm: w, heightMm: hh } = series.sectionMm,
        x0 = s.clearStart,
        x1 = s.clearEnd;
      out.push({
        id: e.id,
        sectionId: s.id,
        seriesId: series.id,
        brand: series.brand,
        article: stock.item.article,
        stockLengthMm: stock.item.lengthMm,
        cutLengthMm: r1(cut),
        priceRub: stock.item.price?.rub ?? null,
        holderBrand: h.brand,
        holderArticle: h.article,
        holders: h.perRod,
        holderPriceRub: h.price?.rub ?? null,
        temporary: stock.reason,
        sectionHeightMm: hh,
        visuals: [
          // The rod: its section in the plane Y, Z, along X between the holders.
          visual(`${e.id}-V-ROD`, null, pt(x0 + h.endGapMm, axisY - w / 2, axisZ - hh / 2), Y, Z, X, [w, hh, cut], series.profile === 'RECT' ? null : ellipse(w, hh), series.finish),
          visual(`${e.id}-V-HOLDER-L`, null, pt(x0, axisY - h.sizeMm.acrossMm / 2, axisZ - h.sizeMm.heightMm / 2), X, Y, Z, [h.sizeMm.alongMm, h.sizeMm.acrossMm, h.sizeMm.heightMm], null, h.finish),
          visual(`${e.id}-V-HOLDER-R`, null, pt(x1 - h.sizeMm.alongMm, axisY - h.sizeMm.acrossMm / 2, axisZ - h.sizeMm.heightMm / 2), X, Y, Z, [h.sizeMm.alongMm, h.sizeMm.acrossMm, h.sizeMm.heightMm], null, h.finish),
        ],
      });
    }
  }
  return out;
}

/**
 * The legs of each body on legs (Д 480): two rows, front and back, at the inset; the spacing of a row ≤ 900 mm. Behind
 * a decorative plinth (483) the legs stand the same, the hidden ones first, and each leg of the front row holds the
 * plinth by its clip.
 */
function legs(m: Rec, catalog: FittingsCatalog, choice: FittingsChoice | null): LegFitting[] {
  const out: LegFitting[] = [];
  for (const mod of m.modules as Rec[]) {
    const g = mod.geometry;
    if (!onLegs(g.settings.baseSystem)) continue;
    const plinth = g.settings.baseSystem === 'legsPlinth',
      height = r1(g.sideBottomY - g.floorY),
      pick = legFor(catalog, height, choice, plinth ? C.plinthLegUse.value : 'VISIBLE'),
      leg: Leg = pick.item,
      xs = legStations(mod.end - mod.start).map((x) => mod.start + x),
      ys = legStations(g.depth).filter((_, i, a) => i === 0 || i === a.length - 1),
      stations = ys.flatMap((y) => xs.map((x) => [r1(x), r1(y)] as [number, number])),
      id = `${mod.id}-HW-FIXED-LEGS`,
      clip = plinth ? catalog.plinthClips.find((x) => x.id === C.plinthClip.value) : undefined;
    out.push({
      id,
      moduleId: mod.id,
      legId: leg.id,
      brand: leg.brand,
      article: leg.article,
      name: leg.name,
      heightMm: height,
      quantity: stations.length,
      stationsMm: stations,
      priceRub: leg.price?.rub ?? null,
      temporary: pick.reason,
      visuals: legVisuals(id, leg, stations, g.floorY, height),
      clips: clip ? { clipId: clip.id, brand: clip.brand, article: clip.article, quantity: xs.length * clip.perLeg } : null,
    });
  }
  return out;
}

/** The models of the legs of a body: a prism of the footprint of the leg at each station (x, y) from the floor up. */
export function legVisuals(id: string, leg: Leg, stations: readonly (readonly [number, number])[], floorMm: number, heightMm: number): HardwareVisual[] {
  const s = leg.footprint.sizeMm,
    outline = leg.footprint.shape === 'ROUND' ? ellipse(s, s) : null;
  return stations.map(([x, y], i) => visual(`${id}-V${String(i + 1).padStart(2, '0')}`, null, pt(x - s / 2, y - s / 2, floorMm), X, Y, Z, [s, s, heightMm], outline, leg.finish));
}

/**
 * The 3D model of a handle on a front (Д 480): its centre (cx, cz) on the outer face of the front at the depth `frontY`
 * (product axes), the handle in front of it — a knob as an ellipse, a bar as its staple along `orientation`.
 */
export function handleVisual(id: string, partId: string, handle: Handle, orientation: HandleFitting['orientation'], cx: number, cz: number, frontY: number): HardwareVisual {
  const { lengthMm: L, heightMm: H, thicknessMm: T } = handle.sizeMm;
  return handle.kind === 'KNOB'
    ? visual(id, partId, pt(cx - L / 2, frontY, cz - T / 2), X, Z, NEG_Y, [L, T, H], ellipse(L, T), handle.finish)
    : orientation === 'VERTICAL'
      ? visual(id, partId, pt(cx - T / 2, frontY, cz - L / 2), Z, NEG_Y, X, [L, H, T], staple(L, H, T), handle.finish)
      : visual(id, partId, pt(cx - L / 2, frontY, cz + T / 2), X, NEG_Y, NEG_Z, [L, H, T], staple(L, H, T), handle.finish);
}

/**
 * The centre (x, z) of the vertical handle of a hinged door x0…x1 wide and z0…z1 high from the floor (Д 480): at the
 * free edge — the one without hinges, at 1000 mm from the floor within the door, its ends at least 50 mm from the
 * edges (a knob — its middle within the door).
 */
export function doorHandleCentre(handle: Handle, hinge: unknown, x0: number, x1: number, z0: number, z1: number): [number, number] {
  const L = handle.sizeMm.lengthMm,
    along = handle.kind === 'KNOB' ? L / 2 : L / 2 + C.handleEdgeClearance.value,
    lo = z0 + along,
    hi = z1 - along;
  return [hinge === 'right' ? x0 + C.handleFromFreeEdge.value : x1 - C.handleFromFreeEdge.value, lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, C.handleCentreHeight.value))];
}

/**
 * The handle of each front (Д 480): a door — vertical, at the free edge, its middle at 1000 mm from the floor within
 * the door; an external drawer — horizontal, in the middle of its front; a lift front — horizontal, near its lower
 * edge (the lower leaf of a folding one). The prototype counted a handle per door and external drawer (summary.ts).
 */
function handles(m: Rec, handle: Handle | null, pushToOpen: boolean): HandleFitting[] {
  if (!handle) return [];
  const boxes = new Map(wardrobePartBoxes(m).map((b) => [b.id, b])),
    out: HandleFitting[] = [];
  const put = (partId: string, sectionId: string | null, orientation: HandleFitting['orientation'], cx: number, cz: number, frontY: number) => {
    const id = `${partId}-HANDLE`;
    out.push({ id, partId, sectionId, handleId: handle.id, brand: handle.brand, article: handle.article, name: handle.name, orientation, centreMm: pt(cx, frontY - handle.sizeMm.heightMm, cz), priceRub: handle.price?.rub ?? null, visuals: [handleVisual(`${id}-V`, partId, handle, orientation, cx, cz, frontY)] });
  };
  for (const s of m.sectionsData as Rec[]) {
    // A folding lift front has its handle on the lower leaf only: the upper one is lifted by it (Д 480).
    const lifts = (s.facades as Rec[]).filter((f) => f.liftFront && boxes.has(f.id)),
      lowerLift = lifts.reduce<Rec | null>((a, f) => (!a || boxes.get(f.id)!.y0 < boxes.get(a.id)!.y0 ? f : a), null);
    for (const f of s.facades as Rec[]) {
      const b = boxes.get(f.id);
      if (!b) continue;
      if (f.liftFront) {
        if (f === lowerLift) put(f.id, s.id, 'HORIZONTAL', (b.x0 + b.x1) / 2, b.y0 + C.handleFromLiftEdge.value, b.z0);
        continue;
      }
      // A door opened by pressing has its latch, not a handle (MOD-DEC-485); drawers and lift fronts keep theirs.
      if (pushToOpen) continue;
      // R2-032 (FINDINGS 1767, Д): a door lower than its bar with the clearances of 480 at both ends takes it
      // horizontal in its middle, as an external drawer does; a vertical one would cross the rows beside it.
      if (handle.kind !== 'KNOB' && b.y1 - b.y0 < handle.sizeMm.lengthMm + 2 * C.handleEdgeClearance.value) {
        put(f.id, s.id, 'HORIZONTAL', (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.z0);
        continue;
      }
      const [x, z] = doorHandleCentre(handle, b.part.handedness ?? f.hingeSide, b.x0, b.x1, b.y0, b.y1);
      put(f.id, s.id, 'VERTICAL', x, z, b.z0);
    }
    for (const dr of (s.drawers as Rec[]).filter((x) => x.mode === 'external' && !x.dpExcluded)) {
      const b = boxes.get(`${dr.id}-FACADE-STRUCTURAL`);
      if (b) put(b.id, s.id, 'HORIZONTAL', (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.z0);
    }
  }
  return out;
}

/**
 * The lights of the lit sections (MOD-DEC-483): one per section, the longest of the catalogue that fits in the clear
 * width, in the middle of it. It is screwed under the top shelf of the section (the one that covers its middle) when
 * no rod of the section hangs above that shelf, else under the roof; its front edge is behind the front of that panel.
 */
function lights(m: Rec, catalog: FittingsCatalog, choice: FittingsChoice | null, notes: string[]): LightFitting[] {
  const out: LightFitting[] = [];
  if (!choice?.lighting) return out;
  const boxes = wardrobePartBoxes(m),
    byId = new Map(boxes.map((b) => [b.id, b]));
  for (const s of m.sectionsData as Rec[]) {
    if (!sectionLit(choice, s.id)) continue;
    const mod = m.modules.find((x: Rec) => x.id === s.moduleId),
      width = r1(s.clearEnd - s.clearStart),
      mid = (s.clearStart + s.clearEnd) / 2,
      light = lightFor(catalog, width);
    if (!light) {
      notes.push(`${s.id}: ширина секции ${width} мм меньше самого короткого светильника — подсветки нет`);
      continue;
    }
    const rodTop = Math.max(-Infinity, ...(s.interiorElements as Rec[]).filter((e) => e.type === 'rod').map((e) => mod.geometry.interiorBottomY + e.y)),
      shelf = boxes
        .filter((b) => (b.part.kind === 'fixedShelf' || b.part.kind === 'adjustableShelf') && b.part.moduleId === mod.id && b.x0 < mid && b.x1 > mid)
        .reduce<(typeof boxes)[number] | null>((a, b) => (!a || b.y0 > a.y0 ? b : a), null),
      mount = shelf && shelf.y0 > rodTop ? shelf : byId.get(mod.panelIds.top);
    if (!mount) {
      notes.push(`${s.id}: у корпуса нет крыши, а над штангой нет полки — подсветку некуда установить`);
      continue;
    }
    const id = `${s.id}-LIGHT`,
      { widthMm: w, heightMm: h } = light.sectionMm,
      x0 = mid - light.lengthMm / 2,
      y = mount.z0 + C.lightFromFront.value;
    out.push({
      id,
      sectionId: s.id,
      lightId: light.id,
      brand: light.brand,
      article: light.article,
      name: light.name,
      lengthMm: light.lengthMm,
      powerW: light.powerW,
      mountPartId: mount.id,
      mountElevationMm: r1(mount.y0),
      priceRub: light.price?.rub ?? null,
      visuals: [visual(`${id}-V`, null, pt(x0, y, mount.y0 - h), X, Y, Z, [light.lengthMm, w, h], null, light.finish)],
    });
  }
  return out;
}

/** The power supply of the lights (MOD-DEC-483): by the sum of their powers; none without lights. */
function powerSupply(catalog: FittingsCatalog, ls: LightFitting[]): PowerSupplyFitting | null {
  if (!ls.length) return null;
  const loadW = r1(ls.reduce((a, l) => a + l.powerW, 0)),
    voltage = catalog.lights.find((l) => l.id === ls[0]!.lightId)!.voltageV,
    { item, quantity }: { item: PowerSupply; quantity: number } = powerSupplyFor(catalog, loadW, voltage);
  return { id: LIGHT_POWER_SUPPLY_ID, supplyId: item.id, brand: item.brand, article: item.article, name: item.name, quantity, loadW, priceRub: item.price?.rub ?? null };
}

const FINISH_OF: Readonly<Record<StorageColour, FittingFinish>> = { WHITE: 'WHITE', GRAPHITE: 'GRAPHITE', BLACK: 'BLACK', GREY_METALLIC: 'METAL' };

/**
 * The 3D model of a storage item (Д 484, a visual only — MOD-DEC-432): the two runners at its sides along the depth on
 * the axis, and over them — a basket for linen as an open tray of wire walls, one for shoes as two inclined racks, a
 * trouser rack as its frame with the bars along the depth, a pantograph as its two mechanisms on the panels, their
 * levers up to the rod and the handle in the middle. Product axes from the prototype's box: X = x, Y = z, Z = y.
 */
function storageVisuals(u: StorageUnit, finish: FittingFinish): HardwareVisual[] {
  const { x0, x1, y0, y1, z0, z1 } = u.box,
    a = u.axisElevationMm,
    id = (k: string) => `${u.id}-V-${k}`,
    out: HardwareVisual[] = [],
    box = (k: string, ox: number, oy: number, oz: number, sx: number, sy: number, sz: number, f: FittingFinish = finish) => out.push(visual(id(k), null, pt(ox, oy, oz), X, Y, Z, [sx, sy, sz], null, f)),
    runners = (from: number, to: number) => {
      box('RUNNER-L', x0, from, a - 17.5, 12, to - from, 35, 'METAL');
      box('RUNNER-R', x1 - 12, from, a - 17.5, 12, to - from, 35, 'METAL');
    };
  const w = 4,
    i0 = x0 + 12,
    i1 = x1 - 12;
  if (u.kind === 'LINEN_BASKET') {
    runners(z0, z1);
    const top = Math.min(y1, a + 30);
    box('BOTTOM', i0, z0, y0, i1 - i0, z1 - z0, w);
    box('FRONT', i0, z0, y0, i1 - i0, w, top - y0);
    box('BACK', i0, z1 - w, y0, i1 - i0, w, top - y0);
    box('SIDE-L', i0, z0, y0, w, z1 - z0, top - y0);
    box('SIDE-R', i1 - w, z0, y0, w, z1 - z0, top - y0);
  } else if (u.kind === 'SHOE_BASKET') {
    runners(z0 + 60, z1);
    // Two racks inclined to the front, each across the width: a parallelogram of the side view (Y, Z) along X.
    const d = z1 - z0,
      rack = (k: string, lo: number) => out.push(visual(id(k), null, pt(i0, z0, lo), Y, Z, X, [d, 60, i1 - i0], [[0, 0], [d / 2 - 10, 0], [d / 2 - 10, 60], [0, 30]].map(([s, t]) => [r1(s!), r1(t!)] as [number, number]), finish));
    rack('RACK-FRONT', y0 + 20);
    out.push(visual(id('RACK-BACK'), null, pt(i0, z0 + d / 2, y0 + 80), Y, Z, X, [d / 2, 60, i1 - i0], [[0, 0], [r1(d / 2), 0], [r1(d / 2), 60], [0, 30]], finish));
  } else if (u.kind === 'TROUSER_RACK' && u.mounting === 'TOP') {
    box('PLATE', x0, z0, y1 - 12, x1 - x0, z1 - z0, 12);
    for (let k = 0; k < 6; k++) box(`BAR${k + 1}`, x0 + 20 + (k * (x1 - x0 - 40 - 8)) / 5, z0, y1 - 120, 8, z1 - z0, 8);
  } else if (u.kind === 'TROUSER_RACK') {
    runners(z0, z1);
    box('FRAME-FRONT', i0, z0, a - 10, i1 - i0, 20, 20);
    box('FRAME-BACK', i0, z1 - 20, a - 10, i1 - i0, 20, 20);
    const n = Math.max(2, Math.floor((i1 - i0) / 70));
    for (let k = 0; k < n; k++) box(`BAR${String(k + 1).padStart(2, '0')}`, i0 + 25 + (k * (i1 - i0 - 50 - 8)) / (n - 1), z0, a - 40, 8, z1 - z0, 8);
  } else {
    // A pantograph: the mechanism on each panel around the pivot, the levers to the rod, the rod and its handle.
    const pz = pantographPivotZ(u),
      rodZ = y0 + 907.5;
    box('MECH-L', x0, pz - 75, a - 60, 15, 150, 260, finish);
    box('MECH-R', x1 - 15, pz - 75, a - 60, 15, 150, 260, finish);
    box('LEVER-L', x0 + 15, pz - 10, a, 10, 20, rodZ - a);
    box('LEVER-R', x1 - 25, pz - 10, a, 10, 20, rodZ - a);
    out.push(visual(id('ROD'), null, pt(x0 + 25, pz - 12.5, rodZ - 12.5), Y, Z, X, [25, 25, x1 - x0 - 50], ellipse(25, 25), 'METAL'));
    box('HANDLE', (x0 + x1) / 2 - 7.5, pz - 7.5, rodZ - 160, 15, 15, 150);
  }
  return out;
}

/**
 * The model of the catalogue of a storage item (MOD-DEC-536, FINDINGS 1085): its file put into the closed volume of
 * the item — from the left, the front of the frame and its bottom (of a pantograph — from its pivot, the origin of its
 * kit). The model of the colour, when the record gives one, else that of the item.
 */
function storageModel(u: StorageUnit, catalog: FittingsCatalog): HardwareModel | null {
  const item = catalog.storage.find((x) => x.id === u.itemId),
    m = item?.variants.find((v) => v.colour === u.colour)?.model3d ?? item?.model3d;
  if (!item || !m) return null;
  const { x0, x1, y0, y1, z0, z1 } = u.box;
  return {
    id: `${u.id}-MODEL`,
    hostPartId: null,
    originMm: pt(x0, u.kind === 'PANTOGRAPH' ? pantographPivotZ(u) : z0, y0),
    uAxis: X,
    vAxis: Y,
    nAxis: Z,
    sizeMm: pt(x1 - x0, z1 - z0, y1 - y0),
    file: m.file,
    sha256: m.sha256,
    fileOriginMm: [...m.origin],
    fileAxes: { ...m.axes },
    stretchAtMm: m.stretch?.atMm ?? null,
    drawnWidthMm: m.stretch?.widthMm ?? null,
    finish: FINISH_OF[u.colour!],
  };
}

/** The storage items of the model as fittings (MOD-DEC-484): those with an item of the catalogue, with their 3D model. */
function storage(m: Rec, catalog: FittingsCatalog, notes: string[]): StorageFitting[] {
  const out: StorageFitting[] = [];
  for (const u of (m.storageUnits ?? []) as StorageUnit[]) {
    if (u.colourNote) notes.push(u.colourNote);
    if (u.problem) notes.push(u.problem);
    if (!u.itemId) continue;
    out.push({
      id: u.id,
      sectionId: u.sectionId,
      kind: u.kind,
      itemId: u.itemId,
      brand: u.brand!,
      article: u.article!,
      name: u.name!,
      colour: u.colour!,
      priceRub: u.priceRub,
      mountPartIds: u.mountPartIds,
      bottomElevationMm: u.box.y0,
      axisElevationMm: u.axisElevationMm,
      heightMm: u.heightMm,
      widthMm: r1(u.box.x1 - u.box.x0),
      depthMm: r1(u.box.z1 - u.box.z0),
      loadKg: u.loadKg,
      marksMm: u.marksMm.map((k) => ({ partId: k.partId, at: [k.at[0], k.at[2], k.at[1]] as Vec3 })),
      problem: u.problem,
      visuals: storageVisuals(u, FINISH_OF[u.colour!]),
      model: storageModel(u, catalog),
    });
  }
  return out;
}

/** The fittings of a built wardrobe model `m` on its state `d` (state.fittings — the choice of the project). */
export function wardrobeFittings(m: Rec, d: Rec, catalog: FittingsCatalog): WardrobeFittings {
  const choice: FittingsChoice | null = d.fittings ?? null,
    handle = handleFor(catalog, choice),
    lightNotes: string[] = [],
    ls = lights(m, catalog, choice, lightNotes);
  const latches: PushLatchBuild = m.pushLatches ?? { latches: [], notes: [] },
    storageNotes: string[] = [];
  return {
    rods: rods(m, d, catalog, choice),
    legs: legs(m, catalog, choice),
    handles: handles(m, handle, !!choice?.pushToOpen),
    noHandles: choice?.handleId === 'NONE',
    lights: ls,
    powerSupply: powerSupply(catalog, ls),
    lightNotes,
    pushLatches: latches.latches,
    latchNotes: latches.notes.map((x) => x.text),
    storage: storage(m, catalog, storageNotes),
    storageNotes,
  };
}

/**
 * The rods and handles of the fittings as positions of the price by article (MOD-DEC-509): one position per article,
 * priced by the record of its article in the hardware catalogue (FIT, MOD-DEC-480, 536); the maker's own rate still
 * comes first (509). The holders and the legs have no rate of the form: their lines are the catalogue's.
 */
export function fittingsArticles(fit: WardrobeFittings): HardwareArticle[] {
  const out = new Map<string, HardwareArticle>(),
    add = (kind: 'rod' | 'handle', catalogId: string, brand: string, article: string) => {
      const key = `${kind}|${catalogId}|${article}`,
        x = out.get(key);
      if (x) x.qty += 1;
      else out.set(key, { kind, catalogId, brand, article, hingeId: null, qty: 1 });
    };
  for (const r of fit.rods) add('rod', r.seriesId, r.brand, r.article);
  for (const h of fit.handles) add('handle', h.handleId, h.brand, h.article);
  return [...out.values()];
}
