import { all, channelFormatIncludes, flagOn, hasChannel, hasSeries, hasTransform, isType, rule } from './checks';
import type { AnySpec, Chapter, ChapterGroup } from './types';
import { C, Lead, List, P, Snippet } from '../components/learn/prose';

function asRec(spec: AnySpec) {
  return spec as unknown as Record<string, unknown>;
}

const chapters: Chapter[] = [
  // ---------------------------------------------------------------- Basics ---
  {
    id: 'one-rule',
    group: 'Basics',
    title: 'The one rule',
    summary: 'A ChartSpec is one JSON object: type, tidy rows, and encoding.',
    concept: (
      <>
        <Lead>
          Graphein has one rule: describe a chart as a ChartSpec with a <C>type</C>, tidy <C>data</C> rows, and an <C>encoding</C> that maps columns to visual channels. No drawing commands. No plotting calls. The object must validate.
        </Lead>
        <P>
          That object is the contract. Pass it to <C>render()</C> and you get a chart; change one field and the chart changes. Because it is plain JSON, an agent can generate it, <C>validateSpec()</C> can check it, and a reviewer can read it.
        </P>
        <Snippet
          title="minimum ChartSpec shape"
          code={`{
  "type": "line",
  "data": [ { "month": "Jan", "users": 4200 }, … ],
  "encoding": { "x": { "field": "month" }, "y": { "field": "users" } }
}`}
        />
        <P>
          The spec on the right has six monthly sign-up rows. Change only the mark type.
        </P>
      </>
    ),
    goal: (
      <>
        Change <C>type</C> from <C>"bar"</C> to <C>"line"</C> and watch the marks switch from bars to
        a connected trend.
      </>
    ),
    starter: {
      type: 'bar',
      title: 'Monthly active users',
      data: [
        { month: 'Jan', users: 4200 },
        { month: 'Feb', users: 4650 },
        { month: 'Mar', users: 5010 },
        { month: 'Apr', users: 5320 },
        { month: 'May', users: 5610 },
        { month: 'Jun', users: 6010 },
      ],
      encoding: { x: { field: 'month' }, y: { field: 'users' } },
    } as AnySpec,
    solution: {
      type: 'line',
      title: 'Monthly active users',
      data: [
        { month: 'Jan', users: 4200 },
        { month: 'Feb', users: 4650 },
        { month: 'Mar', users: 5010 },
        { month: 'Apr', users: 5320 },
        { month: 'May', users: 5610 },
        { month: 'Jun', users: 6010 },
      ],
      encoding: { x: { field: 'month' }, y: { field: 'users' } },
    } as AnySpec,
    check: isType('line'),
  },

  {
    id: 'tidy-data',
    group: 'Basics',
    title: 'Tidy data & series',
    summary: 'Use tidy rows and split groups with series; do not pre-pivot.',
    concept: (
      <>
        <Lead>
          Graphein expects <strong>tidy rows</strong>: one row per observation, one column per variable. Do not pivot groups into separate columns. Keep one value column and add a category column for the group.
        </Lead>
        <P>
          To draw several lines, keep one ChartSpec and add a <C>series</C> channel pointing at the category column. Graphein splits one series per distinct value and adds the legend.
        </P>
        <Snippet
          title="tidy: one row per (month, region)"
          code={`[
  { "month": "Jan", "region": "North", "sales": 120 },
  { "month": "Jan", "region": "South", "sales": 90 },
  …
]`}
        />
        <P>
          The starter plots this tidy data with no <C>series</C>, so two rows per month render as one zig-zagging line.
        </P>
      </>
    ),
    goal: (
      <>
        Add a <C>series</C> channel mapped to <C>region</C> so the data splits into two clean lines —
        one for North, one for South.
      </>
    ),
    starter: {
      type: 'line',
      title: 'Sales by region',
      data: [
        { month: 'Jan', region: 'North', sales: 120 },
        { month: 'Jan', region: 'South', sales: 90 },
        { month: 'Feb', region: 'North', sales: 150 },
        { month: 'Feb', region: 'South', sales: 110 },
        { month: 'Mar', region: 'North', sales: 170 },
        { month: 'Mar', region: 'South', sales: 140 },
      ],
      encoding: { x: { field: 'month' }, y: { field: 'sales' } },
    } as AnySpec,
    solution: {
      type: 'line',
      title: 'Sales by region',
      data: [
        { month: 'Jan', region: 'North', sales: 120 },
        { month: 'Jan', region: 'South', sales: 90 },
        { month: 'Feb', region: 'North', sales: 150 },
        { month: 'Feb', region: 'South', sales: 110 },
        { month: 'Mar', region: 'North', sales: 170 },
        { month: 'Mar', region: 'South', sales: 140 },
      ],
      encoding: { x: { field: 'month' }, y: { field: 'sales' }, series: { field: 'region' } },
    } as AnySpec,
    check: all(isType('line'), hasSeries('region')),
  },

  {
    id: 'encoding-channels',
    group: 'Basics',
    title: 'Encoding channels',
    summary: 'Map columns to x, y, color, and size to pack more dimensions into one mark.',
    concept: (
      <>
        <Lead>
          An <C>encoding</C> binds data columns to visual <em>channels</em>. Beyond <C>x</C> and{' '}
          <C>y</C>, a scatter can carry <C>color</C> (a category) and <C>size</C> (a measure) — four
          variables in one set of points.
        </Lead>
        <P>
          Each channel takes a <C>FieldDef</C>: at minimum a <C>field</C>, optionally a <C>type</C>{' '}
          (<C>quantitative</C>, <C>nominal</C>, <C>ordinal</C>, <C>temporal</C>) and a <C>format</C>.
        </P>
        <Snippet
          title="four channels, one scatter"
          code={`"encoding": {
  "x": { "field": "experience" },
  "y": { "field": "salary" },
  "color": { "field": "team" },
  "size":  { "field": "headcount" }
}`}
        />
        <P>The starter encodes only x and y. Give the points a color and a size.</P>
      </>
    ),
    goal: (
      <>
        Add a <C>color</C> channel on <C>team</C> and a <C>size</C> channel on <C>headcount</C> so
        each point encodes four variables.
      </>
    ),
    starter: {
      type: 'scatter',
      title: 'Experience vs. salary',
      data: [
        { experience: 1, salary: 82, team: 'Platform', headcount: 4 },
        { experience: 3, salary: 104, team: 'Platform', headcount: 7 },
        { experience: 6, salary: 138, team: 'Growth', headcount: 5 },
        { experience: 2, salary: 91, team: 'Growth', headcount: 3 },
        { experience: 8, salary: 162, team: 'Data', headcount: 9 },
        { experience: 5, salary: 126, team: 'Data', headcount: 6 },
      ],
      encoding: { x: { field: 'experience' }, y: { field: 'salary' } },
    } as AnySpec,
    solution: {
      type: 'scatter',
      title: 'Experience vs. salary',
      data: [
        { experience: 1, salary: 82, team: 'Platform', headcount: 4 },
        { experience: 3, salary: 104, team: 'Platform', headcount: 7 },
        { experience: 6, salary: 138, team: 'Growth', headcount: 5 },
        { experience: 2, salary: 91, team: 'Growth', headcount: 3 },
        { experience: 8, salary: 162, team: 'Data', headcount: 9 },
        { experience: 5, salary: 126, team: 'Data', headcount: 6 },
      ],
      encoding: {
        x: { field: 'experience' },
        y: { field: 'salary' },
        color: { field: 'team' },
        size: { field: 'headcount' },
      },
    } as AnySpec,
    check: all(hasChannel('color', 'team'), hasChannel('size', 'headcount')),
  },

  {
    id: 'choose-a-type',
    group: 'Basics',
    title: 'Choosing a chart type',
    summary: 'Pick the mark that matches the question before choosing a type name.',
    concept: (
      <>
        <Lead>
          The <C>type</C> should answer the question the data asks. A line implies continuity over
          an axis; use it for trends. To compare a measure across discrete categories at one moment,
          a bar encodes the comparison directly.
        </Lead>
        <List
          items={[
            <>
              <strong>Trend over time</strong> → <C>line</C> / <C>area</C>
            </>,
            <>
              <strong>Compare categories</strong> → <C>bar</C>
            </>,
            <>
              <strong>Part-to-whole</strong> → <C>pie</C> / <C>treemap</C> / <C>funnel</C>
            </>,
            <>
              <strong>Correlation</strong> → <C>scatter</C>
            </>,
          ]}
        />
        <P>
          The starter draws market share per vendor as a <C>line</C> — implying a trend across
          vendors that doesn&apos;t exist. These are four independent categories at a single point in
          time.
        </P>
      </>
    ),
    goal: (
      <>
        Switch <C>type</C> to <C>"bar"</C> so each vendor&apos;s share is a separate, comparable
        column.
      </>
    ),
    starter: {
      type: 'line',
      title: 'Market share by vendor',
      data: [
        { vendor: 'Acme', share: 38 },
        { vendor: 'Globex', share: 27 },
        { vendor: 'Initech', share: 19 },
        { vendor: 'Umbrella', share: 16 },
      ],
      encoding: { x: { field: 'vendor' }, y: { field: 'share' } },
    } as AnySpec,
    solution: {
      type: 'bar',
      title: 'Market share by vendor',
      data: [
        { vendor: 'Acme', share: 38 },
        { vendor: 'Globex', share: 27 },
        { vendor: 'Initech', share: 19 },
        { vendor: 'Umbrella', share: 16 },
      ],
      encoding: { x: { field: 'vendor' }, y: { field: 'share' } },
    } as AnySpec,
    check: isType('bar'),
  },

  // ----------------------------------------------------------- Shaping data ---
  {
    id: 'transforms',
    group: 'Shaping data',
    title: 'Reshape with transforms',
    summary: 'Aggregate, filter, and derive columns inside the ChartSpec before render.',
    concept: (
      <>
        <Lead>
          Cartesian charts plot rows <em>as they are</em>. If two rows share an x value, you get two
          marks — not their sum. A <C>transform</C> pipeline reshapes <C>data</C> inside the ChartSpec before render, so row shape stays in validatable JSON instead of app code.
        </Lead>
        <P>
          An <C>aggregate</C> step groups rows and summarizes each group into one output row. Point
          the encoding at the output column it produces.
        </P>
        <Snippet
          title="sum amount per category"
          code={`"transform": [
  { "aggregate": [ { "op": "sum", "field": "amount", "as": "total" } ],
    "groupby": [ "category" ] }
]`}
        />
        <P>
          The starter has two rows per category, so the bars don&apos;t total correctly. Collapse them
          first.
        </P>
      </>
    ),
    goal: (
      <>
        Add a <C>transform</C> with an <C>aggregate</C> step that sums <C>amount</C> grouped by{' '}
        <C>category</C> into <C>total</C>, then point <C>y</C> at <C>total</C>.
      </>
    ),
    starter: {
      type: 'bar',
      title: 'Revenue by category',
      data: [
        { category: 'Hardware', amount: 120 },
        { category: 'Hardware', amount: 80 },
        { category: 'Software', amount: 200 },
        { category: 'Software', amount: 150 },
        { category: 'Services', amount: 90 },
        { category: 'Services', amount: 60 },
      ],
      encoding: { x: { field: 'category' }, y: { field: 'amount' } },
    } as AnySpec,
    solution: {
      type: 'bar',
      title: 'Revenue by category',
      data: [
        { category: 'Hardware', amount: 120 },
        { category: 'Hardware', amount: 80 },
        { category: 'Software', amount: 200 },
        { category: 'Software', amount: 150 },
        { category: 'Services', amount: 90 },
        { category: 'Services', amount: 60 },
      ],
      transform: [{ aggregate: [{ op: 'sum', field: 'amount', as: 'total' }], groupby: ['category'] }],
      encoding: { x: { field: 'category' }, y: { field: 'total' } },
    } as AnySpec,
    check: all(hasTransform('aggregate'), hasChannel('y', 'total')),
  },

  {
    id: 'formatting',
    group: 'Shaping data',
    title: 'Formatting numbers & dates',
    summary: 'Use field formats for currency, percentages, and dates.',
    concept: (
      <>
        <Lead>
          Raw numbers rarely read well on an axis. Each channel takes a <C>format</C> string
          (d3-format for numbers, strftime-style for dates) that controls how its ticks and labels
          render — without touching the data.
        </Lead>
        <List
          items={[
            <>
              <C>&quot;$,.0f&quot;</C> → <C>1280000</C> becomes <C>$1,280,000</C>
            </>,
            <>
              <C>&quot;.0%&quot;</C> → <C>0.42</C> becomes <C>42%</C>
            </>,
            <>
              <C>&quot;%b %Y&quot;</C> → a date becomes <C>Jan 2024</C>
            </>,
          ]}
        />
        <P>
          The starter&apos;s y axis shows revenue as bare integers. Make it currency. Dates on the x
          axis already coerce from ISO strings because the channel is <C>temporal</C>.
        </P>
      </>
    ),
    goal: (
      <>
        Give the <C>y</C> channel a <C>format</C> of <C>"$,.0f"</C> so revenue renders as dollars.
      </>
    ),
    starter: {
      type: 'line',
      title: 'Monthly revenue',
      data: [
        { month: '2024-01', revenue: 1280000 },
        { month: '2024-02', revenue: 1410000 },
        { month: '2024-03', revenue: 1325000 },
        { month: '2024-04', revenue: 1590000 },
        { month: '2024-05', revenue: 1720000 },
      ],
      encoding: { x: { field: 'month', type: 'temporal' }, y: { field: 'revenue' } },
    } as AnySpec,
    solution: {
      type: 'line',
      title: 'Monthly revenue',
      data: [
        { month: '2024-01', revenue: 1280000 },
        { month: '2024-02', revenue: 1410000 },
        { month: '2024-03', revenue: 1325000 },
        { month: '2024-04', revenue: 1590000 },
        { month: '2024-05', revenue: 1720000 },
      ],
      encoding: {
        x: { field: 'month', type: 'temporal' },
        y: { field: 'revenue', format: '$,.0f' },
      },
    } as AnySpec,
    check: channelFormatIncludes('y', '$'),
  },

  // --------------------------------------------------------------- Enrich ---
  {
    id: 'annotations',
    group: 'Enrich',
    title: 'Annotations & reference context',
    summary: 'Add reference lines and bands next to the measured values.',
    concept: (
      <>
        <Lead>
          A measure is easier to interpret next to a threshold. An <C>annotations</C> array draws reference{' '}
          <C>line</C>s, shaded <C>band</C>s, and labeled <C>point</C>s on top of the marks — context
          that lives in the same JSON.
        </Lead>
        <Snippet
          title="a target line at y = 5000"
          code={`"annotations": [
  { "type": "line", "value": 5000, "label": "Target" }
]`}
        />
        <P>
          A <C>line</C> annotation with a <C>value</C> draws across the default y axis. The starter
          plots weekly active users with no reference for the 5,000 goal.
        </P>
      </>
    ),
    goal: (
      <>
        Add an <C>annotations</C> array with one reference line:{' '}
        <C>{'{ "type": "line", "value": 5000, "label": "Target" }'}</C>.
      </>
    ),
    starter: {
      type: 'line',
      title: 'Weekly active users',
      data: [
        { week: 'W1', users: 4200 },
        { week: 'W2', users: 4600 },
        { week: 'W3', users: 4900 },
        { week: 'W4', users: 5200 },
        { week: 'W5', users: 5500 },
      ],
      encoding: { x: { field: 'week' }, y: { field: 'users' } },
    } as AnySpec,
    solution: {
      type: 'line',
      title: 'Weekly active users',
      data: [
        { week: 'W1', users: 4200 },
        { week: 'W2', users: 4600 },
        { week: 'W3', users: 4900 },
        { week: 'W4', users: 5200 },
        { week: 'W5', users: 5500 },
      ],
      encoding: { x: { field: 'week' }, y: { field: 'users' } },
      annotations: [{ type: 'line', value: 5000, label: 'Target' }],
    } as AnySpec,
    check: rule((s) => {
      const a = asRec(s).annotations;
      return Array.isArray(a) && a.some((x) => x && typeof x === 'object' && ((x as Record<string, unknown>).value != null || (x as Record<string, unknown>).type === 'line'));
    }, 'Add an annotations array with a reference line, e.g. { "type": "line", "value": 5000, "label": "Target" }.'),
  },

  {
    id: 'insights-trendlines',
    group: 'Enrich',
    title: 'Insights & trendlines',
    summary: 'Derive max/min labels and linear trendlines from the data.',
    concept: (
      <>
        <Lead>
          Two flags derive annotations from the rows. <C>insights: true</C> marks the max and min as
          labeled points. <C>trendline: true</C> fits a linear line of best fit through the data —
          one per series — so the ChartSpec owns the regression request.
        </Lead>
        <Snippet
          title="derived, not hand-drawn"
          code={`{ "type": "scatter", "trendline": true, "insights": true, … }`}
        />
        <P>
          A trendline needs a continuous or temporal x axis. The starter is a scatter of ad spend
          vs. signups — a valid input for a fit line.
        </P>
      </>
    ),
    goal: (
      <>
        Add <C>"trendline": true</C> to fit a line of best fit through the points.
      </>
    ),
    starter: {
      type: 'scatter',
      title: 'Ad spend vs. signups',
      data: [
        { spend: 10, signups: 22 },
        { spend: 18, signups: 33 },
        { spend: 25, signups: 41 },
        { spend: 32, signups: 60 },
        { spend: 41, signups: 66 },
        { spend: 50, signups: 84 },
      ],
      encoding: { x: { field: 'spend' }, y: { field: 'signups' } },
    } as AnySpec,
    solution: {
      type: 'scatter',
      title: 'Ad spend vs. signups',
      trendline: true,
      data: [
        { spend: 10, signups: 22 },
        { spend: 18, signups: 33 },
        { spend: 25, signups: 41 },
        { spend: 32, signups: 60 },
        { spend: 41, signups: 66 },
        { spend: 50, signups: 84 },
      ],
      encoding: { x: { field: 'spend' }, y: { field: 'signups' } },
    } as AnySpec,
    check: flagOn('trendline'),
  },

  {
    id: 'faceting',
    group: 'Enrich',
    title: 'Faceting (small multiples)',
    summary: 'Split one field into a grid of panels that share identical scales.',
    concept: (
      <>
        <Lead>
          When three series overlap into a tangle, give each its own panel. <C>facet: {'{ field }'}</C>{' '}
          splits a chart into a trellis grid — one panel per value — with one shared y-domain, the
          same x categories, and the same colors, so the panels stay comparable.
        </Lead>
        <Snippet title="one field, many panels" code={`"facet": { "field": "region" }`} />
        <P>
          Don&apos;t pre-split the data or emit one chart per group. The starter overlays three
          regions; facet it instead.
        </P>
      </>
    ),
    goal: (
      <>
        Add <C>{'"facet": { "field": "region" }'}</C> to break the overlapping series into one panel
        per region.
      </>
    ),
    starter: {
      type: 'line',
      title: 'Sessions by region',
      data: [
        { month: 'Jan', region: 'North', sessions: 120 },
        { month: 'Feb', region: 'North', sessions: 150 },
        { month: 'Mar', region: 'North', sessions: 170 },
        { month: 'Jan', region: 'South', sessions: 90 },
        { month: 'Feb', region: 'South', sessions: 110 },
        { month: 'Mar', region: 'South', sessions: 140 },
        { month: 'Jan', region: 'West', sessions: 70 },
        { month: 'Feb', region: 'West', sessions: 95 },
        { month: 'Mar', region: 'West', sessions: 130 },
      ],
      encoding: { x: { field: 'month' }, y: { field: 'sessions' }, series: { field: 'region' } },
    } as AnySpec,
    solution: {
      type: 'line',
      title: 'Sessions by region',
      facet: { field: 'region' },
      data: [
        { month: 'Jan', region: 'North', sessions: 120 },
        { month: 'Feb', region: 'North', sessions: 150 },
        { month: 'Mar', region: 'North', sessions: 170 },
        { month: 'Jan', region: 'South', sessions: 90 },
        { month: 'Feb', region: 'South', sessions: 110 },
        { month: 'Mar', region: 'South', sessions: 140 },
        { month: 'Jan', region: 'West', sessions: 70 },
        { month: 'Feb', region: 'West', sessions: 95 },
        { month: 'Mar', region: 'West', sessions: 130 },
      ],
      encoding: { x: { field: 'month' }, y: { field: 'sessions' }, series: { field: 'region' } },
    } as AnySpec,
    check: rule((s) => {
      const f = asRec(s).facet as Record<string, unknown> | undefined;
      return Boolean(f && typeof f === 'object' && f.field === 'region');
    }, 'Add facet: { field: "region" } to split the chart into panels.'),
  },

  // ------------------------------------------------------------ Agent loop ---
  {
    id: 'validate-repair',
    group: 'The agent loop',
    title: 'Validate & repair',
    summary: 'Run validateSpec before rendering; read the error and fix the spec.',
    concept: (
      <>
        <Lead>
          Always run <C>validateSpec(spec)</C> before rendering. It returns <C>errors</C> and{' '}
          <C>warnings</C> with a <C>path</C> pointing at the problem — and many errors carry a{' '}
          <C>fix</C> or <C>suggestion</C>. <C>repairSpec(spec)</C> applies the safe ones and
          re-validates in one step.
        </Lead>
        <P>
          The starter is a scatter missing its <C>y</C> channel, so it fails validation — the
          preview shows the error instead of a chart. Read it, then add what&apos;s missing.
        </P>
        <Snippet
          title="the loop"
          code={`const { valid, errors } = validateSpec(spec);
if (!valid) spec = repairSpec(spec).spec; // auto-fix the safe ones`}
          lang="ts"
        />
      </>
    ),
    goal: (
      <>
        The scatter needs both axes. Add a <C>y</C> channel mapped to <C>signups</C> so the spec
        validates and renders.
      </>
    ),
    starter: {
      type: 'scatter',
      title: 'Spend vs. signups',
      data: [
        { spend: 10, signups: 22 },
        { spend: 20, signups: 35 },
        { spend: 30, signups: 52 },
        { spend: 40, signups: 61 },
      ],
      encoding: { x: { field: 'spend' } },
    } as unknown as AnySpec,
    solution: {
      type: 'scatter',
      title: 'Spend vs. signups',
      data: [
        { spend: 10, signups: 22 },
        { spend: 20, signups: 35 },
        { spend: 30, signups: 52 },
        { spend: 40, signups: 61 },
      ],
      encoding: { x: { field: 'spend' }, y: { field: 'signups' } },
    } as AnySpec,
    check: all(isType('scatter'), hasChannel('y', 'signups')),
  },

  {
    id: 'report-summarize',
    group: 'The agent loop',
    title: 'Report & summarize',
    summary: 'Read RenderReport diagnostics, then edit the ChartSpec.',
    concept: (
      <>
        <Lead>
          After render, a chart returns diagnostics. <C>chart.report()</C> returns a vision-free{' '}
          <C>RenderReport</C> — mark count, clipped labels, legend overflow, low-contrast colors —
          with an <C>ok</C> flag. <C>summarize(spec)</C> returns a deterministic one-line description
          you can use as alt text.
        </Lead>
        <P>
          The starter crams six products into one line chart. It validates, but the legend is busy
          and the trends are hard to separate. <C>report()</C> surfaces those review items. The fix is to
          focus: keep only the products that matter with a <C>filter</C> transform.
        </P>
        <Snippet
          title="keep two products"
          code={`"transform": [
  { "filter": { "field": "product", "oneOf": [ "Alpha", "Beta" ] } }
]`}
        />
      </>
    ),
    goal: (
      <>
        Cut the clutter: add a <C>filter</C> transform whose <C>oneOf</C> keeps just two or three
        products, so the line chart has fewer series.
      </>
    ),
    starter: {
      type: 'line',
      title: 'Units sold by product',
      data: [
        { month: 'Jan', product: 'Alpha', units: 40 },
        { month: 'Feb', product: 'Alpha', units: 52 },
        { month: 'Mar', product: 'Alpha', units: 61 },
        { month: 'Jan', product: 'Beta', units: 30 },
        { month: 'Feb', product: 'Beta', units: 44 },
        { month: 'Mar', product: 'Beta', units: 50 },
        { month: 'Jan', product: 'Gamma', units: 22 },
        { month: 'Feb', product: 'Gamma', units: 28 },
        { month: 'Mar', product: 'Gamma', units: 33 },
        { month: 'Jan', product: 'Delta', units: 18 },
        { month: 'Feb', product: 'Delta', units: 25 },
        { month: 'Mar', product: 'Delta', units: 29 },
      ],
      encoding: { x: { field: 'month' }, y: { field: 'units' }, series: { field: 'product' } },
    } as AnySpec,
    solution: {
      type: 'line',
      title: 'Units sold by product',
      transform: [{ filter: { field: 'product', oneOf: ['Alpha', 'Beta'] } }],
      data: [
        { month: 'Jan', product: 'Alpha', units: 40 },
        { month: 'Feb', product: 'Alpha', units: 52 },
        { month: 'Mar', product: 'Alpha', units: 61 },
        { month: 'Jan', product: 'Beta', units: 30 },
        { month: 'Feb', product: 'Beta', units: 44 },
        { month: 'Mar', product: 'Beta', units: 50 },
        { month: 'Jan', product: 'Gamma', units: 22 },
        { month: 'Feb', product: 'Gamma', units: 28 },
        { month: 'Mar', product: 'Gamma', units: 33 },
        { month: 'Jan', product: 'Delta', units: 18 },
        { month: 'Feb', product: 'Delta', units: 25 },
        { month: 'Mar', product: 'Delta', units: 29 },
      ],
      encoding: { x: { field: 'month' }, y: { field: 'units' }, series: { field: 'product' } },
    } as AnySpec,
    check: hasTransform('filter'),
  },

  // ------------------------------------------------------------ Interactive ---
  {
    id: 'slicers',
    group: 'Interactive',
    title: 'Slicers & cross-filtering',
    summary: 'Add a slicer view and let it filter every chart that shares its field.',
    concept: (
      <>
        <Lead>
          Selections are data, not callbacks. A <strong>slicer</strong> — <C>dropdown</C>,{' '}
          <C>list</C>, <C>search</C>, <C>range</C>, <C>dateRange</C> — reads one <C>field</C> and
          publishes to a <C>param</C> (defaulting to the field name). Any view filtering on that
          param reacts.
        </Lead>
        <P>
          Inside a <C>dashboard</C> with <C>interactions: "auto"</C>, a slicer automatically filters
          every view whose data carries its field — no wiring required.
        </P>
        <Snippet
          title="a region dropdown"
          code={`{ "id": "region",
  "spec": { "type": "dropdown", "field": "region", "multiple": true } }`}
        />
        <P>The starter dashboard has the bar chart but nothing to filter it. Add the slicer.</P>
      </>
    ),
    goal: (
      <>
        Add a second view whose <C>spec</C> is a <C>dropdown</C> slicer on <C>region</C>. With{' '}
        <C>interactions: "auto"</C>, it will filter the bar chart.
      </>
    ),
    starter: {
      type: 'dashboard',
      title: 'Regional sales',
      data: [
        { region: 'North', quarter: 'Q1', sales: 120 },
        { region: 'North', quarter: 'Q2', sales: 150 },
        { region: 'South', quarter: 'Q1', sales: 90 },
        { region: 'South', quarter: 'Q2', sales: 130 },
        { region: 'West', quarter: 'Q1', sales: 80 },
        { region: 'West', quarter: 'Q2', sales: 110 },
      ],
      views: [
        {
          id: 'sales',
          title: 'Sales by quarter',
          spec: { type: 'bar', encoding: { x: { field: 'quarter' }, y: { field: 'sales' }, series: { field: 'region' } } },
          w: 12,
          h: 3,
        },
      ],
      interactions: 'auto',
    } as AnySpec,
    solution: {
      type: 'dashboard',
      title: 'Regional sales',
      data: [
        { region: 'North', quarter: 'Q1', sales: 120 },
        { region: 'North', quarter: 'Q2', sales: 150 },
        { region: 'South', quarter: 'Q1', sales: 90 },
        { region: 'South', quarter: 'Q2', sales: 130 },
        { region: 'West', quarter: 'Q1', sales: 80 },
        { region: 'West', quarter: 'Q2', sales: 110 },
      ],
      views: [
        {
          id: 'region',
          title: 'Region',
          spec: { type: 'dropdown', field: 'region', multiple: true },
          w: 4,
          h: 2,
        },
        {
          id: 'sales',
          title: 'Sales by quarter',
          spec: { type: 'bar', encoding: { x: { field: 'quarter' }, y: { field: 'sales' }, series: { field: 'region' } } },
          w: 12,
          h: 3,
        },
      ],
      interactions: 'auto',
    } as AnySpec,
    check: all(
      isType('dashboard'),
      rule((s) => {
        const v = asRec(s).views;
        return Array.isArray(v) && v.some((x) => (x as Record<string, unknown>)?.spec && ((x as { spec?: { type?: string } }).spec?.type === 'dropdown'));
      }, 'Add a view whose spec.type is "dropdown" on the region field.'),
    ),
  },

  {
    id: 'dashboards',
    group: 'Interactive',
    title: 'Dashboards',
    summary: 'Compose views on a grid with spans and titled sections.',
    concept: (
      <>
        <Lead>
          A <C>dashboard</C> lays out many views on one grid, sharing a single dataset and selection
          store. Each view takes a <C>w</C>/<C>h</C> span (in grid columns/rows); a <C>layout</C>{' '}
          with <C>sections</C> groups views under titled bands.
        </Lead>
        <Snippet
          title="span + section"
          code={`"views": [ { "id": "total", "spec": { … }, "w": 4, "h": 2 }, … ],
"layout": { "sections": [ { "title": "Overview", "views": ["total","byRegion"] } ] }`}
        />
        <P>
          The starter stacks three views with no spans, so they fill full width. Give them layout.
        </P>
      </>
    ),
    goal: (
      <>
        Lay the three views out: give each a <C>w</C> span (for example 4, 4, and 12) so the KPI and
        bar sit side by side above the full-width trend.
      </>
    ),
    starter: {
      type: 'dashboard',
      title: 'Sales overview',
      data: [
        { region: 'North', quarter: 'Q1', sales: 120 },
        { region: 'North', quarter: 'Q2', sales: 150 },
        { region: 'South', quarter: 'Q1', sales: 90 },
        { region: 'South', quarter: 'Q2', sales: 130 },
        { region: 'West', quarter: 'Q1', sales: 80 },
        { region: 'West', quarter: 'Q2', sales: 110 },
      ],
      views: [
        { id: 'total', title: 'Total sales', spec: { type: 'kpi', value: { field: 'sales', aggregate: 'sum' } } },
        { id: 'byRegion', title: 'By region', spec: { type: 'bar', encoding: { x: { field: 'region' }, y: { field: 'sales' }, series: { field: 'quarter' } } } },
        { id: 'trend', title: 'By quarter', spec: { type: 'line', encoding: { x: { field: 'quarter' }, y: { field: 'sales' }, series: { field: 'region' } } } },
      ],
    } as AnySpec,
    solution: {
      type: 'dashboard',
      title: 'Sales overview',
      data: [
        { region: 'North', quarter: 'Q1', sales: 120 },
        { region: 'North', quarter: 'Q2', sales: 150 },
        { region: 'South', quarter: 'Q1', sales: 90 },
        { region: 'South', quarter: 'Q2', sales: 130 },
        { region: 'West', quarter: 'Q1', sales: 80 },
        { region: 'West', quarter: 'Q2', sales: 110 },
      ],
      views: [
        { id: 'total', title: 'Total sales', spec: { type: 'kpi', value: { field: 'sales', aggregate: 'sum' } }, w: 4, h: 2 },
        { id: 'byRegion', title: 'By region', spec: { type: 'bar', encoding: { x: { field: 'region' }, y: { field: 'sales' }, series: { field: 'quarter' } } }, w: 8, h: 3 },
        { id: 'trend', title: 'By quarter', spec: { type: 'line', encoding: { x: { field: 'quarter' }, y: { field: 'sales' }, series: { field: 'region' } } }, w: 12, h: 3 },
      ],
      layout: { sections: [{ title: 'Overview', views: ['total', 'byRegion'] }, { title: 'Trend', views: ['trend'] }] },
    } as AnySpec,
    check: all(
      isType('dashboard'),
      rule((s) => {
        const v = asRec(s).views;
        const spanned = Array.isArray(v) && v.some((x) => {
          const view = x as Record<string, unknown>;
          return view.w != null || view.h != null;
        });
        const layout = asRec(s).layout as { sections?: unknown[] } | undefined;
        return spanned || Boolean(layout?.sections?.length);
      }, 'Give the views a w/h span, or add a layout.sections array to arrange them.'),
    ),
  },

  // --------------------------------------------------------------- Style ---
  {
    id: 'themes-sketch',
    group: 'Style',
    title: 'Themes & sketch',
    summary: 'Set theme fields or sketch mode inside the ChartSpec.',
    concept: (
      <>
        <Lead>
          Style is part of the ChartSpec. A chart inherits the page <C>theme</C> (light or dark), and one
          field — <C>sketch: true</C> — re-renders every mark in a deterministic hand-drawn style,
          seeded so it looks the same on every render.
        </Lead>
        <Snippet title="hand-drawn in one field" code={`{ "type": "bar", "sketch": true, … }`} />
        <P>
          Try it on the starter bar chart. (The gallery&apos;s sketch toggle does the same thing
          globally — this just bakes it into the spec.)
        </P>
      </>
    ),
    goal: (
      <>
        Add <C>"sketch": true</C> to the ChartSpec so the bars render with deterministic hand-sketched strokes.
      </>
    ),
    starter: {
      type: 'bar',
      title: 'Releases per quarter',
      data: [
        { quarter: 'Q1', releases: 8 },
        { quarter: 'Q2', releases: 12 },
        { quarter: 'Q3', releases: 10 },
        { quarter: 'Q4', releases: 15 },
      ],
      encoding: { x: { field: 'quarter' }, y: { field: 'releases' } },
    } as AnySpec,
    solution: {
      type: 'bar',
      title: 'Releases per quarter',
      sketch: true,
      data: [
        { quarter: 'Q1', releases: 8 },
        { quarter: 'Q2', releases: 12 },
        { quarter: 'Q3', releases: 10 },
        { quarter: 'Q4', releases: 15 },
      ],
      encoding: { x: { field: 'quarter' }, y: { field: 'releases' } },
    } as AnySpec,
    check: flagOn('sketch'),
  },
];

export const learnChapters = chapters;

export const chapterById = new Map(chapters.map((c) => [c.id, c]));

export function chapterIndex(id: string): number {
  return chapters.findIndex((c) => c.id === id);
}

export function chapterGroups(): ChapterGroup[] {
  const order: string[] = [];
  const byGroup = new Map<string, Chapter[]>();
  for (const c of chapters) {
    if (!byGroup.has(c.group)) {
      byGroup.set(c.group, []);
      order.push(c.group);
    }
    byGroup.get(c.group)!.push(c);
  }
  return order.map((title) => ({ title, chapters: byGroup.get(title)! }));
}
