// Ядро modulero-next на закреплённом SHA (engine.json, AI-DEC-003): модули, которые вызывает стенд.
// Стенд только вызывает функции ядра; формул мебели и цены здесь нет. Копию ядра делает
// npm run engine:setup, загрузку исходников TypeScript — src/engine/register.mjs.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PIN, engineDir } from '../engine/pin.mjs';

export interface Core {
  /** Правки и сводки кухни: packages/core/src/kitchen/index.ts. */
  K: any;
  /** Карточки модулей кухни с их ширинами: kitchen/standard.ts. */
  cards: Record<string, any>;
  /** Граф кухни: engine/generators/kitchen.ts. */
  kitchenGraph: (scene: any) => any;
  previewSvg: (graph: any) => string | null;
  writeProjectFile: (kind: string, project: unknown, opts: { appVersion: string; now?: Date; hardwareCatalog: { version: string; sha256: string } }) => string;
  readProjectFile: (text: string, hw: any) => any;
  /** Действующий выпуск каталога фурнитуры: catalogs/index.ts. */
  HW: any;
  pin: { repo: string; sha: string; hardwareCatalog: string };
}

let core: Core | null = null;

export class EngineMissing extends Error {}

/** Загружает ядро один раз; без копии ядра — понятная ошибка с командой. */
export async function loadCore(): Promise<Core> {
  if (core) return core;
  const dir: string = engineDir();
  if (!existsSync(join(dir, 'packages/core/src/kitchen/index.ts')))
    throw new EngineMissing(`Нет копии ядра modulero-next ${PIN.sha.slice(0, 8)} в ${dir}: выполните npm run engine:setup.`);
  const at = (p: string) => pathToFileURL(join(dir, p)).href;
  const [K, standard, gen, preview, file, catalogs] = await Promise.all([
    import(at('packages/core/src/kitchen/index.ts')),
    import(at('packages/core/src/kitchen/standard.ts')),
    import(at('packages/core/src/engine/generators/kitchen.ts')),
    import(at('packages/core/src/project/preview.ts')),
    import(at('packages/core/src/project/file.ts')),
    import(at('catalogs/index.ts')),
  ]);
  const HW = catalogs.hardwareCatalogs;
  if (HW.release.version !== PIN.hardwareCatalog)
    throw new Error(`Выпуск каталога ${HW.release.version}, а закреплён ${PIN.hardwareCatalog} (engine.json).`);
  core = { K, cards: standard.KITCHEN_CARDS, kitchenGraph: gen.kitchenGraph, previewSvg: preview.previewSvg, writeProjectFile: file.writeProjectFile, readProjectFile: file.readProjectFile, HW, pin: PIN };
  return core;
}
