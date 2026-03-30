import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0a0c] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full glass-panel p-8 text-center flex flex-col items-center gap-6">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center border border-red-500/50">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold tracking-tight mb-2">Something went wrong</h1>
              <p className="text-sm opacity-60 font-display font-medium uppercase tracking-widest">The application encountered an unexpected error.</p>
            </div>
            
            <div className="w-full p-4 bg-black/40 border border-white/5 rounded-lg text-left overflow-auto max-h-32">
              <code className="text-[10px] font-mono opacity-40 break-all">
                {this.state.error?.toString()}
              </code>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-white text-black font-display font-bold uppercase tracking-[0.2em] hover:bg-gray-200 transition-all active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
