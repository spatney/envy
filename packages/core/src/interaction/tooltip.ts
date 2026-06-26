/**
 * The hover tooltip — a flat, themed HTML card the controller positions next to
 * the cursor. It lives as a direct child of the Surface root (a sibling of the
 * overlay layer) so the per-frame `surface.clear()` never wipes it; the
 * controller owns its full lifecycle.
 */

import type { ThemeTokens } from '../theme';
import { createDiv, setStyle } from '../render/dom';
import type { TooltipContent } from './types';

const OFFSET = 14;
const EDGE_PAD = 8;

export class Tooltip {
  private readonly el: HTMLDivElement;
  private tokens: ThemeTokens;
  private visible = false;

  constructor(
    private readonly root: HTMLElement,
    tokens: ThemeTokens,
  ) {
    this.tokens = tokens;
    this.el = createDiv('envy-tooltip');
    this.applyShell();
    this.root.appendChild(this.el);
  }

  setTokens(tokens: ThemeTokens): void {
    this.tokens = tokens;
    this.applyShell();
  }

  private applyShell(): void {
    const t = this.tokens;
    setStyle(this.el, {
      position: 'absolute',
      top: '0',
      left: '0',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      maxWidth: '280px',
      padding: `${t.spacing.sm}px ${t.spacing.md}px`,
      background: t.color.surface,
      color: t.color.text,
      border: `1px solid ${t.color.border}`,
      borderRadius: `${t.radius.md}px`,
      boxShadow: t.dark
        ? '0 6px 20px rgba(0,0,0,0.45)'
        : '0 6px 18px rgba(15,23,42,0.12)',
      font: `${t.font.size.small}px/1.45 ${t.font.family}`,
      fontWeight: String(t.font.weight.normal),
      opacity: '0',
      transform: 'translate(-9999px, -9999px)',
      transition: 'opacity 90ms ease',
      zIndex: '20',
      whiteSpace: 'nowrap',
    });
  }

  /** Replace the card contents from structured data. */
  setContent(content: TooltipContent): void {
    const t = this.tokens;
    this.el.replaceChildren();

    if (content.title) {
      const head = createDiv('envy-tooltip-title', {
        fontWeight: String(t.font.weight.bold),
        fontSize: `${t.font.size.base}px`,
        color: t.color.text,
        marginBottom: content.rows.length ? `${t.spacing.xs}px` : '0',
      });
      head.textContent = content.title;
      this.el.appendChild(head);
    }

    for (const row of content.rows) {
      const line = createDiv('envy-tooltip-row', {
        display: 'flex',
        alignItems: 'center',
        gap: `${t.spacing.sm}px`,
        padding: '1px 0',
        color: row.muted ? t.color.textMuted : t.color.text,
        fontWeight: String(row.strong ? t.font.weight.bold : t.font.weight.normal),
      });

      if (row.swatch) {
        const chip = createDiv('envy-tooltip-swatch', {
          flex: '0 0 auto',
          width: '9px',
          height: '9px',
          borderRadius: '2px',
          background: row.swatch,
        });
        line.appendChild(chip);
      }

      const label = createDiv('envy-tooltip-label', {
        flex: '1 1 auto',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        paddingRight: `${t.spacing.md}px`,
      });
      label.textContent = row.label;
      line.appendChild(label);

      const value = createDiv('envy-tooltip-value', {
        flex: '0 0 auto',
        marginLeft: 'auto',
        fontVariantNumeric: 'tabular-nums',
        fontWeight: String(row.strong ? t.font.weight.bold : t.font.weight.medium),
      });
      value.textContent = row.value;
      line.appendChild(value);

      this.el.appendChild(line);
    }
  }

  /**
   * Position the card near (anchorX, anchorY) in CSS px, flipping away from the
   * surface edges so it never clips. `surfaceW/H` bound the placement.
   */
  place(anchorX: number, anchorY: number, surfaceW: number, surfaceH: number): void {
    const rect = this.el.getBoundingClientRect();
    const w = rect.width || this.el.offsetWidth;
    const h = rect.height || this.el.offsetHeight;

    let left = anchorX + OFFSET;
    if (left + w > surfaceW - EDGE_PAD) left = anchorX - OFFSET - w;
    left = Math.max(EDGE_PAD, Math.min(left, surfaceW - w - EDGE_PAD));

    let top = anchorY + OFFSET;
    if (top + h > surfaceH - EDGE_PAD) top = anchorY - OFFSET - h;
    top = Math.max(EDGE_PAD, Math.min(top, surfaceH - h - EDGE_PAD));

    setStyle(this.el, { transform: `translate(${Math.round(left)}px, ${Math.round(top)}px)` });
    if (!this.visible) {
      this.visible = true;
      // Force the transform to apply before fading in (avoids a corner slide).
      void this.el.offsetWidth;
      this.el.style.opacity = '1';
    }
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.el.style.opacity = '0';
    this.el.style.transform = 'translate(-9999px, -9999px)';
  }

  destroy(): void {
    this.el.remove();
  }
}
