// The input layer over the canvas (docs/VISUAL_3D.md §2.2): the stock OrbitControls of Three 0.180.0 without the patch
// of r1. r1 added `cancelGesture` inside OrbitControls; here the layer remembers which pointers the controls took and,
// when a gesture is lost (the pointer capture is lost, the pointer is cancelled, the window is left or hidden, the mouse
// moves with no button pressed), sends the controls a synthetic `pointerup` for that pointer only. The stock handler
// then removes the pointer, releases the capture and sends `end`. Pointers the controls do not own get nothing, so the
// stock `splice(indexOf(id) = -1, 1)` never removes another pointer.
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class GestureLayer {
  /** Pointers pressed on the canvas and passed to the controls. */
  owned = new Map<number, string>();
  private readonly listeners: [EventTarget, string, EventListener, AddEventListenerOptions | boolean][] = [];

  constructor(
    readonly element: HTMLElement,
    readonly controls: OrbitControls,
    readonly onCancel: (reason: string, pointerId: number | undefined) => void = () => {},
  ) {
    const on = (target: EventTarget, type: string, fn: EventListener, options: AddEventListenerOptions | boolean = false) => {
      target.addEventListener(type, fn, options);
      this.listeners.push([target, type, fn, options]);
    };
    // Capture phase: the layer sees the pointer before OrbitControls takes it.
    const pointer = (fn: (e: PointerEvent) => void): EventListener => (e) => fn(e as PointerEvent);
    on(element, 'pointerdown', pointer((e) => void this.owned.set(e.pointerId, e.pointerType)), true);
    on(element, 'pointerup', pointer((e) => void this.owned.delete(e.pointerId)));
    on(
      element,
      'pointermove',
      pointer((e) => {
        if (e.pointerType !== 'touch' && e.buttons === 0 && this.owned.has(e.pointerId)) this.cancel('buttons-zero', e.pointerId);
      }),
      true,
    );
    on(element, 'pointercancel', pointer((e) => void this.cancel('pointercancel', e.pointerId)));
    on(element, 'lostpointercapture', pointer((e) => void this.cancel('lostcapture', e.pointerId)));
    on(window, 'blur', () => this.cancel('blur'));
    on(document, 'visibilitychange', () => {
      if (document.hidden) this.cancel('hidden');
    });
  }

  /** Ends the gesture of one pointer (or of all): a synthetic pointerup for each pointer the controls own. */
  cancel(reason: string, pointerId?: number): boolean {
    const ids = pointerId === undefined ? [...this.owned.keys()] : this.owned.has(pointerId) ? [pointerId] : [];
    if (!ids.length) return false;
    for (const id of ids) {
      const pointerType = this.owned.get(id) ?? 'mouse';
      this.owned.delete(id);
      // Only a pointer OrbitControls really holds; the stock handler of an unknown id would remove another one.
      if ((this.controls as unknown as { _pointers: number[] })._pointers.includes(id))
        this.element.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, pointerType, bubbles: true }));
    }
    this.onCancel(reason, pointerId);
    return true;
  }

  dispose() {
    this.cancel('dispose');
    for (const [target, type, fn, options] of this.listeners) target.removeEventListener(type, fn, options);
    this.listeners.length = 0;
  }
}
