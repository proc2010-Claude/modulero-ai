// One project file format for every furniture kind, plus readers for everything the prototype r1 saved.
//
//   { format: "modulero.project", formatVersion: 1, kind, app, savedAt, digest, catalogs, project }
//
// `catalogs.hardware` — the release of the hardware catalogue the result was computed with (MOD-DEC-351, task CAT-2):
// on opening, a project of another release is told so (catalogReleaseChange). Files saved before it have no
// `catalogs`: there is nothing to compare with.
//
// Only inputs are stored. Derived data (parts, drilling, price) is recomputed by the core on load,
// unlike the prototype export, which persisted the whole computed model (~800 KB per wardrobe).
// A kitchen is stored as one KitchenProject (K2, KF-22), not as the three copies of the prototype export.
// A swing wardrobe is stored as one WardrobeProject: its input and what its result was computed with (MOD-DEC-351).
import { isCurrent, isPrototypeRuleSet, ratesForR4, validate, type Rates } from '../home/index.js';
import { kitchenCuttingProblem, kitchenProjectFromPrototypeFile, kitchenProjectFromRecord } from '../kitchen/index.js';
import { reopenWardrobeProject, wardrobeProjectToSave } from '../wardrobe/project.js';
import { catalogReleaseChange, type CatalogRelease, type HardwareCatalogs } from '../catalog/hardware/release.js';
import { canonicalJson, contentDigest } from './digest.js';

export type ProjectKind = 'home' | 'wardrobe' | 'sliding' | 'kitchen';
export const FORMAT = 'modulero.project' as const;
export const FORMAT_VERSION = 1 as const;

export interface ProjectFile<P = unknown> {
  format: typeof FORMAT;
  formatVersion: typeof FORMAT_VERSION;
  kind: ProjectKind;
  app: { name: string; version: string };
  savedAt: string;
  digest: string;
  /** Releases of the catalogues the project was computed with; absent in files saved before CAT-2. */
  catalogs?: { hardware: CatalogRelease };
  project: P;
}

export type ProjectOrigin =
  | 'modulero.project'
  | 'prototype-home-envelope'
  | 'home-bare-json'
  | 'prototype-wardrobe-export'
  | 'prototype-sliding-export'
  | 'prototype-kitchen-export';

export interface OpenedProject {
  kind: ProjectKind;
  origin: ProjectOrigin;
  /** The core can edit this project now. */
  editable: boolean;
  /** Saved by an older generator (home: show migrationPreview()) or computed differently now (wardrobe: show `changes`) — open only with consent. */
  needsMigration: boolean;
  project: unknown;
  messages: string[];
  /** Wardrobe: what the current version changes in the result and which versions differ (MOD-DEC-351). */
  changes?: string[];
  /** Release of the hardware catalogue written in the file; null — the file has none (older format or prototype). */
  hardwareCatalog: CatalogRelease | null;
}

/**
 * A kitchen is written as its KitchenProject: derived data and the undo history are left out, one copy (KF-22).
 * A swing wardrobe is written as its WardrobeProject (wardrobeProject: the input and what its result is computed
 * with), computed with the release it is written with.
 */
export function writeProjectFile(kind: ProjectKind, project: unknown, opts: { appVersion: string; now?: Date; hardwareCatalog: CatalogRelease }): string {
  if (kind === 'kitchen') project = kitchenProjectFromRecord(project);
  if (kind === 'wardrobe' || kind === 'sliding') {
    const p = wardrobeProjectToSave(project, opts.hardwareCatalog);
    // A sliding wardrobe is written as `kind: "sliding"` (FINDINGS 580): the kind of the file is the domain of the input.
    if ((p.input.domain === 'sliding') !== (kind === 'sliding')) throw Error(`Проект ${p.input.domain === 'sliding' ? 'шкафа-купе' : 'распашного шкафа'} не записывается как «${kind}».`);
    project = p;
  }
  const file: ProjectFile = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    kind,
    app: { name: 'Modulero', version: opts.appVersion },
    savedAt: (opts.now ?? new Date()).toISOString(),
    digest: contentDigest(project),
    catalogs: { hardware: { version: opts.hardwareCatalog.version, sha256: opts.hardwareCatalog.sha256 } },
    project,
  };
  return JSON.stringify(file, null, 2);
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const onlyKeys = (o: unknown, keys: string[]) => isObject(o) && Object.keys(o).every((k) => keys.includes(k));

const PROTOTYPE_ONLY =
  'Этот тип мебели пока редактируется в прототипе r1. Откройте файл там; перенос в новое ядро — следующий этап (docs/MIGRATION_PLAN.md).';
/** A kitchen opens in the editor of the graph (task U4); its cost is on the graph since K5 (R4-010, FINDINGS 1892). */
const KITCHEN_EDITOR = 'Кухня открыта в редакторе на новом движке: модули, детали, 3D и стоимость — из графа.';
const bytes = (n: number) => n.toLocaleString('ru-RU');

const isRelease = (v: unknown): v is CatalogRelease => onlyKeys(v, ['version', 'sha256']) && typeof (v as CatalogRelease).version === 'string' && typeof (v as CatalogRelease).sha256 === 'string';

/** The hardware release a file names, checked; and what the user is told when it is not the current one. */
function savedRelease(data: Record<string, unknown>, hw: HardwareCatalogs): { hardwareCatalog: CatalogRelease | null; messages: string[] } {
  if (data.catalogs === undefined) return { hardwareCatalog: null, messages: [] };
  const c = data.catalogs as Record<string, unknown>;
  if (!onlyKeys(c, ['hardware']) || !isRelease(c.hardware)) throw Error('Файл повреждён: версия каталога фурнитуры записана неверно.');
  const change = catalogReleaseChange(c.hardware, hw.release);
  return { hardwareCatalog: { version: c.hardware.version, sha256: c.hardware.sha256 }, messages: change ? [change] : [] };
}

/**
 * Reads any supported project file. Throws only for text that is not a Modulero project at all. The hardware
 * catalogue validates a home project and is compared with the release the file was saved with.
 */
export function readProjectFile(text: string, hw: HardwareCatalogs): OpenedProject {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw Error('Файл не является JSON.');
  }
  if (!isObject(data)) throw Error('Файл не похож на проект Modulero.');

  // 1. Current format.
  if (data.format === FORMAT) {
    if (data.formatVersion !== FORMAT_VERSION) throw Error('Файл сохранён более новой версией Modulero.');
    if (data.digest !== contentDigest(data.project)) throw Error('Контроль целостности не пройден: файл изменён или повреждён.');
    const kind = data.kind as ProjectKind,
      saved = savedRelease(data, hw);
    if (kind === 'home') {
      const opened = openHome(data.project, 'modulero.project', hw);
      return { ...opened, hardwareCatalog: saved.hardwareCatalog, messages: [...opened.messages, ...saved.messages] };
    }
    if (kind === 'kitchen') {
      const project = kitchenProjectFromRecord(data.project),
        // R4-011: the parameters of the cutting map have the limits of the wardrobe's (FINDINGS 1904).
        why = kitchenCuttingProblem(project);
      if (why) throw Error('Проект: ' + why);
      return { kind, origin: 'modulero.project', editable: true, needsMigration: false, project, messages: [KITCHEN_EDITOR, ...saved.messages], hardwareCatalog: saved.hardwareCatalog };
    }
    // A sliding wardrobe is a WardrobeProject of the domain «sliding» (FINDINGS 580); files of FINDINGS 367 say «wardrobe».
    if (kind === 'wardrobe' || kind === 'sliding') return openWardrobe(data.project, hw, saved, kind);
    return { kind, origin: 'modulero.project', editable: false, needsMigration: false, project: data.project, messages: [PROTOTYPE_ONLY, ...saved.messages], hardwareCatalog: saved.hardwareCatalog };
  }

  // 2. Home furniture saved by the prototype editor (src/home/editor.js envelope, versions 1–3).
  if (data.format === 'modulero.home-furniture.project') return readHomeEnvelope(data, hw);

  // 3. A bare home project object.
  if (Array.isArray(data.bodies) && typeof data.templateId === 'string') return openHome(data, 'home-bare-json', hw);

  // 4. Wardrobe / sliding / kitchen export of the prototype (projectJson(model())).
  if (typeof data.version === 'string' && isObject(data.settings) && isObject(data.engineeringRuleSet)) {
    const settings = data.settings as Record<string, unknown>;
    if (isObject(settings.kitchenProject)) {
      // The kitchen: one KitchenProject from the three copies of the file, which must agree (KF-22).
      const project = kitchenProjectFromPrototypeFile(data);
      return {
        kind: 'kitchen',
        origin: 'prototype-kitchen-export',
        editable: true,
        needsMigration: false,
        hardwareCatalog: null,
        project,
        messages: [
          KITCHEN_EDITOR,
          `Входные данные кухни: ${bytes(canonicalJson(project).length)} байт из ${bytes(text.length)} байт файла; остальное — история правок, рассчитанные данные и модель шкафа по умолчанию.`,
        ],
      };
    }
    const kind: ProjectKind = isObject(data.slidingWardrobe) ? 'sliding' : 'wardrobe';
    const inputs = kind === 'sliding' ? { settings, slidingWardrobe: data.slidingWardrobe } : { settings };
    return {
      kind,
      origin: `prototype-${kind}-export` as ProjectOrigin,
      editable: false,
      needsMigration: false,
      hardwareCatalog: null,
      project: inputs,
      messages: [
        PROTOTYPE_ONLY,
        `Входные данные: ${bytes(canonicalJson(inputs).length)} байт из ${bytes(text.length)} байт файла; остальное — рассчитанная модель.`,
      ],
    };
  }
  throw Error('Формат файла не распознан.');
}

/**
 * The wardrobe is built again by the current versions and release. The same result opens for editing; a changed one
 * needs the user's consent first (MOD-DEC-351): old releases are not kept yet (FINDINGS 295), so it opens by the
 * current one. A new release is one of the version lines, not a separate message.
 */
function openWardrobe(raw: unknown, hw: HardwareCatalogs, saved: { hardwareCatalog: CatalogRelease | null }, fileKind: 'wardrobe' | 'sliding'): OpenedProject {
  const r = reopenWardrobeProject(raw, hw),
    kind = r.saved.input.domain === 'sliding' ? 'sliding' : 'wardrobe';
  // A file of `kind: "sliding"` holds a sliding wardrobe; one of `kind: "wardrobe"` may hold either (FINDINGS 367, 580).
  if (fileKind === 'sliding' && kind !== 'sliding') throw Error('Файл повреждён: в проекте шкафа-купе записан распашной шкаф.');
  const messages = r.changed
    ? ['Проект посчитан прежней версией движка или каталога фурнитуры. По текущей версии расчёт изменится.']
    : r.changes.length
      ? ['Версии движка или каталогов обновились, расчёт проекта не изменился: ' + r.changes.join('; ') + '.']
      : [];
  // Prices of a draft update by themselves, with a visible note and the new total (MOD-DEC-351).
  if (!r.changed) messages.push(...r.prices);
  return { kind, origin: 'modulero.project', editable: !r.changed, needsMigration: r.changed, project: r.saved, messages, changes: r.changes, hardwareCatalog: saved.hardwareCatalog };
}

function openHome(project: unknown, origin: ProjectOrigin, hw: HardwareCatalogs): OpenedProject {
  if (isCurrent(project)) {
    // An r4 project saved before MOD-DEC-510: the rates the cutting plan replaced are cleared, with the reason.
    const rates = isObject(project.rates) ? ratesForR4(project.rates as Rates) : null,
      opened = rates ? { ...project, rates: rates.rates } : project;
    validate(opened, hw); // throws a user-facing message if the construction is invalid
    return { kind: 'home', origin, editable: true, needsMigration: false, project: opened, messages: rates?.message ? [rates.message] : [], hardwareCatalog: null };
  }
  return {
    kind: 'home',
    origin,
    editable: false,
    needsMigration: true,
    hardwareCatalog: null,
    project,
    messages: ['Проект создан прежней версией конструкции. Перед редактированием его нужно обновить.'],
  };
}

/** The prototype stored home projects as an immutable technical revision plus a commercial revision. */
function readHomeEnvelope(data: Record<string, unknown>, hw: HardwareCatalogs): OpenedProject {
  const r = data.projectRevision as Record<string, any>,
    c = data.commercialRevision as Record<string, any>;
  if (![1, 2, 3].includes(data.version as number)) throw Error('Этот формат проекта не поддерживается.');
  if (
    !onlyKeys(data, ['format', 'version', 'projectRevision', 'commercialRevision', 'constructionOrigins']) ||
    !onlyKeys(r, ['id', 'projectId', 'branchId', 'type', 'status', 'technicalSequence', 'parentRevisionIds', 'contentDigest', 'ruleProfileVersions', 'technicalInputs']) ||
    !onlyKeys(c, ['id', 'projectId', 'type', 'sequence', 'inputs']) ||
    !onlyKeys(c.inputs, ['rates', 'rateNote', 'rateDate']) ||
    !onlyKeys(r.technicalInputs, ['schema', 'controls', 'domainState']) ||
    !onlyKeys(r.technicalInputs.domainState, ['homeFurnitureProject'])
  )
    throw Error('Проект содержит неподдерживаемые поля или повреждённую ревизию.');
  if (r.branchId !== 'HOME_FURNITURE' || r.type !== 'ProjectRevision' || c.type !== 'CommercialRevision' || c.projectId !== r.projectId)
    throw Error('Повреждена ревизия проекта.');
  const t = r.technicalInputs.domainState.homeFurnitureProject;
  if (!t || t.id !== r.projectId || r.contentDigest !== contentDigest(t)) throw Error('Контроль целостности проекта не пройден.');
  const project = { ...t, ...c.inputs };
  // The prototype editor saved home-physical-r3 in envelope version 3 and older generators in versions 1–2.
  if ((data.version === 3) !== isPrototypeRuleSet(project)) throw Error('Версия конструкции не соответствует формату проекта.');
  return openHome(project, 'prototype-home-envelope', hw);
}
