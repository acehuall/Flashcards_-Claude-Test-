import React, { useEffect, useRef } from 'react';
import clsx from 'clsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg';
}

const widthMap = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' };

export function Modal({ open, onClose, title, children, maxWidth = 'md' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => { prev?.focus(); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={clsx(
          'relative z-10 w-full bg-app-surface border border-app-border rounded-card',
          'shadow-2xl animate-slide-up focus:outline-none',
          widthMap[maxWidth],
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-app-border">
            <h2 id="modal-title" className="text-lg font-semibold text-app-primary">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="text-app-secondary hover:text-app-primary transition-colors p-1 rounded-md focus-visible:ring-2 focus-visible:ring-app-nav outline-none"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

export function ConfirmModal({
  open,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth="sm">
      <p className="text-app-secondary text-sm mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-app-secondary hover:text-app-primary bg-app-surface border border-app-border rounded-pill transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={clsx(
            'px-4 py-2 text-sm font-medium rounded-pill transition-colors',
            danger
              ? 'bg-app-incorrect text-white hover:opacity-90'
              : 'bg-app-nav text-white hover:bg-app-nav-dark',
          )}
          autoFocus
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
