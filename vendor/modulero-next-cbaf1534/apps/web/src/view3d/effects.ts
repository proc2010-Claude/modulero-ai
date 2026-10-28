// Studio passes of the visual layer (studio-effects.js of r1, same passes and numbers): soft floor shadow from the
// actual meshes (GroundContact), SSAO for small contact detail, the selection outline and the output pass. Beyond r1:
// the still picture is smoothed by accumulating frames shifted by fractions of a pixel (FINDINGS 1990).
import {
  Color,
  DoubleSide,
  HalfFloatType,
  MeshBasicMaterial,
  NoBlending,
  OrthographicCamera,
  ShaderMaterial,
  UniformsUtils,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Material,
  type Mesh,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';
import { SelectionEdgesPass } from './selection-edges.js';

/** Size of the product in millimetres, as the passes need it. */
export interface Extent {
  W: number;
  H: number;
  D: number;
}

class GroundContact {
  dirty = true;
  span = 3;
  camera = new OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.001, 0.42);
  target = new WebGLRenderTarget(512, 512);
  blurTarget = new WebGLRenderTarget(512, 512, { depthBuffer: false });
  contactTarget: WebGLRenderTarget;
  broadTarget: WebGLRenderTarget;
  castTarget: WebGLRenderTarget;
  contactSteps = [0.012, 0.006];
  broadSteps = [0.055, 0.025];
  castSteps = [0.065, 0.03];
  // Light arrives from above / front-left: actual mesh triangles are projected onto the ground.
  castSlope = new Vector2(0.16, -0.28);
  material: ShaderMaterial;
  castMaterial: ShaderMaterial;
  h: ShaderMaterial;
  v: ShaderMaterial;
  combine: ShaderMaterial;
  quad = new FullScreenQuad();

  constructor(
    public scene: Scene,
    public floor: Mesh,
  ) {
    this.camera.position.set(0, -0.012, 0);
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(0, 1, 0);
    this.contactTarget = this.blurTarget.clone();
    this.broadTarget = this.blurTarget.clone();
    this.castTarget = this.blurTarget.clone();
    this.material = new ShaderMaterial({
      side: DoubleSide,
      toneMapped: false,
      vertexShader: `varying float heightAboveFloor; void main(){vec4 world=modelMatrix*vec4(position,1.0);heightAboveFloor=world.y;gl_Position=projectionMatrix*viewMatrix*world;}`,
      fragmentShader: `varying float heightAboveFloor; void main(){float a=1.0-smoothstep(0.0,0.38,max(0.0,heightAboveFloor));gl_FragColor=vec4(vec3(1.0),a);}`,
    });
    this.castMaterial = new ShaderMaterial({
      side: DoubleSide,
      toneMapped: false,
      blending: NoBlending,
      uniforms: { castSlope: { value: this.castSlope } },
      vertexShader: `uniform vec2 castSlope;void main(){vec4 world=modelMatrix*vec4(position,1.0);
    world.xz+=castSlope*max(0.0,world.y);world.y=0.0;
    gl_Position=projectionMatrix*viewMatrix*world;}`,
      fragmentShader: `void main(){gl_FragColor=vec4(1.0);}`,
    });
    this.h = new ShaderMaterial({ ...HorizontalBlurShader, uniforms: UniformsUtils.clone(HorizontalBlurShader.uniforms), depthTest: false, depthWrite: false, blending: NoBlending });
    this.v = new ShaderMaterial({ ...VerticalBlurShader, uniforms: UniformsUtils.clone(VerticalBlurShader.uniforms), depthTest: false, depthWrite: false, blending: NoBlending });
    this.combine = new ShaderMaterial({
      uniforms: {
        contactMap: { value: this.contactTarget.texture },
        broadMap: { value: this.broadTarget.texture },
        castMap: { value: this.castTarget.texture },
        contactStrength: { value: 0.5 },
        broadStrength: { value: 0.52 },
        castStrength: { value: 0.36 },
      },
      vertexShader: HorizontalBlurShader.vertexShader,
      fragmentShader: `varying vec2 vUv;uniform sampler2D contactMap;uniform sampler2D broadMap;uniform sampler2D castMap;uniform float contactStrength;uniform float broadStrength;uniform float castStrength;
    void main(){float contact=texture2D(contactMap,vUv).a*contactStrength;float broad=texture2D(broadMap,vUv).a*broadStrength;
     float castAlpha=texture2D(castMap,vUv).a*castStrength;
     gl_FragColor=vec4(vec3(1.0),1.0-(1.0-contact)*(1.0-broad)*(1.0-castAlpha));}`,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      toneMapped: false,
    });
    this.target.texture.repeat.y = -1;
    this.target.texture.offset.y = 1;
    (floor.material as Material).dispose();
    floor.material = new MeshBasicMaterial({ map: this.target.texture, color: 0x655e50, transparent: true, opacity: 1, depthWrite: false, toneMapped: false });
  }

  update(data: Extent) {
    // Fit the entire cast silhouette plus its blur support for tall products.
    const h = data.H / 1000,
      pad = 4 * this.castSteps.reduce((a, b) => a + b, 0) + 0.03;
    this.span = Math.max(Math.max(data.W, data.D) / 1000 + 1.5, data.W / 1000 + 2 * (Math.abs(this.castSlope.x) * h + pad), data.D / 1000 + 2 * (Math.abs(this.castSlope.y) * h + pad));
    // Frustum culling uses the mesh bounds before the projection shader: the roof is included as well as the base.
    const half = this.span / 2;
    Object.assign(this.camera, { left: -half, right: half, top: half, bottom: -half, far: Math.max(0.42, h + 0.1) });
    this.camera.updateProjectionMatrix();
    // The floor belongs to the presentation only, never to the meshes and ids of the product.
    this.floor.scale.set(this.span / 200, this.span / 200, 1);
    this.dirty = true;
  }

  render(renderer: WebGLRenderer, meshes: Mesh[]) {
    if (!this.dirty) return;
    this.dirty = false;
    const scene = this.scene,
      save = { background: scene.background, override: scene.overrideMaterial, target: renderer.getRenderTarget(), autoClear: renderer.autoClear, shadow: renderer.shadowMap.enabled, color: renderer.getClearColor(new Color()), alpha: renderer.getClearAlpha() };
    const hidden: [Object3D, boolean][] = [],
      own = new Set<Object3D>(meshes);
    for (const child of scene.children)
      if (!own.has(child)) {
        hidden.push([child, child.visible]);
        child.visible = false;
      }
    for (const mesh of meshes)
      mesh.traverse((n) => {
        // Lines and the figures of the hardware of «Рентген» (FINDINGS 970) leave no footprint on the floor.
        if ((n as { isLine?: boolean }).isLine || n.userData.holes) {
          hidden.push([n, n.visible]);
          n.visible = false;
        }
      });
    try {
      scene.background = null;
      scene.overrideMaterial = this.material;
      renderer.autoClear = true;
      renderer.shadowMap.enabled = false;
      renderer.setRenderTarget(this.target);
      renderer.setClearColor(0xffffff, 0);
      renderer.clear();
      renderer.render(scene, this.camera);
      scene.overrideMaterial = null;
      // Both layers start from the same footprint; broadening a second copy keeps the tight grounding shadow.
      for (const [steps, destination] of [
        [this.contactSteps, this.contactTarget],
        [this.broadSteps, this.broadTarget],
        [this.castSteps, this.castTarget],
      ] as [number[], WebGLRenderTarget][]) {
        if (destination === this.castTarget) {
          scene.overrideMaterial = this.castMaterial;
          renderer.setRenderTarget(this.target);
          renderer.clear();
          renderer.render(scene, this.camera);
          scene.overrideMaterial = null;
        }
        let source: Texture = this.target.texture;
        for (const worldStep of steps) {
          this.h.uniforms.tDiffuse.value = source;
          this.h.uniforms.h.value = worldStep / this.span;
          this.quad.material = this.h;
          renderer.setRenderTarget(this.blurTarget);
          renderer.clear();
          this.quad.render(renderer);
          this.v.uniforms.tDiffuse.value = this.blurTarget.texture;
          this.v.uniforms.v.value = worldStep / this.span;
          this.quad.material = this.v;
          renderer.setRenderTarget(destination);
          renderer.clear();
          this.quad.render(renderer);
          source = destination.texture;
        }
      }
      // The raw footprint is no longer needed; its target takes the final map.
      this.quad.material = this.combine;
      renderer.setRenderTarget(this.target);
      renderer.clear();
      this.quad.render(renderer);
    } finally {
      scene.background = save.background;
      scene.overrideMaterial = save.override;
      for (const [n, v] of hidden) n.visible = v;
      renderer.autoClear = save.autoClear;
      renderer.shadowMap.enabled = save.shadow;
      renderer.setClearColor(save.color, save.alpha);
      renderer.setRenderTarget(save.target);
    }
  }

  dispose() {
    for (const t of [this.target, this.blurTarget, this.contactTarget, this.broadTarget, this.castTarget]) t.dispose();
    for (const m of [this.material, this.castMaterial, this.h, this.v, this.combine]) m.dispose();
    this.quad.dispose();
  }
}

/** Halton sequence in [0, 1): the sub-pixel shifts of the accumulated frames, spread evenly over the pixel. */
function halton(index: number, base: number): number {
  let result = 0,
    f = 1;
  for (let i = index; i > 0; i = Math.floor(i / base)) {
    f /= base;
    result += f * (i % base);
  }
  return result;
}

const QUAD_VERTEX = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';

/**
 * Smoothing of the still picture (owner 2026-10-27, FINDINGS 1990): the studio frame drawn again with the camera shifted
 * by a fraction of a pixel and averaged with the frames before it, so an edge is covered by many samples instead of the
 * 4 of MSAA. Frame 0 is not shifted; frame k carries weight 1 / (k + 1), so after N frames each counts 1 / N.
 */
class Accumulation {
  targets = [new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false }), new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false })];
  mix = new ShaderMaterial({
    uniforms: { tPrevious: { value: null }, tSample: { value: null }, weight: { value: 1 } },
    vertexShader: QUAD_VERTEX,
    fragmentShader: 'varying vec2 vUv;uniform sampler2D tPrevious;uniform sampler2D tSample;uniform float weight;void main(){gl_FragColor=mix(texture2D(tPrevious,vUv),texture2D(tSample,vUv),weight);}',
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  // The output pass already wrote premultiplied sRGB: the canvas gets it as it is.
  copy = new ShaderMaterial({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: QUAD_VERTEX,
    fragmentShader: 'varying vec2 vUv;uniform sampler2D tDiffuse;void main(){gl_FragColor=texture2D(tDiffuse,vUv);}',
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  quad = new FullScreenQuad();

  setSize(w: number, h: number) {
    for (const t of this.targets) t.setSize(w, h);
  }

  /** Adds frame `index` (its picture in `sample`) to the average and shows the average on the canvas. */
  add(renderer: WebGLRenderer, sample: Texture, index: number) {
    const [previous, next] = this.targets;
    this.mix.uniforms.tPrevious.value = previous.texture;
    this.mix.uniforms.tSample.value = sample;
    this.mix.uniforms.weight.value = 1 / (index + 1);
    this.quad.material = this.mix;
    renderer.setRenderTarget(next);
    this.quad.render(renderer);
    this.copy.uniforms.tDiffuse.value = next.texture;
    this.quad.material = this.copy;
    renderer.setRenderTarget(null);
    this.quad.render(renderer);
    this.targets = [next, previous];
  }

  dispose() {
    for (const t of this.targets) t.dispose();
    this.mix.dispose();
    this.copy.dispose();
    this.quad.dispose();
  }
}

export class StudioEffects {
  enabled = true;
  /** «Рентген»: no surfaces to darken, and the selection is drawn by the view as vector lines. */
  xray = false;
  ground: GroundContact;
  composer: EffectComposer;
  beauty: RenderPass;
  ao: SSAOPass;
  outline: SelectionEdgesPass;
  output: OutputPass;
  // Made at the first smoothing, not with the passes: its objects draw ids from Math.random, and the SSAO kernel and
  // noise that follow must stay those of r1 (the checks seed Math.random).
  accumulation: Accumulation | null = null;
  /** Size of the passes in physical pixels: the canvas size exactly (FINDINGS 1991). */
  width = 1;
  height = 1;

  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    public camera: PerspectiveCamera,
    floor: Mesh,
  ) {
    this.ground = new GroundContact(scene, floor);
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples) });
    this.composer = new EffectComposer(renderer, target);
    // Sized in physical pixels by the view, so the passes match the canvas exactly (FINDINGS 1991).
    this.composer.setPixelRatio(1);
    // Transparent beauty background bypasses ACES; the warm host surface supplies it.
    this.beauty = new RenderPass(scene, camera, undefined, new Color(0x000000), 0);
    this.ao = new SSAOPass(scene, camera, 1, 1, 32);
    this.ao.kernelRadius = 0.065;
    // Small contact detail only; cavity gradients come from the baked ambient light.
    this.ao.ssaoMaterial.fragmentShader = this.ao.ssaoMaterial.fragmentShader.replace('1.0 - occlusion', '1.0 - 0.30 * occlusion');
    this.outline = new SelectionEdgesPass(camera, renderer.getPixelRatio());
    this.output = new OutputPass();
    // Beauty RGB is premultiplied by coverage: tone mapping and sRGB work on straight RGB, then return premultiplied
    // RGB to the canvas, otherwise partially covered edges turn white against the CSS background.
    this.output.material.fragmentShader = this.output.material.fragmentShader
      .replace(
        'gl_FragColor = texture2D( tDiffuse, vUv );',
        `gl_FragColor = texture2D( tDiffuse, vUv );
    gl_FragColor.a = clamp(gl_FragColor.a, 0.0, 1.0);
    gl_FragColor.rgb = gl_FragColor.a > 0.00001 ? gl_FragColor.rgb / gl_FragColor.a : vec3(0.0);`,
      )
      .replace(/}\s*$/, 'gl_FragColor.rgb *= gl_FragColor.a;\n}');
    for (const pass of [this.beauty, this.ao, this.output, this.outline]) this.composer.addPass(pass);
  }

  /** Size of the canvas in physical pixels. */
  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.composer.setSize(w, h);
    this.accumulation?.setSize(w, h);
  }

  /**
   * Frame `index` of the smoothing of the still picture (FINDINGS 1990): the studio frame with the camera shifted by a
   * fraction of a pixel (frame 0 — not shifted), added to the average shown on the canvas.
   */
  accumulate(scene: Scene, meshes: Mesh[], outline: Object3D | null, index: number) {
    const camera = this.camera,
      dx = index ? halton(index, 2) - 0.5 : 0,
      dy = index ? halton(index, 3) - 0.5 : 0;
    camera.setViewOffset(this.width, this.height, dx, dy, this.width, this.height);
    this.composer.renderToScreen = false;
    try {
      this.render(scene, camera, meshes, outline, false);
    } finally {
      this.composer.renderToScreen = true;
      camera.clearViewOffset();
    }
    if (!this.accumulation) {
      this.accumulation = new Accumulation();
      this.accumulation.setSize(this.width, this.height);
    }
    this.accumulation.add(this.composer.renderer, this.composer.readBuffer.texture, index);
  }

  update(data: Extent) {
    this.ground.update(data);
  }

  render(scene: Scene, camera: Camera & { near: number; far: number; projectionMatrix: PerspectiveCamera['projectionMatrix']; projectionMatrixInverse: PerspectiveCamera['projectionMatrixInverse'] }, meshes: Mesh[], outline: Object3D | null, moving: boolean) {
    const renderer = this.composer.renderer;
    if (moving) this.ground.dirty = true;
    this.ground.render(renderer, meshes);
    this.ao.enabled = this.enabled && !this.xray; // the selection stays available with soft lighting off
    const u = this.ao.ssaoMaterial.uniforms,
      range = camera.far - camera.near;
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;
    u.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
    u.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
    this.ao.minDistance = 0.002 / range;
    this.ao.maxDistance = 0.1 / range;
    const selectedEdges: Object3D[] = [],
      hidden: [Object3D, boolean][] = [];
    for (const edge of outline?.children || [])
      if (edge.userData.followMesh) {
        selectedEdges.push(edge);
        hidden.push([edge, edge.visible]);
        edge.visible = false;
      }
    // In «Рентген» the selection is drawn with its vector lines (FINDINGS 1995).
    this.outline.setSelection(this.xray ? [] : meshes, this.xray ? [] : selectedEdges);
    const background = scene.background;
    try {
      scene.background = null;
      this.composer.render();
    } finally {
      scene.background = background;
      for (const [n, v] of hidden) n.visible = v;
    }
  }

  dispose() {
    this.ground.dispose();
    this.accumulation?.dispose();
    for (const p of this.composer.passes) p.dispose?.();
    this.composer.dispose();
  }
}
