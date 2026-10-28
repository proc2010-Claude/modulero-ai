// 3D-сцена для страницы прототипа: та же, что строит конструктор по графу ядра, у кухни и у шкафа.
import type { Core } from './engine.ts';

/** 3D-сцена ядра (engine.sceneOf) и вид её декоров — то, что конструктор отдаёт своему 3D-виду. */
export interface Scene3dView {
  scene: any;
  looks: Record<string, { color: number; texture?: string } | null>;
}

/** Сцена для 3D-вида страницы: та же, что строит конструктор (engine.sceneOf графа), и вид каждого её декора. */
export function scene3dOf(c: Core, graph: any): Scene3dView {
  const scene = c.sceneOf(graph),
    ids = new Set<string>();
  for (const p of scene.parts) {
    ids.add(p.decorId);
    if (p.edgeDecor) ids.add(p.edgeDecor.decorId);
  }
  // Отверстия сцены — для «Рентгена» конструктора: контуры присадки и фурнитура в них.
  return { scene, looks: Object.fromEntries([...ids].map((id) => [id, c.decorLook(id)])) };
}
