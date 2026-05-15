import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="text-center space-y-3 max-w-md px-6">
            <p className="text-sm font-medium text-foreground">Something went wrong</p>
            <p className="text-xs text-muted-foreground font-mono break-words">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
