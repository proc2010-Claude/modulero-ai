// WardrobeInput (MIGRATION_PLAN step 2): everything the swing and sliding wardrobe model of the prototype r1
// and its exports (specification.csv, dspdetal.csv, drilling.csv, quote.txt, model.json) depend on.
//
// Found statically (every read of the form and of `state` on the way to model() and the exports) and confirmed
// in the browser: model() and the five exports read exactly the 34 controls below, the global `state`,
// the workspace role and the catalogs built into the prototype; no randomness, clock, storage or window size.
// The board cutting behind the price runs in a Web Worker: not an input (a function of this input), but the
// exports are complete only after its answer (FINDINGS 38).
// Proof of completeness: tests/oracle/wardrobe-input.test.mjs applies a saved input on a clean prototype page
// and gets the golden files of all 47 scenarios byte for byte.
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html. The prototype reads a
// control with `$(id)` (getElementById, or the private control map for controls that are not in the DOM)
// and numbers with `val(id)` = Number(value) || 0, so an empty or invalid field counts as 0.
//
// This module is standalone on purpose (no imports): the Node oracle tests import it directly as TypeScript.

export const WARDROBE_INPUT_SCHEMA = 'modulero.wardrobe-input/1';

/** APP_VERSION of the prototype the inputs were read from; its catalogs and price lists are part of the input. */
export const WARDROBE_PROTOTYPE_VERSION = '0.13.85-unified-r1';

export type WardrobeDomain = 'wardrobe' | 'sliding';

/** Value of a control as the prototype stores it in its drafts (mwControlValue, r1.html:15937): text or a checkbox state. */
export type ControlValue = string | boolean;

/**
 * Technical controls: MW_TECHNICAL_CONTROL_IDS of the prototype (r1.html:15878), in its order.
 * All are in the DOM of the editor (hidden legacy fields of the project form). Values are the field text.
 */
export interface WardrobeControls {
  /** Overall width, mm. wardrobeSettings (r1.html:3982), section grid (nominalSectionWidthsRaw, r1.html:4211), ckSync. Field 544…3000; swing: below a 160 mm clear opening refused; sliding: 3000 silently not applied (FINDINGS 14). */
  width: string;
  /** Overall height including the base, mm. wardrobeSettings (r1.html:3983). Field 800…2800; the visible field also accepts 3200 (FINDINGS 14). */
  height: string;
  /** Depth, mm. wardrobeSettings (r1.html:3984), deDimensions (r1.html:6370). 250…800. Swing wardrobe: no effect, depth comes from state.depthProfile (FINDINGS 8, 32). */
  depth: string;
  /** Carcass decor: value of an option of the #material select (57 options of the built-in catalog, e.g. '1610' = EGGER W960, 'MF:DEC-EGG-U999-ST19'); the option's data-code goes into the exports. model (r1.html:12776), u13Material (r1.html:19113), f13PriceLines. */
  material: string;
  /** Ceiling height, mm, '' = not set. wardrobeSettings (r1.html:4001), overridden by state.construction.room.ceiling (r1.html:90940). 800…6000. No effect while state.construction.room exists (always in the editor). */
  roomHeight: string;
  /** Gap to the rear wall, mm. wardrobeSettings (r1.html:4006), overridden with 0 by the construction layer. 0…300. No effect (see roomHeight). */
  rearWallGap: string;
  /** Wall on the left. wardrobeSettings (r1.html:4002), overridden by state.construction.room. No effect (see roomHeight). */
  leftWall: boolean;
  /** Wall on the right. wardrobeSettings (r1.html:4003), overridden by state.construction.room. No effect (see roomHeight). */
  rightWall: boolean;
  /** Skirting height, mm. wardrobeSettings (r1.html:4004), overridden by state.construction.room. 0…300. No effect (see roomHeight). */
  roomSkirtingHeight: string;
  /** Skirting depth, mm. wardrobeSettings (r1.html:4005), overridden by state.construction.room. 0…100. No effect (see roomHeight). */
  roomSkirtingDepth: string;
  /** Skirting solution: 'warning' | 'cutout' | 'offset'. wardrobeSettings (r1.html:4007), overridden with 'cutout'. No effect (see roomHeight). */
  skirtingSolution: string;
  /** Board thickness, mm. wardrobeSettings (r1.html:3985), section grid, fronts (deFrontThickness, r1.html:6358). 12…25. */
  thickness: string;
  /** Shelf depth reduction, mm. wardrobeSettings (r1.html:3998). 0…100. */
  shelfReduction: string;
  /** Allowed shelf deflection, mm. model (r1.html:12857). 0.5…20, step 0.5. */
  shelfDeflectionLimit: string;
  /** Base: 'plinth' | 'fixedLegs' | 'none'. wardrobeSettings (r1.html:3974). Swing wardrobe: the visible choice is stored in state.bodies[].base (FINDINGS 11). */
  baseSystem: string;
  /** Plinth or legs height, mm. wardrobeSettings (r1.html:3975), syncDoorBottomClearanceUi. 40…250. */
  plinthHeight: string;
  /** Plinth setback from the front, mm. wardrobeSettings (r1.html:3990). 0…150. */
  plinthSetback: string;
  /** Door clearance above the floor, mm, used when state.doorBottomClearanceMode = 'manual' (effectiveDoorBottomClearance, r1.html:4000). 1…250. */
  doorBottomClearance: string;
  /** Gap above an internal drawer, mm. wardrobeSettings (r1.html:3977); at least MIN_INTERNAL_DRAWER_GAP, written back to state.internalDrawerGap. 20…200. */
  internalDrawerGap: string;
  /** Advanced module width, mm (P2 module grouping). migrateP2State (r1.html:3930), syncAdvancedModuleWidthPolicy. ≥ 500, step 10. */
  maxCabinetModuleWidth: string;
  /** Legacy facade gap, mm. v16FacadeProfile (r1.html:3818), drawerGapAt (r1.html:3968), model (r1.html:11706). 1…5, step 0.5. Swing wardrobe with the standard profile: no effect (state.facadeGapProfile wins). */
  gap: string;
  /** HDF 4 mm price, ₽/m². model (r1.html:12777), f13PriceLines (r1.html:22444), v17CutJob. ≥ 0. */
  hdfPrice: string;
  /** System 32 assist checkbox. wardrobeSettings (r1.html:3979); state.system32Policy.enabled wins when present (always in r1). */
  system32Assist: boolean;
}

/**
 * Price rates: u139HistoryRates of the prototype (r1.html:20934), ₽ per item unless stated, all ≥ 0.
 * Hidden inputs: these controls are not in the DOM, they live in the prototype's private control map
 * (__MODULERO_PRIVATE_CONTROLS__) and are reachable only through $(id). Read by the cost layers
 * model (r1.html:12779–12786), f13PriceLines (r1.html:22443–22451), u13Price (r1.html:54560), model (r1.html:88240).
 */
export interface WardrobeRates {
  /** Edge banding, ₽/m. Read only for a label (edgePriceLabel, r1.html:15163); edges are priced from the edge catalog. */
  edgePrice: string;
  /** One drilled hole. */
  holePrice: string;
  /** One hinge cup bore. */
  cupPrice: string;
  /** One hinge. */
  hingePrice: string;
  /** One handle. */
  handlePrice: string;
  /** One wardrobe rod. */
  rodPrice: string;
  /** One drawer runner kit. */
  drawerKitPrice: string;
  /** Back panel groove, ₽/m. */
  groovePrice: string;
  /** Delivery, ₽. */
  delivery: string;
  /** Assembly, ₽. */
  assembly: string;
  /** Maker markup, %. */
  markup: string;
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type ExactMm = { numerator: number; denominator: number };

/** One wardrobe section (state.sections[i]); newSection() and the filling layers add the fields. */
export interface WardrobeSection {
  /** Share of the width; normalizedRatios (r1.html:4011). */
  ratio: number;
  /** Facade: 'none' | 'one' | 'two' | 'rows' (rows = split by height, also after "Направо", FINDINGS 12). */
  facade: string;
  /** Body (module) the section belongs to: state.bodies[].id. */
  bodyId?: string;
  /** Nominal width as an exact fraction of a millimetre. */
  nominalMm?: ExactMm;
  /** Drawer mode: 'internal' | 'external'. */
  drawerMode?: string;
  /** Mounting of the doors: absent — накладные in front of the carcass; 'INSET' — вкладные in the opening (MOD-DEC-317, 362). */
  facadeMounting?: string;
  /** Shelves, rods, drawers, cover of the filling model (schema 1). */
  filling?: { [key: string]: JsonValue };
  [key: string]: JsonValue | undefined;
}

/** One carcass body (module) of the construction layer: ckNewBody (r1.html:11285). */
export interface WardrobeBody {
  id: string;
  /** External width, mm. */
  width: number;
  /** Own height and depth, mm; null = from the overall controls. */
  height: number | null;
  depth: number | null;
  floor: number;
  /** Carcass panels present: left, right, top, bottom, back ("Крыша", "Задняя стенка"). */
  panels: { [panel: string]: boolean };
  /**
   * Base of this body: { kind: 'plinth' | 'fixedLegs' | 'none', height?: mm } or null = the default plinth 70 mm (FINDINGS 11);
   * 'legsPlinth' — legs behind a decorative plinth, an addition of task FIT (MOD-DEC-483) the prototype had not.
   */
  base: { [key: string]: JsonValue } | null;
  back: JsonValue;
  parent: string | null;
  [key: string]: JsonValue | undefined;
}

/**
 * The global `state` of the prototype (r1.html:3840), all keys, in the prototype's order. Read by model() through
 * wardrobeSettings, the construction layer (ck*), the P2 front grid, the filling model and the cost layers.
 * The editor-only keys (WARDROBE_VIEW_KEYS) are kept so that the saved project (input.json) is reproduced
 * byte for byte; changing them does not change the five exports (tests/oracle/wardrobe-input.test.mjs).
 */
export interface WardrobeState {
  // ---- price and provenance ----
  /** Price snapshot of an opened project; null for a new one. Sliding: part of model.json. */
  inputPriceSnapshot: JsonValue;
  /** Edge-joint connections override (EJ layer); null = automatic. */
  ejConnections: JsonValue;
  /** Price profile: { id, status, delivery ₽, assemblyPercent %, makerPercent %, sawRate, kerf mm, trim mm }. The swing wardrobe quote uses it instead of the delivery, assembly and markup rates. */
  priceProfile: { [key: string]: JsonValue };
  /** Ready-made facade finish: { code, material, rate ₽/m² }. */
  facadeFinish: { [key: string]: JsonValue };
  /** Fastener records of the r7 layer: { schema: 'modulero.fasteners/7', enabled, records, newProjectDefault }. */
  fastenersR7: { [key: string]: JsonValue };
  /** Engineering rule set the project declares, e.g. '1.2'. */
  engineeringRuleSetVersion: string;
  // ---- facades ----
  /** Facade gap profile: standard MOD-FACADE-SEAM-3-V1 (seamX, seamY, insets, mm) or LEGACY-FACADE-GAP-V1. v16FacadeProfile (r1.html:3818). */
  facadeGapProfile: { [key: string]: JsonValue };
  /** Door clearance above the floor: 'auto' (from the plinth) | 'manual' (control doorBottomClearance). */
  doorBottomClearanceMode: string;
  /** Explicit choice of the corpus and facade appearance: { schema: 'EXPLICIT-APPEARANCE-1', corpus, facade }. */
  appearanceSelection: { [key: string]: JsonValue };
  /** Facades bound across sections. */
  seamBindings: JsonValue[];
  // ---- front grid and modules (P2) ----
  /** Height includes the base. */
  heightIncludesBase: boolean;
  /** 'UI-MANUAL-FLOW-01'. */
  modulePolicyVersion: string;
  /** Front grid: 'EQUAL' | 'MANUAL'. */
  frontGridMode: string;
  /** Facade widths: 'EQUAL_ROW' | 'FOLLOW_FRONT_GRID'. */
  facadeWidthPolicy: string;
  /** Exact section widths, mm, or null = from the ratios. */
  frontGridExactWidthsMm: ExactMm[] | null;
  frontGridEditProvenance: JsonValue;
  /** Module grouping: 'AUTO' | 'MANUAL'. */
  moduleGroupingMode: string;
  /** 2400 mm. */
  moduleSoftLimitMm: number;
  /** Mirror of the control maxCabinetModuleWidth, mm. */
  advancedModuleWidthInputMm: number;
  moduleBreaksProvenance: JsonValue;
  /** Mirror of the control gap as text, mm. */
  p2GapInputMm: string;
  p2MigrationNotices: JsonValue[];
  /** Section indexes where a new module starts; null = automatic. */
  moduleBreaks: number[] | null;
  // ---- carcass and filling ----
  /** Gap above an internal drawer, mm; kept equal to the control internalDrawerGap. */
  internalDrawerGap: number;
  /** System 32 assist; written from system32Policy.enabled by wardrobeSettings. */
  system32Assist: boolean;
  /** System 32 policy: { version, enabled, provenance }. */
  system32Policy: { [key: string]: JsonValue };
  /** Manual edge banding per part: { partId: { edge: profile } }. */
  edgeOverrides: { [part: string]: JsonValue };
  /** Sections from left to right. */
  sections: WardrobeSection[];
  /** Carcass bodies (modules) of the construction layer. */
  bodies: WardrobeBody[];
  /** Construction layer: { schema: 1, intent: 'automatic' | 'manual', nextBody, nextSection, room: walls, ceiling, skirting…, uprights }. Room fields here override the room controls. */
  construction: { [key: string]: JsonValue };
  /** Back panel: { id, mode: 'quarter' | 'overlay', rebate mm, thickness mm… }. */
  backProfile: { [key: string]: JsonValue };
  /** Depth model: { version, inputBasis, overallMm, frontGapMm, status, sourceBasis }. The swing wardrobe depth comes from here (FINDINGS 8). */
  depthProfile: { [key: string]: JsonValue };
  /** Counter for the ids of new filling elements. */
  fillingSequence?: number;
  /** Carcass decor chosen in "Материал корпуса": { version: 'MATERIAL-SELECTION-1', corpus: { decorId, variantId… } }. */
  materialSelection?: { [key: string]: JsonValue };
  /** Sliding wardrobe: { schema: 'MODULERO-SLIDING-1', active, manufacturer: 'ARISTO', system: 'eco' | 'slim' | 'standard', n: 2…5 doors, scheme, mirror, openingMode, material, leafIds… }. active = true makes the project a sliding wardrobe. */
  slidingWardrobe?: { [key: string]: JsonValue };
  // ---- editor only (WARDROBE_VIEW_KEYS): no effect on the exports ----
  view: string;
  workspaceMode: string;
  sidebarTab: string;
  inspectorTab: string;
  doors: boolean;
  drawingZoom: number;
  drawingFit: boolean;
  productionFilter: string;
  selected: number;
  selectedObject: JsonValue;
  selectedPart: JsonValue;
  selectedFace: string;
  [key: string]: unknown;
}

/** Workspace session (MWWorkspaceSession, r1.html:16296): projectJson drops the material and HDF price for a customer. */
export interface WardrobeSession {
  /** 'CUSTOMER' (the start screen and every scenario) | 'MAKER' (button "Исполнитель"). */
  role: 'CUSTOMER' | 'MAKER';
}

export interface WardrobeInput {
  schema: typeof WARDROBE_INPUT_SCHEMA;
  /** APP_VERSION of the prototype: its decor, edge, hinge and price catalogs are built in and fixed by this version. */
  prototype: string;
  /** Redundant with state.slidingWardrobe?.active, kept for readability and checked. */
  domain: WardrobeDomain;
  session: WardrobeSession;
  controls: WardrobeControls;
  rates: WardrobeRates;
  state: WardrobeState;
}

export const WARDROBE_CONTROL_IDS = [
  'width', 'height', 'depth', 'material', 'roomHeight', 'rearWallGap', 'leftWall', 'rightWall', 'roomSkirtingHeight', 'roomSkirtingDepth',
  'skirtingSolution', 'thickness', 'shelfReduction', 'shelfDeflectionLimit', 'baseSystem', 'plinthHeight', 'plinthSetback',
  'doorBottomClearance', 'internalDrawerGap', 'maxCabinetModuleWidth', 'gap', 'hdfPrice', 'system32Assist',
] as const satisfies readonly (keyof WardrobeControls)[];

export const WARDROBE_RATE_IDS = [
  'edgePrice', 'holePrice', 'cupPrice', 'hingePrice', 'handlePrice', 'rodPrice', 'drawerKitPrice', 'groovePrice', 'delivery', 'assembly', 'markup',
] as const satisfies readonly (keyof WardrobeRates)[];

export const WARDROBE_CHECKBOX_IDS = ['leftWall', 'rightWall', 'system32Assist'] as const;

/** Allowed values of the select controls; material is checked against the page catalog by applyWardrobeInput. */
export const WARDROBE_SELECT_VALUES: { readonly [id: string]: readonly string[] } = {
  baseSystem: ['plinth', 'fixedLegs', 'none'],
  skirtingSolution: ['warning', 'cutout', 'offset'],
};

/** Keys of `state` that every wardrobe and sliding project has (a new project already has them all). */
export const WARDROBE_STATE_KEYS = [
  'inputPriceSnapshot', 'ejConnections', 'facadeGapProfile', 'heightIncludesBase', 'modulePolicyVersion', 'engineeringRuleSetVersion',
  'frontGridMode', 'facadeWidthPolicy', 'frontGridExactWidthsMm', 'frontGridEditProvenance', 'moduleGroupingMode', 'moduleSoftLimitMm',
  'advancedModuleWidthInputMm', 'moduleBreaksProvenance', 'p2GapInputMm', 'p2MigrationNotices', 'moduleBreaks', 'doorBottomClearanceMode',
  'internalDrawerGap', 'system32Assist', 'system32Policy', 'edgeOverrides', 'sections', 'bodies', 'construction', 'backProfile',
  'seamBindings', 'priceProfile', 'facadeFinish', 'depthProfile', 'appearanceSelection', 'fastenersR7',
] as const;

/**
 * Keys of `state` that appear after some edits: filling, material choice, sliding doors, the level «Комплектация»
 * (r1.html:94451), the rod, handle and leg of the project (task FIT, MOD-DEC-480 — the prototype had none), the
 * parameters of the cutting map the price cuts with (R2-019, FINDINGS 1766).
 */
/** state.fittings.drawerSystem (MOD-DEC-544, R2-007): 'TIER' or a series of engine/policy/drawer-system-selection (a test keeps them equal). */
export const WARDROBE_DRAWER_SYSTEM_CHOICES: readonly string[] = ['TIER', 'BOYARD_START_SOFT', 'BLUM_TANDEMBOX_ANTARO_M', 'BLUM_LEGRABOX_PURE_M'];

export const WARDROBE_OPTIONAL_STATE_KEYS = ['fillingSequence', 'materialSelection', 'slidingWardrobe', 'fillingTier', 'fittings', 'cutting'] as const;

/** Keys of `state` that only the editor uses (view, tabs, selection); verified to have no effect on the exports. */
export const WARDROBE_VIEW_KEYS = [
  'view', 'workspaceMode', 'sidebarTab', 'inspectorTab', 'doors', 'drawingZoom', 'drawingFit', 'productionFilter',
  'selected', 'selectedObject', 'selectedPart', 'selectedFace',
] as const;

const ROLES = ['CUSTOMER', 'MAKER'];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const numericText = (v: string) => v === '' || Number.isFinite(Number(v));

/** Paths of values that JSON cannot carry without loss (undefined, NaN, ±Infinity, functions, class instances). */
export function nonJsonPaths(value: unknown, path = '$'): string[] {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return [];
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [`${path} = ${value}`];
  if (Array.isArray(value)) return value.flatMap((v, i) => nonJsonPaths(v, `${path}[${i}]`));
  if (isObject(value)) {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return [`${path} is ${proto?.constructor?.name ?? 'not a plain object'}`];
    return Object.entries(value).flatMap(([k, v]) => nonJsonPaths(v, `${path}.${k}`));
  }
  return [`${path} is ${typeof value}`];
}

function checkFields(group: string, value: unknown, ids: readonly string[], problems: string[], cell: (id: string, v: unknown) => string | null) {
  if (!isObject(value)) {
    problems.push(`${group}: not an object`);
    return;
  }
  for (const id of ids) if (!(id in value)) problems.push(`${group}.${id}: missing`);
  for (const id of Object.keys(value)) {
    if (!ids.includes(id)) problems.push(`${group}.${id}: unknown field`);
    else {
      const p = cell(id, value[id]);
      if (p) problems.push(`${group}.${id}: ${p}`);
    }
  }
}

/** Problems of a would-be WardrobeInput; an empty list means it is complete and well-formed. Pure. */
export function checkWardrobeInput(raw: unknown): string[] {
  const problems: string[] = [];
  if (!isObject(raw)) return ['input: not an object'];
  for (const k of Object.keys(raw)) if (!['schema', 'prototype', 'domain', 'session', 'controls', 'rates', 'state'].includes(k)) problems.push(`${k}: unknown field`);
  if (raw.schema !== WARDROBE_INPUT_SCHEMA) problems.push(`schema: expected ${WARDROBE_INPUT_SCHEMA}`);
  if (typeof raw.prototype !== 'string' || !raw.prototype) problems.push('prototype: expected the APP_VERSION of the prototype');
  if (raw.domain !== 'wardrobe' && raw.domain !== 'sliding') problems.push("domain: expected 'wardrobe' or 'sliding'");
  if (!isObject(raw.session) || !ROLES.includes(raw.session.role as string) || Object.keys(raw.session).length !== 1) problems.push(`session: expected { role: ${ROLES.join(' | ')} }`);
  checkFields('controls', raw.controls, WARDROBE_CONTROL_IDS, problems, (id, v) => {
    if ((WARDROBE_CHECKBOX_IDS as readonly string[]).includes(id)) return typeof v === 'boolean' ? null : 'expected true or false';
    if (typeof v !== 'string') return 'expected the field text';
    if (WARDROBE_SELECT_VALUES[id]) return WARDROBE_SELECT_VALUES[id].includes(v) ? null : `expected one of ${WARDROBE_SELECT_VALUES[id].join(', ')}`;
    if (id === 'material') return v ? null : 'expected an option value';
    return numericText(v) ? null : 'expected a number';
  });
  checkFields('rates', raw.rates, WARDROBE_RATE_IDS, problems, (_id, v) => (typeof v === 'string' && numericText(v) ? null : 'expected a number as text'));
  const state = raw.state;
  if (!isObject(state)) problems.push('state: not an object');
  else {
    const known: readonly string[] = [...WARDROBE_STATE_KEYS, ...WARDROBE_OPTIONAL_STATE_KEYS, ...WARDROBE_VIEW_KEYS];
    for (const k of [...WARDROBE_STATE_KEYS, ...WARDROBE_VIEW_KEYS]) if (!(k in state)) problems.push(`state.${k}: missing`);
    for (const k of Object.keys(state)) if (!known.includes(k)) problems.push(`state.${k}: unknown key (a new hidden input?)`);
    problems.push(...nonJsonPaths(state, 'state'));
    if (!Array.isArray(state.sections) || !state.sections.length) problems.push('state.sections: expected at least one section');
    if (!Array.isArray(state.bodies)) problems.push('state.bodies: expected an array');
    const sliding = isObject(state.slidingWardrobe) && state.slidingWardrobe.active === true;
    if ((raw.domain === 'sliding') !== sliding) problems.push(`domain: ${String(raw.domain)} but state.slidingWardrobe.active is ${sliding}`);
    if ('fittings' in state) {
      const f = state.fittings;
      // MOD-DEC-483: the lighting ('ALL' or the ids of the sections) and the opening by pressing; 484: the baskets,
      // trouser racks and pantographs of the sections and their colour.
      const storageRow = (x: unknown) =>
        isObject(x) && Object.keys(x).every((k) => ['sectionId', 'kind', 'yMm'].includes(k)) && typeof x.sectionId === 'string' && ['LINEN_BASKET', 'SHOE_BASKET', 'TROUSER_RACK', 'PANTOGRAPH'].includes(x.kind as string) && typeof x.yMm === 'number' && Number.isFinite(x.yMm);
      const valid = (k: string, v: unknown) =>
        v === null ||
        (['rodSeriesId', 'handleId', 'legId'].includes(k) && typeof v === 'string') ||
        (k === 'lighting' && (v === 'ALL' || (Array.isArray(v) && v.every((x) => typeof x === 'string')))) ||
        (k === 'pushToOpen' && typeof v === 'boolean') ||
        (k === 'storage' && Array.isArray(v) && v.every(storageRow)) ||
        (k === 'storageColour' && ['WHITE', 'GRAPHITE', 'BLACK'].includes(v as string)) ||
        // MOD-DEC-544 (R2-007): the assembled drawers of a series, or of the level of the hardware.
        (k === 'drawerSystem' && WARDROBE_DRAWER_SYSTEM_CHOICES.includes(v as string)) ||
        // MOD-DEC-514 (FINDINGS 1862): the runner of the own box by the level of the hardware.
        (k === 'drawerRunner' && v === 'level');
      if (!isObject(f) || Object.entries(f).some(([k, v]) => !valid(k, v)))
        problems.push(
          "state.fittings: expected { rodSeriesId?, handleId?, legId? } of catalogue ids, lighting? 'ALL' or section ids, pushToOpen? boolean, storage? [{ sectionId, kind, yMm }], storageColour? WHITE | GRAPHITE | BLACK, drawerSystem? TIER or a series of the drawer systems, drawerRunner? level, or null",
        );
    }
    if ('cutting' in state) {
      const why = cuttingParamsProblem(state.cutting);
      if (why) problems.push(`state.cutting: ${why}`);
    }
  }
  return problems;
}

/**
 * Limits of the parameters of the map the user enters (R2-019, FINDINGS 1766 (Д)): a kerf over 10 mm or a trim over
 * 50 mm is no saw of a workshop, a side of a sheet outside 300…6000 mm is no sheet of a board. Not numbers of the
 * product: they only refuse a typing error (the prototype took 99999 mm).
 */
export const CUTTING_INPUT_LIMITS = Object.freeze({ kerfMm: [0, 10], trimMm: [0, 50], sheetSideMm: [300, 6000] } as const);

/** Why the parameters of the map cannot be kept (CUTTING_INPUT_LIMITS), or null. A null value is «не задано». */
export function cuttingParamsProblem(p: unknown): string | null {
  const L = CUTTING_INPUT_LIMITS,
    num = (x: unknown, [lo, hi]: readonly [number, number]) => x === null || x === undefined || (typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi),
    isObj = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null && !Array.isArray(x);
  if (!isObj(p) || Object.keys(p).some((k) => !['kerfMm', 'trimMm', 'materials'].includes(k))) return 'Параметры раскроя: ожидаются пропил, обрезка и материалы.';
  if (!num(p.kerfMm, L.kerfMm)) return `Пропил — от ${L.kerfMm[0]} до ${L.kerfMm[1]} мм. Проект не изменён.`;
  if (!num(p.trimMm, L.trimMm)) return `Обрезка листа — от ${L.trimMm[0]} до ${L.trimMm[1]} мм. Проект не изменён.`;
  if (p.materials !== undefined && !isObj(p.materials)) return 'Параметры раскроя: материалы — объект по плитам.';
  for (const m of Object.values((p.materials ?? {}) as Record<string, unknown>)) {
    if (!isObj(m) || Object.keys(m).some((k) => !['sheetMm', 'respectGrain'].includes(k))) return 'Параметры раскроя: у плиты — формат листа и учёт текстуры.';
    if (m.respectGrain !== undefined && typeof m.respectGrain !== 'boolean') return 'Параметры раскроя: учёт текстуры — да или нет.';
    if (m.sheetMm !== undefined && m.sheetMm !== null && !(Array.isArray(m.sheetMm) && m.sheetMm.length === 2 && m.sheetMm.every((x: unknown) => num(x, L.sheetSideMm))))
      return `Сторона листа — от ${L.sheetSideMm[0]} до ${L.sheetSideMm[1]} мм. Проект не изменён.`;
  }
  return null;
}

/**
 * Canonical form: fields in the order of this module, controls and rates in the prototype's order, the state
 * deep-copied with its key order kept (the order does not change the exports, but it is part of the saved project).
 * Throws with the list of problems when the input is not complete. Pure: the argument is not changed.
 */
export function normalizeWardrobeInput(raw: unknown): WardrobeInput {
  const problems = checkWardrobeInput(raw);
  if (problems.length) throw new Error('Invalid WardrobeInput:\n- ' + problems.join('\n- '));
  const input = raw as unknown as WardrobeInput;
  const pick = <T extends object>(source: T, ids: readonly (keyof T)[]) => Object.fromEntries(ids.map((id) => [id, source[id]])) as T;
  return {
    schema: WARDROBE_INPUT_SCHEMA,
    prototype: input.prototype,
    domain: input.domain,
    session: { role: input.session.role },
    controls: pick(input.controls, WARDROBE_CONTROL_IDS),
    rates: pick(input.rates, WARDROBE_RATE_IDS),
    state: JSON.parse(JSON.stringify(input.state)) as WardrobeState,
  };
}

/** The saved form of an input (reference/wardrobe-input/<domain>/<scenario>.json). */
export function wardrobeInputText(input: WardrobeInput): string {
  return JSON.stringify(normalizeWardrobeInput(input), null, 1) + '\n';
}
