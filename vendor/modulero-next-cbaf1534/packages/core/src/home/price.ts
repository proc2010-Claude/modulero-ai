// The price of "other furniture". r3 — the prototype's: Σ quantity × rate of the form, complete only with every rate,
// its source and date. r4 — the same rates, but the board is whole sheets of the cutting plan of the graph, the cut is
// the saw run of the plan and the drilling is the holes and the hinge cups of the graph, as the wardrobe counts them
// (MOD-DEC-505, 509, 510). A rate of the form is the maker's and goes first; the sheet, the saw and the drilling the
// maker left empty take the price of the catalogue or a temporary price with its basis, shown in the bell (MOD-DEC-536).
// The prices of the release (MOD-DEC-569, FINDINGS 1217): every rate of r4 and r5 the maker leaves empty has a price of
// the service — the article of the catalogue, the price list of the edge banding, or the averaged price of the project
// of the card (home-price.ts); the assembly is 14 % of C and the maker's markup 30 % of C (402). Only a sheet without a price of the catalogue stays
// temporary (508). The note and the date of the rates are those of the maker's own rates.
import { articleItem } from '../catalog/hardware/articles.js';
import { facadeExecutionOf, facadeMaterialOf } from '../catalog/hardware/facades.js';
import { catalogPrices } from '../catalog/hardware/prices.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { materialTitle, type CuttingGroup } from '../engine/cutting.js';
import { kitchenPrice } from '../engine/policy/kitchen-price.js';
import { HOME } from '../engine/policy/home.js';
import { homePrice } from '../engine/policy/home-price.js';
import { mfDecor } from '../engine/policy/materials.js';
import { LEFTOVERS_NOTES } from '../engine/policy/purchase-units.js';
import { edgeRateOf, wardrobePrice } from '../engine/policy/wardrobe-price.js';
import { largestSheet } from '../kitchen/sheets.js';
import { EDGE_PRICE_CATALOG } from '../wardrobe/edges.js';
import { wardrobePriceCuttingPlan } from '../wardrobe/cutting-plan.js';
import { releaseBoardOf } from '../catalog/materials.js';
import { boardSheetPrice, lineAmount } from '../wardrobe/price.js';
import { materials, priceByPlan, rateNames, rateNamesR4, rateNamesR5 } from './catalog.js';
import { homeEngineGraph } from './engine.js';
import { homeFacadeTitle } from './facades.js';
import { homeHandles, homeLegs, runnerInfo } from './mechanisms.js';
import { HINGE_SCREWS_INCLUDED_NOTE, parts, quantities } from './outputs.js';
import type { HomeProject, PriceResult, PriceRow, RateKey, RateKeyR4 } from './types.js';

const W = wardrobePrice.constants,
  HP = homePrice.constants,
  /** r5 (MOD-DEC-515): the HDF of the back — the rate of the wardrobe's HDF the kitchen also takes, temporary. */
  HDF_RATE = kitchenPrice.constants.hdfRateRub.value;
/** The holes of the hinge scheme in a front: a bought front comes with them drilled by the supplier (MOD-DEC-277, 573). */
const CUP_ROLES = new Set(['CUP', 'CUP_FIXING', 'CUP_SCREW']);
const amountOf = (quantity: number, rate: number | null) => (rate === null ? null : Math.round(quantity * rate * 100) / 100);
const area = (mm: readonly [number, number]) => (mm[0] * mm[1]) / 1e6;
const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'лист' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'листа' : 'листов');

/** Cost = Σ quantity × rate. Only complete when every needed rate, its source and date are given. */
export function price(p: HomeProject, hw: HardwareCatalogs): PriceResult {
  const plan = priceByPlan(p),
    rows = plan ? rowsR4(p, hw) : rowsR3(p, hw),
    missing = [...new Set(rows.filter((r) => r.rate === null || r.rate === undefined).map((r) => (r.rateKey && r.key.startsWith(r.rateKey + ':') ? r.rateKey : r.key)))],
    // r4, r5 (MOD-DEC-569): the note and the date are of the maker's own rates; the prices of the service say their
    // source in their basis. The hinge of the service is a kit with its screws (PRICE_GAPS.md, 3.1).
    own = !plan || rows.some((r) => r.origin === 'MAKER' && r.rate !== null);
  if (own && !p.rateNote?.trim()) missing.push('rateNote');
  if (own && !/^\d{4}-\d{2}-\d{2}$/.test(p.rateDate || '')) missing.push('rateDate');
  const test = /TEST_RATE/i.test(p.rateNote || ''),
    hingeQuoteIncludesMountScrews = (p.rateNote || '').includes(HINGE_SCREWS_INCLUDED_NOTE),
    q = quantities(p, hw),
    makerHinge = !plan || rows.some((r) => r.key === 'hinge' && r.origin === 'MAKER');
  if (q.hinge > 0 && makerHinge && !test && !hingeQuoteIncludesMountScrews) missing.push('hingeScrewSupply');
  return {
    status: missing.length ? 'PARTIAL' : test ? 'TEST_RATE' : 'COMPLETE',
    rows,
    missing,
    total: missing.length ? null : Math.round(rows.reduce((s, r) => s + (r.amount as number), 0) * 100) / 100,
    ...(priceByPlan(p) ? { temporary: rows.filter((r) => r.origin === 'TEMPORARY').map((r) => `${r.label}: ${r.basis}`) } : {}),
    hingeQuoteIncludesMountScrews,
    hardwarePriceStatus:
      q.hinge > 0
        ? hingeQuoteIncludesMountScrews
          ? 'USER_FULL_KIT_QUOTE_SUPPLY_UNKNOWN'
          : 'HINGE_SCREW_SUPPLY_UNKNOWN'
        : 'USER_COMPLETE_KIT_RATES_REQUIRED',
    hingeScrewSupplyStatus: q.hinge > 0 ? 'UNKNOWN' : 'NOT_APPLICABLE',
    physicalQualified: false,
  };
}

/** r3, the prototype: every quantity by the rate of the form. */
function rowsR3(p: HomeProject, hw: HardwareCatalogs): PriceRow[] {
  return (Object.entries(quantities(p, hw)) as [RateKey, number][])
    .filter(([, v]) => v > 0)
    .map(([key, quantity]) => ({ key, label: rateNames[key], quantity, rate: p.rates[key] ?? null, amount: amountOf(quantity, p.rates[key] ?? null) }));
}

/** The maker's rate when set, else the price of the catalogue or the temporary one. */
function priced(p: HomeProject, key: RateKeyR4, label: string, quantity: number, fallback: { rate: number | null; origin: 'CATALOG' | 'DECISION' | 'TEMPORARY'; basis: string }): PriceRow {
  const own = p.rates[key] ?? null,
    r = own !== null ? { rate: own, origin: 'MAKER' as const } : fallback;
  return { key, rateKey: key, label, quantity, rate: r.rate, amount: amountOf(quantity, r.rate), origin: r.origin, ...('basis' in r ? { basis: r.basis } : {}) };
}

/** A number in the text of a basis: the decimal comma. */
const ru = (x: number) => String(x).replace('.', ',');

/**
 * The price of one whole sheet of a group: of its variant in the material catalogue (508), else the averaged price of a
 * sheet of the project — the board rate of the wardrobe's card times the area of the sheet, to the rouble, as the
 * wardrobe prices a decor outside the catalogue (FINDINGS 1605); the decors of "other furniture" are not in the
 * catalogue. A sheet of HDF: the board of HDF of the release (FINDINGS 1607), else temporary — the rate of the
 * wardrobe's HDF per m² times the area of the sheet.
 */
function sheetPrice(g: CuttingGroup, sheetMm: [number, number], hw: HardwareCatalogs): { rate: number; origin: 'CATALOG' | 'DECISION' | 'TEMPORARY'; basis: string } {
  const [h, w] = sheetMm;
  const hdf = g.material.family === 'HDF' ? releaseBoardOf(hw.materials, 'HDF', g.material.thicknessMm, h, w) : null;
  if (hdf) return { rate: hdf.priceRub, origin: 'CATALOG', basis: `цена листа ${hdf.id} каталога материалов: ${hdf.priceBasis}` };
  if (g.material.family === 'HDF')
    return { rate: Math.round(HDF_RATE * area(sheetMm) * 100) / 100, origin: 'TEMPORARY', basis: `цены листа ХДФ ${h} × ${w} мм в каталоге нет — ставка ХДФ шкафа ${ru(HDF_RATE)} ₽/м² × площадь листа (MOD-DEC-508, 510, 515, 536)` };
  const sheet = boardSheetPrice(mfDecor(g.material.decorId, hw.materials) ? g.material.decorId : null, g.material.thicknessMm, h, w, hw.materials);
  if (sheet) return { rate: sheet.rub, origin: sheet.origin, basis: sheet.basis };
  const rate = Math.round(W.boardRateRub.value * area(sheetMm) * 100) / 100;
  return { rate, origin: 'TEMPORARY', basis: `цены листа ${h} × ${w} мм в каталоге нет — ставка плиты карты шкафа ${ru(W.boardRateRub.value)} ₽/м² × площадь листа (MOD-DEC-508, 510, 536)` };
}

/** r4: the boards by the sheets of the cutting plan, the saw run of the plan, the holes and cups of the graph. */
function rowsR4(p: HomeProject, hw: HardwareCatalogs): PriceRow[] {
  const q = quantities(p, hw),
    g = homeEngineGraph(p, hw),
    plan = wardrobePriceCuttingPlan(g, hw),
    decor = materials.find((m) => m.id === p.material)?.name.split(' · ')[0] ?? p.material,
    sheets: PriceRow[] = [];
  let cutMm = 0;
  for (const group of plan.groups) {
    const t = group.material.thicknessMm,
      key = t === 16 ? 'sheet16' : t === 18 ? 'sheet18' : null,
      title = group.material.family === 'LDSP' ? `${decor} ${t} мм` : group.material.family === 'HDF' ? `ХДФ ${t} мм` : materialTitle(group.material);
    cutMm += group.cutLengthMm;
    const lmdf = group.material.family === 'LMDF' && group.sheetMm ? boardSheetPrice(group.material.decorId, t, group.sheetMm[0], group.sheetMm[1], hw.materials, 'LMDF') : null;
    if (lmdf && !group.tooLarge.length) {
      // The ЛМДФ of the fronts by the price of the sheet of its variant in the catalogue, a format its decor has not by
      // the rate of ЛМДФ times the area (FINDINGS 1606).
      const n = group.sheets.length;
      sheets.push({ key: 'sheet:' + group.material.key, rateKey: null, label: `Лист плиты, ₽/лист: ЛМДФ ${t} мм · ${group.material.label.replace(/ · [\d.,]+ мм$/, '')} · ${n} ${plural(n)} ${group.sheetMm!.join(' × ')} мм`, quantity: n, rate: lmdf.rub, amount: amountOf(n, lmdf.rub), origin: lmdf.origin, basis: lmdf.basis, note: LEFTOVERS_NOTES.sheet });
      continue;
    }
    if (group.material.family === 'LMDF') {
      // MOD-DEC-573: a board of ЛМДФ without a sheet of the plan or with a blank larger than the sheet — «Цена не
      // определена», not the rate of the board of ЛДСП of the form (247); its sheets are counted.
      const n = group.sheets.length + group.tooLarge.length;
      if (n)
        sheets.push({ key: 'sheet:' + group.material.key, rateKey: null, label: `Лист плиты, ₽/лист: ЛМДФ ${t} мм · ${group.material.label.replace(/ · [\d.,]+ мм$/, '')} · ${n} ${plural(n)}${group.sheetMm ? ' ' + group.sheetMm.join(' × ') + ' мм' : ''}`, quantity: n, rate: null, amount: null, origin: 'CATALOG', basis: group.sheetMm ? 'заготовка ЛМДФ больше листа — нужен больший формат или стык (решает мебельщик; MOD-DEC-247, 573)' : 'лист ЛМДФ карты раскроя не задан (MOD-DEC-247, 573)', note: LEFTOVERS_NOTES.sheet });
      continue;
    }
    if (group.sheetMm && group.sheets.length) {
      const fallback = sheetPrice(group, group.sheetMm, hw),
        row = key
          ? priced(p, key, rateNamesR4[key], group.sheets.length, fallback)
          : { key: 'sheet:' + group.material.key, rateKey: null, label: group.material.family === 'HDF' ? 'Лист ХДФ, ₽/лист' : 'Лист плиты, ₽/лист', quantity: group.sheets.length, rate: fallback.rate, amount: amountOf(group.sheets.length, fallback.rate), origin: fallback.origin, basis: fallback.basis };
      sheets.push({ ...row, label: `${row.label}: ${title} · ${group.sheets.length} ${plural(group.sheets.length)} ${group.sheetMm.join(' × ')} мм`, note: LEFTOVERS_NOTES.sheet });
    }
    if (group.tooLarge.length) {
      // WR-10: a blank larger than the sheet — a larger format or a joint is for the maker; conditionally one whole sheet
      // of the largest format per blank, at the price of that sheet (no rate of the form: the form prices one format).
      const big = largestSheet(group),
        f = sheetPrice(group, big, hw),
        n = group.tooLarge.length;
      sheets.push({
        key: `sheet:${group.material.key}:larger`,
        rateKey: null,
        label: `${title} · заготовка больше листа: ${group.tooLarge.map((x) => x.partId).join(', ')} — нужен больший формат или стык (решает мебельщик), условно целый лист ${big.join(' × ')} мм на заготовку`,
        quantity: n,
        rate: f.rate,
        amount: amountOf(n, f.rate),
        origin: 'TEMPORARY',
        basis: f.origin === 'TEMPORARY' ? f.basis : `${f.basis}; заготовка больше листа — условно (WR-10)`,
        note: LEFTOVERS_NOTES.sheet,
      });
    }
  }
  // MOD-DEC-573: the fronts bought ready-made — m² of one projection by the finished size at the price of the execution in
  // the catalogue of the materials of the facades of the release; their cups the supplier drills (277), not the order.
  const bought = g.parts.filter((x) => x.material.family === 'PURCHASED_FINISHED'),
    boughtIds = new Set(bought.map((x) => x.id));
  if (bought.length && p.facadeChoice) {
    const m = facadeMaterialOf(hw.facades, p.facadeChoice.materialId),
      e = facadeExecutionOf(m, p.facadeChoice.executionId),
      rate = e?.priceRubPerM2.value ?? null,
      m2 = Math.round(bought.reduce((s, x) => s + (x.finishedWithEdge.lengthMm * x.finishedWithEdge.widthMm) / 1e6, 0) * 1000) / 1000;
    sheets.push({
      key: `facade:${p.facadeChoice.materialId}:${p.facadeChoice.executionId}`,
      rateKey: null,
      label: `Фасады, ₽/м²: ${homeFacadeTitle(p)} · ${bought.length} шт.`,
      quantity: m2,
      rate,
      amount: amountOf(m2, rate),
      origin: 'CATALOG',
      basis: rate === null ? `цены исполнения ${homeFacadeTitle(p)} в каталоге материалов фасадов нет (MOD-DEC-247, 573)` : `${homeFacadeTitle(p)} — каталог материалов фасадов ${rate} ₽/м² одной проекции, ориентир (MOD-DEC-573): ${hw.facades.priceSource}`,
    });
  }
  const drilled = (g.operations as { op: string; layer?: string; partId: string; diameterMm: number; machiningRole?: string }[]).filter(
      (o) => o.op === 'HOLE' && o.layer === 'DRILL' && !(boughtIds.has(o.partId) && CUP_ROLES.has(o.machiningRole ?? '')),
    ),
    // r5 (MOD-DEC-515, 574): the rebates of a back of HDF and the grooves of the bottoms of HDF, by the metre as the
    // wardrobe prices its grooves and rebates.
    grooveM = g.operations.reduce((s, o) => s + (o.op === 'GROOVE' ? Math.abs(o.endMm - o.startMm) / 1000 : 0), 0),
    form = W.formRates.value,
    FORM = 'ставка карты шкафа — усреднённая цена проекта (MOD-DEC-509, 569)',
    work: PriceRow[] = [
      priced(p, 'saw', rateNamesR4.saw, Math.round(cutMm) / 1000, { rate: W.sawRateRub.value, origin: 'DECISION', basis: 'ставка распила карты шкафа — усреднённая цена проекта (MOD-DEC-505, 569)' }),
      priced(p, 'hole', rateNamesR4.hole, drilled.filter((h) => h.diameterMm !== 35).length, { rate: form.holePrice!, origin: 'DECISION', basis: FORM }),
      priced(p, 'cup', rateNamesR4.cup, drilled.filter((h) => h.diameterMm === 35).length, { rate: form.cupPrice!, origin: 'DECISION', basis: FORM }),
      // The form of "other furniture" has no rate of a groove (the rates are fixed, 510): the wardrobe's card.
      {
        key: 'groove',
        rateKey: null,
        label: 'Пазы и четверти под ХДФ, ₽/м',
        quantity: Math.round(grooveM * 1000) / 1000,
        rate: form.groovePrice!,
        amount: amountOf(Math.round(grooveM * 1000) / 1000, form.groovePrice!),
        origin: 'DECISION',
        basis: 'ставка «Пазы и четверти» карты шкафа — усреднённая цена проекта (MOD-DEC-509, 515, 569)',
      },
    ],
    // r5 (MOD-DEC-516, FINDINGS 948): the legs of a body on legs by the price of their article in the catalogue, as the
    // wardrobe prices them (536); the form has no rate of a leg (510).
    prices = catalogPrices(hw),
    legs = p.bodies.flatMap((b): PriceRow[] => {
      if (b.base?.kind !== 'legs') return [];
      const l = homeLegs(p, hw, b),
        n = l.stationsMm.length,
        price = prices.article(l.leg.brand, l.leg.article),
        rate = price?.rub ?? null;
      return [
        {
          key: 'legs:' + b.id,
          rateKey: null,
          label: `Ножки ${l.leg.article}, ₽/шт.`,
          quantity: n,
          rate,
          amount: amountOf(n, rate),
          origin: !price || price.temporary || l.temporary ? 'TEMPORARY' : 'CATALOG',
          basis: [price ? price.basis : `цены артикула ${l.leg.article} в каталоге нет`, l.temporary].filter(Boolean).join('; ') + ' (MOD-DEC-480, 536)',
        },
      ];
    }),
    handle = homeHandles(p, hw)[0]?.handle ?? null,
    item = (id: string) => articleItem(hw.articles, id),
    // r3, r4 (MOD-DEC-569): the knob of the policy by the price of its article, which the catalogue holds once (FIT).
    knob = item(HOME.hardwareItems.handle),
    // The other rates of the form: as r3, without the board by area and the cut by part, which the plan replaced.
    rest = (Object.entries(q) as [RateKey, number][])
      .filter(([key, v]) => v > 0 && Object.hasOwn(rateNamesR4, key))
      .flatMap(([key, quantity]): PriceRow[] => {
        const k = key as RateKeyR4,
          own = p.rates[k] ?? null;
        // r5 (FINDINGS 965): the handle of the catalogue — the maker's rate first, else the price of its article (536).
        const label = k === 'handle' && handle ? `${rateNamesR5.handle}: ${handle.article}` : rateNamesR4[k],
          price = k === 'handle' ? (handle ? prices.article(handle.brand, handle.article) : knob.article ? prices.article(knob.brand, knob.article) : null) : null;
        if (price) return [priced(p, 'handle', label, quantity, { rate: price.rub, origin: price.temporary ? 'TEMPORARY' : 'CATALOG', basis: price.basis + ' (MOD-DEC-480, 536)' })];
        if (own !== null || k === 'assembly') return [{ key, rateKey: k, label, quantity, rate: own, amount: amountOf(quantity, own), origin: 'MAKER' }];
        return serviceRows(p, hw, k, label, quantity);
      });
  const at = rest.findIndex((r) => r.key === 'edge' || r.key.startsWith('edge:')),
    edgeEnd = at < 0 ? 0 : at + rest.filter((r) => r.rateKey === 'edge').length,
    all = [...sheets, ...rest.slice(0, edgeEnd), ...work.filter((r) => r.quantity > 0), ...rest.slice(edgeEnd), ...legs].map(roundHardware),
    // MOD-DEC-402, 569: the cost C is every row of the parts, the materials and the works but the assembly; the
    // assembly the maker leaves empty is 14 % of C, the maker's markup 30 % of C, as the wardrobe and the kitchen.
    assembly = all.find((r) => r.key === 'assembly'),
    amounts = all.filter((r) => r !== assembly).map((r) => r.amount),
    C = amounts.every((a) => a !== null) ? Math.round((amounts as number[]).reduce((s, a) => s + a, 0) * 100) / 100 : null,
    percentOfC = (percent: number) => (C === null ? null : Math.round(((C * percent) / 100) * 100) / 100);
  if (assembly && assembly.rate === null) {
    const rate = percentOfC(W.assemblyPercent.value);
    Object.assign(assembly, { rate, amount: amountOf(assembly.quantity, rate), origin: 'DECISION', basis: `сборка и монтаж — ${W.assemblyPercent.value} % от себестоимости C${C === null ? '' : ` ${C} ₽`} (MOD-DEC-402, 569)` });
  }
  // The form has no rate of the markup (the rates are fixed, 510): the row of the card, without a field.
  if (C !== null) {
    const markup = percentOfC(W.markupPercent.value)!;
    all.push({ key: 'markup', rateKey: null, label: `Наценка изготовителя — ${W.markupPercent.value} % от себестоимости C`, quantity: 1, rate: markup, amount: markup, origin: 'DECISION', basis: `наценка изготовителя — ${W.markupPercent.value} % от себестоимости C ${C} ₽ (MOD-DEC-402, 569)` });
  }
  return all;
}

/** The rows of the hardware and the fasteners of "other furniture": their price is a guide when the service sets it. */
const HARDWARE: ReadonlySet<string> = new Set(['hinge', 'runner', 'handle', 'support', 'join', 'join16', 'frontFix', 'restraint', 'glide']);

/** A row of the hardware or the fasteners: by its rate, or the legs of a body (MOD-DEC-516). The kit of the package too. */
export const isHardwareRow = (r: Pick<PriceRow, 'key' | 'rateKey'>): boolean => HARDWARE.has(r.rateKey ?? r.key) || r.key.startsWith('legs:');

/**
 * MOD-DEC-538, 346 (FINDINGS 1222): a row of the hardware or the fasteners by a price of the service — the catalogue,
 * the card — is rounded up to whole 10 ₽ as a row, as the wardrobe and the kitchen round it; the price of one piece is
 * kept as it is. The maker's rate is taken as it is (348); the works, the edge banding and the sheets are not hardware.
 */
function roundHardware(r: PriceRow): PriceRow {
  if (!isHardwareRow(r) || !W.roundLine.value || r.origin === 'MAKER' || r.origin === undefined || r.rate === null) return r;
  const step = W.priceStepRub.value;
  return { ...r, amount: lineAmount(r.quantity, r.rate, step), roundUpToRub: step };
}

/**
 * A rate of the form the maker left empty, priced by the service (MOD-DEC-569, PRICE_GAPS.md 3.1): the edge banding by
 * the price list of ТЕХНОПЛИТ for the thickness of the board and of the band, as the kitchen; the runner pair by the
 * price of the article of its length; the hinge by the price of its article, else the card; the kits of the form by
 * the card (home-price.ts). A price the catalogue does not have stays «Цена не определена» (157, 247).
 */
function serviceRows(p: HomeProject, hw: HardwareCatalogs, key: RateKeyR4, label: string, quantity: number): PriceRow[] {
  const prices = catalogPrices(hw),
    card = (rate: number, basis: string): PriceRow[] => [{ key, rateKey: key, label, quantity, rate, amount: amountOf(quantity, rate), origin: 'DECISION', basis: basis + ' (MOD-DEC-569)' }];
  if (key === 'edge') {
    const groups = new Map<string, { band: number; board: number; m: number }>();
    for (const a of parts(p, hw))
      if (a.edgeM > 0) {
        const id = `${a.edgeThickness}:${a.thickness}`,
          g = groups.get(id) ?? { band: a.edgeThickness, board: a.thickness, m: 0 };
        g.m += a.edgeM;
        groups.set(id, g);
      }
    const profile = (band: number) => (band <= 0.4 ? 'PVC_ABS_0_4' : band < 2 ? 'PVC_ABS_0_8_1_0' : 'PVC_ABS_2_0');
    return [...groups.values()].map((g) => {
      const s = EDGE_PRICE_CATALOG.services.find((x) => x.profileCode === profile(g.band) && x.panelServiceCategory === 'STANDARD' && g.board >= x.panelThicknessMin && g.board <= x.panelThicknessMax),
        n = Math.round(g.m * 1000) / 1000,
        // The rate of the card of its class, the averaged price of the workshops (569, FINDINGS 1836).
        card = s ? edgeRateOf(s) : null,
        rate = card ?? s?.pricePerM ?? null,
        band = String(g.band).replace('.', ',');
      return {
        key: `edge:${g.band}:${g.board}`,
        rateKey: 'edge',
        label: `${label}: кромка ${band} мм, плита ${g.board} мм`,
        quantity: n,
        rate,
        amount: amountOf(n, rate),
        origin: card === null ? 'CATALOG' : 'DECISION',
        basis:
          card !== null
            ? `ставка кромления карты шкафа ${ru(card)} ₽/м — средняя цен цехов (MOD-DEC-569, FINDINGS 1836): кромка ${band} мм, плита ${g.board} мм`
            : s
              ? `прайс кромления ${EDGE_PRICE_CATALOG.provider} от ${EDGE_PRICE_CATALOG.effectiveDate}: кромка ${band} мм, плита ${g.board} мм`
              : `в прайсе кромления нет кромки ${band} мм для плиты ${g.board} мм`,
      };
    });
  }
  if (key === 'runner') {
    const brand = articleItem(hw.articles, HOME.hardwareItems.runner).brand,
      count = new Map<string, number>();
    for (const b of p.bodies)
      for (const f of b.drawers) {
        const sku = runnerInfo(p, hw, b, f).sku;
        count.set(sku, (count.get(sku) ?? 0) + 1);
      }
    return [...count].map(([sku, n]) => {
      const price = prices.article(brand, sku),
        rate = price?.rub ?? null;
      return { key: 'runner:' + sku, rateKey: 'runner', label: `${label}: ${sku}`, quantity: n, rate, amount: amountOf(n, rate), origin: price?.temporary ? 'TEMPORARY' : 'CATALOG', basis: price ? price.basis + ' (MOD-DEC-536, 569)' : `цены артикула ${sku} в каталоге нет` };
    });
  }
  if (key === 'hinge') {
    const kit = articleItem(hw.articles, HOME.hardwareItems.hinge),
      price = prices.record(kit.id) ?? (kit.article ? prices.article(kit.brand, kit.article) : null);
    if (price) return [{ key, rateKey: key, label, quantity, rate: price.rub, amount: amountOf(quantity, price.rub), origin: price.temporary ? 'TEMPORARY' : 'CATALOG', basis: price.basis + ' — петля с планкой, винты в комплекте (MOD-DEC-536, 569)' }];
    return card(HP.hingeRub.value, HP.hingeRub.note);
  }
  const rates: Partial<Record<RateKeyR4, { value: number; note: string }>> = { support: HP.supportRub, join: HP.joinRub, join16: HP.join16Rub, frontFix: HP.frontFixRub, restraint: HP.restraintRub, glide: HP.glideRub },
    c = rates[key];
  return c ? card(c.value, c.note) : [{ key, rateKey: key, label, quantity, rate: null, amount: null, origin: 'MAKER' }];
}
