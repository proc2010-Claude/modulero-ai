// Rules of the production package (task PROD-1, stage 1): the status «Готово к изготовлению» / «Номинальный
// черновик» of one version of the product and the order of the steps of the assembly scheme. Like the drawings
// (drawing.ts), the package is an output of the graph, not a rule of the product: the module is not in POLICY_MODULES,
// its version is stamped on every page of the package instead.
import type { MechanismKind, PartRole } from '../contract.js';
import { constant, decision, standard, type PolicyModule } from './types.js';

/** One step of the assembly scheme: the parts of these roles and the mechanisms of these kinds are put in at it. */
export interface AssemblyStepRule {
  id: string;
  title: string;
  /** What the assembler does, in plain Russian. */
  text: string;
  roles: readonly PartRole[];
  mechanisms: readonly MechanismKind[];
  /** The step carries the installation requirements of the graph (INV-H26-02). */
  installation: boolean;
}

const step = (id: string, title: string, text: string, roles: PartRole[], mechanisms: MechanismKind[] = [], installation = false): AssemblyStepRule =>
  Object.freeze({ id, title, text, roles: Object.freeze(roles), mechanisms: Object.freeze(mechanisms), installation });

/**
 * Steps in the order of the assembly. A part whose role is in no step falls into the last one, «Прочие детали», so
 * every part of the graph is in exactly one step.
 */
const ASSEMBLY_STEPS: readonly AssemblyStepRule[] = Object.freeze([
  step('CARCASS', 'Корпус', 'Собрать короб: боковины, крышу, дно и перегородки соединить крепежом по листам деталей. Проверить диагонали.', ['SIDE_PANEL_LEFT', 'SIDE_PANEL_RIGHT', 'CARCASS_TOP_PANEL', 'TOP_COVER_PANEL', 'CARCASS_BOTTOM_PANEL', 'PARTITION', 'VERTICAL_STRUCTURAL_PANEL']),
  step('BASE', 'Цоколь и опоры', 'Установить цоколь или опоры под дно корпуса.', ['PLINTH_PANEL', 'SUPPORT_PAD'], ['SUPPORT_LEG']),
  step('FIXED', 'Неподвижные полки и разделители', 'Установить неподвижные полки, разделители, проставки и царги на крепёж по листам деталей.', ['FIXED_SHELF', 'DRAWER_COVER_SHELF', 'FILLING_DIVIDER', 'LOCAL_PARTITION', 'DRAWER_RUNNER_SPACER', 'REAR_APRON', 'FILLER_PANEL']),
  step('BACK', 'Задняя стенка', 'Выставить корпус в прямой угол по диагоналям и закрепить заднюю стенку.', ['BACK_PANEL']),
  step('INSTALL', 'Установка на место и крепление к стене', 'Поставить корпус на место, выровнять и закрепить к стене по требованиям монтажа.', [], ['ANTI_TIP', 'SUSPENSION_RAIL'], true),
  step('DRAWERS', 'Ящики', 'Собрать короба ящиков, установить направляющие и ящики.', ['DRAWER_BOX_SIDE', 'DRAWER_BOX_BACK', 'DRAWER_BOTTOM_PANEL', 'STRUCTURAL_FRONT'], ['DRAWER_RUNNER', 'DRAWER_BOX']),
  step('FILL', 'Съёмное наполнение', 'Установить полкодержатели, съёмные полки и штанги.', ['ADJUSTABLE_SHELF'], ['SHELF_SUPPORT', 'CLOTHES_ROD', 'BASKET', 'TROUSER_RACK', 'PANTOGRAPH']),
  step('FRONTS', 'Фасады', 'Установить петли и подъёмники, навесить фасады, отрегулировать зазоры, привернуть ручки.', ['HINGED_FACADE_LEAF', 'LIFT_FACADE_LEAF', 'DECORATIVE_FACADE', 'SLIDING_LEAF_INFILL'], ['HINGE', 'FACADE_LIFT', 'SLIDING_SYSTEM', 'HANDLE', 'PUSH_LATCH']),
  step('OTHER', 'Прочие детали', 'Установить остальные детали по общему чертежу.', ['WORKTOP'], ['APPLIANCE', 'LIGHT', 'POWER_SUPPLY']),
]);

export const productionPackage = {
  id: 'production-package',
  version: '1',
  constants: {
    readyLabel: constant('Готово к изготовлению', 'text', decision('MOD-DEC-326'), 'Статус версии изделия, когда выполнены все условия RELEASE_1_SCOPE §4.2'),
    draftLabel: constant('Номинальный черновик', 'text', decision('MOD-DEC-326'), 'Статус во всех остальных случаях (RELEASE_1_SCOPE §4.2)'),
    draftMark: constant('НЕ ДЛЯ ИЗГОТОВЛЕНИЯ', 'text', decision('MOD-DEC-326'), 'Пометка черновика на каждом листе пакета (RELEASE_1_SCOPE §4.2, приёмка П6)'),
    installationMechanisms: constant(
      Object.freeze(['ANTI_TIP'] as const satisfies readonly MechanismKind[]),
      'kinds',
      decision('MOD-DEC-031'),
      'Крепление к стене — монтажное требование: анкер выбирает мебельщик или монтажник по стене (031, 186), неизвестный анкер не делает фурнитуру неподобранной',
    ),
    assemblySteps: constant(
      ASSEMBLY_STEPS,
      'steps',
      standard('HB r8 гл. 26 [ПРАКТ]: последовательность сборки важна — вставленная задняя стенка может закрыть доступ к крепежу'),
      '(Д) Порядок шагов схемы сборки предложен исполнителем PROD-1; доступ инструмента в последовательности (INV-H26-01) не проверен',
    ),
  },
} as const satisfies PolicyModule;
