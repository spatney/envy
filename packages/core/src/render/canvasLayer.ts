import { computeBackingSize } from './sizing';
import { getDevicePixelRatio } from './env';

/**
 * A single hi-DPI Canvas2D layer. Drawing is done in CSS pixels — the context
 * transform is scaled by the device pixel ratio so output stays crisp.
 */
export class CanvasLayer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Logical (CSS px) width. */
  width = 0;
  /** Logical (CSS px) height. */
  height = 0;
  dpr = 1;

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Envy: 2D canvas context is unavailable in this environment.');
    }
    this.ctx = ctx;
  }

  /** Resize the layer to a CSS size; updates the backing store + DPR transform. */
  resize(width: number, height: number, dpr: number = getDevicePixelRatio()): void {
    const b = computeBackingSize(width, height, dpr);
    this.width = b.cssWidth;
    this.height = b.cssHeight;
    this.dpr = b.dpr;
    if (this.canvas.width !== b.pixelWidth) this.canvas.width = b.pixelWidth;
    if (this.canvas.height !== b.pixelHeight) this.canvas.height = b.pixelHeight;
    this.canvas.style.width = `${b.cssWidth}px`;
    this.canvas.style.height = `${b.cssHeight}px`;
    this.ctx.setTransform(b.dpr, 0, 0, b.dpr, 0, 0);
  }

  /** Clear the entire backing store regardless of the current transform. */
  clear(): void {
    const { ctx, canvas } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}
