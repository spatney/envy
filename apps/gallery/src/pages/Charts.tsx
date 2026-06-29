import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Page, PageHeader } from '../components/ui/Page';
import { SectionHeader, SpectrumBar } from '../components/ui/primitives';
import { ChartCanvas } from '../components/chart/ChartCanvas';
import { allStories } from '../stories/registry';
import type { Story } from '../stories/types';

interface Intent {
  title: string;
  blurb: string;
  types: string[];
}

const INTENTS: Intent[] = [
  { title: 'Trends over time', blurb: 'Plot a measure across temporal or ordered rows.', types: ['line', 'area', 'combo'] },
  { title: 'Comparison', blurb: 'Compare categories by value, rank, or gap.', types: ['bar', 'dumbbell', 'slope', 'bullet'] },
  { title: 'Distribution', blurb: 'Show spread, bins, quartiles, or x/y relationships.', types: ['histogram', 'box', 'scatter'] },
  { title: 'Part-to-whole', blurb: 'Split a total into slices, rectangles, stages, or deltas.', types: ['pie', 'treemap', 'funnel', 'waterfall'] },
  { title: 'Flow & hierarchy', blurb: 'Trace weighted links between source and target nodes.', types: ['sankey'] },
  { title: 'Density', blurb: 'Encode a measure across two categorical or temporal axes.', types: ['heatmap', 'calendarHeatmap'] },
  { title: 'Geographic', blurb: 'Join metric rows to GeoJSON regions.', types: ['choropleth'] },
  { title: 'KPI & status', blurb: 'Show one value with target, range, or sparkline context.', types: ['kpi', 'gauge'] },
  { title: 'Tabular', blurb: 'Render records, pivots, totals, and conditional formatting.', types: ['table', 'matrix'] },
];

function typeOf(story: Story): string {
  try {
    return story.spec().type;
  } catch {
    return 'other';
  }
}

/** Strip chrome (title, legend, axis titles, fit labels) for a clean grid thumbnail. */
function thumbSpec(input: ReturnType<Story['spec']>): ReturnType<Story['spec']> {
  const s = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
  delete s.title;
  delete s.subtitle;
  s.legend = false;
  delete s.facet;
  if (s.trendline) s.trendline = true;
  if (s.insights) s.insights = false;
  const enc = s.encoding as Record<string, { title?: string }> | undefined;
  if (enc) for (const ch of ['x', 'y']) if (enc[ch]) delete enc[ch].title;
  return s as unknown as ReturnType<Story['spec']>;
}

function ChartCard({ story }: { story: Story }) {
  const spec = useMemo(() => thumbSpec(story.spec()), [story]);
  const title = story.title.replace(/^[^—]+—\s*/, '');
  return (
    <Link
      to={`/charts/${story.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-border-strong"
    >
      <div className="gx-stage h-44 p-3">
        <ChartCanvas spec={spec} />
      </div>
      <div className="border-t border-border p-4">
        <h3 className="font-display text-sm font-semibold text-text group-hover:text-accent">{title}</h3>
        {story.blurb && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{story.blurb}</p>}
      </div>
    </Link>
  );
}

export function Charts() {
  const byIntent = useMemo(() => {
    const used = new Set<string>();
    return INTENTS.map((intent) => {
      const stories = allStories.filter((s) => {
        if (used.has(s.id)) return false;
        if (intent.types.includes(typeOf(s))) {
          used.add(s.id);
          return true;
        }
        return false;
      });
      return { intent, stories };
    }).filter((g) => g.stories.length > 0);
  }, []);

  return (
    <Page wide>
      <PageHeader
        kicker="Catalog"
        title="Chart Catalog by Question"
        blurb="Pick a chart by intent. Each card is a live render; open it for the ChartSpec, React snippet, RenderReport, and controls."
      />
      <div className="space-y-14">
        {byIntent.map(({ intent, stories }) => (
          <section key={intent.title}>
            <SectionHeader eyebrow={`${stories.length} charts`} title={intent.title} lead={intent.blurb} />
            <SpectrumBar className="mt-3 w-16" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {stories.map((s) => (
                <ChartCard key={s.id} story={s} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}
