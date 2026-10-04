import { Component, type ReactNode } from 'react';
import { track } from '@/platform/analytics';

/** Catches render errors so one broken page or game never blanks the whole app. */
export default class ErrorBoundary extends Component<{ children: ReactNode; where: string; onExit?: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
    track({ name: 'client_error', where: this.props.where, message: String(error?.message ?? error).slice(0, 160) });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page error-card" role="alert">
        <h1 className="display">Something went sideways.</h1>
        <p className="muted">This screen hit an error. Your progress is safe.</p>
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
