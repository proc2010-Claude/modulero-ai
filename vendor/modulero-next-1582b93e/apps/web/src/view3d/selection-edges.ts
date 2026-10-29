// Outline of the selected part (selection-edges.js of r1, unchanged in behaviour): model geometry, not a blurred
// silhouette. The visible edges are drawn over the picture, the hidden ones fainter; the depth of all meshes decides.
import {
  Color,
  GreaterDepth,
  LessEqualDepth,
  Mesh,
  MeshBasicMaterial,
  NoBlending,
  NormalBlending,
  Scene,
  ShaderMaterial,
  Vector4,
  WebGLRenderTarget,
  DoubleSide,
  type Camera,
  type DepthModes,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

export class SelectionEdgesPass extends Pass {
  occluders = new Map<Mesh, Mesh>();
  edges = new Map<Object3D, { geometry: LineSegmentsGeometry; lines: LineSegments2[] }>();
  selectedObjects: Mesh[] = [];
  viewport = new Vector4();
  depthScene = new Scene();
  edgeScene = new Scene();
  target = new WebGLRenderTarget(1, 1, { depthBuffer: true });
  // Offset only the selection depth test, never the visible geometry.
  depthMaterial = new MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  visibleMaterial: LineMaterial;
  hiddenMaterial: LineMaterial;
  overlayMaterial: ShaderMaterial;
  quad: FullScreenQuad;

  constructor(
    public camera: Camera,
    public pixelRatio = 1,
  ) {
    super();
    this.enabled = false;
    this.visibleMaterial = this.lineMaterial(1.2, 0.95, LessEqualDepth);
    this.hiddenMaterial = this.lineMaterial(0.65, 0.5, GreaterDepth);
    this.overlayMaterial = new ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tEdges: { value: this.target.texture } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `varying vec2 vUv;uniform sampler2D tDiffuse;uniform sampler2D tEdges;
    void main(){vec4 base=texture2D(tDiffuse,vUv),edge=texture2D(tEdges,vUv);gl_FragColor=edge+base*(1.0-edge.a);}`,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new FullScreenQuad(this.overlayMaterial);
  }

  lineMaterial(cssWidth: number, opacity: number, depthFunc: DepthModes): LineMaterial {
    const m = new LineMaterial({ worldUnits: false, transparent: true, opacity, depthTest: true, depthWrite: false, depthFunc, toneMapped: false, blending: NormalBlending });
    m.color.setRGB(81 / 255, 70 / 255, 184 / 255);
    m.userData.cssWidth = cssWidth;
    m.uniforms.strokeWidth = { value: cssWidth * this.pixelRatio };
    // The extra physical pixel is antialiasing coverage, not a thicker stroke.
    m.linewidth = cssWidth * this.pixelRatio + 1;
    m.fragmentShader = `varying vec2 vUv;uniform vec3 diffuse;uniform float opacity;uniform float linewidth;uniform float strokeWidth;
   void main(){vec2 q=vec2(vUv.x,max(abs(vUv.y)-1.0,0.0));float distancePx=length(q)*linewidth*.5;
    float coverage=clamp(.5+.5*strokeWidth-distancePx,0.0,1.0);if(coverage<=0.0)discard;
    gl_FragColor=vec4(diffuse,opacity*coverage);}`;
    return m;
  }

  setSize(w: number, h: number) {
    this.target.setSize(w, h);
    for (const m of [this.visibleMaterial, this.hiddenMaterial]) m.resolution.set(w, h);
  }

  /** Occluders: every mesh of the product; sourceEdges: the outline lines, each following its mesh. */
  setSelection(meshes: Mesh[], sourceEdges: Object3D[]) {
    const active = new Set(meshes);
    for (const [source, proxy] of this.occluders)
      if (!active.has(source)) {
        this.depthScene.remove(proxy);
        this.occluders.delete(source);
      }
    for (const source of meshes) {
      let proxy = this.occluders.get(source);
      if (!proxy) {
        proxy = new Mesh(source.geometry, this.depthMaterial);
        proxy.matrixAutoUpdate = false;
        this.depthScene.add(proxy);
        this.occluders.set(source, proxy);
      }
      proxy.geometry = source.geometry;
      source.updateWorldMatrix(true, false);
      proxy.matrix.copy(source.matrixWorld);
      proxy.visible = source.visible;
    }
    const wanted = new Set(sourceEdges);
    for (const [source, pair] of this.edges)
      if (!wanted.has(source)) {
        this.edgeScene.remove(...pair.lines);
        pair.geometry.dispose();
        this.edges.delete(source);
      }
    const selected: Mesh[] = [];
    for (const source of sourceEdges) {
      const mesh = source.userData.followMesh as Mesh | undefined;
      if (!mesh) continue;
      let pair = this.edges.get(source);
      if (!pair) {
        const geometry = new LineSegmentsGeometry().setPositions(new Float32Array(((source as Mesh).geometry.attributes.position.array as Float32Array)));
        const hidden = new LineSegments2(geometry, this.hiddenMaterial),
          visible = new LineSegments2(geometry, this.visibleMaterial);
        hidden.renderOrder = 0;
        visible.renderOrder = 1;
        pair = { geometry, lines: [hidden, visible] };
        for (const line of pair.lines) {
          line.matrixAutoUpdate = false;
          line.frustumCulled = false;
          // LineSegments2 reads the logical canvas viewport; this pass renders into a physical-pixel target.
          line.onBeforeRender = (renderer) => {
            renderer.getCurrentViewport(this.viewport);
            (line.material as LineMaterial).resolution.set(this.viewport.z, this.viewport.w);
          };
          this.edgeScene.add(line);
        }
        this.edges.set(source, pair);
      }
      mesh.updateWorldMatrix(true, false);
      for (const line of pair.lines) {
        line.matrix.copy(mesh.matrixWorld);
        line.visible = mesh.visible;
      }
      if (mesh.visible) selected.push(mesh);
    }
    this.selectedObjects = selected;
    this.enabled = selected.length > 0;
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget) {
    const save = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear, color: renderer.getClearColor(new Color()), alpha: renderer.getClearAlpha(), shadow: renderer.shadowMap.enabled };
    try {
      // Current camera every frame: turning the product never drops the selection.
      this.camera.updateMatrixWorld(true);
      renderer.autoClear = false;
      renderer.shadowMap.enabled = false;
      renderer.setRenderTarget(this.target);
      renderer.setClearColor(0, 0);
      renderer.clear(true, true, true);
      renderer.render(this.depthScene, this.camera);
      renderer.render(this.edgeScene, this.camera);
      this.overlayMaterial.uniforms.tDiffuse.value = readBuffer.texture;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      this.quad.render(renderer);
    } finally {
      renderer.setRenderTarget(save.target);
      renderer.setClearColor(save.color, save.alpha);
      renderer.autoClear = save.autoClear;
      renderer.shadowMap.enabled = save.shadow;
    }
  }

  dispose() {
    for (const pair of this.edges.values()) pair.geometry.dispose();
    this.edges.clear();
    this.occluders.clear();
    this.target.dispose();
    this.depthMaterial.dispose();
    this.visibleMaterial.dispose();
    this.hiddenMaterial.dispose();
    this.overlayMaterial.dispose();
    this.quad.dispose();
  }
}
