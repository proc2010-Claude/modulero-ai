// The lines of «Рентген» as vectors (owner 2026-10-27, FINDINGS 1995): the edges and holes of the parts, placed in
// millimetres by the core, are only projected through the camera and stroked by the 2D canvas of the browser over the
// picture, as the 2D view and a PDF draw them: an even antialiased stroke of a set width at any zoom and angle.
import { Matrix4, type Camera, type Object3D } from 'three';

export interface XrayLayer {
  color: string;
  /** Stroke width in CSS pixels. */
  width: number;
  objects: Object3D[];
}

function shown(o: Object3D | null): boolean {
  for (let n = o; n; n = n.parent) if (!n.visible) return false;
  return true;
}

export class XrayLines {
  canvas = document.createElement('canvas');
  context: CanvasRenderingContext2D;
  matrix = new Matrix4();
  viewProjection = new Matrix4();
  /** Segments stroked in the last frame. */
  segments = 0;

  constructor(public source: HTMLCanvasElement) {
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.className = 'xray-lines';
    this.canvas.style.position = 'absolute';
    this.canvas.style.pointerEvents = 'none';
    // Over the picture and under whatever the host shows over the canvas.
    source.after(this.canvas);
    this.context = this.canvas.getContext('2d')!;
  }

  /** The overlay on the place of the picture, on whole device pixels (FINDINGS 1991): never stretched by a fraction of a pixel. */
  fit(): [number, number, number] {
    const dpr = devicePixelRatio || 1,
      box = this.source.getBoundingClientRect(),
      w = Math.round(box.width * dpr),
      h = Math.round(box.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.canvas.style.width = `${w / dpr}px`;
      this.canvas.style.height = `${h / dpr}px`;
    }
    this.canvas.style.left = `${this.source.offsetLeft}px`;
    this.canvas.style.top = `${this.source.offsetTop}px`;
    return [w, h, dpr];
  }

  /** Strokes the segments of the layers in their order, each layer over the ones before. */
  draw(camera: Camera, layers: XrayLayer[]) {
    const [w, h, dpr] = this.fit(),
      c = this.context;
    c.clearRect(0, 0, w, h);
    this.segments = 0;
    if (!w || !h) return;
    camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const layer of layers) {
      c.beginPath();
      this.trace(layer.objects, w, h);
      c.strokeStyle = layer.color;
      c.lineWidth = layer.width * dpr;
      c.stroke();
    }
  }

  /** Adds the segments of the shown objects to the path, in device pixels; a segment is cut where it crosses the near plane. */
  trace(objects: Object3D[], w: number, h: number) {
    const c = this.context;
    for (const o of objects) {
      if (!shown(o)) continue;
      const position = (o as Object3D & { geometry?: { attributes?: { position?: { array: ArrayLike<number> } } } }).geometry?.attributes?.position?.array;
      if (!position) continue;
      o.updateWorldMatrix(true, false);
      const e = this.matrix.multiplyMatrices(this.viewProjection, o.matrixWorld).elements,
        clip = (i: number) => {
          const x = position[i], y = position[i + 1], z = position[i + 2];
          return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14], e[3] * x + e[7] * y + e[11] * z + e[15]];
        };
      for (let i = 0; i + 5 < position.length; i += 6) {
        let a = clip(i), b = clip(i + 3);
        // Distance in front of the near plane (z > -w in clip space); behind it on both ends — not seen.
        const da = a[2] + a[3], db = b[2] + b[3];
        if (da < 0 && db < 0) continue;
        if (da < 0 || db < 0) {
          const t = da / (da - db),
            cut = a.map((v, k) => v + (b[k] - v) * t);
          if (da < 0) a = cut;
          else b = cut;
        }
        if (a[3] <= 0 || b[3] <= 0) continue;
        c.moveTo((a[0] / a[3] * 0.5 + 0.5) * w, (0.5 - a[1] / a[3] * 0.5) * h);
        c.lineTo((b[0] / b[3] * 0.5 + 0.5) * w, (0.5 - b[1] / b[3] * 0.5) * h);
        this.segments++;
      }
    }
  }

  dispose() {
    this.canvas.remove();
  }
}
