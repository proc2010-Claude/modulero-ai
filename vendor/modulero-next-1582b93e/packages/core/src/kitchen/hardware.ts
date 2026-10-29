// The hardware of the kitchen (task K3, MIGRATION_PLAN step 4.3): the prototype's kflowHardware layered over six
// wrappers (r1.html:70651–79990) written out as one call path. Outermost first:
//   khr (hinges, lifts, mechanisms, TANDEM kits, feet, plinth clips, handles, shelf supports, joints, niche and
//   traverse brackets, the suspension rail, cabinet interconnects, the confirmat kits named) → kap (appliance
//   installation kits) → kcr (drawer joints of the constructions) → kre (TANDEM drawers, SAH216 hangers, the rail)
//   → k7 (the kits and dowels of the carcass fasteners F7) → k5 (the cleats of the single-body corner) → base.
// The rows of the worktops (fixing brackets, connectors, seals, cutout seals) are those of the whole worktops of the
// scene (worktops.ts, task K4).
//
// "r1.html:N" is a line of reference/prototype_r1/MODULERO_UNIFIED_PROTOTYPE_r1.html.
import type { Rec } from '../engine/policy/project-state.js';
import { APPLIANCE_PROFILES, applianceSelections, calculated, hangerEligible, isAppliance, isConstruction, k5CornerHardware, k5Selected, railsOnTop } from './carcass.js';
import { levelHanger, levelHangerOf } from './hanger.js';
import { PROFILE, derived, dowelFeet, faceContact, footPlateBoxes, peninsulaContacts, sideFaces } from './derived.js';
import { kitchenWorktops } from './worktops.js';
import { isFree, isSingleCorner, worldBox, type KitchenScene } from './room.js';
import { jsonClone } from '../engine/json-clone.js';
import { kitchen } from '../engine/policy/kitchen.js';
import { levelRunner } from './drawer-runner.js';
import { backSeamScrews } from '../engine/policy/back-split.js';
import { barCutting } from '../engine/bar-cutting.js';
import { EDGE_SCREW, KITCHEN_DEFAULT_HANDLE, kitchenHandle, kitchenHandleFixing, kitchenHandleRecord, kitchenHandleFronts, kitchenHandlePlaces } from './fittings.js';

const clone = jsonClone;
const TANDEM = 'BLUM-TANDEM560H5000B-WOOD16';
const SAH216 = 'TECHR3-SAH216-BACK-RECESS16';
const FOOT_KIT = '9028286';
const RAIL_STOCK_MM = 3000;
/** The kerf of a cut of a profile handle: the prototype's for a bar of metal (the hanger rail, r1.html:79812). */
const HANDLE_KERF_MM = 3;

type Derived = (m: Rec) => Rec;

/** The feet 9028286 and the SAH216 hangers of a module (kflowHardware, r1.html:70651). */
function baseRows(s: KitchenScene): Rec[] {
  return s.modules.flatMap((m): Rec[] =>
    m.supportKit === FOOT_KIT
      ? (
          [
            ['9028286', 4],
            ['9028230', 4],
            ['61855', 2],
            ['base screw 4x35', 16],
          ] as [string, number][]
        ).map(([article, quantity]) => ({ moduleId: m.id, article, quantity, price: null, scope: 'Explicit user-selected four-support scheme; no load approval' }))
      : m.hangerVariant === SAH216 && !levelHanger(m)
        ? (
            [
              ['9249369', 1],
              ['9249370', 1],
              ['52118', (m.width - 2 * (m.panelThickness ?? 16)) / 1000],
              ['side screw 3.5x20', 2],
              ['roof screw 3.5x30', 2],
            ] as [string, number][]
          ).map(([article, quantity]) => ({ moduleId: m.id, article, quantity, unit: article === '52118' ? 'm' : 'piece', price: null }))
        : [],
  );
}

/** k5 and k7: the cleats of the corner and the kits and dowels of the carcass fasteners (r1.html:71079, 71420). */
function fastenerRows(s: KitchenScene, d: Derived): Rec[] {
  return [
    ...baseRows(s),
    ...s.modules.flatMap((m) => (k5Selected(m) && calculated(s, m).status !== 'FAIL' ? k5CornerHardware(m) : [])),
    ...s.modules.flatMap((m) => {
      const r = d(m).fastenersR7;
      return r
        ? [
            ...r.kits.map((k: Rec) => ({ moduleId: m.id, article: k.profileId, physicalId: k.physicalId, quantity: 1, price: k.rateRub, components: k.components, scope: 'ordinary eccentric kit20; component holes do not bill kit again' })),
            ...r.woodItems.map((w: Rec) => ({ moduleId: m.id, article: '9223927', physicalId: w.physicalId, quantity: 1, price: null, scope: 'wood8x35 nominal; price unaccepted' })),
          ]
        : [];
    }),
  ];
}

const jointRows = (m: Rec, r: Rec, scope: string): Rec[] => [
  ...r.kits.map((k: Rec) => ({ moduleId: m.id, article: k.profileId, physicalId: k.physicalId, quantity: 1, unit: 'kit', price: k.rateRub, components: k.components, scope })),
  ...r.woodItems.map((w: Rec) => ({ moduleId: m.id, article: '9223927', physicalId: w.physicalId, quantity: 1, unit: 'piece', price: null })),
];

/** kre: the TANDEM drawers of the drawer cabinet, the SAH216 hangers and their stock rails (r1.html:73922). */
function drawerRows(s: KitchenScene, d: Derived): Rec[] {
  const eligible = s.modules.filter(hangerEligible),
    ids = new Set(eligible.map((m) => m.id)),
    rows = fastenerRows(s, d).filter((h) => !ids.has(h.moduleId) || !['9249369', '9249370', '52118', 'side screw 3.5x20', 'roof screw 3.5x30'].includes(h.article));
  for (const m of s.modules.filter((m) => m.drawerProfile === TANDEM && levelRunner(m))) {
    // MOD-DEC-514 (FINDINGS 1863): a drawer of a new module — the pair of the runner of the level by its article (509);
    // the box of its kit is of the board, the TANDEM kit is not bought.
    const runners = new Map<string, Rec>();
    for (const p of d(m).parts ?? []) if (p.drawerRunner && !runners.has(p.drawerId)) runners.set(p.drawerId, p.drawerRunner);
    for (const [did, r] of runners)
      rows.push({
        moduleId: m.id,
        drawerId: did,
        physicalId: did + '/' + r.article + '/L+R',
        article: r.article,
        manufacturer: r.brand,
        name: 'Направляющие ящика',
        variant: 'L+R',
        quantity: 1,
        unit: 'pair',
        price: null,
        hardwareProfile: r.slideId,
        scope: 'Runner of the hardware level by MOD-DEC-466/514; box of the BAZIS kit of the project board',
      });
    const r = d(m).drawerJoints;
    if (r) rows.push(...jointRows(m, r, 'Project drawer joint; nominal source profile'));
  }
  for (const m of s.modules.filter((m) => m.drawerProfile === TANDEM && !levelRunner(m))) {
    for (let i = 1; i <= 4; i++) {
      const did = m.id + ':drawer:' + i;
      for (const [article, q, unit, variant] of [
        ['560H5000B', 1, 'pair', 'L+R'],
        ['T51.1700.04', 1, 'piece', 'left'],
        ['T51.1700.04', 1, 'piece', 'right'],
        ['661.1450.HG', 6, 'piece', '6x14.5'],
        ['609.1500', 4, 'piece', 'lock underside'],
        ['9278224', 4, 'piece', 'facade rigid joint3.5x30'],
      ] as [string, number, string, string][])
        rows.push({
          moduleId: m.id,
          drawerId: did,
          physicalId: did + '/' + article + '/' + variant,
          article,
          manufacturer: article === '9278224' ? 'Hettich' : 'BLUM',
          variant,
          quantity: q,
          unit,
          price: null,
          scope: 'Complete drawer installation KIT; wood and pilot qualification separate',
        });
    }
    const r = d(m).drawerJoints;
    if (r) rows.push(...jointRows(m, r, 'Project drawer joint; nominal source profile'));
  }
  const cuts = eligible.map((m) => ({ moduleId: m.id, lengthMm: m.width - 2 * (m.panelThickness ?? 16) })).sort((a, b) => b.lengthMm - a.lengthMm),
    stocks: Rec[] = [];
  for (const cut of cuts) {
    if (cut.lengthMm > RAIL_STOCK_MM) continue;
    let stock = stocks.find((x) => x.remainingMm >= cut.lengthMm);
    if (!stock) {
      stock = { stockIndex: stocks.length + 1, remainingMm: RAIL_STOCK_MM, cuts: [] };
      stocks.push(stock);
    }
    stock.cuts.push(cut);
    stock.remainingMm -= cut.lengthMm;
  }
  for (const m of eligible)
    for (const [article, q] of [
      ['9249369', 1],
      ['9249370', 1],
      ['45168', 2],
      ['9278224', 2],
      ['65480', 4 + (m.width >= 900 ? 1 : 0)],
    ] as [string, number][])
      rows.push({
        moduleId: m.id,
        article,
        manufacturer: 'Hettich',
        quantity: q,
        unit: article === '65480' ? 'set' : 'piece',
        physicalId: m.id + '/hanger/' + article,
        price: null,
        scope: 'SAH216 source-qualified conditions; wall fixing set for listed solid wall materials only',
      });
  for (const stock of stocks)
    rows.push({
      moduleId: stock.cuts[0].moduleId,
      article: '9007651',
      manufacturer: 'Hettich',
      quantity: 1,
      unit: 'stock rail3000mm',
      physicalId: 'kitchen/suspension-rail/' + stock.stockIndex,
      price: null,
      cutPlan: stock.cuts,
      wasteMm: stock.remainingMm,
      scope: 'Whole kitchen stock rail; separate cut pieces, rail130kg and wall/cabinet capacities not cumulative',
    });
  rows.push(...levelHangerRows(s));
  return rows;
}

/**
 * The hangers of the level of the new wall cabinets (MOD-DEC-413, FINDINGS 2754): the hangers of each cabinet and its
 * plates on the wall, or one piece of the rail over the cabinet between its sides cut from the stock of the catalogue
 * (first fit, the saw cut of the project 3 mm, as the rail of SAH 216). The screws in the wall are the fitter's.
 */
function levelHangerRows(s: KitchenScene): Rec[] {
  const rows: Rec[] = [],
    rails = new Map<string, { stockMm: number; part: Rec; cuts: Rec[] }>(),
    kerfMm = 3;
  for (const m of s.modules) {
    const h = levelHangerOf(s.hardware, m);
    if (!h) continue;
    const scope = `Hanger of the hardware level by MOD-DEC-413; holes of its BAZIS kit`;
    for (const p of h.parts)
      rows.push({ moduleId: m.id, article: p.article, manufacturer: p.brand, name: p.name, variant: p.variant, quantity: p.perCabinet, unit: p.variant === 'L+R' ? 'kit' : 'piece', physicalId: `${m.id}/hanger/${p.article}`, price: null, scope });
    if (h.wall.kind === 'PLATE') {
      const p = h.wall.part;
      rows.push({ moduleId: m.id, article: p.article, manufacturer: p.brand, name: p.name, quantity: p.perCabinet, unit: 'piece', physicalId: `${m.id}/hanger/${p.article}`, price: null, scope });
    } else {
      const key = `${h.wall.part.brand}:${h.wall.part.article}`,
        rail = rails.get(key) ?? { stockMm: h.wall.stockLengthMm, part: h.wall.part, cuts: [] as Rec[] };
      rail.cuts.push({ moduleId: m.id, lengthMm: m.width - 2 * (m.panelThickness ?? 16) });
      rails.set(key, rail);
    }
  }
  for (const { stockMm, part, cuts } of rails.values()) {
    const bins: Rec[] = [];
    for (const c of [...cuts].sort((a, b) => b.lengthMm - a.lengthMm)) {
      if (!(c.lengthMm > 0 && c.lengthMm + kerfMm <= stockMm)) continue;
      let bin = bins.find((b) => b.remainingMm >= c.lengthMm + kerfMm);
      if (!bin) bins.push((bin = { stockIndex: bins.length + 1, remainingMm: stockMm, cuts: [] }));
      bin.cuts.push(c);
      bin.remainingMm -= c.lengthMm + kerfMm;
    }
    for (const bin of bins)
      rows.push({
        moduleId: bin.cuts[0].moduleId,
        article: part.article,
        manufacturer: part.brand,
        name: part.name,
        quantity: 1,
        unit: 'piece',
        physicalId: `kitchen/hanger-rail/${part.article}/${bin.stockIndex}`,
        price: null,
        cutPlan: bin.cuts,
        stockLengthMm: stockMm,
        projectKerfMm: kerfMm,
        wasteMm: bin.remainingMm,
        scope: 'Whole kitchen stock rail of the hangers of the level; one piece over each cabinet between its sides',
      });
  }
  return rows;
}

/** kcr and kap: the drawer joints of the constructions and the installation kits of the selected appliances (r1.html:75363, 77938). */
function applianceRows(s: KitchenScene, d: Derived): Rec[] {
  const before = drawerRows(s, d);
  for (const m of s.modules.filter(isConstruction)) {
    const r = d(m).drawerJoints;
    if (r) before.push(...jointRows(m, r, 'Project drawer joints; material/tool qualification separate'));
  }
  const bays = new Set(s.modules.filter((m) => isAppliance(m) && ['dishwasher', 'washer'].includes(APPLIANCE_PROFILES[applianceSelections(m)[0]?.profileId]?.family)).map((m) => m.id)),
    rows = clone(before).filter((h) => !bays.has(h.moduleId));
  for (const m of s.modules.filter(isAppliance))
    for (const [i, a] of applianceSelections(m).entries()) {
      if (a.mode !== 'selected') continue;
      const p = APPLIANCE_PROFILES[a.profileId];
      if (!p) continue;
      for (const [j, k] of p.kitComponents.entries()) {
        if (k.optional) continue;
        rows.push({
          moduleId: m.id,
          article: k.article,
          name: k.name,
          manufacturer: p.manufacturer || (a.model.startsWith('BLANCO') ? 'BLANCO' : 'Bosch'),
          physicalId: m.id + '/appliance-kit/' + i + '/' + j,
          quantity: k.quantity,
          unit: k.unit === 'pcs' ? 'piece' : k.unit,
          price: null,
          applianceKit: true,
          included: k.includedWithAppliance ? false : true,
          includedWithAppliance: !!k.includedWithAppliance,
          commercialSku: k.article.endsWith(' installation kit') ? null : k.article,
          ...(k.includedComponents ? { kitComponents: clone(k.includedComponents), includesStatus: 'VERIFIED_WITHIN_SCOPE' } : {}),
          scope: 'Монтажный комплект выбранной техники',
        });
      }
      if (p.family === 'fridge-two')
        for (const count of [2, 3])
          for (const [article, q, unit] of [
            ['71B3550', count, 'piece'],
            ['173H7100', count, 'piece'],
            ['609.1500', count * 4, 'piece'],
          ] as [string, number, string][])
            rows.push({
              moduleId: m.id,
              article,
              manufacturer: 'BLUM',
              physicalId: m.id + '/sliding-front/' + count + '/' + article,
              quantity: q,
              unit,
              price: null,
              applianceKit: true,
              scope: 'Петли двух мебельных фасадов для скользящего крепления холодильника',
            });
    }
  return rows;
}

/** One row of the planned hardware (khrRow, r1.html:79402). */
function row(m: Rec, id: string, c: Rec, q: number, meta: Rec = {}): Rec {
  const article = c.commercialSku || c.technicalSpec;
  return {
    moduleId: m.id,
    physicalId: id,
    article,
    commercialSku: c.commercialSku ?? null,
    manufacturer: c.manufacturer || meta.manufacturer || 'BLUM',
    name: c.purpose || c.part || c.technicalSpec || article,
    quantity: q,
    unit: c.unit || 'piece',
    price: null,
    purchase: c.purchase || 'separate',
    hardwareProfile: meta.profileId,
    manufacturingQualified: false,
    ...meta,
  };
}

const SU30M = '120-030-065';

/** Feet, plinth clips, handles, shelf supports, joints, filler, niche and traverse brackets of a module (khrAccessoryRows, r1.html:79420). */
function accessoryRows(s: KitchenScene, m: Rec, d: Rec): Rec[] {
  const rows: Rec[] = [],
    feet = footPlateBoxes(m),
    floorStanding = ['base', 'tall', 'island'].includes(m.kind) && m.floor > 0 && !d.appliance?.floorStanding && !['KB_DISHWASHER_450_600', 'KB_WASHER_600'].includes(m.moduleTypeId);
  if (floorStanding) {
    const count = feet.length || 4,
      p = PROFILE['HETTICH-KORREKT100']!;
    // MOD-DEC-566 п. 3 (FINDINGS 1271): the feet of a new module — the leg and its block 47654 on dowels, no screws.
    if (dowelFeet(m))
      for (const sku of [p.commercialSku, kitchen.constants.footBlock.value.sku])
        rows.push(
          row(m, m.id + '/support/' + sku, { commercialSku: sku }, count, {
            manufacturer: p.manufacturer,
            profileId: p.profileId,
            family: p.family,
            legCount: count,
            installedHeightMm: m.floor,
            woodStackMm: d.footWoodStackMm ?? null,
            mounting: 'DOWELS',
            dowelHoleDepthMm: kitchen.constants.footDowelHoleDepth.value,
            assemblyStatus: 'PROJECT_MATERIAL_QUALIFICATION',
          }),
        );
    else
      for (const c of p.kitPerFoot)
        rows.push(
          row(m, m.id + '/support/' + (c.commercialSku || 'screw4x35'), c, c.quantity * count, {
            manufacturer: p.manufacturer,
            profileId: p.profileId,
            family: p.family,
            legCount: count,
            installedHeightMm: m.floor,
            woodStackMm: d.footWoodStackMm ?? null,
            conservativeRequiredWoodStackMm: 35,
            fastenerSeatThicknessMm: null,
            conservativeScrewSeatBoundsMm: [0, 25],
            nominalPenetrationBoundsMm: [10, 35],
            assemblyStatus: 'PROJECT_MATERIAL_QUALIFICATION',
          }),
        );
    for (const part of (d.parts || []).filter((x: Rec) => x.partId === m.id + ':plinth' || x.partId.startsWith(m.id + ':plinth:'))) {
      // A plinth of a run is clipped onto the two front legs of every module under it (FINDINGS 1272).
      const clips = part.clipCount ?? 2;
      rows.push(row(m, part.partId + '/clips', { commercialSku: '61855' }, clips, { manufacturer: 'Hettich', profileId: p.profileId, family: 'plinthFixing', partId: part.partId }));
      rows.push(row(m, part.partId + '/screws', { commercialSku: '609.1500' }, 2 * clips, { manufacturer: 'BLUM', family: 'plinthFixing', technicalSpec: '3.5x15', partId: part.partId }));
    }
  }
  // The handle of the kitchen (MOD-AI-16, FINDINGS 3210): the prototype's, one of the catalogue or none; a door opened
  // by pressing has its latch instead (MOD-DEC-485), a drawer and a lift keep the handle. A profile is cut from its
  // bars for the whole kitchen (kitchenHardware, FINDINGS 3215): here only its fixing.
  const handle = kitchenHandle(s),
    own = handle.kind === 'CATALOG' ? handle.handle : null,
    lengths = new Map((kitchenHandlePlaces(s, m, d)?.places ?? []).map((x) => [x.groupId, x.lengthMm]));
  for (const { groupId: id, part: p } of kitchenHandleFronts(s, m, d)) {
    const t = p.hingeThicknessMm ?? p.finished_mm?.[2] ?? 18,
      fix = kitchenHandleFixing(own, lengths.get(id) ?? own?.sizeMm.lengthMm ?? 0);
    if (own?.kind !== 'PROFILE')
      rows.push(
        row(m, m.id + '/handle/' + id, own ? { commercialSku: own.article, purpose: own.name } : { commercialSku: KITCHEN_DEFAULT_HANDLE.article }, 1, {
          manufacturer: own ? own.brand : KITCHEN_DEFAULT_HANDLE.brand,
          family: 'handle',
          doorGroupId: id,
          motionGroupId: p.motionGroupId || p.drawerId || id,
          partId: p.partId,
          dimensionsMm: own ? [own.sizeMm.lengthMm, own.sizeMm.thicknessMm, own.sizeMm.heightMm] : [...KITCHEN_DEFAULT_HANDLE.dimensionsMm],
          frontThicknessMm: t,
          ...(own ? { handleId: own.id } : {}),
        }),
      );
    // An edge handle and a profile on the self-tapping screws of the plinth (Д of the Director); one with a groove has
    // none, its groove is an operation of the front (fittings.ts, trimForEdgeHandle).
    if (fix.kind === 'EDGE_SCREWS')
      rows.push(row(m, m.id + '/handle/' + id + '/screws', { commercialSku: EDGE_SCREW.commercialSku }, fix.screws, { manufacturer: EDGE_SCREW.manufacturer, family: 'handleFixing', technicalSpec: EDGE_SCREW.technicalSpec, doorGroupId: id, partId: p.partId }));
    if (fix.kind !== 'M4') continue;
    // The screws of a bar or a knob without its own by the thickness of the front, as the prototype's handle; a handle
    // of the catalogue with its screws has none (FINDINGS 3211, 3215); the washers of a glass front are per screw.
    const article = t === 6 ? '71544' : t === 19 || t === 18 ? '71549' : t === 16 ? '71548' : 'M4x' + (t + 4),
      screws = fix.screws;
    rows.push(
      row(
        m,
        m.id + '/handle/' + id + '/screws',
        { commercialSku: /^\d+$/.test(article) ? article : null, technicalSpec: article },
        screws,
        {
          manufacturer: 'Hettich',
          family: 'handleFixing',
          doorGroupId: id,
          assemblyStatus: t === 6 ? 'GLASS_FABRICATOR_PROTECTED_FIXING' : 'PROJECT_CONTACT_FASTENING',
          ...(t === 6 ? { screwDimensionMm: [4, 12], protectiveWasherStackMm: 2, glassNominalThicknessMm: 6, nominalThreadEngagementMm: 4, blindThreadDepthMm: 6, nominalThreadBottomClearanceMm: 2 } : {}),
        },
      ),
    );
    if (t === 6)
      rows.push(
        row(m, m.id + '/handle/' + id + '/washers', { commercialSku: null, technicalSpec: 'protective polymer washer M4 1mm' }, 2 * screws, {
          manufacturer: '',
          family: 'handleFixing',
          doorGroupId: id,
          nominalThicknessMm: 1,
          quantityPerScrew: 2,
          assemblyStatus: 'PROJECT_PROTECTED_GLASS_STACK',
          qualification: 'Project finished thickness1mm; glass fabricator qualifies material and seating without metal contact or prestress.',
        }),
      );
  }
  // The supports of the removable shelves: the kit of the level «Стандарт» (KF-08, FINDINGS 325), part by part.
  for (const plan of d.hardwarePlanning?.shelfSupports || [])
    for (const c of plan.kit?.parts || [])
      rows.push(
        row(m, m.id + '/shelfSupport/' + plan.shelfId + '/' + c.article, { commercialSku: c.article, purpose: (c.role === 'STEM' ? 'Шток полкодержателя ' : 'Полкодержатель ') + plan.name }, plan.quantity, {
          manufacturer: plan.brand,
          family: 'shelfSupport',
          supportId: plan.supportId,
          partId: plan.shelfId,
          supportAxisAboveLowerMm: plan.axisAboveLowerMm,
        }),
      );
  for (const p of d.parts || []) {
    if (p.removableShelf) continue;
    if (p.shelfId || /:shelf(?::|$)/.test(p.partId)) {
      const x = (m.shelfItems || []).find((x: Rec) => x.id === p.shelfId || x.id === p.partId);
      if (x?.fixed || p.fixedShelf) continue;
      const count = p.polygon_mm || p.finished_polygon_mm ? Math.max(4, (p.finished_polygon_mm || p.polygon_mm).length) : 4;
      rows.push(row(m, m.id + '/shelfSupport/' + p.partId, { commercialSku: '79707' }, count, { manufacturer: 'Hettich', family: 'shelfSupport', profileId: 'HETTICH-SEKURA6-79707', partId: p.partId, supportOffsetFromShelfLowerMm: -8 }));
    }
  }
  const directParts = d.parts || [],
    directJoints = d.constructionJoints || [],
    // MOD-DEC-566 п. 1 (FINDINGS 1266): the rails of a new corner close the carcass instead of its top; the 8 confirmats
    // are then one per rail end and two per bottom end, as many as the top and the bottom took.
    directPartIds = ['side:L', 'side:R', 'bottom', ...(railsOnTop(m) ? ['rail:front', 'rail:rear'] : ['top']), 'fixed_blind_front'].map((id) => m.id + ':' + id),
    directDefault =
      isSingleCorner(m) &&
      ['KB_CORNER_STRAIGHT', 'KW_CORNER_STRAIGHT'].includes(m.moduleTypeId) &&
      (m.panelThickness ?? 16) === 16 &&
      m.cornerFastening !== 'NK-K04-FACES-R5' &&
      !directParts.some((p: Rec) => /:corner_(?:blind|filler)_cleat_(?:low|high)$/.test(p.partId)) &&
      !d.fasteningR5?.hardware?.length &&
      !d.fastenersR7?.kits?.length &&
      !d.fastenersR7?.woodItems?.length &&
      directPartIds.every((id) => directParts.some((p: Rec) => p.partId === id)) &&
      !directJoints.some((j: Rec) => !['physical-corner-filler-to-carcass', 'worktop-to-structural-end-panels'].includes(j.kind) && ((j.count ?? 0) > 0 || (j.fasteners || []).some((c: Rec) => (c.quantity ?? c.q ?? j.count ?? 0) > 0)));
  if (directDefault) {
    rows.push(
      row(m, m.id + ':direct-default:body:confirmat', { commercialSku: 'MB.1501.7X50.CH4.BZ' }, 8, {
        manufacturer: 'MAKMART',
        family: 'panelConnector',
        profileId: 'MAKMART-CONFIRMAT-7X50-B16',
        assemblyStatus: 'PROJECT_MATERIAL_QUALIFICATION',
        name: 'Конфирматы7×50 корпуса углового шкафа',
      }),
    );
    rows.push(
      row(m, m.id + ':direct-default:blind-front:SU30M', { commercialSku: SU30M }, 2, {
        article: 'SU30M120-030-065',
        manufacturer: 'Sugatsune',
        family: 'blindFrontFixing',
        profileId: 'SUGATSUNE-SU30M',
        partId: m.id + ':fixed_blind_front',
        assemblyStatus: 'PROJECT_MATERIAL_QUALIFICATION',
        name: 'Уголки крепления глухого фасада',
      }),
    );
    rows.push(
      row(m, m.id + ':direct-default:blind-front:screw3.1x16', { technicalSpec: 'chipboard screw3.1x16' }, 8, {
        manufacturer: 'PROJECT_SPECIFICATION',
        family: 'blindFrontFixing',
        partId: m.id + ':fixed_blind_front',
        woodEngagementMm: 13.5,
        assemblyStatus: 'SERVICE_ASSUMPTION_SPEC_QTY',
        name: 'Саморезы3.1×16 крепления глухого фасада',
      }),
    );
  }
  for (const j of (d.constructionJoints || []).filter((j: Rec) => !['worktop-to-structural-end-panels', 'physical-corner-filler-to-carcass'].includes(j.kind)))
    for (const [i, c] of (j.fasteners || [{ technicalSpec: j.kind, quantity: j.count || 0, unit: j.unit || 'job' }]).entries()) {
      const q = c.quantity ?? c.q ?? j.count ?? 0;
      if (q > 0)
        rows.push(
          row(m, m.id + '/joint/' + j.id + '/' + i, { commercialSku: c.commercialSku || c.article || null, technicalSpec: c.technicalSpec || c.article || j.kind, unit: c.unit || j.unit || 'piece' }, q, {
            manufacturer: c.manufacturer || 'PROJECT_SPECIFICATION',
            family: 'panelConnector',
            jointId: j.id,
            assemblyStatus: 'PROJECT_JOINT',
            name: j.kind || 'Соединение панелей',
          }),
        );
    }
  for (const j of d.constructionJoints || [])
    if (['frame-butt-joints', 'bottom-lamination'].includes(j.kind))
      rows.push(
        row(m, m.id + '/joint/' + j.id + '/glue', { commercialSku: null, technicalSpec: 'D3 compatible woodworking adhesive service', unit: 'job' }, 1, {
          manufacturer: 'PROJECT_SPECIFICATION',
          family: j.kind === 'bottom-lamination' ? 'laminationGlue' : 'frameGlue',
          jointId: j.id,
        }),
      );
  for (const j of d.constructionJoints || [])
    if (j.kind === 'physical-corner-filler-to-carcass') {
      rows.push(row(m, m.id + '/filler/brackets', { commercialSku: SU30M }, j.count, { manufacturer: 'Sugatsune', family: 'fillerFixing', profileId: 'SUGATSUNE-SU30M', actualPartIds: j.actualPartIds, assemblyStatus: 'PROJECT_MATERIAL_QUALIFICATION' }));
      rows.push(row(m, m.id + '/filler/screws', { technicalSpec: 'chipboard screw3.1x16' }, 4 * j.count, { manufacturer: 'PROJECT_SPECIFICATION', family: 'fillerFixing', woodEngagementMm: 13.5 }));
    }
  for (const j of d.constructionJoints || [])
    if (j.kind === 'worktop-to-structural-end-panels') {
      rows.push(row(m, m.id + '/niche/topbrackets', { commercialSku: SU30M }, j.count, { manufacturer: 'Sugatsune', family: 'worktopFixing', profileId: 'SUGATSUNE-SU30M', jointId: j.id, assemblyStatus: 'PROJECT_MATERIAL_QUALIFICATION' }));
      rows.push(row(m, m.id + '/niche/topscrews', { technicalSpec: 'chipboard screw3.1x20' }, 4 * j.count, { manufacturer: 'PROJECT_SPECIFICATION', family: 'worktopFixing', woodEngagementMm: 17.5 }));
    }
  if (d.nicheSupports) {
    const np = [d.nicheSupports.left, d.nicheSupports.right].filter((x) => x === 'end-panel').length;
    if (np) {
      rows.push(row(m, m.id + '/niche/restraintbrackets', { commercialSku: SU30M }, np * 2, { manufacturer: 'Sugatsune', family: 'nicheRestraint', profileId: 'SUGATSUNE-SU30M', assemblyStatus: 'SITE_SUBSTRATE_QUALIFICATION' }));
      rows.push(row(m, m.id + '/niche/restraintpanelscrews', { technicalSpec: 'chipboard screw3.1x20' }, np * 4, { manufacturer: 'PROJECT_SPECIFICATION', family: 'nicheRestraint' }));
      rows.push(row(m, m.id + '/niche/substratefixings', { technicalSpec: 'substrate specific anchor/screw set', unit: 'set' }, np * 4, { manufacturer: 'PROJECT_SPECIFICATION', family: 'nicheRestraint', assemblyStatus: 'SITE_SUBSTRATE_QUALIFICATION' }));
    }
  }
  if (['KB_SINK', 'KB_HOB', 'KI_SINK_HOB'].includes(m.moduleTypeId)) {
    rows.push(row(m, m.id + '/traverses/brackets', { commercialSku: SU30M }, 8, { manufacturer: 'Sugatsune', profileId: 'SUGATSUNE-SU30M', family: 'traverseJoint', assemblyStatus: 'PROJECT_MATERIAL_QUALIFICATION' }));
    rows.push(row(m, m.id + '/traverses/screws', { technicalSpec: 'chipboard screw3.1x16' }, 32, { manufacturer: 'PROJECT_SPECIFICATION', family: 'traverseJoint', woodEngagementMm: 13.5, assemblyStatus: 'PROJECT_MATERIAL_QUALIFICATION' }));
  }
  // MOD-DEC-701 (FINDINGS 2600): the parts of a back in parts — screws 3,5 × 16 (Hettich 71925) of each part along its
  // seam on a fixed shelf, the H-profile of a seam with no support, in metres (the graph has the same stations).
  const seams: Rec[] = d.backSeams ?? [],
    screws = seams.filter((x) => x.supportId).reduce((n, x) => n + x.partIds.length * backSeamScrews(x.from, x.to).length, 0),
    profileMm = seams.filter((x) => !x.supportId).reduce((n, x) => n + x.to - x.from, 0);
  if (screws) rows.push(row(m, m.id + '/back-seam/screws', { commercialSku: '71925', purpose: 'Саморез задника 3,5 × 16' }, screws, { manufacturer: 'Hettich', family: 'backSeam', technicalSpec: '3.5x16' }));
  if (profileMm)
    rows.push(row(m, m.id + '/back-seam/h-profile', { commercialSku: null, technicalSpec: BACK_H_PROFILE, purpose: 'H-профиль задника, ПВХ', unit: 'mm' }, profileMm, { manufacturer: 'PROJECT_SPECIFICATION', family: 'backSeam' }));
  return rows;
}

/** The article of the H-profile between the parts of a back (MOD-DEC-701): a part of the project's specification, priced by the card. */
export const BACK_H_PROFILE = 'BACK_H_PROFILE';

/** The single contact of two wall cabinets side by side (kptWallPairContact, r1.html:75792). */
function wallPairContact(s: KitchenScene, a: Rec, b: Rec, records: Rec[]): Rec | null {
  const ra = records.find((r) => r.module.id === a.id),
    rb = records.find((r) => r.module.id === b.id);
  if (!ra || !rb || isFree(a) || isFree(b)) return null;
  const found: Rec[] = [];
  for (const x of sideFaces(s, ra))
    for (const y of sideFaces(s, rb)) {
      const c = faceContact(x, y);
      if (c) found.push(c);
    }
  return found.length === 1 ? found[0]! : null;
}

/** The bottom of a mezzanine on the top of its tall cabinet: one horizontal contact of the two panels (FINDINGS 1610). */
function stackContact(m: Rec, t: Rec, records: Rec[]): Rec | null {
  const a = records.find((r) => r.module.id === m.id)?.parts.find((p: Rec) => p.partId === m.id + ':bottom'),
    b = records.find((r) => r.module.id === t.id)?.parts.find((p: Rec) => p.partId === t.id + ':top');
  if (!a || !b) return null;
  const [p, q] = [a.worldBox, b.worldBox],
    lo = [Math.max(p[0], q[0]), Math.max(p[4], q[4])],
    hi = [Math.min(p[1], q[1]), Math.min(p[5], q[5])];
  if (Math.abs(p[2] - q[3]) > 0.01 || hi[0]! - lo[0]! <= 0.01 || hi[1]! - lo[1]! <= 0.01) return null;
  const actualPartIds = [a.partId, b.partId].sort(),
    moduleIds = [m.id, t.id].sort();
  return {
    contactId: 'cabinet-contact:' + actualPartIds.join('|') + ':y:' + p[2],
    physicalId: 'interconnect/' + moduleIds.join('/'),
    moduleIds,
    actualPartIds,
    normalAxis: 'y',
    contactPlaneMm: p[2],
    contactWorldMm: [lo[0], hi[0], p[2], p[2], lo[1], hi[1]],
    contactLengthMm: hi[0]! - lo[0]!,
    contactHeightMm: hi[1]! - lo[1]!,
    contactAreaMm2: (hi[0]! - lo[0]!) * (hi[1]! - lo[1]!),
    stackThicknessMm: p[3] - p[2] + q[3] - q[2],
    manufacturingQualified: false,
  };
}

/** The hardware of the kitchen: one row per physical item (kflowHardware, outermost: khr r1.html:79673). */
export function kitchenHardware(s: KitchenScene): Rec[] {
  // The derived records are frozen (derived.ts): read without a copy of the module for every row (KF-23, FINDINGS 570).
  const d: Derived = (m) => derived(s, m);
  let rows = applianceRows(s, d)
    .filter((h) => !['9028286', '9028230', '61855', 'base screw 4x35'].includes(h.article))
    .map((item) => {
      const { scope, sourceRefs, ...h } = item;
      if (h.components) {
        const id = h.article,
          components = Object.entries(h.components).map(([commercialSku, quantity]) => ({ commercialSku, quantity, manufacturer: id === 'MAKMART_S16' ? 'MAKMART' : 'Hettich' }));
        return {
          ...h,
          kitId: id,
          name: id === 'MAKMART_S16' ? 'Конфирмат7×50' : 'Комплект соединения',
          commercialSku: id === 'MAKMART_S16' ? 'MB.1501.7X50.CH4.BZ' : null,
          manufacturer: id === 'MAKMART_S16' ? 'MAKMART' : 'Hettich',
          article: components.map((x) => x.commercialSku).join(' + ') + (components.length > 1 ? ' (комплект)' : ''),
          unit: components.length > 1 ? 'kit' : 'piece',
          kitComponents: components,
          assemblyStatus: 'NOMINAL_PROJECT_JOINT',
        };
      }
      return h;
    });
  const structural: Rec[] = [],
    suspensionCuts: Rec[] = [],
    suspendedIds = new Set(rows.filter((h) => ['9249369', '9249370'].includes(h.article)).map((h) => h.moduleId));
  rows = rows.filter((h) => h.article !== '9007651');
  for (const m of s.modules) {
    const dm = d(m),
      planning = dm.hardwarePlanning;
    structural.push(...(dm.parts || []));
    if (!planning) continue;
    for (const leaf of planning.leaves.filter((x: Rec) => x.status === 'PLANNING_QUALIFIED')) {
      const p = PROFILE[leaf.profileId]!,
        id = m.id + '/leaf/' + leaf.groupId;
      if (leaf.mechanism === 'HINGE') {
        // The hinge and plate of the shared mechanism (KF-10, FINDINGS 324): one of each per hinge of the door.
        const meta = { manufacturer: leaf.manufacturer, family: 'concealedHinge', hingeId: leaf.hingeId, plateId: leaf.plateId, leafId: leaf.groupId, hingeQuantity: leaf.quantity, frontMassKg: leaf.massKg, supportedMassKg: leaf.supportedMassKg, massBasis: leaf.massBasis, countBasis: leaf.countBasis };
        rows.push(row(m, id + '/' + leaf.hingeArticle, { commercialSku: leaf.hingeArticle, purpose: 'Петля ' + leaf.manufacturer + ' ' + leaf.hingeArticle }, leaf.quantity, meta));
        if (leaf.plateArticle) rows.push(row(m, id + '/' + leaf.plateArticle, { commercialSku: leaf.plateArticle, purpose: 'Монтажная планка ' + leaf.manufacturer + ' ' + leaf.plateArticle }, leaf.quantity, meta));
        continue;
      }
      if (p.family === 'stayLift') {
        rows.push(
          row(m, id + '/lift', { commercialSku: leaf.commercialSku, unit: 'set' }, 1, {
            manufacturer: p.manufacturer,
            profileId: p.profileId,
            includes: p.kit[0].includes,
            includesStatus: 'VERIFIED_WITHIN_SCOPE',
            frontMassKg: leaf.massKg,
            massBasis: leaf.massBasis,
            powerFactor: leaf.powerFactor,
          }),
        );
        for (const c of p.kit.slice(1)) rows.push(row(m, id + '/' + c.commercialSku, c, c.quantity, { manufacturer: p.manufacturer, profileId: p.profileId }));
      } else
        for (const c of p.kitPerHinge)
          rows.push(
            row(m, id + '/' + c.commercialSku, c, c.quantity * leaf.quantity, {
              manufacturer: p.manufacturer,
              profileId: p.profileId,
              leafId: leaf.groupId,
              hingeQuantity: leaf.quantity,
              frontMassKg: leaf.massKg,
              supportedMassKg: leaf.supportedMassKg,
              massBasis: leaf.massBasis,
            }),
          );
    }
    // The lift МДМ FLAP of a front on hinges in the top (FINDINGS 3350): its kits beside the hinges; a temporary row is
    // listed as such (the owner's rule of 2026-10-22: the function is not cut).
    for (const leaf of planning.leaves.filter((x: Rec) => x.flap)) {
      const f = leaf.flap;
      rows.push(
        row(m, m.id + '/leaf/' + leaf.groupId + '/lift/' + f.article, { commercialSku: f.article, purpose: f.name, unit: 'kit' }, f.quantity, {
          manufacturer: f.brand,
          family: 'flapLift',
          liftId: f.liftId,
          tier: f.tier,
          colour: f.colour,
          leafId: leaf.groupId,
          loadValue: f.loadValue,
          temporary: f.temporary,
          frontMassKg: leaf.massKg,
          massBasis: leaf.massBasis,
        }),
      );
    }
    // MOD-DEC-485 (FINDINGS 3212): the latch of a door opened by pressing, one per door.
    for (const x of planning.pushDoors ?? [])
      if (x.latch) rows.push(row(m, x.latch.id, { commercialSku: x.latch.article, purpose: x.latch.name }, 1, { manufacturer: x.latch.brand, family: 'pushLatch', doorGroupId: x.groupId, partId: x.latch.panelId }));
    const mp = planning.mechanism;
    if (mp?.status === 'PLANNING_QUALIFIED') {
      const p = PROFILE[mp.profileId]!,
        c = p.kit[0];
      rows.push(
        row(m, m.id + '/mechanism/' + p.profileId, c, 1, {
          manufacturer: p.manufacturer,
          profileId: p.profileId,
          kitId: p.profileId,
          kitComponents: c.includes || c.requiredAssembly,
          includesStatus: c.includesStatus,
          assemblyStatus: mp.assemblyDataStatus,
          name: p.variant,
        }),
      );
      if (c.includesStatus === 'UNKNOWN')
        for (const [i, f] of (c.requiredAssembly || []).entries())
          rows.push(
            row(m, m.id + '/mechanism/' + p.profileId + '/assembly/' + i, { commercialSku: null, technicalSpec: f.description }, f.quantity, {
              manufacturer: 'PROJECT_SPECIFICATION',
              family: 'mechanismAssembly',
              includedInKit: false,
              supplyStatus: 'REQUIRED_SUPPLIEDNESS_UNKNOWN',
            }),
          );
    }
    const ids = [...new Set((dm.parts || []).filter((p: Rec) => p.drawerId && !p.applianceFront).map((p: Rec) => p.drawerId))] as string[];
    if (ids.length && m.drawerProfile === TANDEM && !levelRunner(m)) {
      rows = rows.filter((h) => !(h.moduleId === m.id && h.drawerId && ['560H5000B', 'T51.1700.04', '661.1450.HG', '609.1500', '9278224'].includes(h.article)));
      const p = PROFILE[m.drawerProfile]!;
      for (const did of ids)
        for (const c of p.kit)
          rows.push(
            row(m, did + '/' + c.commercialSku + '/' + (c.variant || ''), c, c.quantity, {
              manufacturer: c.manufacturer || p.manufacturer,
              profileId: p.profileId,
              drawerId: did,
              variant: c.variant || '',
              includes: c.includes,
              loadBasis: p.loadBasis,
            }),
          );
    }
    rows.push(...accessoryRows(s, m, dm));
    if (dm.suspensionPairs > 1) {
      const p = PROFILE['HETTICH-SAH216-AHS-B16']!;
      rows = rows.filter((h) => !(h.moduleId === m.id && ['9249369', '9249370', '9007651', '45168', '9278224', '65480'].includes(h.article)));
      for (const c of p.kit.filter((c: Rec) => c.quantity))
        rows.push(
          row(m, m.id + '/hanger/' + c.commercialSku, c, c.quantity * dm.suspensionPairs, {
            manufacturer: 'Hettich',
            family: 'wallSuspension',
            profileId: p.profileId,
            localArmDepthMm: dm.suspensionLocalArmDepthMm,
            assemblyStatus: 'CUSTOM_CORNER_MOUNTING_QUALIFICATION',
          }),
        );
      rows.push(
        row(m, m.id + '/hanger/wallsets', { commercialSku: '65480', unit: 'set' }, 4 * dm.suspensionPairs, {
          manufacturer: 'Hettich',
          family: 'wallFixing',
          includes: [
            { part: 'screw5.5x50', quantity: 1 },
            { part: 'wallplug8x40', quantity: 1 },
          ],
        }),
      );
      suspensionCuts.push(...[m.width, m.cornerReturn].map((x) => ({ moduleId: m.id, lengthMm: x - 2 * (m.panelThickness ?? 16) })));
    } else if (suspendedIds.has(m.id)) suspensionCuts.push({ moduleId: m.id, lengthMm: m.width - 2 * (m.panelThickness ?? 16) });
  }
  if (suspensionCuts.length) {
    const bins: Rec[] = [],
      kerfMm = 3;
    for (const c of [...suspensionCuts].sort((a, b) => b.lengthMm - a.lengthMm)) {
      if (!(c.lengthMm > 0 && c.lengthMm + kerfMm <= RAIL_STOCK_MM)) continue;
      let bin = bins.find((b) => b.remainingMm >= c.lengthMm + kerfMm);
      if (!bin) {
        bin = { cuts: [], remainingMm: RAIL_STOCK_MM };
        bins.push(bin);
      }
      bin.cuts.push(c);
      bin.remainingMm -= c.lengthMm + kerfMm;
    }
    rows.push(
      row({ id: suspensionCuts[0]!.moduleId }, 'wholeKitchen/hangerRail', { commercialSku: '9007651', unit: 'stock rail3000mm' }, bins.length, {
        manufacturer: 'Hettich',
        family: 'suspensionRail',
        cutLengthsMm: suspensionCuts.map((c) => c.lengthMm),
        cutPlan: bins,
        stockLengthMm: RAIL_STOCK_MM,
        projectKerfMm: kerfMm,
        wasteLengthMm: bins.reduce((sum, b) => sum + b.remainingMm, 0),
      }),
    );
  }
  // A profile handle (FINDINGS 3215; Д of the Director): a piece the whole edge of each front with one, cut from the bars
  // of its sale (MOD-DEC-520) with the kerf of the hanger rail of the prototype; the kitchen buys the bars of the plan.
  const profile = kitchenHandleRecord(s);
  if (profile?.kind === 'PROFILE' && profile.stockLengthMm) {
    const pieces = s.modules.flatMap((m) => (kitchenHandlePlaces(s, m, d(m))?.places ?? []).map((x) => ({ id: x.id, lengthMm: x.lengthMm })));
    if (pieces.length) {
      const plan = barCutting(pieces, profile.stockLengthMm, HANDLE_KERF_MM);
      rows.push(
        row({ id: pieces[0]!.id.split('/')[0] }, 'wholeKitchen/handleProfile', { commercialSku: profile.article, purpose: profile.name, unit: `stock bar${profile.stockLengthMm}mm` }, plan.bars.length, {
          manufacturer: profile.brand,
          family: 'handle',
          handleId: profile.id,
          cutLengthsMm: pieces.map((x) => x.lengthMm),
          cutPlan: plan.bars,
          stockLengthMm: plan.stockMm,
          projectKerfMm: plan.kerfMm,
          wasteLengthMm: plan.leftoverMm,
          ...(plan.tooLong.length ? { tooLong: plan.tooLong.map((x) => x.id) } : {}),
        }),
      );
    }
  }
  const topFixed = new Set<string>();
  for (const top of kitchenWorktops(s)) {
    const m = { id: top.moduleId || 'wholeKitchen' };
    for (const id of top.supportingModuleIds || [top.moduleId]) {
      const mm = s.modules.find((x) => x.id === id);
      if (!mm || topFixed.has(id) || !['base', 'island'].includes(mm.kind) || ['KB_DISHWASHER_450_600', 'KB_WASHER_600'].includes(mm.moduleTypeId)) continue;
      topFixed.add(id);
      rows.push(row(mm, id + '/topfix/brackets', { commercialSku: SU30M }, 4, { manufacturer: 'Sugatsune', profileId: 'SUGATSUNE-SU30M', family: 'worktopFixing', assemblyStatus: 'PROJECT_MATERIAL_QUALIFICATION' }));
      rows.push(row(mm, id + '/topfix/panelscrews', { technicalSpec: 'chipboard screw3.1x16' }, 8, { manufacturer: 'PROJECT_SPECIFICATION', family: 'worktopFixing', woodEngagementMm: 13.5 }));
      rows.push(row(mm, id + '/topfix/topscrews', { technicalSpec: 'chipboard screw3.1x20' }, 8, { manufacturer: 'PROJECT_SPECIFICATION', family: 'worktopFixing', woodEngagementMm: 17.5 }));
    }
    for (const j of top.worktopJoints || []) {
      rows.push(
        row(m, 'worktop/joint/' + j.id, { commercialSku: '79386' }, j.connectorQuantity || 3, {
          manufacturer: 'Hettich',
          profileId: 'HETTICH-AVB79386-W38',
          includes: [...PROFILE['HETTICH-AVB79386-W38']!.kit[0].includes],
          includesStatus: 'SUPPLIED_WITH_CONNECTOR',
          family: 'worktopConnector',
          jointId: j.id,
          withPartId: j.withPartId,
          assemblyStatus: 'PROJECT_TEMPLATE_PLACEMENT',
        }),
      );
      rows.push(row(m, 'worktop/seal/' + j.id, { commercialSku: null, technicalSpec: 'waterproof compatible worktop joint sealing service', unit: 'm' }, (j.sealLengthMm || j.lengthMm) / 1000, { manufacturer: 'PROJECT_SPECIFICATION', family: 'worktopSeal', jointId: j.id }));
    }
    for (const [ai, a] of (top.apertures || []).entries()) {
      const aw = a.widthMm ?? a.width,
        ad = a.depthMm ?? a.depth,
        ar = a.radius ?? 0,
        perimeter = a.perimeterMm || (aw > 0 && ad > 0 ? 2 * (aw + ad) - 8 * ar + 2 * Math.PI * ar : 0);
      const apertureId = a.id || a.applianceId || (a.moduleId || top.moduleId) + ':' + a.kind + ':' + ai,
        physicalOperationId = top.partId + '/aperture/' + apertureId + '/edge-sealing';
      rows.push(
        row(m, physicalOperationId, { commercialSku: null, technicalSpec: 'Герметизация края выреза: работа и расходные материалы', unit: 'm' }, perimeter / 1000, {
          manufacturer: 'PROJECT_SPECIFICATION',
          family: 'cutoutSeal',
          partId: top.partId,
          apertureId,
          physicalOperationId,
          serviceScope: 'LABOUR_AND_CONSUMABLES',
        }),
      );
    }
  }
  const records = s.modules.map((m) => ({ module: m, parts: structural.filter((p) => p.moduleId === m.id).map((p) => ({ ...p, worldBox: worldBox(s, m, p.box) })) }));
  for (let i = 0; i < s.modules.length; i++)
    for (let k = i + 1; k < s.modules.length; k++) {
      const a = s.modules[i]!,
        b = s.modules[k]!;
      if (a.wall == null || a.wall !== b.wall || a.row !== b.row || a.floor !== b.floor || Math.abs(a.height - b.height) > 0.01 || a.corner || b.corner) continue;
      const contact = Math.abs(a.pos + a.width - b.pos) < 0.01 || Math.abs(b.pos + b.width - a.pos) < 0.01;
      if (!contact) continue;
      const actual = wallPairContact(s, a, b, records);
      if (!actual) continue;
      const stack = actual.stackThicknessMm,
        sku = stack >= 28 && stack <= 36 ? '1054519' : stack > 36 && stack <= 44 ? '1054520' : null;
      if (sku)
        rows.push(
          row(a, 'interconnect/' + [a.id, b.id].sort().join('/'), { commercialSku: sku, unit: 'set' }, 4, {
            manufacturer: 'Hettich',
            family: 'cabinetInterconnect',
            withModuleId: b.id,
            ...actual,
            stackThicknessMm: stack,
            ...(sku === '1054519'
              ? {
                  includesStatus: 'VERIFIED_WITHIN_SCOPE',
                  kitComponents: [
                    { name: 'Резьбовая втулка27мм', quantity: 1, unit: 'piece', purchase: 'included' },
                    { name: 'ВинтM4×15', quantity: 1, unit: 'piece', purchase: 'included' },
                  ],
                  assemblyStatus: 'PROJECT_CONTACT_FACTORY_SET',
                }
              : { includes: ['threaded sleeve', 'M4x15 screw'] }),
          }),
        );
    }
  // MOD-DEC-566 п. 7 (FINDINGS 1610, (Д)): a new mezzanine stands on its tall cabinet and is joined to it as two cabinets
  // side by side are, by four kits through its bottom and the top of the cabinet (the same range of the stack).
  for (const m of s.modules.filter((x) => x.onTall)) {
    const t = s.modules.find((x) => x.id === m.supportId && x.kind === 'tall'),
      contact = t && stackContact(m, t, records);
    if (!contact) continue;
    const stack = contact.stackThicknessMm,
      sku = stack >= 28 && stack <= 36 ? '1054519' : stack > 36 && stack <= 44 ? '1054520' : null;
    if (sku)
      rows.push(
        row(m, contact.physicalId, { commercialSku: sku, unit: 'set' }, 4, {
          manufacturer: 'Hettich',
          family: 'cabinetInterconnect',
          withModuleId: t!.id,
          ...contact,
          includes: ['threaded sleeve', 'M4x15 screw'],
          assemblyStatus: 'PROJECT_CONTACT_FACTORY_SET',
          name: 'Межсекционный комплект ' + sku + ': антресоль к пеналу',
        }),
      );
  }
  for (const contact of peninsulaContacts(s, structural).contacts) {
    const m = s.modules.find((m) => m.id === contact.moduleId)!;
    rows.push(
      row(m, contact.physicalId, { commercialSku: '1054519', unit: 'set' }, 4, {
        manufacturer: 'Hettich',
        family: 'cabinetInterconnect',
        ...contact,
        includesStatus: 'VERIFIED_WITHIN_SCOPE',
        kitComponents: [
          { name: 'threaded sleeve27mm', quantity: 1, unit: 'piece', purchase: 'included' },
          { name: 'M4x15 screw', quantity: 1, unit: 'piece', purchase: 'included' },
        ],
        assemblyStatus: 'PROJECT_CONTACT_FACTORY_SET',
        name: 'Межсекционный комплект1054519',
      }),
    );
  }
  const seen = new Set<string>();
  return rows.filter((h) => {
    if (!h.physicalId) return true;
    if (seen.has(h.physicalId)) return false;
    seen.add(h.physicalId);
    return true;
  });
}
