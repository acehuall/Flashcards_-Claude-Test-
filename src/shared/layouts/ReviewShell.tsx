import React from 'react';
import { Link } from 'react-router-dom';
import { ToastContainer } from '../components/Toast';
import clsx from 'clsx';

interface ReviewShellProps {
  children: React.ReactNode;
  exitTo?: string;
  progress?: {
    current: number;
    total: number;
    correct: number;
    incorrect: number;
    flagged: number;
  };
}

export function ReviewShell({ children, exitTo, progress }: ReviewShellProps) {
  const pct = progress && progress.total > 0
    ? Math.round(((progress.correct + progress.incorrect + progress.flagged) / progress.total) * 100)
    : 0;

  return (
    <div className="h-[100dvh] min-h-screen bg-app-bg flex flex-col overflow-hidden">
      {/* Top progress bar + controls */}
      <header className="sticky top-0 z-40 bg-app-bg-alt/85 backdrop-blur-md border-b border-app-border">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-4">
          {/* Exit */}
          {exitTo && (
            <Link
              to={exitTo}
              className="text-app-secondary hover:text-app-primary transition-colors shrink-0"
              aria-label="Exit review"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Link>
          )}

          {/* Progress track */}
          {progress && (
            <div className="flex-1 flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-app-secondary">
                <span>{progress.current} / {progress.total}</span>
                <div className="flex items-center gap-3">
                  <span className="text-app-correct">{progress.correct} ✓</span>
                  <span className="text-app-incorrect">{progress.incorrect} ✗</span>
                  <span className="text-app-flag">{progress.flagged} ⚑</span>
                </div>
              </div>
              <div className="w-full h-1.5 bg-app-border/45 rounded-full overflow-hidden">
                {/* Segmented progress */}
                <div
                  className="h-full bg-app-nav transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Review stage */}
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col max-w-3xl w-full mx-auto px-6 py-8">
        {children}
      </main>

      <ToastContainer />
    </div>
  );
}
