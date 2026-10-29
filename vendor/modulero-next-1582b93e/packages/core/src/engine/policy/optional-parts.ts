// Optional parts and their exclusion: file 50 of the prototype r1 (r1.html:6488–6735), task W1 (MIGRATION_PLAN
// 3.3). A part, a drawer, a rod or the base assembly of a body can be excluded (MOD-DEC-168: the niche without a
// back panel, roof, bottom and plinth); dpCompose removes the excluded parts with their operations and
// connections from a built model, puts the sides on the floor or adds a decorative plinth in front of the legs.
//
// What the prototype read from its global state (state.optionalParts, bodies, backProfile, sections, and the edge
// overrides of the parts it re-bands) is the parameter `d`; the nominal grid (currentNominalGrid, task W2) is the
// parameter `grid` of dpNoBack. dpCompose changes the model in place, as in the prototype.
// Proof: reference/wardrobe-core/w1, packages/core/test/wardrobe.policyW1.test.ts, tests/oracle/wardrobe-policy-w1.test.mjs.
import { edges } from '../../wardrobe/primitives.js';
import { applyEdgeModelToPart, assignProductionOperationIds, partOrientation } from './edge-model.js';
import type { GridModules, PolicyState, Rec } from './project-state.js';
import { constant, decision, prototype, type PolicyModule } from './types.js';

/** Schema of the composition the model carries (r1.html:6488). */
export const DP_SCHEMA = 'OPTIONAL-PARTS-1';

/** Warning of a changed panel set (r1.html:6720). */
export const DP_WARNING = 'Изменён состав конструктивных панелей: жёсткость и крепление проверить. Черновик не является допуском к производству.';

export const optionalParts = {
  id: 'optional-parts',
  version: '1',
  constants: {
    schema: constant(DP_SCHEMA, 'id', prototype('r1.html:6488 DP_SCHEMA', 'FINDINGS 83'), 'Схема состава необязательных деталей в модели'),
    exclusion: constant(true, 'rule', decision('MOD-DEC-168'), 'Предусмотреть исключение деталей: ниша без задника, крыши, дна и цоколя'),
    warning: constant(DP_WARNING, 'text', decision('MOD-DEC-168'), 'Изменённый состав панелей — черновик, не допуск к производству'),
  },
} as const satisfies PolicyModule;

/** Marks the operations an exclusion owner adds after `start` (r1.html:6489). */
export function dpOwnOperations(ops: Rec[], start: number, owners: unknown[], connectionId?: unknown): void {
  for (const op of ops.slice(start)) {
    op.dpOwners = owners.slice();
    if (connectionId) op.connectionId = connectionId;
  }
}

/** Owner of the records of a module: its body id or the ui ids of its sections (r1.html:6495). */
export function dpOwner(mod: Rec, d: PolicyState): string {
  return mod.bodyId || mod.sectionIndexes.map((i: number) => d.sections![i]?.uiSectionId).join('|');
}

/** Exclusion records of the project (r1.html:6498). */
export function dpRecords(d: PolicyState): Rec[] {
  return Object.values(d.optionalParts?.excluded || {});
}

/** r1.html:6501. */
export function dpRecordKey(owner: unknown, role: unknown): string {
  return owner + '::' + role;
}

/** r1.html:6504. */
export function dpModuleRecord(mod: Rec, role: unknown, d: PolicyState): unknown {
  return d.optionalParts?.excluded?.[dpRecordKey(dpOwner(mod, d), role)];
}

/** A panel of a module is excluded, or the back panel has mode 'none' (r1.html:6507). */
export function dpPanelMissing(mod: Rec, role: unknown, d: PolicyState): boolean {
  return !!dpModuleRecord(mod, role, d) || (role === 'back' && d.backProfile?.mode === 'none');
}

/** No body keeps a back panel (r1.html:6510); without bodies the modules of the nominal grid are asked. */
export function dpNoBack(d: PolicyState, grid?: GridModules): boolean {
  if (d.bodies?.length) return d.bodies.every((b) => b.panels.back === false || d.optionalParts?.excluded?.[b.id + '::back'] || d.backProfile?.mode === 'none');
  return grid!.modules.length > 0 && grid!.modules.every((mod) => dpPanelMissing(mod, 'back', d));
}

/** Role of a part in the exclusion records (r1.html:6515). */
export function dpPartRole(p: Rec): string {
  return (
    (
      {
        sideLeft: 'left',
        sideRight: 'right',
        top: 'top',
        bottom: 'bottom',
        back: 'back',
        plinthFront: 'plinthFront',
        plinthRear: 'plinthRear',
        decorativePlinth: 'decorativePlinth',
      } as Record<string, string>
    )[p.kind] || p.id.replace(p.moduleId + '-', '')
  );
}

/** Everything of a model that can be excluded: parts, drawers, rods, base assemblies (r1.html:6527). */
export function dpCatalog(m: Rec, d: PolicyState): Rec[] {
  const out: Rec[] = m.parts.map((p: Rec) => {
    const mod = m.modules.find((x: Rec) => x.id === p.moduleId),
      section = m.sectionsData.findIndex((x: Rec) => x.id === p.sectionId),
      owner = mod ? dpOwner(mod, d) : 'wardrobe',
      role =
        ['fixedShelf', 'adjustableShelf'].includes(p.kind) && d.sections![section]?.shelfUids?.[Number(p.id.match(/SHELF(\d+)$/)?.[1]) - 1]
          ? 'SHELF-UID:' + d.sections![section]!.shelfUids[Number(p.id.match(/SHELF(\d+)$/)[1]) - 1]
          : dpPartRole(p);
    return {
      key: dpRecordKey(owner, role),
      owner,
      role,
      id: p.id,
      kind: p.kind,
      name: p.name,
      moduleId: p.moduleId,
      section,
      partIds: [p.id],
      part: p,
    };
  });
  for (const [section, s] of m.sectionsData.entries() as Iterable<[number, Rec]>) {
    const mod = m.modules.find((x: Rec) => x.id === s.moduleId) || m.modules.find((x: Rec) => x.sectionIndexes.includes(section)),
      owner = dpOwner(mod, d);
    for (const dr of s.drawers) {
      const role = dr.id.replace(mod.id + '-', '');
      out.push({
        key: dpRecordKey(owner, role),
        owner,
        role,
        id: dr.id,
        kind: 'drawerAssembly',
        name: 'Ящик ' + dr.index,
        moduleId: mod.id,
        section,
        index: dr.index - 1,
        partIds: dr.partIds.slice(),
      });
    }
    s.rodYs.forEach((_y: unknown, index: number) => {
      const id = s.id + '-ROD' + String(index + 1).padStart(2, '0'),
        role = id.replace(mod.id + '-', '');
      out.push({
        key: dpRecordKey(owner, role),
        owner,
        role,
        id,
        kind: 'rod',
        name: 'Штанга ' + (index + 1),
        moduleId: mod.id,
        section,
        index,
        partIds: [],
      });
    });
  }
  for (const mod of m.modules)
    if (m.settings.baseSystem !== 'none') {
      const owner = dpOwner(mod, d),
        role = 'BASE-ASSEMBLY';
      out.push({
        key: dpRecordKey(owner, role),
        owner,
        role,
        id: mod.id + '-BASE-ASSEMBLY',
        kind: 'baseAssembly',
        name: 'Несущая система основания',
        moduleId: mod.id,
        partIds: [mod.panelIds.plinthFront, mod.panelIds.plinthRear].filter(Boolean),
      });
    }
  return out;
}

/**
 * The decorative strip before the legs of a body (r1.html:6597): board of the carcass between the planes of its sides,
 * flush with the front edge, from `y0` to `y1` above the floor. The prototype adds it for a body of
 * `optionalParts.decorativeOwners`; the base «ножки за декоративным цоколем» has it too (MOD-DEC-483).
 */
export function decorativePlinthPart(mod: Rec, t: number, y0: number, y1: number): Rec {
  return {
    id: mod.id + '-BASE-DECORATIVE',
    name: mod.id + ' — декоративная планка перед ножками',
    kind: 'decorativePlinth',
    role: 'decoration',
    moduleId: mod.id,
    L: mod.externalWidth - 2 * t,
    W: y1 - y0,
    T: t,
    q: 1,
    dimensionBasis: 'FINISHED_PART',
    edges: edges(),
    worldBox: { x0: mod.start + t, x1: mod.end - t, y0, y1, z0: 0, z1: t },
    requiresTechnologyConfirmation: true,
  };
}

/**
 * Applies the exclusions of the project to a built model, in place (r1.html:6597): decorative plinths, panels of
 * bodies switched off, records of d.optionalParts, sides down to the floor; then drops the excluded parts and
 * everything that hangs on them. Returns the composition the model keeps.
 */
export function dpCompose(m: Rec, d: PolicyState): Rec {
  const cfg = d.optionalParts,
    records = dpRecords(d),
    active = d.bodies?.some((b) => Object.values(b.panels).some((v) => !v)) || !!records.length || !!cfg?.floorOwners?.length || !!cfg?.decorativeOwners?.length || d.backProfile?.mode === 'none';
  for (const mod of m.modules)
    // A body on legs behind a decorative plinth has its strip already (MOD-DEC-483, carcass.ts).
    if (cfg?.decorativeOwners?.includes(dpOwner(mod, d)) && m.geometry.sideBottomY > 0 && !m.parts.some((p: Rec) => p.id === mod.id + '-BASE-DECORATIVE')) {
      const p = decorativePlinthPart(mod, m.t, 0, m.geometry.sideBottomY);
      applyEdgeModelToPart(p, d);
      p.orientation = partOrientation(p);
      m.parts.push(p);
    }
  for (const mod of m.modules) {
    const b = d.bodies!.find((b) => b.id === mod.id);
    for (const role of ['left', 'right', 'top', 'bottom', 'back'])
      if (b?.panels[role] === false && mod.panelIds[role]) {
        const key = dpRecordKey(mod.id, role);
        records.push({
          owner: mod.id,
          role,
          key,
          id: mod.panelIds[role],
          moduleId: mod.id,
          name: mod.id + ' — ' + role,
          kind: role,
        });
      }
  }
  const catalog = dpCatalog(m, d),
    owners = new Set(m.modules.map((x: Rec) => dpOwner(x, d))),
    excludedIds = new Set<unknown>(),
    excludedNodes = new Set<unknown>();
  for (const r of records) {
    if (!owners.has(r.owner)) continue;
    const item = catalog.find((x) => x.key === r.key);
    if (item) {
      item.partIds.forEach((id: unknown) => excludedIds.add(id));
      excludedNodes.add(item.id);
    }
  }
  for (const s of m.sectionsData) if (s.drawers.length && s.drawers.every((dr: Rec) => excludedNodes.has(dr.id))) excludedIds.add(s.id + '-SHELF-DRAWER-COVER');
  for (const mod of m.modules) if (d.backProfile?.mode === 'none') excludedIds.add(mod.panelIds.back);
  for (const mod of m.modules) {
    const floor = cfg?.floorOwners?.includes(dpOwner(mod, d));
    if (floor) {
      for (const id of [mod.panelIds.plinthFront, mod.panelIds.plinthRear]) if (id) excludedIds.add(id);
      for (const id of [mod.panelIds.left, mod.panelIds.right]) {
        const p = m.parts.find((p: Rec) => p.id === id),
          delta = m.geometry.sideBottomY;
        if (!p || !delta) continue;
        p.L += delta;
        p.floorContactEdges = ['bottom'];
        p.worldBox = {
          x0: id === mod.panelIds.left ? mod.start : mod.end - m.t,
          x1: id === mod.panelIds.left ? mod.start + m.t : mod.end,
          y0: 0,
          y1: m.H,
          z0: 0,
          z1: m.D,
        };
        m.holes.filter((h: Rec) => h.panel === id && h.mode === 'face').forEach((h: Rec) => (h.x += delta));
        m.grooves
          .filter((g: Rec) => g.panel === id && g.orientation === 'L')
          .forEach((g: Rec) => {
            g.start += delta;
            g.end += delta;
          });
        applyEdgeModelToPart(p, d);
        p.orientation = partOrientation(p);
      }
      m.hardwarePlaceholders.splice(0, m.hardwarePlaceholders.length, ...m.hardwarePlaceholders.filter((h: Rec) => !(h.scope === mod.id && h.type === 'fixedLegs')));
    }
  }
  assignProductionOperationIds(m.parts, m.holes, m.grooves);
  const activePartIds = new Set(m.parts.filter((p: Rec) => !excludedIds.has(p.id)).map((p: Rec) => p.id));
  const missing = (id: unknown) => excludedIds.has(id) || excludedNodes.has(id),
    removedConnections = new Set(m.connections.filter((c: Rec) => missing(c.a) || missing(c.b) || missing(c.drawerId)).map((c: Rec) => c.id));
  const keepOp = (op: Rec) => activePartIds.has(op.panel) && !removedConnections.has(op.connectionId) && !(op.dpOwners || []).some(missing) && !missing(op.drawerId);
  m.holes.splice(0, m.holes.length, ...m.holes.filter(keepOp));
  m.grooves.splice(0, m.grooves.length, ...m.grooves.filter(keepOp));
  m.connections.splice(0, m.connections.length, ...m.connections.filter((c: Rec) => !removedConnections.has(c.id)));
  m.hardwarePlaceholders.splice(0, m.hardwarePlaceholders.length, ...m.hardwarePlaceholders.filter((h: Rec) => !removedConnections.has(h.id)));
  m.moduleConnectors.splice(0, m.moduleConnectors.length, ...m.moduleConnectors.filter((h: Rec) => !removedConnections.has(h.id)));
  m.supportContacts.splice(0, m.supportContacts.length, ...m.supportContacts.filter((c: Rec) => ![c.a, c.b, c.from, c.to, c.supportingPartId, c.supportedPartId, c.partId].some(missing)));
  m.parts.splice(0, m.parts.length, ...m.parts.filter((p: Rec) => !excludedIds.has(p.id)));
  for (const mod of m.modules) if (excludedIds.has(mod.panelIds.back)) for (const p of m.parts.filter((p: Rec) => p.moduleId === mod.id)) delete p.rearNotch;
  for (const s of m.sectionsData) {
    s.facades = s.facades.filter((f: Rec) => !excludedIds.has(f.id));
    s.drawers.forEach((dr: Rec) => (dr.dpExcluded = excludedNodes.has(dr.id)));
    s.interiorElements = s.interiorElements.filter((e: Rec) => !missing(e.id) && !(e.partIds?.length && e.partIds.every(missing)));
    for (const e of s.interiorElements)
      if (e.partIds) {
        e.partIds = e.partIds.filter((id: unknown) => !missing(id));
        if (e.type.includes('DrawerBlock')) e.count = s.drawers.filter((dr: Rec) => !dr.dpExcluded).length;
      }
    s.fixedShelfYs = s.interiorElements.filter((e: Rec) => e.type === 'fixedShelf').map((e: Rec) => e.y);
  }
  const excluded = records.map((r) => ({
    ...r,
    orphan: !owners.has(r.owner),
    available: catalog.some((x) => x.key === r.key),
  }));
  return {
    schema: DP_SCHEMA,
    active,
    catalog,
    excluded,
    excludedIds: [...excludedIds, ...excludedNodes],
    floorOwners: cfg?.floorOwners || [],
    warnings: active ? [DP_WARNING] : [],
  };
}

/** Id of a shelf, rod or drawer of a section in the model (r1.html:6725). */
export function dpObjectId(m: Rec, o: Rec | null | undefined): unknown {
  const s = m.sectionsData[o?.section];
  if (!s) return null;
  if (o!.type === 'shelf') return s.id + '-SHELF' + String(o!.index + 1).padStart(2, '0');
  if (o!.type === 'rod') return s.id + '-ROD' + String(o!.index + 1).padStart(2, '0');
  if (o!.type === 'drawer') return s.drawers[o!.index]?.id;
  return null;
}

/** r1.html:6733. */
export function dpObjectExcluded(m: Rec, o: Rec | null | undefined): boolean {
  return m.composition?.excludedIds.includes(dpObjectId(m, o)) || false;
}
