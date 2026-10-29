// Technical 3D of one part (task V3): `TechnicalPartView` and the BSP of technical-part.js of r1, unchanged in
// behaviour — the panel with its holes, grooves and notches really cut out, a neutral grey surface and the edges where
// the surface turns. Changed underneath: the cuts come from the operations of the graph (engine.technicalPart), not
// from the wardrobe model of r1, so the same view shows a part of any product.
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { engine } from '@modulero/core';
import { featureEdges, panelGeometry } from './geometry.js';

type TechnicalPart = engine.TechnicalPart;
type TechnicalCut = engine.TechnicalCut;

// ---------------------------------------------------------------- BSP difference of convex polygons (r1), millimetres

const EPS = 1e-5;

class Polygon {
  n: Vector3;
  w: number;
  constructor(public v: Vector3[]) {
    this.n = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize();
    this.w = this.n.dot(v[0]);
  }
  flip() {
    this.v.reverse();
    this.n.negate();
    this.w = -this.w;
  }
}

class BSP {
  polygons: Polygon[] = [];
  n?: Vector3;
  w = 0;
  front?: BSP;
  back?: BSP;
  constructor(polygons: Polygon[] = []) {
    if (polygons.length) this.build(polygons);
  }
  split(p: Polygon, coplanarFront: Polygon[], coplanarBack: Polygon[], front: Polygon[], back: Polygon[]) {
    const n = this.n!,
      types = p.v.map((v): number => {
        const d = n.dot(v) - this.w;
        return d > EPS ? 1 : d < -EPS ? 2 : 0;
      }),
      type = types.reduce((a, b) => a | b, 0);
    if (type === 0) (n.dot(p.n) > 0 ? coplanarFront : coplanarBack).push(p);
    else if (type === 1) front.push(p);
    else if (type === 2) back.push(p);
    else {
      const f: Vector3[] = [],
        b: Vector3[] = [];
      for (let i = 0; i < p.v.length; i++) {
        const j = (i + 1) % p.v.length,
          a = p.v[i],
          c = p.v[j],
          ta = types[i],
          tc = types[j];
        if (ta !== 2) f.push(a.clone());
        if (ta !== 1) b.push(a.clone());
        if ((ta | tc) === 3) {
          const d = c.clone().sub(a),
            v = a.clone().addScaledVector(d, (this.w - n.dot(a)) / n.dot(d));
          f.push(v);
          b.push(v.clone());
        }
      }
      if (f.length >= 3) front.push(new Polygon(f));
      if (b.length >= 3) back.push(new Polygon(b));
    }
  }
  build(ps: Polygon[]) {
    if (!ps.length) return;
    if (!this.n) {
      this.n = ps[0].n.clone();
      this.w = ps[0].w;
    }
    const f: Polygon[] = [],
      b: Polygon[] = [];
    for (const p of ps) this.split(p, this.polygons, this.polygons, f, b);
    if (f.length) (this.front ??= new BSP()).build(f);
    if (b.length) (this.back ??= new BSP()).build(b);
  }
  invert() {
    for (const p of this.polygons) p.flip();
    this.n?.negate();
    this.w = -this.w;
    this.front?.invert();
    this.back?.invert();
    [this.front, this.back] = [this.back, this.front];
  }
  clip(ps: Polygon[]): Polygon[] {
    if (!this.n) return ps.slice();
    let f: Polygon[] = [],
      b: Polygon[] = [];
    for (const p of ps) this.split(p, f, b, f, b);
    if (this.front) f = this.front.clip(f);
    b = this.back ? this.back.clip(b) : [];
    return f.concat(b);
  }
  clipTo(other: BSP) {
    this.polygons = other.clip(this.polygons);
    this.front?.clipTo(other);
    this.back?.clipTo(other);
  }
  all(): Polygon[] {
    return this.polygons.concat(this.front?.all() ?? [], this.back?.all() ?? []);
  }
}

function polygons(geometry: BufferGeometry, scale = 1): Polygon[] {
  const g = geometry.index ? geometry.toNonIndexed() : geometry,
    a = g.attributes.position,
    out: Polygon[] = [];
  for (let i = 0; i < a.count; i += 3) {
    const p = new Polygon([0, 1, 2].map((j) => new Vector3().fromBufferAttribute(a, i + j).multiplyScalar(scale)));
    if (p.n.lengthSq() > 0.5) out.push(p);
  }
  if (g !== geometry) g.dispose();
  return out;
}

function subtract(a: Polygon[], b: Polygon[]): Polygon[] {
  const A = new BSP(a),
    B = new BSP(b);
  A.invert();
  A.clipTo(B);
  B.clipTo(A);
  B.invert();
  B.clipTo(A);
  B.invert();
  A.build(B.all());
  A.invert();
  return A.all();
}

function cutter(op: TechnicalCut): BufferGeometry {
  let g: BufferGeometry;
  if (op.kind === 'bore') {
    g = new CylinderGeometry(op.radius, op.radius, op.depth, 32, 1, false);
    g.applyMatrix4(new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...op.axis!).normalize())));
  } else g = new BoxGeometry(...op.size!);
  g.translate(...op.center);
  return g;
}

/** The part with its cuts: triangles in metres, centred on the envelope, and the feature edges of r1. */
export function technicalPartGeometry(data: TechnicalPart): BufferGeometry {
  const [L, W, T] = data.sizeMm;
  let start = data.contourMm ? panelGeometry({ sizeMm: data.sizeMm, contourMm: data.contourMm, banded: { A: false, B: false, C: false, D: false } }) : new BoxGeometry(L, W, T),
    ps = polygons(start, data.contourMm ? 1000 : 1);
  start.dispose();
  for (const op of data.cuts) {
    start = cutter(op);
    ps = subtract(ps, polygons(start));
    start.dispose();
  }
  const position: number[] = [],
    normal: number[] = [];
  for (const p of ps)
    for (let i = 1; i < p.v.length - 1; i++)
      for (const v of [p.v[0], p.v[i], p.v[i + 1]]) {
        position.push(v.x / 1000, v.y / 1000, v.z / 1000);
        normal.push(p.n.x, p.n.y, p.n.z);
      }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  g.userData.featureEdges = featureEdges(ps);
  return g;
}

// ---------------------------------------------------------------- the view (TechnicalPartView of r1)

export class TechnicalPartView {
  scene = new Scene();
  camera = new PerspectiveCamera(32, 1, 0.0001, 100);
  renderer: WebGLRenderer;
  controls: OrbitControls;
  observer: ResizeObserver;
  mode: 'FIT' | 'MANUAL' = 'FIT';
  data: TechnicalPart | null = null;
  key = '';
  mesh: Mesh | null = null;
  edges: LineSegments | null = null;
  fitDistance = 0;
  buildMs = 0;
  pending = false;

  constructor(public host: HTMLElement) {
    this.scene.background = new Color('#faf9f6');
    this.camera.position.set(0.8, 0.6, 1.5);
    this.renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', 'Техническая 3D модель детали');
    this.renderer.domElement.tabIndex = 0;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener('start', () => (this.mode = 'MANUAL'));
    this.controls.addEventListener('change', () => this.request());
    this.renderer.domElement.addEventListener('wheel', (e) => e.stopPropagation(), { passive: false });
    this.scene.add(new HemisphereLight(0xffffff, 0xb8bac0, 1.7));
    const light = new DirectionalLight(0xffffff, 1.5);
    light.position.set(-2, 4, 6);
    this.scene.add(light);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
  }

  update(data: TechnicalPart) {
    const key = JSON.stringify(data);
    if (key === this.key) return;
    const same = this.data?.id === data.id;
    this.data = data;
    this.key = key;
    const started = performance.now();
    this.clear();
    const g = technicalPartGeometry(data);
    this.mesh = new Mesh(g, new MeshStandardMaterial({ color: 0xe0e2e7, roughness: 0.85, metalness: 0, side: DoubleSide }));
    this.mesh.userData.partId = data.id;
    this.edges = new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(g.userData.featureEdges, 3)), new LineBasicMaterial({ color: 0x636878 }));
    this.scene.add(this.mesh, this.edges);
    this.buildMs = performance.now() - started;
    if (!same || this.mode === 'FIT') this.fit();
    this.resize();
  }

  clear() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as MeshStandardMaterial).dispose();
    }
    if (this.edges) {
      this.scene.remove(this.edges);
      this.edges.geometry.dispose();
      (this.edges.material as LineBasicMaterial).dispose();
    }
    this.mesh = this.edges = null;
  }

  resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.mode === 'FIT') this.fit();
    this.request();
  }

  fit() {
    if (!this.data) return;
    const d = new Vector3(...this.data.sizeMm).length() / 2000,
      half = Math.atan(Math.tan(MathUtils.degToRad(16)) * Math.min(1, this.camera.aspect)),
      direction = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.set(0, 0, 0);
    this.fitDistance = (d / Math.sin(half)) * 1.08;
    this.controls.minDistance = this.fitDistance / 8;
    this.controls.maxDistance = this.fitDistance / 0.25;
    this.camera.position.copy(direction.multiplyScalar(this.fitDistance));
    this.controls.update();
    this.mode = 'FIT';
    this.request();
  }

  zoom(f: number) {
    const current = this.camera.position.distanceTo(this.controls.target);
    if ((f > 1 && current <= this.controls.minDistance + 1e-12) || (f < 1 && current >= this.controls.maxDistance - 1e-12)) return;
    this.camera.position.sub(this.controls.target).multiplyScalar(1 / f).clampLength(this.controls.minDistance, this.controls.maxDistance).add(this.controls.target);
    this.mode = 'MANUAL';
    this.controls.update();
    this.request();
  }

  request() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      if (this.host.clientWidth && this.host.clientHeight) {
        this.renderer.render(this.scene, this.camera);
        this.host.dispatchEvent(new Event('rendercomplete'));
      }
    });
  }

  percent() {
    return this.fitDistance ? (this.fitDistance / this.camera.position.distanceTo(this.controls.target)) * 100 : 100;
  }

  snapshot() {
    return { percent: this.percent(), fitDistance: this.fitDistance, partId: this.data?.id, cuts: this.data?.cuts, triangles: (this.mesh?.geometry.attributes.position.count ?? 0) / 3, buildMs: this.buildMs };
  }

  dispose() {
    this.observer.disconnect();
    this.controls.dispose();
    this.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
