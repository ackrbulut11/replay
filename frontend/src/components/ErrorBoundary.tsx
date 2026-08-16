import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Sentry } from '../utils/sentry';
import { logError } from '../services/eventLog';

interface Props {
  children?: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in ErrorBoundary:', error, errorInfo);
    Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
    logError('frontend_error', error, { componentStack: errorInfo.componentStack });
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-canvas text-content">
          <div className="max-w-md w-full p-6 bg-surface-raised border border-loss-500/30 rounded-2xl shadow-2xl space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-loss-500/10 border border-loss-500/20 flex items-center justify-center mx-auto text-loss-400">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h2 className="text-base font-medium text-content-strong">
              {this.props.fallbackTitle || 'Bir Hata Oluştu'}
            </h2>
            <p className="text-xs text-loss-400/90 font-mono bg-loss-950/30 p-3 rounded-xl border border-loss-900/40 text-left overflow-x-auto max-h-32">
              {this.state.error?.message || 'Bilinmeyen bir arayüz hatası meydana geldi.'}
            </p>
            <button
              onClick={this.handleReset}
              className="flex items-center justify-center gap-2 px-4 py-2 w-full text-xs font-medium text-ink-950 bg-accent-600 hover:bg-accent-300 rounded-xl transition-all shadow-lg shadow-accent-500/20 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Yeniden Dene
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
