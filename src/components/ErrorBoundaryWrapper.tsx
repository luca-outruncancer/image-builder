'use client';

import dynamic from 'next/dynamic';
import React from 'react';

// Dynamic import for ErrorBoundary
const ErrorBoundary = dynamic(() => import('./ErrorBoundary'), { ssr: false });

interface ErrorBoundaryWrapperProps {
  children: React.ReactNode;
  componentName?: string;
}

// Simple client wrapper component
export default function ErrorBoundaryWrapper({ children, componentName }: ErrorBoundaryWrapperProps) {
  return (
    <ErrorBoundary componentName={componentName}>
      {children}
    </ErrorBoundary>
  );
}
