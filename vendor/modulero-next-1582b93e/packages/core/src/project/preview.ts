// The picture of a project in «Мои проекты» (MOD-DEC-473, FINDINGS 1116): the reference axonometry of the general
// drawing (28° / 20°, MOD-DEC-107) of the graph, small, as SVG text. The server draws it when a revision is saved,
// so after the calculations move to the server (PLAT-9, MOD-DEC-497) the picture stays where it is drawn now.
// Only the geometry of the parts goes in: no names, no decors, no text of the user.
import { axonometry } from '../engine/drawings.js';
import { kitchenGraph } from '../engine/generators/kitchen.js';
import { wardrobeGraph } from '../engine/generators/wardrobe.js';
import { scenePart, type ScenePart } from '../engine/scene.js';
import type { Graph } from '../engine/contract.js';
import type { HardwareCatalogs } from '../catalog/hardware/release.js';
import { homeEngineGraph, type HomeProject } from '../home/index.js';
import { kitchenSceneOf } from '../kitchen/editor.js';
import type { KitchenProject } from '../kitchen/index.js';
import type { WardrobeProject } from '../wardrobe/project.js';
import type { OpenedProject } from './file.js';

/** The canvas of the picture, px: the row of the cabinet shows it at 4:3. */
export const PREVIEW_SIZE = Object.freeze({ width: 160, height: 120, padding: 6 });

/**
 * The carcass keeps the paper shades of the general drawing (front, right, top face); fronts and purchased parts get
 * a tone of their own, so a closed wardrobe does not read as a blank box.
 */
const FILL: Partial<Record<ScenePart['surface'], Record<string, string>>> = {
  FACADE: { '#fff': '#e8e6f8', '#eceae6': '#d3cff0', '#f7f6f3': '#dedaf4' },
  HARDWARE: { '#fff': '#d9dbe0', '#eceae6': '#c4c7ce', '#f7f6f3': '#cfd2d8' },
};
const STROKE = '#1b1f2a';

/** The graph of an opened project the core can build now; null — it cannot (a prototype file, a project to migrate). */
export function projectGraph(opened: OpenedProject, hw: HardwareCatalogs): Graph | null {
  if (!opened.editable || opened.needsMigration) return null;
  switch (opened.kind) {
    case 'wardrobe':
    case 'sliding':
      return wardrobeGraph((opened.project as WardrobeProject).input, hw);
    case 'kitchen':
      return kitchenGraph(kitchenSceneOf(opened.project as KitchenProject, hw));
    case 'home':
      return homeEngineGraph(opened.project as HomeProject, hw);
  }
}

const n1 = (v: number) => String(Math.round(v * 10) / 10);

/** The picture of a graph: the visible faces of the part boxes from the back to the front; null — no parts. */
export function previewSvg(g: Pick<Graph, 'parts'>): string | null {
  const parts = g.parts.map(scenePart);
  if (!parts.length) return null;
  const { faces, raw } = axonometry(parts),
    pts = faces.map((f) => f.pts.map(raw)),
    all = pts.flat(),
    minU = Math.min(...all.map((p) => p[0])),
    maxU = Math.max(...all.map((p) => p[0])),
    minV = Math.min(...all.map((p) => p[1])),
    maxV = Math.max(...all.map((p) => p[1])),
    { width: W, height: H, padding: pad } = PREVIEW_SIZE,
    k = Math.min((W - 2 * pad) / Math.max(1, maxU - minU), (H - 2 * pad) / Math.max(1, maxV - minV)),
    dx = (W - (maxU - minU) * k) / 2,
    dy = (H - (maxV - minV) * k) / 2;
  const surface = new Map(parts.map((p) => [p.id, p.surface]));
  const polys = faces.map((f, i) => {
    const fill = FILL[surface.get(f.id)!]?.[f.shade] ?? f.shade;
    return `<polygon points="${pts[i]!.map(([u, v]) => `${n1(dx + (u - minU) * k)},${n1(dy + (v - minV) * k)}`).join(' ')}" fill="${fill}"/>`;
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<g stroke="${STROKE}" stroke-width="0.4" stroke-linejoin="round">${polys.join('')}</g></svg>`
  );
}
