import React from 'react';
import clsx from 'clsx';
import { useToast, type Toast } from '../../context/ToastContext';

const icons = {
  success: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
    </svg>
  ),
};

const typeStyles: Record<Toast['type'], string> = {
  success: 'border-app-correct text-app-correct',
  error:   'border-app-incorrect text-app-incorrect',
  info:    'border-app-nav text-app-nav',
};

function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useToast();
  return (
    <div
      role="alert"
      className={clsx(
        'flex items-start gap-3 px-4 py-3 rounded-card',
        'bg-app-surface border shadow-xl animate-toast-in',
        'min-w-[260px] max-w-sm',
        typeStyles[toast.type],
      )}
    >
      <span className="mt-0.5 shrink-0">{icons[toast.type]}</span>
      <p className="text-sm text-app-primary flex-1 leading-snug">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="text-app-secondary hover:text-app-primary transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useToast();
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
