// Validators of the technical model: the second half of file 05 of the prototype r1 (r1.html:6062–6320), task W1
// (MIGRATION_PLAN 3.3). Wall attachment and anti-tip, edge protection on the floor, load paths, hinge zones,
// installation in the room, the domain hierarchy and hardware placeholders.
//
// Differs from the prototype by decision: a floor edge without a band is a warning, not an error (FINDINGS 87).
// Collapsed: roomInstallationValidator is the construction layer (r1.html:90955), which replaced the function of
// file 05 (r1.html:6247) without calling it; the earlier body never runs in r1 and is not ported (FINDINGS 84).
// What the prototype read from its global state (state.sections, state.construction.room) is the parameter `d`;
// the hinge catalogue (HINGE_CATALOG, a header constant of the hinges, task W4) is the parameter `hinges`.
// Proof: reference/wardrobe-core/w1, packages/core/test/wardrobe.policyW1.test.ts, tests/oracle/wardrobe-policy-w1.test.mjs.
import { edgeIntentForProfileCode, edgeIntentThicknessMm, edgeIntentTitle } from '../../wardrobe/edges.js';
import { WardrobeStandardPreset } from '../../wardrobe/standard.js';
import { edgeManualEdit, edgeModel, physicalEdgeLabelRu } from './edge-model.js';
import type { PolicyState, Rec } from './project-state.js';

/** Wall attachment of a floor-standing wardrobe: two upper zones per module (r1.html:6062). */
export function buildWallAttachmentRequirement(settings: Rec, modules: Rec[]) {
  const zones = modules.flatMap((mod) => [
      {
        id: `${mod.id}-WALL-ATTACH-L`,
        moduleId: mod.id,
        zone: 'верхняя левая',
        linkedPanels: [mod.panelIds.left, mod.panelIds.top],
      },
      {
        id: `${mod.id}-WALL-ATTACH-R`,
        moduleId: mod.id,
        zone: 'верхняя правая',
        linkedPanels: [mod.panelIds.right, mod.panelIds.top],
      },
    ]),
    tallCabinetEmphasis = settings.height >= WardrobeStandardPreset.antiTipHeightThreshold;
  return {
    id: 'INSTALL-WALL-ATTACHMENT',
    type: 'WALL_ATTACHMENT',
    required: true,
    requiredForApplicableFloorStandingWardrobe: true,
    appliesTo: 'FLOOR_STANDING_WARDROBE',
    attachmentTarget: 'STRUCTURAL_CABINET_PART',
    structuralTargetPartIds: [...new Set(zones.flatMap((z) => z.linkedPanels))],
    hdfOnlyAttachmentAllowed: false,
    anchorSku: null,
    anchorSelection: 'INSTALLER',
    missingAnchorBlocksManufacture: false,
    oldHeightThresholdMayControlRequirementPresence: false,
    heightThresholdControlsRequirementPresence: false,
    riskEmphasis: tallCabinetEmphasis ? 'TALL_CABINET' : 'STANDARD',
    zones,
    requiresInstallationConfirmation: true,
    warning: `Шкаф необходимо закрепить к стене через силовую деталь корпуса; крепление только к ХДФ недопустимо. Анкер выбирает монтажник после проверки основания и коммуникаций${tallCabinetEmphasis ? ' — для высокого шкафа требуется усиленное внимание к схеме крепления.' : '.'}`,
  };
}

/** Anti-tip system from the wall attachment (r1.html:6095). */
export function buildAntiTipSystem(settings: Rec, modules: Rec[]) {
  const installationRequirement = buildWallAttachmentRequirement(settings, modules);
  return {
    type: 'AntiTipSystem',
    required: installationRequirement.required,
    recommendedPointCount: Math.max(WardrobeStandardPreset.antiTipMinimumZones, installationRequirement.zones.length),
    zones: installationRequirement.zones,
    requiresHardwareConfirmation: true,
    riskEmphasis: installationRequirement.riskEmphasis,
    installationRequirement,
    warning: installationRequirement.warning,
  };
}

/** Code of the floor edge warning; the graph shows it to the user as an unresolved WARNING (MOD-DEC-325, INV-S02). */
export const FLOOR_CONTACT_EDGE_ISSUE = 'FLOOR_CONTACT_EDGE_PROTECTION_REQUIRED';

/**
 * Every floor edge of a chipboard part has a band of at least 0.4 mm (r1.html:6108, ES v1.2 FE-EDGE-002). A missing
 * band is a non-blocking warning, not the prototype's error: no band is allowed everywhere (MOD-DEC-325;
 * fixed by 295, FINDINGS 87).
 */
export function floorContactEdgeValidator(parts: Rec[] | null | undefined) {
  const minimumThicknessMm = edgeIntentThicknessMm(edgeModel.constants.floorContactIntent.value),
    checks: Rec[] = [],
    issues: Rec[] = [];
  (parts || [])
    .filter((part) => part.materialFamily === 'LDSP')
    .forEach((part) =>
      (part.floorContactEdges || []).forEach((physicalEdge: string) => {
        const intentCode = part.effectiveEdgeIntents?.[physicalEdge] || edgeIntentForProfileCode(part.effectiveEdges?.[physicalEdge]),
          thicknessMm = edgeIntentThicknessMm(intentCode),
          check = {
            partId: part.id,
            physicalEdge,
            intentCode,
            thicknessMm,
            minimumThicknessMm,
            valid: thicknessMm >= minimumThicknessMm,
          };
        checks.push(check);
        if (!check.valid)
          issues.push({
            level: edgeManualEdit.constants.noBandWarning.value,
            code: FLOOR_CONTACT_EDGE_ISSUE,
            partId: part.id,
            physicalEdge,
            text: `${part.id}: физический торец «${physicalEdgeLabelRu(physicalEdge)}» контактирует с чистовым полом и должен иметь защиту не менее ${minimumThicknessMm} мм; эффективно ${edgeIntentTitle(intentCode)}.`,
          });
      }),
    );
  return {
    type: 'FloorContactEdgeValidator',
    minimumThicknessMm,
    checks,
    issues,
    ok: issues.length === 0,
  };
}

/** How the load of each module reaches the floor: sides, raised bottom on the plinth rails, dividers (r1.html:6140). */
export function loadPathValidator(m: Rec) {
  const warnings: Rec[] = [],
    paths: Rec[] = [];
  m.modules.forEach((mod: Rec) => {
    paths.push({
      moduleId: mod.id,
      from: [mod.panelIds.left, mod.panelIds.right],
      to: 'floor',
      status: 'supported',
      method: m.baseSystem.kind === 'plinth' ? 'наружные боковины доходят до пола' : m.baseSystem.kind === 'none' ? 'боковины и дно опираются на пол' : 'корпус установлен на временных ножках',
    });
    const rails = [mod.panelIds.plinthFront, mod.panelIds.plinthRear].filter(Boolean),
      railParts = rails.map((id) => m.parts.find((p: Rec) => p.id === id)).filter(Boolean),
      contacts = (m.supportContacts || []).filter((c: Rec) => c.moduleId === mod.id && c.type === 'bearingContact'),
      dowels = m.connections.filter((c: Rec) => c.moduleId === mod.id && c.type === 'woodenDowel' && c.subtype === 'plinthRailBottomDowel');
    if (m.baseSystem.kind === 'plinth' && railParts.length === 2 && contacts.length === 2) {
      paths.push({
        moduleId: mod.id,
        from: mod.panelIds.bottom,
        via: rails,
        to: 'floor',
        status: 'supported',
        method: 'поднятое дно передаёт вертикальную нагрузку контактным опиранием на переднюю и заднюю цокольные планки',
      });
      paths.push({
        moduleId: mod.id,
        from: rails,
        to: [mod.panelIds.left, mod.panelIds.right],
        status: 'supported',
        method: `конфирматы rail ↔ side фиксируют планки; ${dowels.length ? `деревянные шканты (${dowels.length}) позиционируют длинные планки и препятствуют взаимному смещению; ` : ''}вертикальная нагрузка передаётся только контактным опиранием`,
      });
    } else if (m.baseSystem.kind === 'plinth')
      warnings.push({
        level: 'warn',
        text: `${mod.id}: для поднятого дна не сформирована полная пара контактных опор на переднюю и заднюю цокольные планки.`,
      });
    mod.sectionIndexes.forEach((i: number) => {
      const d = m.sectionsData[i],
        divider = d ? m.parts.find((p: Rec) => p.sectionId === d.id && p.kind === 'divider') : null;
      if (divider) {
        const supported = m.baseSystem.kind === 'none' || (railParts.length === 2 && contacts.length === 2);
        paths.push({
          moduleId: mod.id,
          sectionId: d.id,
          from: divider.id,
          via: [mod.panelIds.bottom, ...rails],
          to: 'floor',
          status: supported ? 'supported' : 'review',
          method: m.baseSystem.kind === 'none' ? 'перегородка → дно → пол' : supported ? 'перегородка → поднятое дно → контактное опирание на цокольные планки → пол' : 'перегородка опирается на поднятое дно',
        });
        if (!supported)
          warnings.push({
            level: 'warn',
            text: `${d.id}: перегородка передаёт нагрузку на поднятое дно без подтверждённой пары контактных опор; проверить конструкцию основания.`,
          });
      }
      if (d?.fixedShelfYs?.length)
        paths.push({
          moduleId: mod.id,
          sectionId: d.id,
          from: d.fixedShelfYs.map(() => d.id),
          to: 'боковины/перегородки',
          status: 'supported',
          method: 'фиксированные полки являются элементами жёсткости',
        });
    });
  });
  return {
    type: 'LoadPathValidator',
    paths,
    warnings,
  };
}

/** Warnings of the hinge zone per section with fronts (r1.html:6210); `hinges` is the hinge catalogue by model. */
export function hingeCollisionEngine(m: Rec, d: PolicyState, hinges: Rec) {
  const issues: Rec[] = [];
  const hinge = hinges[m.settings.hingeModel],
    lastSection = m.sectionsData.length - 1;
  m.sectionsData.forEach((s: Rec, i: number) => {
    const cfg = d.sections![i]!;
    if (!s.facades.length) return;
    if (hinge.requiresHardwareConfirmation)
      issues.push({
        level: 'warn',
        text: `${s.id}: геометрия зоны выступания петли ${hinge.name} не подтверждена каталогом; совместимость с внутренними ящиками и полками требует проверки фурнитуры.`,
      });
    if (cfg.drawersEnabled && cfg.drawerMode === 'internal')
      issues.push({
        level: 'warn',
        text: `${s.id}: внутренний ящик за распашной дверью не считается автоматически совместимым с обычной петлёй; проверить чашки, ответные планки и полный вылет ящика.`,
      });
    const touchesLeftWall = m.settings.leftWall && i === 0 && s.facades.some((f: Rec) => f.hingeSide === 'left'),
      touchesRightWall = m.settings.rightWall && i === lastSection && s.facades.some((f: Rec) => f.hingeSide === 'right');
    if (touchesLeftWall || touchesRightWall)
      issues.push({
        level: 'warn',
        text: `${s.id}: сторона петель находится у стены. Нужен пристенный добор или подтверждение угла открытия двери.`,
      });
    if (s.facades.some((f: Rec) => f.doorBottomClearance <= 0))
      issues.push({
        level: 'err',
        text: `${s.id}: фасад сталкивается с полом — зазор до пола должен быть больше нуля.`,
      });
    if (s.facades.length > 1)
      issues.push({
        level: 'warn',
        text: `${s.id}: соседние фасады требуют проверки фактического зазора и траектории открытия.`,
      });
  });
  return {
    type: 'HingeCollisionEngine',
    hingeCatalogId: hinge.id,
    issues,
    requiresHardwareConfirmation: hinge.requiresHardwareConfirmation,
  };
}

/**
 * Installation in the room (the construction layer r1.html:90955 over r1.html:6247): ceiling and narrowest
 * heights, the way of assembly (lying: the diagonal must pass under the ceiling; standing: the side top), the width.
 */
export function roomInstallationValidator(m: Rec, d: PolicyState) {
  const r = d.construction!.room,
    heights = [r.ceiling, ...r.heights].filter(Number.isFinite),
    room = heights.length ? Math.min(...heights) : null,
    lying = r.assembly === 'lying',
    standing = r.assembly === 'standing';
  const checks = m.modules.map((b: Rec) => {
    const g = b.geometry,
      finishedDepth = g.settings.dimensions.Doverall,
      required = lying ? Math.ceil(Math.hypot(g.height, finishedDepth)) : standing ? g.height : null;
    return {
      moduleId: b.id,
      moduleHeight: g.height,
      moduleDepth: finishedDepth,
      requiredLiftHeight: lying ? required : null,
      roomHeight: room,
      canLift: lying && room !== null ? room >= required : null,
      fitsStanding: room === null ? null : room >= g.sideTopY,
    };
  });
  const warnings: Rec[] = [];
  if (!r.assembly)
    warnings.push({
      level: 'warn',
      text: 'Способ сборки не выбран — установка не проверена.',
    });
  else if (room === null)
    warnings.push({
      level: 'warn',
      text: lying ? 'Высота потолка не указана — возможность подъёма шкафа не проверена.' : 'Высота потолка не указана — установка не проверена.',
    });
  for (const c of checks)
    if (c.canLift === false)
      warnings.push({
        level: 'warn',
        bodyId: c.moduleId,
        text: 'По указанным размерам шкаф не получится поднять после сборки лёжа.',
      });
  for (const c of checks)
    if (c.fitsStanding === false)
      warnings.push({
        level: 'warn',
        bodyId: c.moduleId,
        text: 'Корпус не помещается по высоте в указанном месте.',
      });
  const widths = [r.width, ...r.widths].filter(Number.isFinite),
    availableWidth = widths.length ? Math.min(...widths) : null,
    widthFits = (r.niche || (r.left && r.right)) && availableWidth !== null ? m.W <= availableWidth : null;
  if (widthFits === false)
    warnings.push({
      level: 'warn',
      text: 'Шкаф шире указанного места установки.',
    });
  if (lying)
    warnings.push({
      level: 'warn',
      text: 'Место на полу, препятствия и фактическую сборку подтверждает пользователь и мебельщик.',
    });
  return {
    type: 'RoomInstallationValidator',
    availableWidth,
    widthFits,
    status:
      widthFits === false
        ? 'WARNING'
        : !r.assembly || room === null
          ? 'UNKNOWN'
          : checks.some((c: Rec) => c.canLift === false || c.fitsStanding === false)
            ? 'WARNING'
            : lying
              ? 'GEOMETRIC_LIFT_OK'
              : 'GEOMETRIC_STANDING_OK',
    checks,
    warnings,
    roomHeight: room,
    requiredLiftHeight: lying ? Math.max(...checks.map((c: Rec) => c.requiredLiftHeight)) : null,
  };
}

/** The wardrobe as a hierarchy of modules and sections (r1.html:6286). */
export function buildDomainHierarchy(m: Rec) {
  const modules = m.modules.map((mod: Rec) => ({
    ...mod,
    type: 'CabinetModule',
    sections: mod.sectionIndexes.map((i: number) => m.sectionsData[i]),
    baseSystem: m.baseSystem,
    antiTipZones: m.antiTipSystem.zones.filter((z: Rec) => z.moduleId === mod.id),
  }));
  return {
    type: 'Wardrobe',
    id: 'WARDROBE-01',
    dimensions: {
      width: m.W,
      height: m.H,
      depth: m.D,
    },
    preset: WardrobeStandardPreset,
    settings: m.settings,
    modules,
    baseSystem: m.baseSystem,
    antiTipSystem: m.antiTipSystem,
    hardwarePlaceholders: m.hardwarePlaceholders,
    moduleConnectors: m.moduleConnectors,
  };
}

/** Hardware that needs confirmation (r1.html:6311). */
export function makeHardwarePlaceholder(id: unknown, type: unknown, scope: unknown, message: unknown, extra: Rec = {}) {
  return {
    id,
    type,
    scope,
    requiresHardwareConfirmation: true,
    message,
    ...extra,
  };
}
