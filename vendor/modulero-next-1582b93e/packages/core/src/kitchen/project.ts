// KitchenProject (MIGRATION_PLAN step 4.2, K2): the kitchen of the prototype r1 as one copy of its input.
//
// The prototype keeps the kitchen as a record of schema 3 (kitchenProjectSchemaVersion: 3): snapshot() writes it
// into the global state (persist, r1.html:67790) and the kitchen is rebuilt from it by restore() when the kitchen
// opens (openKitchen, r1.html:82293). Its project file (exportPayload('project') = the common projectJson of the
// wardrobe, r1.html:81610) carries that record three times (settings, editingDraft.domainState,
// depthViewSnapshot.domain), each with the undo history, the computed chains and the worktop calculation, beside the
// whole default swing wardrobe model: 0.7–1.3 MB for a kitchen of 1–14 KB (KF-22, FINDINGS 220).
//
// KitchenProject is that record without what the prototype derives from it on every snapshot (room topology,
// chains, worktops, module results) and without the undo history: what the file of `kind: "kitchen"` stores, once.
// Proof of completeness: tests/oracle/kitchen-input.test.mjs sets a saved KitchenProject on a clean prototype page
// and gets the files of the K1 golden master of every configuration (reference/golden/kitchen) byte for byte.
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
// This module is standalone on purpose (no imports): the Node oracle tests import it directly as TypeScript.

export const KITCHEN_PROJECT_SCHEMA_VERSION = 3;

export const KITCHEN_INPUT_SCHEMA = 'modulero.kitchen-input/1';

/** APP_VERSION of the prototype the inputs were read from; its module catalog, standard and rate rows are part of the input. */
export const KITCHEN_PROTOTYPE_VERSION = '0.13.85-unified-r1';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Room, mm (kitchenState.room). The walls A, B, C follow from type and orientation. */
export interface KitchenRoom {
  width: number;
  depth: number;
  height: number;
  [key: string]: JsonValue;
}

/**
 * One module (kitchenState.modules[i]), as makeModule (r1.html:68303) and the module layers create it. Typed in part:
 * the fields differ by module kind and are carried as they are; the module model moves to the engine in K3.
 */
export interface KitchenModule {
  /** 'm1', 'm2'…; nextId is above every number used. */
  id: string;
  /** Palette card of the prototype catalog (r1.html:67287), e.g. 'lower-shelves', 'dishwasher', 'filler'. */
  catalogId: string;
  /** 'base' | 'upper' | 'tall' | 'mezz' | 'island' | 'niche' | 'filler'. */
  kind: string;
  /** Wall 'A' | 'B' | 'C' or the island. */
  wall?: string;
  /** Position along the wall, width, depth, height and bottom above the floor, mm. */
  pos?: number;
  width: number;
  depth: number;
  height: number;
  floor: number;
  /** Module type of KITCHEN_MODULE_STANDARD, e.g. 'KB_SHELVES'. */
  moduleTypeId?: string;
  /**
   * The computed result kept by a legacy corner pair (isLegacyCorner): derived() returns it as it is (r1.html:68765),
   * so for such a module it is input. Every other module drops it (kprModuleInput, r1.html:73138).
   */
  calculated?: JsonValue;
  [key: string]: JsonValue | undefined;
}

/** Rate table of the kitchen estimate (kcdRateSettings, r1.html:80949): null prices are unknown, never 0 (MOD-DEC-247). */
export interface KitchenRates {
  schema: 'modulero.kitchen.rates.v1';
  currency: 'RUB' | 'EUR' | 'USD';
  includeAppliances: boolean;
  rates: { [key: string]: JsonValue }[];
}

/**
 * The kitchen record of schema 3 (snapshot, r1.html:67738, with the layers r1.html:73157, 80035, 80981), keys in the
 * prototype's order. Interface keys (KITCHEN_INTERFACE_KEYS) are kept: the prototype requires them on open
 * (krKitchenStoredRecord, r1.html:80547), and `selected` marks the parts of the chosen module in flow.scene().
 */
export interface KitchenProject {
  /** System 32 policy { version, enabled, provenance } (MOD-DEC-193, 196): a copy of the global state's policy. */
  system32Policy?: { [key: string]: JsonValue };
  /** Legacy System 32 flag of files without system32Policy. */
  system32Assist?: boolean;
  kitchenProjectSchemaVersion: 3;
  /** 'LEGACY' (walls named as stored) | 'ABC_CHAIN' (new kitchens: A left, B back, C right; canonicalWall, r1.html:67627). */
  wallNaming: string;
  /** Room and kitchen type are confirmed: until then a new kitchen has no modules to add. */
  roomConfirmed: boolean;
  typeConfirmed: boolean;
  /** 'straight' | 'l' | 'u'. */
  type: string;
  /** 'left' | 'right' (L kitchen). */
  orientation: string;
  islandEnabled: boolean;
  room: KitchenRoom;
  modules: KitchenModule[];
  /** Pipes, outlets and other obstacles on the walls. */
  obstacles: { [key: string]: JsonValue }[];
  selected: string | null;
  selectedPart: string | null;
  stage: string;
  view: string;
  row: string;
  wall: string;
  /** Facades shown in the views. */
  facades: boolean;
  /** Corpus and facade decor code, e.g. 'W980'. */
  corpusMaterial: string;
  facadeMaterial: string;
  /** Width of a new module, mm; height of new upper modules, mm. */
  defaultWidth: number;
  upperHeight: number;
  /** Proposed values that are not decisions: { outerGap, topFront, topRear }, mm (MOD-DEC-180 HOLD). */
  proposed: { outerGap: number; topFront: number; topRear: number; [key: string]: JsonValue };
  /** Next module number. */
  nextId: number;
  showFilling?: boolean;
  /** 2: the kitchen is in the current construction (kr layer, r1.html:80603); other values are migrated on open. */
  kitchenReleaseAdapterRevision?: number;
  costSettings?: KitchenRates;
  /**
   * The material of the facades of the whole kitchen, «материал → исполнение → цвет» (MOD-DEC-573): absent — the fronts
   * of the prototype, of a board of the decor `facadeMaterial`. The colour stays `facadeMaterial` (and a module's own).
   */
  facadeChoice?: KitchenFacadeChoice | null;
  /**
   * The settings of the whole kitchen on «Материалы и опции» (R4-006, FINDINGS 1903): the value a new module takes, the
   * modules of the kitchen are changed with it. Absent, or a key absent — the default of MOD-DEC-180 / 565.
   */
  kitchenOptions?: KitchenOptions;
  /**
   * The parameters of the cutting map the user entered on «Детали» → «Раскрой» (R4-011, FINDINGS 1904): the saw, the
   * format and the grain of every board — the CuttingParams of the wardrobe's `state.cutting` (R2-019). Absent — the
   * defaults; the limits are checked on open by kitchenCuttingProblem.
   */
  cutting?: { [key: string]: JsonValue };
  /**
   * The handles and the opening of the fronts of the whole kitchen (MOD-AI-16, 36; FINDINGS 3210): absent, or a key
   * absent — the handle of the prototype (Hettich 9306951) on every front and the doors with handles.
   */
  fittings?: KitchenFittings;
  /**
   * The manual bands of the parts in the «Продвинутый» mode (MOD-DEC-743, 319, 325): { partId: { edge of edge_mm:
   * profile } }, the form of the wardrobe's state.edgeOverrides. Absent — the automatic banding.
   */
  edgeOverrides?: { [partId: string]: { [edge: string]: string } };
  /** The worktop of the whole kitchen (MOD-AI-15, FINDINGS 3218): absent — the worktop of the catalogue by default. */
  worktop?: KitchenWorktopChoice;
}

/** The handles and the opening of the fronts (KitchenProject.fittings), as the wardrobe keeps its `state.fittings`. */
export interface KitchenFittings {
  /** A handle of the catalogue of the fittings (catalogs/hardware/fittings.json) or 'NONE' — без ручек. */
  handleId?: string;
  /** The doors open by pressing (MOD-DEC-483, 485): hinges without a spring and a latch; drawers and lifts keep handles. */
  pushToOpen?: true;
  [key: string]: JsonValue | undefined;
}

/** The worktop of the kitchen (KitchenProject.worktop): a worktop of catalogs/materials/worktops.json. */
export interface KitchenWorktopChoice {
  worktopId?: string;
  [key: string]: JsonValue | undefined;
}

/** The settings of the whole kitchen, mm (KitchenProject.kitchenOptions). */
export interface KitchenOptions {
  /** The depth of the worktops (MOD-DEC-565 п. 9: 600, the user changes it). */
  worktopDepthMm?: number;
  /** The supports: the floor to the bottom of a floor cabinet (MOD-DEC-180: 100). */
  legHeightMm?: number;
  /** The bottom of the wall cabinets (MOD-DEC-565 п. 12: 1400). */
  upperFloorMm?: number;
  /** The filler of a straight corner cabinet below and on the wall (MOD-DEC-565 п. 11: 50 / 30). */
  lowerFillerMm?: number;
  upperFillerMm?: number;
  [key: string]: JsonValue | undefined;
}

/** The keys of KitchenOptions. */
export const KITCHEN_OPTION_KEYS = ['worktopDepthMm', 'legHeightMm', 'upperFloorMm', 'lowerFillerMm', 'upperFillerMm'] as const;

/**
 * The reference of the kitchen to the catalogue of the materials of the facades (catalogs/materials/facades.json), with
 * the supply, the thickness of the execution and the names the kitchen was built with (as the wardrobe keeps its
 * `materialSelection.facade`): the geometry reads them from the project, the price and the check from the release.
 */
export interface KitchenFacadeChoice {
  materialId: string;
  executionId: string;
  materialTitle: string;
  executionTitle: string;
  supply: 'MANUFACTURE' | 'PURCHASED';
  /** The thickness of a front, mm; 'BOARD' — of the board of the fronts of the kitchen, as without a choice. */
  thicknessMm: number | 'BOARD';
  /** The colour code (RAL, NCS) or the species of veneer; null — none. */
  colorText: string | null;
}

/** Every key of a schema-3 record the prototype accepts, in its order (krKitchenStoredKeys, r1.html:80527, snapshot order), and the keys of Modulero after them. */
export const KITCHEN_RECORD_KEYS = [
  'system32Policy', 'system32Assist', 'kitchenProjectSchemaVersion', 'wallNaming', 'room_corners', 'wall_topology', 'wall_coordinate_adapter',
  'roomConfirmed', 'typeConfirmed', 'type', 'orientation', 'islandEnabled', 'room', 'modules', 'calculations', 'obstacles', 'selected',
  'selectedPart', 'stage', 'view', 'row', 'wall', 'facades', 'corpusMaterial', 'facadeMaterial', 'defaultWidth', 'upperHeight', 'proposed',
  'nextId', 'showFilling', 'kitchenReleaseAdapterRevision', 'costSettings', '_history', '_future', 'worktopsR5',
  // Not of the prototype: the material of the facades (MOD-DEC-573), the settings of the whole kitchen (R4-006), the
  // parameters of the cutting map (R4-011), the handles and the opening of the fronts (MOD-AI-16, 36), the manual
  // bands (MOD-DEC-743) and the worktop (MOD-AI-15).
  'facadeChoice', 'kitchenOptions', 'cutting', 'fittings', 'edgeOverrides', 'worktop',
] as const;

/** Recomputed by snapshot() on every save and never read back: room topology (roomTopology, r1.html:67634), chains (calculateChains), worktops (r1.html:71171). */
export const KITCHEN_DERIVED_KEYS = ['room_corners', 'wall_topology', 'wall_coordinate_adapter', 'calculations', 'worktopsR5'] as const;

/** Undo and redo: earlier whole records, not an input of the current kitchen. */
export const KITCHEN_HISTORY_KEYS = ['_history', '_future'] as const;

/** Keys of KitchenProject in the stored order. */
export const KITCHEN_PROJECT_KEYS = KITCHEN_RECORD_KEYS.filter(
  (k) => !(KITCHEN_DERIVED_KEYS as readonly string[]).includes(k) && !(KITCHEN_HISTORY_KEYS as readonly string[]).includes(k),
);

/** Left out of ProjectRevision by the prototype (kcdRevision, r1.html:80924): editor state. */
export const KITCHEN_INTERFACE_KEYS = ['selected', 'selectedPart', 'stage', 'view', 'row', 'wall', 'facades', 'showFilling'] as const;

/** Required by the prototype on open (krKitchenStoredRecord, r1.html:80547). */
const REQUIRED_KEYS = [
  'type', 'orientation', 'islandEnabled', 'wallNaming', 'corpusMaterial', 'facadeMaterial', 'defaultWidth', 'upperHeight', 'nextId',
  'selected', 'selectedPart', 'stage', 'view', 'row', 'wall', 'facades',
];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** A corner pair saved before the single-body corner (r1.html:67860): its stored result is its input. */
export function isLegacyCorner(m: unknown): boolean {
  return isObject(m) && (Boolean(m.cornerGroupId) || (m.corner === 'direct' && m.schema_version !== 2));
}

/** Paths of values that JSON cannot carry without loss (undefined, NaN, ±Infinity, functions, class instances). */
function nonJsonPaths(value: unknown, path: string): string[] {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return [];
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [`${path} = ${value}`];
  if (Array.isArray(value)) return value.flatMap((v, i) => nonJsonPaths(v, `${path}[${i}]`));
  if (isObject(value)) {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return [`${path} is not a plain object`];
    return Object.entries(value).flatMap(([k, v]) => nonJsonPaths(v, `${path}.${k}`));
  }
  return [`${path} is ${typeof value}`];
}

/**
 * The checks of the prototype's own file opening (krKitchenStoredRecord, r1.html:80540), with its messages, for one
 * record; `label` names it in the message ('Проект'). Not repeated, because they need the prototype's catalogs:
 * membership of catalogId in the module catalog (the prototype refuses its own example with a filler by it,
 * FINDINGS 222; the catalog becomes policy data in K3), the appliance models of appliance modules (kapIs) and the
 * rows of the rate table (kcdRateSettings, K5). Returns the first problem or null.
 */
export function kitchenRecordError(s: unknown, label = 'Проект'): string | null {
  if (!isObject(s)) return label + ': повреждена запись состояния.';
  for (const key of Object.keys(s))
    if (['__proto__', 'constructor', 'prototype'].includes(key) || !(KITCHEN_RECORD_KEYS as readonly string[]).includes(key))
      return label + ': неподдерживаемое поле «' + key + '». Текущий проект сохранён.';
  if (s.kitchenProjectSchemaVersion !== KITCHEN_PROJECT_SCHEMA_VERSION)
    return label + ': старый формат кухни: откройте его в исходной версии и сохраните отдельно. Текущий проект сохранён.';
  const room = s.room, proposed = s.proposed, modules = s.modules;
  if (!isObject(room) || !Array.isArray(modules) || !Array.isArray(s.obstacles) || !isObject(proposed) || typeof s.roomConfirmed !== 'boolean' || typeof s.typeConfirmed !== 'boolean')
    return label + ': повреждена структура кухни.';
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (
    ['width', 'depth', 'height'].some((k) => !num(room[k]) || (room[k] as number) <= 0) ||
    modules.some((m) => !isObject(m) || typeof m.id !== 'string' || !m.id || typeof m.catalogId !== 'string' || !m.catalogId || ['width', 'depth', 'height', 'floor'].some((k) => !num(m[k]))) ||
    new Set(modules.map((m) => (m as KitchenModule).id)).size !== modules.length
  )
    return label + ': повреждены размеры или номера модулей.';
  if (REQUIRED_KEYS.some((key) => !own(s, key))) return label + ': неполное состояние кухни. Откройте файл в исходной версии и сохраните отдельно.';
  const nextId = s.nextId as number;
  if (
    !['straight', 'l', 'u'].includes(s.type as string) ||
    !['left', 'right'].includes(s.orientation as string) ||
    typeof s.islandEnabled !== 'boolean' ||
    typeof s.facades !== 'boolean' ||
    !num(s.defaultWidth) || s.defaultWidth <= 0 ||
    !num(s.upperHeight) || s.upperHeight <= 0 ||
    !Number.isSafeInteger(nextId) || nextId <= 0 ||
    modules.some((m) => /^m[0-9]+$/.test((m as KitchenModule).id) && nextId <= Number((m as KitchenModule).id.slice(1))) ||
    ['outerGap', 'topFront', 'topRear'].some((key) => !num(proposed[key]) || (proposed[key] as number) < 0)
  )
    return label + ': повреждены параметры кухни.';
  const policy = s.system32Policy;
  if ((policy !== undefined && (!isObject(policy) || typeof policy.enabled !== 'boolean')) || (s.system32Assist !== undefined && typeof s.system32Assist !== 'boolean'))
    return label + ': повреждена настройка System32.';
  const rates = s.costSettings;
  if (
    rates !== undefined && rates !== null &&
    (!isObject(rates) || rates.schema !== 'modulero.kitchen.rates.v1' || !Array.isArray(rates.rates) || !['RUB', 'EUR', 'USD'].includes(rates.currency as string) || typeof rates.includeAppliances !== 'boolean')
  )
    return 'Неверный формат ставок. Используйте шаблон ставок кухни.';
  const fc = s.facadeChoice;
  if (
    fc !== undefined && fc !== null &&
    (!isObject(fc) || ['materialId', 'executionId', 'materialTitle', 'executionTitle'].some((k) => typeof fc[k] !== 'string' || !fc[k]) || !['MANUFACTURE', 'PURCHASED'].includes(fc.supply as string) ||
      !(fc.thicknessMm === 'BOARD' || (num(fc.thicknessMm) && fc.thicknessMm > 0)) || !(fc.colorText === null || typeof fc.colorText === 'string'))
  )
    return label + ': повреждён выбор материала фасадов.';
  const ko = s.kitchenOptions;
  if (ko !== undefined && (!isObject(ko) || Object.entries(ko).some(([k, v]) => !(KITCHEN_OPTION_KEYS as readonly string[]).includes(k) || !num(v) || (v as number) <= 0)))
    return label + ': повреждены настройки кухни.';
  if (s.cutting !== undefined && !isObject(s.cutting)) return label + ': повреждены параметры раскроя.';
  const fit = s.fittings;
  if (
    fit !== undefined &&
    (!isObject(fit) || Object.entries(fit).some(([k, v]) => !((k === 'handleId' && typeof v === 'string' && v) || (k === 'pushToOpen' && v === true))))
  )
    return label + ': повреждён выбор ручек и открывания фасадов.';
  const eo = s.edgeOverrides;
  if (eo !== undefined && (!isObject(eo) || Object.values(eo).some((x) => !isObject(x) || Object.values(x).some((v) => typeof v !== 'string'))))
    return label + ': повреждена ручная кромка деталей.';
  const wt = s.worktop;
  if (wt !== undefined && (!isObject(wt) || Object.entries(wt).some(([k, v]) => !(k === 'worktopId' && typeof v === 'string' && v)))) return label + ': повреждён выбор столешницы.';
  const bad = nonJsonPaths(s, label);
  return bad.length ? label + ': значение не переносится в JSON (' + bad[0] + ').' : null;
}

/**
 * KitchenProject of a schema-3 record (the global state's kitchenProject or one copy of a prototype file): derived keys,
 * the undo history and the computed result of modules (except legacy corners) left out, keys in the stored order,
 * deep copy. Throws the prototype's message when the record would not open. Pure.
 */
export function kitchenProjectFromRecord(record: unknown): KitchenProject {
  const error = kitchenRecordError(record);
  if (error) throw new Error(error);
  const s = record as Record<string, unknown>;
  const project: Record<string, unknown> = {};
  for (const key of KITCHEN_PROJECT_KEYS) if (own(s, key)) project[key] = clone(s[key]);
  project.modules = (project.modules as KitchenModule[]).map((m) => {
    if (isLegacyCorner(m)) return m;
    const { calculated: _, ...input } = m;
    return input;
  });
  return project as unknown as KitchenProject;
}

/** Canonical text of a record for comparing copies: object keys sorted (kcdCanonical, r1.html:80919). */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (isObject(value)) return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return String(JSON.stringify(value));
}

/**
 * The kitchen of a prototype project file (exportPayload('project')). The prototype opens the copy of the editing draft
 * or, without a draft, the one in settings, and refuses a file whose copies differ beyond chains and worktops
 * (krKitchenImportState, r1.html:80518). Here they are compared as KitchenProject: one copy is the input. Throws the
 * prototype's messages. Pure.
 */
export function kitchenProjectFromPrototypeFile(payload: unknown): KitchenProject {
  if (!isObject(payload)) throw new Error('В файле нет проекта кухни.');
  const settings = isObject(payload.settings) ? payload.settings.kitchenProject : undefined;
  if (!isObject(settings)) throw new Error('В файле нет проекта кухни.');
  const domainState = isObject(payload.editingDraft) ? payload.editingDraft.domainState : undefined;
  const draft = isObject(domainState) ? domainState.kitchenProject : undefined;
  const depth = isObject(payload.depthViewSnapshot) ? payload.depthViewSnapshot.domain : undefined;
  const witness = isObject(depth) ? depth.kitchenProject : undefined;
  if (domainState !== undefined && draft === undefined) throw new Error('В файле отсутствует кухня в сохраняемом состоянии. Текущий проект сохранён.');
  const chosen = kitchenProjectFromRecord(draft ?? settings);
  for (const copy of [settings, draft, witness])
    if (copy !== undefined && canonical(kitchenProjectFromRecord(copy)) !== canonical(chosen))
      throw new Error('В файле противоречат параметры кухни. Текущий проект сохранён; откройте согласованную сохранённую копию.');
  return chosen;
}

/** Everything the kitchen of the prototype depends on: the project and the prototype version (its catalogs). */
export interface KitchenInput {
  schema: typeof KITCHEN_INPUT_SCHEMA;
  prototype: string;
  project: KitchenProject;
}

/** Canonical KitchenInput: the project as kitchenProjectFromRecord gives it. Throws for an incomplete input. Pure. */
export function normalizeKitchenInput(raw: unknown): KitchenInput {
  if (!isObject(raw)) throw new Error('KitchenInput: not an object');
  const unknown = Object.keys(raw).filter((k) => !['schema', 'prototype', 'project'].includes(k));
  if (unknown.length) throw new Error('KitchenInput: unknown fields ' + unknown.join(', '));
  if (raw.schema !== KITCHEN_INPUT_SCHEMA) throw new Error(`KitchenInput: expected schema ${KITCHEN_INPUT_SCHEMA}`);
  if (typeof raw.prototype !== 'string' || !raw.prototype) throw new Error('KitchenInput: expected the APP_VERSION of the prototype');
  return { schema: KITCHEN_INPUT_SCHEMA, prototype: raw.prototype, project: kitchenProjectFromRecord(raw.project) };
}

/** The saved form of an input (reference/kitchen-input/<suite>/<name>.json). */
export function kitchenInputText(input: KitchenInput): string {
  return JSON.stringify(normalizeKitchenInput(input), null, 1) + '\n';
}
