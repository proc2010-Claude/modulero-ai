// Entry of the 3D module (MOD-DEC-324: «модуль 3D загружается при открытии вида»). It is built as its own bundle
// (scripts/build.mjs) and kept in the page as text; the shell runs it the first time a 3D view is opened.
import { REVISION } from 'three';
import { StudioView, type Select, type ViewOptions } from './view.js';
import { TechnicalPartView } from './part-view.js';

export interface View3dModule {
  create(host: HTMLElement, select: Select, options?: ViewOptions): StudioView;
  /** The technical 3D of one part (task V3, «3D детали» of r1). */
  createPart(host: HTMLElement): TechnicalPartView;
  /** Every view created on this page, for the checks (tests/oracle/visual-v1.mjs). */
  views: StudioView[];
  threeRevision: string;
}

const module: View3dModule = {
  views: [],
  threeRevision: REVISION,
  create(host, select, options) {
    const view = new StudioView(host, select, options);
    module.views.push(view);
    return view;
  },
  createPart(host) {
    return new TechnicalPartView(host);
  },
};
(window as unknown as { ModuleroView3D: View3dModule }).ModuleroView3D = module;
