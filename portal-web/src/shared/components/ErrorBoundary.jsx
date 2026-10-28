import React from 'react';
import { AlertTriangle, RefreshCw, LogIn } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/login';
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#EEF6FF] p-6 font-['Plus_Jakarta_Sans',sans-serif]">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg shadow-navy-950/5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 mb-5">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold text-[#102B60]">Something went wrong</h2>
            <p className="mt-2 text-sm text-[#3E5276]">
              A client error occurred while loading this page. Don't worry, your data is safe.
            </p>
            {this.state.error?.message && (
              <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-left text-slate-600 font-mono break-all max-h-28 overflow-y-auto">
                {this.state.error.message}
              </div>
            )}
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#102B60] hover:bg-slate-50 transition shadow-sm"
              >
                <RefreshCw className="h-4 w-4" /> Reload Page
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#102B60] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1877E8] transition shadow-md shadow-navy-900/10"
              >
                <LogIn className="h-4 w-4" /> Go to Login
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
