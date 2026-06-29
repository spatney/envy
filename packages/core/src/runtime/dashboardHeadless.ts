/**
 * Headless dashboard composition — `renderDashboardToContext`.
 *
 * Lays a dashboard's views out on the same responsive grid as the browser
 * runtime, then paints each view onto one canvas via {@link renderToContext}
 * translated into its cell. No DOM: the whole page rasterizes to a single PNG
 * server-side, and the per-view reports fold into one aggregate {@link RenderReport}.
 */

import type { DashboardSpec, DashboardView } from '../spec/dashboard';
import type { ChartSpec } from '../spec/types';
import type { RenderReport } from './report';
import type { HeadlessTarget } from './headless';
import { resolveTheme } from '../theme';
import {
  resolveDashboardLayout,
  resolveDashboardSections,
  placeViews,
  inheritInto,
  type WiredView,
} from './dashboard';
import { wireViews } from './wire';
import { renderToContext } from './headless';

const HEADER_H = 44;
const SECTION_TITLE_H = 26;

/** Compose a dashboard spec onto a single canvas context. */
export function renderDashboardToContext(target: HeadlessTarget, spec: DashboardSpec): RenderReport {
  const ctx = target.marks;
  const tokens = resolveTheme(spec.theme);
  const layout = resolveDashboardLayout(spec.layout);
  const gap = layout.gap;
  const pad = layout.padding ?? Math.round(gap * 1.4);

  ctx.save();
  ctx.fillStyle = spec.background ?? tokens.color.background;
  ctx.fillRect(0, 0, target.width, target.height);
  ctx.restore();

  const titleText = typeof spec.title === 'string' ? spec.title : spec.title?.text;
  let cursorY = pad;
  if (titleText || spec.subtitle) {
    ctx.save();
    ctx.fillStyle = tokens.color.accent;
    ctx.fillRect(pad, cursorY + 2, 5, 30);
    ctx.fillStyle = tokens.color.text;
    ctx.textBaseline = 'top';
    ctx.font = `${tokens.font.weight.bold} ${tokens.font.size.title}px ${tokens.font.family}`;
    if (titleText) ctx.fillText(titleText, pad + 14, cursorY + 2);
    if (spec.subtitle) {
      ctx.fillStyle = tokens.color.textMuted;
      ctx.font = `${tokens.font.weight.normal} ${tokens.font.size.small}px ${tokens.font.family}`;
      ctx.fillText(spec.subtitle, pad + 14, cursorY + 24);
    }
    ctx.restore();
    cursorY += HEADER_H;
  }

  const wired = wireViews(spec.views as DashboardView[], spec.interactions ?? 'auto') as WiredView[];
  const sections = resolveDashboardSections(wired, layout);

  let markCount = 0;
  let allOk = true;
  let views = 0;

  for (const section of sections) {
    if (section.collapsed) continue;
    if (section.section?.title) {
      ctx.save();
      ctx.fillStyle = tokens.color.text;
      ctx.textBaseline = 'top';
      ctx.font = `${tokens.font.weight.bold} ${tokens.font.size.base}px ${tokens.font.family}`;
      ctx.fillText(section.section.title, pad, cursorY);
      ctx.restore();
      cursorY += SECTION_TITLE_H;
    }
    const cols = Math.max(1, section.cols);
    const innerW = target.width - pad * 2;
    const colW = (innerW - gap * (cols - 1)) / cols;
    const cells = placeViews(section.views, cols, layout.preset);
    // The browser relies on CSS grid auto-flow for `auto`; here we pack cells
    // left-to-right, wrapping at `cols`, so unplaced views don't stack at origin.
    const flow = { x: 1, y: 1, rowH: 0 };
    let maxBottom = cursorY;
    for (const cell of cells) {
      let gx = cell.x;
      let gy = cell.y;
      if (gx == null || gy == null) {
        if (flow.x + cell.w - 1 > cols) {
          flow.x = 1;
          flow.y += Math.max(1, flow.rowH);
          flow.rowH = 0;
        }
        gx = flow.x;
        gy = flow.y;
        flow.x += cell.w;
        flow.rowH = Math.max(flow.rowH, cell.h);
      }
      const cx = pad + (gx - 1) * (colW + gap);
      const cy = cursorY + (gy - 1) * (section.rowHeight + gap);
      const cw = cell.w * colW + (cell.w - 1) * gap;
      const ch = cell.h * section.rowHeight + (cell.h - 1) * gap;
      const viewSpec = inheritInto(cell.view.spec, spec, tokens) as ChartSpec;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.rect(0, 0, cw, ch);
      ctx.clip();
      try {
        const r = renderToContext({ marks: ctx, interaction: target.interaction, width: cw, height: ch }, viewSpec);
        markCount += r.markCount;
        if (!r.ok) allOk = false;
        views++;
      } catch {
        allOk = false;
      }
      ctx.restore();
      maxBottom = Math.max(maxBottom, cy + ch);
    }
    cursorY = maxBottom + gap;
  }

  return {
    type: 'dashboard' as RenderReport['type'],
    size: { width: target.width, height: target.height },
    markCount,
    seriesCount: views,
    colorCount: 1,
    ok: allOk,
    diagnostics: [],
    summary: `Dashboard of ${views} view${views === 1 ? '' : 's'}.`,
  };
}
