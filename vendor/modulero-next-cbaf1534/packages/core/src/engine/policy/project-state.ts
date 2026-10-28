// What the wardrobe policy of task W1 reads from the project (MIGRATION_PLAN 3.3). The prototype r1 reads these
// keys of its global `state` (r1.html:3840) inside the functions; here they come as a parameter `d`, a part of
// WardrobeState (packages/core/src/wardrobe/input.ts). A function reads only the keys it names.
//
// Objects of the prototype model (parts, holes, modules, sections) keep their prototype shape: the policy reads
// and writes exactly the fields the prototype reads and writes, so they are loose records here.

/** A record of the prototype model as the policy sees it. */
export type Rec = Record<string, any>;

/** Keys of the project state read by the W1 policy, as in WardrobeState. */
export interface PolicyState {
  /** Manual edge banding per part: { partId: { physicalEdge: profile | 'AUTO' } } (MOD-DEC-319). */
  edgeOverrides?: Rec | null;
  /** System 32 policy: { version, enabled, provenance }; provenance NEW_PROJECT bands the adjustable shelf on four sides. */
  system32Policy?: Rec | null;
  sections?: Rec[];
  bodies?: Rec[];
  construction?: Rec;
  backProfile?: Rec | null;
  depthProfile?: Rec | null;
  optionalParts?: Rec | null;
  materialSelection?: Rec | null;
  slidingWardrobe?: Rec | null;
}

/**
 * The modules of the nominal grid the prototype asked for (currentNominalGrid, r1.html:11471): the grid of bodies of
 * task W2 (bodyNominalGrid, carcass.ts) or a NominalGrid (front-grid.ts). Only id, bodyId and sectionIndexes of its
 * modules are read.
 */
export interface GridModules {
  modules: Rec[];
}
