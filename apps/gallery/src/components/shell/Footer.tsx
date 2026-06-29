import { Link } from 'react-router-dom';
import { BrandMark } from './BrandMark';

const REPO_URL = 'https://github.com/spatney/graphein';

const COLS: { title: string; links: { label: string; to: string; external?: boolean }[] }[] = [
  {
    title: 'Start',
    links: [
      { label: 'Overview', to: '/' },
      { label: 'Learn Track', to: '/learn' },
      { label: 'Playground', to: '/playground' },
    ],
  },
  {
    title: 'Build',
    links: [
      { label: 'Chart Catalog', to: '/charts' },
      { label: 'Guides', to: '/guides/core-concepts' },
      { label: 'Spec Reference', to: '/reference' },
    ],
  },
  {
    title: 'Runtimes',
    links: [
      { label: 'Server Rendering', to: '/ssr' },
      { label: 'MCP Console', to: '/mcp' },
      { label: 'Packages', to: '/packages' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-surface-2">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4 sm:px-8">
        <div>
          <Link to="/" className="flex items-center gap-2 text-text" aria-label="Graphein home">
            <span className="text-accent">
              <BrandMark size={24} />
            </span>
            <span className="font-display text-base font-semibold tracking-tight">Graphein</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Agent-first data visualization. One ChartSpec validates, renders, and returns a RenderReport.
          </p>
        </div>
        {COLS.map((col) => (
          <div key={col.title}>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-faint">{col.title}</div>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link to={l.to} className="text-sm text-muted transition hover:text-accent">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-5 text-xs text-faint sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>Built with Graphein. MIT licensed.</span>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="font-medium transition hover:text-accent">
            github.com/spatney/graphein ↗
          </a>
        </div>
      </div>
    </footer>
  );
}
