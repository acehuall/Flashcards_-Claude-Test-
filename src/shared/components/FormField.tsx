import React, { forwardRef } from 'react';
import clsx from 'clsx';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  htmlFor?: string;
}

export function Field({ label, error, hint, required, children, htmlFor }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-app-primary"
      >
        {label}
        {required && <span className="text-app-incorrect ml-1" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-app-secondary">{hint}</p>}
      {error && (
        <p className="text-xs text-app-incorrect" role="alert">{error}</p>
      )}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        'w-full px-3 py-2 rounded-lg text-sm text-app-primary',
        'bg-app-bg-alt border transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-app-nav focus:border-transparent',
        'placeholder:text-app-secondary/50',
        error
          ? 'border-app-incorrect'
          : 'border-app-border hover:border-app-nav/55',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={clsx(
        'w-full px-3 py-2 rounded-lg text-sm text-app-primary',
        'bg-app-bg-alt border transition-colors resize-y min-h-[80px]',
        'focus:outline-none focus:ring-2 focus:ring-app-nav focus:border-transparent',
        'placeholder:text-app-secondary/50',
        error
          ? 'border-app-incorrect'
          : 'border-app-border hover:border-app-nav/55',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  children: React.ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={clsx(
        'w-full px-3 py-2 rounded-lg text-sm text-app-primary',
        'bg-app-bg-alt border transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-app-nav focus:border-transparent',
        error
          ? 'border-app-incorrect'
          : 'border-app-border hover:border-app-nav/55',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
