import { Component, type ReactNode } from 'react';
import { track } from '@/platform/analytics';

const isStaleBuild = (e: unknown) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk/i.test(
    String((e as Error)?.message ?? e),
  );

/** Catches render errors so one broken page or game never blanks the whole app. */
export default class ErrorBoundary extends Component<{ children: ReactNode; where: string; onExit?: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
    // A new version was deployed while this tab (or its service worker) still had the old one: the old page asks
    // for code files that no longer exist. Reload once to pick up the new version instead of showing an error.
    if (isStaleBuild(error) && !sessionStorage.getItem('utopia.reloadedForUpdate')) {
      try {
        sessionStorage.setItem('utopia.reloadedForUpdate', '1');
      } catch {
        /* ignore */
      }
      void navigator.serviceWorker
        ?.getRegistrations?.()
        .then((rs) => Promise.all(rs.map((r) => r.update().catch(() => {}))))
        .finally(() => location.reload());
      return;
    }
    track({ name: 'client_error', where: this.props.where, message: String(error?.message ?? error).slice(0, 160) });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page error-card" role="alert">
        <h1 className="display">Something went sideways.</h1>
        <p className="muted">This screen hit an error. Your progress is safe.</p>
        <details className="error-details">
          <summary>Details</summary>
          <code>
            {this.props.where}: {String(this.state.error?.message ?? this.state.error).slice(0, 400)}
          </code>
        </details>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              this.setState({ error: null });
              this.props.onExit?.();
            }}
          >
            Back
          </button>
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
