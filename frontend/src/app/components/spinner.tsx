import React from 'react';

interface SpinnerProps {
  // Extra classes for spacing at the call site, e.g. "mb-4".
  className?: string;
  label?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ className = '', label = 'Loading' }) => (
  <div
    role="status"
    aria-label={label}
    className={`w-16 h-16 border-t-4 border-navy border-solid rounded-full animate-spin mx-auto ${className}`}
  />
);

// Full-screen loading state, shown while a page waits on auth.
export const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen bg-sand">
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-4">Loading...</h2>
      <Spinner />
    </div>
  </div>
);
