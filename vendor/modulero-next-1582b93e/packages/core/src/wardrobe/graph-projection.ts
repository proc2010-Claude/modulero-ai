// The way back from the wardrobe graph to the prototype's model (tasks W3 and W4, MIGRATION_PLAN steps 3.4, 3.5,
// "Поля перечня"): the fields of reference/engine/wardrobe-field-map.json with task W3 or W4 are read from the graph,
// so the graph carries the carcass and the doors without loss (engine.wardrobe.test.ts and
// engine.wardrobe.facades.test.ts compare them on every wardrobe input).
//
// How. The layout of the carcass — settings, bodies and their elevations, depths, base and back, sections and their
// spans, the request of the product — is read from the assemblies and the site of the graph (layoutFromGraph). The
// same rules as for the input build the model from it (carcassFromLayout of carcass.ts): this gives the fields the
// graph keeps as a projection of the rules (texts, the r7 plan, the validators). Then every part, hole and groove of
// the graph is written over its record: sizes, positions, faces and edges, diameters, depths, owners. A record the
// graph has and the rules do not, or the other way round, is an error: the graph and its rules disagree.
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import type { Assembly, Graph, Groove, Hole, Part } from '../engine/contract.js';
import { BASE_KINDS, CARCASS_STATE_KEYS, FACADE_STATE_KEYS, FILL_STATE_KEYS, FILL_SUFFIX, partFrame, productBox, SECTION_FACADE_KEYS, wardrobePartRole } from '../engine/generators/wardrobe.js';
import { partBox, ratSub, ratValue } from '../engine/invariants/geometry.js';
import type { Rec } from '../engine/policy/project-state.js';
import { carcassFromLayout, productBase, type CarcassLayout } from './carcass.js';
import { edgeGeometryForPart } from './edges.js';
import { wardrobePartBoxes } from './facades.js';
import type { WardrobeFittings } from './fittings.js';
import { hingeSelection } from '../engine/policy/hinge-selection.js';
import { tolerance } from '../engine/policy/index.js';
import { edgeTotals } from './summary.js';
import { WardrobeStandardPreset } from './standard.js';
import { jointFasteners } from '../engine/fasteners.js';
import { wardrobeHardwareArticles } from './summary.js';

const BASE_SYSTEMS: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(BASE_KINDS).map(([k, v]) => [v, k]));

/** A record from the flat `prefix.key` scalars of Assembly.request (the inverse of `scalars` of the generator). */
function record(prefix: string, request: Assembly['request']): Rec | undefined {
  const keys = Object.keys(request ?? {}).filter((k) => k.startsWith(prefix));
  if (!keys.length) return undefined;
  return Object.fromEntries(keys.map((k) => [k.slice(prefix.length), request![k]]));
}

const byIndex = (a: Assembly, b: Assembly) => a.index - b.index;

/** Interior elements of a section that are FILL assemblies of the graph (W6). */
const FILL_ELEMENT_TYPES = new Set(['fixedShelf', 'adjustableShelf', 'rod']);

/**
 * The layout of the carcass from its graph: what carcassLayout gives from the input. The hardware catalogue must be
 * the release the graph was built with (`versions.hardwareCatalog`): another release would give other hinges and supports.
 */
export function layoutFromGraph(g: Graph, hw: HardwareCatalogs): CarcassLayout {
  if (g.versions.hardwareCatalog?.sha256 !== hw.release.sha256)
    throw new Error(`Граф построен по каталогу фурнитуры ${g.versions.hardwareCatalog?.version ?? 'без версии'}, а дан каталог ${hw.release.version}`);
  const product = g.assemblies.find((a) => a.kind === 'PRODUCT'),
    rq = product?.request;
  if (!product || !rq) throw new Error('В графе нет изделия с запросом пользователя');
  const state: Rec = Object.fromEntries([...CARCASS_STATE_KEYS, ...FACADE_STATE_KEYS, ...FILL_STATE_KEYS].map((k) => [k, JSON.parse(String(rq['state.' + k] ?? 'null'))]));
  // W9: the sliding doors, kept by the request of a sliding wardrobe only.
  if (rq['state.slidingWardrobe'] !== undefined) state.slidingWardrobe = JSON.parse(String(rq['state.slidingWardrobe']));
  // FIT: the rod, the handle and the leg of the project, kept by the request when the project chose them (MOD-DEC-480).
  if (rq['state.fittings'] !== undefined) state.fittings = JSON.parse(String(rq['state.fittings']));
  // R2-019: the parameters of the cutting map the project keeps.
  if (rq['state.cutting'] !== undefined) state.cutting = JSON.parse(String(rq['state.cutting']));
  const
    cabinets = g.assemblies.filter((a) => a.kind === 'CABINET').sort(byIndex),
    sections = g.assemblies.filter((a) => a.kind === 'SECTION').sort(byIndex);
  if (!cabinets.length) throw new Error('В графе нет корпусов');
  const t = cabinets[0]!.frame!.panelThicknessMm,
    // The settings of the form (wardrobeSettings) before the base of the bodies is written into them.
    form: Rec = {
      width: g.envelope.widthMm,
      height: rq.heightMm,
      depth: rq.depthMm,
      panelThickness: t,
      backPanelThickness: WardrobeStandardPreset.backPanelThickness,
      backPanelMode: WardrobeStandardPreset.backPanelMode,
      baseSystem: rq.baseSystem,
      plinthHeight: rq.plinthHeightMm,
      plinthSetback: rq.plinthSetbackMm,
      heightIncludesBase: rq.heightIncludesBase,
      fixedLegHeight: rq.fixedLegHeightMm,
      maxCabinetModuleWidth: WardrobeStandardPreset.maxCabinetModuleWidth,
      advancedModuleWidthInputMm: Number(state.advancedModuleWidthInputMm) || WardrobeStandardPreset.maxCabinetModuleWidth,
      roomHeight: g.site.room?.heightMm ?? 0,
      leftWall: g.site.walls.left,
      rightWall: g.site.walls.right,
      roomSkirtingHeight: g.site.roomSkirting?.heightMm ?? 0,
      roomSkirtingDepth: g.site.roomSkirting?.depthMm ?? 0,
      rearWallGap: g.site.wallGapMm,
      skirtingSolution: rq.skirtingSolution,
      doorBottomClearanceMode: state.doorBottomClearanceMode || WardrobeStandardPreset.doorBottomClearanceMode,
      doorBottomClearance: rq.doorBottomClearanceMm,
      hingeModel: hingeSelection.constants.preferredHinges.value[0],
      dimensions: record('dimensions.', rq),
      dimensionRuleVersion: g.versions.dimensionRule,
      // W6: what the fill reads from the settings.
      shelfDepthReduction: rq.shelfDepthReductionMm,
      system32Assist: rq.system32Assist,
      internalDrawerGap: rq.internalDrawerGapMm,
    },
    settings: Rec = { ...form },
    gridSections: Rec[] = [],
    widths: number[] = [],
    breaks: number[] = [];
  const modules = cabinets.map((c) => {
    const f = c.frame!,
      e = f.elevations,
      panels = record('panels.', c.request) ?? {},
      geometry: Rec = {
        floorY: e.floorElevationMm,
        sideBottomY: e.sideBottomElevationMm,
        sideTopY: e.sideTopElevationMm,
        plinthBottomY: e.plinthBottomElevationMm,
        plinthTopY: e.plinthTopElevationMm,
        bottomBottomY: e.bottomPanelBottomElevationMm,
        bottomTopY: e.bottomPanelTopElevationMm,
        interiorBottomY: e.interiorBottomElevationMm,
        interiorTopY: e.interiorTopElevationMm,
        topBottomY: e.topPanelBottomElevationMm,
        topTopY: e.topPanelTopElevationMm,
        height: e.sideTopElevationMm - e.floorElevationMm,
        depth: f.depths.carcassDepthMm,
        bodyHeight: e.sideTopElevationMm - e.sideBottomElevationMm,
        innerH: e.interiorTopElevationMm - e.interiorBottomElevationMm,
        base: record('base.', c.request),
      };
    geometry.settings = {
      ...form,
      dimensions: record('dimensions.', c.request),
      height: geometry.height,
      depth: geometry.depth,
      baseSystem: BASE_SYSTEMS[f.base.kind],
      plinthHeight: f.base.heightMm,
      plinthSetback: f.base.plinthSetbackMm,
      fixedLegHeight: f.base.heightMm,
      backPanelThickness: f.back.panelThicknessMm,
    };
    geometry.back = record('back.', c.request);
    const own = sections.filter((s) => s.parentId === c.id),
      start = c.box.minMm[0];
    // The prototype adds the widths of the sections one by one from the start of the body (bodyNominalGrid).
    let sx = start;
    own.forEach((s, k) => {
      const span = s.span!,
        w = ratValue(ratSub(span.nominalEndMm, span.nominalStartMm)),
        clearStart = sx + ratValue(ratSub(span.clearStartMm, span.nominalStartMm)),
        clearEnd = sx + w - ratValue(ratSub(span.nominalEndMm, span.clearEndMm));
      gridSections[s.index] = { index: s.index, moduleId: c.id, bodyId: c.inputRef, localIndex: k, nominalWidth: w, clearOpeningWidth: clearEnd - clearStart, nominalStart: sx, nominalEnd: sx + w, clearStart, clearEnd, geometry };
      widths[s.index] = w;
      sx += w;
      if (k === 0 && s.index > 0) breaks.push(s.index);
    });
    return {
      module: {
        id: c.id,
        index: c.index,
        start,
        end: start + c.box.sizeMm[0],
        externalWidth: c.box.sizeMm[0],
        sectionIndexes: own.map((s) => s.index),
        firstSection: own[0]?.index ?? -1,
        lastSection: own.at(-1)?.index ?? -1,
        geometry,
        bodyId: c.inputRef,
      },
      body: { id: c.inputRef, panels, width: c.request?.['body.width'], widthExact: JSON.parse(String(c.request?.['body.widthExact'] ?? 'null')), parent: c.request?.['body.parent'] ?? null },
    };
  });
  const grid: Rec = {
      nominalSectionWidths: widths,
      clearSectionWidths: gridSections.map((s) => s.clearOpeningWidth),
      sections: gridSections,
      modules: modules.map((x) => x.module),
      breaks,
      externalWidth: g.envelope.widthMm,
    },
    base = productBase(grid.modules, settings),
    installationOffset = base.geometry.sideBottomY,
    d: Rec = {
      ...state,
      bodies: modules.map((x) => x.body),
      sections: sections.map((s) => {
        const h = s.request?.partitionHeightMm,
          fill = Object.entries(record('fill.', s.request) ?? {}).map(([k, v]) => [k, JSON.parse(String(v))]);
        const facade = Object.fromEntries(SECTION_FACADE_KEYS.filter((k) => s.request?.['facade.' + k] !== undefined).map((k) => [k, JSON.parse(String(s.request!['facade.' + k]))]));
        return { bodyId: cabinets.find((c) => c.id === s.parentId)!.inputRef, ...facade, ...(h === null || h === undefined ? {} : { partitionHeight: h }), ...Object.fromEntries(fill) };
      }),
    };
  return {
    d,
    settings,
    grid,
    H: settings.height + (settings.heightIncludesBase ? 0 : installationOffset),
    installationOffset,
    baseElevation: base.geometry.bottomBottomY,
    gap: Number(rq.gapInput) || 0,
    gapInput: String(rq.gapInput),
    widthInput: String(rq.widthInput),
    hardware: hw,
    corpusDecorId: rq.corpusDecorId === undefined ? null : (rq.corpusDecorId as string | null),
  };
}

function disagree(what: string, graphIds: string[], ruleIds: string[]): never {
  const g = new Set(graphIds),
    r = new Set(ruleIds);
  throw new Error(`Граф и правила корпуса дают разные ${what}: только в графе — ${[...g].filter((x) => !r.has(x)).join(', ') || 'нет'}; только по правилам — ${[...r].filter((x) => !g.has(x)).join(', ') || 'нет'}`);
}

function sameIds(what: string, graphIds: string[], ruleIds: string[]): void {
  const r = new Set(ruleIds);
  if (graphIds.length !== ruleIds.length || graphIds.some((id) => !r.has(id))) disagree(what, graphIds, ruleIds);
}

/** The physical edge of a contract slot of a part (the inverse of partFrame's slotOf). */
const physicalOf = (frames: Map<string, ReturnType<typeof partFrame>>, partId: string, slot: string): string => frames.get(partId)!.physicalOf[slot as 'A']!;

/** The prototype's model of a carcass graph: the inverse of wardrobeGraph for the fields of task W3. */
export function wardrobeModelFromGraph(g: Graph, hw: HardwareCatalogs): Rec {
  const { m } = carcassFromLayout(layoutFromGraph(g, hw)),
    assemblies = new Map(g.assemblies.map((a) => [a.id, a])),
    parts = new Map<string, Rec>(m.parts.map((p: Rec) => [p.id, p]));
  sameIds('детали', g.parts.map((p) => p.id), [...parts.keys()]);
  for (const gp of g.parts as Part[]) {
    const p = parts.get(gp.id)!,
      own = assemblies.get(gp.assemblyId)!,
      // A part of the fill belongs to its FILL assembly, that one to the section (W6).
      a = own.kind === 'FILL' ? assemblies.get(own.parentId!)! : own;
    if (wardrobePartRole(p) !== gp.role) throw new Error(`${gp.id}: в графе роль ${gp.role}, по правилам — деталь ${p.kind}`);
    p.name = gp.name;
    p.L = gp.finishedWithEdge.lengthMm;
    p.W = gp.finishedWithEdge.widthMm;
    p.T = gp.finishedWithEdge.panelThicknessMm;
    // A part of the whole product (the inserts of the sliding leaves, W9.2) belongs to no body.
    p.moduleId = a.kind === 'SECTION' ? a.parentId : a.kind === 'PRODUCT' ? null : a.id;
    p.sectionId = a.kind === 'SECTION' ? a.id : null;
    if (gp.handedness !== 'NONE') p.handedness = gp.handedness.toLowerCase();
    if (gp.installationElevationMm !== null) p.installationHeight = gp.installationElevationMm;
    if (own.kind === 'FILL' && own.inputRef !== null && p.fillingId !== undefined) p.fillingId = own.inputRef;
  }
  fillFromGraph(g, m);
  // Faces and edges of the operations are named in part axes; the frame of each part gives the prototype's names.
  const boxes = new Map(wardrobePartBoxes(m).map((b) => [b.id, productBox(b)])),
    frames = new Map([...parts.values()].map((p) => [p.id, partFrame(p, boxes.get(p.id)!)])),
    holes = new Map<string, Rec>(m.holes.map((h: Rec) => [`${h.panel}/${h.operationId}`, h])),
    graphHoles = g.operations.filter((o): o is Hole => o.op === 'HOLE');
  // A part with a cut (the room skirting, MOD-DEC-198): its bands run along the segments of its contour, not along the
  // whole side of its envelope — the banding and the metres of the price are those of the graph (FINDINGS 817).
  const contoured = g.parts.filter((gp) => gp.contourEdges);
  for (const gp of contoured) {
    const f = frames.get(gp.id)!,
      q = parts.get(gp.id)!.q;
    for (const op of m.edgeOperations.filter((o: Rec) => o.partId === gp.id)) {
      const slot = (['A', 'B', 'C', 'D'] as const).find((s) => f.physicalOf[s] === op.physicalEdge);
      op.lengthMm = gp.contourEdges!.filter((e) => e.slot === slot).reduce((n, e) => n + e.lengthMm, 0);
      op.meters = (op.lengthMm * q) / 1000;
    }
  }
  if (contoured.length) Object.assign(m, edgeTotals(m.edgeOperations));
  sameIds('отверстия', graphHoles.map((o) => o.id), [...holes.keys()]);
  for (const o of graphHoles) {
    const h = holes.get(o.id)!,
      f = frames.get(o.partId)!;
    h.panel = o.partId;
    h.mode = o.mode === 'FACE' ? 'face' : 'edge';
    if (o.mode === 'FACE') {
      h.face = f.faceOf[o.face!];
      h.x = o.xMm;
      h.y = o.yMm;
    } else {
      h.edge = (edgeGeometryForPart(parts.get(o.partId)!) as Rec)[physicalOf(frames, o.partId, o.edge!)].slot;
      h.offset = o.xMm;
    }
    h.diameter = o.diameterMm;
    h.depth = o.through ? 'through' : o.depthMm;
    h.purpose = o.purpose;
    h.code = o.code;
    h.connectionId = 'jointId' in o.owner ? o.owner.jointId : o.owner.mechanismId;
    if ('machiningRole' in h) h.machiningRole = o.machiningRole;
    if ('fastenerPresetId' in h) h.fastenerPresetId = o.fastenerProfileId;
    if ('status' in h) h.status = o.status;
  }
  const grooves = new Map<string, Rec>(m.grooves.map((x: Rec) => [`${x.panel}/${x.operationId}`, x])),
    graphGrooves = g.operations.filter((o): o is Groove => o.op === 'GROOVE');
  sameIds('пазы и четверти', graphGrooves.map((o) => o.id), [...grooves.keys()]);
  for (const o of graphGrooves) {
    const x = grooves.get(o.id)!;
    x.panel = o.partId;
    x.face = o.face ? frames.get(o.partId)!.faceOf[o.face] : x.face;
    x.orientation = o.along === 'WIDTH' ? 'W' : 'L';
    x.start = o.startMm;
    x.end = o.endMm;
    x.offset = o.offsetMm;
    x.width = o.grooveWidthMm;
    x.depth = o.grooveDepthMm;
    x.semanticType = o.semanticType;
    x.purpose = o.purpose;
    if ('profileId' in x) x.profileId = o.resolution.profileId;
    Object.assign(x.resolvedMachining, { profileId: o.resolution.profileId, productionConfirmed: o.resolution.productionConfirmed, requiresTechnologyConfirmation: o.resolution.requiresTechnologyConfirmation });
  }
  const joints = new Map(g.joints.map((j) => [j.id, j]));
  facadesFromGraph(g, m, parts);
  liftsFromGraph(g, m);
  fittingsFromGraph(g, m);
  drawersFromGraph(g, m);
  // The hardware by article from the hinges and runners the graph wrote (MOD-DEC-509).
  m.hardwareArticles = wardrobeHardwareArticles(m, hw);
  // The bottom of a drawer is a groove fit with each of its four walls (W7): one joint per wall.
  const pairs = (c: Rec): Rec[] => (c.type === 'drawerBottomGroove' ? String(c.b).split('/').map((wall) => ({ id: `${c.id}/${wall}`, a: c.a, b: wall })) : [c]);
  for (const c of [...m.connections.filter((c: Rec) => c.type !== 'hinge' && c.type !== 'drawerSlide' && c.b !== null).flatMap(pairs), ...m.supportContacts.map((s: Rec) => ({ id: s.id, a: s.from, b: s.to }))]) {
    const j = joints.get(c.id);
    if (!j) disagree('соединения', g.joints.map((x) => x.id), [c.id]);
    const pair = [j.parts.throughPartId, j.parts.receivingPartId].sort().join('|');
    if (pair !== [c.a, c.b].sort().join('|')) throw new Error(`${c.id}: в графе соединены ${pair}, по правилам — ${c.a} и ${c.b}`);
  }
  // The fasteners of the price are those of the joints of the graph (MOD-DEC-507, FINDINGS 810).
  m.jointFasteners = jointFasteners(g.joints);
  return m;
}

/**
 * The fill of the model from its graph (W6): the shelves and rods of each section from the FILL assemblies, their
 * heights from the parts and the rods, the payload and the deflection of each shelf from its Load, the rods from the
 * CLOTHES_ROD mechanisms. A shelf or rod the graph has and the rules do not, or the other way round, is an error.
 */
function fillFromGraph(g: Graph, m: Rec): void {
  const loads = new Map(g.loads.filter((l) => l.partId).map((l) => [l.partId!, l])),
    parts = new Map<string, Rec>(m.parts.map((p: Rec) => [p.id, p])),
    rods = new Map(g.mechanisms.filter((x) => x.kind === 'CLOTHES_ROD').map((x) => [x.id, x]));
  for (const s of m.sectionsData as Rec[]) {
    const fills = g.assemblies.filter((a) => a.kind === 'FILL' && a.parentId === s.id && a.request?.type !== 'localPartition' && a.request?.type !== 'drawer').sort(byIndex),
      items = new Map<string, Rec>(s.interiorElements.filter((e: Rec) => FILL_ELEMENT_TYPES.has(e.type)).map((e: Rec) => [e.id + FILL_SUFFIX, e]));
    sameIds('элементы наполнения ' + s.id, fills.map((a) => a.id), [...items.keys()]);
    for (const a of fills) {
      const e = items.get(a.id)!;
      e.y = a.request!.yMm;
      if (e.type === 'rod') {
        const r = rods.get(e.id);
        if (!r) throw new Error(`${e.id}: штанги нет среди механизмов графа`);
        e.y = r.stationsMm[0];
      }
    }
    s.rodYs = s.interiorElements.filter((e: Rec) => e.type === 'rod').map((e: Rec) => e.y);
  }
  for (const [id, l] of loads) {
    const p = parts.get(id);
    if (!p?.deflection) throw new Error(`${id}: нагрузка графа без полки по правилам`);
    if ('loadKg' in p) p.loadKg = l.payloadKg;
    Object.assign(p.deflection, { span: l.spanMm, depth: l.depthMm, thickness: l.panelThicknessMm, cargoKg: l.payloadKg, selfKg: l.selfMassKg, totalKg: l.totalMassKg, E: l.youngModulusNPerMm2, I: l.secondMomentOfAreaMm4, deflection: l.deflectionMm, sigma: l.bendingStressNPerMm2 });
  }
}

/**
 * The lifts of the lift fronts (task LIFT): the same mechanisms by id, and the row each one names is the row the rules
 * choose with the same release of the catalogue; the leaves came back with the parts.
 */
function liftsFromGraph(g: Graph, m: Rec): void {
  const lifts = g.mechanisms.filter((x) => x.kind === 'FACADE_LIFT'),
    rules: Rec[] = m.liftMechanisms ?? [];
  sameIds('подъёмники', lifts.map((x) => x.id), rules.map((x) => x.id));
  for (const x of lifts) {
    const r = rules.find((y) => y.id === x.id)!;
    if ((r.liftId ?? 'UNKNOWN') !== x.profile.catalogId) disagree('строки подъёмников', [x.profile.catalogId], [r.liftId ?? 'UNKNOWN']);
  }
}

/**
 * The rods, legs and handles of the catalogue (task FIT): the same mechanisms by id, each naming the position the rules
 * choose with the same release; the legs keep the id of the placeholder of their body.
 */
function fittingsFromGraph(g: Graph, m: Rec): void {
  const fit: WardrobeFittings = m.fittings,
    of = (kind: string) => new Map(g.mechanisms.filter((x) => x.kind === kind).map((x) => [x.id, x.profile.catalogId]));
  const handles = of('HANDLE');
  sameIds('ручки', [...handles.keys()], fit.handles.map((h) => h.id));
  for (const h of fit.handles) if (handles.get(h.id) !== h.handleId) disagree('модели ручек', [handles.get(h.id)!], [h.handleId]);
  const rods = of('CLOTHES_ROD');
  for (const r of fit.rods) if (rods.get(r.id) !== r.seriesId) disagree('серии штанг', [rods.get(r.id) ?? 'нет'], [r.seriesId]);
  const legs = of('SUPPORT_LEG');
  for (const l of fit.legs) if (legs.get(l.id) !== l.legId) disagree('ножки', [legs.get(l.id) ?? 'нет'], [l.legId]);
  const lights = of('LIGHT');
  sameIds('светильники', [...lights.keys()], fit.lights.map((l) => l.id));
  for (const l of fit.lights) if (lights.get(l.id) !== l.lightId) disagree('светильники', [lights.get(l.id)!], [l.lightId]);
  const supply = of('POWER_SUPPLY');
  sameIds('блок питания', [...supply.keys()], fit.powerSupply ? [fit.powerSupply.id] : []);
  if (fit.powerSupply && supply.get(fit.powerSupply.id) !== fit.powerSupply.supplyId) disagree('блок питания', [supply.get(fit.powerSupply.id)!], [fit.powerSupply.supplyId]);
  const latches = of('PUSH_LATCH');
  sameIds('толкатели', [...latches.keys()], fit.pushLatches.map((l) => l.id));
  for (const l of fit.pushLatches) if (latches.get(l.id) !== l.latchId) disagree('толкатели', [latches.get(l.id)!], [l.latchId]);
  // MOD-DEC-484: the baskets, trouser racks and pantographs — the same items by id, each naming the item of the rules.
  const storage = new Map([...of('BASKET'), ...of('TROUSER_RACK'), ...of('PANTOGRAPH')]);
  sameIds('корзины, вешала и пантографы', [...storage.keys()], fit.storage.map((x) => x.id));
  for (const x of fit.storage) if (storage.get(x.id) !== x.itemId) disagree('корзины, вешала и пантографы', [storage.get(x.id)!], [x.itemId]);
}

/**
 * The doors, their hinges and the front grid of the model written from the graph (task W4): the place of each door
 * from its placement, the count, stations and pair of its hinge from the mechanism, the exact chain, the gap profile
 * and the overlays from the FrontGrid of the product.
 */
function facadesFromGraph(g: Graph, m: Rec, parts: Map<string, Rec>): void {
  const hinges = g.mechanisms.filter((x) => x.kind === 'HINGE'),
    rules = m.connections.filter((c: Rec) => c.type === 'hinge');
  sameIds('петли', hinges.map((x) => x.id), rules.map((c: Rec) => c.id));
  const facades = new Map<string, Rec>(m.sectionsData.flatMap((s: Rec) => s.facades.map((f: Rec) => [f.id, f])));
  for (const x of hinges) {
    const c = rules.find((r: Rec) => r.id === x.id)!,
      door = g.parts.find((p) => p.id === c.a)!,
      f = facades.get(door.id)!,
      p = parts.get(door.id)!,
      record = m.hingeMechanisms.find((h: Rec) => h.id === x.id)!;
    if ([...x.partIds].sort().join('|') !== [c.a, c.b].sort().join('|')) throw new Error(`${x.id}: в графе петля связывает ${x.partIds.join(', ')}, по правилам — ${c.a} и ${c.b}`);
    const left = door.placement.originMm[0],
      bottom = door.placement.originMm[2];
    Object.assign(f, { left, width: door.finishedWithEdge.widthMm, height: door.finishedWithEdge.lengthMm, doorBottomClearance: bottom, hinges: x.quantity, hingeCenters: [...x.stationsMm], hingeModel: x.profile.catalogId === 'UNKNOWN' ? null : x.profile.catalogId });
    p.doorBottomClearance = bottom;
    c.qty = x.quantity;
    Object.assign(record, { count: x.quantity, stationsMm: [...x.stationsMm], hingeId: f.hingeModel, plateId: x.profile.compatibilityProfileId });
  }
  const grid = g.assemblies.find((a) => a.kind === 'PRODUCT')?.frontGrid;
  if (!grid || !m.frontGrid) return;
  const p = grid.gapProfile;
  Object.assign(m.facadeGapProfile, { profileId: p.profileId, seamX: p.facadeGapHorizontalMm, seamY: p.facadeGapVerticalMm, insetLeft: p.facadeOuterOffsetLeftMm, insetRight: p.facadeOuterOffsetRightMm, insetTop: p.facadeOuterOffsetTopMm });
  sameIds('колонки фронтальной сетки', grid.columns.map((c) => c.id), m.frontGrid.columns.map((c: Rec) => c.id));
  for (const c of grid.columns) {
    const r = m.frontGrid.columns.find((x: Rec) => x.id === c.id);
    Object.assign(r, { exactNominalStart: { ...c.nominalStartMm }, exactNominalEnd: { ...c.nominalEndMm }, nominalStart: ratValue(c.nominalStartMm), nominalEnd: ratValue(c.nominalEndMm), status: c.status });
  }
  sameIds('цепочка фасадов', grid.facades.map((f) => f.id), m.facadeChain.map((f: Rec) => f.id));
  for (const f of grid.facades) {
    const r = m.facadeChain.find((x: Rec) => x.id === f.id);
    Object.assign(r, { exactLeft: { ...f.leftMm }, exactRight: { ...f.rightMm }, left: ratValue(f.leftMm), right: ratValue(f.rightMm), physicalFacadeIds: [...f.partIds], status: f.status });
  }
  sameIds('наложения фасадов', grid.overlays.map((o) => o.facadeId), m.facadeOverlays.map((o: Rec) => o.partId));
  for (const o of grid.overlays) {
    const r = m.facadeOverlays.find((x: Rec) => x.partId === o.facadeId);
    Object.assign(r, { leftMm: o.facadeOverlayLeftMm, rightMm: o.facadeOverlayRightMm, hingeOverlayMm: r.hingeSide === 'left' ? o.facadeOverlayLeftMm : o.facadeOverlayRightMm });
  }
}

/**
 * The drawers of the model from the graph (W7): each drawer of a section is a FILL assembly with its parts and a
 * DRAWER_RUNNER mechanism; its bottom and box height come from the side of its box, its runner from the mechanism; the
 * conflicts of FE-04 (hingeCollisions) from the unresolved of the graph. A drawer the graph has and the rules do not,
 * or the other way round, is an error.
 */
function drawersFromGraph(g: Graph, m: Rec): void {
  const runners = new Map(g.mechanisms.filter((x) => x.kind === 'DRAWER_RUNNER').map((x) => [x.id, x])),
    units: Rec[] = m.drawerUnits ?? [];
  sameIds('направляющие ящиков', [...runners.keys()], units.map((u) => `${u.id}-C-SLIDE`));
  for (const s of m.sectionsData as Rec[]) {
    const fills = g.assemblies.filter((a) => a.kind === 'FILL' && a.parentId === s.id && a.request?.type === 'drawer');
    sameIds('ящики ' + s.id, fills.map((a) => a.id), (s.drawers as Rec[]).map((d) => d.id + FILL_SUFFIX));
    (s.drawers as Rec[]).forEach((d, k) => {
      const side = g.parts.find((p) => p.id === `${d.id}-SIDE-L`),
        runner = runners.get(`${d.id}-C-SLIDE`)!,
        unit = units.find((u) => u.id === d.id)!;
      // MOD-DEC-544 (R2-007): an assembled drawer has metal sides of its kit, no part: its place is its assembly's.
      if (d.drawerKit) {
        const fill = fills.find((a) => a.id === d.id + FILL_SUFFIX)!;
        if (runner.params.article !== d.drawerKit.article) throw new Error(`${d.id}: в графе комплект ${String(runner.params.article)}, правила дают ${d.drawerKit.article}`);
        Object.assign(d, { bottom: fill.request!.yMm, boxHeight: fill.request!.boxHeightMm, depth: runner.params.slideLengthMm, mode: runner.params.mode });
        s.drawerYs[k] = d.bottom;
        Object.assign(unit, { slideId: runner.profile.catalogId, bottomMm: runner.stationsMm[0], slideLengthMm: runner.params.slideLengthMm, placement: runner.params.placement, shiftMm: runner.params.shiftMm });
        return;
      }
      if (!side || side.assemblyId !== d.id + FILL_SUFFIX) throw new Error(`${d.id}: боковины ящика нет в его сборке графа`);
      const bottom = partBox(side).min[2] - s.geometry.interiorBottomY;
      // The runner stands where its box stands: a station apart from the box is a graph the rules did not make.
      if (Math.abs(runner.stationsMm[0]! - bottom) > tolerance.constants.compare.value) throw new Error(`${d.id}: направляющая на ${runner.stationsMm[0]} мм, короб ящика — на ${bottom} мм; граф и правила корпуса дают разные ящики`);
      Object.assign(d, { bottom, boxHeight: side.finishedWithEdge.widthMm, depth: runner.params.slideLengthMm, mode: runner.params.mode });
      s.drawerYs[k] = bottom;
      Object.assign(unit, { slideId: runner.profile.catalogId, bottomMm: runner.stationsMm[0], slideLengthMm: runner.params.slideLengthMm, clearanceMm: runner.params.clearanceMm, placement: runner.params.placement, shiftMm: runner.params.shiftMm });
    });
  }
  if (m.hingeCollisions) {
    const said = new Map(g.unresolved.filter((u) => u.code === 'INNER_DRAWER_HINGE_CONFLICT' || u.code === 'FE04_HINGE_MOVED').map((u) => [u.mechanismIds[0], u]));
    sameIds('конфликты FE-04', [...said.keys()], m.hingeCollisions.issues.map((i: Rec) => i.hingeId));
    for (const i of m.hingeCollisions.issues) i.text = said.get(i.hingeId)!.text;
  }
}
