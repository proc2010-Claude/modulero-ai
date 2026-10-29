// Shelf support selection (task «Подбор полкодержателей», input of W6 «полки» and K3): for one removable shelf —
// the supports of the catalogue (catalog/hardware/shelf-supports.ts) checked for retention against shifting
// (MOD-DEC-193), the fixing in the System 32 holes of the side panel (no screws — MOD-DEC-344), shelf thickness and
// material, load (MOD-DEC-289) and mounting; then the machining of the side panel and of the shelf for the chosen
// support, and its parts with the colour of the shelf and the price as a guide (344, 346).
// Pure functions; the numbers of the manufacturers live in the catalogue, the rules of the owner here (ENGINE.md
// §4). The levels of System 32 and the spare holes ±32 (193, INV-R7-IR6-02) are the mechanism of W6; here — one level.
import type { CatalogRef, HardwareTier, ShelfOperation, ShelfSupport, ShelfSupportCatalog, ShelfSupportPart } from '../../catalog/hardware/shelf-supports.js';
import { constant, decision, standard, type PolicyModule } from './types.js';

/**
 * Rules of the selection. MOD-DEC-193: a removable shelf is held against shifting while it can be removed on
 * purpose, and a plain pin does not confirm retention (Handbook INV-R7-IR6-02). MOD-DEC-332 (the owner's answer
 * to question 7 of HB-REVIEW) refines 193: no notch is milled for a pin; a plain pin is «Эконом» — the shelf lies
 * on it, only by the explicit choice of this level, never by default; «Стандарт» is a support with retention.
 * MOD-DEC-344 names the kits (the level of each is in the catalogue), forbids supports screwed to the side panel (a
 * screw is manual installation, the configurator is made for automation) and counts the load of both pairs under the
 * shelf. The level of the project is chosen on «Стоимость», «Стандарт» by default (MOD-DEC-223), so a level not
 * chosen and «Стандарт» chosen select the same. Side bores of System 32 are D5 (Handbook r8, MOD-DEC-345; first ES v1.2 §17.2, retired by 323). The
 * payload of one shelf is 10 kg by default (289).
 */
export const shelfSupportSelection = {
  id: 'shelf-support-selection',
  version: '1',
  constants: {
    retentionRequired: constant(true, 'flag', decision('MOD-DEC-193'), 'Съёмная полка удерживается от случайного сдвига; обычный штифт удержание не подтверждает (INV-R7-IR6-02)'),
    pinWithoutRetentionTier: constant<HardwareTier>('ECONOMY', 'tier', decision('MOD-DEC-332'), 'Штифт без удержания — только «Эконом» по явному выбору, полка кладётся сверху, паз не делается; по умолчанию не предлагается'),
    defaultTier: constant<HardwareTier>('STANDARD', 'tier', decision('MOD-DEC-223'), 'Уровень Эконом/Стандарт/Премиум выбирается на «Стоимости», по умолчанию — «Стандарт»'),
    screwFixingAllowed: constant(false, 'flag', decision('MOD-DEC-344'), 'Полкодержатель, который крепится к боковине саморезом, не допускается: саморез — ручная установка, конструктор рассчитан на автоматизацию'),
    sideBoreDiameter: constant(5, 'mm', standard('Handbook r8 (MOD-DEC-345): System 32, отверстия D5; исходно ES v1.2 §17.2 (323)'), 'Отверстия System 32 под полкодержатели — D5 (Handbook A-76)'),
    payloadKg: constant(10, 'kg', decision('MOD-DEC-289'), 'Полезная нагрузка полки по умолчанию'),
    bodyColourByDecor: constant<Readonly<Record<string, string>>>(
      {
        'DEC-EGG-W980-ST7': 'белый', 'DEC-EGG-W1000-ST19': 'белый', 'DEC-EGG-U104-ST9': 'белый', 'DEC-EGG-U113-ST9': 'белый',
        'DEC-UVA-U1605-UNKNOWN': 'белый', 'DEC-UVA-U7211-UNKNOWN': 'белый', 'DEC-UVA-U2236-UNKNOWN': 'белый', 'DEC-UVA-U2264-UNKNOWN': 'белый',
        'DEC-EGG-U702': 'серый', 'DEC-EGG-U708': 'серый', 'DEC-EGG-U727-ST9': 'серый', 'DEC-EGG-U732-ST9': 'серый', 'DEC-EGG-U636-ST9': 'серый',
        'DEC-UVA-U1503-UNKNOWN': 'серый', 'DEC-UVA-U9201-UNKNOWN': 'серый', 'DEC-UVA-U3509-UNKNOWN': 'серый', 'DEC-UVA-U1508-UNKNOWN': 'серый',
        'DEC-EGG-U963-ST9': 'антрацит', 'DEC-UVA-U3612-UNKNOWN': 'антрацит', 'DEC-UVA-U1507-UNKNOWN': 'антрацит', 'DEC-EGG-U504-ST9': 'антрацит', 'DEC-UVA-U1600-UNKNOWN': 'антрацит',
        'DEC-EGG-U999-ST19': 'черный', 'DEC-UVA-U0080-UNKNOWN': 'черный',
        'DEC-EGG-H1330': 'коричневый', 'DEC-UVA-U1147-UNKNOWN': 'коричневый', 'DEC-UVA-U11116-UNKNOWN': 'коричневый', 'DEC-UVA-U2108-UNKNOWN': 'коричневый',
        'DEC-EGG-H1145-ST10': 'прозрачный', 'DEC-EGG-H3157-ST12': 'прозрачный', 'DEC-EGG-H3303-ST10': 'прозрачный', 'DEC-EGG-H3395-ST12': 'прозрачный',
        'DEC-EGG-H1180-ST37': 'прозрачный', 'DEC-EGG-H3730': 'прозрачный', 'DEC-EGG-H3700-ST10': 'прозрачный', 'DEC-UVA-U2123-UNKNOWN': 'прозрачный',
        'DEC-UVA-U1158-UNKNOWN': 'прозрачный', 'DEC-UVA-U2167-UNKNOWN': 'прозрачный', 'DEC-UVA-U1114-UNKNOWN': 'прозрачный', 'DEC-UVA-U9510-UNKNOWN': 'прозрачный',
      },
      'colour',
      decision('MOD-DEC-344'),
      '(Д) Цвет корпуса — ближайший к декору полки: по названию и среднему тону образца декора (apps/web/public/decors). Белые и светлые кремовые — белый; серые, светлые серо-зелёные — серый; тёмно-серые, графит, тёмно-синие — антрацит; чёрные — черный; тёмные древесные — коричневый; светлые и средние древесные — прозрачный (сплошной цвет корпуса выделялся бы на рисунке дерева, а сквозь прозрачный видна ДСП в отверстии)',
    ),
    priceStepRub: constant(10, 'rub', decision('MOD-DEC-346'), 'Цена фурнитуры — ориентир: найденная цена одной штуки округляется вверх до целых 10 руб. (10,61 и 11,73 → 20); исходная цена и источник хранятся в каталоге'),
    loadPairs: constant(2, 'pairs', decision('MOD-DEC-344'), 'Полка с грузом — не больше нагрузки двух пар по каталогу: под полкой четыре полкодержателя (прототип считал одну пару — FINDINGS 158)'),
  },
} as const satisfies PolicyModule;

/** One removable shelf as the selection sees it. */
export interface ShelfSupportDemand {
  shelfThicknessMm: number;
  /** `CHIPBOARD`, `GLASS`, `WOOD`. */
  shelfMaterial: string;
  /** Payload; by default 10 kg (289). */
  payloadKg?: number;
  /** Mass of the shelf itself; null — not computed yet, the load check answers UNKNOWN. */
  shelfMassKg: number | null;
  /** Only a hidden support (скрытого монтажа) is wanted; by default — no: the kits of the levels are named by 344. */
  hiddenRequired?: boolean;
  /**
   * Level chosen by the user; null — not chosen, the default «Стандарт» (223). Other levels stay candidates,
   * after it; a plain pin only when «Эконом» is chosen (332).
   */
  tier: HardwareTier | null;
}

/** WAIVED — the rule does not hold, but the user chose the level that allows it (a plain pin of «Эконом»). */
export type ShelfSupportCheckStatus = 'PASS' | 'FAIL' | 'UNKNOWN' | 'WAIVED';

export interface ShelfSupportCheck {
  code: 'RETENTION' | 'SHELF_MACHINING' | 'SIDE_FIXING' | 'SHELF_THICKNESS' | 'SHELF_MATERIAL' | 'LOAD' | 'MOUNTING';
  status: ShelfSupportCheckStatus;
  text: string;
  ref: CatalogRef | null;
}

export interface ShelfSupportCandidate {
  supportId: string;
  tier: HardwareTier | null;
  checks: ShelfSupportCheck[];
  /** OK — every check passes; UNKNOWN — none fails but the catalogue lacks data; REJECTED — a check fails. */
  status: 'OK' | 'UNKNOWN' | 'REJECTED';
}

export interface ShelfSupportSelection {
  demand: ShelfSupportDemand;
  /**
   * First candidate of the wanted level («Стандарт» by default) that is not rejected, by status, then by fewer
   * unknown checks. The level the user chose is never replaced by another: none fits — null, with `reason`.
   */
  chosen: ShelfSupportCandidate | null;
  /** All candidates, those of other levels after the wanted one: alternatives to show, not chosen silently. */
  candidates: ShelfSupportCandidate[];
  /** Why nothing is chosen; null when a candidate is. */
  reason: string | null;
}

const TIER_NAMES: Record<HardwareTier, string> = { ECONOMY: '«Эконом»', STANDARD: '«Стандарт»', PREMIUM: '«Премиум»' };

const fmt = (x: number) => String(Math.round(x * 1000) / 1000).replace('.', ',');

const OP_NAMES = { widthMm: 'ширина', depthMm: 'глубина', fromSideFaceMm: 'положение от боковины', aboveLowerMm: 'высота над нижней пластью', stopFromBackMm: 'конец паза', rearShiftMm: 'сдвиг заднего' } as const;

/** Unknown sizes of the shelf machining of a support, by their Russian names. */
function machiningMissing(s: ShelfSupport): string[] {
  return s.shelfOperations.flatMap((o) =>
    (Object.keys(OP_NAMES) as (keyof typeof OP_NAMES)[])
      .filter((k) => o[k] && o[k]!.value === null)
      .map((k) => `${o.kind === 'BORE' ? 'отверстие' : 'паз'} в ${o.face === 'LOWER' ? 'нижней пласти' : 'торце'} полки: ${OP_NAMES[k]}`),
  );
}

/** Whether the retention of the support is shown by the manufacturer and its shelf machining is fully known. */
function retentionChecks(s: ShelfSupport, tier: HardwareTier): ShelfSupportCheck[] {
  const out: ShelfSupportCheck[] = [];
  if (s.retention === 'NONE')
    out.push(
      tier === shelfSupportSelection.constants.pinWithoutRetentionTier.value
        ? { code: 'RETENTION', status: 'WAIVED', text: `${s.article}: «Эконом» — полка кладётся на штифты сверху, без удержания от сдвига; только по явному выбору этого уровня`, ref: s.ref }
        : { code: 'RETENTION', status: 'FAIL', text: `${s.article}: полка лежит на штифтах без удержания от сдвига (193; обычный штифт удержание не подтверждает — INV-R7-IR6-02); допускается только при выборе «Эконом»`, ref: s.ref },
    );
  else {
    const d = s.retentionDocumented;
    out.push(
      d.value === null
        ? { code: 'RETENTION', status: 'UNKNOWN', text: `${s.article}: фиксация полки производителем не описана — ${d.reason}`, ref: null }
        : { code: 'RETENTION', status: d.value ? 'PASS' : 'FAIL', text: d.value ? `${s.article}: фиксация полки по документации производителя` : `${s.article}: производитель фиксацию не обещает`, ref: d.ref },
    );
    const missing = machiningMissing(s);
    out.push(
      missing.length
        ? { code: 'SHELF_MACHINING', status: 'UNKNOWN', text: `${s.article}: обработка полки требует уточнения — ${missing.join('; ')}`, ref: null }
        : { code: 'SHELF_MACHINING', status: 'PASS', text: `${s.article}: обработка полки известна`, ref: s.shelfOperations[0]!.depthMm.ref },
    );
  }
  return out;
}

/** Level and hidden mounting the demand asks for: a level not chosen is «Стандарт» (223). */
function wanted(d: ShelfSupportDemand) {
  return { tier: d.tier ?? shelfSupportSelection.constants.defaultTier.value, hidden: d.hiddenRequired ?? false };
}

function checkSupport(s: ShelfSupport, d: ShelfSupportDemand): ShelfSupportCheck[] {
  const c = shelfSupportSelection.constants,
    w = wanted(d);
  const out: ShelfSupportCheck[] = c.retentionRequired.value ? retentionChecks(s, w.tier) : [];
  const f = s.sideFixing;
  if (f.kind === 'SCREW')
    out.push({
      code: 'SIDE_FIXING',
      status: c.screwFixingAllowed.value ? 'PASS' : 'FAIL',
      text: `${s.article}: крепится к боковине саморезом (отверстие Ø${f.diameterMm.value === null ? '?' : fmt(f.diameterMm.value)}), а не в отверстия System 32 Ø${fmt(c.sideBoreDiameter.value)}: саморез — ручная установка, не допускается (344)`,
      ref: f.diameterMm.ref,
    });
  else if (f.diameterMm.value === null) out.push({ code: 'SIDE_FIXING', status: 'UNKNOWN', text: `${s.article}: диаметр отверстия в боковине — ${f.diameterMm.reason}`, ref: null });
  else {
    const grid = f.diameterMm.value === c.sideBoreDiameter.value;
    out.push(
      grid && s.unplacedFasteners.length
        ? { code: 'SIDE_FIXING', status: 'UNKNOWN', text: `${s.article}: отверстие в боковине Ø${fmt(f.diameterMm.value)} System 32, но ${s.unplacedFasteners.join('; ')}`, ref: f.diameterMm.ref }
        : { code: 'SIDE_FIXING', status: grid ? 'PASS' : 'FAIL', text: `${s.article}: отверстие в боковине Ø${fmt(f.diameterMm.value)}, сетка System 32 — Ø${fmt(c.sideBoreDiameter.value)}`, ref: f.diameterMm.ref },
    );
  }
  const st = s.shelfThicknessMm;
  out.push(
    st.value === null
      ? { code: 'SHELF_THICKNESS', status: 'UNKNOWN', text: `${s.article}: толщина полки — ${st.reason}`, ref: null }
      : {
          code: 'SHELF_THICKNESS',
          status: d.shelfThicknessMm >= st.value.minMm && (st.value.maxMm === null || d.shelfThicknessMm <= st.value.maxMm) ? 'PASS' : 'FAIL',
          text: `Полка ${fmt(d.shelfThicknessMm)} мм, ${s.article}: ${st.value.maxMm === null ? `от ${fmt(st.value.minMm)}` : st.value.minMm === st.value.maxMm ? fmt(st.value.minMm) : `${fmt(st.value.minMm)}…${fmt(st.value.maxMm)}`} мм`,
          ref: st.ref,
        },
  );
  const sm = s.shelfMaterials;
  out.push(
    sm.value === null
      ? { code: 'SHELF_MATERIAL', status: 'UNKNOWN', text: `${s.article}: материал полки — ${sm.reason}`, ref: null }
      : { code: 'SHELF_MATERIAL', status: sm.value.includes(d.shelfMaterial) ? 'PASS' : 'FAIL', text: `${s.article}: материал полки ${sm.value.join(', ')}, в изделии ${d.shelfMaterial}`, ref: sm.ref },
  );
  const load = s.loadPerPairKg,
    pairs = c.loadPairs.value,
    total = d.shelfMassKg === null ? null : (d.payloadKg ?? c.payloadKg.value) + d.shelfMassKg;
  if (load.value === null || total === null)
    out.push({ code: 'LOAD', status: 'UNKNOWN', text: `${s.article}: нагрузка — ${load.reason ?? 'масса полки не посчитана'}`, ref: null });
  else
    out.push({ code: 'LOAD', status: total <= load.value * pairs ? 'PASS' : 'FAIL', text: `Полка с грузом ${fmt(total)} кг, ${s.article} держат ${fmt(load.value * pairs)} кг (${pairs} × ${fmt(load.value)} кг на пару, 344)`, ref: load.ref });
  if (w.hidden && s.mounting !== 'HIDDEN') out.push({ code: 'MOUNTING', status: 'FAIL', text: `${s.article}: полкодержатель виден под полкой, нужен скрытого монтажа`, ref: s.ref });
  return out;
}

// WAIVED counts as PASS: the user chose the level that allows it, the check keeps the text for the report.
const statusOf = (checks: ShelfSupportCheck[]): ShelfSupportCandidate['status'] =>
  checks.some((x) => x.status === 'FAIL') ? 'REJECTED' : checks.some((x) => x.status === 'UNKNOWN') ? 'UNKNOWN' : 'OK';

/** All supports of the catalogue for one removable shelf, checked, and the chosen one. */
export function selectShelfSupport(d: ShelfSupportDemand, c: ShelfSupportCatalog): ShelfSupportSelection {
  const candidates: ShelfSupportCandidate[] = c.supports.map((s) => {
    const checks = checkSupport(s, d);
    return { supportId: s.id, tier: s.tier, checks, status: statusOf(checks) };
  });
  const rank = { OK: 0, UNKNOWN: 1, REJECTED: 2 } as const,
    w = wanted(d),
    unknowns = (x: ShelfSupportCandidate) => x.checks.filter((k) => k.status === 'UNKNOWN').length;
  candidates.sort((a, b) => rank[a.status] - rank[b.status] || Number(a.tier !== w.tier) - Number(b.tier !== w.tier) || unknowns(a) - unknowns(b) || a.supportId.localeCompare(b.supportId));
  const chosen = candidates.find((x) => x.tier === w.tier && x.status !== 'REJECTED') ?? null,
    level = TIER_NAMES[w.tier],
    own = candidates.filter((x) => x.tier === w.tier);
  // Why none fits: the texts of the failed checks in Russian, never their codes (LOAD; R5-004, FINDINGS 2918).
  const reason = chosen
    ? null
    : own.length
      ? `${level}: подходящего полкодержателя нет — ${own.map((x) => x.checks.filter((k) => k.status === 'FAIL').map((k) => k.text).join('; ') || x.supportId).join('; ')}`
      : `${level}: в каталоге нет полкодержателей этого уровня`;
  return { demand: d, chosen, candidates, reason };
}

/**
 * Lower face of the shelf over the axis of the side fixing (the profile of the support, TERM-079), as the catalogue
 * gives it: printed, or derived by its stated rule (a plain pin: d/2). The axis of the shelf for System 32 is its
 * negative (s32ShelfGeometry, axis_from_lower).
 */
export function shelfLowerAboveAxis(s: ShelfSupport): { valueMm: number | null; basis: 'CATALOG' | 'DERIVED' | 'UNKNOWN'; reason: string | null } {
  const k = s.shelfLowerAboveAxisMm;
  if (k.value === null) return { valueMm: null, basis: 'UNKNOWN', reason: k.reason ?? 'положение полки над осью не дано' };
  return { valueMm: k.value, basis: k.status === 'DERIVED' ? 'DERIVED' : 'CATALOG', reason: k.ref?.note ?? null };
}

/** Where one support level is drilled: the lines of System 32 holes along the depth of the side panel. */
export interface ShelfSupportPlacement {
  /** Lines of the side holes from the front edge of the side panel, front to back (W6: 37 and D − 37 by the System 32 policy). */
  linesFromFrontMm: number[];
  /** From the front edge of the side panel to the front edge of the shelf (front setback). */
  shelfSetbackMm: number;
  /** Depth of the shelf (for a groove along the end). */
  shelfDepthMm: number;
  /** Gap between the shelf end and the side panel (225: removable shelf = opening − 2 mm); null — not known. */
  shelfEndGapMm: number | null;
}

/** A machining of the scheme in local coordinates of its part, relative to the support level. */
export interface ShelfSupportHole {
  part: 'SIDE_PANEL' | 'SHELF';
  /** `SHELF_SUPPORT_HOLE`, `SHELF_SUPPORT_SCREW`, `SHELF_BORE`, `SHELF_GROOVE`. */
  machiningRole: string;
  /** Inner face of the side panel; lower face or end of the shelf. */
  face: 'INNER' | 'LOWER' | 'END';
  /** Side panel: from its front edge; shelf: from its front edge (a groove: where it starts). */
  acrossMm: number;
  /** Lower face of the shelf: centre from the shelf end; side panel, end face: null. */
  fromEndMm: number | null;
  /** End face of the shelf: centre above the lower face; otherwise null. */
  aboveLowerMm: number | null;
  /** Bore: diameter; groove: width. */
  widthMm: number | null;
  /** Groove: its length along the end; otherwise null. */
  lengthMm: number | null;
  depthMm: number | null;
  ref: CatalogRef | null;
}

export interface ShelfSupportScheme {
  supportId: string;
  /** For one end of the shelf; the other end mirrors it. */
  holes: ShelfSupportHole[];
  /** Supports for the shelf: lines × two ends. */
  quantity: number;
  /** MOD-DEC-277: INCOMPLETE when the catalogue does not give a machining fully. */
  completeness: 'COMPLETE' | 'INCOMPLETE';
  missing: string[];
}

const val = (k: { value: number | null } | null) => (k ? k.value : null);

/** Machining of one support level at one shelf end: the side holes and the shelf machining over them. */
export function shelfSupportScheme(s: ShelfSupport, p: ShelfSupportPlacement): ShelfSupportScheme {
  const holes: ShelfSupportHole[] = [],
    missing: string[] = [];
  const f = s.sideFixing;
  if (f.diameterMm.value === null || f.depthMm.value === null) missing.push(`${s.article}: диаметр и глубина отверстия в боковине`);
  missing.push(...machiningMissing(s).map((x) => `${s.article}: ${x}`), ...s.unplacedFasteners.map((x) => `${s.article}: ${x}`));
  const perLine = s.shelfOperations.filter((o) => !o.stopFromBackMm),
    alongEnd = s.shelfOperations.filter((o) => o.stopFromBackMm);
  p.linesFromFrontMm.forEach((line, i) => {
    for (const off of f.offsetsAlongMm)
      holes.push({ part: 'SIDE_PANEL', machiningRole: f.kind === 'PIN' ? 'SHELF_SUPPORT_HOLE' : 'SHELF_SUPPORT_SCREW', face: 'INNER', acrossMm: line + off, fromEndMm: null, aboveLowerMm: null, widthMm: f.diameterMm.value, lengthMm: null, depthMm: f.depthMm.value, ref: f.depthMm.ref ?? f.diameterMm.ref });
    const rear = i === p.linesFromFrontMm.length - 1 && p.linesFromFrontMm.length > 1;
    for (const o of perLine) {
      const shift = rear && o.rearShiftMm ? o.rearShiftMm.value : 0;
      if (shift === null) missing.push(`${s.article}: сдвиг заднего отверстия в полке`);
      const fromSide = val(o.fromSideFaceMm);
      if (o.face === 'LOWER' && fromSide !== null && p.shelfEndGapMm === null) missing.push(`${s.article}: зазор торца полки до боковины`);
      holes.push({
        part: 'SHELF',
        machiningRole: 'SHELF_BORE',
        face: o.face,
        acrossMm: line - p.shelfSetbackMm + (shift ?? 0),
        fromEndMm: o.face === 'LOWER' && fromSide !== null && p.shelfEndGapMm !== null ? fromSide - p.shelfEndGapMm : null,
        aboveLowerMm: o.face === 'END' ? val(o.aboveLowerMm) : null,
        widthMm: o.widthMm.value,
        lengthMm: null,
        depthMm: o.depthMm.value,
        ref: o.depthMm.ref,
      });
    }
  });
  for (const o of alongEnd) {
    const stop = val(o.stopFromBackMm);
    holes.push({ part: 'SHELF', machiningRole: 'SHELF_GROOVE', face: o.face, acrossMm: 0, fromEndMm: null, aboveLowerMm: val(o.aboveLowerMm), widthMm: o.widthMm.value, lengthMm: stop === null ? null : p.shelfDepthMm - stop, depthMm: o.depthMm.value, ref: o.depthMm.ref });
  }
  return { supportId: s.id, holes, quantity: p.linesFromFrontMm.length * 2, completeness: missing.length ? 'INCOMPLETE' : 'COMPLETE', missing: [...new Set(missing)] };
}


/** The parts of one support as they are bought, in the colour of the shelf, and the price of one support. */
export interface ShelfSupportKit {
  supportId: string;
  /** One part of each role; a role whose colour is not matched is missing. */
  parts: ShelfSupportPart[];
  /** Colours the body is made in; empty — one colour. */
  colours: string[];
  /**
   * Price of one support as a guide (MOD-DEC-346): the price of each part rounded up to whole 10 rub., summed;
   * null while a part or its price is missing.
   */
  priceRub: number | null;
  /** The same from the prices as the sources give them (to the kopeck), for the report. */
  sourcePriceRub: number | null;
  missing: string[];
}

/**
 * Colour of the body for the decor of the shelf (MOD-DEC-344: the colour closest to the decor), one of the seller's
 * names; null — the decor is not in the shared decor catalogue (catalog/decors.ts), the body stays missing in the kit.
 */
export function shelfSupportBodyColour(decorId: string): string | null {
  return shelfSupportSelection.constants.bodyColourByDecor.value[decorId] ?? null;
}

/**
 * The kit of a support for a shelf colour (MOD-DEC-344: the colour of the body is matched to the shelf, see
 * shelfSupportBodyColour). `colour` is one of the seller's names (`белый`, `антрацит`, …); a colour not given or
 * not made leaves the body missing.
 */
export function shelfSupportKit(s: ShelfSupport, colour: string | null): ShelfSupportKit {
  const parts: ShelfSupportPart[] = [],
    missing: string[] = [],
    colours = [...new Set(s.parts.flatMap((x) => (x.colour ? [x.colour] : [])))];
  if (!s.parts.length) missing.push(`${s.article}: состав и цены не записаны`);
  for (const role of [...new Set(s.parts.map((x) => x.role))]) {
    const same = s.parts.filter((x) => x.role === role),
      p = same.length === 1 ? same[0]! : (same.find((x) => x.colour === colour) ?? null);
    if (p) parts.push(p);
    else missing.push(`${s.article}: цвет корпуса ${colour === null ? 'не задан' : `«${colour}» не выпускается`} — есть ${same.map((x) => x.colour).join(', ')}`);
  }
  for (const p of parts) if (p.priceRub.value === null) missing.push(`${p.article}: цена — ${p.priceRub.reason}`);
  const step = shelfSupportSelection.constants.priceStepRub.value,
    kopecks = (rub: number) => Math.round(rub * 100),
    sum = (f: (p: ShelfSupportPart) => number) => (missing.length ? null : parts.reduce((a, p) => a + f(p), 0));
  const priceRub = sum((p) => Math.ceil(kopecks(p.priceRub.value!) / (step * 100)) * step),
    exact = sum((p) => kopecks(p.priceRub.value!));
  return { supportId: s.id, parts, colours, priceRub, sourcePriceRub: exact === null ? null : exact / 100, missing };
}

export type { ShelfOperation };
