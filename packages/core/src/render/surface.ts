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
  /** Visually-hidden container for the screen-reader data-table fallback. */
  readonly a11y: HTMLDivElement;
  width = 0;
  height = 0;
  dpr = 1;
  /**
   * When true, overlay text (axis labels, titles, legends, annotation labels) is
   * painted onto the `marks` canvas instead of the HTML overlay. Set by headless
   * renderers (`@graphein/node`) where there is no DOM to host crisp text.
   * Defaults to false (browser).
   */
  headless = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.root = createDiv('graphein-root', {
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
    });

    const marksCanvas = document.createElement('canvas');
    marksCanvas.className = 'graphein-layer-marks';
    setStyle(marksCanvas, { ...fillParentStyle });

    const interactionCanvas = document.createElement('canvas');
    interactionCanvas.className = 'graphein-layer-interaction';
    setStyle(interactionCanvas, { ...fillParentStyle, pointerEvents: 'none' });

    this.overlay = createDiv('graphein-layer-overlay', {
      ...fillParentStyle,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    });

    // Off-screen (visually hidden) host for the screen-reader data-table
    // fallback. Present to assistive tech, invisible on screen.
    this.a11y = createDiv('graphein-a11y', {
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)',
      clipPath: 'inset(50%)',
      whiteSpace: 'nowrap',
      border: '0',
      margin: '-1px',
      padding: '0',
    });

    this.root.appendChild(marksCanvas);
    this.root.appendChild(interactionCanvas);
    this.root.appendChild(this.overlay);
    this.root.appendChild(this.a11y);
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
