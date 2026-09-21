import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="recovery-page">
          <h1>Let’s reconnect your workspace.</h1>
          <p>
            The page could not finish loading. Your saved research remains in
            your account.
          </p>
          <button className="button primary" onClick={() => location.reload()}>
            Reload PaperBridge
          </button>
        </main>
      );
    return this.props.children;
  }
}
