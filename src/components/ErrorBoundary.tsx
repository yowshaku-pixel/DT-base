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
        <div className="min-h-screen bg-bg text-text flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-surface border border-border p-8 text-center flex flex-col items-center gap-6 rounded-[2rem] shadow-2xl backdrop-blur-xl">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/30">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-black tracking-tighter italic mb-2">CRITICAL SYSTEM ERROR</h1>
              <p className="text-[10px] text-muted font-display font-bold uppercase tracking-[0.2em]">The application encountered an unexpected state.</p>
            </div>
            
            <div className="w-full p-4 bg-bg border border-border rounded-xl text-left overflow-auto max-h-32">
              <code className="text-[10px] font-mono text-muted break-all">
                {this.state.error?.toString()}
              </code>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-text text-bg font-display font-black uppercase tracking-[0.3em] text-[11px] rounded-xl hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-black/10"
            >
              <RefreshCw className="w-4 h-4" />
              Reload System
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
