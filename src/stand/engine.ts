// Ядро modulero-next на закреплённом SHA (engine.json, AI-DEC-003): модули, которые вызывает стенд.
// Стенд только вызывает функции ядра; формул мебели и цены здесь нет. Копию ядра делает
// npm run engine:setup, загрузку исходников TypeScript — src/engine/register.mjs.
import { existsSync, readFileSync } from 'node:fs';
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
  /** 3D-сцена графа: детали с размещением, фурнитура — engine/scene.ts. */
  sceneOf: (graph: any) => any;
  /** Вид декора в 3D, как у конструктора (apps/web/src/view3d-host.ts, decorLook): цвет или образец. */
  decorLook: (decorId: string) => { color: number; texture?: string } | null;
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
  const [K, standard, gen, preview, file, catalogs, scene3d, coreIndex] = await Promise.all([
    import(at('packages/core/src/kitchen/index.ts')),
    import(at('packages/core/src/kitchen/standard.ts')),
    import(at('packages/core/src/engine/generators/kitchen.ts')),
    import(at('packages/core/src/project/preview.ts')),
    import(at('packages/core/src/project/file.ts')),
    import(at('catalogs/index.ts')),
    import(at('packages/core/src/engine/scene.ts')),
    import(at('packages/core/src/index.ts')),
  ]);
  const HW = catalogs.hardwareCatalogs;
  if (HW.release.version !== PIN.hardwareCatalog)
    throw new Error(`Выпуск каталога ${HW.release.version}, а закреплён ${PIN.hardwareCatalog} (engine.json).`);
  core = { K, cards: standard.KITCHEN_CARDS, kitchenGraph: gen.kitchenGraph, previewSvg: preview.previewSvg, sceneOf: scene3d.sceneOf, decorLook: decorLookOf(coreIndex, HW, join(dir, 'apps/web/public/decors')), writeProjectFile: file.writeProjectFile, readProjectFile: file.readProjectFile, HW, pin: PIN };
  return core;
}

/**
 * decorLook конструктора (apps/web/src/view3d-host.ts на закреплённом SHA): материал «Другой мебели» — его цвет;
 * декор каталога — по id или по коду (кухня хранит код, W980), его образец — data URL файла из apps/web/public/decors.
 */
function decorLookOf(core: any, HW: any, swatchDir: string) {
  const decors = core.decorsOf(HW.materials);
  return (decorId: string) => {
    const m = core.home.materials.find((x: any) => x.id === decorId);
    if (m) return { color: parseInt(m.color.slice(1), 16) };
    const byCode = decors.filter((x: any) => x.code === decorId),
      d = decors.find((x: any) => x.id === decorId) ?? (byCode.length === 1 ? byCode[0] : undefined),
      swatch: string | null = d?.swatch ?? core.decorSwatchOf(HW.materials, decorId),
      file = swatch ? join(swatchDir, swatch) : null;
    return file && existsSync(file) ? { color: 0xffffff, texture: 'data:image/webp;base64,' + readFileSync(file).toString('base64') } : null;
  };
}
