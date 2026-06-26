import { CanvasLayer } from './canvasLayer';
import { createDiv, fillParentStyle, setStyle } from './dom';
import { getDevicePixelRatio } from './env';

/**
 * A rendering Surface mounted inside a user-provided container. It owns a stack
 * of layers:
 *   - `marks`        : static Canvas2D layer for data marks + gridlines
 *   - `interaction`  : Canvas2D layer for hover/crosshair (redrawn cheaply)
 *   - `overlay`      : HTML layer for crisp text (axis labels, legend, tooltip)
 *
 * The Surface creates a single wrapper element it fully owns, so it never
 * clobbers other content in the container.
 */
export class Surface {
  readonly container: HTMLElement;
  readonly root: HTMLDivElement;
  readonly marks: CanvasLayer;
  readonly interaction: CanvasLayer;
  readonly overlay: HTMLDivElement;
  width = 0;
  height = 0;
  dpr = 1;

  constructor(container: HTMLElement) {
    this.container = container;
    this.root = createDiv('envy-root', {
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
    });

    const marksCanvas = document.createElement('canvas');
    marksCanvas.className = 'envy-layer-marks';
    setStyle(marksCanvas, { ...fillParentStyle });

    const interactionCanvas = document.createElement('canvas');
    interactionCanvas.className = 'envy-layer-interaction';
    setStyle(interactionCanvas, { ...fillParentStyle, pointerEvents: 'none' });

    this.overlay = createDiv('envy-layer-overlay', {
      ...fillParentStyle,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    });

    this.root.appendChild(marksCanvas);
    this.root.appendChild(interactionCanvas);
    this.root.appendChild(this.overlay);
    container.appendChild(this.root);

    this.marks = new CanvasLayer(marksCanvas);
    this.interaction = new CanvasLayer(interactionCanvas);
  }

  resize(width: number, height: number, dpr: number = getDevicePixelRatio()): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.marks.resize(width, height, dpr);
    this.interaction.resize(width, height, dpr);
    setStyle(this.overlay, { width: `${width}px`, height: `${height}px` });
  }

  /** Clear both canvas layers and empty the HTML overlay. */
  clear(): void {
    this.marks.clear();
    this.interaction.clear();
    this.overlay.replaceChildren();
  }

  /** Remove all DOM created by this Surface. */
  destroy(): void {
    this.clear();
    this.root.remove();
  }
}
