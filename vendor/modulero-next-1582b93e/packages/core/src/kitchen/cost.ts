// The cost of the kitchen (task K5, MIGRATION_PLAN step 4.5): the rates of the project by rate key, the evaluation of the
// rows of the BOM with them and the ProjectRevision every output carries. One function per layer of the prototype
// (kcdRateSettings r1.html:80949, kcdEvaluate 81436, kflowCost 81500 with its cache layer kcp 82244 left out,
// kcdRatesTemplate 81616, kcdRevision 80924).
//
// Unknown is not zero (MOD-DEC-157, 247): a row without an applicable rate or without a quantity has the amount null
// and is named in `missing`, `unpricedItems` or `technicalIncomplete`; the total is then null and the known part is
// shown apart. The rates are the maker's own, entered or imported in the project (`costSettings`). The cost of the
// kitchen (kitchenCost) prices as the swing wardrobe does (MOD-DEC-436): a row the file does not price takes the rate
// card of kitchen/price.ts, the assembly and the maker's markup are percents of the cost C (402); the cost by the
// maker's rates alone (kitchenRateCost) is the prototype's (FINDINGS 572, 620).
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { PlanarSize } from '../engine/contract.js';
import type { CuttingPlan } from '../engine/cutting.js';
import { kitchenPrice } from '../engine/policy/kitchen-price.js';
import type { Rec } from '../engine/policy/project-state.js';
import { wardrobePrice } from '../engine/policy/wardrobe-price.js';
import { bomParts, bomRows, kitchenApplianceRows, publicHardware } from './bom.js';
import { kitchenCoverage, materialOnly } from './coverage.js';
import { kitchenHardware } from './hardware.js';
import { kitchenCard, type KitchenCard, type KitchenCardRate } from './price.js';
import type { KitchenRates } from './project.js';
import { activeWalls, canonicalWall, cornerChoices, type KitchenScene } from './room.js';
import { kitchenSheetRows } from './sheets.js';
import { kitchenWorktopSheetRows, kitchenWorktopSheets } from './worktop-sheets.js';
import { jsonClone } from '../engine/json-clone.js';

const clone = jsonClone;

export const KITCHEN_RATES_SCHEMA = 'modulero.kitchen.rates.v1';
const CURRENCIES = ['RUB', 'EUR', 'USD'];
const RATE_UNITS = ['m2', 'm', 'piece', 'module', 'project', 'operation'];
/** Longest unit and text of a rate the file accepts (kcdRateSettings). */
const UNIT_MAX = 80,
  TEXT_MAX = 240;

/** The rates of a new kitchen: none, appliances apart (kcdDefaults, r1.html:80936). */
export function kitchenRateDefaults(): KitchenRates {
  return { schema: KITCHEN_RATES_SCHEMA, currency: 'RUB', includeAppliances: false, rates: [] };
}

/** A calendar date YYYY-MM-DD (kcdDate, r1.html:80944). */
export function isRateDate(s: unknown): boolean {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** The unit of a rate: the unit of a row, millimetres kept (kcdUnit, kcdRateUnit r1.html:80998, 81014). */
function rateUnit(x: unknown): string {
  if (x === 'mm') return x;
  const unit = typeof x === 'string' ? x.trim() : x;
  return (
    ({ 'шт.': 'piece', job: 'operation', pcs: 'piece', pc: 'piece', pair: 'piece', pairs: 'piece', set: 'piece', kit: 'piece', mm: 'm', meter: 'm', metre: 'm' } as Rec)[unit as string] ||
    (/^stock(?:\s|$)/i.test((unit as string) || '') ? 'piece' : unit) ||
    'piece'
  );
}

/**
 * The rates of a project or of an imported file, checked and normalised (kcdRateSettings, r1.html:80949): null gives
 * the defaults; every rate has a key, a unit, a price or null, the currency of the file, a source, a date, a region
 * and the taxes — a price without its source, date, region and taxes is refused. Throws the prototype's message. Pure.
 */
export function kitchenRateSettings(raw: unknown): KitchenRates {
  if (raw == null) return kitchenRateDefaults();
  const r0 = raw as Rec;
  if (!r0 || r0.schema !== KITCHEN_RATES_SCHEMA || !Array.isArray(r0.rates) || !CURRENCIES.includes(r0.currency) || typeof r0.includeAppliances !== 'boolean')
    throw new Error('Неверный формат ставок. Используйте шаблон ставок кухни.');
  const seen = new Set<string>(),
    rates = r0.rates.map((r: Rec) => {
      const unit = rateUnit(r?.unit);
      if (
        !r ||
        typeof r.unit !== 'string' || !r.unit.trim() || r.unit.length > UNIT_MAX ||
        (r.originalUnit !== undefined && (typeof r.originalUnit !== 'string' || !r.originalUnit.trim() || r.originalUnit.length > UNIT_MAX)) ||
        typeof r.key !== 'string' || !r.key || r.key.length > TEXT_MAX || seen.has(r.key) ||
        !RATE_UNITS.includes(unit) ||
        r.currency !== r0.currency ||
        (r.price !== null && (!Number.isFinite(r.price) || r.price < 0)) ||
        typeof r.source !== 'string' || typeof r.date !== 'string' || typeof r.region !== 'string' || typeof r.tax !== 'string' ||
        [r.source, r.region, r.tax].some((x: string) => x.length > TEXT_MAX) ||
        (r.price !== null && (!r.source.trim() || !isRateDate(r.date) || !r.region.trim() || !r.tax.trim()))
      )
        throw new Error('Ставка должна содержать ключ, единицу, цену либо null, валюту, источник, дату, регион и налоги.');
      seen.add(r.key);
      return {
        key: r.key,
        unit,
        price: r.price,
        currency: r.currency,
        source: r.source,
        date: r.date,
        region: r.region,
        tax: r.tax,
        ...(unit !== r.unit || r.originalUnit ? { originalUnit: r.originalUnit || r.unit } : {}),
      };
    });
  return { schema: r0.schema, currency: r0.currency, includeAppliances: r0.includeAppliances, rates };
}

// ---------------------------------------------------------------- ProjectRevision

/** Canonical text: object keys sorted, undefined left out (kcdCanonical, r1.html:80919). */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return '{' + Object.keys(value).sort().filter((k) => (value as Rec)[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonical((value as Rec)[k])).join(',') + '}';
  return JSON.stringify(value) as string;
}

/** The corners and the walls of the room as the saved kitchen records them (roomTopology, r1.html:67634). */
function roomTopology(s: KitchenScene): Rec {
  const walls = activeWalls(s),
    wall_topology: Rec = {};
  for (const w of walls) {
    const choices = cornerChoices(s, w);
    wall_topology[canonicalWall(s, w)] = {
      start_corner: choices.find((c) => c.anchor === 'start')?.id || 'free' + w + 'Start',
      end_corner: choices.find((c) => c.anchor === 'end')?.id || 'free' + w + 'End',
    };
  }
  return {
    room_corners: [...new Set(walls.flatMap((w) => cornerChoices(s, w).map((c) => c.id)))],
    wall_topology,
    wall_coordinate_adapter:
      s.wallNaming === 'ABC_CHAIN' ? { A: 'LEFT_ROOM_WALL', B: 'BACK_ROOM_WALL', C: 'RIGHT_ROOM_WALL', internalLayoutAxes: { A: 'B', B: 'A', C: 'C' } } : { legacy: true },
  };
}

/**
 * ProjectRevision of a kitchen: two FNV-style 32-bit digests of the canonical saved kitchen without the editor state
 * (kcdRevision, r1.html:80924, over snapshot 67738 with the layers 73157, 80035, 80981). The saved kitchen is the
 * project with the room topology recomputed and the rates normalised; the chains are left out, as the prototype
 * leaves them out. Every output of one kitchen carries it, and any change of the input or of the rates changes it.
 */
export function kitchenRevision(s: KitchenScene): string {
  const S = s as unknown as Rec,
    record = {
      system32Policy: S.system32Policy || { version: 'LEGACY-PRESERVED-R10', enabled: S.system32Assist === true, provenance: S.system32Assist == null ? 'LEGACY_MISSING_OFF' : 'LEGACY_EXPLICIT' },
      kitchenProjectSchemaVersion: 3,
      wallNaming: S.wallNaming,
      ...roomTopology(s),
      roomConfirmed: S.roomConfirmed,
      typeConfirmed: S.typeConfirmed,
      type: S.type,
      orientation: S.orientation,
      islandEnabled: S.islandEnabled,
      room: S.room,
      modules: S.modules,
      obstacles: S.obstacles,
      corpusMaterial: S.corpusMaterial,
      facadeMaterial: S.facadeMaterial,
      defaultWidth: S.defaultWidth,
      upperHeight: S.upperHeight,
      proposed: S.proposed,
      nextId: S.nextId,
      kitchenReleaseAdapterRevision: 2,
      costSettings: kitchenRateSettings(S.costSettings),
      // MOD-DEC-573: the material of the facades, only when chosen — the revision of a kitchen without it is the prototype's.
      ...(S.facadeChoice ? { facadeChoice: S.facadeChoice } : {}),
      // R4-006: the settings of the whole kitchen, only when set (FINDINGS 1903).
      ...(S.kitchenOptions ? { kitchenOptions: S.kitchenOptions } : {}),
      // R4-011: the parameters of the cutting map, only when entered — the price cuts with them (FINDINGS 1904).
      ...(S.cutting ? { cutting: S.cutting } : {}),
      // MOD-AI-16, 36: the handles and the opening of the fronts, only when chosen (FINDINGS 3210).
      ...(S.fittings ? { fittings: S.fittings } : {}),
      // MOD-AI-15: the worktop, only when chosen (FINDINGS 3218).
      ...(S.worktop ? { worktop: S.worktop } : {}),
    },
    text = canonical(record);
  let a = 2166136261,
    b = 3339675911;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 2246822519);
  }
  return 'KPR2-' + (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------- the evaluation of the rows

/** Money to the kopeck; a value too large to round stays as it is (kcdMoney376, r1.html:81420). */
function money(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.abs(value) > Number.MAX_VALUE / 100 ? value : Math.round(value * 100) / 100;
}

/** The sum of the amounts, null once it leaves the finite numbers (kcdFiniteSum376, r1.html:81424). */
function finiteSum(rows: Rec[]): number | null {
  let sum = 0;
  for (const row of rows) {
    sum += row.amount;
    if (!Number.isFinite(sum)) return null;
  }
  return sum;
}

/** Why the geometry of a module is incomplete: its required unknown fields (kcdCoverageReason, r1.html:81432). */
function coverageReason(c: Rec, fallback = 'Неполный состав'): string {
  const required = (c.unknownFields || []).filter((x: Rec) => x.mandatoryForSelectedVariant && x.status === 'UNKNOWN');
  return required.length ? required.map((x: Rec) => x.message || x.field).join(' ') : fallback;
}

export const KITCHEN_PRICING_BASIS = 'Введённые ставки мебельщика; оценка, а не коммерческое предложение поставщика.';
export const KITCHEN_SCOPE_ASSUMPTIONS: readonly string[] = [
  'Материалы и обработка считаются по заготовкам, установленным кромкам, пазам и известным операциям выбранного состава.',
  'Сборка, мебельный монтаж, проектирование и доставка имеют отдельные ставки.',
  'Техника показана отдельно; заводские принадлежности её комплекта не оплачиваются второй раз.',
  'Подключение электричества, воды и газа, подготовка стен и прочие работы помещения не входят в мебельную оценку.',
];
/** The basis and the scope of the cost by the rate card (MOD-DEC-436). */
export const KITCHEN_CARD_BASIS =
  'Ставки мебельщика проекта; где их нет — прайс кромления, найденные цены магазина и условные цены по аналогам (MOD-DEC-436, 264); сборка и наценка мебельщика — от себестоимости C (402). Оценка, а не коммерческое предложение поставщика.';
const ASSEMBLY = wardrobePrice.constants.assemblyPercent.value,
  MARKUP = wardrobePrice.constants.markupPercent.value,
  KITCHEN_CARD_DATE = kitchenPrice.constants.date.value;
export const KITCHEN_CARD_ASSUMPTIONS: readonly string[] = [
  KITCHEN_SCOPE_ASSUMPTIONS[0],
  `Себестоимость C — плиты, столешница, стекло, кромка, обработка и фурнитура, без работ, доставки и техники; сборка и монтаж — ${ASSEMBLY}% от C, наценка мебельщика — ${MARKUP}% от C (MOD-DEC-402, 436). Ставки мебельщика за сборку, монтаж и проектирование не читаются.`,
  'Плита считается целыми листами карты раскроя (MOD-DEC-508, 510); найденные и условные цены фурнитуры — ориентир: строка сметы округлена вверх до 10 ₽ (MOD-DEC-346).',
  ...KITCHEN_SCOPE_ASSUMPTIONS.slice(2),
];
/** The categories of the rows of C and the bought ones of them (MOD-DEC-028, 402). */
const C_CATEGORIES = ['material', 'facade', 'glass', 'worktop', 'edge', 'operation', 'hardware'],
  BOUGHT = ['material', 'facade', 'glass', 'worktop', 'hardware'];
const MANUFACTURING_BASIS =
  'Чертежи передают геометрию и известные монтажные данные. Производственные операции разрешены только при явной квалификации; материал, инструмент и место установки проверяются отдельно.';
const OVERFLOW = 'Итоговая сумма превышает диапазон вычисления. Проверьте количество и ставки.';

/**
 * The rows priced by the rates of their keys (kcdEvaluate, r1.html:81436). A rate applies when its unit and currency
 * are those of the row and the settings and it has a price ≥ 0, a source, a date, a region and the taxes; the amount
 * of a row is quantity × price in kopecks (MOD-DEC-435), or null. The total is null as soon as anything included is
 * unknown; the known part (knownSubtotal), the furniture and the appliances are shown apart. Pure.
 *
 * With the rate card of the kitchen (MOD-DEC-436, kitchen/price.ts) a row the maker's file does not price takes the
 * rate of the card with its origin, the work the percents of MOD-DEC-402 cover is not priced by itself, and the
 * assembly and the maker's markup are lines on the cost C (pricedCost). Without it the evaluation is the prototype's.
 */
export function kitchenEvaluate(rows: Rec[], settings: KitchenRates, coverage: Rec[] = [], card?: KitchenCard): Rec {
  const missing: string[] = [],
    rates = new Map<string, Rec>(settings.rates.map((r) => [r.key as string, r as Rec])),
    items: Rec[] = rows.map((row): Rec => {
      // A row the cutting plan replaced (MOD-DEC-510, kitchenSheetRows) is not priced again.
      if (row.replacedBy) return { ...row, included: false, rate: null, amount: null };
      const replaced = card?.replaced(row) ?? null;
      if (replaced) return { ...row, included: false, rate: null, amount: null, replacedBy: replaced };
      const rate = rates.get(row.rateKey),
        valid = !!(rate && rate.unit === row.unit && rate.currency === settings.currency && Number.isFinite(rate.price) && rate.price >= 0 && rate.source.trim() && isRateDate(rate.date) && rate.region.trim() && rate.tax.trim()),
        own = card && settings.currency === 'RUB' && !valid ? card.rate(row) : null,
        price = valid ? rate!.price : own ? own.price : null;
      const computed = row.quantity !== null && Number.isFinite(row.quantity) && row.quantity >= 0 && price !== null ? row.quantity * price : null,
        overflow = computed !== null && !Number.isFinite(computed),
        // MOD-DEC-435 (FINDINGS 576): the amount of a row is in kopecks, the total is the sum of the rows; the prototype
        // kept the fractions of a kopeck in the row and rounded only the total. A found or conditional price of hardware
        // rounds the row up to whole 10 ₽ (MOD-DEC-346).
        kopecks = overflow ? null : money(computed),
        amount = kopecks !== null && own?.roundUpToRub ? Math.ceil(kopecks / own.roundUpToRub - 1e-9) * own.roundUpToRub : kopecks;
      if (row.included && amount === null)
        missing.push(row.rowId + ': ' + (overflow ? 'сумма превышает диапазон вычисления' : row.quantity === null ? 'количество или заготовка не определены' : (row.unpriced ?? 'не указана применимая ставка')));
      return {
        ...row,
        rate: valid ? { ...rate } : own ? cardRate(row, own) : null,
        amount,
        ...(card && price !== null ? { origin: valid ? 'MAKER' : own!.origin } : {}),
        ...(own?.roundUpToRub ? { roundUpToRub: own.roundUpToRub } : {}),
        ...(overflow ? { arithmeticIssue: 'Сумма позиции превышает диапазон вычисления. Проверьте количество и ставку.' } : {}),
      };
    });
  // MOD-DEC-741 (MOD-AI-43, FINDINGS 3200): with the rate card a module whose geometry lacks only the heat resistance
  // of its chosen materials is priced — its parts and rows are all known; the heat resistance stays a check of the
  // readiness for production (`productionChecks`, the bell), not an unknown of the price. The prototype's evaluation
  // by the maker's rates alone keeps it unknown.
  const checked = card ? coverage.filter(materialOnly) : [],
    incomplete = coverage.filter((c) => !c.completeGeometry && !checked.includes(c));
  for (const c of incomplete) missing.push(c.moduleId + ': ' + coverageReason(c, 'неполный состав'));
  const priced = card ? pricedCost(items, missing) : null;
  if (priced) items.push(...priced.services);
  const subtotal = finiteSum(items.filter((x) => x.included && x.amount !== null)),
    applianceSubtotal = finiteSum(items.filter((x) => x.category === 'appliance' && x.amount !== null)),
    furnitureSubtotal = finiteSum(items.filter((x) => x.included && x.category !== 'appliance' && x.amount !== null));
  if (subtotal === null) missing.push(OVERFLOW);
  const unpricedItems = items.filter((x) => x.included && x.rate === null).map((x) => ({ rowId: x.rowId, name: x.name, rateKey: x.rateKey, quantity: x.quantity, unit: x.unit })),
    technicalIncomplete = [
      ...items.filter((x) => x.included && (x.quantity === null || !Number.isFinite(x.quantity) || x.quantity < 0)).map((x) => ({ rowId: x.rowId, reason: 'Количество или заготовка не определены' })),
      ...incomplete.map((x) => ({ moduleId: x.moduleId, reason: coverageReason(x) })),
      ...items.filter((x) => x.included && x.arithmeticIssue).map((x) => ({ rowId: x.rowId, reason: x.arithmeticIssue })),
      ...(subtotal === null ? [{ rowId: 'cost-total', reason: OVERFLOW }] : []),
    ],
    total = missing.length ? null : money(subtotal);
  return {
    status: missing.length ? 'PARTIAL' : 'COMPLETE_CONFIGURED_ESTIMATE',
    commercialCompleteness: unpricedItems.length ? 'PARTIAL_UNPRICED' : technicalIncomplete.length ? 'PARTIAL_TECHNICAL_DATA' : 'COMPLETE_CONFIGURED_ESTIMATE',
    unpricedItems,
    technicalIncomplete,
    currency: settings.currency,
    total,
    knownSubtotal: money(subtotal),
    furnitureSubtotal: money(furnitureSubtotal),
    applianceSubtotal: money(applianceSubtotal),
    includeAppliances: settings.includeAppliances,
    items,
    missing,
    ...(priced
      ? {
          // MOD-DEC-028: what is bought, the maker's cost C and the customer's price; null — unknown.
          supplierCost: total === null ? null : priced.supplierCost,
          internalCost: total === null ? null : priced.internalCost,
          customerPrice: total,
          card: card!.id,
          productionChecks: checked.map((x) => x.moduleId + ': ' + coverageReason(x) + ' Проверяется перед изготовлением; цена посчитана по выбранным материалам (MOD-DEC-741).'),
          temporary: [...new Set(items.filter((x) => x.included && x.origin === 'TEMPORARY').map((x) => `${OPERATION_TEXT[x.rateKey] ?? x.name}: ${x.rate.price} ₽/${UNIT_TEXT[x.unit] ?? x.unit} — ${x.rate.source.replace(CONDITIONAL, '')}`))],
        }
      : {}),
    // MOD-DEC-410: a worktop cut at the wall is made and fitted on site, its rows are an estimate.
    ...(items.some((x) => x.included && x.estimate) ? { approximateRows: items.filter((x) => x.included && x.estimate).map((x) => x.rowId), approximateNote: 'Стоимость примерная: столешница у стены изготавливается и устанавливается по месту (MOD-DEC-410).' } : {}),
    pricingBasis: priced ? KITCHEN_CARD_BASIS : KITCHEN_PRICING_BASIS,
    scopeAssumptions: priced ? [...KITCHEN_CARD_ASSUMPTIONS] : [...KITCHEN_SCOPE_ASSUMPTIONS],
    manufacturingBasis: MANUFACTURING_BASIS,
  };
}

const CONDITIONAL = 'Цена условная: ';
const UNIT_TEXT: Readonly<Record<string, string>> = { m2: 'м²', m: 'м', piece: 'шт', module: 'модуль', project: 'заказ', operation: 'операция' };
/**
 * The words of an operation the prototype names by its kind (`o.kind`, bom.ts): the row keeps the prototype's name (the
 * goldens of K1), the list of the temporary prices says it in words (R1-002, FINDINGS 1268).
 */
const OPERATION_TEXT: Readonly<Record<string, string>> = { 'operation:through': 'Сквозное отверстие', 'operation:blind': 'Глухое отверстие' };

/**
 * The words of a rate of the maker's form (R6-010, FINDINGS 2004): the name of the row it prices and its unit, not the
 * key of the file («operation:through», «piece»). The key stays in the file and in the data of the form.
 */
export function kitchenRateText(key: string, unit: string, items: readonly Rec[]): { name: string; unit: string } {
  // One rate prices every row of its key: a board by its decor and thickness, an edge by its thickness, an operation by
  // its kind — not by the first part it met.
  const row = items.find((x) => x.rateKey === key),
    [kind, a = '', b = ''] = key.split(':');
  const name =
    OPERATION_TEXT[key] ??
    (kind === 'material' && row
      ? (row.category === 'worktop' ? 'Столешница' : /UNKNOWN/.test(a) ? String(row.name) : 'Плита ' + a) + (b ? `, ${b.replace('.', ',')} мм` : '')
      : kind === 'edge'
        ? `Кромка ${a.replace('.', ',')} мм`
        : kind === 'operation' && row
          ? String(row.name).split(' · ')[0]
          : kind === 'hardware' && row && row.brand && !String(row.brand).includes('_') && row.name === row.article
            ? `${row.brand} ${row.article}`
            : (row?.name ?? key));
  return { name, unit: UNIT_TEXT[unit] ?? unit };
}

/** A rate of the card as a rate of the cost: the source names it, a conditional one says so (MOD-DEC-264). */
function cardRate(row: Rec, r: KitchenCardRate): Rec {
  return { key: row.rateKey, unit: row.unit, price: r.price, currency: 'RUB', source: (r.origin === 'TEMPORARY' ? CONDITIONAL : '') + r.basis, date: KITCHEN_CARD_DATE, region: 'RU', tax: 'с НДС' };
}

/**
 * The cost C and the services on it (MOD-DEC-402, 436; W11, FINDINGS 520): C is every included row of the furniture
 * before the work and the services — the boards, the worktop, the glass, the edges, the processing and the hardware;
 * the assembly (with the installation, 436) and the maker's markup are its percents. A percent of an unknown C is
 * unknown: the lines are not added and the cost says so. The appliances are not in C.
 */
function pricedCost(items: Rec[], missing: string[]) {
  const inC = items.filter((x) => x.included && C_CATEGORIES.includes(x.category)),
    known = !inC.some((x) => x.amount === null),
    internalCost = known ? money(finiteSum(inC)) : null,
    supplierCost = known ? money(finiteSum(inC.filter((x) => BOUGHT.includes(x.category)))) : null,
    services: Rec[] = [];
  // A kitchen without furniture has no C to charge on.
  if (!inC.length) return { services, internalCost, supplierCost };
  if (internalCost === null) missing.push(`Сборка ${ASSEMBLY}% и наценка мебельщика ${MARKUP}% от C: C неизвестна`);
  else
    for (const [id, name, percent] of [
      ['assembly', `Сборка и монтаж · ${ASSEMBLY}% от C`, ASSEMBLY],
      ['markup', `Наценка мебельщика · ${MARKUP}% от C`, MARKUP],
    ] as const) {
      const amount = money((internalCost * percent) / 100)!;
      services.push({ rowId: 'service:' + id, category: 'service', name, rateKey: 'service:' + id, unit: 'project', quantity: 1, included: true, rate: { key: 'service:' + id, unit: 'project', price: amount, currency: 'RUB', source: `MOD-DEC-402: ${percent}% от себестоимости C ${internalCost} ₽`, date: KITCHEN_CARD_DATE, region: 'RU', tax: 'с НДС' }, amount, origin: 'DECISION' });
    }
  return { services, internalCost, supplierCost };
}

// ---------------------------------------------------------------- one reading of the kitchen

/** What the cost and the outputs of one kitchen read: its parts, hardware, coverage, rows, rates and revision. */
export interface KitchenReading {
  revision: string;
  /** The hardware catalogue of the release: its records hold the prices of the hardware (MOD-DEC-536). */
  catalog: HardwareCatalogs;
  settings: KitchenRates;
  parts: Rec[];
  hardware: Rec[];
  coverage: Rec[];
  rows: Rec[];
}

/** One reading of a kitchen: every output of it is a projection of this (kcdParts, kflowHardware, kflowGeometryCoverage, kcdRows). */
export function kitchenReading(s: KitchenScene): KitchenReading {
  const settings = kitchenRateSettings(s.costSettings),
    scene = s.costSettings === settings ? s : ({ ...s, costSettings: settings } as KitchenScene),
    parts = bomParts(s),
    hardware = kitchenHardware(s);
  return { revision: kitchenRevision(s), catalog: s.hardware, settings, parts, hardware, coverage: kitchenCoverage(s), rows: bomRows(parts, hardware, s.modules, kitchenApplianceRows(scene)) };
}

/**
 * The cost of the kitchen by the rates of the maker's file alone, with its revision, material part, hardware and
 * coverage: flow.cost() of the prototype (kflowCost, r1.html:81500), rows in kopecks (MOD-DEC-435).
 */
export function kitchenRateCost(r: KitchenReading): Rec {
  return costOf(r, kitchenEvaluate(r.rows, r.settings, r.coverage));
}

/**
 * The cost of the kitchen (MOD-DEC-436): the rates of the maker's file, the rate card where the file has none, the
 * assembly and the maker's markup on the cost C (402), the supplier cost, C and the customer's price apart (028).
 * With the cutting plan of the graph the boards are its whole sheets and the cut is its saw run (MOD-DEC-510); the
 * worktops are the whole sheets of their decor (FINDINGS 3219).
 */
export function kitchenCost(r: KitchenReading, plan?: CuttingPlan, blank?: (partId: string) => PlanarSize | null): Rec {
  const boards = plan ? kitchenSheetRows(r.rows, plan, blank) : r.rows,
    // FINDINGS 3219: the worktops by whole sheets of their decor.
    rows = kitchenWorktopSheetRows(boards, kitchenWorktopSheets(r.parts, r.catalog), r.catalog);
  return costOf(r, kitchenEvaluate(rows, r.settings, r.coverage, kitchenCard(r.rows, r.catalog, r.parts)));
}

function costOf(r: KitchenReading, c: Rec): Rec {
  return {
    ...c,
    ProjectRevision: r.revision,
    knownMaterialSubtotal: money(finiteSum(c.items.filter((x: Rec) => ['material', 'facade', 'glass', 'worktop'].includes(x.category) && x.amount !== null))),
    groups: {},
    hardware: r.hardware.map(publicHardware),
    geometryCoverage: r.coverage.map((x) => ({ moduleId: x.moduleId, moduleTypeId: x.moduleTypeId, status: x.status, completeGeometry: x.completeGeometry, manufacturingQualified: x.manufacturingQualified })),
  };
}

/**
 * The rates of the chosen composition: one per rate key of the rows, the project's own where it has one, otherwise
 * an empty rate with the price null (kcdRatesTemplate, r1.html:81616). The file the maker fills in and imports.
 */
export function kitchenRatesTemplate(r: KitchenReading): KitchenRates {
  const map = new Map<string, Rec>();
  for (const row of r.rows)
    if (!map.has(row.rateKey)) {
      const old = r.settings.rates.find((x) => x.key === row.rateKey);
      map.set(row.rateKey, old ? clone(old) : { key: row.rateKey, unit: row.unit, price: null, currency: r.settings.currency, source: '', date: '', region: '', tax: '' });
    }
  return { ...clone(r.settings), rates: [...map.values()] as KitchenRates['rates'] };
}
