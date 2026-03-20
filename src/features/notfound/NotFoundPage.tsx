import React from 'react';
import { Link } from 'react-router-dom';
import { StandardShell } from '../../shared/layouts/StandardShell';

export function NotFoundPage() {
  return (
    <StandardShell>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-8 gap-4">
        <span className="text-8xl font-black text-app-border">404</span>
        <h1 className="text-2xl font-bold text-app-primary">Page not found</h1>
        <p className="text-sm text-app-secondary max-w-sm">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="mt-2 px-5 py-2.5 bg-app-nav text-white rounded-pill text-sm font-medium hover:bg-app-nav-dark transition-colors"
        >
          Go home
        </Link>
      </div>
    </StandardShell>
  );
}
