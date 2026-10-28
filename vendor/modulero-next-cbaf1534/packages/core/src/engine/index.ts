// The unified furniture engine (ENGINE.md): contract of the physical graph, building, policy, invariants.
export * from './contract.js';
export * from './graph.js';
export * as policy from './policy/index.js';
export * as invariants from './invariants/index.js';
export * from './scene.js';
export * from './explode.js';
export * from './motion.js';
export * from './drawings.js';
export * from './drawing-export.js';
export * from './production.js';
export * from './cad-export.js';
export * from './bazis-export.js';
export * from './cutting.js';
export * from './bar-cutting.js';
export { wardrobeGraph, wardrobeInputProblems } from './generators/wardrobe.js';
export { kitchenGraph, kitchenGraphProblems } from './generators/kitchen.js';
