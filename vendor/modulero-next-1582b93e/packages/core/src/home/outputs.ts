// Derived outputs: cut list, visual items, quantities, hardware list, price, load summary, issues, CSV.
import { articleItem } from '../catalog/hardware/articles.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { backSplit } from '../engine/policy/back-split.js';
import { DP_WARNING } from '../engine/policy/optional-parts.js';
import { HOME, homeRules } from '../engine/policy/home.js';
import type { MaterialCatalog } from '../catalog/materials.js';
import { carcassDecorName } from './decor.js';
import { allFronts, frontGeometry, homeBackFixing, wallHangingOf } from './geometry.js';
import { HDF_BACK_MATERIAL, physicalGraph, toBoard } from './graph.js';
import { joinery } from './joinery.js';
import { hingeProfile, homeCasters, homeHandles, homeHangers, homeLatches, homeLegs, homeLift, homeLights, homeRailPlan, homeShelfSupport, runnerInfo } from './mechanisms.js';
import type { Board, Door, HardwareLine, HomeProject, Issue, Unresolved, VisualItem } from './types.js';
import { validate } from './validate.js';

/** Cut list: every board except floor pads. Validates the project unless asked not to. */
export function parts(p: HomeProject, hw: HardwareCatalogs, skipValidation = false): Board[] {
  if (!skipValidation) validate(p, hw);
  return physicalGraph(p, hw)
    .parts.filter((q) => q.semanticRole !== 'floor_pad')
    .map(toBoard);
}

export interface VisualOptions {
  backs?: boolean;
  fronts?: boolean;
  opened?: boolean;
}

/** Boxes for the 2D/3D view, including conventional handles. */
export function visualParts(p: HomeProject, hw: HardwareCatalogs, options: VisualOptions = {}): VisualItem[] {
  const out = physicalGraph(p, hw)
    .parts.map(toBoard)
    .filter((q) => options.backs !== false || (q.semanticRole !== 'structural_back' && q.semanticRole !== 'hdf_back')) as unknown as VisualItem[];
  for (const q of out) {
    const b = p.bodies.find((b) => b.id === q.bodyId)!,
      f = allFronts(b).find((f) => f.id === q.elementId);
    if (!f) continue;
    if (options.opened && (b.drawers as unknown[]).includes(f)) q.z -= runnerInfo(p, hw, b, f).NL * 0.8;
    // r5 (MOD-AI-40): a flap front stays closed in the opened view — the path of its lift is not in the data.
    if (options.opened && q.role === 'door' && !(f as Door).lift) {
      q.rotationY = (f as { hinge: string }).hinge === 'left' ? Math.PI / 2 : -Math.PI / 2;
      q.x += (f as { hinge: string }).hinge === 'left' ? -q.w / 2 : q.w / 2;
      q.z -= q.w / 2;
    }
  }
  // r5 (FINDINGS 965): the handle of the catalogue by its size where the wardrobe's rule sets it; r3, r4 — a box of the knob.
  const fitted = homeRules(p).handles ? homeHandles(p, hw) : null;
  for (const h of fitted ?? []) {
    const b = p.bodies.find((x) => x.id === h.bodyId)!,
      f = allFronts(b).find((x) => x.id === h.frontId)!,
      { lengthMm: L, heightMm: H, thicknessMm: T } = h.handle.sizeMm,
      knob = h.handle.kind === 'KNOB',
      [w, hh] = knob ? [L, T] : h.orientation === 'VERTICAL' ? [T, L] : [L, T],
      drawer = (b.drawers as unknown[]).includes(f);
    out.push({
      id: h.id,
      bodyId: b.id,
      elementId: f.id,
      role: 'handle',
      frontRole: drawer ? 'drawer-front' : 'door',
      name: h.handle.name,
      material: 'hardware',
      x: h.centreMm[0] - w / 2,
      y: h.centreMm[2] - hh / 2,
      z: -H - (options.opened && drawer ? runnerInfo(p, hw, b, f).NL * 0.8 : 0),
      w,
      h: hh,
      d: H,
    });
  }
  for (const b of fitted ? [] : p.bodies)
    for (const f of allFronts(b)) {
      const g = frontGeometry(p, b, f),
        door = (b.doors as unknown[]).includes(f),
        x = b.x + g.x + (door ? ((f as { hinge: string }).hinge === 'left' ? g.w - 40 : 40) : g.w / 2);
      out.push({
        id: b.id + ':' + f.id + ':handle',
        bodyId: b.id,
        elementId: f.id,
        role: 'handle',
        frontRole: door ? 'door' : 'drawer-front',
        name: 'Ручка · условное изображение',
        material: 'hardware',
        x: x - 10,
        y: b.y + g.y + g.h / 2 - 10,
        z: -25 - (options.opened && !door ? runnerInfo(p, hw, b, f).NL * 0.8 : 0),
        w: 20,
        h: 20,
        d: 25,
        proposedGeometry: true,
      });
    }
  // r5 (MOD-DEC-516): the legs of a body on legs, by the footprint of the leg of the catalogue.
  for (const b of p.bodies)
    if (b.base?.kind === 'legs') {
      const legs = homeLegs(p, hw, b),
        size = legs.leg.footprint.sizeMm;
      legs.stationsMm.forEach(([x, y], i) =>
        out.push({ id: b.id + ':leg-' + i, bodyId: b.id, elementId: null, role: 'leg', name: legs.leg.name, material: 'hardware', x: b.x + x - size / 2, y: b.y, z: y - size / 2, w: size, h: legs.heightMm, d: size }),
      );
    }
  // r5 (MOD-AI-73): the casters of a body on casters, by the plate of the caster of the catalogue.
  for (const b of p.bodies) {
    const c = b.base?.kind === 'casters' ? homeCasters(p, hw, b) : null;
    if (c)
      c.stationsMm.forEach(([x, y], i) => {
        const item = i < c.brakedCount ? c.braked : c.plain,
          size = item.footprint.sizeMm;
        out.push({ id: b.id + ':caster-' + i, bodyId: b.id, elementId: null, role: 'leg', name: item.name, material: 'hardware', x: b.x + x - size / 2, y: b.y, z: y - size / 2, w: size, h: c.heightMm, d: size });
      });
  }
  return out.filter((q) => options.fronts !== false || !['door', 'drawer-front', 'handle'].includes(q.role));
}

export type Quantities = Record<
  | 'board' | 'board16' | 'edge' | 'cut' | 'join' | 'join16' | 'support' | 'glide' | 'restraint' | 'assembly'
  | 'hinge' | 'runner' | 'frontFix' | 'handle',
  number
>;

export function quantities(p: HomeProject, hw: HardwareCatalogs): Quantities {
  const g = physicalGraph(p, hw),
    list = parts(p, hw),
    car = g.joints.filter((j) => j.group === 'carcass'),
    box = g.joints.filter((j) => j.group === 'drawer'),
    hinge = p.bodies.reduce((s, b) => s + b.doors.reduce((v, f) => v + (hingeProfile(p, hw, b, f).count || 0), 0), 0);
  return {
    board: list
      .filter((a) => (!a.semanticRole.startsWith('drawer_') || a.semanticRole === 'drawer_front') && a.semanticRole !== 'hdf_back')
      .reduce((s, a) => s + (a.cutLength * a.cutWidth) / 1e6, 0),
    board16: list
      .filter((a) => a.semanticRole.startsWith('drawer_') && a.semanticRole !== 'drawer_front' && a.material !== HDF_BACK_MATERIAL)
      .reduce((s, a) => s + (a.cutLength * a.cutWidth) / 1e6, 0),
    edge: list.reduce((s, a) => s + a.edgeM, 0),
    cut: list.length,
    join: car.reduce((s, j) => s + j.connectorStations, 0) / 2,
    join16: box.reduce((s, j) => s + j.connectorStations, 0) / 2,
    support: p.bodies.reduce((s, b) => s + b.shelves.filter((s) => !s.fixed).length, 0),
    glide: Math.ceil(g.parts.filter((q) => q.semanticRole === 'floor_pad').length / (p.floor === 'hard' ? 32 : 20)),
    // r5 (MOD-AI-33): a body on the wall hangs on its hangers, it needs no restraint against tipping.
    restraint: standingBodies(p),
    assembly: 1,
    hinge,
    runner: p.bodies.reduce((s, b) => s + b.drawers.length, 0),
    // r5 (FINDINGS 1750): the front of the box of a concealed runner is on the cams of the box, not on screws.
    frontFix: p.bodies.reduce((s, b) => s + b.drawers.filter((f) => !runnerInfo(p, hw, b, f).concealed).length, 0),
    // r5 (FINDINGS 965): a handle of the catalogue per front, none «без ручек»; r3, r4 — the knob of each front.
    handle: homeRules(p).handles ? homeHandles(p, hw).length : p.bodies.reduce((s, b) => s + allFronts(b).length, 0),
  };
}

/**
 * The hardware list. The positions are the catalogue's items the policy names (HOME.hardwareItems, CAT-4): the line
 * gets the article (UNKNOWN when the catalogue has none) and the name of the item; a runner pair — the article of its length.
 */
/** The bodies standing on the floor: the restraint against tipping is theirs (r5: not of a body on the wall, MOD-AI-33). */
const standingBodies = (p: HomeProject): number => p.bodies.filter((b) => !wallHangingOf(p, b)).length;
/** The record of an article of Hettich in the catalogue of articles, or undefined. */
const hettich = (hw: HardwareCatalogs, article: string) => hw.articles.items.find((x) => x.brand === 'Hettich' && x.article === article);

export function hardware(p: HomeProject, hw: HardwareCatalogs): HardwareLine[] {
  const g = physicalGraph(p, hw),
    I = HOME.hardwareItems,
    out: HardwareLine[] = [],
    add = (key: string, itemId: string, quantity: number, unit = 'шт.', condition = '', sku?: string, name?: string) => {
      const x = articleItem(hw.articles, itemId);
      if (quantity > 0) out.push({ id: p.id + ':hardware:' + key, sku: sku ?? x.article ?? 'UNKNOWN', name: name ?? x.name, quantity, unit, condition, priceStatus: 'UNKNOWN' });
    };
  const camJ = g.joints.filter((j) => j.recipe !== 'MAKMART_S16');
  for (const thickness of [16, 18])
    add(
      'cam-' + thickness,
      thickness === 16 ? I.cam16 : I.cam18,
      camJ.filter((j) => j.recipe === 'RASTEX' + thickness + '_DU325').reduce((s, j) => s + j.connectorStations, 0),
    );
  add('stud', I.stud, camJ.reduce((s, j) => s + j.connectorStations, 0));
  add('wood', I.dowel, g.joints.reduce((s, j) => s + j.woodDowels, 0));
  add(
    'confirmat',
    I.confirmat,
    g.joints.filter((j) => j.recipe === 'MAKMART_S16').reduce((s, j) => s + j.connectorStations, 0),
    'шт.',
    'Посадка головки и физическая квалификация требуют проверки.',
  );
  if (homeRules(p).shelfSupportRule === 'WARDROBE') {
    // r5 (FINDINGS 845): the support of each removable shelf bought by its parts, a line per article, as the wardrobe
    // (344); a support without its parts is a line of its article. The spare levels are holes, not supports.
    const lines = new Map<string, HardwareLine>(),
      line = (sku: string, name: string, quantity: number, condition: string) => {
        const id = p.id + ':hardware:shelf:' + sku,
          x = lines.get(id);
        if (x) x.quantity += quantity;
        else lines.set(id, { id, sku, name, quantity, unit: 'шт.', condition, priceStatus: 'UNKNOWN' });
      };
    for (const b of p.bodies)
      for (const s of b.shelves.filter((s) => !s.fixed)) {
        const plan = homeShelfSupport(p, hw, b, s),
          support = plan.support;
        if (!support || !plan.quantity) continue;
        const condition = plan.kit?.missing.length ? 'Комплект не собран: ' + plan.kit.missing.join('; ') : '';
        if (plan.kit?.parts.length)
          for (const x of plan.kit.parts) line(x.article, `Полкодержатель ${support.article}: ${x.role === 'BODY' ? 'корпус' : 'шток'}${x.colour ? ', ' + x.colour : ''}`, plan.quantity, condition);
        else line(support.article, `Полкодержатель ${support.article}`, plan.quantity, condition);
      }
    out.push(...lines.values());
  } else add('shelf', I.shelfSupport, p.bodies.reduce((s, b) => s + b.shelves.filter((s) => !s.fixed).length * 4, 0));
  const pads = g.parts.filter((q) => q.semanticRole === 'floor_pad').length;
  if (p.floor === 'hard')
    add('pads', I.padsHard, quantities(p, hw).glide, 'комплект', 'Нарезать ' + pads + ' накладок14×50×3; совместимость с полом требует проверки.');
  else {
    add('pads', I.padsCarpet, quantities(p, hw).glide * 20, 'шт.', 'Установить ' + pads + '; упаковка20шт.');
    add('pad-screws', I.padScrew, pads * 2);
  }
  // r5 (MOD-DEC-701, FINDINGS 2611): the screws of the parts of a split back on the rear edges of their supports.
  add('back-screws', backSplit.constants.seamScrewItem.value, homeBackFixing(p).screws, 'шт.', 'Части задней стенки ХДФ — к торцу перегородки или неподвижной полки, шаг не больше 300 мм.');
  // r5 (MOD-DEC-516, FINDINGS 947): the legs of a body on legs — a line per body by the article of the catalogue.
  for (const b of p.bodies)
    if (b.base?.kind === 'legs') {
      const legs = homeLegs(p, hw, b);
      out.push({
        id: p.id + ':hardware:' + b.id + ':legs',
        sku: legs.leg.article,
        name: legs.leg.name,
        quantity: legs.stationsMm.length,
        unit: 'шт.',
        condition: (legs.temporary ? 'Временно: ' + legs.temporary + '. ' : '') + 'Нагрузка ножки не рассчитана.',
        priceStatus: 'UNKNOWN',
      });
    }
  // r5 (MOD-AI-73, FINDINGS 3320): the casters of a body on casters — a line per model, the braked and the plain one.
  for (const b of p.bodies) {
    const c = b.base?.kind === 'casters' ? homeCasters(p, hw, b) : null;
    if (!c) continue;
    for (const [key, item, n] of [['casters-brake', c.braked, c.brakedCount], ['casters', c.plain, c.stationsMm.length - c.brakedCount]] as const)
      out.push({
        id: p.id + ':hardware:' + b.id + ':' + key,
        sku: item.article,
        name: item.name,
        quantity: n,
        unit: 'шт.',
        condition: (c.substitution ? 'Временно: ' + c.substitution + '. ' : '') + (item.brake ? 'Передний ряд, с тормозом.' : 'Задний ряд.') + ' Привинчивают к дну на месте.',
        priceStatus: 'UNKNOWN',
      });
  }
  // r5 (MOD-AI-37, FINDINGS 3315): the lights of the lit niches by their article, and their power supply, as the wardrobe's.
  const lighting = homeLights(p, hw);
  for (const article of new Set(lighting.lights.map((l) => l.light.article))) {
    const ls = lighting.lights.filter((l) => l.light.article === article);
    out.push({ id: p.id + ':hardware:light:' + article, sku: article, name: ls[0]!.light.name, quantity: ls.length, unit: 'шт.', condition: 'Ставят монтажники на месте, под крышку ниши (MOD-DEC-483).', priceStatus: 'UNKNOWN' });
  }
  if (lighting.supply)
    out.push({ id: p.id + ':hardware:power-supply', sku: lighting.supply.item.article, name: lighting.supply.item.name, quantity: lighting.supply.quantity, unit: 'шт.', condition: `Светильники — ${num(lighting.supply.loadW)} Вт.`, priceStatus: 'UNKNOWN' });
  // r5 (MOD-AI-36, FINDINGS 3319): the latches of the doors opened by pressing, one line by the article of the latch.
  const latches = p.pushToOpen ? homeLatches(p, hw, physicalGraph(p, hw)).latches : [];
  if (latches.length) {
    const l = latches[0]!.latch;
    out.push({ id: p.id + ':hardware:latch:' + l.article, sku: l.article, name: l.name, quantity: latches.length, unit: 'шт.', condition: 'В передней кромке дна, неподвижной полки или крышки за дверью; дверь — на петлях без пружины (MOD-DEC-483, 485).', priceStatus: 'UNKNOWN' });
  }
  // r5 (MOD-AI-40, FINDINGS 3314): the lift of a flap front — a line by the article of its row of the lift catalogue.
  for (const b of p.bodies)
    for (const f of b.doors.filter((x) => x.lift && homeRules(p).flapFronts)) {
      const l = homeLift(p, hw, b, f);
      out.push({
        id: p.id + ':hardware:' + f.id + ':lift',
        sku: l.row?.articles[0]?.article ?? '',
        name: l.row?.name ?? 'Подъёмник откидного фасада не подобран',
        quantity: l.quantity,
        unit: 'комплект',
        condition: (l.status === 'SELECTED' ? '' : 'Временно: ' + l.reason + '. ') + 'Присадки подъёмника в каталоге нет (MOD-DEC-277).',
        priceStatus: 'UNKNOWN',
      });
    }
  // r5 (MOD-AI-33): the hangers SAH 216 of a body on the wall — a line per article of the kit of the kitchen's profile,
  // the wall sets with them; the rail of all of them cut from stock rails, as the kitchen plans it.
  for (const b of p.bodies) {
    const w = wallHangingOf(p, b);
    if (!w) continue;
    for (const x of homeHangers(p, b, g).items) {
      const item = hettich(hw, x.article);
      out.push({
        id: p.id + ':hardware:' + b.id + ':hanger:' + x.article,
        sku: x.article,
        name: item?.name ?? 'Hettich ' + x.article,
        quantity: x.quantity,
        unit: x.article === w.wallSet.article ? 'комплект' : 'шт.',
        condition:
          x.article === w.wallSet.article
            ? `Только после проверки стены: ${w.wallTypes.join(', ')}. Крепление выбирает монтажник.`
            : `Навесы ${w.profileId}: нагрузка и стена не квалифицированы.`,
        priceStatus: 'UNKNOWN',
      });
    }
  }
  const rails = homeRailPlan(p);
  if (rails) {
    const w = homeRules(p).wallHanging!,
      item = hettich(hw, w.rail.article);
    out.push({
      id: p.id + ':hardware:hanger-rail',
      sku: w.rail.article,
      name: item?.name ?? 'Hettich ' + w.rail.article,
      quantity: rails.stock,
      unit: 'шт.',
      condition: `Шина ${rails.stockMm} мм, нарезать: ${rails.cutsMm.join(', ')} мм (ширина корпуса минус две боковины).`,
      priceStatus: 'UNKNOWN',
    });
  }
  const standing = standingBodies(p);
  add('restraint', I.restraint, standing * 2);
  add('restraint-plate', I.restraintPlate, standing * 2);
  add('restraint-screws', p.thickness === 18 ? I.restraintScrew18 : I.restraintScrew16, standing * 4);
  add(
    'wall-anchors',
    I.wallAnchor,
    standing * 4,
    'комплект',
    'Только после проверки стены: бетон C20/25 или полнотелый кирпич Mz12; слой≤5 мм, от края≥35 мм, Ø6×45 минимум. Устойчивость изделия не квалифицирована.',
  );
  const plate = articleItem(hw.articles, I.hinge).includedPlate,
    selected = homeRules(p).hingeRule === 'WARDROBE';
  for (const b of p.bodies) {
    for (const f of b.doors) {
      const hp = hingeProfile(p, hw, b, f);
      // r5 (FINDINGS 841): the hinge and its plate of the hinge catalogue, a line each, as in the kitchen (K3).
      if (selected) {
        const line = (key: string, sku: string, name: string) =>
          hp.count && out.push({ id: p.id + ':hardware:' + f.id + ':' + key, sku, name, quantity: hp.count, unit: 'шт.', condition: '', priceStatus: 'UNKNOWN' });
        if (hp.sku) line('hinge', String(hp.sku), `Петля ${hp.manufacturer} ${hp.sku}`);
        if (hp.plateArticle) line('plate', String(hp.plateArticle), `Монтажная планка ${hp.manufacturer} ${hp.plateArticle}`);
        continue;
      }
      add(f.id + ':hinge', I.hinge, hp.count || 0, 'комплект', `Одна планка включена; дополнительных ${plate}: 0.`);
      add(f.id + ':screws', I.hingeScrew, (hp.count || 0) * 4, 'шт.', 'Поставочная включённость и точный код заказа неизвестны.');
    }
    for (const f of b.drawers) {
      const n = runnerInfo(p, hw, b, f);
      add(f.id + ':runner', I.runner, 1, 'пара', '', n.sku);
      // r5 (FINDINGS 1750): a concealed runner is screwed into the holes of its kit in the side panels; the clips under
      // the bottom and the front on the cams of the box take no screw of this list.
      if (n.concealed) add(f.id + ':runner-screw', I.runnerScrew, 2 * n.cabinetMountZ.length, 'шт.', 'В отверстия Ø2,5 набора БАЗИС; крепёж фиксаторов под дном — из комплекта направляющей.');
      // r5 (FINDINGS 2746): a ball runner of the level drilled by its kit — a screw in each hole of the kit, in the side
      // panels and in the box sides, 3,5 × 16 as in the kit (Д); the front is fixed to the box as before.
      else if (n.kitHoles) {
        add(f.id + ':runner-screw', I.kitRunnerScrew, 2 * (n.kitHoles.carcassFromFrontMm.length + n.kitHoles.boxFromFrontMm.length), 'шт.', 'В отверстия Ø3 набора БАЗИС в боковинах корпуса и ящика.', undefined, 'Hettich винт 3.5×16 для направляющей');
        add(f.id + ':front-fix', I.frontScrew, 4);
      } else {
        add(f.id + ':runner-screw', I.runnerScrew, 16);
        add(f.id + ':front-fix', I.frontScrew, 4);
      }
    }
    if (!homeRules(p).handles) for (const f of allFronts(b)) add(f.id + ':handle', I.handle, 1, 'комплект', 'Отверстие ручки не рассчитано.');
  }
  // r5 (MOD-DEC-513, FINDINGS 965): the handle of the catalogue — a line of its article for all the fronts, as the wardrobe.
  const handles = homeHandles(p, hw);
  if (handles.length) {
    const h = handles[0]!.handle;
    out.push({ id: p.id + ':hardware:handle', sku: h.article, name: h.name, quantity: handles.length, unit: 'шт.', condition: 'Отверстия под ручку сверлят монтажники по месту (MOD-DEC-158).', priceStatus: 'UNKNOWN' });
  }
  return out;
}

export const HINGE_SCREWS_INCLUDED_NOTE = 'Ставка комплекта петли включает 4 монтажных самореза 4×16.';

export function loadSummary(p: HomeProject, hw: HardwareCatalogs) {
  const g = physicalGraph(p, hw);
  const volumeMass = (q: { extent_mm: number[] }) => (q.extent_mm.reduce((a, b) => a * b, 1) * p.density) / 1e9;
  return {
    physicalQualified: false,
    densityKgM3: p.density,
    E_MPa: p.materialProfile === 'legacy-custom' ? HOME.elasticityLegacy : HOME.elasticity,
    E_Basis: 'Среднее опубликованное значение; предварительный балочный расчёт.',
    shelves: g.loads.filter((l) => g.parts.find((q) => q.elementId === l.elementId)?.semanticRole?.includes('shelf')),
    desks: g.loads.filter((l) => g.parts.find((q) => q.id === l.elementId)?.semanticRole === 'continuous_top'),
    drawers: p.bodies.flatMap((b) =>
      b.drawers.map((f) => {
        const n = runnerInfo(p, hw, b, f),
          boards = g.parts.filter((q) => q.elementId === f.id),
          reserve = HOME.drawerHardwareReserveKg,
          mass = boards.reduce((s, q) => s + volumeMass(q), 0) + reserve + p.plannedDrawerLoadKg;
        const frontMass = () => boards.filter((q) => q.semanticRole === 'drawer_front').reduce((s, q) => s + volumeMass(q), 0);
        return {
          bodyId: b.id,
          elementId: f.id,
          NL: n.NL,
          boxMassKg: mass - reserve - p.plannedDrawerLoadKg - frontMass(),
          frontMassKg: frontMass(),
          hardwareReserveKg: reserve,
          payloadKg: p.plannedDrawerLoadKg,
          totalMassKg: mass,
          pairPublishedCapacityKg: n.loadKg,
          reserveKg: n.loadKg - mass,
          physicalQualified: false,
        };
      }),
    ),
    doors: p.bodies.flatMap((b) =>
      b.doors.map((f) => {
        const h = hingeProfile(p, hw, b, f),
          // r5 (MOD-DEC-355; FINDINGS 842): the mass of the door itself, without the reserve of r3.
          reserve = homeRules(p).hingeRule === 'WARDROBE' ? 0 : HOME.doorHardwareReserveKg;
        return {
          bodyId: b.id,
          elementId: f.id,
          frontMassKg: h.mass - reserve,
          hardwareReserveKg: reserve,
          totalMassKg: h.mass,
          hingeCount: h.count,
          hingePitchMm: h.stations && h.stations.length > 1 ? h.stations[1] - h.stations[0] : null,
          stations: h.stations,
          stationIds: h.stations?.map((_, k) => f.id + ':hinge-' + k),
          physicalQualified: false,
        };
      }),
    ),
  };
}

const ISSUE_MESSAGES: Record<string, string> = {
  CUTTER_INTERSECTION: 'Сверления пересекаются в одной физической детали.',
  CUTTER_OUTSIDE: 'Объём сверления выходит за физическую деталь.',
  SMALL_DRAWER_PATTERN: 'Ящик слишком мал для принятой схемы шкантов; требуется другой проверенный узел.',
  SHARED_SHELF_DEPTH: 'Глубина общей полки ниже области принятой схемы соединения.',
};

/** r4 (MOD-DEC-238, H-09): every unresolved question in plain words, never a bare code. */
const PLAIN_MESSAGES: Record<string, string> = {
  ...ISSUE_MESSAGES,
  SHARED_SHELF_DEPTH: 'Перегородка слишком мелкая: гнёзда полок по системе 32 мм не помещаются (нужна глубина от 202 мм).',
  SHELF_BOUNDARY: 'У закреплённой полки нет опоры с одной стороны: нужна боковина или перегородка.',
  HINGE_PROFILE: 'Для этой дверцы нет подтверждённой схемы петель: проверьте её размеры, массу и толщину плиты.',
  HINGE_CHART: 'Дверца выходит за подтверждённый график петель: стоит наибольшее число петель графика. Нужна другая схема петель или две дверцы вместо одной.',
  HINGE_SHELF: 'Петлю нельзя увести от закреплённой полки: сдвиньте полку или измените высоту дверцы.',
  DRAWER_LOAD: 'Ящик с грузом тяжелее, чем выдерживает пара направляющих. Уменьшите нагрузку или размер ящика.',
  // r5 (FINDINGS 1755): the runner of the level of the hardware does not suit the drawer — another is taken (465).
  DRAWER_RUNNER_SUBSTITUTED: 'Направляющая уровня комплектации не подходит этому ящику: стоит другая направляющая.',
  DEFLECTION: 'Полка или крышка может заметно прогнуться: расчёт по экрану L/200 — предупреждение, порог не утверждён.',
  BORE_BOUNDARY: 'Отверстие выходит за край детали.',
  OUTSIDE_ROOM: 'Изделие больше заданного помещения: проверьте размеры помещения и изделия.',
  FACADE_SEAM_NARROW: 'Шов между фасадами уже ' + HOME.frontMinSeam + ' мм: кромки соседних фасадов могут задевать друг друга.',
  DRILLING_INCOMPLETE:
    'Присадка фурнитуры неполная: комплекта и страницы каталога нет, отверстия петель, полкодержателей, направляющих и крепления фасадов ящиков определяет владелец.',
  SHELF_SUPPORT_LOAD: 'Полка с грузом тяжелее, чем выдерживают полкодержатели. Уменьшите нагрузку или ширину полки либо закрепите полку.',
  SHELF_CLEARANCE: 'Над полкой или под ней слишком мало места: до соседней полки, дна или крышки. Сдвиньте или уберите полку.',
  BODY_NOT_SUPPORTED: 'Корпус не стоит на полу: подпятники не передают нагрузку. Опустите корпус на пол.',
  // r5 (FINDINGS 844, 845): the removable shelf on the grid of System 32 and its support of the wardrobe.
  SHELF_SYSTEM32_MOVED: 'Съёмная полка стоит на ближайшем уровне системы 32 мм, а не на введённой высоте.',
  SHELF_SYSTEM32_OFF_GRID: 'В проёме нет уровня системы 32 мм для этой съёмной полки: она стоит на введённой высоте. Измените проём или закрепите полку.',
  SHELF_SUPPORT_MISSING: 'Для съёмной полки не подобран полкодержатель: присадки и фурнитуры для неё нет.',
  BORE_IN_REBATE: 'Крепёж заходит в четверть задней стенки из ХДФ: отверстие потеряет держание и испортит четверть.',
  // r5 (MOD-DEC-574, FINDINGS 1305): the bottom of HDF of a drawer in the groove of its walls.
  BORE_IN_GROOVE: 'Крепёж стенки ящика заходит в паз дна из ХДФ: паз перережет крепёж, дно потеряет опору.',
  // r5 (MOD-DEC-515, FINDINGS 939): the back of HDF in a rebate, as the wardrobe's, bears nothing.
  // r5 (MOD-DEC-516, FINDINGS 947): legs of a height no leg of the catalogue gives.
  LEGS_TEMPORARY: 'Ножек такой высоты в каталоге нет: стоит ближайшая ножка каталога, временно. Измените высоту ножек.',
  PANELS_OMITTED: DP_WARNING,
  // r5 (MOD-AI-37): a lit niche no light of the catalogue fits.
  LIGHT_NOT_FITTED: 'Ниши уже самого короткого светильника каталога: подсветки в них нет.',
  // r5 (MOD-AI-40): a flap front without a compatible lift of the catalogue.
  LIFT_TEMPORARY: 'Подъёмника для этого откидного фасада в каталоге нет: стоит ближайший, временно. Измените высоту фасада или ширину корпуса.',
  HANGER_LOAD: 'Подвесной корпус с грузом тяжелее, чем держат два навеса и шина. Уменьшите корпус или нагрузку полок.',
  BACK_HDF:
    'Задняя стенка из ХДФ 4 мм стоит в четверти и не несёт нагрузку, как у шкафа: жёсткость корпуса на перекос с ней не рассчитана. Крепление задника в четверти выбирает мебельщик.',
};

const DRILLING_INCOMPLETE_R5 =
  'Присадка фурнитуры неполная: комплекта и страницы каталога нет, отверстия полкодержателей, направляющих и крепления фасадов ящиков определяет владелец.';
/** r5 with the supports of the wardrobe: their holes are the catalogue's too (FINDINGS 844). */
const DRILLING_INCOMPLETE_R5_SUPPORTS =
  'Присадка фурнитуры неполная: комплекта и страницы каталога нет, отверстия направляющих и крепления фасадов ящиков определяет владелец.';

const num = (v: unknown) => String(Math.round(Number(v) * 10) / 10).replace('.', ',');

/** r4 (MOD-DEC-368): the numbers behind a load or clearance check, after its plain text. */
const PLAIN_DETAILS: Record<string, (u: Unresolved) => string> = {
  DRAWER_LOAD: (u) => ` Ящик с грузом — ${num(u.massKg)} кг, пара направляющих держит ${num(u.capacityKg)} кг.`,
  DRAWER_RUNNER_SUBSTITUTED: (u) => ` ${String(u.reason).replace(/\.$/, '')}.`,
  SHELF_SUPPORT_LOAD: (u) => ` Полка с грузом — ${num(u.massKg)} кг, полкодержатели держат ${num(u.capacityKg)} кг.`,
  SHELF_CLEARANCE: (u) => ` Просвет ${num(u.clearanceMm)} мм, нужно не меньше ${num(u.minMm)} мм.`,
  BODY_NOT_SUPPORTED: (u) => ` Корпус поднят над полом на ${num(u.elevationMm)} мм.`,
  SHELF_SYSTEM32_MOVED: (u) => ` Высота полки от пола — ${num(u.toMm)} мм вместо введённых ${num(u.fromMm)} мм.`,
  SHELF_SUPPORT_MISSING: (u) => (u.reason ? ` ${String(u.reason).replace(/\.$/, '')}.` : ''),
  PANELS_OMITTED: (u) => ` Корпус в нише без ${(u.omitted as string[]).map((k) => (k === 'top' ? 'крышки' : 'дна')).join(' и ')}.`,
  HANGER_LOAD: (u) => ` Корпус с грузом — ${num(u.massKg)} кг, навесы и шина держат ${num(u.capacityKg)} кг.`,
  LEGS_TEMPORARY: (u) => ` ${String(u.reason).replace(/^./, (c) => c.toUpperCase()).replace(/\.$/, '')}.`,
  LIGHT_NOT_FITTED: (u) => ` Корпус ${String(u.bodyNo)}: ширина ниш — ${(u.widthsMm as number[]).map(num).join('; ')} мм.`,
  LIFT_TEMPORARY: (u) => (u.reason ? ` ${String(u.reason).replace(/^./, (c) => c.toUpperCase()).replace(/\.$/, '')}.` : ''),
  HINGE_CHART: (u) =>
    ` Дверца ${num(u.widthMm)} × ${num(u.heightMm)} мм, ${num(u.massKg)} кг` + (u.maxWidthMm != null && Number(u.widthMm) > Number(u.maxWidthMm) ? `; график петли — для дверей шириной до ${num(u.maxWidthMm)} мм.` : '.'),
};

/** Text of an unresolved code as issues() shows it; the rule set of the project decides the wording. */
export function issueText(code: string, p?: HomeProject, u?: Unresolved): string {
  // r5: the hinge holes are the kit's or the catalogue's (FINDINGS 841), the rest of the hardware is still the prototype's.
  if (p && code === 'DRILLING_INCOMPLETE' && homeRules(p).hingeRule === 'WARDROBE')
    return homeRules(p).shelfSupportRule === 'WARDROBE' ? DRILLING_INCOMPLETE_R5_SUPPORTS : DRILLING_INCOMPLETE_R5;
  // r5 (MOD-DEC-748): the threshold of the pilot, the payload asked and the one the part takes.
  if (p && code === 'DEFLECTION' && homeRules(p).uniformLoadLimit && u?.allowableKg !== undefined)
    return `Полка или крышка прогнётся больше L/200 — порога пилота: груз ${num(u.payloadKg)} кг, а пролёт держит ${num(u.allowableKg)} кг (ориентир). Уменьшите нагрузку или пролёт, добавьте перегородку.`;
  // r5 (MOD-AI-37, FINDINGS 3316): the hinge of a glass door without a chart of the manufacturer.
  if (p && code === 'HINGE_CHART' && u?.noChart)
    return `У петли для стекла ${String(u.noChart)} нет графика числа петель производителя: стоят ${num(u.count)} петли, их число проверяет мебельщик. Дверца ${num(u.widthMm)} × ${num(u.heightMm)} мм, ${num(u.massKg)} кг.`;
  if (p && homeRules(p).issueTexts === 'PLAIN')
    return (PLAIN_MESSAGES[code] || 'Требуется уточнение конструктивного узла.') + (u && PLAIN_DETAILS[code] ? PLAIN_DETAILS[code](u) : '');
  return ISSUE_MESSAGES[code] || 'Требуется уточнение конструктивного узла: ' + code;
}

/** Codes that have a plain text in r4 (the test checks every code the generator raises is among them). */
export const PLAIN_ISSUE_CODES: readonly string[] = Object.keys(PLAIN_MESSAGES);

export function issues(p: HomeProject, hw: HardwareCatalogs): Issue[] {
  const out: Issue[] = [
    { code: 'PHYSICAL_QUALIFICATION', text: 'Перед изготовлением и использованием требуются проверка соединений, установки и устойчивости.' },
    { code: 'HINGE_SWEEP', text: 'Открывание показано условно. Полный ход механизма, фуга и столкновения требуют проверки.' },
    { code: 'DRILLING_HOLD', text: 'Присадка — инженерная схема. Производственная квалификация крепежа, инструмента и сверлений не завершена.' },
    {
      code: 'KIT_LEVEL',
      // r5: the level chooses the support of a removable shelf, as the wardrobe (223, 332, 344; FINDINGS 845), and the
      // runner of the drawers with its box (FINDINGS 1750).
      text:
        homeRules(p).shelfSupportRule !== 'WARDROBE'
          ? 'Подтверждённый комплект один; уровни комплектации пока используют одинаковый состав.'
          : p.drawerRunner === 'level' && homeRules(p).drawerRunnerRule
            ? 'Уровень комплектации выбирает полкодержатель съёмной полки и направляющие ящиков с их коробом; остальная фурнитура пока одна для всех уровней.'
            : 'Уровень комплектации выбирает полкодержатель съёмной полки; остальная фурнитура пока одна для всех уровней.',
    },
  ];
  if (!p.boardConfirmed)
    out.push({ code: 'BOARD_INPUT', text: 'Подтвердите фактическую плиту; расчёт использует выбранный справочный профиль.' });
  for (const u of joinery(p, hw).unresolved)
    out.push({
      code: u.code,
      text: issueText(u.code, p, u),
      partId: u.partId,
      holeIds: u.holeIds,
    });
  if (!p.antiTipConfirmed && standingBodies(p)) out.push({ code: 'ANTI_TIP', text: 'Требуется подходящая защита от опрокидывания и проверка её установки.' });
  return out;
}

const CSV_HEADER = [
  'Ревизия', 'Позиция', 'Тип', 'ID', 'Наименование', 'SKU', 'Количество', 'Ед.', 'Материал',
  'Длина заготовки, мм', 'Ширина заготовки, мм', 'Толщина, мм', 'Кромка, м', 'Условие',
];

/**
 * The material of a part as the user reads it (R5-013, FINDINGS 1962): the decor of the board by its name, the back of
 * HDF as «ХДФ»; r1 wrote the key of the decor («oak»). A key outside the catalogue stays as it is.
 */
export function csvMaterial(key: string, mc?: MaterialCatalog): string {
  if (key === HDF_BACK_MATERIAL) return 'ХДФ';
  // r5 (MOD-AI-39): a decor of the catalogue by its name.
  return carcassDecorName(key, mc);
}

/** Cut list and hardware as CSV for Excel (UTF-8 BOM, semicolons, formula-injection guard). */
export function csv(p: HomeProject, hw: HardwareCatalogs, rev: unknown): string {
  const esc = (x: unknown) => '"' + String(x ?? '').replace(/^[=+\-@]/, "'$&").replaceAll('"', '""') + '"',
    rows: unknown[][] = [CSV_HEADER],
    // r4 and r5 name the decor (R5-013, FINDINGS 1962); r3 writes its key, as the prototype r1.
    plain = homeRules(p).issueTexts === 'PLAIN';
  parts(p, hw).forEach((a, i) =>
    rows.push([rev, i + 1, 'Деталь', a.id, a.name, '', 1, 'шт.', plain ? csvMaterial(a.material, hw.materials) : a.material, a.cutLength, a.cutWidth, a.thickness, a.edgeM, '']),
  );
  hardware(p, hw).forEach((a) =>
    rows.push([rev, rows.length, 'Фурнитура', a.id, a.name, a.sku, a.quantity, a.unit, '', '', '', '', '', a.condition]),
  );
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
}
