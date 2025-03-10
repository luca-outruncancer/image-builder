// src/components/ErrorBoundary.tsx
'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { systemLogger } from '@/utils/logger';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error boundary component that catches JavaScript errors in its child component tree,
 * logs those errors, and displays a fallback UI instead of crashing the whole app.
 */
class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to our logging system
    const componentName = this.props.componentName || 'UnknownComponent';
    
    systemLogger.error(`Error in ${componentName}: ${error.message}`, {
      component: componentName,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });
    
    this.setState({
      error,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      // Render custom fallback UI if provided, otherwise a default error message
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 mt-4 text-red-900">
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="mb-2">We've logged the error and will look into it.</p>
          <details className="text-sm mt-2 cursor-pointer">
            <summary>Error details</summary>
            <pre className="mt-2 bg-red-100 p-2 rounded overflow-auto text-xs">
              {this.state.error?.toString()}
              {this.state.errorInfo?.componentStack}
            </pre>
          </details>
          <button
            className="mt-4 px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    }

    // If there's no error, render children normally
    return this.props.children;
  }
}

export default ErrorBoundary;