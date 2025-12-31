/**
 * Error Boundary Component
 * Catches React errors and displays a fallback UI
 */
import { Component } from 'react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            backgroundColor: 'var(--color-background)',
          }}
        >
          <div
            style={{
              textAlign: 'center',
              maxWidth: '600px',
              padding: '3rem',
              backgroundColor: 'white',
              borderRadius: '24px',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <h2 style={{ marginBottom: '1rem', color: 'var(--color-primary)' }}>
              Something went wrong
            </h2>
            <p style={{ marginBottom: '2rem', color: 'var(--color-text-secondary)' }}>
              We're sorry, but something unexpected happened. Please try refreshing the page.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="btn btn-primary"
              style={{
                padding: '1rem 2rem',
                fontSize: '1.125rem',
              }}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

