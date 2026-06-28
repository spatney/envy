import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Isolates a route subtree so one failing page never blanks the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.children !== this.props.children && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-2xl px-6 py-16">
          <div className="gx-card border-err/40 bg-surface p-6">
            <div className="flex items-start gap-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-err/30 bg-err/10 text-err" aria-hidden="true">
                !
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-xl font-semibold text-text">This page hit an error</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{this.state.error.message}</p>
                <button
                  type="button"
                  className="mt-5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-3"
                  onClick={() => window.location.reload()}
                >
                  Reload page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
