// The 3D view of every product (task V1): the visual layer of r1 (`CabinetView` of visual-entry.js) on the scene of
// the graph (`engine.sceneOf`). Kept as in r1 (MOD-DEC-324): renderer settings, camera and controls, room environment,
// the five directional lights with their shadows, floor shadow, SSAO, baked ambient and window light, selection
// outline without false seams, surface materials and the «назначенный / нейтральный» modes, translucent fronts,
// «Вписать». Changed underneath:
//   - geometry only from the placement and size (or contour) of the graph parts, no product formulas;
//   - a mesh carries the graph part id; an edit rebuilds only the meshes of added and changed parts (stable ids),
//     equal shapes share one geometry;
//   - the baked light is computed again only near the changed parts (ambient.ts), the other parts keep it, so the
//     quick frame after an edit is already mostly the studio picture;
//   - no patches inside Three.js: shader preparation (readiness.ts) and gesture cancelling (gestures.ts) are our own
//     layers over the stock API; a lost WebGL context is restored;
//   - doors and drawers open by the motions of the graph (task V2, motion.ts), as `applyMotion` of r1; the leaves of a
//     sliding wardrobe move along their tracks (MOD-DEC-184, 571) by the rules of the core;
//   - «Рентген» (owner 2026-10-22): no surfaces, no shadows, only the opaque edges of every part, none hidden;
//   - «Взрыв» of «Рентген» (owner 2026-10-23): the parts move apart by the moves of the core (engine.explodeOffsets),
//     smoothly, and come back; only the picture moves;
//   - the holes of the graph and the hardware in them in «Рентген» (owner 2026-10-24, FINDINGS 970): the outline of
//     each drilled hole, the hardware as a plain figure filling it; both belong to their part and move with it;
//   - the lines of «Рентген» as vectors (owner 2026-10-27, FINDINGS 1995): the edges, holes and selection are projected
//     and stroked by the 2D canvas over the picture (xray-lines.ts), as in a PDF;
//   - the models of the catalogue (MOD-DEC-536, FINDINGS 1085): the file of an item, loaded when a scene names it and
//     checked by its sha256, is drawn instead of the parametric model of its mechanism; without it — the parametric one.
import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Float32BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  HemisphereLight,
  LinearFilter,
  LinearMipmapLinearFilter,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Matrix3,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MOUSE,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  RepeatWrapping,
  Scene,
  ShadowMaterial,
  Spherical,
  SRGBColorSpace,
  TextureLoader,
  TOUCH,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
  type WebGLRenderTarget,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { engine } from '@modulero/core';
import { panelGeometry, technicalGeometry, type SurfaceMap, type TechnicalBox } from './geometry.js';
import { StudioEffects, type Extent } from './effects.js';
import { XrayLines } from './xray-lines.js';
import { ModelAmbient } from './ambient.js';
import { prepareBeauty } from './readiness.js';
import { GestureLayer } from './gestures.js';
import { eased, MotionState, type SlideRules } from './motion.js';

type Scene3d = engine.Scene3d;
type ScenePart = engine.ScenePart;
type SceneHardware = engine.SceneHardware;
type SceneModel = engine.SceneModel;
type SceneHole = engine.SceneHole;
type Vec3 = engine.Vec3;

/** How a decor looks: a colour, or an image of the decor loaded when a part shows it. */
export interface DecorLook {
  color: number;
  texture?: string | null;
}

export interface ViewOptions {
  materials?: 'assigned' | 'neutral';
  /** Look of a decor id of the graph; unknown decors are drawn in the neutral board colour of r1. */
  decor?: (decorId: string) => DecorLook | null;
  /**
   * Size (CSS px) to draw at while the host is not in the page: the view prepared in the background (view3d-host.ts)
   * draws the product off the page at the size the 3D will have, so its programs, shadows and baked light are ready.
   */
  size?: { width: number; height: number };
  /** The moves of «Взрыв» from the core (engine.explodeOffsets, engine.explodeLift); left out — no «Взрыв». */
  explode?: {
    offsets: (scene: Scene3d) => Map<string, Vec3>;
    lift: (scene: Scene3d, offsets: ReadonlyMap<string, Vec3>, level: number) => number;
  };
  /**
   * The models of the catalogue (MOD-DEC-536): the core puts a point of a file into its box (engine.modelLocal…), `url`
   * gives the address of a file or null — none is loaded. Left out — every item is drawn by its parametric model.
   */
  /** The rules of the leaves of a sliding wardrobe from the core (MOD-DEC-571); left out — the leaves stay closed. */
  slides?: SlideRules;
  models?: {
    local: (m: SceneModel, p: Vec3) => Vec3;
    direction: (m: SceneModel, d: Vec3) => Vec3;
    mirrored: (m: SceneModel) => boolean;
    url: (file: string) => string | null;
  };
}

/** What is shown besides the parts: fronts, translucent fronts, the selected part ids. */
export interface Display {
  fronts?: boolean;
  translucent?: boolean;
  selectedIds?: string[];
  /** The neutral tone instead of the assigned materials; left out — the mode stays as it is. */
  neutral?: boolean;
  /** «Рентген»: the surfaces are not drawn, the edges of every part are, through the others; no shadows. */
  xray?: boolean;
  /** «Взрыв» of «Рентген»: the share 0 … 1 of the full spread of the parts; 0 or left out — assembled. */
  explode?: number;
}

export type Select = (part: ScenePart | null, normal: Vector3 | null, point: Vector3 | null) => void;

interface PartMesh extends Mesh {
  userData: {
    id: string;
    part: ScenePart;
    key: string;
    facade: boolean;
    ownMaterial?: boolean;
    surface: string;
    /** Where the part stands closed (its graph placement); a door or drawer moves from here. */
    closed?: { position: Vector3; quaternion: Quaternion };
  };
}

/** A model of hardware (MOD-DEC-432, task FIT): not a part — not picked, not in the part list, moves with its host. */
interface HardwareMesh extends Mesh {
  userData: {
    /** A prism of the visuals of a mechanism, or the model of the catalogue that replaces them. */
    hardware: SceneHardware | SceneModel;
    /** Its place relative to the closed host; null — it stands in the product. */
    local: Matrix4 | null;
  };
}

/** Colours of the finishes of hardware: metal of r1 (metalMaterial), black and white plastic (Д, FINDINGS 727), graphite of the baskets and pantographs (Д, MOD-DEC-484). */
const HARDWARE_PLASTIC = { BLACK: { color: 0x26272a, roughness: 0.55, metalness: 0.15 }, WHITE: { color: 0xf1f0ec, roughness: 0.6, metalness: 0 }, GRAPHITE: { color: 0x4a4c50, roughness: 0.5, metalness: 0.3 } } as const;
/** The anodised profiles of the sliding doors in their colour (MOD-AI-24, FINDINGS 2956): matt metal tones (Д), lighter than the metal of the other hardware; white gloss — a smooth enamel. */
const HARDWARE_ANODISED = {
  SILVER: { color: 0xc3c6ca, roughness: 0.38, metalness: 0.75 },
  GOLD: { color: 0xc8a55a, roughness: 0.38, metalness: 0.8 },
  CHAMPAGNE: { color: 0xcdb892, roughness: 0.4, metalness: 0.75 },
  BRONZE: { color: 0x8c6a48, roughness: 0.42, metalness: 0.75 },
  WHITE_GLOSS: { color: 0xf5f5f3, roughness: 0.18, metalness: 0 },
} as const;

/** Milliseconds of the stroke of «Взрыв», from assembled to the full spread (Д, FINDINGS 673). */
export const EXPLODE_MS = 700;

/** The share of the diameter of a hole that the figure of its hardware fills, so the outline of the hole stays seen (Д, FINDINGS 971). */
export const HARDWARE_FILL = 0.84;
/** Segments of the outline of a hole and of the figure of its hardware (Д). */
const HOLE_SEGMENTS = 16;
const HARDWARE_SEGMENTS = 12;
/** Stroke widths of the vector lines of «Рентген», CSS pixels: part edges, holes, the selected parts (Д, FINDINGS 1996). */
const XRAY_WIDTH = { edges: 0.9, holes: 0.8, selection: 1.6 };

/** The selection outline (r1). */
const SELECTION = 0x5146b8;

const BOARD = 0xd0cec7; // W960 of r1: the board colour when a decor is not known

// Product axes (X right, Y back, Z up, mm) → world (x right, y up, z to the viewer, metres), centred on the product.
/** The camera of the start, m; «Вписать» keeps its direction to the product. */
const START_CAMERA = new Vector3(2.6, 2.65, 8.5);
const toWorld = (a: Vec3): Vector3 => new Vector3(a[0], a[2], -a[1]);

/** The triangles of every mesh of a glTF scene in the axes of the file: one geometry, three vertices per triangle. */
function fileTriangles(root: Object3D): BufferGeometry {
  root.updateMatrixWorld(true);
  const position: number[] = [],
    normal: number[] = [],
    v = new Vector3(),
    normalMatrix = new Matrix3();
  let withoutNormals = false;
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry,
      pos = g.getAttribute('position'),
      nor = g.getAttribute('normal'),
      index = g.index,
      count = index ? index.count : pos.count;
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    if (!nor) withoutNormals = true;
    for (let i = 0; i < count; i++) {
      const k = index ? index.getX(i) : i;
      v.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld);
      position.push(v.x, v.y, v.z);
      if (nor) v.fromBufferAttribute(nor, k).applyMatrix3(normalMatrix).normalize();
      normal.push(nor ? v.x : 0, nor ? v.y : 0, nor ? v.z : 1);
    }
    g.dispose();
  });
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(position, 3));
  out.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  if (withoutNormals) out.computeVertexNormals();
  return out;
}

const WORLD_AXIS = ['x', 'z', 'y'] as const; // product X, Y (back), Z (up) → world x, z (to the viewer), y
const PART_AXIS = { u: 'x', v: 'y', n: 'z' } as const; // the axes of a part → the axes of its own geometry

/**
 * The box of r1 for a rectangular part whose axes lie along the product axes: its size along the world axes and the
 * surface map of its six faces (n — the faces, u — edges C and D, v — edges A and B). null for a contour or a turn.
 */
export function alignedBox(p: ScenePart): TechnicalBox | null {
  if (p.contourMm) return null;
  const size = { x: 0, y: 0, z: 0 },
    surfaceMap: SurfaceMap = {};
  let grainAxis: string | null = null;
  const axes: [Vec3, number, 'n' | 'u' | 'v'][] = [
    [p.uAxis, p.sizeMm[0], 'u'],
    [p.vAxis, p.sizeMm[1], 'v'],
    [p.nAxis, p.sizeMm[2], 'n'],
  ];
  for (const [vec, length, which] of axes) {
    const i = vec.findIndex((c) => Math.abs(c) === 1);
    if (i < 0 || vec.filter((c) => c !== 0).length !== 1) return null;
    const axis = WORLD_AXIS[i],
      sign = (i === 1 ? -1 : 1) * vec[i],
      plus = (sign > 0 ? '+' : '-') + axis,
      minus = (sign > 0 ? '-' : '+') + axis;
    size[axis] = length;
    // The pattern along the axis of the part the cutting keeps (MOD-AI-25, MOD-DEC-742, FINDINGS 3053).
    if (which === p.grain) grainAxis = axis;
    if (which === 'n') surfaceMap[plus] = surfaceMap[minus] = { kind: 'FACE' };
    else {
      const [low, high] = which === 'u' ? (['C', 'D'] as const) : (['A', 'B'] as const);
      // A band in the decor of the edges (MOD-DEC-483) is ACCENT: the fifth material of the part.
      const intent = (slot: 'A' | 'B' | 'C' | 'D') => (!p.banded[slot] ? 'NONE' : p.edgeDecor?.slots.includes(slot) ? 'ACCENT' : 'BANDED');
      surfaceMap[minus] = { kind: 'EDGE', intent: intent(low) };
      surfaceMap[plus] = { kind: 'EDGE', intent: intent(high) };
    }
  }
  return { width: size.x, height: size.y, thickness: size.z, surfaceMap, grainAxis };
}

function selectionGeometry(geometry: BufferGeometry): BufferGeometry {
  const edges = geometry.userData.featureEdges;
  return Array.isArray(edges) ? new BufferGeometry().setAttribute('position', new Float32BufferAttribute(edges, 3)) : new EdgesGeometry(geometry);
}

export class StudioView {
  host: HTMLElement;
  select: Select;
  options: ViewOptions;
  meshes: PartMesh[] = [];
  byId = new Map<string, PartMesh>();
  /** Models of hardware, rebuilt with each scene (task FIT); their geometries are kept by shape. */
  hardware: HardwareMesh[] = [];
  hardwareGeometries = new Map<string, BufferGeometry>();
  /** The files of the models of the catalogue by `file|sha256`: the triangles of the file, or where its load stands. */
  modelFiles = new Map<string, BufferGeometry | 'loading' | 'failed'>();
  /** A file put into its box (by the shape key of the model and the handedness of the box), in metres. */
  modelGeometries = new Map<string, BufferGeometry>();
  geometries = new Map<string, { geometry: BufferGeometry; refs: number; edges?: BufferGeometry }>();
  scene3d: Scene3d | null = null;
  display: Display = {};
  extent: Extent = { W: 0, H: 0, D: 0 };
  centre = { x: 0, y: 0 };
  mode: 'FIT' | 'MANUAL' = 'FIT';
  appearance: { materials: 'assigned' | 'neutral' };
  stats = {
    frames: 0,
    frameMs: [] as number[],
    buildMs: [] as number[],
    readyMs: null as number | null,
    requestedRevision: 0,
    renderedRevision: 0,
    preparing: false,
    preparationMs: [] as number[],
    preparationErrors: [] as { revision: number; error: string }[],
    parallelCompilation: null as boolean | null,
    rebuilt: [] as { added: number; changed: number; removed: number; kept: number }[],
    contextLost: 0,
    contextRestored: 0,
    /** Frames averaged into the still picture shown now (FINDINGS 1990); 0 — the plain studio frame. */
    accumulated: 0,
    /** The files of the models of the catalogue: asked for, loaded and checked, refused with the reason. */
    models: { requested: 0, loaded: 0, failed: [] as { file: string; reason: string }[] },
    /** Where the time of the view goes (ms): its creation, then each frame — the wait for it, shaders, drawing. */
    phases: {
      /** Running the text of the 3D module (view3d-host.ts), before the view was created. */
      module: null as number | null,
      create: null as { context: number; environment: number; effects: number; total: number } | null,
      frames: [] as { at: number; revision: number; offscreen: boolean; wait: number; ambient: number; prepare: number; draw: number }[],
    },
  };
  presentationOriginal = new WeakMap<Mesh, Material | Material[]>();
  presentationMaterials = new Map<string, MeshStandardMaterial>();
  facadeSources = new WeakMap<Mesh, MeshStandardMaterial[]>();
  materials = new Map<string, MeshStandardMaterial>();
  textures = new Map<string, Texture>();
  renderer!: WebGLRenderer;
  camera!: PerspectiveCamera;
  controls!: OrbitControls;
  three!: Scene;
  env!: WebGLRenderTarget;
  studioLights: DirectionalLight[] = [];
  fillLight!: DirectionalLight;
  floor!: Mesh;
  studio!: StudioEffects;
  ambientModel!: ModelAmbient;
  gestures!: GestureLayer;
  outline: Group | null = null;
  ray = new Raycaster();
  pointer = new Vector2();
  down: { x: number; y: number; id: number; button: number; moved: boolean } | null = null;
  pointers = new Map<number, { x: number; y: number }>();
  observer!: ResizeObserver;
  error: string | null = null;
  lost = false;
  /**
   * Smoothing of the still picture (FINDINGS 1990): `total` frames shifted by fractions of a pixel, one per animation
   * frame after the studio frame, while nothing changes. Off on a software renderer (SwiftShader, llvmpipe): a frame
   * there costs about a second of the processor, and the checks read the plain studio frame.
   */
  accumulation = { enabled: true, software: false, total: 16, revision: -1, index: 0, handle: 0 };
  disposed = false;
  pending = false;
  frameHandle = 0;
  initialized = false;
  activeLease: { release(): void } | null = null;
  programLease: { release(): void } | null = null;
  prepareUnavailable = false;
  wasMoving = false;
  motion = new MotionState();
  /** The front of the product across the screen at «Вписать», CSS px of the host (measureFitSpan). */
  fitSpan: { left: number; width: number } | null = null;
  viewportWidth = 0;
  viewportHeight = 0;
  /** Size to draw at off the page (options.size), until the host is shown with its own size. */
  offscreen: { width: number; height: number } | null = null;
  requestedAt: number | null = null;
  studioBoundsKey = '';
  xray = false;
  // «Рентген»: one material hides every surface (no shadow, no ground contact), one draws the edges over everything.
  // Made at the first use: an object made earlier would shift the ids of the studio and so its picture.
  xrayLook: { hidden: MeshBasicMaterial; line: LineBasicMaterial; hole: LineBasicMaterial; metal: MeshBasicMaterial; wood: MeshBasicMaterial } | null = null;
  /** The vector lines of «Рентген» over the picture, while it is on (FINDINGS 1995). */
  xrayLines: XrayLines | null = null;
  /** The holes of the shown scene by part id, for «Рентген». */
  holesOf: { scene: Scene3d; byPart: Map<string, SceneHole[]> } | null = null;
  /** «Взрыв»: the share shown now, the stroke it is on (from → to since start), the moves of the scene at full spread. */
  explode = { value: 0, from: 0, to: 0, start: 0 };
  explodeMoves: { scene: Scene3d; offsets: Map<string, Vec3> } | null = null;
  /** While «Взрыв» frames the camera inside a frame: the controls do not ask for another one. */
  quietCamera = false;
  private statusNode: HTMLElement | null = null;

  constructor(host: HTMLElement, select: Select, options: ViewOptions = {}) {
    this.host = host;
    this.select = select;
    this.options = options;
    this.motion.rules = options.slides ?? null;
    this.appearance = { materials: options.materials === 'neutral' ? 'neutral' : 'assigned' };
    this.offscreen = options.size?.width && options.size.height ? { ...options.size } : null;
    const started = performance.now();
    let environmentAt = started,
      effectsAt = started;
    try {
      const r = (this.renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }));
      r.setPixelRatio(Math.min(devicePixelRatio, 2));
      const gl = r.getContext(),
        info = gl.getExtension('WEBGL_debug_renderer_info'),
        rendererName = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      this.accumulation.software = /swiftshader|llvmpipe|softpipe|software/i.test(rendererName);
      this.accumulation.enabled = !this.accumulation.software;
      r.outputColorSpace = SRGBColorSpace;
      r.toneMapping = ACESFilmicToneMapping;
      r.toneMappingExposure = 1.0;
      r.shadowMap.enabled = true;
      r.shadowMap.type = PCFShadowMap;
      r.shadowMap.autoUpdate = false;
      host.append(r.domElement);
      r.domElement.setAttribute('aria-label', 'Модель изделия 3D: вращение, перенос и масштаб');
      r.domElement.tabIndex = 0;
      this.three = new Scene();
      this.three.background = new Color(0xf7f5f0);
      r.setClearColor(0xf7f5f0, 1);
      this.camera = new PerspectiveCamera(22, 1, 0.03, 100);
      this.camera.position.copy(START_CAMERA);
      this.controls = new OrbitControls(this.camera, r.domElement);
      this.controls.enableDamping = false;
      this.controls.screenSpacePanning = true;
      this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
      this.controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
      this.controls.addEventListener('start', () => (this.mode = 'MANUAL'));
      this.controls.addEventListener('change', () => this.quietCamera || this.request());
      environmentAt = performance.now();
      const pmrem = new PMREMGenerator(r),
        room = new RoomEnvironment();
      this.env = pmrem.fromScene(room, 0.04);
      this.three.environment = this.env.texture;
      room.dispose();
      pmrem.dispose();
      // The light of r1 (C08): high key lights give form, a lower front-left fill reaches the back and casts shadows.
      this.three.environmentIntensity = 0.45;
      this.three.add(new HemisphereLight(0xfffdf8, 0xd3cec3, 0.8));
      for (const [x, z] of [
        [-1.1, -0.8],
        [1.1, -0.8],
        [-1.1, 0.8],
        [1.1, 0.8],
      ]) {
        const light = new DirectionalLight(0xfffaf3, 0.48);
        light.position.set(-1.4 + x, 8, 2.8 + z);
        light.castShadow = true;
        light.shadow.mapSize.set(2048, 2048);
        light.shadow.intensity = 0.46;
        light.shadow.radius = 4;
        Object.assign(light.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.1, far: 25 });
        light.shadow.bias = -0.00001;
        light.shadow.normalBias = 0.0005;
        this.three.add(light, light.target);
        this.studioLights.push(light);
      }
      const fill = new DirectionalLight(0xfffaf3, 0.309);
      fill.position.set(-3, 3, 7.5);
      fill.castShadow = true;
      fill.shadow.mapSize.set(2048, 2048);
      fill.shadow.intensity = 0.82;
      fill.shadow.radius = 18;
      Object.assign(fill.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.1, far: 25 });
      fill.shadow.bias = -0.00001;
      fill.shadow.normalBias = 0.0005;
      this.fillLight = fill;
      this.three.add(fill, fill.target);
      this.floor = new Mesh(new PlaneGeometry(200, 200), new ShadowMaterial({ color: 0x635e53, opacity: 0.22 }));
      this.floor.rotation.x = -Math.PI / 2;
      this.floor.position.y = -0.002;
      this.floor.receiveShadow = true;
      this.three.add(this.floor);
      effectsAt = performance.now();
      this.studio = new StudioEffects(r, this.three, this.camera, this.floor);
      this.ambientModel = new ModelAmbient(
        () => this.request(),
        (text) => host.dispatchEvent(new CustomEvent('lightingstatus', { detail: { text } })),
      );
      this.ambientModel.startPool();
      const el = r.domElement;
      el.addEventListener('webglcontextlost', this.onContextLost);
      el.addEventListener('webglcontextrestored', this.onContextRestored);
      this.gestures = new GestureLayer(el, this.controls, (reason, pointerId) => {
        if (pointerId === undefined) {
          this.pointers.clear();
          this.down = null;
        } else {
          this.pointers.delete(pointerId);
          if (this.down?.id === pointerId) this.down = null;
        }
        host.dispatchEvent(new CustomEvent('gesturecancel', { detail: { reason, pointerId } }));
      });
      // A click picks a part: not a gesture (moved ≤ 5 px), in the bubbling phase, the controls get every event.
      el.addEventListener('pointerdown', (e) => {
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.down = this.pointers.size > 1 ? null : { x: e.clientX, y: e.clientY, id: e.pointerId, button: e.button, moved: false };
      });
      el.addEventListener('pointermove', (e) => {
        if (this.down?.id === e.pointerId && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) this.down.moved = true;
      });
      el.addEventListener('pointerup', (e) => {
        const d = this.down;
        this.pointers.delete(e.pointerId);
        if (d?.id === e.pointerId) this.down = null;
        if (e.isTrusted && d && !d.moved && d.button === 0 && d.id === e.pointerId && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 5) this.pick(e);
      });
      el.addEventListener('keydown', (e) => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          e.preventDefault();
          const off = this.camera.position.clone().sub(this.controls.target),
            s = new Spherical().setFromVector3(off);
          s.theta += e.key === 'ArrowLeft' ? -0.08 : e.key === 'ArrowRight' ? 0.08 : 0;
          s.phi += e.key === 'ArrowUp' ? -0.05 : e.key === 'ArrowDown' ? 0.05 : 0;
          s.makeSafe();
          this.camera.position.copy(this.controls.target).add(new Vector3().setFromSpherical(s));
          this.mode = 'MANUAL';
          this.controls.update();
          this.request();
        }
        if (e.key === '+' || e.key === '=') this.zoom(1.2);
        if (e.key === '-') this.zoom(1 / 1.2);
      });
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(host);
      if (this.offscreen) this.resize();
      const now = performance.now();
      this.stats.readyMs = now - started;
      this.stats.phases.create = { context: environmentAt - started, environment: effectsAt - environmentAt, effects: now - effectsAt, total: now - started };
    } catch (e) {
      this.error = String(e);
      host.replaceChildren(Object.assign(document.createElement('p'), { role: 'status', textContent: '3D недоступен. Используйте вид спереди; редактирование и документы доступны.' }));
    }
  }

  // ---------------------------------------------------------------- context loss

  onContextLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    this.stats.contextLost++;
    this.stats.requestedRevision++;
    this.pending = true;
    this.activeLease?.release();
    this.gestures?.cancel('contextlost');
    this.status('3D временно недоступен: восстанавливаем изображение…');
  };

  onContextRestored = () => {
    this.lost = false;
    this.stats.contextRestored++;
    this.status(null);
    // Everything uploaded to the old context is uploaded again by Three; the shadows and the floor are drawn again.
    this.renderer.shadowMap.needsUpdate = true;
    this.studio.ground.dirty = true;
    this.request();
  };

  status(text: string | null) {
    this.statusNode?.remove();
    this.statusNode = null;
    if (text) {
      this.statusNode = Object.assign(document.createElement('p'), { role: 'status', className: 'view3d-status', textContent: text });
      this.host.append(this.statusNode);
    }
  }

  // ---------------------------------------------------------------- materials (visual-entry.js, js/53, js/61 of r1)

  material(decorId: string): MeshStandardMaterial {
    const key = decorId;
    const existing = this.materials.get(key);
    if (existing && !existing.userData.textureLoadFailed) return existing;
    if (existing) {
      this.materials.delete(key);
      existing.map = null;
      existing.dispose();
    }
    const look = this.options.decor?.(decorId) ?? null;
    if (!look?.texture) {
      const m = new MeshStandardMaterial({ color: look?.color ?? BOARD, roughness: 0.47, envMapIntensity: 0.8 });
      m.userData = { resourceKey: key, materialCode: decorId, resourceScope: 'base' };
      this.materials.set(key, m);
      return m;
    }
    // A decor with an image: the image is loaded only when a part shows this decor (js/53 of r1).
    const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, envMapIntensity: 0.8 });
    m.userData = { resourceKey: key, materialCode: decorId, decorCode: decorId, resourceScope: 'decor', surfaceKind: 'FACE', textureLoadFailed: false };
    this.materials.set(key, m);
    let texture = this.textures.get(decorId);
    if (!texture) {
      const fail = () => {
        for (const mat of this.materials.values())
          if (mat.userData.decorCode === decorId && mat.userData.surfaceKind === 'FACE') {
            mat.map = null;
            mat.color.set(0xd8d4cd);
            mat.userData.textureLoadFailed = true;
            mat.needsUpdate = true;
          }
        this.textures.get(decorId)?.dispose();
        this.textures.delete(decorId);
        this.request();
      };
      texture = new TextureLoader().load(
        look.texture,
        (loaded) => {
          const image = loaded.image as { naturalWidth?: number; width?: number; naturalHeight?: number; height?: number } | null,
            width = image?.naturalWidth || image?.width || 0,
            height = image?.naturalHeight || image?.height || 0;
          if (!width || !height || this.textures.get(decorId) !== loaded) return fail();
          const longer = Math.max(width, height);
          loaded.colorSpace = SRGBColorSpace;
          loaded.wrapS = loaded.wrapT = RepeatWrapping;
          loaded.repeat.set(longer / width, longer / height);
          loaded.minFilter = LinearMipmapLinearFilter;
          loaded.magFilter = LinearFilter;
          loaded.generateMipmaps = true;
          loaded.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
          loaded.needsUpdate = true;
          for (const mat of this.materials.values()) mat.needsUpdate = true;
          this.ambientModel.sync();
          this.request();
        },
        undefined,
        fail,
      );
      this.textures.set(decorId, texture);
    }
    m.map = texture;
    return m;
  }

  /** The five surfaces of a part: its decor, the bands, the bare edges, the cuts and the bands in the decor of the edges (483). */
  surfaceMaterials(decorId: string, edgeDecorId: string = decorId): MeshStandardMaterial[] {
    const face = this.material(decorId),
      result = [face];
    for (const [kind, color, map] of [
      ['EDGE_BANDED', 0xd2cbc0, true],
      ['EDGE_BARE', 0xc9ad82, false],
      ['CUT', 0xe1c9a2, false],
    ] as const) {
      const key = ['surface', decorId, kind].join('|');
      let m = this.materials.get(key);
      if (!m) {
        m = new MeshStandardMaterial({ color, roughness: kind === 'EDGE_BANDED' ? 0.58 : 0.78, envMapIntensity: 0.55, map: map ? face.map : null });
        m.userData = { resourceKey: key, materialCode: decorId, decorCode: face.userData.decorCode, resourceScope: face.userData.resourceScope || 'base', surfaceKind: kind };
        this.materials.set(key, m);
      } else if (map && m.map !== face.map) {
        m.map = face.map;
        m.needsUpdate = true;
      }
      result.push(m);
    }
    const edge = this.material(edgeDecorId),
      key = ['surface', decorId, 'EDGE_ACCENT', edgeDecorId].join('|');
    let accent = this.materials.get(key);
    if (!accent) {
      accent = new MeshStandardMaterial({ color: 0xd2cbc0, roughness: 0.58, envMapIntensity: 0.55, map: edge.map });
      accent.userData = { resourceKey: key, materialCode: edgeDecorId, decorCode: edge.userData.decorCode, resourceScope: edge.userData.resourceScope || 'base', surfaceKind: 'EDGE_ACCENT' };
      this.materials.set(key, accent);
    } else if (accent.map !== edge.map) {
      accent.map = edge.map;
      accent.needsUpdate = true;
    }
    result.push(accent);
    return result;
  }

  /** Clear glass: a faint tint, see-through, not writing depth, so the parts behind it are drawn (R4-015, FINDINGS 1894). */
  glassMaterial(): MeshStandardMaterial {
    const key = 'glass|clear';
    let m = this.materials.get(key);
    if (!m) {
      m = new MeshStandardMaterial({ color: 0xd6e6e8, roughness: 0.06, metalness: 0, envMapIntensity: 1.2, transparent: true, opacity: 0.28, depthWrite: false });
      m.userData = { resourceKey: key, materialCode: 'GLASS', resourceScope: 'base', surfaceKind: 'GLASS' };
      this.materials.set(key, m);
    }
    return m;
  }

  /**
   * A pane of glass or mirror of a sliding leaf (MOD-AI-30, 70; FINDINGS 2957): the mirror reflects, the lacquered
   * glass is glossy white, the frosted one a milky see-through, the printed one a glossy pale picture.
   */
  paneMaterial(look: NonNullable<ScenePart['pane']>): MeshStandardMaterial {
    const key = 'pane|' + look;
    let m = this.materials.get(key);
    if (!m) {
      m = new MeshStandardMaterial(
        look === 'MIRROR'
          ? { color: 0xe4e8ea, roughness: 0.03, metalness: 1, envMapIntensity: 1.6 }
          : look === 'LACQUER_WHITE'
            ? { color: 0xf3f2ee, roughness: 0.08, metalness: 0, envMapIntensity: 1.1 }
            : look === 'SATIN'
              ? { color: 0xe6eeee, roughness: 0.55, metalness: 0, envMapIntensity: 0.7, transparent: true, opacity: 0.72 }
              : { color: 0xb9c7cf, roughness: 0.1, metalness: 0, envMapIntensity: 1.1 },
      );
      m.userData = { resourceKey: key, materialCode: look, resourceScope: 'base', surfaceKind: 'GLASS' };
      this.materials.set(key, m);
    }
    return m;
  }

  metalMaterial(): MeshStandardMaterial {
    const key = 'metal|hardware';
    let m = this.materials.get(key);
    if (!m) {
      m = new MeshStandardMaterial({ color: 0x777b80, roughness: 0.28, metalness: 0.72, envMapIntensity: 1 });
      m.userData = { resourceKey: key, materialCode: 'METAL', resourceScope: 'base', surfaceKind: 'METAL' };
      this.materials.set(key, m);
    }
    return m;
  }

  /** Material of a finish of hardware: the metal of the hardware parts, black or white plastic, an anodised profile. */
  hardwareMaterial(finish: SceneHardware['finish']): MeshStandardMaterial {
    if (finish === 'METAL') return this.metalMaterial();
    const anodised = finish in HARDWARE_ANODISED ? HARDWARE_ANODISED[finish as keyof typeof HARDWARE_ANODISED] : null,
      key = (anodised ? 'anodised|' : 'plastic|') + finish;
    let m = this.materials.get(key);
    if (!m) {
      m = new MeshStandardMaterial({ ...(anodised ?? HARDWARE_PLASTIC[finish as keyof typeof HARDWARE_PLASTIC]), envMapIntensity: anodised ? 1 : 0.8 });
      m.userData = { resourceKey: key, materialCode: finish, resourceScope: 'base', surfaceKind: anodised && anodised.metalness > 0 ? 'METAL' : 'PLASTIC' };
      this.materials.set(key, m);
    }
    return m;
  }

  /**
   * The models of hardware of a scene (MOD-DEC-432, task FIT), rebuilt each time: a few dozen prisms, and the models of
   * the catalogue whose files are here (MOD-DEC-536) in place of the prisms of their mechanisms. One on a host part
   * keeps its place relative to the closed host and follows the motion of the host (applyMotion).
   */
  updateHardware(scene: Scene3d): boolean {
    const before = this.hardware.map((m) => m.userData.hardware.key).join('|');
    for (const mesh of this.hardware) this.three.remove(mesh);
    this.hardware = [];
    const drawn = new Set<string>();
    for (const m of scene.models ?? []) {
      const basis = this.basis(m),
        geometry = this.modelGeometry(m, basis.flipped);
      if (!geometry) continue;
      drawn.add(m.mechanismId);
      this.addHardware(m, geometry, m.originMm, basis);
    }
    for (const hw of scene.hardware ?? []) {
      if (drawn.has(hw.mechanismId)) continue;
      let geometry = this.hardwareGeometries.get(hw.shapeKey);
      if (!geometry) {
        geometry = panelGeometry({ sizeMm: hw.sizeMm, contourMm: hw.contourMm, banded: { A: false, B: false, C: false, D: false } });
        this.hardwareGeometries.set(hw.shapeKey, geometry);
      }
      const [L, W, T] = hw.sizeMm,
        centre: Vec3 = [0, 1, 2].map((i) => hw.originMm[i] + (hw.uAxis[i] * L + hw.vAxis[i] * W + hw.nAxis[i] * T) / 2) as Vec3;
      this.addHardware(hw, geometry, centre, this.basis(hw));
    }
    return before !== this.hardware.map((m) => m.userData.hardware.key).join('|');
  }

  /** The world axes of a box of hardware; a left-handed box gets −n (its geometry is turned by n to match). */
  basis(b: { uAxis: Vec3; vAxis: Vec3; nAxis: Vec3 }): { u: Vector3; v: Vector3; n: Vector3; flipped: boolean } {
    const u = toWorld(b.uAxis).normalize(),
      v = toWorld(b.vAxis).normalize(),
      n = toWorld(b.nAxis).normalize(),
      flipped = new Vector3().crossVectors(u, v).dot(n) < 0;
    return { u, v, n: flipped ? n.negate() : n, flipped };
  }

  /** A mesh of hardware at a point of the product (the centre of a prism, the origin of a model) in the axes of its box. */
  addHardware(hw: SceneHardware | SceneModel, geometry: BufferGeometry, at: Vec3, { u, v, n }: { u: Vector3; v: Vector3; n: Vector3 }) {
    const mesh = new Mesh(geometry, this.hardwareMaterial(hw.finish)) as unknown as HardwareMesh;
    mesh.position.set((at[0] - this.centre.x) / 1000, at[2] / 1000, (this.centre.y - at[1]) / 1000);
    mesh.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(u, v, n));
    const host = hw.hostPartId ? this.byId.get(hw.hostPartId) : undefined,
      closed = host?.userData.closed;
    mesh.userData = {
      hardware: hw,
      local: closed ? new Matrix4().compose(closed.position, closed.quaternion, new Vector3(1, 1, 1)).invert().multiply(new Matrix4().compose(mesh.position, mesh.quaternion, new Vector3(1, 1, 1))) : null,
    };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.hardware.push(mesh);
    this.three.add(mesh);
  }

  /**
   * The file of a model put into its box (FINDINGS 1085): u, v, n in metres from the origin of the box, the stretch of
   * the core applied. Null while the file is not here — it is asked for once; a refused file stays the parametric model.
   */
  modelGeometry(m: SceneModel, flipped: boolean): BufferGeometry | null {
    const key = m.shapeKey + (flipped ? '|flipped' : '');
    let g = this.modelGeometries.get(key);
    if (g) return g;
    const source = this.modelFiles.get(m.file + '|' + m.sha256),
      fn = this.options.models;
    if (source === undefined) this.loadModel(m);
    if (!(source instanceof BufferGeometry) || !fn) return null;
    const pos = source.getAttribute('position'),
      nor = source.getAttribute('normal'),
      // A mirror of the file or of the box turns the faces in: the order of the vertices of a triangle is reversed.
      reverse = fn.mirrored(m) !== flipped,
      sign = flipped ? -1 : 1,
      position = new Float32Array(pos.count * 3),
      normal = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const k = reverse && i % 3 ? i + (i % 3 === 1 ? 1 : -1) : i,
        p = fn.local(m, [pos.getX(k), pos.getY(k), pos.getZ(k)]),
        d = fn.direction(m, [nor.getX(k), nor.getY(k), nor.getZ(k)]);
      position.set([p[0] / 1000, p[1] / 1000, (sign * p[2]) / 1000], 3 * i);
      normal.set([d[0], d[1], sign * d[2]], 3 * i);
    }
    g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(position, 3));
    g.setAttribute('normal', new Float32BufferAttribute(normal, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    this.modelGeometries.set(key, g);
    return g;
  }

  /** Loads the file of a model once: by its address, checked by its sha256 of the catalogue, read as glTF. */
  loadModel(m: SceneModel) {
    const key = m.file + '|' + m.sha256,
      url = this.options.models?.url(m.file) ?? null,
      fail = (reason: string) => {
        this.modelFiles.set(key, 'failed');
        this.stats.models.failed.push({ file: m.file, reason });
      };
    if (!url) return fail('нет адреса файла');
    this.modelFiles.set(key, 'loading');
    this.stats.models.requested++;
    void (async () => {
      const r = await fetch(url);
      if (!r.ok) throw Error(`HTTP ${r.status}`);
      const data = await r.arrayBuffer();
      if (!crypto.subtle) throw Error('нет проверки sha256 (страница не на защищённом адресе)');
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map((b) => b.toString(16).padStart(2, '0')).join('');
      if (digest !== m.sha256) throw Error('sha256 файла не совпадает с каталогом');
      const gltf = await new GLTFLoader().parseAsync(data, '');
      return fileTriangles(gltf.scene);
    })().then(
      (geometry) => {
        if (this.disposed) return geometry.dispose();
        this.modelFiles.set(key, geometry);
        this.stats.models.loaded++;
        this.modelsArrived();
      },
      (e: unknown) => fail(e instanceof Error ? e.message : String(e)),
    );
  }

  /** A file has come: the scene shown draws its models in place of their prisms. */
  modelsArrived() {
    if (!this.scene3d || this.error || this.disposed || !this.updateHardware(this.scene3d)) return;
    this.placeHardware();
    if (this.initialized) this.renderer.shadowMap.needsUpdate = true;
    this.request();
  }

  /** Each model on a host where the host is now (a door turned, a drawer out); hidden with its host and in «Рентген». */
  placeHardware() {
    const at = new Matrix4(),
      one = new Vector3(1, 1, 1);
    for (const mesh of this.hardware) {
      const { hardware: hw, local } = mesh.userData,
        host = hw.hostPartId ? this.byId.get(hw.hostPartId) : undefined;
      mesh.visible = !this.xray && (!hw.hostPartId || (!!host && host.visible));
      if (!host || !local) continue;
      at.compose(host.position, host.quaternion, one).multiply(local).decompose(mesh.position, mesh.quaternion, new Vector3());
    }
  }

  // ---------------------------------------------------------------- scene of the graph

  geometry(p: ScenePart): BufferGeometry {
    let entry = this.geometries.get(p.shapeKey);
    if (!entry) {
      const box = alignedBox(p);
      entry = { geometry: box ? technicalGeometry(box) : panelGeometry({ sizeMm: p.sizeMm, contourMm: p.contourMm, banded: p.banded, accent: p.edgeDecor?.slots, grain: p.grain ? PART_AXIS[p.grain] : null }), refs: 0 };
      this.geometries.set(p.shapeKey, entry);
    }
    entry.refs++;
    return entry.geometry;
  }

  releaseGeometry(key: string) {
    const entry = this.geometries.get(key);
    if (!entry || --entry.refs > 0) return;
    entry.geometry.dispose();
    entry.edges?.dispose();
    this.geometries.delete(key);
  }

  /**
   * Puts a mesh where its graph part stands, at the centre of its envelope. A box of r1 is built along the world axes
   * and is not turned; another part is turned to its axes u, v, n.
   */
  place(mesh: Mesh, p: ScenePart) {
    const [L, W, T] = p.sizeMm,
      centre: Vec3 = [0, 1, 2].map((i) => p.originMm[i] + (p.uAxis[i] * L + p.vAxis[i] * W + p.nAxis[i] * T) / 2) as Vec3;
    mesh.position.set((centre[0] - this.centre.x) / 1000, centre[2] / 1000, (this.centre.y - centre[1]) / 1000);
    if (alignedBox(p)) mesh.quaternion.identity();
    else {
      const u = toWorld(p.uAxis).normalize(),
        v = toWorld(p.vAxis).normalize();
      let n = toWorld(p.nAxis).normalize();
      // A left-handed u, v, n is turned into a rotation by reversing n; the panel is symmetric in its thickness.
      if (new Vector3().crossVectors(u, v).dot(n) < 0) n = n.negate();
      mesh.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(u, v, n));
    }
    (mesh as PartMesh).userData.closed = { position: mesh.position.clone(), quaternion: mesh.quaternion.clone() };
    mesh.updateMatrixWorld(true);
  }

  createMesh(p: ScenePart): PartMesh {
    const g = this.geometry(p),
      facade = p.surface === 'FACADE',
      // A pane of a sliding leaf is its glass on every face (MOD-AI-30, 70), not a board of a decor.
      surfaces = p.surface === 'HARDWARE' ? null : p.pane ? Array.from({ length: 5 }, () => this.paneMaterial(p.pane!)) : this.surfaceMaterials(p.decorId, p.edgeDecor?.decorId),
      // Glass is see-through on every face (R4-015, FINDINGS 1894): the fill behind a display door shows.
      mats = surfaces && p.glass ? surfaces.map(() => this.glassMaterial()) : surfaces,
      shown: Material | Material[] = mats
        ? facade
          ? mats.map((m) => {
              const c = m.clone();
              c.userData = { ...m.userData, ownMaterial: true };
              return c;
            })
          : mats
        : this.metalMaterial();
    const mesh = new Mesh(g, shown) as unknown as PartMesh;
    mesh.userData = { id: p.id, part: p, key: p.key, facade, ownMaterial: facade, surface: p.surface };
    this.place(mesh, p);
    if (facade && mats) {
      this.facadeSources.set(mesh, mats);
      const edge = new LineSegments(new EdgesGeometry(g), new LineBasicMaterial({ color: 0x555265, transparent: true, opacity: 0.8 }));
      edge.userData.ownMaterial = true;
      mesh.add(edge);
    }
    // A pane of glass lets the light through: no shadow over the fill behind it.
    mesh.castShadow = !p.glass;
    mesh.receiveShadow = true;
    return mesh;
  }

  disposeMesh(mesh: PartMesh) {
    const assigned = this.presentationOriginal.get(mesh);
    if (assigned) mesh.material = assigned;
    this.presentationOriginal.delete(mesh);
    this.three.remove(mesh);
    for (const child of mesh.children) {
      if (child.userData.holes) (child as LineSegments).geometry.dispose(); // the holes of this part; the materials are shared
      if (child.userData.xray) continue; // shared with the parts of the same shape
      (child as LineSegments).geometry?.dispose();
      ((child as LineSegments).material as Material)?.dispose();
    }
    if (mesh.userData.ownMaterial) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
    this.releaseGeometry(mesh.userData.part.shapeKey);
  }

  /**
   * Shows a scene of the graph. Parts are compared by id: a new or changed part gets a new mesh, a removed one is
   * disposed, the others stay as they are (with their baked light).
   */
  update(scene: Scene3d, display: Display = {}) {
    this.scene3d = scene;
    this.display = display;
    if (this.error) return;
    if (display.neutral !== undefined) this.appearance = { materials: display.neutral ? 'neutral' : 'assigned' };
    const t = performance.now(),
      b = scene.boundsMm,
      extent = { W: b.max[0] - b.min[0], H: Math.max(0, b.max[2]), D: b.max[1] - b.min[1] },
      centre = { x: (b.min[0] + b.max[0]) / 2, y: (b.min[1] + b.max[1]) / 2 },
      moved = centre.x !== this.centre.x || centre.y !== this.centre.y;
    this.extent = extent;
    this.centre = centre;
    const next = new Map(scene.parts.map((p) => [p.id, p])),
      counts = { added: 0, changed: 0, removed: 0, kept: 0 };
    for (const mesh of [...this.meshes]) {
      const p = next.get(mesh.userData.id);
      if (p && p.key === mesh.userData.key) continue;
      this.disposeMesh(mesh);
      this.byId.delete(mesh.userData.id);
      if (!p) counts.removed++;
    }
    const meshes: PartMesh[] = [];
    for (const p of scene.parts) {
      let mesh = this.byId.get(p.id);
      if (mesh) {
        counts.kept++;
        mesh.userData.part = p;
        if (moved) this.place(mesh, p);
      } else {
        if (this.meshes.some((m) => m.userData.id === p.id)) counts.changed++;
        else counts.added++;
        mesh = this.createMesh(p);
        this.byId.set(p.id, mesh);
        this.three.add(mesh);
      }
      meshes.push(mesh);
    }
    const geometryChanged = moved || counts.added + counts.changed + counts.removed > 0 || !this.initialized;
    this.meshes = meshes;
    // FIT: the models of hardware, placed by the closed parts, before the doors and drawers move.
    if (this.updateHardware(scene) && this.initialized) this.renderer.shadowMap.needsUpdate = true;
    // Open doors and drawers stay open across an edit that keeps them (same key and place, as in r1).
    this.motion.configure(scene.motions ?? []);
    // «Взрыв» only in «Рентген»: leaving it puts every part back at once, before the surfaces and shadows return.
    const explodeJumped = this.aimExplode(display.xray ? (display.explode ?? 0) : 0, !display.xray);
    this.applyMotion();
    if (explodeJumped && this.initialized && this.mode === 'FIT') this.fit();
    this.stats.rebuilt.push(counts);
    if (geometryChanged) {
      if (!this.initialized) {
        this.initialized = true;
        this.controls.target.set(0, extent.H / 2000, 0);
        this.fit();
      } else if (this.mode === 'FIT') this.fit();
      this.renderer.shadowMap.needsUpdate = true;
    }
    // Both are applied every time: a change of one does not skip the other.
    const translucencyChanged = this.updateFacadeTranslucency(display),
      xrayChanged = this.updateXray(Boolean(display.xray)),
      materialChanged = translucencyChanged || xrayChanged;
    let visibilityChanged = false;
    for (const mesh of this.meshes) {
      const visible = !mesh.userData.facade || display.fronts !== false;
      if (mesh.visible !== visible) visibilityChanged = true;
      mesh.visible = visible;
    }
    this.placeHardware();
    this.updateOutline(display);
    this.applyPresentation();
    this.updateStudioBounds(extent);
    if (geometryChanged || visibilityChanged || materialChanged) {
      this.studio.update(extent);
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.stats.buildMs.push(performance.now() - t);
    if (this.stats.buildMs.length > 300) this.stats.buildMs.shift();
    this.request();
  }

  /** Selected part ids, from the editor or the part list: the outline follows them (selection in both directions). */
  setSelection(ids: string[]) {
    this.display = { ...this.display, selectedIds: ids };
    if (this.error) return;
    this.updateOutline(this.display);
    this.request();
  }

  updateOutline(display: Display) {
    if (this.outline) {
      this.three.remove(this.outline);
      this.outline.traverse((n) => {
        (n as LineSegments).geometry?.dispose();
        ((n as LineSegments).material as Material | undefined)?.dispose();
      });
      this.outline = null;
    }
    const ids = new Set(display.selectedIds ?? []);
    this.outline = new Group();
    for (const mesh of this.meshes.filter((m) => ids.has(m.userData.id))) {
      const edge = new LineSegments(selectionGeometry(mesh.geometry), new LineBasicMaterial({ color: SELECTION, depthTest: true, transparent: true, opacity: 0.9 }));
      edge.position.copy(mesh.position);
      edge.quaternion.copy(mesh.quaternion);
      edge.renderOrder = 2000;
      edge.userData.partId = mesh.userData.id;
      edge.userData.followMesh = mesh;
      this.outline.add(edge);
    }
    this.three.add(this.outline);
  }

  // ---------------------------------------------------------------- doors and drawers (task V2)

  /** A point of the product (mm) in the world of the view. */
  toWorldPoint(a: Vec3): Vector3 {
    return new Vector3((a[0] - this.centre.x) / 1000, a[2] / 1000, (this.centre.y - a[1]) / 1000);
  }

  /**
   * Puts each moving part where its motion is now (`applyMotion` of r1): a door turns about its axis, a drawer comes out,
   * a lift front turns up about its top edge (engine.liftLeafPose, MOD-DEC-742).
   */
  applyMotion() {
    const up = new Vector3(0, 1, 0),
      across = new Vector3(1, 0, 0);
    for (const mesh of this.meshes) {
      const closed = mesh.userData.closed;
      if (!closed) continue;
      mesh.position.copy(closed.position);
      mesh.quaternion.copy(closed.quaternion);
      const item = this.motion.of(mesh.userData.id);
      if (!item) continue;
      const e = eased(this.motion.values.get(item.key) || 0);
      if (item.kind === 'door') {
        const pivot = this.toWorldPoint(item.pivotMm),
          angle = ((item.hinge === 'right' ? 1 : -1) * item.angleDeg * Math.PI * e) / 180;
        mesh.position.sub(pivot).applyAxisAngle(up, angle).add(pivot);
        mesh.quaternion.premultiply(new Quaternion().setFromAxisAngle(up, angle));
      } else if (item.kind === 'lift') {
        // engine.liftLeafPose: the leaf turns about its own hinge line, then the line goes where the upper leaf takes it.
        const k = item.leaves.findIndex((l) => l.partId === mesh.userData.id),
          leaf = item.leaves[k]!,
          a = item.angleDeg * e,
          turn = (-(leaf.folds ? a - 180 * e : a) * Math.PI) / 180,
          own = this.toWorldPoint(leaf.hingeMm),
          moved = own.clone().sub(this.toWorldPoint(item.pivotMm)).applyAxisAngle(across, (-a * Math.PI) / 180).add(this.toWorldPoint(item.pivotMm));
        mesh.position.sub(own).applyAxisAngle(across, turn).add(moved);
        mesh.quaternion.premultiply(new Quaternion().setFromAxisAngle(across, turn));
      } else if (item.kind === 'slide') mesh.position.x += ((this.motion.slideAt.get(item.key) ?? item.closedMm) - item.closedMm) / 1000;
      else mesh.position.z += (item.travelMm / 1000) * e;
    }
    const spread = this.explodedMoves();
    if (spread)
      for (const mesh of this.meshes) {
        const d = spread.get(mesh.userData.id);
        if (d) mesh.position.add(new Vector3(d[0] / 1000, d[2] / 1000, -d[1] / 1000));
      }
    for (const n of this.outline?.children || []) {
      const mesh = n.userData.followMesh as PartMesh | undefined;
      if (mesh) {
        n.position.copy(mesh.position);
        n.quaternion.copy(mesh.quaternion);
      }
    }
    this.placeHardware();
  }

  /** Opens or closes one door or drawer (by its motion key); the editors call it from a click or a button. False — refused. */
  toggleMotion(key: string): boolean {
    const done = this.motion.toggle(key);
    this.request();
    this.host.dispatchEvent(new Event('motionchange'));
    return done;
  }

  /**
   * Moves the leaves of a sliding system (MOD-DEC-571): toward `wanted` left edges (mm, product X) by the rule of the
   * core — by a stroke, or at once while a leaf is dragged. Returns where they go; null — refused.
   */
  moveLeaves(mechanismId: string, wanted: readonly number[], atOnce = false): number[] | null {
    const leaves = this.motion.systems().find((l) => l[0]?.mechanismId === mechanismId);
    const next = leaves ? this.motion.moveLeaves(leaves, wanted, atOnce) : null;
    if (next) {
      this.request();
      this.host.dispatchEvent(new Event('motionchange'));
    }
    return next;
  }

  /** A leaf is held on the scheme of the tracks (a drag): the light stays basic until it is let go. */
  holdLeaves(held: boolean) {
    if (this.motion.slideHeld === held) return;
    this.motion.slideHeld = held;
    this.request();
  }

  /** «Открыть фасады / Закрыть фасады» of r1; returns whether the doors open. */
  toggleAll(): boolean {
    const open = this.motion.all();
    this.request();
    this.host.dispatchEvent(new Event('motionchange'));
    return open;
  }

  // ---------------------------------------------------------------- «Взрыв» of «Рентген»

  /** Sets where «Взрыв» goes (0 … 1): a smooth stroke from where it is now, or at once. Returns whether it changed. */
  aimExplode(level: number, atOnce = false): boolean {
    const to = this.options.explode ? Math.min(1, Math.max(0, level)) : 0,
      e = this.explode;
    if (atOnce) {
      const changed = e.value !== to || e.to !== to;
      Object.assign(e, { value: to, from: to, to });
      return changed;
    }
    if (e.to === to) return false;
    Object.assign(e, { from: e.value, to, start: performance.now() });
    return true;
  }

  /** The slider of «Взрыв» (in «Рентген» only); the editors give the same share with the display on the next update. */
  setExplode(level: number) {
    if (this.error || !this.aimExplode(this.xray ? level : 0, !this.xray)) return;
    this.request();
  }

  /** Moves the stroke of «Взрыв» to the time of this frame; returns whether the share changed. */
  stepExplode(now: number): boolean {
    const e = this.explode;
    if (e.value === e.to) return false;
    const t = Math.min(1, Math.max(0, (now - e.start) / EXPLODE_MS));
    e.value = t >= 1 ? e.to : e.from + (e.to - e.from) * eased(t);
    return true;
  }

  /** The move of each part (mm, product axes) at the share shown now, the lift included; null — assembled. */
  explodedMoves(): Map<string, Vec3> | null {
    const scene = this.scene3d,
      api = this.options.explode,
      level = this.explode.value;
    if (!scene || !api || level <= 0) return null;
    if (this.explodeMoves?.scene !== scene) this.explodeMoves = { scene, offsets: api.offsets(scene) };
    const { offsets } = this.explodeMoves,
      lift = api.lift(scene, offsets, level),
      out = new Map<string, Vec3>();
    for (const [id, d] of offsets) out.set(id, [d[0] * level, d[1] * level, d[2] * level + lift]);
    return out;
  }

  /** The box of the parts where «Взрыв» shows them, in the world: its centre and half sizes; null — assembled. */
  explodedBox(): { centre: Vector3; half: Vector3 } | null {
    const moves = this.explodedMoves();
    if (!moves || !this.scene3d) return null;
    const min: Vec3 = [Infinity, Infinity, Infinity],
      max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const p of this.scene3d.parts) {
      const d = moves.get(p.id) ?? [0, 0, 0];
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], p.boxMm.min[i] + d[i]);
        max[i] = Math.max(max[i], p.boxMm.max[i] + d[i]);
      }
    }
    return {
      centre: this.toWorldPoint([(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]),
      half: new Vector3((max[0] - min[0]) / 2000, (max[2] - min[2]) / 2000, (max[1] - min[1]) / 2000),
    };
  }

  // Facade-owned materials live with their geometry; shared surface materials stay unchanged.
  updateFacadeTranslucency(display: Display): boolean {
    let changed = false;
    for (const mesh of this.meshes) {
      const sources = this.facadeSources.get(mesh);
      if (!sources) continue;
      const assigned = this.presentationOriginal.get(mesh) || mesh.material,
        materials = (Array.isArray(assigned) ? assigned : [assigned]) as MeshStandardMaterial[];
      for (let i = 0; i < materials.length; i++) {
        const m = materials[i],
          source = sources[i],
          translucent = Boolean(display.translucent),
          transparent = translucent ? true : source.transparent,
          // A translucent front is never less see-through than its glass.
          opacity = translucent ? Math.min(0.58, source.opacity) : source.opacity,
          depthWrite = translucent ? false : source.depthWrite;
        if (m.transparent === transparent && m.opacity === opacity && m.depthWrite === depthWrite) continue;
        if (m.transparent !== transparent) {
          m.transparent = transparent;
          m.needsUpdate = true;
        }
        m.opacity = opacity;
        m.depthWrite = depthWrite;
        changed = true;
      }
    }
    // The baked light distinguishes opaque blockers: a bake made with the other mode is retired.
    if (changed) this.ambientModel.invalidate();
    return changed;
  }

  /** Edges of every part for «Рентген»: made once per shape, shown or hidden with the mode. Returns whether it changed. */
  updateXray(on: boolean): boolean {
    const changed = on !== this.xray;
    this.xray = on;
    if (!on && !this.xrayLook) return changed;
    // The edge and hole lines are not drawn by WebGL: they carry the segments and colours of the vector lines (FINDINGS 1995).
    const look = (this.xrayLook ??= {
      hidden: new MeshBasicMaterial({ visible: false }),
      line: new LineBasicMaterial({ color: 0x2b3036, depthTest: false, depthWrite: false, toneMapped: false, visible: false }),
      // Holes and hardware (FINDINGS 970): blue outlines of the drilling, steel and wood figures of what sits in it.
      hole: new LineBasicMaterial({ color: 0x1f63c4, depthTest: false, depthWrite: false, toneMapped: false, visible: false }),
      metal: new MeshBasicMaterial({ color: 0x6f7780, depthTest: false, depthWrite: false, toneMapped: false }),
      wood: new MeshBasicMaterial({ color: 0xb98a52, depthTest: false, depthWrite: false, toneMapped: false }),
    });
    for (const mesh of this.meshes) {
      if (on) this.updateHoles(mesh, look);
      let lines = mesh.children.find((n) => n.userData.xray && !n.userData.holes) as LineSegments | undefined;
      if (on && !lines) {
        const entry = this.geometries.get(mesh.userData.part.shapeKey)!;
        entry.edges ??= selectionGeometry(entry.geometry);
        lines = new LineSegments(entry.edges, look.line);
        lines.userData.xray = true;
        lines.renderOrder = 1000;
        mesh.add(lines);
      }
      if (lines) lines.visible = on;
      for (const n of mesh.children) if (n.userData.holes) n.visible = on;
      // The facade outline of r1 is translucent and hidden by the other parts: in «Рентген» it gives way.
      for (const n of mesh.children) if (!n.userData.xray) n.visible = !on;
    }
    if (on) this.xrayLines ??= new XrayLines(this.renderer.domElement);
    else {
      this.xrayLines?.dispose();
      this.xrayLines = null;
    }
    return changed;
  }

  /** The lines of «Рентген» over the picture (FINDINGS 1995): part edges, holes, then the selected parts on top. */
  drawXrayLines() {
    const look = this.xrayLook;
    if (!this.xrayLines || !look) return;
    const edges: Object3D[] = [],
      holes: Object3D[] = [];
    for (const mesh of this.meshes)
      for (const n of mesh.children) if (n.userData.xray && (n as LineSegments).isLineSegments) (n.userData.holes ? holes : edges).push(n);
    const selected = (this.outline?.children ?? []).filter((n) => (n.userData.followMesh as PartMesh | undefined)?.visible),
      css = (color: Color) => `#${color.getHexString()}`;
    this.xrayLines.draw(this.camera, [
      { color: css(look.line.color), width: XRAY_WIDTH.edges, objects: edges },
      { color: css(look.hole.color), width: XRAY_WIDTH.holes, objects: holes },
      { color: css(new Color(SELECTION)), width: XRAY_WIDTH.selection, objects: selected },
    ]);
  }

  /**
   * The holes of a part and the hardware in them, as children of its mesh in its own axes (FINDINGS 970): they open
   * with a door, slide out with a drawer and fly with the part in «Взрыв». Built again only when the holes changed.
   */
  updateHoles(mesh: PartMesh, look: NonNullable<StudioView['xrayLook']>) {
    const scene = this.scene3d,
      closed = mesh.userData.closed;
    if (!scene || !closed) return;
    if (this.holesOf?.scene !== scene) {
      const byPart = new Map<string, SceneHole[]>();
      for (const h of scene.holes ?? []) byPart.set(h.partId, [...(byPart.get(h.partId) ?? []), h]);
      this.holesOf = { scene, byPart };
    }
    const holes = this.holesOf.byPart.get(mesh.userData.id) ?? [],
      key = JSON.stringify(holes),
      old = mesh.children.filter((n) => n.userData.holes);
    if (old.length && old[0].userData.key === key) return;
    for (const n of old) {
      mesh.remove(n);
      (n as LineSegments).geometry.dispose();
    }
    if (!holes.length) return;
    // A point and a direction of the product in the axes of the part as it stands closed.
    const back = closed.quaternion.clone().invert(),
      point = (a: Vec3) => this.toWorldPoint(a).sub(closed.position).applyQuaternion(back),
      direction = (a: Vec3) => toWorld(a).applyQuaternion(back).normalize(),
      outline: number[] = [],
      figures: Record<SceneHole['hardware'], BufferGeometry[]> = { METAL: [], WOOD: [] },
      up = new Vector3(0, 1, 0);
    for (const h of holes) {
      const entry = point(h.entryMm),
        axis = direction(h.axis),
        depth = h.depthMm / 1000,
        radius = h.diameterMm / 2000,
        side = new Vector3().crossVectors(axis, Math.abs(axis.y) < 0.9 ? up : new Vector3(1, 0, 0)).normalize(),
        other = new Vector3().crossVectors(axis, side),
        at = (angle: number, along: number) =>
          entry
            .clone()
            .addScaledVector(side, Math.cos(angle) * radius)
            .addScaledVector(other, Math.sin(angle) * radius)
            .addScaledVector(axis, along);
      // The outline of the hole: its mouth, its bottom (or the other mouth) and four lines along its wall.
      for (let i = 0; i < HOLE_SEGMENTS; i++) {
        const a = (2 * Math.PI * i) / HOLE_SEGMENTS,
          b = (2 * Math.PI * (i + 1)) / HOLE_SEGMENTS;
        for (const along of [0, depth]) outline.push(...at(a, along).toArray(), ...at(b, along).toArray());
        if (i % (HOLE_SEGMENTS / 4) === 0) outline.push(...at(a, 0).toArray(), ...at(a, depth).toArray());
      }
      // The hardware: a cylinder filling the hole (a screw, an eccentric, a stem, a cup, a pin — or a dowel).
      const figure = new CylinderGeometry(radius * HARDWARE_FILL, radius * HARDWARE_FILL, depth, HARDWARE_SEGMENTS);
      figure.applyQuaternion(new Quaternion().setFromUnitVectors(up, axis));
      figure.translate(...entry.clone().addScaledVector(axis, depth / 2).toArray());
      figures[h.hardware].push(figure);
    }
    const lines = new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(outline, 3)), look.hole);
    lines.renderOrder = 1002;
    const children: (LineSegments | Mesh)[] = [lines];
    for (const kind of ['METAL', 'WOOD'] as const) {
      if (!figures[kind].length) continue;
      const merged = mergeGeometries(figures[kind]);
      for (const g of figures[kind]) g.dispose();
      const m = new Mesh(merged, kind === 'METAL' ? look.metal : look.wood);
      m.renderOrder = 1001;
      m.userData.hardware = kind;
      children.push(m);
    }
    for (const n of children) {
      Object.assign(n.userData, { xray: true, holes: true, key, count: holes.length });
      mesh.add(n);
    }
  }

  setAppearance(options: { materials?: 'assigned' | 'neutral'; ambientOcclusion?: boolean } = {}) {
    if (options.materials !== undefined && !['neutral', 'assigned'].includes(options.materials)) throw new TypeError('materials must be neutral or assigned');
    this.appearance = { ...this.appearance, ...(options.materials ? { materials: options.materials } : {}) };
    if (this.error) return;
    if (options.ambientOcclusion !== undefined) this.studio.enabled = Boolean(options.ambientOcclusion);
    this.applyPresentation();
    this.request();
  }

  applyPresentation() {
    for (const mesh of this.meshes) {
      if (!this.presentationOriginal.has(mesh)) this.presentationOriginal.set(mesh, mesh.material);
      const assigned = this.presentationOriginal.get(mesh)!;
      if (this.appearance.materials !== 'neutral' || mesh.userData.surface === 'HARDWARE') {
        mesh.material = assigned;
        continue;
      }
      const neutral = (source: Material) => {
        const key = source.transparent ? 'translucent' : 'solid';
        if (!this.presentationMaterials.has(key)) {
          const m = new MeshStandardMaterial({ color: 0xf8f2e5, roughness: 0.76, metalness: 0, envMapIntensity: 0.65, transparent: source.transparent, opacity: source.transparent ? source.opacity : 1, depthWrite: source.depthWrite });
          m.userData = { presentationOnly: true, surfaceKind: 'NEUTRAL_PREVIEW' };
          this.presentationMaterials.set(key, m);
        }
        return this.presentationMaterials.get(key)!;
      };
      mesh.material = Array.isArray(assigned) ? assigned.map(neutral) : neutral(assigned);
    }
    this.ambientModel.apply(this.meshes);
    // After the baked light took its materials, so that it keeps them for the way back from «Рентген».
    if (this.xray && this.xrayLook) for (const mesh of this.meshes) mesh.material = this.xrayLook.hidden;
  }

  updateStudioBounds(data: Extent) {
    const key = [data.W, data.H, data.D].join('|');
    if (key === this.studioBoundsKey) return;
    this.studioBoundsKey = key;
    const span = Math.max(data.W, data.H, data.D) / 1000,
      half = Math.max(2, span * 1.12);
    for (const light of this.studioLights) {
      light.target.position.set(0, data.H / 2400, 0);
      Object.assign(light.shadow.camera, { left: -half, right: half, top: half, bottom: -half, far: Math.max(25, span * 5) });
      light.shadow.camera.updateProjectionMatrix();
    }
    // The fill keeps its target at the origin; only its shadow frustum is fitted.
    Object.assign(this.fillLight.shadow.camera, { left: -half, right: half, top: half, bottom: -half, far: Math.max(25, span * 5) });
    this.fillLight.shadow.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- camera

  resize() {
    if (this.error) return;
    let w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (w && h) this.offscreen = null;
    else if (this.offscreen && !this.host.isConnected) ({ width: w, height: h } = this.offscreen);
    if (!w || !h) return;
    // The same size again (the view prepared off the page is shown at the size it was drawn at): the canvas keeps its
    // picture; setting its size again would clear it.
    // The canvas on whole physical pixels (FINDINGS 1991): its backing store is the size the host takes on the screen,
    // rounded, and its CSS size is that store over the pixel ratio, so the browser does not stretch the picture by a
    // fraction of a pixel (at 125 % it did: 1542 pixels drawn into 1542.5).
    const ratio = this.renderer.getPixelRatio(),
      box = this.host.isConnected ? this.host.getBoundingClientRect() : null,
      pw = Math.max(1, Math.round((box?.width || w) * ratio)),
      ph = Math.max(1, Math.round((box?.height || h) * ratio)),
      canvas = this.renderer.domElement;
    if (this.viewportWidth === w && this.viewportHeight === h && canvas.width === pw && canvas.height === ph) return;
    this.gestures.cancel('resize');
    this.viewportWidth = w;
    this.viewportHeight = h;
    this.renderer.setSize(pw / ratio, ph / ratio, false);
    // setSize floors size × ratio: a ratio such as 1.1 can lose the last pixel to rounding of the division.
    if (canvas.width !== pw || canvas.height !== ph) Object.assign(canvas, { width: pw, height: ph });
    // At a pixel ratio below the screen's (capped at 2) the picture is stretched anyway: the stylesheet fills the host.
    const exact = ratio === devicePixelRatio;
    canvas.style.width = exact ? `${pw / ratio}px` : '';
    canvas.style.height = exact ? `${ph / ratio}px` : '';
    this.studio.resize(pw, ph);
    this.camera.aspect = pw / ph;
    this.camera.updateProjectionMatrix();
    if (this.mode === 'FIT') this.fit();
    this.request();
  }

  /** «Вписать» of r1: the whole product box in view along the current direction, margin 1.16; in «Взрыв» — the box of the spread parts. */
  fit() {
    if (!this.scene3d || this.error) return;
    const { W, H, D } = this.extent,
      exploded = this.explodedBox(),
      half = exploded?.half ?? new Vector3(W / 2000, H / 2000, D / 2000),
      target = exploded?.centre ?? new Vector3(0, H / 2000, 0),
      // A camera in its target has no direction to keep: the one of the start (R1-004, FINDINGS 1314).
      direction = (this.camera.position.distanceToSquared(this.controls.target) > 1e-12 ? this.camera.position.clone().sub(this.controls.target) : START_CAMERA.clone().sub(target)).normalize(),
      up = new Vector3(0, 1, 0),
      right = new Vector3().crossVectors(up, direction).normalize(),
      vertical = new Vector3().crossVectors(direction, right).normalize(),
      tanY = Math.tan(MathUtils.degToRad(this.camera.fov / 2)),
      tanX = tanY * this.camera.aspect;
    let distance = 0;
    for (const x of [-half.x, half.x])
      for (const y of [-half.y, half.y])
        for (const z of [-half.z, half.z]) {
          const point = new Vector3(x, y, z),
            toward = point.dot(direction);
          distance = Math.max(distance, toward + Math.abs(point.dot(right)) / tanX, toward + Math.abs(point.dot(vertical)) / tanY);
        }
    // An empty scene (a new kitchen before its first module) has nothing to frame: the camera stays where it is. It
    // was put into the target, and every later «Вписать» left the view grey (R1-004, FINDINGS 1314).
    if (!(distance > 0)) {
      this.mode = 'FIT';
      return;
    }
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(direction, distance * 1.16);
    this.camera.near = 0.03;
    this.camera.far = Math.max(100, distance * 4);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.mode = 'FIT';
    if (!this.quietCamera) {
      this.measureFitSpan();
      this.request();
    }
  }

  /**
   * Where the front of the product is across the screen at «Вписать» (MOD-DEC-183: the scheme of the tracks is as wide
   * as the wardrobe then, and keeps that width when the view is zoomed): the left and right front corners at the floor,
   * CSS px of the host. «fitchange» tells the shell when it moved.
   */
  measureFitSpan() {
    const b = this.scene3d?.boundsMm;
    if (!b || !this.viewportWidth) return;
    this.camera.updateMatrixWorld();
    const x = (X: number) => ((this.toWorldPoint([X, b.min[1], b.min[2]]).project(this.camera).x + 1) / 2) * this.viewportWidth,
      a = x(b.min[0]),
      c = x(b.max[0]),
      span = { left: Math.min(a, c), width: Math.abs(c - a) };
    if (this.fitSpan && Math.abs(this.fitSpan.left - span.left) < 0.5 && Math.abs(this.fitSpan.width - span.width) < 0.5) return;
    this.fitSpan = span;
    this.host.dispatchEvent(new Event('fitchange'));
  }

  zoom(factor: number) {
    if (this.error) return;
    const off = this.camera.position.clone().sub(this.controls.target);
    off.multiplyScalar(1 / factor).clampLength(0.15, 90);
    this.camera.position.copy(this.controls.target).add(off);
    this.mode = 'MANUAL';
    this.controls.update();
    this.request();
  }

  pick(e: PointerEvent) {
    this.camera.updateMatrixWorld(true);
    for (const mesh of this.meshes) mesh.updateWorldMatrix(true, false);
    const b = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    const hit = this.ray.intersectObjects(
      this.meshes.filter((m) => m.visible),
      false,
    )[0];
    this.select(hit ? (hit.object as PartMesh).userData.part : null, hit?.face?.normal ?? null, hit?.point ?? null);
  }

  // ---------------------------------------------------------------- frames: quick, then studio

  /** The view can draw: its host is shown with a size, or it is prepared off the page. */
  drawable(): boolean {
    return (this.host.clientWidth > 0 && this.host.clientHeight > 0) || (this.offscreen !== null && !this.host.isConnected);
  }

  request() {
    if (this.error || this.disposed) return;
    this.stopAccumulation();
    this.stats.accumulated = 0;
    this.requestedAt ??= performance.now();
    this.stats.requestedRevision++;
    this.pending = true;
    this.queueFrame();
  }

  queueFrame() {
    if (this.frameHandle || this.stats.preparing || this.error || this.disposed || this.lost) return;
    this.frameHandle = requestAnimationFrame(() => {
      this.frameHandle = 0;
      void this.renderCurrent();
    });
  }

  async renderCurrent() {
    if (this.error || this.disposed) return;
    const r = this.renderer;
    if (r.getContext().isContextLost()) {
      this.pending = true;
      return;
    }
    if (!this.drawable()) {
      this.pending = false;
      return;
    }
    // «Взрыв» on its stroke: the parts move, and a view that is fitted follows the spread box (before the revision of
    // this frame is taken, so the camera is part of it).
    const exploding = this.stepExplode(performance.now());
    if (exploding && this.mode === 'FIT') {
      this.quietCamera = true;
      try {
        this.fit();
      } finally {
        this.quietCamera = false;
      }
    }
    const begun = performance.now(),
      revision = this.stats.requestedRevision,
      requestedAt = this.requestedAt ?? begun,
      moving = this.motion.step(begun);
    this.applyMotion();
    this.ambientModel.frame(this.meshes, moving, this.studio.enabled !== false && !this.xray);
    this.studio.xray = this.xray;
    if (moving || this.wasMoving) r.shadowMap.needsUpdate = true;
    const shadowMoving = moving || this.wasMoving;
    this.wasMoving = moving;
    const started = performance.now();
    let lease: { ready: Promise<unknown>; release(): void } | null = null,
      timer = 0,
      preparationError: string | null = null;
    this.stats.parallelCompilation = r.extensions.has('KHR_parallel_shader_compile');
    this.stats.preparing = true;
    try {
      if (!this.prepareUnavailable && this.stats.parallelCompilation) {
        lease = prepareBeauty(r, this.three, this.camera, this.studio.composer.readBuffer);
        this.activeLease = lease;
        await Promise.race([lease.ready, new Promise((_, reject) => (timer = window.setTimeout(() => reject(new Error('Shader preparation timed out')), 3000)))]);
      }
    } catch (error) {
      if ((this.disposed || r.getContext().isContextLost()) && (error as Error)?.name === 'AbortError') {
        this.stats.preparing = false;
        clearTimeout(timer);
        lease?.release();
        return;
      }
      // A cancelled wait (the scene changed under it) is not a failure: the next frame prepares the new scene.
      if ((error as Error)?.name !== 'AbortError') {
        preparationError = String(error);
        this.stats.preparationErrors.push({ revision, error: preparationError });
        console.warn('3D shader preparation failed:', error);
        this.host.dispatchEvent(new CustomEvent('renderstatus', { detail: { revision, error: preparationError } }));
        if (preparationError.includes('timed out')) this.prepareUnavailable = true;
      }
    } finally {
      clearTimeout(timer);
      this.activeLease = null;
      this.stats.preparing = false;
      if (this.disposed || preparationError || r.getContext().isContextLost()) lease?.release();
      this.stats.preparationMs.push(performance.now() - started);
      if (this.stats.preparationMs.length > 300) this.stats.preparationMs.shift();
    }
    if (r.getContext().isContextLost()) {
      lease?.release();
      this.pending = true;
      return;
    }
    if (this.disposed || this.error || revision !== this.stats.requestedRevision || !this.drawable()) {
      lease?.release();
      if (!this.disposed && !this.error) this.queueFrame();
      return;
    }
    try {
      const drawStarted = performance.now();
      this.studio.render(this.three, this.camera, this.meshes, this.outline, shadowMoving);
      this.drawXrayLines();
      const drawn = performance.now();
      this.stats.frames++;
      this.stats.renderedRevision = revision;
      this.stats.frameMs.push(drawn - drawStarted);
      if (this.stats.frameMs.length > 300) this.stats.frameMs.shift();
      this.stats.phases.frames.push({ at: drawn, revision, offscreen: !this.host.isConnected, wait: begun - requestedAt, ambient: started - begun, prepare: drawStarted - started, draw: drawn - drawStarted });
      if (this.stats.phases.frames.length > 300) this.stats.phases.frames.shift();
      this.requestedAt = null;
      // The programs are kept until the next lease acquires them.
      this.programLease?.release();
      this.programLease = lease;
      lease = null;
      this.pending = false;
      this.host.dispatchEvent(new CustomEvent('rendercomplete', { detail: { revision, studio: this.ambientModel.ready } }));
      // A door or drawer still moving: the next frame of the stroke (r1); «Взрыв» still on its stroke.
      if (moving || this.explode.value !== this.explode.to) this.request();
      else this.startAccumulation(revision);
    } catch (error) {
      this.pending = false;
      console.error('3D rendering failed:', error);
      this.host.dispatchEvent(new CustomEvent('renderstatus', { detail: { revision, error: String(error) } }));
    } finally {
      lease?.release();
    }
  }

  // ---------------------------------------------------------------- smoothing of the still picture

  /** Turns the smoothing on or off; left to itself it is on unless the renderer is software (FINDINGS 1990). */
  setAccumulation(enabled: boolean) {
    this.accumulation.enabled = enabled;
    if (enabled) this.startAccumulation(this.stats.renderedRevision);
    else this.stopAccumulation();
  }

  startAccumulation(revision: number) {
    const a = this.accumulation;
    this.stopAccumulation();
    if (!a.enabled || !this.host.isConnected || revision !== this.stats.requestedRevision) return;
    a.revision = revision;
    a.index = 0;
    a.handle = requestAnimationFrame(() => this.accumulateStep());
  }

  stopAccumulation() {
    cancelAnimationFrame(this.accumulation.handle);
    this.accumulation.handle = 0;
  }

  /** One frame of the smoothing; it stops at once when anything asks for a new frame. */
  accumulateStep() {
    const a = this.accumulation;
    a.handle = 0;
    if (this.disposed || this.error || this.lost || this.pending || this.frameHandle || this.stats.preparing) return;
    if (a.revision !== this.stats.requestedRevision || !this.drawable() || this.renderer.getContext().isContextLost()) return;
    try {
      this.studio.accumulate(this.three, this.meshes, this.outline, a.index);
    } catch (error) {
      console.error('3D smoothing failed:', error);
      return;
    }
    a.index++;
    this.stats.accumulated = a.index;
    if (a.index < a.total) a.handle = requestAnimationFrame(() => this.accumulateStep());
  }

  // ---------------------------------------------------------------- state for checks

  snapshot() {
    if (this.error) return { error: this.error };
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
      fov: this.camera.fov,
      aspect: this.camera.aspect,
      mode: this.mode,
      xray: this.xray,
      explode: { ...this.explode },
      stats: this.stats,
      ambient: { ready: this.ambientModel.ready, failed: this.ambientModel.failed, lastJob: this.ambientModel.lastJob },
      rendererInfo: { memory: { ...this.renderer.info.memory }, render: { ...this.renderer.info.render }, programs: this.renderer.info.programs?.length },
      geometries: this.geometries.size,
      motion: this.motion.snapshot(),
      selectedMeshIds: this.outline?.children.map((n) => n.userData.partId).filter(Boolean) || [],
      parts: this.meshes.map((m) => {
        m.updateWorldMatrix(true, false);
        const box = new Box3().setFromObject(m, true);
        return { id: m.userData.id, surface: m.userData.surface, visible: m.visible, boxMm: { min: this.toProduct(box.min), max: this.toProduct(box.max) } };
      }),
    };
  }

  /** A world point back in product axes (mm): what a mesh occupies, compared with its graph part by the checks. */
  toProduct(v: Vector3): Vec3 {
    return [v.x * 1000 + this.centre.x, this.centre.y - v.z * 1000, v.y * 1000];
  }

  dispose() {
    this.gestures?.dispose();
    this.disposed = true;
    this.stats.requestedRevision++;
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
    this.stopAccumulation();
    this.pending = false;
    this.activeLease?.release();
    this.activeLease = null;
    this.programLease?.release();
    this.programLease = null;
    this.ambientModel?.dispose();
    this.observer?.disconnect();
    this.controls?.dispose();
    for (const m of this.meshes) this.disposeMesh(m);
    for (const g of this.hardwareGeometries.values()) g.dispose();
    for (const g of this.modelGeometries.values()) g.dispose();
    for (const g of this.modelFiles.values()) if (g instanceof BufferGeometry) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    for (const t of this.textures.values()) t.dispose();
    for (const m of this.presentationMaterials.values()) m.dispose();
    for (const m of Object.values(this.xrayLook ?? {})) m.dispose();
    this.xrayLines?.dispose();
    this.floor?.geometry.dispose();
    (this.floor?.material as Material | undefined)?.dispose();
    for (const light of this.studioLights) light.shadow.dispose();
    this.fillLight?.shadow.dispose();
    this.studio?.dispose();
    this.env?.dispose();
    this.renderer?.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer?.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
