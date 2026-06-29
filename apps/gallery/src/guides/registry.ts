export interface GuideMeta {
  id: string;
  title: string;
  summary: string;
}

/** The deep-dive guides, in reading order. Content lives in pages/guides/. */
export const guides: GuideMeta[] = [
  { id: 'core-concepts', title: 'Core Concepts', summary: 'The spec, data, encoding, and the render → report loop.' },
  { id: 'data-transforms', title: 'Data & Transforms', summary: 'Aggregate, filter, bin, fold, and derive columns in JSON.' },
  { id: 'formatting', title: 'Formatting & Styling', summary: 'Number and date formats, titles, legends, and color.' },
  { id: 'annotations', title: 'Annotations & Insights', summary: 'Reference lines, bands, auto-marked peaks, and trendlines.' },
  { id: 'faceting', title: 'Faceting', summary: 'Small multiples from one field with shared scales.' },
  { id: 'interactivity', title: 'Interactivity', summary: 'Selections as data: slicers, highlights, and cross-filters.' },
  { id: 'dashboards', title: 'Dashboards', summary: 'Grid layout, sections, and auto-wired views in one ChartSpec.' },
  { id: 'agent-loop', title: 'The Agent Loop', summary: 'Validate, repair, render, and read RenderReport diagnostics.' },
  { id: 'themes-sketch', title: 'Themes & Sketch', summary: 'Light/dark tokens and the hand-drawn sketch renderer.' },
  { id: 'performance', title: 'Performance', summary: 'Large datasets, downsampling, virtualization, and headless rendering.' },
  { id: 'accessibility', title: 'Accessibility', summary: 'summarize(), alt text, keyboard access, and contrast diagnostics.' },
];

export const guideById = new Map(guides.map((g) => [g.id, g]));
