// Rules of the check of a BAZIS project (task PROD-4, MOD-DEC-500, 542): when a part of the file and a part of the
// engine differ. A check of an input, not a rule of the product: the module is not in POLICY_MODULES. How the panels
// are read as a wardrobe has no decision: the executor's (Д) rules are in bazis-check.ts with FINDINGS 1153.
import { constant, decision, type PolicyModule } from './types.js';

export const bazisImport = {
  id: 'bazis-import',
  version: '1',
  constants: {
    compare: constant(0.1, 'mm', decision('MOD-DEC-191'), 'Размер, положение и толщина детали файла и движка совпадают при отклонении до 0,1 мм включительно'),
  },
} as const satisfies PolicyModule;
