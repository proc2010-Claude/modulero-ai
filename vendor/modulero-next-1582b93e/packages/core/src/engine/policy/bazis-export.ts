// Rules of the BAZIS file of the graph (task PROD-5, stage 3 of «Производственные данные»): the files are made by the
// engine of Modulero, BAZIS only reads them (MOD-DEC-250). Like the other exports, an output of the graph, not a rule
// of the product: the module is not in POLICY_MODULES.
import { constant, decision, type PolicyModule } from './types.js';

export const bazisExport = {
  id: 'bazis-export',
  version: '1',
  constants: {
    documentVersion: constant(
      Object.freeze({ header: 14, major: 11, minor: 14 }),
      'version',
      decision('MOD-DEC-250'),
      'Версия документа .b3d — та, что у файлов, которые БАЗИС открыл, изменил и сохранил (испытание finish07, FINDINGS 741)',
    ),
  },
} as const satisfies PolicyModule;
