import { Link, Navigate, useParams } from 'react-router-dom';
import { Page, PageHeader } from '../components/ui/Page';
import { ButtonLink, Callout } from '../components/ui/primitives';
import { guideContent } from '../guides/content';
import { guideById, guides } from '../guides/registry';

export function GuideRoute() {
  const { topic } = useParams();
  const guide = topic ? guideById.get(topic) : undefined;
  if (!guide) return <Navigate to="/guides/core-concepts" replace />;

  const index = guides.findIndex((g) => g.id === guide.id);
  const previous = index > 0 ? guides[index - 1] : undefined;
  const next = index < guides.length - 1 ? guides[index + 1] : undefined;
  const content = guideContent[guide.id];

  return (
    <Page wide>
      <PageHeader kicker="Guide" title={guide.title} blurb={guide.summary} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
        <article className="min-w-0">
          {content ?? (
            <Callout title="Guide unavailable" tone="warn">
              No content is registered for <span className="font-mono">{guide.id}</span>.
            </Callout>
          )}

          <nav className="mt-10 grid gap-3 border-t border-border pt-6 sm:grid-cols-2" aria-label="Guide pagination">
            {previous ? (
              <ButtonLink to={`/guides/${previous.id}`} variant="outline" className="justify-start rounded-2xl py-3">
                <span className="text-left">
                  <span className="block text-xs font-medium uppercase tracking-wide text-faint">Previous</span>
                  <span className="block">{previous.title}</span>
                </span>
              </ButtonLink>
            ) : (
              <div />
            )}
            {next && (
              <ButtonLink to={`/guides/${next.id}`} variant="spectrum" className="justify-end rounded-2xl py-3">
                <span className="text-right">
                  <span className="block text-xs font-medium uppercase tracking-wide opacity-80">Next</span>
                  <span className="block">{next.title}</span>
                </span>
              </ButtonLink>
            )}
          </nav>
        </article>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
            <div className="px-2 pb-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-faint">
              Deep-dive guides
            </div>
            <div className="space-y-1">
              {guides.map((g) => {
                const active = g.id === guide.id;
                return (
                  <Link
                    key={g.id}
                    to={`/guides/${g.id}`}
                    className={`block rounded-xl px-3 py-2 transition ${
                      active
                        ? 'bg-accent-soft text-accent'
                        : 'text-muted hover:bg-surface-2 hover:text-text'
                    }`}
                  >
                    <div className="font-display text-sm font-semibold">{g.title}</div>
                    <p className={`mt-0.5 text-xs leading-snug ${active ? 'text-accent/80' : 'text-faint'}`}>
                      {g.summary}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </Page>
  );
}
