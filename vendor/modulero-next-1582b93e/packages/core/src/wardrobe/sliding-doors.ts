// The sliding doors of the wardrobe (task W9, step W9.2): the clear opening of the carcass, the leaves the system
// gives for it and the kit of the system. A port of the prototype's door calculation folded into one function — the
// prototype stacked it in layers (swCalculate r1.html:63245; NO_DOORS and Slim Line 84716; the kit 85336; three
// tracks and the materials of the leaves 85707) over the exact arithmetic of SW_ENGINE (62399) — and of the block
// `m.sliding` of its model (swModel 59602, 63437, 63878, 84787).
//
// What differs from the prototype, by decision: the mass of a leaf and its limit follow MOD-DEC-334 (FINDINGS 356);
// the depth of the system is MOD-DEC-354 (FINDINGS 351); the brush of Slim Line is counted once, by MOD-DEC-188
// (FINDINGS 357). The prices of the kit (step W9.3) are those of the snapshot of the prototype, completed by found and
// conditional prices (policy sliding-price, FINDINGS 510–512).
import { slidingDoors, slidingSystem, type SlidingRole, type SlidingSystemId, type SlidingSystemTable } from '../engine/policy/sliding-doors.js';
import { colouredArticle, slidingPrice, type SlidingRate } from '../engine/policy/sliding-price.js';
import { lowerTrackSetback, slidingDepthReserve, slidingTrackWidth, wardrobeSliding } from '../engine/policy/wardrobe-sliding.js';
import { RULE_SET_VERSION } from '../engine/policy/index.js';
import type { HardwareVisual, Vec3 } from '../engine/contract.js';
import type { SlidingProfile } from '../catalog/hardware/fittings.js';
import type { Rec } from '../engine/policy/project-state.js';
import { contentDigest } from '../project/digest.js';
import { drawerAccess, type DrawerSpan } from './sliding-access.js';

const P = slidingDoors.constants,
  SP = slidingPrice.constants;

// ---------------------------------------------------------------- exact fractions (SW_ENGINE.q, r1.html:62411)

/** An exact fraction with a positive denominator, reduced. */
export interface Fraction {
  n: bigint;
  d: bigint;
}
export type FractionInput = Fraction | number | string;

const isFraction = (v: unknown): v is Fraction => typeof v === 'object' && v !== null && typeof (v as Fraction).n === 'bigint';

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}

/** A number, a decimal text or a text `n/d` as an exact fraction; anything else is an unknown input. */
export function frac(value: FractionInput | null | undefined | boolean): Fraction {
  if (value === null || value === undefined || typeof value === 'boolean') throw Error('UNKNOWN_NUMERIC_INPUT');
  let n: bigint, d: bigint;
  if (isFraction(value)) [n, d] = [value.n, value.d];
  else {
    const s = String(value).trim();
    if (!s || s === 'NaN' || s === 'Infinity' || s === '-Infinity') throw Error('UNKNOWN_NUMERIC_INPUT');
    if (s.includes('/')) {
      const p = s.split('/');
      if (p.length !== 2) throw Error('UNKNOWN_NUMERIC_INPUT');
      [n, d] = [BigInt(p[0]!), BigInt(p[1]!)];
    } else {
      const m = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(s);
      if (!m) throw Error('UNKNOWN_NUMERIC_INPUT');
      const scale = BigInt((m[3] ?? '').length) - BigInt(m[4] ?? 0);
      n = BigInt((m[1] ?? '') + m[2] + (m[3] ?? ''));
      d = 1n;
      if (scale > 0n) d = 10n ** scale;
      else if (scale < 0n) n *= 10n ** -scale;
    }
  }
  if (d === 0n) throw Error('UNKNOWN_NUMERIC_INPUT');
  if (d < 0n) [n, d] = [-n, -d];
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

const add = (x: FractionInput, y: FractionInput) => {
  const a = frac(x),
    b = frac(y);
  return frac({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
};
const sub = (x: FractionInput, y: FractionInput) => {
  const a = frac(x),
    b = frac(y);
  return frac({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
};
const mul = (x: FractionInput, y: FractionInput) => {
  const a = frac(x),
    b = frac(y);
  return frac({ n: a.n * b.n, d: a.d * b.d });
};
const div = (x: FractionInput, y: FractionInput) => {
  const a = frac(x),
    b = frac(y);
  if (!b.n) throw Error('DIV_ZERO');
  return frac({ n: a.n * b.d, d: a.d * b.n });
};
const cmp = (x: FractionInput, y: FractionInput): number => {
  const a = frac(x),
    b = frac(y),
    t = a.n * b.d - b.n * a.d;
  return t < 0n ? -1 : t > 0n ? 1 : 0;
};
const floor = (x: FractionInput): number => {
  const a = frac(x);
  return Number(a.n >= 0n ? a.n / a.d : -((-a.n + a.d - 1n) / a.d));
};
const ceil = (x: FractionInput): number => -floor(mul(x, -1));

/** The prototype's plain form of exact values: an integer as a number, any other fraction as the text `n/d`. */
export function plain(v: unknown): unknown {
  if (isFraction(v)) return v.d === 1n ? Number(v.n) : `${v.n}/${v.d}`;
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

/** The value of an exact (or plain) number as a JS number. */
export const fracNumber = (v: FractionInput): number => {
  const a = frac(v);
  return Number(a.n) / Number(a.d);
};

// ---------------------------------------------------------------- the leaves of a system (SW_ENGINE.nominal)

type Scheme = 'ALT' | 'PAIR4';

/** The track of each leaf: alternating, or 0-1-1-0 for four leaves with a centre joint; mirrored on request. */
function tracksOf(n: number, scheme: Scheme, mirror: boolean): number[] {
  if (![2, 3, 4, 5].includes(n) || !['ALT', 'PAIR4'].includes(scheme) || (scheme === 'PAIR4' && n !== 4)) throw Error('UNSUPPORTED_LAYOUT');
  const ts = scheme === 'PAIR4' ? [0, 1, 1, 0] : Array.from({ length: n }, (_, i) => i % 2);
  return mirror ? ts.map((t) => 1 - t) : ts;
}

interface NominalInput {
  system: string;
  n: number;
  W: FractionInput;
  H: FractionInput;
  scheme: Scheme;
  mirror: boolean;
}

/**
 * The equal leaves of a system in a clear opening W × H: width w = ceil((W − D + k · overlap) / n) (172, 173, 178),
 * height, frame, insert (140), the closed positions, the overlaps, and the kit in nominal lengths and counts.
 */
function nominal(c: NominalInput): Rec {
  const s = c.system,
    n = c.n,
    p = slidingSystem(s);
  if (!p) throw Error('UNKNOWN_SYSTEM');
  const W = frac(c.W),
    H = frac(c.H),
    scheme = c.scheme,
    ts = tracksOf(n, scheme, c.mirror === true),
    D = frac(p.deduction[scheme]),
    o = frac(p.overlap),
    k = scheme === 'PAIR4' ? 2 : n - 1,
    w = frac(ceil(div(add(sub(W, D), mul(k, o)), n))),
    h = sub(H, p.heightDeduction),
    res = sub(mul(n, w), add(sub(W, D), mul(k, o))),
    edge = frac(p.edgeDeduction),
    closed =
      scheme === 'PAIR4'
        ? [edge, sub(add(edge, w), o), add(sub(sub(W, edge), mul(2, w)), o), sub(sub(W, edge), w)]
        : Array.from({ length: n }, (_, i) => add(edge, mul(i, div(sub(sub(W, mul(2, edge)), w), n - 1)))),
    center = scheme === 'PAIR4' ? sub(sub(closed[2]!, closed[1]!), w) : null,
    overlaps = scheme === 'PAIR4' ? [o, o] : Array.from({ length: n - 1 }, (_, i) => sub(w, sub(closed[i + 1]!, closed[i]!))),
    iw = sub(w, p.insertWidthDeduction),
    ih = frac(floor(sub(h, p.insertHeightDeduction))),
    frame = sub(w, p.frameDeduction),
    rail = sub(W, P.railDeduction.value),
    a = p.articles,
    bom: Rec[] = [];
  for (const [role, len, qty] of [
    ['vertical', h, 2 * n],
    ['upper_frame', frame, n],
    ['lower_frame', frame, n],
    ['upper_track', rail, 1],
    ['lower_track', rail, p.lowerTrackCount],
  ] as [SlidingRole, Fraction, number][])
    bom.push({ partId: role, role, geometry_article: a[role], length_mm: len, pieces: qty, net_m: div(mul(len, qty), 1000), stock_length_mm: p.stockLength, purchase_bars_with_kerf: null, price_basis: 'existing catalogue rate/unit; no price reset' });
  bom.push(
    { partId: 'rollers', role: 'roller_kit', geometry_article: a.roller_kit, quantity: n, unit: 'kit', included_children_separate_purchase: false },
    { partId: 'stops', role: 'stop', geometry_article: a.stop, quantity: P.stopsPerLeaf.value * n, unit: 'piece', placement: 'PROJECT_ADAPTER; count does not prove travel' },
  );
  if (!p.brushFactor) bom.push({ partId: 'plugs', role: 'plug', geometry_article: a.plug, quantity: P.plugsPerLeaf.value * n, unit: 'piece' });
  else {
    const net = div(mul(mul(2 * n, h), p.brushFactor), 1000);
    bom.push(
      { partId: 'brush', role: 'brush', geometry_article: a.brush, net_m: net, quantity: ceil(net), unit: 'm' },
      { partId: 'clips', role: 'brush_clip', geometry_article: a.brush_clip, quantity: P.clipsPerLeaf.value * n, unit: 'piece' },
    );
  }
  const t = P.insertThickness.value;
  bom.push({ partId: 'insert', role: 'insert', quantity: n, unit: 'piece', size_mm: [iw, ih, t], total_area_m2: div(mul(mul(iw, ih), n), 1000000), edge_band: false });
  const gaps = cmp(edge, 0) > 0 ? [[frac(0), edge], [sub(W, edge), W]] : [];
  if (center !== null && cmp(center, 0) > 0) gaps.push([add(closed[1]!, w), closed[2]!]);
  return plain({
    system: s,
    n,
    scheme,
    tracks: ts,
    width: w,
    height: h,
    frame,
    insert: [iw, ih, t],
    rail,
    closed,
    overlaps,
    rounding_residual: res,
    center_allowance_mm: center,
    nominal_solid_uncovered_x: gaps,
    coverage: gaps.length ? 'NOMINAL_SOLIDS_PLUS_UNRESOLVED_BRUSH_OR_JOINT' : 'NOMINAL_SOLIDS_COVER',
    closed_basis: 'ENGINEERING_DERIVATION; runtime installed closed pose still requires qualification',
    bom,
    source_nominal: 'PASS',
    physical_qualification: false,
    price_status: 'EXISTING_COMMERCIAL_PIPELINE',
  }) as Rec;
}

// ---------------------------------------------------------------- the mass of a leaf (MOD-DEC-334)

interface LeafMassInput {
  /** Inserts of one leaf: width × height, mm, each of LDSP 10 mm. */
  inserts: [FractionInput, FractionInput][];
  /** Lengths of the profiles of one leaf, mm: two verticals, the upper and the lower frame. */
  height: FractionInput;
  frame: FractionInput;
  profileMass: SlidingSystemTable['profileMassKgPerM'];
  limitKg: number;
}

/**
 * Mass of one leaf by the ARISTO calculation tables (MOD-DEC-334): m = 1.05 · (Σ area · q of the inserts + Σ length ·
 * linear mass of the profiles of the leaf). The guides hang on the carcass and are not in it (FINDINGS 138). The
 * limit is that of the rollers of the system: Standard 100, ЭКО 40, Slim Line 80 kg.
 */
function leafMass(x: LeafMassInput): Rec {
  let area = frac(0);
  for (const [w, h] of x.inserts) {
    if (cmp(w, 0) <= 0 || cmp(h, 0) <= 0) return { status: 'UNVERIFIED_INPUT', required_fields: ['INVALID_INSERT'] };
    area = add(area, div(mul(w, h), 1000000));
  }
  const inserts = mul(area, P.insertArealMass.value),
    profiles = div(add(mul(mul(2, x.height), x.profileMass.vertical), mul(x.frame, add(x.profileMass.upper_frame, x.profileMass.lower_frame))), 1000),
    raw = mul(add(inserts, profiles), P.massFactor.value);
  return plain({
    status: cmp(raw, x.limitKg) <= 0 ? 'WITHIN_LIMIT' : 'EXCEEDS_LIMIT',
    raw_kg: raw,
    raw_decimal_kg: fracNumber(raw),
    display_ceil_kg: ceil(raw),
    limit_kg: x.limitKg,
    insert_area_per_leaf_m2: area,
    insert_mass_per_leaf_kg: inserts,
    profile_mass_per_leaf_kg: profiles,
    factor: frac(P.massFactor.value),
    material_activation: 'CURRENT_LDSP10',
    component_masses_required: false,
    rule: 'MOD-DEC-334',
  }) as Rec;
}

/** The mass block of the result in the prototype's shape (r1.html:63324) with the mass of MOD-DEC-334. */
const massBlock = (mass: Rec): Rec => ({ ...mass, rawKg: mass.raw_kg ?? null, displayKg: mass.display_ceil_kg ?? null, limitKg: mass.limit_kg ?? null, physicalMassMeasured: false });

// ---------------------------------------------------------------- the calculation

/** The doors as the project state keeps them, with the clear opening W × H and the thickness of the carcass. */
export interface SlidingConfig extends Rec {
  W?: unknown;
  H?: unknown;
  /** Panel thickness of the carcass, mm (Slim Line is calculated for 16 mm). */
  carcassThickness?: number;
}

const STATUS_TEXT = {
  unsupported: 'Сохранённая комплектация вне активного расчёта равных 2–5 створок ARISTO. Данные проекта не заменены.',
  invalidOpening: 'Чистый проём должен иметь положительные ширину и высоту.',
  physical: 'Номинальные габариты не подтверждают установленные тела, ход и настройку стопоров.',
  slimMount: 'Неподдержанный вариант установки SLIM.',
  slimThickness: 'SLIM: принятый расчёт относится к корпусу 16 мм; для другого корпуса размеры створок временно взяты по нему.',
  slimTravel: 'Монтажный ход и стопоры физически не подтверждены.',
  triple: 'Схемы «Три дорожки» нет: направляющие ARISTO рассчитаны на две дорожки. Выберите «Чередование» или «Парную». Данные проекта не заменены.',
} as const;

/** Why the opening gives no leaves: the sizes the system would make, in the words of the editor (FINDINGS 1801). */
function smallOpening(w: FractionInput, h: FractionInput, iw: FractionInput, ih: FractionInput): string {
  const mm = (v: FractionInput) => String(Math.round(fracNumber(v) * 10) / 10).replace('.', ',');
  return `Проём слишком мал для створок: створка получается ${mm(w)} × ${mm(h)} мм, вставка ${mm(iw)} × ${mm(ih)} мм. Увеличьте ширину или высоту проёма.`;
}

const doorCount = (cfg: Rec): unknown => (cfg.n === undefined ? 2 : cfg.n);

/**
 * The doors of an opening: the leaves of the chosen system, their kit, mass and applicability (swCalculate). A new
 * sliding wardrobe without doors gives NO_DOORS; a configuration outside the equal 2–5 leaves of ARISTO on two tracks
 * is kept as it is and not calculated.
 */
export function slidingCalc(cfg: SlidingConfig): Rec {
  if (cfg?.n === 0) return { status: 'NO_DOORS', errors: [], n: 0, system: cfg.system, bom: [], productionReady: false, productionExecutable: false, priceStatus: 'NO_DOOR_KIT' };
  // MOD-DEC-580: only what the guides of the manufacturer provide — ARISTO has no guide of three tracks. A project
  // saved with the r1 scheme «Три дорожки» keeps its data and is not calculated, as any other configuration outside.
  if (cfg?.scheme === 'TRIPLE4') return { status: 'UNSUPPORTED_CONFIGURATION', errors: [STATUS_TEXT.triple], productionReady: false };
  let c = doorsOf(cfg);
  if (c.status !== 'CANDIDATE') return c;
  // Materials of single leaves (r1.html:85758): the insert of each leaf becomes its own line.
  const local: Rec = cfg.leafMaterials || {},
    ids: string[] = c.leafIds;
  if (ids.some((id) => local[id])) {
    const insert = c.bom.find((b: Rec) => b.role === 'insert'),
      area = (c.insert_width * c.insert_height) / 1e6;
    if (insert) {
      const inserts = ids.map((id, i) => ({ ...insert, id: 'SW-insert-' + id, partId: id + '-INSERT', leafId: id, leafIndex: i, qty: 1, pieces: 1, areaM2: area, material: local[id]?.material || cfg.material || 'current', decorId: local[id]?.decorId || null, materialQualified: false }));
      c = { ...c, bom: c.bom.filter((b: Rec) => b.role !== 'insert').concat(inserts), leafMaterialIntents: structuredClone(local), materialQualified: false };
    }
  }
  return kitPrices(withFinish(withGlass(c, cfg), cfg.profileFinish));
}

// ---------------------------------------------------------------- the colour of the profiles (MOD-AI-24)

/** The lines of the kit that are anodised profiles and guides: they come in the colour of the doors. */
const FINISH_ROLES: ReadonlySet<string> = new Set<SlidingRole>(['vertical', 'upper_frame', 'lower_frame', 'upper_track', 'lower_track']);
type ProfileFinish = (typeof P.profileFinishes.value)[number];

/** The colour of the profiles of a configuration: its code, or the first of the policy (silver matt); undefined — a code the policy does not know. */
export const profileFinishOf = (cfg: Rec | null | undefined): ProfileFinish | undefined => {
  const code = cfg?.profileFinish ?? P.profileFinishes.value[0].code;
  return P.profileFinishes.value.find((f) => f.code === code);
};

/** The series of the profiles and guides of a kit (AE0704, AS0713…): what must be sold in a colour for the doors to have it. */
export const finishSeries = (bom: readonly Rec[]): string[] => [...new Set(bom.filter((b) => FINISH_ROLES.has(b.role) && b.geometryArticle).map((b) => String(b.geometryArticle).split('.')[0]!))];

/** The colours of a kit by its series: silver matt always (the rates of the kit), another one where every series has its price (sliding-price). */
export const finishesOf = (series: readonly string[]): ProfileFinish[] =>
  P.profileFinishes.value.filter((f, i) => i === 0 || series.every((s) => colouredArticle(s, f.code) in slidingPrice.constants.finishRates.value));

/**
 * The kit in the colour of its profiles (MOD-AI-24, FINDINGS 2956): the anodised lines take the article of the colour
 * (AE0704.VP540.GLMAN.CJ); silver matt keeps the articles of the prototype's kit and their rates. The leaves, the
 * masses and the other lines do not change.
 */
function withFinish(c: Rec, code: unknown): Rec {
  if (code === undefined || code === P.profileFinishes.value[0].code) return c;
  return { ...c, profileFinish: code, bom: (c.bom as Rec[]).map((b) => (FINISH_ROLES.has(b.role) && b.geometryArticle ? { ...b, article: colouredArticle(String(b.geometryArticle).split('.')[0]!, String(code)) } : b)) };
}

// ---------------------------------------------------------------- the inserts of glass and mirror (MOD-AI-30, 70)

/** A kind of glass of the inserts (`slidingDoors.glassInserts`); undefined — not a glass of the policy. */
export const glassOf = (id: unknown) => P.glassInserts.value.find((g) => g.id === id);

/**
 * The glass of each leaf (FINDINGS 2957): its own (`leafMaterials[leafId].glass`), else that of the doors
 * (`config.glass`); null — an insert of a board. A leaf of its own board material is a board whatever the doors are.
 */
export function leafGlass(cfg: Rec, leafIds: readonly string[]): (string | null)[] {
  const local: Rec = cfg?.leafMaterials || {};
  return leafIds.map((id) => (local[id] ? (local[id].glass ?? null) : (cfg?.glass ?? null)));
}

/** Every glass a configuration names is one of the policy. */
const glassKnown = (cfg: Rec): boolean => [cfg?.glass, ...Object.values((cfg?.leafMaterials ?? {}) as Rec).map((x: Rec) => x?.glass)].every((g) => g === undefined || g === null || glassOf(g) !== undefined);

/**
 * The leaves of glass or mirror (MOD-AI-30, 70; FINDINGS 2957) by the tables of ARISTO: the pane is 4 mm and 3 mm
 * smaller each way than the insert of a board (`glassInsertDeduction`), it is held in the profile by the seal of 4 mm
 * (the perimeter of the panes, up to a whole metre) and gets a safety film; it weighs 11 kg/m² (MOD-DEC-334), the mass
 * of the heaviest leaf is the mass of the doors. The panes are bought cut to size, so they are lines of the kit, not
 * sheets of the cutting plan; the inserts of the other leaves stay boards.
 */
function withGlass(c: Rec, cfg: Rec): Rec {
  const ids: string[] = c.leafIds,
    glass = leafGlass(cfg, ids);
  if (glass.every((g) => !g)) return c;
  const d = P.glassInsertDeduction.value,
    T = P.glassInsertThickness.value,
    iw = fracNumber(c.insert_width),
    ih = fracNumber(c.insert_height),
    gw = iw - d,
    gh = ih - d,
    pane = (gw * gh) / 1e6,
    count = glass.filter(Boolean).length,
    boards = ids.length - count,
    [minH, minW] = P.glassLimits.value.filmMin;
  const bom: Rec[] = [];
  for (const b of c.bom as Rec[]) {
    if (b.role !== 'insert') bom.push(b);
    // An insert of its own leaf (leafMaterials) is a board only when the leaf is not glass; the insert of the doors
    // counts the leaves of a board.
    else if (b.leafId !== undefined) {
      if (!glass[ids.indexOf(b.leafId)]) bom.push(b);
    } else if (boards) bom.push({ ...b, qty: boards, pieces: boards, areaM2: (iw * ih * boards) / 1e6 });
  }
  for (const id of [...new Set(glass.filter((g): g is string => !!g))]) {
    const g = glassOf(id)!,
      leaves = ids.filter((_, i) => glass[i] === id);
    bom.push({ id: 'SW-glass-' + id, role: 'glass', article: id, geometryArticle: null, title: `${g.title} ${T} мм`, glass: id, qty: pane * leaves.length, unit: 'm2', pieces: leaves.length, leafIds: leaves, width: gw, height: gh, thickness: T, areaM2: pane * leaves.length });
  }
  const seal = (2 * (gw + gh) * count) / 1000,
    film = gh >= minH && gw >= minW;
  bom.push({ id: 'SW-glass_seal', role: 'glass_seal', article: P.glassSeal.value.article, geometryArticle: P.glassSeal.value.article, title: P.glassSeal.value.title, qty: Math.ceil(seal - 1e-9), netMetres: seal, unit: 'm', pieces: count });
  if (film) bom.push({ id: 'SW-glass_film', role: 'glass_film', article: 'GLASS-FILM', geometryArticle: null, title: 'Плёнка травмобезопасная', qty: pane * count, unit: 'm2', pieces: count });
  // The mass of a leaf of glass: that of a leaf of a board with the pane in place of the board (MOD-DEC-334).
  const base = Number(c.mass?.raw_decimal_kg),
    limit = Number(c.mass?.limit_kg),
    glassKg = base + P.massFactor.value * (pane * P.glassArealMass.value - ((iw * ih) / 1e6) * P.insertArealMass.value),
    kg = boards ? Math.max(base, glassKg) : glassKg,
    heavy = Number.isFinite(kg) && Number.isFinite(limit) && kg > limit,
    mass = Number.isFinite(kg)
      ? { ...c.mass, status: heavy ? 'EXCEEDS_LIMIT' : 'WITHIN_LIMIT', raw_kg: kg, raw_decimal_kg: kg, display_ceil_kg: Math.ceil(kg - 1e-9), rawKg: kg, displayKg: Math.ceil(kg - 1e-9), glass_leaf_kg: glassKg, material_activation: 'GLASS_4MM' }
      : c.mass,
    applicability = heavy && c.applicability !== 'NO_FEASIBLE_SOLUTION' ? (c.system === 'slim' ? 'MASS_LIMIT' : 'NO_FEASIBLE_SOLUTION') : c.applicability;
  return {
    ...c,
    bom,
    mass,
    applicability,
    ...(applicability !== c.applicability && c.system !== 'slim' ? { assessmentReason: 'MASS_ESTIMATE_EXCEEDS_LIMIT' } : {}),
    // The editor refuses a pane larger than ARISTO makes; a project of another size says it (the generator's remark).
    glass: { leaves: glass, width: gw, height: gh, thickness: T, film, tooLarge: gw > P.glassLimits.value.widthMax || gh > P.glassLimits.value.heightMax },
  };
}

// ---------------------------------------------------------------- the prices of the kit (step W9.3)

/** swRound of the prototype (r1.html:59248): kopecks, with the epsilon of the prototype. */
const rubRound = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The rate of a line of the kit (policy sliding-price): the snapshot of the prototype for the exact article it was
 * observed for (by the role of the system first, then the same article of another system — FINDINGS 511), a found
 * price of the exact article, a conditional price by an analogue (MOD-DEC-264, FINDINGS 512), or none.
 */
function rateOf(system: string, b: Rec, material: string, decorId: unknown): { rate: SlidingRate | null; observation: string | null; status?: string } {
  const S = SP.snapshot.value,
    row = S.systems[system]?.[b.role as SlidingRole];
  // MOD-AI-30, 70: the glass of the inserts and its film — conditional prices by the glass shops (MOD-DEC-264).
  if (b.role === 'glass' || b.role === 'glass_film') {
    const r = b.role === 'glass' ? SP.conditionalGlassRates.value[b.glass] : SP.conditionalGlassFilmRate.value;
    return r ? { rate: r, observation: r.observation, status: 'CONDITIONAL_PRICE' } : { rate: null, observation: null, status: 'PRICE_NOT_DETERMINED' };
  }
  if (b.role === 'insert') {
    // The prototype priced only the reference material Lamarty (r1.html:63220, 85787).
    if (material === S.filling.material && !decorId) return { rate: S.filling, observation: S.filling.observation };
    // Another material: the averaged price of the project (MOD-DEC-569).
    return { rate: SP.insertRate.value, observation: SP.insertRate.value.observation, status: 'PROJECT_PRICE' };
  }
  const article: string | null = b.article ?? null;
  if (!article) return { rate: null, observation: row?.observation ?? null };
  if (row?.article === article) return { rate: row, observation: row.observation };
  const same = Object.values(S.systems).flatMap((x) => Object.values(x)).find((r) => r.article === article);
  if (same) return { rate: same, observation: same.observation };
  const found = SP.foundRates.value[article] ?? SP.finishRates.value[article];
  if (found) return { rate: found, observation: found.observation, status: 'FOUND_PRICE' };
  const conditional = SP.conditionalRates.value[article];
  if (conditional) return { rate: conditional, observation: conditional.observation, status: 'CONDITIONAL_PRICE' };
  return { rate: null, observation: row?.observation ?? null, status: 'PRICE_NOT_DETERMINED' };
}

/**
 * The prices of the kit of a calculation (swMultiBom r1.html:63209 with the layers 84787, 85336, 85787): the rate
 * and amount of every line, the known subtotal of the system, its amount when every line is priced, the inserts. The
 * processing and the mounting of the doors have no rate of their own (processingAmount null), as in the prototype: the
 * quote charges them in the assembly, 14 % of C (MOD-DEC-569, 402).
 */
function kitPrices(c: Rec): Rec {
  if (c.status !== 'CANDIDATE') return c;
  const bom = (c.bom as Rec[]).map((b) => {
    const { rate, observation, status } = rateOf(c.system, b, b.material ?? c.material, b.decorId),
      priceQty = b.role === 'insert' ? fracNumber(b.areaM2) : b.qty,
      amount = rate === null || priceQty === null || priceQty === undefined ? null : rubRound(Number(priceQty) * rate.rate);
    const { id, role, article, geometryArticle, qty, unit, ...rest } = b;
    return {
      id,
      role,
      article,
      geometryArticle,
      priceObservation: observation,
      priceDate: rate === null ? null : rate.date,
      qty,
      unit,
      rate: rate === null ? null : rate.rate,
      amount,
      ...rest,
      ...(status ? { priceStatus: status } : {}),
    };
  });
  const system = bom.filter((b) => b.role !== 'insert'),
    inserts = bom.filter((b) => b.role === 'insert'),
    knownSystemSubtotal = rubRound(system.filter((b) => b.amount !== null).reduce((n, b) => n + b.amount!, 0)),
    systemAmount = system.every((b) => b.amount !== null) ? knownSystemSubtotal : null,
    // Leaves all of glass have no insert of a board: their panes are lines of the kit (MOD-AI-30, 70).
    fillingAmount = !inserts.length && c.glass ? 0 : inserts.length && inserts.every((b) => b.amount !== null) ? rubRound(inserts.reduce((n, b) => n + b.amount!, 0)) : null,
    conditional = bom.some((b) => b.priceStatus === 'CONDITIONAL_PRICE');
  return {
    ...c,
    bom,
    systemAmount,
    knownSystemSubtotal,
    fillingAmount,
    processingAmount: null,
    // MOD-DEC-264: a conditional price is a price with a mark, not a reference one (FINDINGS 512).
    priceStatus: systemAmount === null || fillingAmount === null ? 'PARTIAL_MISSING_PRICES' : conditional ? 'PARTIAL_CONDITIONAL_PRICES' : 'PARTIAL_REFERENCE',
  };
}

/** The two-track calculation of a system (the layers r1.html:63245, 84716 Slim Line and 85336 the kit). */
function doorsOf(cfg: SlidingConfig): Rec {
  const system = cfg?.system,
    n = doorCount(cfg),
    scheme = cfg.scheme === undefined ? 'ALT' : cfg.scheme,
    mirror = cfg.mirror === true,
    W = Number(cfg?.W),
    H = Number(cfg?.H),
    material = cfg?.material || 'current';
  const validSystem = slidingSystem(system) !== undefined,
    validLayout = Number.isInteger(n) && (n as number) >= 2 && (n as number) <= 5 && (scheme === 'ALT' || (scheme === 'PAIR4' && n === 4)),
    validMaterial = ['current', 'lamarty-white10-reference'].includes(material),
    validSource = cfg?.manufacturer === undefined || cfg.manufacturer === 'ARISTO',
    validOpening = cfg?.openingMode === undefined || ['auto', 'custom'].includes(cfg.openingMode),
    validFinish = profileFinishOf(cfg) !== undefined,
    validGlass = glassKnown(cfg);
  if (!validSystem || !validLayout || !validMaterial || !validSource || !validOpening || !validFinish || !validGlass || cfg?.unequal === true || (cfg?.schema !== undefined && cfg.schema !== 'MODULERO-SLIDING-1'))
    return { status: 'UNSUPPORTED_CONFIGURATION', errors: [STATUS_TEXT.unsupported], rawConfig: structuredClone(cfg), productionReady: false };
  if (!Number.isFinite(W) || !Number.isFinite(H) || W <= 0 || H <= 0) return { status: 'INVALID', errors: [STATUS_TEXT.invalidOpening] };
  const p = slidingSystem(system)!,
    count = n as number;
  let nom: Rec;
  try {
    nom = nominal({ system, n: count, W, H, scheme, mirror });
  } catch (error) {
    return { status: 'INVALID', errors: [String((error as Error).message)] };
  }
  // An opening too small for the leaves gave a leaf or an insert of zero or less: the prototype kept it, and the graph
  // stopped at the part with its code («SW-LEAF-1-INSERT: Неположительный…»). It is refused here in words (FINDINGS 1801).
  const [iw0, ih0] = nom.insert as FractionInput[];
  if ([nom.width, nom.height, nom.frame, iw0, ih0, nom.rail].some((x) => !(fracNumber(x) > 0))) return { status: 'INVALID', errors: [smallOpening(nom.width, nom.height, iw0!, ih0!)] };
  const assessment = evaluate(p, nom, W, H, count),
    bom = kitLines(nom, system),
    mass = assessment.mass ?? { status: 'UNVERIFIED_INPUT' },
    brush = bom.find((b) => b.role === 'brush');
  let c: Rec = {
    status: 'CANDIDATE',
    errors: [],
    system,
    n: count,
    scheme,
    mirror,
    W,
    H,
    manufacturer: 'ARISTO',
    profile: p.articles.vertical,
    nominal: nom,
    tracks: nom.tracks,
    closed: nom.closed,
    leafIds: cfg.leafIds?.slice(0, count) || Array.from({ length: count }, (_, i) => 'SW-LEAF-' + (i + 1)),
    door_width: nom.width,
    door_height: nom.height,
    frame_length: nom.frame,
    insert_width: nom.insert[0],
    insert_height: nom.insert[1],
    // The exact length of the solver may be a fraction («1197/2») for an opening of an older file in tenths (FINDINGS 1800).
    rail_length: fracNumber(nom.rail),
    // MOD-DEC-188: the brush is two strips of the full height per leaf (FINDINGS 357).
    brush_m: brush ? (P.brushStripsPerLeaf.value * count * nom.height) / 1000 : 0,
    clips: bom.find((b) => b.role === 'brush_clip')?.qty ?? 0,
    roller_kits: count,
    lower_stops: P.stopsPerLeaf.value * count,
    center_allowance_mm: nom.center_allowance_mm,
    bom,
    mass: massBlock(mass),
    applicability: assessment.status,
    assessmentReason: assessment.reason || assessment.required_fields?.join('; ') || null,
    legacyStopSemantics: cfg.stopShortfallMm !== undefined ? 'UNRESOLVED' : null,
    // MOD-DEC-354: the depth of the system by its guides; the prototype left Standard unknown (FINDINGS 351).
    depthReserved: slidingDepthReserve({ ...cfg, active: true }),
    material,
    materialQualified: material === 'lamarty-white10-reference' ? false : null,
    productionReady: false,
    productionExecutable: false,
    release: false,
    warnings: [
      ...(nom.center_allowance_mm !== null ? ['Узел смыкания требует уточнения.'] : []),
      ...(cfg.stopShortfallMm !== undefined ? ['Старый stopShortfallMm сохранён; смысл и физическая настройка стопора не установлены.'] : []),
      ...(nom.height / nom.width > p.limits.ratioRecommended ? ['Отношение высоты к ширине выше рекомендации 3.'] : []),
      STATUS_TEXT.physical,
    ],
  };
  if (system === 'slim') {
    c = slimLine(c, cfg, p);
    if (c.status !== 'CANDIDATE') return c;
  }
  return withKit(c, p);
}

/** Size, mass and physical status of the nominal leaves (SW_ENGINE.evaluate r1.html:62904, without a scene). */
function evaluate(p: SlidingSystemTable, nom: Rec, W: number, H: number, n: number): Rec {
  const lim = p.limits,
    [iw, ih] = nom.insert as number[],
    mass = leafMass({ inserts: [[iw!, ih!]], height: nom.height, frame: nom.frame, profileMass: p.profileMassKgPerM, limitKg: P.leafMassLimitKg.value[nom.system as SlidingSystemId] }),
    w = nom.width,
    h = nom.height,
    all = [W, H, w, h, nom.frame, iw, ih, nom.rail],
    sizeOk =
      all.every((x) => cmp(x, 0) > 0) &&
      cmp(w, lim.leafWidthMin) >= 0 &&
      cmp(w, lim.leafWidthMax) <= 0 &&
      cmp(h, lim.heightMax) <= 0 &&
      cmp(div(h, w), lim.ratioMax) <= 0 &&
      [h, nom.frame, nom.rail].every((x) => cmp(x, p.stockLength) <= 0);
  void n;
  if (!sizeOk) return { status: 'NO_FEASIBLE_SOLUTION', reason: 'SOURCE_DIMENSIONS', mass };
  if (mass.status === 'EXCEEDS_LIMIT') return { status: 'NO_FEASIBLE_SOLUTION', reason: 'MASS_ESTIMATE_EXCEEDS_LIMIT', mass };
  if (mass.status === 'UNVERIFIED_INPUT') return { status: 'UNVERIFIED_INPUT', reason: 'MATERIAL_NOT_CURRENT_OR_UNKNOWN', mass };
  return { status: 'UNVERIFIED_INPUT', required_fields: ['installed leaf bodies/poses', 'qualified per-leaf travel/stop setting', 'actual drawer bodies/full stroke', 'static bodies', 'closed joint qualification'], mass };
}

/** The kit lines of the nominal leaves (swMultiBom r1.html:63209, without the prices of the quote). */
function kitLines(nom: Rec, system: string): Rec[] {
  return (nom.bom as Rec[]).map((b) => {
    const insert = b.role === 'insert',
      ecoLower = system === 'eco' && b.role === 'lower_track';
    return {
      id: 'SW-' + b.partId,
      role: b.role,
      article: ecoLower ? 'AE0488.VP540.SLMAN.CJ' : b.geometry_article,
      geometryArticle: b.geometry_article,
      qty: fracNumber(b.net_m ?? b.quantity),
      unit: b.net_m !== undefined ? 'm' : b.unit,
      pieces: b.pieces ?? b.quantity,
      stockLengthMm: b.stock_length_mm ?? null,
      commercialNote: ecoLower ? 'Ставка отделки VP; номинальная геометрия AP при совпадении номинальной геометрии.' : null,
      width: insert ? b.size_mm[0] : null,
      height: insert ? b.size_mm[1] : null,
      thickness: insert ? P.insertThickness.value : null,
      areaM2: insert ? b.total_area_m2 : null,
    };
  });
}

/** A leaf of Slim Line inside the limits of its table, its profiles not longer than a bar (as evaluate() checks the others). */
function slimSizeOk(p: SlidingSystemTable, w: number, h: number, lengths: number[]): boolean {
  const lim = p.limits;
  return w >= lim.leafWidthMin && w <= lim.leafWidthMax && h <= lim.heightMax && h / w <= lim.ratioMax && [h, ...lengths].every((x) => x <= p.stockLength);
}

/** Slim Line by its own table (MOD-DEC-187, 172, 173, 178): mounts of the guides, the seal, its leaves and kit. */
function slimLine(c: Rec, cfg: SlidingConfig, p: SlidingSystemTable): Rec {
  const top: string = cfg.slimUpperMount || 'VISIBLE',
    bottom: string = cfg.slimLowerMount || 'surface',
    seal: string = cfg.slimSeal === 'POLYURETHANE' ? 'POLY' : cfg.slimSeal || 'BRUSH',
    offsets: Rec = P.slimHeightOffset.value;
  if (!(top in offsets) || !['surface', 'recessed'].includes(bottom) || !['BRUSH', 'PLUG', 'POLY'].includes(seal)) return { status: 'UNSUPPORTED_CONFIGURATION', errors: [STATUS_TEXT.slimMount], productionReady: false };
  // The table of Slim Line is for a carcass of 16 mm (r1.html:84737). Another carcass keeps its doors: the leaves are
  // calculated by the same table as a temporary value and the assumption is said (the owner's rule, FINDINGS 518).
  const thicknessAssumed = cfg.carcassThickness !== undefined && cfg.carcassThickness !== P.slimCarcassThickness.value;
  const n: number = c.n,
    W: number = c.W,
    K = c.scheme === 'PAIR4' ? 2 : n - 1,
    dd = P.slimWidthDeduction.value,
    D = seal === 'PLUG' ? dd.plug : n === 4 && K === 2 ? dd.centreJointPair4 : dd.brushOrPoly,
    w = ceil(div(add(W, P.slimOverlap.value * K - D), n)),
    h = Number(c.H) + offsets[top][bottom],
    frame = w - p.frameDeduction,
    iw = w - p.insertWidthDeduction,
    ih = Math.floor(h - p.insertHeightDeduction),
    visible = top === 'VISIBLE',
    upperLength = W - (top === 'HIDDEN_CABINET' ? P.slimHiddenUpperTrackDeduction.value : P.railDeduction.value),
    lowerLength = W - P.railDeduction.value;
  if ([w, h, frame, iw, ih, upperLength, lowerLength].some((x) => !Number.isFinite(x) || x <= 0)) return { status: 'INVALID', errors: [smallOpening(w, h, iw, ih)] };
  const upperFrame = visible ? p.articles.upper_frame! : P.slimHiddenUpperFrame.value,
    profileMass = { ...p.profileMassKgPerM, upper_frame: visible ? p.profileMassKgPerM.upper_frame : P.slimHiddenUpperFrameMass.value },
    mass = leafMass({ inserts: [[iw, ih]], height: h, frame, profileMass, limitKg: P.leafMassLimitKg.value.slim }),
    surface = bottom === 'surface',
    roles: Partial<Record<SlidingRole, [string, number, number]>> = {
      vertical: [p.articles.vertical!, h, 2 * n],
      upper_frame: [upperFrame, frame, n],
      lower_frame: [p.articles.lower_frame!, frame, n],
      upper_track: [p.articles.upper_track!, upperLength, 1],
      lower_track: [surface ? p.articles.lower_track! : P.slimRecessedLowerTrack.value, lowerLength, surface ? 1 : 2],
    };
  const bom: Rec[] = (c.bom as Rec[]).map((b) => {
    const r = roles[b.role as SlidingRole];
    return r ? { ...b, article: r[0], geometryArticle: r[0], qty: (r[1] * r[2]) / 1000, pieces: r[2], lengthMm: r[1] } : b;
  });
  if (!visible) {
    const hw = P.slimHiddenHardware.value,
      brackets = P.slimBrackets.value;
    for (const [role, article, qty] of [
      ['upper_internal_bracket', hw.internalBracket, brackets.internal[n as 2]],
      ['upper_external_bracket', hw.externalBracket, brackets.external[n as 2]],
      ['upper_roller_set', hw.upperRollerSet, n],
    ] as [string, string, number][])
      bom.push({ id: 'SW-' + role, role, article, geometryArticle: article, qty, unit: 'piece', pieces: qty, source: 'SLIM_SELECTED' });
  }
  const ins = bom.find((b) => b.role === 'insert');
  if (ins) Object.assign(ins, { width: iw, height: ih, areaM2: (iw * ih * n) / 1e6 });
  const oldLimit = Math.max(0, W - c.door_width),
    newLimit = Math.max(0, W - w),
    closed = (c.closed as unknown[]).map((x) => Math.max(0, Math.min(newLimit, fracNumber(x as FractionInput) * (oldLimit ? newLimit / oldLimit : 0)))),
    nominalBom = bom.map((b) => ({ role: b.role, geometry_article: b.geometryArticle, length_mm: b.lengthMm, pieces: b.pieces, quantity: b.pieces, net_m: b.qty }));
  return {
    ...c,
    nominal: { ...c.nominal, width: w, height: h, frame, insert: [iw, ih, P.insertThickness.value], rail: upperLength, closed, bom: nominalBom, source_nominal: 'SLIM_SELECTED_MOD_DEC_187' },
    closed,
    door_width: w,
    door_height: h,
    frame_length: frame,
    insert_width: iw,
    insert_height: ih,
    rail_length: upperLength,
    lower_rail_length: lowerLength,
    upperMount: top,
    lowerMount: bottom,
    seal,
    K,
    D,
    bom,
    brush_m: (P.brushStripsPerLeaf.value * n * h) / 1000,
    mass: massBlock(mass),
    // The limits of the table of Slim Line (ARISTO 09.10.2026, p. 56: height to 3200, width 500–1200): the prototype's
    // layer did not apply them and took a leaf of any width (MOD-AI-51, FINDINGS 2954).
    applicability: !slimSizeOk(p, w, h, [frame, upperLength, lowerLength]) ? 'NO_FEASIBLE_SOLUTION' : mass.status === 'EXCEEDS_LIMIT' ? 'MASS_LIMIT' : 'NOMINAL_ONLY',
    productionReady: false,
    productionExecutable: false,
    slimLocalBomIssue: null,
    ...(thicknessAssumed ? { carcassThicknessAssumedMm: P.slimCarcassThickness.value } : {}),
    warnings: [...c.warnings, STATUS_TEXT.slimTravel, ...(thicknessAssumed ? [STATUS_TEXT.slimThickness] : [])],
  };
}

/** The kit of the doors (r1.html:85336): the brush by 188, the screws of the brackets by 189, the local operations. */
function withKit(c: Rec, p: SlidingSystemTable): Rec {
  const n: number = c.n,
    heights = Array(n).fill(c.door_height) as number[],
    net = (P.brushStripsPerLeaf.value * heights.reduce((s, h) => s + h, 0)) / 1000,
    brush = { netMetres: net, purchaseMetres: Math.ceil(net), strips: P.brushStripsPerLeaf.value * heights.length },
    bom = (c.bom as Rec[]).map((b) => (b.role === 'brush' ? { ...b, qty: brush.purchaseMetres, netMetres: brush.netMetres, pieces: brush.strips, localIssue: null } : b)),
    slimHidden = c.system === 'slim' && c.upperMount !== 'VISIBLE',
    recessed = p.lowerTrackCount > 1 || c.lowerMount === 'recessed',
    g = P.inlaidGroove.value,
    near = slimHidden ? g.nearHidden : g.nearVisible,
    st = P.profileStations.value;
  return {
    ...c,
    bom,
    brushConsumption: brush,
    slimLocalBomIssue: null,
    bracketScrews: { separatelyProcured: false, referenceFormula: 'SUM(K21:L22)*8' },
    nominal: { ...c.nominal, bom: bom.map((b) => ({ role: b.role, geometry_article: b.geometryArticle, length_mm: b.lengthMm, pieces: b.pieces, quantity: b.qty, net_m: b.netMetres ?? b.qty })) },
    localOperations: {
      profileStationsMm: [st.near, st.second, c.door_height - (slimHidden ? st.hiddenFar : st.near)],
      profileWallDiametersMm: [...P.profileHoleDiameters.value],
      transverseAxis: null,
      drillDepth: null,
      grooves: recessed ? { datum: 'LOWER_PANEL_FRONT_INWARD', near, width: g.width, land: g.land, depth: g.depth, axes: [near + g.width / 2, near + g.width + g.land + g.width / 2], material: 'LDSP', source: 'SLIDING_PHYSICAL_R3' } : null,
      production: false,
    },
  };
}

// ---------------------------------------------------------------- the doors in the model

const OPENING_ID = 'SW-OPENING-1';
const ACCESS_TEXT = {
  noDoors: 'Створки ещё не выбраны.',
  candidate: 'Не подтверждены установленные тела дверей, монтажные базы, полный ход, стопоры и состав препятствий. Доступ ящика и безопасное движение пока не доказаны.',
  unsupported: 'Неподдержанная комплектация.',
  noPanels: 'Проём требует настоящие боковины, дно и крышу корпуса.',
  outside: 'Чистый проём выходит за границы реальных панелей корпуса.',
} as const;

/** Number of leaves of a configuration; the prototype took 2 when it was not given (swN). */
const leafCount = (cfg: Rec): number => Number(doorCount(cfg));

/**
 * Stable ids of the leaves (swEnsureLeafIds r1.html:63380): the given ones are kept, a missing or repeated one gets
 * the next free `SW-LEAF-k`, the ids past the number of leaves stay at the tail. Returns a new configuration.
 */
export function ensureLeafIds(config: Rec): Rec {
  const cfg = structuredClone(config),
    n = leafCount(cfg);
  if (!Number.isInteger(n) || n < 2 || n > 5) return cfg;
  const incoming: unknown[] = Array.isArray(cfg.leafIds) ? cfg.leafIds : [],
    ordinalOf = (x: unknown) => Number((typeof x === 'string' && /^SW-LEAF-(\d+)$/.exec(x)?.[1]) || 0) + 1,
    ids: string[] = [],
    used = new Set<string>();
  let changed = !Array.isArray(cfg.leafIds),
    ordinal = Math.max(1, Number.isSafeInteger(cfg.nextLeafOrdinal) ? cfg.nextLeafOrdinal : 1, ...incoming.map(ordinalOf));
  for (let i = 0; i < n; i++) {
    let id = incoming[i];
    if (typeof id !== 'string' || !id.trim() || used.has(id)) {
      changed = true;
      do id = 'SW-LEAF-' + ordinal++;
      while (used.has(id as string));
    }
    ids.push(id as string);
    used.add(id as string);
  }
  if (incoming.length < n) changed = true;
  const tail = incoming.slice(n).filter((id): id is string => typeof id === 'string' && !!id.trim() && !used.has(id));
  cfg.leafIds = ids.concat(tail);
  cfg.nextLeafOrdinal = Math.max(ordinal, Number(cfg.nextLeafOrdinal) || 1);
  if (changed) cfg.leafIdMigration = { source: 'LEGACY_OR_PARTIAL_IDS', preserved: incoming.filter((id, i) => ids[i] === id).length };
  return cfg;
}

/**
 * The clear opening of the doors between the real panels of the carcass (swOpening r1.html:59501): from the inner face
 * of the outer left side to that of the outer right one, from the highest bottom to the lowest roof. A custom opening
 * is centred in it and may not exceed it. Of bodies stacked one over another (the mezzanine, MOD-DEC-200) the doors
 * close the body on the floor: its bottom and its roof bound the opening, the mezzanine over it keeps its own fronts
 * (Д, MOD-AI-63, FINDINGS 2950). The prototype took the bottom of the mezzanine and the roof of the body under it,
 * and the doors fell off without a word.
 */
export function slidingOpening(boxes: readonly { id: string; part: Rec; x0: number; x1: number; y0: number; y1: number }[], cfg: Rec): Rec {
  const of = (kind: string) => boxes.filter((b) => b.part.kind === kind),
    over = (a: (typeof boxes)[number], b: (typeof boxes)[number]) => a !== b && a.x0 < b.x1 && b.x0 < a.x1,
    left = of('sideLeft').sort((a, b) => a.x0 - b.x0)[0],
    right = of('sideRight').sort((a, b) => b.x1 - a.x1)[0],
    bottom = of('bottom').filter((b, _, all) => !all.some((x) => over(x, b) && x.y1 <= b.y0)),
    top = of('top').filter((b, _, all) => !all.some((x) => over(x, b) && x.y1 <= b.y0));
  if (!left || !right || !bottom.length || !top.length) return { status: 'INVALID', errors: [ACCESS_TEXT.noPanels] };
  const x0 = left.x1,
    y0 = Math.max(...bottom.map((b) => b.y1)),
    maxW = right.x0 - x0,
    maxH = Math.min(...top.map((b) => b.y0)) - y0,
    custom = cfg?.openingMode === 'custom',
    W = custom ? Number(cfg.W) : maxW,
    H = custom ? Number(cfg.H) : maxH,
    eps = 1e-6;
  if (![W, H, maxW, maxH].every((x) => Number.isFinite(x) && x > 0) || W > maxW + eps || H > maxH + eps) return { status: 'INVALID', errors: [ACCESS_TEXT.outside] };
  return { status: 'VALID', W, H, maxW, maxH, x0: x0 + (maxW - W) / 2, y0, x1: x0 + (maxW + W) / 2, y1: y0 + H, sourcePanelIds: [left.id, right.id, ...bottom.map((b) => b.id), ...top.map((b) => b.id)] };
}

/** What the installation of the doors leaves unknown (swRealPhysicalAdapter r1.html:63736). */
function physicalAdapter(): Rec {
  const unknown = (source: string) => ({ value: null, unit: 'mm', source, complete: false, status: 'UNKNOWN' });
  return {
    origin: 'PROJECT_ADAPTER',
    status: 'BLOCKED_PHYSICAL_INPUTS',
    fields: {
      installedLeafBodies: unknown('Геометрия установленных деталей не подтверждена данными производителя.'),
      mountingTransforms: unknown('Installation base unverified'),
      closedLayout: unknown('Closed installed pose unverified'),
      perLeafTravel: unknown('Full travel unverified'),
      stopSettings: unknown('Constructible stop positions unverified'),
      staticObstacles: unknown('Complete installed obstacles unverified'),
      drawerMovingBodies: unknown('Actual box/front/handle bodies unverified'),
      drawerFullStroke: unknown('BOYARD nominal length is not verified full stroke'),
    },
  };
}

/**
 * The access to the drawers behind the doors (r1.html:63444): physically not proven while the installation is unknown;
 * nominally — the 5 mm of MOD-DEC-175 to the open leaves at a reachable position of the set (sliding-access.ts,
 * FINDINGS 551). Without doors there is nothing to reach.
 */
function access(calc: Rec, n: number, opening: Rec, drawers: DrawerSpan[]): Rec {
  if (n === 0) return { status: 'NO_DOORS', reason: ACCESS_TEXT.noDoors, drawers: [], physicalValidation: false };
  const status = calc.status === 'CANDIDATE' ? 'BLOCKED_PHYSICAL_INPUTS' : calc.status === 'INVALID' ? 'UNVERIFIED_INPUT' : 'UNSUPPORTED_CONFIGURATION',
    leaves = calc.status === 'CANDIDATE' ? { width: calc.door_width, closed: (calc.closed as FractionInput[]).map(fracNumber), tracks: calc.tracks } : null;
  return {
    status,
    reason: calc.status === 'CANDIDATE' ? ACCESS_TEXT.candidate : calc.errors?.join(' ') || ACCESS_TEXT.unsupported,
    drawers: drawers.map((dr) => ({ drawerId: dr.id, status: 'BLOCKED_PHYSICAL_INPUTS', ...(leaves ? { nominal: drawerAccess(leaves, opening as { x0: number; W: number }, dr) } : {}) })),
    physicalValidation: false,
  };
}

/**
 * The inserts of the leaves as parts of the order (WR-13, MOD-DEC-294, FINDINGS 358): LDSP 10 mm, one per leaf, in
 * the specification and the cut list. They stand in the nominal pose of the prototype's drawing (r1.html:85010): the
 * leaf at its closed position, on the axis of its track, its bottom over the opening; the insert in the middle of
 * its leaf (Д). The pose is nominal — the installation of ARISTO is not qualified (physicalAdapter).
 */
/** The nominal pose of the leaves (r1.html:85025): the axis of each track from the front edge, the bottom over the opening. */
function leafPose(calc: Rec): { axes: number[]; bottom: number } {
  const slimHidden = calc.system === 'slim' && calc.upperMount !== 'VISIBLE',
    inlaid = calc.system === 'standard',
    bottoms = P.nominalLeafBottom.value;
  return {
    axes: P.nominalLeafAxes.value[inlaid ? 'inlaid' : slimHidden ? 'hidden' : 'visible'],
    bottom: (inlaid ? bottoms.standard : calc.lowerMount === 'recessed' ? bottoms.recessed : bottoms.surface) ?? 0,
  };
}

function insertParts(calc: Rec, opening: Rec, leafIds: string[]): Rec[] {
  if (calc.status !== 'CANDIDATE' || !calc.insert_width || !calc.insert_height) return [];
  const { axes, bottom } = leafPose(calc),
    T = P.insertThickness.value,
    iw: number = calc.insert_width,
    ih: number = calc.insert_height,
    local: Rec = calc.leafMaterialIntents ?? {};
  return leafIds.map((leafId, i) => {
    const x = opening.x0 + fracNumber(calc.closed[i]) + (calc.door_width - iw) / 2,
      y = opening.y0 + bottom + (calc.door_height - ih) / 2,
      axis = axes[calc.tracks[i]] ?? axes[0]!,
      g = glassOf(calc.glass?.leaves?.[i]);
    // MOD-AI-30, 70: a pane of glass or mirror, 4 mm, centred in the leaf as the insert of a board (FINDINGS 2957).
    if (g) {
      const gw: number = calc.glass.width,
        gh: number = calc.glass.height,
        t: number = calc.glass.thickness,
        gx = opening.x0 + fracNumber(calc.closed[i]) + (calc.door_width - gw) / 2,
        gy = opening.y0 + bottom + (calc.door_height - gh) / 2;
      return {
        id: leafId + '-INSERT',
        name: `${g.title} створки ${i + 1} (${t} мм)`,
        L: gh,
        W: gw,
        T: t,
        q: 1,
        kind: 'slidingInsert',
        handedness: 'none',
        role: 'door',
        moduleId: null,
        sectionId: null,
        floorContactEdges: [],
        edges: { A: 'NONE', B: 'NONE', C: 'NONE', D: 'NONE' },
        texture: 'NONE',
        materialFamily: g.family,
        orientationFamily: 'uprightWidth',
        leafId,
        leafIndex: i,
        track: calc.tracks[i],
        glass: g.id,
        worldBox: { x0: gx, x1: gx + gw, y0: gy, y1: gy + gh, z0: axis - t / 2, z1: axis + t / 2 },
        poseBasis: 'NOMINAL_DIAGRAM',
      };
    }
    return {
      id: leafId + '-INSERT',
      name: `Вставка створки ${i + 1} (ЛДСП ${T} мм)`,
      L: ih,
      W: iw,
      T,
      q: 1,
      kind: 'slidingInsert',
      handedness: 'none',
      role: 'door',
      moduleId: null,
      sectionId: null,
      floorContactEdges: [],
      edges: { A: 'NONE', B: 'NONE', C: 'NONE', D: 'NONE' },
      texture: 'L',
      materialFamily: 'LDSP',
      orientationFamily: 'uprightWidth',
      leafId,
      leafIndex: i,
      track: calc.tracks[i],
      leafMaterial: local[leafId]?.material ?? calc.material ?? 'current',
      leafDecorId: local[leafId]?.decorId ?? null,
      // MOD-DEC-573 (FINDINGS 1618): the material of the catalogue of the leaf chosen in the editor; a record of the
      // prototype has none.
      ...(local[leafId]?.materialId ? { leafMaterialId: local[leafId].materialId } : {}),
      worldBox: { x0: x, x1: x + iw, y0: y, y1: y + ih, z0: axis - T / 2, z1: axis + T / 2 },
      poseBasis: 'NOMINAL_DIAGRAM',
    };
  });
}

const X: Vec3 = [1, 0, 0],
  Y: Vec3 = [0, 1, 0],
  Z: Vec3 = [0, 0, 1];

/**
 * The section of a profile or a guide for its 3D: the record of the catalogue by the article (`slidingProfiles`,
 * FINDINGS 1083); the depth of a guide is the width of the policy the record names. null — the catalogue does not know it.
 */
export function slidingProfileSection(profiles: readonly SlidingProfile[], article: unknown): { faceMm: number; depthMm: number } | null {
  const p = profiles.find((x) => x.article === article),
    depthMm = p ? (p.sectionMm.depthMm ?? slidingTrackWidth(p.depthMmFrom)) : null;
  return p && depthMm !== null ? { faceMm: p.sectionMm.faceMm, depthMm } : null;
}

/**
 * The 3D of the profiles and the guides of the doors (FINDINGS 916–918): prisms of the sections of the catalogue
 * (slidingProfiles of the fittings, MOD-DEC-432, 536, FINDINGS 1083) in the nominal pose of the inserts — the two vertical profiles of each leaf over its
 * full height, the upper and the lower frame of the frame length between them, centred on the axis of the track like
 * the insert (an asymmetric vertical profile stands off the axis by its drawing, FINDINGS 1353); the upper guide under the roof flush with the front edge, the lower one on the bottom at the setback
 * of the mounting scheme or, inlaid, in its grooves. Product axes of the graph (X right, Y back, Z up). The profiles
 * belong to the insert of their leaf (hidden with the fronts); a hidden upper guide of Slim Line is not drawn — the
 * carcass is built as for the visible one (MOD-DEC-354). A section the catalogue does not know is not drawn.
 */
function systemVisuals(calc: Rec, opening: Rec, leafIds: string[], lowerSetback: number | null, profiles: readonly SlidingProfile[]): HardwareVisual[] {
  if (calc.status !== 'CANDIDATE') return [];
  const { axes, bottom } = leafPose(calc),
    article = (role: SlidingRole) => (calc.bom as Rec[]).find((b) => b.role === role)?.geometryArticle,
    section = (role: SlidingRole) => slidingProfileSection(profiles, article(role)),
    vertical = section('vertical'),
    behind = vertical ? (P.verticalProfileBehindAxis.value[article('vertical')] ?? vertical.depthMm / 2) : 0,
    upper = section('upper_frame'),
    lower = section('lower_frame'),
    w: number = calc.door_width,
    h: number = calc.door_height,
    frame: number = calc.frame_length,
    // The colour of the profiles (MOD-AI-24): silver matt is lighter than the metal of the other hardware (FINDINGS 2956).
    finish = (profileFinishOf(calc) ?? P.profileFinishes.value[0]).visual,
    out: HardwareVisual[] = [];
  const add = (id: string, hostPartId: string | null, originMm: Vec3, uAxis: Vec3, vAxis: Vec3, nAxis: Vec3, sizeMm: Vec3) =>
    out.push({ id, hostPartId, originMm, uAxis, vAxis, nAxis, sizeMm, contourMm: null, finish });
  leafIds.forEach((leafId, i) => {
    const x0 = opening.x0 + fracNumber(calc.closed[i]),
      z0 = opening.y0 + bottom,
      axis = axes[calc.tracks[i]] ?? axes[0]!,
      host = leafId + '-INSERT',
      xf = x0 + (w - frame) / 2;
    if (vertical)
      for (const [side, x] of [
        ['L', x0],
        ['R', x0 + w - vertical.faceMm],
      ] as const)
        add(`${leafId}-V-VERTICAL-${side}`, host, [x, axis + behind - vertical.depthMm, z0], X, Y, Z, [vertical.faceMm, vertical.depthMm, h]);
    // A frame along X: its section in the plane Y, Z.
    if (upper) add(`${leafId}-V-FRAME-UPPER`, host, [xf, axis - upper.depthMm / 2, z0 + h - upper.faceMm], Y, Z, X, [upper.depthMm, upper.faceMm, frame]);
    if (lower) add(`${leafId}-V-FRAME-LOWER`, host, [xf, axis - lower.depthMm / 2, z0], Y, Z, X, [lower.depthMm, lower.faceMm, frame]);
  });
  const along = (length: number) => opening.x0 + (opening.W - length) / 2,
    upperTrack = section('upper_track'),
    lowerTrack = section('lower_track'),
    upperLength: number = calc.rail_length,
    lowerLength: number = calc.lower_rail_length ?? calc.rail_length,
    hiddenUpper = calc.system === 'slim' && calc.upperMount !== 'VISIBLE',
    grooves: Rec | null = calc.localOperations?.grooves ?? null;
  if (upperTrack && !hiddenUpper) add(`${OPENING_ID}-V-TRACK-UPPER`, null, [along(upperLength), 0, opening.y1 - upperTrack.faceMm], Y, Z, X, [upperTrack.depthMm, upperTrack.faceMm, upperLength]);
  if (lowerTrack && grooves)
    // Inlaid: the guide stands in its groove, its foot at the bottom of the groove (ARISTO pp. 35, 59).
    (grooves.axes as number[]).forEach((y, k) =>
      add(`${OPENING_ID}-V-TRACK-LOWER-${k + 1}`, null, [along(lowerLength), y - lowerTrack.depthMm / 2, opening.y0 - grooves.depth], Y, Z, X, [lowerTrack.depthMm, lowerTrack.faceMm, lowerLength]),
    );
  else if (lowerTrack && lowerSetback !== null) add(`${OPENING_ID}-V-TRACK-LOWER-1`, null, [along(lowerLength), lowerSetback, opening.y0], Y, Z, X, [lowerTrack.depthMm, lowerTrack.faceMm, lowerLength]);
  return out;
}

/**
 * The doors of a sliding wardrobe in its model (swModel r1.html:59602 with the layers 63437, 63878, 84787): the block
 * `m.sliding` and the inserts of the leaves as parts. The opening is read from the carcass that is already built; the
 * fasteners and the front grid of the carcass do not see the doors. `boxes` are the boxes of the carcass parts.
 */
/**
 * The grooves of an inlaid lower guide (AS0690 of Standard and of Slim Line recessed) in the bottoms under the opening:
 * the two grooves of the calculation (10.5 × 7 mm, axes 30.25 / 70.75 mm from the front edge of the bottom; ARISTO
 * pp. 35, 59), along the guide of W − 2 mm. Where they are cut was not decided by the owner: the bottom of the carcass
 * is a temporary choice of the executor (Д) said in the problems, the technology is not confirmed (FINDINGS 519).
 */
function trackGrooves(calc: Rec, opening: Rec, boxes: Parameters<typeof slidingOpening>[0]): Rec[] {
  const g: Rec | null = calc.status === 'CANDIDATE' ? calc.localOperations?.grooves : null;
  if (!g) return [];
  const length: number = calc.lower_rail_length ?? calc.rail_length,
    from = opening.x0 + (opening.W - length) / 2,
    to = from + length;
  // The guide lies on the bottom of the opening, not on the bottom of a mezzanine over it (FINDINGS 2950).
  return boxes
    .filter((b) => b.part.kind === 'bottom' && (opening.sourcePanelIds as string[]).includes(b.id) && b.x1 > from && b.x0 < to)
    .flatMap((b) =>
      (g.axes as number[]).map((axis, i) => ({
        dpOwners: [],
        mechanismId: OPENING_ID,
        panel: b.id,
        face: 'inside',
        orientation: 'L',
        start: Math.max(from, b.x0) - b.x0,
        end: Math.min(to, b.x1) - b.x0,
        offset: axis,
        width: g.width,
        depth: g.depth,
        semanticType: 'GROOVE_FOR_SLIDING_TRACK',
        purpose: 'Паз врезной нижней направляющей купе · временно (Д)',
        profileId: TRACK_GROOVE_PROFILE,
        machiningIntent: { semanticType: 'GROOVE_FOR_SLIDING_TRACK', status: 'EXECUTOR_TEMPORARY' },
        resolvedMachining: { profileId: TRACK_GROOVE_PROFILE, resolvedWidthMm: g.width, resolvedDepthMm: g.depth, resolver: 'SLIDING_TRACK_CATALOG', productionConfirmed: false, requiresTechnologyConfirmation: true },
        requiresTechnologyConfirmation: true,
        operationId: `SW-G${i + 1}`,
      })),
    );
}

const TRACK_GROOVE_PROFILE = 'MODULERO-SLIDING-TRACK-GROOVE-TEMP';

export function slidingDoorsBlock(m: Rec, d: Rec, boxes: Parameters<typeof slidingOpening>[0], profiles: readonly SlidingProfile[]): { sliding: Rec; parts: Rec[]; grooves: Rec[] } {
  const cfg = ensureLeafIds(d.slidingWardrobe),
    n = leafCount(cfg),
    opening = slidingOpening(boxes, cfg),
    calc = opening.status === 'VALID' ? slidingCalc({ ...cfg, W: opening.W, H: opening.H, carcassThickness: m.t }) : opening,
    reserved = n === 0 ? 0 : slidingDepthReserve(cfg),
    backReservation = d.backProfile?.mode === 'quarter' ? (d.backProfile.rebateWidthMm ?? 0) : 0,
    leaves: string[] = n === 0 ? [] : (cfg.leafIds ?? []).slice(0, n),
    units = new Map<string, Rec>(((m.drawerUnits ?? []) as Rec[]).map((u) => [u.id, u])),
    // A mezzanine over the doors opens by its own fronts: its drawers are not behind the leaves (FINDINGS 2950).
    bottoms = new Map<string, string>(((m.modules ?? []) as Rec[]).map((mod) => [mod.id, mod.panelIds?.bottom])),
    behind = (s: Rec) => opening.status !== 'VALID' || (opening.sourcePanelIds as string[]).includes(bottoms.get(s.moduleId) ?? ''),
    // The sections behind the doors, left to right: a shift of one is said as their widths (FINDINGS 2958).
    floor = ((m.sectionsData ?? []) as Rec[]).filter(behind).sort((a, b) => a.clearStart - b.clearStart),
    sectionWidthsMm = floor.map((s) => s.nominalWidth as number),
    // The moving parts of each drawer across the product: the closed volume of its box and runners (sliding-access.ts).
    drawers: DrawerSpan[] = floor.flatMap((s, sectionIndex) => {
      const section = { sectionClearWidthMm: s.clearEnd - s.clearStart, sectionWidthMm: s.nominalWidth, sectionWidthsMm, sectionIndex };
      return [
        ...((s.drawers ?? []) as Rec[]).map((x) => ({ id: x.id, x0: units.get(x.id)!.box.x0, x1: units.get(x.id)!.box.x1, ...section })),
        // MOD-DEC-484: a basket or a trouser rack pulls out between the leaves as a drawer does.
        ...((s.storage ?? []) as Rec[]).filter((x) => x.pullOut && x.itemId).map((x) => ({ id: x.id, x0: x.box.x0, x1: x.box.x1, ...section })),
      ];
    });
  const sliding = {
    schema: 'MODULERO-SLIDING-1',
    config: cfg,
    opening,
    calc,
    depth: {
      Doverall: m.dimensions?.Doverall,
      Dcorpus: m.dimensions?.Dcorpus,
      Dside: m.D,
      // MOD-DEC-354: Standard has its depth; the prototype left it unknown here (FINDINGS 351).
      reserved,
      backReservation,
      Dusable: reserved === null ? null : m.D - reserved - backReservation,
      // MOD-DEC-354: the setback of a surface lower guide by the mounting scheme; an inlaid one has none (FINDINGS 351).
      lowerFrontSetback: lowerTrackSetback(cfg),
    },
    ids: { leaves, opening: OPENING_ID },
    // FINDINGS 916–918: the profiles and the guides in 3D, the models of the SLIDING_SYSTEM mechanism.
    visuals: systemVisuals(calc, opening, leaves, lowerTrackSetback(cfg), profiles),
    productionReady: false,
    access: access(calc, n, opening, drawers),
    physicalAdapter: physicalAdapter(),
    origin: 'PROJECT_ADAPTER',
  };
  return { sliding, parts: insertParts(calc, opening, leaves), grooves: trackGrooves(calc, opening, boxes) };
}

// ---------------------------------------------------------------- the revisions of the doors (step W9.3)

/** What the revisions of the doors are taken against: the revision of the project and its price snapshot. */
export interface SlidingRevisionIds {
  /** Revision of the project: Revision.projectRevisionId of the graph, the digest of the input (FE-PROJ-001). */
  projectId: string;
  /** Versions.priceSnapshotId of the graph: the digest of the price snapshot of the project (MOD-DEC-028). */
  priceSnapshotId: string | null;
}

/**
 * The digests and revisions of the doors (swModel r1.html:63467, 63934): the rules, the sources, the technical state
 * (the doors, the opening and the parts) and the commercial one (the price snapshot, the costs, the priced kit), and
 * the guard a later result of the doors is accepted against. The prototype took the project id of its workspace and
 * the rates of its form; here the project is the revision of the graph and the rates its price snapshot, so the
 * digests are the graph's, read back without loss (FINDINGS 515). Needs the costs of the model (the price).
 */
export function slidingRevisions(m: Rec, ids: SlidingRevisionIds): Rec {
  const s = m.sliding,
    c = s.calc,
    rulesDigest = contentDigest({ ruleSet: RULE_SET_VERSION, policies: Object.fromEntries([slidingDoors, slidingPrice, wardrobeSliding].map((p) => [p.id, p.version])) }),
    sourceDigest = contentDigest({ rulesDigest, systems: P.systems.value, prices: Object.fromEntries(Object.entries(SP).map(([k, v]) => [k, v.value])), adapter: s.physicalAdapter?.status ?? null }),
    technicalDigest = contentDigest({ rulesDigest, config: s.config, opening: s.opening, parts: (m.parts as Rec[]).map((p) => [p.id, p.kind, p.L, p.W, p.T]) }),
    commercialDigest = contentDigest([ids.priceSnapshotId, m.costs ?? null, Array.isArray(c?.bom) ? c.bom.map((b: Rec) => [b.article, b.rate, b.amount]) : []]),
    revisions = {
      project: contentDigest([ids.projectId, technicalDigest, commercialDigest]),
      technical: contentDigest([ids.projectId, technicalDigest]),
      commercial: contentDigest([ids.projectId, commercialDigest]),
    };
  return {
    technicalDigest,
    commercialDigest,
    rulesDigest,
    sourceDigest,
    projectId: ids.projectId,
    revisions,
    guard: { projectId: ids.projectId, technicalRevision: revisions.technical, technicalDigest, rulesDigest, sourceDigest },
  };
}
