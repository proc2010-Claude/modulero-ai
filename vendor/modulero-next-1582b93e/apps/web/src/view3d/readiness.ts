// Shader preparation before a frame (program-readiness.js of r1, `prepareBeauty`) without the patch of r1 inside
// Three.js (docs/VISUAL_3D.md §2.1). r1 changed WebGLRenderer.compileAsync to take an AbortSignal and to stop on a lost
// context or a disposed material. Here the stock `renderer.compile` starts the programs and our own poll waits for
// them: it is cancelled by the signal and by a lost context, it stops when a material lost its program, and its timer
// is always cleared. The copies of the materials live until the wait has ended, so nothing it polls is disposed.
import { Group, type Camera, type Material, type Object3D, type Scene, type WebGLRenderTarget, type WebGLRenderer } from 'three';

const abortError = () => Object.assign(new Error('The shader preparation was cancelled'), { name: 'AbortError' });

/** Waits until the programs of `materials` are ready; rejects with AbortError on the signal or a lost context. */
export function waitForPrograms(renderer: WebGLRenderer, materials: Set<Material>, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer = 0;
    const stop = (error?: Error) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => stop(abortError());
    const check = () => {
      if (signal.aborted) return stop(abortError());
      if (renderer.getContext().isContextLost()) return stop(abortError());
      for (const material of materials) {
        const program = (renderer.properties.get(material) as { currentProgram?: { isReady(): boolean } }).currentProgram;
        // A material disposed during the wait has no program any more: the wait ends instead of failing in the timer.
        if (!program) return stop(Object.assign(new Error('A material was released during the shader preparation'), { name: 'AbortError' }));
        if (program.isReady()) materials.delete(material);
      }
      if (!materials.size) return stop();
      timer = window.setTimeout(check, 10);
    };
    signal.addEventListener('abort', onAbort);
    check();
  });
}

/** Prepares the programs of every visible mesh for `target`; `release()` frees the copies after the wait. */
export function prepareBeauty(renderer: WebGLRenderer, scene: Scene, camera: Camera, target: WebGLRenderTarget | null) {
  const proxy = new Group(),
    clones = new Map<Material, Material>(),
    controller = new AbortController(),
    abort = () => controller.abort();
  renderer.domElement.addEventListener('webglcontextlost', abort);
  const cloneMaterial = (material: Material) => {
    let copy = clones.get(material);
    if (!copy) {
      copy = material.clone();
      copy.onBeforeCompile = material.onBeforeCompile;
      copy.customProgramCacheKey = () => material.customProgramCacheKey();
      clones.set(material, copy);
    }
    return copy;
  };
  scene.traverseVisible((object: Object3D) => {
    const o = object as Object3D & { isMesh?: boolean; isLine?: boolean; isPoints?: boolean; isSprite?: boolean; material?: Material | Material[] };
    if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite) || !o.material) return;
    const copy = o.clone(false) as typeof o;
    copy.material = Array.isArray(o.material) ? o.material.map(cloneMaterial) : cloneMaterial(o.material);
    proxy.add(copy);
  });
  const previousTarget = renderer.getRenderTarget(),
    background = scene.background;
  let compile: Promise<void>;
  try {
    renderer.setRenderTarget(target);
    scene.background = null;
    compile = waitForPrograms(renderer, renderer.compile(proxy, camera, scene), controller.signal);
  } catch (error) {
    compile = Promise.reject(error);
  } finally {
    scene.background = background;
    renderer.setRenderTarget(previousTarget);
  }
  let settled = false,
    disposed = false,
    released = false;
  const release = () => {
    released = true;
    if (!settled) controller.abort();
    if (!settled || disposed) return;
    disposed = true;
    for (const m of clones.values()) m.dispose();
    clones.clear();
  };
  return {
    ready: compile.finally(() => {
      settled = true;
      renderer.domElement.removeEventListener('webglcontextlost', abort);
      if (released) release();
    }),
    release,
  };
}
