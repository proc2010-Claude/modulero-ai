// Production data of one version of the product (task PROD-1, stage 1; RELEASE_1_SCOPE §4): the status «Готово к
// изготовлению» / «Номинальный черновик» and the production package — the title page with the status, the general
// drawing, the specification of the parts, the hardware kit, the assembly scheme and the sheets of the parts. Every
// page is read from one graph and carries its revision (INV-H25-01, INV-S04); a draft is marked «не для изготовления»
// on every page (RELEASE_1_SCOPE §4.2, acceptance П6). The product supplies only what the graph does not hold: the
// priced lines of its kit and the verdict of its price.
//
// The PDF is printed from the document of the sheets by the browser, as the drawings are (drawing-export.ts,
// FINDINGS 544): every page is an SVG sheet of its own paper, so the package, its zip and its PDF are one set of pages.
import type { Graph, JointKind, Mechanism, MechanismKind, Part } from './contract.js';
import { cuttingSheets, type CuttingPlan } from './cutting.js';
import { drawingDocumentHtml, zipFiles, crc32 } from './drawing-export.js';
import { axonometry, drawingIdentity, generalSheet, partSheets, sheetPrimitives as P, type DrawingIdentity, type Sheet } from './drawings.js';
import { INVARIANTS, type InvariantResult } from './invariants/index.js';
import { drawingSheets } from './policy/drawing.js';
import { productionPackage as policy, type AssemblyStepRule } from './policy/production-package.js';
import { sceneOf, type ScenePart } from './scene.js';

// ---------------------------------------------------------------- the status of the version

export type ManufactureStatus = 'READY_FOR_MANUFACTURE' | 'DRAFT';
export type ReadinessConditionId = 'HARDWARE' | 'INVARIANTS' | 'PRICES' | 'VERIFIED_SCOPE' | 'QUALIFICATION';

/** One condition of RELEASE_1_SCOPE §4.2: met or not, and why not, in plain Russian. */
export interface ReadinessCondition {
  id: ReadinessConditionId;
  title: string;
  met: boolean;
  reasons: string[];
  /** What the user should know even when the condition is met (conditional prices). */
  notes: string[];
}

export interface ManufactureReadiness {
  status: ManufactureStatus;
  /** «Готово к изготовлению» or «Номинальный черновик». */
  label: string;
  /** The mark of every page of a draft; null when ready. */
  mark: string | null;
  /** Revision of the project the status is about: one version (MOD-DEC-026). */
  revision: string;
  conditions: ReadinessCondition[];
}

/** The verdict of the price of the product: complete when every price is known or conditional (MOD-DEC-247, 264). */
export interface PriceReadiness {
  complete: boolean;
  /** What has no price; empty when complete. */
  unknown: string[];
  /** The lines whose price is conditional. */
  conditional: string[];
}

export interface ReadinessInput {
  /** Results of the invariant library on this graph (checkInvariants). */
  invariants: InvariantResult[];
  price: PriceReadiness;
  /** The combination is in the verified scope of the release (RELEASE_1_SCOPE §7, П6); no scope yet — absent. */
  verifiedScope?: { verified: boolean; reason: string } | null;
}

export const MECHANISM_RU: Readonly<Record<MechanismKind, string>> = Object.freeze({
  HINGE: 'Петли',
  DRAWER_RUNNER: 'Направляющие ящиков',
  CLOTHES_ROD: 'Штанга',
  FACADE_LIFT: 'Подъёмник фасада',
  SHELF_SUPPORT: 'Полкодержатели',
  SLIDING_SYSTEM: 'Система раздвижных дверей',
  SUPPORT_LEG: 'Опоры',
  SUSPENSION_RAIL: 'Навесная шина',
  APPLIANCE: 'Техника',
  DRAWER_BOX: 'Короб ящика',
  ANTI_TIP: 'Крепление к стене',
  HANDLE: 'Ручки',
  LIGHT: 'Подсветка',
  POWER_SUPPLY: 'Блок питания подсветки',
  PUSH_LATCH: 'Толкатели открывания нажатием',
  BASKET: 'Корзины выдвижные',
  TROUSER_RACK: 'Вешала для брюк',
  PANTOGRAPH: 'Пантографы',
  CABLE_OUTLET: 'Вывод проводов',
});

const CAPABILITY_RU: Readonly<Record<string, string>> = { RESOLVED: 'подобрано', PLACEHOLDER: 'заглушка', HOLD: 'нет данных — ждёт решения' };

const NO_SCOPE = 'Проверенный объём выпуска ещё не утверждён: приёмка по сценарию RELEASE_1_SCOPE §7 не проводилась.';

/** Mode of an invariant of the library; an id the library does not know counts as mandatory. */
const modeOf = (id: string) => INVARIANTS.find((e) => e.id === id)?.mode ?? 'check';

/** Equal reasons of several elements said once, with their count. */
function counted(items: string[]): string[] {
  const n = new Map<string, number>();
  for (const x of items) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].map(([x, k]) => (k > 1 ? `${x} (×${k})` : x));
}

/**
 * The status of the version (RELEASE_1_SCOPE §4.2, FE-01 `productionReadiness`): «Готово к изготовлению» only when
 * all the hardware is resolved in the release catalogue, the mandatory invariants are checked without a violation,
 * every price is known or marked conditional, the combination is in the verified scope and the graph itself is
 * ready for production (physical qualification of joints and drilling, a production adapter). Anything else is
 * a nominal draft. A ready status implies the PRODUCTION qualification of the exports of the graph.
 */
export function manufactureReadiness(g: Pick<Graph, 'mechanisms' | 'unresolved' | 'result' | 'revision'>, input: ReadinessInput): ManufactureReadiness {
  const C = policy.constants,
    installation = new Set<MechanismKind>(C.installationMechanisms.value),
    hardware = counted(g.mechanisms.filter((m) => m.capability.status !== 'RESOLVED' && !installation.has(m.kind)).map((m) => `${MECHANISM_RU[m.kind] ?? m.kind}: ${m.capability.reason ?? CAPABILITY_RU[m.capability.status]}`)),
    mandatory = input.invariants.filter((r) => modeOf(r.id) === 'check' || modeOf(r.id) === 'block_addition'),
    invariants = [
      ...(input.invariants.length ? [] : ['Инварианты не проверялись.']),
      ...mandatory.flatMap((r) => r.violations.map((v) => `${r.id}: ${v.text}`)),
      ...mandatory.filter((r) => r.status === 'UNKNOWN').map((r) => `${r.id}: не проверен — ${r.reason ?? 'нет данных'}`),
    ],
    pr = g.result.productionReadiness,
    qualification =
      pr.status === 'READY'
        ? []
        : pr.status === 'ADAPTER_REQUIRED'
          ? ['Нет производственного адаптера (MOD-DEC-030).']
          : pr.blockers.flatMap((code) => (code === 'INVALID' ? ['Конструкция недопустима: в графе есть ошибки.'] : [...new Set(g.unresolved.filter((u) => u.code === code).map((u) => u.text))])),
    scope = input.verifiedScope ?? null,
    conditions: ReadinessCondition[] = [
      { id: 'HARDWARE', title: 'Вся фурнитура подобрана по каталогу выпуска, с комплектом и монтажом', met: !hardware.length, reasons: hardware, notes: [] },
      { id: 'INVARIANTS', title: 'Обязательные инварианты проверены без нарушений', met: !invariants.length, reasons: invariants, notes: [] },
      {
        id: 'PRICES',
        title: 'Все цены известны или помечены условными',
        met: input.price.complete,
        reasons: input.price.complete ? [] : input.price.unknown.length ? input.price.unknown : ['Итог цены не определён.'],
        notes: input.price.conditional.length ? [`Условных цен: ${input.price.conditional.length}.`] : [],
      },
      { id: 'VERIFIED_SCOPE', title: 'Сочетание входит в проверенный объём выпуска', met: !!scope?.verified, reasons: scope?.verified ? [] : [scope?.reason || NO_SCOPE], notes: [] },
      { id: 'QUALIFICATION', title: 'Граф готов к производству: соединения и присадка квалифицированы', met: pr.status === 'READY', reasons: qualification, notes: [] },
    ],
    ready = conditions.every((c) => c.met);
  return {
    status: ready ? 'READY_FOR_MANUFACTURE' : 'DRAFT',
    label: ready ? C.readyLabel.value : C.draftLabel.value,
    mark: ready ? null : C.draftMark.value,
    revision: g.revision.projectRevisionId,
    conditions,
  };
}

// ---------------------------------------------------------------- the package

/** A purchased line of the kit, priced by the product: an article, its quantity and its price as the estimate gives it. */
export interface KitLine {
  group: string;
  item: string;
  qty: number | null;
  unit: string;
  /** «160 ₽», «120 ₽ · условная», «Цена не определена». */
  price: string;
}

export interface PackageInput {
  readiness: ManufactureReadiness;
  /** Name of the product on every page: «Шкаф распашной 1500 × 2400 × 600 мм». */
  title: string;
  appVersion?: string;
  kit: KitLine[];
  /** Notes under the kit: what is not priced, how the prices are rounded. */
  kitNotes?: string[];
  /** The cutting plan the user made for this revision (CUT-1); its maps are a section of the package. */
  cutting?: CuttingPlan | null;
}

export type PackageSectionId = 'TITLE' | 'GENERAL' | 'SPECIFICATION' | 'CUTTING' | 'KIT' | 'ASSEMBLY' | 'PARTS';

export interface PackageSection {
  id: PackageSectionId;
  title: string;
  /** Page of the package the section starts on, from 1. */
  firstPage: number;
  pages: number;
}

/** One step of the assembly scheme as the package draws it. */
export interface AssemblyStep {
  /** Number of the step in the scheme, from 1; empty steps of the rules are left out. */
  n: number;
  rule: AssemblyStepRule;
  partIds: string[];
  mechanismIds: string[];
  /** Fixing points of the graph made at this step, by kind and profile of the joint. */
  fasteners: { kind: JointKind; profileId: string; stations: number }[];
  installation: string[];
}

export interface ProductionPackage {
  title: string;
  readiness: ManufactureReadiness;
  revision: string;
  sections: PackageSection[];
  steps: AssemblyStep[];
  /** Every page of the package in order, marked: the printable page, the zip and the PDF are these pages. */
  sheets: Sheet[];
}

const [A4W, A4H] = drawingSheets.constants.partSheetMm.value;
/** Lowest baseline of the body of a page: the stamp of the sheets starts 30 mm above the bottom. */
const BODY_BOTTOM = A4H - 34;
const LINE = 3.6;

const PRODUCT_RU = P.PRODUCT_RU as Readonly<Record<Graph['product'], string>>;
const JOINT_RU: Readonly<Record<JointKind, string>> = { CONFIRMAT: 'Конфирмат', CAM_CONNECTOR: 'Эксцентрик', DOWEL: 'Шкант', GROOVE_FIT: 'Паз', SCREW: 'Саморез', GLUE: 'Клей', BEARING_CONTACT: 'Опора' };

/** Text of a cell in at most `max` lines of the column, the last one cut with «…». */
function cell(s: string, widthMm: number, max = 2): string[] {
  const lines = P.wrapText(s, widthMm - 2);
  if (lines.length <= max) return lines;
  const out = lines.slice(0, max),
    last = out[max - 1]!;
  out[max - 1] = (last.length > 1 ? last.slice(0, -1) : last) + '…';
  return out;
}

interface Column {
  title: string;
  widthMm: number;
}
interface Block {
  caption: string;
  columns: Column[];
  rows: string[][];
  /** Graph id of each row (`data-part-id` and the like), so a row is found by its id and not by its wrapped text. */
  rowIds?: { attr: string; ids: string[] };
}

/** Lines of a page body: a caption, the head of a table, a row, or a note. */
type Line = { kind: 'caption'; text: string } | { kind: 'head'; block: Block } | { kind: 'row'; block: Block; cells: string[][]; index: number } | { kind: 'note'; text: string };

const lineHeight = (l: Line) => (l.kind === 'caption' ? 7 : l.kind === 'head' ? 6 : l.kind === 'row' ? 1.4 + Math.max(...l.cells.map((c) => c.length)) * LINE : LINE + 0.6);

/**
 * Tables of a section split into A4 pages: a row is never cut, the head of its table repeats on the next page, the
 * notes follow the last table. Returns the bodies of the pages, below a header that ends at `top`.
 */
function tablePages(blocks: Block[], notes: string[], top: number): string[] {
  const lines: Line[] = [];
  for (const b of blocks) {
    lines.push({ kind: 'caption', text: b.caption }, { kind: 'head', block: b });
    b.rows.forEach((r, index) => lines.push({ kind: 'row', block: b, index, cells: r.map((v, i) => cell(v, b.columns[i]!.widthMm)) }));
    if (!b.rows.length) lines.push({ kind: 'note', text: 'Нет позиций.' });
  }
  for (const n of notes) for (const t of P.wrapText(n, A4W - 20)) lines.push({ kind: 'note', text: t });
  const pages: string[] = [];
  let body = '',
    y = top,
    head: Block | null = null;
  const flush = () => {
    pages.push(body);
    body = '';
    y = top;
  };
  for (const l of lines) {
    const h = lineHeight(l);
    if (y + h > BODY_BOTTOM && y > top) {
      flush();
      // A table continues: its head again at the top of the new page.
      if (l.kind === 'row' && head) {
        body += renderLine({ kind: 'head', block: head }, y);
        y += lineHeight({ kind: 'head', block: head });
      }
    }
    if (l.kind === 'head') head = l.block;
    if (l.kind === 'caption') head = null;
    body += renderLine(l, y);
    y += h;
  }
  if (body || !pages.length) flush();
  return pages;
}

function renderLine(l: Line, y: number): string {
  if (l.kind === 'caption') return P.text(10, y + 5, l.text, 3.5, 'font-weight="700"');
  if (l.kind === 'note') return P.text(10, y + LINE, l.text, P.MIN_TEXT, `fill="${P.SOFT}"`);
  const cols = l.block.columns;
  let x = 10,
    s = '';
  if (l.kind === 'head') {
    for (const c of cols) {
      s += P.text(x + 1, y + 4, cell(c.title, c.widthMm, 1)[0]!, P.MIN_TEXT, 'font-weight="700"');
      x += c.widthMm;
    }
    return s + P.strokes(P.line(10, y + 5.6, 10 + cols.reduce((n, c) => n + c.widthMm, 0), y + 5.6, 0.25));
  }
  const h = lineHeight(l),
    ids = l.block.rowIds;
  if (ids) s += `<g ${ids.attr}="${P.esc(ids.ids[l.index])}">`;
  cols.forEach((c, i) => {
    l.cells[i]!.forEach((t, k) => (s += P.text(x + 1, y + LINE * (k + 1), t, P.MIN_TEXT)));
    x += c.widthMm;
  });
  if (ids) s += '</g>';
  return s + P.strokes(P.line(10, y + h - 0.2, x, y + h - 0.2, 0.1, `stroke="${P.SOFT}"`));
}

/** A4 page of the package: the header and the stamp of the sheets around a body. */
function a4Page(name: string, title: string, sub: string, id: DrawingIdentity, body: (top: number) => string, page: number, total: number, foot: [string[], string[]]): Sheet {
  const hd = P.header(title, sub, id, A4W, page, total);
  const svg = P.svgOpen(A4W, A4H, 'PACKAGE', `data-package-page="${P.esc(name)}"`) + hd.svg + body(hd.bottom + 4) + P.footer(A4W, A4H, [foot[0], foot[1], P.stampLines(id)]) + P.SVG_CLOSE;
  return { name, partId: null, side: null, page, pages: total, widthMm: A4W, heightMm: A4H, scale: 0, operationIds: [], svg };
}

/** Bottom of the header of an A4 page with a one-line title: the bodies of a section are laid out against it. */
const bodyTop = (id: DrawingIdentity) => P.header('X', 'X', id, A4W, 1, 1).bottom + 4;

/** Sheets of a section of tables; pages numbered within the section. */
function tableSection(name: string, title: string, sub: string, id: DrawingIdentity, blocks: Block[], notes: string[], foot: [string[], string[]]): Sheet[] {
  const bodies = tablePages(blocks, notes, bodyTop(id));
  return bodies.map((b, i) => a4Page(`${name}-${i + 1}`, title, sub, id, () => b, i + 1, bodies.length, foot));
}

const size = (L: number, W: number, T?: number) => [L, W, ...(T === undefined ? [] : [T])].map(P.fmt).join(' × ');
/** Band thickness of edges A, B, C, D in this order; «—» — no band. */
const edgesText = (p: Part) => (['A', 'B', 'C', 'D'] as const).map((s) => (p.edges[s].intent === 'NONE' ? '—' : P.fmt(p.edges[s].edgeBandThicknessMm))).join(' · ');

function specificationBlocks(g: Graph): Block[] {
  const columns: Column[] = [
    { title: '№', widthMm: 8 },
    { title: 'ID детали', widthMm: 58 },
    { title: 'Наименование', widthMm: 52 },
    { title: 'E: Д × Ш × Т', widthMm: 32 },
    { title: 'F: Д × Ш', widthMm: 24 },
    { title: 'Материал', widthMm: 28 },
    { title: 'Кромка A · B · C · D', widthMm: 36 },
    { title: 'Поставка', widthMm: 23 },
    { title: 'Кол.', widthMm: 10 },
  ];
  const rows = g.parts.map((p, i) => {
    const E = p.finishedWithEdge,
      F = p.dimensionChain.finishedPart;
    return [String(i + 1), p.id, p.name, size(E.lengthMm, E.widthMm, E.panelThicknessMm), F ? size(F.lengthMm, F.widthMm) : '—', `${p.material.label} · ${P.fmt(p.material.panelThicknessMm)} мм`, edgesText(p), p.supply === 'PURCHASED' ? 'купить' : 'изготовить', '1'];
  });
  return [{ caption: `Детали изделия: ${g.parts.length}`, columns, rows, rowIds: { attr: 'data-part-id', ids: g.parts.map((p) => p.id) } }];
}

function kitBlocks(g: Graph, kit: KitLine[]): Block[] {
  return [
    {
      caption: 'Фурнитура и крепёж по смете',
      columns: [
        { title: '№', widthMm: 8 },
        { title: 'Группа', widthMm: 30 },
        { title: 'Позиция', widthMm: 130 },
        { title: 'Кол.', widthMm: 20 },
        { title: 'Ед.', widthMm: 17 },
        { title: 'Цена строки', widthMm: 72 },
      ],
      rows: kit.map((k, i) => [String(i + 1), k.group, k.item, k.qty === null ? 'не определено' : P.fmt(k.qty), k.unit, k.price]),
    },
    {
      caption: 'Механизмы изделия',
      columns: [
        { title: '№', widthMm: 8 },
        { title: 'Механизм', widthMm: 40 },
        { title: 'ID', widthMm: 56 },
        { title: 'Каталог', widthMm: 36 },
        { title: 'Кол.', widthMm: 20 },
        { title: 'Статус', widthMm: 117 },
      ],
      rowIds: { attr: 'data-mechanism-id', ids: g.mechanisms.map((m) => m.id) },
      rows: g.mechanisms.map((m, i) => [
        String(i + 1),
        MECHANISM_RU[m.kind] ?? m.kind,
        m.id,
        m.profile.catalogId,
        knownQuantity(m) ? String(m.quantity) : 'не определено',
        `${CAPABILITY_RU[m.capability.status] ?? m.capability.status}${m.capability.reason ? ': ' + m.capability.reason : ''}`,
      ]),
    },
    {
      caption: 'Места крепления по графу',
      columns: [
        { title: '№', widthMm: 8 },
        { title: 'Соединение', widthMm: 40 },
        { title: 'Профиль', widthMm: 92 },
        { title: 'Мест', widthMm: 20 },
        { title: 'Соединений', widthMm: 117 },
      ],
      rows: jointGroups(g.joints).map((j, i) => [String(i + 1), JOINT_RU[j.kind] ?? j.kind, j.profileId, String(j.stations), String(j.joints)]),
    },
  ];
}

/** A count the graph does not know — a placeholder, or no article and 0 — is unknown, never zero. */
const knownQuantity = (m: Mechanism) => m.capability.status !== 'PLACEHOLDER' && !(m.profile.catalogId === 'UNKNOWN' && m.quantity === 0);

/** Mechanisms by kind and catalogue with their total quantity: «Петли BOYARD_H316B02 — 4». */
function mechanismTotals(ms: Mechanism[]): string[] {
  const out = new Map<string, { name: string; qty: number | null }>();
  for (const m of ms) {
    const key = `${m.kind}|${m.profile.catalogId}`,
      x = out.get(key) ?? { name: `${MECHANISM_RU[m.kind] ?? m.kind} ${m.profile.catalogId}`, qty: 0 };
    x.qty = x.qty === null || !knownQuantity(m) ? null : x.qty + m.quantity;
    out.set(key, x);
  }
  return [...out.values()].map((x) => `${x.name} — ${x.qty === null ? 'кол. не определено' : x.qty}`);
}

/** Joints grouped by kind and profile: how many joints and fixing points (stations) of each. */
function jointGroups(joints: Graph['joints']): { kind: JointKind; profileId: string; stations: number; joints: number }[] {
  const out = new Map<string, { kind: JointKind; profileId: string; stations: number; joints: number }>();
  for (const j of joints) {
    const key = `${j.kind}|${j.profileId}`,
      x = out.get(key) ?? { kind: j.kind, profileId: j.profileId, stations: 0, joints: 0 };
    x.stations += j.stationsMm.length;
    x.joints++;
    out.set(key, x);
  }
  return [...out.values()];
}

/**
 * The steps of the assembly scheme: every part in the first step whose roles hold its role, else in the last step;
 * a mechanism by its kind the same way; a joint at the step of the later of its two parts. Steps with nothing to do
 * are left out.
 */
export function assemblySteps(g: Pick<Graph, 'parts' | 'mechanisms' | 'joints' | 'result'>): AssemblyStep[] {
  const rules = policy.constants.assemblySteps.value,
    last = rules.length - 1,
    stepOfRole = (role: Part['role']) => {
      const i = rules.findIndex((r) => r.roles.includes(role));
      return i < 0 ? last : i;
    },
    stepOfPart = new Map(g.parts.map((p) => [p.id, stepOfRole(p.role)])),
    stepOfMechanism = (kind: MechanismKind) => {
      const i = rules.findIndex((r) => r.mechanisms.includes(kind));
      return i < 0 ? last : i;
    },
    installation = [...new Set(g.result.installationRequirements.map((r) => r.text))];
  const steps = rules.map((rule, i) => {
    const joints = g.joints.filter((j) => Math.max(stepOfPart.get(j.parts.throughPartId) ?? last, stepOfPart.get(j.parts.receivingPartId) ?? last) === i && j.stationsMm.length > 0);
    return {
      n: 0,
      rule,
      partIds: g.parts.filter((p) => stepOfPart.get(p.id) === i).map((p) => p.id),
      mechanismIds: g.mechanisms.filter((m) => stepOfMechanism(m.kind) === i).map((m) => m.id),
      fasteners: jointGroups(joints).map(({ kind, profileId, stations }) => ({ kind, profileId, stations })),
      installation: rule.installation ? installation : [],
    };
  });
  return steps.filter((s) => s.partIds.length || s.mechanismIds.length || s.installation.length).map((s, k) => ({ ...s, n: k + 1 }));
}

/** The faces of the parts a step puts in, tinted so they stand out from the parts already in place. */
const NEW_TINT: Readonly<Record<string, string>> = { '#fff': '#dce7f3', '#eceae6': '#c4d5e8', '#f7f6f3': '#e8eff7' };

/** Two steps on a page: the parts put in so far, the new ones outlined, and what the assembler does. */
function assemblyPages(g: Graph, steps: AssemblyStep[], id: DrawingIdentity, foot: [string[], string[]]): Sheet[] {
  const scene = sceneOf(g),
    all = axonometry(scene.parts),
    pts = all.faces.flatMap((f) => f.pts.map(all.raw)),
    minU = Math.min(...pts.map((p) => p[0])),
    maxU = Math.max(...pts.map((p) => p[0])),
    minV = Math.min(...pts.map((p) => p[1])),
    maxV = Math.max(...pts.map((p) => p[1])),
    names = new Map(g.parts.map((p) => [p.id, p.name])),
    mechanisms = new Map(g.mechanisms.map((m) => [m.id, m])),
    done = new Set<string>(),
    per = 2,
    total = Math.max(1, Math.ceil(steps.length / per)),
    pages: Sheet[] = [];
  const colW = (A4W - 20 - 8) / per;
  // The view of one step: the whole product framed the same way on every step, so the steps line up.
  const view = (s: AssemblyStep, x0: number, y0: number, w: number, h: number) => {
    const shown: ScenePart[] = scene.parts.filter((p) => done.has(p.id) || s.partIds.includes(p.id)),
      { faces, raw } = axonometry(shown),
      k = Math.min(w / Math.max(1, maxU - minU), h / Math.max(1, maxV - minV)),
      P2 = (q: [number, number, number]) => {
        const [u, v] = raw(q);
        return `${P.n2(x0 + (u - minU) * k)},${P.n2(y0 + (v - minV) * k)}`;
      },
      isNew = new Set(s.partIds);
    return P.strokes(
      faces
        .map((f) =>
          isNew.has(f.id)
            ? `<polygon data-part-id="${P.esc(f.id)}" data-step-new="true" points="${f.pts.map(P2).join(' ')}" fill="${NEW_TINT[f.shade] ?? f.shade}" stroke-width="0.35" stroke-linejoin="round"/>`
            : `<polygon data-part-id="${P.esc(f.id)}" points="${f.pts.map(P2).join(' ')}" fill="#f1f0ed" stroke="${P.SOFT}" stroke-width="0.12" stroke-linejoin="round"/>`,
        )
        .join(''),
    );
  };
  const textOf = (s: AssemblyStep): { text: string; attrs?: string }[] => [
    { text: s.rule.text },
    ...(s.partIds.length ? [{ text: `Детали (${s.partIds.length}): ${s.partIds.map((p) => `${p} — ${names.get(p) ?? ''}`).join('; ')}` }] : []),
    ...(s.fasteners.length ? [{ text: `Крепёж, мест по графу: ${s.fasteners.map((f) => `${JOINT_RU[f.kind] ?? f.kind} ${f.profileId} — ${f.stations}`).join('; ')}` }] : []),
    ...(s.mechanismIds.length ? [{ text: `Механизмы: ${mechanismTotals(s.mechanismIds.map((m) => mechanisms.get(m)!)).join('; ')}` }] : []),
    ...s.installation.map((t) => ({ text: `Монтаж: ${t}`, attrs: 'font-weight="700"' })),
  ];
  for (let pi = 0; pi < total; pi++) {
    const chunk = steps.slice(pi * per, pi * per + per);
    let body = '';
    const top = bodyTop(id);
    chunk.forEach((s, c) => {
      const x = 10 + c * (colW + 8);
      // Text groups only: the lines of the view are drawn by `strokes`, which closes and reopens the text group.
      body += `<g data-step="${s.n}" data-step-id="${s.rule.id}">` + P.text(x, top + 4, `Шаг ${s.n}. ${s.rule.title}`, 3.5, 'font-weight="700"') + '</g>';
      body += view(s, x + 4, top + 9, colW - 8, 66);
      let y = top + 82;
      body += `<g data-step-text="${s.n}">`;
      for (const t of textOf(s))
        for (const l of P.wrapText(t.text, colW)) {
          if (y > BODY_BOTTOM) break;
          body += P.text(x, y, l, P.MIN_TEXT, t.attrs);
          y += LINE;
        }
      body += '</g>';
      for (const p of s.partIds) done.add(p);
    });
    pages.push(a4Page(`assembly-${pi + 1}`, `${PRODUCT_RU[g.product].toUpperCase()} · СХЕМА СБОРКИ`, 'Номинальный порядок: доступ инструмента в последовательности сборки (INV-H26-01) не проверен', id, () => body, pi + 1, total, foot));
  }
  return pages;
}

function titlePage(g: Graph, input: PackageInput, sections: PackageSection[], id: DrawingIdentity, foot: [string[], string[]]): Sheet {
  const r = input.readiness;
  return a4Page('title', 'ПРОИЗВОДСТВЕННЫЙ ПАКЕТ', input.title, id, (top) => {
    let s = '';
    // The status, large, and the conditions of RELEASE_1_SCOPE §4.2 with why each is not met.
    s += P.strokes(`<rect x="10" y="${P.n2(top)}" width="140" height="16" stroke-width="${r.mark ? 0.6 : 0.35}" data-status="${r.status}"/>`);
    s += P.text(14, top + 7, r.label.toUpperCase(), 5, 'font-weight="700"');
    s += P.text(14, top + 13, r.mark ? `${r.mark}: выполнены не все условия готовности` : 'Все условия готовности выполнены', P.MIN_TEXT);
    let y = top + 23;
    for (const c of r.conditions) {
      if (y > BODY_BOTTOM) break;
      s += `<g data-condition="${c.id}" data-met="${c.met}">` + P.text(10, y, `${c.met ? 'ДА' : 'НЕТ'}`, P.MIN_TEXT, 'font-weight="700"') + P.text(20, y, cell(c.title, 130, 1)[0]!, P.MIN_TEXT, 'font-weight="700"') + '</g>';
      y += LINE + 0.4;
      const more = [...c.reasons.slice(0, 2), ...(c.reasons.length > 2 ? [`… и ещё ${c.reasons.length - 2}`] : []), ...c.notes];
      for (const t of more)
        for (const l of cell(t, 130, 2)) {
          if (y > BODY_BOTTOM) break;
          s += P.text(20, y, l, P.MIN_TEXT, `fill="${P.SOFT}"`);
          y += LINE;
        }
      y += 1.6;
    }
    // The contents and the version of everything the package is read from.
    const x = 160;
    y = top + 4;
    s += P.text(x, y, 'Состав пакета', 3.5, 'font-weight="700"');
    y += 6;
    for (const sec of sections) {
      s += P.text(x, y, sec.title, P.MIN_TEXT) + P.text(A4W - 10, y, sec.pages > 1 ? `листы ${sec.firstPage}–${sec.firstPage + sec.pages - 1}` : `лист ${sec.firstPage}`, P.MIN_TEXT, 'text-anchor="end"');
      y += LINE + 0.4;
    }
    y += 4;
    s += P.text(x, y, 'Версия изделия', 3.5, 'font-weight="700"');
    y += 6;
    const v = g.versions,
      rows: [string, string][] = [
        ['Ревизия проекта', g.revision.projectRevisionId],
        ['Набор правил', v.ruleSet],
        ['Генератор', v.generator],
        ['Каталог', v.catalog],
        ['Каталог фурнитуры', v.hardwareCatalog.version],
        ['Снимок цен', v.priceSnapshotId ?? '—'],
        ['Пакет', `${policy.id}-${policy.version} · ${id.drawingVersion}`],
        ...(id.appVersion ? ([['Приложение', id.appVersion]] as [string, string][]) : []),
      ];
    for (const [k, val] of rows) {
      s += P.text(x, y, k, P.MIN_TEXT, `fill="${P.SOFT}"`) + P.text(x + 38, y, cell(val, A4W - 10 - x - 38, 1)[0]!, P.MIN_TEXT);
      y += LINE + 0.4;
    }
    y += 4;
    for (const l of P.wrapText('Размеры: E — готовая деталь с кромкой, F — деталь без кромки, мм. Присадка — от готовой детали в осях листа детали и файла присадки (MOD-DEC-169, 304).', A4W - 10 - x))
      if (y <= BODY_BOTTOM) {
        s += P.text(x, y, l, P.MIN_TEXT, `fill="${P.SOFT}"`);
        y += LINE;
      }
    return s;
  }, 1, 1, foot);
}

/**
 * Marks a page of the package: its number in the package and the status of the version at the bottom edge, and
 * across a draft page «не для изготовления» (RELEASE_1_SCOPE §4.2, П6). The page itself is not changed otherwise.
 */
function markSheet(sheet: Sheet, r: ManufactureReadiness, page: number, total: number): Sheet {
  const w = sheet.widthMm,
    h = sheet.heightMm,
    k = w / A4W,
    band = `${r.label.toUpperCase()}${r.mark ? ' · ' + r.mark : ''} · ревизия ${r.revision}`,
    mark =
      `<g data-package-mark="${r.status}" font-family="${P.esc(P.FONT)}" stroke="none">` +
      (r.mark ? `<text x="${P.n2(w / 2)}" y="${P.n2(h / 2)}" font-size="${P.n2(21 * k)}" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="#b3261e" fill-opacity="0.12" transform="rotate(-20 ${P.n2(w / 2)} ${P.n2(h / 2)})">${P.esc(r.mark)}</text>` : '') +
      P.text(10, h - 4, band, P.MIN_TEXT, `font-weight="700"${r.mark ? ' fill="#b3261e"' : ''}`) +
      P.text(w - 10, h - 4, `Пакет: лист ${page} из ${total}`, P.MIN_TEXT, 'text-anchor="end"') +
      '</g>';
  return { ...sheet, name: `${String(page).padStart(2, '0')}_${sheet.name}`, svg: sheet.svg.slice(0, -'</svg>'.length) + mark + '</svg>' };
}

/**
 * The production package of a graph: the title page, the general drawing, the specification, the hardware kit, the
 * assembly scheme and the sheets of every part, each page marked with the status of the version.
 */
export function productionPackageOf(g: Graph, input: PackageInput): ProductionPackage {
  if (input.readiness.revision !== g.revision.projectRevisionId) throw new Error(`Статус готовности ревизии ${input.readiness.revision} не относится к графу ${g.revision.projectRevisionId}`);
  if (input.cutting && input.cutting.revision !== g.revision.projectRevisionId) throw new Error(`Карта раскроя ревизии ${input.cutting.revision} не относится к графу ${g.revision.projectRevisionId}`);
  const id = drawingIdentity(g, input.appVersion ?? ''),
    product = `${PRODUCT_RU[g.product]} ${size(g.envelope.widthMm, g.envelope.heightMm, g.envelope.depthMm)} мм`,
    foot: [string[], string[]] = [
      ['MODULERO', product, `Ревизия ${g.revision.projectRevisionId}`, input.readiness.label],
      ['Производственный пакет', `${policy.id}-${policy.version}`, 'Все размеры в миллиметрах', 'Один граф — все листы пакета'],
    ],
    steps = assemblySteps(g),
    general = generalSheet(g, { appVersion: input.appVersion }),
    spec = tableSection('specification', `${PRODUCT_RU[g.product].toUpperCase()} · СПЕЦИФИКАЦИЯ ДЕТАЛЕЙ`, `Деталей ${g.parts.length} · E — готовая с кромкой, F — без кромки, мм · кромка — толщина ленты по торцам, мм`, id, specificationBlocks(g), [], foot),
    kit = tableSection('kit', `${PRODUCT_RU[g.product].toUpperCase()} · КОМПЛЕКТАЦИЯ`, 'Фурнитура и крепёж комплектами, механизмы и места крепления графа', id, kitBlocks(g, input.kit), input.kitNotes ?? [], foot),
    assembly = assemblyPages(g, steps, id, foot),
    parts = g.parts.flatMap((p) => partSheets(g, p.id, { appVersion: input.appVersion })),
    // The maps of the cutting plan, when the user made one: after the specification, in the order of the workshop.
    cutting = input.cutting ? cuttingSheets(input.cutting) : [],
    order: [PackageSectionId, string, Sheet[]][] = [
      ['GENERAL', 'Общий чертёж', [general]],
      ['SPECIFICATION', 'Спецификация деталей', spec],
      ...(cutting.length ? ([['CUTTING', 'Карты раскроя', cutting]] as [PackageSectionId, string, Sheet[]][]) : []),
      ['KIT', 'Комплектация', kit],
      ['ASSEMBLY', 'Схема сборки', assembly],
      ['PARTS', 'Листы деталей', parts],
    ];
  const sections: PackageSection[] = [{ id: 'TITLE', title: 'Титульный лист и статус', firstPage: 1, pages: 1 }];
  let next = 2;
  for (const [sid, title, sheets] of order) {
    sections.push({ id: sid, title, firstPage: next, pages: sheets.length });
    next += sheets.length;
  }
  const all = [titlePage(g, { ...input, title: product }, sections, id, foot), ...order.flatMap(([, , s]) => s)],
    sheets = all.map((s, i) => markSheet(s, input.readiness, i + 1, all.length));
  return { title: `${input.title} · производственный пакет`, readiness: input.readiness, revision: g.revision.projectRevisionId, sections, steps, sheets };
}

/** The printable HTML of the package: one page per sheet, A3 or A4; «Печать → Сохранить как PDF» gives the PDF. */
export const productionPackageHtml = (pkg: ProductionPackage): string => drawingDocumentHtml(pkg.sheets, pkg.title);

/**
 * The set of output data of one version in one archive (RELEASE_1_SCOPE §4.1): the printable package, its pages as
 * SVG, the files the product adds (CSV, the estimate) and `manifest.json` — the revision, the status with its
 * conditions, the versions and every file with its size and CRC-32. Latin names: Windows Explorer garbles Cyrillic
 * names when it unpacks a zip (CLAUDE.md, rule 5).
 */
export function productionKitZip(g: Pick<Graph, 'product' | 'revision' | 'versions'>, pkg: ProductionPackage, extra: { name: string; content: string | Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder(),
    files: { name: string; content: string | Uint8Array }[] = [{ name: 'package.html', content: productionPackageHtml(pkg) }, ...pkg.sheets.map((s) => ({ name: `sheets/${s.name}.svg`, content: s.svg })), ...extra],
    manifest = {
      schema: 'modulero.production-kit/1',
      product: g.product,
      title: pkg.title,
      revision: g.revision.projectRevisionId,
      status: pkg.readiness.status,
      label: pkg.readiness.label,
      mark: pkg.readiness.mark,
      conditions: pkg.readiness.conditions.map((c) => ({ id: c.id, title: c.title, met: c.met, reasons: c.reasons, notes: c.notes })),
      versions: g.versions,
      package: `${policy.id}-${policy.version}`,
      sections: pkg.sections,
      files: files.map((f) => {
        const bytes = typeof f.content === 'string' ? enc.encode(f.content) : f.content;
        return { name: f.name, bytes: bytes.length, crc32: crc32(bytes).toString(16).padStart(8, '0') };
      }),
    };
  return zipFiles([...files, { name: 'manifest.json', content: JSON.stringify(manifest, null, 2) + '\n' }]);
}
