// Rules of the CAD exports of the graph (task PROD-3, stage 2 of «Производственные данные»): which STEP schemas
// are written. Like the drawings and the production package, the exports are outputs of the graph, not rules of the
// product: the module is not in POLICY_MODULES, its version is written into every file instead.
import { constant, decision, type PolicyModule } from './types.js';

/** One STEP application protocol: the schema of the header and the application context of the data. */
export interface StepSchema {
  /** Name in the file and in the UI: `AP242`, `AP214`. */
  id: string;
  /** FILE_SCHEMA of ISO 10303-21. */
  fileSchema: string;
  /** APPLICATION_CONTEXT and APPLICATION_PROTOCOL_DEFINITION of the protocol. */
  context: string;
  protocol: string;
  year: number;
}

const schema = (id: string, fileSchema: string, context: string, protocol: string, year: number): StepSchema => Object.freeze({ id, fileSchema, context, protocol, year });

export const cadExport = {
  id: 'cad-export',
  version: '1',
  constants: {
    stepSchemas: constant(
      Object.freeze([
        schema('AP242', 'AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF { 1 0 10303 442 1 1 4 }', 'managed model based 3d engineering', 'ap242_managed_model_based_3d_engineering', 2011),
        schema('AP214', 'AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }', 'core data for automotive mechanical design processes', 'automotive_design', 2000),
      ]),
      'schemas',
      decision('MOD-DEC-252'),
      'STEP: AP242 — основной, AP214 — для совместимости со старыми программами',
    ),
  },
} as const satisfies PolicyModule;
