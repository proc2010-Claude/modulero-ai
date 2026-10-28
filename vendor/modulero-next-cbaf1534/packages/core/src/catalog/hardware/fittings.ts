// Fittings of the wardrobe (task FIT, MOD-DEC-480): the clothes rods with their holders, the legs and the handles.
// Until FIT the rod was a placeholder without a model (MOD-DEC-233), the legs had no model and the handles were not on
// the graph; the owner asked to choose and bring them in (2026-10-24). One record is one product of the price lists of
// the owner's catalogue: the order code, the dimensions the engine and the 3D view need and the price. A price is a
// guide (MOD-DEC-346): the average of the suppliers' guides rounded up to 10 ₽ (264); a number without a source is the
// owner's or the executor's (MOD-DEC-348) — the sizes of a handle or a holder are visual (MOD-DEC-158, 432). The data lie
// in catalogs/hardware/fittings.json, outside the core (CAT-1).
import { catalogPriceProblems, type CatalogPrice } from './prices.js';
import { refChecker, type CatalogDocument, type CatalogRef, type Known, type Model3d } from './types.js';

/** What a purchased item is drawn with in 3D: metal, black, white or graphite (the visual layer of MOD-DEC-432, 484). */
export type FittingFinish = 'METAL' | 'BLACK' | 'WHITE' | 'GRAPHITE';

const FINISHES: readonly FittingFinish[] = ['METAL', 'BLACK', 'WHITE', 'GRAPHITE'];

/** A length of a rod series as it is sold, with its price. */
export interface RodStock {
  article: string;
  lengthMm: number;
  /** The price of the length (MOD-DEC-536); the release requires it. */
  price?: CatalogPrice;
}

/** The holder of a rod series: the pair at the ends of a rod, screwed to the sides (or partitions) of the section. */
export interface RodHolder {
  brand: string;
  article: string;
  name: string;
  price?: CatalogPrice;
  /** Holders on one rod. */
  perRod: number;
  /** Visual size: along the rod, across it (depth) and up. */
  sizeMm: { alongMm: number; acrossMm: number; heightMm: number };
  /** The rod is shorter than the clear opening by this much at each end: the wall of the holder. */
  endGapMm: number;
  finish: FittingFinish;
  /** The 3D model of the holder (MOD-DEC-536); none — the parametric one. */
  model3d?: Model3d | null;
}

/** A rod series: OVAL — овальная, ROUND — круглая, RECT — прямоугольная. */
export interface RodSeries {
  id: string;
  brand: string;
  series: string;
  name: string;
  profile: 'OVAL' | 'ROUND' | 'RECT';
  /** Section of the rod: across (depth) and up. The height is the «высота сечения» of the rule 310. */
  sectionMm: { widthMm: number; heightMm: number };
  finish: FittingFinish;
  /** Lengths it is sold in; a rod is cut from the shortest one that holds it. */
  stock: RodStock[];
  holder: RodHolder;
  /** The 3D model of a rod of the series (MOD-DEC-536), drawn over its length; none — the parametric one. */
  model3d?: Model3d | null;
  ref?: CatalogRef | null;
}

/** A leg (опора) of a body standing on legs. VISIBLE — meant to be seen; HIDDEN — under a plinth. */
export interface Leg {
  id: string;
  brand: string;
  article: string;
  name: string;
  use: 'VISIBLE' | 'HIDDEN';
  /** Heights the leg gives (one value for a leg without a printed adjustment). */
  heightMm: { minMm: number; maxMm: number };
  /** Plan of the leg: a round or square foot of this size. */
  footprint: { shape: 'ROUND' | 'SQUARE'; sizeMm: number };
  finish: FittingFinish;
  price?: CatalogPrice;
  /** The 3D model (MOD-DEC-536); none — the parametric one. */
  model3d?: Model3d | null;
  ref?: CatalogRef | null;
}

/** A handle (ручка): BAR — скоба on two screws `centresMm` apart; KNOB — кнопка on one screw. */
export interface Handle {
  id: string;
  brand: string;
  article: string;
  name: string;
  kind: 'BAR' | 'KNOB';
  centresMm: number | null;
  /** Visual size: length along the bar, projection from the front, thickness of the bar. */
  sizeMm: { lengthMm: number; heightMm: number; thicknessMm: number };
  finish: FittingFinish;
  massKg: Known<number>;
  price?: CatalogPrice;
  /** The 3D model (MOD-DEC-536); none — the parametric one. */
  model3d?: Model3d | null;
  ref?: CatalogRef | null;
}

/** The clip that holds a decorative plinth on a leg (MOD-DEC-483): `perLeg` on each leg of the front row. */
export interface PlinthClip {
  id: string;
  brand: string;
  article: string;
  name: string;
  perLeg: number;
  price?: CatalogPrice;
}

/** A push latch of a door opened by pressing (MOD-DEC-483): one at the free edge; its hole is the manufacturer's (277). */
export interface PushLatch {
  id: string;
  brand: string;
  article: string;
  name: string;
  /**
   * The hole of the latch in the front edge of a carcass panel, in the middle of its thickness (BOYARD 2024, p. 103;
   * the kit .fr3d, MOD-DEC-277); `frontGapMm` — the gap between that edge and the closed door the latch works across.
   */
  hole: Known<{ diameterMm: number; depthMm: number; frontGapMm: number }>;
  price?: CatalogPrice;
  /** The 3D model (MOD-DEC-536); none — the parametric one. */
  model3d?: Model3d | null;
}

/**
 * A light of a section (MOD-DEC-483): a surface-mounted profile with its LED of a sold length, switched on by the door
 * opening. The section is visual (MOD-DEC-348, 432): the price lists do not print it.
 */
export interface CabinetLight {
  id: string;
  brand: string;
  article: string;
  name: string;
  lengthMm: number;
  powerW: number;
  voltageV: number;
  colourTemperatureK: number;
  sectionMm: { widthMm: number; heightMm: number };
  finish: FittingFinish;
  price?: CatalogPrice;
  /** The 3D model (MOD-DEC-536); none — the parametric one. */
  model3d?: Model3d | null;
}

/** The power supply of the lights (MOD-DEC-483): one per wardrobe, by the sum of the powers. */
export interface PowerSupply {
  id: string;
  brand: string;
  article: string;
  name: string;
  powerW: number;
  voltageV: number;
  sizeMm: { lengthMm: number; widthMm: number; heightMm: number };
  price?: CatalogPrice;
  /** The 3D model (MOD-DEC-536); none — the parametric one. */
  model3d?: Model3d | null;
}

/**
 * What a section stores (MOD-DEC-484): a basket for linen or for shoes and a trouser rack — pull-outs on full-extension
 * runners in their own frame, as an inner drawer — and a pantograph, a rod lowered by its lever.
 */
export type StorageKind = 'LINEN_BASKET' | 'SHOE_BASKET' | 'TROUSER_RACK' | 'PANTOGRAPH';

/** The colour of a storage item as it is sold: the one choice of the wardrobe (484); GREY_METALLIC — of a pantograph only. */
export type StorageColour = 'WHITE' | 'GRAPHITE' | 'BLACK' | 'GREY_METALLIC';

const STORAGE_KINDS: readonly StorageKind[] = ['LINEN_BASKET', 'SHOE_BASKET', 'TROUSER_RACK', 'PANTOGRAPH'];
const STORAGE_COLOURS: readonly StorageColour[] = ['WHITE', 'GRAPHITE', 'BLACK', 'GREY_METALLIC'];

/** One colour of a storage item: its own article and price. */
export interface StorageVariant {
  colour: StorageColour;
  article: string;
  name: string;
  price?: CatalogPrice;
  /** The 3D model of this colour (MOD-DEC-536); none — the parametric one. */
  model3d?: Model3d | null;
}

/**
 * A storage item of a section (MOD-DEC-484), sizes of its kit of BAZIS (the frame «Ш × В × Г» and the marking Ø3 × 1 of
 * its screws): SIDES — the frame stands between the panels at the sides of the section, its width telescopes over
 * `clearWidthMm`; TOP — screwed under the panel above (the trouser rack of a shelf, BETR35), `clearWidthMm.minMm` is its
 * own width. The heights are those of the opening it needs (the «MIN» of the kit), from the bottom of the frame.
 */
export interface StorageItem {
  id: string;
  brand: string;
  series: string;
  kind: StorageKind;
  mounting: 'SIDES' | 'TOP';
  clearWidthMm: { minMm: number; maxMm: number };
  heightMm: number;
  /** Depth of the frame from its front; null — the kit does not give it (a pantograph: the section's depth). */
  depthMm: number | null;
  /** Height of the axis of the runners (of the pivot of a pantograph) over the bottom of the frame; TOP — the frame's height. */
  axisFromBottomMm: number;
  /** The screws of each side by the marking of the kit: back from the front of the frame, and up from the axis (TOP — across from the middle). */
  marks: { fromFrontMm: number; offsetMm: number }[];
  loadKg: Known<number>;
  variants: StorageVariant[];
  /**
   * The 3D model of the item, of every colour (MOD-DEC-536, FINDINGS 1084): the meshes of its kit of BAZIS; the client
   * draws it in the colour chosen. A model of a variant, when given, is that colour's own.
   */
  model3d?: Model3d | null;
  ref?: CatalogRef | null;
}

/**
 * A profile or a guide of a sliding system (ARISTO Standard, ЭКО, Slim Line) for its 3D (FINDINGS 916, 1083): the
 * overall size of its section on the drawing of the catalogue. `faceMm` — the visible size across the length (the width
 * of a vertical profile, the height of a frame or a guide); `depthMm` — across the plane of the doors. A guide whose
 * width the depth of the system is computed from has `depthMm` null and names that constant of the policy in
 * `depthMmFrom` («wardrobe-sliding.<constant>»): one number, not a second copy. The prices and the cutting of the
 * profiles stay in the policies of the sliding doors.
 */
export interface SlidingProfile {
  id: string;
  brand: string;
  article: string;
  name: string;
  sectionMm: { faceMm: number; depthMm: number | null };
  depthMmFrom?: string | null;
  finish: FittingFinish;
  /** The 3D model (MOD-DEC-536); none — the prism of the section. */
  model3d?: Model3d | null;
  ref?: CatalogRef | null;
}

export interface FittingsCatalog {
  version: string;
  rods: RodSeries[];
  legs: Leg[];
  handles: Handle[];
  plinthClips: PlinthClip[];
  pushLatches: PushLatch[];
  lights: CabinetLight[];
  powerSupplies: PowerSupply[];
  /** Baskets, trouser racks and pantographs (MOD-DEC-484). */
  storage: StorageItem[];
  /** Profiles and guides of the sliding doors, for 3D (FINDINGS 1083). */
  slidingProfiles: SlidingProfile[];
  documents: CatalogDocument[];
}

/** Only what the engine needs (MOD-DEC-349): ids, positive sizes, lengths of a series, a price of the format of 536. */
export function fittingsCatalogProblems(c: FittingsCatalog): string[] {
  const { ref, known, model, problems: out } = refChecker(c.documents);
  const positive = (where: string, v: unknown) => {
    if (!(typeof v === 'number' && v > 0)) out.push(`${where}: нужно положительное число`);
  };
  const price = (where: string, p: CatalogPrice | undefined) => out.push(...(p ? catalogPriceProblems(where, p) : [`${where}: нет цены`]));
  const finish = (where: string, f: string) => {
    if (!FINISHES.includes(f as FittingFinish)) out.push(`${where}: неизвестная отделка ${f}`);
  };
  const ids = [...c.rods, ...c.legs, ...c.handles, ...c.plinthClips, ...c.pushLatches, ...c.lights, ...c.powerSupplies, ...c.storage, ...c.slidingProfiles].map((x) => x.id);
  if (new Set(ids).size !== ids.length) out.push('повтор id позиции');
  for (const r of c.rods) {
    if (!['OVAL', 'ROUND', 'RECT'].includes(r.profile)) out.push(`${r.id}: неизвестный профиль ${r.profile}`);
    positive(`${r.id}.sectionMm.widthMm`, r.sectionMm.widthMm);
    positive(`${r.id}.sectionMm.heightMm`, r.sectionMm.heightMm);
    finish(r.id, r.finish);
    if (!r.stock.length) out.push(`${r.id}: нет длины продажи`);
    for (const s of r.stock) {
      if (!s.article.trim()) out.push(`${r.id}: пустой артикул длины`);
      positive(`${r.id}.${s.article}.lengthMm`, s.lengthMm);
      price(`${r.id}.${s.article}`, s.price);
    }
    const h = r.holder;
    if (!h.article.trim()) out.push(`${r.id}: у держателя нет артикула`);
    if (!(Number.isInteger(h.perRod) && h.perRod >= 2)) out.push(`${r.id}: держателей на штангу — целое не меньше 2`);
    for (const [k, v] of Object.entries(h.sizeMm)) positive(`${r.id}.holder.sizeMm.${k}`, v);
    if (!(h.endGapMm >= 0)) out.push(`${r.id}.holder.endGapMm: нужно неотрицательное число`);
    finish(`${r.id}.holder`, h.finish);
    price(`${r.id}.holder`, h.price);
    model(`${r.id}.holder`, h.model3d);
    model(r.id, r.model3d);
    ref(r.id, r.ref);
  }
  for (const l of c.legs) {
    if (!['VISIBLE', 'HIDDEN'].includes(l.use)) out.push(`${l.id}: неизвестное назначение ${l.use}`);
    positive(`${l.id}.heightMm.minMm`, l.heightMm.minMm);
    if (!(l.heightMm.maxMm >= l.heightMm.minMm)) out.push(`${l.id}.heightMm: диапазон по возрастанию`);
    if (!['ROUND', 'SQUARE'].includes(l.footprint.shape)) out.push(`${l.id}: неизвестная форма опоры ${l.footprint.shape}`);
    positive(`${l.id}.footprint.sizeMm`, l.footprint.sizeMm);
    finish(l.id, l.finish);
    price(l.id, l.price);
    model(l.id, l.model3d);
    ref(l.id, l.ref);
  }
  for (const h of c.handles) {
    if (!['BAR', 'KNOB'].includes(h.kind)) out.push(`${h.id}: неизвестный вид ${h.kind}`);
    if (h.kind === 'BAR') positive(`${h.id}.centresMm`, h.centresMm);
    for (const [k, v] of Object.entries(h.sizeMm)) positive(`${h.id}.sizeMm.${k}`, v);
    finish(h.id, h.finish);
    known(`${h.id}.massKg`, h.massKg);
    price(h.id, h.price);
    model(h.id, h.model3d);
    ref(h.id, h.ref);
  }
  for (const x of c.plinthClips) {
    if (!(Number.isInteger(x.perLeg) && x.perLeg >= 1)) out.push(`${x.id}.perLeg: целое не меньше 1`);
    price(x.id, x.price);
  }
  for (const x of c.pushLatches) {
    known(`${x.id}.hole`, x.hole);
    price(x.id, x.price);
    model(x.id, x.model3d);
  }
  for (const x of c.lights) {
    for (const k of ['lengthMm', 'powerW', 'voltageV', 'colourTemperatureK'] as const) positive(`${x.id}.${k}`, x[k]);
    for (const [k, v] of Object.entries(x.sectionMm)) positive(`${x.id}.sectionMm.${k}`, v);
    finish(x.id, x.finish);
    price(x.id, x.price);
    model(x.id, x.model3d);
  }
  if (new Set(c.lights.map((x) => x.lengthMm)).size !== c.lights.length) out.push('повтор длины светильника');
  for (const x of c.powerSupplies) {
    for (const k of ['powerW', 'voltageV'] as const) positive(`${x.id}.${k}`, x[k]);
    for (const [k, v] of Object.entries(x.sizeMm)) positive(`${x.id}.sizeMm.${k}`, v);
    price(x.id, x.price);
    model(x.id, x.model3d);
  }
  if (c.lights.some((l) => !c.powerSupplies.some((p) => p.voltageV === l.voltageV))) out.push('у светильника нет блока питания его напряжения');
  for (const x of c.storage) {
    if (!STORAGE_KINDS.includes(x.kind)) out.push(`${x.id}: неизвестный вид ${x.kind}`);
    if (!['SIDES', 'TOP'].includes(x.mounting)) out.push(`${x.id}: неизвестное крепление ${x.mounting}`);
    positive(`${x.id}.clearWidthMm.minMm`, x.clearWidthMm.minMm);
    if (!(x.clearWidthMm.maxMm >= x.clearWidthMm.minMm)) out.push(`${x.id}.clearWidthMm: диапазон по возрастанию`);
    positive(`${x.id}.heightMm`, x.heightMm);
    if (x.depthMm !== null) positive(`${x.id}.depthMm`, x.depthMm);
    if (!(x.axisFromBottomMm >= 0 && x.axisFromBottomMm <= x.heightMm)) out.push(`${x.id}.axisFromBottomMm: ось в пределах высоты рамы`);
    if (!x.marks.length) out.push(`${x.id}: нет разметки крепления`);
    known(`${x.id}.loadKg`, x.loadKg);
    if (!x.variants.length) out.push(`${x.id}: нет ни одного цвета`);
    if (new Set(x.variants.map((v) => v.colour)).size !== x.variants.length) out.push(`${x.id}: повтор цвета`);
    for (const v of x.variants) {
      if (!STORAGE_COLOURS.includes(v.colour)) out.push(`${x.id}: неизвестный цвет ${v.colour}`);
      if (!v.article.trim()) out.push(`${x.id}.${v.colour}: пустой артикул`);
      price(`${x.id}.${v.article}`, v.price);
      model(`${x.id}.${v.article}`, v.model3d);
    }
    model(x.id, x.model3d);
    ref(x.id, x.ref);
  }
  for (const x of c.slidingProfiles) {
    if (!x.article.trim()) out.push(`${x.id}: пустой артикул`);
    positive(`${x.id}.sectionMm.faceMm`, x.sectionMm.faceMm);
    if (x.sectionMm.depthMm === null) {
      if (!x.depthMmFrom) out.push(`${x.id}.sectionMm.depthMm: нет ни числа, ни depthMmFrom`);
    } else {
      positive(`${x.id}.sectionMm.depthMm`, x.sectionMm.depthMm);
      if (x.depthMmFrom) out.push(`${x.id}: глубина задана и числом, и depthMmFrom`);
    }
    finish(x.id, x.finish);
    model(x.id, x.model3d);
    ref(x.id, x.ref);
  }
  if (new Set(c.slidingProfiles.map((x) => x.article)).size !== c.slidingProfiles.length) out.push('повтор артикула профиля купе');
  return out;
}
