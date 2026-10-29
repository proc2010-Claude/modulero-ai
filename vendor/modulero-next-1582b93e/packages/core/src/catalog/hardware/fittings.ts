// Fittings of the wardrobe (task FIT, MOD-DEC-480): the clothes rods with their holders, the legs and the handles.
// Until FIT the rod was a placeholder without a model (MOD-DEC-233), the legs had no model and the handles were not on
// the graph; the owner asked to choose and bring them in (2026-10-24). One record is one product of the price lists of
// the owner's catalogue: the order code, the dimensions the engine and the 3D view need and the price. A price is a
// guide (MOD-DEC-346): the average of the suppliers' guides rounded up to 10 ₽ (264); a number without a source is the
// owner's or the executor's (MOD-DEC-348) — the sizes of a handle or a holder are visual (MOD-DEC-158, 432). The data lie
// in catalogs/hardware/fittings.json, outside the core (CAT-1).
import { catalogPriceProblems, type CatalogPrice } from './prices.js';
import type { HardwareTier } from './shelf-supports.js';
import { refChecker, type CatalogDocument, type CatalogRef, type Known, type Model3d } from './types.js';

/** What a purchased item is drawn with in 3D: metal, black, white or graphite (the visual layer of MOD-DEC-432, 484). */
export type FittingFinish = 'METAL' | 'BLACK' | 'WHITE' | 'GRAPHITE';

const FINISHES: readonly FittingFinish[] = ['METAL', 'BLACK', 'WHITE', 'GRAPHITE'];
const LIGHT_MOUNTINGS: readonly LightMounting[] = ['SURFACE', 'RECESSED'];
const LIGHT_SWITCHINGS: readonly LightSwitching[] = ['HAND', 'DOOR', 'MOTION', 'TOUCH'];
const LIGHT_CONNECTORS: readonly LightConnector[] = ['L822', 'L813'];
const LOCK_USES: readonly LockUse[] = ['DOOR', 'DRAWER'];
const LOCK_KEYS: readonly LockKey[] = ['KEY', 'CODE', 'ELECTRONIC'];

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

/**
 * A handle (ручка, MOD-AI-76): BAR — скоба on two screws `centresMm` apart; KNOB — кнопка on one screw; EDGE — торцевая,
 * laid on the edge of the front; PROFILE — профиль, sold in a length `stockLengthMm` and cut to the front (the whole
 * height of a door). The wardrobe and the furniture of r5 place only a bar or a knob with its screws (faceHandles).
 */
export interface Handle {
  id: string;
  brand: string;
  article: string;
  name: string;
  kind: HandleKind;
  centresMm: number | null;
  /** Visual size: length along the bar, projection from the front, thickness of the bar. */
  sizeMm: { lengthMm: number; heightMm: number; thicknessMm: number };
  /** PROFILE: the sold length its price is for; none for the other kinds. */
  stockLengthMm?: number;
  /** The style of the catalogue (its section and the description of the model). */
  style: Known<HandleStyle>;
  /** The level of the choice (the price band of FINDINGS 2756); the selection offers several handles of each. */
  tier: HardwareTier;
  /** THROUGH_SCREWS — screwed through the front from inside; EDGE_OVERLAY — laid on the edge of the front. */
  mounting: Known<HandleMounting>;
  /** The screws come with the handle; false — they are bought apart, by the thickness of the front. */
  screwsIncluded: Known<boolean>;
  /**
   * EDGE and PROFILE only (FINDINGS 2762): the section of a handle laid on the edge of the front. `edgeGroove` — the
   * groove milled along the edge for the tongue of the handle (none — no groove); `edgeRiseMm` — how far it stands above
   * the edge, in the plane of the front (the front is cut shorter by it); `edgeDepthMm` — its whole depth across the
   * edge, from the back of its leg to its tip; `edgeBackMm` — its leg (or wall) on the back face of the front;
   * `edgeDropMm` — how far its tip comes down in front of the face, from the top of the handle. `sizeMm` keeps the L, H
   * and D of the catalogue table, whose H and D differ from model to model.
   */
  edgeGroove?: Known<{ widthMm: number; depthMm: number }>;
  edgeRiseMm?: Known<number>;
  edgeDepthMm?: Known<number>;
  edgeBackMm?: Known<number>;
  edgeDropMm?: Known<number>;
  finish: FittingFinish;
  massKg: Known<number>;
  price?: CatalogPrice;
  /** The 3D model (MOD-DEC-536); none — the parametric one. */
  model3d?: Model3d | null;
  ref?: CatalogRef | null;
}

export type HandleKind = 'BAR' | 'KNOB' | 'EDGE' | 'PROFILE';
export type HandleStyle = 'MODERN' | 'CLASSIC' | 'MINIMAL' | 'LOFT';
export type HandleMounting = 'THROUGH_SCREWS' | 'EDGE_OVERLAY';

const HANDLE_KINDS: readonly HandleKind[] = ['BAR', 'KNOB', 'EDGE', 'PROFILE'];
const HANDLE_STYLES: readonly HandleStyle[] = ['MODERN', 'CLASSIC', 'MINIMAL', 'LOFT'];
const HANDLE_MOUNTINGS: readonly HandleMounting[] = ['THROUGH_SCREWS', 'EDGE_OVERLAY'];
const TIERS: readonly HardwareTier[] = ['ECONOMY', 'STANDARD', 'PREMIUM'];

/**
 * The handles the wardrobe and the furniture of r5 place and price (MOD-DEC-480, 513): a bar or a knob on the face of
 * the front with its screws in the box — their price counts no screws and their placement knows no edge or profile.
 */
export function faceHandles(c: Pick<FittingsCatalog, 'handles'>): Handle[] {
  return c.handles.filter((h) => (h.kind === 'BAR' || h.kind === 'KNOB') && h.screwsIncluded.value === true);
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
 * A light of a section (MOD-DEC-483): a profile with its LED of a sold length and its own switch (`switching`). The
 * section is visual (MOD-DEC-348, 432); of a recessed light — the part seen below the panel.
 */
export interface CabinetLight {
  id: string;
  brand: string;
  article: string;
  name: string;
  /** The lengths of one profile (FINDINGS 2766); the wardrobe takes those of `defaultLightSeries` of the catalogue. */
  series: string;
  /** The level of the choice of the other furniture (MOD-AI-37, FINDINGS 2766). */
  tier: HardwareTier;
  /** SURFACE — screwed under the panel; RECESSED — set into a groove of the panel (`groove`). */
  mounting: LightMounting;
  lengthMm: number;
  powerW: number;
  voltageV: number;
  colourTemperatureK: number;
  sectionMm: { widthMm: number; heightMm: number };
  /** The groove of a recessed light in the panel: across, into the panel and along it; only of a recessed one. */
  groove?: Known<{ widthMm: number; depthMm: number; lengthMm: number }>;
  finish: FittingFinish;
  /** How it is switched on, as its leaflet prints it (FINDINGS 3420). */
  switching: Known<LightSwitching>;
  /** The plug of its cable: a distributor of the same connector feeds it from the power supply (FINDINGS 3422). */
  connector: Known<LightConnector>;
  /** The power supply carries the lights with this reserve over their sum, %, as the maker requires (FINDINGS 3421). */
  supplyReservePct: Known<number>;
  price?: CatalogPrice;
  /** The 3D model (MOD-DEC-536); none — the parametric one. */
  model3d?: Model3d | null;
  ref?: CatalogRef | null;
}

export type LightMounting = 'SURFACE' | 'RECESSED';

/**
 * HAND — an IR switch on the light worked by a wave of the hand; DOOR — an IR sensor of the door; MOTION — a PIR motion
 * sensor; TOUCH — a touch switch on the light.
 */
export type LightSwitching = 'HAND' | 'DOOR' | 'MOTION' | 'TOUCH';

/** The connectors of the MAKMART lights: the plug L822M or L813 of the cable. */
export type LightConnector = 'L822' | 'L813';

/**
 * A distributor of the lights (FINDINGS 3422): a block with `ports` sockets of one connector and the cable to the
 * terminals of the power supply; `currentA` — the most it carries. The lights of a supply are plugged into it.
 */
export interface LightDistributor {
  id: string;
  brand: string;
  article: string;
  name: string;
  connector: LightConnector;
  ports: number;
  currentA: number;
  price?: CatalogPrice;
  ref?: CatalogRef | null;
}

/**
 * A caster (колёсная опора) of the other furniture (MOD-AI-73, FINDINGS 2767): a swivel wheel on a plate screwed under
 * the bottom. `footprint` — the plan of the plate, as of a leg; `heightMm` — from the floor to the plate, a range if
 * it is adjusted. How many and which with a brake — the rule of the other furniture.
 */
export interface Caster {
  id: string;
  brand: string;
  article: string;
  name: string;
  tier: HardwareTier;
  wheelDiameterMm: number;
  heightMm: number | { minMm: number; maxMm: number };
  brake: boolean;
  footprint: { shape: 'ROUND' | 'SQUARE'; sizeMm: number };
  /** The screws of the plate: `spacingMm` — the side of their square, of a round plate the diameter of their circle. */
  mount: Known<{ kind: 'PLATE'; holes: { count: number; diameterMm: number; spacingMm: number } } | { kind: 'STEM'; thread: 'M8' | 'M10' }>;
  /** The load of one caster as the maker prints it, kg. */
  loadKg: Known<number>;
  finish: FittingFinish;
  price?: CatalogPrice;
  /** The 3D model (MOD-DEC-536); none — the parametric one. */
  model3d?: Model3d | null;
  ref?: CatalogRef | null;
}

/** How a lock is opened: a key, a code, an electronic card or bracelet. */
export type LockKey = 'KEY' | 'CODE' | 'ELECTRONIC';

/**
 * A lock of a door or a drawer of the other furniture (MOD-AI-73, FINDINGS 2768): its body on the inner face of the
 * front, the bolt or tongue behind the carcass panel into the strike screwed to it. `hole` — through the front for the
 * cylinder, the knob or the cable of the reader (`depthMm` null — through), NONE — a concealed lock without one;
 * `fromCarcassMm` — from the inner face of that carcass panel to the axis of the hole (from the edge of the front —
 * plus its overlay).
 */
export interface CabinetLock {
  id: string;
  brand: string;
  article: string;
  name: string;
  tier: HardwareTier;
  use: LockUse[];
  key: LockKey;
  hole: Known<
    | { shape: 'ROUND'; diameterMm: number; depthMm: number | null }
    | { shape: 'RECT'; widthMm: number; heightMm: number; depthMm: number | null }
    | { shape: 'NONE' }
  >;
  fromCarcassMm: Known<number>;
  facadeMaxThicknessMm: Known<number>;
  /** The body on the front, for 3D: across, along the edge and off the face. */
  bodyMm: Known<{ widthMm: number; heightMm: number; depthMm: number }>;
  /** The strike on the carcass panel: across, along the edge and its leg. */
  strike: Known<{ widthMm: number; heightMm: number; depthMm: number }>;
  finish: FittingFinish;
  price?: CatalogPrice;
  /** The 3D model (MOD-DEC-536); none — the parametric one. */
  model3d?: Model3d | null;
  ref?: CatalogRef | null;
}

export type LockUse = 'DOOR' | 'DRAWER';

/** The power supply of the lights (MOD-DEC-483): one per wardrobe, by the sum of the powers. */
export interface PowerSupply {
  id: string;
  brand: string;
  article: string;
  name: string;
  powerW: number;
  voltageV: number;
  sizeMm: { lengthMm: number; widthMm: number; heightMm: number };
  /**
   * The lights take this much less than its power, %, as its maker requires (FINDINGS 3424): they draw at most
   * `powerW × (1 − loadReservePct / 100)`; null — the maker does not say.
   */
  loadReservePct: Known<number>;
  /** It comes with its mains cord; false — the cord of `mainsCords` is bought for it (FINDINGS 3425). */
  mainsCordIncluded: Known<boolean>;
  price?: CatalogPrice;
  /** The 3D model (MOD-DEC-536); none — the parametric one. */
  model3d?: Model3d | null;
}

/** A mains cord of a power supply with its plug (FINDINGS 3425): the supply has terminals at its input. */
export interface MainsCord {
  id: string;
  brand: string;
  article: string;
  name: string;
  lengthMm: number;
  price?: CatalogPrice;
  ref?: CatalogRef | null;
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

/** How a hanger is fixed to the side: PINS — штоки pressed into holes; INSERTS — screws into футорки; SCREWS — шурупы. */
export type HangerFixing = 'PINS' | 'INSERTS' | 'SCREWS';

const HANGER_FIXINGS: readonly HangerFixing[] = ['PINS', 'INSERTS', 'SCREWS'];

/** A purchased part of a hanger set: the hanger itself (L, R, or the kit L+R), its plate or rail on the wall. */
export interface HangerPart {
  brand: string;
  article: string;
  name: string;
  variant: 'L' | 'R' | 'L+R';
  /** Pieces per cabinet; of a rail — none (it is cut from stock, `Hanger.wall`). */
  perCabinet: number;
  price?: CatalogPrice;
}

/**
 * A hole of one hanger in the inner face of its side, as the BAZIS kit places it (FINDINGS 2751, 2752): down from the
 * underside of the top and forward from the front face of the back. `marking` — a mark Ø3 × 1 for a screw (the layer
 * «разметка» of the kit), not a drilled hole.
 */
export interface HangerHole {
  diameterMm: number;
  depthMm: number;
  fromTopMm: number;
  fromBackMm: number;
  marking: boolean;
}

/**
 * A hanger of a wall cabinet (навес; group 4 of the hardware of the release, FINDINGS 2750): a left and a right one at
 * the upper rear corners of the carcass, on the inner faces of the sides, hooked over a plate or a rail on the wall.
 * The holes in the sides and the place of the back are those of the BAZIS kit of the maker (MOD-DEC-277); what the
 * source does not give is UNKNOWN and goes to the bell. Each level of the hardware has its hanger (MOD-DEC-413, the
 * policy hanger-selection.ts); the prototype's Hettich SAH 216 is not here — the saved projects keep it.
 */
export interface Hanger {
  id: string;
  brand: string;
  series: string;
  name: string;
  tier: HardwareTier;
  fixing: HangerFixing;
  /** The load of the pair as the maker prints it, kg. */
  loadKgPerPair: Known<number>;
  /** Least thickness of the side, mm. */
  sideThicknessMinMm: Known<number>;
  /** The holes of the left hanger in its side; the right one is its mirror. */
  sideHoles: Known<HangerHole[]>;
  /** From the rear edges of the sides (the wall) to the front face of the back: the room of the hanger behind it, mm. */
  backSetbackMm: Known<number>;
  /**
   * Cut-out through the back at each upper corner for the hanger: across from the inner face of the side and down from
   * the underside of the top; value null — none.
   */
  backCutout: Known<{ widthMm: number; heightMm: number } | null>;
  /** Adjustment of the hung cabinet as printed: up and towards the wall, mm. */
  adjustmentMm: Known<{ heightMm: number; depthMm: number }>;
  /** The hangers of one cabinet: a kit L+R, or a left and a right one (covers sold apart are not taken). */
  parts: HangerPart[];
  /**
   * What the hangers hook over on the wall: a plate for each hanger, or a rail cut over the cabinet between its sides
   * from stock of `stockLengthMm`. The screws in the wall are chosen by its material and are not in the set.
   */
  wall: { kind: 'PLATE'; part: HangerPart } | { kind: 'RAIL'; stockLengthMm: number; part: HangerPart };
  /** The 3D model (MOD-DEC-536); none — the parametric one. */
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
  /** The series of the lights of the wardrobe (MOD-DEC-483); the others are of the other furniture (FINDINGS 2766). */
  defaultLightSeries: string;
  powerSupplies: PowerSupply[];
  /** The distributors between a power supply and the lights (FINDINGS 3422). */
  lightDistributors: LightDistributor[];
  /** The mains cords of the power supplies sold without one (FINDINGS 3425). */
  mainsCords: MainsCord[];
  /** Baskets, trouser racks and pantographs (MOD-DEC-484). */
  storage: StorageItem[];
  /** Profiles and guides of the sliding doors, for 3D (FINDINGS 1083). */
  slidingProfiles: SlidingProfile[];
  /** Hangers of the wall cabinets of the kitchen, one or more of each level (FINDINGS 2750). */
  hangers: Hanger[];
  /** Casters and locks of the other furniture, several of each level (MOD-AI-73, FINDINGS 2767, 2768). */
  casters: Caster[];
  locks: CabinetLock[];
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
  const ids = [...c.rods, ...c.legs, ...c.handles, ...c.plinthClips, ...c.pushLatches, ...c.lights, ...c.powerSupplies, ...c.lightDistributors, ...c.mainsCords, ...c.storage, ...c.slidingProfiles, ...c.hangers, ...c.casters, ...c.locks].map((x) => x.id);
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
    if (!HANDLE_KINDS.includes(h.kind)) out.push(`${h.id}: неизвестный вид ${h.kind}`);
    if (h.kind === 'BAR') positive(`${h.id}.centresMm`, h.centresMm);
    if (h.kind === 'PROFILE') positive(`${h.id}.stockLengthMm`, h.stockLengthMm);
    else if (h.stockLengthMm !== undefined) out.push(`${h.id}.stockLengthMm: длина продажи — только у профиля`);
    if (!TIERS.includes(h.tier)) out.push(`${h.id}: неизвестный уровень ${h.tier}`);
    known(`${h.id}.style`, h.style);
    if (h.style.value !== null && !HANDLE_STYLES.includes(h.style.value)) out.push(`${h.id}: неизвестный стиль ${h.style.value}`);
    known(`${h.id}.mounting`, h.mounting);
    if (h.mounting.value !== null && !HANDLE_MOUNTINGS.includes(h.mounting.value)) out.push(`${h.id}: неизвестное крепление ${h.mounting.value}`);
    known(`${h.id}.screwsIncluded`, h.screwsIncluded);
    if (h.screwsIncluded.value !== null && typeof h.screwsIncluded.value !== 'boolean') out.push(`${h.id}.screwsIncluded: да или нет`);
    const edge = h.kind === 'EDGE' || h.kind === 'PROFILE';
    if (h.edgeGroove) {
      if (!edge) out.push(`${h.id}.edgeGroove: паз по торцу — только у торцевой ручки и профиля`);
      known(`${h.id}.edgeGroove`, h.edgeGroove);
      if (h.edgeGroove.value) for (const k of ['widthMm', 'depthMm'] as const) positive(`${h.id}.edgeGroove.${k}`, h.edgeGroove.value[k]);
    }
    for (const k of ['edgeRiseMm', 'edgeDepthMm', 'edgeBackMm', 'edgeDropMm'] as const) {
      const v = h[k];
      if (!v) continue;
      if (!edge) out.push(`${h.id}.${k}: сечение на торце — только у торцевой ручки и профиля`);
      known(`${h.id}.${k}`, v);
      if (v.value !== null) positive(`${h.id}.${k}`, v.value);
    }
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
    if (!x.series.trim()) out.push(`${x.id}: пустая серия`);
    if (!TIERS.includes(x.tier)) out.push(`${x.id}: неизвестный уровень ${x.tier}`);
    if (!LIGHT_MOUNTINGS.includes(x.mounting)) out.push(`${x.id}: неизвестная установка ${x.mounting}`);
    for (const k of ['lengthMm', 'powerW', 'voltageV', 'colourTemperatureK'] as const) positive(`${x.id}.${k}`, x[k]);
    for (const [k, v] of Object.entries(x.sectionMm)) positive(`${x.id}.sectionMm.${k}`, v);
    if (x.mounting === 'RECESSED' && !x.groove) out.push(`${x.id}: у врезного светильника нет паза`);
    if (x.groove) {
      if (x.mounting !== 'RECESSED') out.push(`${x.id}.groove: паз — только у врезного светильника`);
      known(`${x.id}.groove`, x.groove);
      if (x.groove.value) for (const k of ['widthMm', 'depthMm', 'lengthMm'] as const) positive(`${x.id}.groove.${k}`, x.groove.value[k]);
    }
    finish(x.id, x.finish);
    known(`${x.id}.switching`, x.switching);
    if (x.switching.value !== null && !LIGHT_SWITCHINGS.includes(x.switching.value)) out.push(`${x.id}: неизвестное включение ${x.switching.value}`);
    known(`${x.id}.connector`, x.connector);
    if (x.connector.value !== null && !LIGHT_CONNECTORS.includes(x.connector.value)) out.push(`${x.id}: неизвестный разъём ${x.connector.value}`);
    known(`${x.id}.supplyReservePct`, x.supplyReservePct);
    if (x.supplyReservePct.value !== null && !(x.supplyReservePct.value >= 0)) out.push(`${x.id}.supplyReservePct: нужно неотрицательное число`);
    price(x.id, x.price);
    model(x.id, x.model3d);
    ref(x.id, x.ref);
  }
  for (const s of new Set(c.lights.map((x) => x.series))) {
    const own = c.lights.filter((x) => x.series === s);
    if (new Set(own.map((x) => x.lengthMm)).size !== own.length) out.push(`${s}: повтор длины светильника`);
  }
  if (!c.lights.some((x) => x.series === c.defaultLightSeries)) out.push(`нет светильников серии шкафа ${c.defaultLightSeries}`);
  for (const x of c.powerSupplies) {
    for (const k of ['powerW', 'voltageV'] as const) positive(`${x.id}.${k}`, x[k]);
    for (const [k, v] of Object.entries(x.sizeMm)) positive(`${x.id}.sizeMm.${k}`, v);
    known(`${x.id}.loadReservePct`, x.loadReservePct);
    if (x.loadReservePct.value !== null && !(x.loadReservePct.value >= 0 && x.loadReservePct.value < 100)) out.push(`${x.id}.loadReservePct: от 0 до 100`);
    known(`${x.id}.mainsCordIncluded`, x.mainsCordIncluded);
    if (x.mainsCordIncluded.value !== null && typeof x.mainsCordIncluded.value !== 'boolean') out.push(`${x.id}.mainsCordIncluded: да или нет`);
    price(x.id, x.price);
    model(x.id, x.model3d);
  }
  for (const x of c.mainsCords) {
    positive(`${x.id}.lengthMm`, x.lengthMm);
    price(x.id, x.price);
    ref(x.id, x.ref);
  }
  if (c.powerSupplies.some((p) => p.mainsCordIncluded.value === false) && !c.mainsCords.length) out.push('у блока питания без сетевого шнура нет шнура в каталоге');
  if (c.lights.some((l) => !c.powerSupplies.some((p) => p.voltageV === l.voltageV))) out.push('у светильника нет блока питания его напряжения');
  for (const x of c.lightDistributors) {
    if (!LIGHT_CONNECTORS.includes(x.connector)) out.push(`${x.id}: неизвестный разъём ${x.connector}`);
    if (!(Number.isInteger(x.ports) && x.ports >= 1)) out.push(`${x.id}.ports: целое не меньше 1`);
    positive(`${x.id}.currentA`, x.currentA);
    price(x.id, x.price);
    ref(x.id, x.ref);
  }
  const lit = c.lights.filter((l) => l.series === c.defaultLightSeries);
  if (lit.some((l) => l.connector.value === null || !c.lightDistributors.some((d) => d.connector === l.connector.value))) out.push(`у светильника серии шкафа ${c.defaultLightSeries} нет распределителя его разъёма`);
  if (lit.some((l) => l.supplyReservePct.value === null)) out.push(`у светильника серии шкафа ${c.defaultLightSeries} нет запаса мощности блока питания`);
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
  const part = (where: string, p: HangerPart, rail = false) => {
    if (!p.article.trim()) out.push(`${where}: пустой артикул`);
    if (!['L', 'R', 'L+R'].includes(p.variant)) out.push(`${where}: неизвестное исполнение ${p.variant}`);
    if (!rail && !(Number.isInteger(p.perCabinet) && p.perCabinet >= 1)) out.push(`${where}.perCabinet: целое не меньше 1`);
    price(`${where}.${p.article}`, p.price);
  };
  for (const x of c.hangers) {
    if (!['ECONOMY', 'STANDARD', 'PREMIUM'].includes(x.tier)) out.push(`${x.id}: неизвестный уровень ${x.tier}`);
    if (!HANGER_FIXINGS.includes(x.fixing)) out.push(`${x.id}: неизвестное крепление ${x.fixing}`);
    for (const k of ['loadKgPerPair', 'sideThicknessMinMm', 'sideHoles', 'backSetbackMm', 'backCutout', 'adjustmentMm'] as const) known(`${x.id}.${k}`, x[k] as Known<unknown>);
    if (x.loadKgPerPair.value !== null) positive(`${x.id}.loadKgPerPair`, x.loadKgPerPair.value);
    const h = x.sideHoles.value;
    if (h) {
      if (!h.length) out.push(`${x.id}.sideHoles: нет отверстий`);
      for (const o of h) {
        positive(`${x.id}.sideHoles.diameterMm`, o.diameterMm);
        positive(`${x.id}.sideHoles.depthMm`, o.depthMm);
        if (!(o.fromTopMm > 0 && o.fromBackMm > 0)) out.push(`${x.id}.sideHoles: отверстие ниже крышки и впереди задника`);
      }
    }
    if (x.backSetbackMm.value !== null && !(x.backSetbackMm.value >= 0)) out.push(`${x.id}.backSetbackMm: неотрицательное число`);
    const cut = x.backCutout.value;
    if (cut) {
      positive(`${x.id}.backCutout.widthMm`, cut.widthMm);
      positive(`${x.id}.backCutout.heightMm`, cut.heightMm);
    }
    if (!x.parts.length) out.push(`${x.id}: нет навесов`);
    const sides = x.parts.flatMap((p) => (p.variant === 'L+R' ? ['L', 'R'] : [p.variant]).flatMap((v) => Array<string>(p.perCabinet).fill(v)));
    if (sides.filter((v) => v === 'L').length !== 1 || sides.filter((v) => v === 'R').length !== 1) out.push(`${x.id}: на шкаф нужен один левый и один правый навес`);
    x.parts.forEach((p, i) => part(`${x.id}.parts[${i}]`, p));
    if (!['PLATE', 'RAIL'].includes(x.wall.kind)) out.push(`${x.id}: неизвестное крепление к стене ${x.wall.kind}`);
    if (x.wall.kind === 'RAIL') positive(`${x.id}.wall.stockLengthMm`, x.wall.stockLengthMm);
    part(`${x.id}.wall`, x.wall.part, x.wall.kind === 'RAIL');
    model(x.id, x.model3d);
    ref(x.id, x.ref);
  }
  for (const x of c.casters) {
    if (!TIERS.includes(x.tier)) out.push(`${x.id}: неизвестный уровень ${x.tier}`);
    positive(`${x.id}.wheelDiameterMm`, x.wheelDiameterMm);
    if (typeof x.heightMm === 'number') positive(`${x.id}.heightMm`, x.heightMm);
    else {
      positive(`${x.id}.heightMm.minMm`, x.heightMm.minMm);
      if (!(x.heightMm.maxMm > x.heightMm.minMm)) out.push(`${x.id}.heightMm: диапазон по возрастанию, иначе одно число`);
    }
    if (typeof x.brake !== 'boolean') out.push(`${x.id}.brake: да или нет`);
    if (!['ROUND', 'SQUARE'].includes(x.footprint.shape)) out.push(`${x.id}: неизвестная форма площадки ${x.footprint.shape}`);
    positive(`${x.id}.footprint.sizeMm`, x.footprint.sizeMm);
    known(`${x.id}.mount`, x.mount);
    const m = x.mount.value;
    if (m?.kind === 'PLATE') {
      if (!(Number.isInteger(m.holes.count) && m.holes.count >= 1)) out.push(`${x.id}.mount.holes.count: целое не меньше 1`);
      positive(`${x.id}.mount.holes.diameterMm`, m.holes.diameterMm);
      positive(`${x.id}.mount.holes.spacingMm`, m.holes.spacingMm);
      if (!(m.holes.spacingMm < x.footprint.sizeMm)) out.push(`${x.id}.mount.holes: отверстия на площадке`);
    } else if (m && !(m.kind === 'STEM' && ['M8', 'M10'].includes(m.thread))) out.push(`${x.id}.mount: площадка или шток M8, M10`);
    known(`${x.id}.loadKg`, x.loadKg);
    if (x.loadKg.value !== null) positive(`${x.id}.loadKg`, x.loadKg.value);
    finish(x.id, x.finish);
    price(x.id, x.price);
    model(x.id, x.model3d);
    ref(x.id, x.ref);
  }
  for (const x of c.locks) {
    if (!TIERS.includes(x.tier)) out.push(`${x.id}: неизвестный уровень ${x.tier}`);
    if (!x.use.length || x.use.some((u) => !LOCK_USES.includes(u))) out.push(`${x.id}.use: дверь, ящик или оба`);
    if (!LOCK_KEYS.includes(x.key)) out.push(`${x.id}: неизвестное открывание ${x.key}`);
    for (const k of ['hole', 'fromCarcassMm', 'facadeMaxThicknessMm', 'bodyMm', 'strike'] as const) known(`${x.id}.${k}`, x[k] as Known<unknown>);
    const h = x.hole.value;
    if (h) {
      if (h.shape === 'ROUND') positive(`${x.id}.hole.diameterMm`, h.diameterMm);
      else if (h.shape === 'RECT') for (const k of ['widthMm', 'heightMm'] as const) positive(`${x.id}.hole.${k}`, h[k]);
      else if (h.shape !== 'NONE') out.push(`${x.id}.hole: круглое, прямоугольное или нет`);
      if (h.shape !== 'NONE' && h.depthMm !== null) positive(`${x.id}.hole.depthMm`, h.depthMm);
    }
    for (const k of ['fromCarcassMm', 'facadeMaxThicknessMm'] as const) if (x[k].value !== null) positive(`${x.id}.${k}`, x[k].value);
    for (const k of ['bodyMm', 'strike'] as const) for (const [n, v] of Object.entries(x[k].value ?? {})) positive(`${x.id}.${k}.${n}`, v);
    finish(x.id, x.finish);
    price(x.id, x.price);
    model(x.id, x.model3d);
    ref(x.id, x.ref);
  }
  return out;
}
