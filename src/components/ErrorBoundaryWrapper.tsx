'use client';

import dynamic from 'next/dynamic';
import React from 'react';

// Dynamic import for ErrorBoundary with proper type handling
const ErrorBoundary = dynamic(
  () => import('./ErrorBoundary').then((mod) => mod.ErrorBoundary),
  { ssr: false }
);

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
